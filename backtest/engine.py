# backtest/engine.py
"""
Moteur de backtest pour le Portfolio Engine v9.

V9 (P1-8c TER FIX 2024-12-16):
- CRITICAL FIX: TER is ALREADY embedded in ETF/fund prices (adjusted close)
- Remove TER deduction to avoid double-counting
- Add platform_fee_annual_bp for B2C platform fees (optional, visible net/gross)
- Add weighted_avg_ter_bp as INFO ONLY (not deducted)
- TER handling: "embedded_in_prices" in methodology

V8 (P1-8b TER Implementation 2024-12-16):
- DEPRECATED: ter_annual_bp deduction was incorrect (double-counting)

V7 (P1-8 Net/Gross Returns 2024-12-16):
- Separate gross and net returns calculation
- gross_return_pct: before transaction costs
- net_return_pct: after transaction costs (displayed to user)
- total_costs_pct: cumulative transaction costs as % of initial capital
- cost_drag_pct: impact of costs on performance (gross - net)
- Transparency for AMF compliance

V6 (P1-7 Profile Benchmarks 2024-12-16):
- Profile-specific benchmarks (Agressif→QQQ, Modéré→URTH, Stable→AGG)
- Import from portfolio_engine.benchmarks
- get_benchmark_for_profile() auto-selection
- Benchmark metadata exposed in stats

V5 (P0 Technical Fix 2024-12-15):
- P0-1 FIX: Use get_data_source_string() instead of hardcoded "Yahoo Finance"
- Import from portfolio_engine.data_lineage for consistent data lineage

V4 (IC Review 2024-12-15 - ChatGPT challenge):
- ACTION 2: Masquer Sharpe annualisé si période < 252j
- Ajout sharpe_display pour le front
- Sharpe = None si période insuffisante (évite "7.3" affiché)

V3 (IC Review 2024-12-15):
- CRITICAL: risk_free_rate 0.0 → 0.045 (Fed Funds rate)
- CRITICAL: Ajout disclaimer AMF obligatoire
- CRITICAL: Ajout warning si période < 252j
- Sharpe ratio réaliste (÷3 environ)

V2: FIX CRITIQUE - UTILISER POIDS FIXES DU PORTFOLIO
- Nouvelle fonction run_backtest_fixed_weights() qui utilise les poids de portfolios.json
- L'ancienne version recalculait les poids dynamiquement → biais énorme
- Maintenant le backtest reflète vraiment la performance du portfolio généré

Backtest sur 90 jours glissants avec:
- Poids fixes (pas de recalcul dynamique)
- Rebalancing configurable (daily/weekly/monthly)
- Coûts de transaction + platform fees (transparents via gross/net)
- TER exposé comme INFO (déjà inclus dans les prix ETF)
- Métriques de performance
- Comparaison benchmark (par profil)
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import logging

logger = logging.getLogger("backtest.engine")

# ============= P0-1 FIX: Import data lineage =============
try:
    from portfolio_engine.data_lineage import get_data_source_string
    HAS_DATA_LINEAGE = True
except ImportError:
    HAS_DATA_LINEAGE = False
    def get_data_source_string() -> str:
        return "Twelve Data API (adjusted_close)"  # Fallback

# ============= P1-7: Import profile benchmarks =============
try:
    from portfolio_engine.benchmarks import (
        get_benchmark_for_profile,
        get_benchmark_symbol,
        get_benchmark_metadata,
        validate_benchmark_availability,
        DEFAULT_BENCHMARK,
    )
    HAS_BENCHMARKS = True
except ImportError:
    HAS_BENCHMARKS = False
    logger.warning("portfolio_engine.benchmarks not available, using default URTH")
    
    def get_benchmark_symbol(profile: str) -> str:
        return "URTH"
    
    def get_benchmark_metadata(profile: str) -> dict:
        return {"symbol": "URTH", "name": "iShares MSCI World ETF"}


# ============= v3: CONSTANTES COMPLIANCE =============

# v3 IC FIX: Taux sans risque réaliste (Fed Funds Dec 2024)
DEFAULT_RISK_FREE_RATE = 0.045  # 4.5% annuel

# V9 P1-8c: Platform fee (B2C) - optionnel, pour créer un écart gross/net visible
# Exemple: 50bp = 0.50%/an de frais de plateforme
DEFAULT_PLATFORM_FEE_ANNUAL_BP = 0.0  # 0 par défaut (pas de frais plateforme)

# v3 IC FIX: Disclaimer AMF obligatoire (Position DOC-2011-24)
DISCLAIMER_AMF = """⚠️ SIMULATION - Les performances passées ne préjugent pas des performances futures. 
Les données présentées sont issues d'une simulation sur données historiques. 
Frais réels non inclus. Capital non garanti."""

# Période minimum recommandée pour significativité statistique
MIN_DAYS_FOR_STATS = 252  # 1 an


@dataclass
class BacktestConfig:
    """
    Configuration du backtest.
    
    V9 P1-8c: 
    - REMOVED ter_annual_bp (was causing double-counting)
    - ADDED platform_fee_annual_bp for B2C platform fees
    - TER is embedded in ETF prices, not deducted separately
    
    V6 P1-7: benchmark_symbol est maintenant auto-sélectionné selon le profil
    si non spécifié explicitement.
    """
    profile: str = "Modéré"              # Agressif, Modéré, Stable
    start_date: Optional[str] = None      # YYYY-MM-DD (défaut: 90j avant)
    end_date: Optional[str] = None        # YYYY-MM-DD (défaut: aujourd'hui)
    rebalance_freq: str = "M"             # D=daily, W=weekly, M=monthly
    transaction_cost_bp: float = 10.0     # Coût en basis points (par trade)
    platform_fee_annual_bp: float = DEFAULT_PLATFORM_FEE_ANNUAL_BP  # V9: B2C platform fee
    turnover_penalty: float = 0.001       # Pénalité turnover dans objectif
    initial_capital: float = 100000.0     # Capital initial
    benchmark_symbol: Optional[str] = None  # V6: None = auto-select par profil
    # V9: TER metadata (for display only, NOT deducted - already in prices)
    weighted_avg_ter_bp: Optional[float] = None  # Calculated from portfolio holdings
    
    def __post_init__(self):
        """Auto-select benchmark based on profile if not specified."""
        if self.benchmark_symbol is None:
            self.benchmark_symbol = get_benchmark_symbol(self.profile)
            logger.info(f"P1-7: Auto-selected benchmark {self.benchmark_symbol} for profile {self.profile}")


@dataclass
class BacktestResult:
    """
    Résultats du backtest.
    
    V7 P1-8: Added gross_equity_curve for transparency.
    """
    equity_curve: pd.Series               # Valeur du portefeuille par date (NET)
    daily_returns: pd.Series              # Rendements journaliers (NET)
    weights_history: pd.DataFrame         # Historique des poids
    trades: pd.DataFrame                  # Détail des rebalancements
    stats: Dict[str, float] = field(default_factory=dict)
    config: Optional[BacktestConfig] = None
    benchmark_curve: Optional[pd.Series] = None  # Courbe benchmark
    gross_equity_curve: Optional[pd.Series] = None  # V7 P1-8: Courbe BRUTE (avant frais)


def compute_backtest_stats(
    equity_curve: pd.Series,
    daily_returns: pd.Series,
    trades_df: pd.DataFrame,
    risk_free_rate: float = DEFAULT_RISK_FREE_RATE,  # v3 FIX: 0.0 → 0.045
    gross_equity_curve: Optional[pd.Series] = None,  # V7 P1-8: Add gross curve
    initial_capital: float = 100000.0,  # V7 P1-8: For cost calculation
    total_transaction_costs: float = 0.0,  # V7 P1-8: Cumulative tx costs
    total_platform_fees: float = 0.0,  # V9 P1-8c: Platform fees (replaces TER)
    platform_fee_annual_bp: float = 0.0,  # V9: Platform fee rate used
    weighted_avg_ter_bp: Optional[float] = None,  # V9: TER info (not deducted)
) -> Dict[str, float]:
    """
    Calcule les statistiques de performance.
    
    V9 P1-8c:
    - Remove TER deduction (already in ETF prices)
    - Add platform_fee tracking instead
    - Expose weighted_avg_ter_bp as INFO ONLY
    - Clear methodology explaining TER handling
    
    V7 P1-8:
    - Separate gross and net returns
    - Expose total_costs_pct and cost_drag_pct
    - Transparency for AMF compliance
    
    Returns:
        Dict avec CAGR, volatilité, Sharpe, max drawdown, turnover, gross/net returns, etc.
    """
    stats = {}
    
    # Période
    n_days = len(equity_curve)
    n_years = n_days / 252
    
    # ===== V7 P1-8: NET RETURN (after transaction costs + platform fees) =====
    net_return = (equity_curve.iloc[-1] / equity_curve.iloc[0]) - 1
    stats["net_return_pct"] = round(net_return * 100, 2)
    stats["total_return_pct"] = stats["net_return_pct"]  # Backward compatibility
    
    # ===== V7 P1-8: GROSS RETURN (before all costs) =====
    if gross_equity_curve is not None and len(gross_equity_curve) > 0:
        gross_return = (gross_equity_curve.iloc[-1] / gross_equity_curve.iloc[0]) - 1
        stats["gross_return_pct"] = round(gross_return * 100, 2)
        
        # Cost drag = difference between gross and net
        cost_drag = gross_return - net_return
        stats["cost_drag_pct"] = round(cost_drag * 100, 2)
    else:
        # Fallback: estimate from trades if gross curve not available
        stats["gross_return_pct"] = stats["net_return_pct"]
        stats["cost_drag_pct"] = 0.0
    
    # ===== V9 P1-8c: TOTAL COSTS (Transaction + Platform fees) =====
    # NOTE: TER is NOT included here - it's already embedded in ETF prices
    total_all_costs = total_transaction_costs + total_platform_fees
    
    stats["total_costs_pct"] = round((total_all_costs / initial_capital) * 100, 2)
    stats["total_costs_value"] = round(total_all_costs, 2)
    
    # V9 P1-8c: Detailed cost breakdown
    stats["cost_breakdown"] = {
        "transaction_costs": round(total_transaction_costs, 2),
        "transaction_costs_pct": round((total_transaction_costs / initial_capital) * 100, 3),
        "platform_fees": round(total_platform_fees, 2),
        "platform_fees_pct": round((total_platform_fees / initial_capital) * 100, 3),
        "platform_fee_annual_bp": platform_fee_annual_bp,
        "total": round(total_all_costs, 2),
        # V9: TER info (NOT deducted, already in prices)
        "ter_info": {
            "weighted_avg_ter_bp": weighted_avg_ter_bp,
            "handling": "embedded_in_etf_prices",
            "note": "TER is already reflected in ETF adjusted close prices - NOT deducted separately",
        },
    }
    
    # CAGR (annualisé) - based on NET return
    if n_years > 0:
        cagr = (1 + net_return) ** (1 / n_years) - 1
        stats["cagr_pct"] = round(cagr * 100, 2)
        
        # V7 P1-8: Also compute gross CAGR for comparison
        if gross_equity_curve is not None and len(gross_equity_curve) > 0:
            gross_return = (gross_equity_curve.iloc[-1] / gross_equity_curve.iloc[0]) - 1
            gross_cagr = (1 + gross_return) ** (1 / n_years) - 1
            stats["gross_cagr_pct"] = round(gross_cagr * 100, 2)
    else:
        stats["cagr_pct"] = stats["net_return_pct"]
        stats["gross_cagr_pct"] = stats.get("gross_return_pct", stats["net_return_pct"])
    
    # Volatilité annualisée (based on net returns)
    vol = daily_returns.std() * np.sqrt(252)
    stats["volatility_pct"] = round(vol * 100, 2)
    
    # v3 FIX: Stocker le taux sans risque utilisé
    stats["risk_free_rate_pct"] = round(risk_free_rate * 100, 2)
    
    # Calcul Sharpe (toujours calculé en interne) - based on NET returns
    excess_return = daily_returns.mean() - (risk_free_rate / 252)
    if daily_returns.std() > 0:
        sharpe_computed = (excess_return / daily_returns.std()) * np.sqrt(252)
    else:
        sharpe_computed = 0.0
    
    # ===== v4 ACTION 2: MASQUER SHARPE SI PÉRIODE < 252j =====
    if n_days < MIN_DAYS_FOR_STATS:
        # Période insuffisante → ne pas afficher Sharpe annualisé
        stats["sharpe_ratio"] = None  # v4 FIX: masqué pour le front
        stats["sharpe_computed"] = round(sharpe_computed, 2)  # Conservé pour debug
        stats["sharpe_display"] = "Non calculable (période < 1 an)"
        stats["sharpe_significant"] = False
        
        # Sharpe quotidien (non annualisé) comme alternative
        sharpe_daily = excess_return / daily_returns.std() if daily_returns.std() > 0 else 0
        stats["sharpe_daily"] = round(sharpe_daily, 4)
    else:
        # Période suffisante → Sharpe OK
        stats["sharpe_ratio"] = round(sharpe_computed, 2)
        stats["sharpe_display"] = f"{sharpe_computed:.2f}"
        stats["sharpe_significant"] = True
        stats["sharpe_daily"] = None
    
    # Max Drawdown (based on net equity curve)
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
    
    # ===== v3 IC FIX: COMPLIANCE AMF =====
    
    # Disclaimer obligatoire
    stats["disclaimer_amf"] = DISCLAIMER_AMF
    
    # ===== V9 P1-8c: Updated methodology with TER handling =====
    stats["methodology"] = {
        "type": "backtest_fixed_weights",
        "period_days": n_days,
        "rebalancing": "none (buy-and-hold)",
        "transaction_cost_bp": 10,
        "platform_fee_annual_bp": platform_fee_annual_bp,
        "data_source": get_data_source_string(),
        "risk_free_rate_pct": round(risk_free_rate * 100, 2),
        # V9 P1-8c: Clear TER handling explanation
        "ter_handling": "embedded_in_etf_prices",
        "ter_note": "ETF/fund TER is already reflected in adjusted close prices and is NOT deducted separately to avoid double-counting",
        "weighted_avg_ter_bp": weighted_avg_ter_bp,
        # V7 P1-8: Add cost transparency to methodology
        "return_type": "net (after transaction costs + platform fees)",
        "gross_return_available": gross_equity_curve is not None,
    }
    
    # Warning si période insuffisante
    if n_days < MIN_DAYS_FOR_STATS:
        stats["amf_warning"] = (
            f"⚠️ Période de {n_days} jours insuffisante pour analyse statistique significative. "
            f"AMF recommande minimum 5 ans pour performances publiées. "
            f"Sharpe ratio sur période < 1 an non significatif."
        )
        stats["sharpe_warning"] = f"Sharpe calculé sur {n_days}j < 252j : non significatif statistiquement"
    
    return stats


def compute_benchmark_stats(
    equity_curve: pd.Series,
    daily_returns: pd.Series,
    benchmark_prices: pd.Series,
    benchmark_symbol: str = "URTH",
    profile: str = "Modéré"  # V6 P1-7: Add profile for metadata
) -> Dict[str, float]:
    """
    Calcule les statistiques relatives au benchmark.
    
    V6 P1-7:
    - Add benchmark_metadata with rationale
    - Include profile context in stats
    
    Args:
        equity_curve: Courbe de valeur du portefeuille
        daily_returns: Rendements journaliers du portefeuille
        benchmark_prices: Prix du benchmark sur la même période
        benchmark_symbol: Symbole du benchmark
        profile: Nom du profil pour les métadonnées
    
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
    
    # V6 P1-7: Add benchmark metadata
    benchmark_meta = get_benchmark_metadata(profile)
    stats["benchmark_metadata"] = {
        "symbol": benchmark_symbol,
        "name": benchmark_meta.get("name", benchmark_symbol),
        "rationale": benchmark_meta.get("rationale", "Default benchmark"),
        "asset_class": benchmark_meta.get("asset_class", "equity"),
    }
    
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


