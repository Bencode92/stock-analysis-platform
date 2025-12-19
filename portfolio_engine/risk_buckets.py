# portfolio_engine/risk_buckets.py
"""
Classification des actifs par Risk Bucket — v1.2

v1.2 FIX P0.5: Relax ALTERNATIVE_CAP Modéré 10%→15%
v1.1 FIX P0.4: Actions correctement classifiées equity_like
- Vérifier category AVANT fund_type vide
- Les Actions n'ont pas de fund_type → ne doivent pas retourner UNKNOWN

Implémente la classification ETF/Bonds en 6 buckets pour déterminer
le périmètre des contraintes (notamment max_region).

BUCKETS:
- EQUITY_LIKE: Compte dans max_region
- BOND_LIKE: Exclu de max_region
- LEVERAGED: Compte dans max_region mais gated par profil
- ALTERNATIVE: Exempt par défaut + cap
- REAL_ASSETS: Exempt (commodities + FX)
- CRYPTO: Exclu max_region, compte dans crypto_max
- UNKNOWN: Quality gate FAIL

Décisions de design validées par audit ChatGPT (2025-12-18).
"""

from enum import Enum
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import logging
import re

logger = logging.getLogger("portfolio_engine.risk_buckets")


# ============= ENUMS =============

class RiskBucket(Enum):
    """Classification des actifs par bucket de risque."""
    EQUITY_LIKE = "equity_like"      # Compte dans max_region
    BOND_LIKE = "bond_like"          # Exclu de max_region
    LEVERAGED = "leveraged"          # Compte dans max_region mais gated
    ALTERNATIVE = "alternative"      # Exempt par défaut + cap
    REAL_ASSETS = "real_assets"      # Exempt (commodities + FX)
    CRYPTO = "crypto"                # Exclu max_region, compte crypto_max
    UNKNOWN = "unknown"              # Quality gate FAIL


# ============= RÈGLES max_region =============

# Seuls ces buckets comptent dans la contrainte max_region
COUNTS_IN_MAX_REGION = {RiskBucket.EQUITY_LIKE, RiskBucket.LEVERAGED}


# ============= CAPS PAR PROFIL =============

# Cap LEVERAGED par profil (% du portefeuille)
LEVERAGED_CAP = {
    "Stable": 0.0,      # Interdit
    "Modéré": 0.0,      # Interdit
    "Agressif": 5.0,    # Max 5%
}

# Cap ALTERNATIVE par profil (% du portefeuille)
# v1.2: Modéré relaxé de 10% à 15% (violation observée 14.6%)
ALTERNATIVE_CAP = {
    "Stable": 5.0,      # Max 5%
    "Modéré": 15.0,     # Max 15% (relaxé de 10%)
    "Agressif": 20.0,   # Max 20%
}


# ============= MAPPING fund_type → RiskBucket =============

# Mots-clés pour BOND_LIKE (case-insensitive)
BOND_LIKE_KEYWORDS = [
    "bond", "government", "muni", "money market", "bank loan",
    "securitized", "inflation-protected", "treasury", "t-bill",
    "ultrashort", "target maturity", "core", "core-plus", "high yield",
    "emerging markets bond", "global bond", "corporate bond",
    "intermediate", "short-term", "long-term", "multisector bond",
    "nontraditional bond", "prime money market", "fixed income",
]

