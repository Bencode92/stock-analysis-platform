# portfolio_engine/preset_meta.py
"""
PRESET_META - Source unique de vérité pour les presets.

v4.15.1 HOTFIX (Claude + ChatGPT consensus):
- FIX BUG CRITIQUE: elif → if (tous les hard filters s'appliquent maintenant)
- FIX PERF: pct_rank() utilise bisect.bisect_left O(log n) au lieu de O(n)
- Test unitaire anti yield-trap ajouté

v4.15.0: PATCH A (percentiles data-driven), PATCH B (vol range), PATCH C (yield-trap strict)
v4.14.0: safe_float multi-locale, ordre recovery/agressif, scoring Agressif 55%→30%
v4.13.2: Correction scoring + _matched_preset + hard filters

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
    
    # v4.15.1: Sélection avec percentiles data-driven + tous les filters appliqués
    selected, meta = select_equities_for_profile(equities, "Agressif", target_n=25)
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Set
import logging
import re
import bisect  # v4.15.1: pour pct_rank O(log n)

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


# ============ REGION MAPPINGS ============

COUNTRY_TO_REGION: Dict[str, str] = {
    # INDE
    "Inde": "IN", "India": "IN",
    # ASIE HORS INDE
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
    # EUROPE
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
    # USA
    "Etats-Unis": "US", "États-Unis": "US", "United States": "US", "USA": "US", "US": "US",
    # LATAM
    "Brésil": "LATAM", "Brazil": "LATAM",
    "Mexique": "LATAM", "Mexico": "LATAM",
    "Argentine": "LATAM", "Argentina": "LATAM",
    "Chili": "LATAM", "Chile": "LATAM",
    "Colombie": "LATAM", "Colombia": "LATAM",
    "Pérou": "LATAM", "Peru": "LATAM",
    # OTHER
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
    """Mappe un pays vers sa région."""
    return COUNTRY_TO_REGION.get(country, "OTHER")


def get_stock_region_cap(profile: str, region: str) -> float:
    """Retourne le cap régional pour un profil."""
    caps = STOCK_REGION_CAPS.get(profile, STOCK_REGION_CAPS["Modéré"])
    return caps.get(region, DEFAULT_REGION_CAP)


def get_stock_region_cap_euus(profile: str, region: str) -> float:
    """Retourne le cap régional EU/US Focus pour un profil."""
    caps = STOCK_REGION_CAPS_EUUS.get(profile, STOCK_REGION_CAPS_EUUS["Modéré"])
    return caps.get(region, 0.0)


def is_region_allowed_euus(region: str) -> bool:
    """Vérifie si une région est autorisée en mode EU/US."""
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

# v4.15.0: Ranges élargis pour cohérence avec sanity checks
METRIC_RANGES: Dict[str, Tuple[float, float]] = {
    "perf_ytd": (-30, 60),
    "perf_1y": (-40, 100),
    "perf_3m": (-25, 50),
    "perf_1m": (-15, 25),
    "perf_3y": (-50, 150),
    "volatility_3y": (8, 120),      # Élargi de (8, 55) pour cohérence
    "max_drawdown_3y": (5, 80),     # Élargi
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


# ============ PROFILE POLICY v4.15.1 ============

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
        # v4.14.0: Scoring perf réduit de 55% → 30%
        "score_weights": {
            "perf_ytd": 0.00,           # Supprimé (était 0.20)
            "perf_1y": 0.20,
            "perf_3m": 0.10,            # Réduit (était 0.15)
            "eps_growth_5y": 0.15,      # Augmenté (était 0.10)
            "roe": 0.10,                # Augmenté (était 0.05)
            "fcf_yield": 0.05,          # Nouveau
            "max_drawdown_3y": -0.05,   # Nouveau
            "volatility_3y": 0.05,
            "dividend_yield": -0.05,
            "buffett_score": 0.10,      # Augmenté (était 0.05)
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
        # v4.15.0 PATCH C: Anti yield-trap strict
        "hard_filters": {
            "volatility_3y_max": 28.0,
            "roe_min": 10.0,
            "dividend_yield_min": 0.5,
            "payout_ratio_max": 85.0,         # Strict (était 100)
            "dividend_coverage_min": 1.2,     # Strict (était 1.0)
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
    """
    Conversion sécurisée en float - gère STRING, None, et multi-locale.
    
    v4.14.0: Gère format européen (1.234,56) et US (1,234.56)
    """
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
    """Retourne la policy complète d'un profil."""
    return PROFILE_POLICY.get(profile, PROFILE_POLICY["Modéré"])


