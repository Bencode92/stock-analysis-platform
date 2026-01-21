# portfolio_engine/preset_bond.py
"""
=========================================
Bond ETF Preset Selector v1.0.0
=========================================

Sélection d'ETF obligataires par profil (Stable/Modéré/Agressif).

Architecture 2 couches:
1. Data QC + Hard constraints (duration, crédit, vol)
2. Presets (union simple) → _profile_score

Presets disponibles:
- cash_ultra_short: Parking cash, duration très courte
- defensif_oblig: Obligations IG, duration courte/moyenne
- high_yield: Obligations High Yield (optionnel)

Colonnes attendues (df):
- symbol, name, isin, fund_type, etf_type
- aum_usd, total_expense_ratio, yield_ttm
- bond_avg_duration, bond_avg_maturity
- bond_credit_score, bond_credit_rating
- vol_pct, vol_3y_pct
- perf_1m_pct, perf_3m_pct, ytd_return_pct, one_year_return_pct
- data_quality_score, objective
"""

import logging
from typing import Dict, List, Optional, Any

import numpy as np
import pandas as pd

logger = logging.getLogger("portfolio_engine.preset_bond")

# =============================================================================
# CONFIGURATION
# =============================================================================

# Seuils Data Quality
MIN_DATA_QUALITY_SCORE = 0.6
MIN_AUM_USD = 50_000_000  # 50M minimum (bonds moins liquides)

# Mapping rating → score numérique
RATING_TO_SCORE = {
    "AAA": 95, "AA+": 90, "AA": 85, "AA-": 80,
    "A+": 77, "A": 75, "A-": 72,
    "BBB+": 65, "BBB": 60, "BBB-": 55,
    "BB+": 50, "BB": 45, "BB-": 40,
    "B+": 35, "B": 30, "B-": 25,
    "CCC": 15, "CC": 10, "C": 5, "D": 0,
    "NR": 40, "N/R": 40, "Not Rated": 40,
}

# Presets par profil (union)
PROFILE_PRESETS = {
    "Stable": ["cash_ultra_short", "defensif_oblig"],
    "Modéré": ["defensif_oblig"],
    "Agressif": ["high_yield"],  # Optionnel, peut être vide
}

# Hard constraints par profil
PROFILE_CONSTRAINTS = {
    "Stable": {
        "duration_max": 5.0,           # Duration max 5 ans
        "credit_min": 60,              # BBB minimum (IG)
        "vol_max_quantile": 0.40,      # Vol < Q40
    },
    "Modéré": {
        "duration_max": 10.0,          # Duration max 10 ans
        "credit_min": 50,              # BB+ acceptable
        "vol_max_quantile": 0.70,
    },
    "Agressif": {
        "duration_max": 15.0,          # Duration plus flexible
        "credit_min": 40,              # BB- acceptable (HY)
        "vol_max_quantile": 1.0,
    },
}

# Poids scoring par profil
SCORING_WEIGHTS = {
    "Stable": {
        "credit": 0.30,       # Qualité crédit prioritaire
        "duration": 0.25,     # Duration courte
        "vol": 0.20,          # Vol basse
        "yield": 0.15,        # Rendement secondaire
        "ter": 0.10,          # Coûts
    },
    "Modéré": {
        "yield": 0.30,        # Rendement plus important
        "credit": 0.25,
        "duration": 0.20,
        "vol": 0.15,
        "ter": 0.10,
    },
    "Agressif": {
        "yield": 0.40,        # Rendement prioritaire
        "credit": 0.15,       # Crédit secondaire
        "duration": 0.15,
        "vol": 0.15,
        "ter": 0.15,
    },
}


# =============================================================================
# HELPERS
# =============================================================================

def _to_numeric(series: pd.Series) -> pd.Series:
    """Conversion robuste vers numérique."""
    return pd.to_numeric(series, errors="coerce")


def _get_credit_score(row: pd.Series) -> float:
    """
    Récupère le score crédit (priorité bond_credit_score > rating).
    """
    score = row.get("bond_credit_score")
    if pd.notna(score) and score > 0:
        return float(score)
    
    rating = row.get("bond_credit_rating")
    if pd.notna(rating) and rating:
        rating_clean = str(rating).strip().upper()
        # Essayer mapping direct
        if rating_clean in RATING_TO_SCORE:
            return float(RATING_TO_SCORE[rating_clean])
        # Essayer sans +/-
        for key, val in RATING_TO_SCORE.items():
            if key in rating_clean or rating_clean in key:
                return float(val)
    
    return np.nan


