# portfolio_engine/preset_meta.py
"""
PRESET_META - Source unique de vérité pour les presets.

v4.13.2 FIX: Correction scoring + _matched_preset + hard filters (Claude + ChatGPT consensus)
v2.3 PROFILE_POLICY: Scoring et univers différenciés par profil
v2.2 EU/US Focus: Added region caps and filters for EU/US only portfolios
v2.1 P0.5 FIX: Bucket targets relaxés pour réduire les violations

BUGS CORRIGÉS v4.13.2:
1. _matched_preset jamais assigné → assign_preset_to_equity() appelé automatiquement
2. compute_universe_stats() ne collecte pas les alias → collecte TOUS les alias
3. Normalisation clipping brutal → normalisation [-S,+S] → [0,1]
4. Pas de hard filters → ajout filtres vol_min/vol_max pour forcer divergence

Définit pour chaque preset :
- asset_class : equity, etf, crypto, bond, cash
- role : core, satellite, defensive, lottery
- risk : low, moderate, high, very_high, extreme
- contraintes de poids
- score qualité minimum (actions)
- groupe de corrélation

Usage:
    from portfolio_engine.preset_meta import PRESET_META, PROFILE_BUCKET_TARGETS, Role
    from portfolio_engine.preset_meta import PROFILE_POLICY, get_profile_policy
    from portfolio_engine.preset_meta import select_equities_for_profile
    
    config = PRESET_META["quality_premium"]
    print(config.role, config.risk, config.max_weight_pct)
    
    policy = get_profile_policy("Agressif")
    print(policy["allowed_equity_presets"])
    
    # v4.13.2: Sélection différenciée par profil
    selected, meta = select_equities_for_profile(equities, "Agressif", target_n=25)
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Set
import logging

logger = logging.getLogger(__name__)


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


# ============ CORPORATE GROUPS (pour déduplication actions) ============

CORPORATE_GROUPS: Dict[str, List[str]] = {
    # Corée du Sud
    "hyundai": ["HYUNDAI MOTOR", "HYUNDAI MOBIS", "KIA CORP", "KIA MOTORS"],
    "samsung": ["SAMSUNG ELECTRONICS", "SAMSUNG SDI", "SAMSUNG BIOLOGICS", "SAMSUNG LIFE", "SAMSUNG FIRE", "SAMSUNG C&T"],
    "sk_group": ["SK HYNIX", "SK TELECOM", "SK INNOVATION", "SK SQUARE"],
    "lg_group": ["LG ELECTRONICS", "LG CHEM", "LG ENERGY", "LG DISPLAY"],
    
    # Inde
    "tata": ["TATA CONSULTANCY", "TATA MOTORS", "TATA STEEL", "TATA POWER", "TATA CONSUMER", "TITAN COMPANY"],
    "reliance": ["RELIANCE INDUSTRIES", "RELIANCE RETAIL", "JIO PLATFORMS"],
    "adani": ["ADANI ENTERPRISES", "ADANI PORTS", "ADANI GREEN", "ADANI POWER", "ADANI TOTAL"],
    "hdfc": ["HDFC BANK", "HDFC LIFE", "HDFC AMC"],
    "icici": ["ICICI BANK", "ICICI PRUDENTIAL", "ICICI LOMBARD"],
    
    # USA - Tech
    "alphabet": ["ALPHABET INC CLASS A", "ALPHABET INC CLASS C", "ALPHABET INC", "GOOGLE"],
    "berkshire": ["BERKSHIRE HATHAWAY INC CLASS A", "BERKSHIRE HATHAWAY INC CLASS B", "BERKSHIRE HATHAWAY"],
    "meta": ["META PLATFORMS", "FACEBOOK"],
    
    # Europe - Luxe
    "lvmh": ["LVMH MOET HENNESSY", "CHRISTIAN DIOR", "HENNESSY", "LOUIS VUITTON"],
    "kering": ["KERING", "GUCCI"],
    "richemont": ["RICHEMONT", "CARTIER"],
    
    # Europe - Autres
    "volkswagen": ["VOLKSWAGEN", "PORSCHE", "AUDI", "VW"],
    "stellantis": ["STELLANTIS", "FIAT", "PEUGEOT", "CHRYSLER"],
    
    # Japon
    "toyota": ["TOYOTA MOTOR", "TOYOTA INDUSTRIES", "DENSO"],
    "softbank": ["SOFTBANK GROUP", "SOFTBANK CORP", "ARM HOLDINGS"],
    "sony": ["SONY GROUP", "SONY"],
    
    # Chine
    "alibaba": ["ALIBABA GROUP", "ALIBABA", "ANT GROUP"],
    "tencent": ["TENCENT HOLDINGS", "TENCENT"],
}

MAX_CORPORATE_GROUP_WEIGHT = 0.20
MAX_STOCKS_PER_GROUP = 1


# ============ STOCK REGION CAPS v2.1 ============

COUNTRY_TO_REGION: Dict[str, str] = {
    # === INDE ===
    "Inde": "IN", "India": "IN",
    
    # === ASIE HORS INDE ===
    "Chine": "ASIA_EX_IN", "China": "ASIA_EX_IN",
    "Corée": "ASIA_EX_IN", "South Korea": "ASIA_EX_IN", "Korea": "ASIA_EX_IN",
    "Japon": "ASIA_EX_IN", "Japan": "ASIA_EX_IN",
    "Taïwan": "ASIA_EX_IN", "Taiwan": "ASIA_EX_IN",
    "Hong Kong": "ASIA_EX_IN",
    "Singapour": "ASIA_EX_IN", "Singapore": "ASIA_EX_IN",
    "Indonésie": "ASIA_EX_IN", "Indonesia": "ASIA_EX_IN",
    "Malaisie": "ASIA_EX_IN", "Malaysia": "ASIA_EX_IN",
    "Thaïlande": "ASIA_EX_IN", "Thailand": "ASIA_EX_IN",
    "Vietnam": "ASIA_EX_IN", "Philippines": "ASIA_EX_IN",
    
    # === EUROPE ===
    "Allemagne": "EU", "Germany": "EU",
    "France": "EU",
    "Royaume-Uni": "EU", "United Kingdom": "EU", "UK": "EU",
    "Italie": "EU", "Italy": "EU",
    "Espagne": "EU", "Spain": "EU",
    "Pays-Bas": "EU", "Netherlands": "EU",
    "Belgique": "EU", "Belgium": "EU",
    "Suisse": "EU", "Switzerland": "EU",
    "Autriche": "EU", "Austria": "EU",
    "Suède": "EU", "Sweden": "EU",
    "Danemark": "EU", "Denmark": "EU",
    "Norvège": "EU", "Norway": "EU",
    "Finlande": "EU", "Finland": "EU",
    "Irlande": "EU", "Ireland": "EU",
    "Portugal": "EU",
    "Grèce": "EU", "Greece": "EU",
    "Pologne": "EU", "Poland": "EU",
    "Luxembourg": "EU",
    
    # === USA ===
    "Etats-Unis": "US", "États-Unis": "US", "United States": "US", "USA": "US", "US": "US",
    
    # === LATAM ===
    "Brésil": "LATAM", "Brazil": "LATAM",
    "Mexique": "LATAM", "Mexico": "LATAM",
    "Argentine": "LATAM", "Argentina": "LATAM",
    "Chili": "LATAM", "Chile": "LATAM",
    "Colombie": "LATAM", "Colombia": "LATAM",
    "Pérou": "LATAM", "Peru": "LATAM",
    
    # === OTHER ===
    "Canada": "OTHER",
    "Australie": "OTHER", "Australia": "OTHER",
    "Nouvelle-Zélande": "OTHER", "New Zealand": "OTHER",
    "Israël": "OTHER", "Israel": "OTHER",
    "Afrique du Sud": "OTHER", "South Africa": "OTHER",
}

STOCK_REGION_CAPS: Dict[str, Dict[str, float]] = {
    "Stable": {"IN": 0.08, "ASIA_EX_IN": 0.08, "EU": 0.20, "US": 0.25, "LATAM": 0.05, "OTHER": 0.10},
    "Modéré": {"IN": 0.10, "ASIA_EX_IN": 0.10, "EU": 0.25, "US": 0.30, "LATAM": 0.08, "OTHER": 0.12},
    "Agressif": {"IN": 0.15, "ASIA_EX_IN": 0.15, "EU": 0.30, "US": 0.35, "LATAM": 0.10, "OTHER": 0.15},
}

DEFAULT_REGION_CAP: float = 0.15


def get_region(country: str) -> str:
    """Mappe un pays vers sa région."""
    return COUNTRY_TO_REGION.get(country, "OTHER")


def get_stock_region_cap(profile: str, region: str) -> float:
    """Retourne le cap régional pour un profil."""
    caps = STOCK_REGION_CAPS.get(profile, STOCK_REGION_CAPS["Modéré"])
    return caps.get(region, DEFAULT_REGION_CAP)


# ============ STOCK REGION CAPS EU/US FOCUS v2.2 ============

STOCK_REGION_CAPS_EUUS: Dict[str, Dict[str, float]] = {
    "Stable": {"EU": 0.45, "US": 0.50, "IN": 0.00, "ASIA_EX_IN": 0.00, "LATAM": 0.00, "OTHER": 0.05},
    "Modéré": {"EU": 0.40, "US": 0.55, "IN": 0.00, "ASIA_EX_IN": 0.00, "LATAM": 0.05, "OTHER": 0.05},
    "Agressif": {"EU": 0.35, "US": 0.60, "IN": 0.00, "ASIA_EX_IN": 0.00, "LATAM": 0.10, "OTHER": 0.10},
}

ALLOWED_REGIONS_EUUS: Set[str] = {"EU", "US", "OTHER"}
BLOCKED_REGIONS_EUUS: Set[str] = {"IN", "ASIA_EX_IN", "LATAM"}


def get_stock_region_cap_euus(profile: str, region: str) -> float:
    """Retourne le cap régional EU/US Focus pour un profil."""
    caps = STOCK_REGION_CAPS_EUUS.get(profile, STOCK_REGION_CAPS_EUUS["Modéré"])
    return caps.get(region, 0.0)


def is_region_allowed_euus(region: str) -> bool:
    """Vérifie si une région est autorisée en mode EU/US."""
    return region in ALLOWED_REGIONS_EUUS


# ============ PRESET META - ACTIONS ============

EQUITY_PRESETS: Dict[str, PresetConfig] = {
    "defensif": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.DEFENSIVE, risk=RiskLevel.LOW,
        max_weight_pct=8.0, max_bucket_pct=25.0, min_quality_score=55,
        correlation_group="equity_defensive",
        description="Actions défensives, faible beta, utilities/staples",
        turnover_tolerance=0.08,
    ),
    "low_volatility": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.CORE, risk=RiskLevel.LOW,
        max_weight_pct=8.0, max_bucket_pct=25.0, min_quality_score=55,
        correlation_group="equity_low_vol",
        description="Actions à faible volatilité historique",
        turnover_tolerance=0.08,
    ),
    "rendement": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.DEFENSIVE, risk=RiskLevel.LOW,
        max_weight_pct=8.0, max_bucket_pct=20.0, min_quality_score=55,
        correlation_group="equity_dividend",
        description="Actions à haut rendement dividende, payout stable",
        turnover_tolerance=0.08,
    ),
    "value_dividend": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.CORE, risk=RiskLevel.MODERATE,
        max_weight_pct=8.0, max_bucket_pct=25.0, min_quality_score=60,
        correlation_group="equity_value",
        description="Value + dividende croissant, PEG attractif",
        turnover_tolerance=0.06,
    ),
    "quality_premium": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.CORE, risk=RiskLevel.MODERATE,
        max_weight_pct=8.0, max_bucket_pct=30.0, min_quality_score=65,
        correlation_group="equity_quality",
        description="ROIC élevé, FCF solide, moat durable",
        turnover_tolerance=0.06,
    ),
    "croissance": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.SATELLITE, risk=RiskLevel.HIGH,
        max_weight_pct=6.0, max_bucket_pct=20.0, min_quality_score=45,
        correlation_group="equity_growth",
        description="Croissance EPS/CA, valorisation élevée acceptée",
        turnover_tolerance=0.05,
    ),
    "momentum_trend": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.SATELLITE, risk=RiskLevel.HIGH,
        max_weight_pct=5.0, max_bucket_pct=15.0, min_quality_score=45,
        correlation_group="equity_momentum",
        description="Momentum 6-12 mois, trend following",
        turnover_tolerance=0.04,
    ),
    "agressif": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.SATELLITE, risk=RiskLevel.VERY_HIGH,
        max_weight_pct=5.0, max_bucket_pct=15.0, min_quality_score=40,
        correlation_group="equity_momentum",
        description="High beta, secteurs cycliques, spéculatif",
        turnover_tolerance=0.04,
    ),
    "recovery": PresetConfig(
        asset_class=AssetClass.EQUITY, role=Role.SATELLITE, risk=RiskLevel.VERY_HIGH,
        max_weight_pct=4.0, max_bucket_pct=10.0, min_quality_score=40,
        correlation_group="equity_cyclical",
        description="Rebond post-chute, contrarian",
        turnover_tolerance=0.04,
    ),
}


# ============ PRESET META - ETF ============

ETF_PRESETS: Dict[str, PresetConfig] = {
    "coeur_global": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.CORE, risk=RiskLevel.MODERATE,
        max_weight_pct=20.0, max_bucket_pct=40.0, min_quality_score=0,
        correlation_group="equity_developed",
        description="World core UCITS, low TER, diversifié",
        turnover_tolerance=0.10,
        exposures=["world", "developed_markets", "large_cap"],
    ),
    "min_vol_global": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.DEFENSIVE, risk=RiskLevel.LOW,
        max_weight_pct=15.0, max_bucket_pct=25.0, min_quality_score=0,
        correlation_group="equity_low_vol",
        description="Global minimum volatility",
        turnover_tolerance=0.10,
        exposures=["world", "min_vol"],
    ),
    "qualite_value": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.CORE, risk=RiskLevel.MODERATE,
        max_weight_pct=15.0, max_bucket_pct=25.0, min_quality_score=0,
        correlation_group="equity_quality",
        description="Large caps quality/value factor",
        turnover_tolerance=0.08,
        exposures=["quality", "value", "large_cap"],
    ),
    "defensif_oblig": PresetConfig(
        asset_class=AssetClass.BOND, role=Role.DEFENSIVE, risk=RiskLevel.LOW,
        max_weight_pct=20.0, max_bucket_pct=40.0, min_quality_score=0,
        correlation_group="bonds_ig",
        description="Investment grade bonds, duration moyenne",
        turnover_tolerance=0.10,
        exposures=["bonds", "investment_grade"],
    ),
    "cash_ultra_short": PresetConfig(
        asset_class=AssetClass.CASH, role=Role.DEFENSIVE, risk=RiskLevel.LOW,
        max_weight_pct=30.0, max_bucket_pct=30.0, min_quality_score=0,
        correlation_group="cash",
        description="Ultra-short bonds / money market",
        turnover_tolerance=0.15,
        exposures=["cash", "ultra_short"],
    ),
    "inflation_shield": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.DEFENSIVE, risk=RiskLevel.MODERATE,
        max_weight_pct=10.0, max_bucket_pct=15.0, min_quality_score=0,
        correlation_group="commodities",
        description="TIPS, commodities, real assets",
        turnover_tolerance=0.08,
        exposures=["inflation", "tips", "commodities"],
    ),
    "rendement_etf": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.CORE, risk=RiskLevel.MODERATE,
        max_weight_pct=12.0, max_bucket_pct=20.0, min_quality_score=0,
        correlation_group="equity_dividend",
        description="High dividend equity ETF",
        turnover_tolerance=0.08,
        exposures=["dividend", "income"],
    ),
    "croissance_tech": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.SATELLITE, risk=RiskLevel.HIGH,
        max_weight_pct=10.0, max_bucket_pct=20.0, min_quality_score=0,
        correlation_group="equity_growth",
        description="Tech / growth ETF (QQQ, secteur tech)",
        turnover_tolerance=0.06,
        exposures=["tech", "growth", "nasdaq"],
    ),
    "smid_quality": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.SATELLITE, risk=RiskLevel.HIGH,
        max_weight_pct=8.0, max_bucket_pct=15.0, min_quality_score=0,
        correlation_group="equity_small",
        description="Small/mid caps quality",
        turnover_tolerance=0.06,
        exposures=["small_cap", "mid_cap"],
    ),
    "emergents": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.SATELLITE, risk=RiskLevel.HIGH,
        max_weight_pct=10.0, max_bucket_pct=15.0, min_quality_score=0,
        correlation_group="equity_em",
        description="Emerging markets diversifiés",
        turnover_tolerance=0.06,
        exposures=["emerging_markets", "em"],
    ),
    "or_physique": PresetConfig(
        asset_class=AssetClass.ETF, role=Role.DEFENSIVE, risk=RiskLevel.MODERATE,
        max_weight_pct=10.0, max_bucket_pct=15.0, min_quality_score=0,
        correlation_group="gold",
        description="Gold physical ETF",
        turnover_tolerance=0.10,
        exposures=["gold", "precious_metals"],
    ),
}


# ============ PRESET META - CRYPTO ============

CRYPTO_PRESETS: Dict[str, PresetConfig] = {
    "quality_risk": PresetConfig(
        asset_class=AssetClass.CRYPTO, role=Role.CORE, risk=RiskLevel.HIGH,
        max_weight_pct=5.0, max_bucket_pct=10.0, min_quality_score=0,
        correlation_group="crypto_major",
        description="BTC/ETH - crypto 'blue chips'",
        turnover_tolerance=0.06,
        exposures=["crypto_major", "btc", "eth"],
    ),
    "trend3_12m": PresetConfig(
        asset_class=AssetClass.CRYPTO, role=Role.SATELLITE, risk=RiskLevel.HIGH,
        max_weight_pct=3.0, max_bucket_pct=5.0, min_quality_score=0,
        correlation_group="crypto_major",
        description="Trend following 3-12 mois",
        turnover_tolerance=0.05,
        exposures=["crypto_trend"],
    ),
    "swing7_30": PresetConfig(
        asset_class=AssetClass.CRYPTO, role=Role.SATELLITE, risk=RiskLevel.HIGH,
        max_weight_pct=2.0, max_bucket_pct=4.0, min_quality_score=0,
        correlation_group="crypto_altcoin",
        description="Swing trading 7-30 jours",
        turnover_tolerance=0.04,
        exposures=["crypto_swing"],
    ),
    "recovery_crypto": PresetConfig(
        asset_class=AssetClass.CRYPTO, role=Role.SATELLITE, risk=RiskLevel.VERY_HIGH,
        max_weight_pct=2.0, max_bucket_pct=3.0, min_quality_score=0,
        correlation_group="crypto_altcoin",
        description="Rebond post-chute, contrarian crypto",
        turnover_tolerance=0.04,
        exposures=["crypto_recovery"],
    ),
    "momentum24h": PresetConfig(
        asset_class=AssetClass.CRYPTO, role=Role.LOTTERY, risk=RiskLevel.EXTREME,
        max_weight_pct=1.0, max_bucket_pct=2.0, min_quality_score=0,
        correlation_group="crypto_altcoin",
        description="Ultra court terme, pure spéculation",
        turnover_tolerance=0.03,
        exposures=["crypto_momentum"],
    ),
    "highvol_lottery": PresetConfig(
        asset_class=AssetClass.CRYPTO, role=Role.LOTTERY, risk=RiskLevel.EXTREME,
        max_weight_pct=0.5, max_bucket_pct=1.0, min_quality_score=0,
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


# ============ PRESET PRIORITY ============

EQUITY_PRESET_PRIORITY = [
    "quality_premium", "low_volatility", "value_dividend", "defensif",
    "rendement", "croissance", "momentum_trend", "recovery", "agressif",
]

ETF_PRESET_PRIORITY = [
    "coeur_global", "min_vol_global", "defensif_oblig", "cash_ultra_short",
    "qualite_value", "rendement_etf", "inflation_shield", "or_physique",
    "croissance_tech", "smid_quality", "emergents",
]

CRYPTO_PRESET_PRIORITY = [
    "quality_risk", "trend3_12m", "swing7_30", "recovery_crypto",
    "momentum24h", "highvol_lottery",
]


# ============ PROFILE BUCKET TARGETS v1.1 ============

PROFILE_BUCKET_TARGETS: Dict[str, Dict[Role, Tuple[float, float]]] = {
    "Stable": {
        Role.CORE: (0.30, 0.40),
        Role.DEFENSIVE: (0.45, 0.60),
        Role.SATELLITE: (0.05, 0.15),
        Role.LOTTERY: (0.00, 0.00),
    },
    "Modéré": {
        Role.CORE: (0.35, 0.55),
        Role.DEFENSIVE: (0.20, 0.30),
        Role.SATELLITE: (0.15, 0.35),
        Role.LOTTERY: (0.00, 0.02),
    },
    "Agressif": {
        Role.CORE: (0.30, 0.45),
        Role.DEFENSIVE: (0.05, 0.15),
        Role.SATELLITE: (0.35, 0.60),
        Role.LOTTERY: (0.00, 0.05),
    },
}


# ============ BENCHMARK PAR PROFIL ============

PROFILE_BENCHMARKS: Dict[str, Dict[str, float]] = {
    "Stable": {"URTH": 0.40, "IEF": 0.60},
    "Modéré": {"URTH": 0.60, "IEF": 0.40},
    "Agressif": {"URTH": 1.00},
}


# ============ ETF EXPOSURE MAPPING ============

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
    "dividend": ["VIG", "SCHD", "DVY", "SDY", "BINC"],
}


# =============================================================================
# FIELD MAPPING v4.13.2 - VRAIS NOMS DE CHAMPS (stocks_europe.json)
# =============================================================================

FIELD_MAPPING: Dict[str, List[str]] = {
    # Performance (STRING dans les données!)
    "perf_ytd": ["perf_ytd", "ytd"],
    "perf_1y": ["perf_1y", "perf_12m", "momentum_12m"],
    "perf_3m": ["perf_3m"],
    "perf_1m": ["perf_1m"],
    "perf_3y": ["perf_3y"],
    
    # Risque (STRING dans les données!)
    "volatility_3y": ["volatility_3y", "vol_3y", "vol"],
    "max_drawdown_3y": ["max_drawdown_3y", "max_drawdown_ytd", "max_dd_3y"],
    
    # Qualité (FLOAT/INT)
    "roe": ["roe"],
    "eps_growth_5y": ["eps_growth_5y"],
    "fcf_yield": ["fcf_yield"],
    "de_ratio": ["de_ratio"],
    
    # Dividendes (FLOAT)
    "dividend_yield": ["dividend_yield", "div_yield"],
    "dividend_growth_3y": ["dividend_growth_3y"],
    "payout_ratio": ["payout_ratio_ttm", "payout_ratio"],
    
    # Score (INT)
    "buffett_score": ["_buffett_score", "buffett_score"],
}

# Ranges pour percentile (min attendu, max attendu)
METRIC_RANGES: Dict[str, Tuple[float, float]] = {
    "perf_ytd": (-30, 60),
    "perf_1y": (-40, 100),
    "perf_3m": (-25, 50),
    "perf_1m": (-15, 25),
    "perf_3y": (-50, 150),
    "volatility_3y": (8, 55),
    "max_drawdown_3y": (5, 70),
    "roe": (0, 60),
    "eps_growth_5y": (-20, 50),
    "fcf_yield": (-2, 15),
    "de_ratio": (0, 2),
    "dividend_yield": (0, 8),
    "dividend_growth_3y": (-10, 30),
    "payout_ratio": (0, 100),
    "buffett_score": (20, 100),
}


# =============================================================================
# PROFILE_POLICY v4.13.2 (Claude + ChatGPT consensus) - CORRIGÉ
# =============================================================================

PROFILE_POLICY: Dict[str, Dict] = {
    "Agressif": {
        # === Univers équities autorisé ===
        "allowed_equity_presets": {"croissance", "momentum_trend", "agressif", "recovery"},
        "min_buffett_score": 40,
        
        # === HARD FILTERS v4.13.2 - FORCE LA DIVERGENCE ===
        "hard_filters": {
            "volatility_3y_min": 22.0,    # Vol MINIMUM 22% → élimine les défensifs
            "volatility_3y_max": 65.0,
        },
        
        # === Contraintes optimizer ===
        "equity_min_weight": 0.50,
        "equity_max_weight": 0.75,
        "min_equity_positions": 12,
        
        # === Scoring percentile (poids) - VRAIS NOMS ===
        "score_weights": {
            "perf_ytd": 0.20,
            "perf_1y": 0.20,
            "perf_3m": 0.15,
            "eps_growth_5y": 0.10,
            "roe": 0.05,
            "volatility_3y": 0.05,      # BONUS volatilité!
            "dividend_yield": -0.05,    # MALUS dividendes
            "buffett_score": 0.05,
        },
        
        "description": "Profil orienté croissance/momentum, tolère la volatilité",
        "expected_vol_range": (15, 22),
        "expected_equity_overlap_with_stable": 0.25,
    },
    
    "Modéré": {
        "allowed_equity_presets": {"quality_premium", "value_dividend", "croissance", "momentum_trend", "defensif", "low_volatility"},
        "min_buffett_score": 50,
        
        "hard_filters": {
            "volatility_3y_min": 12.0,
            "volatility_3y_max": 40.0,
            "roe_min": 8.0,
        },
        
        "equity_min_weight": 0.40,
        "equity_max_weight": 0.60,
        "min_equity_positions": 10,
        
        "score_weights": {
            "perf_ytd": 0.10,
            "perf_1y": 0.10,
            "perf_3m": 0.05,
            "roe": 0.20,
            "eps_growth_5y": 0.05,
            "fcf_yield": 0.10,
            "volatility_3y": -0.10,
            "max_drawdown_3y": -0.05,
            "dividend_yield": 0.10,
            "buffett_score": 0.15,
        },
        
        "description": "Profil équilibré qualité/momentum, risque maîtrisé",
        "expected_vol_range": (10, 15),
        "expected_equity_overlap_with_stable": 0.45,
    },
    
    "Stable": {
        "allowed_equity_presets": {"defensif", "low_volatility", "rendement", "value_dividend", "quality_premium"},
        "min_buffett_score": 60,
        
        # === HARD FILTERS v4.13.2 - EXCLUT LES GROWTH ===
        "hard_filters": {
            "volatility_3y_max": 28.0,    # Vol MAXIMUM 28% → élimine les growth
            "roe_min": 10.0,
            "dividend_yield_min": 0.5,
        },
        
        "equity_min_weight": 0.25,
        "equity_max_weight": 0.45,
        "min_equity_positions": 8,
        
        "score_weights": {
            "perf_ytd": 0.00,             # Ignore momentum
            "perf_1y": 0.00,
            "roe": 0.15,
            "fcf_yield": 0.10,
            "volatility_3y": -0.25,       # FORTE pénalité volatilité
            "max_drawdown_3y": -0.15,     # FORTE pénalité drawdown
            "dividend_yield": 0.20,       # FORT bonus dividendes
            "dividend_growth_3y": 0.05,
            "buffett_score": 0.20,
        },
        
        "description": "Profil défensif, faible volatilité, haut dividende",
        "expected_vol_range": (6, 10),
        "expected_equity_overlap_with_agressif": 0.25,
    },
}


# =============================================================================
# FONCTIONS UTILITAIRES v4.13.2
# =============================================================================

def safe_float(value, default: float = 0.0) -> float:
    """Conversion sécurisée en float - gère STRING et None."""
    if value is None:
        return default
    try:
        if isinstance(value, str):
            value = value.replace("%", "").replace(",", ".").strip()
            if value.endswith("M"):
                return float(value[:-1]) * 1_000_000
            if value.endswith("B"):
                return float(value[:-1]) * 1_000_000_000
            if not value or value.lower() in ("n/a", "nan", "-", "", "none"):
                return default
        return float(value)
    except (ValueError, TypeError):
        return default


def get_profile_policy(profile: str) -> Dict:
    """Retourne la policy complète d'un profil."""
    return PROFILE_POLICY.get(profile, PROFILE_POLICY["Modéré"])