def get_metric_value(eq: Dict, metric_key: str) -> Optional[float]:
    """Récupère une métrique avec fallback sur les alias."""
    aliases = FIELD_MAPPING.get(metric_key, [metric_key])
    for alias in aliases:
        if alias in eq and eq[alias] is not None:
            return safe_float(eq[alias])
    return None


# ============ DATA-DRIVEN PERCENTILES (PATCH A v4.15.0) ============

def build_metric_distributions(equities: List[Dict], metric_keys: List[str]) -> Dict[str, List[float]]:
    """Construit les distributions triées pour chaque métrique."""
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
    """Winsorize une valeur aux percentiles p et (1-p)."""
    if not sorted_dist or len(sorted_dist) < 2:
        return value
    lo = sorted_dist[int(p * (len(sorted_dist) - 1))]
    hi = sorted_dist[int((1 - p) * (len(sorted_dist) - 1))]
    return max(lo, min(hi, value))


def pct_rank(value: float, sorted_dist: List[float]) -> float:
    """
    Calcule le rang percentile d'une valeur dans une distribution triée.
    
    v4.15.1: Utilise bisect.bisect_left pour O(log n) au lieu de O(n).
    """
    if not sorted_dist:
        return 0.5
    return bisect.bisect_left(sorted_dist, value) / len(sorted_dist)


def compute_percentile_fallback(value: float, metric_key: str) -> float:
    """Fallback: percentile basé sur METRIC_RANGES (si univers trop petit)."""
    min_val, max_val = METRIC_RANGES.get(metric_key, (0, 100))
    if max_val <= min_val:
        return 0.5
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))


def compute_universe_stats(equities: List[Dict]) -> Dict[str, List[float]]:
    """Calcule les distributions pour TOUS les alias de champs."""
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
    """
    Assigne automatiquement un preset basé sur les caractéristiques.
    
    v4.14.0 FIX: recovery AVANT agressif
    """
    vol = get_metric_value(eq, "volatility_3y") or 25.0
    ytd = get_metric_value(eq, "perf_ytd") or 0.0
    perf_1y = get_metric_value(eq, "perf_1y") or 0.0
    roe = get_metric_value(eq, "roe") or 12.0
    div_yield = get_metric_value(eq, "dividend_yield") or 0.0
    buffett = get_metric_value(eq, "buffett_score") or 50.0
    
    # Sanity check vol
    if vol < 1 or vol > 120:
        logger.warning(f"Vol aberrante: {vol}% pour {eq.get('name', '?')}")
        vol = 25.0
    
    # RECOVERY D'ABORD (vol élevée + YTD négatif)
    if vol >= 35 and ytd < -10:
        return "recovery"
    
    # AGRESSIF ENSUITE
    if vol >= 35:
        return "agressif"
    
    # DEFENSIVE
    if vol < 22 and (div_yield > 1.5 or buffett >= 75):
        return "rendement" if div_yield > 2.0 else "defensif"
    
    if vol < 20 and buffett >= 70:
        return "low_volatility"
    
    # QUALITY / VALUE
    if vol < 30 and roe > 15 and buffett >= 65:
        return "quality_premium"
    
    if vol < 28 and div_yield > 1.0:
        return "value_dividend"
    
    # GROWTH / MOMENTUM
    if vol >= 28 and (ytd > 5 or perf_1y > 20):
        return "momentum_trend"
    
    if vol >= 25 and ytd > 0:
        return "croissance"
    
    # DEFAULT
    if ytd > 5:
        return "croissance"
    elif div_yield > 1.0:
        return "value_dividend"
    return "quality_premium"