# Mapping explicite fund_type → RiskBucket
FUND_TYPE_TO_BUCKET: Dict[str, RiskBucket] = {
    # === BOND_LIKE ===
    "Ultrashort Bond": RiskBucket.BOND_LIKE,
    "Target Maturity": RiskBucket.BOND_LIKE,
    "High Yield Bond": RiskBucket.BOND_LIKE,
    "Intermediate Core Bond": RiskBucket.BOND_LIKE,
    "Intermediate Core-Plus Bond": RiskBucket.BOND_LIKE,
    "Short-Term Bond": RiskBucket.BOND_LIKE,
    "Corporate Bond": RiskBucket.BOND_LIKE,
    "Long-Term Bond": RiskBucket.BOND_LIKE,
    "Multisector Bond": RiskBucket.BOND_LIKE,
    "Nontraditional Bond": RiskBucket.BOND_LIKE,
    "Bank Loan": RiskBucket.BOND_LIKE,
    "Securitized Bond - Focused": RiskBucket.BOND_LIKE,
    "Securitized Bond - Diversified": RiskBucket.BOND_LIKE,
    "Inflation-Protected Bond": RiskBucket.BOND_LIKE,
    "Short-Term Inflation-Protected Bond": RiskBucket.BOND_LIKE,
    "Long Government": RiskBucket.BOND_LIKE,
    "Short Government": RiskBucket.BOND_LIKE,
    "Intermediate Government": RiskBucket.BOND_LIKE,
    "Emerging Markets Bond": RiskBucket.BOND_LIKE,
    "Emerging-Markets Local-Currency Bond": RiskBucket.BOND_LIKE,
    "Global Bond": RiskBucket.BOND_LIKE,
    "Global Bond-USD Hedged": RiskBucket.BOND_LIKE,
    "Muni National Interm": RiskBucket.BOND_LIKE,
    "Muni National Short": RiskBucket.BOND_LIKE,
    "Muni National Long": RiskBucket.BOND_LIKE,
    "Muni Target Maturity": RiskBucket.BOND_LIKE,
    "High Yield Muni": RiskBucket.BOND_LIKE,
    "Prime Money Market": RiskBucket.BOND_LIKE,
    "Miscellaneous Fixed Income": RiskBucket.BOND_LIKE,
    
    # === LEVERAGED ===
    "Trading--Leveraged Equity": RiskBucket.LEVERAGED,
    "Trading--Inverse Equity": RiskBucket.LEVERAGED,
    "Trading--Leveraged Debt": RiskBucket.LEVERAGED,
    "Trading--Inverse Debt": RiskBucket.LEVERAGED,
    "Trading--Leveraged Commodities": RiskBucket.LEVERAGED,
    "Trading--Inverse Commodities": RiskBucket.LEVERAGED,
    "Multi-Asset Leveraged": RiskBucket.LEVERAGED,
    
    # === ALTERNATIVE ===
    "Derivative Income": RiskBucket.ALTERNATIVE,
    "Defined Outcome": RiskBucket.ALTERNATIVE,
    "Equity Hedged": RiskBucket.ALTERNATIVE,
    "Systematic Trend": RiskBucket.ALTERNATIVE,
    "Long-Short Equity": RiskBucket.ALTERNATIVE,
    "Equity Market Neutral": RiskBucket.ALTERNATIVE,
    "Multistrategy": RiskBucket.ALTERNATIVE,
    "Tactical Allocation": RiskBucket.ALTERNATIVE,
    "Convertibles": RiskBucket.ALTERNATIVE,
    "Global Moderate Allocation": RiskBucket.ALTERNATIVE,
    "Global Aggressive Allocation": RiskBucket.ALTERNATIVE,
    "Global Conservative Allocation": RiskBucket.ALTERNATIVE,
    "Global Moderately Conservative Allocation": RiskBucket.ALTERNATIVE,
    "Moderate Allocation": RiskBucket.ALTERNATIVE,
    "Moderately Conservative Allocation": RiskBucket.ALTERNATIVE,
    "Aggressive Allocation": RiskBucket.ALTERNATIVE,
    
    # === REAL_ASSETS ===
    "Commodities Focused": RiskBucket.REAL_ASSETS,
    "Commodities Broad Basket": RiskBucket.REAL_ASSETS,
    "Equity Precious Metals": RiskBucket.REAL_ASSETS,  # Gold physique (AAAU, GLD, IAU)
    "Single Currency": RiskBucket.REAL_ASSETS,
    "USD": RiskBucket.REAL_ASSETS,
    
    # === CRYPTO ===
    "Digital Assets": RiskBucket.CRYPTO,
    "Equity Digital Assets": RiskBucket.CRYPTO,  # Prudent: exposition économique crypto
    
    # === EQUITY_LIKE (explicites) ===
    "Large Blend": RiskBucket.EQUITY_LIKE,
    "Large Value": RiskBucket.EQUITY_LIKE,
    "Large Growth": RiskBucket.EQUITY_LIKE,
    "Mid-Cap Blend": RiskBucket.EQUITY_LIKE,
    "Mid-Cap Value": RiskBucket.EQUITY_LIKE,
    "Mid-Cap Growth": RiskBucket.EQUITY_LIKE,
    "Small Blend": RiskBucket.EQUITY_LIKE,
    "Small Value": RiskBucket.EQUITY_LIKE,
    "Small Growth": RiskBucket.EQUITY_LIKE,
    "Technology": RiskBucket.EQUITY_LIKE,
    "Health": RiskBucket.EQUITY_LIKE,
    "Financial": RiskBucket.EQUITY_LIKE,
    "Industrials": RiskBucket.EQUITY_LIKE,
    "Utilities": RiskBucket.EQUITY_LIKE,
    "Communications": RiskBucket.EQUITY_LIKE,
    "Consumer Cyclical": RiskBucket.EQUITY_LIKE,
    "Consumer Defensive": RiskBucket.EQUITY_LIKE,
    "Real Estate": RiskBucket.EQUITY_LIKE,
    "Infrastructure": RiskBucket.EQUITY_LIKE,
    "Natural Resources": RiskBucket.EQUITY_LIKE,
    "Equity Energy": RiskBucket.EQUITY_LIKE,
    "Energy Limited Partnership": RiskBucket.EQUITY_LIKE,
    "Preferred Stock": RiskBucket.EQUITY_LIKE,
    "Global Large-Stock Blend": RiskBucket.EQUITY_LIKE,
    "Global Large-Stock Growth": RiskBucket.EQUITY_LIKE,
    "Global Large-Stock Value": RiskBucket.EQUITY_LIKE,
    "Global Small/Mid Stock": RiskBucket.EQUITY_LIKE,
    "Foreign Large Blend": RiskBucket.EQUITY_LIKE,
    "Foreign Large Value": RiskBucket.EQUITY_LIKE,
    "Foreign Large Growth": RiskBucket.EQUITY_LIKE,
    "Foreign Small/Mid Blend": RiskBucket.EQUITY_LIKE,
    "Foreign Small/Mid Value": RiskBucket.EQUITY_LIKE,
    "Diversified Emerging Mkts": RiskBucket.EQUITY_LIKE,
    "Europe Stock": RiskBucket.EQUITY_LIKE,
    "Japan Stock": RiskBucket.EQUITY_LIKE,
    "China Region": RiskBucket.EQUITY_LIKE,
    "India Equity": RiskBucket.EQUITY_LIKE,
    "Latin America Stock": RiskBucket.EQUITY_LIKE,
    "Pacific/Asia ex-Japan Stk": RiskBucket.EQUITY_LIKE,
    "Diversified Pacific/Asia": RiskBucket.EQUITY_LIKE,
}


