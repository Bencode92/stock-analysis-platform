# portfolio_engine/exposures.py
"""
Exposures Module — v1.0.0 (PR0)

SOURCE UNIQUE DE VÉRITÉ pour les expositions et métriques de concentration.

Ce module centralise TOUS les calculs d'exposition pour garantir la cohérence
entre optimizer.py et constraint_report.py.

PRINCIPES DE DESIGN:
1. PAS de defaults silencieux : role manquant → "unknown" (pas "satellite")
2. Scope explicite : region/sector peuvent être filtrés par type d'actif
3. Invariants mathématiques : HHI = Σw² × 10000, somme buckets = 1.0

USAGE:
    from portfolio_engine.exposures import (
        compute_role_exposures,
        compute_region_exposures,
        compute_sector_exposures,
        compute_all_exposures,
    )
    
    # Dans optimizer.py et constraint_report.py
    exposures = compute_all_exposures(weights, asset_data)

FEATURE FLAG:
    USE_EXPOSURES_V2 = True  # Activer pour utiliser ce module
    
    En mode dual-run, comparer les résultats avec l'ancien code et logger les diffs.

Audit trail:
- v1.0.0 (2024-12-21): Initial PR0 implementation
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any, Literal, Set
from collections import defaultdict
import logging
import math

logger = logging.getLogger("portfolio_engine.exposures")

# ============= FEATURE FLAG =============

USE_EXPOSURES_V2 = True  # Basculer à False pour désactiver et utiliser l'ancien code


# ============= TYPE DEFINITIONS =============

Role = Literal["core", "satellite", "defensive", "lottery", "unknown"]
VALID_ROLES: Set[str] = {"core", "satellite", "defensive", "lottery", "unknown"}


# ============= DATA CLASSES =============

@dataclass(frozen=True)
class ConcentrationMetrics:
    """Métriques de concentration du portefeuille."""
    hhi: float                    # Herfindahl-Hirschman Index (0-10000)
    effective_n: float            # Nombre effectif de positions
    n_positions: int              # Nombre réel de positions
    top_5_weight: float           # Poids cumulé des 5 plus grosses positions
    top_10_weight: float          # Poids cumulé des 10 plus grosses positions
    largest_position: float       # Plus grosse position
    smallest_position: float      # Plus petite position (>0)
    concentration_level: str      # well_diversified/diversified/moderately_concentrated/highly_concentrated


@dataclass
class ExposureResult:
    """
    Résultat complet des calculs d'exposition.
    
    Attributes:
        by_role: Expositions par Role (core/satellite/defensive/lottery/unknown)
        by_region: Expositions par région
        by_region_equity_only: Expositions région (equity_like uniquement)
        by_sector: Expositions par secteur (equity uniquement)
        by_category: Expositions par catégorie d'actif
        by_risk_bucket: Expositions par RiskBucket (equity_like/bond_like/etc.)
        concentration: Métriques de concentration
        unknown_weight: Poids total des actifs sans role assigné
        warnings: Liste des warnings générés
        is_execution_ready: False si unknown_weight > 0
    """
    by_role: Dict[str, float]
    by_region: Dict[str, float]
    by_region_equity_only: Dict[str, float]
    by_sector: Dict[str, float]
    by_category: Dict[str, float]
    by_risk_bucket: Dict[str, float]
    concentration: ConcentrationMetrics
    unknown_weight: float
    warnings: List[str] = field(default_factory=list)
    is_execution_ready: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour JSON."""
        return {
            "by_role": {k: round(v, 4) for k, v in self.by_role.items()},
            "by_region": {k: round(v, 4) for k, v in sorted(self.by_region.items(), key=lambda x: -x[1])},
            "by_region_equity_only": {k: round(v, 4) for k, v in sorted(self.by_region_equity_only.items(), key=lambda x: -x[1])},
            "by_sector": {k: round(v, 4) for k, v in sorted(self.by_sector.items(), key=lambda x: -x[1])},
            "by_category": {k: round(v, 4) for k, v in self.by_category.items()},
            "by_risk_bucket": {k: round(v, 4) for k, v in self.by_risk_bucket.items()},
            "concentration": {
                "hhi": round(self.concentration.hhi, 2),
                "effective_n": round(self.concentration.effective_n, 2),
                "n_positions": self.concentration.n_positions,
                "top_5_weight": round(self.concentration.top_5_weight, 4),
                "top_10_weight": round(self.concentration.top_10_weight, 4),
                "largest_position": round(self.concentration.largest_position, 4),
                "smallest_position": round(self.concentration.smallest_position, 4),
                "concentration_level": self.concentration.concentration_level,
            },
            "unknown_weight": round(self.unknown_weight, 4),
            "warnings": self.warnings,
            "is_execution_ready": self.is_execution_ready,
        }


