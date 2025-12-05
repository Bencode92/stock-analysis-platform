# portfolio_engine/__init__.py
"""
Portfolio Engine - Moteur quantitatif de construction de portefeuilles.

Architecture:
- universe.py       : Construction de l'univers d'actifs scorés
- factors.py        : Scoring multi-facteur configurable
- optimizer.py      : Optimisation mean-variance sous contraintes
- llm_commentary.py : Génération des commentaires via LLM (prompt compact)
- sector_quality.py : Filtre Buffett avec seuils ajustés par secteur

Le LLM n'intervient PAS sur les poids - uniquement sur les justifications.
"""

from .universe import (
    build_scored_universe,
    build_scored_universe_from_files,
    load_and_build_universe,
    load_etf_csv,
    compute_scores,
    filter_equities,
    filter_etfs,
    filter_crypto,
    fnum,
    zscore,
    winsorize,
    sector_balanced_selection,
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

from .sector_quality import (
    SECTOR_PROFILES,
    SECTOR_MAPPING,
    apply_buffett_filter,
    compute_buffett_penalty,
    compute_buffett_score,
    buffett_hard_filter,
    enrich_with_sector_stats,
    get_sector_summary,
    get_profile,
    get_sector_key,
)

__version__ = "2.2.0"

__all__ = [
    # Universe
    "build_scored_universe",
    "build_scored_universe_from_files",
    "load_and_build_universe",
    "load_etf_csv",
    "compute_scores",
    "filter_equities",
    "filter_etfs",
    "filter_crypto",
    "fnum",
    "zscore",
    "winsorize",
    "sector_balanced_selection",
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
    # Sector Quality (Buffett Filter)
    "SECTOR_PROFILES",
    "SECTOR_MAPPING",
    "apply_buffett_filter",
    "compute_buffett_penalty",
    "compute_buffett_score",
    "buffett_hard_filter",
    "enrich_with_sector_stats",
    "get_sector_summary",
    "get_profile",
    "get_sector_key",
]
