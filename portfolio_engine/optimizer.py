# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v5 — Avec buckets Core/Satellite/Défensif/Lottery.

Phase 2:
1. Intégration PROFILE_BUCKET_TARGETS depuis preset_meta
2. Assignment automatique des actifs aux buckets/rôles
3. Contraintes min/max par bucket selon le profil
4. Diagnostics enrichis par bucket
5. Déduplication ETF par exposition (Phase 1)
"""

import numpy as np
from scipy.optimize import minimize
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Union, Set
from collections import defaultdict
import warnings
import logging

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
    )
    HAS_PRESET_META = True
except ImportError:
    HAS_PRESET_META = False
    ETF_EXPOSURE_EQUIVALENTS = {}
    # Fallback Role enum
    from enum import Enum
    class Role(Enum):
        CORE = "core"
        SATELLITE = "satellite"
        DEFENSIVE = "defensive"
        LOTTERY = "lottery"
    
    # Fallback bucket targets
    PROFILE_BUCKET_TARGETS = {
        "Stable": {Role.CORE: (0.30, 0.40), Role.DEFENSIVE: (0.45, 0.60), Role.SATELLITE: (0.05, 0.15), Role.LOTTERY: (0.00, 0.00)},
        "Modéré": {Role.CORE: (0.45, 0.55), Role.DEFENSIVE: (0.20, 0.30), Role.SATELLITE: (0.15, 0.25), Role.LOTTERY: (0.00, 0.02)},
        "Agressif": {Role.CORE: (0.35, 0.45), Role.DEFENSIVE: (0.05, 0.15), Role.SATELLITE: (0.35, 0.50), Role.LOTTERY: (0.00, 0.05)},
    }

logger = logging.getLogger("portfolio_engine.optimizer")


@dataclass
class ProfileConstraints:
    """Contraintes par profil — vol_target est indicatif (pénalité douce)."""
    name: str
    vol_target: float           # Volatilité cible (%) — pénalité douce
    vol_tolerance: float = 3.0  # Tolérance autour de vol_target (±%)
    crypto_max: float = 10.0
    bonds_min: float = 5.0
    max_single_position: float = 15.0
    max_sector: float = 30.0    # Contrainte appliquée
    max_region: float = 50.0    # Contrainte appliquée
    min_assets: int = 10        # Souple: 10-18
    max_assets: int = 18        # Souple: 10-18


PROFILES = {
    "Agressif": ProfileConstraints(
        name="Agressif", vol_target=18.0, crypto_max=10.0, bonds_min=5.0
    ),
    "Modéré": ProfileConstraints(
        name="Modéré", vol_target=12.0, crypto_max=5.0, bonds_min=15.0
    ),
    "Stable": ProfileConstraints(
        name="Stable", vol_target=8.0, crypto_max=0.0, bonds_min=40.0
    ),
}


@dataclass
class Asset:
    """Actif avec ID ORIGINAL préservé et bucket assignment."""
    id: str                     # ID original (ticker, ISIN, etc.)
    name: str
    category: str
    sector: str
    region: str
    score: float
    vol_annual: float
    returns_series: Optional[np.ndarray] = None
    source_data: Optional[dict] = field(default=None, repr=False)
    exposure: Optional[str] = None  # Pour ETF: "gold", "world", "em", etc.
    preset: Optional[str] = None    # Preset assigné (quality_premium, defensif, etc.)
    role: Optional[Role] = None     # Bucket: CORE, SATELLITE, DEFENSIVE, LOTTERY


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

# Mapping catégorie + caractéristiques → preset
def assign_preset_to_asset(asset: Asset) -> Tuple[Optional[str], Optional[Role]]:
    """
    Assigne un preset et un rôle (bucket) à un actif basé sur ses caractéristiques.
    
    Returns:
        (preset_name, Role) ou (None, None) si non assignable
    """
    category = asset.category
    vol = asset.vol_annual
    score = asset.score
    sector = asset.sector.lower() if asset.sector else ""
    name_lower = asset.name.lower() if asset.name else ""
    
    # === OBLIGATIONS / CASH ===
    if category == "Obligations":
        # Ultra-short / Money market
        if any(kw in name_lower for kw in ["ultra short", "money market", "1-3 month", "boxx", "bil"]):
            return "cash_ultra_short", Role.DEFENSIVE
        # Investment grade
        return "defensif_oblig", Role.DEFENSIVE
    
    # === CRYPTO ===
    if category == "Crypto":
        # BTC/ETH = quality_risk
        if any(kw in name_lower for kw in ["bitcoin", "btc", "ethereum", "eth"]):
            return "quality_risk", Role.CORE
        # High vol = lottery
        if vol > 100:
            return "highvol_lottery", Role.LOTTERY
        # Momentum/swing
        if vol > 60:
            return "momentum24h", Role.LOTTERY
        return "trend3_12m", Role.SATELLITE
    
    # === ETF ===
    if category == "ETF":
        exposure = asset.exposure
        
        # Gold / Precious metals
        if exposure in ["gold", "precious_metals"]:
            return "or_physique", Role.DEFENSIVE
        
        # World / Developed core
        if exposure in ["world", "sp500"]:
            if vol < 15:
                return "min_vol_global", Role.DEFENSIVE
            return "coeur_global", Role.CORE
        
        # Emerging markets
        if exposure == "emerging_markets":
            return "emergents", Role.SATELLITE
        
        # Tech / Growth
        if exposure in ["nasdaq", "tech"]:
            return "croissance_tech", Role.SATELLITE
        
        # Bonds
        if exposure in ["bonds_ig", "bonds_treasury"]:
            return "defensif_oblig", Role.DEFENSIVE
        
        # Cash
        if exposure == "cash":
            return "cash_ultra_short", Role.DEFENSIVE
        
        # Min vol
        if exposure == "min_vol" or "min vol" in name_lower or "low vol" in name_lower:
            return "min_vol_global", Role.DEFENSIVE
        
        # Dividend / Income
        if exposure == "dividend" or "dividend" in name_lower:
            return "rendement_etf", Role.CORE
        
        # Inflation
        if exposure in ["inflation", "commodities"]:
            return "inflation_shield", Role.DEFENSIVE
        
        # Default ETF
        return "coeur_global", Role.CORE
    
    # === ACTIONS ===
    if category == "Actions":
        # Analyse basée sur vol et score
        
        # Utilities, Consumer Staples = défensif
        if any(kw in sector for kw in ["utilities", "consumer staples", "healthcare", "pharma"]):
            if vol < 20:
                return "defensif", Role.DEFENSIVE
            return "low_volatility", Role.CORE
        
        # Score élevé + vol modérée = Quality
        if score >= 70 and vol < 25:
            return "quality_premium", Role.CORE
        
        # Dividend keywords
        if any(kw in name_lower for kw in ["dividend", "yield", "income"]):
            return "value_dividend", Role.CORE
        
        # Low vol
        if vol < 18:
            return "low_volatility", Role.CORE
        
        # Score modéré + vol modérée = Value
        if score >= 50 and vol < 30:
            return "value_dividend", Role.CORE
        
        # Tech, Growth sectors
        if any(kw in sector for kw in ["technology", "tech", "software", "semiconductor"]):
            if vol > 35:
                return "agressif", Role.SATELLITE
            return "croissance", Role.SATELLITE
        
        # Cyclical sectors
        if any(kw in sector for kw in ["materials", "industrials", "energy", "mining"]):
            if vol > 35:
                return "recovery", Role.SATELLITE
            return "momentum_trend", Role.SATELLITE
        
        # High vol + high score = momentum
        if vol > 30 and score > 60:
            return "momentum_trend", Role.SATELLITE
        
        # High vol = agressif
        if vol > 35:
            return "agressif", Role.SATELLITE
        
        # Default: croissance
        return "croissance", Role.SATELLITE
    
    # Fallback
    return None, Role.SATELLITE


def enrich_assets_with_buckets(assets: List[Asset]) -> List[Asset]:
    """
    Enrichit tous les actifs avec leur preset et rôle (bucket).
    """
    for asset in assets:
        if asset.preset is None or asset.role is None:
            preset, role = assign_preset_to_asset(asset)
            asset.preset = preset
            asset.role = role
    
    # Log distribution
    role_counts = defaultdict(int)
    for asset in assets:
        if asset.role:
            role_counts[asset.role.value] += 1
    
    logger.info(f"Bucket distribution: {dict(role_counts)}")
    return assets


# ============= ETF EXPOSURE DETECTION =============

ETF_NAME_TO_EXPOSURE = {
    # Gold
    "gold": "gold", "or": "gold", "gld": "gold", "iau": "gold",
    "gldm": "gold", "sgol": "gold", "iaum": "gold", "aaau": "gold",
    "gltr": "precious_metals",
    # World / Developed
    "world": "world", "msci world": "world", "urth": "world",
    "vt": "world", "acwi": "world", "iwda": "world", "vwrl": "world",
    # S&P 500
    "s&p 500": "sp500", "s&p500": "sp500", "spy": "sp500",
    "ivv": "sp500", "voo": "sp500",
    # Nasdaq / Tech
    "nasdaq": "nasdaq", "qqq": "nasdaq", "tech": "tech", "technology": "tech",
    # Emerging Markets
    "emerging": "emerging_markets", "em": "emerging_markets",
    "eem": "emerging_markets", "vwo": "emerging_markets", "iemg": "emerging_markets",
    # Bonds
    "treasury": "bonds_treasury", "tlt": "bonds_treasury", "ief": "bonds_treasury",
    "shy": "bonds_treasury", "investment grade": "bonds_ig",
    "corporate bond": "bonds_ig", "lqd": "bonds_ig", "agg": "bonds_ig", "bnd": "bonds_ig",
    # Cash / Ultra-short
    "money market": "cash", "ultra short": "cash", "boxx": "cash",
    "bil": "cash", "shv": "cash",
    # Min Vol
    "min vol": "min_vol", "minimum volatility": "min_vol", "low vol": "min_vol",
    # Dividend
    "dividend": "dividend", "high yield": "dividend", "income": "dividend",
    # Commodities
    "commodity": "commodities", "commodities": "commodities",
    "inflation": "inflation", "tips": "inflation",
}


def detect_etf_exposure(asset: Asset) -> Optional[str]:
    """Détecte l'exposition d'un ETF basé sur son nom/ticker."""
    if asset.category not in ["ETF", "Obligations"]:
        return None
    
    search_text = f"{asset.name} {asset.id}".lower()
    
    for keyword, exposure in ETF_NAME_TO_EXPOSURE.items():
        if keyword in search_text:
            return exposure
    
    asset_id_upper = asset.id.upper()
    for exposure, tickers in ETF_EXPOSURE_EQUIVALENTS.items():
        if asset_id_upper in [t.upper() for t in tickers]:
            return exposure
    
    return None


def deduplicate_etfs(assets: List[Asset], prefer_by: str = "score") -> List[Asset]:
    """Déduplique les ETF par exposition."""
    etfs = []
    non_etfs = []
    
    for asset in assets:
        if asset.category in ["ETF", "Obligations"]:
            exposure = detect_etf_exposure(asset)
            asset.exposure = exposure
            etfs.append(asset)
        else:
            non_etfs.append(asset)
    
    exposure_groups: Dict[Optional[str], List[Asset]] = defaultdict(list)
    for etf in etfs:
        exposure_groups[etf.exposure].append(etf)
    
    deduplicated_etfs = []
    removed_count = 0
    
    for exposure, group in exposure_groups.items():
        if exposure is None:
            deduplicated_etfs.extend(group)
        else:
            sorted_group = sorted(group, key=lambda a: a.score, reverse=True)
            best = sorted_group[0]
            deduplicated_etfs.append(best)
            
            if len(sorted_group) > 1:
                removed_count += len(sorted_group) - 1
                logger.info(f"ETF dedup [{exposure}]: kept '{best.name}'")
    
    if removed_count > 0:
        logger.info(f"ETF deduplication: removed {removed_count} redundant ETFs")
    
    return non_etfs + deduplicated_etfs


class PortfolioOptimizer:
    """
    Optimiseur mean-variance avec buckets et déduplication ETF.
    """
    
    def __init__(
        self, 
        score_scale: float = 1.0, 
        deduplicate_etfs: bool = True,
        use_bucket_constraints: bool = True
    ):
        """
        Args:
            score_scale: Facteur d'échelle pour les scores
            deduplicate_etfs: Activer la déduplication ETF par exposition
            use_bucket_constraints: Activer les contraintes min/max par bucket
        """
        self.score_scale = score_scale
        self.deduplicate_etfs_enabled = deduplicate_etfs
        self.use_bucket_constraints = use_bucket_constraints
    
    def select_candidates(
        self, 
        universe: List[Asset], 
        profile: ProfileConstraints
    ) -> List[Asset]:
        """
        Pré-sélection avec déduplication ETF et enrichissement buckets.
        """
        # === ÉTAPE 1: Déduplication ETF ===
        if self.deduplicate_etfs_enabled:
            universe = deduplicate_etfs(universe, prefer_by="score")
            logger.info(f"Post-dedup universe: {len(universe)} actifs")
        
        # === ÉTAPE 2: Enrichir avec buckets ===
        universe = enrich_assets_with_buckets(universe)
        
        # === ÉTAPE 3: Tri par score ===
        sorted_assets = sorted(universe, key=lambda x: x.score, reverse=True)
        
        # === ÉTAPE 4: Sélection diversifiée par bucket ===
        selected = []
        sector_count = defaultdict(int)
        category_count = defaultdict(int)
        exposure_count = defaultdict(int)
        bucket_count = defaultdict(int)
        
        target_pool = profile.max_assets * 3
        
        # Get bucket targets for this profile
        bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
        
        for asset in sorted_assets:
            if len(selected) >= target_pool:
                break
            
            # Contrainte Crypto
            if asset.category == "Crypto":
                if profile.crypto_max == 0:
                    continue
                if category_count["Crypto"] >= 3:
                    continue
            
            # Contrainte secteur
            if sector_count[asset.sector] >= 8:
                continue
            
            # Contrainte exposition ETF
            if asset.exposure and exposure_count[asset.exposure] >= 2:
                continue
            
            # Contrainte bucket (éviter trop de lottery)
            if asset.role == Role.LOTTERY and bucket_count["lottery"] >= 2:
                continue
            
            selected.append(asset)
            sector_count[asset.sector] += 1
            category_count[asset.category] += 1
            if asset.exposure:
                exposure_count[asset.exposure] += 1
            if asset.role:
                bucket_count[asset.role.value] += 1
        
        logger.info(f"Pool candidats: {len(selected)} actifs pour {profile.name}")
        logger.info(f"Buckets pool: {dict(bucket_count)}")
        
        return selected
    
    def compute_covariance(self, assets: List[Asset]) -> np.ndarray:
        """Matrice de covariance régularisée."""
        n = len(assets)
        
        if all(a.returns_series is not None and len(a.returns_series) >= 60 for a in assets):
            returns = np.column_stack([a.returns_series for a in assets])
            returns = np.nan_to_num(returns, nan=0.0, posinf=0.0, neginf=0.0)
            cov = np.cov(returns, rowvar=False) * 252
            cov = self._ensure_positive_definite(cov)
            return cov
        
        cov = np.zeros((n, n))
        
        CORR_SAME_CATEGORY = 0.60
        CORR_SAME_SECTOR = 0.45
        CORR_SAME_EXPOSURE = 0.85
        CORR_SAME_BUCKET = 0.50  # Assets in same bucket are somewhat correlated
        CORR_EQUITY_BOND = -0.20
        CORR_CRYPTO_OTHER = 0.25
        CORR_DEFAULT = 0.15
        
        DEFAULT_VOLS = {"Actions": 25.0, "ETF": 15.0, "Obligations": 5.0, "Crypto": 80.0}
        
        for i, ai in enumerate(assets):
            for j, aj in enumerate(assets):
                default_vol_i = DEFAULT_VOLS.get(ai.category, 15.0)
                default_vol_j = DEFAULT_VOLS.get(aj.category, 15.0)
                
                vol_i = _clean_float(ai.vol_annual, default_vol_i, 1.0, 150.0) / 100
                vol_j = _clean_float(aj.vol_annual, default_vol_j, 1.0, 150.0) / 100
                
                if i == j:
                    cov[i, j] = vol_i ** 2
                else:
                    if ai.exposure and aj.exposure and ai.exposure == aj.exposure:
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
        
        cov = self._ensure_positive_definite(cov)
        return cov
    
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
            cov_fixed = (cov_fixed + cov_fixed.T) / 2
            return cov_fixed
        except Exception as e:
            logger.warning(f"Eigenvalue decomposition failed: {e}")
            diag_vals = np.maximum(np.diag(cov), min_eigenvalue)
            return np.diag(diag_vals)
    
    def _compute_portfolio_vol(self, weights: np.ndarray, cov: np.ndarray) -> float:
        """Calcul robuste de la volatilité du portefeuille."""
        try:
            weights = np.nan_to_num(weights, nan=0.0, posinf=0.0, neginf=0.0)
            variance = np.dot(weights, np.dot(cov, weights))
            if variance < 0 or np.isnan(variance) or np.isinf(variance):
                variance = 0
            vol = np.sqrt(variance) * 100
            if np.isnan(vol) or np.isinf(vol):
                individual_vols = np.sqrt(np.maximum(np.diag(cov), 0)) * 100
                vol = np.dot(np.abs(weights), individual_vols)
            return float(vol) if not np.isnan(vol) else 15.0
        except Exception:
            return 15.0
    
    def _build_constraints(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints,
        cov: np.ndarray
    ) -> List[dict]:
        """Construit les contraintes incluant les buckets."""
        n = len(candidates)
        constraints = []
        
        # 1. Somme = 100%
        constraints.append({
            "type": "eq",
            "fun": lambda w: np.sum(w) - 1.0
        })
        
        # 2. Bonds minimum
        bonds_idx = [i for i, a in enumerate(candidates) if a.category == "Obligations"]
        if bonds_idx and profile.bonds_min > 0:
            def bonds_constraint(w, idx=bonds_idx, min_val=profile.bonds_min/100):
                return np.sum(w[idx]) - min_val
            constraints.append({"type": "ineq", "fun": bonds_constraint})
        
        # 3. Crypto maximum
        crypto_idx = [i for i, a in enumerate(candidates) if a.category == "Crypto"]
        if crypto_idx:
            def crypto_constraint(w, idx=crypto_idx, max_val=profile.crypto_max/100):
                return max_val - np.sum(w[idx])
            constraints.append({"type": "ineq", "fun": crypto_constraint})
        
        # 4. Contraintes par SECTEUR
        sectors = set(a.sector for a in candidates)
        for sector in sectors:
            sector_idx = [i for i, a in enumerate(candidates) if a.sector == sector]
            if len(sector_idx) > 1:
                def sector_constraint(w, idx=sector_idx, max_val=profile.max_sector/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": sector_constraint})
        
        # 5. Contraintes par RÉGION
        regions = set(a.region for a in candidates)
        for region in regions:
            region_idx = [i for i, a in enumerate(candidates) if a.region == region]
            if len(region_idx) > 1:
                def region_constraint(w, idx=region_idx, max_val=profile.max_region/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": region_constraint})
        
        # 6. Contraintes par EXPOSITION ETF
        exposures = set(a.exposure for a in candidates if a.exposure)
        for exposure in exposures:
            exposure_idx = [i for i, a in enumerate(candidates) if a.exposure == exposure]
            if len(exposure_idx) > 1:
                def exposure_constraint(w, idx=exposure_idx, max_val=0.20):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": exposure_constraint})
        
        # === 7. NEW: Contraintes par BUCKET (Phase 2) ===
        if self.use_bucket_constraints:
            bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
            
            for role in Role:
                if role not in bucket_targets:
                    continue
                
                min_pct, max_pct = bucket_targets[role]
                role_idx = [i for i, a in enumerate(candidates) if a.role == role]
                
                if not role_idx:
                    continue
                
                # Contrainte minimum (avec tolérance de 5% pour éviter infeasible)
                if min_pct > 0:
                    adjusted_min = max(0, min_pct - 0.05)  # Relaxer légèrement
                    def bucket_min_constraint(w, idx=role_idx, min_val=adjusted_min):
                        return np.sum(w[idx]) - min_val
                    constraints.append({"type": "ineq", "fun": bucket_min_constraint})
                
                # Contrainte maximum (avec tolérance de 5%)
                if max_pct < 1.0:
                    adjusted_max = min(1.0, max_pct + 0.05)  # Relaxer légèrement
                    def bucket_max_constraint(w, idx=role_idx, max_val=adjusted_max):
                        return max_val - np.sum(w[idx])
                    constraints.append({"type": "ineq", "fun": bucket_max_constraint})
                
                logger.debug(f"Bucket constraint {role.value}: {min_pct*100:.0f}%-{max_pct*100:.0f}%")
        
        return constraints
    
    def _normalize_scores(self, scores: np.ndarray) -> np.ndarray:
        """Normalisation des scores."""
        scores = np.nan_to_num(scores, nan=0.0)
        if scores.std() < 1e-6:
            return np.zeros_like(scores)
        return (scores - scores.mean()) / scores.std()
    
    def _fallback_allocation(
        self,
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """Allocation fallback basée sur les scores et buckets."""
        logger.warning(f"Utilisation du fallback score-based pour {profile.name}")
        
        sorted_candidates = sorted(candidates, key=lambda a: a.score, reverse=True)
        
        allocation = {}
        total_weight = 0
        
        category_weights = defaultdict(float)
        sector_weights = defaultdict(float)
        exposure_weights = defaultdict(float)
        bucket_weights = defaultdict(float)
        
        # Get bucket targets
        bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
        
        # D'abord, assurer bonds minimum
        bonds = [a for a in sorted_candidates if a.category == "Obligations"]
        bonds_needed = profile.bonds_min
        
        for bond in bonds[:8]:
            if bonds_needed <= 0:
                break
            weight = min(profile.max_single_position, bonds_needed, 100 - total_weight)
            if weight > 0.5:
                allocation[bond.id] = weight
                total_weight += weight
                bonds_needed -= weight
                category_weights["Obligations"] += weight
                sector_weights[bond.sector] += weight
                if bond.role:
                    bucket_weights[bond.role.value] += weight
        
        # Ensuite, remplir par bucket priority: DEFENSIVE -> CORE -> SATELLITE -> LOTTERY
        bucket_priority = [Role.DEFENSIVE, Role.CORE, Role.SATELLITE, Role.LOTTERY]
        
        for role in bucket_priority:
            if role not in bucket_targets:
                continue
            
            min_pct, max_pct = bucket_targets[role]
            target_for_bucket = (min_pct + max_pct) / 2 * 100  # Target midpoint
            
            # Assets in this bucket, sorted by score
            bucket_assets = [a for a in sorted_candidates if a.role == role and a.id not in allocation]
            bucket_assets.sort(key=lambda a: a.score, reverse=True)
            
            current_bucket_weight = bucket_weights.get(role.value, 0)
            
            for asset in bucket_assets:
                if len(allocation) >= profile.max_assets:
                    break
                if total_weight >= 99.5:
                    break
                if current_bucket_weight >= max_pct * 100:
                    break
                
                # Standard constraints
                if asset.category == "Crypto":
                    if category_weights["Crypto"] >= profile.crypto_max:
                        continue
                    max_allowed = profile.crypto_max - category_weights["Crypto"]
                else:
                    max_allowed = profile.max_single_position
                
                if sector_weights[asset.sector] >= profile.max_sector:
                    continue
                max_sector_allowed = profile.max_sector - sector_weights[asset.sector]
                
                if asset.exposure and exposure_weights[asset.exposure] >= 20:
                    continue
                max_exposure_allowed = 20 - exposure_weights.get(asset.exposure, 0) if asset.exposure else profile.max_single_position
                
                # Bucket-aware weight
                remaining_for_bucket = max_pct * 100 - current_bucket_weight
                target_per_asset = remaining_for_bucket / max(len(bucket_assets) - len([a for a in bucket_assets if a.id in allocation]), 1)
                
                weight = min(
                    target_per_asset,
                    max_allowed,
                    max_sector_allowed,
                    max_exposure_allowed,
                    100 - total_weight
                )
                
                if weight > 0.5:
                    allocation[asset.id] = round(weight, 2)
                    total_weight += weight
                    category_weights[asset.category] += weight
                    sector_weights[asset.sector] += weight
                    if asset.exposure:
                        exposure_weights[asset.exposure] += weight
                    bucket_weights[role.value] += weight
                    current_bucket_weight += weight
        
        # Normaliser à 100%
        if total_weight > 0:
            factor = 100 / total_weight
            allocation = {k: round(v * factor, 2) for k, v in allocation.items()}
        
        return allocation
    
    def optimize(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints
    ) -> Tuple[Dict[str, float], dict]:
        """Optimisation mean-variance avec contraintes de bucket."""
        n = len(candidates)
        if n < profile.min_assets:
            raise ValueError(f"Pool insuffisant ({n} < {profile.min_assets})")
        
        raw_scores = np.array([_clean_float(a.score, 0.0, -100, 100) for a in candidates])
        scores = self._normalize_scores(raw_scores) * self.score_scale
        
        cov = self.compute_covariance(candidates)
        vol_target = profile.vol_target / 100
        
        def objective(w):
            port_score = np.dot(w, scores)
            port_var = np.dot(w, np.dot(cov, w))
            port_vol = np.sqrt(max(port_var, 0))
            vol_penalty = 5.0 * (port_vol - vol_target) ** 2
            return -(port_score - vol_penalty)
        
        constraints = self._build_constraints(candidates, profile, cov)
        bounds = [(0, profile.max_single_position / 100) for _ in range(n)]
        
        w0 = np.ones(n) / n
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            result = minimize(
                objective,
                w0,
                method="SLSQP",
                bounds=bounds,
                constraints=constraints,
                options={"maxiter": 1000, "ftol": 1e-8}
            )
        
        if result.success:
            weights = result.x.copy()
            weights = self._enforce_asset_count(weights, candidates, profile)
            
            allocation = {}
            for i, w in enumerate(weights):
                if w > 0.005:
                    allocation[candidates[i].id] = round(w * 100, 2)
            
            allocation = self._adjust_to_100(allocation, profile)
            optimizer_converged = True
        else:
            logger.warning(f"SLSQP failed for {profile.name}: {result.message}")
            allocation = self._fallback_allocation(candidates, profile)
            optimizer_converged = False
        
        # === DIAGNOSTICS ===
        final_weights = np.array([allocation.get(c.id, 0)/100 for c in candidates])
        port_vol = self._compute_portfolio_vol(final_weights, cov)
        port_score = np.dot(final_weights, raw_scores)
        
        sector_exposure = defaultdict(float)
        etf_exposure = defaultdict(float)
        bucket_exposure = defaultdict(float)
        
        for asset_id, weight in allocation.items():
            asset = next((a for a in candidates if a.id == asset_id), None)
            if asset:
                sector_exposure[asset.sector] += weight
                if asset.exposure:
                    etf_exposure[asset.exposure] += weight
                if asset.role:
                    bucket_exposure[asset.role.value] += weight
        
        # Bucket targets vs actual
        bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
        bucket_compliance = {}
        for role in Role:
            actual = bucket_exposure.get(role.value, 0)
            if role in bucket_targets:
                min_pct, max_pct = bucket_targets[role]
                in_range = min_pct * 100 <= actual <= max_pct * 100
                bucket_compliance[role.value] = {
                    "actual": round(actual, 1),
                    "target_min": round(min_pct * 100, 0),
                    "target_max": round(max_pct * 100, 0),
                    "in_range": in_range,
                }
        
        diagnostics = {
            "converged": optimizer_converged,
            "message": result.message if result.success else "Fallback score-based",
            "portfolio_vol": round(port_vol, 2),
            "vol_target": profile.vol_target,
            "portfolio_score": round(float(port_score), 3),
            "n_assets": len(allocation),
            "sectors": dict(sector_exposure),
            "etf_exposures": dict(etf_exposure),
            "bucket_exposure": dict(bucket_exposure),
            "bucket_compliance": bucket_compliance,
            "deduplication_enabled": self.deduplicate_etfs_enabled,
            "bucket_constraints_enabled": self.use_bucket_constraints,
        }
        
        # Logging
        logger.info(
            f"{profile.name}: {len(allocation)} actifs, "
            f"vol={port_vol:.1f}% (cible={profile.vol_target}%), "
            f"converged={optimizer_converged}"
        )
        logger.info(f"  Buckets: {dict(bucket_exposure)}")
        
        # Warn if bucket out of range
        for role_name, compliance in bucket_compliance.items():
            if not compliance["in_range"]:
                logger.warning(
                    f"  ⚠️ Bucket {role_name}: {compliance['actual']:.1f}% "
                    f"(target: {compliance['target_min']:.0f}%-{compliance['target_max']:.0f}%)"
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
    
    def _adjust_to_100(
        self, 
        allocation: Dict[str, float],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
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
            allocation[target_id] = round(allocation[target_id] + diff, 2)
        else:
            if total > 0:
                for k in allocation:
                    allocation[k] = round(allocation[k] * 100 / total, 2)
        
        return allocation
    
    def build_portfolio(
        self, 
        universe: List[Asset], 
        profile_name: str
    ) -> Tuple[Dict[str, float], dict]:
        """Pipeline complet: déduplication + buckets + optimisation."""
        profile = PROFILES[profile_name]
        candidates = self.select_candidates(universe, profile)
        
        if len(candidates) < profile.min_assets:
            raise ValueError(
                f"Univers insuffisant pour {profile_name}: "
                f"{len(candidates)} candidats < {profile.min_assets} requis"
            )
        
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
            
            original_id = (
                item.get("id") or 
                item.get("ticker") or 
                item.get("symbol") or 
                item.get("isin") or 
                item.get("name", f"ASSET_{len(assets)+1}")
            )
            
            raw_vol = item.get("vol_3y") or item.get("vol30") or item.get("vol_annual") or item.get("vol")
            vol_annual = _clean_float(raw_vol, default_vol, 1.0, 150.0)
            
            raw_score = item.get("score") or item.get("composite_score") or item.get("adjusted_score")
            score = _clean_float(raw_score, 0.0, -100, 100)
            
            assets.append(Asset(
                id=original_id,
                name=item.get("name", original_id),
                category=cat_normalized,
                sector=item.get("sector", "Unknown"),
                region=item.get("country", item.get("region", "Global")),
                score=score,
                vol_annual=vol_annual,
                source_data=item,
            ))
        
        logger.info(f"Univers converti (liste plate): {len(assets)} actifs")
        return assets
    
    # Dict format
    for eq in universe.get("equities", []):
        original_id = eq.get("id") or eq.get("ticker") or eq.get("symbol") or eq.get("name", "")
        if not original_id:
            original_id = f"EQ_{len(assets)+1}"
        
        raw_vol = eq.get("vol_3y") or eq.get("vol_annual")
        vol_annual = _clean_float(raw_vol, 25.0, 1.0, 150.0)
        
        assets.append(Asset(
            id=original_id,
            name=eq.get("name", original_id),
            category="Actions",
            sector=eq.get("sector", "Unknown"),
            region=eq.get("country", "Global"),
            score=_clean_float(eq.get("score") or eq.get("composite_score"), 0.0, -100, 100),
            vol_annual=vol_annual,
            source_data=eq,
        ))
    
    for etf in universe.get("etfs", []):
        original_id = etf.get("id") or etf.get("ticker") or etf.get("isin") or etf.get("name", "")
        if not original_id:
            original_id = f"ETF_{len([a for a in assets if 'ETF' in a.id])+1}"
        
        raw_vol = etf.get("vol_3y") or etf.get("vol30")
        vol_annual = _clean_float(raw_vol, 15.0, 1.0, 150.0)
        
        assets.append(Asset(
            id=original_id,
            name=etf.get("name", original_id),
            category="ETF",
            sector=etf.get("sector", "Diversified"),
            region=etf.get("country", "Global"),
            score=_clean_float(etf.get("score") or etf.get("composite_score"), 0.0, -100, 100),
            vol_annual=vol_annual,
            source_data=etf,
        ))
    
    for bond in universe.get("bonds", []):
        original_id = bond.get("id") or bond.get("isin") or bond.get("name", "")
        if not original_id:
            original_id = f"BOND_{len([a for a in assets if 'BOND' in a.id])+1}"
        
        raw_vol = bond.get("vol_3y") or bond.get("vol30")
        vol_annual = _clean_float(raw_vol, 5.0, 1.0, 50.0)
        
        assets.append(Asset(
            id=original_id,
            name=bond.get("name", original_id),
            category="Obligations",
            sector="Bonds",
            region=bond.get("country", "Global"),
            score=_clean_float(bond.get("score") or bond.get("composite_score"), 0.0, -100, 100),
            vol_annual=vol_annual,
            source_data=bond,
        ))
    
    for cr in universe.get("crypto", []):
        original_id = cr.get("id") or cr.get("symbol") or cr.get("name", "")
        if not original_id:
            original_id = f"CRYPTO_{len([a for a in assets if 'CRYPTO' in a.id])+1}"
        
        raw_vol = cr.get("vol_3y") or cr.get("vol30")
        vol_annual = _clean_float(raw_vol, 80.0, 10.0, 200.0)
        
        assets.append(Asset(
            id=original_id,
            name=cr.get("name", original_id),
            category="Crypto",
            sector="Crypto",
            region="Global",
            score=_clean_float(cr.get("score") or cr.get("composite_score"), 0.0, -100, 100),
            vol_annual=vol_annual,
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
    """Validation post-optimisation avec buckets."""
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
    exposure_weights = defaultdict(float)
    bucket_weights = defaultdict(float)
    
    for asset_id, weight in allocation.items():
        asset = asset_lookup.get(asset_id)
        if asset:
            category_weights[asset.category] += weight
            sector_weights[asset.sector] += weight
            if asset.exposure:
                exposure_weights[asset.exposure] += weight
            if asset.role:
                bucket_weights[asset.role.value] += weight
    
    if category_weights["Crypto"] > profile.crypto_max + 0.1:
        errors.append(f"Crypto = {category_weights['Crypto']:.2f}% > max {profile.crypto_max}%")
    
    if category_weights["Obligations"] < profile.bonds_min - 0.1:
        errors.append(f"Bonds = {category_weights['Obligations']:.2f}% < min {profile.bonds_min}%")
    
    for sector, weight in sector_weights.items():
        if weight > profile.max_sector + 0.1:
            errors.append(f"Secteur {sector} = {weight:.2f}% > max {profile.max_sector}%")
    
    # Check ETF exposure
    for exposure, weight in exposure_weights.items():
        if weight > 25:
            warnings_list.append(f"ETF exposure '{exposure}' = {weight:.1f}% (élevé)")
    
    # Check bucket compliance
    bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
    for role in Role:
        actual = bucket_weights.get(role.value, 0)
        if role in bucket_targets:
            min_pct, max_pct = bucket_targets[role]
            if actual < min_pct * 100 - 5:  # 5% tolerance
                warnings_list.append(
                    f"Bucket {role.value}: {actual:.1f}% < min {min_pct*100:.0f}%"
                )
            if actual > max_pct * 100 + 5:
                warnings_list.append(
                    f"Bucket {role.value}: {actual:.1f}% > max {max_pct*100:.0f}%"
                )
    
    is_valid = len(errors) == 0
    all_issues = errors + [f"⚠️ {w}" for w in warnings_list]
    
    return is_valid, all_issues