def get_metric_value(eq: Dict, metric_key: str) -> Optional[float]:
    """Récupère une métrique avec fallback sur les alias."""
    aliases = FIELD_MAPPING.get(metric_key, [metric_key])
    
    for alias in aliases:
        if alias in eq and eq[alias] is not None:
            return safe_float(eq[alias])
    
    return None


def compute_percentile(value: float, metric_key: str) -> float:
    """Convertit une valeur en percentile [0, 1] basé sur les ranges."""
    min_val, max_val = METRIC_RANGES.get(metric_key, (0, 100))
    
    if max_val <= min_val:
        return 0.5
    
    percentile = (value - min_val) / (max_val - min_val)
    return max(0.0, min(1.0, percentile))


def pct_rank(value: float, distribution: List[float]) -> float:
    """Calcule le rang percentile d'une valeur dans une distribution."""
    if not distribution or value is None:
        return 0.5
    
    count_below = sum(1 for x in distribution if x is not None and x < value)
    return count_below / max(len(distribution), 1)


# =============================================================================
# COMPUTE_UNIVERSE_STATS v4.13.2 (CORRIGÉ - collecte TOUS les alias)
# =============================================================================

def compute_universe_stats(equities: List[Dict]) -> Dict[str, List[float]]:
    """
    Calcule les distributions pour TOUS les alias de champs.
    
    FIX v4.13.2: Collecte les valeurs sous tous les noms possibles.
    """
    # Collecter tous les alias
    all_keys = set()
    for aliases in FIELD_MAPPING.values():
        all_keys.update(aliases)
    
    # Ajouter les clés canoniques originales pour compatibilité
    canonical_keys = [
        "momentum_12m", "perf_3m", "perf_ytd", "perf_1y", "perf_3y",
        "eps_growth_5y", "roe", "fcf_yield", "vol_3y", "max_dd_3y",
        "dividend_yield", "buffett_score", "composite_score"
    ]
    all_keys.update(canonical_keys)
    
    stats = {k: [] for k in all_keys}
    
    for eq in equities:
        for key in all_keys:
            val = eq.get(key)
            if val is None:
                continue
            try:
                stats[key].append(safe_float(val))
            except (ValueError, TypeError):
                pass
    
    # Log des distributions non-vides
    non_empty = {k: len(v) for k, v in stats.items() if v}
    logger.debug(f"Universe stats: {len(non_empty)} distributions non-vides")
    
    return stats


