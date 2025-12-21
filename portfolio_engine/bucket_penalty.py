# portfolio_engine/bucket_penalty.py
"""
Bucket Penalty Module — v1.0.0 (PR3)

Pénalités soft pour les contraintes de buckets dans l'optimizer.

POURQUOI SOFT PENALTIES ?
- Les contraintes dures SLSQP rendent souvent le problème infaisable
- Les pénalités soft orientent l'optimizer sans bloquer
- Permet de traiter les buckets comme "objectif" plutôt que "contrainte dure"

ARCHITECTURE:
    objective = score - lambda_vol * vol_penalty - lambda_bucket * bucket_penalty
    
    Où bucket_penalty utilise une fonction hinge² (dérivable, OK pour SLSQP)

CALIBRATION:
    lambda_bucket doit être calibré par rapport à:
    - L'échelle des scores (typiquement 0-100)
    - lambda_vol (typiquement 10-50)
    
    Recommandation initiale: lambda_bucket = 20.0

USAGE:
    from portfolio_engine.bucket_penalty import (
        bucket_penalty,
        unknown_penalty,
        compute_total_bucket_penalty,
    )
    
    # Dans l'objective function de l'optimizer
    penalty = compute_total_bucket_penalty(
        weights=w,
        asset_ids=candidate_ids,
        roles=role_mapping,
        targets=PROFILE_BUCKET_TARGETS[profile],
        lambda_bucket=20.0,
        lambda_unknown=50.0,
    )

Audit trail:
- v1.0.0 (2024-12-21): Initial PR3 implementation
"""

from __future__ import annotations
import numpy as np
from typing import Dict, Tuple, List, Optional, Any
import logging

logger = logging.getLogger("portfolio_engine.bucket_penalty")

# Import from exposures module
try:
    from portfolio_engine.exposures import compute_role_exposures
except ImportError:
    # Fallback si exposures.py n'est pas encore intégré
    def compute_role_exposures(weights, roles):
        out = {"core": 0.0, "satellite": 0.0, "defensive": 0.0, "lottery": 0.0, "unknown": 0.0}
        for asset_id, w in weights.items():
            role = roles.get(asset_id, "unknown")
            out[role] += float(w)
        return out


# ============= PENALTY FUNCTIONS =============

def hinge_squared(x: float, lower: float, upper: float) -> float:
    """
    Fonction hinge² : pénalise si x < lower ou x > upper.
    
    Propriétés:
    - Dérivable partout (important pour SLSQP)
    - = 0 si lower <= x <= upper
    - Croît quadratiquement hors de [lower, upper]
    
    Args:
        x: Valeur à évaluer
        lower: Borne inférieure
        upper: Borne supérieure
        
    Returns:
        Pénalité (>= 0)
        
    Example:
        >>> hinge_squared(0.4, 0.3, 0.5)  # Dans range
        0.0
        >>> hinge_squared(0.2, 0.3, 0.5)  # Trop bas
        0.01  # (0.3 - 0.2)²
        >>> hinge_squared(0.7, 0.3, 0.5)  # Trop haut
        0.04  # (0.7 - 0.5)²
    """
    if x < lower:
        return (lower - x) ** 2
    elif x > upper:
        return (x - upper) ** 2
    else:
        return 0.0


def bucket_penalty(
    w: np.ndarray,
    asset_ids: List[str],
    roles: Dict[str, str],
    targets: Dict[str, Tuple[float, float]],
    lambda_bucket: float = 20.0,
) -> float:
    """
    Calcule la pénalité pour violation des bucket targets.
    
    Utilise une pénalité hinge² pour chaque bucket (core, satellite, defensive, lottery).
    
    Args:
        w: Array numpy des poids (format SLSQP)
        asset_ids: Liste des IDs d'actifs (même ordre que w)
        roles: Dict {asset_id: role}
        targets: Dict {role: (min_pct, max_pct)} où pct sont en décimal (0.3 = 30%)
        lambda_bucket: Coefficient de pénalité (défaut 20.0)
        
    Returns:
        Pénalité totale (>= 0)
        
    Example:
        >>> targets = {
        ...     "core": (0.3, 0.5),
        ...     "satellite": (0.2, 0.4),
        ...     "defensive": (0.1, 0.3),
        ...     "lottery": (0.0, 0.1),
        ... }
        >>> penalty = bucket_penalty(weights, ids, roles, targets, lambda_bucket=20.0)
    """
    # Reconstruire dict pour compute_role_exposures
    weights = {aid: float(wi) for aid, wi in zip(asset_ids, w) if wi > 0}
    
    # Calculer les expositions par role
    exposures = compute_role_exposures(weights, roles)
    
    # Calculer la pénalité pour chaque bucket
    penalty = 0.0
    
    for role, (min_target, max_target) in targets.items():
        exposure = exposures.get(role, 0.0)
        penalty += hinge_squared(exposure, min_target, max_target)
    
    return lambda_bucket * penalty


