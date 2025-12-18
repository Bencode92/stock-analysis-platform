# tests/test_stress_testing.py
"""
Tests for Stress Testing module.

P2-12 - 2025-12-18
"""

import pytest
import numpy as np
from datetime import datetime

from portfolio_engine.stress_testing import (
    # Enums
    StressScenario,
    # Parameters
    ScenarioParameters,
    get_scenario_parameters,
    # Transformations
    stress_covariance_matrix,
    stress_returns,
    stress_weights,
    # Analysis
    calculate_portfolio_metrics,
    run_stress_test,
    StressTestResult,
    # Pack
    run_stress_test_pack,
    StressTestPack,
    # Historical
    replay_historical_event,
    HISTORICAL_EVENTS,
    # Reverse
    reverse_stress_test,
    # Convenience
    quick_stress_check,
    get_manifest_entry,
)


# ============================================================
# FIXTURES
# ============================================================

@pytest.fixture
def simple_portfolio():
    """Simple 3-asset portfolio for testing."""
    weights = np.array([0.4, 0.35, 0.25])
    expected_returns = np.array([0.08, 0.06, 0.04])
    
    # Simple covariance matrix
    vols = np.array([0.20, 0.15, 0.10])
    corr = np.array([
        [1.0, 0.3, 0.2],
        [0.3, 1.0, 0.4],
        [0.2, 0.4, 1.0],
    ])
    cov = np.outer(vols, vols) * corr
    
    return weights, expected_returns, cov


@pytest.fixture
def larger_portfolio():
    """Larger 10-asset portfolio."""
    np.random.seed(42)
    n = 10
    
    weights = np.random.random(n)
    weights = weights / weights.sum()
    
    expected_returns = np.random.uniform(0.02, 0.12, n)
    
    # Generate PSD covariance
    A = np.random.randn(n, n) * 0.1
    cov = A @ A.T + np.eye(n) * 0.01
    
    return weights, expected_returns, cov


@pytest.fixture
def sectors():
    """Sector labels for 10-asset portfolio."""
    return [
        "Technology", "Technology", "Financials", "Healthcare",
        "Consumer", "Energy", "Utilities", "Materials",
        "Industrials", "Real Estate"
    ]


# ============================================================
# TEST SCENARIO PARAMETERS
# ============================================================

class TestScenarioParameters:
    """Tests for ScenarioParameters dataclass."""
    
    def test_create_parameters(self):
        """Can create scenario parameters."""
        params = ScenarioParameters(
            name="test",
            description="Test scenario",
            correlation_delta=0.2,
            volatility_multiplier=1.5,
        )
        
        assert params.name == "test"
        assert params.correlation_delta == 0.2
        assert params.volatility_multiplier == 1.5
    
    def test_validate_valid_params(self):
        """Valid parameters pass validation."""
        params = ScenarioParameters(
            name="test",
            correlation_delta=0.3,
            volatility_multiplier=2.0,
            return_shock=-0.10,
        )
        
        issues = params.validate()
        assert len(issues) == 0
    
    def test_validate_invalid_correlation(self):
        """Invalid correlation delta fails validation."""
        params = ScenarioParameters(
            name="test",
            correlation_delta=1.5,  # > 1, invalid
        )
        
        issues = params.validate()
        assert len(issues) > 0
        assert any("correlation" in i for i in issues)
    
    def test_validate_invalid_vol_multiplier(self):
        """Non-positive vol multiplier fails validation."""
        params = ScenarioParameters(
            name="test",
            volatility_multiplier=-0.5,
        )
        
        issues = params.validate()
        assert len(issues) > 0
        assert any("volatility" in i for i in issues)


class TestGetScenarioParameters:
    """Tests for get_scenario_parameters function."""
    
    def test_all_scenarios_defined(self):
        """All standard scenarios have parameters."""
        for scenario in StressScenario:
            if scenario != StressScenario.CUSTOM:
                params = get_scenario_parameters(scenario)
                assert params is not None
                assert params.name == scenario.value
    
    def test_correlation_spike(self):
        """Correlation spike has expected parameters."""
        params = get_scenario_parameters(StressScenario.CORRELATION_SPIKE)
        
        assert params.correlation_delta > 0
        assert params.volatility_multiplier > 1
    
    def test_market_crash(self):
        """Market crash is severe."""
        params = get_scenario_parameters(StressScenario.MARKET_CRASH)
        
        assert params.return_shock <= -0.30
        assert params.volatility_multiplier >= 3
        assert params.correlation_delta >= 0.40
    
    def test_invalid_scenario(self):
        """Invalid scenario raises error."""
        with pytest.raises(ValueError):
            get_scenario_parameters("not_a_scenario")