# =============================================================================
# ASSIGN_PRESET_TO_EQUITY v4.13.2 (CRITIQUE!)
# =============================================================================

def assign_preset_to_equity(eq: Dict) -> str:
    """
    Assigne automatiquement un preset basé sur les caractéristiques.
    
    DOIT être appelé AVANT filter_equities_by_profile() sinon _matched_preset = None!
    """
    vol = get_metric_value(eq, "volatility_3y") or 25.0
    ytd = get_metric_value(eq, "perf_ytd") or 0.0
    perf_1y = get_metric_value(eq, "perf_1y") or 0.0
    roe = get_metric_value(eq, "roe") or 12.0
    div_yield = get_metric_value(eq, "dividend_yield") or 0.0
    buffett = get_metric_value(eq, "buffett_score") or 50.0
    
    # === DEFENSIVE: vol < 22%, div > 1.5% ou buffett > 75 ===
    if vol < 22 and (div_yield > 1.5 or buffett >= 75):
        return "rendement" if div_yield > 2.0 else "defensif"
    
    if vol < 20 and buffett >= 70:
        return "low_volatility"
    
    # === QUALITY / VALUE: vol < 30%, roe > 15% ===
    if vol < 30 and roe > 15 and buffett >= 65:
        return "quality_premium"
    
    if vol < 28 and div_yield > 1.0:
        return "value_dividend"
    
    # === GROWTH / MOMENTUM: vol >= 25%, perf positive ===
    if vol >= 28 and (ytd > 5 or perf_1y > 20):
        return "momentum_trend"
    
    if vol >= 25 and ytd > 0:
        return "croissance"
    
    # === AGGRESSIVE: vol >= 35% ===
    if vol >= 35:
        return "recovery" if ytd < -10 else "agressif"
    
    # === DEFAULT ===
    if ytd > 5:
        return "croissance"
    elif div_yield > 1.0:
        return "value_dividend"
    else:
        return "quality_premium"


