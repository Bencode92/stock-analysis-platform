# portfolio_engine/preset_etf.py
"""
=========================================
ETF Preset Selector v1.1.0
=========================================

Sélection d'ETF actions par profil (Stable/Modéré/Agressif).

v1.1.0: Alignement noms presets avec preset_meta.py
- rendement → rendement_etf
- NEW: inflation_shield (TIPS, commodities, real assets)
- NEW: or_physique (Gold physical ETF)

Architecture 2 couches:
1. Data QC + Hard constraints (quantiles adaptatifs)
2. Presets (union simple) → _profile_score

Presets disponibles:
- coeur_global: World core, TER bas, AUM élevé
- min_vol_global: Low volatility blend
- rendement_etf: Dividendes élevés
- qualite_value: Value/Quality proxy (via objective)
- croissance_tech: Tech growth momentum
- smid_quality: Small/Mid caps
- emergents: Marchés émergents
- inflation_shield: TIPS, commodities, real assets
- or_physique: Gold physical ETF

Colonnes attendues (df):
- etfsymbol, name, isin, fund_type, etf_type
- aum_usd, total_expense_ratio, yield_ttm
- vol_pct, vol_3y_pct, vol_window
- perf_1m_pct, perf_3m_pct, ytd_return_pct, one_year_return_pct
- sector_top, sector_top_weight, country_top, country_top_weight
- data_quality_score, leverage, objective
"""

import logging
from typing import Dict, List, Optional, Any

import numpy as np
import pandas as pd

logger = logging.getLogger("portfolio_engine.preset_etf")

# =============================================================================
# CONFIGURATION
# =============================================================================

# Seuils Data Quality
MIN_DATA_QUALITY_SCORE = 0.6
MIN_AUM_USD = 100_000_000  # 100M minimum

# Presets par profil (union) - v1.1.0: aligné avec preset_meta.py
PROFILE_PRESETS = {
    "Stable": ["min_vol_global", "coeur_global", "or_physique"],
    "Modéré": ["coeur_global", "rendement_etf", "qualite_value", "emergents", "inflation_shield"],
    "Agressif": ["croissance_tech", "smid_quality", "emergents", "rendement_etf"],
}

# Hard constraints par profil (quantiles)
PROFILE_CONSTRAINTS = {
    "Stable": {
        "vol_max_quantile": 0.35,      # Vol < Q35
        "ter_max_quantile": 0.60,      # TER < Q60
        "concentration_max": 0.50,     # Sector/Country weight max
    },
    "Modéré": {
        "vol_max_quantile": 0.70,      # Vol < Q70
        "ter_max_quantile": 0.80,      # TER < Q80
        "concentration_max": 0.70,
    },
    "Agressif": {
        "vol_max_quantile": 1.0,       # Pas de contrainte vol
        "ter_max_quantile": 0.90,
        "concentration_max": 1.0,
    },
}

# Poids scoring par profil
SCORING_WEIGHTS = {
    "Stable": {
        "vol": 0.35,        # Low vol prioritaire
        "ter": 0.25,        # Coûts importants
        "aum": 0.15,        # Liquidité
        "diversif": 0.15,   # Diversification
        "momentum": 0.10,   # Momentum secondaire
    },
    "Modéré": {
        "vol": 0.20,
        "ter": 0.20,
        "aum": 0.15,
        "diversif": 0.15,
        "momentum": 0.15,
        "yield": 0.15,      # Rendement
    },
    "Agressif": {
        "momentum": 0.35,   # Momentum prioritaire
        "vol": 0.10,        # Vol secondaire (acceptée)
        "ter": 0.15,
        "aum": 0.15,
        "diversif": 0.10,
        "yield": 0.15,
    },
}


# =============================================================================
# HELPERS
# =============================================================================

