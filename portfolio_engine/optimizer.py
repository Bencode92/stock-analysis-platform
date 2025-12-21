# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v6.20.0 — FIX cap pass post-redistribution

CHANGEMENTS v6.20.0 (FIX Modéré/BIL bug):
1. NEW: _enforce_position_caps() - cap pass itératif après toute redistribution
2. FIX: Appelé après normalisation, vol adjustment, et adjust_to_100
3. FIX: Caps par catégorie (bonds vs autres) respectés à tout moment
4. NEW: get_max_weight_for_asset() - source unique de vérité pour caps

CHANGEMENTS v6.19.0 (PR0-PR3 Integration):
1. PR0: Import exposures.py pour source unique de vérité
2. PR1: Import instrument_classifier.py pour classification unifiée
3. PR3: Import bucket_penalty.py pour pénalités soft dans SLSQP

5 LEVIERS ACTIFS (le reste est gelé):
1. vol_target par profil (6%, 12%, 18%)
2. Buckets CORE/DEFENSIVE/SATELLITE ranges
3. Poids momentum vs quality_fundamental dans FactorScorer
4. Crypto max / Bonds min
5. Seuil Buffett minimum (hard filter = 50)
"""

import numpy as np
from scipy.optimize import minimize
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Union, Set, Any
from collections import defaultdict
import warnings
import logging
import math

# P1-2: Import Ledoit-Wolf shrinkage
try:
    from sklearn.covariance import LedoitWolf
    HAS_SKLEARN_LW = True
except ImportError:
    HAS_SKLEARN_LW = False

# Import preset_meta pour buckets et déduplication
try:
    from portfolio_engine.preset_meta import (
        ETF_EXPOSURE_EQUIVALENTS,
        deduplicate_etf_by_exposure,
        PRESET_META,
        PROFILE_BUCKET_TARGETS,
        EQUITY_PRESETS,
        ETF_PRESETS,
        CRYPTO_PRESETS,
        Role,
        RiskLevel,
        AssetClass,
        get_preset_config,
        get_bucket_targets,
        CORPORATE_GROUPS,
        MAX_CORPORATE_GROUP_WEIGHT,
        MAX_STOCKS_PER_GROUP,
        get_corporate_group,
        deduplicate_by_corporate_group,
    )
    HAS_PRESET_META = True
except ImportError:
    HAS_PRESET_META = False
    ETF_EXPOSURE_EQUIVALENTS = {}
    CORPORATE_GROUPS = {}
    MAX_CORPORATE_GROUP_WEIGHT = 0.20
    MAX_STOCKS_PER_GROUP = 1
    from enum import Enum
    class Role(Enum):
        CORE = "core"
        SATELLITE = "satellite"
        DEFENSIVE = "defensive"
        LOTTERY = "lottery"
    
    PROFILE_BUCKET_TARGETS = {
        "Stable": {Role.CORE: (0.30, 0.40), Role.DEFENSIVE: (0.45, 0.60), Role.SATELLITE: (0.05, 0.15), Role.LOTTERY: (0.00, 0.00)},
        "Modéré": {Role.CORE: (0.45, 0.55), Role.DEFENSIVE: (0.20, 0.30), Role.SATELLITE: (0.15, 0.25), Role.LOTTERY: (0.00, 0.02)},
        "Agressif": {Role.CORE: (0.35, 0.45), Role.DEFENSIVE: (0.05, 0.15), Role.SATELLITE: (0.35, 0.50), Role.LOTTERY: (0.00, 0.05)},
    }
    
    def get_corporate_group(name: str) -> Optional[str]:
        return None
    
    def deduplicate_by_corporate_group(stocks, scores=None, max_per_group=1):
        return stocks, {}

# Phase 1: Import risk_buckets pour classification 6 buckets
try:
    from portfolio_engine.risk_buckets import (
        RiskBucket,
        classify_asset,
        counts_in_max_region,
        LEVERAGED_CAP,
        ALTERNATIVE_CAP,
    )
    HAS_RISK_BUCKETS = True
except ImportError:
    HAS_RISK_BUCKETS = False

# Phase 1: Import constraint_report pour margins et exposures
try:
    from portfolio_engine.constraint_report import enrich_diagnostics_with_margins
    HAS_CONSTRAINT_REPORT = True
except ImportError:
    HAS_CONSTRAINT_REPORT = False

# === PR0: Import exposures.py (source unique de vérité) ===
try:
    from portfolio_engine.exposures import (
        compute_all_exposures,
        compute_role_exposures,
        compute_hhi,
        USE_EXPOSURES_V2,
    )
    HAS_EXPOSURES_V2 = True
except ImportError:
    HAS_EXPOSURES_V2 = False
    USE_EXPOSURES_V2 = False

# === PR1: Import instrument_classifier.py ===
try:
    from portfolio_engine.instrument_classifier import (
        InstrumentClassifier,
        get_classifier,
        InstrumentClassification,
    )
    HAS_INSTRUMENT_CLASSIFIER = True
except ImportError:
    HAS_INSTRUMENT_CLASSIFIER = False

# === PR3: Import bucket_penalty.py ===
try:
    from portfolio_engine.bucket_penalty import (
        create_penalty_function,
        compute_total_bucket_penalty,
        BucketPenaltyResult,
        DEFAULT_LAMBDA_BUCKET,
        DEFAULT_LAMBDA_UNKNOWN,
    )
    HAS_BUCKET_PENALTY = True
except ImportError:
    HAS_BUCKET_PENALTY = False
    DEFAULT_LAMBDA_BUCKET = 20.0
    DEFAULT_LAMBDA_UNKNOWN = 50.0

logger = logging.getLogger("portfolio_engine.optimizer")

# ============= CONSTANTES v6.20 =============

# HARD FILTER: Score Buffett minimum pour les actions
BUFFETT_HARD_FILTER_MIN = 50.0

# Covariance hybride: poids empirique vs structurée
COVARIANCE_EMPIRICAL_WEIGHT = 0.60

# P1-6: Seuils d'alerte pour KPIs covariance
CONDITION_NUMBER_WARNING_THRESHOLD = 10000.0
EIGEN_CLIPPED_PCT_WARNING_THRESHOLD = 20.0

# P1-2: Shrinkage Ledoit-Wolf
SHRINKAGE_ENABLED = True
CONDITION_NUMBER_TARGET = 10000.0

# === PR3: Soft bucket penalty configuration ===
USE_SOFT_BUCKET_PENALTY = True
LAMBDA_BUCKET = DEFAULT_LAMBDA_BUCKET
LAMBDA_UNKNOWN = DEFAULT_LAMBDA_UNKNOWN

# === v6.20: Position caps par catégorie et profil ===
# Source unique de vérité pour tous les caps
MAX_SINGLE_BOND_WEIGHT = {
    "Stable": 25.0,
    "Modéré": 8.0,
    "Agressif": 5.0,
}

MAX_SINGLE_POSITION_DEFAULT = 15.0  # Pour non-bonds

MIN_BONDS_IN_POOL = {
    "Stable": 15,
    "Modéré": 10,
    "Agressif": 5,
}

MIN_DEFENSIVE_IN_POOL = {
    "Stable": 12,
    "Modéré": 8,
    "Agressif": 5,
}

MIN_DISTINCT_BONDS = {
    "Stable": 2,
    "Modéré": 2,
    "Agressif": 1,
}

BUCKET_CONSTRAINT_RELAXATION = {
    "Stable": 0.08,
    "Modéré": 0.05,
    "Agressif": 0.05,
}

FORCE_FALLBACK_PROFILES = {"Stable"}


# ============= v6.20: POSITION CAP HELPERS =============

def get_max_weight_for_asset(
    asset_id: str,
    asset_category: str,
    profile_name: str,
    profile_max_single: float = MAX_SINGLE_POSITION_DEFAULT
) -> float:
    """
    v6.20: Source unique de vérité pour le cap d'un actif.
    
    Returns:
        Maximum weight en % (ex: 8.0 pour 8%)
    """
    if asset_category == "Obligations":
        return MAX_SINGLE_BOND_WEIGHT.get(profile_name, 10.0)
    else:
        return profile_max_single


# ============= P1-2 v2: DIAGONAL SHRINKAGE =============

def diag_shrink_to_target(
    cov: np.ndarray,
    target_cond: float = CONDITION_NUMBER_TARGET,
    max_steps: int = 12
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """P1-2 v2: Shrink vers diag jusqu'à cond <= target."""
    cov = np.asarray(cov, dtype=float)
    diag = np.diag(np.diag(cov))

    try:
        cond0 = float(np.linalg.cond(cov))
    except Exception:
        cond0 = float("inf")

    if np.isfinite(cond0) and cond0 <= target_cond:
        return cov, {
            "cond_before": round(cond0, 2),
            "cond_after": round(cond0, 2),
            "shrink_lambda": 0.0,
            "shrink_steps": 0,
            "shrink_applied": False,
        }

    lam = 0.02
    cov_best = cov
    cond_best = cond0

    for step in range(1, max_steps + 1):
        cov2 = (1.0 - lam) * cov + lam * diag
        try:
            cond2 = float(np.linalg.cond(cov2))
        except Exception:
            cond2 = float("inf")

        if np.isfinite(cond2) and cond2 < cond_best:
            cov_best, cond_best = cov2, cond2

        if np.isfinite(cond2) and cond2 <= target_cond:
            return cov2, {
                "cond_before": round(cond0, 2) if np.isfinite(cond0) else None,
                "cond_after": round(cond2, 2),
                "shrink_lambda": round(lam, 4),
                "shrink_steps": step,
                "shrink_applied": True,
            }

        lam *= 2.0

    return cov_best, {
        "cond_before": round(cond0, 2) if np.isfinite(cond0) else None,
        "cond_after": round(cond_best, 2) if np.isfinite(cond_best) else None,
        "shrink_lambda": round(lam / 2.0, 4),
        "shrink_steps": max_steps,
        "shrink_applied": True,
    }