# ============================================================================
# V2: NOUVELLE FONCTION - BACKTEST AVEC POIDS FIXES
# V7 P1-8: Added gross/net return separation
# V9 P1-8c: Fixed TER handling (embedded in prices, not deducted)
# ============================================================================

def run_backtest_fixed_weights(
    prices: pd.DataFrame,
    fixed_weights: Dict[str, float],
    config: BacktestConfig,
    ter_by_ticker: Optional[Dict[str, float]] = None,  # V9: TER metadata for info
) -> BacktestResult:
    """
    Exécute le backtest avec des poids FIXES (pas de recalcul dynamique).
    
    C'EST LA FONCTION À UTILISER pour backtester les portfolios générés.
    Les poids viennent de portfolios.json et ne changent PAS pendant le backtest.
    
    V9 P1-8c:
    - CRITICAL FIX: Remove TER deduction (already in ETF adjusted close prices)
    - Add platform_fee_annual_bp for B2C platform fees (creates visible net/gross gap)
    - Calculate weighted_avg_ter_bp for INFO ONLY (displayed, not deducted)
    - Clear methodology explaining TER handling
    
    V7 P1-8:
    - Track both GROSS and NET equity curves
    - gross_return: performance before transaction costs
    - net_return: performance after transaction costs (displayed to user)
    - Transparent cost calculation for AMF compliance
    
    Args:
        prices: DataFrame des prix (colonnes = symboles, index = dates)
        fixed_weights: Dict {ticker: poids_decimal} ex: {"AAPL": 0.14, "MSFT": 0.12}
        config: Configuration du backtest
        ter_by_ticker: Optional Dict {ticker: ter_bp} for TER info display
    
    Returns:
        BacktestResult avec equity curve (net), gross_equity_curve, stats, etc.
    """
    logger.info(f"Starting FIXED WEIGHTS backtest: {config.profile}")
    logger.info(f"Fixed weights: {len(fixed_weights)} assets, sum={sum(fixed_weights.values()):.2%}")
    logger.info(f"P1-7: Using benchmark {config.benchmark_symbol} for profile {config.profile}")
    
    # V9 P1-8c: Log platform fee (replaces TER deduction)
    if config.platform_fee_annual_bp > 0:
        logger.info(f"P1-8c: Platform fee = {config.platform_fee_annual_bp}bp/year ({config.platform_fee_annual_bp/100:.2f}%/year)")
    else:
        logger.info(f"P1-8c: No platform fee applied (gross ≈ net except for tx costs)")
    
    # V9 P1-8c: Calculate weighted average TER for INFO (not deducted)
    weighted_avg_ter_bp = None
    if ter_by_ticker:
        ter_sum = 0.0
        weight_with_ter = 0.0
        for ticker, weight in fixed_weights.items():
            if ticker in ter_by_ticker and ter_by_ticker[ticker] is not None:
                ter_sum += weight * ter_by_ticker[ticker]
                weight_with_ter += weight
        if weight_with_ter > 0:
            weighted_avg_ter_bp = round(ter_sum / weight_with_ter, 2)
            logger.info(f"P1-8c: Weighted avg TER = {weighted_avg_ter_bp}bp (INFO ONLY - already in prices)")
    
    # Filtrer les dates
    dates = prices.index.sort_values()
    if config.start_date:
        dates = dates[dates >= config.start_date]
    if config.end_date:
        dates = dates[dates <= config.end_date]
    
    if len(dates) < 10:
        raise ValueError(f"Not enough dates for backtest: {len(dates)}")
    
    # Vérifier quels symboles sont disponibles dans les prix
    available_symbols = set(prices.columns)
    portfolio_symbols = set(fixed_weights.keys())
    missing_symbols = portfolio_symbols - available_symbols
    
    if missing_symbols:
        logger.warning(f"Missing price data for: {missing_symbols}")
    
    # Filtrer et renormaliser les poids pour les symboles disponibles
    effective_weights = {
        sym: w for sym, w in fixed_weights.items() 
        if sym in available_symbols
    }
    
    if not effective_weights:
        raise ValueError("No symbols with both weights and price data!")
    
    # Renormaliser si nécessaire
    total_weight = sum(effective_weights.values())
    if total_weight < 0.5:
        logger.error(f"Only {total_weight:.1%} of portfolio has price data - results will be biased!")
    
    effective_weights = {k: v/total_weight for k, v in effective_weights.items()}
    
    logger.info(f"Effective weights: {len(effective_weights)} assets (coverage: {total_weight:.1%})")
    for sym, w in sorted(effective_weights.items(), key=lambda x: -x[1])[:5]:
        logger.info(f"  {sym}: {w:.1%}")
    
    # Convertir en Series pour faciliter les calculs
    weights_series = pd.Series(effective_weights)
    
    # ===== V9 P1-8c: INITIALIZE BOTH GROSS AND NET EQUITY =====
    equity_gross = config.initial_capital  # GROSS: never reduced by costs
    equity_net = config.initial_capital    # NET: reduced by tx costs + platform fees
    
    gross_equity_curve = {}
    net_equity_curve = {}
    daily_returns_list = []  # Based on gross returns (market performance)
    
    # Dates de rebalancement (pour le turnover - ici turnover = 0 car poids fixes)
    rebal_dates = get_rebalance_dates(dates, config.rebalance_freq)
    
    # ===== V7 P1-8: TRACK TRANSACTION COSTS =====
    initial_cost_rate = config.transaction_cost_bp / 10000
    initial_cost_value = equity_net * initial_cost_rate
    total_transaction_costs = initial_cost_value
    
    # Apply initial cost only to NET equity
    equity_net *= (1 - initial_cost_rate)
    
    trades = [{
        "date": dates[0],
        "n_assets": len(effective_weights),
        "turnover": 1.0,  # Achat initial = 100% turnover
        "tx_cost": initial_cost_rate,
        "tx_cost_value": initial_cost_value,
    }]
    
    logger.info(f"P1-8: Initial transaction cost: {initial_cost_value:.2f} ({initial_cost_rate*100:.2f}%)")
    
    # ===== V9 P1-8c: PLATFORM FEE DAILY RATE =====
    # NOTE: This is for B2C platform fees, NOT TER (TER is already in prices)
    daily_platform_fee_rate = (config.platform_fee_annual_bp / 10000) / 252
    total_platform_fees = 0.0
    
    if config.platform_fee_annual_bp > 0:
        logger.info(f"P1-8c: Daily platform fee rate: {daily_platform_fee_rate*10000:.4f}bp ({daily_platform_fee_rate*100:.6f}%/day)")
    
    # Boucle sur les jours
    prev_date = None
    for i, date in enumerate(dates):
        if prev_date is not None:
            # Calculer le rendement du jour = somme pondérée des rendements des actifs
            daily_ret = 0.0
            for symbol, weight in effective_weights.items():
                if symbol in prices.columns:
                    price_today = prices.loc[date, symbol]
                    price_prev = prices.loc[prev_date, symbol]
                    if price_today > 0 and price_prev > 0:
                        asset_ret = (price_today / price_prev) - 1
                        daily_ret += weight * asset_ret
            
            # V9 P1-8c: Apply return to GROSS (pure market performance)
            equity_gross *= (1 + daily_ret)
            
            # V9 P1-8c: Apply return to NET, then deduct platform fee (NOT TER)
            equity_net *= (1 + daily_ret)
            
            # Deduct daily platform fee from NET equity (if configured)
            if config.platform_fee_annual_bp > 0:
                daily_fee_cost = equity_net * daily_platform_fee_rate
                equity_net -= daily_fee_cost
                total_platform_fees += daily_fee_cost
            
            daily_returns_list.append({"date": date, "return": daily_ret})
        
        # V7 P1-8: Track both curves
        gross_equity_curve[date] = equity_gross
        net_equity_curve[date] = equity_net
        prev_date = date
    
    # Construire les résultats
    gross_equity_series = pd.Series(gross_equity_curve).sort_index()
    net_equity_series = pd.Series(net_equity_curve).sort_index()
    returns_series = pd.DataFrame(daily_returns_list).set_index("date")["return"] if daily_returns_list else pd.Series()
    trades_df = pd.DataFrame(trades)
    
    # Historique des poids (constant)
    weights_history = pd.DataFrame([{
        "date": dates[0],
        **effective_weights
    }])
    
    # V9 P1-8c: Stats with platform fees (not TER)
    stats = compute_backtest_stats(
        equity_curve=net_equity_series,  # Primary is NET
        daily_returns=returns_series,
        trades_df=trades_df,
        risk_free_rate=DEFAULT_RISK_FREE_RATE,  # 4.5%
        gross_equity_curve=gross_equity_series,
        initial_capital=config.initial_capital,
        total_transaction_costs=total_transaction_costs,
        total_platform_fees=total_platform_fees,  # V9: Platform fees (not TER)
        platform_fee_annual_bp=config.platform_fee_annual_bp,
        weighted_avg_ter_bp=weighted_avg_ter_bp,  # V9: TER info only
    )
    
    # Ajouter info sur la couverture
    stats["weight_coverage_pct"] = round(total_weight * 100, 1)
    stats["n_assets_with_data"] = len(effective_weights)
    stats["n_assets_total"] = len(fixed_weights)
    
    # V9 P1-8c: Log gross vs net with clear cost breakdown
    logger.info(f"P1-8c: Gross return: {stats.get('gross_return_pct', 'N/A')}%")
    logger.info(f"P1-8c: Net return: {stats.get('net_return_pct', 'N/A')}%")
    logger.info(f"P1-8c: Cost drag: {stats.get('cost_drag_pct', 'N/A')}%")
    cost_breakdown = stats.get('cost_breakdown', {})
    logger.info(f"P1-8c: Costs - Tx: {cost_breakdown.get('transaction_costs', 0):.2f}, Platform: {cost_breakdown.get('platform_fees', 0):.2f}")
    if weighted_avg_ter_bp:
        logger.info(f"P1-8c: Weighted avg TER: {weighted_avg_ter_bp}bp (INFO ONLY - already in ETF prices)")
    
    # ===== V6 P1-7: PROFILE-SPECIFIC BENCHMARK COMPARISON =====
    benchmark_curve = None
    benchmark_symbol = config.benchmark_symbol
    
    if benchmark_symbol and benchmark_symbol in prices.columns:
        logger.info(f"Computing benchmark comparison vs {benchmark_symbol} (profile: {config.profile})")
        
        bench_prices = prices.loc[net_equity_series.index, benchmark_symbol].dropna()
        
        if len(bench_prices) > 10:
            benchmark_curve = (bench_prices / bench_prices.iloc[0]) * config.initial_capital
            
            # V6 P1-7: Pass profile for metadata
            bench_stats = compute_benchmark_stats(
                net_equity_series,
                returns_series,
                bench_prices,
                benchmark_symbol,
                profile=config.profile  # NEW
            )
            stats.update(bench_stats)
            
            # V6 P1-7: Add benchmark info to methodology
            stats["methodology"]["benchmark"] = benchmark_symbol
            stats["methodology"]["benchmark_rationale"] = stats.get("benchmark_metadata", {}).get("rationale", "")
            
            logger.info(f"Benchmark return: {stats.get('benchmark_return_pct', 'N/A')}%")
            logger.info(f"Portfolio return (NET): {stats.get('net_return_pct', 'N/A')}%")
            logger.info(f"Excess return: {stats.get('excess_return_pct', 'N/A')}%")
    else:
        if benchmark_symbol:
            logger.warning(f"Benchmark {benchmark_symbol} not found in prices data")
            # V6 P1-7: Try to find fallback
            if HAS_BENCHMARKS:
                fallback_info = validate_benchmark_availability(list(prices.columns), config.profile)
                if fallback_info["fallback_symbol"] and fallback_info["fallback_symbol"] in prices.columns:
                    fallback_sym = fallback_info["fallback_symbol"]
                    logger.info(f"Using fallback benchmark: {fallback_sym}")
                    
                    bench_prices = prices.loc[net_equity_series.index, fallback_sym].dropna()
                    if len(bench_prices) > 10:
                        benchmark_curve = (bench_prices / bench_prices.iloc[0]) * config.initial_capital
                        bench_stats = compute_benchmark_stats(
                            net_equity_series, returns_series, bench_prices, fallback_sym, config.profile
                        )
                        stats.update(bench_stats)
                        stats["benchmark_fallback"] = True
                        stats["benchmark_primary_missing"] = benchmark_symbol
    
    # v4: Log avec sharpe_display
    sharpe_display = stats.get("sharpe_display", "N/A")
    logger.info(f"Backtest complete: NET={stats['net_return_pct']}%, GROSS={stats.get('gross_return_pct', 'N/A')}%, Sharpe={sharpe_display} (Rf={DEFAULT_RISK_FREE_RATE*100}%), {stats['volatility_pct']}% vol")
    
    return BacktestResult(
        equity_curve=net_equity_series,  # V7 P1-8: Primary curve is NET
        daily_returns=returns_series,
        weights_history=weights_history,
        trades=trades_df,
        stats=stats,
        config=config,
        benchmark_curve=benchmark_curve,
        gross_equity_curve=gross_equity_series,  # V7 P1-8: Add GROSS curve
    )