# =============================================================================
# APPLY_HARD_FILTERS v4.13.2 (FORCE LA DIVERGENCE)
# =============================================================================

def apply_hard_filters(equities: List[Dict], profile: str) -> Tuple[List[Dict], Dict]:
    """
    Applique les filtres HARD pour forcer la divergence entre profils.
    
    C'est LA CLÉ pour avoir des actions différentes entre Agressif/Modéré/Stable.
    """
    policy = get_profile_policy(profile)
    filters = policy.get("hard_filters", {})
    
    if not filters:
        return equities, {"skipped": True, "before": len(equities), "after": len(equities)}
    
    filtered = []
    rejection_counts = {}
    
    for eq in equities:
        vol = get_metric_value(eq, "volatility_3y") or 25.0
        roe = get_metric_value(eq, "roe") or 12.0
        div_yield = get_metric_value(eq, "dividend_yield") or 0.0
        
        passed = True
        reason = None
        
        if "volatility_3y_min" in filters and vol < filters["volatility_3y_min"]:
            passed, reason = False, f"vol<{filters['volatility_3y_min']}"
        elif "volatility_3y_max" in filters and vol > filters["volatility_3y_max"]:
            passed, reason = False, f"vol>{filters['volatility_3y_max']}"
        elif "roe_min" in filters and roe < filters["roe_min"]:
            passed, reason = False, f"roe<{filters['roe_min']}"
        elif "dividend_yield_min" in filters and div_yield < filters["dividend_yield_min"]:
            passed, reason = False, f"div<{filters['dividend_yield_min']}"
        
        if passed:
            filtered.append(eq)
        elif reason:
            rejection_counts[reason] = rejection_counts.get(reason, 0) + 1
    
    stats = {
        "before": len(equities),
        "after": len(filtered),
        "rejected": len(equities) - len(filtered),
        "reasons": rejection_counts,
    }
    
    logger.info(f"   [{profile}] Hard filters: {stats['after']}/{stats['before']} passent")
    for reason, count in rejection_counts.items():
        logger.debug(f"      Rejeté {count}x: {reason}")
    
    return filtered, stats


