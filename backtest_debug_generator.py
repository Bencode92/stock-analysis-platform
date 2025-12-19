#!/usr/bin/env python3
"""
backtest_debug_generator.py - Génère un fichier de debug détaillé pour le backtest

Ce module s'intègre dans generate_portfolios_v4.py pour produire un fichier
backtest_debug.json contenant les vrais prix, dates et calculs pour chaque actif.

V4.9.1 - Backtest Debug Generator

Usage:
    Appelé automatiquement par generate_portfolios_v4.py après le backtest

Output:
    data/backtest_debug.json
"""

import json
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional, Any
import logging
import os

logger = logging.getLogger("backtest.debug")


# ============= ASSET TYPE CLASSIFICATION =============

BOND_ETF_PATTERNS = [
    "TIP", "BND", "AGG", "SHV", "SHY", "IEF", "TLT", "LQD", 
    "VCSH", "VCIT", "VGSH", "VGIT", "BSV", "BIV", "SGOV", 
    "TBIL", "STIP", "VTIP", "GOVT", "JMST", "XHLF", "MUB",
    "HYG", "JNK", "EMB", "BNDX", "IAGG", "BWX"
]

BENCHMARK_SYMBOLS = ["QQQ", "URTH", "AGG", "SPY", "IWM", "EFA", "VTI", "DIA", "IVV"]

CRYPTO_SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT", "AVAX", "MATIC"]

ETF_PATTERNS = [
    "ETF", "WCLD", "CTA", "UUP", "RDVI", "TAIL", "VIG", 
    "SCHD", "JEPI", "JEPQ", "XL", "IW", "VO", "VB",
    "VEA", "VWO", "IEMG", "VNQ", "VNQI"
]


def classify_asset_type(ticker: str) -> str:
    """
    Classifie un ticker par type d'actif basé sur les patterns connus.
    
    Returns:
        str: "Action", "ETF", "Bond_ETF", "Crypto", ou "Benchmark"
    """
    if not ticker:
        return "Unknown"
    
    ticker_upper = ticker.upper().strip()
    
    # Benchmarks
    if ticker_upper in BENCHMARK_SYMBOLS:
        return "Benchmark"
    
    # Crypto
    if ticker_upper in CRYPTO_SYMBOLS:
        return "Crypto"
    
    # Bond ETFs
    for pattern in BOND_ETF_PATTERNS:
        if pattern in ticker_upper:
            return "Bond_ETF"
    
    # ETFs
    for pattern in ETF_PATTERNS:
        if pattern in ticker_upper:
            return "ETF"
    
    # Par défaut = Action
    return "Action"


