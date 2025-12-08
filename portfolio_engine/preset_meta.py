# portfolio_engine/preset_meta.py
"""
PRESET_META - Source unique de vérité pour les presets.

Définit pour chaque preset :
- asset_class : equity, etf, crypto, bond, cash
- role : core, satellite, defensive, lottery
- risk : low, moderate, high, very_high, extreme
- contraintes de poids
- score qualité minimum (actions)
- groupe de corrélation

Usage:
    from portfolio_engine.preset_meta import PRESET_META, PROFILE_BUCKET_TARGETS, Role
    
    config = PRESET_META["quality_premium"]
    print(config.role, config.risk, config.max_weight_pct)
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Set


# ============ ENUMS ============

class AssetClass(Enum):
    EQUITY = "equity"
    ETF = "etf"
    CRYPTO = "crypto"
    BOND = "bond"
    CASH = "cash"


class Role(Enum):
    CORE = "core"           # Stable, long-terme, faible turnover
    SATELLITE = "satellite" # Opportuniste, turnover plus élevé
    DEFENSIVE = "defensive" # Protection, décorrélé
    LOTTERY = "lottery"     # Très spéculatif, poids plafonné


class RiskLevel(Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"
    EXTREME = "extreme"


# ============ PRESET CONFIG ============

@dataclass
class PresetConfig:
    """Configuration d'un preset."""
    asset_class: AssetClass
    role: Role
    risk: RiskLevel
    max_weight_pct: float           # Poids max par ligne (%)
    max_bucket_pct: float           # Poids max total du preset (%)
    min_quality_score: float        # Score Buffett minimum (actions), 0 pour ETF/crypto
    correlation_group: str          # Pour matrice de corrélation
    description: str = ""           # Description courte
    turnover_tolerance: float = 0.05  # Bande de tolérance avant rebalancement (5% par défaut)
    
    # Expositions pour déduplication ETF
    exposures: List[str] = field(default_factory=list)


# ============ PRESET META - ACTIONS ============

EQUITY_PRESETS: Dict[str, PresetConfig] = {
    # --- DEFENSIVE / LOW VOL ---
    "defensif": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.DEFENSIVE,
        risk=RiskLevel.LOW,
        max_weight_pct=8.0,
        max_bucket_pct=25.0,
        min_quality_score=60,
        correlation_group="equity_defensive",
        description="Actions défensives, faible beta, utilities/staples",
        turnover_tolerance=0.08,  # Plus stable
    ),
    
    "low_volatility": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.CORE,
        risk=RiskLevel.LOW,
        max_weight_pct=8.0,
        max_bucket_pct=25.0,
        min_quality_score=60,
        correlation_group="equity_low_vol",
        description="Actions à faible volatilité historique",
        turnover_tolerance=0.08,
    ),
    
    "rendement": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.DEFENSIVE,
        risk=RiskLevel.LOW,
        max_weight_pct=8.0,
        max_bucket_pct=20.0,
        min_quality_score=60,
        correlation_group="equity_dividend",
        description="Actions à haut rendement dividende, payout stable",
        turnover_tolerance=0.08,
    ),
    
    # --- CORE QUALITY / VALUE ---
    "value_dividend": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.CORE,
        risk=RiskLevel.MODERATE,
        max_weight_pct=8.0,
        max_bucket_pct=25.0,
        min_quality_score=65,
        correlation_group="equity_value",
        description="Value + dividende croissant, PEG attractif",
        turnover_tolerance=0.06,
    ),
    
    "quality_premium": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.CORE,
        risk=RiskLevel.MODERATE,
        max_weight_pct=8.0,
        max_bucket_pct=30.0,
        min_quality_score=70,
        correlation_group="equity_quality",
        description="ROIC élevé, FCF solide, moat durable",
        turnover_tolerance=0.06,
    ),
    
    # --- GROWTH / MOMENTUM ---
    "croissance": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.SATELLITE,
        risk=RiskLevel.HIGH,
        max_weight_pct=6.0,
        max_bucket_pct=20.0,
        min_quality_score=50,
        correlation_group="equity_growth",
        description="Croissance EPS/CA, valorisation élevée acceptée",
        turnover_tolerance=0.05,
    ),
    
    "momentum_trend": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.SATELLITE,
        risk=RiskLevel.HIGH,
        max_weight_pct=5.0,
        max_bucket_pct=15.0,
        min_quality_score=50,
        correlation_group="equity_momentum",
        description="Momentum 6-12 mois, trend following",
        turnover_tolerance=0.04,  # Plus de turnover accepté
    ),
    
    # --- AGGRESSIVE / CYCLICAL ---
    "agressif": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.SATELLITE,
        risk=RiskLevel.VERY_HIGH,
        max_weight_pct=5.0,
        max_bucket_pct=15.0,
        min_quality_score=40,
        correlation_group="equity_momentum",
        description="High beta, secteurs cycliques, spéculatif",
        turnover_tolerance=0.04,
    ),
    
    "recovery": PresetConfig(
        asset_class=AssetClass.EQUITY,
        role=Role.SATELLITE,
        risk=RiskLevel.VERY_HIGH,
        max_weight_pct=4.0,
        max_bucket_pct=10.0,
        min_quality_score=40,
        correlation_group="equity_cyclical",
        description="Rebond post-chute, contrarian",
        turnover_tolerance=0.04,
    ),
}