# ============= CLASSIFICATION FUNCTIONS =============

def _has_bond_characteristics(asset_data: Dict[str, Any]) -> bool:
    """
    Vérifie si un actif a des caractéristiques obligataires.
    
    Priorité sur fund_type pour éviter la contamination
    (ex: Trading--Leveraged Equity dans le dataset bonds).
    """
    bond_fields = [
        "bond_avg_duration",
        "bond_credit_rating", 
        "bond_maturity",
        "yield_to_maturity",
        "coupon_rate",
    ]
    
    for field in bond_fields:
        value = asset_data.get(field)
        if value is not None and value != "" and value != "N/A":
            return True
    
    return False


def _is_leveraged_or_inverse(asset_data: Dict[str, Any]) -> bool:
    """Détecte si un ETF est leveraged ou inverse."""
    # Check etf_type
    etf_type = str(asset_data.get("etf_type", "")).lower()
    if etf_type in ["leveraged", "inverse", "leveraged & inverse"]:
        return True
    
    # Check leverage factor
    leverage = asset_data.get("leverage")
    if leverage is not None:
        try:
            if abs(float(leverage)) > 1:
                return True
        except (ValueError, TypeError):
            pass
    
    # Check name patterns
    name = str(asset_data.get("name", "")).lower()
    if any(kw in name for kw in ["2x", "3x", "-2x", "-3x", "ultra", "inverse", "short"]):
        return True
    
    return False


