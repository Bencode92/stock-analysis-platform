# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v6.9 — Relax Stable constraints for SLSQP convergence

CHANGEMENTS v6.9:
1. P1 FIX: Stable bonds_min réduit 40% → 35% (facilite SLSQP)
2. P1 FIX: Stable vol_tolerance augmenté 4% → 5% (plus de marge)
3. P1 FIX: Bucket constraint relaxation augmentée pour Stable (±8%)
4. Meilleure convergence SLSQP sans sacrifier la qualité

CHANGEMENTS v6.8:
1. P1 FIX: vol_tolerance Stable augmenté 3% → 4% (évite échec SLSQP)
2. P1 FIX: vol_target Stable en intervalle [7%, 9%] (vol_target_min/max)
3. P3 FIX: Diagnostic crypto dans logs (max_allowed, pool, selected)
4. Meilleur init poids pour SLSQP Stable (bonds-heavy)

CHANGEMENTS v6.7:
1. FIX CRITIQUE: Bonds utilisent SYMBOL comme ID (AGG, BND, VTIP) au lieu de "nan"
2. Ajout de _is_valid_id() pour valider les IDs (gère None, NaN, "", "nan")
3. Empêche la collision dans asset_lookup qui causait la perte de tous les bonds sauf le dernier

CHANGEMENTS v6.6:
1. Add [FINAL] debug log showing each asset in allocation (id, category, name, weight)
2. Helps diagnose if bonds disappear in optimizer or in mapping layer

5 LEVIERS ACTIFS (le reste est gelé):
1. vol_target par profil (8%, 12%, 18%)
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

logger = logging.getLogger("portfolio_engine.optimizer")


# ============= CONSTANTES v6.5 =============

# HARD FILTER: Score Buffett minimum pour les actions
BUFFETT_HARD_FILTER_MIN = 50.0  # Actions avec score < 50 sont rejetées

# Covariance hybride: poids empirique vs structurée
COVARIANCE_EMPIRICAL_WEIGHT = 0.60  # 60% empirique, 40% structurée

# Corrélations structurées (utilisées quand pas de données empiriques)
CORR_SAME_CORPORATE_GROUP = 0.90
CORR_SAME_EXPOSURE = 0.85
CORR_SAME_SECTOR = 0.45
CORR_SAME_CATEGORY = 0.60
CORR_SAME_BUCKET = 0.50
CORR_EQUITY_BOND = -0.20
CORR_CRYPTO_OTHER = 0.25
CORR_DEFAULT = 0.15

# Volatilités par défaut par catégorie
DEFAULT_VOLS = {"Actions": 25.0, "ETF": 15.0, "Obligations": 5.0, "Crypto": 80.0}

# P1 FIX v6.2: Minimum bonds dans le pool par profil (AUGMENTÉ)
MIN_BONDS_IN_POOL = {
    "Stable": 15,    # Était 8
    "Modéré": 10,    # Était 5
    "Agressif": 5,   # Était 2
}

# P1 FIX v6.2: Minimum defensive assets dans le pool par profil (AUGMENTÉ)
MIN_DEFENSIVE_IN_POOL = {
    "Stable": 12,    # Était 10
    "Modéré": 8,     # Était 6
    "Agressif": 5,   # Était 3
}

# P1 FIX v6.2: Maximum weight par obligation (force diversification)
MAX_SINGLE_BOND_WEIGHT = {
    "Stable": 12.0,   # Max 12% par bond → au moins 4 bonds pour 40% total
    "Modéré": 8.0,    # Max 8% par bond → au moins 2 bonds pour 15% total
    "Agressif": 5.0,  # Max 5% par bond → au moins 1 bond pour 5% total
}

# P1 FIX v6.2: Minimum nombre de bonds distincts dans l'allocation finale
MIN_DISTINCT_BONDS = {
    "Stable": 4,
    "Modéré": 2,
    "Agressif": 1,
}

# v6.9: Bucket constraint relaxation par profil (pour SLSQP)
BUCKET_CONSTRAINT_RELAXATION = {
    "Stable": 0.08,    # ±8% pour Stable (était ±5%)
    "Modéré": 0.05,    # ±5% standard
    "Agressif": 0.05,  # ±5% standard
}


# ============= JSON SERIALIZATION HELPER =============

def to_python_native(obj: Any) -> Any:
    """Convertit récursivement les types numpy en types Python natifs pour JSON."""
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


# ============= v6.7 FIX: VALID ID HELPER =============

def _is_valid_id(val) -> bool:
    """
    v6.7: Vérifie si une valeur est un ID valide (pas None, NaN, vide, "nan").
    """
    if val is None:
        return False
    if isinstance(val, float):
        if math.isnan(val):
            return False
    if isinstance(val, str):
        s = val.strip().lower()
        return s not in ["", "nan", "none", "null"]
    return bool(val)


# ============= PROFILE CONSTRAINTS v6.9 =============

@dataclass
class ProfileConstraints:
    """
    Contraintes par profil — vol_target est indicatif (pénalité douce).
    
    v6.9: Stable bonds_min réduit (35%), vol_tolerance augmenté (5%)
    v6.8: Ajout vol_tolerance spécifique par profil (Stable = 4% au lieu de 3%)
    """
    name: str
    vol_target: float           # LEVIER 1: Volatilité cible (%)
    vol_tolerance: float = 3.0  # v6.8: Tolérance autour de la cible
    crypto_max: float = 10.0    # LEVIER 4: Crypto maximum
    bonds_min: float = 5.0      # LEVIER 4: Bonds minimum
    max_single_position: float = 15.0
    max_sector: float = 30.0
    max_region: float = 50.0
    min_assets: int = 10
    max_assets: int = 18