# ============ PRESET META - ETF ============

ETF_PRESETS: Dict[str, PresetConfig] = {
    # --- CORE GLOBAL ---
    "coeur_global": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.CORE,
        risk=RiskLevel.MODERATE,
        max_weight_pct=20.0,
        max_bucket_pct=40.0,
        min_quality_score=0,
        correlation_group="equity_developed",
        description="World core UCITS, low TER, diversifié",
        turnover_tolerance=0.10,  # Très stable
        exposures=["world", "developed_markets", "large_cap"],
    ),
    
    "min_vol_global": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.DEFENSIVE,
        risk=RiskLevel.LOW,
        max_weight_pct=15.0,
        max_bucket_pct=25.0,
        min_quality_score=0,
        correlation_group="equity_low_vol",
        description="Global minimum volatility",
        turnover_tolerance=0.10,
        exposures=["world", "min_vol"],
    ),
    
    "qualite_value": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.CORE,
        risk=RiskLevel.MODERATE,
        max_weight_pct=15.0,
        max_bucket_pct=25.0,
        min_quality_score=0,
        correlation_group="equity_quality",
        description="Large caps quality/value factor",
        turnover_tolerance=0.08,
        exposures=["quality", "value", "large_cap"],
    ),
    
    # --- DEFENSIVE / BONDS ---
    "defensif_oblig": PresetConfig(
        asset_class=AssetClass.BOND,
        role=Role.DEFENSIVE,
        risk=RiskLevel.LOW,
        max_weight_pct=20.0,
        max_bucket_pct=40.0,
        min_quality_score=0,
        correlation_group="bonds_ig",
        description="Investment grade bonds, duration moyenne",
        turnover_tolerance=0.10,
        exposures=["bonds", "investment_grade"],
    ),
    
    "cash_ultra_short": PresetConfig(
        asset_class=AssetClass.CASH,
        role=Role.DEFENSIVE,
        risk=RiskLevel.LOW,
        max_weight_pct=30.0,
        max_bucket_pct=30.0,
        min_quality_score=0,
        correlation_group="cash",
        description="Ultra-short bonds / money market",
        turnover_tolerance=0.15,
        exposures=["cash", "ultra_short"],
    ),
    
    "inflation_shield": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.DEFENSIVE,
        risk=RiskLevel.MODERATE,
        max_weight_pct=10.0,
        max_bucket_pct=15.0,
        min_quality_score=0,
        correlation_group="commodities",
        description="TIPS, commodities, real assets",
        turnover_tolerance=0.08,
        exposures=["inflation", "tips", "commodities"],
    ),
    
    # --- INCOME ---
    "rendement_etf": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.CORE,
        risk=RiskLevel.MODERATE,
        max_weight_pct=12.0,
        max_bucket_pct=20.0,
        min_quality_score=0,
        correlation_group="equity_dividend",
        description="High dividend equity ETF",
        turnover_tolerance=0.08,
        exposures=["dividend", "income"],
    ),
    
    # --- SATELLITES ---
    "croissance_tech": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.SATELLITE,
        risk=RiskLevel.HIGH,
        max_weight_pct=10.0,
        max_bucket_pct=20.0,
        min_quality_score=0,
        correlation_group="equity_growth",
        description="Tech / growth ETF (QQQ, secteur tech)",
        turnover_tolerance=0.06,
        exposures=["tech", "growth", "nasdaq"],
    ),
    
    "smid_quality": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.SATELLITE,
        risk=RiskLevel.HIGH,
        max_weight_pct=8.0,
        max_bucket_pct=15.0,
        min_quality_score=0,
        correlation_group="equity_small",
        description="Small/mid caps quality",
        turnover_tolerance=0.06,
        exposures=["small_cap", "mid_cap"],
    ),
    
    "emergents": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.SATELLITE,
        risk=RiskLevel.HIGH,
        max_weight_pct=10.0,
        max_bucket_pct=15.0,
        min_quality_score=0,
        correlation_group="equity_em",
        description="Emerging markets diversifiés",
        turnover_tolerance=0.06,
        exposures=["emerging_markets", "em"],
    ),
    
    # --- COMMODITIES / GOLD ---
    "or_physique": PresetConfig(
        asset_class=AssetClass.ETF,
        role=Role.DEFENSIVE,
        risk=RiskLevel.MODERATE,
        max_weight_pct=10.0,
        max_bucket_pct=15.0,
        min_quality_score=0,
        correlation_group="gold",
        description="Gold physical ETF",
        turnover_tolerance=0.10,
        exposures=["gold", "precious_metals"],
    ),
}


