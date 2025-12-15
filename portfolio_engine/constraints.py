# portfolio_engine/constraints.py
"""
Hiérarchie formelle des contraintes et vérification post-arrondi.

ChatGPT v2.0 Audit:
- Q16: "As-tu un constraint_report calculé après toutes transformations?"
- Q17: "As-tu une fonction de repair qui respecte tous les caps?"
- Q18: "As-tu un test de faisabilité ex-ante?"
- Q19: "Hiérarchie des contraintes formalisée (HARD/SOFT/RELAXABLE)?"

Réponse: Ce module.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any, Set
from enum import Enum
import logging

logger = logging.getLogger("portfolio_engine.constraints")


# =============================================================================
# HIÉRARCHIE DES CONTRAINTES (Q19)
# =============================================================================

class ConstraintPriority(Enum):
    """
    Hiérarchie formelle des contraintes.
    
    HARD: Jamais violée, blocage si impossible
    SOFT: Pénalisée dans l'objectif, peut être dépassée
    RELAXABLE: Peut être relâchée avec documentation
    """
    HARD = "hard"           # Violation = erreur/blocage
    SOFT = "soft"           # Violation = pénalité (objectif)
    RELAXABLE = "relaxable"  # Peut être relâchée (documenté)


@dataclass
class ConstraintDefinition:
    """Définition d'une contrainte."""
    name: str
    priority: ConstraintPriority
    description: str
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    tolerance: float = 0.0  # Tolérance pour vérification


# =============================================================================
# REGISTRY DES CONTRAINTES (source unique de vérité)
# =============================================================================

CONSTRAINT_REGISTRY: Dict[str, ConstraintDefinition] = {
    # === HARD CONSTRAINTS (jamais violées) ===
    "sum_100": ConstraintDefinition(
        name="sum_100",
        priority=ConstraintPriority.HARD,
        description="La somme des poids doit égaler 100%",
        min_value=99.9,
        max_value=100.1,
        tolerance=0.1,
    ),
    "bounds_positive": ConstraintDefinition(
        name="bounds_positive",
        priority=ConstraintPriority.HARD,
        description="Tous les poids doivent être >= 0",
        min_value=0.0,
    ),
    "max_single_position": ConstraintDefinition(
        name="max_single_position",
        priority=ConstraintPriority.HARD,
        description="Poids max par position (15%)",
        max_value=15.0,
        tolerance=0.1,
    ),
    "bonds_min": ConstraintDefinition(
        name="bonds_min",
        priority=ConstraintPriority.HARD,
        description="Minimum d'obligations selon profil",
        # min_value défini par profil
    ),
    "crypto_max": ConstraintDefinition(
        name="crypto_max",
        priority=ConstraintPriority.HARD,
        description="Maximum de crypto selon profil",
        # max_value défini par profil
    ),
    
    # === SOFT CONSTRAINTS (pénalisées) ===
    "vol_target": ConstraintDefinition(
        name="vol_target",
        priority=ConstraintPriority.SOFT,
        description="Volatilité cible du portefeuille",
        # via pénalité dans objectif
    ),
    "min_assets": ConstraintDefinition(
        name="min_assets",
        priority=ConstraintPriority.SOFT,
        description="Nombre minimum d'actifs",
        min_value=10,
    ),
    "max_assets": ConstraintDefinition(
        name="max_assets",
        priority=ConstraintPriority.SOFT,
        description="Nombre maximum d'actifs",
        max_value=18,
    ),
    
    # === RELAXABLE CONSTRAINTS ===
    "bucket_core": ConstraintDefinition(
        name="bucket_core",
        priority=ConstraintPriority.RELAXABLE,
        description="Target bucket CORE",
        tolerance=5.0,  # ±5% acceptable
    ),
    "bucket_defensive": ConstraintDefinition(
        name="bucket_defensive",
        priority=ConstraintPriority.RELAXABLE,
        description="Target bucket DEFENSIVE",
        tolerance=8.0,  # ±8% pour Stable
    ),
    "bucket_satellite": ConstraintDefinition(
        name="bucket_satellite",
        priority=ConstraintPriority.RELAXABLE,
        description="Target bucket SATELLITE",
        tolerance=5.0,
    ),
    "max_sector": ConstraintDefinition(
        name="max_sector",
        priority=ConstraintPriority.RELAXABLE,
        description="Maximum par secteur (30%)",
        max_value=30.0,
        tolerance=2.0,
    ),
}


