"""
=========================================
Portfolio Stress Test v1.0
=========================================

Estime le drawdown du portefeuille sous 5 scénarios historiques.
Utilise des betas approximatifs par exposure/catégorie.
Tourne APRÈS la génération des portefeuilles.

Scénarios:
  1. GFC 2008 (Lehman): equity -50%, HY -26%, IG -8%, gold +5%, treasury +10%
  2. COVID 2020 (Mars): equity -34%, HY -20%, IG -12%, gold -3%, treasury +5%, CLO -5%
  3. Rate Shock 2022: equity -25%, HY -15%, IG -17%, gold -3%, treasury -15%, TIPS -10%
  4. Oil Spike (Hormuz): energy +20%, equity ex-energy -15%, gold +10%, EM -20%
  5. Correlation Spike: tout corrélé à 0.9, equity -20%, bonds -5%, gold -5%, crypto -40%

Usage:
    from stress_test import run_stress_test
    results = run_stress_test(portfolio_data, profile)
    
    # Ou en standalone:
    python stress_test.py data/portfolio_agressif.json Agressif
"""

import json
import logging
import os
from typing import Dict, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger("portfolio_engine.stress_test")

VERSION = "1.0.0"

# =============================================================================
# STRESS SCENARIOS — historical approximations
# =============================================================================