def _matches_bond_keywords(fund_type: str) -> bool:
    """Vérifie si fund_type contient des mots-clés obligataires."""
    fund_type_lower = fund_type.lower()
    return any(kw in fund_type_lower for kw in BOND_LIKE_KEYWORDS)


def classify_asset(asset_data: Dict[str, Any]) -> Tuple[RiskBucket, Dict[str, Any]]:
    """
    Classifie un actif dans un RiskBucket.
    
    Args:
        asset_data: Dictionnaire avec les données de l'actif
        
    Returns:
        (bucket, metadata) où metadata contient des infos de diagnostic
        
    Règles de priorité (v1.1 P0.4 FIX):
    1. Si champs obligataires présents → BOND_LIKE (évite contamination)
    2. Si leveraged/inverse → LEVERAGED
    3. Mapping fund_type explicite
    4. Mots-clés bond dans fund_type → BOND_LIKE
    5. Catégories connues (equity, bond, crypto) → bucket correspondant  ← DÉPLACÉ ICI
    6. fund_type vide ET catégorie inconnue → UNKNOWN
    7. ETF non mappé → EQUITY_LIKE par défaut
    8. Fallback → UNKNOWN
    """
    metadata = {
        "classification_rule": None,
        "fund_type": asset_data.get("fund_type"),
        "warnings": [],
    }
    
    fund_type = str(asset_data.get("fund_type", "")).strip()
    category = str(asset_data.get("category", "")).lower()
    
    # === RÈGLE 1: Caractéristiques obligataires (priorité max) ===
    if _has_bond_characteristics(asset_data):
        metadata["classification_rule"] = "bond_characteristics"
        
        # Warning si fund_type suggère autre chose
        if fund_type and "leveraged" in fund_type.lower():
            metadata["warnings"].append(
                f"fund_type='{fund_type}' mais champs obligataires présents → classé BOND_LIKE"
            )
        
        return RiskBucket.BOND_LIKE, metadata
    
    # === RÈGLE 2: Leveraged/Inverse (avant mapping) ===
    if _is_leveraged_or_inverse(asset_data):
        metadata["classification_rule"] = "leveraged_inverse_detected"
        return RiskBucket.LEVERAGED, metadata
    
    # === RÈGLE 3: Mapping explicite fund_type ===
    if fund_type in FUND_TYPE_TO_BUCKET:
        metadata["classification_rule"] = f"explicit_mapping:{fund_type}"
        return FUND_TYPE_TO_BUCKET[fund_type], metadata
    
    # === RÈGLE 4: Mots-clés bond dans fund_type ===
    if fund_type and _matches_bond_keywords(fund_type):
        metadata["classification_rule"] = f"bond_keyword_match:{fund_type}"
        return RiskBucket.BOND_LIKE, metadata
    
    # === RÈGLE 5: Catégories connues (P0.4 FIX - DÉPLACÉ AVANT fund_type check) ===
    # Les Actions/Obligations/Crypto n'ont pas de fund_type, donc doivent être
    # classifiées par category AVANT le check fund_type vide
    if category in ["actions", "equity", "equities", "stock"]:
        metadata["classification_rule"] = "default_equity_category"
        return RiskBucket.EQUITY_LIKE, metadata
    
    if category in ["obligations", "bond", "bonds"]:
        metadata["classification_rule"] = "default_bond_category"
        return RiskBucket.BOND_LIKE, metadata
    
    if category in ["crypto", "cryptocurrency"]:
        metadata["classification_rule"] = "default_crypto_category"
        return RiskBucket.CRYPTO, metadata
    
    # === RÈGLE 6: fund_type vide ET catégorie inconnue → UNKNOWN ===
    if not fund_type:
        metadata["classification_rule"] = "fund_type_empty_category_unknown"
        metadata["warnings"].append("fund_type vide et catégorie non reconnue → UNKNOWN (quality gate)")
        return RiskBucket.UNKNOWN, metadata
    
    # === RÈGLE 7: ETF non mappé → EQUITY_LIKE par défaut ===
    if category in ["etf", "etfs"]:
        metadata["classification_rule"] = f"default_etf_equity:{fund_type}"
        metadata["warnings"].append(
            f"fund_type='{fund_type}' non mappé → défaut EQUITY_LIKE"
        )
        return RiskBucket.EQUITY_LIKE, metadata
    
    # === RÈGLE 8: Fallback final → UNKNOWN ===
    metadata["classification_rule"] = "fallback_unknown"
    metadata["warnings"].append(f"Impossible de classifier: category={category}, fund_type={fund_type}")
    return RiskBucket.UNKNOWN, metadata