# ============ PRESET META - CRYPTO ============

CRYPTO_PRESETS: Dict[str, PresetConfig] = {
    "quality_risk": PresetConfig(
        asset_class=AssetClass.CRYPTO,
        role=Role.CORE,
        risk=RiskLevel.HIGH,
        max_weight_pct=5.0,
        max_bucket_pct=10.0,
        min_quality_score=0,
        correlation_group="crypto_major",
        description="BTC/ETH - crypto 'blue chips'",
        turnover_tolerance=0.06,
        exposures=["crypto_major", "btc", "eth"],
    ),
    
    "trend3_12m": PresetConfig(
        asset_class=AssetClass.CRYPTO,
        role=Role.SATELLITE,
        risk=RiskLevel.HIGH,
        max_weight_pct=3.0,
        max_bucket_pct=5.0,
        min_quality_score=0,
        correlation_group="crypto_major",
        description="Trend following 3-12 mois",
        turnover_tolerance=0.05,
        exposures=["crypto_trend"],
    ),
    
    "swing7_30": PresetConfig(
        asset_class=AssetClass.CRYPTO,
        role=Role.SATELLITE,
        risk=RiskLevel.HIGH,
        max_weight_pct=2.0,
        max_bucket_pct=4.0,
        min_quality_score=0,
        correlation_group="crypto_altcoin",
        description="Swing trading 7-30 jours",
        turnover_tolerance=0.04,
        exposures=["crypto_swing"],
    ),
    
    "recovery_crypto": PresetConfig(
        asset_class=AssetClass.CRYPTO,
        role=Role.SATELLITE,
        risk=RiskLevel.VERY_HIGH,
        max_weight_pct=2.0,
        max_bucket_pct=3.0,
        min_quality_score=0,
        correlation_group="crypto_altcoin",
        description="Rebond post-chute, contrarian crypto",
        turnover_tolerance=0.04,
        exposures=["crypto_recovery"],
    ),
    
    "momentum24h": PresetConfig(
        asset_class=AssetClass.CRYPTO,
        role=Role.LOTTERY,
        risk=RiskLevel.EXTREME,
        max_weight_pct=1.0,
        max_bucket_pct=2.0,
        min_quality_score=0,
        correlation_group="crypto_altcoin",
        description="Ultra court terme, pure spéculation",
        turnover_tolerance=0.03,
        exposures=["crypto_momentum"],
    ),
    
    "highvol_lottery": PresetConfig(
        asset_class=AssetClass.CRYPTO,
        role=Role.LOTTERY,
        risk=RiskLevel.EXTREME,
        max_weight_pct=0.5,
        max_bucket_pct=1.0,
        min_quality_score=0,
        correlation_group="crypto_meme",
        description="Memecoins, high vol, lottery ticket",
        turnover_tolerance=0.02,
        exposures=["crypto_meme", "crypto_lottery"],
    ),
}