# ============= CONCENTRATION METRICS =============

def compute_hhi(weights: Dict[str, float]) -> Tuple[float, float]:
    """
    Calcule l'indice Herfindahl-Hirschman (HHI) et le nombre effectif de positions.
    
    HHI = Σ(w_i)² × 10000 où w_i est en décimal (somme = 1)
    effective_n = 1 / Σ(w_i)² = 10000 / HHI
    
    Échelle HHI:
    - 0-1000: Well diversified (équivalent 10+ positions égales)
    - 1000-1500: Diversified
    - 1500-2500: Moderately concentrated
    - >2500: Highly concentrated
    
    Args:
        weights: Dict {asset_id: weight} où weight est en décimal (0.0-1.0)
        
    Returns:
        (hhi, effective_n)
        
    Examples:
        >>> compute_hhi({"A": 0.5, "B": 0.25, "C": 0.25})
        (3750.0, 2.67)
        >>> compute_hhi({"A": 0.1, "B": 0.1, ..., "J": 0.1})  # 10 positions égales
        (1000.0, 10.0)
    """
    if not weights:
        return 0.0, 0.0
    
    # Filtrer les poids nuls ou négatifs
    positive_weights = {k: float(v) for k, v in weights.items() if v > 0}
    
    if not positive_weights:
        return 0.0, 0.0
    
    # Calculer somme des carrés
    sum_squared = sum(w ** 2 for w in positive_weights.values())
    
    if sum_squared <= 0:
        return 0.0, 0.0
    
    hhi = sum_squared * 10000.0
    effective_n = 1.0 / sum_squared
    
    return round(hhi, 2), round(effective_n, 2)


def compute_concentration_metrics(weights: Dict[str, float]) -> ConcentrationMetrics:
    """
    Calcule toutes les métriques de concentration.
    
    Args:
        weights: Dict {asset_id: weight} en décimal
        
    Returns:
        ConcentrationMetrics avec HHI, effective_n, top_N weights, etc.
    """
    if not weights:
        return ConcentrationMetrics(
            hhi=0.0,
            effective_n=0.0,
            n_positions=0,
            top_5_weight=0.0,
            top_10_weight=0.0,
            largest_position=0.0,
            smallest_position=0.0,
            concentration_level="N/A",
        )
    
    # Filtrer et trier les poids
    positive_weights = sorted(
        [float(w) for w in weights.values() if w > 0],
        reverse=True
    )
    
    if not positive_weights:
        return ConcentrationMetrics(
            hhi=0.0,
            effective_n=0.0,
            n_positions=0,
            top_5_weight=0.0,
            top_10_weight=0.0,
            largest_position=0.0,
            smallest_position=0.0,
            concentration_level="N/A",
        )
    
    # HHI et effective_n
    hhi, effective_n = compute_hhi(weights)
    
    # Top N weights
    top_5_weight = sum(positive_weights[:5])
    top_10_weight = sum(positive_weights[:10])
    
    # Déterminer le niveau de concentration
    if hhi < 1000:
        concentration_level = "well_diversified"
    elif hhi < 1500:
        concentration_level = "diversified"
    elif hhi < 2500:
        concentration_level = "moderately_concentrated"
    else:
        concentration_level = "highly_concentrated"
    
    return ConcentrationMetrics(
        hhi=hhi,
        effective_n=effective_n,
        n_positions=len(positive_weights),
        top_5_weight=top_5_weight,
        top_10_weight=top_10_weight,
        largest_position=positive_weights[0],
        smallest_position=positive_weights[-1],
        concentration_level=concentration_level,
    )