def unknown_penalty(
    w: np.ndarray,
    asset_ids: List[str],
    roles: Dict[str, str],
    lambda_unknown: float = 50.0,
) -> float:
    """
    Pénalise les actifs avec role="unknown".
    
    Cette pénalité force la qualité du mapping:
    - Plus le poids en "unknown" est élevé, plus la pénalité est forte
    - Encourage à mapper tous les actifs AVANT d'optimiser
    
    Args:
        w: Array numpy des poids
        asset_ids: Liste des IDs d'actifs
        roles: Dict {asset_id: role}
        lambda_unknown: Coefficient de pénalité (défaut 50.0, élevé intentionnellement)
        
    Returns:
        Pénalité (>= 0)
    """
    unknown_weight = 0.0
    
    for aid, wi in zip(asset_ids, w):
        if wi > 0 and roles.get(aid, "unknown") == "unknown":
            unknown_weight += float(wi)
    
    # Pénalité quadratique sur le poids unknown
    return lambda_unknown * (unknown_weight ** 2)


def concentration_penalty(
    w: np.ndarray,
    max_single: float = 0.15,
    lambda_concentration: float = 10.0,
) -> float:
    """
    Pénalise les positions trop concentrées.
    
    Utile si max_single_position est une préférence plutôt qu'une contrainte dure.
    
    Args:
        w: Array numpy des poids
        max_single: Poids max souhaité par position (défaut 15%)
        lambda_concentration: Coefficient de pénalité
        
    Returns:
        Pénalité (>= 0)
    """
    penalty = 0.0
    
    for wi in w:
        if wi > max_single:
            penalty += (wi - max_single) ** 2
    
    return lambda_concentration * penalty


def compute_total_bucket_penalty(
    w: np.ndarray,
    asset_ids: List[str],
    roles: Dict[str, str],
    targets: Dict[str, Tuple[float, float]],
    lambda_bucket: float = 20.0,
    lambda_unknown: float = 50.0,
    include_unknown_penalty: bool = True,
) -> Tuple[float, Dict[str, Any]]:
    """
    Calcule la pénalité totale avec diagnostics.
    
    Args:
        w: Array numpy des poids
        asset_ids: Liste des IDs d'actifs
        roles: Dict {asset_id: role}
        targets: Dict {role: (min, max)}
        lambda_bucket: Coefficient pour bucket_penalty
        lambda_unknown: Coefficient pour unknown_penalty
        include_unknown_penalty: Si True, inclut la pénalité unknown
        
    Returns:
        (total_penalty, diagnostics_dict)
        
    Example:
        total, diag = compute_total_bucket_penalty(w, ids, roles, targets)
        logger.info(f"Bucket penalty: {total:.4f}, details: {diag}")
    """
    # Reconstruire dict des poids
    weights = {aid: float(wi) for aid, wi in zip(asset_ids, w) if wi > 0}
    
    # Calculer expositions
    exposures = compute_role_exposures(weights, roles)
    
    # Calculer chaque pénalité
    bucket_pen = bucket_penalty(w, asset_ids, roles, targets, lambda_bucket)
    unknown_pen = unknown_penalty(w, asset_ids, roles, lambda_unknown) if include_unknown_penalty else 0.0
    
    total = bucket_pen + unknown_pen
    
    # Diagnostics
    diagnostics = {
        "bucket_penalty": round(bucket_pen, 4),
        "unknown_penalty": round(unknown_pen, 4),
        "total_penalty": round(total, 4),
        "exposures": {k: round(v, 4) for k, v in exposures.items()},
        "targets": targets,
        "violations": [],
    }
    
    # Identifier les violations
    for role, (min_t, max_t) in targets.items():
        exp = exposures.get(role, 0.0)
        if exp < min_t:
            diagnostics["violations"].append({
                "role": role,
                "type": "under",
                "exposure": round(exp, 4),
                "target_min": min_t,
                "gap": round(min_t - exp, 4),
            })
        elif exp > max_t:
            diagnostics["violations"].append({
                "role": role,
                "type": "over",
                "exposure": round(exp, 4),
                "target_max": max_t,
                "gap": round(exp - max_t, 4),
            })
    
    # Unknown check
    if exposures.get("unknown", 0.0) > 0.001:
        diagnostics["violations"].append({
            "role": "unknown",
            "type": "mapping_issue",
            "exposure": round(exposures["unknown"], 4),
            "message": "Some assets have no role assigned",
        })
    
    return total, diagnostics


# ============= GRADIENT (pour optimizers qui en ont besoin) =============