# ============ COMBINED PRESET_META ============

PRESET_META: Dict[str, PresetConfig] = {
    **EQUITY_PRESETS,
    **ETF_PRESETS,
    **CRYPTO_PRESETS,
}


# ============ PRESET PRIORITY (pour résoudre les conflits) ============

# Hiérarchie : si un titre matche plusieurs presets, on prend le premier de cette liste
EQUITY_PRESET_PRIORITY = [
    "quality_premium",
    "low_volatility", 
    "value_dividend",
    "defensif",
    "rendement",
    "croissance",
    "momentum_trend",
    "recovery",
    "agressif",
]

ETF_PRESET_PRIORITY = [
    "coeur_global",
    "min_vol_global",
    "defensif_oblig",
    "cash_ultra_short",
    "qualite_value",
    "rendement_etf",
    "inflation_shield",
    "or_physique",
    "croissance_tech",
    "smid_quality",
    "emergents",
]

CRYPTO_PRESET_PRIORITY = [
    "quality_risk",
    "trend3_12m",
    "swing7_30",
    "recovery_crypto",
    "momentum24h",
    "highvol_lottery",
]


# ============ PROFILE BUCKET TARGETS ============

PROFILE_BUCKET_TARGETS: Dict[str, Dict[Role, Tuple[float, float]]] = {
    "Stable": {
        Role.CORE: (0.30, 0.40),       # 30-40%
        Role.DEFENSIVE: (0.45, 0.60),  # 45-60%
        Role.SATELLITE: (0.05, 0.15),  # 5-15%
        Role.LOTTERY: (0.00, 0.00),    # 0%
    },
    "Modéré": {
        Role.CORE: (0.45, 0.55),       # 45-55%
        Role.DEFENSIVE: (0.20, 0.30),  # 20-30%
        Role.SATELLITE: (0.15, 0.25),  # 15-25%
        Role.LOTTERY: (0.00, 0.02),    # 0-2%
    },
    "Agressif": {
        Role.CORE: (0.35, 0.45),       # 35-45%
        Role.DEFENSIVE: (0.05, 0.15),  # 5-15%
        Role.SATELLITE: (0.35, 0.50),  # 35-50%
        Role.LOTTERY: (0.00, 0.05),    # 0-5%
    },
}


# ============ BENCHMARK PAR PROFIL ============

PROFILE_BENCHMARKS: Dict[str, Dict[str, float]] = {
    "Stable": {
        "URTH": 0.40,   # 40% MSCI World
        "IEF": 0.60,    # 60% US Treasury 7-10Y
    },
    "Modéré": {
        "URTH": 0.60,   # 60% MSCI World
        "IEF": 0.40,    # 40% US Treasury 7-10Y
    },
    "Agressif": {
        "URTH": 1.00,   # 100% MSCI World
    },
}


# ============ ETF EXPOSURE MAPPING (pour déduplication) ============

# Mapping : exposure → liste d'ETF équivalents (par ordre de préférence)
ETF_EXPOSURE_EQUIVALENTS: Dict[str, List[str]] = {
    "gold": ["GLD", "IAU", "GLDM", "SGOL", "IAUM", "AAAU"],
    "precious_metals": ["GLTR", "PPLT", "SLV"],
    "world": ["URTH", "VT", "ACWI", "IWDA.L", "VWRL.L"],
    "sp500": ["SPY", "IVV", "VOO"],
    "nasdaq": ["QQQ", "ONEQ"],
    "emerging_markets": ["EEM", "VWO", "IEMG"],
    "bonds_ig": ["LQD", "AGG", "BND"],
    "bonds_treasury": ["TLT", "IEF", "SHY"],
    "cash": ["BOXX", "BIL", "SHV"],
}


