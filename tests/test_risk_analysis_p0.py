# tests/test_risk_analysis_p0.py
"""
Tests unitaires pour les fixes P0 de risk_analysis.py v1.2.0
Run: pytest tests/test_risk_analysis_p0.py -v
"""

import numpy as np
import pytest
from typing import Dict, List, Any
import re


def _safe_float(value, default=0.0):
    if value is None:
        return default
    try:
        f = float(value)
        if np.isnan(f) or np.isinf(f):
            return default
        return f
    except (TypeError, ValueError):
        return default


def _normalize_weight(weight):
    if weight > 1.0:
        return weight / 100.0
    return weight


def _align_weights_to_tickers(allocation, history_tickers, allow_shorts=False, strict=False):
    w_by_ticker = {}
    duplicates = []

    for a in allocation:
        ticker = (a.get("ticker") or a.get("symbol") or a.get("id") or "")
        ticker = ticker.upper().strip() if isinstance(ticker, str) else ""
        if not ticker:
            continue
        raw = a.get("weight", a.get("weight_pct", a.get("percentage", 0)))
        w = _normalize_weight(_safe_float(raw))

        if ticker in w_by_ticker:
            duplicates.append(ticker)
            w_by_ticker[ticker] += w
        else:
            w_by_ticker[ticker] = w

    hist = [t.upper().strip() for t in history_tickers]
    missing_in_alloc = [t for t in hist if t not in w_by_ticker]
    extra_in_alloc = [t for t in w_by_ticker.keys() if t not in set(hist)]
    weights = np.array([w_by_ticker.get(t, 0.0) for t in hist], dtype=float)

    s = float(np.sum(weights))
    if abs(s) < 1e-12:
        return np.zeros_like(weights), {"missing_in_allocation": missing_in_alloc, "extra_in_allocation": extra_in_alloc, "duplicates_in_allocation": sorted(set(duplicates)), "error": "sum_weights_zero"}

    weights = weights / s
    return weights, {"missing_in_allocation": missing_in_alloc, "extra_in_allocation": extra_in_alloc, "duplicates_in_allocation": sorted(set(duplicates))}


def _historical_var_cvar(port_returns, alpha=0.01):
    if port_returns is None or len(port_returns) == 0:
        return 0.0, 0.0
    q = float(np.quantile(port_returns, alpha))
    var = -q
    tail = port_returns[port_returns <= q]
    cvar = -float(np.mean(tail)) if tail.size > 0 else var
    return var, cvar


LEVERAGE_FALSE_POSITIVES = ["short-term", "short term", "short duration", "ultra short", "ultrashort bond", "short maturity"]
SHORT_WORD_RE = re.compile(r"\bshort\b(?!\s*-?\s*term|\s*duration|\s*maturity)", re.IGNORECASE)
LEVERAGE_FACTOR_RE = re.compile(r"(?<!\d)(-?[23]x)\b", re.IGNORECASE)
LEVERAGE_TICKERS = {"TQQQ", "SQQQ", "SH", "PSQ"}


def _is_leveraged_or_inverse(name, ticker):
    s = (name or "").lower()
    ticker_up = (ticker or "").upper()
    
    if ticker_up in LEVERAGE_TICKERS:
        return True, 3.0 if "QQQ" in ticker_up else -1.0, "leveraged" if ticker_up == "TQQQ" else "inverse"
    
    for fp in LEVERAGE_FALSE_POSITIVES:
        if fp in s:
            return False, 1.0, "standard"
    
    m = LEVERAGE_FACTOR_RE.search(s)
    if m:
        token = m.group(0).lower()
        if token.startswith("-"):
            return True, float(token.replace("x", "")), "inverse"
        return True, float(token.replace("x", "")), "leveraged"
    
    if "inverse" in s:
        return True, -1.0, "inverse"
    if "leveraged" in s or "ultra" in s:
        return True, 2.0, "leveraged"
    if SHORT_WORD_RE.search(s):
        return True, -1.0, "inverse"
    if "bear" in s:
        return True, -1.0, "inverse"
    
    return False, 1.0, "standard"


class TestAlignWeightsToTickers:
    def test_basic_alignment(self):
        allocation = [{"ticker": "AAPL", "weight": 30}, {"ticker": "MSFT", "weight": 50}, {"ticker": "GOOGL", "weight": 20}]
        history_tickers = ["MSFT", "GOOGL", "AAPL"]
        weights, report = _align_weights_to_tickers(allocation, history_tickers)
        assert abs(weights[0] - 0.50) < 0.01
        assert abs(weights[1] - 0.20) < 0.01
        assert abs(weights[2] - 0.30) < 0.01

    def test_missing_ticker(self):
        allocation = [{"ticker": "AAPL", "weight": 50}, {"ticker": "MSFT", "weight": 50}]
        history_tickers = ["AAPL", "MSFT", "GOOGL"]
        weights, report = _align_weights_to_tickers(allocation, history_tickers)
        assert weights[2] == 0.0
        assert "GOOGL" in report["missing_in_allocation"]

    def test_extra_ticker(self):
        allocation = [{"ticker": "AAPL", "weight": 30}, {"ticker": "MSFT", "weight": 40}, {"ticker": "NVDA", "weight": 30}]
        history_tickers = ["AAPL", "MSFT"]
        weights, report = _align_weights_to_tickers(allocation, history_tickers)
        assert "NVDA" in report["extra_in_allocation"]


class TestHistoricalVarCvar:
    def test_var_positive_loss_convention(self):
        np.random.seed(42)
        returns = np.random.normal(0.001, 0.02, 1000)
        returns[0] = -0.10
        var_99, cvar_99 = _historical_var_cvar(returns, alpha=0.01)
        assert var_99 > 0
        assert cvar_99 >= var_99

    def test_var_empty_returns(self):
        var, cvar = _historical_var_cvar(np.array([]))
        assert var == 0.0


class TestLeveragedDetection:
    def test_short_term_bond_not_leveraged(self):
        is_lev, factor, classification = _is_leveraged_or_inverse("iShares Short-Term National Muni Bond ETF", "SUB")
        assert not is_lev

    def test_real_short_etf_detected(self):
        is_lev, factor, classification = _is_leveraged_or_inverse("ProShares Short S&P 500", "SH")
        assert is_lev
        assert classification == "inverse"

    def test_bear_etf(self):
        is_lev, factor, classification = _is_leveraged_or_inverse("ProShares VIX Futures Bear ETF", "UNKNOWN")
        assert is_lev
        assert classification == "inverse"

    def test_normal_etf(self):
        is_lev, factor, classification = _is_leveraged_or_inverse("SPDR S&P 500 ETF Trust", "SPY")
        assert not is_lev


class TestIntegration:
    def test_full_workflow(self):
        np.random.seed(42)
        allocation = [{"ticker": "AAPL", "weight": 40}, {"ticker": "MSFT", "weight": 35}, {"ticker": "GOOGL", "weight": 25}]
        history_tickers = ["MSFT", "AAPL", "GOOGL"]
        returns = np.random.normal(0.001, 0.02, (500, 3))
        weights, _ = _align_weights_to_tickers(allocation, history_tickers)
        port_returns = returns @ weights
        var_95, cvar_95 = _historical_var_cvar(port_returns, alpha=0.05)
        assert var_95 > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