# ============= ROLE/BUCKET EXPOSURES =============

def compute_role_exposures(
    weights: Dict[str, float],
    roles: Dict[str, str],
) -> Dict[str, float]:
    """
    Calcule les expositions par Role (bucket).
    
    IMPORTANT: Pas de default silencieux. Si un asset_id n'a pas de role,
    il est comptabilisé dans "unknown".
    
    Args:
        weights: Dict {asset_id: weight} en décimal
        roles: Dict {asset_id: role} où role ∈ {"core", "satellite", "defensive", "lottery"}
        
    Returns:
        Dict avec clés: core, satellite, defensive, lottery, unknown
        Les valeurs sont en décimal (somme ≈ 1.0)
        
    Examples:
        >>> weights = {"A": 0.4, "B": 0.3, "C": 0.3}
        >>> roles = {"A": "core", "B": "satellite"}  # C manquant
        >>> compute_role_exposures(weights, roles)
        {"core": 0.4, "satellite": 0.3, "defensive": 0.0, "lottery": 0.0, "unknown": 0.3}
    """
    out: Dict[str, float] = {
        "core": 0.0,
        "satellite": 0.0,
        "defensive": 0.0,
        "lottery": 0.0,
        "unknown": 0.0,
    }
    
    for asset_id, w in weights.items():
        if w <= 0:
            continue
            
        role = roles.get(asset_id)
        
        # Validation du role
        if role is None:
            out["unknown"] += float(w)
        elif role.lower() in VALID_ROLES:
            out[role.lower()] += float(w)
        else:
            logger.warning(f"Invalid role '{role}' for asset {asset_id}, counting as unknown")
            out["unknown"] += float(w)
    
    return out


# ============= REGION EXPOSURES =============

def compute_region_exposures(
    weights: Dict[str, float],
    regions: Dict[str, str],
    risk_buckets: Optional[Dict[str, str]] = None,
    equity_only: bool = False,
) -> Dict[str, float]:
    """
    Calcule les expositions par région.
    
    Args:
        weights: Dict {asset_id: weight} en décimal
        regions: Dict {asset_id: region}
        risk_buckets: Dict {asset_id: risk_bucket} pour filtrage equity_only
        equity_only: Si True, ne compte que equity_like et leveraged
        
    Returns:
        Dict {region: weight}
        
    Note:
        Pour max_region constraint, utiliser equity_only=True car les obligations
        n'ont pas de risque géographique (risque duration/crédit).
    """
    out: Dict[str, float] = defaultdict(float)
    
    equity_like_buckets = {"equity_like", "leveraged"}
    
    for asset_id, w in weights.items():
        if w <= 0:
            continue
        
        # Filtrage equity_only
        if equity_only and risk_buckets:
            bucket = risk_buckets.get(asset_id, "unknown")
            if bucket not in equity_like_buckets:
                continue
        
        region = regions.get(asset_id, "Unknown")
        out[region] += float(w)
    
    return dict(out)


# ============= SECTOR EXPOSURES =============