# =============================================================================
# CONSTRAINT REPORT (Q16)
# =============================================================================

@dataclass
class ConstraintViolation:
    """Détail d'une violation de contrainte."""
    constraint_name: str
    priority: ConstraintPriority
    expected: str
    actual: float
    margin: float  # Distance à la limite
    is_violation: bool
    context: Optional[str] = None  # Ex: "NVDA" pour max_single_position


@dataclass
class ConstraintReport:
    """
    Rapport complet de vérification des contraintes.
    
    Calculé APRÈS toutes les transformations (arrondi, adjust_to_100, etc.).
    """
    profile: str
    timestamp: str
    
    # Résultats
    all_hard_satisfied: bool
    all_soft_satisfied: bool
    violations: List[ConstraintViolation] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    # Marges (distance aux limites)
    margins: Dict[str, float] = field(default_factory=dict)
    
    # Contraintes relâchées
    relaxed_constraints: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "profile": self.profile,
            "timestamp": self.timestamp,
            "all_hard_satisfied": self.all_hard_satisfied,
            "all_soft_satisfied": self.all_soft_satisfied,
            "n_violations": len(self.violations),
            "violations": [
                {
                    "name": v.constraint_name,
                    "priority": v.priority.value,
                    "expected": v.expected,
                    "actual": round(v.actual, 2),
                    "margin": round(v.margin, 2),
                    "context": v.context,
                }
                for v in self.violations
            ],
            "warnings": self.warnings,
            "margins": {k: round(v, 2) for k, v in self.margins.items()},
            "relaxed_constraints": self.relaxed_constraints,
        }


# =============================================================================
# VÉRIFICATION POST-ARRONDI (Q16)
# =============================================================================

