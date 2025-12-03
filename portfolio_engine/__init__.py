# portfolio_engine/__init__.py
"""
Portfolio Engine - Moteur quantitatif de construction de portefeuilles.

Architecture:
- universe.py       : Construction de l'univers d'actifs scorés
- factors.py        : Scoring multi-facteur configurable
- optimizer.py      : Optimisation mean-variance sous contraintes
- llm_commentary.py : Génération des commentaires via LLM (prompt compact)

Le LLM n'intervient PAS sur les poids - uniquement sur les justifications.
"""

from .universe import (
    build_scored_universe,
    load_and_build_universe,
    load_etf_csv,
    compute_scores,
    filter_equities,
    filter_etfs,
    filter_crypto,
)

from .factors import (
    FactorScorer,
    FactorWeights,
    PROFILE_WEIGHTS,
    rescore_universe_by_profile,
    get_factor_weights_summary,
)

from .optimizer import (
    PortfolioOptimizer,
    ProfileConstraints,
    Asset,
    PROFILES,
    convert_universe_to_assets,
    validate_portfolio,
)

from .llm_commentary import (
    build_commentary_prompt,
    parse_llm_response,
    generate_commentary_sync,
    generate_fallback_commentary,
    merge_commentary_into_portfolios,
    Commentary,
    SYSTEM_PROMPT,
)

__version__ = "2.0.0"

__all__ = [
    # Universe
    "build_scored_universe",
    "load_and_build_universe",
    "load_etf_csv",
    "compute_scores",
    "filter_equities",
    "filter_etfs",
    "filter_crypto",
    # Factors
    "FactorScorer",
    "FactorWeights",
    "PROFILE_WEIGHTS",
    "rescore_universe_by_profile",
    "get_factor_weights_summary",
    # Optimizer
    "PortfolioOptimizer",
    "ProfileConstraints",
    "Asset",
    "PROFILES",
    "convert_universe_to_assets",
    "validate_portfolio",
    # LLM Commentary
    "build_commentary_prompt",
    "parse_llm_response",
    "generate_commentary_sync",
    "generate_fallback_commentary",
    "merge_commentary_into_portfolios",
    "Commentary",
    "SYSTEM_PROMPT",
]