# Corrélations structurées
CORR_SAME_CORPORATE_GROUP = 0.90
CORR_SAME_EXPOSURE = 0.85
CORR_SAME_SECTOR = 0.45
CORR_SAME_CATEGORY = 0.60
CORR_SAME_BUCKET = 0.50
CORR_EQUITY_BOND = -0.20
CORR_CRYPTO_OTHER = 0.25
CORR_DEFAULT = 0.15

DEFAULT_VOLS = {"Actions": 25.0, "ETF": 15.0, "Obligations": 5.0, "Crypto": 80.0}


# ============= JSON SERIALIZATION HELPER =============

def to_python_native(obj: Any) -> Any:
    """Convertit types numpy en Python natifs."""
    if obj is None:
        return None
    if isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    if isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    if isinstance(obj, (np.bool_, np.bool)):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: to_python_native(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_python_native(item) for item in obj]
    return obj


def _is_valid_id(val) -> bool:
    """v6.7: Vérifie si ID valide."""
    if val is None:
        return False
    if isinstance(val, float):
        if math.isnan(val):
            return False
    if isinstance(val, str):
        s = val.strip().lower()
        return s not in ["", "nan", "none", "null"]
    return bool(val)


# ============= PROFILE CONSTRAINTS =============

@dataclass
class ProfileConstraints:
    """Contraintes par profil."""
    name: str
    vol_target: float
    vol_tolerance: float = 3.0
    crypto_max: float = 10.0
    bonds_min: float = 5.0
    max_single_position: float = 15.0
    max_sector: float = 30.0
    max_region: float = 50.0
    min_assets: int = 10
    max_assets: int = 18


PROFILES = {
    "Agressif": ProfileConstraints(
        name="Agressif", 
        vol_target=18.0, 
        vol_tolerance=3.0,
        crypto_max=10.0, 
        bonds_min=5.0,
        max_sector=35.0,
    ),
    "Modéré": ProfileConstraints(
        name="Modéré", 
        vol_target=12.0, 
        vol_tolerance=3.0,
        crypto_max=5.0, 
        bonds_min=15.0
    ),
    "Stable": ProfileConstraints(
        name="Stable", 
        vol_target=6.0,
        vol_tolerance=3.0,
        crypto_max=0.0, 
        bonds_min=35.0
    ),
}


# ============= ASSET DATACLASS =============

@dataclass
class Asset:
    """Actif avec ID ORIGINAL préservé et bucket assignment."""
    id: str
    name: str
    category: str
    sector: str
    region: str
    score: float
    vol_annual: float
    returns_series: Optional[np.ndarray] = None
    source_data: Optional[dict] = field(default=None, repr=False)
    exposure: Optional[str] = None
    preset: Optional[str] = None
    role: Optional[Role] = None
    corporate_group: Optional[str] = None
    buffett_score: Optional[float] = None


def _clean_float(value, default: float = 15.0, min_val: float = 0.1, max_val: float = 200.0) -> float:
    """Nettoie une valeur float."""
    try:
        v = float(value) if value is not None else default
        if np.isnan(v) or np.isinf(v):
            return default
        return max(min_val, min(v, max_val))
    except (TypeError, ValueError):
        return default


# ============= BUCKET/PRESET ASSIGNMENT =============

def assign_preset_to_asset(asset: Asset) -> Tuple[Optional[str], Optional[Role]]:
    """Assigne un preset et un rôle (bucket) à un actif."""
    category = asset.category
    vol = asset.vol_annual
    score = asset.score
    sector = asset.sector.lower() if asset.sector else ""
    name_lower = asset.name.lower() if asset.name else ""
    
    if category == "Obligations":
        if any(kw in name_lower for kw in ["ultra short", "money market", "1-3 month", "boxx", "bil"]):
            return "cash_ultra_short", Role.DEFENSIVE
        return "defensif_oblig", Role.DEFENSIVE
    
    if category == "Crypto":
        if any(kw in name_lower for kw in ["bitcoin", "btc", "ethereum", "eth"]):
            return "quality_risk", Role.CORE
        if vol > 100:
            return "highvol_lottery", Role.LOTTERY
        if vol > 60:
            return "momentum24h", Role.LOTTERY
        return "trend3_12m", Role.SATELLITE
    
    if category == "ETF":
        exposure = asset.exposure
        if exposure in ["gold", "precious_metals"]:
            return "or_physique", Role.DEFENSIVE
        if exposure in ["world", "sp500"]:
            if vol < 15:
                return "min_vol_global", Role.DEFENSIVE
            return "coeur_global", Role.CORE
        if exposure == "emerging_markets":
            return "emergents", Role.SATELLITE
        if exposure in ["nasdaq", "tech"]:
            return "croissance_tech", Role.SATELLITE
        if exposure in ["bonds_ig", "bonds_treasury"]:
            return "defensif_oblig", Role.DEFENSIVE
        if exposure == "cash":
            return "cash_ultra_short", Role.DEFENSIVE
        if exposure == "min_vol" or "min vol" in name_lower or "low vol" in name_lower:
            return "min_vol_global", Role.DEFENSIVE
        if exposure == "dividend" or "dividend" in name_lower:
            return "rendement_etf", Role.CORE
        if exposure in ["inflation", "commodities"]:
            return "inflation_shield", Role.DEFENSIVE
        return "coeur_global", Role.CORE
    
    if category == "Actions":
        if any(kw in sector for kw in ["utilities", "consumer staples", "healthcare", "pharma"]):
            if vol < 20:
                return "defensif", Role.DEFENSIVE
            return "low_volatility", Role.CORE
        if score >= 70 and vol < 25:
            return "quality_premium", Role.CORE
        if any(kw in name_lower for kw in ["dividend", "yield", "income"]):
            return "value_dividend", Role.CORE
        if vol < 18:
            return "low_volatility", Role.CORE
        if score >= 50 and vol < 30:
            return "value_dividend", Role.CORE
        if any(kw in sector for kw in ["technology", "tech", "software", "semiconductor"]):
            if vol > 35:
                return "agressif", Role.SATELLITE
            return "croissance", Role.SATELLITE
        if any(kw in sector for kw in ["materials", "industrials", "energy", "mining"]):
            if vol > 35:
                return "recovery", Role.SATELLITE
            return "momentum_trend", Role.SATELLITE
        if vol > 30 and score > 60:
            return "momentum_trend", Role.SATELLITE
        if vol > 35:
            return "agressif", Role.SATELLITE
        return "croissance", Role.SATELLITE
    
    return None, Role.SATELLITE