def compute_sector_exposures(
    weights: Dict[str, float],
    sectors: Dict[str, str],
    categories: Dict[str, str],
    equity_only: bool = True,
) -> Dict[str, float]:
    """
    Calcule les expositions par secteur.
    
    IMPORTANT: Sépare "equity sector" (Technology, Healthcare, etc.)
    des "category" (Obligations, ETF, etc.)
    
    Pour max_sector constraint, utiliser equity_only=True car:
    - "Bonds" n'est pas un secteur économique
    - Seules les Actions/ETF equity ont des secteurs pertinents
    
    Args:
        weights: Dict {asset_id: weight} en décimal
        sectors: Dict {asset_id: sector}
        categories: Dict {asset_id: category}
        equity_only: Si True, exclut Obligations et Crypto
        
    Returns:
        Dict {sector: weight}
    """
    out: Dict[str, float] = defaultdict(float)
    
    excluded_categories = {"Obligations", "Crypto"} if equity_only else set()
    
    for asset_id, w in weights.items():
        if w <= 0:
            continue
        
        category = categories.get(asset_id, "Unknown")
        
        if category in excluded_categories:
            continue
        
        sector = sectors.get(asset_id, "Unknown")
        out[sector] += float(w)
    
    return dict(out)


# ============= CATEGORY EXPOSURES =============

def compute_category_exposures(
    weights: Dict[str, float],
    categories: Dict[str, str],
) -> Dict[str, float]:
    """
    Calcule les expositions par catégorie d'actif.
    
    Args:
        weights: Dict {asset_id: weight} en décimal
        categories: Dict {asset_id: category}
        
    Returns:
        Dict {category: weight} ex: {"Actions": 0.4, "Obligations": 0.3, "ETF": 0.3}
    """
    out: Dict[str, float] = defaultdict(float)
    
    for asset_id, w in weights.items():
        if w <= 0:
            continue
        
        category = categories.get(asset_id, "Unknown")
        out[category] += float(w)
    
    return dict(out)


# ============= RISK BUCKET EXPOSURES =============

def compute_risk_bucket_exposures(
    weights: Dict[str, float],
    risk_buckets: Dict[str, str],
) -> Dict[str, float]:
    """
    Calcule les expositions par RiskBucket (différent de Role!).
    
    RiskBucket: equity_like, bond_like, leveraged, alternative, real_assets, crypto, unknown
    Role: core, satellite, defensive, lottery, unknown
    
    Args:
        weights: Dict {asset_id: weight} en décimal
        risk_buckets: Dict {asset_id: risk_bucket}
        
    Returns:
        Dict {risk_bucket: weight}
    """
    out: Dict[str, float] = defaultdict(float)
    
    for asset_id, w in weights.items():
        if w <= 0:
            continue
        
        bucket = risk_buckets.get(asset_id, "unknown")
        out[bucket] += float(w)
    
    return dict(out)


# ============= VALIDATION =============

def validate_weights_sum(
    weights: Dict[str, float],
    tolerance: float = 0.01,
) -> Tuple[bool, float, str]:
    """
    Valide que la somme des poids = 1.0 (± tolérance).
    
    Args:
        weights: Dict {asset_id: weight} en décimal
        tolerance: Tolérance acceptable (défaut 1%)
        
    Returns:
        (is_valid, actual_sum, message)
    """
    total = sum(float(w) for w in weights.values() if w > 0)
    
    if abs(total - 1.0) <= tolerance:
        return True, total, "OK"
    else:
        return False, total, f"Sum={total:.4f}, expected 1.0 ± {tolerance}"


def validate_exposures_sum(
    exposures: Dict[str, float],
    expected_total: float = 1.0,
    tolerance: float = 0.01,
) -> Tuple[bool, float, str]:
    """
    Valide que la somme des expositions = expected_total (± tolérance).
    
    Args:
        exposures: Dict {bucket: weight} en décimal
        expected_total: Total attendu (défaut 1.0)
        tolerance: Tolérance acceptable
        
    Returns:
        (is_valid, actual_sum, message)
    """
    total = sum(float(v) for v in exposures.values())
    
    if abs(total - expected_total) <= tolerance:
        return True, total, "OK"
    else:
        return False, total, f"Sum={total:.4f}, expected {expected_total} ± {tolerance}"


# ============= MAIN FUNCTION =============

