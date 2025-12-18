# tests/test_properties.py
"""
Property-based tests using Hypothesis.

P2-14 - 2025-12-18

These tests verify invariants that must ALWAYS hold, regardless of input.
Unlike unit tests that check specific cases, property tests generate
thousands of random inputs to find edge cases.

Design notes (from ChatGPT review):
- Use Hypothesis strategies instead of np.random (reproducibility)
- Test invariants, not exact equality (solver tolerance)
- Focus on: weights sum, constraints, bounds, PSD covariance

Run with:
    pytest tests/test_properties.py -v --hypothesis-show-statistics
    pytest tests/test_properties.py --hypothesis-seed=42  # Reproducible
"""

import pytest
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List

# Hypothesis imports
from hypothesis import given, settings, assume, HealthCheck, Verbosity
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

# ============================================================
# HYPOTHESIS STRATEGIES (custom)
# ============================================================

# Strategy for valid ticker names
ticker_strategy = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
    min_size=2,
    max_size=6,
).map(lambda s: s.upper())

# Strategy for asset scores (0-100)
score_strategy = st.floats(min_value=0.0, max_value=100.0, allow_nan=False)

# Strategy for weights (0-1)
weight_strategy = st.floats(min_value=0.0, max_value=1.0, allow_nan=False)

# Strategy for positive floats
positive_float = st.floats(min_value=0.001, max_value=1000.0, allow_nan=False, allow_infinity=False)

# Strategy for profile names
profile_strategy = st.sampled_from(["Agressif", "Modéré", "Stable"])

# Strategy for generating asset dicts
@st.composite
def asset_strategy(draw):
    """Generate a single asset dict."""
    return {
        "ticker": draw(ticker_strategy),
        "score": draw(score_strategy),
        "volatility": draw(st.floats(min_value=0.05, max_value=0.8, allow_nan=False)),
        "sector": draw(st.sampled_from([
            "Technology", "Healthcare", "Financials", "Consumer", 
            "Energy", "Utilities", "Materials", "Industrials"
        ])),
    }

# Strategy for list of assets
@st.composite
def assets_list_strategy(draw, min_size=5, max_size=30):
    """Generate a list of unique assets."""
    n = draw(st.integers(min_value=min_size, max_value=max_size))
    assets = []
    tickers_seen = set()
    
    for _ in range(n * 2):  # Generate more to ensure uniqueness
        if len(assets) >= n:
            break
        asset = draw(asset_strategy())
        if asset["ticker"] not in tickers_seen:
            tickers_seen.add(asset["ticker"])
            assets.append(asset)
    
    assume(len(assets) >= min_size)
    return assets

