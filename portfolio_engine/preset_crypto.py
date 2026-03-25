# portfolio_engine/preset_crypto.py
"""
=========================================
Crypto Preset Selector v2.0.2
=========================================

Sélection dynamique de cryptomonnaies par profil (Stable/Modéré/Agressif).

v2.0.2: Blacklist crypto (risque réputationnel)
- NEW: CRYPTO_BLACKLIST — TRX, MORPHO, meme coins exclus en amont (QC)
- Remplace le Step 5c engine (plus cohérent: filtre à la source, pas en post)

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

VERSION = "2.0.2"

# Stablecoins à exclure (inchangé)
STABLECOINS = {
    "USDT", "USDC", "DAI", "TUSD", "BUSD", "FDUSD", "PYUSD",
    "EURT", "EURS", "USDE", "UST", "FRAX", "LUSD", "GUSD",
    "USDP", "SUSD", "MIM", "DOLA", "cUSD", "OUSD", "HUSD"
}

# v2.0.2: Blacklist crypto — risque reputationnel/reglementaire
# TRX: Justin Sun inculpe SEC (mars 2023), concentration reseau ~33%
# MORPHO: DeFi illiquide, vol ~138%, pas de vehicule regule
# Memes: vol >150%, aucune these investissement, risque reputation portefeuille modele
CRYPTO_BLACKLIST = {
    "TRX", "MORPHO", "SHIB", "DOGE", "PEPE", "FLOKI", "BONK", "WIF",
    "OFFICIAL TRUMP", "PUDGY PENGUINS",
}

# Seuils Data Quality (inchangé)
MIN_COVERAGE_RATIO = 0.85
MIN_DATA_POINTS = 60  # ~2 mois de données

# ─────────────────────────────────────────────────────────────────────────────
# ① FILTRES DURS PAR PROFIL (valeurs absolues, PAS quantiles)
# ─────────────────────────────────────────────────────────────────────────────

PROFILE_HARD_FILTERS = {
    "Stable": {
        "excluded": True,  # EXCLUSION TOTALE
    },
    "Modéré": {
        "vol_30d_max": 80.0,
        "drawdown_90d_max": -35.0,
        "require_history_1y": True,
        "usd_pairs_only": True,
    },
    "Agressif": {
        "vol_30d_max": 200.0,
        "drawdown_90d_max": -70.0,
        "require_history_1y": False,
        "usd_pairs_only": True,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# ② SCORING PONDÉRÉ PAR PROFIL
# ─────────────────────────────────────────────────────────────────────────────

PROFILE_SCORING_WEIGHTS = {
    "Stable": {},  # N/A — exclusion
    "Modéré": {
        "sharpe_ratio":  0.25,
        "ret_90d":       0.10,
        "ret_1y":        0.15,
        "vol_penalty":  -0.30,
        "dd_penalty":   -0.20,
    },
    "Agressif": {
        "sharpe_ratio":  0.30,
        "ret_90d":       0.25,
        "ret_1y":        0.15,
        "vol_penalty":  -0.10,
        "dd_penalty":   -0.20,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# ③ CATÉGORIES SECTORIELLES CRYPTO
# ─────────────────────────────────────────────────────────────────────────────

CRYPTO_CATEGORIES = {
    "tokenized_gold": ["PAXG", "XAUT", "PAX GOLD", "TETHER GOLD"],
    "blue_chip":      ["BTC", "ETH", "BITCOIN", "ETHEREUM"],
    "smart_contract": ["SOL", "AVAX", "DOT", "NEAR", "SUI", "ADA", "ATOM",
                        "FTM", "ALGO", "EGLD", "HBAR", "ICP",
                        "SOLANA", "AVALANCHE", "POLKADOT", "CARDANO", "COSMOS",
                        "FANTOM", "ALGORAND", "HEDERA", "INTERNET COMPUTER"],
    "defi":           ["AAVE", "UNI", "CRV", "PENDLE", "COMP",
                        "MKR", "SNX", "SUSHI", "YFI", "DYDX", "1INCH",
                        "UNISWAP", "CURVE DAO", "MAKER", "SYNTHETIX"],
    "payment":        ["XRP", "XLM", "DASH",
                        "RIPPLE", "STELLAR", "STELLAR LUMENS"],
    "privacy":        ["XMR", "ZEC", "SCRT", "MONERO", "ZCASH", "SECRET"],
    "pow_legacy":     ["DCR", "BCH", "LTC", "ZEN", "KMD",
                        "DECRED", "BITCOIN CASH", "LITECOIN", "HORIZEN", "KOMODO"],
    "exchange":       ["BNB", "OKB", "CRO", "FTT", "LEO",
                        "BINANCE COIN", "CRONOS", "UNUS SED LEO"],
    "meme":           ["DOGE", "SHIB", "PEPE", "FLOKI", "BONK", "WIF",
                        "DOGECOIN", "SHIBA INU", "BOOK OF MEME", "OFFICIAL TRUMP",
                        "PUDGY PENGUINS"],
    "gaming_nft":     ["AXS", "SAND", "MANA", "ENJ", "GALA", "IMX",
                        "AXIE INFINITY", "THE SANDBOX", "DECENTRALAND",
                        "ENJIN COIN", "IMMUTABLE X"],
    "storage":        ["FIL", "AR", "STORJ", "FILECOIN", "ARWEAVE"],
    "oracle":         ["LINK", "BAND", "API3", "CHAINLINK", "BAND PROTOCOL"],
    "layer2":         ["MATIC", "ARB", "OP", "STRK", "ZK",
                        "POLYGON", "ARBITRUM", "OPTIMISM", "STARKNET"],
    "fan_token":      ["PORTO", "BAR", "PSG", "JUV", "ACM", "CHZ",
                        "FC PORTO FAN TOKEN", "FC BARCELONA FAN TOKEN",
                        "PARIS SAINT-GERMAIN FAN TOKEN", "JUVENTUS FAN TOKEN",
                        "AC MILAN FAN TOKEN", "CHILIZ"],
}

# Nombre d'assets core / satellite par profil
CORE_SATELLITE_CONFIG = {
    "Modéré": {
        "n_core": 2,
        "n_satellite": 2,
        "core_pct": 0.65,
        "max_per_cat_core": 1,
        "max_per_cat_total": 2,
    },
    "Agressif": {
        "n_core": 2,
        "n_satellite": 3,
        "core_pct": 0.55,
        "max_per_cat_core": 1,
        "max_per_cat_total": 2,
    },
}


# =============================================================================
# HELPERS
# =============================================================================

def _to_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")

def _get_vol(row: pd.Series) -> float:
    vol_30d = row.get("vol_30d_annual_pct")
    vol_7d = row.get("vol_7d_annual_pct")
    if pd.notna(vol_30d) and vol_30d > 0:
        return float(vol_30d)
    if pd.notna(vol_7d) and vol_7d > 0:
        return float(vol_7d)
    return np.nan

def _get_currency_base(row: pd.Series) -> str:
    base = row.get("currency_base")
    if pd.notna(base) and base:
        return str(base).upper().strip()
    symbol = row.get("symbol")
    if pd.notna(symbol) and symbol:
        return str(symbol).split("/")[0].upper().strip()
    return ""

def _get_category(currency_base: str) -> str:
    cb = currency_base.upper().strip()
    for category, members in CRYPTO_CATEGORIES.items():
        if cb in [m.upper() for m in members]:
            return category
    return "other"

def _rank_percentile(series: pd.Series, higher_is_better: bool = True) -> pd.Series:
    ranked = series.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5)

def _normalize_score(score: pd.Series, min_val: float = 0, max_val: float = 100) -> pd.Series:
    score = score.fillna(0)
    s_min, s_max = score.min(), score.max()
    if s_max - s_min < 1e-8:
        return pd.Series(50.0, index=score.index)
    normalized = (score - s_min) / (s_max - s_min)
    return min_val + normalized * (max_val - min_val)


# =============================================================================
# ÉTAPE 0: DATA QUALITY
# =============================================================================

def apply_data_qc_filters(df: pd.DataFrame) -> pd.DataFrame:
    """
    Couche 0: Filtres qualité données (communs à tous profils).
    """
    if df.empty:
        return df

    mask = pd.Series(True, index=df.index)

    # Exclure stablecoins
    if "currency_base" in df.columns:
        base_upper = df["currency_base"].fillna("").str.upper().str.strip()
        is_stable = base_upper.isin(STABLECOINS)
        mask &= ~is_stable
        excluded_count = is_stable.sum()
        if excluded_count > 0:
            logger.debug(f"[Crypto QC] Exclusion {excluded_count} stablecoins")

    # v2.0.2: Exclure blacklist (risque reputationnel/reglementaire)
    if "currency_base" in df.columns:
        base_bl = df["currency_base"].fillna("").str.upper().str.strip()
        is_blacklisted = base_bl.isin(CRYPTO_BLACKLIST)
        mask &= ~is_blacklisted
        bl_count = is_blacklisted.sum()
        if bl_count > 0:
            bl_names = base_bl[is_blacklisted].unique().tolist()
            logger.info(f"[Crypto QC] 🚫 Blacklist: {bl_count} exclus ({bl_names})")

    if "symbol" in df.columns:
        symbol_upper = df["symbol"].fillna("").str.upper()
        for sc in STABLECOINS:
            mask &= ~symbol_upper.str.startswith(sc + "/")

    # tier1_listed
    if "tier1_listed" in df.columns:
        tier1 = df["tier1_listed"]
        mask &= tier1.apply(
            lambda x: str(x).strip().lower() in ("true", "1", "yes")
        ) | tier1.isna()

    # stale
    if "stale" in df.columns:
        stale = df["stale"]
        mask &= stale.apply(
            lambda x: str(x).strip().lower() in ("false", "0", "no")
        ) | stale.isna()

    # coverage_ratio
    if "coverage_ratio" in df.columns:
        coverage = _to_numeric(df["coverage_ratio"])
        mask &= (coverage >= MIN_COVERAGE_RATIO) | coverage.isna()

    # enough_history_90d
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
    """
    if df.empty:
        return df

    filters = PROFILE_HARD_FILTERS.get(profile, {})

    if filters.get("excluded", False):
        logger.info(
            f"[Crypto {profile}] EXCLUSION TOTALE — "
            f"crypto non compatible avec profil Stable"
        )
        return pd.DataFrame(columns=df.columns)

    mask = pd.Series(True, index=df.index)

    # Paires fiat uniquement
    FIAT_QUOTES = {"USD", "US DOLLAR", "EUR", "EURO", "GBP", "BRITISH POUND",
                   "CHF", "SWISS FRANC", "JPY", "JAPANESE YEN", "CAD", "CANADIAN DOLLAR",
                   "AUD", "AUSTRALIAN DOLLAR"}
    if filters.get("usd_pairs_only", False):
        if "currency_quote" in df.columns:
            quote = df["currency_quote"].fillna("").str.upper().str.strip()
            fiat_mask = quote.isin(FIAT_QUOTES)
            mask &= fiat_mask
        elif "symbol" in df.columns:
            sym = df["symbol"].fillna("")
            mask &= sym.str.contains("/USD|/EUR|/GBP|/CHF|/JPY", case=False, regex=True)

    # Volatilité max
    vol_max = filters.get("vol_30d_max")
    if vol_max is not None:
        vol_col = df.apply(_get_vol, axis=1)
        mask &= (vol_col <= vol_max) | vol_col.isna()

    # Drawdown max
    dd_max = filters.get("drawdown_90d_max")
    if dd_max is not None and "drawdown_90d_pct" in df.columns:
        dd = _to_numeric(df["drawdown_90d_pct"])
        mask &= (dd >= dd_max) | dd.isna()

    # Historique 1 an requis
    if filters.get("require_history_1y", False):
        if "enough_history_1y" in df.columns:
            hist1y = df["enough_history_1y"]
            mask &= hist1y.apply(
                lambda x: str(x).strip().lower() in ("true", "1", "yes")
            ) | hist1y.isna()
        elif "data_points" in df.columns:
            dp = _to_numeric(df["data_points"])
            mask &= (dp >= 365) | dp.isna()

    # Exclure suspects
    if "ret_1y_suspect" in df.columns:
        suspect = df["ret_1y_suspect"]
        mask &= suspect.apply(
            lambda x: str(x).strip().lower() in ("false", "0", "no")
        ) | suspect.isna()

    # Debug si tout rejeté
    if mask.sum() == 0 and len(df) > 0:
        logger.warning(f"[Crypto {profile}] ⚠️ ALL {len(df)} assets rejected by hard filters")

    filtered = df[mask].copy()
    logger.info(
        f"[Crypto {profile}] Hard filters: {len(df)} → {len(filtered)} "
        f"({len(df) - len(filtered)} exclus)"
    )

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
    """
    if df.empty:
        return df

    weights = PROFILE_SCORING_WEIGHTS.get(profile, {})
    if not weights:
        return df

    metrics = pd.DataFrame(index=df.index)

    if "sharpe_ratio" in df.columns:
        metrics["sharpe_ratio"] = _to_numeric(df["sharpe_ratio"])
    else:
        metrics["sharpe_ratio"] = np.nan

    if "ret_90d_pct" in df.columns:
        metrics["ret_90d"] = _to_numeric(df["ret_90d_pct"])
    else:
        metrics["ret_90d"] = np.nan

    if "ret_1y_pct" in df.columns:
        metrics["ret_1y"] = _to_numeric(df["ret_1y_pct"])
    else:
        metrics["ret_1y"] = np.nan

    metrics["vol"] = df.apply(_get_vol, axis=1)

    if "drawdown_90d_pct" in df.columns:
        metrics["dd"] = _to_numeric(df["drawdown_90d_pct"]).abs()
    else:
        metrics["dd"] = np.nan

    # v2.0.1: Discount Sharpe for short-history tokens
    SHARPE_SHORT_HISTORY_THRESHOLD = 365
    SHARPE_HIGH_THRESHOLD = 2.0
    SHARPE_DISCOUNT_FACTOR = 0.7

    if "data_points" in df.columns:
        dp = _to_numeric(df["data_points"]).fillna(0)
        short_hist = dp < SHARPE_SHORT_HISTORY_THRESHOLD
        high_sharpe = metrics["sharpe_ratio"] > SHARPE_HIGH_THRESHOLD
        discount_mask = short_hist & high_sharpe

        n_discounted = discount_mask.sum()
        if n_discounted > 0:
            metrics.loc[discount_mask, "sharpe_ratio"] *= SHARPE_DISCOUNT_FACTOR
            for idx_d in df[discount_mask].index:
                base = _get_currency_base(df.loc[idx_d])
                orig = metrics.loc[idx_d, "sharpe_ratio"] / SHARPE_DISCOUNT_FACTOR
                disc = metrics.loc[idx_d, "sharpe_ratio"]
                logger.info(
                    f"[Crypto {profile}] 📉 Sharpe discount: {base} "
                    f"{orig:.2f}→{disc:.2f} (data_points={int(dp.loc[idx_d])})"
                )

    scores = pd.DataFrame(index=df.index)
    scores["sharpe_ratio"] = _rank_percentile(metrics["sharpe_ratio"], higher_is_better=True)
    scores["ret_90d"]      = _rank_percentile(metrics["ret_90d"], higher_is_better=True)
    scores["ret_1y"]       = _rank_percentile(metrics["ret_1y"], higher_is_better=True)
    scores["vol_penalty"]  = _rank_percentile(metrics["vol"], higher_is_better=False)
    scores["dd_penalty"]   = _rank_percentile(metrics["dd"], higher_is_better=False)

    total_score = pd.Series(0.0, index=df.index)
    total_abs_weight = 0.0

    for component, weight in weights.items():
        if component in scores.columns:
            total_score += scores[component] * abs(weight)
            total_abs_weight += abs(weight)

    if total_abs_weight > 0:
        total_score /= total_abs_weight

    df = df.copy()
    df["_profile_score"] = _normalize_score(total_score, 0, 100).round(2)
    df["_preset_profile"] = profile
    df["_asset_class"] = "crypto"

    df["_crypto_category"] = df.apply(
        lambda row: _get_category(_get_currency_base(row)), axis=1
    )

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

def select_with_diversity(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Étape ③+④: Sélection core/satellite avec contraintes de diversification.
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

    df_sorted = df.sort_values("_profile_score", ascending=False).copy()

    selected_indices = []
    selected_roles = {}
    category_count_core = {}
    category_count_total = {}

    # Phase 1: CORE
    for idx, row in df_sorted.iterrows():
        if len([i for i in selected_indices if selected_roles.get(i) == "core"]) >= n_core:
            break

        cat = row.get("_crypto_category", "other")

        if cat in ("other", "fan_token"):
            continue

        if category_count_core.get(cat, 0) >= max_per_cat_core:
            continue

        selected_indices.append(idx)
        selected_roles[idx] = "core"
        category_count_core[cat] = category_count_core.get(cat, 0) + 1
        category_count_total[cat] = category_count_total.get(cat, 0) + 1

        base = _get_currency_base(row)
        logger.debug(f"[Crypto {profile}] CORE: {base} (cat={cat}, score={row['_profile_score']:.1f})")

    # Phase 2: SATELLITE
    for idx, row in df_sorted.iterrows():
        if idx in selected_indices:
            continue

        n_sat_selected = len([i for i in selected_indices if selected_roles.get(i) == "satellite"])
        if n_sat_selected >= n_satellite:
            break

        cat = row.get("_crypto_category", "other")

        if category_count_total.get(cat, 0) >= max_per_cat_total:
            continue

        selected_indices.append(idx)
        selected_roles[idx] = "satellite"
        category_count_total[cat] = category_count_total.get(cat, 0) + 1

        base = _get_currency_base(row)
        logger.debug(f"[Crypto {profile}] SATELLITE: {base} (cat={cat}, score={row['_profile_score']:.1f})")

    if not selected_indices:
        logger.warning(f"[Crypto {profile}] Aucun asset sélectionné après diversification")
        return pd.DataFrame(columns=df.columns)

    result = df_sorted.loc[selected_indices].copy()
    result["_role"] = result.index.map(selected_roles)

    result["_role_order"] = result["_role"].map({"core": 0, "satellite": 1})
    result = result.sort_values(
        ["_role_order", "_profile_score"],
        ascending=[True, False]
    ).drop(columns=["_role_order"])

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
# DÉDUPLICATION PAIRES
# =============================================================================

def _deduplicate_pairs(df: pd.DataFrame) -> pd.DataFrame:
    """Déduplique les paires du même asset (BTC/USD et BTC/EUR)."""
    if df.empty or "currency_base" not in df.columns:
        return df

    bases = df.apply(_get_currency_base, axis=1)
    df = df.copy()
    df["_base_dedup"] = bases

    best_indices = []
    for base, group in df.groupby("_base_dedup"):
        if len(group) == 1:
            best_indices.append(group.index[0])
        else:
            usd_rows = group[
                group["symbol"].fillna("").str.contains("/USD", case=False)
            ]
            if not usd_rows.empty:
                if "data_points" in group.columns:
                    dp_vals = _to_numeric(usd_rows["data_points"]).fillna(0)
                    best_indices.append(usd_rows.index[dp_vals.values.argmax()])
                else:
                    best_indices.append(usd_rows.index[0])
            else:
                best_indices.append(group.index[0])

    result = df.loc[best_indices].drop(columns=["_base_dedup"])
    if len(result) < len(df):
        logger.info(f"[Crypto] Après dédup paires: {len(df)} → {len(result)}")
    return result


# =============================================================================
# FONCTION PRINCIPALE
# =============================================================================

def select_crypto_for_profile(
    df: pd.DataFrame,
    profile: str,
    top_n: Optional[int] = None
) -> pd.DataFrame:
    """
    Sélectionne les cryptomonnaies pour un profil donné.
    API identique à v1.3.0.
    """
    valid_profiles = list(PROFILE_HARD_FILTERS.keys())
    if profile not in valid_profiles:
        raise ValueError(f"Profil inconnu: {profile}. Valides: {valid_profiles}")

    logger.info(
        f"[Crypto v{VERSION}] Sélection pour profil {profile} "
        f"— Univers initial: {len(df)}"
    )

    df_clean = apply_data_qc_filters(df)
    df_dedup = _deduplicate_pairs(df_clean)
    if len(df_dedup) < len(df_clean):
        logger.info(f"[Crypto] Après dédup paires: {len(df_clean)} → {len(df_dedup)}")

    df_filtered = apply_hard_filters(df_dedup, profile)

    if df_filtered.empty:
        logger.info(
            f"[Crypto {profile}] Sélection finale: 0 cryptos "
            f"(exclusion ou filtres stricts)"
        )
        return df_filtered

    df_scored = compute_profile_score(df_filtered, profile)
    df_selected = select_with_diversity(df_scored, profile)

    if top_n and len(df_selected) > top_n:
        df_selected = df_selected.head(top_n)

    logger.info(f"[Crypto {profile}] Sélection finale: {len(df_selected)} cryptos")

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
# UTILITIES
# =============================================================================

def get_crypto_preset_summary() -> Dict[str, Any]:
    """Retourne un résumé des presets Crypto v2.0.2."""
    return {
        "version": VERSION,
        "pipeline": "4-stage: QC → hard_filters → scoring → diversification",
        "stablecoins_excluded": sorted(STABLECOINS),
        "blacklisted": sorted(CRYPTO_BLACKLIST),
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
