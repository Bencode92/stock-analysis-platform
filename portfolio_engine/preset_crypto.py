# portfolio_engine/preset_crypto.py
"""
=========================================
Crypto Preset Selector v1.0.0
=========================================

Sélection de cryptomonnaies par profil (Stable/Modéré/Agressif).

Architecture 2 couches:
1. Data QC + Hard constraints (quantiles adaptatifs)
2. Presets (union simple) → _profile_score

Presets disponibles:
- quality_risk: Low vol, low DD, sharpe élevé
- trend3_12m: Tendance moyen/long terme
- swing7_30: Swing trading court terme
- recovery: Contrarian, rebond post-DD
- momentum24h: Momentum très court terme
- highvol_lottery: Haute vol, spéculatif

IMPORTANT:
- Profil Stable → EXCLUSION TOTALE (crypto trop volatile)
- Exclusion automatique des stablecoins

Colonnes attendues (df):
- symbol, currency_base, currency_quote
- ret_1d_pct, ret_7d_pct, ret_30d_pct, ret_90d_pct, ret_6m_pct, ret_1y_pct, ret_ytd_pct
- vol_7d_annual_pct, vol_30d_annual_pct
- sharpe_ratio, var_95_pct, atr14_pct, drawdown_90d_pct
- tier1_listed, stale, data_points, coverage_ratio
- enough_history_90d, enough_history_1y, ret_1y_suspect
"""

import logging
from typing import Dict, List, Optional, Any

import numpy as np
import pandas as pd

logger = logging.getLogger("portfolio_engine.preset_crypto")

# =============================================================================
# CONFIGURATION
# =============================================================================

# Stablecoins à exclure
STABLECOINS = {
    "USDT", "USDC", "DAI", "TUSD", "BUSD", "FDUSD", "PYUSD", 
    "EURT", "EURS", "USDE", "UST", "FRAX", "LUSD", "GUSD",
    "USDP", "SUSD", "MIM", "DOLA", "cUSD", "OUSD", "HUSD"
}

# Seuils Data Quality
MIN_COVERAGE_RATIO = 0.85
MIN_DATA_POINTS = 60  # ~2 mois de données

# Presets par profil (union)
PROFILE_PRESETS = {
    "Stable": [],  # EXCLUSION TOTALE - crypto trop volatile
    "Modéré": ["quality_risk", "trend3_12m", "swing7_30"],
    "Agressif": ["momentum24h", "recovery", "swing7_30", "highvol_lottery"],
}

# Hard constraints par profil (quantiles)
PROFILE_CONSTRAINTS = {
    "Stable": {
        # EXCLUSION - retourne DataFrame vide
        "excluded": True,
    },
    "Modéré": {
        "vol_max_quantile": 0.60,      # Vol < Q60
        "dd_max_quantile": 0.40,       # DD < Q40 (moins sévère = OK)
        "sharpe_min_quantile": 0.30,   # Sharpe > Q30
    },
    "Agressif": {
        "vol_max_quantile": 1.0,       # Pas de contrainte vol
        "dd_max_quantile": 1.0,        # Pas de contrainte DD
        "sharpe_min_quantile": 0.0,    # Pas de contrainte Sharpe
    },
}

# Poids scoring par profil
SCORING_WEIGHTS = {
    "Stable": {},  # N/A - exclusion
    "Modéré": {
        "sharpe": 0.25,        # Qualité risk-adjusted
        "vol": 0.20,           # Vol contenue
        "dd": 0.20,            # DD limité
        "momentum_med": 0.20,  # Momentum moyen terme
        "momentum_fast": 0.15, # Momentum court terme
    },
    "Agressif": {
        "momentum_fast": 0.35, # Momentum prioritaire
        "momentum_med": 0.20,
        "vol": 0.15,           # Vol acceptée (peut être positive)
        "dd": 0.15,            # DD moins pénalisant
        "sharpe": 0.15,
    },
}


# =============================================================================
# HELPERS
# =============================================================================

def _to_numeric(series: pd.Series) -> pd.Series:
    """Conversion robuste vers numérique."""
    return pd.to_numeric(series, errors="coerce")