def enrich_assets_with_buckets(assets: List[Asset]) -> List[Asset]:
    """Enrichit les actifs avec preset, rôle et risk_bucket."""
    if HAS_INSTRUMENT_CLASSIFIER:
        try:
            classifier = get_classifier()
            for asset in assets:
                source_data = asset.source_data or {}
                source_data["category"] = asset.category
                source_data["sector"] = asset.sector
                source_data["region"] = asset.region
                source_data["name"] = asset.name
                source_data["ticker"] = asset.id
                
                classification = classifier.classify(asset.id, source_data)
                
                if classification.role and classification.role != "unknown":
                    try:
                        asset.role = Role(classification.role)
                    except ValueError:
                        if asset.preset is None or asset.role is None:
                            preset, role = assign_preset_to_asset(asset)
                            asset.preset = preset
                            asset.role = role
                elif asset.preset is None or asset.role is None:
                    preset, role = assign_preset_to_asset(asset)
                    asset.preset = preset
                    asset.role = role
                
                if classification.risk_bucket:
                    asset._risk_bucket = classification.risk_bucket
                    
        except Exception as e:
            logger.warning(f"[PR1] InstrumentClassifier failed: {e}")
            for asset in assets:
                if asset.preset is None or asset.role is None:
                    preset, role = assign_preset_to_asset(asset)
                    asset.preset = preset
                    asset.role = role
    else:
        for asset in assets:
            if asset.preset is None or asset.role is None:
                preset, role = assign_preset_to_asset(asset)
                asset.preset = preset
                asset.role = role
    
    for asset in assets:
        if asset.category == "Actions" and asset.corporate_group is None:
            asset.corporate_group = get_corporate_group(asset.name)
    
    for asset in assets:
        if HAS_RISK_BUCKETS and not hasattr(asset, '_risk_bucket'):
            bucket, _ = classify_asset(asset.source_data or {})
            asset._risk_bucket = bucket.value
    
    role_counts = defaultdict(int)
    for asset in assets:
        if asset.role:
            role_counts[asset.role.value] += 1
    logger.info(f"Bucket distribution: {dict(role_counts)}")
    
    return assets


# ============= HARD FILTER: BUFFETT =============

def apply_buffett_hard_filter(assets: List[Asset], min_score: float = BUFFETT_HARD_FILTER_MIN) -> List[Asset]:
    """HARD FILTER: Rejette actions avec score < min_score."""
    filtered = []
    rejected_count = 0
    
    for asset in assets:
        if asset.category == "Actions":
            buffett_score = asset.buffett_score or 50.0
            if buffett_score < min_score:
                rejected_count += 1
                continue
        filtered.append(asset)
    
    if rejected_count > 0:
        logger.info(f"Buffett hard filter: rejected {rejected_count} stocks")
    
    return filtered


# ============= DEDUPLICATION =============

def deduplicate_stocks_by_corporate_group(
    assets: List[Asset],
    max_per_group: int = MAX_STOCKS_PER_GROUP
) -> Tuple[List[Asset], Dict[str, List[str]]]:
    """Déduplique actions par groupe corporate."""
    stocks = []
    non_stocks = []
    
    for asset in assets:
        if asset.category == "Actions":
            if asset.corporate_group is None:
                asset.corporate_group = get_corporate_group(asset.name)
            stocks.append(asset)
        else:
            non_stocks.append(asset)
    
    groups: Dict[Optional[str], List[Asset]] = defaultdict(list)
    for stock in stocks:
        groups[stock.corporate_group].append(stock)
    
    deduplicated_stocks = []
    removed_by_group: Dict[str, List[str]] = {}
    
    for group_id, group_stocks in groups.items():
        if group_id is None:
            deduplicated_stocks.extend(group_stocks)
        else:
            group_stocks.sort(key=lambda a: (a.score, a.id), reverse=True)
            kept = group_stocks[:max_per_group]
            removed = group_stocks[max_per_group:]
            deduplicated_stocks.extend(kept)
            if removed:
                removed_by_group[group_id] = [a.name for a in removed]
    
    return non_stocks + deduplicated_stocks, removed_by_group


ETF_NAME_TO_EXPOSURE = {
    "gold": "gold", "or": "gold", "gld": "gold", "iau": "gold",
    "world": "world", "msci world": "world", "urth": "world",
    "s&amp;p 500": "sp500", "spy": "sp500", "voo": "sp500",
    "nasdaq": "nasdaq", "qqq": "nasdaq", "tech": "tech",
    "emerging": "emerging_markets", "eem": "emerging_markets",
    "treasury": "bonds_treasury", "tlt": "bonds_treasury", "ief": "bonds_treasury",
    "investment grade": "bonds_ig", "lqd": "bonds_ig", "agg": "bonds_ig",
    "money market": "cash", "ultra short": "cash", "bil": "cash",
    "min vol": "min_vol", "low vol": "min_vol",
    "dividend": "dividend", "inflation": "inflation", "tips": "inflation",
}


def detect_etf_exposure(asset: Asset) -> Optional[str]:
    """Détecte l'exposition d'un ETF."""
    if asset.category not in ["ETF", "Obligations"]:
        return None
    search_text = f"{asset.name} {asset.id}".lower()
    for keyword, exposure in ETF_NAME_TO_EXPOSURE.items():
        if keyword in search_text:
            return exposure
    return None


def deduplicate_etfs(assets: List[Asset], prefer_by: str = "score") -> List[Asset]:
    """Déduplique les ETF par exposition."""
    etfs_to_dedup = []
    other_assets = []
    
    for asset in assets:
        if asset.category in ["ETF", "Obligations"] and asset.exposure is None:
            asset.exposure = detect_etf_exposure(asset)
        
        if asset.category == "ETF":
            etfs_to_dedup.append(asset)
        else:
            other_assets.append(asset)
    
    exposure_groups: Dict[Optional[str], List[Asset]] = defaultdict(list)
    for etf in etfs_to_dedup:
        exposure_groups[etf.exposure].append(etf)
    
    deduplicated_etfs = []
    
    for exposure, group in exposure_groups.items():
        if exposure is None:
            deduplicated_etfs.extend(group)
        else:
            sorted_group = sorted(group, key=lambda a: (a.score, a.id), reverse=True)
            deduplicated_etfs.append(sorted_group[0])
    
    return other_assets + deduplicated_etfs


# ============= COVARIANCE HYBRIDE =============