# ============= QUALITY GATES =============

@dataclass
class QualityGateResult:
    """Résultat d'une quality gate."""
    passed: bool
    gate_name: str
    message: str
    severity: str  # "error" | "warning"


def check_unknown_gate(bucket: RiskBucket, asset_id: str) -> QualityGateResult:
    """Gate 1: UNKNOWN interdit dans l'univers."""
    if bucket == RiskBucket.UNKNOWN:
        return QualityGateResult(
            passed=False,
            gate_name="unknown_bucket",
            message=f"Asset {asset_id} classé UNKNOWN → exclu de l'univers",
            severity="error"
        )
    return QualityGateResult(passed=True, gate_name="unknown_bucket", message="OK", severity="info")


def check_leveraged_gate(
    bucket: RiskBucket, 
    asset_id: str, 
    profile_name: str
) -> QualityGateResult:
    """Gate 2: LEVERAGED interdit pour Stable/Modéré."""
    if bucket != RiskBucket.LEVERAGED:
        return QualityGateResult(passed=True, gate_name="leveraged_allowed", message="OK", severity="info")
    
    cap = LEVERAGED_CAP.get(profile_name, 0.0)
    
    if cap == 0.0:
        return QualityGateResult(
            passed=False,
            gate_name="leveraged_forbidden",
            message=f"Asset {asset_id} LEVERAGED interdit pour profil {profile_name}",
            severity="error"
        )
    
    return QualityGateResult(
        passed=True, 
        gate_name="leveraged_allowed", 
        message=f"LEVERAGED autorisé pour {profile_name} (cap={cap}%)",
        severity="info"
    )


def check_region_known_gate(
    bucket: RiskBucket,
    asset_id: str,
    region: Optional[str]
) -> QualityGateResult:
    """Gate 3: Si compte dans max_region, la région doit être connue."""
    if bucket not in COUNTS_IN_MAX_REGION:
        return QualityGateResult(passed=True, gate_name="region_not_required", message="OK", severity="info")
    
    if not region or region.lower() in ["unknown", "n/a", "", "null", "none"]:
        return QualityGateResult(
            passed=False,
            gate_name="region_unknown",
            message=f"Asset {asset_id} compte dans max_region mais région inconnue → loophole",
            severity="error"
        )
    
    return QualityGateResult(passed=True, gate_name="region_known", message="OK", severity="info")


def run_quality_gates(
    asset_data: Dict[str, Any],
    bucket: RiskBucket,
    profile_name: str
) -> List[QualityGateResult]:
    """Exécute toutes les quality gates pour un actif."""
    asset_id = asset_data.get("id") or asset_data.get("ticker") or "unknown"
    region = asset_data.get("region") or asset_data.get("country") or asset_data.get("country_top")
    
    results = [
        check_unknown_gate(bucket, asset_id),
        check_leveraged_gate(bucket, asset_id, profile_name),
        check_region_known_gate(bucket, asset_id, region),
    ]
    
    return results


