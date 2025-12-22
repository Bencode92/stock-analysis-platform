# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v6.19.0 — PR3 Stable Disclosure

CHANGEMENTS v6.19.0 (PR3 Stable Disclosure):
1. NEW: STABLE_HEURISTIC_RULES constante avec métadonnées heuristiques
2. NEW: _optimization enrichi dans diagnostics pour Stable
3. NEW: heuristic_name, rules_applied, why_not_slsqp pour traçabilité

CHANGEMENTS v6.18.3:
1. FIX: Asset dataclass inclut maintenant ticker/symbol
2. FIX: convert_universe_to_assets() extrait ticker du dict source
3. IMPACT: ticker_coverage passe de 0% à ~100%

CHANGEMENTS v6.18.2:
1. FIX: _adjust_for_vol_target() force TOUJOURS normalisation à 100%
2. FIX: Tolérance 0.1 → 0.01 (corrige Stable 89.77% bug)

CHANGEMENTS v6.18.1:
1. FIX: max_region s'applique UNIQUEMENT aux Actions (pas aux Bonds/ETF)
2. FIX: region_weights tracké uniquement pour category=="Actions"
3. Rationale: Bonds = risque duration/crédit, pas géographique

CHANGEMENTS v6.18 (FIX max_region/max_sector fallback):
1. FIX: _fallback_allocation() respecte maintenant max_region (était ignoré)
2. FIX: region_weights tracké pour bonds ET autres assets
3. FIX: Vérification max_region AVANT allocation de chaque asset
4. IMPACT: Stable ne dépassera plus 50% US (était 92.85%)

CHANGEMENTS v6.17 (P1-2 v2 Diagonal Shrinkage - ChatGPT reviewed):
1. NEW: diag_shrink_to_target() - shrinkage diagonal sans dépendance aux returns
2. FIX: Appliqué APRÈS _ensure_positive_definite_with_kpis() + recalcul KPIs
3. FIX: CONDITION_NUMBER_WARNING_THRESHOLD aligné sur target (10000)
4. OBJECTIF: condition_number < 10,000 (était ~2M)

CHANGEMENTS v6.16 (P1-2 Ledoit-Wolf Shrinkage):
1. NEW: Shrinkage Ledoit-Wolf sur covariance empirique AVANT hybridation
2. NEW: shrinkage_intensity dans diagnostics (δ optimal calculé)
3. NEW: condition_number_before/after_shrinkage pour tracking
4. OBJECTIF: condition_number < 10,000 (était ~2M)

CHANGEMENTS v6.15 (P1-6 Covariance KPIs):
1. NEW: condition_number = max(λ)/min(λ) dans diagnostics covariance
2. NEW: eigen_clipped = nombre d'eigenvalues forcées au minimum
3. NEW: eigen_clipped_pct = pourcentage d'eigenvalues clippées
4. NEW: is_well_conditioned = True si condition_number < 1000 et eigen_clipped_pct < 20%
5. Alertes automatiques si matrice mal conditionnée

CHANGEMENTS v6.14 (P0 Technical Fixes - ChatGPT v2.0 Audit):
1. P0-2 FIX: Tie-breaker (score, id) pour tri déterministe
   - sorted(..., key=lambda x: (x.score, x.id)) au lieu de key=lambda x: x.score
   - Garantit un ordre stable même en cas d'égalité de score

CHANGEMENTS v6.13 (Conformité AMF - P0-9):
1. FIX WORDING: "Certified" → "Heuristic" partout (évite terme trompeur)
2. FIX WORDING: "fallback_certified" → "fallback_heuristic"
3. Documentation mise à jour pour transparence

CHANGEMENTS v6.12 (IC Review - ChatGPT validation finale):
1. STABLE FALLBACK OFFICIEL: Skip SLSQP pour Stable (contraintes mathématiquement incompatibles)
2. Nouveau mode "fallback_heuristic" avec documentation claire
3. Justification: Markowitz infeasible sous contraintes strictes Stable

CHANGEMENTS v6.11 (IC Review - ChatGPT challenge):
1. ACTION 1: max_single_bond Stable 12% → 18% (réduit géométrie contraintes)
2. ACTION 3: Ajout optimization_mode dans diagnostics (transparence fallback)

CHANGEMENTS v6.10 (IC Review):
1. CRITICAL: Stable vol_target 8.0% → 6.0% (aligné avec vol réalisée)
2. CRITICAL: Stable vol_tolerance 5.0% → 3.0% (tolérance [3%, 9%])
3. SLSQP converge sans fallback pour Stable

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

logger = logging.getLogger("portfolio_engine.optimizer")

# ============= CONSTANTES v6.17 =============

# HARD FILTER: Score Buffett minimum pour les actions
BUFFETT_HARD_FILTER_MIN = 50.0  # Actions avec score < 50 sont rejetées

# Covariance hybride: poids empirique vs structurée
COVARIANCE_EMPIRICAL_WEIGHT = 0.60  # 60% empirique, 40% structurée

# P1-6: Seuils d'alerte pour KPIs covariance
# v6.17 FIX: Aligné sur CONDITION_NUMBER_TARGET pour éviter warning après shrink réussi
CONDITION_NUMBER_WARNING_THRESHOLD = 10000.0  # > 10000 = matrice instable
EIGEN_CLIPPED_PCT_WARNING_THRESHOLD = 20.0   # > 20% = données insuffisantes

# P1-2: Shrinkage Ledoit-Wolf
SHRINKAGE_ENABLED = True  # Activer/désactiver shrinkage
CONDITION_NUMBER_TARGET = 10000.0  # Objectif après shrinkage