# ============================================================
# TEST STRESS TRANSFORMATIONS
# ============================================================

class TestStressCovarianceMatrix:
    """Tests for stress_covariance_matrix function."""
    
    def test_psd_preserved(self, simple_portfolio):
        """Stressed matrix remains positive semi-definite."""
        _, _, cov = simple_portfolio
        
        params = ScenarioParameters(
            name="test",
            correlation_delta=0.3,
            volatility_multiplier=2.0,
        )
        
        stressed = stress_covariance_matrix(cov, params)
        
        # Check PSD: all eigenvalues >= 0
        eigenvalues = np.linalg.eigvalsh(stressed)
        assert all(eigenvalues >= -1e-10)
    
    def test_volatility_increases(self, simple_portfolio):
        """Volatility multiplier increases diagonal."""
        _, _, cov = simple_portfolio
        base_vols = np.sqrt(np.diag(cov))
        
        params = ScenarioParameters(
            name="test",
            volatility_multiplier=2.0,
        )
        
        stressed = stress_covariance_matrix(cov, params)
        stressed_vols = np.sqrt(np.diag(stressed))
        
        np.testing.assert_allclose(stressed_vols, base_vols * 2.0, rtol=0.01)
    
    def test_correlation_increases(self, simple_portfolio):
        """Correlation delta shifts correlations."""
        _, _, cov = simple_portfolio
        
        # Extract base correlation
        vols = np.sqrt(np.diag(cov))
        D_inv = np.diag(1.0 / vols)
        base_corr = D_inv @ cov @ D_inv
        
        params = ScenarioParameters(
            name="test",
            correlation_delta=0.2,
            volatility_multiplier=1.0,  # No vol change
        )
        
        stressed = stress_covariance_matrix(cov, params)
        
        # Extract stressed correlation
        stressed_vols = np.sqrt(np.diag(stressed))
        D_inv_s = np.diag(1.0 / stressed_vols)
        stressed_corr = D_inv_s @ stressed @ D_inv_s
        
        # Off-diagonal correlations should have increased
        off_diag_base = base_corr[0, 1]
        off_diag_stressed = stressed_corr[0, 1]
        
        assert off_diag_stressed >= off_diag_base
    
    def test_symmetry_preserved(self, larger_portfolio):
        """Stressed matrix remains symmetric."""
        _, _, cov = larger_portfolio
        
        params = ScenarioParameters(
            name="test",
            correlation_delta=0.3,
            volatility_multiplier=2.5,
        )
        
        stressed = stress_covariance_matrix(cov, params)
        
        np.testing.assert_allclose(stressed, stressed.T)


class TestStressReturns:
    """Tests for stress_returns function."""
    
    def test_general_shock_applied(self):
        """General return shock is applied."""
        returns = np.array([0.10, 0.08, 0.06])
        
        params = ScenarioParameters(
            name="test",
            return_shock=-0.05,
        )
        
        stressed = stress_returns(returns, params)
        
        np.testing.assert_allclose(stressed, returns - 0.05)
    
    def test_sector_shocks_applied(self):
        """Sector-specific shocks are applied."""
        returns = np.array([0.10, 0.08, 0.06])
        sectors = ["Technology", "Financials", "Healthcare"]
        
        params = ScenarioParameters(
            name="test",
            sector_shocks={"Technology": -0.15},
        )
        
        stressed = stress_returns(returns, params, sectors=sectors)
        
        assert stressed[0] == returns[0] - 0.15  # Tech hit
        assert stressed[1] == returns[1]  # Financials unchanged
        assert stressed[2] == returns[2]  # Healthcare unchanged
    
    def test_asset_class_shocks_applied(self):
        """Asset class shocks are applied."""
        returns = np.array([0.10, 0.08])
        asset_classes = ["equity", "bond_ig"]
        
        params = ScenarioParameters(
            name="test",
            asset_class_shocks={"equity": -0.20, "bond_ig": -0.05},
        )
        
        stressed = stress_returns(returns, params, asset_classes=asset_classes)
        
        assert stressed[0] == returns[0] - 0.20
        assert stressed[1] == returns[1] - 0.05


