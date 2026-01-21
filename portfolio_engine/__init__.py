# portfolio_engine/__init__.py
"""
Portfolio Engine v4.1 - Modular Preset Selectors

Architecture:
- universe.py       : Chargement et préparation des données (PAS de scoring)
- factors.py        : SEUL moteur d'alpha - scoring multi-facteur + Buffett
- optimizer.py      : Optimisation mean-variance + covariance hybride + hard filter Buffett
- llm_commentary.py : Génération des commentaires via LLM
- sector_quality.py : Métriques Buffett par secteur (utilisé par factors.py)
- preset_meta.py    : Presets EQUITY, buckets, contraintes par profil
- preset_etf.py     : Sélection ETF actions par profil (v1.0)
- preset_crypto.py  : Sélection crypto par profil (v1.0)
- preset_bond.py    : Sélection ETF obligations par profil (v1.0)
- etf_exposure.py   : Mapping ETF → exposure pour déduplication (v3.0)

PARI CENTRAL:
"Des entreprises de qualité fondamentale (ROIC > 10%, FCF positif)
avec un momentum positif sur 3-12 mois surperforment à horizon 1-3 ans."

Le LLM n'intervient PAS sur les poids - uniquement sur les justifications.
"""

# Universe (chargement données - PAS de scoring)
from .universe import (
    # Fonctions principales v3.0
    build_raw_universe,
    build_raw_universe_from_files,
    load_and_prepare_universe,
    load_etf_csv,
    filter_by_risk_bounds,
    # Filtres par catégorie
    filter_equities,
    filter_etfs,
    filter_crypto,
    # Helpers
    fnum,
    zscore,
    winsorize,
    sector_balanced_selection,
    # DEPRECATED (compatibilité)
    build_scored_universe,
    build_scored_universe_from_files,
    load_and_build_universe,
    compute_scores,
)

# Factors (SEUL moteur d'alpha)
from .factors import (
    FactorScorer,
    FactorWeights,
    PROFILE_WEIGHTS,
    rescore_universe_by_profile,
    get_factor_weights_summary,
    compute_buffett_quality_score,
    get_quality_coverage,
    compare_factor_profiles,
    SECTOR_QUALITY_THRESHOLDS,
)

# Optimizer (mean-variance + covariance hybride)
# NOTE: validate_portfolio removed - function does not exist in optimizer.py
from .optimizer import (
    PortfolioOptimizer,
    ProfileConstraints,
    Asset,
    PROFILES,
    convert_universe_to_assets,
    # Bucket/Preset
    assign_preset_to_asset,
    enrich_assets_with_buckets,
    # Deduplication
    deduplicate_etfs,
    deduplicate_stocks_by_corporate_group,
    # Hard filter
    apply_buffett_hard_filter,
    BUFFETT_HARD_FILTER_MIN,
    # Covariance hybride
    HybridCovarianceEstimator,
    COVARIANCE_EMPIRICAL_WEIGHT,
)

# ETF Exposure Mapping (v3.0 - séparation ticker/keywords)
from .etf_exposure import (
    TICKER_TO_EXPOSURE,
    KEYWORD_PATTERNS,
    detect_etf_exposure,
)

# LLM Commentary
from .llm_commentary import (
    build_commentary_prompt,
    parse_llm_response,
    generate_commentary_sync,
    generate_fallback_commentary,
    merge_commentary_into_portfolios,
    Commentary,
    SYSTEM_PROMPT,
)

# Sector Quality (Buffett Filter)
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

# Preset Meta (EQUITY presets)
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

# =============================================================================
# NEW: Modular Preset Selectors (v1.0)
# =============================================================================

# Preset ETF (actions) - Sélection par profil
from .preset_etf import (
    select_etfs_for_profile,
    get_etf_preset_summary,
    PROFILE_PRESETS as ETF_PROFILE_PRESETS,
    PROFILE_CONSTRAINTS as ETF_PROFILE_CONSTRAINTS,
)

# Preset Crypto - Sélection par profil
from .preset_crypto import (
    select_crypto_for_profile,
    get_crypto_preset_summary,
    PROFILE_PRESETS as CRYPTO_PROFILE_PRESETS,
    PROFILE_CONSTRAINTS as CRYPTO_PROFILE_CONSTRAINTS,
    STABLECOINS,
)

# Preset Bond (ETF obligations) - Sélection par profil
from .preset_bond import (
    select_bonds_for_profile,
    get_bond_preset_summary,
    PROFILE_PRESETS as BOND_PROFILE_PRESETS,
    PROFILE_CONSTRAINTS as BOND_PROFILE_CONSTRAINTS,
    RATING_TO_SCORE,
)

__version__ = "4.1.0"

__all__ = [
    # Universe (v3.0)
    "build_raw_universe",
    "build_raw_universe_from_files",
    "load_and_prepare_universe",
    "load_etf_csv",
    "filter_by_risk_bounds",
    "filter_equities",
    "filter_etfs",
    "filter_crypto",
    "fnum",
    "zscore",
    "winsorize",
    "sector_balanced_selection",
    # Universe (DEPRECATED)
    "build_scored_universe",
    "build_scored_universe_from_files",
    "load_and_build_universe",
    "compute_scores",
    # Factors (v2.0 - SEUL moteur d'alpha)
    "FactorScorer",
    "FactorWeights",
    "PROFILE_WEIGHTS",
    "rescore_universe_by_profile",
    "get_factor_weights_summary",
    "compute_buffett_quality_score",
    "get_quality_coverage",
    "compare_factor_profiles",
    "SECTOR_QUALITY_THRESHOLDS",
    # Optimizer (v6)
    "PortfolioOptimizer",
    "ProfileConstraints",
    "Asset",
    "PROFILES",
    "convert_universe_to_assets",
    "assign_preset_to_asset",
    "enrich_assets_with_buckets",
    "deduplicate_etfs",
    "deduplicate_stocks_by_corporate_group",
    "apply_buffett_hard_filter",
    "BUFFETT_HARD_FILTER_MIN",
    "HybridCovarianceEstimator",
    "COVARIANCE_EMPIRICAL_WEIGHT",
    # ETF Exposure (v3.0)
    "TICKER_TO_EXPOSURE",
    "KEYWORD_PATTERNS",
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
    # Preset Meta (EQUITY)
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
    # NEW: Preset ETF (v1.0)
    "select_etfs_for_profile",
    "get_etf_preset_summary",
    "ETF_PROFILE_PRESETS",
    "ETF_PROFILE_CONSTRAINTS",
    # NEW: Preset Crypto (v1.0)
    "select_crypto_for_profile",
    "get_crypto_preset_summary",
    "CRYPTO_PROFILE_PRESETS",
    "CRYPTO_PROFILE_CONSTRAINTS",
    "STABLECOINS",
    # NEW: Preset Bond (v1.0)
    "select_bonds_for_profile",
    "get_bond_preset_summary",
    "BOND_PROFILE_PRESETS",
    "BOND_PROFILE_CONSTRAINTS",
    "RATING_TO_SCORE",
]
