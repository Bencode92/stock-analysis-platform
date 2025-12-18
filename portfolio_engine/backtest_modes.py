# portfolio_engine/backtest_modes.py
"""
Backtest Modes: ILLUSTRATIVE vs RESEARCH.

P2-13 - 2025-12-18

Separates client-facing backtests from internal research backtests.

ILLUSTRATIVE mode:
- For clients/external use
- No misleading metrics (Sharpe < 1 year, alpha, IR)
- Mandatory AMF disclaimer
- publishable: true

RESEARCH mode:
- For internal analysis
- Full metrics suite
- Monte Carlo simulation
- Bootstrap confidence intervals
- Warnings about limitations
- publishable: false

Design rationale:
- Prevents client confusion from overfitted/misleading metrics
- Compliance with AMF regulations on performance presentation
- Clear separation of concerns
"""

import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

# Try to import structured logging
try:
    from portfolio_engine.structured_logging import (
        get_structured_logger,
        log_event,
    )
    HAS_STRUCTURED_LOGGING = True
except ImportError:
    HAS_STRUCTURED_LOGGING = False
    import logging
    def get_structured_logger(name):
        return logging.getLogger(name)
    def log_event(logger, event, **kwargs):
        logger.info(f"{event}: {kwargs}")

logger = get_structured_logger("portfolio_engine.backtest_modes")


# ============================================================
# ENUMS
# ============================================================

class BacktestMode(Enum):
    """
    Backtest execution modes.
    
    ILLUSTRATIVE: Client-facing, simplified, compliant
    RESEARCH: Internal, comprehensive, with warnings
    """
    ILLUSTRATIVE = "illustrative"
    RESEARCH = "research"


# ============================================================
# DISCLAIMERS & WARNINGS
# ============================================================

# AMF-compliant disclaimer (French regulation)
AMF_DISCLAIMER_FR = """
⚠️ AVERTISSEMENT - PERFORMANCES PASSÉES
Les performances passées ne préjugent pas des performances futures.
Les données présentées sont des simulations basées sur des données historiques
et ne constituent pas une garantie de résultats futurs.
Ce document est fourni à titre informatif uniquement et ne constitue pas
un conseil en investissement au sens de la réglementation AMF.
"""

AMF_DISCLAIMER_EN = """
⚠️ WARNING - PAST PERFORMANCE
Past performance is not indicative of future results.
The data presented are simulations based on historical data
and do not constitute a guarantee of future results.
This document is provided for informational purposes only and does not
constitute investment advice within the meaning of AMF regulations.
"""

# Research mode warnings
RESEARCH_WARNINGS = {
    "look_ahead_bias": (
        "⚠️ LOOK-AHEAD BIAS RISK: Backtest uses information that may not have "
        "been available at the time of hypothetical trades."
    ),
    "survivorship_bias": (
        "⚠️ SURVIVORSHIP BIAS: Universe may exclude delisted/failed assets, "
        "overstating historical returns."
    ),
    "transaction_costs": (
        "⚠️ TRANSACTION COSTS: Estimated costs may understate real-world "
        "slippage, especially for illiquid assets."
    ),
    "data_quality": (
        "⚠️ DATA QUALITY: Historical prices may contain errors, splits, "
        "or corporate actions not fully adjusted."
    ),
    "overfitting": (
        "⚠️ OVERFITTING RISK: Strategy parameters may be overfit to "
        "historical data and fail out-of-sample."
    ),
}


# ============================================================
# METRIC RESTRICTIONS
# ============================================================

# Metrics allowed in ILLUSTRATIVE mode
ILLUSTRATIVE_ALLOWED_METRICS = {
    # Basic returns
    "total_return_pct",
    "annualized_return_pct",
    "return_gross_pct",
    "return_net_pct",
    
    # Volatility
    "volatility_annualized_pct",
    "max_drawdown_pct",
    
    # Risk-adjusted (only if period >= 1 year)
    "sharpe_ratio",  # Conditional on period
    
    # Benchmark comparison (simple)
    "benchmark_return_pct",
    "excess_return_pct",
    
    # Basic stats
    "n_days",
    "start_date",
    "end_date",
    "n_assets",
}

