# backtest/__init__.py
"""
Module Backtest - Validation historique du Portfolio Engine.

- data_loader.py : Récupération des prix via Twelve Data API
- engine.py : Moteur de backtest avec calcul des métriques
"""

from .engine import (
    BacktestConfig,
    BacktestResult,
    run_backtest,
    compute_backtest_stats,
)

from .data_loader import (
    TwelveDataLoader,
    load_prices_for_backtest,
)

__all__ = [
    "BacktestConfig",
    "BacktestResult",
    "run_backtest",
    "compute_backtest_stats",
    "TwelveDataLoader",
    "load_prices_for_backtest",
]