def _get_vol(row: pd.Series) -> float:
    """Récupère la volatilité (priorité vol_30d > vol_7d)."""
    vol_30d = row.get("vol_30d_annual_pct")
    vol_7d = row.get("vol_7d_annual_pct")
    
    if pd.notna(vol_30d) and vol_30d > 0:
        return float(vol_30d)
    if pd.notna(vol_7d) and vol_7d > 0:
        return float(vol_7d)
    return np.nan


def _get_momentum_fast(row: pd.Series) -> float:
    """Momentum court terme (7d + 1d)."""
    ret_7d = row.get("ret_7d_pct", 0) or 0
    ret_1d = row.get("ret_1d_pct", 0) or 0
    return 0.6 * float(ret_7d) + 0.4 * float(ret_1d)


def _get_momentum_med(row: pd.Series) -> float:
    """Momentum moyen terme (30d + 90d)."""
    ret_30d = row.get("ret_30d_pct", 0) or 0
    ret_90d = row.get("ret_90d_pct", 0) or 0
    return 0.5 * float(ret_30d) + 0.5 * float(ret_90d)


def _rank_percentile(series: pd.Series, higher_is_better: bool = True) -> pd.Series:
    """Calcule le rang percentile [0, 1]."""
    ranked = series.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5)


def _normalize_score(score: pd.Series, min_val: float = 0, max_val: float = 100) -> pd.Series:
    """Normalise les scores vers [min_val, max_val]."""
    score = score.fillna(0)
    s_min, s_max = score.min(), score.max()
    if s_max - s_min < 1e-8:
        return pd.Series(50.0, index=score.index)
    normalized = (score - s_min) / (s_max - s_min)
    return min_val + normalized * (max_val - min_val)


# =============================================================================
# DATA QUALITY FILTERS
# =============================================================================

def apply_data_qc_filters(df: pd.DataFrame) -> pd.DataFrame:
    """
    Couche 0: Filtres qualité données (communs à tous profils).
    
    Filtre:
    - Exclut stablecoins
    - tier1_listed = True
    - stale = False
    - coverage_ratio >= seuil
    - enough_history_90d = True
    - data_points >= seuil
    """
    if df.empty:
        return df
    
    mask = pd.Series(True, index=df.index)
    
    # Exclure stablecoins
    if "symbol" in df.columns:
        symbol_upper = df["symbol"].fillna("").str.upper()
        is_stable = symbol_upper.isin(STABLECOINS)
        mask &= ~is_stable
        excluded_count = is_stable.sum()
        if excluded_count > 0:
            logger.debug(f"[Crypto] Exclusion {excluded_count} stablecoins")
    
    if "currency_base" in df.columns:
        base_upper = df["currency_base"].fillna("").str.upper()
        is_stable = base_upper.isin(STABLECOINS)
        mask &= ~is_stable
    
    # tier1_listed
    if "tier1_listed" in df.columns:
        mask &= df["tier1_listed"] == True
    
    # stale
    if "stale" in df.columns:
        mask &= df["stale"] == False
    
    # coverage_ratio
    if "coverage_ratio" in df.columns:
        coverage = _to_numeric(df["coverage_ratio"])
        mask &= (coverage >= MIN_COVERAGE_RATIO) | coverage.isna()
    
    # enough_history_90d
    if "enough_history_90d" in df.columns:
        mask &= df["enough_history_90d"] == True
    
    # data_points
    if "data_points" in df.columns:
        dp = _to_numeric(df["data_points"])
        mask &= (dp >= MIN_DATA_POINTS) | dp.isna()
    
    filtered = df[mask].copy()
    logger.info(f"[Crypto] Data QC: {len(df)} → {len(filtered)} ({len(df) - len(filtered)} exclus)")
    
    return filtered


# =============================================================================
# HARD CONSTRAINTS PAR PROFIL
# =============================================================================