class TestStressWeights:
    """Tests for stress_weights function."""
    
    def test_no_change_without_liquidity_stress(self):
        """Weights unchanged if liquidity_impact <= 1."""
        weights = np.array([0.5, 0.3, 0.2])
        
        params = ScenarioParameters(
            name="test",
            liquidity_impact=1.0,
        )
        
        adjusted, turnover = stress_weights(weights, params)
        
        np.testing.assert_allclose(adjusted, weights)
        assert turnover == 0.0
    
    def test_liquidity_adjustment(self):
        """Liquidity stress reduces illiquid positions."""
        weights = np.array([0.5, 0.3, 0.2])
        liquidity = np.array([1.0, 0.5, 0.2])  # Last asset is illiquid
        
        params = ScenarioParameters(
            name="test",
            liquidity_impact=2.0,
        )
        
        adjusted, turnover = stress_weights(weights, params, liquidity)
        
        # Illiquid asset weight should decrease relative to liquid
        assert adjusted[2] / adjusted.sum() < weights[2]
        assert turnover > 0


# ============================================================
# TEST PORTFOLIO METRICS
# ============================================================

class TestCalculatePortfolioMetrics:
    """Tests for calculate_portfolio_metrics function."""
    
    def test_basic_metrics(self, simple_portfolio):
        """Basic metrics are calculated."""
        weights, returns, cov = simple_portfolio
        
        metrics = calculate_portfolio_metrics(weights, returns, cov)
        
        assert "expected_return" in metrics
        assert "volatility" in metrics
        assert "sharpe_ratio" in metrics
        assert "var_95" in metrics
        assert "var_99" in metrics
    
    def test_return_calculation(self, simple_portfolio):
        """Portfolio return is weighted sum."""
        weights, returns, cov = simple_portfolio
        
        metrics = calculate_portfolio_metrics(weights, returns, cov)
        expected = np.dot(weights, returns)
        
        np.testing.assert_allclose(metrics["expected_return"], expected)
    
    def test_volatility_calculation(self, simple_portfolio):
        """Portfolio volatility is correct."""
        weights, returns, cov = simple_portfolio
        
        metrics = calculate_portfolio_metrics(weights, returns, cov)
        expected_vol = np.sqrt(weights @ cov @ weights)
        
        np.testing.assert_allclose(metrics["volatility"], expected_vol)
    
    def test_var_ordering(self, simple_portfolio):
        """VaR 99 is more extreme than VaR 95."""
        weights, returns, cov = simple_portfolio
        
        metrics = calculate_portfolio_metrics(weights, returns, cov)
        
        assert metrics["var_99"] < metrics["var_95"]


# ============================================================
# TEST RUN STRESS TEST
# ============================================================

class TestRunStressTest:
    """Tests for run_stress_test function."""
    
    def test_returns_result(self, simple_portfolio):
        """Stress test returns StressTestResult."""
        weights, returns, cov = simple_portfolio
        
        result = run_stress_test(
            weights, returns, cov,
            scenario=StressScenario.CORRELATION_SPIKE,
        )
        
        assert isinstance(result, StressTestResult)
        assert result.scenario == "correlation_spike"
    
    def test_stress_increases_risk(self, simple_portfolio):
        """Stress scenarios increase risk metrics."""
        weights, returns, cov = simple_portfolio
        
        result = run_stress_test(
            weights, returns, cov,
            scenario=StressScenario.VOLATILITY_SHOCK,
        )
        
        assert result.stressed_metrics["volatility"] > result.base_metrics["volatility"]
    
    def test_crash_severe_impact(self, simple_portfolio):
        """Market crash has severe impact."""
        weights, returns, cov = simple_portfolio
        
        result = run_stress_test(
            weights, returns, cov,
            scenario=StressScenario.MARKET_CRASH,
        )
        
        assert result.expected_loss < -0.20
        assert result.impact["volatility"] > 0.10
    
    def test_custom_scenario(self, simple_portfolio):
        """Custom scenario works."""
        weights, returns, cov = simple_portfolio
        
        custom = ScenarioParameters(
            name="custom_test",
            description="Custom test scenario",
            correlation_delta=0.1,
            volatility_multiplier=1.2,
            return_shock=-0.03,
        )
        
        result = run_stress_test(
            weights, returns, cov,
            scenario=StressScenario.CUSTOM,
            custom_params=custom,
        )
        
        assert result.scenario == "custom_test"
    
    def test_sector_shocks_applied(self, larger_portfolio, sectors):
        """Sector shocks are applied in stress test."""
        weights, returns, cov = larger_portfolio
        
        result = run_stress_test(
            weights, returns, cov,
            scenario=StressScenario.LIQUIDITY_CRISIS,
            sectors=sectors,
        )
        
        # Result should reflect sector impacts
        assert result.expected_loss < 0
    
    def test_result_to_dict(self, simple_portfolio):
        """StressTestResult serializes to dict."""
        weights, returns, cov = simple_portfolio
        
        result = run_stress_test(
            weights, returns, cov,
            scenario=StressScenario.CORRELATION_SPIKE,
        )
        
        d = result.to_dict()
        
        assert "scenario" in d
        assert "parameters" in d
        assert "base_metrics" in d
        assert "stressed_metrics" in d
        assert "impact" in d


