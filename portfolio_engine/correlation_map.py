"""
correlation_map.py — Exposure-based correlation model for structured covariance.

Maps ETF exposures (from etf_exposure.py) and stock sectors into ~12 families,
then provides calibrated inter-family correlations.

Source: eigenvalue_analysis.py + covariance_benchmark_full.py (175 tickers, 251 days)
Calibration date: March 2025

Usage:
    from portfolio_engine.correlation_map import get_exposure_correlation
    corr = get_exposure_correlation("sp500", "bonds_treasury")  # -> 0.05
"""

from typing import Optional

# ═══════════════════════════════════════════════════════════════════
# EXPOSURE → FAMILY MAPPING
# ═══════════════════════════════════════════════════════════════════

EXPOSURE_FAMILY = {
    # US Equity Large
    "sp500": "us_equity_large",
    "nasdaq100": "sector_tech",
    "nasdaq_composite": "us_equity_large",
    "russell1000": "us_equity_large",
    "us_large_cap": "us_equity_large",
    "us_total_market": "us_equity_large",
    "us_equity": "us_equity_large",
    "dow30": "us_equity_large",

    # US Equity Style (value/growth sub-indices)
    "sp500_value": "factor_value",
    "sp500_growth": "factor_growth",
    "dividend_growth": "factor_dividend",
    "dividend_intl": "factor_dividend",

    # US Equity Small/Mid
    "russell2000": "us_equity_small",
    "us_small_cap": "us_equity_small",
    "us_mid_cap": "us_equity_mid",
    "small_cap": "us_equity_small",
    "mid_cap": "us_equity_mid",

    # International Equity
    "europe": "intl_equity",
    "japan": "intl_equity",
    "developed_markets": "intl_equity",
    "eafe": "intl_equity",
    "international": "intl_equity",
    "acwi": "intl_equity",
    "msci_world": "intl_equity",
    "global_equity": "intl_equity",

    # Emerging Markets
    "emerging_markets": "em_equity",
    "china": "em_equity",
    "india": "em_equity",
    "south_korea": "em_equity",
    "brazil": "em_equity",
    "latin_america": "em_equity",
    "taiwan": "em_equity",

    # Sectors (equity)
    "tech": "sector_tech",
    "semiconductor": "sector_tech",
    "energy": "sector_energy",
    "healthcare": "sector_healthcare",
    "biotech": "sector_healthcare",
    "pharma": "sector_healthcare",
    "financials": "sector_financials",
    "reits": "sector_reits",
    "utilities": "sector_utilities",
    "consumer_discretionary": "sector_consumer",
    "consumer_staples": "sector_consumer",
    "industrials": "sector_industrials",
    "materials": "sector_materials",
    "communications": "sector_communications",

    # Bonds — fine-grained (v7.2.1)
    "bonds_treasury": "bonds_gov",
    "bonds_short_treasury": "bonds_short",   # VGSH, SCHO (1-3Y Treasury)
    "bonds_tbill": "bonds_short",            # SGOV, GBIL, CLTL (0-1Y)
    "bonds_intermediate_treasury": "bonds_gov",  # IEF, VGIT
    "bonds_long_treasury": "bonds_gov",      # TLT, EDV
    "bonds_ig": "bonds_credit",
    "bonds_intermediate_corp": "bonds_credit",  # VCIT, IGIB, SPIB
    "bonds_short_corp": "bonds_credit",      # VCSH
    "bonds_hy": "bonds_credit",
    "bonds_muni": "bonds_gov",
    "bonds_mbs": "bonds_credit",
    "bonds_short": "bonds_short",
    "bonds_intermediate": "bonds_credit",    # BIV, GVI (mixed govt+corp)
    "bonds_global": "bonds_credit",
    "bonds_core": "bonds_credit",            # BND, AGG
    "bonds_tips": "bonds_gov",               # STIP, TIP (inflation-linked)
    "bonds_clo_aaa": "bonds_short",          # PAAA, JAAA (ultra-short credit)
    "bonds_ultra_short": "bonds_short",      # PULS, MINT, JPST
    "bonds_floating": "bonds_short",         # FLOT
    "bonds_treasury_inverse": "bonds_gov",   # Fix regex false positive

    # Gold / Precious Metals
    "gold_physical": "gold",
    "gold_miners": "gold",
    "silver_physical": "precious_metals",
    "silver_miners": "precious_metals",
    "precious_metals": "precious_metals",

    # Commodities
    "commodities": "commodities",
    "copper": "commodities",
    "uranium": "commodities",

    # Crypto
    "btc_etf": "crypto",
    "eth_etf": "crypto",
    "crypto_equity": "crypto",

    # Strategies / Factors
    "dividend": "factor_dividend",
    "value": "factor_value",
    "growth": "factor_growth",
    "momentum": "factor_momentum",
    "quality": "factor_quality",
    "min_vol": "factor_min_vol",
    "esg": "factor_esg",
    "covered_call": "derivatives",
    "derivative_income": "derivatives",
    "buffer": "derivatives",
    "leveraged_2x_bull": "leveraged",
    "leveraged_3x_bull": "leveraged",
    "inverse": "leveraged",
}