STRESS_SCENARIOS = {
    "gfc_2008": {
        "name": "GFC 2008 (Lehman Sept-Nov)",
        "description": "Crise financière systémique. Corrélations convergent vers 1.",
        "asset_shocks": {
            # Equity by sector
            "equity_default":    -0.50,
            "equity_energy":     -0.55,
            "equity_financials": -0.65,
            "equity_tech":       -0.45,
            "equity_healthcare": -0.30,
            "equity_staples":    -0.20,
            "equity_utilities":  -0.25,
            "equity_materials":  -0.50,
            "equity_defense":    -0.25,
            "equity_reits":      -0.60,
            # ETF categories
            "etf_dividend":      -0.40,
            "etf_value":         -0.45,
            "etf_growth":        -0.55,
            "etf_small_cap":     -0.55,
            "etf_emerging":      -0.55,
            "etf_international": -0.45,
            "etf_semiconductor": -0.50,
            "etf_biotech":       -0.35,
            # Bonds
            "bond_treasury":     +0.10,
            "bond_tips":         +0.02,
            "bond_ig":           -0.08,
            "bond_hy":           -0.26,
            "bond_clo":          -0.15,
            "bond_em":           -0.20,
            # Commodities
            "gold":              +0.05,
            "silver":            -0.25,
            "silver_miners":     -0.55,
            "gold_miners":       -0.40,
            "rare_earth":        -0.50,
            "energy_commodity":  -0.55,
            # Crypto
            "crypto":            -0.70,  # N'existait pas mais approximation
            # Cash
            "cash":              0.00,
        },
    },
    "covid_2020": {
        "name": "COVID Mars 2020 (2 semaines)",
        "description": "Choc exogène rapide. Flight to quality puis recovery V-shape.",
        "asset_shocks": {
            "equity_default":    -0.34,
            "equity_energy":     -0.50,
            "equity_financials": -0.40,
            "equity_tech":       -0.28,
            "equity_healthcare": -0.20,
            "equity_staples":    -0.18,
            "equity_utilities":  -0.30,
            "equity_materials":  -0.35,
            "equity_defense":    -0.25,
            "equity_reits":      -0.35,
            "etf_dividend":      -0.30,
            "etf_value":         -0.35,
            "etf_growth":        -0.30,
            "etf_small_cap":     -0.40,
            "etf_emerging":      -0.35,
            "etf_international": -0.30,
            "etf_semiconductor": -0.25,
            "etf_biotech":       -0.20,
            "bond_treasury":     +0.05,
            "bond_tips":         -0.02,
            "bond_ig":           -0.12,
            "bond_hy":           -0.20,
            "bond_clo":          -0.05,
            "bond_em":           -0.15,
            "gold":              -0.03,
            "silver":            -0.20,
            "silver_miners":     -0.45,
            "gold_miners":       -0.30,
            "rare_earth":        -0.35,
            "energy_commodity":  -0.60,
            "crypto":            -0.40,
            "cash":              0.00,
        },
    },
    "rate_shock_2022": {
        "name": "Rate Shock 2022 (Fed hiking cycle)",
        "description": "Hausse taux rapide. Bonds et equity chutent ensemble. 60/40 échoue.",
        "asset_shocks": {
            "equity_default":    -0.25,
            "equity_energy":     +0.30,  # Energy a surperformé en 2022
            "equity_financials": -0.20,
            "equity_tech":       -0.35,
            "equity_healthcare": -0.10,
            "equity_staples":    -0.05,
            "equity_utilities":  -0.05,
            "equity_materials":  -0.15,
            "equity_defense":    +0.10,
            "equity_reits":      -0.30,
            "etf_dividend":      -0.10,
            "etf_value":         -0.08,
            "etf_growth":        -0.35,
            "etf_small_cap":     -0.25,
            "etf_emerging":      -0.25,
            "etf_international": -0.20,
            "etf_semiconductor": -0.40,
            "etf_biotech":       -0.30,
            "bond_treasury":     -0.15,
            "bond_tips":         -0.10,
            "bond_ig":           -0.17,
            "bond_hy":           -0.15,
            "bond_clo":          -0.05,
            "bond_em":           -0.20,
            "gold":              -0.03,
            "silver":            -0.15,
            "silver_miners":     -0.30,
            "gold_miners":       -0.15,
            "rare_earth":        -0.20,
            "energy_commodity":  +0.25,
            "crypto":            -0.65,
            "cash":              0.00,
        },
    },
    "oil_spike_hormuz": {
        "name": "Oil Spike (Hormuz closure 30 days)",
        "description": "Pétrole >$150, inflation importée, EM importateurs en crise.",
        "asset_shocks": {
            "equity_default":    -0.15,
            "equity_energy":     +0.20,
            "equity_financials": -0.10,
            "equity_tech":       -0.20,
            "equity_healthcare": -0.05,
            "equity_staples":    -0.08,
            "equity_utilities":  -0.05,
            "equity_materials":  +0.05,
            "equity_defense":    +0.15,
            "equity_reits":      -0.15,
            "etf_dividend":      -0.10,
            "etf_value":         -0.08,
            "etf_growth":        -0.20,
            "etf_small_cap":     -0.15,
            "etf_emerging":      -0.25,
            "etf_international": -0.15,
            "etf_semiconductor": -0.15,
            "etf_biotech":       -0.05,
            "bond_treasury":     +0.03,
            "bond_tips":         +0.05,
            "bond_ig":           -0.03,
            "bond_hy":           -0.08,
            "bond_clo":          -0.03,
            "bond_em":           -0.15,
            "gold":              +0.10,
            "silver":            +0.05,
            "silver_miners":     +0.02,
            "gold_miners":       +0.08,
            "rare_earth":        -0.10,
            "energy_commodity":  +0.30,
            "crypto":            -0.15,
            "cash":              0.00,
        },
    },
    "correlation_spike": {
        "name": "Correlation Spike (systematic deleveraging)",
        "description": "Tous les actifs corrélés. Margin calls, forced selling. Pire scénario diversification.",
        "asset_shocks": {
            "equity_default":    -0.20,
            "equity_energy":     -0.18,
            "equity_financials": -0.22,
            "equity_tech":       -0.22,
            "equity_healthcare": -0.15,
            "equity_staples":    -0.12,
            "equity_utilities":  -0.10,
            "equity_materials":  -0.20,
            "equity_defense":    -0.15,
            "equity_reits":      -0.22,
            "etf_dividend":      -0.15,
            "etf_value":         -0.18,
            "etf_growth":        -0.22,
            "etf_small_cap":     -0.25,
            "etf_emerging":      -0.25,
            "etf_international": -0.20,
            "etf_semiconductor": -0.25,
            "etf_biotech":       -0.18,
            "bond_treasury":     -0.05,
            "bond_tips":         -0.05,
            "bond_ig":           -0.08,
            "bond_hy":           -0.15,
            "bond_clo":          -0.10,
            "bond_em":           -0.15,
            "gold":              -0.05,
            "silver":            -0.15,
            "silver_miners":     -0.30,
            "gold_miners":       -0.20,
            "rare_earth":        -0.25,
            "energy_commodity":  -0.15,
            "crypto":            -0.40,
            "cash":              0.00,
        },
    },
}

# =============================================================================
# TICKER → STRESS CATEGORY MAPPING
# =============================================================================