# ============================================================================
# ANCIENNE FONCTION (pour référence, utilise compute_portfolio_weights dynamique)
# ============================================================================

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
    
    ⚠️ DEPRECATED: Utiliser run_backtest_fixed_weights() avec les poids de portfolios.json
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
        for i, symbol in enumerate(top_assets["symbol"].values):
            if symbol in prev_weights.index:
                diff = abs(weights[i] - prev_weights[symbol])
                if diff > 0.05:
                    weights[i] = (weights[i] + prev_weights[symbol]) / 2
        weights = weights / weights.sum()
    
    return pd.Series(weights, index=top_assets["symbol"].values)


def run_backtest(
    prices: pd.DataFrame,
    config: BacktestConfig,
    profile_config: dict
) -> BacktestResult:
    """
    Exécute le backtest avec recalcul dynamique des poids.
    
    ⚠️ DEPRECATED: Cette fonction recalcule les poids à chaque rebalancement,
    ce qui ne reflète pas le vrai portfolio. Utiliser run_backtest_fixed_weights().
    """
    logger.warning("⚠️ run_backtest() is DEPRECATED - use run_backtest_fixed_weights() instead")
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
                    all_symbols = set(new_weights.index) | set(prev_weights.index)
                    w_new = new_weights.reindex(all_symbols, fill_value=0)
                    w_old = prev_weights.reindex(all_symbols, fill_value=0)
                    turnover = (w_new - w_old).abs().sum() / 2
                    
                    tx_cost = turnover * (config.transaction_cost_bp / 10000)
                    equity *= (1 - tx_cost)
                else:
                    turnover = 1.0
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
    
    # v4 FIX: Stats avec Sharpe masqué si période < 252j
    stats = compute_backtest_stats(
        equity_series, 
        returns_series, 
        trades_df,
        risk_free_rate=DEFAULT_RISK_FREE_RATE
    )
    
    # ===== V6 P1-7: PROFILE-SPECIFIC BENCHMARK =====
    benchmark_curve = None
    benchmark_symbol = config.benchmark_symbol
    
    if benchmark_symbol and benchmark_symbol in prices.columns:
        logger.info(f"Computing benchmark comparison vs {benchmark_symbol}")
        
        bench_prices = prices.loc[equity_series.index, benchmark_symbol].dropna()
        
        if len(bench_prices) > 10:
            benchmark_curve = (bench_prices / bench_prices.iloc[0]) * config.initial_capital
            
            bench_stats = compute_benchmark_stats(
                equity_series,
                returns_series,
                bench_prices,
                benchmark_symbol,
                profile=config.profile
            )
            stats.update(bench_stats)
            
            logger.info(f"Benchmark return: {stats.get('benchmark_return_pct', 'N/A')}%")
            logger.info(f"Excess return: {stats.get('excess_return_pct', 'N/A')}%")
            logger.info(f"Information Ratio: {stats.get('information_ratio', 'N/A')}")
    else:
        if benchmark_symbol:
            logger.warning(f"Benchmark {benchmark_symbol} not found in prices data")
    
    # v4: Log avec sharpe_display
    sharpe_display = stats.get("sharpe_display", "N/A")
    logger.info(f"Backtest complete: {stats['total_return_pct']}% return, Sharpe={sharpe_display}")
    
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
    """
    Affiche un rapport formaté du backtest.
    
    V9 P1-8c: Updated cost breakdown with platform fees and TER info.
    V7 P1-8: Added gross vs net section for transparency.
    """
    print("\n" + "="*60)
    print("📊 BACKTEST REPORT")
    print("="*60)
    
    if result.config:
        print(f"\nProfile: {result.config.profile}")
        print(f"Rebalance: {result.config.rebalance_freq}")
        print(f"Period: {result.equity_curve.index[0].date()} → {result.equity_curve.index[-1].date()}")
    
    # Afficher couverture si disponible
    if "weight_coverage_pct" in result.stats:
        coverage = result.stats["weight_coverage_pct"]
        n_with_data = result.stats.get("n_assets_with_data", "?")
        n_total = result.stats.get("n_assets_total", "?")
        print(f"Coverage: {n_with_data}/{n_total} assets ({coverage}%)")
    
    # ===== V9 P1-8c: GROSS vs NET SECTION with clear cost breakdown =====
    print("\n--- Gross vs Net Performance ---")
    gross_return = result.stats.get('gross_return_pct', 'N/A')
    net_return = result.stats.get('net_return_pct', result.stats.get('total_return_pct', 0))
    cost_drag = result.stats.get('cost_drag_pct', 0)
    
    print(f"Gross Return:     {gross_return:>8}%  (market performance)")
    print(f"Net Return:       {net_return:>8.2f}%  (after costs)")
    print(f"Cost Drag:        {cost_drag:>8.2f}%  (gross - net)")
    
    # V9 P1-8c: Detailed cost breakdown
    cost_breakdown = result.stats.get('cost_breakdown', {})
    tx_costs = cost_breakdown.get('transaction_costs', 0)
    platform_fees = cost_breakdown.get('platform_fees', 0)
    platform_fee_bp = cost_breakdown.get('platform_fee_annual_bp', 0)
    total_costs = cost_breakdown.get('total', 0)
    
    print(f"\n--- Cost Breakdown ---")
    print(f"Transaction costs: {tx_costs:>8.2f}  ({cost_breakdown.get('transaction_costs_pct', 0):.3f}%)")
    if platform_fee_bp > 0:
        print(f"Platform fees:     {platform_fees:>8.2f}  ({cost_breakdown.get('platform_fees_pct', 0):.3f}%) [{platform_fee_bp}bp/year]")
    else:
        print(f"Platform fees:     {0:>8.2f}  (not configured)")
    print(f"Total costs:       {total_costs:>8.2f}  ({result.stats.get('total_costs_pct', 0):.2f}%)")
    
    # V9 P1-8c: TER info (NOT deducted)
    ter_info = cost_breakdown.get('ter_info', {})
    weighted_ter = ter_info.get('weighted_avg_ter_bp')
    if weighted_ter:
        print(f"\n--- TER Info (embedded in prices, NOT deducted) ---")
        print(f"Weighted avg TER: {weighted_ter:>8.1f}bp/year ({weighted_ter/100:.2f}%)")
        print(f"Note: {ter_info.get('note', 'Already reflected in ETF prices')}")
    
    print("\n--- Performance (NET) ---")
    print(f"Total Return:     {result.stats.get('net_return_pct', result.stats.get('total_return_pct', 0)):>8.2f}%")
    print(f"CAGR:             {result.stats.get('cagr_pct', 0):>8.2f}%")
    print(f"Volatility:       {result.stats.get('volatility_pct', 0):>8.2f}%")
    
    # v4: Affichage conditionnel du Sharpe
    sharpe_display = result.stats.get("sharpe_display", "N/A")
    sharpe_significant = result.stats.get("sharpe_significant", False)
    
    if sharpe_significant:
        print(f"Sharpe Ratio:     {sharpe_display:>8}")
    else:
        print(f"Sharpe Ratio:     {sharpe_display}")  # "Non calculable (période < 1 an)"
    
    print(f"  (Rf={result.stats.get('risk_free_rate_pct', 0):.1f}%)")
    print(f"Max Drawdown:     {result.stats.get('max_drawdown_pct', 0):>8.2f}%")
    
    # v3: Afficher warning AMF si présent
    if "amf_warning" in result.stats:
        print(f"\n⚠️  {result.stats['amf_warning']}")
    
    # Section Benchmark (si disponible) - V6 P1-7: Enhanced
    if "benchmark_symbol" in result.stats:
        print("\n--- vs Benchmark ---")
        benchmark_meta = result.stats.get("benchmark_metadata", {})
        print(f"Benchmark:        {result.stats.get('benchmark_symbol', 'N/A'):>8}")
        if benchmark_meta.get("name"):
            print(f"  ({benchmark_meta['name']})")
        if benchmark_meta.get("rationale"):
            print(f"  Rationale: {benchmark_meta['rationale']}")
        
        if result.stats.get("benchmark_fallback"):
            print(f"  ⚠️ Fallback (primary {result.stats.get('benchmark_primary_missing')} unavailable)")
        
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
    
    # v3: Afficher disclaimer AMF
    print("\n" + "-"*60)
    print(result.stats.get("disclaimer_amf", ""))
    print("="*60)