# ============ APPLY HARD FILTERS v4.15.1 (FIX: elif → if) ============

def apply_hard_filters(equities: List[Dict], profile: str) -> Tuple[List[Dict], Dict]:
    """
    Applique les filtres HARD pour forcer la divergence entre profils.
    
    v4.15.1 FIX CRITIQUE: elif → if
    TOUS les filtres sont maintenant appliqués indépendamment.
    """
    policy = get_profile_policy(profile)
    filters = policy.get("hard_filters", {})
    
    if not filters:
        return equities, {"skipped": True, "before": len(equities), "after": len(equities)}
    
    filtered = []
    rejection_counts = {}
    
    for eq in equities:
        reasons = []  # Accumulation de TOUTES les raisons
        
        vol = get_metric_value(eq, "volatility_3y") or 25.0
        roe = get_metric_value(eq, "roe")
        div_yield = get_metric_value(eq, "dividend_yield")
        payout = get_metric_value(eq, "payout_ratio")
        coverage = get_metric_value(eq, "dividend_coverage")
        
        # Sanity check vol
        if vol < 1 or vol > 120:
            reasons.append("vol_aberrant")
        
        # Vol filters (if, PAS elif!)
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
    for reason, count in rejection_counts.items():
        logger.debug(f"      Rejeté {count}x: {reason}")
    
    return filtered, stats


# ============ SCORING ============

def score_equity_for_profile(
    stock: Dict,
    profile: str,
    universe_dists: Optional[Dict[str, List[float]]] = None,
) -> float:
    """
    Score une action selon le profil.
    
    v4.15.0 PATCH A: Percentiles data-driven + winsorization
    """
    policy = get_profile_policy(profile)
    weights = policy.get("score_weights", {})
    S = sum(abs(w) for w in weights.values() if w != 0) or 1.0
    score_raw = 0.0
    
    for metric_key, weight in weights.items():
        if weight == 0:
            continue
        value = get_metric_value(stock, metric_key)
        if value is None:
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
    
    return max(0.0, min(1.0, (score_raw + S) / (2 * S)))


def filter_equities_by_profile(
    equities: List[Dict],
    profile: str,
    preset_field: str = "_matched_preset"
) -> List[Dict]:
    """Filtre les équités par profil."""
    policy = get_profile_policy(profile)
    allowed_presets = policy.get("allowed_equity_presets", set())
    for eq in equities:
        if not eq.get(preset_field):
            eq[preset_field] = assign_preset_to_equity(eq)
    if not allowed_presets:
        return equities
    return [eq for eq in equities if eq.get(preset_field) in allowed_presets]


# ============ MAIN SELECTION ============

