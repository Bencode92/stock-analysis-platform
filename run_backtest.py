#!/usr/bin/env python3
"""
Script d'exécution du backtest Portfolio Engine v4.

Usage:
    python run_backtest.py                    # Les 3 profils
    python run_backtest.py --profile Agressif # Un seul profil
    python run_backtest.py --days 180 --freq W
"""

import os
import sys
import argparse
import logging
from datetime import datetime, timedelta
from typing import Dict, List
import yaml
import json

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("run_backtest")


def load_config(config_path: str = "config/portfolio_config.yaml") -> dict:
    """Charge la configuration."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def run_single_backtest(prices, profile: str, config: dict, args) -> dict:
    """Exécute un backtest pour un profil donné."""
    from backtest import BacktestConfig, run_backtest
    from backtest.engine import print_backtest_report
    
    end_date = datetime.now().strftime("%Y-%m-%d")
    backtest_start = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
    
    backtest_config = BacktestConfig(
        profile=profile,
        start_date=backtest_start,
        end_date=end_date,
        rebalance_freq=args.freq,
        transaction_cost_bp=config.get("backtest", {}).get("transaction_cost_bp", 10),
        turnover_penalty=config.get("backtest", {}).get("turnover_penalty", 0.001),
    )
    
    profile_config = config.get("profiles", {}).get(profile, {})
    
    logger.info(f"\n{'='*60}")
    logger.info(f"⚙️  Running backtest: {profile}")
    logger.info(f"{'='*60}")
    
    try:
        result = run_backtest(prices, backtest_config, profile_config)
        print_backtest_report(result)
        
        return {
            "profile": profile,
            "success": True,
            "stats": result.stats,
            "equity_curve": {
                str(k.date()): round(v, 2)
                for k, v in result.equity_curve.items()
            },
            "trades": result.trades.to_dict(orient="records") if len(result.trades) > 0 else [],
        }
    except Exception as e:
        logger.error(f"❌ Backtest failed for {profile}: {e}")
        import traceback
        traceback.print_exc()
        return {
            "profile": profile,
            "success": False,
            "error": str(e),
        }


def print_comparison_table(results: List[dict]):
    """Affiche un tableau comparatif des 3 profils."""
    print("\n" + "="*80)
    print("📊 COMPARAISON DES 3 PROFILS")
    print("="*80)
    
    # Header
    print(f"\n{'Métrique':<25} | {'Agressif':>15} | {'Modéré':>15} | {'Stable':>15}")
    print("-"*80)
    
    metrics = [
        ("Total Return", "total_return_pct", "%"),
        ("CAGR", "cagr_pct", "%"),
        ("Volatility", "volatility_pct", "%"),
        ("Sharpe Ratio", "sharpe_ratio", ""),
        ("Max Drawdown", "max_drawdown_pct", "%"),
        ("Turnover (annuel)", "turnover_annualized_pct", "%"),
        ("Win Rate", "win_rate_pct", "%"),
    ]
    
    # Organiser par profil
    by_profile = {r["profile"]: r.get("stats", {}) for r in results if r.get("success")}
    
    for label, key, suffix in metrics:
        agg = by_profile.get("Agressif", {}).get(key, "N/A")
        mod = by_profile.get("Modéré", {}).get(key, "N/A")
        stb = by_profile.get("Stable", {}).get(key, "N/A")
        
        agg_str = f"{agg}{suffix}" if isinstance(agg, (int, float)) else str(agg)
        mod_str = f"{mod}{suffix}" if isinstance(mod, (int, float)) else str(mod)
        stb_str = f"{stb}{suffix}" if isinstance(stb, (int, float)) else str(stb)
        
        print(f"{label:<25} | {agg_str:>15} | {mod_str:>15} | {stb_str:>15}")
    
    print("="*80)
    
    # Verdict
    print("\n🏆 VERDICT:")
    
    sharpes = [(r["profile"], r["stats"].get("sharpe_ratio", -999)) 
               for r in results if r.get("success")]
    if sharpes:
        best = max(sharpes, key=lambda x: x[1])
        print(f"   Meilleur Sharpe: {best[0]} ({best[1]:.2f})")
    
    returns = [(r["profile"], r["stats"].get("total_return_pct", -999)) 
               for r in results if r.get("success")]
    if returns:
        best = max(returns, key=lambda x: x[1])
        print(f"   Meilleur Return: {best[0]} ({best[1]:.2f}%)")
    
    dds = [(r["profile"], r["stats"].get("max_drawdown_pct", -999)) 
           for r in results if r.get("success")]
    if dds:
        best = max(dds, key=lambda x: x[1])  # Le moins négatif
        print(f"   Meilleur Drawdown: {best[0]} ({best[1]:.2f}%)")
    
    print()


def main():
    parser = argparse.ArgumentParser(description="Run Portfolio Engine v4 Backtest")
    parser.add_argument("--profile", default=None, choices=["Agressif", "Modéré", "Stable", "all"],
                        help="Risk profile (default: all 3 profiles)")
    parser.add_argument("--freq", default="M", choices=["D", "W", "M"],
                        help="Rebalance frequency: D=daily, W=weekly, M=monthly")
    parser.add_argument("--days", type=int, default=90,
                        help="Backtest period in days")
    parser.add_argument("--config", default="config/portfolio_config.yaml",
                        help="Path to config file")
    parser.add_argument("--output", default="backtest_results.json",
                        help="Output file for results")
    
    args = parser.parse_args()
    
    # Déterminer les profils à tester
    if args.profile is None or args.profile == "all":
        profiles = ["Agressif", "Modéré", "Stable"]
    else:
        profiles = [args.profile]
    
    logger.info("="*60)
    logger.info("🚀 Portfolio Engine v4 - Backtest")
    logger.info("="*60)
    logger.info(f"Profiles: {', '.join(profiles)}")
    logger.info(f"Frequency: {args.freq}")
    logger.info(f"Period: {args.days} days")
    
    # Vérifier la clé API
    api_key = os.environ.get("TWELVE_DATA_API")
    if not api_key:
        logger.error("❌ TWELVE_DATA_API environment variable not set")
        logger.info("Set it with: export TWELVE_DATA_API=your_api_key")
        sys.exit(1)
    
    # Charger la config
    try:
        config = load_config(args.config)
        logger.info(f"✅ Config loaded from {args.config}")
    except FileNotFoundError:
        logger.error(f"❌ Config file not found: {args.config}")
        sys.exit(1)
    
    # Importer les modules backtest
    try:
        from backtest import load_prices_for_backtest
    except ImportError as e:
        logger.error(f"❌ Import error: {e}")
        logger.info("Make sure you're running from the project root")
        sys.exit(1)
    
    # Dates du backtest
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=args.days + 30)).strftime("%Y-%m-%d")
    
    # Charger les prix UNE SEULE FOIS (partagé entre les 3 profils)
    logger.info("\n📥 Loading price data from Twelve Data...")
    logger.info("   (This may take a few minutes due to API rate limits)")
    
    try:
        prices = load_prices_for_backtest(
            config,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key
        )
        logger.info(f"✅ Loaded {len(prices.columns)} symbols, {len(prices)} days")
    except Exception as e:
        logger.error(f"❌ Failed to load prices: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Exécuter les backtests
    results = []
    for profile in profiles:
        result = run_single_backtest(prices, profile, config, args)
        results.append(result)
    
    # Afficher la comparaison si plusieurs profils
    if len(profiles) > 1:
        print_comparison_table(results)
    
    # Sauvegarder les résultats
    output_data = {
        "meta": {
            "timestamp": datetime.now().isoformat(),
            "frequency": args.freq,
            "days": args.days,
            "start_date": (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d"),
            "end_date": end_date,
            "symbols_count": len(prices.columns),
        },
        "results": results,
        "comparison": {
            profile: r.get("stats", {})
            for r in results
            for profile in [r["profile"]]
            if r.get("success")
        }
    }
    
    with open(args.output, "w") as f:
        json.dump(output_data, f, indent=2, default=str)
    
    logger.info(f"\n✅ Results saved to {args.output}")
    logger.info("="*60)
    
    # Return code basé sur le succès
    failed = [r for r in results if not r.get("success")]
    if failed:
        logger.warning(f"⚠️  {len(failed)} profile(s) failed")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