# Maps ticker/exposure to stress scenario category
TICKER_TO_STRESS_CAT = {
    # Actions by sector (common tickers)
    "NVDA": "equity_tech", "MU": "equity_tech", "VRT": "equity_tech",
    "SOXX": "etf_semiconductor", "SMH": "etf_semiconductor",
    "HAL": "equity_energy", "XLE": "etf_dividend",  # XLE = energy ETF but treat as equity energy
    "XOM": "equity_energy", "CVX": "equity_energy", "DVN": "equity_energy",
    "HWM": "equity_defense", "GD": "equity_defense", "LMT": "equity_defense",
    "ERF": "equity_healthcare", "IPN": "equity_healthcare",
    "JNJ": "equity_healthcare", "NOVN": "equity_healthcare",
    "PG": "equity_staples", "KO": "equity_staples",
    "VICI": "equity_reits",
    "CF": "equity_materials", "RIO": "equity_materials",
    "AGS": "equity_financials",
    
    # ETFs
    "GLD": "gold", "IAU": "gold", "GLDM": "gold", "SGOL": "gold",
    "SLV": "silver", "SIVR": "silver",
    "SLVP": "silver_miners", "SIL": "silver_miners",
    "GDX": "gold_miners", "GDXJ": "gold_miners",
    "REMX": "rare_earth",
    "XBI": "etf_biotech", "IBB": "etf_biotech",
    "XLV": "equity_healthcare",
    "SCHD": "etf_dividend", "HDV": "etf_dividend", "VIG": "etf_dividend",
    "SCHY": "etf_international",
    "VSS": "etf_small_cap",
    "FLKR": "etf_emerging", "EWY": "etf_emerging",
    "IUSV": "etf_value", "SPYV": "etf_value",
    "XLU": "equity_utilities",
    
    # Bonds
    "VGSH": "bond_treasury", "SCHO": "bond_treasury", "SHY": "bond_treasury",
    "SGOV": "bond_treasury", "BIL": "bond_treasury", "CLTL": "bond_treasury",
    "BSV": "bond_ig",  # BSV has ~25% corporate IG
    "STIP": "bond_tips", "TIP": "bond_tips",
    "PAAA": "bond_clo", "JAAA": "bond_clo",
    "LQD": "bond_ig", "VCSH": "bond_ig", "IGSB": "bond_ig",
    "HYG": "bond_hy", "JNK": "bond_hy", "USHY": "bond_hy",
    "EMHC": "bond_em", "EMB": "bond_em",
    
    # Crypto
    "BTC/USD": "crypto", "ETH/USD": "crypto",
}


def _get_stress_category(ticker: str, meta: Dict = None) -> str:
    """Map a ticker to its stress scenario category."""
    tk_upper = ticker.upper().replace(" ", "")
    
    # Direct lookup
    if tk_upper in TICKER_TO_STRESS_CAT:
        return TICKER_TO_STRESS_CAT[tk_upper]
    
    # Try from meta category
    if meta:
        cat = meta.get("category", "").lower()
        if cat == "obligations":
            return "bond_ig"  # Default bond
        elif cat == "crypto":
            return "crypto"
        elif cat == "cash":
            return "cash"
    
    # Default: equity
    return "equity_default"


# =============================================================================
# STRESS TEST ENGINE
# =============================================================================