# Stock sector → family (for actions without ETF exposure)
SECTOR_TO_FAMILY = {
    "Technology": "sector_tech",
    "Technologie de l'information": "sector_tech",
    "Tech": "sector_tech",
    "Healthcare": "sector_healthcare",
    "Health Care": "sector_healthcare",
    "Health": "sector_healthcare",
    "Santé": "sector_healthcare",
    "Finance": "sector_financials",
    "Financials": "sector_financials",
    "Energy": "sector_energy",
    "Énergie": "sector_energy",
    "Consumer Discretionary": "sector_consumer",
    "Consommation discrétionnaire": "sector_consumer",
    "ConsDisc": "sector_consumer",
    "Consumer Staples": "sector_consumer",
    "Consommation de base": "sector_consumer",
    "ConsStaples": "sector_consumer",
    "Industrials": "sector_industrials",
    "Industrie": "sector_industrials",
    "Industrial": "sector_industrials",
    "Materials": "sector_materials",
    "Matériaux": "sector_materials",
    "Utilities": "sector_utilities",
    "Services publics": "sector_utilities",
    "Real Estate": "sector_reits",
    "Immobilier": "sector_reits",
    "RealEstate": "sector_reits",
    "Communication Services": "sector_communications",
    "Services de communication": "sector_communications",
    "Comms": "sector_communications",
}

# ═══════════════════════════════════════════════════════════════════
# INTER-FAMILY CORRELATIONS
# Calibrated on 175 tickers, 251 days (March 2025)
# ═══════════════════════════════════════════════════════════════════