# ============ HELPER FUNCTIONS ============

def get_preset_config(preset_name: str) -> Optional[PresetConfig]:
    """Récupère la config d'un preset."""
    return PRESET_META.get(preset_name)


def get_presets_by_role(role: Role) -> List[str]:
    """Retourne tous les presets d'un rôle donné."""
    return [name for name, config in PRESET_META.items() if config.role == role]


def get_presets_by_asset_class(asset_class: AssetClass) -> List[str]:
    """Retourne tous les presets d'une classe d'actifs."""
    return [name for name, config in PRESET_META.items() if config.asset_class == asset_class]


def get_bucket_targets(profile: str) -> Dict[Role, Tuple[float, float]]:
    """Retourne les cibles de bucket pour un profil."""
    return PROFILE_BUCKET_TARGETS.get(profile, PROFILE_BUCKET_TARGETS["Modéré"])


def get_max_weight_for_preset(preset_name: str, profile: str) -> float:
    """
    Calcule le poids max effectif pour un preset dans un profil.
    
    Prend en compte à la fois max_weight_pct et les contraintes de bucket.
    """
    config = PRESET_META.get(preset_name)
    if not config:
        return 0.0
    
    # Poids max intrinsèque du preset
    max_weight = config.max_weight_pct / 100
    
    # Contrainte de bucket
    bucket_targets = PROFILE_BUCKET_TARGETS.get(profile, {})
    bucket_range = bucket_targets.get(config.role, (0, 1))
    bucket_max = bucket_range[1]
    
    # Le min des deux
    return min(max_weight, bucket_max)


def deduplicate_etf_by_exposure(
    etf_list: List[str],
    exposures_wanted: Optional[Set[str]] = None
) -> List[str]:
    """
    Déduplique une liste d'ETF par exposition.
    
    Garde un seul ETF par type d'exposition (gold, world, etc.)
    Préfère le premier de la liste ETF_EXPOSURE_EQUIVALENTS.
    
    Args:
        etf_list: Liste d'ETF candidats
        exposures_wanted: Set d'expositions à garder (None = toutes)
    
    Returns:
        Liste dédupliquée
    """
    selected = []
    exposures_covered = set()
    
    for exposure, equivalents in ETF_EXPOSURE_EQUIVALENTS.items():
        if exposures_wanted and exposure not in exposures_wanted:
            continue
            
        # Trouver le premier ETF de la liste qui est dans equivalents
        for etf in equivalents:
            if etf in etf_list and exposure not in exposures_covered:
                selected.append(etf)
                exposures_covered.add(exposure)
                break
    
    # Ajouter les ETF qui ne sont dans aucune catégorie connue
    known_etfs = set()
    for equivalents in ETF_EXPOSURE_EQUIVALENTS.values():
        known_etfs.update(equivalents)
    
    for etf in etf_list:
        if etf not in known_etfs and etf not in selected:
            selected.append(etf)
    
    return selected


def get_correlation_groups() -> Dict[str, List[str]]:
    """Retourne les groupes de corrélation avec leurs presets."""
    groups = {}
    for preset_name, config in PRESET_META.items():
        group = config.correlation_group
        if group not in groups:
            groups[group] = []
        groups[group].append(preset_name)
    return groups


# ============ CORRELATION MATRIX BY GROUP ============