# Metrics FORBIDDEN in ILLUSTRATIVE mode (misleading for clients)
ILLUSTRATIVE_FORBIDDEN_METRICS = {
    # Risk-adjusted metrics requiring long history
    "information_ratio",
    "alpha",
    "beta",
    "treynor_ratio",
    
    # Statistical metrics clients may misinterpret
    "sortino_ratio",
    "calmar_ratio",
    "omega_ratio",
    
    # Overfitting-prone metrics
    "hit_rate",
    "profit_factor",
    "win_loss_ratio",
    
    # Internal metrics
    "monte_carlo_var",
    "bootstrap_ci_lower",
    "bootstrap_ci_upper",
    "p_value",
}

# Minimum period for Sharpe ratio (AMF recommendation)
MIN_SHARPE_PERIOD_DAYS = 252  # 1 year


# ============================================================
# MODE CONFIGURATION
# ============================================================

@dataclass
class BacktestModeConfig:
    """
    Configuration for a specific backtest mode.
    
    Attributes:
        mode: The backtest mode
        include_disclaimer: Whether to include AMF disclaimer
        disclaimer_language: Language for disclaimer ("fr" or "en")
        allowed_metrics: Set of metrics allowed in output
        forbidden_metrics: Set of metrics to exclude
        include_warnings: Whether to include research warnings
        warnings_to_include: Specific warnings to include
        publishable: Whether output can be shared externally
        monte_carlo_runs: Number of Monte Carlo simulations (0 = disabled)
        bootstrap_samples: Number of bootstrap samples (0 = disabled)
        confidence_level: Confidence level for intervals
    """
    mode: BacktestMode
    include_disclaimer: bool = True
    disclaimer_language: str = "fr"
    allowed_metrics: set = field(default_factory=set)
    forbidden_metrics: set = field(default_factory=set)
    include_warnings: bool = False
    warnings_to_include: List[str] = field(default_factory=list)
    publishable: bool = False
    monte_carlo_runs: int = 0
    bootstrap_samples: int = 0
    confidence_level: float = 0.95


def get_mode_config(mode: BacktestMode) -> BacktestModeConfig:
    """
    Get configuration for a specific backtest mode.
    
    Args:
        mode: BacktestMode enum value
    
    Returns:
        BacktestModeConfig with appropriate settings
    """
    if mode == BacktestMode.ILLUSTRATIVE:
        return BacktestModeConfig(
            mode=mode,
            include_disclaimer=True,
            disclaimer_language="fr",
            allowed_metrics=ILLUSTRATIVE_ALLOWED_METRICS.copy(),
            forbidden_metrics=ILLUSTRATIVE_FORBIDDEN_METRICS.copy(),
            include_warnings=False,
            warnings_to_include=[],
            publishable=True,
            monte_carlo_runs=0,
            bootstrap_samples=0,
            confidence_level=0.95,
        )
    
    elif mode == BacktestMode.RESEARCH:
        return BacktestModeConfig(
            mode=mode,
            include_disclaimer=False,
            disclaimer_language="en",
            allowed_metrics=set(),  # All metrics allowed
            forbidden_metrics=set(),  # No restrictions
            include_warnings=True,
            warnings_to_include=list(RESEARCH_WARNINGS.keys()),
            publishable=False,
            monte_carlo_runs=1000,
            bootstrap_samples=1000,
            confidence_level=0.95,
        )
    
    else:
        raise ValueError(f"Unknown backtest mode: {mode}")


# ============================================================
# METRIC FILTERING
# ============================================================

def filter_metrics_for_mode(
    metrics: Dict[str, Any],
    config: BacktestModeConfig,
    n_days: int,
) -> Dict[str, Any]:
    """
    Filter metrics based on mode configuration.
    
    Args:
        metrics: Raw metrics dict
        config: Mode configuration
        n_days: Number of trading days in backtest period
    
    Returns:
        Filtered metrics dict
    """
    filtered = {}
    
    for key, value in metrics.items():
        # Check forbidden list
        if key in config.forbidden_metrics:
            continue
        
        # Check allowed list (if not empty)
        if config.allowed_metrics and key not in config.allowed_metrics:
            # Special case: allow if it's a basic stat
            if not key.startswith("_"):
                continue
        
        # Special handling for Sharpe ratio
        if key == "sharpe_ratio" and n_days < MIN_SHARPE_PERIOD_DAYS:
            if config.mode == BacktestMode.ILLUSTRATIVE:
                # Mask Sharpe for short periods in illustrative mode
                filtered["sharpe_ratio"] = None
                filtered["sharpe_ratio_note"] = (
                    f"Sharpe ratio not shown (period < {MIN_SHARPE_PERIOD_DAYS} days)"
                )
                continue
        
        filtered[key] = value
    
    return filtered