# =============================================================================
# SCORE_EQUITY_FOR_PROFILE v4.13.2 (NORMALISATION CORRIGÉE)
# =============================================================================

def score_equity_for_profile(
    stock: Dict,
    profile: str,
    universe_stats: Dict[str, List[float]] = None,
) -> float:
    """
    Score une action selon le profil avec normalisation robuste.
    
    NORMALISATION v4.13.2:
    - score_raw ∈ [-S, +S] où S = sum(|weights|)
    - score_final = (score_raw + S) / (2*S) ∈ [0, 1]
    """
    policy = get_profile_policy(profile)
    weights = policy.get("score_weights", {})
    
    # S = somme des valeurs absolues des poids
    S = sum(abs(w) for w in weights.values() if w != 0) or 1.0
    
    score_raw = 0.0
    
    for metric_key, weight in weights.items():
        if weight == 0:
            continue
        
        value = get_metric_value(stock, metric_key)
        
        if value is None:
            continue
        
        # Convertir en percentile [0, 1]
        percentile = compute_percentile(value, metric_key)
        
        # Contribution = weight * percentile
        contribution = weight * percentile
        score_raw += contribution
    
    # NORMALISATION: [-S, +S] → [0, 1]
    score_final = (score_raw + S) / (2 * S)
    score_final = max(0.0, min(1.0, score_final))
    
    return score_final