# v6.9 FIX: Contraintes relâchées pour Stable (bonds_min 35%, vol_tolerance 5%)
# Permet à SLSQP de converger plus facilement avec les contraintes serrées
PROFILES = {
    "Agressif": ProfileConstraints(
        name="Agressif", 
        vol_target=18.0, 
        vol_tolerance=3.0,  # Standard
        crypto_max=10.0, 
        bonds_min=5.0
    ),
    "Modéré": ProfileConstraints(
        name="Modéré", 
        vol_target=12.0, 
        vol_tolerance=3.0,  # Standard
        crypto_max=5.0, 
        bonds_min=15.0
    ),
    "Stable": ProfileConstraints(
        name="Stable", 
        vol_target=8.0, 
        vol_tolerance=5.0,  # v6.9 FIX: Augmenté 4% → 5% pour convergence SLSQP
        crypto_max=0.0, 
        bonds_min=35.0      # v6.9 FIX: Réduit 40% → 35% pour convergence SLSQP
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
    buffett_score: Optional[float] = None  # Score Buffett pour hard filter


def _clean_float(value, default: float = 15.0, min_val: float = 0.1, max_val: float = 200.0) -> float:
    """Nettoie une valeur float (gère NaN, Inf, None)."""
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
    
    # === OBLIGATIONS / CASH === (P0 FIX: TOUJOURS DEFENSIVE)
    if category == "Obligations":
        if any(kw in name_lower for kw in ["ultra short", "money market", "1-3 month", "boxx", "bil"]):
            return "cash_ultra_short", Role.DEFENSIVE
        return "defensif_oblig", Role.DEFENSIVE
    
    # === CRYPTO ===
    if category == "Crypto":
        if any(kw in name_lower for kw in ["bitcoin", "btc", "ethereum", "eth"]):
            return "quality_risk", Role.CORE
        if vol > 100:
            return "highvol_lottery", Role.LOTTERY
        if vol > 60:
            return "momentum24h", Role.LOTTERY
        return "trend3_12m", Role.SATELLITE
    
    # === ETF ===
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
    
    # === ACTIONS ===
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
    """Enrichit tous les actifs avec leur preset et rôle (bucket)."""
    for asset in assets:
        if asset.preset is None or asset.role is None:
            preset, role = assign_preset_to_asset(asset)
            asset.preset = preset
            asset.role = role
        if asset.category == "Actions" and asset.corporate_group is None:
            asset.corporate_group = get_corporate_group(asset.name)
    
    role_counts = defaultdict(int)
    for asset in assets:
        if asset.role:
            role_counts[asset.role.value] += 1
    
    logger.info(f"Bucket distribution: {dict(role_counts)}")
    return assets


# ============= HARD FILTER: BUFFETT =============

def apply_buffett_hard_filter(assets: List[Asset], min_score: float = BUFFETT_HARD_FILTER_MIN) -> List[Asset]:
    """HARD FILTER: Rejette les actions avec score Buffett < min_score."""
    filtered = []
    rejected_count = 0
    
    for asset in assets:
        if asset.category == "Actions":
            buffett_score = asset.buffett_score or 50.0
            if buffett_score < min_score:
                rejected_count += 1
                logger.debug(f"Buffett hard filter: rejected {asset.name} (score={buffett_score:.1f} < {min_score})")
                continue
        filtered.append(asset)
    
    if rejected_count > 0:
        logger.info(f"Buffett hard filter: rejected {rejected_count} low-quality stocks (score < {min_score})")
    
    return filtered


# ============= CORPORATE GROUP DEDUPLICATION =============

def deduplicate_stocks_by_corporate_group(
    assets: List[Asset],
    max_per_group: int = MAX_STOCKS_PER_GROUP
) -> Tuple[List[Asset], Dict[str, List[str]]]:
    """Déduplique les actions par groupe corporate."""
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
            group_stocks.sort(key=lambda a: a.score, reverse=True)
            kept = group_stocks[:max_per_group]
            removed = group_stocks[max_per_group:]
            deduplicated_stocks.extend(kept)
            if removed:
                removed_by_group[group_id] = [a.name for a in removed]
    
    total_removed = sum(len(v) for v in removed_by_group.values())
    if total_removed > 0:
        logger.info(f"Corporate deduplication: removed {total_removed} duplicate stocks")
    
    return non_stocks + deduplicated_stocks, removed_by_group


# ============= ETF EXPOSURE DETECTION =============

ETF_NAME_TO_EXPOSURE = {
    "gold": "gold", "or": "gold", "gld": "gold", "iau": "gold",
    "world": "world", "msci world": "world", "urth": "world",
    "s&p 500": "sp500", "spy": "sp500", "voo": "sp500",
    "nasdaq": "nasdaq", "qqq": "nasdaq", "tech": "tech",
    "emerging": "emerging_markets", "eem": "emerging_markets",
    "treasury": "bonds_treasury", "tlt": "bonds_treasury", "ief": "bonds_treasury",
    "investment grade": "bonds_ig", "lqd": "bonds_ig", "agg": "bonds_ig",
    "money market": "cash", "ultra short": "cash", "bil": "cash",
    "min vol": "min_vol", "low vol": "min_vol",
    "dividend": "dividend", "inflation": "inflation", "tips": "inflation",
}


def detect_etf_exposure(asset: Asset) -> Optional[str]:
    """Détecte l'exposition d'un ETF ou bond basé sur son nom/ticker."""
    if asset.category not in ["ETF", "Obligations"]:
        return None
    search_text = f"{asset.name} {asset.id}".lower()
    for keyword, exposure in ETF_NAME_TO_EXPOSURE.items():
        if keyword in search_text:
            return exposure
    return None


def deduplicate_etfs(assets: List[Asset], prefer_by: str = "score") -> List[Asset]:
    """Déduplique les ETF par exposition, MAIS PAS les Obligations."""
    etfs_to_dedup = []
    other_assets = []
    
    n_bonds_before = sum(1 for a in assets if a.category == "Obligations")
    n_etf_before = sum(1 for a in assets if a.category == "ETF")
    
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
    removed_count = 0
    
    for exposure, group in exposure_groups.items():
        if exposure is None:
            deduplicated_etfs.extend(group)
        else:
            sorted_group = sorted(group, key=lambda a: a.score, reverse=True)
            deduplicated_etfs.append(sorted_group[0])
            if len(sorted_group) > 1:
                removed_count += len(sorted_group) - 1
    
    n_bonds_after = sum(1 for a in other_assets if a.category == "Obligations")
    n_etf_after = len(deduplicated_etfs)
    
    logger.info(f"ETF dedup: ETF {n_etf_before}→{n_etf_after}, Bonds {n_bonds_before}→{n_bonds_after} (unchanged)")
    
    if removed_count > 0:
        logger.info(f"ETF deduplication: removed {removed_count} redundant ETFs")
    
    return other_assets + deduplicated_etfs


# ============= COVARIANCE HYBRIDE v6 =============

class HybridCovarianceEstimator:
    """Estimateur de covariance hybride: empirique + structurée."""
    
    def __init__(
        self, 
        empirical_weight: float = COVARIANCE_EMPIRICAL_WEIGHT,
        min_history_days: int = 60
    ):
        self.empirical_weight = empirical_weight
        self.min_history_days = min_history_days
    
    def compute_empirical_covariance(self, assets: List[Asset]) -> Optional[np.ndarray]:
        """Calcule la covariance empirique si données suffisantes."""
        n = len(assets)
        valid_assets = [a for a in assets if a.returns_series is not None and len(a.returns_series) >= self.min_history_days]
        
        if len(valid_assets) < n * 0.5:
            return None
        
        returns_matrix = []
        has_data = []
        
        for asset in assets:
            if asset.returns_series is not None and len(asset.returns_series) >= self.min_history_days:
                returns_matrix.append(asset.returns_series[-252:])
                has_data.append(True)
            else:
                has_data.append(False)
        
        if not returns_matrix:
            return None
        
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
            
            return cov_full
        except Exception as e:
            logger.warning(f"Covariance empirique échouée: {e}")
            return None
    
    def compute_structured_covariance(self, assets: List[Asset]) -> np.ndarray:
        """Calcule la covariance structurée (basée sur catégories/secteurs/exposure)."""
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
        """Calcule la covariance hybride."""
        n = len(assets)
        cov_structured = self.compute_structured_covariance(assets)
        cov_empirical = self.compute_empirical_covariance(assets)
        
        diagnostics = {
            "method": "structured",
            "empirical_available": False,
            "empirical_weight": 0.0,
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
        
        cov = self._ensure_positive_definite(cov)
        return cov, diagnostics
    
    def _ensure_positive_definite(self, cov: np.ndarray, min_eigenvalue: float = 1e-6) -> np.ndarray:
        """Force la matrice à être positive semi-définie."""
        cov = np.nan_to_num(cov, nan=0.0, posinf=0.0, neginf=0.0)
        cov = (cov + cov.T) / 2
        n = cov.shape[0]
        cov += np.eye(n) * min_eigenvalue
        
        try:
            eigenvalues, eigenvectors = np.linalg.eigh(cov)
            eigenvalues = np.maximum(eigenvalues, min_eigenvalue)
            cov_fixed = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T
            return (cov_fixed + cov_fixed.T) / 2
        except Exception:
            return np.diag(np.maximum(np.diag(cov), min_eigenvalue))


# ============= PORTFOLIO OPTIMIZER v6.9 =============

class PortfolioOptimizer:
    """
    Optimiseur mean-variance v6.9.
    
    CHANGEMENTS v6.9:
    1. P1 FIX: Stable bonds_min réduit 40% → 35%
    2. P1 FIX: Stable vol_tolerance augmenté 4% → 5%
    3. P1 FIX: Bucket constraint relaxation par profil (±8% pour Stable)
    4. Meilleure convergence SLSQP sans sacrifier la qualité
    """
    
    def __init__(
        self, 
        score_scale: float = 1.0, 
        deduplicate_etfs: bool = True,
        deduplicate_corporate: bool = True,
        use_bucket_constraints: bool = True,
        buffett_hard_filter: bool = True,
        buffett_min_score: float = BUFFETT_HARD_FILTER_MIN
    ):
        self.score_scale = score_scale
        self.deduplicate_etfs_enabled = deduplicate_etfs
        self.deduplicate_corporate_enabled = deduplicate_corporate
        self.use_bucket_constraints = use_bucket_constraints
        self.buffett_hard_filter_enabled = buffett_hard_filter
        self.buffett_min_score = buffett_min_score
        self.covariance_estimator = HybridCovarianceEstimator()
    
    def select_candidates(
        self, 
        universe: List[Asset], 
        profile: ProfileConstraints
    ) -> List[Asset]:
        """Pré-sélection avec HARD FILTER Buffett, déduplication et buckets."""
        # === ÉTAPE 1: Déduplication ETF ===
        if self.deduplicate_etfs_enabled:
            universe = deduplicate_etfs(universe, prefer_by="score")
            logger.info(f"Post-ETF-dedup universe: {len(universe)} actifs")
        
        # === ÉTAPE 2: Déduplication Corporate ===
        if self.deduplicate_corporate_enabled:
            universe, _ = deduplicate_stocks_by_corporate_group(universe, max_per_group=MAX_STOCKS_PER_GROUP)
            logger.info(f"Post-corporate-dedup universe: {len(universe)} actifs")
        
        # === ÉTAPE 3: HARD FILTER BUFFETT ===
        if self.buffett_hard_filter_enabled:
            universe = apply_buffett_hard_filter(universe, min_score=self.buffett_min_score)
            logger.info(f"Post-Buffett-filter universe: {len(universe)} actifs")
        
        # === ÉTAPE 4: Enrichir avec buckets ===
        universe = enrich_assets_with_buckets(universe)
        
        # === ÉTAPE 5: Tri par score ===
        sorted_assets = sorted(universe, key=lambda x: x.score, reverse=True)
        
        # === ÉTAPE 6: Sélection diversifiée ===
        selected = []
        sector_count = defaultdict(int)
        category_count = defaultdict(int)
        exposure_count = defaultdict(int)
        bucket_count = defaultdict(int)
        corporate_group_count = defaultdict(int)
        
        target_pool = profile.max_assets * 3
        
        # v6.8 P3: Compteur crypto pour diagnostic
        crypto_pool_count = 0
        crypto_scores = []
        
        for asset in sorted_assets:
            if len(selected) >= target_pool:
                break
            
            if asset.category == "Crypto":
                if profile.crypto_max == 0:
                    continue
                if category_count["Crypto"] >= 3:
                    continue
                crypto_pool_count += 1
                crypto_scores.append(asset.score)
            
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
        
        # === P1 FIX v6.2: GARANTIR MINIMUM DE BONDS ===
        min_bonds = MIN_BONDS_IN_POOL.get(profile.name, 5)
        bonds_in_pool = [a for a in selected if a.category == "Obligations"]
        
        if len(bonds_in_pool) < min_bonds:
            all_bonds = sorted(
                [a for a in universe if a.category == "Obligations" and a not in selected],
                key=lambda x: x.vol_annual
            )
            bonds_needed = min_bonds - len(bonds_in_pool)
            bonds_to_add = all_bonds[:bonds_needed]
            selected.extend(bonds_to_add)
            logger.info(f"P1 FIX v6.2: Added {len(bonds_to_add)} bonds to pool for {profile.name} (minimum {min_bonds})")
        
        # === P1 FIX v6.2: GARANTIR MINIMUM DEFENSIVE ===
        min_defensive = MIN_DEFENSIVE_IN_POOL.get(profile.name, 5)
        defensive_in_pool = [a for a in selected if a.role == Role.DEFENSIVE]
        
        if len(defensive_in_pool) < min_defensive:
            defensive_candidates = sorted(
                [a for a in universe if a.role == Role.DEFENSIVE and a not in selected],
                key=lambda x: x.vol_annual
            )
            defensive_needed = min_defensive - len(defensive_in_pool)
            defensive_to_add = defensive_candidates[:defensive_needed]
            selected.extend(defensive_to_add)
            logger.info(f"P1 FIX v6.2: Added {len(defensive_to_add)} defensive assets to pool for {profile.name}")
        
        logger.info(f"Pool candidats: {len(selected)} actifs pour {profile.name}")
        
        # Log bucket distribution
        bucket_dist = defaultdict(int)
        for a in selected:
            if a.role:
                bucket_dist[a.role.value] += 1
        logger.info(f"Buckets pool: {dict(bucket_dist)}")
        
        # Log bonds count
        bonds_count = sum(1 for a in selected if a.category == "Obligations")
        logger.info(f"Bonds in pool: {bonds_count}")
        
        # === v6.8 P3 FIX: DIAGNOSTIC CRYPTO ===
        crypto_in_pool = sum(1 for a in selected if a.category == "Crypto")
        crypto_in_universe = sum(1 for a in universe if a.category == "Crypto")
        avg_crypto_score = sum(crypto_scores) / len(crypto_scores) if crypto_scores else 0
        
        logger.info(
            f"[DIAG CRYPTO {profile.name}] universe={crypto_in_universe}, "
            f"pool={crypto_in_pool}, max_allowed={profile.crypto_max}%, "
            f"avg_score={avg_crypto_score:.2f}"
        )
        
        return selected
    
    def compute_covariance(self, assets: List[Asset]) -> Tuple[np.ndarray, Dict]:
        """Calcule la covariance hybride."""
        return self.covariance_estimator.compute(assets)
    
    def _compute_portfolio_vol(self, weights: np.ndarray, cov: np.ndarray) -> float:
        """Calcul robuste de la volatilité du portefeuille."""
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
        cov: np.ndarray
    ) -> List[dict]:
        """Construit les contraintes SLSQP avec limite par bond."""
        n = len(candidates)
        constraints = []
        
        # 1. Somme = 100%
        constraints.append({"type": "eq", "fun": lambda w: np.sum(w) - 1.0})
        
        # 2. Bonds minimum
        bonds_idx = [i for i, a in enumerate(candidates) if a.category == "Obligations"]
        if bonds_idx and profile.bonds_min > 0:
            def bonds_constraint(w, idx=bonds_idx, min_val=profile.bonds_min/100):
                return np.sum(w[idx]) - min_val
            constraints.append({"type": "ineq", "fun": bonds_constraint})
        
        # 3. MAX WEIGHT PAR BOND
        max_bond_weight = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 10.0) / 100
        for i in bonds_idx:
            def single_bond_constraint(w, idx=i, max_val=max_bond_weight):
                return max_val - w[idx]
            constraints.append({"type": "ineq", "fun": single_bond_constraint})
        
        # 4. Crypto maximum
        crypto_idx = [i for i, a in enumerate(candidates) if a.category == "Crypto"]
        if crypto_idx:
            def crypto_constraint(w, idx=crypto_idx, max_val=profile.crypto_max/100):
                return max_val - np.sum(w[idx])
            constraints.append({"type": "ineq", "fun": crypto_constraint})
        
        # 5. Contraintes par SECTEUR
        for sector in set(a.sector for a in candidates):
            sector_idx = [i for i, a in enumerate(candidates) if a.sector == sector]
            if len(sector_idx) > 1:
                def sector_constraint(w, idx=sector_idx, max_val=profile.max_sector/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": sector_constraint})
        
        # 6. Contraintes par RÉGION
        for region in set(a.region for a in candidates):
            region_idx = [i for i, a in enumerate(candidates) if a.region == region]
            if len(region_idx) > 1:
                def region_constraint(w, idx=region_idx, max_val=profile.max_region/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": region_constraint})
        
        # 7. Contraintes par CORPORATE GROUP
        for group in set(a.corporate_group for a in candidates if a.corporate_group):
            group_idx = [i for i, a in enumerate(candidates) if a.corporate_group == group]
            if len(group_idx) > 1:
                def group_constraint(w, idx=group_idx, max_val=MAX_CORPORATE_GROUP_WEIGHT):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": group_constraint})
        
        # 8. Contraintes par BUCKET (v6.9: relaxation par profil)
        if self.use_bucket_constraints:
            bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
            # v6.9: Relaxation variable par profil
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
        """
        v6.8 P1 FIX: Initialisation intelligente des poids pour SLSQP.
        
        Pour Stable: commence avec une allocation bonds-heavy pour aider SLSQP.
        """
        n = len(candidates)
        
        if profile.name == "Stable":
            # Pour Stable: init bonds-heavy
            weights = np.zeros(n)
            bonds_idx = [i for i, a in enumerate(candidates) if a.category == "Obligations"]
            other_idx = [i for i in range(n) if i not in bonds_idx]
            
            # v6.9: Ajusté pour bonds_min=35% (pas 50%)
            bonds_init_weight = 0.45  # Un peu plus que bonds_min pour faciliter convergence
            
            # Bonds: 45% répartis également
            if bonds_idx:
                bond_weight = bonds_init_weight / len(bonds_idx)
                for i in bonds_idx:
                    weights[i] = bond_weight
            
            # Autres: 55% répartis également
            if other_idx:
                other_weight = (1.0 - bonds_init_weight) / len(other_idx)
                for i in other_idx:
                    weights[i] = other_weight
            
            # Normaliser à 1
            if weights.sum() > 0:
                weights = weights / weights.sum()
            else:
                weights = np.ones(n) / n
            
            return weights
        else:
            # Pour autres profils: répartition égale
            return np.ones(n) / n
    
    def _fallback_allocation(
        self,
        candidates: List[Asset],
        profile: ProfileConstraints,
        cov: Optional[np.ndarray] = None
    ) -> Dict[str, float]:
        """Allocation fallback VOL-AWARE avec diversification bonds."""
        logger.warning(f"Utilisation du fallback vol-aware pour {profile.name}")
        
        if cov is None:
            cov, _ = self.compute_covariance(candidates)
        
        vol_target = profile.vol_target / 100
        
        if profile.name == "Stable":
            sorted_candidates = sorted(candidates, key=lambda a: a.vol_annual)
        elif profile.name == "Agressif":
            sorted_candidates = sorted(candidates, key=lambda a: -a.score)
        else:
            sorted_candidates = sorted(candidates, key=lambda a: a.score - 0.02 * a.vol_annual, reverse=True)
        
        allocation = {}
        total_weight = 0.0
        
        category_weights = defaultdict(float)
        sector_weights = defaultdict(float)
        bucket_weights = defaultdict(float)
        
        bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
        
        # === Assurer bonds minimum AVEC DIVERSIFICATION ===
        bonds = sorted([a for a in sorted_candidates if a.category == "Obligations"], key=lambda x: x.vol_annual)
        bonds_needed = float(profile.bonds_min)
        max_single_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 10.0)
        min_distinct = MIN_DISTINCT_BONDS.get(profile.name, 2)
        
        n_bonds_required = max(min_distinct, int(np.ceil(bonds_needed / max_single_bond)))
        n_bonds_to_use = min(len(bonds), max(n_bonds_required, 3))
        
        if n_bonds_to_use > 0:
            weight_per_bond = min(max_single_bond, bonds_needed / n_bonds_to_use)
            
            for bond in bonds[:n_bonds_to_use]:
                weight = min(profile.max_single_position, weight_per_bond, 100 - total_weight)
                if weight > 0.5:
                    allocation[bond.id] = float(weight)
                    total_weight += weight
                    bonds_needed -= weight
                    category_weights["Obligations"] += weight
                    if bond.role:
                        bucket_weights[bond.role.value] += weight
            
            logger.info(f"P1 FIX v6.2: Distributed bonds across {len([b for b in bonds[:n_bonds_to_use] if b.id in allocation])} assets")
        
        # === Remplir par bucket selon targets ===
        for role in [Role.DEFENSIVE, Role.CORE, Role.SATELLITE, Role.LOTTERY]:
            if role not in bucket_targets:
                continue
            min_pct, max_pct = bucket_targets[role]
            target_pct = (min_pct + max_pct) / 2 * 100
            
            bucket_assets = [a for a in sorted_candidates if a.role == role and a.id not in allocation]
            
            if role == Role.DEFENSIVE:
                bucket_assets = sorted(bucket_assets, key=lambda a: a.vol_annual)
            else:
                bucket_assets = sorted(bucket_assets, key=lambda a: a.score, reverse=True)
            
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
                
                if role == Role.DEFENSIVE:
                    base_weight = min(profile.max_single_position, 12.0)
                elif role == Role.CORE:
                    base_weight = min(profile.max_single_position, 10.0)
                elif role == Role.SATELLITE:
                    base_weight = min(profile.max_single_position, 8.0)
                else:
                    base_weight = min(5.0, profile.max_single_position)
                
                weight = min(base_weight, 100 - total_weight, target_pct - current_weight)
                
                if weight > 0.5:
                    allocation[asset.id] = round(float(weight), 2)
                    total_weight += weight
                    category_weights[asset.category] += weight
                    sector_weights[asset.sector] += weight
                    bucket_weights[role.value] += weight
                    current_weight += weight
        
        # === Normaliser à 100% ===
        if total_weight > 0:
            factor = 100 / total_weight
            allocation = {k: round(float(v * factor), 2) for k, v in allocation.items()}
        
        # === Ajuster pour vol_target ===
        allocation = self._adjust_for_vol_target(allocation, candidates, profile, cov)
        
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
        
        logger.info(f"Vol adjustment: current={current_vol:.1f}%, target={vol_target:.1f}%")
        
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
                
                high_vol_sorted = sorted(high_vol_ids, key=lambda x: allocation.get(x, 0), reverse=True)
                for hv_id in high_vol_sorted:
                    if allocation.get(hv_id, 0) > transfer + 1:
                        allocation[hv_id] -= transfer
                        break
                
                low_vol_sorted = sorted(low_vol_ids, key=lambda x: allocation.get(x, 0))
                for lv_id in low_vol_sorted:
                    if allocation.get(lv_id, 0) < profile.max_single_position - transfer:
                        allocation[lv_id] = allocation.get(lv_id, 0) + transfer
                        break
                
            elif current_vol < vol_target and high_vol_ids and low_vol_ids:
                transfer = min(2.0, (vol_target - current_vol) / 2)
                
                low_vol_sorted = sorted(low_vol_ids, key=lambda x: allocation.get(x, 0), reverse=True)
                for lv_id in low_vol_sorted:
                    if allocation.get(lv_id, 0) > transfer + 1:
                        allocation[lv_id] -= transfer
                        break
                
                high_vol_sorted = sorted(high_vol_ids, key=lambda x: allocation.get(x, 0))
                for hv_id in high_vol_sorted:
                    if allocation.get(hv_id, 0) < profile.max_single_position - transfer:
                        allocation[hv_id] = allocation.get(hv_id, 0) + transfer
                        break
            else:
                break
            
            weights = np.array([allocation.get(c.id, 0) / 100 for c in candidates])
            current_vol = self._compute_portfolio_vol(weights, cov)
        
        total = sum(allocation.values())
        if total > 0 and abs(total - 100) > 0.1:
            allocation = {k: round(v * 100 / total, 2) for k, v in allocation.items()}
        
        logger.info(f"Vol after adjustment: {current_vol:.1f}% (target={vol_target:.1f}%)")
        
        return allocation
    
    def optimize(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints
    ) -> Tuple[Dict[str, float], dict]:
        """Optimisation mean-variance avec covariance hybride."""
        n = len(candidates)
        if n < profile.min_assets:
            raise ValueError(f"Pool insuffisant ({n} < {profile.min_assets})")
        
        raw_scores = np.array([_clean_float(a.score, 0.0, -100, 100) for a in candidates])
        scores = self._normalize_scores(raw_scores) * self.score_scale
        
        cov, cov_diagnostics = self.compute_covariance(candidates)
        vol_target = profile.vol_target / 100
        
        def objective(w):
            port_score = np.dot(w, scores)
            port_var = np.dot(w, np.dot(cov, w))
            port_vol = np.sqrt(max(port_var, 0))
            vol_penalty = 5.0 * (port_vol - vol_target) ** 2
            return -(port_score - vol_penalty)
        
        constraints = self._build_constraints(candidates, profile, cov)
        bounds = [(0, profile.max_single_position / 100) for _ in range(n)]
        
        # v6.8: Initialisation intelligente
        w0 = self._get_smart_initial_weights(candidates, profile)
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            result = minimize(
                objective, w0, method="SLSQP",
                bounds=bounds, constraints=constraints,
                options={"maxiter": 1000, "ftol": 1e-8}
            )
        
        if result.success:
            weights = result.x.copy()
            weights = self._enforce_asset_count(weights, candidates, profile)
            
            allocation = {}
            for i, w in enumerate(weights):
                if w > 0.005:
                    allocation[candidates[i].id] = round(float(w * 100), 2)
            
            allocation = self._adjust_to_100(allocation, profile)
            
            # === Vérifier diversification bonds POST-SLSQP ===
            bonds_in_solution = sum(
                1 for aid in allocation 
                if any(c.id == aid and c.category == "Obligations" for c in candidates)
            )
            min_bonds_required = MIN_DISTINCT_BONDS.get(profile.name, 1)
            
            if bonds_in_solution < min_bonds_required:
                logger.warning(
                    f"P1 FIX v6.3: SLSQP gave only {bonds_in_solution} bonds, "
                    f"min required = {min_bonds_required} → forcing fallback"
                )
                allocation = self._fallback_allocation(candidates, profile, cov)
                optimizer_converged = False
            else:
                optimizer_converged = True
        else:
            logger.warning(f"SLSQP failed for {profile.name}: {result.message}")
            allocation = self._fallback_allocation(candidates, profile, cov)
            optimizer_converged = False
        
        # === DEBUG LOG [FINAL] ===
        asset_by_id = {a.id: a for a in candidates}
        logger.info(f"=== [FINAL {profile.name}] Allocation details ===")
        bonds_final = []
        crypto_final = []
        
        for aid, w in sorted(allocation.items(), key=lambda x: -x[1]):
            a = asset_by_id.get(aid)
            cat = a.category if a else "??"
            name = a.name if a else "??"
            ticker = a.source_data.get("ticker", "??") if a and a.source_data else "??"
            logger.info(f"[FINAL {profile.name}] {aid} | {cat} | {ticker} | {name[:40]} | {w:.2f}%")
            if cat == "Obligations":
                bonds_final.append((aid, name, ticker, w))
            if cat == "Crypto":
                crypto_final.append((aid, name, ticker, w))
        
        # Summary bonds
        if bonds_final:
            logger.info(f"[FINAL {profile.name}] === BONDS SUMMARY: {len(bonds_final)} distinct bonds ===")
            for aid, name, ticker, w in bonds_final:
                logger.info(f"[FINAL {profile.name}] BOND: {ticker} | {name[:40]} | {w:.2f}%")
        else:
            logger.warning(f"[FINAL {profile.name}] === NO BONDS IN ALLOCATION ===")
        
        # v6.8 P3: Summary crypto
        crypto_total = sum(w for _, _, _, w in crypto_final)
        logger.info(
            f"[DIAG CRYPTO {profile.name}] selected={len(crypto_final)}, "
            f"total={crypto_total:.1f}%, max_allowed={profile.crypto_max}%"
        )
        
        # === DIAGNOSTICS ===
        final_weights = np.array([allocation.get(c.id, 0)/100 for c in candidates])
        port_vol = self._compute_portfolio_vol(final_weights, cov)
        port_score = float(np.dot(final_weights, raw_scores))
        
        sector_exposure = defaultdict(float)
        bucket_exposure = defaultdict(float)
        corporate_group_exposure = defaultdict(float)
        
        bonds_in_allocation = 0
        crypto_in_allocation = 0
        
        for asset_id, weight in allocation.items():
            asset = next((a for a in candidates if a.id == asset_id), None)
            if asset:
                sector_exposure[asset.sector] += weight
                if asset.role:
                    bucket_exposure[asset.role.value] += weight
                if asset.corporate_group:
                    corporate_group_exposure[asset.corporate_group] += weight
                if asset.category == "Obligations":
                    bonds_in_allocation += 1
                if asset.category == "Crypto":
                    crypto_in_allocation += 1
        
        bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
        bucket_compliance = {}
        for role in Role:
            actual = float(bucket_exposure.get(role.value, 0))
            if role in bucket_targets:
                min_pct, max_pct = bucket_targets[role]
                bucket_compliance[role.value] = {
                    "actual": round(actual, 1),
                    "target_min": round(float(min_pct * 100), 0),
                    "target_max": round(float(max_pct * 100), 0),
                    "in_range": bool(min_pct * 100 - 5 <= actual <= max_pct * 100 + 5),
                }
        
        diagnostics = to_python_native({
            "converged": optimizer_converged,
            "message": str(result.message) if result.success else "Fallback vol-aware",
            "portfolio_vol": round(port_vol, 2),
            "vol_target": profile.vol_target,
            "vol_tolerance": profile.vol_tolerance,  # v6.8: Inclure dans diag
            "vol_diff": round(port_vol - profile.vol_target, 2),
            "portfolio_score": round(port_score, 3),
            "n_assets": len(allocation),
            "n_bonds": bonds_in_allocation,
            "n_crypto": crypto_in_allocation,  # v6.8 P3
            "crypto_max_allowed": profile.crypto_max,  # v6.8 P3
            "sectors": dict(sector_exposure),
            "bucket_exposure": dict(bucket_exposure),
            "bucket_compliance": bucket_compliance,
            "corporate_group_exposure": dict(corporate_group_exposure),
            "covariance_method": cov_diagnostics.get("method", "unknown"),
            "covariance_empirical_weight": cov_diagnostics.get("empirical_weight", 0),
            "buffett_hard_filter_enabled": self.buffett_hard_filter_enabled,
            "buffett_min_score": self.buffett_min_score,
        })
        
        logger.info(
            f"{profile.name}: {len(allocation)} actifs ({bonds_in_allocation} bonds, {crypto_in_allocation} crypto), "
            f"vol={port_vol:.1f}% (cible={profile.vol_target}%, tol=±{profile.vol_tolerance}%), "
            f"cov_method={cov_diagnostics.get('method')}"
        )
        
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
    
    def _adjust_to_100(self, allocation: Dict[str, float], profile: ProfileConstraints) -> Dict[str, float]:
        """Ajustement à 100%."""
        total = sum(allocation.values())
        if abs(total - 100) < 0.01:
            return allocation
        
        diff = 100 - total
        candidates_for_adjust = [
            (k, v) for k, v in allocation.items()
            if v + diff <= profile.max_single_position and v + diff >= 0.5
        ]
        
        if candidates_for_adjust:
            target_id = max(candidates_for_adjust, key=lambda x: x[1])[0]
            allocation[target_id] = round(float(allocation[target_id] + diff), 2)
        else:
            if total > 0:
                for k in allocation:
                    allocation[k] = round(float(allocation[k] * 100 / total), 2)
        
        return allocation
    
    def build_portfolio(
        self, 
        universe: List[Asset], 
        profile_name: str
    ) -> Tuple[Dict[str, float], dict]:
        """Pipeline complet: déduplication + Buffett hard filter + buckets + optimisation."""
        profile = PROFILES[profile_name]
        candidates = self.select_candidates(universe, profile)
        
        if len(candidates) < profile.min_assets:
            raise ValueError(
                f"Univers insuffisant pour {profile_name}: "
                f"{len(candidates)} candidats < {profile.min_assets} requis"
            )
        
        return self.optimize(candidates, profile)


# ============= CONVERSION UNIVERS v6.7 =============

def convert_universe_to_assets(universe: Union[List[dict], Dict[str, List[dict]]]) -> List[Asset]:
    """
    Convertit l'univers scoré en List[Asset].
    
    v6.7 FIX: Génération robuste des IDs avec _is_valid_id().
    """
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
            
            # === v6.7 FIX: Génération robuste des IDs ===
            raw_id = item.get("id")
            raw_ticker = item.get("ticker")
            raw_symbol = item.get("symbol")
            raw_isin = item.get("isin")
            raw_name = item.get("name", "")
            
            if cat_normalized == "Obligations":
                if _is_valid_id(raw_symbol):
                    original_id = str(raw_symbol).strip()
                elif _is_valid_id(raw_isin):
                    original_id = str(raw_isin).strip()
                elif _is_valid_id(raw_ticker):
                    original_id = str(raw_ticker).strip()
                elif _is_valid_id(raw_name):
                    safe_name = str(raw_name)[:25].replace(" ", "_")
                    original_id = f"BOND_{safe_name}_{len(assets)+1}"
                else:
                    original_id = f"BOND_{len(assets)+1}"
            
            elif cat_normalized == "Crypto":
                if _is_valid_id(raw_symbol):
                    original_id = str(raw_symbol).strip()
                elif _is_valid_id(raw_id):
                    original_id = str(raw_id).strip()
                elif _is_valid_id(raw_name):
                    original_id = str(raw_name).strip()
                else:
                    original_id = f"CRYPTO_{len(assets)+1}"
            
            else:
                if _is_valid_id(raw_id):
                    original_id = str(raw_id).strip()
                elif _is_valid_id(raw_ticker):
                    original_id = str(raw_ticker).strip()
                elif _is_valid_id(raw_symbol):
                    original_id = str(raw_symbol).strip()
                elif _is_valid_id(raw_isin):
                    original_id = str(raw_isin).strip()
                elif _is_valid_id(raw_name):
                    original_id = str(raw_name).strip()
                else:
                    original_id = f"ASSET_{len(assets)+1}"
            
            raw_vol = item.get("vol_3y") or item.get("vol30") or item.get("vol_annual") or item.get("vol")
            vol_annual = _clean_float(raw_vol, default_vol, 1.0, 150.0)
            
            raw_score = item.get("score") or item.get("composite_score") or item.get("adjusted_score")
            score = _clean_float(raw_score, 0.0, -100, 100)
            
            asset = Asset(
                id=original_id,
                name=item.get("name", original_id),
                category=cat_normalized,
                sector=item.get("sector", "Unknown"),
                region=item.get("country", item.get("region", "Global")),
                score=score,
                vol_annual=vol_annual,
                source_data=item,
                buffett_score=item.get("buffett_score"),
            )
            
            if cat_normalized == "Actions":
                asset.corporate_group = get_corporate_group(asset.name)
            
            assets.append(asset)
        
        logger.info(f"Univers converti: {len(assets)} actifs")
        return assets
    
    # Dict format
    for eq in universe.get("equities", []):
        original_id = eq.get("id") or eq.get("ticker") or eq.get("symbol") or eq.get("name", "")
        if not original_id:
            original_id = f"EQ_{len(assets)+1}"
        
        asset = Asset(
            id=original_id,
            name=eq.get("name", original_id),
            category="Actions",
            sector=eq.get("sector", "Unknown"),
            region=eq.get("country", "Global"),
            score=_clean_float(eq.get("score") or eq.get("composite_score"), 0.0, -100, 100),
            vol_annual=_clean_float(eq.get("vol_3y") or eq.get("vol_annual"), 25.0, 1.0, 150.0),
            source_data=eq,
            buffett_score=eq.get("buffett_score"),
        )
        asset.corporate_group = get_corporate_group(asset.name)
        assets.append(asset)
    
    for etf in universe.get("etfs", []):
        original_id = etf.get("id") or etf.get("ticker") or etf.get("isin") or etf.get("name", "")
        if not original_id:
            original_id = f"ETF_{len([a for a in assets if 'ETF' in a.id])+1}"
        
        assets.append(Asset(
            id=original_id,
            name=etf.get("name", original_id),
            category="ETF",
            sector=etf.get("sector", "Diversified"),
            region=etf.get("country", "Global"),
            score=_clean_float(etf.get("score") or etf.get("composite_score"), 0.0, -100, 100),
            vol_annual=_clean_float(etf.get("vol_3y") or etf.get("vol30"), 15.0, 1.0, 150.0),
            source_data=etf,
        ))
    
    for bond in universe.get("bonds", []):
        raw_symbol = bond.get("symbol")
        raw_isin = bond.get("isin")
        raw_id = bond.get("id")
        raw_name = bond.get("name", "")
        
        if _is_valid_id(raw_symbol):
            original_id = str(raw_symbol).strip()
        elif _is_valid_id(raw_isin):
            original_id = str(raw_isin).strip()
        elif _is_valid_id(raw_id):
            original_id = str(raw_id).strip()
        elif _is_valid_id(raw_name):
            safe_name = str(raw_name)[:25].replace(" ", "_")
            original_id = f"BOND_{safe_name}_{len(assets)+1}"
        else:
            original_id = f"BOND_{len([a for a in assets if 'BOND' in a.id])+1}"
        
        assets.append(Asset(
            id=original_id,
            name=bond.get("name", original_id),
            category="Obligations",
            sector="Bonds",
            region=bond.get("country", "Global"),
            score=_clean_float(bond.get("score") or bond.get("composite_score"), 0.0, -100, 100),
            vol_annual=_clean_float(bond.get("vol_3y") or bond.get("vol30"), 5.0, 1.0, 50.0),
            source_data=bond,
        ))
    
    for cr in universe.get("crypto", []):
        original_id = cr.get("id") or cr.get("symbol") or cr.get("name", "")
        if not original_id:
            original_id = f"CRYPTO_{len([a for a in assets if 'CRYPTO' in a.id])+1}"
        
        assets.append(Asset(
            id=original_id,
            name=cr.get("name", original_id),
            category="Crypto",
            sector="Crypto",
            region="Global",
            score=_clean_float(cr.get("score") or cr.get("composite_score"), 0.0, -100, 100),
            vol_annual=_clean_float(cr.get("vol_3y") or cr.get("vol30"), 80.0, 10.0, 200.0),
            source_data=cr,
        ))
    
    logger.info(f"Univers converti: {len(assets)} actifs")
    return assets


# ============= VALIDATION =============

def validate_portfolio(
    allocation: Dict[str, float],
    assets: List[Asset],
    profile: ProfileConstraints
) -> Tuple[bool, List[str]]:
    """Validation post-optimisation."""
    errors = []
    warnings_list = []
    
    total = sum(allocation.values())
    if abs(total - 100) > 0.1:
        errors.append(f"Somme = {total:.2f}% (≠ 100%)")
    
    n_assets = len(allocation)
    if n_assets < profile.min_assets:
        warnings_list.append(f"Seulement {n_assets} lignes (< {profile.min_assets})")
    if n_assets > profile.max_assets:
        warnings_list.append(f"{n_assets} lignes (> {profile.max_assets})")
    
    for asset_id, weight in allocation.items():
        if weight > profile.max_single_position + 0.1:
            errors.append(f"{asset_id}: {weight:.2f}% > max {profile.max_single_position}%")
    
    asset_lookup = {a.id: a for a in assets}
    category_weights = defaultdict(float)
    sector_weights = defaultdict(float)
    bucket_weights = defaultdict(float)
    
    for asset_id, weight in allocation.items():
        asset = asset_lookup.get(asset_id)
        if asset:
            category_weights[asset.category] += weight
            sector_weights[asset.sector] += weight
            if asset.role:
                bucket_weights[asset.role.value] += weight
    
    if category_weights["Crypto"] > profile.crypto_max + 0.1:
        errors.append(f"Crypto = {category_weights['Crypto']:.2f}% > max {profile.crypto_max}%")
    
    if category_weights["Obligations"] < profile.bonds_min - 0.1:
        errors.append(f"Bonds = {category_weights['Obligations']:.2f}% < min {profile.bonds_min}%")
    
    for sector, weight in sector_weights.items():
        if weight > profile.max_sector + 0.1:
            errors.append(f"Secteur {sector} = {weight:.2f}% > max {profile.max_sector}%")
    
    is_valid = len(errors) == 0
    all_issues = errors + [f"⚠️ {w}" for w in warnings_list]
    
    return is_valid, all_issues