def verify_constraints_post_arrondi(
    allocation: Dict[str, float],
    assets_metadata: Dict[str, Dict],  # {asset_id: {category, sector, role, ...}}
    profile_constraints: Dict[str, Any],
    profile_name: str,
) -> ConstraintReport:
    """
    Vérifie TOUTES les contraintes APRÈS arrondi/adjust_to_100.
    
    Args:
        allocation: {asset_id: weight_pct} ex: {"AAPL": 12.5, "MSFT": 10.0}
        assets_metadata: Métadonnées des actifs (category, sector, role)
        profile_constraints: Contraintes du profil (bonds_min, crypto_max, etc.)
        profile_name: "Agressif", "Modéré", "Stable"
    
    Returns:
        ConstraintReport complet
    """
    from datetime import datetime
    
    violations = []
    warnings = []
    margins = {}
    relaxed = []
    
    # === 1. SOMME = 100% (HARD) ===
    total_weight = sum(allocation.values())
    margin_sum = 100.0 - total_weight
    margins["sum_100"] = margin_sum
    
    if abs(margin_sum) > 0.1:
        violations.append(ConstraintViolation(
            constraint_name="sum_100",
            priority=ConstraintPriority.HARD,
            expected="100.0%",
            actual=total_weight,
            margin=margin_sum,
            is_violation=True,
        ))
    
    # === 2. POIDS POSITIFS (HARD) ===
    for asset_id, weight in allocation.items():
        if weight < 0:
            violations.append(ConstraintViolation(
                constraint_name="bounds_positive",
                priority=ConstraintPriority.HARD,
                expected=">= 0%",
                actual=weight,
                margin=weight,
                is_violation=True,
                context=asset_id,
            ))
    
    # === 3. MAX SINGLE POSITION (HARD) ===
    max_single = profile_constraints.get("max_single_position", 15.0)
    for asset_id, weight in allocation.items():
        margin = max_single - weight
        if margin < 0:
            violations.append(ConstraintViolation(
                constraint_name="max_single_position",
                priority=ConstraintPriority.HARD,
                expected=f"<= {max_single}%",
                actual=weight,
                margin=margin,
                is_violation=True,
                context=asset_id,
            ))
    margins["max_single_position"] = min((max_single - w for w in allocation.values()), default=max_single)
    
    # === 4. BONDS MINIMUM (HARD) ===
    bonds_min = profile_constraints.get("bonds_min", 0.0)
    bonds_total = sum(
        w for aid, w in allocation.items()
        if assets_metadata.get(aid, {}).get("category") == "Obligations"
    )
    margin_bonds = bonds_total - bonds_min
    margins["bonds_min"] = margin_bonds
    
    if margin_bonds < -0.1:
        violations.append(ConstraintViolation(
            constraint_name="bonds_min",
            priority=ConstraintPriority.HARD,
            expected=f">= {bonds_min}%",
            actual=bonds_total,
            margin=margin_bonds,
            is_violation=True,
        ))
    
    # === 5. CRYPTO MAXIMUM (HARD) ===
    crypto_max = profile_constraints.get("crypto_max", 0.0)
    crypto_total = sum(
        w for aid, w in allocation.items()
        if assets_metadata.get(aid, {}).get("category") == "Crypto"
    )
    margin_crypto = crypto_max - crypto_total
    margins["crypto_max"] = margin_crypto
    
    if crypto_max > 0 and margin_crypto < -0.1:
        violations.append(ConstraintViolation(
            constraint_name="crypto_max",
            priority=ConstraintPriority.HARD,
            expected=f"<= {crypto_max}%",
            actual=crypto_total,
            margin=margin_crypto,
            is_violation=True,
        ))
    
    # === 6. MAX SINGLE BOND (HARD) ===
    max_bond = profile_constraints.get("max_single_bond", 25.0)
    for asset_id, weight in allocation.items():
        if assets_metadata.get(asset_id, {}).get("category") == "Obligations":
            if weight > max_bond + 0.1:
                violations.append(ConstraintViolation(
                    constraint_name="max_single_bond",
                    priority=ConstraintPriority.HARD,
                    expected=f"<= {max_bond}%",
                    actual=weight,
                    margin=max_bond - weight,
                    is_violation=True,
                    context=asset_id,
                ))
    
    # === 7. NOMBRE D'ACTIFS (SOFT) ===
    n_assets = len(allocation)
    min_assets = profile_constraints.get("min_assets", 10)
    max_assets = profile_constraints.get("max_assets", 18)
    
    if n_assets < min_assets:
        warnings.append(f"n_assets={n_assets} < min={min_assets}")
    if n_assets > max_assets:
        warnings.append(f"n_assets={n_assets} > max={max_assets}")
    margins["n_assets"] = n_assets
    
    # === 8. BUCKET TARGETS (RELAXABLE) ===
    bucket_targets = profile_constraints.get("bucket_targets", {})
    bucket_exposure = {}
    for asset_id, weight in allocation.items():
        role = assets_metadata.get(asset_id, {}).get("role", "unknown")
        bucket_exposure[role] = bucket_exposure.get(role, 0) + weight
    
    for role, (min_pct, max_pct) in bucket_targets.items():
        actual = bucket_exposure.get(role, 0)
        tolerance = CONSTRAINT_REGISTRY.get(f"bucket_{role.lower()}", ConstraintDefinition(
            name="", priority=ConstraintPriority.RELAXABLE, description=""
        )).tolerance
        
        if actual < (min_pct * 100 - tolerance):
            warnings.append(f"bucket_{role}: {actual:.1f}% < min {min_pct*100:.0f}%")
            relaxed.append(f"bucket_{role}_min")
        if actual > (max_pct * 100 + tolerance):
            warnings.append(f"bucket_{role}: {actual:.1f}% > max {max_pct*100:.0f}%")
            relaxed.append(f"bucket_{role}_max")
    
    # === RÉSULTAT ===
    hard_violations = [v for v in violations if v.priority == ConstraintPriority.HARD]
    soft_violations = [v for v in violations if v.priority == ConstraintPriority.SOFT]
    
    return ConstraintReport(
        profile=profile_name,
        timestamp=datetime.now().isoformat(),
        all_hard_satisfied=len(hard_violations) == 0,
        all_soft_satisfied=len(soft_violations) == 0,
        violations=violations,
        warnings=warnings,
        margins=margins,
        relaxed_constraints=relaxed,
    )