# =============================================================================
# FILTER_EQUITIES_BY_PROFILE v4.13.2 (ASSIGNE _matched_preset)
# =============================================================================

def filter_equities_by_profile(
    equities: List[Dict],
    profile: str,
    preset_field: str = "_matched_preset"
) -> List[Dict]:
    """
    Filtre les équités par profil.
    
    FIX v4.13.2: Assigne automatiquement _matched_preset si manquant!
    """
    policy = get_profile_policy(profile)
    allowed_presets = policy.get("allowed_equity_presets", set())
    
    # ÉTAPE 1: Assigner les presets si manquants
    for eq in equities:
        if not eq.get(preset_field):
            eq[preset_field] = assign_preset_to_equity(eq)
    
    # Log coverage
    coverage = sum(1 for eq in equities if eq.get(preset_field)) / max(len(equities), 1)
    logger.info(f"   [{profile}] _matched_preset coverage: {coverage:.1%}")
    
    # ÉTAPE 2: Filtrer par presets autorisés
    if not allowed_presets:
        return equities
    
    filtered = [eq for eq in equities if eq.get(preset_field) in allowed_presets]
    
    logger.info(f"   [{profile}] Preset filter: {len(filtered)}/{len(equities)} passent")
    
    return filtered


# =============================================================================
# SELECT_EQUITIES_FOR_PROFILE v4.13.2 (FONCTION PRINCIPALE)
# =============================================================================

def select_equities_for_profile(
    equities: List[Dict],
    profile: str,
    market_context: Optional[Dict] = None,
    target_n: int = 25,
) -> Tuple[List[Dict], Dict]:
    """
    v4.13.2: Sélection avec VRAIE différenciation.
    
    Pipeline:
    1. Assigner _matched_preset (si manquant)
    2. Filtrer par min_buffett_score
    3. Filtrer par presets autorisés
    4. Appliquer hard_filters (FORCE LA DIVERGENCE)
    5. Scorer avec normalisation robuste
    6. Sélectionner top N
    
    Returns:
        (equities_selected, selection_meta)
    """
    logger.info(f"\n{'='*50}")
    logger.info(f"[{profile}] Sélection depuis {len(equities)} équités")
    
    policy = get_profile_policy(profile)
    meta = {"profile": profile, "stages": {}}
    
    # === ÉTAPE 1: Assigner presets ===
    for eq in equities:
        if "_matched_preset" not in eq or not eq.get("_matched_preset"):
            eq["_matched_preset"] = assign_preset_to_equity(eq)
    
    # Distribution des presets
    preset_dist = {}
    for eq in equities:
        p = eq.get("_matched_preset", "UNKNOWN")
        preset_dist[p] = preset_dist.get(p, 0) + 1
    meta["stages"]["presets"] = preset_dist
    logger.info(f"   [{profile}] Preset distribution: {preset_dist}")
    
    # === ÉTAPE 2: Buffett filter ===
    min_buffett = policy.get("min_buffett_score", 0)
    eq_buffett = [
        eq for eq in equities
        if (get_metric_value(eq, "buffett_score") or 0) >= min_buffett
    ]
    meta["stages"]["buffett"] = {"min": min_buffett, "before": len(equities), "after": len(eq_buffett)}
    logger.info(f"   [{profile}] Buffett >= {min_buffett}: {len(eq_buffett)}/{len(equities)}")
    
    # Fallback si trop restrictif
    if len(eq_buffett) < target_n:
        relaxed = max(0, min_buffett - 20)
        eq_buffett = [
            eq for eq in equities
            if (get_metric_value(eq, "buffett_score") or 0) >= relaxed
        ]
        meta["stages"]["buffett"]["relaxed_to"] = relaxed
        logger.warning(f"   [{profile}] Buffett relaxé à {relaxed}")
    
    # === ÉTAPE 3: Preset filter ===
    allowed_presets = policy.get("allowed_equity_presets", set())
    if allowed_presets:
        eq_preset = [eq for eq in eq_buffett if eq.get("_matched_preset") in allowed_presets]
        meta["stages"]["preset_filter"] = {"before": len(eq_buffett), "after": len(eq_preset)}
        logger.info(f"   [{profile}] Preset filter: {len(eq_preset)}/{len(eq_buffett)}")
        
        # Fallback si trop restrictif
        if len(eq_preset) < target_n // 2:
            eq_preset = eq_buffett
            meta["stages"]["preset_filter"]["skipped"] = True
            logger.warning(f"   [{profile}] Preset filter trop strict, ignoré")
    else:
        eq_preset = eq_buffett
    
    # === ÉTAPE 4: Hard filters ===
    eq_hard, hard_stats = apply_hard_filters(eq_preset, profile)
    meta["stages"]["hard_filters"] = hard_stats
    
    # Fallback si trop restrictif
    if len(eq_hard) < target_n // 2:
        eq_hard = eq_preset
        meta["stages"]["hard_filters"]["skipped"] = True
        logger.warning(f"   [{profile}] Hard filters trop stricts, ignorés")
    
    # === ÉTAPE 5: Scoring ===
    for eq in eq_hard:
        eq["_profile_score"] = score_equity_for_profile(eq, profile)
    
    # Trier par score
    sorted_eq = sorted(eq_hard, key=lambda x: x.get("_profile_score", 0), reverse=True)
    
    # === ÉTAPE 6: Sélection ===
    selected = sorted_eq[:target_n]
    meta["selected_count"] = len(selected)
    
    # Log TOP 5
    logger.info(f"   [{profile}] TOP 5:")
    for eq in selected[:5]:
        name = (eq.get("name") or eq.get("ticker") or "?")[:30]
        score = eq.get("_profile_score", 0)
        vol = get_metric_value(eq, "volatility_3y") or 0
        div = get_metric_value(eq, "dividend_yield") or 0
        preset = eq.get("_matched_preset", "?")
        logger.info(f"      • {name}: score={score:.3f}, vol={vol:.1f}%, div={div:.2f}%, [{preset}]")
    
    # Stats finales
    if selected:
        avg_vol = sum(get_metric_value(eq, "volatility_3y") or 0 for eq in selected) / len(selected)
        avg_div = sum(get_metric_value(eq, "dividend_yield") or 0 for eq in selected) / len(selected)
        avg_score = sum(eq.get("_profile_score", 0) for eq in selected) / len(selected)
        
        meta["stats"] = {
            "avg_vol": round(avg_vol, 1),
            "avg_div": round(avg_div, 2),
            "avg_score": round(avg_score, 3),
        }
        logger.info(f"   [{profile}] Stats: avg_vol={avg_vol:.1f}%, avg_div={avg_div:.2f}%")
    
    return selected, meta