def generate_backtest_debug(
    prices: pd.DataFrame,
    portfolio_weights: Dict[str, Dict[str, float]],
    backtest_results: Dict,
    output_path: str = "data/backtest_debug.json",
    n_sample_days: int = 5,
) -> Dict:
    """
    Génère un fichier JSON de debug avec les vrais prix et calculs.
    
    Args:
        prices: DataFrame des prix (colonnes = tickers, index = dates)
        portfolio_weights: Dict {profile: {ticker: weight}}
        backtest_results: Résultats du backtest
        output_path: Chemin du fichier de sortie
        n_sample_days: Nombre de jours à inclure en échantillon
    
    Returns:
        Dict avec toutes les données de debug
    """
    logger.info(f"📊 Génération du fichier de debug backtest...")
    
    # Collecter tous les tickers uniques
    all_tickers = set()
    for profile, weights in portfolio_weights.items():
        all_tickers.update(weights.keys())
    
    # Ajouter les benchmarks
    all_tickers.update(BENCHMARK_SYMBOLS[:4])  # QQQ, URTH, AGG, SPY
    
    # Dates disponibles
    dates = prices.index.sort_values()
    if len(dates) == 0:
        logger.error("Pas de dates disponibles dans les prix")
        return {}
    
    start_date = dates[0]
    end_date = dates[-1]
    n_days = len(dates)
    
    # Sélectionner des dates d'échantillon (début, quarts, fin)
    sample_indices = [0, n_days // 4, n_days // 2, 3 * n_days // 4, n_days - 1]
    sample_indices = sorted(set([min(max(i, 0), n_days - 1) for i in sample_indices]))
    sample_dates = [dates[i] for i in sample_indices]
    
    # Structure de debug
    debug_data = {
        "_meta": {
            "generated_at": datetime.now().isoformat(),
            "purpose": "Vérification des prix et calculs du backtest",
            "version": "v4.9.1",
            "data_source": "Twelve Data API",
            "price_field": "close (adjusted)",
            "return_formula": "(close_J / close_J-1) - 1",
        },
        
        "period": {
            "start_date": _format_date(start_date),
            "end_date": _format_date(end_date),
            "n_trading_days": n_days,
            "sample_dates": [_format_date(d) for d in sample_dates],
        },
        
        "data_coverage": {
            "total_tickers_requested": len(all_tickers),
            "tickers_with_data": len([t for t in all_tickers if t in prices.columns]),
            "tickers_missing": sorted([t for t in all_tickers if t not in prices.columns]),
        },
        
        "assets_by_type": {
            "Action": [],
            "ETF": [],
            "Bond_ETF": [],
            "Crypto": [],
            "Benchmark": [],
        },
        
        "asset_details": {},
        
        "daily_calculations": [],
        
        "calculation_examples": [],
        
        "profiles_summary": {},
    }
    
    # Analyser chaque ticker
    for ticker in sorted(all_tickers):
        if ticker not in prices.columns:
            continue
        
        asset_type = classify_asset_type(ticker)
        debug_data["assets_by_type"][asset_type].append(ticker)
        
        # Extraire les prix
        ticker_prices = prices[ticker].dropna()
        
        if len(ticker_prices) < 2:
            continue
        
        # Calculer les rendements
        returns = ticker_prices.pct_change().dropna()
        
        # Échantillons de prix avec calculs détaillés
        price_samples = []
        for date in sample_dates:
            if date in ticker_prices.index:
                price = float(ticker_prices.loc[date])
                
                # Rendement vs jour précédent
                date_idx = ticker_prices.index.get_loc(date)
                if date_idx > 0:
                    prev_date = ticker_prices.index[date_idx - 1]
                    prev_price = float(ticker_prices.iloc[date_idx - 1])
                    daily_return = (price / prev_price - 1) * 100
                    formula = f"({price:.4f} / {prev_price:.4f}) - 1"
                else:
                    prev_date = None
                    prev_price = None
                    daily_return = None
                    formula = None
                
                price_samples.append({
                    "date": _format_date(date),
                    "close": round(price, 4),
                    "prev_date": _format_date(prev_date) if prev_date else None,
                    "prev_close": round(prev_price, 4) if prev_price else None,
                    "daily_return_pct": round(daily_return, 4) if daily_return is not None else None,
                    "formula": formula,
                })
        
        # Poids par profil
        weights_in_profiles = {}
        for profile, weights in portfolio_weights.items():
            if ticker in weights:
                weights_in_profiles[profile] = round(weights[ticker] * 100, 2)
        
        # Statistiques sur la période
        total_return = (float(ticker_prices.iloc[-1]) / float(ticker_prices.iloc[0]) - 1) * 100
        volatility = float(returns.std() * (252 ** 0.5) * 100) if len(returns) > 1 else 0
        
        asset_detail = {
            "ticker": ticker,
            "type": asset_type,
            "n_days_data": len(ticker_prices),
            "first_date": _format_date(ticker_prices.index[0]),
            "last_date": _format_date(ticker_prices.index[-1]),
            "first_price": round(float(ticker_prices.iloc[0]), 4),
            "last_price": round(float(ticker_prices.iloc[-1]), 4),
            "total_return_pct": round(total_return, 2),
            "volatility_annual_pct": round(volatility, 2),
            "weights_by_profile": weights_in_profiles,
            "price_samples": price_samples,
            "is_benchmark": asset_type == "Benchmark",
        }
        
        debug_data["asset_details"][ticker] = asset_detail
    
    # Générer des exemples de calcul pour chaque type
    _add_calculation_examples(debug_data, prices, portfolio_weights, sample_dates)
    
    # Ajouter un exemple de calcul journalier complet pour un profil
    _add_daily_calculation_example(debug_data, prices, portfolio_weights, dates)
    
    # Résumé par profil
    for profile, weights in portfolio_weights.items():
        n_assets = len(weights)
        total_weight = sum(weights.values())
        
        # Répartition par type
        type_weights = {"Action": 0, "ETF": 0, "Bond_ETF": 0, "Crypto": 0}
        for ticker, weight in weights.items():
            asset_type = classify_asset_type(ticker)
            if asset_type in type_weights:
                type_weights[asset_type] += weight
        
        debug_data["profiles_summary"][profile] = {
            "n_assets": n_assets,
            "total_weight_pct": round(total_weight * 100, 2),
            "allocation_by_type": {k: round(v * 100, 2) for k, v in type_weights.items()},
            "top_5_holdings": sorted(
                [(t, round(w * 100, 2)) for t, w in weights.items()],
                key=lambda x: -x[1]
            )[:5],
        }
    
    # Ajouter les résultats du backtest si disponibles
    if backtest_results and "results" in backtest_results:
        debug_data["backtest_results_summary"] = {}
        for result in backtest_results.get("results", []):
            if result.get("success"):
                profile = result.get("profile")
                stats = result.get("stats", {})
                debug_data["backtest_results_summary"][profile] = {
                    "gross_return_pct": stats.get("gross_return_pct"),
                    "net_return_pct": stats.get("net_return_pct"),
                    "volatility_pct": stats.get("volatility_pct"),
                    "max_drawdown_pct": stats.get("max_drawdown_pct"),
                    "benchmark_symbol": stats.get("benchmark_symbol"),
                    "benchmark_return_pct": stats.get("benchmark_return_pct"),
                    "excess_return_pct": stats.get("excess_return_pct"),
                }
    
    # Ajouter la preuve d'uniformité
    debug_data["uniformity_proof"] = {
        "same_api_for_all": True,
        "same_price_field": "close (adjusted)",
        "same_return_formula": "(P_J / P_J-1) - 1",
        "no_type_differentiation": True,
        "ter_handling": "embedded_in_etf_prices_not_deducted",
        "dividends": "included_in_adjusted_prices",
    }
    
    # Sauvegarder
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(debug_data, f, ensure_ascii=False, indent=2, default=str)
    
    logger.info(f"✅ Fichier de debug généré: {output_path}")
    logger.info(f"   - {len(debug_data['asset_details'])} actifs documentés")
    logger.info(f"   - Types: Action={len(debug_data['assets_by_type']['Action'])}, "
                f"ETF={len(debug_data['assets_by_type']['ETF'])}, "
                f"Bond_ETF={len(debug_data['assets_by_type']['Bond_ETF'])}, "
                f"Benchmark={len(debug_data['assets_by_type']['Benchmark'])}")
    
    return debug_data


def _format_date(date) -> Optional[str]:
    """Formate une date en string."""
    if date is None:
        return None
    if hasattr(date, 'date'):
        return str(date.date())
    return str(date)


def _add_calculation_examples(debug_data: Dict, prices: pd.DataFrame, 
                               portfolio_weights: Dict, sample_dates: List):
    """
    Ajoute des exemples de calcul pour chaque type d'actif.
    """
    examples_added = set()
    
    for asset_type in ["Action", "ETF", "Bond_ETF", "Benchmark"]:
        tickers_of_type = debug_data["assets_by_type"].get(asset_type, [])
        
        if not tickers_of_type:
            continue
        
        # Trouver un ticker avec des données
        for ticker in tickers_of_type:
            if ticker in examples_added:
                continue
                
            detail = debug_data["asset_details"].get(ticker)
            if not detail:
                continue
                
            samples = detail.get("price_samples", [])
            
            # Trouver un échantillon avec rendement calculé
            for sample in samples:
                if sample.get("daily_return_pct") is not None:
                    # Chercher le poids dans un profil
                    weight_example = 0
                    for profile, weights in portfolio_weights.items():
                        if ticker in weights:
                            weight_example = weights[ticker] * 100
                            break
                    
                    example = {
                        "asset_type": asset_type,
                        "ticker": ticker,
                        "date": sample["date"],
                        "prev_date": sample["prev_date"],
                        "close_J": sample["close"],
                        "close_J_minus_1": sample["prev_close"],
                        "formula": sample["formula"],
                        "daily_return_pct": sample["daily_return_pct"],
                        "weight_pct": round(weight_example, 2),
                        "contribution_pct": round(
                            sample["daily_return_pct"] * weight_example / 100, 4
                        ) if weight_example > 0 else None,
                        "explanation": f"Le {sample['date']}, {ticker} ({asset_type}) "
                                       f"a clôturé à {sample['close']} vs {sample['prev_close']} "
                                       f"le {sample['prev_date']}, soit un rendement de "
                                       f"{sample['daily_return_pct']:.2f}%"
                    }
                    debug_data["calculation_examples"].append(example)
                    examples_added.add(ticker)
                    break
            
            # Un seul exemple par type
            if ticker in examples_added:
                break


def _add_daily_calculation_example(debug_data: Dict, prices: pd.DataFrame,
                                    portfolio_weights: Dict, dates: pd.DatetimeIndex):
    """
    Ajoute un exemple complet de calcul de rendement journalier pour un profil.
    """
    if len(dates) < 2:
        return
    
    # Prendre le dernier jour disponible
    date = dates[-1]
    prev_date = dates[-2]
    
    # Utiliser le profil Agressif comme exemple
    profile = "Agressif"
    weights = portfolio_weights.get(profile, {})
    
    if not weights:
        profile = list(portfolio_weights.keys())[0] if portfolio_weights else None
        weights = portfolio_weights.get(profile, {})
    
    if not weights:
        return
    
    daily_calc = {
        "date": _format_date(date),
        "prev_date": _format_date(prev_date),
        "profile": profile,
        "assets": [],
        "total_portfolio_return_pct": 0,
    }
    
    total_return = 0
    
    for ticker, weight in sorted(weights.items(), key=lambda x: -x[1])[:10]:
        if ticker not in prices.columns:
            continue
        
        try:
            price_today = float(prices.loc[date, ticker])
            price_prev = float(prices.loc[prev_date, ticker])
            
            if price_today > 0 and price_prev > 0:
                asset_return = (price_today / price_prev - 1) * 100
                contribution = weight * asset_return
                total_return += contribution
                
                daily_calc["assets"].append({
                    "ticker": ticker,
                    "type": classify_asset_type(ticker),
                    "weight_pct": round(weight * 100, 2),
                    "price_prev": round(price_prev, 4),
                    "price_today": round(price_today, 4),
                    "return_pct": round(asset_return, 4),
                    "contribution_pct": round(contribution, 4),
                })
        except (KeyError, TypeError):
            continue
    
    daily_calc["total_portfolio_return_pct"] = round(total_return, 4)
    daily_calc["formula_explanation"] = "Σ (weight_i × return_i) pour tous les actifs"
    
    debug_data["daily_calculations"].append(daily_calc)


def print_debug_summary(debug_data: Dict):
    """Affiche un résumé du fichier de debug."""
    print("\n" + "=" * 70)
    print("📊 BACKTEST DEBUG SUMMARY")
    print("=" * 70)
    
    print(f"\n📅 Période: {debug_data['period']['start_date']} → {debug_data['period']['end_date']}")
    print(f"   {debug_data['period']['n_trading_days']} jours de trading")
    
    print(f"\n📈 Couverture données:")
    print(f"   Demandés: {debug_data['data_coverage']['total_tickers_requested']}")
    print(f"   Disponibles: {debug_data['data_coverage']['tickers_with_data']}")
    missing = debug_data['data_coverage']['tickers_missing']
    if missing:
        print(f"   ⚠️ Manquants: {missing[:5]}{'...' if len(missing) > 5 else ''}")
    
    print(f"\n🏷️ Répartition par type:")
    for asset_type, tickers in debug_data['assets_by_type'].items():
        if tickers:
            sample = ', '.join(tickers[:3])
            more = f'...(+{len(tickers)-3})' if len(tickers) > 3 else ''
            print(f"   {asset_type}: {len(tickers)} [{sample}{more}]")
    
    print(f"\n📐 Exemples de calcul:")
    for ex in debug_data.get('calculation_examples', [])[:4]:
        print(f"   {ex['asset_type']:10} | {ex['ticker']:8} | {ex['date']} | "
              f"Return: {ex['daily_return_pct']:+.2f}%")
    
    if debug_data.get('daily_calculations'):
        dc = debug_data['daily_calculations'][0]
        print(f"\n📊 Exemple calcul portefeuille ({dc['profile']}) le {dc['date']}:")
        for asset in dc['assets'][:5]:
            print(f"   {asset['ticker']:8} ({asset['type']:8}) "
                  f"| {asset['weight_pct']:5.1f}% × {asset['return_pct']:+6.2f}% "
                  f"= {asset['contribution_pct']:+6.4f}%")
        print(f"   {'TOTAL':8} {'':10} | {dc['total_portfolio_return_pct']:+6.4f}%")
    
    print("\n" + "=" * 70)