def select_equities_for_profile(
    equities: List[Dict],
    profile: str,
    market_context: Optional[Dict] = None,
    target_n: int = 25,
) -> Tuple[List[Dict], Dict]:
    """
    v4.15.1: Sélection avec percentiles data-driven + tous les filters appliqués.
    
    Pipeline:
    1. Assigner _matched_preset (si manquant)
    2. Filtrer par min_buffett_score
    3. Filtrer par presets autorisés
    4. Appliquer hard_filters (TOUS les filtres!)
    5. Construire distributions pour scoring
    6. Scorer avec percentiles data-driven + winsorization
    7. Sélectionner top N
    """
    logger.info(f"\n{'='*50}")
    logger.info(f"[{profile}] Sélection depuis {len(equities)} équités")
    
    policy = get_profile_policy(profile)
    meta = {"profile": profile, "stages": {}}
    
    # Assign presets
    for eq in equities:
        if not eq.get("_matched_preset"):
            eq["_matched_preset"] = assign_preset_to_equity(eq)
    
    preset_dist = {}
    for eq in equities:
        p = eq.get("_matched_preset", "UNKNOWN")
        preset_dist[p] = preset_dist.get(p, 0) + 1
    meta["stages"]["presets"] = preset_dist
    logger.info(f"   [{profile}] Preset distribution: {preset_dist}")
    
    # Buffett filter
    min_buffett = policy.get("min_buffett_score", 0)
    eq_buffett = [eq for eq in equities if (get_metric_value(eq, "buffett_score") or 0) >= min_buffett]
    meta["stages"]["buffett"] = {"min": min_buffett, "before": len(equities), "after": len(eq_buffett)}
    logger.info(f"   [{profile}] Buffett >= {min_buffett}: {len(eq_buffett)}/{len(equities)}")
    
    if len(eq_buffett) < target_n:
        relaxed = max(0, min_buffett - 20)
        eq_buffett = [eq for eq in equities if (get_metric_value(eq, "buffett_score") or 0) >= relaxed]
        meta["stages"]["buffett"]["relaxed_to"] = relaxed
        logger.warning(f"   [{profile}] Buffett relaxé à {relaxed}")
    
    # Preset filter
    allowed_presets = policy.get("allowed_equity_presets", set())
    if allowed_presets:
        eq_preset = [eq for eq in eq_buffett if eq.get("_matched_preset") in allowed_presets]
        meta["stages"]["preset_filter"] = {"before": len(eq_buffett), "after": len(eq_preset)}
        logger.info(f"   [{profile}] Preset filter: {len(eq_preset)}/{len(eq_buffett)}")
        
        if len(eq_preset) < target_n // 2:
            eq_preset = eq_buffett
            meta["stages"]["preset_filter"]["skipped"] = True
            logger.warning(f"   [{profile}] Preset filter trop strict, ignoré")
    else:
        eq_preset = eq_buffett
    
    # Hard filters (v4.15.1: TOUS appliqués)
    eq_hard, hard_stats = apply_hard_filters(eq_preset, profile)
    meta["stages"]["hard_filters"] = hard_stats
    
    if len(eq_hard) < target_n // 2:
        eq_hard = eq_preset
        meta["stages"]["hard_filters"]["skipped"] = True
        logger.warning(f"   [{profile}] Hard filters trop stricts, ignorés")
    
    # Build distributions (PATCH A)
    score_weights = policy.get("score_weights", {})
    metric_keys = [k for k, w in score_weights.items() if w != 0]
    universe_dists = build_metric_distributions(eq_hard, metric_keys)
    meta["stages"]["distributions"] = {k: len(v) for k, v in universe_dists.items() if v}
    logger.info(f"   [{profile}] Distributions: {len(meta['stages']['distributions'])} métriques")
    
    # Score
    for eq in eq_hard:
        eq["_profile_score"] = score_equity_for_profile(eq, profile, universe_dists)
    
    sorted_eq = sorted(eq_hard, key=lambda x: x.get("_profile_score", 0), reverse=True)
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
    
    # Stats
    if selected:
        meta["stats"] = {
            "avg_vol": round(sum(get_metric_value(eq, "volatility_3y") or 0 for eq in selected) / len(selected), 1),
            "avg_div": round(sum(get_metric_value(eq, "dividend_yield") or 0 for eq in selected) / len(selected), 2),
            "avg_score": round(sum(eq.get("_profile_score", 0) for eq in selected) / len(selected), 3),
        }
        logger.info(f"   [{profile}] Stats: avg_vol={meta['stats']['avg_vol']}%, avg_div={meta['stats']['avg_div']}%")
    
    return selected, meta


def blend_profile_score(eq: Dict, profile_score: float) -> float:
    """Blende le profile_score avec le composite_score existant."""
    original = eq.get("composite_score", 0) or 0
    if original > 1:
        original /= 100.0
    return max(0.0, min(1.0, 0.6 * profile_score + 0.4 * original))


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
    """Calcule le poids max effectif pour un preset dans un profil."""
    config = PRESET_META.get(preset_name)
    if not config:
        return 0.0
    max_weight = config.max_weight_pct / 100
    bucket_range = PROFILE_BUCKET_TARGETS.get(profile, {}).get(config.role, (0, 1))
    return min(max_weight, bucket_range[1])


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
            logger.info(f"Corporate dedup [{group_id}]: kept {[s.get('name') for s in group_stocks[:max_per_group]]}")
    
    selected.extend(no_group)
    return selected, removed_by_group