# ============================================================
# OUTPUT FORMATTING
# ============================================================

@dataclass
class BacktestOutput:
    """
    Formatted backtest output with mode-specific content.
    
    Attributes:
        mode: The backtest mode used
        metrics: Filtered metrics
        disclaimer: Optional disclaimer text
        warnings: List of warning messages
        publishable: Whether this output can be shared
        metadata: Additional metadata
    """
    mode: BacktestMode
    metrics: Dict[str, Any]
    disclaimer: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    publishable: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "_backtest_mode": {
                "mode": self.mode.value,
                "publishable": self.publishable,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
            "metrics": self.metrics,
        }
        
        if self.disclaimer:
            result["_disclaimer"] = self.disclaimer
        
        if self.warnings:
            result["_warnings"] = self.warnings
        
        if self.metadata:
            result["_metadata"] = self.metadata
        
        return result


def format_backtest_output(
    raw_metrics: Dict[str, Any],
    mode: BacktestMode,
    n_days: int,
    additional_metadata: Optional[Dict] = None,
) -> BacktestOutput:
    """
    Format backtest output according to mode.
    
    Args:
        raw_metrics: Raw metrics from backtest engine
        mode: Backtest mode
        n_days: Number of trading days
        additional_metadata: Optional extra metadata
    
    Returns:
        BacktestOutput with filtered content
    """
    config = get_mode_config(mode)
    
    # Filter metrics
    filtered_metrics = filter_metrics_for_mode(raw_metrics, config, n_days)
    
    # Build disclaimer
    disclaimer = None
    if config.include_disclaimer:
        if config.disclaimer_language == "fr":
            disclaimer = AMF_DISCLAIMER_FR.strip()
        else:
            disclaimer = AMF_DISCLAIMER_EN.strip()
    
    # Build warnings
    warnings_list = []
    if config.include_warnings:
        for warning_key in config.warnings_to_include:
            if warning_key in RESEARCH_WARNINGS:
                warnings_list.append(RESEARCH_WARNINGS[warning_key])
    
    # Build metadata
    metadata = {
        "mode": mode.value,
        "n_days": n_days,
        "min_sharpe_period": MIN_SHARPE_PERIOD_DAYS,
        "sharpe_valid": n_days >= MIN_SHARPE_PERIOD_DAYS,
    }
    if additional_metadata:
        metadata.update(additional_metadata)
    
    # Research mode: add Monte Carlo / Bootstrap info
    if mode == BacktestMode.RESEARCH:
        metadata["monte_carlo_runs"] = config.monte_carlo_runs
        metadata["bootstrap_samples"] = config.bootstrap_samples
        metadata["confidence_level"] = config.confidence_level
    
    return BacktestOutput(
        mode=mode,
        metrics=filtered_metrics,
        disclaimer=disclaimer,
        warnings=warnings_list,
        publishable=config.publishable,
        metadata=metadata,
    )


# ============================================================
# MONTE CARLO SIMULATION (Research mode only)
# ============================================================