def _get_vol(row: pd.Series) -> float:
    """Récupère la volatilité (priorité vol_3y > vol_pct)."""
    vol_3y = row.get("vol_3y_pct")
    vol = row.get("vol_pct")
    
    if pd.notna(vol_3y) and vol_3y > 0:
        return float(vol_3y)
    if pd.notna(vol) and vol > 0:
        return float(vol)
    return np.nan


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
    - data_quality_score >= seuil
    - AUM minimum
    - TER non nul
    - Doit être un bond (fund_type)
    """
    if df.empty:
        return df
    
    mask = pd.Series(True, index=df.index)
    
    # Data quality score
    if "data_quality_score" in df.columns:
        dqs = _to_numeric(df["data_quality_score"])
        mask &= (dqs >= MIN_DATA_QUALITY_SCORE) | dqs.isna()
    
    # AUM minimum
    if "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        mask &= (aum >= MIN_AUM_USD) | aum.isna()
    
    # TER non nul
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        mask &= (ter > 0) | ter.isna()
    
    # Doit être un bond
    if "fund_type" in df.columns:
        fund_type_lower = df["fund_type"].fillna("").str.lower()
        is_bond = fund_type_lower.str.contains("bond|obligation|fixed income", regex=True)
        mask &= is_bond
    
    filtered = df[mask].copy()
    logger.info(f"[Bond] Data QC: {len(df)} → {len(filtered)} ({len(df) - len(filtered)} exclus)")
    
    return filtered


# =============================================================================
# HARD CONSTRAINTS PAR PROFIL
# =============================================================================

def apply_hard_constraints(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Couche 1: Contraintes hard par profil.
    """
    if df.empty or profile not in PROFILE_CONSTRAINTS:
        return df
    
    constraints = PROFILE_CONSTRAINTS[profile]
    mask = pd.Series(True, index=df.index)
    
    # Duration max
    if "bond_avg_duration" in df.columns:
        duration = _to_numeric(df["bond_avg_duration"])
        mask &= (duration <= constraints["duration_max"]) | duration.isna()
        logger.debug(f"[Bond {profile}] Duration max = {constraints['duration_max']} ans")
    
    # Credit min
    credit_col = df.apply(_get_credit_score, axis=1)
    if credit_col.notna().any():
        mask &= (credit_col >= constraints["credit_min"]) | credit_col.isna()
        logger.debug(f"[Bond {profile}] Credit min = {constraints['credit_min']}")
    
    # Volatilité max (quantile)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any() and constraints["vol_max_quantile"] < 1.0:
        vol_threshold = vol_col.quantile(constraints["vol_max_quantile"])
        mask &= (vol_col <= vol_threshold) | vol_col.isna()
        logger.debug(f"[Bond {profile}] Vol threshold Q{constraints['vol_max_quantile']*100:.0f} = {vol_threshold:.1f}%")
    
    filtered = df[mask].copy()
    logger.info(f"[Bond {profile}] Hard constraints: {len(df)} → {len(filtered)}")
    
    return filtered


# =============================================================================
# PRESET FILTERS
# =============================================================================

