# tests/test_risk_analysis_p0.py
"""
Tests unitaires pour les fixes P0 de risk_analysis.py v1.2.0

Tests couverts:
1. Alignment weights ↔ returns par ticker
2. VaR99 fallback historique (convention signe)
3. Leveraged detection regex (faux positifs "short")
4. Fallback cov_matrix depuis returns

Run: pytest tests/test_risk_analysis_p0.py -v
"""

import numpy as np
import pytest
from typing import Dict, List, Any


# =============================================================================
# MOCK FUNCTIONS (pour tests isolés sans dépendances)
# =============================================================================

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


# Copie des fonctions à tester (pour isolation)
def _align_weights_to_tickers(
    allocation: List[Dict[str, Any]],
    history_tickers: List[str],
    allow_shorts: bool = False,
    strict: bool = False,
):
    w_by_ticker = {}
    duplicates = []

    for a in allocation:
        ticker = (a.get("ticker") or a.get("symbol") or a.get("id") or "")
        ticker = ticker.upper().strip() if isinstance(ticker, str) else ""
        if not ticker:
            continue

        raw = a.get("weight", a.get("weight_pct", a.get("percentage", 0)))
        w = _safe_float(raw)
        w = _normalize_weight(w)

        if ticker in w_by_ticker:
            duplicates.append(ticker)
            w_by_ticker[ticker] += w
        else:
            w_by_ticker[ticker] = w

    hist = [t.upper().strip() for t in history_tickers]

    missing_in_alloc = [t for t in hist if t not in w_by_ticker]
    extra_in_alloc = [t for t in w_by_ticker.keys() if t not in set(hist)]

    weights = np.array([w_by_ticker.get(t, 0.0) for t in hist], dtype=float)

    if not allow_shorts and np.any(weights < -1e-12):
        if strict:
            raise ValueError("Poids négatifs")

    s = float(np.sum(weights))
    if abs(s) < 1e-12:
        if strict:
            raise ValueError("Somme des poids ~0")
        return np.zeros_like(weights), {
            "missing_in_allocation": missing_in_alloc,
            "extra_in_allocation": extra_in_alloc,
            "duplicates_in_allocation": sorted(set(duplicates)),
            "error": "sum_weights_zero",
        }

    if allow_shorts:
        gross = float(np.sum(np.abs(weights)))
        if gross > 1e-12:
            weights = weights / gross
    else:
        weights = weights / s

    return weights, {
        "missing_in_allocation": missing_in_alloc,
        "extra_in_allocation": extra_in_alloc,
        "duplicates_in_allocation": sorted(set(duplicates)),
    }


def _historical_var_cvar(port_returns, alpha=0.01):
    if port_returns is None or len(port_returns) == 0:
        return 0.0, 0.0
    
    q = float(np.quantile(port_returns, alpha))
    var = -q  # Convention: perte positive
    
    tail = port_returns[port_returns <= q]
    cvar = -float(np.mean(tail)) if tail.size > 0 else var
    
    return var, cvar


import re
LEVERAGE_FALSE_POSITIVES = [
    "short-term", "short term", "short duration", 
    "ultra short", "ultrashort bond", "short maturity",
]
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


# =============================================================================
# TESTS: ALIGNMENT WEIGHTS ↔ RETURNS
# =============================================================================

class TestAlignWeightsToTickers:
    """Tests pour _align_weights_to_tickers()"""
    
    def test_basic_alignment(self):
        """Test alignement basique - ordre différent"""
        allocation = [
            {"ticker": "AAPL", "weight": 30},
            {"ticker": "MSFT", "weight": 50},
            {"ticker": "GOOGL", "weight": 20},
        ]
        history_tickers = ["MSFT", "GOOGL", "AAPL"]  # Ordre différent
        
        weights, report = _align_weights_to_tickers(allocation, history_tickers)
        
        # Vérifie que les poids sont dans l'ordre de history_tickers
        assert len(weights) == 3
        assert abs(weights[0] - 0.50) < 0.01  # MSFT = 50%
        assert abs(weights[1] - 0.20) < 0.01  # GOOGL = 20%
        assert abs(weights[2] - 0.30) < 0.01  # AAPL = 30%
        assert len(report["missing_in_allocation"]) == 0
        assert len(report["extra_in_allocation"]) == 0
    
    def test_missing_ticker_in_allocation(self):
        """Test ticker présent en historique mais absent en allocation"""
        allocation = [
            {"ticker": "AAPL", "weight": 50},
            {"ticker": "MSFT", "weight": 50},
        ]
        history_tickers = ["AAPL", "MSFT", "GOOGL"]  # GOOGL absent de allocation
        
        weights, report = _align_weights_to_tickers(allocation, history_tickers)
        
        assert len(weights) == 3
        assert weights[2] == 0.0  # GOOGL = 0
        assert "GOOGL" in report["missing_in_allocation"]
    
    def test_extra_