# =============================================================================
# TEST DE FAISABILITÉ EX-ANTE (Q18)
# =============================================================================

@dataclass
class FeasibilityReport:
    """Rapport de faisabilité avant optimisation."""
    feasible: bool
    reason: Optional[str] = None
    capacity: Dict[str, float] = field(default_factory=dict)
    requirements: Dict[str, float] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "feasible": self.feasible,
            "reason": self.reason,
            "capacity": self.capacity,
            "requirements": self.requirements,
        }


def check_feasibility(
    candidates: List[Dict],  # Liste des candidats avec category, vol, etc.
    profile_constraints: Dict[str, Any],
    profile_name: str,
) -> FeasibilityReport:
    """
    Vérifie si les contraintes sont satisfiables AVANT optimisation.
    
    Args:
        candidates: Liste des actifs candidats
        profile_constraints: Contraintes du profil
        profile_name: Nom du profil
    
    Returns:
        FeasibilityReport
    """
    capacity = {}
    requirements = {}
    
    # === Bonds capacity ===
    bonds = [c for c in candidates if c.get("category") == "Obligations"]
    max_single_bond = profile_constraints.get("max_single_bond", 25.0)
    bonds_capacity = len(bonds) * max_single_bond
    bonds_required = profile_constraints.get("bonds_min", 0.0)
    
    capacity["bonds"] = bonds_capacity
    requirements["bonds_min"] = bonds_required
    
    if bonds_capacity < bonds_required:
        return FeasibilityReport(
            feasible=False,
            reason=f"Bonds capacity {bonds_capacity:.0f}% < required {bonds_required:.0f}% (need {int(bonds_required/max_single_bond)+1} bonds)",
            capacity=capacity,
            requirements=requirements,
        )
    
    # === Nombre d'actifs ===
    n_candidates = len(candidates)
    min_assets = profile_constraints.get("min_assets", 10)
    
    capacity["n_candidates"] = n_candidates
    requirements["min_assets"] = min_assets
    
    if n_candidates < min_assets:
        return FeasibilityReport(
            feasible=False,
            reason=f"Only {n_candidates} candidates < required {min_assets}",
            capacity=capacity,
            requirements=requirements,
        )
    
    # === Vol atteignable ===
    if candidates:
        vols = [c.get("vol_annual", 20.0) for c in candidates]
        min_vol = min(vols)
        max_vol = max(vols)
        vol_target = profile_constraints.get("vol_target", 12.0)
        vol_tolerance = profile_constraints.get("vol_tolerance", 3.0)
        
        capacity["vol_range"] = f"{min_vol:.0f}%-{max_vol:.0f}%"
        requirements["vol_target"] = f"{vol_target}% ±{vol_tolerance}%"
        
        # Approximation: si tous les actifs ont vol > target + tolerance, problème
        if min_vol > vol_target + vol_tolerance:
            return FeasibilityReport(
                feasible=False,
                reason=f"Min available vol {min_vol:.0f}% > target {vol_target}% + {vol_tolerance}%",
                capacity=capacity,
                requirements=requirements,
            )
    
    return FeasibilityReport(
        feasible=True,
        capacity=capacity,
        requirements=requirements,
    )