def _to_numeric(series: pd.Series) -> pd.Series:
    """Conversion robuste vers numérique."""
    return pd.to_numeric(series, errors="coerce")


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
    - leverage = 0 (pas de levier)
    - AUM minimum
    - TER non nul
    - Exclut les bonds (fund_type)
    """
    if df.empty:
        return df
    
    mask = pd.Series(True, index=df.index)
    
    # Data quality score
    if "data_quality_score" in df.columns:
        dqs = _to_numeric(df["data_quality_score"])
        mask &= (dqs >= MIN_DATA_QUALITY_SCORE) | dqs.isna()
    
    # Pas de levier
    if "leverage" in df.columns:
        lev = _to_numeric(df["leverage"]).fillna(0)
        mask &= (lev == 0)
    
    # AUM minimum
    if "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        mask &= (aum >= MIN_AUM_USD) | aum.isna()
    
    # TER non nul
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        mask &= (ter > 0) | ter.isna()
    
    # Exclure les bonds (traités séparément)
    if "fund_type" in df.columns:
        fund_type_lower = df["fund_type"].fillna("").str.lower()
        is_bond = fund_type_lower.str.contains("bond|obligation|fixed income", regex=True)
        mask &= ~is_bond
    
    filtered = df[mask].copy()
    logger.info(f"[ETF] Data QC: {len(df)} → {len(filtered)} ({len(df) - len(filtered)} exclus)")
    
    return filtered


# =============================================================================
# HARD CONSTRAINTS PAR PROFIL
# =============================================================================

def apply_hard_constraints(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Couche 1: Contraintes hard par profil (quantiles adaptatifs).
    """
    if df.empty or profile not in PROFILE_CONSTRAINTS:
        return df
    
    constraints = PROFILE_CONSTRAINTS[profile]
    mask = pd.Series(True, index=df.index)
    
    # Volatilité max (quantile)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any():
        vol_threshold = vol_col.quantile(constraints["vol_max_quantile"])
        mask &= (vol_col <= vol_threshold) | vol_col.isna()
        logger.debug(f"[ETF {profile}] Vol threshold Q{constraints['vol_max_quantile']*100:.0f} = {vol_threshold:.1f}%")
    
    # TER max (quantile)
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        if ter.notna().any():
            ter_threshold = ter.quantile(constraints["ter_max_quantile"])
            mask &= (ter <= ter_threshold) | ter.isna()
            logger.debug(f"[ETF {profile}] TER threshold Q{constraints['ter_max_quantile']*100:.0f} = {ter_threshold:.2f}%")
    
    # Concentration max (sector/country)
    conc_max = constraints["concentration_max"]
    if conc_max < 1.0:
        if "sector_top_weight" in df.columns:
            sector_w = _to_numeric(df["sector_top_weight"]) / 100  # Assumer %
            mask &= (sector_w <= conc_max) | sector_w.isna()
        
        if "country_top_weight" in df.columns:
            country_w = _to_numeric(df["country_top_weight"]) / 100
            mask &= (country_w <= conc_max) | country_w.isna()
    
    filtered = df[mask].copy()
    logger.info(f"[ETF {profile}] Hard constraints: {len(df)} → {len(filtered)}")
    
    return filtered


# =============================================================================
# PRESET FILTERS
# =============================================================================