def _preset_cash_ultra_short(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Cash / Ultra Short
    Duration très courte (< 2 ans), très faible vol.
    """
    mask = pd.Series(True, index=df.index)
    
    # Duration très courte (< 2 ans)
    if "bond_avg_duration" in df.columns:
        duration = _to_numeric(df["bond_avg_duration"])
        mask &= (duration <= 2.0) | duration.isna()
    
    # Vol très faible (Q30)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any():
        mask &= vol_col <= vol_col.quantile(0.30)
    
    # Credit élevé (IG seulement)
    credit_col = df.apply(_get_credit_score, axis=1)
    if credit_col.notna().any():
        mask &= credit_col >= 55  # BBB- minimum
    
    # Via objective (keywords)
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = ["short", "ultra", "money market", "cash", "floating", "1-3"]
        keyword_mask = pd.Series(False, index=df.index)
        for kw in keywords:
            keyword_mask |= obj_lower.str.contains(kw, regex=False)
        # Boost les keywords mais ne les impose pas
        mask |= keyword_mask
    
    return mask


def _preset_defensif_oblig(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Défensif Obligataire
    Investment Grade, duration courte/moyenne.
    """
    mask = pd.Series(True, index=df.index)
    
    # Duration courte/moyenne (< 7 ans)
    if "bond_avg_duration" in df.columns:
        duration = _to_numeric(df["bond_avg_duration"])
        mask &= (duration <= 7.0) | duration.isna()
    
    # Credit Investment Grade (BBB- minimum)
    credit_col = df.apply(_get_credit_score, axis=1)
    if credit_col.notna().any():
        mask &= credit_col >= 55
    
    # Vol contenue (Q60)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any():
        mask &= vol_col <= vol_col.quantile(0.60)
    
    # Via objective (keywords)
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = ["aggregate", "investment grade", "core", "government", "treasury", "ig", "corporate"]
        keyword_mask = pd.Series(False, index=df.index)
        for kw in keywords:
            keyword_mask |= obj_lower.str.contains(kw, regex=False)
        mask |= keyword_mask
    
    return mask


def _preset_high_yield(df: pd.DataFrame) -> pd.Series:
    """
    Preset: High Yield
    Obligations à haut rendement.
    """
    mask = pd.Series(False, index=df.index)
    
    # Via objective (keywords HY)
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = ["high yield", "high-yield", "junk", "hy", "speculative"]
        for kw in keywords:
            mask |= obj_lower.str.contains(kw, regex=False)
    
    # Via credit score (BB+ ou moins mais > CCC)
    credit_col = df.apply(_get_credit_score, axis=1)
    if credit_col.notna().any():
        hy_credit = (credit_col >= 15) & (credit_col < 55)  # Entre CCC et BB+
        mask |= hy_credit
    
    # Yield élevé (Q75)
    if "yield_ttm" in df.columns:
        yld = _to_numeric(df["yield_ttm"])
        if yld.notna().any():
            high_yield = yld >= yld.quantile(0.75)
            mask |= high_yield
    
    return mask


# Mapping preset name → function
PRESET_FUNCTIONS = {
    "cash_ultra_short": _preset_cash_ultra_short,
    "defensif_oblig": _preset_defensif_oblig,
    "high_yield": _preset_high_yield,
}


def apply_presets_union(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Couche 2: Union des presets pour le profil.
    """
    if df.empty:
        return df
    
    preset_names = PROFILE_PRESETS.get(profile, [])
    if not preset_names:
        logger.warning(f"[Bond] Aucun preset défini pour profil {profile}")
        return df
    
    mask = pd.Series(False, index=df.index)
    
    for preset_name in preset_names:
        if preset_name in PRESET_FUNCTIONS:
            preset_mask = PRESET_FUNCTIONS[preset_name](df)
            count_before = mask.sum()
            mask |= preset_mask
            count_added = mask.sum() - count_before
            logger.debug(f"[Bond {profile}] Preset '{preset_name}': +{count_added} actifs")
    
    filtered = df[mask].copy()
    logger.info(f"[Bond {profile}] Presets union: {len(df)} → {len(filtered)}")
    
    return filtered


# =============================================================================
# SCORING
# =============================================================================

def compute_profile_score(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Calcule le _profile_score pour chaque Bond ETF.
    """
    if df.empty:
        return df
    
    weights = SCORING_WEIGHTS.get(profile, SCORING_WEIGHTS["Modéré"])
    
    # Calcul des composantes
    scores = pd.DataFrame(index=df.index)
    
    # Credit score (higher is better)
    credit_col = df.apply(_get_credit_score, axis=1)
    scores["credit"] = _rank_percentile(credit_col, higher_is_better=True)
    
    # Duration score (lower is better for Stable/Modéré)
    if "bond_avg_duration" in df.columns:
        duration = _to_numeric(df["bond_avg_duration"])
        # Pour Agressif, duration longue peut être OK
        higher_better = (profile == "Agressif")
        scores["duration"] = _rank_percentile(duration, higher_is_better=higher_better)
    else:
        scores["duration"] = 0.5
    
    # Vol score (lower is better)
    vol_col = df.apply(_get_vol, axis=1)
    scores["vol"] = _rank_percentile(vol_col, higher_is_better=False)
    
    # Yield score (higher is better)
    if "yield_ttm" in df.columns:
        yld = _to_numeric(df["yield_ttm"])
        scores["yield"] = _rank_percentile(yld, higher_is_better=True)
    else:
        scores["yield"] = 0.5
    
    # TER score (lower is better)
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        scores["ter"] = _rank_percentile(ter, higher_is_better=False)
    else:
        scores["ter"] = 0.5
    
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
    df["_asset_class"] = "bond"
    
    logger.info(f"[Bond {profile}] Scores: mean={df['_profile_score'].mean():.1f}, "
                f"std={df['_profile_score'].std():.1f}, "
                f"range=[{df['_profile_score'].min():.1f}, {df['_profile_score'].max():.1f}]")
    
    return df


# =============================================================================
# MAIN FUNCTION
# =============================================================================

def select_bonds_for_profile(
    df: pd.DataFrame,
    profile: str,
    top_n: Optional[int] = None
) -> pd.DataFrame:
    """
    Sélectionne les ETF obligataires pour un profil donné.
    
    Args:
        df: DataFrame avec les ETF bonds
        profile: "Stable", "Modéré", ou "Agressif"
        top_n: Nombre max de bonds à retourner (optionnel)
    
    Returns:
        DataFrame filtré avec _profile_score
    """
    if profile not in PROFILE_PRESETS:
        raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_PRESETS.keys())}")
    
    logger.info(f"[Bond] Sélection pour profil {profile} - Univers initial: {len(df)}")
    
    # Couche 0: Data QC
    df_clean = apply_data_qc_filters(df)
    
    # Couche 1: Hard constraints
    df_constrained = apply_hard_constraints(df_clean, profile)
    
    # Couche 2: Presets union
    df_preset = apply_presets_union(df_constrained, profile)
    
    # Fallback si univers vide
    if df_preset.empty and not df_constrained.empty:
        logger.warning(f"[Bond {profile}] Presets vides, fallback sur contraintes hard")
        df_preset = df_constrained
    
    # Scoring
    df_scored = compute_profile_score(df_preset, profile)
    
    # Tri par score
    df_sorted = df_scored.sort_values("_profile_score", ascending=False)
    
    # Top N
    if top_n and len(df_sorted) > top_n:
        df_sorted = df_sorted.head(top_n)
    
    logger.info(f"[Bond {profile}] Sélection finale: {len(df_sorted)} bonds")
    
    return df_sorted


