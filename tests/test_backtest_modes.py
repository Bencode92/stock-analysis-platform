# tests/test_backtest_modes.py
"""
Tests for Backtest Modes module.

P2-13 - 2025-12-18
"""

import pytest
import numpy as np
from datetime import datetime

from portfolio_engine.backtest_modes import (
    # Enums
    BacktestMode,
    # Config
    BacktestModeConfig,
    get_mode_config,
    # Constants
    ILLUSTRATIVE_ALLOWED_METRICS,
    ILLUSTRATIVE_FORBIDDEN_METRICS,
    MIN_SHARPE_PERIOD_DAYS,
    AMF_DISCLAIMER_FR,
    AMF_DISCLAIMER_EN,
    RESEARCH_WARNINGS,
    # Functions
    filter_metrics_for_mode,
    format_backtest_output,
    create_illustrative_output,
    create_research_output,
    validate_publishable,
    run_monte_carlo_simulation,
    calculate_bootstrap_ci,
    # Classes
    BacktestOutput,
)


class TestBacktestMode:
    """Tests for BacktestMode enum."""
    
    def test_mode_values(self):
        """Modes have correct string values."""
        assert BacktestMode.ILLUSTRATIVE.value == "illustrative"
        assert BacktestMode.RESEARCH.value == "research"
    
    def test_all_modes_exist(self):
        """All expected modes exist."""
        modes = list(BacktestMode)
        assert len(modes) == 2


class TestBacktestModeConfig:
    """Tests for mode configuration."""
    
    def test_illustrative_config(self):
        """Illustrative mode has correct defaults."""
        config = get_mode_config(BacktestMode.ILLUSTRATIVE)
        
        assert config.mode == BacktestMode.ILLUSTRATIVE
        assert config.include_disclaimer is True
        assert config.disclaimer_language == "fr"
        assert config.publishable is True
        assert config.monte_carlo_runs == 0
        assert config.bootstrap_samples == 0
        assert len(config.allowed_metrics) > 0
        assert len(config.forbidden_metrics) > 0
    
    def test_research_config(self):
        """Research mode has correct defaults."""
        config = get_mode_config(BacktestMode.RESEARCH)
        
        assert config.mode == BacktestMode.RESEARCH
        assert config.include_disclaimer is False
        assert config.publishable is False
        assert config.monte_carlo_runs == 1000
        assert config.bootstrap_samples == 1000
        assert config.include_warnings is True
        assert len(config.warnings_to_include) > 0
    
    def test_invalid_mode_raises(self):
        """Invalid mode raises ValueError."""
        with pytest.raises(ValueError):
            get_mode_config("invalid")


class TestMetricFiltering:
    """Tests for metric filtering."""
    
    @pytest.fixture
    def raw_metrics(self):
        """Sample raw metrics."""
        return {
            # Allowed in illustrative
            "total_return_pct": 15.5,
            "annualized_return_pct": 12.3,
            "volatility_annualized_pct": 18.5,
            "sharpe_ratio": 0.67,
            "max_drawdown_pct": -12.5,
            "n_days": 504,
            # Forbidden in illustrative
            "information_ratio": 0.45,
            "alpha": 0.03,
            "beta": 0.85,
            "sortino_ratio": 0.82,
        }
    
    def test_illustrative_filters_forbidden(self, raw_metrics):
        """Illustrative mode filters forbidden metrics."""
        config = get_mode_config(BacktestMode.ILLUSTRATIVE)
        filtered = filter_metrics_for_mode(raw_metrics, config, n_days=504)
        
        assert "total_return_pct" in filtered
        assert "sharpe_ratio" in filtered
        assert "alpha" not in filtered
        assert "beta" not in filtered
        assert "information_ratio" not in filtered
        assert "sortino_ratio" not in filtered
    
    def test_research_keeps_all(self, raw_metrics):
        """Research mode keeps all metrics."""
        config = get_mode_config(BacktestMode.RESEARCH)
        filtered = filter_metrics_for_mode(raw_metrics, config, n_days=504)
        
        assert "total_return_pct" in filtered
        assert "alpha" in filtered
        assert "beta" in filtered
        assert "information_ratio" in filtered
    
    def test_sharpe_masked_short_period_illustrative(self, raw_metrics):
        """Sharpe is masked for short periods in illustrative mode."""
        config = get_mode_config(BacktestMode.ILLUSTRATIVE)
        
        # Short period (less than 1 year)
        filtered = filter_metrics_for_mode(raw_metrics, config, n_days=100)
        
        assert filtered.get("sharpe_ratio") is None
        assert "sharpe_ratio_note" in filtered
    
    def test_sharpe_shown_long_period_illustrative(self, raw_metrics):
        """Sharpe is shown for long periods in illustrative mode."""
        config = get_mode_config(BacktestMode.ILLUSTRATIVE)
        
        # Long period (more than 1 year)
        filtered = filter_metrics_for_mode(raw_metrics, config, n_days=300)
        
        assert filtered.get("sharpe_ratio") == 0.67
    
    def test_sharpe_shown_short_period_research(self, raw_metrics):
        """Sharpe is shown even for short periods in research mode."""
        config = get_mode_config(BacktestMode.RESEARCH)
        
        filtered = filter_metrics_for_mode(raw_metrics, config, n_days=100)
        
        assert filtered.get("sharpe_ratio") == 0.67