# ============================================================
# TEST STRESS TEST PACK
# ============================================================

class TestRunStressTestPack:
    """Tests for run_stress_test_pack function."""
    
    def test_runs_multiple_scenarios(self, simple_portfolio):
        """Pack runs multiple scenarios."""
        weights, returns, cov = simple_portfolio
        
        pack = run_stress_test_pack(weights, returns, cov)
        
        assert isinstance(pack, StressTestPack)
        assert len(pack.results) >= 3
    
    def test_identifies_worst_case(self, simple_portfolio):
        """Pack identifies worst case scenario."""
        weights, returns, cov = simple_portfolio
        
        pack = run_stress_test_pack(weights, returns, cov)
        
        assert pack.worst_case is not None
        # Worst case has minimum expected_loss (most negative)
        for result in pack.results:
            assert result.expected_loss >= pack.worst_case.expected_loss
    
    def test_summary_statistics(self, simple_portfolio):
        """Pack computes summary statistics."""
        weights, returns, cov = simple_portfolio
        
        pack = run_stress_test_pack(weights, returns, cov)
        
        assert "n_scenarios" in pack.summary
        assert "avg_var_impact" in pack.summary
        assert "worst_expected_loss" in pack.summary
    
    def test_risk_budget_impact(self, simple_portfolio):
        """Pack computes risk budget impact."""
        weights, returns, cov = simple_portfolio
        
        pack = run_stress_test_pack(weights, returns, cov)
        
        assert "base_volatility" in pack.risk_budget_impact
        assert "max_stressed_volatility" in pack.risk_budget_impact
    
    def test_custom_scenario_list(self, simple_portfolio):
        """Pack accepts custom scenario list."""
        weights, returns, cov = simple_portfolio
        
        scenarios = [
            StressScenario.CORRELATION_SPIKE,
            StressScenario.VOLATILITY_SHOCK,
        ]
        
        pack = run_stress_test_pack(
            weights, returns, cov,
            scenarios=scenarios,
        )
        
        assert len(pack.results) == 2
    
    def test_pack_to_dict(self, simple_portfolio):
        """StressTestPack serializes to dict."""
        weights, returns, cov = simple_portfolio
        
        pack = run_stress_test_pack(weights, returns, cov)
        d = pack.to_dict()
        
        assert "stress_test_pack" in d
        assert "summary" in d
        assert "scenarios" in d


# ============================================================
# TEST HISTORICAL REPLAY
# ============================================================

class TestReplayHistoricalEvent:
    """Tests for replay_historical_event function."""
    
    def test_2008_crisis(self, simple_portfolio):
        """2008 crisis replay works."""
        weights, returns, cov = simple_portfolio
        
        result = replay_historical_event(
            weights, returns, cov,
            event_name="2008_financial_crisis",
        )
        
        assert result.scenario == "2008_financial_crisis"
        assert result.expected_loss < -0.30
    
    def test_2020_covid(self, simple_portfolio):
        """COVID crash replay works."""
        weights, returns, cov = simple_portfolio
        
        result = replay_historical_event(
            weights, returns, cov,
            event_name="2020_covid_crash",
        )
        
        assert result.scenario == "2020_covid_crash"
    
    def test_all_historical_events(self, simple_portfolio):
        """All historical events can be replayed."""
        weights, returns, cov = simple_portfolio
        
        for event_name in HISTORICAL_EVENTS.keys():
            result = replay_historical_event(weights, returns, cov, event_name)
            assert result is not None
    
    def test_invalid_event(self, simple_portfolio):
        """Invalid event name raises error."""
        weights, returns, cov = simple_portfolio
        
        with pytest.raises(ValueError):
            replay_historical_event(weights, returns, cov, "not_an_event")