def filter_universe_by_gates(
    assets: List[Dict[str, Any]],
    profile_name: str
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Filtre l'univers en appliquant les quality gates.
    
    Returns:
        (assets_passed, assets_failed)
    """
    passed = []
    failed = []
    
    for asset in assets:
        bucket, metadata = classify_asset(asset)
        asset["_risk_bucket"] = bucket.value
        asset["_bucket_metadata"] = metadata
        
        gates = run_quality_gates(asset, bucket, profile_name)
        errors = [g for g in gates if not g.passed and g.severity == "error"]
        
        if errors:
            asset["_gate_failures"] = [g.message for g in errors]
            failed.append(asset)
            logger.warning(f"Quality gate FAIL: {asset.get('id')} → {[g.message for g in errors]}")
        else:
            passed.append(asset)
    
    logger.info(f"Quality gates: {len(passed)} passed, {len(failed)} failed for {profile_name}")
    
    return passed, failed


# ============= CONSTRAINT HELPERS =============

def counts_in_max_region(bucket: RiskBucket) -> bool:
    """Vérifie si un bucket compte dans la contrainte max_region."""
    return bucket in COUNTS_IN_MAX_REGION


def get_leveraged_cap(profile_name: str) -> float:
    """Retourne le cap LEVERAGED pour un profil."""
    return LEVERAGED_CAP.get(profile_name, 0.0)


def get_alternative_cap(profile_name: str) -> float:
    """Retourne le cap ALTERNATIVE pour un profil."""
    return ALTERNATIVE_CAP.get(profile_name, 5.0)


# ============= REPORT HELPERS =============

def compute_bucket_exposures(
    allocation: Dict[str, float],
    assets: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calcule les expositions par bucket pour le rapport de contraintes.
    
    Retourne des sous-métriques pour auditabilité.
    """
    asset_lookup = {a.get("id") or a.get("ticker"): a for a in assets}
    
    exposures = {
        "equity_like": 0.0,
        "bond_like": 0.0,
        "leveraged": 0.0,
        "alternative": 0.0,
        "real_assets": 0.0,
        "crypto": 0.0,
        "unknown": 0.0,
    }
    
    # Sous-métriques pour auditabilité
    sub_metrics = {
        "alt_derivative_income": 0.0,
        "alt_defined_outcome": 0.0,
        "alt_allocation_funds": 0.0,
        "alt_other": 0.0,
        "real_commodities": 0.0,
        "real_precious_metals": 0.0,
        "real_fx": 0.0,
    }
    
    # Métriques max_region
    region_exposure_risky = 0.0  # Actifs comptant dans max_region
    region_exposure_exempt = 0.0  # Actifs exemptés
    
    for asset_id, weight in allocation.items():
        asset = asset_lookup.get(asset_id)
        if not asset:
            continue
        
        bucket_str = asset.get("_risk_bucket", "unknown")
        try:
            bucket = RiskBucket(bucket_str)
        except ValueError:
            bucket = RiskBucket.UNKNOWN
        
        exposures[bucket.value] += weight
        
        # Sous-métriques
        fund_type = str(asset.get("fund_type", "")).lower()
        
        if bucket == RiskBucket.ALTERNATIVE:
            if "derivative income" in fund_type:
                sub_metrics["alt_derivative_income"] += weight
            elif "defined outcome" in fund_type:
                sub_metrics["alt_defined_outcome"] += weight
            elif "allocation" in fund_type:
                sub_metrics["alt_allocation_funds"] += weight
            else:
                sub_metrics["alt_other"] += weight
        
        elif bucket == RiskBucket.REAL_ASSETS:
            if "precious" in fund_type or "gold" in fund_type:
                sub_metrics["real_precious_metals"] += weight
            elif "currency" in fund_type or fund_type == "usd":
                sub_metrics["real_fx"] += weight
            else:
                sub_metrics["real_commodities"] += weight
        
        # max_region tracking
        if counts_in_max_region(bucket):
            region_exposure_risky += weight
        else:
            region_exposure_exempt += weight
    
    return {
        "bucket_exposures": exposures,
        "sub_metrics": sub_metrics,
        "region_exposure_risky": round(region_exposure_risky, 2),
        "region_exposure_exempt": round(region_exposure_exempt, 2),
        "counts_in_max_region_buckets": ["equity_like", "leveraged"],
    }