def run_stress_test(
    tickers: Dict[str, float],
    meta: Dict[str, Dict],
    profile: str,
    cash_pct: float = 0.0,
) -> Dict:
    """
    Run 5 stress scenarios on a portfolio.
    
    Args:
        tickers: {ticker: weight} dict (weights sum to ~1.0 excluding cash)
        meta: {ticker: {category, name, ...}} dict
        profile: "Agressif", "Modéré", or "Stable"
        cash_pct: cash tactical percentage (0-20)
    
    Returns:
        Dict with scenario results, worst case, and risk metrics
    """
    results = {
        "version": VERSION,
        "profile": profile,
        "timestamp": datetime.now().isoformat(),
        "n_positions": len(tickers),
        "cash_pct": cash_pct,
        "scenarios": {},
    }
    
    # Adjust weights for cash
    cash_frac = cash_pct / 100.0
    adj_factor = 1.0 - cash_frac
    
    worst_dd = 0.0
    worst_scenario = ""
    
    for scenario_id, scenario in STRESS_SCENARIOS.items():
        shocks = scenario["asset_shocks"]
        
        portfolio_dd = 0.0
        position_details = []
        
        for tk, weight in tickers.items():
            if tk.startswith("_"):
                continue
            
            adj_weight = weight * adj_factor
            stress_cat = _get_stress_category(tk, meta.get(tk))
            shock = shocks.get(stress_cat, shocks.get("equity_default", -0.20))
            
            position_impact = adj_weight * shock
            portfolio_dd += position_impact
            
            position_details.append({
                "ticker": tk,
                "weight": round(adj_weight * 100, 1),
                "stress_cat": stress_cat,
                "shock": round(shock * 100, 1),
                "impact": round(position_impact * 100, 2),
            })
        
        # Sort by impact (worst first)
        position_details.sort(key=lambda x: x["impact"])
        
        portfolio_dd_pct = round(portfolio_dd * 100, 2)
        
        results["scenarios"][scenario_id] = {
            "name": scenario["name"],
            "description": scenario["description"],
            "portfolio_drawdown_pct": portfolio_dd_pct,
            "top_5_losers": position_details[:5],
            "top_3_winners": position_details[-3:] if len(position_details) > 3 else [],
        }
        
        if portfolio_dd_pct < worst_dd:
            worst_dd = portfolio_dd_pct
            worst_scenario = scenario_id
    
    results["worst_case"] = {
        "scenario": worst_scenario,
        "drawdown_pct": worst_dd,
        "name": STRESS_SCENARIOS[worst_scenario]["name"],
    }
    
    # Risk assessment
    _THRESHOLDS = {
        "Agressif": {"acceptable": -30, "warning": -40, "critical": -50},
        "Modéré":   {"acceptable": -20, "warning": -28, "critical": -35},
        "Stable":   {"acceptable": -12, "warning": -18, "critical": -25},
    }
    
    thresholds = _THRESHOLDS.get(profile, _THRESHOLDS["Modéré"])
    
    if worst_dd >= thresholds["acceptable"]:
        risk_level = "✅ ACCEPTABLE"
    elif worst_dd >= thresholds["warning"]:
        risk_level = "⚠️ WARNING"
    else:
        risk_level = "🔴 CRITICAL"
    
    results["risk_assessment"] = {
        "level": risk_level,
        "worst_drawdown": worst_dd,
        "thresholds": thresholds,
        "recommendation": _generate_recommendation(results, profile, thresholds),
    }
    
    return results


def _generate_recommendation(results: Dict, profile: str, thresholds: Dict) -> str:
    """Generate human-readable recommendation based on stress results."""
    worst = results["worst_case"]
    dd = worst["drawdown_pct"]
    
    if dd >= thresholds["acceptable"]:
        return f"Portfolio {profile} résiste au worst case ({worst['name']}: {dd:.1f}%). Aucune action requise."
    
    # Find the biggest contributors to the worst scenario
    worst_scenario = results["scenarios"][worst["scenario"]]
    top_losers = worst_scenario["top_5_losers"][:3]
    losers_str = ", ".join(f"{l['ticker']} ({l['impact']:.1f}%)" for l in top_losers)
    
    if dd >= thresholds["warning"]:
        return (
            f"Portfolio {profile} sous stress ({worst['name']}: {dd:.1f}%). "
            f"Principaux contributeurs: {losers_str}. "
            f"Considérer réduction de concentration."
        )
    
    return (
        f"Portfolio {profile} CRITIQUE sous stress ({worst['name']}: {dd:.1f}%). "
        f"Contributeurs: {losers_str}. "
        f"Rebalancing recommandé AVANT mise en production."
    )


# =============================================================================
# INTEGRATION WITH PIPELINE
# =============================================================================