CORRELATION_BY_GROUP: Dict[Tuple[str, str], float] = {
    # Equity correlations
    ("equity_quality", "equity_quality"): 1.0,
    ("equity_quality", "equity_value"): 0.75,
    ("equity_quality", "equity_growth"): 0.65,
    ("equity_quality", "equity_momentum"): 0.60,
    ("equity_quality", "equity_defensive"): 0.55,
    ("equity_quality", "equity_low_vol"): 0.60,
    
    ("equity_growth", "equity_momentum"): 0.80,
    ("equity_growth", "equity_cyclical"): 0.70,
    
    ("equity_defensive", "equity_low_vol"): 0.85,
    ("equity_defensive", "equity_dividend"): 0.70,
    
    # Cross-asset
    ("equity_developed", "equity_em"): 0.65,
    ("equity_developed", "bonds_ig"): 0.10,
    ("equity_developed", "gold"): 0.05,
    ("equity_developed", "crypto_major"): 0.35,
    
    ("bonds_ig", "cash"): 0.40,
    ("bonds_ig", "gold"): 0.15,
    ("bonds_ig", "crypto_major"): -0.10,
    
    ("gold", "commodities"): 0.50,
    ("gold", "crypto_major"): 0.20,
    
    # Crypto internal
    ("crypto_major", "crypto_altcoin"): 0.75,
    ("crypto_major", "crypto_meme"): 0.60,
    ("crypto_altcoin", "crypto_meme"): 0.80,
}


def get_correlation(group1: str, group2: str) -> float:
    """Retourne la corrélation entre deux groupes."""
    if group1 == group2:
        return 1.0
    
    # Chercher dans les deux sens
    key1 = (group1, group2)
    key2 = (group2, group1)
    
    if key1 in CORRELATION_BY_GROUP:
        return CORRELATION_BY_GROUP[key1]
    if key2 in CORRELATION_BY_GROUP:
        return CORRELATION_BY_GROUP[key2]
    
    # Default : corrélation modérée
    return 0.30


# ============ VALIDATION ============

def validate_portfolio_buckets(
    weights: Dict[str, float],
    preset_assignments: Dict[str, str],
    profile: str
) -> Dict[str, any]:
    """
    Valide qu'un portefeuille respecte les contraintes de bucket.
    
    Args:
        weights: {ticker: weight}
        preset_assignments: {ticker: preset_name}
        profile: "Stable", "Modéré", "Agressif"
    
    Returns:
        Dict avec validation status et détails
    """
    targets = PROFILE_BUCKET_TARGETS.get(profile, {})
    
    # Calculer les poids par rôle
    role_weights = {role: 0.0 for role in Role}
    
    for ticker, weight in weights.items():
        preset = preset_assignments.get(ticker)
        if preset and preset in PRESET_META:
            role = PRESET_META[preset].role
            role_weights[role] += weight
    
    # Vérifier les contraintes
    violations = []
    for role, (min_pct, max_pct) in targets.items():
        actual = role_weights.get(role, 0)
        if actual < min_pct:
            violations.append(f"{role.value}: {actual*100:.1f}% < min {min_pct*100:.1f}%")
        if actual > max_pct:
            violations.append(f"{role.value}: {actual*100:.1f}% > max {max_pct*100:.1f}%")
    
    return {
        "valid": len(violations) == 0,
        "role_weights": {r.value: w for r, w in role_weights.items()},
        "violations": violations,
    }


if __name__ == "__main__":
    # Test
    print("=" * 60)
    print("PRESET_META Summary")
    print("=" * 60)
    
    print(f"\nTotal presets: {len(PRESET_META)}")
    print(f"  - Equity: {len(EQUITY_PRESETS)}")
    print(f"  - ETF: {len(ETF_PRESETS)}")
    print(f"  - Crypto: {len(CRYPTO_PRESETS)}")
    
    print("\n--- By Role ---")
    for role in Role:
        presets = get_presets_by_role(role)
        print(f"  {role.value}: {len(presets)} presets")
    
    print("\n--- Bucket Targets ---")
    for profile, targets in PROFILE_BUCKET_TARGETS.items():
        print(f"\n  {profile}:")
        for role, (min_pct, max_pct) in targets.items():
            print(f"    {role.value}: {min_pct*100:.0f}%-{max_pct*100:.0f}%")
    
    print("\n--- ETF Deduplication Test ---")
    test_etfs = ["GLD", "IAU", "GLDM", "SGOL", "SPY", "QQQ", "EEM"]
    deduped = deduplicate_etf_by_exposure(test_etfs)
    print(f"  Input: {test_etfs}")
    print(f"  Output: {deduped}")