# =============================================================================
# BLEND COMPOSITE_SCORE v4.13.2
# =============================================================================

def blend_profile_score(eq: Dict, profile_score: float) -> float:
    """
    Blende le profile_score avec le composite_score existant.
    
    FIX v4.13.2: Vérifie si composite_score est en 0-1 ou 0-100.
    """
    original = eq.get("composite_score", 0) or 0
    
    # Normaliser si l'original est sur 0-100
    if original > 1:
        original = original / 100.0
    
    # Blend: 60% profile, 40% original
    blended = 0.6 * profile_score + 0.4 * original
    
    return max(0.0, min(1.0, blended))


# =============================================================================
# DIAGNOSTIC OVERLAP
# =============================================================================

def diagnose_profile_overlap(equities_by_profile: Dict[str, List[Dict]]) -> Dict:
    """Calcule l'overlap entre les profils."""
    def get_ids(eqs):
        return {eq.get("ticker") or eq.get("name") or eq.get("id") for eq in eqs}
    
    agg = get_ids(equities_by_profile.get("Agressif", []))
    mod = get_ids(equities_by_profile.get("Modéré", []))
    stb = get_ids(equities_by_profile.get("Stable", []))
    
    return {
        "counts": {"Agressif": len(agg), "Modéré": len(mod), "Stable": len(stb)},
        "Agressif_Stable": len(agg & stb),
        "Agressif_Modéré": len(agg & mod),
        "Modéré_Stable": len(mod & stb),
        "All_3": len(agg & mod & stb),
        "Agressif_Stable_pct": round(100 * len(agg & stb) / max(len(agg), 1), 1),
    }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

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
    """Calcule le poids max effectif pour un preset dans un profil."""
    config = PRESET_META.get(preset_name)
    if not config:
        return 0.0
    
    max_weight = config.max_weight_pct / 100
    bucket_targets = PROFILE_BUCKET_TARGETS.get(profile, {})
    bucket_range = bucket_targets.get(config.role, (0, 1))
    bucket_max = bucket_range[1]
    
    return min(max_weight, bucket_max)


def get_corporate_group(stock_name: str) -> Optional[str]:
    """Identifie le groupe corporate d'une action."""
    name_upper = stock_name.upper()
    
    for group_id, patterns in CORPORATE_GROUPS.items():
        for pattern in patterns:
            if pattern.upper() in name_upper:
                return group_id
    
    return None


def deduplicate_by_corporate_group(
    stocks: List[Dict],
    scores: Optional[Dict[str, float]] = None,
    max_per_group: int = MAX_STOCKS_PER_GROUP
) -> Tuple[List[Dict], Dict[str, List[str]]]:
    """Déduplique les actions par groupe corporate."""
    groups_found: Dict[str, List[Dict]] = {}
    no_group: List[Dict] = []
    
    for stock in stocks:
        name = stock.get("name", "")
        group = get_corporate_group(name)
        
        if group:
            if group not in groups_found:
                groups_found[group] = []
            groups_found[group].append(stock)
        else:
            no_group.append(stock)
    
    selected = []
    removed_by_group: Dict[str, List[str]] = {}
    
    for group_id, group_stocks in groups_found.items():
        if scores:
            group_stocks.sort(
                key=lambda s: scores.get(s.get("name", ""), 0),
                reverse=True
            )
        
        kept = group_stocks[:max_per_group]
        removed = group_stocks[max_per_group:]
        
        selected.extend(kept)
        
        if removed:
            removed_by_group[group_id] = [s.get("name", "") for s in removed]
            kept_names = [s.get("name", "") for s in kept]
            logger.info(f"Corporate dedup [{group_id}]: kept {kept_names}, removed {len(removed)}")
    
    selected.extend(no_group)
    
    return selected, removed_by_group