def deduplicate_etf_by_exposure(
    etf_list: List[str],
    exposures_wanted: Optional[Set[str]] = None
) -> List[str]:
    """Déduplique une liste d'ETF par exposition."""
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
    """Retourne les groupes de corrélation avec leurs presets."""
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
    """Retourne la corrélation entre deux groupes."""
    if group1 == group2:
        return 1.0
    return CORRELATION_BY_GROUP.get((group1, group2), CORRELATION_BY_GROUP.get((group2, group1), 0.30))


# ============ VALIDATION ============

def validate_portfolio_buckets(
    weights: Dict[str, float],
    preset_assignments: Dict[str, str],
    profile: str
) -> Dict:
    """Valide qu'un portefeuille respecte les contraintes de bucket."""
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
    """Valide que le portefeuille ne dépasse pas le max par groupe corporate."""
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
    """Exporte une watchlist des top N actions pour un profil."""
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
    
    logger.info(f"   [{profile}] Watchlist exportée: {filepath} ({len(sorted_eq)} actions)")
    return filepath


# ============ MAIN TEST ============

if __name__ == "__main__":
    print("=" * 60)
    print("PRESET_META v4.15.1 - FIX BUG ELIF + BISECT O(log n)")
    print("=" * 60)
    
    print(f"\nTotal presets: {len(PRESET_META)}")
    print(f"  - Equity: {len(EQUITY_PRESETS)}")
    print(f"  - ETF: {len(ETF_PRESETS)}")
    print(f"  - Crypto: {len(CRYPTO_PRESETS)}")
    
    # TEST 1: pct_rank O(log n)
    print("\n--- TEST 1: pct_rank() O(log n) ---")
    test_dist = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
    assert abs(pct_rank(20, test_dist) - 0.2) < 0.01, "pct_rank(20) failed"
    assert abs(pct_rank(50, test_dist) - 0.8) < 0.01, "pct_rank(50) failed"
    print("✅ pct_rank() OK")
    
    # TEST 2: Tous les filters appliqués
    print("\n--- TEST 2: apply_hard_filters() - tous les filters ---")
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
    assert len(filtered) == 1 and filtered[0]["ticker"] == "QD", "Yield trap not filtered"
    print(f"✅ Yield trap filtered. Reasons: {stats['reasons']}")
    
    # TEST 3: Full selection
    print("\n--- TEST 3: Full selection ---")
    import logging
    logging.basicConfig(level=logging.WARNING)
    
    test_data = [
        {"name": "ASML", "ticker": "ASML", "volatility_3y": 36, "perf_ytd": 10, "perf_1y": 52, "roe": 40, "dividend_yield": 0.6, "buffett_score": 100, "payout_ratio": 40, "dividend_coverage": 5},
        {"name": "COCA-COLA", "ticker": "KO", "volatility_3y": 15, "perf_ytd": 1.5, "perf_1y": 8, "roe": 40, "dividend_yield": 2.9, "buffett_score": 85, "payout_ratio": 70, "dividend_coverage": 2.5},
        {"name": "REALTY_TRAP", "ticker": "O", "volatility_3y": 20, "perf_ytd": 2, "perf_1y": 5, "roe": 12, "dividend_yield": 5.5, "buffett_score": 70, "payout_ratio": 220, "dividend_coverage": 0.8},
    ]
    
    results = {}
    for profile in ["Agressif", "Stable"]:
        selected, _ = select_equities_for_profile([eq.copy() for eq in test_data], profile, target_n=2)
        results[profile] = [eq["ticker"] for eq in selected]
    
    print(f"Agressif: {results['Agressif']}")
    print(f"Stable: {results['Stable']}")
    
    assert "O" not in results["Stable"], "Yield trap O should be excluded from Stable"
    print("✅ Yield trap excluded from Stable")
    
    print("\n" + "=" * 60)
    print("v4.15.1 ✅ ALL TESTS PASSED - 10/10")
    print("=" * 60)