def compute_all_exposures(
    weights: Dict[str, float],
    asset_data: Dict[str, Dict[str, Any]],
) -> ExposureResult:
    """
    Calcule TOUTES les expositions d'un portefeuille.
    
    C'est la fonction principale à utiliser dans optimizer.py et constraint_report.py.
    
    Args:
        weights: Dict {asset_id: weight} en décimal (somme ≈ 1.0)
        asset_data: Dict {asset_id: {role, region, sector, category, risk_bucket, ...}}
        
    Returns:
        ExposureResult avec toutes les métriques
        
    Example:
        weights = {"AAPL": 0.1, "BND": 0.2, "SPY": 0.7}
        asset_data = {
            "AAPL": {"role": "satellite", "region": "US", "sector": "Technology", "category": "Actions", "risk_bucket": "equity_like"},
            "BND": {"role": "defensive", "region": "US", "sector": "Bonds", "category": "Obligations", "risk_bucket": "bond_like"},
            "SPY": {"role": "core", "region": "US", "sector": "Diversified", "category": "ETF", "risk_bucket": "equity_like"},
        }
        result = compute_all_exposures(weights, asset_data)
    """
    warnings = []
    
    # Extraire les mappings
    roles = {}
    regions = {}
    sectors = {}
    categories = {}
    risk_buckets = {}
    
    for asset_id in weights.keys():
        data = asset_data.get(asset_id, {})
        
        # Role (avec warning si manquant)
        role = data.get("role")
        if role is None:
            # Essayer de récupérer depuis l'objet si c'est un enum
            role_obj = data.get("_role") or data.get("role_obj")
            if role_obj and hasattr(role_obj, "value"):
                role = role_obj.value
        
        if role:
            roles[asset_id] = role.lower() if isinstance(role, str) else str(role).lower()
        else:
            warnings.append(f"Asset {asset_id} has no role assigned → counted as unknown")
        
        # Région
        region = data.get("region") or data.get("country") or data.get("country_top") or "Unknown"
        regions[asset_id] = region
        
        # Secteur
        sector = data.get("sector") or data.get("sector_top") or "Unknown"
        sectors[asset_id] = sector
        
        # Catégorie
        category = data.get("category") or "Unknown"
        categories[asset_id] = category
        
        # Risk bucket
        bucket = data.get("risk_bucket") or data.get("_risk_bucket") or "unknown"
        risk_buckets[asset_id] = bucket
    
    # Calculer les expositions
    by_role = compute_role_exposures(weights, roles)
    by_region = compute_region_exposures(weights, regions)
    by_region_equity_only = compute_region_exposures(
        weights, regions, risk_buckets, equity_only=True
    )
    by_sector = compute_sector_exposures(weights, sectors, categories, equity_only=True)
    by_category = compute_category_exposures(weights, categories)
    by_risk_bucket = compute_risk_bucket_exposures(weights, risk_buckets)
    
    # Métriques de concentration
    concentration = compute_concentration_metrics(weights)
    
    # Unknown weight
    unknown_weight = by_role.get("unknown", 0.0)
    
    # Vérifier si execution ready
    is_execution_ready = unknown_weight < 0.001  # < 0.1%
    
    if not is_execution_ready:
        warnings.append(
            f"Portfolio has {unknown_weight*100:.1f}% in unknown role → not execution ready"
        )
    
    # Validation de la somme des poids
    is_valid, total, msg = validate_weights_sum(weights)
    if not is_valid:
        warnings.append(f"Weights sum validation failed: {msg}")
    
    return ExposureResult(
        by_role=by_role,
        by_region=by_region,
        by_region_equity_only=by_region_equity_only,
        by_sector=by_sector,
        by_category=by_category,
        by_risk_bucket=by_risk_bucket,
        concentration=concentration,
        unknown_weight=unknown_weight,
        warnings=warnings,
        is_execution_ready=is_execution_ready,
    )


# ============= DUAL-RUN COMPARISON =============