def deduplicate_etf_by_exposure(
    etf_list: List[str],
    exposures_wanted: Optional[Set[str]] = None
) -> List[str]:
    """Déduplique une liste d'ETF par exposition."""
    selected = []
    exposures_covered = set()
    
    for exposure, equivalents in ETF_EXPOSURE_EQUIVALENTS.items():
        if exposures_wanted and exposure not in exposures_wanted:
            continue
            
        for etf in equivalents:
            if etf in etf_list and exposure not in exposures_covered:
                selected.append(etf)
                exposures_covered.add(exposure)
                break
    
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
    ("equity_developed", "equity_em"): 0.65,
    ("equity_developed", "bonds_ig"): 0.10,
    ("equity_developed", "gold"): 0.05,
    ("equity_developed", "crypto_major"): 0.35,
    ("bonds_ig", "cash"): 0.40,
    ("bonds_ig", "gold"): 0.15,
    ("bonds_ig", "crypto_major"): -0.10,
    ("gold", "commodities"): 0.50,
    ("gold", "crypto_major"): 0.20,
    ("crypto_major", "crypto_altcoin"): 0.75,
    ("crypto_major", "crypto_meme"): 0.60,
    ("crypto_altcoin", "crypto_meme"): 0.80,
}


def get_correlation(group1: str, group2: str) -> float:
    """Retourne la corrélation entre deux groupes."""
    if group1 == group2:
        return 1.0
    
    key1 = (group1, group2)
    key2 = (group2, group1)
    
    if key1 in CORRELATION_BY_GROUP:
        return CORRELATION_BY_GROUP[key1]
    if key2 in CORRELATION_BY_GROUP:
        return CORRELATION_BY_GROUP[key2]
    
    return 0.30


# ============ VALIDATION ============

def validate_portfolio_buckets(
    weights: Dict[str, float],
    preset_assignments: Dict[str, str],
    profile: str
) -> Dict[str, any]:
    """Valide qu'un portefeuille respecte les contraintes de bucket."""
    targets = PROFILE_BUCKET_TARGETS.get(profile, {})
    
    role_weights = {role: 0.0 for role in Role}
    
    for ticker, weight in weights.items():
        preset = preset_assignments.get(ticker)
        if preset and preset in PRESET_META:
            role = PRESET_META[preset].role
            role_weights[role] += weight
    
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


def validate_corporate_concentration(
    weights: Dict[str, float],
    max_group_weight: float = MAX_CORPORATE_GROUP_WEIGHT
) -> Dict[str, any]:
    """Valide que le portefeuille ne dépasse pas le max par groupe corporate."""
    group_weights: Dict[str, float] = {}
    
    for name, weight in weights.items():
        group = get_corporate_group(name)
        if group:
            group_weights[group] = group_weights.get(group, 0) + weight
    
    violations = []
    for group_id, total_weight in group_weights.items():
        if total_weight > max_group_weight:
            violations.append(
                f"{group_id}: {total_weight*100:.1f}% > max {max_group_weight*100:.1f}%"
            )
    
    return {
        "valid": len(violations) == 0,
        "group_weights": group_weights,
        "violations": violations,
    }


# =============================================================================
# EXPORT WATCHLIST (pour les "pépites")
# =============================================================================

def export_watchlist(equities: List[Dict], profile: str, top_n: int = 200, output_dir: str = "data") -> str:
    """
    Exporte une watchlist des top N actions pour un profil.
    
    Usage:
        export_watchlist(eq_scored, "Agressif", top_n=200)
    """
    import json
    from pathlib import Path
    
    sorted_eq = sorted(equities, key=lambda x: x.get("_profile_score", 0), reverse=True)
    top = sorted_eq[:top_n]
    
    export_data = []
    for eq in top:
        export_eq = {k: v for k, v in eq.items() if not k.startswith("_score_debug")}
        export_data.append(export_eq)
    
    Path(output_dir).mkdir(exist_ok=True)
    filepath = f"{output_dir}/watchlist_{profile.lower()}.json"
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(export_data, f, ensure_ascii=False, indent=2, default=str)
    
    logger.info(f"   [{profile}] Watchlist exportée: {filepath} ({len(top)} actions)")
    
    return filepath


# =============================================================================
# MAIN TEST
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("PRESET_META v4.13.2 - Summary")
    print("=" * 60)
    
    print(f"\nTotal presets: {len(PRESET_META)}")
    print(f"  - Equity: {len(EQUITY_PRESETS)}")
    print(f"  - ETF: {len(ETF_PRESETS)}")
    print(f"  - Crypto: {len(CRYPTO_PRESETS)}")
    
    print("\n--- PROFILE_POLICY v4.13.2 (FIXED) ---")
    for profile, policy in PROFILE_POLICY.items():
        print(f"\n  {profile}:")
        print(f"    allowed_presets: {policy['allowed_equity_presets']}")
        print(f"    min_buffett: {policy['min_buffett_score']}")
        print(f"    hard_filters: {policy.get('hard_filters', {})}")
        print(f"    equity_weight: {policy['equity_min_weight']*100:.0f}%-{policy['equity_max_weight']*100:.0f}%")
    
    print("\n--- Test Select Equities ---")
    
    # Données de test
    test_data = [
        {"name": "ASML", "ticker": "ASML", "volatility_3y": "36.46", "perf_ytd": "10.15", "perf_1y": "52.43", "roe": 40.98, "dividend_yield": 0.6, "buffett_score": 100},
        {"name": "NVIDIA", "ticker": "NVDA", "volatility_3y": "48.0", "perf_ytd": "45.0", "perf_1y": "120.0", "roe": 55, "dividend_yield": 0.05, "buffett_score": 75},
        {"name": "MICROSOFT", "ticker": "MSFT", "volatility_3y": "25.0", "perf_ytd": "5.0", "perf_1y": "18.0", "roe": 40, "dividend_yield": 0.8, "buffett_score": 90},
        {"name": "COCA-COLA", "ticker": "KO", "volatility_3y": "15.0", "perf_ytd": "1.5", "perf_1y": "8.0", "roe": 40, "dividend_yield": 2.9, "buffett_score": 85},
        {"name": "NESTLE", "ticker": "NESN", "volatility_3y": "18.0", "perf_ytd": "-2.0", "perf_1y": "3.0", "roe": 28, "dividend_yield": 3.5, "buffett_score": 82},
    ]
    
    import logging
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    
    results = {}
    for profile in ["Agressif", "Modéré", "Stable"]:
        selected, meta = select_equities_for_profile(
            equities=[eq.copy() for eq in test_data],
            profile=profile,
            target_n=3,
        )
        results[profile] = selected
    
    print("\n--- RÉSUMÉ ---")
    for profile, selected in results.items():
        tickers = [eq.get("ticker", "?") for eq in selected]
        print(f"{profile}: {', '.join(tickers)}")
    
    overlap = diagnose_profile_overlap(results)
    print(f"\nOverlap Agressif ∩ Stable: {overlap['Agressif_Stable_pct']}%")
    
    if overlap["Agressif_Stable_pct"] <= 30:
        print("✅ SUCCESS: Divergence OK")
    else:
        print("⚠️ Overlap trop élevé")
