# portfolio_engine/__init__.py
"""
Portfolio Engine - Moteur quantitatif de construction de portefeuilles.

Architecture:
- universe.py   : Construction de l'univers d'actifs scorés
- factors.py    : Scoring multi-facteur configurable
- optimizer.py  : Optimisation mean-variance sous contraintes
- profiles.py   : Contraintes par profil (Agressif/Modéré/Stable)

Le LLM n'intervient PAS sur les poids - uniquement sur les justifications.
"""

from .universe import (
    build_scored_universe,
    load_and_build_universe,
    load_etf_csv,
    compute_scores,
)

from .factors import (
    FactorScorer,
    FactorWeights,
    PROFILE_WEIGHTS,
    rescore_universe_by_profile,
)

from .optimizer import (
    PortfolioOptimizer,
    ProfileConstraints,
    Asset,
    PROFILES,
    convert_universe_to_assets,
    validate_portfolio,
)

__version__ = "2.0.0"
__all__ = [
    # Universe
    "build_scored_universe",
    "load_and_build_universe",
    "load_etf_csv",
    "compute_scores",
    # Factors
    "FactorScorer",
    "FactorWeights",
    "PROFILE_WEIGHTS",
    "rescore_universe_by_profile",
    # Optimizer
    "PortfolioOptimizer",
    "ProfileConstraints",
    "Asset",
    "PROFILES",
    "convert_universe_to_assets",
    "validate_portfolio",
]