def _preset_coeur_global(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Cœur Global
    World core UCITS, coûts bas, diversifié.
    """
    mask = pd.Series(True, index=df.index)
    
    # TER bas (Q40)
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        if ter.notna().any():
            mask &= ter <= ter.quantile(0.40)
    
    # AUM élevé (Q60)
    if "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        if aum.notna().any():
            mask &= aum >= aum.quantile(0.60)
    
    # Diversification (concentration faible)
    if "sector_top_weight" in df.columns:
        sector_w = _to_numeric(df["sector_top_weight"])
        mask &= (sector_w <= 35) | sector_w.isna()
    
    return mask


def _preset_min_vol_global(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Minimum Volatility Global
    ETF low vol, core défensif.
    """
    mask = pd.Series(True, index=df.index)
    
    # Vol très basse (Q25)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any():
        mask &= vol_col <= vol_col.quantile(0.25)
    
    # TER raisonnable (Q50)
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        if ter.notna().any():
            mask &= ter <= ter.quantile(0.50)
    
    # AUM OK (Q40)
    if "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        if aum.notna().any():
            mask &= aum >= aum.quantile(0.40)
    
    return mask


def _preset_rendement_etf(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Rendement ETF (v1.1.0: renommé depuis 'rendement')
    Yield élevé, vol contenue.
    """
    mask = pd.Series(True, index=df.index)
    
    # Yield élevé (Q60)
    if "yield_ttm" in df.columns:
        yld = _to_numeric(df["yield_ttm"])
        if yld.notna().any():
            mask &= yld >= yld.quantile(0.60)
    
    # Vol contenue (Q70)
    vol_col = df.apply(_get_vol, axis=1)
    if vol_col.notna().any():
        mask &= vol_col <= vol_col.quantile(0.70)
    
    # TER pas délirant (Q70)
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        if ter.notna().any():
            mask &= ter <= ter.quantile(0.70)
    
    return mask


def _preset_qualite_value(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Qualité/Value (proxy via objective)
    Keywords: value, quality, dividend, factor.
    """
    mask = pd.Series(False, index=df.index)
    
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = ["value", "quality", "dividend", "factor", "fundamental"]
        for kw in keywords:
            mask |= obj_lower.str.contains(kw, regex=False)
    
    # Fallback: Large caps avec yield
    if "yield_ttm" in df.columns and "aum_usd" in df.columns:
        yld = _to_numeric(df["yield_ttm"])
        aum = _to_numeric(df["aum_usd"])
        fallback = (yld >= yld.quantile(0.50)) & (aum >= aum.quantile(0.60))
        mask |= fallback
    
    return mask


def _preset_croissance_tech(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Croissance Tech
    Tech/growth, momentum positif.
    """
    mask = pd.Series(False, index=df.index)
    
    # Via objective
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = ["tech", "growth", "innovation", "digital", "software", "semiconductor"]
        for kw in keywords:
            mask |= obj_lower.str.contains(kw, regex=False)
    
    # Via sector_top
    if "sector_top" in df.columns:
        sector = df["sector_top"].fillna("").str.lower()
        mask |= sector.str.contains("tech|software|semi", regex=True)
    
    # Momentum positif (1m + 3m)
    if "perf_1m_pct" in df.columns and "perf_3m_pct" in df.columns:
        p1m = _to_numeric(df["perf_1m_pct"])
        p3m = _to_numeric(df["perf_3m_pct"])
        momentum = (p1m > 0) | (p3m > 0)
        mask &= momentum | mask.isna()
    
    return mask


def _preset_smid_quality(df: pd.DataFrame) -> pd.Series:
    """
    Preset: SMID Quality
    Small/Mid caps diversifiées.
    """
    mask = pd.Series(False, index=df.index)
    
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = ["small", "mid", "smid", "cap", "russell", "msci small"]
        for kw in keywords:
            mask |= obj_lower.str.contains(kw, regex=False)
    
    if "fund_type" in df.columns:
        ft_lower = df["fund_type"].fillna("").str.lower()
        mask |= ft_lower.str.contains("small|mid", regex=True)
    
    return mask


def _preset_emergents(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Marchés Émergents
    EM diversifiés.
    """
    mask = pd.Series(False, index=df.index)
    
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = ["emerging", "em ", "émergent", "frontier", "developing"]
        for kw in keywords:
            mask |= obj_lower.str.contains(kw, regex=False)
    
    if "fund_type" in df.columns:
        ft_lower = df["fund_type"].fillna("").str.lower()
        mask |= ft_lower.str.contains("emerging|emerg", regex=True)
    
    # Via country_top
    if "country_top" in df.columns:
        country = df["country_top"].fillna("").str.lower()
        em_countries = ["china", "brazil", "india", "taiwan", "korea", "mexico", "indonesia"]
        for c in em_countries:
            mask |= country.str.contains(c, regex=False)
    
    return mask


def _preset_inflation_shield(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Inflation Shield (v1.1.0: NEW)
    TIPS, commodities, real assets.
    """
    mask = pd.Series(False, index=df.index)
    
    # Via objective
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = [
            "tips", "inflation", "protected", "real", "commodity", "commodities",
            "natural resources", "real assets", "real estate", "reit", "infrastructure"
        ]
        for kw in keywords:
            mask |= obj_lower.str.contains(kw, regex=False)
    
    # Via fund_type
    if "fund_type" in df.columns:
        ft_lower = df["fund_type"].fillna("").str.lower()
        mask |= ft_lower.str.contains("inflation|commodity|real estate|reit", regex=True)
    
    # Via sector_top
    if "sector_top" in df.columns:
        sector = df["sector_top"].fillna("").str.lower()
        mask |= sector.str.contains("energy|materials|real estate|utilities", regex=True)
    
    return mask


def _preset_or_physique(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Or Physique (v1.1.0: NEW)
    Gold physical ETF.
    """
    mask = pd.Series(False, index=df.index)
    
    # Via objective
    if "objective" in df.columns:
        obj_lower = df["objective"].fillna("").str.lower()
        keywords = ["gold", "or ", "precious metal", "bullion", "physical gold"]
        for kw in keywords:
            mask |= obj_lower.str.contains(kw, regex=False)
    
    # Via name
    if "name" in df.columns:
        name_lower = df["name"].fillna("").str.lower()
        gold_patterns = ["gold", "gld", "iau", "sgol", "gldm"]
        for pattern in gold_patterns:
            mask |= name_lower.str.contains(pattern, regex=False)
    
    # Via etfsymbol
    if "etfsymbol" in df.columns:
        symbol_upper = df["etfsymbol"].fillna("").str.upper()
        gold_symbols = ["GLD", "IAU", "GLDM", "SGOL", "IAUM", "AAAU", "PHYS"]
        mask |= symbol_upper.isin(gold_symbols)
    
    return mask


# Mapping preset name → function (v1.1.0: aligné avec preset_meta.py)
PRESET_FUNCTIONS = {
    "coeur_global": _preset_coeur_global,
    "min_vol_global": _preset_min_vol_global,
    "rendement_etf": _preset_rendement_etf,  # v1.1.0: renommé
    "qualite_value": _preset_qualite_value,
    "croissance_tech": _preset_croissance_tech,
    "smid_quality": _preset_smid_quality,
    "emergents": _preset_emergents,
    "inflation_shield": _preset_inflation_shield,  # v1.1.0: NEW
    "or_physique": _preset_or_physique,  # v1.1.0: NEW
}


def apply_presets_union(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Couche 2: Union des presets pour le profil.
    """
    if df.empty:
        return df
    
    preset_names = PROFILE_PRESETS.get(profile, [])
    if not preset_names:
        logger.warning(f"[ETF] Aucun preset défini pour profil {profile}")
        return df
    
    mask = pd.Series(False, index=df.index)
    
    for preset_name in preset_names:
        if preset_name in PRESET_FUNCTIONS:
            preset_mask = PRESET_FUNCTIONS[preset_name](df)
            count_before = mask.sum()
            mask |= preset_mask
            count_added = mask.sum() - count_before
            logger.debug(f"[ETF {profile}] Preset '{preset_name}': +{count_added} actifs")
    
    filtered = df[mask].copy()
    logger.info(f"[ETF {profile}] Presets union: {len(df)} → {len(filtered)}")
    
    return filtered


# =============================================================================
# SCORING
# =============================================================================

def compute_profile_score(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Calcule le _profile_score pour chaque ETF.
    """
    if df.empty:
        return df
    
    weights = SCORING_WEIGHTS.get(profile, SCORING_WEIGHTS["Modéré"])
    
    # Calcul des composantes
    scores = pd.DataFrame(index=df.index)
    
    # Vol score (lower is better)
    vol_col = df.apply(_get_vol, axis=1)
    scores["vol"] = _rank_percentile(vol_col, higher_is_better=False)
    
    # TER score (lower is better)
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        scores["ter"] = _rank_percentile(ter, higher_is_better=False)
    else:
        scores["ter"] = 0.5
    
    # AUM score (higher is better)
    if "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        scores["aum"] = _rank_percentile(aum, higher_is_better=True)
    else:
        scores["aum"] = 0.5
    
    # Diversification score (lower concentration is better)
    if "sector_top_weight" in df.columns:
        sector_w = _to_numeric(df["sector_top_weight"])
        scores["diversif"] = _rank_percentile(sector_w, higher_is_better=False)
    else:
        scores["diversif"] = 0.5
    
    # Momentum score (higher is better)
    momentum = pd.Series(0.0, index=df.index)
    if "perf_1m_pct" in df.columns:
        momentum += _to_numeric(df["perf_1m_pct"]).fillna(0) * 0.4
    if "perf_3m_pct" in df.columns:
        momentum += _to_numeric(df["perf_3m_pct"]).fillna(0) * 0.6
    scores["momentum"] = _rank_percentile(momentum, higher_is_better=True)
    
    # Yield score (higher is better)
    if "yield_ttm" in df.columns:
        yld = _to_numeric(df["yield_ttm"])
        scores["yield"] = _rank_percentile(yld, higher_is_better=True)
    else:
        scores["yield"] = 0.5
    
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
    df["_asset_class"] = "etf"
    
    logger.info(f"[ETF {profile}] Scores: mean={df['_profile_score'].mean():.1f}, "
                f"std={df['_profile_score'].std():.1f}, "
                f"range=[{df['_profile_score'].min():.1f}, {df['_profile_score'].max():.1f}]")
    
    return df


# =============================================================================
# MAIN FUNCTION
# =============================================================================

def select_etfs_for_profile(
    df: pd.DataFrame,
    profile: str,
    top_n: Optional[int] = None
) -> pd.DataFrame:
    """
    Sélectionne les ETF actions pour un profil donné.
    
    Args:
        df: DataFrame avec les ETF
        profile: "Stable", "Modéré", ou "Agressif"
        top_n: Nombre max d'ETF à retourner (optionnel)
    
    Returns:
        DataFrame filtré avec _profile_score
    """
    if profile not in PROFILE_PRESETS:
        raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_PRESETS.keys())}")
    
    logger.info(f"[ETF] Sélection pour profil {profile} - Univers initial: {len(df)}")
    
    # Couche 0: Data QC
    df_clean = apply_data_qc_filters(df)
    
    # Couche 1: Hard constraints
    df_constrained = apply_hard_constraints(df_clean, profile)
    
    # Couche 2: Presets union
    df_preset = apply_presets_union(df_constrained, profile)
    
    # Fallback si univers vide
    if df_preset.empty and not df_constrained.empty:
        logger.warning(f"[ETF {profile}] Presets vides, fallback sur contraintes hard")
        df_preset = df_constrained
    
    # Scoring
    df_scored = compute_profile_score(df_preset, profile)
    
    # Tri par score
    df_sorted = df_scored.sort_values("_profile_score", ascending=False)
    
    # Top N
    if top_n and len(df_sorted) > top_n:
        df_sorted = df_sorted.head(top_n)
    
    logger.info(f"[ETF {profile}] Sélection finale: {len(df_sorted)} ETF")
    
    return df_sorted


# =============================================================================
# UTILITIES
# =============================================================================

def get_etf_preset_summary() -> Dict[str, Any]:
    """Retourne un résumé des presets ETF."""
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
        "version": "1.1.0",
    }


# =============================================================================
# TEST
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    
    # Test avec données fictives
    test_data = pd.DataFrame({
        "etfsymbol": ["SPY", "QQQ", "VTI", "SCHD", "VWO", "IEMG", "XLK", "IJR", "GLD", "TIP"],
        "name": ["S&P 500", "Nasdaq 100", "Total Market", "Dividend", "EM Vanguard", "EM iShares", "Tech Select", "Small Cap", "Gold Trust", "TIPS Bond"],
        "fund_type": ["Equity", "Equity", "Equity", "Equity", "Emerging", "Emerging", "Technology", "Small Blend", "Commodity", "Inflation"],
        "aum_usd": [500e9, 200e9, 300e9, 50e9, 80e9, 70e9, 60e9, 40e9, 60e9, 30e9],
        "total_expense_ratio": [0.09, 0.20, 0.03, 0.06, 0.10, 0.11, 0.10, 0.06, 0.40, 0.19],
        "yield_ttm": [1.3, 0.5, 1.4, 3.5, 2.8, 2.5, 0.8, 1.2, 0.0, 4.5],
        "vol_3y_pct": [18, 24, 19, 15, 22, 23, 26, 22, 15, 8],
        "vol_pct": [17, 23, 18, 14, 21, 22, 25, 21, 14, 7],
        "perf_1m_pct": [2.1, 3.5, 2.0, 1.5, -0.5, -0.8, 4.2, 1.8, 1.2, 0.5],
        "perf_3m_pct": [5.2, 8.1, 5.0, 3.2, 2.1, 1.8, 9.5, 4.5, 3.5, 1.2],
        "sector_top_weight": [25, 45, 22, 18, 28, 30, 95, 15, 100, 100],
        "data_quality_score": [0.9, 0.9, 0.9, 0.85, 0.8, 0.8, 0.85, 0.8, 0.9, 0.85],
        "leverage": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        "objective": ["S&P 500 Index", "Nasdaq 100 Growth", "Total US Market", "High Dividend Yield", "Emerging Markets", "Emerging Markets", "Technology Select", "Small Cap Blend", "Physical Gold Bullion", "Treasury Inflation Protected"],
    })
    
    print("\n" + "=" * 60)
    print("TEST PRESET ETF v1.1.0")
    print("=" * 60)
    
    for profile in ["Stable", "Modéré", "Agressif"]:
        print(f"\n--- Profil: {profile} ---")
        result = select_etfs_for_profile(test_data.copy(), profile)
        print(result[["etfsymbol", "name", "_profile_score"]].to_string(index=False))
    
    print("\n✅ Test terminé")
