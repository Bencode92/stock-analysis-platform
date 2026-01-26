# portfolio_engine/__init__.py
"""
Portfolio Engine v4.2.0 - Phase 2.5 Refactoring + preset_etf + risk_analysis

Architecture:
- universe.py       : Chargement et préparation des données (PAS de scoring)
- factors.py        : SEUL moteur d'alpha - scoring multi-facteur + Buffett
- optimizer.py      : Optimisation mean-variance + covariance hybride + hard filter Buffett
- llm_commentary.py : Génération des commentaires via LLM
- sector_quality.py : Métriques Buffett par secteur (utilisé par factors.py)
- preset_meta.py    : Presets, buckets, contraintes par profil
- preset_etf.py     : Sélection ETF avancée avec scoring 8 composantes (v6.30)
- etf_exposure.py   : Mapping ETF → exposure pour déduplication (v3.0)
- risk_analysis.py  : Analyse de risque post-optimisation (v1.0.0) [NEW]

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

# Preset Meta
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
# Preset ETF (v6.30 - Sélection ETF avancée avec scoring 8 composantes)
# =============================================================================
try:
    from .preset_etf import (
        # Main function
        select_etfs_for_profile,
        # Summary & diagnostics
        get_etf_preset_summary,
        run_sanity_checks as etf_sanity_checks,
        run_unit_tests as etf_unit_tests,
        # Configs
        PRESET_CONFIGS as ETF_PRESET_CONFIGS,
        PROFILE_PRESETS as ETF_PROFILE_PRESETS,
        PROFILE_CONSTRAINTS as ETF_PROFILE_CONSTRAINTS,
        SCORING_WEIGHTS as ETF_SCORING_WEIGHTS,
        # Enums
        ETFRole,
        ETFRiskLevel,
        CorrelationGroup,
        # Helpers
        apply_data_qc_filters as etf_apply_data_qc_filters,
        apply_hard_constraints as etf_apply_hard_constraints,
        compute_profile_score as etf_compute_profile_score,
        deduplicate_underlying as etf_deduplicate_underlying,
    )
    HAS_PRESET_ETF = True
except ImportError as e:
    HAS_PRESET_ETF = False
    # Placeholders pour éviter ImportError si preset_etf n'est pas disponible
    select_etfs_for_profile = None
    get_etf_preset_summary = None
    etf_sanity_checks = None
    etf_unit_tests = None
    ETF_PRESET_CONFIGS = {}
    ETF_PROFILE_PRESETS = {}
    ETF_PROFILE_CONSTRAINTS = {}
    ETF_SCORING_WEIGHTS = {}
    ETFRole = None
    ETFRiskLevel = None
    CorrelationGroup = None
    etf_apply_data_qc_filters = None
    etf_apply_hard_constraints = None
    etf_compute_profile_score = None
    etf_deduplicate_underlying = None

# =============================================================================
# Risk Analysis (v1.0.0 - Post-optimization risk enrichment)
# =============================================================================
try:
    from .risk_analysis import (
        # Main class
        RiskAnalyzer,
        # Convenience function
        enrich_portfolio_with_risk_analysis,
        # Detection functions
        detect_leveraged_instruments,
        detect_preferred_stocks,
        detect_low_liquidity,
        # Analysis functions
        compute_leverage_stress_multiplier,
        compute_preferred_dual_shock,
        compute_tail_risk_metrics,
        compute_liquidity_score,
        # Alert generation
        generate_alerts,
        # Data classes
        LeverageAnalysis,
        PreferredStockAnalysis,
        TailRiskMetrics,
        LiquidityAnalysis,
        RiskAlert,
        RiskAnalysisResult,
        # Constants
        ALERT_THRESHOLDS,
        LEVERAGE_TICKERS,
        PREFERRED_TICKERS,
    )
    HAS_RISK_ANALYSIS = True
except ImportError as e:
    HAS_RISK_ANALYSIS = False
    # Placeholders pour éviter ImportError si risk_analysis n'est pas disponible
    RiskAnalyzer = None
    enrich_portfolio_with_risk_analysis = None
    detect_leveraged_instruments = None
    detect_preferred_stocks = None
    detect_low_liquidity = None
    compute_leverage_stress_multiplier = None
    compute_preferred_dual_shock = None
    compute_tail_risk_metrics = None
    compute_liquidity_score = None
    generate_alerts = None
    LeverageAnalysis = None
    PreferredStockAnalysis = None
    TailRiskMetrics = None
    LiquidityAnalysis = None
    RiskAlert = None
    RiskAnalysisResult = None
    ALERT_THRESHOLDS = {}
    LEVERAGE_TICKERS = set()
    PREFERRED_TICKERS = set()

__version__ = "4.2.0"

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
    # Preset Meta
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
    # Preset ETF (v6.30 - Sélection ETF avancée)
    "HAS_PRESET_ETF",
    "select_etfs_for_profile",
    "get_etf_preset_summary",
    "etf_sanity_checks",
    "etf_unit_tests",
    "ETF_PRESET_CONFIGS",
    "ETF_PROFILE_PRESETS",
    "ETF_PROFILE_CONSTRAINTS",
    "ETF_SCORING_WEIGHTS",
    "ETFRole",
    "ETFRiskLevel",
    "CorrelationGroup",
    "etf_apply_data_qc_filters",
    "etf_apply_hard_constraints",
    "etf_compute_profile_score",
    "etf_deduplicate_underlying",
    # Risk Analysis (v1.0.0 - Post-optimization risk enrichment)
    "HAS_RISK_ANALYSIS",
    "RiskAnalyzer",
    "enrich_portfolio_with_risk_analysis",
    "detect_leveraged_instruments",
    "detect_preferred_stocks",
    "detect_low_liquidity",
    "compute_leverage_stress_multiplier",
    "compute_preferred_dual_shock",
    "compute_tail_risk_metrics",
    "compute_liquidity_score",
    "generate_alerts",
    "LeverageAnalysis",
    "PreferredStockAnalysis",
    "TailRiskMetrics",
    "LiquidityAnalysis",
    "RiskAlert",
    "RiskAnalysisResult",
    "ALERT_THRESHOLDS",
    "LEVERAGE_TICKERS",
    "PREFERRED_TICKERS",
]
