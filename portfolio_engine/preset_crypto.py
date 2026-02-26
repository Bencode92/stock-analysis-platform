# portfolio_engine/preset_crypto.py
"""
=========================================
Crypto Preset Selector v2.0.0
=========================================

Sélection dynamique de cryptomonnaies par profil (Stable/Modéré/Agressif).

v2.0.0: REFONTE COMPLÈTE — Pipeline 4 étapes
=========================================
BREAKING CHANGES vs v1.3.0:
- SUPPRIMÉ: BTC/ETH forcés (hardcoded blue_chip + synthétiques)
- SUPPRIMÉ: Preset union à base de quantiles (quality_risk, trend3_12m, etc.)
- SUPPRIMÉ: _ensure_blue_chips(), _BTC_ETH_SYNTHETIC
- NOUVEAU: Lecture dynamique du CSV complet (280+ assets)
- NOUVEAU: Filtres durs par profil (valeurs absolues, pas quantiles)
- NOUVEAU: Scoring pondéré différencié par profil
- NOUVEAU: Diversification sectorielle (max 1 core/catégorie, max 2 total)
- NOUVEAU: Split core/satellite automatique

Pipeline:
  CSV (280+ assets)
    → ① FILTRAGE dur (par profil)        → ~15-80 éligibles
    → ② SCORING pondéré (par profil)     → ranked list
    → ③ DIVERSIFICATION sectorielle      → max 1-2 par catégorie
    → ④ SPLIT core/satellite             → 2 core + 2-3 satellite

INVARIANT PRÉSERVÉ:
- API identique: select_crypto_for_profile(df, profile, top_n) → DataFrame
- Profil Stable → EXCLUSION TOTALE (inchangé)
- Stablecoins exclus (inchangé)
- Colonnes de sortie: _profile_score, _preset_profile, _asset_class, etc.

Colonnes attendues (df):
- symbol, currency_base, currency_quote
- ret_1d_pct, ret_7d_pct, ret_30d_pct, ret_90d_pct, ret_6m_pct, ret_1y_pct
- vol_7d_annual_pct, vol_30d_annual_pct
- sharpe_ratio, var_95_pct, atr14_pct, drawdown_90d_pct
- tier1_listed, stale, data_points, coverage_ratio
- enough_history_90d, enough_history_1y, ret_1y_suspect
"""

import logging
from typing import Dict, List, Optional, Any, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger("portfolio_engine.preset_crypto")

# =============================================================================
# CONFIGURATION
# =============================================================================

VERSION = "2.0.0"

# Stablecoins à exclure (inchangé)
STABLECOINS = {
    "USDT", "USDC", "DAI", "TUSD", "BUSD", "FDUSD", "PYUSD",
    "EURT", "EURS", "USDE", "UST", "FRAX", "LUSD", "GUSD",
    "USDP", "SUSD", "MIM", "DOLA", "cUSD", "OUSD", "HUSD"
}

# Seuils Data Quality (inchangé)
MIN_COVERAGE_RATIO = 0.85
MIN_DATA_POINTS = 60  # ~2 mois de données