class TestBacktestOutput:
    """Tests for BacktestOutput dataclass."""
    
    def test_to_dict(self):
        """Output converts to dict correctly."""
        output = BacktestOutput(
            mode=BacktestMode.ILLUSTRATIVE,
            metrics={"total_return_pct": 15.5},
            disclaimer="Test disclaimer",
            warnings=["Warning 1"],
            publishable=True,
            metadata={"key": "value"},
        )
        
        d = output.to_dict()
        
        assert d["_backtest_mode"]["mode"] == "illustrative"
        assert d["_backtest_mode"]["publishable"] is True
        assert d["metrics"]["total_return_pct"] == 15.5
        assert d["_disclaimer"] == "Test disclaimer"
        assert d["_warnings"] == ["Warning 1"]
        assert d["_metadata"]["key"] == "value"
    
    def test_to_dict_no_optional_fields(self):
        """Output dict omits None fields."""
        output = BacktestOutput(
            mode=BacktestMode.RESEARCH,
            metrics={"alpha": 0.03},
            publishable=False,
        )
        
        d = output.to_dict()
        
        assert "_disclaimer" not in d
        assert "_warnings" not in d
        assert "_metadata" not in d


class TestFormatBacktestOutput:
    """Tests for format_backtest_output function."""
    
    @pytest.fixture
    def raw_metrics(self):
        return {
            "total_return_pct": 15.5,
            "alpha": 0.03,
            "sharpe_ratio": 0.67,
        }
    
    def test_illustrative_has_disclaimer(self, raw_metrics):
        """Illustrative output includes disclaimer."""
        output = format_backtest_output(
            raw_metrics=raw_metrics,
            mode=BacktestMode.ILLUSTRATIVE,
            n_days=300,
        )
        
        assert output.disclaimer is not None
        assert "AVERTISSEMENT" in output.disclaimer or "WARNING" in output.disclaimer
    
    def test_research_has_warnings(self, raw_metrics):
        """Research output includes warnings."""
        output = format_backtest_output(
            raw_metrics=raw_metrics,
            mode=BacktestMode.RESEARCH,
            n_days=300,
        )
        
        assert len(output.warnings) > 0
        assert any("LOOK-AHEAD" in w for w in output.warnings)
    
    def test_illustrative_is_publishable(self, raw_metrics):
        """Illustrative output is marked publishable."""
        output = format_backtest_output(
            raw_metrics=raw_metrics,
            mode=BacktestMode.ILLUSTRATIVE,
            n_days=300,
        )
        
        assert output.publishable is True
    
    def test_research_not_publishable(self, raw_metrics):
        """Research output is not publishable."""
        output = format_backtest_output(
            raw_metrics=raw_metrics,
            mode=BacktestMode.RESEARCH,
            n_days=300,
        )
        
        assert output.publishable is False


class TestCreateIllustrativeOutput:
    """Tests for create_illustrative_output convenience function."""
    
    def test_french_disclaimer(self):
        """French disclaimer when language=fr."""
        output = create_illustrative_output(
            metrics={"total_return_pct": 15.5},
            n_days=300,
            language="fr",
        )
        
        assert "AVERTISSEMENT" in output.disclaimer
        assert "PERFORMANCES PASSÉES" in output.disclaimer
    
    def test_english_disclaimer(self):
        """English disclaimer when language=en."""
        output = create_illustrative_output(
            metrics={"total_return_pct": 15.5},
            n_days=300,
            language="en",
        )
        
        assert "WARNING" in output.disclaimer
        assert "PAST PERFORMANCE" in output.disclaimer
    
    def test_filters_forbidden_metrics(self):
        """Forbidden metrics are filtered."""
        output = create_illustrative_output(
            metrics={
                "total_return_pct": 15.5,
                "alpha": 0.03,
                "beta": 0.85,
            },
            n_days=300,
        )
        
        assert "total_return_pct" in output.metrics
        assert "alpha" not in output.metrics
        assert "beta" not in output.metrics