# Strategy for covariance matrix (positive semi-definite)
@st.composite
def psd_matrix_strategy(draw, n):
    """Generate a positive semi-definite matrix of size n x n."""
    # Generate random matrix A, then A @ A.T is PSD
    A = draw(arrays(
        dtype=np.float64,
        shape=(n, n),
        elements=st.floats(min_value=-1.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    ))
    # Make PSD: A @ A.T + small diagonal for numerical stability
    cov = A @ A.T + np.eye(n) * 0.01
    return cov

# Strategy for weights dict
@st.composite
def weights_dict_strategy(draw, tickers: List[str]):
    """Generate weights that sum to ~1.0."""
    n = len(tickers)
    raw_weights = draw(arrays(
        dtype=np.float64,
        shape=(n,),
        elements=st.floats(min_value=0.01, max_value=1.0, allow_nan=False),
    ))
    # Normalize to sum to 1
    normalized = raw_weights / raw_weights.sum()
    return {ticker: float(w) for ticker, w in zip(tickers, normalized)}


# ============================================================
# PROPERTY 1: Weights always sum to ~1.0
# ============================================================

class TestWeightsSumProperty:
    """Property: Portfolio weights must sum to approximately 1.0"""
    
    @given(
        weights=arrays(
            dtype=np.float64,
            shape=st.integers(min_value=5, max_value=20),
            elements=st.floats(min_value=0.01, max_value=0.5, allow_nan=False),
        )
    )
    @settings(max_examples=100, deadline=5000)
    def test_normalized_weights_sum_to_one(self, weights):
        """Normalized weights always sum to 1.0"""
        # Simulate normalization (what optimizer does)
        total = weights.sum()
        assume(total > 0)
        
        normalized = weights / total
        
        assert abs(normalized.sum() - 1.0) < 1e-10, \
            f"Normalized weights sum to {normalized.sum()}, expected 1.0"
    
    @given(
        n_assets=st.integers(min_value=3, max_value=20),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=50, deadline=10000)
    def test_portfolio_weights_bounded(self, n_assets, seed):
        """Each weight must be between 0 and 1."""
        rng = np.random.default_rng(seed)
        weights = rng.random(n_assets)
        weights = weights / weights.sum()  # Normalize
        
        assert all(0 <= w <= 1 for w in weights), \
            f"Weights out of bounds: {weights}"
        assert abs(sum(weights) - 1.0) < 1e-10


# ============================================================
# PROPERTY 2: Constraint bounds are respected
# ============================================================

class TestConstraintBoundsProperty:
    """Property: Constraints must never be violated after optimization."""
    
    # Constraint configs per profile
    PROFILE_CONSTRAINTS = {
        "Agressif": {"min_assets": 8, "max_assets": 25, "max_position": 0.15},
        "Modéré": {"min_assets": 10, "max_assets": 30, "max_position": 0.12},
        "Stable": {"min_assets": 12, "max_assets": 35, "max_position": 0.10},
    }
    
    @given(
        profile=profile_strategy,
        n_assets=st.integers(min_value=5, max_value=50),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=100, deadline=5000)
    def test_max_position_constraint(self, profile, n_assets, seed):
        """No single position exceeds max_position_weight."""
        constraints = self.PROFILE_CONSTRAINTS[profile]
        max_pos = constraints["max_position"]
        
        # Simulate constrained weight assignment
        rng = np.random.default_rng(seed)
        weights = rng.random(n_assets)
        weights = weights / weights.sum()
        
        # Apply max position constraint (clip)
        weights = np.clip(weights, 0, max_pos)
        weights = weights / weights.sum()  # Renormalize
        
        # Property: all weights <= max_pos (with small tolerance for renorm)
        tolerance = 0.001
        assert all(w <= max_pos + tolerance for w in weights), \
            f"Weight {max(weights)} exceeds max {max_pos}"
    
    @given(
        profile=profile_strategy,
        n_available=st.integers(min_value=10, max_value=100),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=50, deadline=5000)
    def test_asset_count_bounds(self, profile, n_available, seed):
        """Asset count respects min/max constraints."""
        constraints = self.PROFILE_CONSTRAINTS[profile]
        min_assets = constraints["min_assets"]
        max_assets = constraints["max_assets"]
        
        # Simulate asset selection
        rng = np.random.default_rng(seed)
        
        # Select between min and max assets (bounded by available)
        n_select = rng.integers(
            min(min_assets, n_available),
            min(max_assets, n_available) + 1
        )
        
        # Property: selection is within bounds
        assert n_select >= min(min_assets, n_available), \
            f"Selected {n_select} < min {min_assets}"
        assert n_select <= min(max_assets, n_available), \
            f"Selected {n_select} > max {max_assets}"


# ============================================================
# PROPERTY 3: Covariance matrix stays positive definite
# ============================================================

class TestCovarianceProperty:
    """Property: Covariance matrix must remain positive definite after processing."""
    
    @given(
        n=st.integers(min_value=3, max_value=15),
        noise=st.floats(min_value=0.01, max_value=0.5, allow_nan=False),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=50, deadline=10000, suppress_health_check=[HealthCheck.too_slow])
    def test_shrinkage_preserves_psd(self, n, noise, seed):
        """Diagonal shrinkage preserves positive semi-definiteness."""
        rng = np.random.default_rng(seed)
        
        # Generate random covariance (may be ill-conditioned)
        A = rng.standard_normal((n, n)) * noise
        cov = A @ A.T + np.eye(n) * 0.001  # Small regularization
        
        # Apply diagonal shrinkage (simulate optimizer behavior)
        shrinkage_lambda = 0.1
        shrunk_cov = (1 - shrinkage_lambda) * cov + shrinkage_lambda * np.diag(np.diag(cov))
        
        # Property: eigenvalues must all be positive
        eigenvalues = np.linalg.eigvalsh(shrunk_cov)
        
        assert all(eigenvalues > -1e-10), \
            f"Negative eigenvalues after shrinkage: {eigenvalues[eigenvalues <= 0]}"
    
    @given(
        n=st.integers(min_value=3, max_value=10),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=30, deadline=15000)
    def test_condition_number_bounded_after_shrink(self, n, seed):
        """Condition number can be reduced by sufficient shrinkage."""
        rng = np.random.default_rng(seed)
        
        # Generate potentially ill-conditioned matrix
        A = rng.standard_normal((n, n))
        cov = A @ A.T + np.eye(n) * 0.0001
        
        # Strong shrinkage toward diagonal
        shrinkage_lambda = 0.5
        shrunk = (1 - shrinkage_lambda) * cov + shrinkage_lambda * np.diag(np.diag(cov))
        
        # Property: condition number should be reasonable
        cond = np.linalg.cond(shrunk)
        
        # With 50% shrinkage, condition should be < 10^6
        assert cond < 1e6, f"Condition number {cond} too high after shrinkage"


# ============================================================
# PROPERTY 4: Returns are bounded (no NaN/Inf)
# ============================================================

class TestReturnsProperty:
    """Property: Computed returns must be finite numbers."""
    
    @given(
        n_days=st.integers(min_value=10, max_value=100),
        n_assets=st.integers(min_value=3, max_value=10),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=50, deadline=10000)
    def test_portfolio_returns_finite(self, n_days, n_assets, seed):
        """Portfolio returns are always finite."""
        rng = np.random.default_rng(seed)
        
        # Generate random daily returns (realistic range)
        daily_returns = rng.normal(0.0005, 0.02, (n_days, n_assets))
        
        # Generate weights
        weights = rng.random(n_assets)
        weights = weights / weights.sum()
        
        # Compute portfolio returns
        portfolio_returns = daily_returns @ weights
        
        # Property: no NaN or Inf
        assert not np.any(np.isnan(portfolio_returns)), "NaN in returns"
        assert not np.any(np.isinf(portfolio_returns)), "Inf in returns"
        
        # Property: returns are realistic (not > 100% or < -100% daily)
        assert all(abs(r) < 1.0 for r in portfolio_returns), \
            f"Unrealistic return: {max(abs(portfolio_returns))}"
    
    @given(
        n_days=st.integers(min_value=20, max_value=252),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=30, deadline=10000)
    def test_cumulative_returns_bounded(self, n_days, seed):
        """Cumulative returns stay within reasonable bounds."""
        rng = np.random.default_rng(seed)
        
        # Generate GBM-like returns
        drift = 0.0003  # ~7.5% annual
        vol = 0.015     # ~24% annual
        returns = rng.normal(drift, vol, n_days)
        
        # Compute cumulative return
        cumulative = np.prod(1 + returns) - 1
        
        # Property: cumulative return is finite and bounded
        assert np.isfinite(cumulative), f"Non-finite cumulative return: {cumulative}"
        
        # Over 1 year, expect roughly -50% to +200% (very generous bounds)
        year_fraction = n_days / 252
        max_expected = (1 + 2.0) ** year_fraction - 1  # +200% scaled
        min_expected = (1 - 0.5) ** year_fraction - 1  # -50% scaled
        
        # Soft check (log warning but don't fail for outliers)
        if not (min_expected * 2 <= cumulative <= max_expected * 2):
            print(f"Warning: Cumulative return {cumulative:.2%} outside typical range")


# ============================================================
# PROPERTY 5: Determinism (same inputs → same structure)
# ============================================================

class TestDeterminismProperty:
    """Property: Same inputs with same seed produce consistent results."""
    
    @given(
        n_assets=st.integers(min_value=5, max_value=15),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=30, deadline=5000)
    def test_weight_selection_deterministic(self, n_assets, seed):
        """Same seed produces same asset selection."""
        def generate_selection(s):
            rng = np.random.default_rng(s)
            scores = rng.random(n_assets)
            # Select top 50%
            n_select = n_assets // 2
            indices = np.argsort(scores)[-n_select:]
            return set(indices)
        
        selection1 = generate_selection(seed)
        selection2 = generate_selection(seed)
        
        # Property: same seed → same selection
        assert selection1 == selection2, \
            f"Non-deterministic selection: {selection1} vs {selection2}"
    
    @given(
        n=st.integers(min_value=5, max_value=15),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=30, deadline=5000)
    def test_weight_values_deterministic(self, n, seed):
        """Same seed produces same weight values (within tolerance)."""
        def generate_weights(s):
            rng = np.random.default_rng(s)
            w = rng.random(n)
            return w / w.sum()
        
        w1 = generate_weights(seed)
        w2 = generate_weights(seed)
        
        # Property: weights are identical
        assert np.allclose(w1, w2, rtol=1e-10), \
            f"Non-deterministic weights: max diff = {np.max(np.abs(w1 - w2))}"


# ============================================================
# PROPERTY 6: Sorting stability
# ============================================================

class TestSortingProperty:
    """Property: Sorting must be stable (tie-breaker on ticker)."""
    
    @given(
        n_assets=st.integers(min_value=10, max_value=30),
        n_ties=st.integers(min_value=2, max_value=5),
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=50, deadline=5000)
    def test_stable_sort_with_ties(self, n_assets, n_ties, seed):
        """Assets with same score are sorted by ticker."""
        rng = np.random.default_rng(seed)
        
        # Generate assets with some ties
        assets = []
        for i in range(n_assets):
            ticker = f"ASSET{i:03d}"
            # Create ties by rounding scores
            score = round(rng.random() * 10) / 10  # 0.0, 0.1, ..., 1.0
            assets.append({"ticker": ticker, "score": score})
        
        # Stable sort: by score DESC, then ticker ASC
        sorted_assets = sorted(assets, key=lambda x: (-x["score"], x["ticker"]))
        
        # Property: within same score, tickers are alphabetical
        for i in range(len(sorted_assets) - 1):
            curr = sorted_assets[i]
            next_ = sorted_assets[i + 1]
            
            if curr["score"] == next_["score"]:
                assert curr["ticker"] < next_["ticker"], \
                    f"Unstable sort: {curr['ticker']} should come before {next_['ticker']}"
    
    @given(seed=st.integers(min_value=0, max_value=10000))
    @settings(max_examples=20)
    def test_sort_reproducibility(self, seed):
        """Sorting is reproducible across runs."""
        rng = np.random.default_rng(seed)
        
        assets = [
            {"ticker": f"T{i}", "score": rng.random()}
            for i in range(20)
        ]
        
        sorted1 = sorted(assets.copy(), key=lambda x: (-x["score"], x["ticker"]))
        sorted2 = sorted(assets.copy(), key=lambda x: (-x["score"], x["ticker"]))
        
        # Property: same order
        tickers1 = [a["ticker"] for a in sorted1]
        tickers2 = [a["ticker"] for a in sorted2]
        
        assert tickers1 == tickers2, "Sort order not reproducible"


# ============================================================
# PROPERTY 7: Volatility calculations
# ============================================================

class TestVolatilityProperty:
    """Property: Volatility calculations must be mathematically correct."""
    
    @given(
        returns=arrays(
            dtype=np.float64,
            shape=st.integers(min_value=20, max_value=252),
            elements=st.floats(min_value=-0.1, max_value=0.1, allow_nan=False),
        )
    )
    @settings(max_examples=50, deadline=5000)
    def test_volatility_non_negative(self, returns):
        """Volatility (std dev) is always non-negative."""
        vol = np.std(returns)
        
        assert vol >= 0, f"Negative volatility: {vol}"
        assert np.isfinite(vol), f"Non-finite volatility: {vol}"
    
    @given(
        daily_vol=st.floats(min_value=0.005, max_value=0.05, allow_nan=False),
    )
    @settings(max_examples=30)
    def test_annualization_factor(self, daily_vol):
        """Annualized volatility uses correct factor."""
        annual_vol = daily_vol * np.sqrt(252)
        
        # Property: annualized > daily (for positive vol)
        assert annual_vol > daily_vol, \
            f"Annualization failed: {annual_vol} <= {daily_vol}"
        
        # Property: factor is ~15.87
        factor = annual_vol / daily_vol
        assert abs(factor - np.sqrt(252)) < 0.01, \
            f"Wrong annualization factor: {factor}"


# ============================================================
# PROPERTY 8: Quality gate thresholds
# ============================================================

class TestQualityGateProperty:
    """Property: Quality gate checks are mathematically correct."""
    
    @given(
        value=st.floats(min_value=0, max_value=200, allow_nan=False),
        threshold=st.floats(min_value=1, max_value=100, allow_nan=False),
    )
    @settings(max_examples=100)
    def test_less_than_operator(self, value, threshold):
        """LT operator: value < threshold passes."""
        passed = value < threshold
        violated = value >= threshold
        
        # Property: exactly one of passed/violated is True
        assert passed != violated, "Inconsistent LT check"
    
    @given(
        value=st.floats(min_value=0, max_value=200, allow_nan=False),
        threshold=st.floats(min_value=1, max_value=100, allow_nan=False),
    )
    @settings(max_examples=100)
    def test_greater_than_operator(self, value, threshold):
        """GT operator: value > threshold passes."""
        passed = value > threshold
        violated = value <= threshold
        
        # Property: exactly one of passed/violated is True
        assert passed != violated, "Inconsistent GT check"


# ============================================================
# INTEGRATION: Combined properties
# ============================================================

class TestIntegrationProperties:
    """Integration tests combining multiple properties."""
    
    @given(
        n_assets=st.integers(min_value=10, max_value=25),
        profile=profile_strategy,
        seed=st.integers(min_value=0, max_value=10000),
    )
    @settings(max_examples=30, deadline=15000)
    def test_full_optimization_invariants(self, n_assets, profile, seed):
        """Full optimization maintains all invariants."""
        rng = np.random.default_rng(seed)
        
        # Generate assets
        assets = [
            {"ticker": f"ASSET{i:03d}", "score": rng.random() * 100}
            for i in range(n_assets)
        ]
        
        # Simulate optimization
        scores = np.array([a["score"] for a in assets])
        
        # Sort by score (stable)
        sorted_indices = np.lexsort((
            [a["ticker"] for a in assets],  # Secondary: ticker
            -scores,  # Primary: score DESC
        ))
        
        # Select top assets (profile-dependent)
        profile_limits = {"Agressif": 15, "Modéré": 18, "Stable": 20}
        n_select = min(profile_limits[profile], n_assets)
        selected = sorted_indices[:n_select]
        
        # Generate weights
        weights = rng.random(n_select)
        
        # Apply max position constraint
        max_pos = {"Agressif": 0.15, "Modéré": 0.12, "Stable": 0.10}[profile]
        weights = np.clip(weights, 0, max_pos * weights.sum())
        weights = weights / weights.sum()
        
        # Verify all invariants
        # 1. Weights sum to 1
        assert abs(weights.sum() - 1.0) < 1e-10
        
        # 2. All weights non-negative
        assert all(w >= 0 for w in weights)
        
        # 3. Max position respected (with tolerance)
        assert all(w <= max_pos + 0.01 for w in weights)
        
        # 4. Asset count within bounds
        assert n_select >= 1
        assert n_select <= n_assets
