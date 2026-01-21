# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v6.29 — FIX: crypto cap enforcement final

CHANGEMENTS v6.28 (4 FIXES CRITIQUES):
1. FIX A: vol_annual lit maintenant les vraies colonnes par catégorie:
   - Crypto: vol_30d_annual_pct > vol_7d_annual_pct
   - Obligations: vol_pct > vol_3y_pct  
   - ETF/Actions: vol_3y_pct > vol_pct > vol (legacy)
   + Helper _as_pct() pour gérer décimal vs pourcentage
2. FIX B: MAX_SINGLE_BOND_WEIGHT["Stable"] aligné à 15% (cohérence bounds SLSQP)
3. FIX C: Preset "rendement_etf" → "rendement" (harmonisé avec preset_etf.py)
4. FIX D: Pool crypto élargi 3 → 8/10 selon profil (core/satellite fonctionnel)

IMPACT: Covariance structurée, buckets/presets, fallback Stable corrigés.

CHANGEMENTS v6.26 (P0 FIX - _profile_score propagation):
1. FIX: convert_universe_to_assets() cherche _profile_score EN PRIORITÉ
2. AVANT: score = item.get("score") or item.get("_score") or 50.0
3. APRÈS: score = item.get("_profile_score") or item.get("score") or 50.0
4. IMPACT: Le scoring de preset_meta.py est maintenant utilisé par l'optimizer
5. ROOT CAUSE: Option B scoring était calculé mais jamais propagé

CHANGEMENTS v6.22:
1. NEW: _enforce_crypto_cap() force crypto <= crypto_max post-normalisation
2. FIX: Appelé dans _fallback_allocation() après _enforce_bonds_minimum()
3. FIX: Appelé dans optimize() après SLSQP + _adjust_to_100()
4. IMPACT: Crypto respectera 10% (Agressif), 5% (Modéré), 0% (Stable)

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

# v3.0: Import ETF exposure mapping (séparé du module)
from .etf_exposure import TICKER_TO_EXPOSURE, detect_etf_exposure

# v3.9: Import Top-N Guaranteed Selection
from .universe import sector_balanced_selection

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
        # === v2.0 STOCK REGION CAPS ===
        COUNTRY_TO_REGION,
        STOCK_REGION_CAPS,
        DEFAULT_REGION_CAP,
        get_region,
        get_stock_region_cap,
        # === v2.2 EU/US FOCUS ===
        STOCK_REGION_CAPS_EUUS,
        ALLOWED_REGIONS_EUUS,
        BLOCKED_REGIONS_EUUS,
        get_stock_region_cap_euus,
        is_region_allowed_euus,
    )
    HAS_PRESET_META = True
except ImportError:
    HAS_PRESET_META = False
    ETF_EXPOSURE_EQUIVALENTS = {}
    CORPORATE_GROUPS = {}
    MAX_CORPORATE_GROUP_WEIGHT = 0.20
    MAX_STOCKS_PER_GROUP = 1
    # Fallback region caps
    COUNTRY_TO_REGION = {}
    STOCK_REGION_CAPS = {}
    DEFAULT_REGION_CAP = 0.30
    def get_region(country: str) -> str:
        return "OTHER"
    def get_stock_region_cap(profile: str, region: str) -> float:
        return 0.30
    # === Fallback EU/US v2.2 ===
    STOCK_REGION_CAPS_EUUS = {}
    ALLOWED_REGIONS_EUUS = {"EU", "US", "OTHER"}
    BLOCKED_REGIONS_EUUS = {"IN", "ASIA_EX_IN", "LATAM"}
    def get_stock_region_cap_euus(profile: str, region: str) -> float:
        return 0.0
    def is_region_allowed_euus(region: str) -> bool:
        return region in {"EU", "US", "OTHER"}
    # === Fin Fallback EU/US ===
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

# v6.24: Import crypto_utils pour matching flexible BTC/ETH
try:
    from portfolio_engine.crypto_utils import find_crypto_by_base
    HAS_CRYPTO_UTILS = True
except ImportError:
    HAS_CRYPTO_UTILS = False

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
# ============= P0 PARTNER: TURNOVER CONTROL =============

# Pénalité turnover dans objectif SLSQP (lambda)
TURNOVER_PENALTY_LAMBDA = {
    "Agressif": 0.05,   # Faible pénalité (tolérance au changement)
    "Modéré": 0.10,     # Pénalité modérée
    "Stable": 0.20,     # Forte pénalité (stabilité prioritaire)
}

# Contrainte dure: turnover max par rebalancement
MAX_TURNOVER_PCT = {
    "Agressif": 30.0,   # 30% max turnover
    "Modéré": 25.0,     # 25% max turnover
    "Stable": 15.0,     # 15% max turnover (très conservateur)
}

# Turnover = 0.5 * sum(|w_new - w_old|) (one-way)
def compute_turnover(weights_new: np.ndarray, weights_old: np.ndarray) -> float:
    """Calcule le turnover one-way entre deux allocations."""
    return 0.5 * np.sum(np.abs(weights_new - weights_old))


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

# ============= FUND TYPE CLASSIFICATION v6.20 =============

# Fund types qui NE COMPTENT PAS pour max_sector (bond-like)
BOND_LIKE_FUND_TYPES = {
    "Corporate Bond", "High Yield Bond", "Inflation-Protected Bond",
    "Intermediate Core Bond", "Intermediate Core-Plus Bond", 
    "Long Government", "Short Government", "Short-Term Bond", 
    "Ultrashort Bond", "Multisector Bond", "Muni National Interm",
    "Nontraditional Bond", "Miscellaneous Fixed Income", 
    "Target Maturity", "Convertibles", "Preferred Stock",
}

# Leveraged/Inverse ETFs
LEVERAGED_FUND_TYPES = {
    "Multi-Asset Leveraged", "Trading--Leveraged Equity", 
    "Trading--Leveraged Commodities", "Trading--Inverse Equity",
    "Trading--Inverse Commodities", "Trading--Miscellaneous",
}

# Alternatives (non-directional)
ALTERNATIVE_FUND_TYPES = {
    "Derivative Income", "Defined Outcome", "Equity Hedged",
    "Equity Market Neutral", "Long-Short Equity", "Multistrategy",
    "Systematic Trend", "Tactical Allocation",
}

# Allocation funds (multi-asset)
ALLOCATION_FUND_TYPES = {
    "Aggressive Allocation", "Moderate Allocation", 
    "Moderately Conservative Allocation", "Global Aggressive Allocation",
    "Global Conservative Allocation", "Global Moderate Allocation",
    "Global Moderately Conservative Allocation",
}

# Union: tous les fund_types exclus de max_sector
NON_EQUITY_FUND_TYPES = (
    BOND_LIKE_FUND_TYPES | LEVERAGED_FUND_TYPES | 
    ALTERNATIVE_FUND_TYPES | ALLOCATION_FUND_TYPES
)
def _is_equity_like(asset: "Asset") -> bool: 
    """
    v6.20: Détermine si un actif compte pour max_sector.
    
    Inclus: Actions, ETF equity (Large Blend, Tech, Health, etc.)
    Exclus: Obligations, Crypto, bond ETFs, leveraged, alternatives, allocations
    """
    # Obligations et Crypto toujours exclus
    if asset.category in ["Obligations", "Crypto"]:
        return False
    
    # Actions toujours incluses
    if asset.category == "Actions":
        return True
    
    # ETF: vérifier fund_type dans source_data
    if asset.category == "ETF":
        fund_type = None
        if asset.source_data:
            fund_type = asset.source_data.get("fund_type") or asset.source_data.get("fundType")
        
        if fund_type and fund_type in NON_EQUITY_FUND_TYPES:
            return False
        
        # Fallback: vérifier risk_bucket si disponible
        if hasattr(asset, '_risk_bucket'):
            if asset._risk_bucket in ['bond_like', 'leveraged', 'alternative']:
                return False
        
        return True  # ETF equity par défaut
    
    return False
def _is_bond_like(asset: "Asset") -> bool:
    """
    v6.26: Identifie les actifs bond-like (Obligations + ETF obligataires).
    Utilisé pour appliquer MAX_SINGLE_BOND_WEIGHT uniformément.
    """
    if asset.category == "Obligations":
        return True
    if asset.category == "ETF":
        # Via exposure mapping
        if asset.exposure in {"bonds_ig", "bonds_treasury", "cash"}:
            return True
        # Via fund_type Morningstar
        ft = None
        if asset.source_data:
            ft = asset.source_data.get("fund_type") or asset.source_data.get("fundType")
        if ft and ft in BOND_LIKE_FUND_TYPES:
            return True
        # Via risk_bucket
        if hasattr(asset, "_risk_bucket") and asset._risk_bucket == "bond_like":
            return True
    return False

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
# v6.28 FIX B: Aligné avec max_single_position (15%) pour cohérence bounds SLSQP
MAX_SINGLE_BOND_WEIGHT = {
    "Stable": 15.0,   # v6.28 FIX: 25% → 15% (aligné avec max_single_position global)
    "Modéré": 8.0,    # Max 8% par bond → au moins 2 bonds pour 15% total
    "Agressif": 5.0,  # Max 5% par bond → au moins 1 bond pour 5% total
}
# ============= v6.23 CRYPTO CORE/SATELLITE =============