def bucket_penalty_gradient(
    w: np.ndarray,
    asset_ids: List[str],
    roles: Dict[str, str],
    targets: Dict[str, Tuple[float, float]],
    lambda_bucket: float = 20.0,
) -> np.ndarray:
    """
    Calcule le gradient de la bucket_penalty.
    
    Pour SLSQP, le gradient aide à la convergence mais n'est pas obligatoire.
    
    ∂penalty/∂w_i = 2 * λ * (exposure_role - target) * ∂exposure_role/∂w_i
                  = 2 * λ * (exposure_role - target) * 1[role_i == role]
    
    Args:
        w: Array numpy des poids
        asset_ids: Liste des IDs
        roles: Dict {asset_id: role}
        targets: Dict {role: (min, max)}
        lambda_bucket: Coefficient
        
    Returns:
        Array numpy du gradient (même taille que w)
    """
    n = len(w)
    grad = np.zeros(n)
    
    # Calculer expositions actuelles
    weights = {aid: float(wi) for aid, wi in zip(asset_ids, w) if wi > 0}
    exposures = compute_role_exposures(weights, roles)
    
    for i, (aid, wi) in enumerate(zip(asset_ids, w)):
        role = roles.get(aid, "unknown")
        
        # Contribution au gradient pour chaque target
        for target_role, (min_t, max_t) in targets.items():
            if role != target_role:
                continue
            
            exp = exposures.get(target_role, 0.0)
            
            if exp < min_t:
                # ∂/∂w_i of (min_t - exp)² = -2 * (min_t - exp)
                grad[i] += 2 * lambda_bucket * (exp - min_t)
            elif exp > max_t:
                # ∂/∂w_i of (exp - max_t)² = 2 * (exp - max_t)
                grad[i] += 2 * lambda_bucket * (exp - max_t)
    
    return grad


# ============= PROFILE TARGETS (pour référence) =============

# Ces targets sont des exemples - à ajuster selon tes profils
DEFAULT_BUCKET_TARGETS = {
    "Prudent": {
        "core": (0.20, 0.40),
        "satellite": (0.10, 0.30),
        "defensive": (0.40, 0.60),
        "lottery": (0.00, 0.05),
    },
    "Modéré": {
        "core": (0.30, 0.50),
        "satellite": (0.20, 0.40),
        "defensive": (0.20, 0.40),
        "lottery": (0.00, 0.10),
    },
    "Agressif": {
        "core": (0.30, 0.50),
        "satellite": (0.30, 0.50),
        "defensive": (0.10, 0.25),
        "lottery": (0.00, 0.15),
    },
}


# ============= INTEGRATION HELPER =============

def create_penalty_function(
    asset_ids: List[str],
    roles: Dict[str, str],
    targets: Dict[str, Tuple[float, float]],
    lambda_bucket: float = 20.0,
    lambda_unknown: float = 50.0,
):
    """
    Crée une fonction de pénalité prête à intégrer dans l'optimizer.
    
    Usage dans optimizer.py:
        penalty_fn = create_penalty_function(ids, roles, targets)
        
        def objective(w):
            score = compute_score(w)
            vol_pen = compute_vol_penalty(w)
            bucket_pen = penalty_fn(w)
            return -(score - lambda_vol * vol_pen - bucket_pen)
    
    Returns:
        Callable[[np.ndarray], float]
    """
    def penalty_fn(w: np.ndarray) -> float:
        total, _ = compute_total_bucket_penalty(
            w, asset_ids, roles, targets,
            lambda_bucket=lambda_bucket,
            lambda_unknown=lambda_unknown,
        )
        return total
    
    return penalty_fn


def create_penalty_function_with_logging(
    asset_ids: List[str],
    roles: Dict[str, str],
    targets: Dict[str, Tuple[float, float]],
    lambda_bucket: float = 20.0,
    lambda_unknown: float = 50.0,
    log_every: int = 100,
):
    """
    Comme create_penalty_function mais avec logging périodique.
    
    Utile pour debugger la convergence de l'optimizer.
    """
    call_count = [0]  # Mutable pour closure
    
    def penalty_fn(w: np.ndarray) -> float:
        call_count[0] += 1
        total, diag = compute_total_bucket_penalty(
            w, asset_ids, roles, targets,
            lambda_bucket=lambda_bucket,
            lambda_unknown=lambda_unknown,
        )
        
        if call_count[0] % log_every == 0:
            logger.debug(
                f"[Iter {call_count[0]}] bucket_penalty={diag['bucket_penalty']:.4f}, "
                f"unknown_penalty={diag['unknown_penalty']:.4f}, "
                f"violations={len(diag['violations'])}"
            )
        
        return total
    
    return penalty_fn