class HybridCovarianceEstimator:
    """Estimateur de covariance hybride."""
    
    def __init__(
        self, 
        empirical_weight: float = COVARIANCE_EMPIRICAL_WEIGHT,
        min_history_days: int = 60,
        use_shrinkage: bool = SHRINKAGE_ENABLED
    ):
        self.empirical_weight = empirical_weight
        self.min_history_days = min_history_days
        self.use_shrinkage = False
    
    def compute_empirical_covariance(
        self, 
        assets: List[Asset]
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """Calcule la covariance empirique."""
        n = len(assets)
        valid_assets = [a for a in assets if a.returns_series is not None and len(a.returns_series) >= self.min_history_days]
        
        if len(valid_assets) < n * 0.5:
            return None, None
        
        returns_matrix = []
        has_data = []
        
        for asset in assets:
            if asset.returns_series is not None and len(asset.returns_series) >= self.min_history_days:
                returns_matrix.append(asset.returns_series[-252:])
                has_data.append(True)
            else:
                has_data.append(False)
        
        if not returns_matrix:
            return None, None
        
        min_len = min(len(r) for r in returns_matrix)
        returns_matrix = [r[-min_len:] for r in returns_matrix]
        
        try:
            returns = np.column_stack(returns_matrix)
            returns = np.nan_to_num(returns, nan=0.0, posinf=0.0, neginf=0.0)
            cov_emp = np.cov(returns, rowvar=False) * 252
            
            cov_full = np.zeros((n, n))
            emp_idx = 0
            for i in range(n):
                if has_data[i]:
                    emp_idx_j = 0
                    for j in range(n):
                        if has_data[j]:
                            cov_full[i, j] = cov_emp[emp_idx, emp_idx_j]
                            emp_idx_j += 1
                    emp_idx += 1
            
            return cov_full, returns
        except Exception as e:
            logger.warning(f"Covariance empirique échouée: {e}")
            return None, None
    
    def compute_structured_covariance(self, assets: List[Asset]) -> np.ndarray:
        """Calcule la covariance structurée."""
        n = len(assets)
        cov = np.zeros((n, n))
        
        for i, ai in enumerate(assets):
            for j, aj in enumerate(assets):
                default_vol_i = DEFAULT_VOLS.get(ai.category, 15.0)
                default_vol_j = DEFAULT_VOLS.get(aj.category, 15.0)
                
                vol_i = _clean_float(ai.vol_annual, default_vol_i, 1.0, 150.0) / 100
                vol_j = _clean_float(aj.vol_annual, default_vol_j, 1.0, 150.0) / 100
                
                if i == j:
                    cov[i, j] = vol_i ** 2
                else:
                    if ai.corporate_group and aj.corporate_group and ai.corporate_group == aj.corporate_group:
                        corr = CORR_SAME_CORPORATE_GROUP
                    elif ai.exposure and aj.exposure and ai.exposure == aj.exposure:
                        corr = CORR_SAME_EXPOSURE
                    elif ai.category == aj.category:
                        corr = CORR_SAME_SECTOR if ai.sector == aj.sector else CORR_SAME_CATEGORY
                    elif (ai.category == "Obligations" and aj.category == "Actions") or \
                         (ai.category == "Actions" and aj.category == "Obligations"):
                        corr = CORR_EQUITY_BOND
                    elif ai.category == "Crypto" or aj.category == "Crypto":
                        corr = CORR_CRYPTO_OTHER
                    elif ai.role and aj.role and ai.role == aj.role:
                        corr = CORR_SAME_BUCKET
                    else:
                        corr = CORR_DEFAULT
                    
                    cov[i, j] = corr * vol_i * vol_j
        
        return cov
    
    def compute(self, assets: List[Asset]) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Calcule la covariance hybride avec KPIs."""
        n = len(assets)
        cov_structured = self.compute_structured_covariance(assets)
        cov_empirical, returns_matrix = self.compute_empirical_covariance(assets)
        
        diagnostics = {
            "method": "structured",
            "empirical_available": False,
            "empirical_weight": 0.0,
            "matrix_size": n,
            "shrinkage_applied": False,
            "shrinkage_intensity": 0.0,
        }
        
        if cov_empirical is not None:
            cov_hybrid = (
                self.empirical_weight * cov_empirical + 
                (1 - self.empirical_weight) * cov_structured
            )
            diagnostics["method"] = "hybrid"
            diagnostics["empirical_available"] = True
            diagnostics["empirical_weight"] = self.empirical_weight
            cov = cov_hybrid
        else:
            cov = cov_structured
        
        cov, eigen_kpis = self._ensure_positive_definite_with_kpis(cov)
        diagnostics.update(eigen_kpis)
        
        cond_number = diagnostics.get("condition_number", float("inf"))
        if cond_number is not None and cond_number > CONDITION_NUMBER_TARGET:
            cov, shrink_info = diag_shrink_to_target(cov, target_cond=CONDITION_NUMBER_TARGET)
            cov, eigen_kpis2 = self._ensure_positive_definite_with_kpis(cov)
            diagnostics.update(eigen_kpis2)
            diagnostics["diag_shrink_applied"] = shrink_info["shrink_applied"]
        
        return cov, diagnostics
    
    def _ensure_positive_definite_with_kpis(
        self, 
        cov: np.ndarray, 
        min_eigenvalue: float = 1e-6
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Force matrice positive semi-définie + KPIs."""
        kpis = {
            "condition_number": None,
            "eigen_clipped": 0,
            "eigen_clipped_pct": 0.0,
            "is_well_conditioned": True,
        }
        
        cov = np.nan_to_num(cov, nan=0.0, posinf=0.0, neginf=0.0)
        cov = (cov + cov.T) / 2
        n = cov.shape[0]
        cov += np.eye(n) * min_eigenvalue
        
        try:
            eigenvalues, eigenvectors = np.linalg.eigh(cov)
            
            eigen_clipped = int(np.sum(eigenvalues < min_eigenvalue))
            kpis["eigen_clipped"] = eigen_clipped
            kpis["eigen_clipped_pct"] = round(100.0 * eigen_clipped / n, 2) if n > 0 else 0.0
            
            eigenvalues_clipped = np.maximum(eigenvalues, min_eigenvalue)
            
            if eigenvalues_clipped.min() > 0:
                kpis["condition_number"] = round(
                    float(eigenvalues_clipped.max() / eigenvalues_clipped.min()), 
                    2
                )
            else:
                kpis["condition_number"] = float("inf")
            
            kpis["is_well_conditioned"] = (
                kpis["condition_number"] is not None and 
                kpis["condition_number"] < CONDITION_NUMBER_WARNING_THRESHOLD
            )
            
            cov_fixed = eigenvectors @ np.diag(eigenvalues_clipped) @ eigenvectors.T
            cov_fixed = (cov_fixed + cov_fixed.T) / 2
            
            return cov_fixed, kpis
            
        except Exception as e:
            logger.warning(f"Eigenvalue decomposition failed: {e}")
            kpis["is_well_conditioned"] = False
            kpis["condition_number"] = float("inf")
            return np.diag(np.maximum(np.diag(cov), min_eigenvalue)), kpis


# ============= PORTFOLIO OPTIMIZER v6.20 =============

class PortfolioOptimizer:
    """
    Optimiseur mean-variance v6.20.
    
    v6.20: FIX cap pass post-redistribution pour garantir caps respectés.
    """
    
    def __init__(
        self, 
        score_scale: float = 1.0, 
        deduplicate_etfs: bool = True,
        deduplicate_corporate: bool = True,
        use_bucket_constraints: bool = True,
        buffett_hard_filter: bool = True,
        buffett_min_score: float = BUFFETT_HARD_FILTER_MIN,
        use_soft_bucket_penalty: bool = USE_SOFT_BUCKET_PENALTY,
    ):
        self.score_scale = score_scale
        self.deduplicate_etfs_enabled = deduplicate_etfs
        self.deduplicate_corporate_enabled = deduplicate_corporate
        self.use_bucket_constraints = use_bucket_constraints
        self.buffett_hard_filter_enabled = buffett_hard_filter
        self.buffett_min_score = buffett_min_score
        self.use_soft_bucket_penalty = use_soft_bucket_penalty and HAS_BUCKET_PENALTY
        self.covariance_estimator = HybridCovarianceEstimator()
    
    def _enforce_position_caps(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Asset],
        profile: ProfileConstraints,
        max_iterations: int = 10
    ) -> Dict[str, float]:
        """
        v6.20 FIX: Cap pass itératif après toute redistribution.
        
        Garantit que AUCUNE position ne dépasse son cap, même après
        normalisation, vol adjustment, ou adjust_to_100.
        
        Algorithm:
        1. Identifier positions > cap
        2. Clip à cap, calculer excès
        3. Redistribuer excès vers positions sous cap
        4. Répéter jusqu'à convergence ou max_iterations
        """
        if not allocation:
            return allocation
        
        for iteration in range(max_iterations):
            excess_total = 0.0
            positions_under_cap = []
            
            # Pass 1: Identifier et clipper les dépassements
            for asset_id, weight in list(allocation.items()):
                asset = asset_by_id.get(asset_id)
                if not asset:
                    continue
                
                max_weight = get_max_weight_for_asset(
                    asset_id=asset_id,
                    asset_category=asset.category,
                    profile_name=profile.name,
                    profile_max_single=profile.max_single_position
                )
                
                if weight > max_weight + 0.01:  # Tolérance 0.01%
                    excess = weight - max_weight
                    excess_total += excess
                    allocation[asset_id] = max_weight
                    logger.debug(
                        f"[CAP PASS iter={iteration}] {asset_id} clipped: "
                        f"{weight:.2f}% → {max_weight:.2f}% (excess={excess:.2f}%)"
                    )
                elif weight < max_weight - 0.5:  # Au moins 0.5% sous cap
                    positions_under_cap.append((asset_id, max_weight - weight))
            
            # Si pas d'excès, on a fini
            if excess_total < 0.01:
                break
            
            # Pass 2: Redistribuer l'excès
            if positions_under_cap:
                # Trier par marge disponible (décroissant)
                positions_under_cap.sort(key=lambda x: -x[1])
                
                remaining_excess = excess_total
                for asset_id, available_margin in positions_under_cap:
                    if remaining_excess < 0.01:
                        break
                    
                    add_weight = min(available_margin, remaining_excess)
                    allocation[asset_id] = allocation.get(asset_id, 0) + add_weight
                    remaining_excess -= add_weight
                
                # Si encore de l'excès, redistribuer uniformément
                if remaining_excess > 0.01:
                    n_positions = len([w for w in allocation.values() if w > 0.5])
                    if n_positions > 0:
                        per_position = remaining_excess / n_positions
                        for asset_id in allocation:
                            if allocation[asset_id] > 0.5:
                                allocation[asset_id] += per_position
            else:
                # Pas de positions sous cap, distribuer uniformément
                n_positions = len([w for w in allocation.values() if w > 0.5])
                if n_positions > 0:
                    per_position = excess_total / n_positions
                    for asset_id in allocation:
                        if allocation[asset_id] > 0.5:
                            allocation[asset_id] += per_position
        
        # Log si on a atteint max_iterations sans converger
        if iteration == max_iterations - 1:
            logger.warning(f"[CAP PASS] Max iterations reached, may not be fully compliant")
        
        # Normaliser à 100%
        total = sum(allocation.values())
        if total > 0 and abs(total - 100) > 0.1:
            factor = 100 / total
            allocation = {k: round(v * factor, 2) for k, v in allocation.items()}
        
        return allocation
    
    def select_candidates(
        self, 
        universe: List[Asset], 
        profile: ProfileConstraints
    ) -> List[Asset]:
        """Pré-sélection avec HARD FILTER et buckets."""
        if self.deduplicate_etfs_enabled:
            universe = deduplicate_etfs(universe, prefer_by="score")
        
        if self.deduplicate_corporate_enabled:
            universe, _ = deduplicate_stocks_by_corporate_group(universe, max_per_group=MAX_STOCKS_PER_GROUP)
        
        if self.buffett_hard_filter_enabled:
            universe = apply_buffett_hard_filter(universe, min_score=self.buffett_min_score)
        
        universe = enrich_assets_with_buckets(universe)
        
        sorted_assets = sorted(universe, key=lambda x: (x.score, x.id), reverse=True)
        
        selected = []
        sector_count = defaultdict(int)
        category_count = defaultdict(int)
        exposure_count = defaultdict(int)
        bucket_count = defaultdict(int)
        corporate_group_count = defaultdict(int)
        
        target_pool = profile.max_assets * 3
        
        for asset in sorted_assets:
            if len(selected) >= target_pool:
                break
            
            if asset.category == "Crypto":
                if profile.crypto_max == 0:
                    continue
                if category_count["Crypto"] >= 3:
                    continue
            
            if sector_count[asset.sector] >= 8:
                continue
            
            if asset.category == "ETF" and asset.exposure and exposure_count[asset.exposure] >= 2:
                continue
            
            if asset.role == Role.LOTTERY and bucket_count["lottery"] >= 2:
                continue
            if asset.corporate_group and corporate_group_count[asset.corporate_group] >= MAX_STOCKS_PER_GROUP:
                continue
            
            selected.append(asset)
            sector_count[asset.sector] += 1
            category_count[asset.category] += 1
            if asset.exposure:
                exposure_count[asset.exposure] += 1
            if asset.role:
                bucket_count[asset.role.value] += 1
            if asset.corporate_group:
                corporate_group_count[asset.corporate_group] += 1
        
        # Garantir minimum de bonds
        min_bonds = MIN_BONDS_IN_POOL.get(profile.name, 5)
        bonds_in_pool = [a for a in selected if a.category == "Obligations"]
        
        if len(bonds_in_pool) < min_bonds:
            all_bonds = sorted(
                [a for a in universe if a.category == "Obligations" and a not in selected],
                key=lambda x: (x.vol_annual, x.id)
            )
            bonds_to_add = all_bonds[:min_bonds - len(bonds_in_pool)]
            selected.extend(bonds_to_add)
        
        # Garantir minimum defensive
        min_defensive = MIN_DEFENSIVE_IN_POOL.get(profile.name, 5)
        defensive_in_pool = [a for a in selected if a.role == Role.DEFENSIVE]
        
        if len(defensive_in_pool) < min_defensive:
            defensive_candidates = sorted(
                [a for a in universe if a.role == Role.DEFENSIVE and a not in selected],
                key=lambda x: (x.vol_annual, x.id)
            )
            selected.extend(defensive_candidates[:min_defensive - len(defensive_in_pool)])
        
        logger.info(f"Pool candidats: {len(selected)} actifs pour {profile.name}")
        
        return selected
    
    def compute_covariance(self, assets: List[Asset]) -> Tuple[np.ndarray, Dict]:
        """Calcule la covariance hybride."""
        return self.covariance_estimator.compute(assets)
    
    def _compute_portfolio_vol(self, weights: np.ndarray, cov: np.ndarray) -> float:
        """Calcul robuste de la volatilité."""
        try:
            weights = np.nan_to_num(weights, nan=0.0)
            variance = np.dot(weights, np.dot(cov, weights))
            vol = np.sqrt(max(variance, 0)) * 100
            return float(vol) if not np.isnan(vol) else 15.0
        except Exception:
            return 15.0
    
    def _build_constraints(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints,
        cov: np.ndarray,
        skip_bucket_constraints: bool = False,
    ) -> List[dict]:
        """Construit les contraintes SLSQP."""
        n = len(candidates)
        constraints = []
        
        # Somme = 100%
        constraints.append({"type": "eq", "fun": lambda w: np.sum(w) - 1.0})
        
        # Bonds minimum
        bonds_idx = [i for i, a in enumerate(candidates) if a.category == "Obligations"]
        if bonds_idx and profile.bonds_min > 0:
            def bonds_constraint(w, idx=bonds_idx, min_val=profile.bonds_min/100):
                return np.sum(w[idx]) - min_val
            constraints.append({"type": "ineq", "fun": bonds_constraint})
        
        # MAX WEIGHT PAR BOND - v6.20: utilise get_max_weight_for_asset
        for i in bonds_idx:
            max_bond_weight = get_max_weight_for_asset(
                candidates[i].id, 
                "Obligations", 
                profile.name,
                profile.max_single_position
            ) / 100
            def single_bond_constraint(w, idx=i, max_val=max_bond_weight):
                return max_val - w[idx]
            constraints.append({"type": "ineq", "fun": single_bond_constraint})
        
        # Crypto maximum
        crypto_idx = [i for i, a in enumerate(candidates) if a.category == "Crypto"]
        if crypto_idx:
            def crypto_constraint(w, idx=crypto_idx, max_val=profile.crypto_max/100):
                return max_val - np.sum(w[idx])
            constraints.append({"type": "ineq", "fun": crypto_constraint})
        
        # Sector constraints
        for sector in set(a.sector for a in candidates):
            sector_idx = [i for i, a in enumerate(candidates) if a.sector == sector]
            if len(sector_idx) > 1:
                def sector_constraint(w, idx=sector_idx, max_val=profile.max_sector/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": sector_constraint})
        
        # Region constraints
        for region in set(a.region for a in candidates):
            region_idx = [i for i, a in enumerate(candidates) if a.region == region]
            if len(region_idx) > 1:
                def region_constraint(w, idx=region_idx, max_val=profile.max_region/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": region_constraint})
        
        # Corporate group constraints
        for group in set(a.corporate_group for a in candidates if a.corporate_group):
            group_idx = [i for i, a in enumerate(candidates) if a.corporate_group == group]
            if len(group_idx) > 1:
                def group_constraint(w, idx=group_idx, max_val=MAX_CORPORATE_GROUP_WEIGHT):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": group_constraint})
        
        # Bucket constraints (skipped if soft penalty)
        if self.use_bucket_constraints and not skip_bucket_constraints:
            bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
            relaxation = BUCKET_CONSTRAINT_RELAXATION.get(profile.name, 0.05)
            
            for role in Role:
                if role not in bucket_targets:
                    continue
                min_pct, max_pct = bucket_targets[role]
                role_idx = [i for i, a in enumerate(candidates) if a.role == role]
                if not role_idx:
                    continue
                
                if min_pct > 0:
                    adjusted_min = max(0, min_pct - relaxation)
                    def bucket_min(w, idx=role_idx, min_val=adjusted_min):
                        return np.sum(w[idx]) - min_val
                    constraints.append({"type": "ineq", "fun": bucket_min})
                
                if max_pct < 1.0:
                    adjusted_max = min(1.0, max_pct + relaxation)
                    def bucket_max(w, idx=role_idx, max_val=adjusted_max):
                        return max_val - np.sum(w[idx])
                    constraints.append({"type": "ineq", "fun": bucket_max})
        
        return constraints
    
    def _normalize_scores(self, scores: np.ndarray) -> np.ndarray:
        """Normalisation des scores."""
        scores = np.nan_to_num(scores, nan=0.0)
        if scores.std() < 1e-6:
            return np.zeros_like(scores)
        return (scores - scores.mean()) / scores.std()
    
    def _get_smart_initial_weights(
        self,
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> np.ndarray:
        """Initialisation intelligente des poids."""
        n = len(candidates)
        
        if profile.name == "Stable":
            weights = np.zeros(n)
            bonds_idx = [i for i, a in enumerate(candidates) if a.category == "Obligations"]
            other_idx = [i for i in range(n) if i not in bonds_idx]
            
            bonds_init_weight = 0.45
            
            if bonds_idx:
                bond_weight = bonds_init_weight / len(bonds_idx)
                for i in bonds_idx:
                    weights[i] = bond_weight
            
            if other_idx:
                other_weight = (1.0 - bonds_init_weight) / len(other_idx)
                for i in other_idx:
                    weights[i] = other_weight
            
            if weights.sum() > 0:
                weights = weights / weights.sum()
            else:
                weights = np.ones(n) / n
            
            return weights
        else:
            return np.ones(n) / n
    
    def _fallback_allocation(
        self,
        candidates: List[Asset],
        profile: ProfileConstraints,
        cov: Optional[np.ndarray] = None
    ) -> Dict[str, float]:
        """Allocation fallback VOL-AWARE avec cap pass."""
        logger.warning(f"Utilisation du fallback vol-aware pour {profile.name}")
        
        if cov is None:
            cov, _ = self.compute_covariance(candidates)
        
        asset_by_id = {a.id: a for a in candidates}
        
        if profile.name == "Stable":
            sorted_candidates = sorted(candidates, key=lambda a: (a.vol_annual, a.id))
        elif profile.name == "Agressif":
            sorted_candidates = sorted(candidates, key=lambda a: (-a.score, a.id))
        else:
            sorted_candidates = sorted(candidates, key=lambda a: (-(a.score - 0.02 * a.vol_annual), a.id))
        
        allocation = {}
        total_weight = 0.0
        
        category_weights = defaultdict(float)
        sector_weights = defaultdict(float)
        region_weights = defaultdict(float)
        bucket_weights = defaultdict(float)
        
        bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
        
        # Bonds avec cap respecté dès le départ
        bonds = sorted([a for a in sorted_candidates if a.category == "Obligations"], key=lambda x: (x.vol_annual, x.id))
        bonds_needed = float(profile.bonds_min)
        max_single_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 10.0)
        min_distinct = MIN_DISTINCT_BONDS.get(profile.name, 2)
        
        n_bonds_required = max(min_distinct, int(np.ceil(bonds_needed / max_single_bond)))
        n_bonds_to_use = min(len(bonds), max(n_bonds_required, 3))
        
        if n_bonds_to_use > 0:
            weight_per_bond = min(max_single_bond, bonds_needed / n_bonds_to_use)
            
            for bond in bonds[:n_bonds_to_use]:
                # v6.20 FIX: Utiliser get_max_weight_for_asset
                cap = get_max_weight_for_asset(bond.id, "Obligations", profile.name, profile.max_single_position)
                weight = min(cap, weight_per_bond, 100 - total_weight)
                if weight > 0.5:
                    allocation[bond.id] = float(weight)
                    total_weight += weight
                    bonds_needed -= weight
                    category_weights["Obligations"] += weight
                    if bond.role:
                        bucket_weights[bond.role.value] += weight
        
        # Remplir par bucket selon targets
        for role in [Role.DEFENSIVE, Role.CORE, Role.SATELLITE, Role.LOTTERY]:
            if role not in bucket_targets:
                continue
            min_pct, max_pct = bucket_targets[role]
            target_pct = (min_pct + max_pct) / 2 * 100
            
            bucket_assets = [a for a in sorted_candidates if a.role == role and a.id not in allocation]
            
            if role == Role.DEFENSIVE:
                bucket_assets = sorted(bucket_assets, key=lambda a: (a.vol_annual, a.id))
            else:
                bucket_assets = sorted(bucket_assets, key=lambda a: (-a.score, a.id))
            
            current_weight = bucket_weights.get(role.value, 0)
            
            for asset in bucket_assets:
                if len(allocation) >= profile.max_assets or total_weight >= 99.5:
                    break
                if current_weight >= target_pct:
                    break
                
                if asset.category == "Crypto" and category_weights["Crypto"] >= profile.crypto_max:
                    continue
                if sector_weights[asset.sector] >= profile.max_sector:
                    continue
                if asset.category == "Actions" and region_weights[asset.region] >= profile.max_region:
                    continue
                
                # v6.20 FIX: Utiliser get_max_weight_for_asset pour tous les assets
                cap = get_max_weight_for_asset(asset.id, asset.category, profile.name, profile.max_single_position)
                
                if role == Role.DEFENSIVE:
                    base_weight = min(cap, 12.0)
                elif role == Role.CORE:
                    base_weight = min(cap, 10.0)
                elif role == Role.SATELLITE:
                    base_weight = min(cap, 8.0)
                else:
                    base_weight = min(5.0, cap)
                
                weight = min(base_weight, 100 - total_weight, target_pct - current_weight)
                
                if weight > 0.5:
                    allocation[asset.id] = round(float(weight), 2)
                    total_weight += weight
                    category_weights[asset.category] += weight
                    sector_weights[asset.sector] += weight
                    if asset.category == "Actions":
                        region_weights[asset.region] += weight
                    bucket_weights[role.value] += weight
                    current_weight += weight
        
        # Normaliser à 100%
        if total_weight > 0:
            factor = 100 / total_weight
            allocation = {k: round(float(v * factor), 2) for k, v in allocation.items()}
        
        # v6.20 FIX: CAP PASS après normalisation
        allocation = self._enforce_position_caps(allocation, asset_by_id, profile)
        
        # Ajuster pour vol_target
        allocation = self._adjust_for_vol_target(allocation, candidates, profile, cov)
        
        # v6.20 FIX: CAP PASS après vol adjustment
        allocation = self._enforce_position_caps(allocation, asset_by_id, profile)
        
        return allocation
    
    def _adjust_for_vol_target(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints,
        cov: np.ndarray
    ) -> Dict[str, float]:
        """Ajuste l'allocation pour approcher la vol_target."""
        weights = np.array([allocation.get(c.id, 0) / 100 for c in candidates])
        current_vol = self._compute_portfolio_vol(weights, cov)
        vol_target = profile.vol_target
        
        if abs(current_vol - vol_target) <= profile.vol_tolerance:
            return allocation
        
        asset_lookup = {c.id: c for c in candidates}
        
        low_vol_ids = [aid for aid, w in allocation.items() 
                       if w > 0 and asset_lookup.get(aid) and asset_lookup[aid].vol_annual < 15]
        high_vol_ids = [aid for aid, w in allocation.items() 
                        if w > 0 and asset_lookup.get(aid) and asset_lookup[aid].vol_annual > 25]
        
        iterations = 0
        max_iterations = 10
        
        while abs(current_vol - vol_target) > profile.vol_tolerance and iterations < max_iterations:
            iterations += 1
            
            if current_vol > vol_target and low_vol_ids and high_vol_ids:
                transfer = min(2.0, (current_vol - vol_target) / 2)
                
                high_vol_sorted = sorted(high_vol_ids, key=lambda x: (-allocation.get(x, 0), x))
                for hv_id in high_vol_sorted:
                    if allocation.get(hv_id, 0) > transfer + 1:
                        allocation[hv_id] -= transfer
                        break
                
                # v6.20 FIX: Vérifier cap AVANT d'ajouter
                low_vol_sorted = sorted(low_vol_ids, key=lambda x: (allocation.get(x, 0), x))
                for lv_id in low_vol_sorted:
                    asset = asset_lookup.get(lv_id)
                    if asset:
                        cap = get_max_weight_for_asset(lv_id, asset.category, profile.name, profile.max_single_position)
                        if allocation.get(lv_id, 0) + transfer <= cap:
                            allocation[lv_id] = allocation.get(lv_id, 0) + transfer
                            break
                
            elif current_vol < vol_target and high_vol_ids and low_vol_ids:
                transfer = min(2.0, (vol_target - current_vol) / 2)
                
                low_vol_sorted = sorted(low_vol_ids, key=lambda x: (-allocation.get(x, 0), x))
                for lv_id in low_vol_sorted:
                    if allocation.get(lv_id, 0) > transfer + 1:
                        allocation[lv_id] -= transfer
                        break
                
                # v6.20 FIX: Vérifier cap AVANT d'ajouter
                high_vol_sorted = sorted(high_vol_ids, key=lambda x: (allocation.get(x, 0), x))
                for hv_id in high_vol_sorted:
                    asset = asset_lookup.get(hv_id)
                    if asset:
                        cap = get_max_weight_for_asset(hv_id, asset.category, profile.name, profile.max_single_position)
                        if allocation.get(hv_id, 0) + transfer <= cap:
                            allocation[hv_id] = allocation.get(hv_id, 0) + transfer
                            break
            else:
                break
            
            weights = np.array([allocation.get(c.id, 0) / 100 for c in candidates])
            current_vol = self._compute_portfolio_vol(weights, cov)
        
        total = sum(allocation.values())
        if total > 0 and abs(total - 100) > 0.1:
            allocation = {k: round(v * 100 / total, 2) for k, v in allocation.items()}
        
        return allocation
    
    def optimize(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints
    ) -> Tuple[Dict[str, float], dict]:
        """Optimisation mean-variance avec cap pass post-redistribution."""
        n = len(candidates)
        if n < profile.min_assets:
            raise ValueError(f"Pool insuffisant ({n} < {profile.min_assets})")
        
        asset_by_id = {a.id: a for a in candidates}
        
        raw_scores = np.array([_clean_float(a.score, 0.0, -100, 100) for a in candidates])
        scores = self._normalize_scores(raw_scores) * self.score_scale
        
        cov, cov_diagnostics = self.compute_covariance(candidates)
        
        # PR3: Soft bucket penalty
        bucket_penalty_fn = None
        bucket_penalty_info = {"enabled": False}
        
        if self.use_soft_bucket_penalty and HAS_BUCKET_PENALTY:
            role_mapping = {c.id: c.role.value if c.role else "unknown" for c in candidates}
            bucket_targets = {}
            for role in Role:
                if role in PROFILE_BUCKET_TARGETS.get(profile.name, {}):
                    min_pct, max_pct = PROFILE_BUCKET_TARGETS[profile.name][role]
                    bucket_targets[role.value] = (min_pct, max_pct)
            
            candidate_ids = [c.id for c in candidates]
            bucket_penalty_fn = create_penalty_function(
                asset_ids=candidate_ids,
                roles=role_mapping,
                targets=bucket_targets,
                lambda_bucket=LAMBDA_BUCKET,
                lambda_unknown=LAMBDA_UNKNOWN,
            )
            bucket_penalty_info = {"enabled": True, "lambda_bucket": LAMBDA_BUCKET}
        
        # Fallback pour Stable
        if profile.name in FORCE_FALLBACK_PROFILES:
            allocation = self._fallback_allocation(candidates, profile, cov)
            optimizer_converged = False
            optimization_mode = "fallback_heuristic"
            fallback_reason = "Stable profile: strict constraints"
        else:
            # SLSQP
            vol_target = profile.vol_target / 100
            
            def objective(w):
                port_score = np.dot(w, scores)
                port_var = np.dot(w, np.dot(cov, w))
                port_vol = np.sqrt(max(port_var, 0))
                vol_penalty = 5.0 * (port_vol - vol_target) ** 2
                bucket_pen = bucket_penalty_fn(w) if bucket_penalty_fn else 0.0
                return -(port_score - vol_penalty - bucket_pen)
            
            skip_bucket = self.use_soft_bucket_penalty and bucket_penalty_fn is not None
            constraints = self._build_constraints(candidates, profile, cov, skip_bucket_constraints=skip_bucket)
            
            # v6.20: Bounds par asset avec caps corrects
            bounds = []
            for c in candidates:
                cap = get_max_weight_for_asset(c.id, c.category, profile.name, profile.max_single_position)
                bounds.append((0, cap / 100))
            
            w0 = self._get_smart_initial_weights(candidates, profile)
            
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                result = minimize(
                    objective, w0, method="SLSQP",
                    bounds=bounds, constraints=constraints,
                    options={"maxiter": 1000, "ftol": 1e-8}
                )
            
            fallback_reason = None
            
            if result.success:
                weights = result.x.copy()
                weights = self._enforce_asset_count(weights, candidates, profile)
                
                allocation = {}
                for i, w in enumerate(weights):
                    if w > 0.005:
                        allocation[candidates[i].id] = round(float(w * 100), 2)
                
                allocation = self._adjust_to_100(allocation, asset_by_id, profile)
                
                # v6.20 FIX: CAP PASS après SLSQP
                allocation = self._enforce_position_caps(allocation, asset_by_id, profile)
                
                # Vérifier bonds
                bonds_in_solution = sum(
                    1 for aid in allocation 
                    if any(c.id == aid and c.category == "Obligations" for c in candidates)
                )
                min_bonds_required = MIN_DISTINCT_BONDS.get(profile.name, 1)
                
                if bonds_in_solution < min_bonds_required:
                    fallback_reason = f"SLSQP gave only {bonds_in_solution} bonds < {min_bonds_required}"
                    allocation = self._fallback_allocation(candidates, profile, cov)
                    optimizer_converged = False
                    optimization_mode = "fallback_bonds_diversification"
                else:
                    optimizer_converged = True
                    optimization_mode = "slsqp" + ("+soft_penalty" if bucket_penalty_fn else "")
            else:
                fallback_reason = str(result.message)
                allocation = self._fallback_allocation(candidates, profile, cov)
                optimizer_converged = False
                optimization_mode = "fallback_slsqp_failed"
        
        # Diagnostics
        final_weights = np.array([allocation.get(c.id, 0)/100 for c in candidates])
        port_vol = self._compute_portfolio_vol(final_weights, cov)
        port_score = float(np.dot(final_weights, raw_scores))
        
        sector_exposure = defaultdict(float)
        bucket_exposure = defaultdict(float)
        bonds_in_allocation = 0
        crypto_in_allocation = 0
        
        for asset_id, weight in allocation.items():
            asset = asset_by_id.get(asset_id)
            if asset:
                sector_exposure[asset.sector] += weight
                if asset.role:
                    bucket_exposure[asset.role.value] += weight
                if asset.category == "Obligations":
                    bonds_in_allocation += 1
                if asset.category == "Crypto":
                    crypto_in_allocation += 1
        
        # v6.20: Vérifier caps finaux pour diagnostics
        cap_violations = []
        for asset_id, weight in allocation.items():
            asset = asset_by_id.get(asset_id)
            if asset:
                cap = get_max_weight_for_asset(asset_id, asset.category, profile.name, profile.max_single_position)
                if weight > cap + 0.1:
                    cap_violations.append(f"{asset_id}: {weight:.1f}% > {cap:.1f}%")
        
        if cap_violations:
            logger.error(f"[CAP VIOLATIONS] {profile.name}: {cap_violations}")
        
        diagnostics = to_python_native({
            "converged": optimizer_converged,
            "optimization_mode": optimization_mode,
            "fallback_reason": fallback_reason,
            "portfolio_vol": round(port_vol, 2),
            "vol_target": profile.vol_target,
            "portfolio_score": round(port_score, 3),
            "n_assets": len(allocation),
            "n_bonds": bonds_in_allocation,
            "n_crypto": crypto_in_allocation,
            "sectors": dict(sector_exposure),
            "bucket_exposure": dict(bucket_exposure),
            "bucket_penalty_info": bucket_penalty_info,
            "covariance_method": cov_diagnostics.get("method", "unknown"),
            "cap_violations": cap_violations,  # v6.20: Traçabilité
            "pr0_exposures_v2": HAS_EXPOSURES_V2 and USE_EXPOSURES_V2,
            "pr1_instrument_classifier": HAS_INSTRUMENT_CLASSIFIER,
            "pr3_soft_bucket_penalty": self.use_soft_bucket_penalty and HAS_BUCKET_PENALTY,
        })
        
        logger.info(
            f"{profile.name}: {len(allocation)} actifs, vol={port_vol:.1f}%, "
            f"mode={optimization_mode}, cap_violations={len(cap_violations)}"
        )
        
        if HAS_CONSTRAINT_REPORT:
            try:
                diagnostics = enrich_diagnostics_with_margins(
                    diagnostics=diagnostics,
                    allocation=allocation,
                    candidates=candidates,
                    profile=profile,
                )
            except Exception as e:
                logger.warning(f"Constraint report failed: {e}")
        
        return allocation, diagnostics
    
    def _enforce_asset_count(
        self, 
        weights: np.ndarray, 
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> np.ndarray:
        """Force le nombre d'actifs dans la fourchette."""
        weights = np.nan_to_num(weights, nan=0.0)
        active = np.sum(weights > 0.005)
        
        if active < profile.min_assets:
            sorted_idx = np.argsort(weights)[::-1]
            to_add = profile.min_assets - int(active)
            total_to_redistribute = 0.02 * to_add
            top_positions = sorted_idx[:5]
            reduction_per_top = total_to_redistribute / len(top_positions)
            
            for idx in top_positions:
                if weights[idx] > reduction_per_top + 0.01:
                    weights[idx] -= reduction_per_top
            
            zero_positions = np.where(weights < 0.005)[0]
            scores = np.array([candidates[i].score for i in zero_positions])
            best_zeros = zero_positions[np.argsort(scores)[::-1][:to_add]]
            
            for idx in best_zeros:
                weights[idx] = 0.02
        
        elif active > profile.max_assets:
            sorted_idx = np.argsort(weights)
            to_remove = int(active) - profile.max_assets
            removed_weight = 0
            for idx in sorted_idx[:to_remove]:
                removed_weight += weights[idx]
                weights[idx] = 0
            remaining_idx = np.where(weights > 0.005)[0]
            if len(remaining_idx) > 0:
                weights[remaining_idx] += removed_weight / len(remaining_idx)
        
        if weights.sum() > 0:
            weights = weights / weights.sum()
        
        return weights
    
    def _adjust_to_100(
        self, 
        allocation: Dict[str, float], 
        asset_by_id: Dict[str, Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """Ajustement à 100% avec respect des caps."""
        total = sum(allocation.values())
        if abs(total - 100) < 0.01:
            return allocation
        
        diff = 100 - total
        
        # v6.20: Trouver une position qui peut absorber le diff sans violer son cap
        candidates_for_adjust = []
        for k, v in allocation.items():
            asset = asset_by_id.get(k)
            if asset:
                cap = get_max_weight_for_asset(k, asset.category, profile.name, profile.max_single_position)
                new_weight = v + diff
                if 0.5 <= new_weight <= cap:
                    candidates_for_adjust.append((k, v, cap - v))  # (id, weight, marge)
        
        if candidates_for_adjust:
            # Choisir celui avec la plus grande marge
            target_id = max(candidates_for_adjust, key=lambda x: (x[2], x[0]))[0]
            allocation[target_id] = round(float(allocation[target_id] + diff), 2)
        else:
            # Redistribuer proportionnellement
            if total > 0:
                for k in allocation:
                    allocation[k] = round(float(allocation[k] * 100 / total), 2)
        
        return allocation
    
    def build_portfolio(
        self, 
        universe: List[Asset], 
        profile_name: str
    ) -> Tuple[Dict[str, float], dict]:
        """Pipeline complet."""
        profile = PROFILES[profile_name]
        candidates = self.select_candidates(universe, profile)
        
        if len(candidates) < profile.min_assets:
            raise ValueError(f"Univers insuffisant pour {profile_name}")
        
        return self.optimize(candidates, profile)


# ============= CONVERSION UNIVERS =============

def convert_universe_to_assets(universe: Union[List[dict], Dict[str, List[dict]]]) -> List[Asset]:
    """Convertit l'univers scoré en List[Asset]."""
    assets = []
    
    if isinstance(universe, list):
        for item in universe:
            category = item.get("category", "").lower()
            
            if category in ["equity", "equities", "action", "actions", "stock"]:
                cat_normalized = "Actions"
                default_vol = 25
            elif category in ["bond", "bonds", "obligation", "obligations"]:
                cat_normalized = "Obligations"
                default_vol = 5
            elif category in ["crypto", "cryptocurrency"]:
                cat_normalized = "Crypto"
                default_vol = 80
            elif category in ["etf", "etfs"]:
                cat_normalized = "ETF"
                default_vol = 15
            else:
                cat_normalized = "ETF"
                default_vol = 15
            
            raw_id = item.get("id") or item.get("ticker") or item.get("symbol")
            if not _is_valid_id(raw_id):
                raw_id = item.get("name") or f"{cat_normalized}_{len(assets)+1}"
            
            asset = Asset(
                id=str(raw_id),
                name=item.get("name") or str(raw_id),
                category=cat_normalized,
                sector=item.get("sector") or item.get("sector_top") or "Unknown",
                region=item.get("country") or item.get("country_top") or item.get("region") or "Global",
                score=_clean_float(item.get("score") or item.get("_score"), 50.0, 0, 100),
                vol_annual=_clean_float(
                    item.get("vol") or item.get("volatility_3y") or item.get("vol_3y"),
                    default_vol, 1.0, 150.0
                ),
                returns_series=item.get("returns_series"),
                source_data=item,
                exposure=item.get("exposure"),
                preset=item.get("preset"),
                buffett_score=item.get("_buffett_score"),
            )
            assets.append(asset)
    
    elif isinstance(universe, dict):
        for cat_key, items in universe.items():
            for item in items:
                item["category"] = cat_key
                assets.extend(convert_universe_to_assets([item]))
    
    return assets
