#!/usr/bin/env python3
"""
Script d'exécution du backtest Portfolio Engine v4.

Usage:
    python run_backtest.py
    python run_backtest.py --profile Agressif --freq W
    python run_backtest.py --days 180
"""

import os
import sys
import argparse
import logging
from datetime import datetime, timedelta
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


def main():
    parser = argparse.ArgumentParser(description="Run Portfolio Engine v4 Backtest")
    parser.add_argument("--profile", default="Modéré", choices=["Agressif", "Modéré", "Stable"],
                        help="Risk profile")
    parser.add_argument("--freq", default="M", choices=["D", "W", "M"],
                        help="Rebalance frequency: D=daily, W=weekly, M=monthly")
    parser.add_argument("--days", type=int, default=90,
                        help="Backtest period in days")
    parser.add_argument("--config", default="config/portfolio_config.yaml",
                        help="Path to config file")
    parser.add_argument("--output", default="backtest_results.json",
                        help="Output file for results")
    parser.add_argument("--no-cache", action="store_true",
                        help="Disable price caching")
    
    args = parser.parse_args()
    
    logger.info("="*60)
    logger.info("🚀 Portfolio Engine v4 - Backtest")
    logger.info("="*60)
    
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
        from backtest import BacktestConfig, run_backtest, load_prices_for_backtest
        from backtest.engine import print_backtest_report
    except ImportError as e:
        logger.error(f"❌ Import error: {e}")
        logger.info("Make sure you're running from the project root")
        sys.exit(1)
    
    # Dates du backtest
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=args.days + 30)).strftime("%Y-%m-%d")
    
    logger.info(f"Profile: {args.profile}")
    logger.info(f"Frequency: {args.freq}")
    logger.info(f"Period: {args.days} days")
    
    # Charger les prix
    logger.info("\n📥 Loading price data from Twelve Data...")
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
        sys.exit(1)
    
    # Configurer le backtest
    backtest_start = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
    
    backtest_config = BacktestConfig(
        profile=args.profile,
        start_date=backtest_start,
        end_date=end_date,
        rebalance_freq=args.freq,
        transaction_cost_bp=config.get("backtest", {}).get("transaction_cost_bp", 10),
        turnover_penalty=config.get("backtest", {}).get("turnover_penalty", 0.001),
    )
    
    profile_config = config.get("profiles", {}).get(args.profile, {})
    
    # Exécuter le backtest
    logger.info("\n⚙️  Running backtest...")
    try:
        result = run_backtest(prices, backtest_config, profile_config)
    except Exception as e:
        logger.error(f"❌ Backtest failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Afficher le rapport
    print_backtest_report(result)
    
    # Sauvegarder les résultats
    output_data = {
        "config": {
            "profile": args.profile,
            "frequency": args.freq,
            "days": args.days,
            "start_date": backtest_start,
            "end_date": end_date,
        },
        "stats": result.stats,
        "equity_curve": {
            str(k.date()): round(v, 2)
            for k, v in result.equity_curve.items()
        },
        "trades": result.trades.to_dict(orient="records") if len(result.trades) > 0 else [],
    }
    
    with open(args.output, "w") as f:
        json.dump(output_data, f, indent=2, default=str)
    
    logger.info(f"\n✅ Results saved to {args.output}")
    logger.info("="*60)
    
    # Return code basé sur la performance
    if result.stats.get("sharpe_ratio", 0) < 0:
        logger.warning("⚠️  Negative Sharpe ratio - strategy underperformed")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