def stress_test_from_portfolio_json(portfolio_data: Dict, profile: str) -> Dict:
    """
    Run stress test from the portfolio JSON output of generate_portfolios_v4.py.
    
    Args:
        portfolio_data: The profile dict from portfolios.json (with Actions, ETF, Obligations, Crypto)
        profile: "Agressif", "Modéré", or "Stable"
    """
    tickers = {}
    meta = {}
    
    categories = {
        "Actions": "Actions",
        "ETF": "ETF",
        "Obligations": "Obligations",
        "Crypto": "Crypto",
    }
    
    for cat_key, cat_name in categories.items():
        for name_str, weight_str in portfolio_data.get(cat_key, {}).items():
            # Extract ticker from name: "NVIDIA CORP (NVDA)" → "NVDA"
            ticker = name_str
            if "(" in name_str and ")" in name_str:
                ticker = name_str.split("(")[-1].split(")")[0]
            
            # Parse weight: "5.3%" → 0.053
            weight = float(str(weight_str).replace("%", "")) / 100.0
            
            tickers[ticker] = weight
            meta[ticker] = {"category": cat_name, "name": name_str}
    
    cash_pct = portfolio_data.get("_cash_tactical", {}).get("pct", 0)
    
    return run_stress_test(tickers, meta, profile, cash_pct)


def run_all_profiles(portfolios: Dict) -> Dict:
    """Run stress test on all 3 profiles."""
    results = {}
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile in portfolios:
            results[profile] = stress_test_from_portfolio_json(portfolios[profile], profile)
            logger.info(
                f"[STRESS] {profile}: worst case = "
                f"{results[profile]['worst_case']['drawdown_pct']:.1f}% "
                f"({results[profile]['worst_case']['name']}) — "
                f"{results[profile]['risk_assessment']['level']}"
            )
    return results


def save_stress_report(results: Dict, path: str = "data/stress_test_report.json"):
    """Save stress test results to JSON."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    logger.info(f"[STRESS] Report saved to {path}")


# =============================================================================
# DISPLAY
# =============================================================================

def print_stress_summary(results: Dict):
    """Print a human-readable stress test summary."""
    print("\n" + "=" * 70)
    print("STRESS TEST REPORT")
    print("=" * 70)
    
    for profile, data in results.items():
        print(f"\n{'─' * 50}")
        print(f"  {profile} ({data['n_positions']} positions, cash {data['cash_pct']:.1f}%)")
        print(f"{'─' * 50}")
        
        for sc_id, sc in data["scenarios"].items():
            dd = sc["portfolio_drawdown_pct"]
            icon = "✅" if dd > -15 else "⚠️" if dd > -25 else "🔴"
            print(f"  {icon} {sc['name']:42s} → {dd:+.1f}%")
        
        worst = data["worst_case"]
        print(f"\n  WORST CASE: {worst['name']} → {worst['drawdown_pct']:+.1f}%")
        print(f"  RISK: {data['risk_assessment']['level']}")
        print(f"  → {data['risk_assessment']['recommendation']}")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import sys
    
    logging.basicConfig(level=logging.INFO)
    
    if len(sys.argv) > 1:
        # Load from file
        with open(sys.argv[1], "r") as f:
            portfolios = json.load(f)
        results = run_all_profiles(portfolios)
    else:
        # Test with sample data
        print("Usage: python stress_test.py <portfolios.json>")
        print("\nRunning with sample Agressif portfolio...\n")
        
        sample = {
            "Agressif": {
                "Actions": {
                    "NVIDIA CORP (NVDA)": "5.3%",
                    "MICRON TECHNOLOGY INC (MU)": "7.6%",
                    "IPSEN SA (IPN)": "8.0%",
                    "HALLIBURTON (HAL)": "8.5%",
                    "VERTIV HOLDINGS CLASS A (VRT)": "3.2%",
                    "HOWMET AEROSPACE INC (HWM)": "6.2%",
                },
                "ETF": {
                    "Franklin FTSE South Korea ETF (FLKR)": "4.8%",
                    "VanEck Rare Earth and Strategic Metals ETF (REMX)": "8.9%",
                    "iShares Semiconductor ETF (SOXX)": "5.5%",
                    "Energy Select Sector SPDR Fund (XLE)": "2.3%",
                    "iShares MSCI Global Silver Miners ETF (SLVP)": "4.9%",
                    "iShares Silver Trust (SLV)": "7.4%",
                    "SPDR Gold Shares (GLD)": "9.9%",
                    "SPDR S&P Biotech ETF (XBI)": "3.3%",
                },
                "Obligations": {
                    "PGIM AAA CLO ETF (PAAA)": "12.0%",
                },
                "Crypto": {
                    "BTC/USD": "2.2%",
                },
                "_cash_tactical": {"pct": 5.0},
            },
        }
        
        results = run_all_profiles(sample)
    
    print_stress_summary(results)
    save_stress_report(results)