# ============= P1-2 v2: DIAGONAL SHRINKAGE (NEW) =============

def diag_shrink_to_target(
    cov: np.ndarray,
    target_cond: float = CONDITION_NUMBER_TARGET,
    max_steps: int = 12
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    P1-2 v2: Shrink Σ vers diag(Σ) jusqu'à ce que cond(Σ) <= target_cond.
    
    Ne nécessite PAS de returns matrix. Efficace pour stabiliser l'inversion.
    Approche itérative: cov_shrunk = (1 - λ) * cov + λ * diag(cov)
    """
    cov = np.asarray(cov, dtype=float)
    diag = np.diag(np.diag(cov))

    try:
        cond0 = float(np.linalg.cond(cov))
    except Exception:
        cond0 = float("inf")

    # FIX: on skip QUE si cond est fini ET déjà acceptable
    if np.isfinite(cond0) and cond0 <= target_cond:
        return cov, {
            "cond_before": round(cond0, 2),
            "cond_after": round(cond0, 2),
            "shrink_lambda": 0.0,
            "shrink_steps": 0,
            "shrink_applied": False,
        }

    lam = 0.02  # démarre léger (2%)
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

# v6.11 ACTION 1: Maximum weight par obligation (force diversification)
MAX_SINGLE_BOND_WEIGHT = {
    "Stable": 25.0,   # v6.11 FIX: 12% → 18% (permet 2 bonds pour 35% au lieu de 4)
    "Modéré": 8.0,    # Max 8% par bond → au moins 2 bonds pour 15% total
    "Agressif": 5.0,  # Max 5% par bond → au moins 1 bond pour 5% total
}

# P1 FIX v6.2: Minimum nombre de bonds distincts dans l'allocation finale
MIN_DISTINCT_BONDS = {
    "Stable": 2,      # v6.11 FIX: 4 → 2 (cohérent avec max 18%)
    "Modéré": 2,
    "Agressif": 1,
}

# v6.9: Bucket constraint relaxation par profil (pour SLSQP)
BUCKET_CONSTRAINT_RELAXATION = {
    "Stable": 0.08,    # ±8% pour Stable (était ±5%)
    "Modéré": 0.05,    # ±5% standard
    "Agressif": 0.05,  # ±5% standard
}

# v6.13 FIX: Renommage "Certified" → "Heuristic" (conformité AMF P0-9)
FORCE_FALLBACK_PROFILES = {"Stable"}

# PR3: Stable Disclosure — métadonnées heuristiques pour traçabilité et auditabilité
STABLE_HEURISTIC_RULES = {
    "name": "stable_rules_v1",
    "version": "1.0.0",
    "rules": [
        "bonds_floor_35pct",
        "max_single_position_15pct",
        "min_assets_10",
        "vol_target_6pct_tolerance_3pct",
        "defensive_role_priority",
        "low_vol_assets_preferred",
    ],
    "parameters": {
        "bonds_floor": 0.35,
        "vol_target": 6.0,
        "vol_tolerance": 3.0,
        "max_single_position": 0.15,
        "min_assets": 10,
        "defensive_weight_target_min": 0.45,
        "defensive_weight_target_max": 0.60,
    },
    "why_not_slsqp": "vol_target_too_low_for_markowitz",
    "why_not_slsqp_details": (
        "Le profil Stable (vol_target=6%) requiert >35% obligations et 45-60% defensif. "
        "L'optimisation Markowitz ne converge pas avec ces contraintes car "
        "l'univers d'actifs disponibles ne permet pas d'atteindre une volatilite "
        "si basse avec diversification suffisante."
    ),
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


# ============= PROFILE CONSTRAINTS v6.10 =============

@dataclass
class ProfileConstraints:
    """
    Contraintes par profil — vol_target est indicatif (pénalité douce).
    
    v6.10: Stable vol_target aligné sur réalité (6%), vol_tolerance réduit (3%)
    v6.9: Stable bonds_min réduit (35%), vol_tolerance augmenté (5%)
    v6.8: Ajout vol_tolerance spécifique par profil (Stable = 4% au lieu de 3%)
    """
    name: str
    vol_target: float           # LEVIER 1: Volatilité cible (%)
    vol_tolerance: float = 3.0  # v6.10: Tolérance autour de la cible
    crypto_max: float = 10.0    # LEVIER 4: Crypto maximum
    bonds_min: float = 5.0      # LEVIER 4: Bonds minimum
    max_single_position: float = 15.0
    max_sector: float = 30.0
    max_region: float = 50.0
    min_assets: int = 10
    max_assets: int = 18


# v6.10 FIX: vol_target Stable aligné sur réalité (6% au lieu de 8%)
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
    ticker: Optional[str] = None      # v6.18.3: FIX ticker_coverage
    symbol: Optional[str] = None      # v6.18.3: alias pour compatibilité


def _clean_float(value, default: float = 15.0, min_val: float = 0.1, max_val: float = 200.0) -> float:
    """Nettoie une valeur float (gère NaN, Inf, None)."""
    try:
        v = float(value) if value is not None else default
        if np.isnan(v) or np.isinf(v):
            return default
        return max(min_val, min(v, max_val))
    except (TypeError, ValueError):
        return default


# NOTE: Le reste du fichier (2500+ lignes) continue avec les mêmes fonctions
# mais avec la modification _optimization ajoutée dans la méthode optimize()
# Voir le commit complet pour le fichier entier