CRYPTO_CORE_SATELLITE = {
    "Agressif": {
        "enabled": True,
        "core_pct": 0.60,           # 60% du budget crypto en core
        "core_assets": ["BTC/USD", "ETH/USD"],
        "core_split": [0.50, 0.50], # 50/50 entre BTC et ETH
        "satellite_max_per_asset": 0.15,  # Max 15% du budget crypto par alt
        "satellite_dd_max": 35.0,   # Exclure alts avec DD > 35%
    },
    "Modéré": {
        "enabled": True,
        "core_pct": 0.70,           # 70% du budget crypto en core
        "core_assets": ["BTC/USD", "ETH/USD"],
        "core_split": [0.60, 0.40], # 60/40 BTC/ETH
        "satellite_max_per_asset": 0.10,
        "satellite_dd_max": 30.0,
    },
    "Stable": {
        "enabled": False,  # Pas de crypto pour Stable
    },
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

# ============= v6.24 MOMENTUM FILTER BY ROLE =============

# Seuils momentum (perf_3m_min) par profil et rôle
MOMENTUM_THRESHOLDS = {
    "Stable": {
        Role.CORE: -10.0,
        Role.DEFENSIVE: -15.0,
        Role.SATELLITE: -20.0,
        Role.LOTTERY: -30.0,
    },
    "Modéré": {
        Role.CORE: -15.0,
        Role.DEFENSIVE: -20.0,
        Role.SATELLITE: -25.0,
        Role.LOTTERY: -35.0,
    },
    "Agressif": {
        Role.CORE: -20.0,
        Role.DEFENSIVE: -25.0,
        Role.SATELLITE: -30.0,
        Role.LOTTERY: -40.0,
    },
}

# Presets EXCLUS du filtre momentum (contrarian par design)
MOMENTUM_FILTER_EXEMPT_PRESETS = {
    "recovery", "recovery_crypto", "contrarian"
}

# v6.19 PR3: Stable Heuristic Rules — Documentation pour traçabilité
STABLE_HEURISTIC_RULES = {
    "name": "stable_rules_v1",
    "version": "1.0.0",
    "rules": [
        "bonds_min_35pct",
        "defensive_bucket_45_60pct",
        "vol_target_6pct_tolerance_3pct",
        "max_single_position_15pct",
        "max_single_bond_25pct",
        "min_assets_10",
        "max_assets_18",
        "low_vol_assets_preferred",
    ],
    "parameters": {
        "bonds_min": 35.0,
        "vol_target": 6.0,
        "vol_tolerance": 3.0,
        "max_single_position": 15.0,
        "max_single_bond": 25.0,
        "min_assets": 10,
        "max_assets": 18,
        "defensive_min": 45.0,
        "defensive_max": 60.0,
    },
    "why_not_slsqp": "vol_target_incompatible_with_markowitz",
    "why_not_slsqp_details": (
        "Le profil Stable requiert vol_target=6% ± 3% et >35% obligations. "
        "Ces contraintes sont mathématiquement incompatibles avec l'optimisation "
        "Markowitz mean-variance. L'univers d'actifs disponibles ne permet pas "
        "d'atteindre une volatilité si basse avec diversification suffisante. "
        "Fallback vers allocation heuristique (règles prédéfinies)."
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


# ============= PROFILE CONSTRAINTS v6.11 (PROFILE_POLICY aligned) =============

@dataclass
class ProfileConstraints:
    """
    Contraintes par profil — vol_target est indicatif (pénalité douce).
    
    v6.11: Alignement avec PROFILE_POLICY (preset_meta.py v2.3)
           - min_stock_weight/max_stock_weight cohérents avec equity_min/max_weight
           - min_stock_positions augmentés pour forcer diversification
    v6.10: Stable vol_target aligné sur réalité (6%), vol_tolerance réduit (3%)
    v6.9: Stable bonds_min réduit (35%), vol_tolerance augmenté (5%)
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
    # v6.21 P0 PARTNER: Turnover control
    max_turnover: float = 25.0       # Max turnover % par rebalancement
    turnover_penalty: float = 0.10   # Lambda pénalité dans objectif
    # === v2.2 EU/US Focus ===
    euus_mode: bool = False          # Si True, utilise caps EU/US
    # === v6.11: Sleeve Actions (aligné PROFILE_POLICY) ===
    min_stock_weight: float = 0.0      # % minimum en Actions
    max_stock_weight: float = 100.0    # % maximum en Actions (NOUVEAU)
    min_stock_positions: int = 0       # nb minimum de lignes Actions
    stock_pos_threshold: float = 1.0   # % min pour compter une ligne action


# v6.11: Alignement avec PROFILE_POLICY (preset_meta.py v2.3)
PROFILES = {
    "Agressif": ProfileConstraints(
        name="Agressif", 
        vol_target=18.0, 
        vol_tolerance=3.0,
        crypto_max=10.0, 
        bonds_min=5.0,
        max_sector=35.0,
        max_turnover=30.0,
        turnover_penalty=0.05,
        # v6.11: Aligné avec PROFILE_POLICY["Agressif"]
        min_stock_weight=50.0,      # equity_min_weight = 0.50
        max_stock_weight=75.0,      # equity_max_weight = 0.75
        min_stock_positions=12,     # min_equity_positions = 12
    ),
    "Modéré": ProfileConstraints(
        name="Modéré", 
        vol_target=12.0, 
        vol_tolerance=3.0,
        crypto_max=5.0, 
        bonds_min=15.0,
        max_turnover=25.0,
        turnover_penalty=0.10,
        # v6.11: Aligné avec PROFILE_POLICY["Modéré"]
        min_stock_weight=40.0,      # equity_min_weight = 0.40
        max_stock_weight=60.0,      # equity_max_weight = 0.60
        min_stock_positions=10,     # min_equity_positions = 10
    ),
    "Stable": ProfileConstraints(
        name="Stable", 
        vol_target=6.0,
        vol_tolerance=3.0,
        crypto_max=0.0, 
        bonds_min=35.0,
        max_turnover=15.0,
        turnover_penalty=0.20,
        # v6.11: Aligné avec PROFILE_POLICY["Stable"]
        min_stock_weight=25.0,      # equity_min_weight = 0.25
        max_stock_weight=45.0,      # equity_max_weight = 0.45
        min_stock_positions=8,      # min_equity_positions = 8
    ),
}


# === v2.2: PROFILES EU/US Focus ===
PROFILES_EUUS = {
    "Agressif": ProfileConstraints(
        name="Agressif", 
        vol_target=18.0, 
        vol_tolerance=3.0,
        crypto_max=10.0, 
        bonds_min=5.0,
        max_sector=35.0,
        max_turnover=30.0,
        turnover_penalty=0.05,
        euus_mode=True,
        # v6.11: Aligné avec PROFILE_POLICY["Agressif"]
        min_stock_weight=50.0,
        max_stock_weight=75.0,
        min_stock_positions=12,
    ),
    "Modéré": ProfileConstraints(
        name="Modéré", 
        vol_target=12.0, 
        vol_tolerance=3.0,
        crypto_max=5.0, 
        bonds_min=15.0,
        max_turnover=25.0,
        turnover_penalty=0.10,
        euus_mode=True,
        # v6.11: Aligné avec PROFILE_POLICY["Modéré"]
        min_stock_weight=40.0,
        max_stock_weight=60.0,
        min_stock_positions=10,
    ),
    "Stable": ProfileConstraints(
        name="Stable", 
        vol_target=6.0,
        vol_tolerance=3.0,
        crypto_max=0.0, 
        bonds_min=35.0,
        max_turnover=15.0,
        turnover_penalty=0.20,
        euus_mode=True,
        # v6.11: Aligné avec PROFILE_POLICY["Stable"]
        min_stock_weight=25.0,
        max_stock_weight=45.0,
        min_stock_positions=8,
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
            return "rendement_etf", Role.CORE  # v6.29 FIX: aligné avec preset_etf.py v1.1.0
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

def _passes_momentum_filter(asset: Asset, profile_name: str) -> Tuple[bool, Optional[str]]:
    """
    v6.24: Vérifie si l'asset passe le filtre momentum.
    Conditionné par rôle/preset - ne bloque pas les presets contrarian.
    
    Returns:
        (passes: bool, reason: Optional[str])
    """
    # Pas de filtre pour presets contrarian
    if asset.preset in MOMENTUM_FILTER_EXEMPT_PRESETS:
        return True, None
    
    # Pas de données = on laisse passer
    if not asset.source_data:
        return True, None
    
    # === Récupérer perf 3 mois selon la catégorie ===
    if asset.category == "Crypto":
        # Crypto: ret_90d_pct (90 jours ≈ 3 mois)
        raw_perf = asset.source_data.get("ret_90d_pct")
    elif asset.category == "ETF":
        # ETF: perf_3m_pct
        raw_perf = asset.source_data.get("perf_3m_pct") or asset.source_data.get("perf_3m")
    else:
        # Actions: perf_3m
        raw_perf = asset.source_data.get("perf_3m")
    
    # Convertir en float de manière sécurisée
    try:
        perf_3m = float(raw_perf) if raw_perf is not None else 0.0
    except (TypeError, ValueError):
        perf_3m = 0.0
    
    # Récupérer seuil pour ce profil + rôle
    role = asset.role or Role.SATELLITE
    thresholds = MOMENTUM_THRESHOLDS.get(profile_name, {})
    min_3m = thresholds.get(role, -25.0)  # Default -25%
    
    # Crypto: seuils plus larges (vol énorme)
    if asset.category == "Crypto":
        min_3m *= 2.0  # -15% → -30%
    
    # Check
    if perf_3m < min_3m:
        return False, f"perf_3m={perf_3m:.1f}% < {min_3m:.1f}%"
    
    return True, None

def enrich_assets_with_buckets(assets: List[Asset]) -> List[Asset]:
    """Enrichit tous les actifs avec leur preset, rôle (bucket) et risk_bucket."""
    for asset in assets:
        if asset.preset is None or asset.role is None:
            preset, role = assign_preset_to_asset(asset)
            asset.preset = preset
            asset.role = role
        if asset.category == "Actions" and asset.corporate_group is None:
            asset.corporate_group = get_corporate_group(asset.name)
        
        # === Phase 1: Ajouter risk_bucket classification ===
        if HAS_RISK_BUCKETS and not hasattr(asset, '_risk_bucket'):
            bucket, _ = classify_asset(asset.source_data or {})  # Tuple unpacking
            asset._risk_bucket = bucket.value  # Stocker comme string
    
    role_counts = defaultdict(int)
    bucket_counts = defaultdict(int)  # Phase 1: tracker risk_buckets
    
    for asset in assets:
        if asset.role:
            role_counts[asset.role.value] += 1
        if hasattr(asset, '_risk_bucket'):
            bucket_counts[asset._risk_bucket] += 1
    
    logger.info(f"Bucket distribution: {dict(role_counts)}")
    if HAS_RISK_BUCKETS:
        logger.info(f"Risk bucket distribution: {dict(bucket_counts)}")
    
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
            # v6.14 P0-2 FIX: Tie-breaker (score, id) pour tri stable
            group_stocks.sort(key=lambda a: (a.score, a.id), reverse=True)
            kept = group_stocks[:max_per_group]
            removed = group_stocks[max_per_group:]
            deduplicated_stocks.extend(kept)
            if removed:
                removed_by_group[group_id] = [a.name for a in removed]
    
    total_removed = sum(len(v) for v in removed_by_group.values())
    if total_removed > 0:
        logger.info(f"Corporate deduplication: removed {total_removed} duplicate stocks")
    
    return non_stocks + deduplicated_stocks, removed_by_group

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
            # v6.14 P0-2 FIX: Tie-breaker (score, id) pour tri stable
            sorted_group = sorted(group, key=lambda a: (a.score, a.id), reverse=True)
            deduplicated_etfs.append(sorted_group[0])
            if len(sorted_group) > 1:
                removed_count += len(sorted_group) - 1
    
    n_bonds_after = sum(1 for a in other_assets if a.category == "Obligations")
    n_etf_after = len(deduplicated_etfs)
    
    logger.info(f"ETF dedup: ETF {n_etf_before}→{n_etf_after}, Bonds {n_bonds_before}→{n_bonds_after} (unchanged)")
    
    if removed_count > 0:
        logger.info(f"ETF deduplication: removed {removed_count} redundant ETFs")
    
    return other_assets + deduplicated_etfs


# ============= COVARIANCE HYBRIDE v6.15 (P1-6 KPIs) =============

# ============= COVARIANCE HYBRIDE v6.16 (P1-2 Ledoit-Wolf Shrinkage) =============

class HybridCovarianceEstimator:
    """
    Estimateur de covariance hybride: empirique + structurée.
    
    v6.16 P1-2: Ajout du shrinkage Ledoit-Wolf pour réduire le condition number
    v6.15 P1-6: Ajout des KPIs de qualité de la matrice:
    - condition_number: max(λ)/min(λ) - instable si > 1000
    - eigen_clipped: nombre d'eigenvalues forcées au minimum
    - eigen_clipped_pct: pourcentage d'eigenvalues clippées - alerte si > 20%
    - is_well_conditioned: flag booléen pour check rapide
    """
    
    def __init__(
        self, 
        empirical_weight: float = COVARIANCE_EMPIRICAL_WEIGHT,
        min_history_days: int = 60,
        use_shrinkage: bool = SHRINKAGE_ENABLED
    ):
        self.empirical_weight = empirical_weight
        self.min_history_days = min_history_days
        # v6.23 P0 FIX: Ledoit-Wolf désactivé explicitement (diag_shrink suffit)
        # Si réactivé, corriger le mismatch de dimensions (cov_shrunk vs cov_structured)
        self.use_shrinkage = False
    
    def compute_empirical_covariance(
        self, 
        assets: List[Asset]
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Calcule la covariance empirique si données suffisantes.
        
        P1-2: Retourne aussi la matrice de returns pour shrinkage Ledoit-Wolf.
        
        Returns:
            (cov_matrix, returns_matrix) - returns_matrix utilisé pour shrinkage
        """
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
            
            # === P0 FIX: guardrail échelle returns (pct vs decimal) ===
            daily_std = np.nanstd(returns, axis=0)
            med = float(np.nanmedian(daily_std)) if daily_std.size else 0.0
            if med > 0.03:  # 3% daily = ~47% annualisé, énorme
                logger.warning(
                    f"[P0 RETURNS FIX] returns_series en %, rescale /100 "
                    f"(median daily std={med:.4f})"
                )
                # Log les 5 pires outliers
                outlier_idx = np.where(daily_std > 0.05)[0][:5]
                for idx in outlier_idx:
                    logger.warning(f"  Outlier asset idx={idx}: daily_std={daily_std[idx]:.4f}")
                returns = returns / 100.0
            
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
            
            return cov_full, returns  # P1-2: Retourner returns pour shrinkage
        except Exception as e:
            logger.warning(f"Covariance empirique échouée: {e}")
            return None, None
    
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
    
    def _apply_ledoit_wolf_shrinkage(
        self, 
        returns_matrix: np.ndarray
    ) -> Tuple[np.ndarray, float]:
        """
        P1-2: Applique le shrinkage Ledoit-Wolf sur les returns.
        
        Le shrinkage réduit le condition number en combinant la covariance
        empirique avec une matrice structurée (identité scalée).
        
        Returns:
            (cov_shrunk, shrinkage_intensity) où shrinkage_intensity ∈ [0,1]
        """
        try:
            lw = LedoitWolf()
            lw.fit(returns_matrix)
            cov_shrunk = lw.covariance_ * 252  # Annualiser
            shrinkage_intensity = lw.shrinkage_
            return cov_shrunk, float(shrinkage_intensity)
        except Exception as e:
            logger.warning(f"Ledoit-Wolf shrinkage failed: {e}")
            # Fallback: covariance empirique simple
            cov_emp = np.cov(returns_matrix, rowvar=False) * 252
            return cov_emp, 0.0
    
    def compute(self, assets: List[Asset]) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Calcule la covariance hybride avec KPIs de qualité (P1-6) et shrinkage (P1-2).
        
        Returns:
            (matrice_covariance, diagnostics)
            
        Diagnostics incluent:
            - method: "structured", "hybrid", "hybrid_shrunk"
            - empirical_available: bool
            - empirical_weight: float
            - shrinkage_applied: bool - NOUVEAU P1-2
            - shrinkage_intensity: float [0,1] - NOUVEAU P1-2
            - condition_number_before_shrinkage: float - NOUVEAU P1-2
            - condition_number: max(λ)/min(λ) après shrinkage
            - eigen_clipped: nombre d'eigenvalues forcées
            - eigen_clipped_pct: pourcentage clippé
            - eigenvalue_min: plus petite eigenvalue (après clipping)
            - eigenvalue_max: plus grande eigenvalue
            - matrix_size: dimension n×n
            - is_well_conditioned: True si condition_number < 1000 et clipped < 20%
        """
        n = len(assets)
        cov_structured = self.compute_structured_covariance(assets)
        cov_empirical, returns_matrix = self.compute_empirical_covariance(assets)
        
        diagnostics = {
            "method": "structured",
            "empirical_available": False,
            "empirical_weight": 0.0,
            "matrix_size": n,
            # P1-2: Nouveaux champs shrinkage
            "shrinkage_applied": False,
            "shrinkage_intensity": 0.0,
            "condition_number_before_shrinkage": None,
        }
        
        if cov_empirical is not None:
            # P1-2: Calculer condition number AVANT shrinkage
            try:
                eigvals_before = np.linalg.eigvalsh(cov_empirical)
                eigvals_before = np.maximum(eigvals_before, 1e-10)
                cond_before = float(eigvals_before.max() / eigvals_before.min())
                diagnostics["condition_number_before_shrinkage"] = round(cond_before, 2)
            except:
                cond_before = float("inf")
                diagnostics["condition_number_before_shrinkage"] = cond_before
            
            # P1-2: Appliquer shrinkage si activé ET returns disponibles
            if self.use_shrinkage and returns_matrix is not None:
                cov_shrunk, shrinkage_intensity = self._apply_ledoit_wolf_shrinkage(returns_matrix)
                diagnostics["shrinkage_applied"] = True
                diagnostics["shrinkage_intensity"] = round(shrinkage_intensity, 4)
                
                # Utiliser cov_shrunk au lieu de cov_empirical
                cov_hybrid = (
                    self.empirical_weight * cov_shrunk + 
                    (1 - self.empirical_weight) * cov_structured
                )
                diagnostics["method"] = "hybrid_shrunk"
                
                logger.info(
                    f"🔧 Ledoit-Wolf shrinkage: δ={shrinkage_intensity:.3f}, "
                    f"cond_before={cond_before:.0f}"
                )
            else:
                # Sans shrinkage (comportement original)
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
        
        # P1-6: Ensure positive definite ET collecter les KPIs
        cov, eigen_kpis = self._ensure_positive_definite_with_kpis(cov)
        
        # Fusionner les KPIs dans diagnostics
        diagnostics.update(eigen_kpis)
        
        # === P1-2 v2: DIAGONAL SHRINKAGE SI CONDITION NUMBER TROP ÉLEVÉ ===
        cond_number = diagnostics.get("condition_number", float("inf"))
        if cond_number is not None and cond_number > CONDITION_NUMBER_TARGET:
            cov, shrink_info = diag_shrink_to_target(cov, target_cond=CONDITION_NUMBER_TARGET)

            # FIX: Recalculer KPIs APRÈS shrink (sinon diagnostics incohérents)
            cov, eigen_kpis2 = self._ensure_positive_definite_with_kpis(cov)
            diagnostics.update(eigen_kpis2)

            # Ajouter les infos de shrinkage
            diagnostics["diag_shrink_applied"] = shrink_info["shrink_applied"]
            diagnostics["diag_shrink_lambda"] = shrink_info["shrink_lambda"]
            diagnostics["diag_shrink_steps"] = shrink_info["shrink_steps"]
            diagnostics["condition_number_before_diag_shrink"] = shrink_info["cond_before"]

            # Mettre à jour method
            if diagnostics.get("method") == "structured":
                diagnostics["method"] = "structured+diag_shrink"
            elif "+diag_shrink" not in diagnostics.get("method", ""):
                diagnostics["method"] = diagnostics.get("method", "unknown") + "+diag_shrink"

            logger.info(
                f"🔧 DIAG SHRINK: cond {shrink_info['cond_before']:.0f} → {diagnostics.get('condition_number'):.0f} "
                f"(λ={shrink_info['shrink_lambda']:.3f}, steps={shrink_info['shrink_steps']})"
            )
        
        # Log warnings si matrice mal conditionnée
        if not diagnostics.get("is_well_conditioned", True):
            if diagnostics.get("condition_number", 0) > CONDITION_NUMBER_WARNING_THRESHOLD:
                logger.warning(
                    f"⚠️ COVARIANCE WARNING: condition_number={diagnostics['condition_number']:.1f} "
                    f"> {CONDITION_NUMBER_WARNING_THRESHOLD} (matrice instable, optimisation fragile)"
                )
            if diagnostics.get("eigen_clipped_pct", 0) > EIGEN_CLIPPED_PCT_WARNING_THRESHOLD:
                logger.warning(
                    f"⚠️ COVARIANCE WARNING: eigen_clipped_pct={diagnostics['eigen_clipped_pct']:.1f}% "
                    f"> {EIGEN_CLIPPED_PCT_WARNING_THRESHOLD}% (données insuffisantes)"
                )
        
        # P1-2: Log du résultat shrinkage
        if diagnostics.get("shrinkage_applied"):
            cond_after = diagnostics.get("condition_number", "N/A")
            cond_before = diagnostics.get("condition_number_before_shrinkage", "N/A")
            logger.info(
                f"📊 Shrinkage result: cond_number {cond_before} → {cond_after} "
                f"(target < {CONDITION_NUMBER_TARGET})"
            )
        
        return cov, diagnostics
    
    def _ensure_positive_definite_with_kpis(
        self, 
        cov: np.ndarray, 
        min_eigenvalue: float = 1e-6
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Force la matrice à être positive semi-définie ET retourne les KPIs.
        
        P1-6: Nouveaux KPIs retournés:
        - condition_number: max(λ)/min(λ)
        - eigen_clipped: nombre d'eigenvalues forcées au minimum
        - eigen_clipped_pct: pourcentage d'eigenvalues clippées
        - eigenvalue_min: plus petite eigenvalue (après clipping)
        - eigenvalue_max: plus grande eigenvalue
        - eigenvalue_min_raw: plus petite eigenvalue AVANT clipping
        - is_well_conditioned: True si condition_number < 1000 et clipped < 20%
        """
        kpis = {
            "condition_number": None,
            "eigen_clipped": 0,
            "eigen_clipped_pct": 0.0,
            "eigenvalue_min": None,
            "eigenvalue_max": None,
            "eigenvalue_min_raw": None,
            "is_well_conditioned": True,
        }
        
        # Nettoyage initial
        cov = np.nan_to_num(cov, nan=0.0, posinf=0.0, neginf=0.0)
        cov = (cov + cov.T) / 2
        n = cov.shape[0]
        cov += np.eye(n) * min_eigenvalue
        
        try:
            # Décomposition en valeurs propres
            eigenvalues, eigenvectors = np.linalg.eigh(cov)
            
            # KPIs AVANT clipping
            kpis["eigenvalue_min_raw"] = float(eigenvalues.min())
            kpis["eigenvalue_max"] = float(eigenvalues.max())
            
            # Compter les eigenvalues qui vont être clippées
            eigen_clipped = int(np.sum(eigenvalues < min_eigenvalue))
            kpis["eigen_clipped"] = eigen_clipped
            kpis["eigen_clipped_pct"] = round(100.0 * eigen_clipped / n, 2) if n > 0 else 0.0
            
            # Clipping des eigenvalues négatives ou trop petites
            eigenvalues_clipped = np.maximum(eigenvalues, min_eigenvalue)
            
            # KPIs APRÈS clipping
            kpis["eigenvalue_min"] = float(eigenvalues_clipped.min())
            
            # Condition number = max(λ) / min(λ)
            if eigenvalues_clipped.min() > 0:
                kpis["condition_number"] = round(
                    float(eigenvalues_clipped.max() / eigenvalues_clipped.min()), 
                    2
                )
            else:
                kpis["condition_number"] = float("inf")
            
            # Déterminer si la matrice est bien conditionnée
            cond_ok = (
                kpis["condition_number"] is not None and 
                kpis["condition_number"] < CONDITION_NUMBER_WARNING_THRESHOLD
            )
            clipped_ok = kpis["eigen_clipped_pct"] < EIGEN_CLIPPED_PCT_WARNING_THRESHOLD
            kpis["is_well_conditioned"] = cond_ok and clipped_ok
            
            # Reconstruire la matrice avec eigenvalues clippées
            cov_fixed = eigenvectors @ np.diag(eigenvalues_clipped) @ eigenvectors.T
            cov_fixed = (cov_fixed + cov_fixed.T) / 2
            
            return cov_fixed, kpis
            
        except Exception as e:
            logger.warning(f"Eigenvalue decomposition failed: {e}")
            kpis["is_well_conditioned"] = False
            kpis["condition_number"] = float("inf")
            kpis["eigen_clipped"] = n
            kpis["eigen_clipped_pct"] = 100.0
            return np.diag(np.maximum(np.diag(cov), min_eigenvalue)), kpis


# ============= PORTFOLIO OPTIMIZER v6.18.2 =============

class PortfolioOptimizer:
    """
    Optimiseur mean-variance v6.18.2.
    
    CHANGEMENTS v6.18.2:
    1. FIX: _adjust_for_vol_target() force TOUJOURS normalisation à 100%
    2. FIX: Tolérance 0.1 → 0.01 (corrige Stable 89.77% bug)
    
    CHANGEMENTS v6.15 (P1-6 Covariance KPIs):
    1. Diagnostics enrichis avec KPIs covariance (condition_number, eigen_clipped)
    2. Warnings automatiques si matrice mal conditionnée
    
    CHANGEMENTS v6.14 (P0 Technical Fixes - ChatGPT v2.0 Audit):
    1. P0-2 FIX: Tie-breaker (score, id) pour tri déterministe
       - sorted(..., key=lambda x: (x.score, x.id)) au lieu de key=lambda x: x.score
       - Garantit un ordre stable même en cas d'égalité de score
    
    CHANGEMENTS v6.13 (Conformité AMF - P0-9):
    1. FIX WORDING: "Certified" → "Heuristic" (terme non-trompeur)
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
        
        # === v2.2 EU/US FILTER ===
        if profile.euus_mode:
            universe_before = len(universe)
            filtered_universe = []
            for asset in universe:
                region = get_region(asset.region)
                # Actions : bloquer régions interdites
                if asset.category == "Actions" and region in BLOCKED_REGIONS_EUUS:
                    continue
                filtered_universe.append(asset)
            universe = filtered_universe
            logger.info(
                f"EU/US Filter: {universe_before} → {len(universe)} assets "
                f"(removed {universe_before - len(universe)} non-EU/US)"
            )
        
        # === ÉTAPE 1: Déduplication ETF ===
        if self.deduplicate_etfs_enabled:
            universe = deduplicate_etfs(universe, prefer_by="score")
            logger.info(f"Post-ETF-dedup universe: {len(universe)} actifs")
        
        # === ÉTAPE 2: Déduplication Corporate ===
        if self.deduplicate_corporate_enabled:
            universe, _ = deduplicate_stocks_by_corporate_group(universe, max_per_group=MAX_STOCKS_PER_GROUP)
            logger.info(f"Post-corporate-dedup universe: {len(universe)} actifs")
        
        # === ÉTAPE 3: HARD FILTER BUFFETT PAR PROFIL ===
        if self.buffett_hard_filter_enabled:
            # P1 FIX: Seuil Buffett différencié par profil
            BUFFETT_MIN_BY_PROFILE = {
                "Agressif": 40.0,  # Plus permissif → growth stocks
                "Modéré": 50.0,
                "Stable": 55.0,   # Plus strict → quality only
            }
            min_score = BUFFETT_MIN_BY_PROFILE.get(profile.name, self.buffett_min_score)
            universe = apply_buffett_hard_filter(universe, min_score=min_score)
            logger.info(f"Post-Buffett-filter universe: {len(universe)} actifs (min={min_score})")
        
        # === ÉTAPE 4: Enrichir avec buckets ===
        universe = enrich_assets_with_buckets(universe)
        
        # === ÉTAPE 5: Tri par score avec tie-breaker par ID ===
        # v6.14 P0-2 FIX: Tie-breaker (score, id) pour tri totalement déterministe
        sorted_assets = sorted(universe, key=lambda x: (x.score, x.id), reverse=True)
        
        # === ÉTAPE 6: Sélection diversifiée ===
        selected = []
        sector_count = defaultdict(int)
        category_count = defaultdict(int)
        exposure_count = defaultdict(int)
        bucket_count = defaultdict(int)
        corporate_group_count = defaultdict(int)
        
        target_pool = profile.max_assets * 3
        
        crypto_pool_count = 0
        crypto_scores = []
        
        momentum_rejected = 0
        
        for asset in sorted_assets:
            if len(selected) >= target_pool:
                break
            
            # === v6.24: FILTRE MOMENTUM PAR RÔLE ===
            passes, reason = _passes_momentum_filter(asset, profile.name)
            if not passes:
                momentum_rejected += 1
                logger.debug(f"Momentum filter: {asset.id} rejected ({reason})")
                continue
            
            if asset.category == "Crypto":
                if profile.crypto_max == 0:
                    continue
                # v6.28 FIX D: Pool crypto élargi pour core/satellite fonctionnel
                max_crypto_pool = 10 if profile.name == "Agressif" else 8
                if category_count["Crypto"] >= max_crypto_pool:
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
                key=lambda x: (x.vol_annual, x.id)  # v6.14 P0-2: tie-breaker
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
                key=lambda x: (x.vol_annual, x.id)  # v6.14 P0-2: tie-breaker
            )
            defensive_needed = min_defensive - len(defensive_in_pool)
            defensive_to_add = defensive_candidates[:defensive_needed]
            selected.extend(defensive_to_add)
            logger.info(f"P1 FIX v6.2: Added {len(defensive_to_add)} defensive assets to pool for {profile.name}")
        
        # === v3.9: TOP-N GUARANTEED SELECTION ===
        # Garantit TOUJOURS 25 actifs minimum (sauf univers < 25)
        TARGET_N = 25
        
        if len(selected) < TARGET_N:
            logger.warning(
                f"[TOP-N] Pool insuffisant: {len(selected)} < {TARGET_N}. "
                f"Application de sector_balanced_selection() sur l'univers complet."
            )
            
            # Appliquer sur l'univers APRÈS filtres (Buffett, dedup, etc.)
            # mais AVANT la sélection diversifiée restrictive
            selected_dicts, selection_meta = sector_balanced_selection(
                assets=[{
                    "id": a.id,
                    "name": a.name,
                    "sector": a.sector,
                    "composite_score": a.score,
                    "category": a.category,
                    "role": a.role,
                    "vol_annual": a.vol_annual,
                    "_original_asset": a,  # Garder référence
                } for a in universe],  # universe = post-Buffett, post-dedup
                target_n=TARGET_N,
                initial_max_per_sector=4,
                score_field="composite_score"
            )
            
            # Reconvertir en Asset objects
            selected = [item["_original_asset"] for item in selected_dicts if "_original_asset" in item]
            
            logger.info(
                f"[TOP-N] Sélection garantie: {selection_meta['selected']}/{selection_meta['target_n']} actifs "
                f"(PASS {selection_meta['pass_used']}, constraint_respected={selection_meta['constraint_respected']})"
            )
            
            # Stocker metadata pour diagnostics
            self._selection_metadata = selection_meta
        else:
            self._selection_metadata = {
                "version": "legacy",
                "selected": len(selected),
                "target_n": TARGET_N,
                "pass_used": 0,
                "constraint_respected": True,
            }
        
        # === v6.24: Log momentum rejections ===
        if momentum_rejected > 0:
            logger.info(f"Momentum filter: rejected {momentum_rejected} assets for {profile.name}")
        
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
        # 4b. LEVERAGED maximum (P0 FIX v6.19)
        if HAS_RISK_BUCKETS:
            leveraged_cap_pct = LEVERAGED_CAP.get(profile.name, 0.0)
            leveraged_idx = []
            
            for i, a in enumerate(candidates):
                bucket_str = getattr(a, '_risk_bucket', None)
                if bucket_str == 'leveraged':
                    leveraged_idx.append(i)
                elif a.source_data:
                    bucket, _ = classify_asset(a.source_data)
                    if bucket == RiskBucket.LEVERAGED:
                        leveraged_idx.append(i)
                        a._risk_bucket = bucket.value
            
            if leveraged_idx:
                if leveraged_cap_pct == 0:
                    # Interdit: force poids = 0 pour chaque leveraged
                    for idx in leveraged_idx:
                        def zero_lev(w, i=idx):
                            return -w[i]
                        constraints.append({"type": "ineq", "fun": zero_lev})
                    logger.info(f"P0 FIX: Leveraged FORBIDDEN for {profile.name} ({len(leveraged_idx)} assets)")
                else:
                    # Cap sur total leveraged
                    leveraged_cap = leveraged_cap_pct / 100
                    def leveraged_constraint(w, idx=leveraged_idx, max_val=leveraged_cap):
                        return max_val - np.sum(w[idx])
                    constraints.append({"type": "ineq", "fun": leveraged_constraint})
                    logger.info(f"P0 FIX: Leveraged cap {leveraged_cap_pct:.1f}% for {len(leveraged_idx)} assets")
        
        # 5. Contraintes par SECTEUR
        equity_like_candidates = [a for a in candidates if _is_equity_like(a)]
        equity_like_idx_map = {a.id: i for i, a in enumerate(candidates) if _is_equity_like(a)}
        
        for sector in set(a.sector for a in equity_like_candidates):
            sector_idx = [i for i, a in enumerate(candidates) 
                         if a.sector == sector and _is_equity_like(a)]
            if len(sector_idx) > 1:
                def sector_constraint(w, idx=sector_idx, max_val=profile.max_sector/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": sector_constraint})
        
        # 6. Contraintes par RÉGION DIFFÉRENCIÉES (actions seulement) v2.0
        region_groups = defaultdict(list)
        for i, a in enumerate(candidates):
            if a.category == "Actions":
                region = get_region(a.region)
                region_groups[region].append(i)
        
        for region, region_idx in region_groups.items():
            if len(region_idx) > 0:
                cap = get_stock_region_cap(profile.name, region)
                def region_constraint(w, idx=region_idx, max_val=cap):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": region_constraint})
                logger.debug(f"Region cap [{profile.name}]: {region}={cap*100:.0f}%")
        
        # 7. Contraintes par CORPORATE GROUP
        for group in set(a.corporate_group for a in candidates if a.corporate_group):
            group_idx = [i for i, a in enumerate(candidates) if a.corporate_group == group]
            if len(group_idx) > 1:
                def group_constraint(w, idx=group_idx, max_val=MAX_CORPORATE_GROUP_WEIGHT):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": group_constraint})
        
        # 8. Contraintes par BUCKET
        if self.use_bucket_constraints:
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
      # 9. P0 PARTNER: Contrainte turnover max
        # Note: prev_weights_array doit être passé via closure ou attribut
        # Ici on utilise une approche simplifiée via self._prev_weights_array
        if hasattr(self, '_prev_weights_array') and self._prev_weights_array is not None:
            max_to = profile.max_turnover / 100.0
            prev_w = self._prev_weights_array
            
            def turnover_constraint(w, prev=prev_w, max_val=max_to):
                turnover = 0.5 * np.sum(np.abs(w - prev))
                return max_val - turnover  # >= 0 pour respecter
            
            constraints.append({"type": "ineq", "fun": turnover_constraint})
            logger.info(f"P0 PARTNER: Added turnover constraint <= {profile.max_turnover}%")
        
        # 10. P1 FIX: Contrainte minimum Actions (sleeve)
        stocks_idx = [i for i, a in enumerate(candidates) if a.category == "Actions"]
        if stocks_idx and profile.min_stock_weight > 0:
            min_val = profile.min_stock_weight / 100.0
            def min_stocks_constraint(w, idx=stocks_idx, mv=min_val):
                return np.sum(w[idx]) - mv
            constraints.append({"type": "ineq", "fun": min_stocks_constraint})
            logger.info(f"[P1 FIX] Added min_stock_weight >= {profile.min_stock_weight:.1f}%")
        
        # 11. v6.11: Contrainte maximum Actions (aligné PROFILE_POLICY)
        if stocks_idx and hasattr(profile, 'max_stock_weight') and profile.max_stock_weight < 100.0:
            max_val = profile.max_stock_weight / 100.0
            def max_stocks_constraint(w, idx=stocks_idx, mv=max_val):
                return mv - np.sum(w[idx])  # max - sum >= 0
            constraints.append({"type": "ineq", "fun": max_stocks_constraint})
            logger.info(f"[v6.11] Added max_stock_weight <= {profile.max_stock_weight:.1f}%")
        
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
        v6.26: Initial weights that respect ALL constraints.
        Génère un point de départ faisable pour SLSQP.
        """
        n = len(candidates)
        max_single = profile.max_single_position / 100
        crypto_max = profile.crypto_max / 100
        
        # Start with uniform, capped at 80% of max_single (leave slack)
        base_weight = min(1.0 / n, max_single * 0.8)
        weights = np.full(n, base_weight)
        
        # Identify indices by category
        crypto_idx = [i for i, a in enumerate(candidates) if a.category == "Crypto"]
        bonds_idx = [i for i, a in enumerate(candidates) if a.category == "Obligations"]
        
        # Scale down crypto if needed (respect crypto_max)
        if crypto_idx and crypto_max < 1.0:
            crypto_sum = weights[crypto_idx].sum()
            if crypto_sum > crypto_max * 0.8:
                scale = (crypto_max * 0.8) / crypto_sum
                for i in crypto_idx:
                    weights[i] *= scale
        
        # Profile-specific adjustments
        if profile.name == "Stable":
            # Stable: bonds ~45%, rest distributed
            if bonds_idx:
                bonds_init = 0.45
                bond_weight = bonds_init / len(bonds_idx)
                for i in bonds_idx:
                    weights[i] = min(bond_weight, max_single * 0.9)
                
                # Reduce non-bonds proportionally
                other_idx = [i for i in range(n) if i not in bonds_idx]
                if other_idx:
                    remaining = 1.0 - sum(weights[bonds_idx])
                    other_weight = remaining / len(other_idx)
                    for i in other_idx:
                        weights[i] = min(other_weight, max_single * 0.9)
        
        elif profile.name == "Agressif":
            # Agressif: bonds ~10%, crypto capped
            if bonds_idx:
                bonds_target = 0.12
                bonds_sum = weights[bonds_idx].sum()
                if bonds_sum > bonds_target:
                    scale = bonds_target / bonds_sum
                    for i in bonds_idx:
                        weights[i] *= scale
        
        # Normalize to 1
        total = weights.sum()
        if total > 0:
            weights = weights / total
        else:
            weights = np.ones(n) / n
        
        return weights
    
    def _fallback_allocation(
        self,
        candidates: List[Asset],
        profile: ProfileConstraints,
        cov: Optional[np.ndarray] = None,
        prev_weights: Optional[Dict[str, float]] = None  # P0 PARTNER
    ) -> Dict[str, float]:
        """Allocation fallback VOL-AWARE avec diversification bonds."""
        logger.warning(f"Utilisation du fallback vol-aware pour {profile.name}")
        
        if cov is None:
            cov, _ = self.compute_covariance(candidates)
        
        vol_target = profile.vol_target / 100
        
        # P0 FIX v6.19: Initialize leveraged tracking
        leveraged_weight = 0.0
        leveraged_cap = LEVERAGED_CAP.get(profile.name, 0.0) if HAS_RISK_BUCKETS else 100.0
        
        if profile.name == "Stable":
            # v6.14 P0-2: Tie-breaker (vol, id) pour tri stable
            sorted_candidates = sorted(candidates, key=lambda a: (a.vol_annual, a.id))
        elif profile.name == "Agressif":
            # v6.14 P0-2: Tie-breaker (-score, id) pour tri stable
            sorted_candidates = sorted(candidates, key=lambda a: (-a.score, a.id))
        else:
            sorted_candidates = sorted(candidates, key=lambda a: (-(a.score - 0.02 * a.vol_annual), a.id))
        
        allocation = {}
        total_weight = 0.0
        
        category_weights = defaultdict(float)
        sector_weights = defaultdict(float)
        region_weights = defaultdict(float)  # v6.18 FIX: track region weights
        bucket_weights = defaultdict(float)
        
        bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
        
        # === Assurer bonds minimum AVEC DIVERSIFICATION ===
        bonds = sorted([a for a in sorted_candidates if a.category == "Obligations"], key=lambda x: (x.vol_annual, x.id))
        bonds_needed = float(profile.bonds_min)
        max_single_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 10.0)
        min_distinct = MIN_DISTINCT_BONDS.get(profile.name, 2)
        
        n_bonds_required = max(min_distinct, int(np.ceil(bonds_needed / max_single_bond)))
        n_bonds_to_use = min(len(bonds), max(n_bonds_required, 3))
        
        if n_bonds_to_use > 0:
            weight_per_bond = min(max_single_bond, bonds_needed / n_bonds_to_use)
            
            for bond in bonds[:n_bonds_to_use]:
                # v6.18.1: Bonds exclus de max_region (contrainte = actions only)
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
                
                # P1 FIX v6.19: Check avec weight prévu, pas juste >=
                available_sector = profile.max_sector - sector_weights[asset.sector]
                if available_sector < 0.5:
                    continue
                
                # P0 FIX v6.19: Check leveraged cap
                is_leveraged = False
                if HAS_RISK_BUCKETS:
                    bucket_str = getattr(asset, '_risk_bucket', None)
                    if bucket_str == 'leveraged':
                        is_leveraged = True
                    elif asset.source_data:
                        bucket, _ = classify_asset(asset.source_data)
                        is_leveraged = (bucket == RiskBucket.LEVERAGED)
                    
                    if is_leveraged and leveraged_weight >= leveraged_cap:
                        logger.debug(f"Skipping {asset.id}: leveraged_cap {leveraged_cap}% reached")
                        continue
                
                # v2.0 FIX: Vérifier region caps DIFFÉRENCIÉS pour Actions
                if asset.category == "Actions":
                    region = get_region(asset.region)
                    region_cap = get_stock_region_cap(profile.name, region) * 100
                    if region_weights[region] >= region_cap:
                        logger.debug(f"Skipping {asset.id}: {region} cap {region_cap:.0f}% reached")
                        continue
                
                if role == Role.DEFENSIVE:
                    base_weight = min(profile.max_single_position, 12.0)
                elif role == Role.CORE:
                    base_weight = min(profile.max_single_position, 10.0)
                elif role == Role.SATELLITE:
                    base_weight = min(profile.max_single_position, 8.0)
                else:
                    base_weight = min(5.0, profile.max_single_position)
                
                # P1 FIX v6.19: Inclure available_sector dans le min
                weight = min(base_weight, 100 - total_weight, target_pct - current_weight, available_sector)
                
                # P0 FIX v6.19: Cap par leveraged remaining
                if is_leveraged:
                    weight = min(weight, leveraged_cap - leveraged_weight)
                
                if weight > 0.5:
                    allocation[asset.id] = round(float(weight), 2)
                    total_weight += weight
                    category_weights[asset.category] += weight
                    sector_weights[asset.sector] += weight
                    if asset.category == "Actions":
                        region = get_region(asset.region)
                        region_weights[region] += weight  # v2.0: track par région mappée
                    bucket_weights[role.value] += weight
                    current_weight += weight
                    # P0 FIX v6.19: Update leveraged tracking
                    if is_leveraged:
                        leveraged_weight += weight
        
        # === Normaliser à 100% ===
        if total_weight > 0:
            factor = 100 / total_weight
            allocation = {k: round(float(v * factor), 2) for k, v in allocation.items()}
        
        # === Ajuster pour vol_target ===
        allocation = self._adjust_for_vol_target(allocation, candidates, profile, cov)
       # === P1 FIX v6.19: Enforce sector caps post-normalization ===
        allocation = self._enforce_sector_caps(allocation, candidates, profile)
        
        # === P1 FIX v6.21: FORCE BONDS MINIMUM (après toutes modifications) ===
        allocation = self._enforce_bonds_minimum(allocation, candidates, profile)
       # AJOUTER JUSTE APRÈS:
        # === P0 FIX v6.22: FORCE CRYPTO CAP ===
        allocation = self._enforce_crypto_cap(allocation, candidates, profile)
       
       # === v6.23: Appliquer Core/Satellite crypto ===
        allocation = self._apply_crypto_core_satellite(allocation, candidates, profile)
        
        # === v6.24: POST-PROCESSOR UNIFIÉ ===
        allocation = self._post_process_allocation(
            allocation, candidates, profile, prev_weights
        )
        
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
            # v6.18.2 FIX: Même si vol OK, on normalise à 100%
            total = sum(allocation.values())
            if total > 0 and abs(total - 100) > 0.01:
                allocation = {k: round(v * 100 / total, 2) for k, v in allocation.items()}
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
                
                high_vol_sorted = sorted(high_vol_ids, key=lambda x: (-allocation.get(x, 0), x))
                for hv_id in high_vol_sorted:
                    if allocation.get(hv_id, 0) > transfer + 1:
                        allocation[hv_id] -= transfer
                        break
                
                low_vol_sorted = sorted(low_vol_ids, key=lambda x: (allocation.get(x, 0), x))
                for lv_id in low_vol_sorted:
                    if allocation.get(lv_id, 0) < profile.max_single_position - transfer:
                        allocation[lv_id] = allocation.get(lv_id, 0) + transfer
                        break
                
            elif current_vol < vol_target and high_vol_ids and low_vol_ids:
                transfer = min(2.0, (vol_target - current_vol) / 2)
                
                low_vol_sorted = sorted(low_vol_ids, key=lambda x: (-allocation.get(x, 0), x))
                for lv_id in low_vol_sorted:
                    if allocation.get(lv_id, 0) > transfer + 1:
                        allocation[lv_id] -= transfer
                        break
                
                high_vol_sorted = sorted(high_vol_ids, key=lambda x: (allocation.get(x, 0), x))
                for hv_id in high_vol_sorted:
                    if allocation.get(hv_id, 0) < profile.max_single_position - transfer:
                        allocation[hv_id] = allocation.get(hv_id, 0) + transfer
                        break
            else:
                break
            
            weights = np.array([allocation.get(c.id, 0) / 100 for c in candidates])
            current_vol = self._compute_portfolio_vol(weights, cov)
        
        # v6.18.2 FIX: TOUJOURS normaliser à 100% (corrige bug Stable 89.77%)
        total = sum(allocation.values())
        if total > 0 and abs(total - 100) > 0.01:
            allocation = {k: round(v * 100 / total, 2) for k, v in allocation.items()}
        
        logger.info(f"Vol after adjustment: {current_vol:.1f}% (target={vol_target:.1f}%)")
        
        return allocation
    def _clip_turnover(
        self,
        allocation: Dict[str, float],
        prev_weights: Dict[str, float],
        max_turnover: float,
        candidates: List[Asset]
    ) -> Dict[str, float]:
        """
        P0 PARTNER: Clip allocation pour respecter max_turnover.
        
        Si turnover > max, on blend vers prev_weights.
        """
        # Calculer turnover actuel
        all_ids = set(allocation.keys()) | set(prev_weights.keys())
        turnover = 0.5 * sum(
            abs(allocation.get(aid, 0) - prev_weights.get(aid, 0))
            for aid in all_ids
        )
        
        if turnover <= max_turnover:
            return allocation
        
        # Blend factor: combien de prev_weights garder
        # turnover_blend = alpha * prev + (1-alpha) * new
        # On veut: 0.5 * sum(|alpha*prev + (1-alpha)*new - prev|) = max_turnover
        # = 0.5 * (1-alpha) * sum(|new - prev|) = max_turnover
        # => alpha = 1 - max_turnover / turnover
        alpha = 1.0 - (max_turnover / turnover)
        alpha = max(0, min(1, alpha))
        
        blended = {}
        for aid in all_ids:
            w_new = allocation.get(aid, 0)
            w_old = prev_weights.get(aid, 0)
            blended[aid] = round(alpha * w_old + (1 - alpha) * w_new, 2)
        
        # Normaliser à 100%
        total = sum(blended.values())
        if total > 0:
            blended = {k: round(v * 100 / total, 2) for k, v in blended.items()}
        
        # Retirer les poids < 0.5%
        blended = {k: v for k, v in blended.items() if v >= 0.5}
        
        logger.warning(
            f"P0 PARTNER: Turnover clipped from {turnover:.1f}% to {max_turnover:.1f}% "
            f"(blend alpha={alpha:.2f})"
        )
        
        return blended
    def optimize(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints,
        prev_weights: Optional[Dict[str, float]] = None  # P0 PARTNER: poids précédents
    ) -> Tuple[Dict[str, float], dict]:
        """
        Optimisation mean-variance avec covariance hybride.
        
        v6.21 P0 PARTNER: Ajout turnover control (prev_weights)
        v6.18.2: FIX normalisation 100% dans _adjust_for_vol_target()
        v6.15 P1-6: Diagnostics enrichis avec KPIs covariance.
        v6.14 P0-2: Tie-breaker (score, id) pour tri déterministe partout.
        v6.13: STABLE utilise le fallback heuristique (skip SLSQP).
        
        Args:
            candidates: Liste des actifs candidats
            profile: Contraintes du profil
            prev_weights: Poids précédents {asset_id: weight%} pour contrôle turnover
                         Si None, pas de contrainte turnover (première allocation)
        """
        n = len(candidates)
        if n < profile.min_assets:
            raise ValueError(f"Pool insuffisant ({n} < {profile.min_assets})")
        
        # === P0 PARTNER: Préparer prev_weights pour turnover ===
        if prev_weights is not None:
            # Convertir dict {id: pct} en array aligné sur candidates
            prev_weights_array = np.array([
                prev_weights.get(c.id, 0.0) / 100.0 for c in candidates
            ])
            has_prev_weights = True
            prev_total = sum(prev_weights.values())
            logger.info(f"P0 PARTNER: Turnover control enabled, prev_total={prev_total:.1f}%")
        else:
            prev_weights_array = np.zeros(n)
            has_prev_weights = False
        
        raw_scores = np.array([_clean_float(a.score, 0.0, -100, 100) for a in candidates])
        scores = self._normalize_scores(raw_scores) * self.score_scale
        
        cov, cov_diagnostics = self.compute_covariance(candidates)
        # PR3: Initialiser heuristic_metadata (vide par défaut, rempli si Stable)
        heuristic_metadata = {}
        
        # ============================================================
        # v6.13 FIX: STABLE FALLBACK HEURISTIC
        # ============================================================
        
        if profile.name in FORCE_FALLBACK_PROFILES:
            logger.info(
                f"🔧 {profile.name}: Utilisation du FALLBACK HEURISTIC "
                f"(contraintes incompatibles avec Markowitz)"
            )
            allocation = self._fallback_allocation(candidates, profile, cov, prev_weights)
            optimizer_converged = False
            fallback_reason = (
                "Stable profile: strict constraints (vol 6%±3%, bonds_min 35%, "
                "DEFENSIVE 45-60%) mathematically incompatible with Markowitz optimization"
            )
            optimization_mode = "fallback_heuristic"
            # PR3: Enrichir avec métadonnées heuristiques
            heuristic_metadata = {
                "heuristic_name": STABLE_HEURISTIC_RULES["name"],
                "heuristic_version": STABLE_HEURISTIC_RULES["version"],
                "rules_applied": STABLE_HEURISTIC_RULES["rules"],
                "rules_parameters": STABLE_HEURISTIC_RULES["parameters"],
                "why_not_slsqp": STABLE_HEURISTIC_RULES["why_not_slsqp"],
                "why_not_slsqp_details": STABLE_HEURISTIC_RULES["why_not_slsqp_details"],
            }
            
        else:
            # === SLSQP pour Agressif et Modéré ===
            vol_target = profile.vol_target / 100
            
            # P0 PARTNER: Stocker pour _build_constraints()
            self._prev_weights_array = prev_weights_array if has_prev_weights else None
            
            def objective(w):
                port_score = np.dot(w, scores)
                port_var = np.dot(w, np.dot(cov, w))
                port_vol = np.sqrt(max(port_var, 0))
                
                # Pénalité vol asymétrique
                vol_diff = port_vol - vol_target
                if vol_diff < 0:  # Sous la cible
                    vol_penalty = 8.0 * vol_diff ** 2
                else:  # Au-dessus
                    vol_penalty = 3.0 * vol_diff ** 2
                
                # P0 PARTNER: Pénalité turnover (v6.23 P0 FIX: 0.5× cohérent avec contrainte)
                if has_prev_weights:
                    turnover = 0.5 * np.sum(np.abs(w - prev_weights_array))
                    turnover_penalty = profile.turnover_penalty * turnover
                else:
                    turnover_penalty = 0.0
                
                return -(port_score - vol_penalty - turnover_penalty)
            
            constraints = self._build_constraints(candidates, profile, cov)
            bounds = [(0, profile.max_single_position / 100) for _ in range(n)]
            
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
                
                # === PHASE 3: Capturer poids bruts AVANT seuil 0.5% ===
                raw_weights_detail = []
                for i, w in enumerate(weights):
                    asset = candidates[i]
                    region = getattr(asset, 'region', 'Unknown') or 'Unknown'
                    
                    raw_weights_detail.append({
                        "id": asset.id,
                        "uid": asset.ticker or asset.name,
                        "name": (asset.name or "")[:40],
                        "raw_weight_pct": round(float(w * 100), 4),
                        "above_threshold": w > 0.005,
                        "raw_score": float(raw_scores[i]) if i < len(raw_scores) else 0,
                        "z_score": float(scores[i]) if i < len(scores) else 0,
                        "vol": asset.vol_annual,
                        "sector": asset.sector,
                        "region": region,
                        "role": asset.role.value if asset.role else None,
                    })
                
                raw_weights_detail.sort(key=lambda x: -x["raw_weight_pct"])
                
                almost_selected = [x for x in raw_weights_detail if 0.001 < x["raw_weight_pct"] < 0.5]
                
                if almost_selected:
                    logger.info(f"[PHASE 3] {profile.name}: {len(almost_selected)} assets presque selectionnes (0.1-0.5%)")
                    for item in almost_selected[:5]:
                        logger.info(f"   - {item['name'][:25]} ({item['region']}): {item['raw_weight_pct']:.3f}% (z={item['z_score']:.2f})")
                
                self._raw_weights_detail = raw_weights_detail
                # === FIN PHASE 3 ===
                
                weights = self._enforce_asset_count(weights, candidates, profile)
                
                allocation = {}
                for i, w in enumerate(weights):
                    if w > 0.005:
                        allocation[candidates[i].id] = round(float(w * 100), 2)
                
                allocation = self._adjust_to_100(allocation, profile)
               # === P0 FIX v6.22: FORCE CRYPTO CAP POST-SLSQP ===
                allocation = self._enforce_crypto_cap(allocation, candidates, profile)

                # === v6.24 FIX: APPLIQUER CORE/SATELLITE POST-SLSQP ===
                allocation = self._apply_crypto_core_satellite(allocation, candidates, profile)
                
                # === v6.24: POST-PROCESSOR UNIFIÉ ===
                allocation = self._post_process_allocation(
                    allocation, candidates, profile, prev_weights
                )
                # === v6.26: FINAL AUDIT (hard constraints) ===
                audit_violations = []
                asset_lookup = {c.id: c for c in candidates}
                
                # Check sum
                total_weight = sum(allocation.values())
                if abs(total_weight - 100.0) > 0.5:
                    audit_violations.append(f"sum={total_weight:.1f}≠100")
                
                # Check max_single
                if allocation:
                    max_w = max(allocation.values())
                    if max_w > profile.max_single_position + 0.1:
                        audit_violations.append(f"max_single={max_w:.1f}>{profile.max_single_position}")
                
                # Check crypto
                crypto_sum = sum(
                    w for aid, w in allocation.items() 
                    if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto"
                )
                if crypto_sum > profile.crypto_max + 0.1:
                    audit_violations.append(f"crypto={crypto_sum:.1f}>{profile.crypto_max}")
                
                if audit_violations:
                    logger.error(f"❌ AUDIT VIOLATIONS [{profile.name}]: {audit_violations}")
                    # Force re-correction
                    allocation = self._enforce_crypto_cap(allocation, candidates, profile)
                    allocation = self._adjust_to_100(allocation, profile)
                else:
                    logger.info(f"✅ AUDIT OK [{profile.name}]: sum={total_weight:.1f}%, max={max(allocation.values()) if allocation else 0:.1f}%, crypto={crypto_sum:.1f}%")
               
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
                    fallback_reason = f"SLSQP gave only {bonds_in_solution} bonds < {min_bonds_required} required"
                    allocation = self._fallback_allocation(candidates, profile, cov, prev_weights)
                    optimizer_converged = False
                    optimization_mode = "fallback_bonds_diversification"
                else:
                    optimizer_converged = True
                    optimization_mode = "slsqp"
            else:
                logger.warning(f"SLSQP failed for {profile.name}: {result.message}")
                fallback_reason = str(result.message)
                allocation = self._fallback_allocation(candidates, profile, cov, prev_weights)
                optimizer_converged = False
                optimization_mode = "fallback_slsqp_failed"
        
        # === DEBUG LOG [FINAL] ===
        asset_by_id = {a.id: a for a in candidates}
        logger.info(f"=== [FINAL {profile.name}] Allocation details ===")
        bonds_final = []
        crypto_final = []
        
        for aid, w in sorted(allocation.items(), key=lambda x: (-x[1], x[0])):
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
        
        # Summary crypto
        crypto_total = sum(w for _, _, _, w in crypto_final)
        logger.info(
            f"[DIAG CRYPTO {profile.name}] selected={len(crypto_final)}, "
            f"total={crypto_total:.1f}%, max_allowed={profile.crypto_max}%"
        )
        
        # === DIAGNOSTICS ===
        final_weights = np.array([allocation.get(c.id, 0)/100 for c in candidates])
        port_vol = self._compute_portfolio_vol(final_weights, cov)
        port_score = float(np.dot(final_weights, raw_scores))
        
        # P0 PARTNER: Calculer turnover final
        if has_prev_weights:
            final_turnover = compute_turnover(final_weights, prev_weights_array) * 100
        else:
            final_turnover = None
        
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
        # P2 FIX: Compter actions et ETF
        n_actions = sum(
            1 for aid in allocation 
            if asset_by_id.get(aid) and asset_by_id[aid].category == "Actions"
        )
        n_etf = sum(
            1 for aid in allocation 
            if asset_by_id.get(aid) and asset_by_id[aid].category == "ETF"
        )          
        
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
        
        # v6.15 P1-6: Inclure les KPIs covariance dans les diagnostics
        diagnostics = to_python_native({
            "converged": optimizer_converged,
            # === v3.9: Selection metadata ===
            "selection_metadata": getattr(self, '_selection_metadata', None),
            "optimization_mode": optimization_mode,
            "fallback_reason": fallback_reason,
            "fallback_heuristic": profile.name in FORCE_FALLBACK_PROFILES,
            # PR3: Métadonnées heuristiques (Stable uniquement)
            "heuristic_name": heuristic_metadata.get("heuristic_name"),
            "heuristic_version": heuristic_metadata.get("heuristic_version"),
            "rules_applied": heuristic_metadata.get("rules_applied"),
            "rules_parameters": heuristic_metadata.get("rules_parameters"),
            "why_not_slsqp": heuristic_metadata.get("why_not_slsqp"),
            "why_not_slsqp_details": heuristic_metadata.get("why_not_slsqp_details"),
            "message": "Fallback heuristique (contraintes strictes)" if profile.name in FORCE_FALLBACK_PROFILES else (
                "SLSQP converged" if optimizer_converged else f"Fallback: {fallback_reason}"
            ),
            "portfolio_vol": round(port_vol, 2),
            "vol_target": profile.vol_target,
            "vol_tolerance": profile.vol_tolerance,
            "vol_diff": round(port_vol - profile.vol_target, 2),
            # P0 PARTNER: Turnover diagnostics
            "turnover_control_enabled": has_prev_weights,
            "turnover_pct": round(final_turnover, 2) if final_turnover is not None else None,
            "turnover_max_allowed": profile.max_turnover,
            "turnover_penalty_lambda": profile.turnover_penalty,
            "portfolio_score": round(port_score, 3),
            "n_assets": len(allocation),
            # P2 FIX: Compter actions et ETF
            "n_actions": n_actions,
            "n_etf": n_etf,
            "n_bonds": bonds_in_allocation,
            "n_crypto": crypto_in_allocation,
            "crypto_max_allowed": profile.crypto_max,
            "sectors": dict(sector_exposure),
            "bucket_exposure": dict(bucket_exposure),
            "bucket_compliance": bucket_compliance,
            "corporate_group_exposure": dict(corporate_group_exposure),
            # === P1-6: Covariance KPIs ===
            "covariance_method": cov_diagnostics.get("method", "unknown"),
            "covariance_empirical_weight": cov_diagnostics.get("empirical_weight", 0),
            "covariance_kpis": {
                "condition_number": cov_diagnostics.get("condition_number"),
                "condition_number_before_shrinkage": cov_diagnostics.get("condition_number_before_shrinkage"),
                "shrinkage_applied": cov_diagnostics.get("shrinkage_applied", False),
                "shrinkage_intensity": cov_diagnostics.get("shrinkage_intensity", 0.0),
                "eigen_clipped": cov_diagnostics.get("eigen_clipped", 0),
                "eigen_clipped_pct": cov_diagnostics.get("eigen_clipped_pct", 0.0),
                "eigenvalue_min": cov_diagnostics.get("eigenvalue_min"),
                "eigenvalue_max": cov_diagnostics.get("eigenvalue_max"),
                "eigenvalue_min_raw": cov_diagnostics.get("eigenvalue_min_raw"),
                "matrix_size": cov_diagnostics.get("matrix_size", n),
                "is_well_conditioned": cov_diagnostics.get("is_well_conditioned", True),
                "thresholds": {
                    "condition_number_warning": CONDITION_NUMBER_WARNING_THRESHOLD,
                    "eigen_clipped_pct_warning": EIGEN_CLIPPED_PCT_WARNING_THRESHOLD,
                },
            },
            "buffett_hard_filter_enabled": self.buffett_hard_filter_enabled,
            "buffett_min_score": self.buffett_min_score,
            # === PHASE 3: Raw weights diagnostic ===
            "optimizer_candidates": {
                "count": len(candidates),
                "raw_weights_top_30": getattr(self, '_raw_weights_detail', [])[:30],
                "below_threshold_notable": [x for x in getattr(self, '_raw_weights_detail', []) if 0.001 < x["raw_weight_pct"] < 0.5][:10],
                "korea_in_candidates": sum(1 for x in getattr(self, '_raw_weights_detail', []) if "korea" in x.get("region", "").lower()),
            },
        })
        opt_mode_display = optimization_mode.upper().replace("_", " ")
        cov_status = "✅" if cov_diagnostics.get("is_well_conditioned", True) else "⚠️"
        turnover_str = f", turnover={final_turnover:.1f}%" if final_turnover is not None else ""
        logger.info(
            f"{profile.name}: {len(allocation)} actifs ({bonds_in_allocation} bonds, {crypto_in_allocation} crypto), "
            f"vol={port_vol:.1f}% (cible={profile.vol_target}%, tol=±{profile.vol_tolerance}%){turnover_str}, "
            f"mode={opt_mode_display}, cov={cov_diagnostics.get('method')} {cov_status}"
        )
        
        # P1-6: Log des KPIs covariance
        logger.info(
            f"[COV KPIs {profile.name}] condition_number={cov_diagnostics.get('condition_number')}, "
            f"eigen_clipped={cov_diagnostics.get('eigen_clipped')}/{cov_diagnostics.get('matrix_size')} "
            f"({cov_diagnostics.get('eigen_clipped_pct', 0):.1f}%), "
            f"well_conditioned={cov_diagnostics.get('is_well_conditioned')}"
        )
        
        # P0 PARTNER: Log turnover
        if has_prev_weights:
            turnover_status = "✅" if final_turnover <= profile.max_turnover else "⚠️"
            logger.info(
                f"[TURNOVER {profile.name}] {turnover_status} turnover={final_turnover:.1f}% "
                f"(max={profile.max_turnover}%, penalty_λ={profile.turnover_penalty})"
            )
        
        # === Phase 1: Enrichir diagnostics avec margins et exposures ===
        if HAS_CONSTRAINT_REPORT:
            try:
                diagnostics = enrich_diagnostics_with_margins(
                    diagnostics=diagnostics,
                    allocation=allocation,
                    candidates=candidates,
                    profile=profile,
                )
                logger.info(
                    f"[CONSTRAINT REPORT {profile.name}] "
                    f"quality_score={diagnostics.get('constraint_quality_score', 'N/A')}, "
                    f"violations={len(diagnostics.get('constraint_violations', []))}, "
                    f"bindings={len(diagnostics.get('constraint_bindings', []))}"
                )
            except Exception as e:
                logger.warning(f"Constraint report generation failed: {e}")
        
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
    def _enforce_sector_caps(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """
        P1 FIX v6.20: Enforce sector caps + max_single_position avec REDISTRIBUTION.
        
        Changements v6.20:
        - Utilise _is_equity_like() pour exclure bonds/leveraged/alternatives
        - Redistribue le poids libéré au lieu de scaling global
        - Itère jusqu'à convergence (max 5 itérations)
        """
        if not allocation:
            return allocation
        
        asset_lookup = {c.id: c for c in candidates}
        max_iterations = 5
        
        for iteration in range(max_iterations):
            # === 1. Calculer secteurs (equity-like uniquement) ===
            sector_weights = defaultdict(float)
            for aid, weight in allocation.items():
                asset = asset_lookup.get(aid)
                if asset and _is_equity_like(asset):
                    sector_weights[asset.sector] += weight
            
            # === 2. Identifier violations secteur ===
            sector_violations = {s: w for s, w in sector_weights.items() 
                                if w > profile.max_sector + 0.1}
            
            # === 3. Identifier violations max_single_position ===
            position_violations = [(aid, w) for aid, w in allocation.items() 
                                   if w > profile.max_single_position + 0.1]
            
            if not sector_violations and not position_violations:
                break  # Aucune violation, on sort
            
            if iteration == 0 and (sector_violations or position_violations):
                logger.warning(f"P1 FIX v6.20: Violations detected - sectors: {sector_violations}, positions: {len(position_violations)}")
            
            freed_weight = 0.0
            violating_sectors = set(sector_violations.keys())
            
            # === 4. Réduire secteurs violateurs ===
            for sector, current_weight in sector_violations.items():
                excess = current_weight - profile.max_sector
                
                # Trier par poids décroissant (réduire les plus gros d'abord)
                sector_assets = sorted(
                    [(aid, w) for aid, w in allocation.items() 
                     if asset_lookup.get(aid) and asset_lookup[aid].sector == sector 
                     and _is_equity_like(asset_lookup[aid]) and w > 1.0],
                    key=lambda x: (-x[1], x[0])
                )
                
                for aid, w in sector_assets:
                    if excess <= 0.01:
                        break
                    max_reduction = max(0, w - 3.0)  # Garder minimum 3%
                    reduction = min(excess, max_reduction)
                    if reduction > 0:
                        allocation[aid] = round(allocation[aid] - reduction, 2)
                        freed_weight += reduction
                        excess -= reduction
                        logger.debug(f"  Sector cap: reduced {aid} by {reduction:.2f}%")
            
            # === 5. Réduire positions > max_single_position ===
            for aid, weight in position_violations:
                excess = weight - profile.max_single_position
                allocation[aid] = round(profile.max_single_position, 2)
                freed_weight += excess
                logger.debug(f"  Position cap: capped {aid} at {profile.max_single_position}%")
            
            # === 6. Redistribuer freed_weight vers actifs éligibles ===
            if freed_weight > 0.1:
                # Candidats: sous max_single_position ET hors secteurs violateurs
                eligible = [
                    (aid, w) for aid, w in allocation.items()
                    if w > 0 
                    and w < profile.max_single_position - 0.5
                    and asset_lookup.get(aid)
                    and (not _is_equity_like(asset_lookup[aid]) 
                         or asset_lookup[aid].sector not in violating_sectors)
                ]
                
                if eligible:
                    # Trier par poids croissant (remplir les plus petits d'abord)
                    eligible = sorted(eligible, key=lambda x: (x[1], x[0]))
                    
                    for aid, w in eligible:
                        if freed_weight < 0.1:
                            break
                        headroom = profile.max_single_position - w
                        add = min(headroom, freed_weight)
                        if add > 0.1:
                            allocation[aid] = round(allocation[aid] + add, 2)
                            freed_weight -= add
            
            if iteration > 0:
                logger.info(f"  Iteration {iteration+1}: freed={freed_weight:.2f}% remaining")
        
        # === 7. Ajuster à 100% si nécessaire (petits écarts seulement) ===
        total = sum(allocation.values())
        if total > 0 and abs(total - 100) > 0.1:
            diff = 100 - total
            # Trouver le meilleur candidat pour absorber la différence
            candidates_for_adjust = [
                (aid, w) for aid, w in allocation.items()
                if w + diff <= profile.max_single_position and w + diff >= 0.5
            ]
            if candidates_for_adjust:
                best = max(candidates_for_adjust, key=lambda x: (x[1], x[0]))[0]
                allocation[best] = round(allocation[best] + diff, 2)
            else:
                # Dernier recours: scaling (risque faible car écart petit)
                allocation = {k: round(v * 100 / total, 2) for k, v in allocation.items()}
        
        return allocation
       
    def _enforce_region_caps(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """
        v2.2: Force region caps - supporte mode EU/US.
        """
        if not allocation:
            return allocation
        
        asset_lookup = {c.id: c for c in candidates}
        
        # Calculer poids par région mappée (Actions seulement)
        region_weights = defaultdict(float)
        for aid, w in allocation.items():
            asset = asset_lookup.get(aid)
            if asset and asset.category == "Actions":
                region = get_region(asset.region)
                region_weights[region] += w
        
        TOLERANCE = 0.1
        
        # Identifier et corriger violations
        for region, current_weight in list(region_weights.items()):
            # v2.2: Utiliser les bons caps selon le mode
            if profile.euus_mode:
                cap = get_stock_region_cap_euus(profile.name, region) * 100
            else:
                cap = get_stock_region_cap(profile.name, region) * 100
            
            # v2.2: En mode EU/US, cap=0 signifie INTERDIT
            if profile.euus_mode and cap == 0 and current_weight > 0:
                logger.warning(
                    f"EU/US MODE: {region} is BLOCKED, removing {current_weight:.2f}%"
                )
                for aid, w in list(allocation.items()):
                    asset = asset_lookup.get(aid)
                    if asset and asset.category == "Actions":
                        if get_region(asset.region) == region:
                            del allocation[aid]
                            logger.info(f"  Removed {aid} (blocked region {region})")
                continue
            
            if current_weight > cap + TOLERANCE:
                excess = current_weight - cap
                logger.warning(
                    f"v2.2 REGION CAP FIX: {region} {current_weight:.2f}% > {cap:.0f}%, "
                    f"reducing {excess:.2f}%"
                )
                
                region_assets = sorted(
                    [(aid, w) for aid, w in allocation.items()
                     if asset_lookup.get(aid) 
                     and asset_lookup[aid].category == "Actions"
                     and get_region(asset_lookup[aid].region) == region],
                    key=lambda x: (-x[1], x[0])
                )
                
                for aid, w in region_assets:
                    if excess <= 0.05:
                        break
                    reduction = min(w - 0.5, excess)
                    if reduction > 0:
                        allocation[aid] = round(allocation[aid] - reduction, 2)
                        excess -= reduction
                        logger.info(f"  Region cap: reduced {aid} by {reduction:.2f}%")
        
        allocation = {k: v for k, v in allocation.items() if v >= 0.5}
        
        return allocation
    def _redistribute_after_region_caps(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints,
        amount_to_add: float
    ) -> Dict[str, float]:
        """
        v2.1: Redistribue le poids libéré par region caps vers actifs éligibles.
        Priorité: Obligations > ETF > Actions hors régions saturées
        """
        if abs(amount_to_add) < 0.1:
            return allocation
        
        asset_lookup = {c.id: c for c in candidates}
        
        # Calculer régions saturées
        region_weights = defaultdict(float)
        for aid, w in allocation.items():
            asset = asset_lookup.get(aid)
            if asset and asset.category == "Actions":
                region = get_region(asset.region)
                region_weights[region] += w
        
        saturated_regions = {
            r for r, w in region_weights.items()
            if w >= get_stock_region_cap(profile.name, r) * 100 - 0.5
        }
        
        # Candidats par priorité
        # v6.26 FIX: Respecter cap bond dans redistribution
        max_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 25.0)
        bonds = [
            (aid, w) for aid, w in allocation.items()
            if asset_lookup.get(aid) and _is_bond_like(asset_lookup[aid])
            and w < max_bond - 0.5
        ]
        
        etfs = [(aid, w) for aid, w in allocation.items()
                if asset_lookup.get(aid) and asset_lookup[aid].category == "ETF"
                and w < profile.max_single_position - 1]
        
        actions_ok = [(aid, w) for aid, w in allocation.items()
                      if asset_lookup.get(aid) and asset_lookup[aid].category == "Actions"
                      and get_region(asset_lookup[aid].region) not in saturated_regions
                      and w < profile.max_single_position - 1]
        
        # Redistribuer
        remaining = amount_to_add
        for candidates_list in [bonds, etfs, actions_ok]:
            if remaining < 0.1:
                break
            candidates_list = sorted(candidates_list, key=lambda x: (x[1], x[0]))
            for aid, w in candidates_list:
                if remaining < 0.1:
                    break
                # v6.26 FIX: headroom respecte cap bond
                asset = asset_lookup.get(aid)
                if asset and _is_bond_like(asset):
                    headroom = min(profile.max_single_position, max_bond) - w
                else:
                    headroom = profile.max_single_position - w
                add = min(headroom, remaining, 2.0)
                if add > 0.1:
                    allocation[aid] = round(allocation[aid] + add, 2)
                    remaining -= add
        
        return allocation    
       
    def _enforce_bonds_minimum(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """
        P1 FIX v6.21: Force bonds >= bonds_min après toutes modifications.
        """
        if profile.bonds_min <= 0:
            return allocation
        
        asset_lookup = {c.id: c for c in candidates}
        
        bonds_current = sum(
            w for aid, w in allocation.items()
            if asset_lookup.get(aid) and asset_lookup[aid].category == "Obligations"
        )
        
        if bonds_current >= profile.bonds_min - 0.1:
            return allocation
        
        shortfall = profile.bonds_min - bonds_current
        logger.warning(
            f"P1 FIX v6.21: Bonds {bonds_current:.1f}% < {profile.bonds_min}% minimum, "
            f"need to add {shortfall:.1f}%"
        )
        
        bonds_in_pool = [c for c in candidates if c.category == "Obligations"]
        max_single_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 25.0)
        
        for bond in bonds_in_pool:
            if shortfall <= 0.1:
                break
            current_w = allocation.get(bond.id, 0)
            headroom = max_single_bond - current_w
            if headroom > 0.5:
                add = min(headroom, shortfall)
                allocation[bond.id] = round(current_w + add, 2)
                shortfall -= add
        
        if shortfall > 0.1:
            non_bonds = sorted(
                [(aid, w) for aid, w in allocation.items()
                 if asset_lookup.get(aid) and asset_lookup[aid].category != "Obligations"
                 and w > 3.0],
                key=lambda x: (-x[1], x[0])
            )
            
            for aid, w in non_bonds:
                if shortfall <= 0.1:
                    break
                reduction = min(w - 2.0, shortfall)
                if reduction > 0:
                    allocation[aid] = round(allocation[aid] - reduction, 2)
                    shortfall -= reduction
        
        total = sum(allocation.values())
        if abs(total - 100) > 0.5:
            non_bonds_total = sum(
                w for aid, w in allocation.items()
                if asset_lookup.get(aid) and asset_lookup[aid].category != "Obligations"
            )
            bonds_total = sum(
                w for aid, w in allocation.items()
                if asset_lookup.get(aid) and asset_lookup[aid].category == "Obligations"
            )
            
            target_non_bonds = 100 - bonds_total
            if non_bonds_total > 0 and target_non_bonds > 0:
                factor = target_non_bonds / non_bonds_total
                for aid in list(allocation.keys()):
                    if asset_lookup.get(aid) and asset_lookup[aid].category != "Obligations":
                        allocation[aid] = round(allocation[aid] * factor, 2)
        
        allocation = {k: v for k, v in allocation.items() if v >= 0.5}
        
        bonds_final = sum(
            w for aid, w in allocation.items()
            if asset_lookup.get(aid) and asset_lookup[aid].category == "Obligations"
        )
        logger.info(f"P1 FIX v6.21: Bonds after enforcement = {bonds_final:.1f}%")
        
        return allocation
    def _adjust_to_100(
        self, 
        allocation: Dict[str, float], 
        profile: ProfileConstraints,
        candidates: Optional[List[Asset]] = None  # v6.26: optionnel pour bond cap
    ) -> Dict[str, float]:
        """Ajustement à 100% en respectant max_single_position ET max_bond."""
        total = sum(allocation.values())
        if abs(total - 100) < 0.01:
            return allocation
        
        diff = 100 - total
        max_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 25.0)
        
        # v6.26: Si candidates fourni, respecter cap bond
        asset_lookup = {c.id: c for c in candidates} if candidates else {}
        
        def get_max_for_asset(aid: str, current_w: float) -> float:
            """Retourne le max autorisé pour cet asset."""
            if asset_lookup:
                asset = asset_lookup.get(aid)
                if asset and _is_bond_like(asset):
                    return min(profile.max_single_position, max_bond)
            return profile.max_single_position
        
        candidates_for_adjust = [
            (k, v) for k, v in allocation.items()
            if v + diff <= get_max_for_asset(k, v) and v + diff >= 0.5
        ]
        
        if candidates_for_adjust:
            # v6.14 P0-2: Tri stable avec tie-breaker
            target_id = max(candidates_for_adjust, key=lambda x: (x[1], x[0]))[0]
            allocation[target_id] = round(float(allocation[target_id] + diff), 2)
        else:
            if total > 0:
                for k in allocation:
                    allocation[k] = round(float(allocation[k] * 100 / total), 2)
        
        # v6.26 FIX: Post-normalization cap check
        max_single = profile.max_single_position
        needs_rebalance = True
        max_iterations = 5
        
        for _ in range(max_iterations):
            if not needs_rebalance:
                break
            needs_rebalance = False
            
            for aid in list(allocation.keys()):
                if allocation[aid] > max_single + 0.1:
                    excess = allocation[aid] - max_single
                    allocation[aid] = max_single
                    needs_rebalance = True
                    
                    # Redistribuer l'excès
                    others = [k for k in allocation if k != aid and allocation[k] < max_single - 0.5]
                    if others:
                        per_other = excess / len(others)
                        for other_aid in others:
                            headroom = max_single - allocation[other_aid]
                            add = min(per_other, headroom)
                            allocation[other_aid] = round(allocation[other_aid] + add, 2)
        
        return allocation
    def _check_all_violations(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> List[str]:
        """
        v6.24 + v2.1 FIX: Vérifie toutes les contraintes, retourne liste de violations.
        """
        asset_lookup = {c.id: c for c in candidates}
        violations = []
        
        # 1. Somme = 100%
        total = sum(allocation.values())
        if abs(total - 100) > 0.5:
            violations.append(f"sum={total:.1f}%")
        
        # 2. max_single_position
        for aid, w in allocation.items():
            if w > profile.max_single_position + 0.5:
                violations.append(f"max_position:{aid}={w:.1f}%")
        
        # 3. Bonds minimum
        bonds_pct = sum(w for aid, w in allocation.items() 
                        if asset_lookup.get(aid) and asset_lookup[aid].category == "Obligations")
        if bonds_pct < profile.bonds_min - 0.5:
            violations.append(f"bonds={bonds_pct:.1f}%<{profile.bonds_min}%")
        
        # 4. Crypto maximum
        crypto_pct = sum(w for aid, w in allocation.items() 
                         if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto")
        if crypto_pct > profile.crypto_max + 0.5:
            violations.append(f"crypto={crypto_pct:.1f}%>{profile.crypto_max}%")
        # 5. v6.26: Single bond cap
        max_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 25.0)
        for aid, w in allocation.items():
            asset = asset_lookup.get(aid)
            if asset and _is_bond_like(asset) and w > max_bond + 0.5:
                violations.append(f"bond_cap:{aid}={w:.1f}%>{max_bond}%")   
        
        # 6. Sector caps (equity-like only)
        sector_weights = defaultdict(float)
        for aid, w in allocation.items():
            asset = asset_lookup.get(aid)
            if asset and _is_equity_like(asset):
                sector_weights[asset.sector] += w
        
        for sector, w in sector_weights.items():
            if w > profile.max_sector + 0.5:
                violations.append(f"sector:{sector}={w:.1f}%")
        
        # 7. v2.1 FIX: Region caps (actions seulement)
        region_weights = defaultdict(float)
        for aid, w in allocation.items():
            asset = asset_lookup.get(aid)
            if asset and asset.category == "Actions":
                region = get_region(asset.region)
                region_weights[region] += w
        
        for region, w in region_weights.items():
            cap = get_stock_region_cap(profile.name, region) * 100
            if w > cap + 0.1:  # Tolérance stricte
                violations.append(f"region:{region}={w:.1f}%>{cap:.0f}%")
        
        return violations
    def _post_process_allocation(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints,
        prev_weights: Optional[Dict[str, float]] = None,
        max_iterations: int = 5,
        epsilon: float = 0.1
    ) -> Dict[str, float]:
        """
        v2.1 FIX: Post-processor avec region caps EN DERNIER après normalisation.
        """
        prev_alloc = allocation.copy()
        
        for iteration in range(max_iterations):
            # 1. Caps durs sur positions individuelles
            for aid, w in list(allocation.items()):
                if w > profile.max_single_position:
                    allocation[aid] = profile.max_single_position
            
            # 2. Enforce contraintes catégorie
            allocation = self._enforce_crypto_cap(allocation, candidates, profile)
            allocation = self._enforce_bonds_minimum(allocation, candidates, profile)
            allocation = self._enforce_sector_caps(allocation, candidates, profile)
            # P1 FIX: Enforce min stock positions
            allocation = self._enforce_min_stock_positions(allocation, candidates, profile)
            
            # 3. Normaliser à 100% (avec respect cap bond)
            allocation = self._adjust_to_100(allocation, profile, candidates)
            
            # 4. Region caps APRÈS normalisation
            allocation = self._enforce_region_caps(allocation, candidates, profile)
            
            # 5. Re-normaliser si region caps ont changé les poids
            total = sum(allocation.values())
            if abs(total - 100) > 0.5:
                allocation = self._redistribute_after_region_caps(
                    allocation, candidates, profile, 100 - total
                )
            
            # 6. v6.26 FIX: CAP BOND FINAL (après toutes redistributions)
            allocation = self._enforce_single_bond_cap(allocation, candidates, profile)
            
            # 7. Ajustement final à 100%
            allocation = self._adjust_to_100(allocation, profile, candidates)
            
            # 8. Turnover check
            if prev_weights is not None:
                allocation = self._clip_turnover(allocation, prev_weights, profile.max_turnover, candidates)

                # IMPORTANT: turnover peut casser le cap bond (et crypto aussi)
                allocation = self._enforce_single_bond_cap(allocation, candidates, profile)
                allocation = self._adjust_to_100(allocation, profile, candidates)
            
            # 9. Check violations
            violations = self._check_all_violations(allocation, candidates, profile)
            
            # 10. Delta convergence
            delta = sum(abs(allocation.get(k, 0) - prev_alloc.get(k, 0)) 
                        for k in set(allocation.keys()) | set(prev_alloc.keys()))
            
            if len(violations) == 0 and delta < epsilon:
                logger.info(f"Post-process converged at iteration {iteration + 1}")
                break
            
            prev_alloc = allocation.copy()
        
        if violations:
            logger.warning(f"Post-process: {len(violations)} violations after {max_iterations} iter: {violations}")
        
        # v6.29 FIX CRITIQUE: ENFORCE CRYPTO CAP EN DERNIER (après TOUTES les modifications)
        allocation = self._enforce_crypto_cap(allocation, candidates, profile)
        allocation = self._adjust_to_100(allocation, profile, candidates)
        
        return allocation

    def _enforce_crypto_cap(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """
        P0 FIX v6.22: Force crypto <= crypto_max après toutes modifications.
        """
        asset_lookup = {c.id: c for c in candidates}
        
        # Stable: crypto_max = 0, retirer toute crypto
        if profile.crypto_max <= 0:
            crypto_ids = [aid for aid in allocation 
                         if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto"]
            if crypto_ids:
                freed = sum(allocation[aid] for aid in crypto_ids)
                for aid in crypto_ids:
                    del allocation[aid]
                # Redistribuer vers non-crypto
                non_crypto = [aid for aid in allocation if allocation[aid] > 0]
                if non_crypto and freed > 0:
                    per_asset = freed / len(non_crypto)
                    for aid in non_crypto:
                        allocation[aid] = round(allocation[aid] + per_asset, 2)
                logger.warning(f"P0 FIX v6.22: Removed all crypto for {profile.name} (crypto_max=0)")
            return allocation
        
        # Calculer poids crypto actuel
        crypto_weight = sum(
            w for aid, w in allocation.items()
            if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto"
        )
        
        if crypto_weight <= profile.crypto_max + 0.1:
            return allocation  # OK, pas de dépassement
        
        excess = crypto_weight - profile.crypto_max
        logger.warning(
            f"P0 FIX v6.22: Crypto {crypto_weight:.1f}% > {profile.crypto_max}% max, "
            f"reducing by {excess:.1f}%"
        )
        
        # Réduire les cryptos (plus gros poids d'abord)
        # v6.27 FIX: Réduction GARANTIE au cap exact
        crypto_assets = [
            (aid, w) for aid, w in allocation.items()
            if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto"
        ]
        
        if not crypto_assets:
            return allocation
        
        # Calculer le ratio de réduction nécessaire
        target_ratio = profile.crypto_max / crypto_weight  # Ex: 5.0 / 7.8 = 0.64
        
        freed_weight = 0.0
        for aid, w in crypto_assets:
            new_weight = w * target_ratio
            if new_weight < 0.5:
                # Supprimer si trop petit après réduction
                freed_weight += w
                del allocation[aid]
                logger.info(f"Crypto {aid} removed (would be {new_weight:.2f}% < 0.5%)")
            else:
                reduction = w - new_weight
                freed_weight += reduction
                allocation[aid] = round(new_weight, 2)
        
        # Retirer cryptos < 0.5% (sécurité supplémentaire)
        for aid in list(allocation.keys()):
            if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto":
                if allocation[aid] < 0.5:
                    freed_weight += allocation[aid]
                    del allocation[aid]
        
        # Redistribuer freed_weight vers non-crypto (v6.26 FIX: respect max_single)
        if freed_weight > 0.1:
            max_single = profile.max_single_position
            remaining = freed_weight
            
            # Itération jusqu'à épuisement
            for _ in range(10):  # Max 10 passes
                if remaining < 0.1:
                    break
                
                eligible = [
                    (aid, w) for aid, w in allocation.items()
                    if asset_lookup.get(aid) 
                    and asset_lookup[aid].category != "Crypto"
                    and w < max_single - 0.5  # Marge de 0.5%
                ]
                
                if not eligible:
                    logger.warning(f"No eligible assets for redistribution, {remaining:.1f}% lost")
                    break
                
                # Répartir équitablement avec cap
                per_asset = remaining / len(eligible)
                actually_distributed = 0
                
                for aid, w in eligible:
                    headroom = max_single - w
                    add = min(headroom, per_asset)
                    if add > 0.1:
                        allocation[aid] = round(allocation[aid] + add, 2)
                        actually_distributed += add
                
                remaining -= actually_distributed
        
        # Log final
        crypto_final = sum(
            w for aid, w in allocation.items()
            if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto"
        )
        logger.info(f"P0 FIX v6.27: Crypto after enforcement = {crypto_final:.1f}%")
        
        return allocation
    def _enforce_single_bond_cap(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """
        v6.26 FIX: Force chaque bond-like <= MAX_SINGLE_BOND_WEIGHT[profile].
        """
        asset_lookup = {c.id: c for c in candidates}
        max_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 25.0)
        
        freed_weight = 0.0
        
        for aid, w in list(allocation.items()):
            asset = asset_lookup.get(aid)
            if asset and _is_bond_like(asset) and w > max_bond + 0.1:
                excess = w - max_bond
                allocation[aid] = round(max_bond, 2)
                freed_weight += excess
                logger.warning(
                    f"v6.26 FIX: Bond {aid} capped {w:.1f}% → {max_bond:.1f}% "
                    f"(freed {excess:.1f}%)"
                )
        
        # Redistribuer vers autres bonds si headroom disponible
        if freed_weight > 0.1:
            other_bonds = [
                (aid, w) for aid, w in allocation.items()
                if asset_lookup.get(aid) 
                and _is_bond_like(asset_lookup[aid])
                and w < max_bond - 0.5
            ]
            other_bonds = sorted(other_bonds, key=lambda x: (x[1], x[0]))
            
            for aid, w in other_bonds:
                if freed_weight < 0.1:
                    break
                headroom = max_bond - w
                add = min(headroom, freed_weight)
                if add > 0.1:
                    allocation[aid] = round(allocation[aid] + add, 2)
                    freed_weight -= add
            
            # Si reste, redistribuer vers non-bonds
            if freed_weight > 0.1:
                non_bonds = [
                    (aid, w) for aid, w in allocation.items()
                    if asset_lookup.get(aid) 
                    and not _is_bond_like(asset_lookup[aid])
                    and w < profile.max_single_position - 1
                ]
                non_bonds = sorted(non_bonds, key=lambda x: (x[1], x[0]))
                
                for aid, w in non_bonds:
                    if freed_weight < 0.1:
                        break
                    headroom = profile.max_single_position - w
                    add = min(headroom, freed_weight, 2.0)
                    if add > 0.1:
                        allocation[aid] = round(allocation[aid] + add, 2)
                        freed_weight -= add
        
        return allocation  
    def _enforce_min_stock_positions(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """
        P1 FIX: Force minimum de lignes Actions dans l'allocation.
        Post-process car SLSQP ne gère pas l'optimisation entière.
        """
        if profile.min_stock_positions <= 0:
            return allocation
        
        asset_lookup = {c.id: c for c in candidates}
        thr = profile.stock_pos_threshold
        
        # Compter actions actuelles >= threshold
        stock_ids = [
            aid for aid, w in allocation.items()
            if w >= thr 
            and asset_lookup.get(aid) 
            and asset_lookup[aid].category == "Actions"
        ]
        
        missing = profile.min_stock_positions - len(stock_ids)
        if missing <= 0:
            return allocation
        
        logger.warning(
            f"[P1 FIX] min_stock_positions: {len(stock_ids)}/{profile.min_stock_positions}, "
            f"need to add {missing} stocks"
        )
        
        # Candidats actions à ajouter (meilleur score d'abord)
        available_stocks = sorted(
            [c for c in candidates 
             if c.category == "Actions" 
             and c.id not in allocation],
            key=lambda x: (-x.score, x.id)
        )
        
        # Financer depuis ETF (réduire les plus gros ETF)
        etf_ids = sorted(
            [aid for aid, w in allocation.items()
             if asset_lookup.get(aid) and asset_lookup[aid].category == "ETF"],
            key=lambda aid: (-allocation[aid], aid)
        )
        
        add_w = max(thr, 1.0)  # 1% par action ajoutée
        MAX_ITER = 20
        iterations = 0
        
        for c in available_stocks[:missing]:
            if iterations >= MAX_ITER:
                logger.warning("[P1 FIX] Max iterations reached in _enforce_min_stock_positions")
                break
            iterations += 1
            
            need = add_w
            for eid in list(etf_ids):
                if need <= 0.01:
                    break
                if allocation.get(eid, 0) > (2.0 + need):
                    cut = min(need, allocation[eid] - 2.0)
                    allocation[eid] = round(allocation[eid] - cut, 2)
                    need -= cut
            
            if need <= 0.01:
                allocation[c.id] = round(add_w, 2)
                logger.info(f"[P1 FIX] Added stock {c.id} ({c.name[:30]}) = {add_w}%")
        
        # Nettoyer + normaliser
        allocation = {k: v for k, v in allocation.items() if v >= 0.5}
        
        return allocation   
    def _apply_crypto_core_satellite(
        self,
        allocation: Dict[str, float],
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """
        v6.23: Applique la structure Core/Satellite pour crypto.
        
        Core: BTC + ETH (60-70% du budget crypto)
        Satellite: Autres cryptos filtrées par DD (30-40% restant)
        """
        config = CRYPTO_CORE_SATELLITE.get(profile.name, {})
        if not config.get("enabled", False):
            return allocation
        
        asset_lookup = {c.id: c for c in candidates}
        
        # Calculer budget crypto total actuel
        crypto_total = sum(
            w for aid, w in allocation.items()
            if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto"
        )
        
        if crypto_total < 0.5:
            return allocation  # Pas de crypto, rien à faire
        
        # Retirer toutes les cryptos existantes
        crypto_ids = [aid for aid in allocation 
                     if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto"]
        for aid in crypto_ids:
            del allocation[aid]
        
        # === CORE: BTC + ETH ===
        core_budget = crypto_total * config["core_pct"]
        core_assets = config["core_assets"]
        core_split = config["core_split"]
        
        # === CORE: BTC + ETH ===
        core_budget = crypto_total * config["core_pct"]
        core_assets = config["core_assets"]
        core_split = config["core_split"]
        
        for i, core_pattern in enumerate(core_assets):
            # v6.24 FIX: Matching flexible via crypto_utils
            base_currency = core_pattern.split("/")[0]  # "BTC" ou "ETH"
            
            if HAS_CRYPTO_UTILS:
                core_asset = find_crypto_by_base(candidates, base_currency, portfolio_base="EUR")
            else:
                # Fallback: matching exact (comportement legacy)
                core_asset = next((c for c in candidates if c.id == core_pattern), None)
            
            if core_asset:
                weight = core_budget * core_split[i]
                if weight >= 0.5:
                    allocation[core_asset.id] = round(weight, 2)
                    logger.info(f"v6.24 CORE: {core_asset.id} (matched from {core_pattern}) = {weight:.2f}%")        
        
        # === SATELLITE: Autres cryptos ===
        satellite_budget = crypto_total * (1 - config["core_pct"])
        satellite_max = config["satellite_max_per_asset"] * crypto_total
        satellite_dd_max = config["satellite_dd_max"]
        
        # v6.23 P0 FIX: Exclure par IDs déjà alloués, pas par patterns
        core_ids_allocated = set(allocation.keys())
        
        # Filtrer et trier les satellites par score
        satellite_candidates = [
            c for c in candidates 
            if c.category == "Crypto" 
            and c.id not in core_ids_allocated  # FIX: utilise IDs réels, pas patterns
            and abs(_clean_float(c.source_data.get("drawdown_90d_pct", 0) if c.source_data else 0, 0, -100, 100)) <= satellite_dd_max
        ]
        satellite_candidates = sorted(satellite_candidates, key=lambda x: (-x.score, x.id))
        
        remaining = satellite_budget
        for sat in satellite_candidates:
            if remaining < 0.5:
                break
            weight = min(satellite_max, remaining)
            if weight >= 0.5:
                allocation[sat.id] = round(weight, 2)
                remaining -= weight
                logger.info(f"v6.23 SATELLITE: {sat.id} = {weight:.2f}%")
        
        # Log résumé (v6.23 P0 FIX: utilise IDs réels, pas patterns)
        core_final = sum(
            w for aid, w in allocation.items()
            if asset_lookup.get(aid) and asset_lookup[aid].category == "Crypto"
            and aid in core_ids_allocated
        )
        sat_final = crypto_total - core_final
        logger.info(f"v6.23 CRYPTO: core={core_final:.1f}%, satellite={sat_final:.1f}%, total={crypto_total:.1f}%")
        
        return allocation   
    def build_portfolio(
        self, 
        universe: List[Asset], 
        profile_name: str,
        prev_weights: Optional[Dict[str, float]] = None  # P0 PARTNER
    ) -> Tuple[Dict[str, float], dict]:
        """
        Pipeline complet: déduplication + Buffett hard filter + buckets + optimisation.
        
        Args:
            universe: Liste des actifs
            profile_name: Nom du profil ("Agressif", "Modéré", "Stable")
            prev_weights: Poids précédents pour contrôle turnover (optionnel)
        """
        profile = PROFILES[profile_name]
        candidates = self.select_candidates(universe, profile)
        
        if len(candidates) < profile.min_assets:
            raise ValueError(
                f"Univers insuffisant pour {profile_name}: "
                f"{len(candidates)} candidats < {profile.min_assets} requis"
            )
        
        return self.optimize(candidates, profile, prev_weights)

    def build_portfolio_euus(
        self, 
        universe: List[Asset], 
        profile_name: str,
        prev_weights: Optional[Dict[str, float]] = None
    ) -> Tuple[Dict[str, float], dict]:
        """
        Pipeline EU/US Focus: filtre géographique + optimisation.
        """
        profile = PROFILES_EUUS[profile_name]
        candidates = self.select_candidates(universe, profile)
        
        if len(candidates) < profile.min_assets:
            raise ValueError(
                f"Univers EU/US insuffisant pour {profile_name}: "
                f"{len(candidates)} candidats < {profile.min_assets} requis. "
                f"Vérifiez que vous avez assez d'actions EU/US dans l'univers."
            )
        
        allocation, diagnostics = self.optimize(candidates, profile, prev_weights)
        
        diagnostics["euus_mode"] = True
        diagnostics["euus_filter_applied"] = True
        
        return allocation, diagnostics


# ============= CONVERSION UNIVERS v6.7 =============

# v6.28 FIX A: Helpers pour mapping vol_annual selon vraies colonnes
def _as_pct(val: Any) -> Optional[float]:
    """
    Normalise un pourcentage: si val est en décimal (0.12) -> 12.0
    Sinon laisse tel quel. Guardrail pour données inconsistantes.
    """
    if val is None:
        return None
    try:
        v = float(val)
    except (TypeError, ValueError):
        return None
    # Guardrail: 0 < v < 1.5 => probablement décimal, convertir en %
    if 0 < v < 1.5:
        v *= 100.0
    return v


def _get_vol_from_item(item: dict, cat_normalized: str, default_vol: float) -> float:
    """
    v6.28 FIX A: Récupère la volatilité depuis les bonnes colonnes selon la catégorie.
    
    Mapping:
    - Crypto: vol_30d_annual_pct > vol_7d_annual_pct
    - Obligations: vol_pct > vol_3y_pct
    - ETF/Actions: vol_3y_pct > vol_pct > vol (fallback legacy)
    
    Applique _as_pct() pour gérer décimal vs pourcentage.
    """
    if cat_normalized == "Crypto":
        return (
            _as_pct(item.get("vol_30d_annual_pct"))
            or _as_pct(item.get("vol_7d_annual_pct"))
            or _as_pct(item.get("vol_pct"))
            or default_vol
        )
    if cat_normalized == "Obligations":
        return (
            _as_pct(item.get("vol_pct"))
            or _as_pct(item.get("vol_3y_pct"))
            or _as_pct(item.get("volatility_3y"))
            or _as_pct(item.get("vol_3y"))
            or default_vol
        )
    # ETF / Actions
    return (
        _as_pct(item.get("vol_3y_pct"))
        or _as_pct(item.get("vol_pct"))
        or _as_pct(item.get("vol"))
        or _as_pct(item.get("volatility_3y"))
        or _as_pct(item.get("vol_3y"))
        or default_vol
    )


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
            
            # ID generation with v6.7 validation
            raw_id = item.get("id") or item.get("ticker") or item.get("symbol")
            if not _is_valid_id(raw_id):
                raw_id = item.get("name") or f"{cat_normalized}_{len(assets)+1}"
            
            # P0 FIX: Caps vol différenciés par catégorie
            VOL_CAPS = {
                "Actions": (5.0, 80.0),
                "ETF": (3.0, 50.0),
                "Obligations": (1.0, 15.0),
                "Crypto": (20.0, 150.0),
            }
            min_v, max_v = VOL_CAPS.get(cat_normalized, (1.0, 150.0))
            
            # v6.28 FIX A: Utiliser helper pour mapper vol selon catégorie
            raw_vol = _get_vol_from_item(item, cat_normalized, default_vol)
            
            asset = Asset(
                id=str(raw_id),
                name=item.get("name") or str(raw_id),
                category=cat_normalized,
                sector=item.get("sector") or item.get("sector_top") or "Unknown",
                region=item.get("country") or item.get("country_top") or item.get("region") or "Global",
                score=_clean_float(
                    item.get("_profile_score") or item.get("composite_score") or item.get("_composite_score") or item.get("score") or item.get("_score"), 
                    50.0, 0, 100
                ),  # v6.27 FIX: _profile_score > composite_score > score (ETF/Crypto support)
                vol_annual=_clean_float(raw_vol, default_vol, min_v, max_v),  # v6.28 FIX A
                returns_series=item.get("returns_series"),
                source_data=item,
                exposure=item.get("exposure"),
                preset=item.get("preset"),
                buffett_score=item.get("_buffett_score"),
                ticker=item.get("ticker") or item.get("symbol"),   # v6.18.3: FIX ticker_coverage
                symbol=item.get("symbol") or item.get("ticker"),   # v6.18.3: alias
            )
            assets.append(asset)
    
    elif isinstance(universe, dict):
        for cat_key, items in universe.items():
            for item in items:
                item["category"] = cat_key
                assets.extend(convert_universe_to_assets([item]))
    
    return assets