# =============================================================================
# UTILITIES
# =============================================================================

def get_bond_preset_summary() -> Dict[str, Any]:
    """Retourne un résumé des presets Bond."""
    return {
        "presets": list(PRESET_FUNCTIONS.keys()),
        "profiles": {
            profile: {
                "presets": presets,
                "constraints": PROFILE_CONSTRAINTS[profile],
                "weights": SCORING_WEIGHTS[profile],
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
        "symbol": ["AGG", "BND", "LQD", "HYG", "TIP", "SHY", "IEF", "TLT"],
        "name": ["Aggregate Bond", "Total Bond", "Corporate IG", "High Yield", "TIPS", "1-3Y Treasury", "7-10Y Treasury", "20+Y Treasury"],
        "fund_type": ["Bond", "Bond", "Bond", "Bond", "Bond", "Bond", "Bond", "Bond"],
        "aum_usd": [100e9, 90e9, 40e9, 20e9, 30e9, 25e9, 15e9, 20e9],
        "total_expense_ratio": [0.03, 0.03, 0.14, 0.49, 0.19, 0.15, 0.15, 0.15],
        "yield_ttm": [4.2, 4.1, 5.3, 7.8, 4.5, 4.8, 4.3, 4.1],
        "bond_avg_duration": [6.2, 6.5, 8.5, 4.2, 6.8, 1.9, 7.5, 17.2],
        "bond_credit_score": [75, 72, 68, 42, 95, 95, 95, 95],
        "bond_credit_rating": ["A", "A-", "BBB+", "BB", "AAA", "AAA", "AAA", "AAA"],
        "vol_3y_pct": [5.2, 5.4, 8.1, 9.5, 6.2, 2.1, 8.5, 15.2],
        "vol_pct": [4.8, 5.0, 7.5, 8.8, 5.8, 1.9, 7.8, 14.1],
        "data_quality_score": [0.9, 0.9, 0.85, 0.8, 0.85, 0.9, 0.85, 0.85],
        "objective": ["US Aggregate Bond", "Total Bond Market", "Investment Grade Corporate", "High Yield Corporate", "Treasury Inflation Protected", "Short-Term Treasury 1-3Y", "Treasury 7-10Y", "Treasury 20+Y"],
    })
    
    print("\n" + "=" * 60)
    print("TEST PRESET BOND")
    print("=" * 60)
    
    for profile in ["Stable", "Modéré", "Agressif"]:
        print(f"\n--- Profil: {profile} ---")
        result = select_bonds_for_profile(test_data.copy(), profile)
        if not result.empty:
            print(result[["symbol", "name", "bond_avg_duration", "bond_credit_score", "_profile_score"]].to_string(index=False))
        else:
            print("Aucun bond sélectionné")
    
    print("\n✅ Test terminé")