FAMILY_CORRELATION = {
    # Intra-equity developed
    ("us_equity_large", "us_equity_small"): 0.80,
    ("us_equity_large", "us_equity_mid"): 0.88,
    ("us_equity_large", "intl_equity"): 0.72,
    ("us_equity_large", "em_equity"): 0.55,
    ("us_equity_small", "us_equity_mid"): 0.85,
    ("intl_equity", "em_equity"): 0.62,

    # Sector vs market
    ("us_equity_large", "sector_tech"): 0.85,
    ("us_equity_large", "sector_healthcare"): 0.70,
    ("us_equity_large", "sector_financials"): 0.78,
    ("us_equity_large", "sector_energy"): 0.55,
    ("us_equity_large", "sector_utilities"): 0.45,
    ("us_equity_large", "sector_reits"): 0.60,
    ("us_equity_large", "sector_consumer"): 0.80,
    ("us_equity_large", "sector_industrials"): 0.82,
    ("us_equity_large", "sector_materials"): 0.70,
    ("us_equity_large", "sector_communications"): 0.78,

    # Cross-sector
    ("sector_tech", "sector_healthcare"): 0.45,
    ("sector_tech", "sector_energy"): 0.25,
    ("sector_tech", "sector_financials"): 0.55,
    ("sector_tech", "sector_utilities"): 0.15,
    ("sector_tech", "sector_consumer"): 0.60,
    ("sector_tech", "sector_industrials"): 0.55,
    ("sector_tech", "sector_materials"): 0.40,
    ("sector_tech", "sector_communications"): 0.65,
    ("sector_tech", "sector_reits"): 0.30,
    ("sector_energy", "sector_utilities"): 0.35,
    ("sector_energy", "sector_materials"): 0.60,
    ("sector_energy", "sector_industrials"): 0.50,
    ("sector_healthcare", "sector_consumer"): 0.50,
    ("sector_healthcare", "sector_financials"): 0.40,
    ("sector_financials", "sector_reits"): 0.55,
    ("sector_utilities", "sector_reits"): 0.45,
    ("sector_industrials", "sector_materials"): 0.65,
    ("sector_consumer", "sector_communications"): 0.60,

    # Equity vs Bonds (calibrated on real data)
    ("us_equity_large", "bonds_gov"): 0.05,
    ("us_equity_large", "bonds_credit"): 0.15,
    ("us_equity_large", "bonds_short"): 0.02,
    ("us_equity_small", "bonds_gov"): 0.05,
    ("us_equity_small", "bonds_credit"): 0.18,
    ("intl_equity", "bonds_gov"): 0.08,
    ("intl_equity", "bonds_credit"): 0.15,
    ("em_equity", "bonds_gov"): 0.10,
    ("em_equity", "bonds_credit"): 0.20,
    ("sector_tech", "bonds_gov"): -0.05,
    ("sector_tech", "bonds_credit"): 0.10,
    ("sector_energy", "bonds_gov"): 0.02,
    ("sector_utilities", "bonds_gov"): 0.30,
    ("sector_utilities", "bonds_credit"): 0.35,
    ("sector_reits", "bonds_gov"): 0.25,
    ("sector_reits", "bonds_credit"): 0.30,
    ("sector_financials", "bonds_gov"): 0.10,
    ("sector_financials", "bonds_credit"): 0.25,
    ("sector_healthcare", "bonds_gov"): 0.00,
    ("sector_consumer", "bonds_gov"): 0.05,
    ("sector_industrials", "bonds_gov"): 0.05,
    ("sector_materials", "bonds_gov"): 0.08,

    # Bonds intra
    ("bonds_gov", "bonds_credit"): 0.65,
    ("bonds_gov", "bonds_short"): 0.70,
    ("bonds_credit", "bonds_short"): 0.55,

    # Gold
    ("us_equity_large", "gold"): 0.15,
    ("bonds_gov", "gold"): 0.04,
    ("bonds_credit", "gold"): 0.08,
    ("bonds_short", "gold"): 0.02,
    ("em_equity", "gold"): 0.20,
    ("intl_equity", "gold"): 0.18,
    ("gold", "precious_metals"): 0.85,
    ("gold", "commodities"): 0.45,
    ("precious_metals", "commodities"): 0.50,
    ("sector_energy", "gold"): 0.20,
    ("sector_materials", "gold"): 0.30,

    # Crypto
    ("us_equity_large", "crypto"): 0.30,
    ("sector_tech", "crypto"): 0.35,
    ("gold", "crypto"): 0.10,
    ("bonds_gov", "crypto"): -0.10,
    ("bonds_credit", "crypto"): -0.05,
    ("em_equity", "crypto"): 0.25,

    # Factor strategies vs market
    ("us_equity_large", "factor_dividend"): 0.82,
    ("us_equity_large", "factor_value"): 0.85,
    ("us_equity_large", "factor_growth"): 0.90,
    ("us_equity_large", "factor_momentum"): 0.80,
    ("us_equity_large", "factor_min_vol"): 0.75,
    ("us_equity_large", "factor_quality"): 0.88,
    ("us_equity_large", "factor_esg"): 0.92,
    ("factor_growth", "factor_value"): 0.65,
    ("factor_dividend", "factor_value"): 0.80,
    ("factor_growth", "factor_momentum"): 0.85,
    ("factor_min_vol", "factor_dividend"): 0.72,
    ("factor_quality", "factor_growth"): 0.82,

    # Factor vs bonds
    ("factor_dividend", "bonds_gov"): 0.15,
    ("factor_dividend", "bonds_credit"): 0.20,
    ("factor_min_vol", "bonds_gov"): 0.20,
    ("factor_min_vol", "bonds_credit"): 0.25,
    ("factor_value", "bonds_gov"): 0.10,
    ("factor_value", "bonds_credit"): 0.15,
    ("factor_growth", "bonds_gov"): -0.02,
    ("factor_growth", "bonds_credit"): 0.08,
    ("factor_quality", "bonds_gov"): 0.05,
    ("factor_quality", "bonds_credit"): 0.12,
}

# Default correlation for unmatched families (conservative)
_DEFAULT_CROSS = 0.20
# Same-family but different exposure (e.g., sp500 vs russell1000)
_DEFAULT_SAME_FAMILY = 0.90


# ═══════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════

def get_family(exposure: str) -> Optional[str]:
    """Return the family for an exposure, or None if unknown."""
    return EXPOSURE_FAMILY.get(exposure)


def get_sector_family(sector: str) -> Optional[str]:
    """Return the family for a stock sector."""
    return SECTOR_TO_FAMILY.get(sector)


def get_family_correlation(family1: str, family2: str) -> float:
    """Return correlation between two families."""
    if family1 == family2:
        return _DEFAULT_SAME_FAMILY

    pair = (family1, family2)
    rev = (family2, family1)
    return FAMILY_CORRELATION.get(pair, FAMILY_CORRELATION.get(rev, _DEFAULT_CROSS))


def get_exposure_correlation(exposure1: str, exposure2: str) -> float:
    """
    Correlation between two exposures (3 tiers):
      1. Same exposure → 0.95
      2. Same family → 0.90
      3. Cross-family → lookup or 0.20
    """
    if exposure1 == exposure2:
        return 0.95

    f1 = EXPOSURE_FAMILY.get(exposure1)
    f2 = EXPOSURE_FAMILY.get(exposure2)

    if f1 is None or f2 is None:
        return _DEFAULT_CROSS

    return get_family_correlation(f1, f2)
