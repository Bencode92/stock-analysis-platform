# backtest/engine.py
"""
Moteur de backtest pour le Portfolio Engine v4.

Backtest sur 90 jours glissants avec:
- Rebalancing configurable (daily/weekly/monthly)
- Coûts de transaction
- Pénalité de turnover
- Métriques de performance
- Comparaison benchmark (URTH = MSCI World)
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import logging

logger = logging.getLogger("backtest.engine")


@dataclass
class BacktestConfig:
    """Configuration du backtest."""
    profile: str = "Modéré"              # Agressif, Modéré, Stable
    start_date: Optional[str] = None      # YYYY-MM-DD (défaut: 90j avant)
    end_date: Optional[str] = None        # YYYY-MM-DD (défaut: aujourd'hui)
    rebalance_freq: str = "M"             # D=daily, W=weekly, M=monthly
    transaction_cost_bp: float = 10.0     # Coût en basis points
    turnover_penalty: float = 0.001       # Pénalité turnover dans objectif
    initial_capital: float = 100000.0     # Capital initial
    benchmark_symbol: str = "URTH"        # Benchmark (MSCI World ETF)


@dataclass
class BacktestResult:
    """Résultats du backtest."""
    equity_curve: pd.Series               # Valeur du portefeuille par date
    daily_returns: pd.Series              # Rendements journaliers
    weights_history: pd.DataFrame         # Historique des poids
    trades: pd.DataFrame                  # Détail des rebalancements
    stats: Dict[str, float] = field(default_factory=dict)
    config: Optional[BacktestConfig] = None
    benchmark_curve: Optional[pd.Series] = None  # Courbe benchmark


def compute_backtest_stats(
    equity_curve: pd.Series,
    daily_returns: pd.Series,
    trades_df: pd.DataFrame,
    risk_free_rate: float = 0.0
) -> Dict[str, float]:
    """
    Calcule les statistiques de performance.
    
    Returns:
        Dict avec CAGR, volatilité, Sharpe, max drawdown, turnover, etc.
    """
    stats = {}
    
    # Période
    n_days = len(equity_curve)
    n_years = n_days / 252
    
    # Performance totale
    total_return = (equity_curve.iloc[-1] / equity_curve.iloc[0]) - 1
    stats["total_return_pct"] = round(total_return * 100, 2)
    
    # CAGR (annualisé)
    if n_years > 0:
        cagr = (1 + total_return) ** (1 / n_years) - 1
        stats["cagr_pct"] = round(cagr * 100, 2)
    else:
        stats["cagr_pct"] = stats["total_return_pct"]
    
    # Volatilité annualisée
    vol = daily_returns.std() * np.sqrt(252)
    stats["volatility_pct"] = round(vol * 100, 2)
    
    # Sharpe Ratio
    excess_return = daily_returns.mean() - (risk_free_rate / 252)
    if daily_returns.std() > 0:
        sharpe = (excess_return / daily_returns.std()) * np.sqrt(252)
        stats["sharpe_ratio"] = round(sharpe, 2)
    else:
        stats["sharpe_ratio"] = 0.0
    
    # Max Drawdown
    rolling_max = equity_curve.expanding().max()
    drawdown = (equity_curve - rolling_max) / rolling_max
    max_dd = drawdown.min()
    stats["max_drawdown_pct"] = round(max_dd * 100, 2)
    
    # Turnover
    if len(trades_df) > 0 and "turnover" in trades_df.columns:
        avg_turnover = trades_df["turnover"].mean()
        total_turnover = trades_df["turnover"].sum()
        stats["avg_turnover_per_rebal"] = round(avg_turnover * 100, 2)
        stats["total_turnover_pct"] = round(total_turnover * 100, 2)
        
        # Turnover annualisé
        n_rebal = len(trades_df)
        annualized_turnover = (total_turnover / n_years) if n_years > 0 else total_turnover
        stats["turnover_annualized_pct"] = round(annualized_turnover * 100, 2)
    
    # Nombre de trades
    stats["n_rebalances"] = len(trades_df)
    stats["n_days"] = n_days
    
    # Ratio gains/pertes
    positive_days = (daily_returns > 0).sum()
    negative_days = (daily_returns < 0).sum()
    stats["win_rate_pct"] = round(positive_days / n_days * 100, 2) if n_days > 0 else 0
    
    return stats


def compute_benchmark_stats(
    equity_curve: pd.Series,
    daily_returns: pd.Series,
    benchmark_prices: pd.Series,
    benchmark_symbol: str = "URTH"
) -> Dict[str, float]:
    """
    Calcule les statistiques relatives au benchmark.
    
    Args:
        equity_curve: Courbe de valeur du portefeuille
        daily_returns: Rendements journaliers du portefeuille
        benchmark_prices: Prix du benchmark sur la même période
        benchmark_symbol: Symbole du benchmark
    
    Returns:
        Dict avec benchmark return, excess return, information ratio, etc.
    """
    stats = {}
    
    if benchmark_prices is None or len(benchmark_prices) < 2:
        return stats
    
    # Aligner sur les mêmes dates
    common_dates = equity_curve.index.intersection(benchmark_prices.index)
    if len(common_dates) < 10:
        logger.warning(f"Not enough common dates with benchmark: {len(common_dates)}")
        return stats
    
    bench_aligned = benchmark_prices.loc[common_dates]
    equity_aligned = equity_curve.loc[common_dates]
    
    # Performance benchmark
    bench_return = (bench_aligned.iloc[-1] / bench_aligned.iloc[0] - 1) * 100
    stats["benchmark_symbol"] = benchmark_symbol
    stats["benchmark_return_pct"] = round(bench_return, 2)
    
    # Volatilité benchmark
    bench_returns = bench_aligned.pct_change().dropna()
    bench_vol = bench_returns.std() * np.sqrt(252) * 100
    stats["benchmark_volatility_pct"] = round(bench_vol, 2)
    
    # Excess return (alpha brut)
    portfolio_return = (equity_aligned.iloc[-1] / equity_aligned.iloc[0] - 1) * 100
    excess_return = portfolio_return - bench_return
    stats["excess_return_pct"] = round(excess_return, 2)
    
    # Tracking Error et Information Ratio
    port_returns = equity_aligned.pct_change().dropna()
    bench_returns_aligned = bench_aligned.pct_change().dropna()
    
    # Aligner les rendements
    common_ret_dates = port_returns.index.intersection(bench_returns_aligned.index)
    if len(common_ret_dates) > 10:
        port_ret = port_returns.loc[common_ret_dates]
        bench_ret = bench_returns_aligned.loc[common_ret_dates]
        
        # Tracking error (volatilité de la différence de rendements)
        tracking_diff = port_ret - bench_ret
        tracking_error = tracking_diff.std() * np.sqrt(252)
        stats["tracking_error_pct"] = round(tracking_error * 100, 2)
        
        # Information Ratio = Excess Return annualisé / Tracking Error
        if tracking_error > 0.001:
            # Annualiser l'excess return
            n_years = len(common_ret_dates) / 252
            if n_years > 0:
                excess_annual = excess_return / 100 / n_years  # Convertir en décimal annualisé
                info_ratio = excess_annual / tracking_error
                stats["information_ratio"] = round(info_ratio, 2)
        
        # Beta vs benchmark
        if bench_ret.var() > 0:
            covariance = port_ret.cov(bench_ret)
            beta = covariance / bench_ret.var()
            stats["beta"] = round(beta, 2)
            
            # Alpha de Jensen (rendement ajusté du risque)
            # Alpha = Rp - (Rf + Beta * (Rm - Rf))
            # Simplifié avec Rf = 0
            risk_free = 0
            expected_return = risk_free + beta * (bench_return / 100)
            alpha = (portfolio_return / 100) - expected_return
            stats["alpha_pct"] = round(alpha * 100, 2)
    
    # Capture ratio (up/down)
    up_days = bench_returns_aligned > 0
    down_days = bench_returns_aligned < 0
    
    if up_days.sum() > 5:
        port_up = port_returns.loc[common_ret_dates][up_days].mean()
        bench_up = bench_returns_aligned[up_days].mean()
        if bench_up != 0:
            stats["upside_capture_pct"] = round((port_up / bench_up) * 100, 1)
    
    if down_days.sum() > 5:
        port_down = port_returns.loc[common_ret_dates][down_days].mean()
        bench_down = bench_returns_aligned[down_days].mean()
        if bench_down != 0:
            stats["downside_capture_pct"] = round((port_down / bench_down) * 100, 1)
    
    return stats


def get_rebalance_dates(
    dates: pd.DatetimeIndex,
    freq: str = "M"
) -> pd.DatetimeIndex:
    """
    Détermine les dates de rebalancement.
    
    Args:
        dates: Toutes les dates disponibles
        freq: "D" (daily), "W" (weekly), "M" (monthly)
    
    Returns:
        Sous-ensemble des dates pour le rebalancing
    """
    if freq == "D":
        return dates
    elif freq == "W":
        # Premier jour de chaque semaine
        return dates[dates.to_series().dt.dayofweek == 0]
    elif freq == "M":
        # Premier jour de chaque mois
        monthly = dates.to_series().groupby(dates.to_period("M")).first()
        return pd.DatetimeIndex(monthly.values)
    else:
        raise ValueError(f"Unknown frequency: {freq}")


def compute_factors_from_prices(
    prices: pd.DataFrame,
    as_of_date: pd.Timestamp,
    lookback: int = 60
) -> pd.DataFrame:
    """
    Calcule les facteurs à partir des prix historiques.
    
    Args:
        prices: DataFrame des prix (colonnes = symboles)
        as_of_date: Date de calcul
        lookback: Nombre de jours pour le calcul
    
    Returns:
        DataFrame avec colonnes [symbol, momentum, low_vol, quality, liquidity, score]
    """
    # Fenêtre de calcul
    mask = prices.index <= as_of_date
    hist = prices.loc[mask].tail(lookback)
    
    if len(hist) < 20:
        raise ValueError(f"Not enough history: {len(hist)} days < 20 required")
    
    factors = []
    
    for symbol in prices.columns:
        if symbol not in hist.columns:
            continue
            
        series = hist[symbol].dropna()
        if len(series) < 20:
            continue
        
        # Rendements
        returns = series.pct_change().dropna()
        
        # Momentum (rendement sur la période)
        if len(series) >= 2:
            momentum = (series.iloc[-1] / series.iloc[0] - 1) * 100
        else:
            momentum = 0
        
        # Low Vol (inverse de la volatilité)
        vol = returns.std() * np.sqrt(252) * 100 if len(returns) > 5 else 20
        low_vol = -vol  # Score inversé: vol basse = score haut
        
        # Quality (proxy: stabilité = 1 - vol/100)
        quality = max(0, 100 - vol)
        
        # Liquidity (proxy: constante pour le moment, à améliorer)
        liquidity = 50  # Placeholder
        
        # Max Drawdown
        rolling_max = series.expanding().max()
        dd = ((series - rolling_max) / rolling_max).min() * 100
        
        factors.append({
            "symbol": symbol,
            "momentum": momentum,
            "low_vol": low_vol,
            "quality": quality,
            "liquidity": liquidity,
            "max_dd": dd,
            "vol": vol,
        })
    
    df = pd.DataFrame(factors)
    
    # Normaliser en z-scores
    for col in ["momentum", "low_vol", "quality", "liquidity"]:
        if df[col].std() > 1e-6:
            df[col] = (df[col] - df[col].mean()) / df[col].std()
        else:
            df[col] = 0
    
    return df


def compute_portfolio_weights(
    factors_df: pd.DataFrame,
    profile_config: dict,
    prev_weights: Optional[pd.Series] = None,
    turnover_penalty: float = 0.0
) -> pd.Series:
    """
    Calcule les poids optimaux (version simplifiée pour backtest).
    
    Utilise une approche score-weighted avec contraintes simples.
    """
    factor_weights = profile_config.get("factor_weights", {
        "momentum": 0.30,
        "low_vol": 0.25,
        "quality": 0.20,
        "liquidity": 0.15,
        "mean_reversion": 0.10,
    })
    
    # Score composite
    factors_df = factors_df.copy()
    factors_df["score"] = (
        factor_weights.get("momentum", 0.3) * factors_df["momentum"] +
        factor_weights.get("low_vol", 0.25) * factors_df["low_vol"] +
        factor_weights.get("quality", 0.2) * factors_df["quality"] +
        factor_weights.get("liquidity", 0.15) * factors_df["liquidity"]
    )
    
    # Pénalité mean reversion (si YTD > 80% et momentum récent faible)
    # Simplifié ici car on n'a pas YTD complet
    
    # Sélectionner top N actifs
    max_assets = profile_config.get("max_assets", 18)
    min_assets = profile_config.get("min_assets", 10)
    n_select = min(max_assets, len(factors_df))
    
    top_assets = factors_df.nlargest(n_select, "score")
    
    # Poids proportionnels aux scores (softmax-like)
    scores = top_assets["score"].values
    scores_shifted = scores - scores.min() + 0.1  # Éviter négatifs
    raw_weights = scores_shifted / scores_shifted.sum()
    
    # Appliquer contrainte max position
    max_pos = profile_config.get("max_position_weight", 0.15)
    weights = np.minimum(raw_weights, max_pos)
    weights = weights / weights.sum()  # Renormaliser
    
    # Pénalité turnover si prev_weights fourni
    if prev_weights is not None and turnover_penalty > 0:
        # Ajustement simple: réduire les changements
        for i, symbol in enumerate(top_assets["symbol"].values):
            if symbol in prev_weights.index:
                diff = abs(weights[i] - prev_weights[symbol])
                if diff > 0.05:  # Seuil 5%
                    # Réduire le changement de moitié
                    weights[i] = (weights[i] + prev_weights[symbol]) / 2
        weights = weights / weights.sum()
    
    return pd.Series(weights, index=top_assets["symbol"].values)


def run_backtest(
    prices: pd.DataFrame,
    config: BacktestConfig,
    profile_config: dict
) -> BacktestResult:
    """
    Exécute le backtest complet avec comparaison benchmark.
    
    Args:
        prices: DataFrame des prix (colonnes = symboles, index = dates)
        config: Configuration du backtest
        profile_config: Configuration du profil (depuis portfolio_config.yaml)
    
    Returns:
        BacktestResult avec equity curve, stats, trades, benchmark comparison
    """
    logger.info(f"Starting backtest: {config.profile}, freq={config.rebalance_freq}")
    
    # Filtrer les dates
    dates = prices.index.sort_values()
    if config.start_date:
        dates = dates[dates >= config.start_date]
    if config.end_date:
        dates = dates[dates <= config.end_date]
    
    if len(dates) < 20:
        raise ValueError(f"Not enough dates for backtest: {len(dates)}")
    
    # Dates de rebalancement
    rebal_dates = get_rebalance_dates(dates, config.rebalance_freq)
    logger.info(f"Backtest period: {dates[0]} to {dates[-1]} ({len(dates)} days)")
    logger.info(f"Rebalance dates: {len(rebal_dates)}")
    
    # Initialisation
    equity = config.initial_capital
    equity_curve = {}
    daily_returns_list = []
    weights_history = []
    trades = []
    
    prev_weights = None
    current_weights = None
    
    # Boucle sur les jours
    for i, date in enumerate(dates):
        # Rebalancement si nécessaire
        if date in rebal_dates or current_weights is None:
            try:
                factors = compute_factors_from_prices(prices, date, lookback=60)
                new_weights = compute_portfolio_weights(
                    factors,
                    profile_config,
                    prev_weights=prev_weights,
                    turnover_penalty=config.turnover_penalty
                )
                
                # Calculer turnover
                if prev_weights is not None:
                    # Aligner les index
                    all_symbols = set(new_weights.index) | set(prev_weights.index)
                    w_new = new_weights.reindex(all_symbols, fill_value=0)
                    w_old = prev_weights.reindex(all_symbols, fill_value=0)
                    turnover = (w_new - w_old).abs().sum() / 2
                    
                    # Coût de transaction
                    tx_cost = turnover * (config.transaction_cost_bp / 10000)
                    equity *= (1 - tx_cost)
                else:
                    turnover = 1.0  # Premier achat
                    tx_cost = config.transaction_cost_bp / 10000
                    equity *= (1 - tx_cost)
                
                trades.append({
                    "date": date,
                    "n_assets": len(new_weights),
                    "turnover": turnover,
                    "tx_cost": tx_cost,
                })
                
                weights_history.append({
                    "date": date,
                    **new_weights.to_dict()
                })
                
                prev_weights = current_weights
                current_weights = new_weights
                
            except Exception as e:
                logger.warning(f"Rebalance error at {date}: {e}")
                # Garder les poids précédents
        
        # Calculer le rendement du jour
        if current_weights is not None and i > 0:
            daily_ret = 0.0
            for symbol, weight in current_weights.items():
                if symbol in prices.columns:
                    prev_date = dates[i - 1]
                    if prices.loc[date, symbol] > 0 and prices.loc[prev_date, symbol] > 0:
                        asset_ret = prices.loc[date, symbol] / prices.loc[prev_date, symbol] - 1
                        daily_ret += weight * asset_ret
            
            equity *= (1 + daily_ret)
            daily_returns_list.append({"date": date, "return": daily_ret})
        
        equity_curve[date] = equity
    
    # Construire les résultats
    equity_series = pd.Series(equity_curve).sort_index()
    returns_series = pd.DataFrame(daily_returns_list).set_index("date")["return"] if daily_returns_list else pd.Series()
    trades_df = pd.DataFrame(trades)
    weights_df = pd.DataFrame(weights_history)
    
    # Stats de base
    stats = compute_backtest_stats(equity_series, returns_series, trades_df)
    
    # ===== BENCHMARK COMPARISON =====
    benchmark_curve = None
    benchmark_symbol = config.benchmark_symbol
    
    if benchmark_symbol and benchmark_symbol in prices.columns:
        logger.info(f"Computing benchmark comparison vs {benchmark_symbol}")
        
        # Extraire les prix du benchmark sur la période
        bench_prices = prices.loc[equity_series.index, benchmark_symbol].dropna()
        
        if len(bench_prices) > 10:
            # Calculer la courbe benchmark (normalisée au capital initial)
            benchmark_curve = (bench_prices / bench_prices.iloc[0]) * config.initial_capital
            
            # Statistiques benchmark
            bench_stats = compute_benchmark_stats(
                equity_series,
                returns_series,
                bench_prices,
                benchmark_symbol
            )
            stats.update(bench_stats)
            
            logger.info(f"Benchmark return: {stats.get('benchmark_return_pct', 'N/A')}%")
            logger.info(f"Excess return: {stats.get('excess_return_pct', 'N/A')}%")
            logger.info(f"Information Ratio: {stats.get('information_ratio', 'N/A')}")
    else:
        if benchmark_symbol:
            logger.warning(f"Benchmark {benchmark_symbol} not found in prices data")
    # ================================
    
    logger.info(f"Backtest complete: {stats['total_return_pct']}% return, {stats['sharpe_ratio']} Sharpe")
    
    return BacktestResult(
        equity_curve=equity_series,
        daily_returns=returns_series,
        weights_history=weights_df,
        trades=trades_df,
        stats=stats,
        config=config,
        benchmark_curve=benchmark_curve,
    )


def print_backtest_report(result: BacktestResult):
    """Affiche un rapport formaté du backtest."""
    print("\n" + "="*60)
    print("📊 BACKTEST REPORT")
    print("="*60)
    
    if result.config:
        print(f"\nProfile: {result.config.profile}")
        print(f"Rebalance: {result.config.rebalance_freq}")
        print(f"Period: {result.equity_curve.index[0].date()} → {result.equity_curve.index[-1].date()}")
    
    print("\n--- Performance ---")
    print(f"Total Return:     {result.stats.get('total_return_pct', 0):>8.2f}%")
    print(f"CAGR:             {result.stats.get('cagr_pct', 0):>8.2f}%")
    print(f"Volatility:       {result.stats.get('volatility_pct', 0):>8.2f}%")
    print(f"Sharpe Ratio:     {result.stats.get('sharpe_ratio', 0):>8.2f}")
    print(f"Max Drawdown:     {result.stats.get('max_drawdown_pct', 0):>8.2f}%")
    
    # Section Benchmark (si disponible)
    if "benchmark_symbol" in result.stats:
        print("\n--- vs Benchmark ---")
        print(f"Benchmark:        {result.stats.get('benchmark_symbol', 'N/A'):>8}")
        print(f"Bench Return:     {result.stats.get('benchmark_return_pct', 0):>8.2f}%")
        print(f"Excess Return:    {result.stats.get('excess_return_pct', 0):>8.2f}%")
        print(f"Tracking Error:   {result.stats.get('tracking_error_pct', 0):>8.2f}%")
        print(f"Info Ratio:       {result.stats.get('information_ratio', 0):>8.2f}")
        print(f"Beta:             {result.stats.get('beta', 1.0):>8.2f}")
        print(f"Alpha:            {result.stats.get('alpha_pct', 0):>8.2f}%")
        if "upside_capture_pct" in result.stats:
            print(f"Upside Capture:   {result.stats.get('upside_capture_pct', 0):>8.1f}%")
            print(f"Downside Capture: {result.stats.get('downside_capture_pct', 0):>8.1f}%")
    
    print("\n--- Trading ---")
    print(f"Rebalances:       {result.stats.get('n_rebalances', 0):>8}")
    print(f"Avg Turnover:     {result.stats.get('avg_turnover_per_rebal', 0):>8.2f}%")
    print(f"Annual Turnover:  {result.stats.get('turnover_annualized_pct', 0):>8.2f}%")
    print(f"Win Rate:         {result.stats.get('win_rate_pct', 0):>8.2f}%")
    
    print("\n" + "="*60)
