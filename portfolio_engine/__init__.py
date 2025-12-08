# portfolio_engine/__init__.py
"""
Portfolio Engine - Moteur quantitatif de construction de portefeuilles.

Architecture:
- universe.py       : Construction de l'univers d'actifs scorés
- factors.py        : Scoring multi-facteur configurable
- optimizer.py      : Optimisation mean-variance sous contraintes + buckets
- llm_commentary.py : Génération des commentaires via LLM (prompt compact)
- sector_quality.py : Filtre Buffett avec seuils ajustés par secteur
- preset_meta.py    : Presets, buckets, contraintes par profil (NEW)

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
    # New Phase 2 exports
    assign_preset_to_asset,
    enrich_assets_with_buckets,
    deduplicate_etfs,
    detect_etf_exposure,
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

# NEW: Preset Meta exports
from .preset_meta import (
    # Enums
    AssetClass,
    Role,
    RiskLevel,
    # Config
    PresetConfig,
    PRESET_META,
    EQUITY_PRESETS,
    ETF_PRESETS,
    CRYPTO_PRESETS,
    # Targets
    PROFILE_BUCKET_TARGETS,
    PROFILE_BENCHMARKS,
    # Priority
    EQUITY_PRESET_PRIORITY,
    ETF_PRESET_PRIORITY,
    CRYPTO_PRESET_PRIORITY,
    # ETF dedup
    ETF_EXPOSURE_EQUIVALENTS,
    deduplicate_etf_by_exposure,
    # Correlation
    CORRELATION_BY_GROUP,
    get_correlation,
    # Helpers
    get_preset_config,
    get_presets_by_role,
    get_presets_by_asset_class,
    get_bucket_targets,
    get_max_weight_for_preset,
    get_correlation_groups,
    validate_portfolio_buckets,
)

__version__ = "3.0.0"

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
    "assign_preset_to_asset",
    "enrich_assets_with_buckets",
    "deduplicate_etfs",
    "detect_etf_exposure",
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
    # Preset Meta (NEW)
    "AssetClass",
    "Role",
    "RiskLevel",
    "PresetConfig",
    "PRESET_META",
    "EQUITY_PRESETS",
    "ETF_PRESETS",
    "CRYPTO_PRESETS",
    "PROFILE_BUCKET_TARGETS",
    "PROFILE_BENCHMARKS",
    "EQUITY_PRESET_PRIORITY",
    "ETF_PRESET_PRIORITY",
    "CRYPTO_PRESET_PRIORITY",
    "ETF_EXPOSURE_EQUIVALENTS",
    "deduplicate_etf_by_exposure",
    "CORRELATION_BY_GROUP",
    "get_correlation",
    "get_preset_config",
    "get_presets_by_role",
    "get_presets_by_asset_class",
    "get_bucket_targets",
    "get_max_weight_for_preset",
    "get_correlation_groups",
    "validate_portfolio_buckets",
]