def apply_hard_constraints(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Couche 1: Contraintes hard par profil (quantiles adaptatifs).
    """
    if df.empty:
        return df
    
    if profile not in PROFILE_CONSTRAINTS:
        return df
    
    constraints = PROFILE_CONSTRAINTS[profile]
    
    # Profil Stable → EXCLUSION TOTALE
    if constraints.get("excluded", False):
        logger.info(f"[Crypto {profile}] EXCLUSION TOTALE - crypto non compatible avec profil Stable")
        return pd.DataFrame(columns=df.columns)
    
    mask = pd.Series(True, index=df.index)
    
    # Volatilité max (quantile)
    if constraints.get("vol_max_quantile", 1.0) < 1.0:
        vol_col = df.apply(_get_vol, axis=1)
        if vol_col.notna().any():
            vol_threshold = vol_col.quantile(constraints["vol_max_quantile"])
            mask &= (vol_col <= vol_threshold) | vol_col.isna()
            logger.debug(f"[Crypto {profile}] Vol threshold Q{constraints['vol_max_quantile']*100:.0f} = {vol_threshold:.1f}%")
    
    # Drawdown max (quantile) - DD est négatif, donc on filtre ceux > threshold
    if constraints.get("dd_max_quantile", 1.0) < 1.0:
        if "drawdown_90d_pct" in df.columns:
            dd = _to_numeric(df["drawdown_90d_pct"]).abs()  # Valeur absolue
            if dd.notna().any():
                dd_threshold = dd.quantile(constraints["dd_max_quantile"])
                mask &= (dd <= dd_threshold) | dd.isna()
                logger.debug(f"[Crypto {profile}] DD threshold Q{constraints['dd_max_quantile']*100:.0f} = {dd_threshold:.1f}%")
    
    # Sharpe min (quantile)
    if constraints.get("sharpe_min_quantile", 0.0) > 0.0:
        if "sharpe_ratio" in df.columns:
            sharpe = _to_numeric(df["sharpe_ratio"])
            if sharpe.notna().any():
                sharpe_threshold = sharpe.quantile(constraints["sharpe_min_quantile"])
                mask &= (sharpe >= sharpe_threshold) | sharpe.isna()
                logger.debug(f"[Crypto {profile}] Sharpe threshold Q{constraints['sharpe_min_quantile']*100:.0f} = {sharpe_threshold:.2f}")
    
    filtered = df[mask].copy()
    logger.info(f"[Crypto {profile}] Hard constraints: {len(df)} → {len(filtered)}")
    
    return filtered


# =============================================================================
# PRESET FILTERS
# =============================================================================

def _preset_quality_risk(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Quality Risk
    Low vol, low DD, sharpe élevé.
    """
    mask = pd.Series(True, index=df.index)
    
    # Sharpe élevé (Q60)
    if "sharpe_ratio" in df.columns:
        sharpe = _to_numeric(df["sharpe_ratio"])
        if sharpe.notna().any():
            mask &= sharpe >= sharpe.quantile(0.60)
    
    # Vol basse (Q40)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any():
        mask &= vol_col <= vol_col.quantile(0.40)
    
    # DD bas (Q30 en valeur absolue)
    if "drawdown_90d_pct" in df.columns:
        dd = _to_numeric(df["drawdown_90d_pct"]).abs()
        if dd.notna().any():
            mask &= dd <= dd.quantile(0.30)
    
    return mask


def _preset_trend3_12m(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Trend 3-12 mois
    Tendance moyen/long terme positive, vol raisonnable.
    """
    mask = pd.Series(True, index=df.index)
    
    # ret_90d positif (Q60)
    if "ret_90d_pct" in df.columns:
        ret_90d = _to_numeric(df["ret_90d_pct"])
        if ret_90d.notna().any():
            mask &= ret_90d >= ret_90d.quantile(0.60)
    
    # ret_6m ou ret_1y positif si dispo
    if "ret_6m_pct" in df.columns:
        ret_6m = _to_numeric(df["ret_6m_pct"])
        if ret_6m.notna().any():
            mask &= (ret_6m >= ret_6m.quantile(0.50)) | ret_6m.isna()
    
    # Vol raisonnable (Q70)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any():
        mask &= vol_col <= vol_col.quantile(0.70)
    
    # DD pas catastrophique (Q50)
    if "drawdown_90d_pct" in df.columns:
        dd = _to_numeric(df["drawdown_90d_pct"]).abs()
        if dd.notna().any():
            mask &= dd <= dd.quantile(0.50)
    
    return mask


def _preset_swing7_30(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Swing 7-30 jours
    Momentum court terme, DD contrôlé.
    """
    mask = pd.Series(True, index=df.index)
    
    # ret_7d positif (Q50)
    if "ret_7d_pct" in df.columns:
        ret_7d = _to_numeric(df["ret_7d_pct"])
        if ret_7d.notna().any():
            mask &= ret_7d >= ret_7d.quantile(0.50)
    
    # ret_30d positif ou pas trop négatif
    if "ret_30d_pct" in df.columns:
        ret_30d = _to_numeric(df["ret_30d_pct"])
        if ret_30d.notna().any():
            mask &= ret_30d >= ret_30d.quantile(0.40)
    
    # DD pas trop sévère (Q40)
    if "drawdown_90d_pct" in df.columns:
        dd = _to_numeric(df["drawdown_90d_pct"]).abs()
        if dd.notna().any():
            mask &= dd <= dd.quantile(0.40)
    
    return mask


def _preset_recovery(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Recovery / Contrarian
    Rebond après gros DD, momentum récent positif.
    """
    mask = pd.Series(True, index=df.index)
    
    # DD significatif (Q60+ en valeur absolue = gros DD)
    if "drawdown_90d_pct" in df.columns:
        dd = _to_numeric(df["drawdown_90d_pct"]).abs()
        if dd.notna().any():
            mask &= dd >= dd.quantile(0.60)
    
    # Rebond récent: ret_7d positif
    if "ret_7d_pct" in df.columns:
        ret_7d = _to_numeric(df["ret_7d_pct"])
        if ret_7d.notna().any():
            mask &= ret_7d > 0
    
    # Rebond récent: ret_30d pas trop négatif
    if "ret_30d_pct" in df.columns:
        ret_30d = _to_numeric(df["ret_30d_pct"])
        if ret_30d.notna().any():
            mask &= ret_30d >= ret_30d.quantile(0.30)
    
    return mask


def _preset_momentum24h(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Momentum 24h
    Momentum très court terme, haute conviction.
    """
    mask = pd.Series(True, index=df.index)
    
    # ret_1d très positif (Q75)
    if "ret_1d_pct" in df.columns:
        ret_1d = _to_numeric(df["ret_1d_pct"])
        if ret_1d.notna().any():
            mask &= ret_1d >= ret_1d.quantile(0.75)
    
    # ret_7d aussi positif (Q60)
    if "ret_7d_pct" in df.columns:
        ret_7d = _to_numeric(df["ret_7d_pct"])
        if ret_7d.notna().any():
            mask &= ret_7d >= ret_7d.quantile(0.60)
    
    return mask


def _preset_highvol_lottery(df: pd.DataFrame) -> pd.Series:
    """
    Preset: High Vol Lottery
    Très haute volatilité, spéculatif.
    """
    mask = pd.Series(True, index=df.index)
    
    # Vol très haute (Q80+)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any():
        mask &= vol_col >= vol_col.quantile(0.80)
    
    # ATR élevé si dispo (Q75+)
    if "atr14_pct" in df.columns:
        atr = _to_numeric(df["atr14_pct"])
        if atr.notna().any():
            mask &= atr >= atr.quantile(0.75)
    
    return mask


# Mapping preset name → function
PRESET_FUNCTIONS = {
    "quality_risk": _preset_quality_risk,
    "trend3_12m": _preset_trend3_12m,
    "swing7_30": _preset_swing7_30,
    "recovery": _preset_recovery,
    "momentum24h": _preset_momentum24h,
    "highvol_lottery": _preset_highvol_lottery,
}


def apply_presets_union(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Couche 2: Union des presets pour le profil.
    """
    if df.empty:
        return df
    
    preset_names = PROFILE_PRESETS.get(profile, [])
    if not preset_names:
        logger.warning(f"[Crypto] Aucun preset défini pour profil {profile}")
        return df
    
    mask = pd.Series(False, index=df.index)
    
    for preset_name in preset_names:
        if preset_name in PRESET_FUNCTIONS:
            preset_mask = PRESET_FUNCTIONS[preset_name](df)
            count_before = mask.sum()
            mask |= preset_mask
            count_added = mask.sum() - count_before
            logger.debug(f"[Crypto {profile}] Preset '{preset_name}': +{count_added} actifs")
    
    filtered = df[mask].copy()
    logger.info(f"[Crypto {profile}] Presets union: {len(df)} → {len(filtered)}")
    
    return filtered


# =============================================================================
# SCORING
# =============================================================================

def compute_profile_score(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Calcule le _profile_score pour chaque Crypto.
    """
    if df.empty:
        return df
    
    weights = SCORING_WEIGHTS.get(profile, SCORING_WEIGHTS["Modéré"])
    if not weights:
        return df
    
    # Calcul des composantes
    scores = pd.DataFrame(index=df.index)
    
    # Sharpe score (higher is better)
    if "sharpe_ratio" in df.columns:
        sharpe = _to_numeric(df["sharpe_ratio"])
        scores["sharpe"] = _rank_percentile(sharpe, higher_is_better=True)
    else:
        scores["sharpe"] = 0.5
    
    # Vol score (lower is better for Modéré, peut être higher pour Agressif)
    vol_col = df.apply(_get_vol, axis=1)
    higher_vol_better = (profile == "Agressif")  # En Agressif, high vol peut être positif
    scores["vol"] = _rank_percentile(vol_col, higher_is_better=higher_vol_better)
    
    # DD score (lower is better - abs value)
    if "drawdown_90d_pct" in df.columns:
        dd = _to_numeric(df["drawdown_90d_pct"]).abs()
        scores["dd"] = _rank_percentile(dd, higher_is_better=False)
    else:
        scores["dd"] = 0.5
    
    # Momentum fast (7d + 1d) - higher is better
    momentum_fast = df.apply(_get_momentum_fast, axis=1)
    scores["momentum_fast"] = _rank_percentile(momentum_fast, higher_is_better=True)
    
    # Momentum med (30d + 90d) - higher is better
    momentum_med = df.apply(_get_momentum_med, axis=1)
    scores["momentum_med"] = _rank_percentile(momentum_med, higher_is_better=True)
    
    # Score pondéré
    total_score = pd.Series(0.0, index=df.index)
    total_weight = 0.0
    
    for component, weight in weights.items():
        if component in scores.columns:
            total_score += scores[component] * weight
            total_weight += weight
    
    if total_weight > 0:
        total_score /= total_weight
    
    # Normalisation 0-100
    df["_profile_score"] = _normalize_score(total_score, 0, 100).round(2)
    df["_preset_profile"] = profile
    df["_asset_class"] = "crypto"
    
    logger.info(f"[Crypto {profile}] Scores: mean={df['_profile_score'].mean():.1f}, "
                f"std={df['_profile_score'].std():.1f}, "
                f"range=[{df['_profile_score'].min():.1f}, {df['_profile_score'].max():.1f}]")
    
    return df


# =============================================================================
# MAIN FUNCTION
# =============================================================================

def select_crypto_for_profile(
    df: pd.DataFrame,
    profile: str,
    top_n: Optional[int] = None
) -> pd.DataFrame:
    """
    Sélectionne les cryptomonnaies pour un profil donné.
    
    Args:
        df: DataFrame avec les cryptos
        profile: "Stable", "Modéré", ou "Agressif"
        top_n: Nombre max de cryptos à retourner (optionnel)
    
    Returns:
        DataFrame filtré avec _profile_score
        ATTENTION: Retourne vide pour profil "Stable" (exclusion)
    """
    if profile not in PROFILE_PRESETS:
        raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_PRESETS.keys())}")
    
    logger.info(f"[Crypto] Sélection pour profil {profile} - Univers initial: {len(df)}")
    
    # Couche 0: Data QC
    df_clean = apply_data_qc_filters(df)
    
    # Couche 1: Hard constraints (inclut exclusion Stable)
    df_constrained = apply_hard_constraints(df_clean, profile)
    
    # Si vide après contraintes (ex: Stable), retourner vide
    if df_constrained.empty:
        logger.info(f"[Crypto {profile}] Sélection finale: 0 cryptos (exclusion ou filtres stricts)")
        return df_constrained
    
    # Couche 2: Presets union
    df_preset = apply_presets_union(df_constrained, profile)
    
    # Fallback si univers vide
    if df_preset.empty and not df_constrained.empty:
        logger.warning(f"[Crypto {profile}] Presets vides, fallback sur contraintes hard")
        df_preset = df_constrained
    
    # Scoring
    df_scored = compute_profile_score(df_preset, profile)
    
    # Tri par score
    df_sorted = df_scored.sort_values("_profile_score", ascending=False)
    
    # Top N
    if top_n and len(df_sorted) > top_n:
        df_sorted = df_sorted.head(top_n)
    
    logger.info(f"[Crypto {profile}] Sélection finale: {len(df_sorted)} cryptos")
    
    return df_sorted


# =============================================================================
# UTILITIES
# =============================================================================

def get_crypto_preset_summary() -> Dict[str, Any]:
    """Retourne un résumé des presets Crypto."""
    return {
        "presets": list(PRESET_FUNCTIONS.keys()),
        "stablecoins_excluded": list(STABLECOINS),
        "profiles": {
            profile: {
                "presets": presets,
                "constraints": PROFILE_CONSTRAINTS[profile],
                "weights": SCORING_WEIGHTS.get(profile, {}),
            }
            for profile, presets in PROFILE_PRESETS.items()
        },
        "version": "1.0.0",
    }


# =============================================================================
# TEST
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    
    # Test avec données fictives
    test_data = pd.DataFrame({
        "symbol": ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "AVAX", "LINK", "USDT", "USDC"],
        "currency_base": ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "AVAX", "LINK", "USDT", "USDC"],
        "ret_1d_pct": [2.5, 3.2, 5.1, 8.2, 1.2, 2.1, 4.5, 3.8, 0.01, 0.0],
        "ret_7d_pct": [5.2, 7.1, 12.5, 15.2, 3.2, 4.5, 9.8, 8.2, 0.02, 0.0],
        "ret_30d_pct": [12.5, 18.2, 25.1, -5.2, 8.1, 10.2, 22.5, 15.2, 0.01, 0.0],
        "ret_90d_pct": [35.2, 45.1, 65.2, -15.2, 22.1, 28.5, 55.2, 42.1, 0.0, 0.0],
        "ret_6m_pct": [52.1, 68.2, 120.5, -8.5, 35.2, 42.1, 95.2, 62.1, 0.0, 0.0],
        "vol_30d_annual_pct": [45, 55, 85, 120, 65, 75, 95, 70, 2, 1],
        "vol_7d_annual_pct": [42, 52, 80, 115, 62, 72, 90, 68, 1.5, 0.8],
        "sharpe_ratio": [1.2, 1.5, 1.8, 0.3, 0.8, 0.9, 1.4, 1.1, 0.1, 0.05],
        "drawdown_90d_pct": [-15, -18, -25, -45, -20, -22, -28, -19, -0.5, -0.2],
        "atr14_pct": [4.2, 5.1, 8.5, 12.2, 6.1, 7.2, 9.5, 6.8, 0.1, 0.05],
        "tier1_listed": [True, True, True, True, True, True, True, True, True, True],
        "stale": [False, False, False, False, False, False, False, False, False, False],
        "coverage_ratio": [0.98, 0.98, 0.95, 0.92, 0.95, 0.94, 0.93, 0.96, 0.99, 0.99],
        "data_points": [365, 365, 300, 250, 365, 365, 280, 320, 365, 365],
        "enough_history_90d": [True, True, True, True, True, True, True, True, True, True],
    })
    
    print("\n" + "=" * 60)
    print("TEST PRESET CRYPTO")
    print("=" * 60)
    
    for profile in ["Stable", "Modéré", "Agressif"]:
        print(f"\n--- Profil: {profile} ---")
        result = select_crypto_for_profile(test_data.copy(), profile)
        if not result.empty:
            cols = ["symbol", "sharpe_ratio", "vol_30d_annual_pct", "ret_90d_pct", "_profile_score"]
            cols = [c for c in cols if c in result.columns]
            print(result[cols].to_string(index=False))
        else:
            print("Aucune crypto sélectionnée (exclusion ou filtres stricts)")
    
    print("\n✅ Test terminé")