class TestCreateResearchOutput:
    """Tests for create_research_output convenience function."""
    
    @pytest.fixture
    def returns(self):
        """Sample returns array."""
        np.random.seed(42)
        return np.random.normal(0.0005, 0.015, 300)
    
    def test_includes_all_metrics(self):
        """Research output includes all metrics."""
        output = create_research_output(
            metrics={
                "total_return_pct": 15.5,
                "alpha": 0.03,
                "beta": 0.85,
            },
            n_days=300,
        )
        
        assert "total_return_pct" in output.metrics
        assert "alpha" in output.metrics
        assert "beta" in output.metrics
    
    def test_monte_carlo_included(self, returns):
        """Monte Carlo results included when returns provided."""
        output = create_research_output(
            metrics={"total_return_pct": 15.5},
            returns=returns,
            n_days=300,
            run_monte_carlo=True,
            seed=42,
        )
        
        assert "monte_carlo" in output.metrics
        mc = output.metrics["monte_carlo"]
        assert "n_runs" in mc
        assert "mean_return_pct" in mc
        assert "prob_positive_pct" in mc
    
    def test_bootstrap_included(self, returns):
        """Bootstrap CI included when returns provided."""
        output = create_research_output(
            metrics={"total_return_pct": 15.5},
            returns=returns,
            n_days=300,
            run_bootstrap=True,
            seed=42,
        )
        
        assert "sharpe_ratio_bootstrap" in output.metrics
        bootstrap = output.metrics["sharpe_ratio_bootstrap"]
        assert "ci_lower" in bootstrap
        assert "ci_upper" in bootstrap
    
    def test_has_warnings(self, returns):
        """Research output has warnings."""
        output = create_research_output(
            metrics={"total_return_pct": 15.5},
            returns=returns,
            n_days=300,
        )
        
        assert len(output.warnings) >= 3


class TestValidatePublishable:
    """Tests for validate_publishable function."""
    
    def test_valid_illustrative_output(self):
        """Valid illustrative output passes validation."""
        output = create_illustrative_output(
            metrics={"total_return_pct": 15.5},
            n_days=300,
        )
        
        is_valid, issues = validate_publishable(output)
        
        assert is_valid is True
        assert len(issues) == 0
    
    def test_research_output_fails(self):
        """Research output fails validation."""
        output = create_research_output(
            metrics={"total_return_pct": 15.5},
            n_days=300,
        )
        
        is_valid, issues = validate_publishable(output)
        
        assert is_valid is False
        assert len(issues) > 0
    
    def test_missing_disclaimer_fails(self):
        """Missing disclaimer fails validation."""
        output = BacktestOutput(
            mode=BacktestMode.ILLUSTRATIVE,
            metrics={"total_return_pct": 15.5},
            disclaimer=None,  # Missing
            publishable=True,
        )
        
        is_valid, issues = validate_publishable(output)
        
        assert is_valid is False
        assert any("disclaimer" in i.lower() for i in issues)
    
    def test_forbidden_metric_slipped_through(self):
        """Detects forbidden metrics that slipped through."""
        output = BacktestOutput(
            mode=BacktestMode.ILLUSTRATIVE,
            metrics={
                "total_return_pct": 15.5,
                "alpha": 0.03,  # Should be forbidden
            },
            disclaimer="Test disclaimer",
            publishable=True,
        )
        
        is_valid, issues = validate_publishable(output)
        
        assert is_valid is False
        assert any("alpha" in i for i in issues)


class TestMonteCarloSimulation:
    """Tests for Monte Carlo simulation."""
    
    @pytest.fixture
    def returns(self):
        """Sample returns."""
        np.random.seed(42)
        return np.random.normal(0.0005, 0.015, 300)
    
    def test_basic_simulation(self, returns):
        """Basic Monte Carlo simulation works."""
        result = run_monte_carlo_simulation(
            returns=returns,
            n_runs=100,
            n_days=252,
            seed=42,
        )
        
        assert "monte_carlo" in result
        mc = result["monte_carlo"]
        assert mc["n_runs"] == 100
        assert mc["n_days_simulated"] == 252
        assert "mean_return_pct" in mc
        assert "std_return_pct" in mc
    
    def test_percentiles_ordered(self, returns):
        """Percentiles are in correct order."""
        result = run_monte_carlo_simulation(
            returns=returns,
            n_runs=500,
            seed=42,
        )
        
        mc = result["monte_carlo"]
        assert mc["percentile_5_pct"] <= mc["percentile_25_pct"]
        assert mc["percentile_25_pct"] <= mc["percentile_75_pct"]
        assert mc["percentile_75_pct"] <= mc["percentile_95_pct"]
    
    def test_insufficient_data(self):
        """Returns error for insufficient data."""
        result = run_monte_carlo_simulation(
            returns=np.array([0.01, 0.02, 0.03]),  # Too few
            n_runs=100,
        )
        
        assert "error" in result
    
    def test_reproducibility(self, returns):
        """Same seed produces same results."""
        result1 = run_monte_carlo_simulation(returns, n_runs=100, seed=42)
        result2 = run_monte_carlo_simulation(returns, n_runs=100, seed=42)
        
        assert result1["monte_carlo"]["mean_return_pct"] == result2["monte_carlo"]["mean_return_pct"]