# ─────────────────────────────────────────────────────────────────────────────
# ① FILTRES DURS PAR PROFIL (valeurs absolues, PAS quantiles)
# ─────────────────────────────────────────────────────────────────────────────
# Logique: Modéré = très restrictif (low vol), Agressif = large mais garde-fous
#
# | Filtre           | Modéré      | Agressif    |
# |------------------|-------------|-------------|
# | vol_30d max      | 80%         | 200%        |
# | drawdown_90d max | -35%        | -70%        |
# | enough_history   | 1y required | 90d suffit  |
# | pair             | /USD only   | /USD only   |
# ─────────────────────────────────────────────────────────────────────────────
PROFILE_HARD_FILTERS = {
    "Stable": {
        "excluded": True,  # EXCLUSION TOTALE
    },
    "Modéré": {
        "vol_30d_max": 80.0,       # Volatilité annualisée max 80%
        "drawdown_90d_max": -35.0, # Drawdown max -35%
        "require_history_1y": True, # Exige 1 an d'historique
        "usd_pairs_only": False,   # Accepte toutes paires (/EUR, /USD, etc.)
    },
    "Agressif": {
        "vol_30d_max": 200.0,      # Large: accepte haute vol
        "drawdown_90d_max": -70.0, # Accepte DD significatifs
        "require_history_1y": False, # 90d suffit
        "usd_pairs_only": False,   # Accepte toutes paires (/EUR, /USD, etc.)
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# ② SCORING PONDÉRÉ PAR PROFIL
# ─────────────────────────────────────────────────────────────────────────────
# Chaque métrique est normalisée en percentile [0,1] puis pondérée.
# Les poids "négatifs" (vol_penalty, dd_penalty) inversent le sens:
#   score_vol = (1 - rank_percentile(vol)) * abs(weight)
#
# | Métrique     | Modéré | Agressif | Logique                         |
# |--------------|--------|----------|---------------------------------|
# | sharpe_ratio | 0.25   | 0.30     | Performance ajustée du risque   |
# | ret_90d      | 0.10   | 0.25     | Momentum court terme            |
# | ret_1y       | 0.15   | 0.15     | Track record long terme         |
# | vol_penalty  | -0.30  | -0.10    | Modéré pénalise fort la vol     |
# | dd_penalty   | -0.20  | -0.20    | Personne n'aime les drawdowns   |
# ─────────────────────────────────────────────────────────────────────────────

PROFILE_SCORING_WEIGHTS = {
    "Stable": {},  # N/A — exclusion
    "Modéré": {
        "sharpe_ratio":  0.25,
        "ret_90d":       0.10,
        "ret_1y":        0.15,
        "vol_penalty":  -0.30,  # Négatif = pénalise la haute vol
        "dd_penalty":   -0.20,  # Négatif = pénalise le gros DD
    },
    "Agressif": {
        "sharpe_ratio":  0.30,
        "ret_90d":       0.25,
        "ret_1y":        0.15,
        "vol_penalty":  -0.10,  # Faible pénalité vol
        "dd_penalty":   -0.20,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# ③ CATÉGORIES SECTORIELLES CRYPTO
# ─────────────────────────────────────────────────────────────────────────────
# Objectif: éviter la concentration (ex: PAXG + XAUT = double or tokenisé)
#
# Règles:
#   - Max 1 par catégorie en CORE
#   - Max 2 par catégorie au TOTAL (core + satellite)
#   - Assets non catégorisés → catégorie "other" (max 1 total)
# ─────────────────────────────────────────────────────────────────────────────

CRYPTO_CATEGORIES = {
    "tokenized_gold": ["PAXG", "XAUT"],
    "blue_chip":      ["BTC", "ETH"],
    "smart_contract": ["SOL", "AVAX", "DOT", "NEAR", "SUI", "ADA", "ATOM",
                        "FTM", "ALGO", "EGLD", "HBAR", "ICP"],
    "defi":           ["MORPHO", "AAVE", "UNI", "CRV", "PENDLE", "COMP",
                        "MKR", "SNX", "SUSHI", "YFI", "DYDX", "1INCH"],
    "payment":        ["TRX", "XRP", "XLM", "DASH"],
    "privacy":        ["XMR", "ZEC", "SCRT"],
    "pow_legacy":     ["DCR", "BCH", "LTC", "ZEN", "KMD"],
    "exchange":       ["BNB", "OKB", "CRO", "FTT", "LEO"],
    "meme":           ["DOGE", "SHIB", "PEPE", "FLOKI", "BONK", "WIF"],
    "gaming_nft":     ["AXS", "SAND", "MANA", "ENJ", "GALA", "IMX"],
    "storage":        ["FIL", "AR", "STORJ"],
    "oracle":         ["LINK", "BAND", "API3"],
    "layer2":         ["MATIC", "ARB", "OP", "STRK", "ZK"],
}

# Nombre d'assets core / satellite par profil
CORE_SATELLITE_CONFIG = {
    "Modéré": {
        "n_core": 2,
        "n_satellite": 2,     # 4 total — profil conservateur
        "core_pct": 0.65,     # 65% du budget crypto en core
        "max_per_cat_core": 1,
        "max_per_cat_total": 2,
    },
    "Agressif": {
        "n_core": 2,
        "n_satellite": 3,     # 5 total — profil large
        "core_pct": 0.55,     # 55% du budget crypto en core
        "max_per_cat_core": 1,
        "max_per_cat_total": 2,
    },
}


# =============================================================================
# HELPERS (inchangés de v1.3.0)
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


def _get_currency_base(row: pd.Series) -> str:
    """Extrait la currency base (BTC de BTC/USD)."""
    base = row.get("currency_base")
    if pd.notna(base) and base:
        return str(base).upper().strip()
    symbol = row.get("symbol")
    if pd.notna(symbol) and symbol:
        return str(symbol).split("/")[0].upper().strip()
    return ""


def _get_category(currency_base: str) -> str:
    """Retourne la catégorie sectorielle d'un crypto, ou 'other'."""
    for category, members in CRYPTO_CATEGORIES.items():
        if currency_base in members:
            return category
    return "other"


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
# ÉTAPE 0: DATA QUALITY (quasi-identique à v1.3.0)
# =============================================================================

def apply_data_qc_filters(df: pd.DataFrame) -> pd.DataFrame:
    """
    Couche 0: Filtres qualité données (communs à tous profils).
    
    Filtre:
    - Exclut stablecoins (sur symbol ET currency_base)
    - tier1_listed = True
    - stale = False
    - coverage_ratio >= seuil
    - enough_history_90d = True (minimum vital)
    - data_points >= seuil
    """
    if df.empty:
        return df

    mask = pd.Series(True, index=df.index)

    # Exclure stablecoins — sur currency_base (plus fiable que symbol)
    if "currency_base" in df.columns:
        base_upper = df["currency_base"].fillna("").str.upper().str.strip()
        is_stable = base_upper.isin(STABLECOINS)
        mask &= ~is_stable
        excluded_count = is_stable.sum()
        if excluded_count > 0:
            logger.debug(f"[Crypto QC] Exclusion {excluded_count} stablecoins")

    if "symbol" in df.columns:
        # Backup: checker dans symbol aussi
        symbol_upper = df["symbol"].fillna("").str.upper()
        for sc in STABLECOINS:
            mask &= ~symbol_upper.str.startswith(sc + "/")

    # tier1_listed (tolérant aux données manquantes)
    if "tier1_listed" in df.columns:
        tier1 = df["tier1_listed"]
        mask &= tier1.apply(
            lambda x: str(x).strip().lower() in ("true", "1", "yes")
        ) | tier1.isna()

    # stale (tolérant aux données manquantes)
    if "stale" in df.columns:
        stale = df["stale"]
        mask &= stale.apply(
            lambda x: str(x).strip().lower() in ("false", "0", "no")
        ) | stale.isna()

    # coverage_ratio
    if "coverage_ratio" in df.columns:
        coverage = _to_numeric(df["coverage_ratio"])
        mask &= (coverage >= MIN_COVERAGE_RATIO) | coverage.isna()

    # enough_history_90d (minimum vital — le filtre 1y est dans hard_filters)
    if "enough_history_90d" in df.columns:
        hist90 = df["enough_history_90d"]
        mask &= hist90.apply(
            lambda x: str(x).strip().lower() in ("true", "1", "yes")
        ) | hist90.isna()

    # data_points
    if "data_points" in df.columns:
        dp = _to_numeric(df["data_points"])
        mask &= (dp >= MIN_DATA_POINTS) | dp.isna()

    filtered = df[mask].copy()
    logger.info(
        f"[Crypto QC] Data QC: {len(df)} → {len(filtered)} "
        f"({len(df) - len(filtered)} exclus)"
    )
    return filtered


# =============================================================================
# ÉTAPE 1: FILTRES DURS PAR PROFIL
# =============================================================================

def apply_hard_filters(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Étape ①: Filtres durs par profil (valeurs absolues).
    
    Contrairement à v1.x (quantiles), les seuils sont fixes et 
    ne dépendent PAS du dataset → reproductibilité garantie.
    
    Args:
        df: DataFrame post-QC
        profile: "Stable", "Modéré", ou "Agressif"
    
    Returns:
        DataFrame filtré. Vide pour Stable (exclusion).
    """
    if df.empty:
        return df

    filters = PROFILE_HARD_FILTERS.get(profile, {})

    # Profil Stable → EXCLUSION TOTALE
    if filters.get("excluded", False):
        logger.info(
            f"[Crypto {profile}] EXCLUSION TOTALE — "
            f"crypto non compatible avec profil Stable"
        )
        return pd.DataFrame(columns=df.columns)

    mask = pd.Series(True, index=df.index)

    # ── Paires /USD uniquement ──
    if filters.get("usd_pairs_only", False):
        if "currency_quote" in df.columns:
            quote = df["currency_quote"].fillna("").str.upper().str.strip()
            usd_mask = quote == "USD"
            mask &= usd_mask
            logger.debug(
                f"[Crypto {profile}] USD pairs: "
                f"{usd_mask.sum()}/{len(df)} passent"
            )
        elif "symbol" in df.columns:
            # Fallback: chercher /USD dans symbol
            mask &= df["symbol"].fillna("").str.contains("/USD", case=False)

    # ── Volatilité max ──
    vol_max = filters.get("vol_30d_max")
    if vol_max is not None:
        vol_col = df.apply(_get_vol, axis=1)
        vol_pass = (vol_col <= vol_max) | vol_col.isna()
        mask &= vol_pass
        logger.debug(
            f"[Crypto {profile}] Vol ≤ {vol_max}%: "
            f"{vol_pass.sum()}/{len(df)} passent"
        )

    # ── Drawdown max ──
    dd_max = filters.get("drawdown_90d_max")
    if dd_max is not None and "drawdown_90d_pct" in df.columns:
        dd = _to_numeric(df["drawdown_90d_pct"])
        # dd est négatif (ex: -35%), dd_max aussi → on filtre dd >= dd_max
        dd_pass = (dd >= dd_max) | dd.isna()
        mask &= dd_pass
        logger.debug(
            f"[Crypto {profile}] DD ≥ {dd_max}%: "
            f"{dd_pass.sum()}/{len(df)} passent"
        )

    # ── Historique 1 an requis ──
    if filters.get("require_history_1y", False):
        if "enough_history_1y" in df.columns:
            hist1y = df["enough_history_1y"]
            hist_pass = hist1y.apply(
                lambda x: str(x).strip().lower() in ("true", "1", "yes")
            ) | hist1y.isna()
            mask &= hist_pass
            logger.debug(
                f"[Crypto {profile}] History 1y: "
                f"{hist_pass.sum()}/{len(df)} passent"
            )
        # Fallback: vérifier data_points >= 365
        elif "data_points" in df.columns:
            dp = _to_numeric(df["data_points"])
            mask &= (dp >= 365) | dp.isna()

    # ── Exclure suspects ──
    if "ret_1y_suspect" in df.columns:
        suspect = df["ret_1y_suspect"]
        mask &= suspect.apply(
            lambda x: str(x).strip().lower() in ("false", "0", "no")
        ) | suspect.isna()

    filtered = df[mask].copy()
    logger.info(
        f"[Crypto {profile}] Hard filters: {len(df)} → {len(filtered)} "
        f"({len(df) - len(filtered)} exclus)"
    )

    # Log les assets qui passent pour debug
    if len(filtered) > 0 and len(filtered) <= 20:
        symbols = filtered["symbol"].tolist() if "symbol" in filtered.columns else []
        logger.debug(f"[Crypto {profile}] Éligibles: {symbols}")

    return filtered


# =============================================================================
# ÉTAPE 2: SCORING PONDÉRÉ
# =============================================================================

def compute_profile_score(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Étape ②: Scoring pondéré par profil.
    
    Chaque métrique est convertie en percentile [0,1] puis pondérée.
    Les composantes "penalty" (vol, dd) sont inversées: haute vol → score bas.
    
    Contrairement à v1.x:
    - Plus de presets (quality_risk, trend3_12m, etc.)
    - Plus de blue_chip_bonus
    - Score basé sur 5 métriques explicites
    
    Args:
        df: DataFrame post-hard-filters
        profile: "Modéré" ou "Agressif"
    
    Returns:
        DataFrame avec colonnes _profile_score, _score_components, etc.
    """
    if df.empty:
        return df

    weights = PROFILE_SCORING_WEIGHTS.get(profile, {})
    if not weights:
        return df

    # ── Extraire les métriques brutes ──
    metrics = pd.DataFrame(index=df.index)

    # Sharpe ratio (higher is better)
    if "sharpe_ratio" in df.columns:
        metrics["sharpe_ratio"] = _to_numeric(df["sharpe_ratio"])
    else:
        metrics["sharpe_ratio"] = np.nan

    # Return 90d (higher is better)
    if "ret_90d_pct" in df.columns:
        metrics["ret_90d"] = _to_numeric(df["ret_90d_pct"])
    else:
        metrics["ret_90d"] = np.nan

    # Return 1y (higher is better)
    if "ret_1y_pct" in df.columns:
        metrics["ret_1y"] = _to_numeric(df["ret_1y_pct"])
    else:
        metrics["ret_1y"] = np.nan

    # Volatilité (lower is better → score inversé)
    metrics["vol"] = df.apply(_get_vol, axis=1)

    # Drawdown (closer to 0 is better → score inversé sur abs)
    if "drawdown_90d_pct" in df.columns:
        metrics["dd"] = _to_numeric(df["drawdown_90d_pct"]).abs()
    else:
        metrics["dd"] = np.nan

    # ── Convertir en percentiles ──
    scores = pd.DataFrame(index=df.index)
    scores["sharpe_ratio"] = _rank_percentile(metrics["sharpe_ratio"], higher_is_better=True)
    scores["ret_90d"]      = _rank_percentile(metrics["ret_90d"], higher_is_better=True)
    scores["ret_1y"]       = _rank_percentile(metrics["ret_1y"], higher_is_better=True)
    scores["vol_penalty"]  = _rank_percentile(metrics["vol"], higher_is_better=False)  # Low vol = high score
    scores["dd_penalty"]   = _rank_percentile(metrics["dd"], higher_is_better=False)   # Low DD = high score

    # ── Score composite pondéré ──
    total_score = pd.Series(0.0, index=df.index)
    total_abs_weight = 0.0

    for component, weight in weights.items():
        if component in scores.columns:
            # Les poids négatifs dans la config signifient "pénalité"
            # Mais le score est déjà inversé (low vol → high score)
            # Donc on utilise abs(weight) comme multiplicateur
            total_score += scores[component] * abs(weight)
            total_abs_weight += abs(weight)

    if total_abs_weight > 0:
        total_score /= total_abs_weight

    # Normaliser 0-100
    df = df.copy()
    df["_profile_score"] = _normalize_score(total_score, 0, 100).round(2)
    df["_preset_profile"] = profile
    df["_asset_class"] = "crypto"

    # Ajouter la catégorie sectorielle pour chaque asset
    df["_crypto_category"] = df.apply(
        lambda row: _get_category(_get_currency_base(row)), axis=1
    )

    # Stocker les composantes pour debug/audit
    for comp in scores.columns:
        df[f"_score_{comp}"] = scores[comp].round(3)

    logger.info(
        f"[Crypto {profile}] Scores: "
        f"mean={df['_profile_score'].mean():.1f}, "
        f"std={df['_profile_score'].std():.1f}, "
        f"range=[{df['_profile_score'].min():.1f}, "
        f"{df['_profile_score'].max():.1f}]"
    )

    return df


# =============================================================================
# ÉTAPE 3: SÉLECTION AVEC DIVERSIFICATION SECTORIELLE
# =============================================================================

def select_with_diversity(
    df: pd.DataFrame,
    profile: str,
) -> pd.DataFrame:
    """
    Étape ③+④: Sélection core/satellite avec contraintes de diversification.
    
    Algorithme glouton:
    1. Trier par _profile_score DESC
    2. Sélectionner les CORE (n_core) en respectant max 1 par catégorie
    3. Sélectionner les SATELLITE (n_satellite) en respectant max 2 par catégorie au total
    4. Tagger chaque asset comme 'core' ou 'satellite'
    
    Args:
        df: DataFrame avec _profile_score et _crypto_category
        profile: "Modéré" ou "Agressif"
    
    Returns:
        DataFrame réduit avec _role = 'core' | 'satellite'
    """
    if df.empty:
        return df

    config = CORE_SATELLITE_CONFIG.get(profile)
    if config is None:
        return df

    n_core = config["n_core"]
    n_satellite = config["n_satellite"]
    max_per_cat_core = config["max_per_cat_core"]
    max_per_cat_total = config["max_per_cat_total"]

    # Trier par score DESC
    df_sorted = df.sort_values("_profile_score", ascending=False).copy()

    selected_indices = []
    selected_roles = {}  # index → 'core' | 'satellite'
    category_count_core = {}    # category → count in core
    category_count_total = {}   # category → count total

    # ── Phase 1: Sélection CORE ──
    for idx, row in df_sorted.iterrows():
        if len([i for i in selected_indices if selected_roles.get(i) == "core"]) >= n_core:
            break

        cat = row.get("_crypto_category", "other")

        # Contrainte: max 1 par catégorie en core
        if category_count_core.get(cat, 0) >= max_per_cat_core:
            continue

        selected_indices.append(idx)
        selected_roles[idx] = "core"
        category_count_core[cat] = category_count_core.get(cat, 0) + 1
        category_count_total[cat] = category_count_total.get(cat, 0) + 1

        base = _get_currency_base(row)
        logger.debug(
            f"[Crypto {profile}] CORE: {base} "
            f"(cat={cat}, score={row['_profile_score']:.1f})"
        )

    # ── Phase 2: Sélection SATELLITE ──
    for idx, row in df_sorted.iterrows():
        if idx in selected_indices:
            continue

        n_sat_selected = len([
            i for i in selected_indices if selected_roles.get(i) == "satellite"
        ])
        if n_sat_selected >= n_satellite:
            break

        cat = row.get("_crypto_category", "other")

        # Contrainte: max 2 par catégorie au total
        if category_count_total.get(cat, 0) >= max_per_cat_total:
            continue

        selected_indices.append(idx)
        selected_roles[idx] = "satellite"
        category_count_total[cat] = category_count_total.get(cat, 0) + 1

        base = _get_currency_base(row)
        logger.debug(
            f"[Crypto {profile}] SATELLITE: {base} "
            f"(cat={cat}, score={row['_profile_score']:.1f})"
        )

    # ── Construire le résultat ──
    if not selected_indices:
        logger.warning(f"[Crypto {profile}] Aucun asset sélectionné après diversification")
        return pd.DataFrame(columns=df.columns)

    result = df_sorted.loc[selected_indices].copy()
    result["_role"] = result.index.map(selected_roles)

    # Réordonner: core d'abord, puis satellite, par score DESC
    result["_role_order"] = result["_role"].map({"core": 0, "satellite": 1})
    result = result.sort_values(
        ["_role_order", "_profile_score"],
        ascending=[True, False]
    ).drop(columns=["_role_order"])

    # Log résumé
    n_core_actual = (result["_role"] == "core").sum()
    n_sat_actual = (result["_role"] == "satellite").sum()
    categories_used = result["_crypto_category"].unique().tolist()

    logger.info(
        f"[Crypto {profile}] Sélection diversifiée: "
        f"{n_core_actual} core + {n_sat_actual} satellite = "
        f"{len(result)} total, catégories: {categories_used}"
    )

    return result


# =============================================================================
# DÉDUPLICATION PAIRES (USD vs EUR du même asset)
# =============================================================================

def _deduplicate_pairs(df: pd.DataFrame) -> pd.DataFrame:
    """
    Déduplique les paires du même asset (ex: BTC/USD et BTC/EUR).
    
    Garde la paire avec le plus de data_points, ou /USD par préférence.
    """
    if df.empty or "currency_base" not in df.columns:
        return df

    bases = df.apply(_get_currency_base, axis=1)
    df = df.copy()
    df["_base_dedup"] = bases

    # Pour chaque base, garder le meilleur
    best_indices = []
    for base, group in df.groupby("_base_dedup"):
        if len(group) == 1:
            best_indices.append(group.index[0])
        else:
            # Préférer /USD
            usd_rows = group[
                group["symbol"].fillna("").str.contains("/USD", case=False)
            ]
            if not usd_rows.empty:
                # Parmi les /USD, garder celui avec le plus de data_points
                if "data_points" in group.columns:
                    dp_vals = _to_numeric(usd_rows["data_points"]).fillna(0)
                    best_indices.append(usd_rows.index[dp_vals.values.argmax()])
                else:
                    best_indices.append(usd_rows.index[0])
            else:
                # Pas de /USD → garder le premier
                best_indices.append(group.index[0])

    result = df.loc[best_indices].drop(columns=["_base_dedup"])
    if len(result) < len(df):
        logger.debug(
            f"[Crypto] Déduplication paires: {len(df)} → {len(result)}"
        )
    return result


# =============================================================================
# FONCTION PRINCIPALE (API INCHANGÉE)
# =============================================================================

def select_crypto_for_profile(
    df: pd.DataFrame,
    profile: str,
    top_n: Optional[int] = None
) -> pd.DataFrame:
    """
    Sélectionne les cryptomonnaies pour un profil donné.
    
    *** API IDENTIQUE À v1.3.0 — drop-in replacement ***
    
    Pipeline v2.0.0:
      ⓪ Data QC (stablecoins, tier1, stale, coverage)
      → Déduplication paires (BTC/USD vs BTC/EUR)
      → ① Filtres durs par profil (vol max, dd max, historique)
      → ② Scoring pondéré (sharpe, ret_90d, ret_1y, vol_penalty, dd_penalty)
      → ③ Diversification sectorielle + split core/satellite
    
    Args:
        df: DataFrame avec les cryptos (CSV complet)
        profile: "Stable", "Modéré", ou "Agressif"
        top_n: Nombre max de cryptos (ignoré en v2 — piloté par config)
    
    Returns:
        DataFrame filtré avec _profile_score, _role, _crypto_category
        ATTENTION: Retourne vide pour profil "Stable" (exclusion)
    """
    valid_profiles = list(PROFILE_HARD_FILTERS.keys())
    if profile not in valid_profiles:
        raise ValueError(
            f"Profil inconnu: {profile}. Valides: {valid_profiles}"
        )

    logger.info(
        f"[Crypto v{VERSION}] Sélection pour profil {profile} "
        f"— Univers initial: {len(df)}"
    )

    # ── Étape 0: Data QC ──
    df_clean = apply_data_qc_filters(df)

    # ── Déduplication paires ──
    df_dedup = _deduplicate_pairs(df_clean)
    if len(df_dedup) < len(df_clean):
        logger.info(
            f"[Crypto] Après dédup paires: {len(df_clean)} → {len(df_dedup)}"
        )

    # ── Étape 1: Filtres durs ──
    df_filtered = apply_hard_filters(df_dedup, profile)

    if df_filtered.empty:
        logger.info(
            f"[Crypto {profile}] Sélection finale: 0 cryptos "
            f"(exclusion ou filtres stricts)"
        )
        return df_filtered

    # ── Étape 2: Scoring ──
    df_scored = compute_profile_score(df_filtered, profile)

    # ── Étape 3+4: Diversification + Core/Satellite ──
    df_selected = select_with_diversity(df_scored, profile)

    # ── Appliquer top_n si spécifié (backward compat) ──
    if top_n and len(df_selected) > top_n:
        df_selected = df_selected.head(top_n)

    logger.info(
        f"[Crypto {profile}] Sélection finale: {len(df_selected)} cryptos"
    )

    # ── Log résumé lisible ──
    if not df_selected.empty:
        for _, row in df_selected.iterrows():
            base = _get_currency_base(row)
            role = row.get("_role", "?")
            score = row.get("_profile_score", 0)
            cat = row.get("_crypto_category", "?")
            sharpe = row.get("sharpe_ratio", "?")
            vol = _get_vol(row)
            logger.info(
                f"  → [{role.upper():9s}] {base:8s} | "
                f"score={score:5.1f} | cat={cat:15s} | "
                f"sharpe={sharpe} | vol={vol}"
            )

    return df_selected


# =============================================================================
# UTILITIES (backward compat)
# =============================================================================

def get_crypto_preset_summary() -> Dict[str, Any]:
    """Retourne un résumé des presets Crypto v2.0.0."""
    return {
        "version": VERSION,
        "pipeline": "4-stage: QC → hard_filters → scoring → diversification",
        "stablecoins_excluded": sorted(STABLECOINS),
        "categories": {k: v for k, v in CRYPTO_CATEGORIES.items()},
        "profiles": {
            profile: {
                "hard_filters": PROFILE_HARD_FILTERS.get(profile, {}),
                "scoring_weights": PROFILE_SCORING_WEIGHTS.get(profile, {}),
                "core_satellite": CORE_SATELLITE_CONFIG.get(profile, {}),
            }
            for profile in PROFILE_HARD_FILTERS.keys()
        },
    }


# =============================================================================
# TEST
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)

    # Simuler un dataset réaliste avec les assets connus du CSV
    test_data = pd.DataFrame([
        # Blue chips (mauvais sharpe actuellement)
        {"symbol": "BTC/USD", "currency_base": "BTC", "currency_quote": "USD",
         "ret_90d_pct": -5.0, "ret_1y_pct": -19.0, "vol_30d_annual_pct": 48.0,
         "sharpe_ratio": -3.59, "drawdown_90d_pct": -25.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.99,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        {"symbol": "ETH/USD", "currency_base": "ETH", "currency_quote": "USD",
         "ret_90d_pct": -10.0, "ret_1y_pct": -38.0, "vol_30d_annual_pct": 62.0,
         "sharpe_ratio": -3.48, "drawdown_90d_pct": -40.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.99,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        # Top performers
        {"symbol": "DCR/USD", "currency_base": "DCR", "currency_quote": "USD",
         "ret_90d_pct": 120.0, "ret_1y_pct": 157.0, "vol_30d_annual_pct": 98.8,
         "sharpe_ratio": 6.57, "drawdown_90d_pct": -18.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.98,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        {"symbol": "MORPHO/USD", "currency_base": "MORPHO", "currency_quote": "USD",
         "ret_90d_pct": 85.0, "ret_1y_pct": -8.5, "vol_30d_annual_pct": 137.9,
         "sharpe_ratio": 4.55, "drawdown_90d_pct": -30.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.95,
         "data_points": 200, "enough_history_90d": True, "enough_history_1y": False,
         "ret_1y_suspect": False},

        # Stable crypto
        {"symbol": "PAXG/USD", "currency_base": "PAXG", "currency_quote": "USD",
         "ret_90d_pct": 15.0, "ret_1y_pct": 77.0, "vol_30d_annual_pct": 60.0,
         "sharpe_ratio": 0.25, "drawdown_90d_pct": -15.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.98,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        {"symbol": "XAUT/USD", "currency_base": "XAUT", "currency_quote": "USD",
         "ret_90d_pct": 14.0, "ret_1y_pct": 72.0, "vol_30d_annual_pct": 55.0,
         "sharpe_ratio": 0.20, "drawdown_90d_pct": -12.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.97,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        {"symbol": "TRX/USD", "currency_base": "TRX", "currency_quote": "USD",
         "ret_90d_pct": 5.0, "ret_1y_pct": 26.0, "vol_30d_annual_pct": 27.7,
         "sharpe_ratio": -1.17, "drawdown_90d_pct": -15.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.98,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        # Mid-tier
        {"symbol": "BCH/USD", "currency_base": "BCH", "currency_quote": "USD",
         "ret_90d_pct": 20.0, "ret_1y_pct": 70.7, "vol_30d_annual_pct": 92.0,
         "sharpe_ratio": -1.48, "drawdown_90d_pct": -35.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.98,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        {"symbol": "XVG/USD", "currency_base": "XVG", "currency_quote": "USD",
         "ret_90d_pct": -5.0, "ret_1y_pct": 4.0, "vol_30d_annual_pct": 105.0,
         "sharpe_ratio": -1.80, "drawdown_90d_pct": -35.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.95,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        {"symbol": "SOL/USD", "currency_base": "SOL", "currency_quote": "USD",
         "ret_90d_pct": -15.0, "ret_1y_pct": -25.0, "vol_30d_annual_pct": 95.0,
         "sharpe_ratio": -2.10, "drawdown_90d_pct": -45.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.99,
         "data_points": 365, "enough_history_90d": True, "enough_history_1y": True,
         "ret_1y_suspect": False},

        # High vol for aggressive
        {"symbol": "PEPE/USD", "currency_base": "PEPE", "currency_quote": "USD",
         "ret_90d_pct": 50.0, "ret_1y_pct": 200.0, "vol_30d_annual_pct": 180.0,
         "sharpe_ratio": 1.20, "drawdown_90d_pct": -60.0,
         "tier1_listed": True, "stale": False, "coverage_ratio": 0.90,
         "data_points": 200, "enough_history_90d": True, "enough_history_1y": False,
         "ret_1y_suspect": False},
    ])

    print("\n" + "=" * 70)
    print(f"TEST PRESET CRYPTO v{VERSION}")
    print("=" * 70)

    for profile in ["Stable", "Modéré", "Agressif"]:
        print(f"\n{'─' * 70}")
        print(f"PROFIL: {profile}")
        print(f"{'─' * 70}")

        result = select_crypto_for_profile(test_data.copy(), profile)

        if not result.empty:
            display_cols = [
                "symbol", "_role", "_crypto_category",
                "_profile_score", "sharpe_ratio",
                "vol_30d_annual_pct", "ret_1y_pct", "drawdown_90d_pct"
            ]
            display_cols = [c for c in display_cols if c in result.columns]
            print(result[display_cols].to_string(index=False))
        else:
            print("→ Aucune crypto sélectionnée")

    print(f"\n✅ Test v{VERSION} terminé")
