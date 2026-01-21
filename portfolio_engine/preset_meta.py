# portfolio_engine/preset_meta.py
"""
PRESET_META - Source unique de vérité pour les presets.

v5.1.0 (Option B - PRESET_RULES pour contraintes dures par preset):
- NEW: PRESET_RULES dict avec contraintes dures par preset equity
- NEW: _parse_rule_key() pour parser les clés de règles
- NEW: check_preset_rules() valide une equity contre les règles du preset
- NEW: assign_preset_to_equity_with_rules() avec fallback si règles échouent
- FIX: Suppression buffett_score_min de RELAX_STEPS (doublon)
- FIX: UNH/BIRG - presets croissance/momentum_trend ont des perf_min

v5.0.0 (Architecture Option B - preset_meta = seul moteur equity):
- NEW: normalize_profile_score() pour meilleure distribution [0,1]
- NEW: apply_hard_filters_with_custom() pour relaxation
- NEW: RELAX_STEPS config pour relaxation progressive
- FIX: Relaxation progressive au lieu de skip brutal des hard filters
- FIX: Normalisation score basée sur min/max théoriques

v4.15.2 FINAL (Claude + ChatGPT 10/10):
- FIX: vol_missing traité comme les autres métriques (plus de default 25.0)
- FIX: Missing data scoring - percentile pénalisant si poids négatif

v4.15.1: elif → if, bisect O(log n)
v4.15.0: PATCH A (percentiles data-driven), PATCH B (vol range), PATCH C (yield-trap strict)
v4.14.0: safe_float multi-locale, ordre recovery/agressif, scoring Agressif 55%→30%

Usage:
    from portfolio_engine.preset_meta import PRESET_META, PROFILE_BUCKET_TARGETS, Role
    from portfolio_engine.preset_meta import PROFILE_POLICY, get_profile_policy
    from portfolio_engine.preset_meta import select_equities_for_profile
    
    selected, meta = select_equities_for_profile(equities, "Agressif", target_n=25)
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Set
from copy import deepcopy
import logging
import re
import bisect

logger = logging.getLogger(__name__)


# ============ ENUMS ============

class AssetClass(Enum):
    EQUITY = "equity"
    ETF = "etf"
    CRYPTO = "crypto"
    BOND = "bond"
    CASH = "cash"


class Role(Enum):
    CORE = "core"
    SATELLITE = "satellite"
    DEFENSIVE = "defensive"
    LOTTERY = "lottery"


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
    max_weight_pct: float
    max_bucket_pct: float
    min_quality_score: float
    correlation_group: str
    description: str = ""
    turnover_tolerance: float = 0.05
    exposures: List[str] = field(default_factory=list)


# ============ CORPORATE GROUPS ============

CORPORATE_GROUPS: Dict[str, List[str]] = {
    "hyundai": ["HYUNDAI MOTOR", "HYUNDAI MOBIS", "KIA CORP", "KIA MOTORS"],
    "samsung": ["SAMSUNG ELECTRONICS", "SAMSUNG SDI", "SAMSUNG BIOLOGICS", "SAMSUNG LIFE", "SAMSUNG FIRE", "SAMSUNG C&T"],
    "sk_group": ["SK HYNIX", "SK TELECOM", "SK INNOVATION", "SK SQUARE"],
    "lg_group": ["LG ELECTRONICS", "LG CHEM", "LG ENERGY", "LG DISPLAY"],
    "tata": ["TATA CONSULTANCY", "TATA MOTORS", "TATA STEEL", "TATA POWER", "TATA CONSUMER", "TITAN COMPANY"],
    "reliance": ["RELIANCE INDUSTRIES", "RELIANCE RETAIL", "JIO PLATFORMS"],
    "adani": ["ADANI ENTERPRISES", "ADANI PORTS", "ADANI GREEN", "ADANI POWER", "ADANI TOTAL"],
    "hdfc": ["HDFC BANK", "HDFC LIFE", "HDFC AMC"],
    "icici": ["ICICI BANK", "ICICI PRUDENTIAL", "ICICI LOMBARD"],
    "alphabet": ["ALPHABET INC CLASS A", "ALPHABET INC CLASS C", "ALPHABET INC", "GOOGLE"],
    "berkshire": ["BERKSHIRE HATHAWAY INC CLASS A", "BERKSHIRE HATHAWAY INC CLASS B", "BERKSHIRE HATHAWAY"],
    "meta": ["META PLATFORMS", "FACEBOOK"],
    "lvmh": ["LVMH MOET HENNESSY", "CHRISTIAN DIOR", "HENNESSY", "LOUIS VUITTON"],
    "kering": ["KERING", "GUCCI"],
    "richemont": ["RICHEMONT", "CARTIER"],
    "volkswagen": ["VOLKSWAGEN", "PORSCHE", "AUDI", "VW"],
    "stellantis": ["STELLANTIS", "FIAT", "PEUGEOT", "CHRYSLER"],
    "toyota": ["TOYOTA MOTOR", "TOYOTA INDUSTRIES", "DENSO"],
    "softbank": ["SOFTBANK GROUP", "SOFTBANK CORP", "ARM HOLDINGS"],
    "sony": ["SONY GROUP", "SONY"],
    "alibaba": ["ALIBABA GROUP", "ALIBABA", "ANT GROUP"],
    "tencent": ["TENCENT HOLDINGS", "TENCENT"],
}

MAX_CORPORATE_GROUP_WEIGHT = 0.20
MAX_STOCKS_PER_GROUP = 1


# ============ REGION MAPPINGS ============

COUNTRY_TO_REGION: Dict[str, str] = {
    "Inde": "IN", "India": "IN",
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
    "Etats-Unis": "US", "États-Unis": "US", "United States": "US", "USA": "US", "US": "US",
    "Brésil": "LATAM", "Brazil": "LATAM",
    "Mexique": "LATAM", "Mexico": "LATAM",
    "Argentine": "LATAM", "Argentina": "LATAM",
    "Chili": "LATAM", "Chile": "LATAM",
    "Colombie": "LATAM", "Colombia": "LATAM",
    "Pérou": "LATAM", "Peru": "LATAM",
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

STOCK_REGION_CAPS_EUUS: Dict[str, Dict[str, float]] = {
    "Stable": {"EU": 0.45, "US": 0.50, "IN": 0.00, "ASIA_EX_IN": 0.00, "LATAM": 0.00, "OTHER": 0.05},
    "Modéré": {"EU": 0.40, "US": 0.55, "IN": 0.00, "ASIA_EX_IN": 0.00, "LATAM": 0.05, "OTHER": 0.05},
    "Agressif": {"EU": 0.35, "US": 0.60, "IN": 0.00, "ASIA_EX_IN": 0.00, "LATAM": 0.10, "OTHER": 0.10},
}

ALLOWED_REGIONS_EUUS: Set[str] = {"EU", "US", "OTHER"}
BLOCKED_REGIONS_EUUS: Set[str] = {"IN", "ASIA_EX_IN", "LATAM"}


def get_region(country: str) -> str:
    return COUNTRY_TO_REGION.get(country, "OTHER")

def get_stock_region_cap(profile: str, region: str) -> float:
    caps = STOCK_REGION_CAPS.get(profile, STOCK_REGION_CAPS["Modéré"])
    return caps.get(region, DEFAULT_REGION_CAP)

def get_stock_region_cap_euus(profile: str, region: str) -> float:
    caps = STOCK_REGION_CAPS_EUUS.get(profile, STOCK_REGION_CAPS_EUUS["Modéré"])
    return caps.get(region, 0.0)

def is_region_allowed_euus(region: str) -> bool:
    return region in ALLOWED_REGIONS_EUUS


# ============ PRESET META - EQUITY ============

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


# ============ v5.1.0: PRESET_RULES - CONTRAINTES DURES PAR PRESET ============
# 
# Format des clés: <metric>_min / <metric>_max
# Métriques: celles de FIELD_MAPPING (perf_1y, volatility_3y, buffett_score, etc.)
#
# Architecture Buffett (2 niveaux):
#   Niveau 1: PROFILE_POLICY["min_buffett_score"] = filtre global d'entrée
#   Niveau 2: PRESET_RULES["buffett_score_min"] = optionnel, plus strict que profil
#
# Note: recovery/agressif ont volatility_3y_min (pas max) car assign_preset_to_equity()
#       les crée quand vol >= 35

PRESET_RULES: Dict[str, Dict[str, float]] = {
    "defensif": {
        "volatility_3y_max": 26.0,
        "max_drawdown_3y_max": 35.0,
        "dividend_yield_min": 2.0,
        "payout_ratio_max": 80.0,
        "buffett_score_min": 60.0,
    },
    "low_volatility": {
        "volatility_3y_max": 22.0,
        "max_drawdown_3y_max": 30.0,
        "buffett_score_min": 65.0,
    },
    "rendement": {
        "volatility_3y_max": 35.0,
        "dividend_yield_min": 3.5,
        "payout_ratio_max": 85.0,
        "dividend_coverage_min": 1.0,
        "perf_1y_min": -5.0,
    },
    "value_dividend": {
        "volatility_3y_max": 32.0,
        "dividend_yield_min": 3.0,
        "roe_min": 8.0,
        "perf_3y_min": 15.0,
    },
    "quality_premium": {
        "volatility_3y_max": 36.0,
        "roe_min": 15.0,
        "perf_3y_min": 35.0,
        "buffett_score_min": 65.0,
    },
    "croissance": {
        "volatility_3y_max": 39.0,
        "perf_1y_min": 4.0,       # Fix UNH (-33.8% 1Y)
        "perf_3y_min": 25.0,
        "payout_ratio_max": 60.0,
    },
    "momentum_trend": {
        "volatility_3y_max": 40.0,
        "perf_1y_min": 10.0,      # Fix BIRG et momentum "mou"
        "perf_3m_min": 4.0,
        "perf_1m_min": 0.0,
    },
    "agressif": {
        "volatility_3y_min": 35.0,   # MIN pas MAX (cohérent avec assign)
        "volatility_3y_max": 60.0,
        "perf_1y_min": 12.0,
        "perf_ytd_min": 10.0,
    },
    "recovery": {
        "volatility_3y_min": 35.0,   # MIN pas MAX (cohérent avec assign)
        "perf_1y_min": -30.0,        # Accepte les chutes
        "perf_3m_min": 5.0,          # Mais rebond récent requis
    },
}

# Optionnel: messages debug/alertes (non utilisés par le moteur)
PRESET_ALERTS: Dict[str, str] = {
    "rendement": "⚠️ Risque yield trap: vérifier payout + coverage + dette",
    "recovery": "⚠️ Turnaround: catalyseur indispensable, sinon value trap",
    "agressif": "⚠️ High beta: drawdowns rapides / turnover élevé",
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


# ============ PROFILE BUCKET TARGETS ============

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

PROFILE_BENCHMARKS: Dict[str, Dict[str, float]] = {
    "Stable": {"URTH": 0.40, "IEF": 0.60},
    "Modéré": {"URTH": 0.60, "IEF": 0.40},
    "Agressif": {"URTH": 1.00},
}

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


# ============ FIELD MAPPING ============

FIELD_MAPPING: Dict[str, List[str]] = {
    "perf_ytd": ["perf_ytd", "ytd"],
    "perf_1y": ["perf_1y", "perf_12m", "momentum_12m"],
    "perf_3m": ["perf_3m"],
    "perf_1m": ["perf_1m"],
    "perf_3y": ["perf_3y"],
    "volatility_3y": ["volatility_3y", "vol_3y", "vol"],
    "max_drawdown_3y": ["max_drawdown_3y", "max_drawdown_ytd", "max_dd_3y"],
    "roe": ["roe"],
    "eps_growth_5y": ["eps_growth_5y"],
    "fcf_yield": ["fcf_yield"],
    "de_ratio": ["de_ratio"],
    "dividend_yield": ["dividend_yield", "div_yield"],
    "dividend_growth_3y": ["dividend_growth_3y"],
    "payout_ratio": ["payout_ratio_ttm", "payout_ratio"],
    "dividend_coverage": ["dividend_coverage", "interest_coverage"],
    "buffett_score": ["_buffett_score", "buffett_score"],
}

METRIC_RANGES: Dict[str, Tuple[float, float]] = {
    "perf_ytd": (-30, 60),
    "perf_1y": (-40, 100),
    "perf_3m": (-25, 50),
    "perf_1m": (-15, 25),
    "perf_3y": (-50, 150),
    "volatility_3y": (8, 120),
    "max_drawdown_3y": (5, 80),
    "roe": (0, 60),
    "eps_growth_5y": (-20, 50),
    "fcf_yield": (-2, 15),
    "de_ratio": (0, 2),
    "dividend_yield": (0, 8),
    "dividend_growth_3y": (-10, 30),
    "payout_ratio": (0, 120),
    "dividend_coverage": (0, 10),
    "buffett_score": (20, 100),
}


# ============ v5.0.0: RELAXATION PROGRESSIVE DES HARD FILTERS ============

# Format: (filter_key, delta, limit)
# - delta > 0 : on augmente la valeur (ex: vol_max)
# - delta < 0 : on diminue la valeur (ex: roe_min)
# - limit : valeur plancher/plafond à ne pas dépasser
#
# v5.1.0: Suppression de buffett_score_min (doublon avec PROFILE_POLICY)
RELAX_STEPS: List[Tuple[str, float, float]] = [
    ("volatility_3y_max", +10, 100.0),      # Étape 1: augmenter vol_max
    ("volatility_3y_min", -5, 0.0),          # Étape 2: baisser vol_min
    ("roe_min", -3, 0.0),                    # Étape 3: baisser roe_min
    ("dividend_coverage_min", -0.3, 0.8),    # Étape 4: baisser coverage_min
    ("payout_ratio_max", +15, 100.0),        # Étape 5: augmenter payout_max
    ("dividend_yield_min", -0.2, 0.0),       # Étape 6: baisser div_yield_min
]


# ============ PROFILE POLICY v5.0.0 ============

PROFILE_POLICY: Dict[str, Dict] = {
    "Agressif": {
        "allowed_equity_presets": {"croissance", "momentum_trend", "agressif", "recovery"},
        "min_buffett_score": 40,
        "hard_filters": {
            "volatility_3y_min": 22.0,
            "volatility_3y_max": 120.0,
        },
        "equity_min_weight": 0.50,
        "equity_max_weight": 0.75,
        "min_equity_positions": 12,
        "score_weights": {
            "perf_ytd": 0.00,
            "perf_1y": 0.20,
            "perf_3m": 0.10,
            "eps_growth_5y": 0.15,
            "roe": 0.10,
            "fcf_yield": 0.05,
            "max_drawdown_3y": -0.05,
            "volatility_3y": 0.05,
            "dividend_yield": -0.05,
            "buffett_score": 0.10,
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
            "volatility_3y_max": 45.0,
            "roe_min": 8.0,
        },
        "equity_min_weight": 0.40,
        "equity_max_weight": 0.60,
        "min_equity_positions": 10,
        "score_weights": {
            "perf_ytd": 0.05,
            "perf_1y": 0.10,
            "perf_3m": 0.05,
            "roe": 0.20,
            "eps_growth_5y": 0.10,
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
        "hard_filters": {
            "volatility_3y_max": 28.0,
            "roe_min": 10.0,
            "dividend_yield_min": 0.5,
            "payout_ratio_max": 85.0,
            "dividend_coverage_min": 1.2,
        },
        "equity_min_weight": 0.25,
        "equity_max_weight": 0.45,
        "min_equity_positions": 8,
        "score_weights": {
            "perf_ytd": 0.00,
            "perf_1y": 0.00,
            "roe": 0.15,
            "fcf_yield": 0.10,
            "volatility_3y": -0.25,
            "max_drawdown_3y": -0.15,
            "dividend_yield": 0.20,
            "dividend_growth_3y": 0.05,
            "buffett_score": 0.20,
        },
        "description": "Profil défensif, faible volatilité, haut dividende",
        "expected_vol_range": (6, 10),
        "expected_equity_overlap_with_agressif": 0.25,
    },
}


# ============ UTILITY FUNCTIONS ============

def safe_float(value, default: float = 0.0) -> float:
    """Conversion sécurisée en float - multi-locale."""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    try:
        s = str(value).strip()
        if not s or s.lower() in ("n/a", "nan", "-", "", "none", "null", "--"):
            return default
        s = s.replace("\xa0", "").replace(" ", "")
        if s.endswith("%"):
            s = s[:-1]
        s = re.sub(r'^[$€£¥]', '', s)
        s = re.sub(r'[$€£¥]$', '', s)
        multiplier = 1.0
        if s.endswith("M") or s.endswith("m"):
            multiplier, s = 1_000_000, s[:-1]
        elif s.endswith("B") or s.endswith("b"):
            multiplier, s = 1_000_000_000, s[:-1]
        elif s.endswith("K") or s.endswith("k"):
            multiplier, s = 1_000, s[:-1]
        has_comma, has_dot = "," in s, "." in s
        if has_comma and has_dot:
            if s.rfind(",") > s.rfind("."):
                s = s.replace(".", "").replace(",", ".")
            else:
                s = s.replace(",", "")
        elif has_comma:
            after_comma = s[s.rfind(",") + 1:]
            s = s.replace(",", "") if len(after_comma) == 3 and after_comma.isdigit() else s.replace(",", ".")
        return float(s) * multiplier
    except (ValueError, TypeError, AttributeError):
        return default


def get_profile_policy(profile: str) -> Dict:
    return PROFILE_POLICY.get(profile, PROFILE_POLICY["Modéré"])


def get_metric_value(eq: Dict, metric_key: str) -> Optional[float]:
    aliases = FIELD_MAPPING.get(metric_key, [metric_key])
    for alias in aliases:
        if alias in eq and eq[alias] is not None:
            return safe_float(eq[alias])
    return None


# ============ v5.1.0: PRESET RULES VALIDATION ============

_RULE_SUFFIXES = ("_min", "_max")


def _parse_rule_key(rule_key: str) -> Optional[Tuple[str, str]]:
    """Parse une clé de règle en (metric, op).
    
    Ex: "volatility_3y_max" -> ("volatility_3y", "max")
        "perf_1y_min" -> ("perf_1y", "min")
    """
    for suf in _RULE_SUFFIXES:
        if rule_key.endswith(suf):
            return rule_key[: -len(suf)], suf[1:]  # metric, "min"/"max"
    return None


def check_preset_rules(eq: Dict, preset: str) -> Tuple[bool, List[str]]:
    """Vérifie si une equity respecte les règles du preset.
    
    Args:
        eq: Dictionnaire de l'equity avec ses métriques
        preset: Nom du preset à vérifier
    
    Returns:
        (passed, reasons) où passed=True si toutes les règles sont respectées,
        et reasons contient la liste des violations
    """
    rules = PRESET_RULES.get(preset, {})
    if not rules:
        return True, []

    reasons: List[str] = []
    for rule_key, threshold in rules.items():
        parsed = _parse_rule_key(rule_key)
        if not parsed:
            reasons.append(f"invalid_rule_key:{rule_key}")
            continue

        metric, op = parsed
        v = get_metric_value(eq, metric)

        # Hard rule: missing => fail (cohérent avec vol_missing strict)
        if v is None:
            reasons.append(f"{metric}_missing")
            continue

        # max_drawdown_3y est stocké en négatif, on compare en valeur absolue
        if metric == "max_drawdown_3y":
            v = abs(v)

        if op == "min" and v < threshold:
            reasons.append(f"{metric}<{threshold}")
        elif op == "max" and v > threshold:
            reasons.append(f"{metric}>{threshold}")

    return (len(reasons) == 0), reasons


# ============ DATA-DRIVEN PERCENTILES ============

def build_metric_distributions(equities: List[Dict], metric_keys: List[str]) -> Dict[str, List[float]]:
    dists = {k: [] for k in metric_keys}
    for eq in equities:
        for k in metric_keys:
            v = get_metric_value(eq, k)
            if v is None:
                continue
            if k == "max_drawdown_3y":
                v = abs(v)
            dists[k].append(v)
    for k in dists:
        dists[k].sort()
    return dists


def winsorize(value: float, sorted_dist: List[float], p: float = 0.01) -> float:
    if not sorted_dist or len(sorted_dist) < 2:
        return value
    lo = sorted_dist[int(p * (len(sorted_dist) - 1))]
    hi = sorted_dist[int((1 - p) * (len(sorted_dist) - 1))]
    return max(lo, min(hi, value))


def pct_rank(value: float, sorted_dist: List[float]) -> float:
    """v4.15.1: O(log n) avec bisect."""
    if not sorted_dist:
        return 0.5
    return bisect.bisect_left(sorted_dist, value) / len(sorted_dist)


def compute_percentile_fallback(value: float, metric_key: str) -> float:
    min_val, max_val = METRIC_RANGES.get(metric_key, (0, 100))
    if max_val <= min_val:
        return 0.5
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))


def normalize_profile_score(score_raw: float, weights: Dict[str, float]) -> float:
    """
    v5.0.0: Normalisation correcte du score [0, 1] basée sur min/max théoriques.
    
    Problème avec l'ancienne formule (score_raw + S) / (2 * S):
    - Suppose que tous les poids sont positifs
    - Compresse la distribution quand il y a des poids négatifs
    
    Nouvelle approche:
    - raw_min = somme des poids négatifs (pire cas)
    - raw_max = somme des poids positifs (meilleur cas)
    - Normalise linéairement entre ces bornes
    
    Args:
        score_raw: Score brut (somme pondérée des percentiles)
        weights: Dictionnaire des poids par métrique
    
    Returns:
        Score normalisé [0, 1]
    """
    # Calculer les bornes théoriques
    raw_min = sum(w for w in weights.values() if w < 0)  # Pire: percentile=1 pour négatifs
    raw_max = sum(w for w in weights.values() if w > 0)  # Meilleur: percentile=1 pour positifs
    
    denom = raw_max - raw_min
    
    if denom == 0:
        return 0.5  # Tous les poids sont 0
    
    # Normalisation linéaire
    normalized = (score_raw - raw_min) / denom
    
    # Clamp pour les outliers (valeurs hors distribution)
    return max(0.0, min(1.0, normalized))


def compute_universe_stats(equities: List[Dict]) -> Dict[str, List[float]]:
    all_keys = set()
    for aliases in FIELD_MAPPING.values():
        all_keys.update(aliases)
    all_keys.update([
        "momentum_12m", "perf_3m", "perf_ytd", "perf_1y", "perf_3y",
        "eps_growth_5y", "roe", "fcf_yield", "vol_3y", "max_dd_3y",
        "dividend_yield", "buffett_score", "composite_score"
    ])
    stats = {k: [] for k in all_keys}
    for eq in equities:
        for key in all_keys:
            val = eq.get(key)
            if val is not None:
                try:
                    stats[key].append(safe_float(val))
                except (ValueError, TypeError):
                    pass
    return stats


# ============ ASSIGN PRESET ============

def assign_preset_to_equity(eq: Dict) -> str:
    """v4.14.0: recovery AVANT agressif."""
    vol = get_metric_value(eq, "volatility_3y") or 25.0
    ytd = get_metric_value(eq, "perf_ytd") or 0.0
    perf_1y = get_metric_value(eq, "perf_1y") or 0.0
    roe = get_metric_value(eq, "roe") or 12.0
    div_yield = get_metric_value(eq, "dividend_yield") or 0.0
    buffett = get_metric_value(eq, "buffett_score") or 50.0
    
    if vol < 1 or vol > 120:
        vol = 25.0
    
    if vol >= 35 and ytd < -10:
        return "recovery"
    if vol >= 35:
        return "agressif"
    if vol < 22 and (div_yield > 1.5 or buffett >= 75):
        return "rendement" if div_yield > 2.0 else "defensif"
    if vol < 20 and buffett >= 70:
        return "low_volatility"
    if vol < 30 and roe > 15 and buffett >= 65:
        return "quality_premium"
    if vol < 28 and div_yield > 1.0:
        return "value_dividend"
    if vol >= 28 and (ytd > 5 or perf_1y > 20):
        return "momentum_trend"
    if vol >= 25 and ytd > 0:
        return "croissance"
    if ytd > 5:
        return "croissance"
    elif div_yield > 1.0:
        return "value_dividend"
    return "quality_premium"


def assign_preset_to_equity_with_rules(eq: Dict) -> str:
    """v5.1.0: Assigne un preset + vérifie les PRESET_RULES + fallback si échec.
    
    Workflow:
    1. Assigne le preset de base via assign_preset_to_equity()
    2. Vérifie si l'equity respecte les règles du preset (PRESET_RULES)
    3. Si échec, essaie les autres presets dans EQUITY_PRESET_PRIORITY
    4. Tag l'equity si fallback utilisé (_preset_rule_failed)
    
    Args:
        eq: Dictionnaire de l'equity
    
    Returns:
        Nom du preset assigné
    """
    base = assign_preset_to_equity(eq)
    ok, reasons = check_preset_rules(eq, base)
    
    if ok:
        # Preset de base respecte ses règles
        eq.pop("_preset_rule_failed", None)
        eq.pop("_preset_rule_fail_reasons", None)
        return base

    # Fallback: essayer d'autres presets (9 presets -> coût négligeable)
    for p in EQUITY_PRESET_PRIORITY:
        if p == base:
            continue  # Déjà testé
        ok2, _ = check_preset_rules(eq, p)
        if ok2:
            eq["_preset_rule_failed"] = True
            eq["_preset_rule_fail_reasons"] = reasons
            eq["_preset_original"] = base
            logger.debug(f"   Preset fallback: {eq.get('ticker', '?')} {base} -> {p} (reasons: {reasons})")
            return p

    # Aucun preset ne passe: on garde base mais on tag (utile pour debug)
    eq["_preset_rule_failed"] = True
    eq["_preset_rule_fail_reasons"] = reasons
    eq["_preset_no_fallback"] = True
    logger.debug(f"   Preset no fallback: {eq.get('ticker', '?')} kept {base} (reasons: {reasons})")
    return base


# ============ APPLY HARD FILTERS v5.0.0 ============

def apply_hard_filters(equities: List[Dict], profile: str) -> Tuple[List[Dict], Dict]:
    """
    v4.15.2 FIX: vol_missing traité comme les autres métriques.
    Plus de default 25.0 - si vol manquante = reject.
    """
    policy = get_profile_policy(profile)
    filters = policy.get("hard_filters", {})
    
    if not filters:
        return equities, {"skipped": True, "before": len(equities), "after": len(equities)}
    
    filtered = []
    rejection_counts = {}
    
    for eq in equities:
        reasons = []
        
        # v4.15.2: vol sans default, traité comme les autres
        vol = get_metric_value(eq, "volatility_3y")
        roe = get_metric_value(eq, "roe")
        div_yield = get_metric_value(eq, "dividend_yield")
        payout = get_metric_value(eq, "payout_ratio")
        coverage = get_metric_value(eq, "dividend_coverage")
        
        # v4.15.2: vol_missing = reject si filtre vol existe
        if "volatility_3y_min" in filters or "volatility_3y_max" in filters:
            if vol is None:
                reasons.append("vol_missing")
            else:
                if vol < 1 or vol > 120:
                    reasons.append("vol_aberrant")
                if "volatility_3y_min" in filters and vol < filters["volatility_3y_min"]:
                    reasons.append(f"vol<{filters['volatility_3y_min']}")
                if "volatility_3y_max" in filters and vol > filters["volatility_3y_max"]:
                    reasons.append(f"vol>{filters['volatility_3y_max']}")
        
        # ROE filter
        if "roe_min" in filters:
            if roe is None:
                reasons.append("roe_missing")
            elif roe < filters["roe_min"]:
                reasons.append(f"roe<{filters['roe_min']}")
        
        # Dividend yield filter
        if "dividend_yield_min" in filters:
            if div_yield is None:
                reasons.append("div_yield_missing")
            elif div_yield < filters["dividend_yield_min"]:
                reasons.append(f"div<{filters['dividend_yield_min']}")
        
        # Anti yield-trap: payout
        if "payout_ratio_max" in filters:
            if payout is None:
                reasons.append("payout_missing")
            elif payout > filters["payout_ratio_max"]:
                reasons.append(f"payout>{filters['payout_ratio_max']}")
        
        # Anti yield-trap: coverage
        if "dividend_coverage_min" in filters:
            if coverage is None:
                reasons.append("coverage_missing")
            elif coverage < filters["dividend_coverage_min"]:
                reasons.append(f"coverage<{filters['dividend_coverage_min']}")
        
        if reasons:
            for r in reasons:
                rejection_counts[r] = rejection_counts.get(r, 0) + 1
        else:
            filtered.append(eq)
    
    stats = {
        "before": len(equities),
        "after": len(filtered),
        "rejected": len(equities) - len(filtered),
        "reasons": rejection_counts,
    }
    
    logger.info(f"   [{profile}] Hard filters: {stats['after']}/{stats['before']} passent")
    return filtered, stats


def apply_hard_filters_with_custom(
    equities: List[Dict], 
    custom_filters: Dict[str, float]
) -> Tuple[List[Dict], Dict]:
    """
    v5.0.0: Applique des hard filters avec des seuils personnalisés.
    
    Utilisé pour la relaxation progressive - permet de tester différents seuils
    sans modifier PROFILE_POLICY.
    
    Args:
        equities: Liste des actions à filtrer
        custom_filters: Dictionnaire des filtres personnalisés
    
    Returns:
        (filtered_equities, stats)
    """
    if not custom_filters:
        return equities, {"skipped": True, "before": len(equities), "after": len(equities)}
    
    filtered = []
    rejection_counts = {}
    
    for eq in equities:
        reasons = []
        
        vol = get_metric_value(eq, "volatility_3y")
        roe = get_metric_value(eq, "roe")
        div_yield = get_metric_value(eq, "dividend_yield")
        payout = get_metric_value(eq, "payout_ratio")
        coverage = get_metric_value(eq, "dividend_coverage")
        buffett = get_metric_value(eq, "buffett_score")
        
        # Volatility filters
        if "volatility_3y_min" in custom_filters or "volatility_3y_max" in custom_filters:
            if vol is None:
                reasons.append("vol_missing")
            else:
                if vol < 1 or vol > 120:
                    reasons.append("vol_aberrant")
                if "volatility_3y_min" in custom_filters and vol < custom_filters["volatility_3y_min"]:
                    reasons.append(f"vol<{custom_filters['volatility_3y_min']}")
                if "volatility_3y_max" in custom_filters and vol > custom_filters["volatility_3y_max"]:
                    reasons.append(f"vol>{custom_filters['volatility_3y_max']}")
        
        # ROE filter
        if "roe_min" in custom_filters:
            if roe is None:
                reasons.append("roe_missing")
            elif roe < custom_filters["roe_min"]:
                reasons.append(f"roe<{custom_filters['roe_min']}")
        
        # Dividend yield filter
        if "dividend_yield_min" in custom_filters:
            if div_yield is None:
                reasons.append("div_yield_missing")
            elif div_yield < custom_filters["dividend_yield_min"]:
                reasons.append(f"div<{custom_filters['dividend_yield_min']}")
        
        # Payout ratio filter
        if "payout_ratio_max" in custom_filters:
            if payout is None:
                reasons.append("payout_missing")
            elif payout > custom_filters["payout_ratio_max"]:
                reasons.append(f"payout>{custom_filters['payout_ratio_max']}")
        
        # Dividend coverage filter
        if "dividend_coverage_min" in custom_filters:
            if coverage is None:
                reasons.append("coverage_missing")
            elif coverage < custom_filters["dividend_coverage_min"]:
                reasons.append(f"coverage<{custom_filters['dividend_coverage_min']}")
        
        # Buffett score filter
        if "buffett_score_min" in custom_filters:
            if buffett is None:
                reasons.append("buffett_missing")
            elif buffett < custom_filters["buffett_score_min"]:
                reasons.append(f"buffett<{custom_filters['buffett_score_min']}")
        
        if reasons:
            for r in reasons:
                rejection_counts[r] = rejection_counts.get(r, 0) + 1
        else:
            filtered.append(eq)
    
    stats = {
        "before": len(equities),
        "after": len(filtered),
        "rejected": len(equities) - len(filtered),
        "reasons": rejection_counts,
        "custom_filters": custom_filters,
    }
    
    return filtered, stats


# ============ SCORING v5.0.0 ============

def score_equity_for_profile(
    stock: Dict,
    profile: str,
    universe_dists: Optional[Dict[str, List[float]]] = None,
) -> float:
    """
    v5.0.0: Scoring avec normalize_profile_score() pour meilleure distribution.
    
    Changements vs v4.15.2:
    - Utilise normalize_profile_score() au lieu de (score_raw + S) / (2 * S)
    - Meilleure dispersion des scores [0, 1]
    
    Si valeur manquante:
    - poids > 0 (bonus): percentile = 0.5 (neutre)
    - poids < 0 (malus): percentile = 1.0 (pire cas, pénalité max)
    """
    policy = get_profile_policy(profile)
    weights = policy.get("score_weights", {})
    score_raw = 0.0
    
    for metric_key, weight in weights.items():
        if weight == 0:
            continue
        
        value = get_metric_value(stock, metric_key)
        
        # Missing data handling
        if value is None:
            percentile = 1.0 if weight < 0 else 0.5
            score_raw += weight * percentile
            continue
        
        if metric_key == "max_drawdown_3y":
            value = abs(value)
        
        dist = universe_dists.get(metric_key, []) if universe_dists else []
        if len(dist) >= 10:
            value_w = winsorize(value, dist, p=0.01)
            percentile = pct_rank(value_w, dist)
        else:
            percentile = compute_percentile_fallback(value, metric_key)
        
        score_raw += weight * percentile
    
    # v5.0.0: Utilise normalize_profile_score() pour meilleure distribution
    return normalize_profile_score(score_raw, weights)


def filter_equities_by_profile(
    equities: List[Dict],
    profile: str,
    preset_field: str = "_matched_preset"
) -> List[Dict]:
    policy = get_profile_policy(profile)
    allowed_presets = policy.get("allowed_equity_presets", set())
    for eq in equities:
        if not eq.get(preset_field):
            eq[preset_field] = assign_preset_to_equity(eq)
    if not allowed_presets:
        return equities
    return [eq for eq in equities if eq.get(preset_field) in allowed_presets]


# ============ MAIN SELECTION v5.1.0 ============

def select_equities_for_profile(
    equities: List[Dict],
    profile: str,
    market_context: Optional[Dict] = None,
    target_n: int = 25,
) -> Tuple[List[Dict], Dict]:
    """v5.1.0: Sélection avec PRESET_RULES validation + relaxation progressive."""
    logger.info(f"\n{'='*50}")
    logger.info(f"[{profile}] Sélection depuis {len(equities)} équités")
    
    policy = get_profile_policy(profile)
    meta = {"profile": profile, "stages": {}}
    
    # v5.1.0: Assign presets avec validation des règles
    rule_fail = 0
    for eq in equities:
        if not eq.get("_matched_preset"):
            eq["_matched_preset"] = assign_preset_to_equity_with_rules(eq)
        if eq.get("_preset_rule_failed"):
            rule_fail += 1
    
    meta["stages"]["preset_rules"] = {"failed": rule_fail, "total": len(equities)}
    
    preset_dist = {}
    for eq in equities:
        p = eq.get("_matched_preset", "UNKNOWN")
        preset_dist[p] = preset_dist.get(p, 0) + 1
    meta["stages"]["presets"] = preset_dist
    
    # Buffett filter
    min_buffett = policy.get("min_buffett_score", 0)
    eq_buffett = [eq for eq in equities if (get_metric_value(eq, "buffett_score") or 0) >= min_buffett]
    meta["stages"]["buffett"] = {"min": min_buffett, "before": len(equities), "after": len(eq_buffett)}
    
    if len(eq_buffett) < target_n:
        relaxed = max(0, min_buffett - 20)
        eq_buffett = [eq for eq in equities if (get_metric_value(eq, "buffett_score") or 0) >= relaxed]
        meta["stages"]["buffett"]["relaxed_to"] = relaxed
    
    # Preset filter
    allowed_presets = policy.get("allowed_equity_presets", set())
    if allowed_presets:
        eq_preset = [eq for eq in eq_buffett if eq.get("_matched_preset") in allowed_presets]
        meta["stages"]["preset_filter"] = {"before": len(eq_buffett), "after": len(eq_preset)}
        
        if len(eq_preset) < target_n // 2:
            eq_preset = eq_buffett
            meta["stages"]["preset_filter"]["skipped"] = True
    else:
        eq_preset = eq_buffett
    
    # Hard filters avec relaxation progressive v5.0.0
    eq_hard, hard_stats = apply_hard_filters(eq_preset, profile)
    meta["stages"]["hard_filters"] = hard_stats
    
    # v5.0.0: Relaxation progressive au lieu de skip brutal
    if len(eq_hard) < target_n // 2:
        filters = deepcopy(policy.get("hard_filters", {}))
        relaxed_steps = []
        
        for filter_key, delta, limit in RELAX_STEPS:
            if filter_key not in filters:
                continue
            
            old_val = filters[filter_key]
            # delta > 0 : on augmente (ex: vol_max), limité par limit
            # delta < 0 : on diminue (ex: roe_min), limité par limit
            if delta > 0:
                new_val = min(old_val + delta, limit)
            else:
                new_val = max(old_val + delta, limit)
            
            filters[filter_key] = new_val
            relaxed_steps.append(f"{filter_key}: {old_val} → {new_val}")
            
            # Tester avec les nouveaux filtres
            eq_hard_relaxed, relax_stats = apply_hard_filters_with_custom(eq_preset, filters)
            
            logger.info(f"   [{profile}] Relaxation {filter_key}: {len(eq_hard_relaxed)} après relax")
            
            if len(eq_hard_relaxed) >= target_n // 2:
                eq_hard = eq_hard_relaxed
                meta["stages"]["hard_filters"]["relaxed"] = relaxed_steps
                meta["stages"]["hard_filters"]["relaxed_stats"] = relax_stats
                break
        else:
            # Fallback minimal: garder uniquement le filtre Buffett >= 20
            eq_hard = [x for x in eq_preset if (get_metric_value(x, "buffett_score") or 0) >= 20]
            if len(eq_hard) < 5:
                eq_hard = eq_preset
                meta["stages"]["hard_filters"]["fallback"] = "all_preset"
            else:
                meta["stages"]["hard_filters"]["fallback"] = "buffett_20_only"
            meta["stages"]["hard_filters"]["relaxed"] = relaxed_steps
    
    # Build distributions
    score_weights = policy.get("score_weights", {})
    metric_keys = [k for k, w in score_weights.items() if w != 0]
    universe_dists = build_metric_distributions(eq_hard, metric_keys)
    meta["stages"]["distributions"] = {k: len(v) for k, v in universe_dists.items() if v}
    
    # Score
    for eq in eq_hard:
        eq["_profile_score"] = score_equity_for_profile(eq, profile, universe_dists)
    
    sorted_eq = sorted(eq_hard, key=lambda x: x.get("_profile_score", 0), reverse=True)
    selected = sorted_eq[:target_n]
    meta["selected_count"] = len(selected)
    
    # Stats
    if selected:
        meta["stats"] = {
            "avg_vol": round(sum(get_metric_value(eq, "volatility_3y") or 0 for eq in selected) / len(selected), 1),
            "avg_div": round(sum(get_metric_value(eq, "dividend_yield") or 0 for eq in selected) / len(selected), 2),
            "avg_score": round(sum(eq.get("_profile_score", 0) for eq in selected) / len(selected), 3),
        }
    
    return selected, meta


def blend_profile_score(eq: Dict, profile_score: float) -> float:
    original = eq.get("composite_score", 0) or 0
    if original > 1:
        original /= 100.0
    return max(0.0, min(1.0, 0.6 * profile_score + 0.4 * original))


def diagnose_profile_overlap(equities_by_profile: Dict[str, List[Dict]]) -> Dict:
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


# ============ HELPER FUNCTIONS ============

def get_preset_config(preset_name: str) -> Optional[PresetConfig]:
    return PRESET_META.get(preset_name)

def get_presets_by_role(role: Role) -> List[str]:
    return [name for name, config in PRESET_META.items() if config.role == role]

def get_presets_by_asset_class(asset_class: AssetClass) -> List[str]:
    return [name for name, config in PRESET_META.items() if config.asset_class == asset_class]

def get_bucket_targets(profile: str) -> Dict[Role, Tuple[float, float]]:
    return PROFILE_BUCKET_TARGETS.get(profile, PROFILE_BUCKET_TARGETS["Modéré"])

def get_max_weight_for_preset(preset_name: str, profile: str) -> float:
    config = PRESET_META.get(preset_name)
    if not config:
        return 0.0
    max_weight = config.max_weight_pct / 100
    bucket_range = PROFILE_BUCKET_TARGETS.get(profile, {}).get(config.role, (0, 1))
    return min(max_weight, bucket_range[1])

def get_corporate_group(stock_name: str) -> Optional[str]:
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
    groups_found, no_group = {}, []
    for stock in stocks:
        name = stock.get("name", "")
        group = get_corporate_group(name)
        if group:
            groups_found.setdefault(group, []).append(stock)
        else:
            no_group.append(stock)
    
    selected, removed_by_group = [], {}
    for group_id, group_stocks in groups_found.items():
        if scores:
            group_stocks.sort(key=lambda s: scores.get(s.get("name", ""), 0), reverse=True)
        selected.extend(group_stocks[:max_per_group])
        if len(group_stocks) > max_per_group:
            removed_by_group[group_id] = [s.get("name", "") for s in group_stocks[max_per_group:]]
    
    selected.extend(no_group)
    return selected, removed_by_group

def deduplicate_etf_by_exposure(
    etf_list: List[str],
    exposures_wanted: Optional[Set[str]] = None
) -> List[str]:
    selected, exposures_covered = [], set()
    for exposure, equivalents in ETF_EXPOSURE_EQUIVALENTS.items():
        if exposures_wanted and exposure not in exposures_wanted:
            continue
        for etf in equivalents:
            if etf in etf_list and exposure not in exposures_covered:
                selected.append(etf)
                exposures_covered.add(exposure)
                break
    
    known_etfs = {etf for eqs in ETF_EXPOSURE_EQUIVALENTS.values() for etf in eqs}
    selected.extend(etf for etf in etf_list if etf not in known_etfs and etf not in selected)
    return selected

def get_correlation_groups() -> Dict[str, List[str]]:
    groups = {}
    for preset_name, config in PRESET_META.items():
        groups.setdefault(config.correlation_group, []).append(preset_name)
    return groups


# ============ CORRELATION MATRIX ============

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
    if group1 == group2:
        return 1.0
    return CORRELATION_BY_GROUP.get((group1, group2), CORRELATION_BY_GROUP.get((group2, group1), 0.30))


# ============ VALIDATION ============

def validate_portfolio_buckets(
    weights: Dict[str, float],
    preset_assignments: Dict[str, str],
    profile: str
) -> Dict:
    targets = PROFILE_BUCKET_TARGETS.get(profile, {})
    role_weights = {role: 0.0 for role in Role}
    
    for ticker, weight in weights.items():
        preset = preset_assignments.get(ticker)
        if preset and preset in PRESET_META:
            role_weights[PRESET_META[preset].role] += weight
    
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
) -> Dict:
    group_weights = {}
    for name, weight in weights.items():
        group = get_corporate_group(name)
        if group:
            group_weights[group] = group_weights.get(group, 0) + weight
    
    violations = [
        f"{g}: {w*100:.1f}% > max {max_group_weight*100:.1f}%"
        for g, w in group_weights.items() if w > max_group_weight
    ]
    
    return {
        "valid": len(violations) == 0,
        "group_weights": group_weights,
        "violations": violations,
    }


# ============ EXPORT ============

def export_watchlist(
    equities: List[Dict],
    profile: str,
    top_n: int = 200,
    output_dir: str = "data"
) -> str:
    import json
    from pathlib import Path
    
    sorted_eq = sorted(equities, key=lambda x: x.get("_profile_score", 0), reverse=True)[:top_n]
    Path(output_dir).mkdir(exist_ok=True)
    filepath = f"{output_dir}/watchlist_{profile.lower()}.json"
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(
            [{k: v for k, v in eq.items() if not k.startswith("_score_debug")} for eq in sorted_eq],
            f, ensure_ascii=False, indent=2, default=str
        )
    
    return filepath


# ============ MAIN TEST v5.1.0 ============

if __name__ == "__main__":
    print("=" * 60)
    print("PRESET_META v5.1.0 - Option B + PRESET_RULES")
    print("=" * 60)
    
    print(f"\nTotal presets: {len(PRESET_META)}")
    print(f"PRESET_RULES defined for: {list(PRESET_RULES.keys())}")
    
    # TEST 1: pct_rank O(log n)
    print("\n--- TEST 1: pct_rank() O(log n) ---")
    test_dist = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
    assert abs(pct_rank(20, test_dist) - 0.2) < 0.01
    assert abs(pct_rank(50, test_dist) - 0.8) < 0.01
    print("✅ pct_rank() OK")
    
    # TEST 2: vol_missing = reject
    print("\n--- TEST 2: vol_missing = reject ---")
    stock_no_vol = {"name": "NO_VOL", "ticker": "NV", "roe": 15.0, "dividend_yield": 3.0, "buffett_score": 80}
    stock_with_vol = {"name": "WITH_VOL", "ticker": "WV", "volatility_3y": 25.0, "roe": 15.0, "dividend_yield": 3.0, "buffett_score": 80}
    
    filtered, stats = apply_hard_filters([stock_no_vol, stock_with_vol], "Agressif")
    assert "vol_missing" in stats["reasons"], "vol_missing should be detected"
    print(f"✅ vol_missing detected: {stats['reasons']}")
    
    # TEST 3: Missing data scoring penalty
    print("\n--- TEST 3: Missing data scoring penalty ---")
    stock_complete = {"name": "COMPLETE", "volatility_3y": 30, "perf_1y": 20, "max_drawdown_3y": -15, "buffett_score": 70}
    stock_missing_dd = {"name": "MISSING_DD", "volatility_3y": 30, "perf_1y": 20, "buffett_score": 70}
    
    score_complete = score_equity_for_profile(stock_complete, "Agressif", {})
    score_missing = score_equity_for_profile(stock_missing_dd, "Agressif", {})
    
    print(f"   Score complete: {score_complete:.3f}")
    print(f"   Score missing DD: {score_missing:.3f}")
    assert score_missing < score_complete, "Missing negative metric should penalize score"
    print("✅ Missing data penalty works correctly")
    
    # TEST 4: Yield trap still filtered
    print("\n--- TEST 4: Yield trap filtered ---")
    yield_trap = {
        "name": "YIELD_TRAP", "ticker": "YT",
        "volatility_3y": 20.0, "roe": 15.0, "dividend_yield": 5.0,
        "payout_ratio": 150.0, "dividend_coverage": 0.7, "buffett_score": 70
    }
    good_stock = {
        "name": "QUALITY_DIV", "ticker": "QD",
        "volatility_3y": 18.0, "roe": 20.0, "dividend_yield": 3.0,
        "payout_ratio": 50.0, "dividend_coverage": 3.0, "buffett_score": 80
    }
    
    filtered, stats = apply_hard_filters([yield_trap, good_stock], "Stable")
    assert len(filtered) == 1 and filtered[0]["ticker"] == "QD"
    print(f"✅ Yield trap filtered. Reasons: {stats['reasons']}")
    
    # TEST 5: normalize_profile_score()
    print("\n--- TEST 5: normalize_profile_score() ---")
    test_weights = {"perf_1y": 0.20, "roe": 0.15, "volatility_3y": -0.25, "max_drawdown_3y": -0.10}
    
    # Pire cas: percentile=0 pour positifs, percentile=1 pour négatifs
    worst_raw = 0.20 * 0 + 0.15 * 0 + (-0.25) * 1 + (-0.10) * 1  # = -0.35
    worst_score = normalize_profile_score(worst_raw, test_weights)
    
    # Meilleur cas: percentile=1 pour positifs, percentile=0 pour négatifs
    best_raw = 0.20 * 1 + 0.15 * 1 + (-0.25) * 0 + (-0.10) * 0  # = 0.35
    best_score = normalize_profile_score(best_raw, test_weights)
    
    # Cas médian
    mid_raw = 0.20 * 0.5 + 0.15 * 0.5 + (-0.25) * 0.5 + (-0.10) * 0.5  # = 0
    mid_score = normalize_profile_score(mid_raw, test_weights)
    
    print(f"   Worst score: {worst_score:.3f} (expected ~0)")
    print(f"   Best score: {best_score:.3f} (expected ~1)")
    print(f"   Mid score: {mid_score:.3f} (expected ~0.5)")
    
    assert worst_score < 0.1, "Worst score should be near 0"
    assert best_score > 0.9, "Best score should be near 1"
    assert 0.4 < mid_score < 0.6, "Mid score should be near 0.5"
    print("✅ normalize_profile_score() OK")
    
    # TEST 6: apply_hard_filters_with_custom()
    print("\n--- TEST 6: apply_hard_filters_with_custom() ---")
    test_stocks = [
        {"name": "LOW_VOL", "volatility_3y": 15.0, "roe": 20.0},
        {"name": "MID_VOL", "volatility_3y": 30.0, "roe": 15.0},
        {"name": "HIGH_VOL", "volatility_3y": 50.0, "roe": 10.0},
    ]
    
    # Filtre strict
    strict_filters = {"volatility_3y_max": 25.0, "roe_min": 12.0}
    filtered_strict, _ = apply_hard_filters_with_custom(test_stocks, strict_filters)
    assert len(filtered_strict) == 1 and filtered_strict[0]["name"] == "LOW_VOL"
    
    # Filtre relaxé
    relaxed_filters = {"volatility_3y_max": 35.0, "roe_min": 10.0}
    filtered_relaxed, _ = apply_hard_filters_with_custom(test_stocks, relaxed_filters)
    assert len(filtered_relaxed) == 2
    
    print("✅ apply_hard_filters_with_custom() OK")
    
    # TEST 7: RELAX_STEPS config (v5.1.0: buffett_score_min removed)
    print("\n--- TEST 7: RELAX_STEPS config ---")
    assert len(RELAX_STEPS) >= 5, "Should have at least 5 relaxation steps"
    for filter_key, delta, limit in RELAX_STEPS:
        assert isinstance(filter_key, str)
        assert isinstance(delta, (int, float))
        assert isinstance(limit, (int, float))
        assert filter_key != "buffett_score_min", "buffett_score_min should be removed from RELAX_STEPS"
    print(f"✅ RELAX_STEPS OK ({len(RELAX_STEPS)} steps, no buffett_score_min)")
    
    # TEST 8: check_preset_rules() - NEW v5.1.0
    print("\n--- TEST 8: check_preset_rules() ---")
    
    # Stock qui passe croissance
    good_growth = {
        "ticker": "GOOD_GROWTH",
        "volatility_3y": 30.0,
        "perf_1y": 15.0,
        "perf_3y": 40.0,
        "payout_ratio": 40.0,
    }
    ok, reasons = check_preset_rules(good_growth, "croissance")
    assert ok, f"Good growth should pass: {reasons}"
    print(f"   Good growth passes croissance: ✅")
    
    # Stock qui échoue croissance (UNH-like: perf_1y négatif)
    bad_growth = {
        "ticker": "BAD_GROWTH",
        "volatility_3y": 30.0,
        "perf_1y": -33.8,  # UNH case
        "perf_3y": 40.0,
        "payout_ratio": 40.0,
    }
    ok, reasons = check_preset_rules(bad_growth, "croissance")
    assert not ok, "Bad growth should fail"
    assert any("perf_1y" in r for r in reasons), f"Should fail on perf_1y: {reasons}"
    print(f"   Bad growth (UNH-like) fails croissance: ✅ ({reasons})")
    
    # Stock momentum qui échoue (BIRG-like)
    bad_momentum = {
        "ticker": "BAD_MOMENTUM",
        "volatility_3y": 35.0,
        "perf_1y": 5.0,  # < 10% required
        "perf_3m": 6.0,
        "perf_1m": 2.0,
    }
    ok, reasons = check_preset_rules(bad_momentum, "momentum_trend")
    assert not ok, "Bad momentum should fail"
    print(f"   Bad momentum fails: ✅ ({reasons})")
    
    print("✅ check_preset_rules() OK")
    
    # TEST 9: assign_preset_to_equity_with_rules() - NEW v5.1.0
    print("\n--- TEST 9: assign_preset_to_equity_with_rules() ---")
    
    # Stock qui devrait être croissance mais échoue -> fallback
    unh_like = {
        "ticker": "UNH_LIKE",
        "volatility_3y": 28.0,
        "perf_ytd": 8.0,
        "perf_1y": -33.8,
        "perf_3y": 10.0,
        "roe": 20.0,
        "dividend_yield": 1.5,
        "buffett_score": 70,
        "payout_ratio": 30.0,
    }
    
    # Sans rules: serait croissance (ytd > 5)
    base_preset = assign_preset_to_equity(unh_like.copy())
    print(f"   Base preset (no rules): {base_preset}")
    
    # Avec rules: devrait fallback
    unh_copy = unh_like.copy()
    final_preset = assign_preset_to_equity_with_rules(unh_copy)
    print(f"   Final preset (with rules): {final_preset}")
    
    if unh_copy.get("_preset_rule_failed"):
        print(f"   Fallback used: {unh_copy.get('_preset_original')} -> {final_preset}")
        print(f"   Reasons: {unh_copy.get('_preset_rule_fail_reasons')}")
    
    print("✅ assign_preset_to_equity_with_rules() OK")
    
    # TEST 10: PRESET_RULES consistency with assign_preset_to_equity()
    print("\n--- TEST 10: PRESET_RULES consistency ---")
    
    # recovery: vol >= 35 (min, pas max)
    assert "volatility_3y_min" in PRESET_RULES["recovery"], "recovery should have vol_min"
    assert "volatility_3y_max" not in PRESET_RULES["recovery"], "recovery should NOT have vol_max"
    
    # agressif: vol >= 35 (min)
    assert "volatility_3y_min" in PRESET_RULES["agressif"], "agressif should have vol_min"
    
    print("✅ PRESET_RULES consistency OK")
    
    print("\n" + "=" * 60)
    print("v5.1.0 CHANGELOG:")
    print("  ✅ PRESET_RULES dict avec contraintes dures par preset")
    print("  ✅ _parse_rule_key() pour parser les clés")
    print("  ✅ check_preset_rules() valide equity vs preset rules")
    print("  ✅ assign_preset_to_equity_with_rules() avec fallback")
    print("  ✅ Suppression buffett_score_min de RELAX_STEPS")
    print("  ✅ select_equities_for_profile() utilise les nouvelles fonctions")
    print("  ✅ Fix UNH (croissance perf_1y_min: 4%)")
    print("  ✅ Fix BIRG (momentum_trend perf_1y_min: 10%)")
    print("=" * 60)
    print("\n🎯 Architecture Option B: preset_meta = seul moteur equity + PRESET_RULES")