class TestBootstrapCI:
    """Tests for bootstrap confidence intervals."""
    
    @pytest.fixture
    def returns(self):
        """Sample returns."""
        np.random.seed(42)
        return np.random.normal(0.001, 0.02, 200)
    
    def test_basic_bootstrap(self, returns):
        """Basic bootstrap CI works."""
        result = calculate_bootstrap_ci(
            returns=returns,
            metric_fn=np.mean,
            n_samples=100,
            confidence_level=0.95,
            seed=42,
        )
        
        assert "point_estimate" in result
        assert "ci_lower" in result
        assert "ci_upper" in result
        assert result["ci_lower"] <= result["point_estimate"] <= result["ci_upper"]
    
    def test_confidence_level_respected(self, returns):
        """CI bounds respect confidence level."""
        result = calculate_bootstrap_ci(
            returns=returns,
            metric_fn=np.mean,
            n_samples=500,
            confidence_level=0.95,
            seed=42,
        )
        
        assert result["confidence_level"] == 0.95
    
    def test_insufficient_data(self):
        """Returns error for insufficient data."""
        result = calculate_bootstrap_ci(
            returns=np.array([0.01, 0.02]),  # Too few
            metric_fn=np.mean,
        )
        
        assert "error" in result


class TestConstants:
    """Tests for module constants."""
    
    def test_min_sharpe_period(self):
        """MIN_SHARPE_PERIOD_DAYS is reasonable."""
        assert MIN_SHARPE_PERIOD_DAYS == 252
    
    def test_illustrative_metrics_disjoint(self):
        """Allowed and forbidden metrics don't overlap."""
        intersection = ILLUSTRATIVE_ALLOWED_METRICS & ILLUSTRATIVE_FORBIDDEN_METRICS
        assert len(intersection) == 0
    
    def test_research_warnings_not_empty(self):
        """Research warnings are defined."""
        assert len(RESEARCH_WARNINGS) >= 3
    
    def test_disclaimers_not_empty(self):
        """Disclaimers are non-empty."""
        assert len(AMF_DISCLAIMER_FR) > 100
        assert len(AMF_DISCLAIMER_EN) > 100


class TestIntegration:
    """Integration tests."""
    
    def test_full_workflow_illustrative(self):
        """Full illustrative workflow."""
        raw_metrics = {
            "total_return_pct": 15.5,
            "annualized_return_pct": 12.3,
            "volatility_annualized_pct": 18.5,
            "sharpe_ratio": 0.67,
            "max_drawdown_pct": -12.5,
            "alpha": 0.03,  # Should be filtered
            "beta": 0.85,   # Should be filtered
            "n_days": 504,
        }
        
        output = create_illustrative_output(
            metrics=raw_metrics,
            n_days=504,
            language="fr",
        )
        
        # Validate
        is_valid, issues = validate_publishable(output)
        assert is_valid is True
        
        # Check content
        d = output.to_dict()
        assert d["_backtest_mode"]["publishable"] is True
        assert "alpha" not in d["metrics"]
        assert "total_return_pct" in d["metrics"]
        assert "_disclaimer" in d
    
    def test_full_workflow_research(self):
        """Full research workflow."""
        np.random.seed(42)
        returns = np.random.normal(0.0005, 0.015, 300)
        
        raw_metrics = {
            "total_return_pct": 15.5,
            "sharpe_ratio": 0.67,
            "alpha": 0.03,
            "beta": 0.85,
        }
        
        output = create_research_output(
            metrics=raw_metrics,
            returns=returns,
            n_days=300,
            run_monte_carlo=True,
            run_bootstrap=True,
            seed=42,
        )
        
        # Should NOT be publishable
        is_valid, issues = validate_publishable(output)
        assert is_valid is False
        
        # Check content
        d = output.to_dict()
        assert d["_backtest_mode"]["publishable"] is False
        assert "alpha" in d["metrics"]
        assert "monte_carlo" in d["metrics"]
        assert "_warnings" in d
        assert len(d["_warnings"]) >= 3