# ============================================================
# TEST REVERSE STRESS TEST
# ============================================================

class TestReverseStressTest:
    """Tests for reverse_stress_test function."""
    
    def test_basic_reverse_stress(self, simple_portfolio):
        """Basic reverse stress test works."""
        weights, _, cov = simple_portfolio
        
        result = reverse_stress_test(weights, cov, max_loss=-0.20)
        
        assert "target_loss" in result
        assert result["target_loss"] == -0.20
        assert "scenario_to_cause_loss" in result
    
    def test_finds_vol_multiplier(self, simple_portfolio):
        """Finds volatility multiplier to cause loss."""
        weights, _, cov = simple_portfolio
        
        result = reverse_stress_test(weights, cov, max_loss=-0.10)
        
        scenario = result["scenario_to_cause_loss"]
        assert "vol_multiplier_needed" in scenario
        assert scenario["vol_multiplier_needed"] > 1
    
    def test_historical_comparison(self, simple_portfolio):
        """Includes historical comparison."""
        weights, _, cov = simple_portfolio
        
        result = reverse_stress_test(weights, cov, max_loss=-0.20)
        
        assert "historical_comparison" in result
        assert "2008_crisis_vol_mult" in result["historical_comparison"]


# ============================================================
# TEST CONVENIENCE FUNCTIONS
# ============================================================

class TestQuickStressCheck:
    """Tests for quick_stress_check function."""
    
    def test_quick_check_works(self, simple_portfolio):
        """Quick check returns summary."""
        weights, returns, cov = simple_portfolio
        
        result = quick_stress_check(weights, cov, returns)
        
        assert "quick_stress_summary" in result
        summary = result["quick_stress_summary"]
        assert "n_scenarios" in summary
        assert "worst_case" in summary
        assert "max_loss_pct" in summary
    
    def test_quick_check_no_returns(self, simple_portfolio):
        """Quick check works without expected returns."""
        weights, _, cov = simple_portfolio
        
        result = quick_stress_check(weights, cov)
        
        assert "quick_stress_summary" in result


class TestGetManifestEntry:
    """Tests for get_manifest_entry function."""
    
    def test_manifest_entry(self, simple_portfolio):
        """Manifest entry has correct structure."""
        weights, returns, cov = simple_portfolio
        
        pack = run_stress_test_pack(weights, returns, cov)
        entry = get_manifest_entry(pack)
        
        assert "stress_tests" in entry
        st = entry["stress_tests"]
        assert "version" in st
        assert "n_scenarios" in st
        assert "summary" in st
        assert "status" in st


# ============================================================
# INTEGRATION TESTS
# ============================================================

class TestIntegration:
    """Integration tests."""
    
    def test_full_stress_workflow(self, larger_portfolio, sectors):
        """Full stress testing workflow."""
        weights, returns, cov = larger_portfolio
        
        # Run pack
        pack = run_stress_test_pack(
            weights, returns, cov,
            sectors=sectors,
        )
        
        # Verify all scenarios ran
        assert len(pack.results) >= 5
        
        # Verify worst case identified
        assert pack.worst_case is not None
        
        # Verify market crash is severe
        crash_result = next(
            (r for r in pack.results if r.scenario == "market_crash"),
            None
        )
        assert crash_result is not None
        assert crash_result.expected_loss < -0.30
        
        # Get manifest entry
        manifest = get_manifest_entry(pack)
        assert manifest["stress_tests"]["status"] in ["pass", "fail"]
    
    def test_stress_with_quality_gates_integration(self, simple_portfolio):
        """Stress tests generate appropriate warnings."""
        weights, returns, cov = simple_portfolio
        
        result = run_stress_test(
            weights, returns, cov,
            scenario=StressScenario.MARKET_CRASH,
        )
        
        # Market crash should generate warnings
        assert len(result.warnings) > 0
    
    def test_combined_analysis(self, simple_portfolio):
        """Combined forward and reverse stress analysis."""
        weights, returns, cov = simple_portfolio
        
        # Forward stress
        pack = run_stress_test_pack(weights, returns, cov)
        
        # Reverse stress
        reverse = reverse_stress_test(weights, cov, max_loss=-0.20)
        
        # Quick check
        quick = quick_stress_check(weights, cov, returns)
        
        # All should return valid results
        assert pack.worst_case is not None
        assert reverse["scenario_to_cause_loss"]["vol_multiplier_needed"] > 0
        assert quick["quick_stress_summary"]["n_scenarios"] > 0