def run_monte_carlo_simulation(
    returns: np.ndarray,
    n_runs: int = 1000,
    n_days: int = 252,
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run Monte Carlo simulation for return distribution.
    
    Uses bootstrap resampling of historical returns to generate
    simulated future paths.
    
    Args:
        returns: Historical daily returns array
        n_runs: Number of simulation runs
        n_days: Number of days to simulate
        seed: Random seed for reproducibility
    
    Returns:
        Dict with simulation results
    """
    if len(returns) < 20:
        return {"error": "Insufficient data for Monte Carlo (need >= 20 days)"}
    
    rng = np.random.default_rng(seed)
    
    # Bootstrap resampling
    simulated_cumulative = []
    
    for _ in range(n_runs):
        # Sample with replacement
        sampled_returns = rng.choice(returns, size=n_days, replace=True)
        cumulative = np.prod(1 + sampled_returns) - 1
        simulated_cumulative.append(cumulative)
    
    simulated_cumulative = np.array(simulated_cumulative)
    
    # Calculate statistics
    return {
        "monte_carlo": {
            "n_runs": n_runs,
            "n_days_simulated": n_days,
            "mean_return_pct": float(np.mean(simulated_cumulative) * 100),
            "median_return_pct": float(np.median(simulated_cumulative) * 100),
            "std_return_pct": float(np.std(simulated_cumulative) * 100),
            "percentile_5_pct": float(np.percentile(simulated_cumulative, 5) * 100),
            "percentile_25_pct": float(np.percentile(simulated_cumulative, 25) * 100),
            "percentile_75_pct": float(np.percentile(simulated_cumulative, 75) * 100),
            "percentile_95_pct": float(np.percentile(simulated_cumulative, 95) * 100),
            "prob_positive_pct": float(np.mean(simulated_cumulative > 0) * 100),
            "prob_loss_10_pct": float(np.mean(simulated_cumulative < -0.10) * 100),
        }
    }


def calculate_bootstrap_ci(
    returns: np.ndarray,
    metric_fn: callable,
    n_samples: int = 1000,
    confidence_level: float = 0.95,
    seed: Optional[int] = None,
) -> Dict[str, float]:
    """
    Calculate bootstrap confidence intervals for a metric.
    
    Args:
        returns: Historical returns array
        metric_fn: Function that computes the metric from returns
        n_samples: Number of bootstrap samples
        confidence_level: Confidence level (e.g., 0.95)
        seed: Random seed for reproducibility
    
    Returns:
        Dict with point estimate and CI bounds
    """
    if len(returns) < 20:
        return {"error": "Insufficient data for bootstrap"}
    
    rng = np.random.default_rng(seed)
    
    # Bootstrap
    bootstrap_metrics = []
    n = len(returns)
    
    for _ in range(n_samples):
        sample = rng.choice(returns, size=n, replace=True)
        try:
            metric_value = metric_fn(sample)
            if np.isfinite(metric_value):
                bootstrap_metrics.append(metric_value)
        except Exception:
            continue
    
    if len(bootstrap_metrics) < n_samples * 0.5:
        return {"error": "Too many bootstrap failures"}
    
    bootstrap_metrics = np.array(bootstrap_metrics)
    
    # Calculate CI
    alpha = 1 - confidence_level
    lower = np.percentile(bootstrap_metrics, alpha / 2 * 100)
    upper = np.percentile(bootstrap_metrics, (1 - alpha / 2) * 100)
    
    return {
        "point_estimate": float(metric_fn(returns)),
        "ci_lower": float(lower),
        "ci_upper": float(upper),
        "confidence_level": confidence_level,
        "n_samples": len(bootstrap_metrics),
    }


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

def create_illustrative_output(
    metrics: Dict[str, Any],
    n_days: int,
    language: str = "fr",
) -> BacktestOutput:
    """
    Convenience function for illustrative mode output.
    
    Args:
        metrics: Raw backtest metrics
        n_days: Number of trading days
        language: Disclaimer language ("fr" or "en")
    
    Returns:
        BacktestOutput configured for client use
    """
    output = format_backtest_output(
        raw_metrics=metrics,
        mode=BacktestMode.ILLUSTRATIVE,
        n_days=n_days,
        additional_metadata={"disclaimer_language": language},
    )
    
    # Override language if different from default
    if language == "en":
        output.disclaimer = AMF_DISCLAIMER_EN.strip()
    
    log_event(logger, "backtest_output_created",
        message="Illustrative backtest output created",
        mode="illustrative",
        n_days=n_days,
        n_metrics=len(output.metrics),
        publishable=True,
    )
    
    return output


def create_research_output(
    metrics: Dict[str, Any],
    returns: Optional[np.ndarray] = None,
    n_days: int = 252,
    run_monte_carlo: bool = True,
    run_bootstrap: bool = True,
    seed: Optional[int] = None,
) -> BacktestOutput:
    """
    Convenience function for research mode output.
    
    Args:
        metrics: Raw backtest metrics
        returns: Daily returns array (for simulations)
        n_days: Number of trading days
        run_monte_carlo: Whether to run Monte Carlo simulation
        run_bootstrap: Whether to run bootstrap CI
        seed: Random seed for reproducibility
    
    Returns:
        BacktestOutput configured for research use
    """
    config = get_mode_config(BacktestMode.RESEARCH)
    
    # Start with filtered metrics
    output = format_backtest_output(
        raw_metrics=metrics,
        mode=BacktestMode.RESEARCH,
        n_days=n_days,
    )
    
    # Add Monte Carlo if returns provided
    if returns is not None and run_monte_carlo:
        mc_results = run_monte_carlo_simulation(
            returns=returns,
            n_runs=config.monte_carlo_runs,
            n_days=252,  # 1 year projection
            seed=seed,
        )
        output.metrics.update(mc_results)
    
    # Add bootstrap CI for Sharpe ratio if returns provided
    if returns is not None and run_bootstrap and len(returns) >= 20:
        def sharpe_fn(r):
            return np.mean(r) / np.std(r) * np.sqrt(252) if np.std(r) > 0 else 0
        
        bootstrap_sharpe = calculate_bootstrap_ci(
            returns=returns,
            metric_fn=sharpe_fn,
            n_samples=config.bootstrap_samples,
            confidence_level=config.confidence_level,
            seed=seed,
        )
        output.metrics["sharpe_ratio_bootstrap"] = bootstrap_sharpe
    
    log_event(logger, "backtest_output_created",
        message="Research backtest output created",
        mode="research",
        n_days=n_days,
        n_metrics=len(output.metrics),
        has_monte_carlo=run_monte_carlo and returns is not None,
        has_bootstrap=run_bootstrap and returns is not None,
        publishable=False,
    )
    
    return output


# ============================================================
# VALIDATION
# ============================================================

def validate_publishable(output: BacktestOutput) -> Tuple[bool, List[str]]:
    """
    Validate that output is safe to publish.
    
    Args:
        output: BacktestOutput to validate
    
    Returns:
        (is_valid, list of issues)
    """
    issues = []
    
    # Check mode
    if output.mode != BacktestMode.ILLUSTRATIVE:
        issues.append(f"Mode {output.mode.value} is not publishable")
    
    # Check publishable flag
    if not output.publishable:
        issues.append("Output marked as not publishable")
    
    # Check for forbidden metrics that slipped through
    for key in output.metrics.keys():
        if key in ILLUSTRATIVE_FORBIDDEN_METRICS:
            issues.append(f"Forbidden metric present: {key}")
    
    # Check disclaimer
    if output.disclaimer is None:
        issues.append("Missing AMF disclaimer")
    
    return len(issues) == 0, issues


# ============================================================
# EXAMPLE USAGE
# ============================================================

def _example_usage():
    """Example showing complete usage pattern."""
    
    # Sample metrics from backtest
    raw_metrics = {
        "total_return_pct": 15.5,
        "annualized_return_pct": 12.3,
        "volatility_annualized_pct": 18.5,
        "sharpe_ratio": 0.67,
        "max_drawdown_pct": -12.5,
        "benchmark_return_pct": 10.2,
        "excess_return_pct": 5.3,
        "n_days": 504,
        "start_date": "2023-01-01",
        "end_date": "2024-12-31",
        # These should be filtered in ILLUSTRATIVE
        "information_ratio": 0.45,
        "alpha": 0.03,
        "beta": 0.85,
    }
    
    # 1. Create ILLUSTRATIVE output for clients
    illustrative = create_illustrative_output(
        metrics=raw_metrics,
        n_days=504,
        language="fr",
    )
    
    print("=== ILLUSTRATIVE OUTPUT ===")
    print(f"Publishable: {illustrative.publishable}")
    print(f"Metrics included: {list(illustrative.metrics.keys())}")
    print(f"Has alpha? {'alpha' in illustrative.metrics}")  # Should be False
    print(f"Disclaimer: {illustrative.disclaimer[:50]}...")
    
    # Validate
    is_valid, issues = validate_publishable(illustrative)
    print(f"Valid for publishing: {is_valid}")
    
    # 2. Create RESEARCH output for internal use
    returns = np.random.normal(0.0005, 0.015, 504)  # Simulated returns
    
    research = create_research_output(
        metrics=raw_metrics,
        returns=returns,
        n_days=504,
        run_monte_carlo=True,
        run_bootstrap=True,
        seed=42,
    )
    
    print("\n=== RESEARCH OUTPUT ===")
    print(f"Publishable: {research.publishable}")
    print(f"Has alpha? {'alpha' in research.metrics}")  # Should be True
    print(f"Has Monte Carlo? {'monte_carlo' in research.metrics}")
    print(f"Warnings: {len(research.warnings)}")
    for warning in research.warnings[:2]:
        print(f"  - {warning[:60]}...")