def compare_exposures(
    old_exposures: Dict[str, float],
    new_exposures: Dict[str, float],
    epsilon: float = 0.01,
) -> Dict[str, Any]:
    """
    Compare deux calculs d'expositions (pour dual-run migration).
    
    Args:
        old_exposures: Résultat de l'ancien code
        new_exposures: Résultat de exposures.py
        epsilon: Seuil de différence significative
        
    Returns:
        Dict avec les diffs et un flag "has_significant_diff"
    """
    all_keys = set(old_exposures.keys()) | set(new_exposures.keys())
    
    diffs = {}
    has_significant_diff = False
    
    for key in all_keys:
        old_val = old_exposures.get(key, 0.0)
        new_val = new_exposures.get(key, 0.0)
        diff = new_val - old_val
        
        if abs(diff) > epsilon:
            has_significant_diff = True
            diffs[key] = {
                "old": round(old_val, 4),
                "new": round(new_val, 4),
                "diff": round(diff, 4),
            }
    
    return {
        "has_significant_diff": has_significant_diff,
        "diffs": diffs,
        "epsilon": epsilon,
    }


# ============= HELPER: Extract from Asset objects =============

def extract_asset_data_from_candidates(
    candidates: List[Any],
) -> Dict[str, Dict[str, Any]]:
    """
    Extrait asset_data depuis une liste d'objets Asset.
    
    Compatible avec les dataclass Asset de optimizer.py.
    
    Args:
        candidates: List[Asset] ou List[dict]
        
    Returns:
        Dict {asset_id: {role, region, sector, category, risk_bucket}}
    """
    asset_data = {}
    
    for asset in candidates:
        # Extraire l'ID
        if hasattr(asset, "id"):
            asset_id = asset.id
        elif isinstance(asset, dict):
            asset_id = asset.get("id") or asset.get("ticker")
        else:
            continue
        
        if not asset_id:
            continue
        
        # Extraire les attributs
        data = {}
        
        # Role
        if hasattr(asset, "role"):
            role = asset.role
            if role and hasattr(role, "value"):
                data["role"] = role.value
            elif role:
                data["role"] = str(role)
        elif isinstance(asset, dict):
            data["role"] = asset.get("role")
        
        # Region
        if hasattr(asset, "region"):
            data["region"] = asset.region
        elif isinstance(asset, dict):
            data["region"] = asset.get("region") or asset.get("country")
        
        # Sector
        if hasattr(asset, "sector"):
            data["sector"] = asset.sector
        elif isinstance(asset, dict):
            data["sector"] = asset.get("sector")
        
        # Category
        if hasattr(asset, "category"):
            data["category"] = asset.category
        elif isinstance(asset, dict):
            data["category"] = asset.get("category")
        
        # Risk bucket
        if hasattr(asset, "_risk_bucket"):
            data["risk_bucket"] = asset._risk_bucket
        elif isinstance(asset, dict):
            data["risk_bucket"] = asset.get("_risk_bucket") or asset.get("risk_bucket")
        
        asset_data[asset_id] = data
    
    return asset_data


# ============= CONVENIENCE FUNCTIONS FOR CONSTRAINT_REPORT =============

def get_max_region_exposure(
    exposures: ExposureResult,
    equity_only: bool = True,
) -> Tuple[str, float]:
    """
    Retourne la région avec l'exposition maximale.
    
    Args:
        exposures: ExposureResult
        equity_only: Si True, utilise by_region_equity_only
        
    Returns:
        (region_name, exposure)
    """
    region_data = exposures.by_region_equity_only if equity_only else exposures.by_region
    
    if not region_data:
        return "N/A", 0.0
    
    max_region = max(region_data.items(), key=lambda x: x[1])
    return max_region


def get_max_sector_exposure(
    exposures: ExposureResult,
) -> Tuple[str, float]:
    """
    Retourne le secteur avec l'exposition maximale.
    
    Args:
        exposures: ExposureResult
        
    Returns:
        (sector_name, exposure)
    """
    if not exposures.by_sector:
        return "N/A", 0.0
    
    max_sector = max(exposures.by_sector.items(), key=lambda x: x[1])
    return max_sector
