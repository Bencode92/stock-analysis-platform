# portfolio_engine/risk_analysis.py
"""
Risk Analysis Module v1.1.0

Module d'enrichissement post-optimisation qui:
1. RÉUTILISE stress_testing.py (pas de duplication)
2. AJOUTE: leverage stress, preferred stock dual shock, tail risk, liquidity
3. INTÈGRE: historical_data.py pour VaR sur 5 ans de données

Architecture:
- stress_testing.py = scénarios "legacy" (100% réutilisé)
- historical_data.py = fetch returns 5y Twelve Data (v1.0.0)
- risk_analysis.py = wrapper + enrichissements + normalisation outputs

Design validé par ChatGPT (2026-01-26).

Changelog:
- v1.1.0: Hybrid VaR mode + historical_data.py integration
  - NEW: Import historical_data.py pour fetch returns 5y
  - NEW: Mode hybride VaR95/VaR99 basé sur n_obs
  - NEW: TailRiskMetrics enrichi (method, n_obs, confidence_level)
  - NEW: enrich_portfolio_with_risk_analysis() accepte returns_history + history_metadata
  - NEW: Support leveraged_tickers warning dans tail_risk
  - FIX: Seuils alignés sur TAIL_RISK_THRESHOLDS (252/1000 obs)
- v1.0.1: Fixes qualité
  - FIX: Disclaimer data_limits dans output JSON
  - FIX: compute_liquidity_score normalisation poids
  - FIX: stress_multiplier règle unifiée
  - FIX: Guardrails VaR99 fenêtre courte (<126 obs)
- v1.0.0: Initial release
"""

import logging
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple, Union

import numpy as np

# === IMPORTS CONDITIONNELS ===

try:
    from portfolio_engine.stress_testing import (
        StressScenario,
        StressTestPack,
        StressTestResult,
        ScenarioParameters,
        run_stress_test_pack,
        run_stress_test,
        quick_stress_check,
        get_scenario_parameters,
    )
    HAS_STRESS_TESTING = True
except ImportError:
    HAS_STRESS_TESTING = False

try:
    from scipy import stats as scipy_stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

# v1.1.0: Import historical_data for 5y returns
try:
    from portfolio_engine.historical_data import (
        fetch_portfolio_returns,
        fetch_single_ticker_returns,
        compute_portfolio_returns,
        TAIL_RISK_THRESHOLDS as HIST_THRESHOLDS,
        LEVERAGED_TICKERS as HIST_LEVERAGED_TICKERS,
    )
    HAS_HISTORICAL_DATA = True
except ImportError:
    HAS_HISTORICAL_DATA = False
    HIST_THRESHOLDS = {
        "var_95_min_obs": 252,
        "var_99_min_obs": 1000,
        "moments_min_obs": 252,
        "confidence_high": 1000,
        "confidence_medium": 252,
    }
    HIST_LEVERAGED_TICKERS = set()

logger = logging.getLogger("portfolio_engine.risk_analysis")

# =============================================================================
# CONSTANTS
# =============================================================================

VERSION = "1.1.0"

# v1.1.0: Tail risk thresholds (aligned with historical_data.py)
TAIL_RISK_THRESHOLDS = {
    "var_95_min_obs": 252,      # 1 year daily → historical VaR95
    "var_99_min_obs": 1000,     # 4 years daily → historical VaR99
    "moments_min_obs": 252,     # 1 year for skew/kurtosis
    "confidence_high": 1000,    # >= 1000 obs
    "confidence_medium": 252,   # >= 252 obs
}

LEVERAGE_KEYWORDS = {
    "2x", "3x", "-1x", "-2x", "-3x",
    "ultra", "ultrapro", "ultrashort",
    "leveraged", "inverse", "short",
    "bull", "bear",
}

LEVERAGE_TICKERS = {
    "TQQQ", "SOXL", "UPRO", "SPXL", "TECL", "FAS", "LABU", "NUGT",
    "TNA", "UDOW", "UMDD", "URTY", "NAIL", "DFEN", "WANT", "WEBL",
    "FNGU", "BULZ", "SOXS", "PILL", "RETL", "DPST", "DRN", "ERX",
    "SQQQ", "SPXS", "SDOW", "SDS", "QID", "PSQ", "SH", "DOG",
    "FAZ", "LABD", "DUST", "TZA", "SRTY", "SMDD", "UVXY", "VXX",
    "DRIP", "ERY", "YANG", "CHAD",
}

LEVERAGE_FACTORS = {
    "TQQQ": 3.0, "SOXL": 3.0, "UPRO": 3.0, "SPXL": 3.0, "TECL": 3.0,
    "FAS": 3.0, "LABU": 3.0, "NUGT": 3.0, "TNA": 3.0, "UDOW": 3.0,
    "SSO": 2.0, "QLD": 2.0, "DDM": 2.0, "UWM": 2.0, "MVV": 2.0,
    "SQQQ": -3.0, "SPXS": -3.0, "SDOW": -3.0, "FAZ": -3.0, "LABD": -3.0,
    "DUST": -3.0, "TZA": -3.0, "SRTY": -3.0,
    "SDS": -2.0, "QID": -2.0, "DXD": -2.0, "TWM": -2.0, "MZZ": -2.0,
    "SH": -1.0, "PSQ": -1.0, "DOG": -1.0, "RWM": -1.0,
}

PREFERRED_KEYWORDS = {
    "preferred", "pref", "prfd", "pff", "pffd", "pgx", "psk",
    "convertible", "hybrid", "perpetual",
}

PREFERRED_TICKERS = {
    "PFF", "PFFD", "PGX", "SPFF", "IPFF", "PSK", "PFXF", "PFFV",
    "VRP", "PRFD", "FPE", "FPEI",
}

LIQUIDITY_AUM_THRESHOLDS = {
    "high": 1_000_000_000,
    "medium": 100_000_000,
    "low": 10_000_000,
}

LIQUIDITY_VOLUME_THRESHOLDS = {
    "high": 1_000_000,
    "medium": 100_000,
    "low": 10_000,
}

ALERT_THRESHOLDS = {
    "Stable": {
        "max_leverage": 1.0,
        "max_leveraged_weight": 0.0,
        "max_illiquid_weight": 10.0,
        "min_liquidity_score": 70.0,
        "max_var_99": -15.0,
        "max_cvar_99": -20.0,
    },
    "Modere": {
        "max_leverage": 1.5,
        "max_leveraged_weight": 5.0,
        "max_illiquid_weight": 15.0,
        "min_liquidity_score": 60.0,
        "max_var_99": -20.0,
        "max_cvar_99": -25.0,
    },
    "Agressif": {
        "max_leverage": 2.5,
        "max_leveraged_weight": 15.0,
        "max_illiquid_weight": 25.0,
        "min_liquidity_score": 50.0,
        "max_var_99": -30.0,
        "max_cvar_99": -40.0,
    },
}

PREFERRED_STRESS_PARAMS = {
    "Stable": {"equity_beta": 0.3, "duration": 5.0, "rate_shock_bps": 100},
    "Modere": {"equity_beta": 0.4, "duration": 6.0, "rate_shock_bps": 150},
    "Agressif": {"equity_beta": 0.5, "duration": 7.0, "rate_shock_bps": 200},
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class LeverageAnalysis:
    has_leveraged: bool = False
    has_inverse: bool = False
    instruments: List[str] = field(default_factory=list)
    total_weight_pct: float = 0.0
    effective_leverage: float = 1.0
    stress_multiplier: float = 1.0
    details: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "has_leveraged": self.has_leveraged,
            "has_inverse": self.has_inverse,
            "instruments": self.instruments,
            "total_weight_pct": round(self.total_weight_pct, 2),
            "effective_leverage": round(self.effective_leverage, 2),
            "stress_multiplier": round(self.stress_multiplier, 2),
            "details": self.details,
        }


@dataclass
class PreferredStockAnalysis:
    has_preferred: bool = False
    instruments: List[str] = field(default_factory=list)
    total_weight_pct: float = 0.0
    equity_sensitivity: float = 0.0
    rate_sensitivity: float = 0.0
    dual_shock_impact_pct: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "has_preferred": self.has_preferred,
            "instruments": self.instruments,
            "total_weight_pct": round(self.total_weight_pct, 2),
            "equity_sensitivity": round(self.equity_sensitivity, 3),
            "rate_sensitivity": round(self.rate_sensitivity, 3),
            "dual_shock_impact_pct": round(self.dual_shock_impact_pct, 2),
            "details": self.details,
        }


@dataclass
class TailRiskMetrics:
    """
    v1.1.0: Enriched with method/n_obs/confidence_level for hybrid VaR.
    """
    var_95: float = 0.0
    var_99: float = 0.0
    cvar_95: float = 0.0
    cvar_99: float = 0.0
    max_drawdown_expected: float = 0.0
    skewness: float = 0.0
    kurtosis: float = 3.0
    fat_tails: bool = False
    # v1.1.0: Method tracking
    var_95_method: str = "parametric"  # "historical" or "parametric"
    var_99_method: str = "parametric"  # "historical" or "parametric"
    n_obs: int = 0
    confidence_level: str = "low"  # "high", "medium", "low"
    data_start_date: Optional[str] = None
    data_end_date: Optional[str] = None
    leveraged_tickers: List[str] = field(default_factory=list)
    leveraged_warning: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        d = {
            "var_95_pct": round(self.var_95 * 100, 2),
            "var_99_pct": round(self.var_99 * 100, 2),
            "cvar_95_pct": round(self.cvar_95 * 100, 2),
            "cvar_99_pct": round(self.cvar_99 * 100, 2),
            "max_drawdown_expected_pct": round(self.max_drawdown_expected * 100, 2),
            "skewness": round(self.skewness, 3),
            "kurtosis": round(self.kurtosis, 3),
            "fat_tails": self.fat_tails,
            # v1.1.0: Method metadata
            "method": {
                "var_95": self.var_95_method,
                "var_99": self.var_99_method,
            },
            "n_obs": self.n_obs,
            "confidence_level": self.confidence_level,
        }
        if self.data_start_date:
            d["data_period"] = {
                "start": self.data_start_date,
                "end": self.data_end_date,
            }
        if self.leveraged_tickers:
            d["leveraged_tickers"] = self.leveraged_tickers
            d["leveraged_warning"] = self.leveraged_warning or (
                "Portfolio contains leveraged/inverse ETFs. Long-term historical VaR "
                "may be unreliable due to volatility decay."
            )
        return d


@dataclass
class LiquidityAnalysis:
    portfolio_score: float = 100.0
    illiquid_weight_pct: float = 0.0
    days_to_liquidate_95pct: float = 1.0
    concentration_risk: str = "low"
    details: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "portfolio_score": round(self.portfolio_score, 1),
            "illiquid_weight_pct": round(self.illiquid_weight_pct, 2),
            "days_to_liquidate_95pct": round(self.days_to_liquidate_95pct, 1),
            "concentration_risk": self.concentration_risk,
            "details": self.details,
        }


@dataclass
class RiskAlert:
    level: str
    alert_type: str
    message: str
    recommendation: Optional[str] = None
    value: Optional[float] = None
    threshold: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        d = {"level": self.level, "type": self.alert_type, "message": self.message}
        if self.recommendation:
            d["recommendation"] = self.recommendation
        if self.value is not None:
            d["value"] = self.value
        if self.threshold is not None:
            d["threshold"] = self.threshold
        return d


@dataclass
class RiskAnalysisResult:
    version: str = VERSION
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    profile_name: str = ""
    stress_tests: Dict[str, Any] = field(default_factory=dict)
    leverage_analysis: LeverageAnalysis = field(default_factory=LeverageAnalysis)
    preferred_analysis: PreferredStockAnalysis = field(default_factory=PreferredStockAnalysis)
    tail_risk: TailRiskMetrics = field(default_factory=TailRiskMetrics)
    liquidity: LiquidityAnalysis = field(default_factory=LiquidityAnalysis)
    alerts: List[RiskAlert] = field(default_factory=list)
    # v1.1.0: History metadata
    history_metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        # v1.1.0: Dynamic data_limits based on actual data
        n_obs = self.tail_risk.n_obs
        if n_obs >= TAIL_RISK_THRESHOLDS["var_99_min_obs"]:
            data_window = "5_years_daily"
            var99_confidence = "high"
        elif n_obs >= TAIL_RISK_THRESHOLDS["var_95_min_obs"]:
            data_window = "1_year_daily"
            var99_confidence = "medium_parametric_var99"
        else:
            data_window = "short_window"
            var99_confidence = "low_parametric"
        
        return {
            "version": self.version,
            "timestamp": self.timestamp.isoformat(),
            "profile": self.profile_name,
            "data_limits": {
                "data_window": data_window,
                "data_points": n_obs,
                "var_95_method": self.tail_risk.var_95_method,
                "var_99_method": self.tail_risk.var_99_method,
                "var99_confidence": var99_confidence,
                "confidence_level": self.tail_risk.confidence_level,
                "stress_tests_calibration": "indicative_scenarios_not_historical",
                "thresholds": TAIL_RISK_THRESHOLDS,
                "disclaimer": (
                    f"VaR95 method: {self.tail_risk.var_95_method}. "
                    f"VaR99 method: {self.tail_risk.var_99_method}. "
                    f"Based on {n_obs} observations. "
                    "Historical VaR requires >=252 obs (VaR95) or >=1000 obs (VaR99)."
                ),
            },
            "stress_tests": self.stress_tests,
            "leverage_analysis": self.leverage_analysis.to_dict(),
            "preferred_analysis": self.preferred_analysis.to_dict(),
            "tail_risk": self.tail_risk.to_dict(),
            "liquidity": self.liquidity.to_dict(),
            "alerts": [a.to_dict() for a in self.alerts],
            "alert_summary": {
                "total": len(self.alerts),
                "critical": sum(1 for a in self.alerts if a.level == "critical"),
                "warning": sum(1 for a in self.alerts if a.level == "warning"),
                "info": sum(1 for a in self.alerts if a.level == "info"),
            },
            "history_metadata": self.history_metadata,
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (TypeError, ValueError):
        return default


def _normalize_weight(weight: float) -> float:
    """Normalise un poids en fraction (0-1)."""
    if weight > 1.0:
        return weight / 100.0
    return weight


def _normalize_leverage(leverage_raw: Any) -> float:
    if leverage_raw is None:
        return 1.0
    if isinstance(leverage_raw, str):
        s = leverage_raw.lower().strip()
        match = re.search(r"(-?\d+(?:\.\d+)?)\s*x?", s)
        if match:
            return float(match.group(1))
        return 1.0
    try:
        val = float(leverage_raw)
        if val > 10:
            return val / 100.0
        if val == 0:
            return 1.0
        return val
    except (TypeError, ValueError):
        return 1.0


def _extract_ticker(asset: Dict[str, Any]) -> Optional[str]:
    for key in ["ticker", "symbol", "etfsymbol", "id"]:
        val = asset.get(key)
        if val and isinstance(val, str):
            return val.upper()
    return None


def _extract_name(asset: Dict[str, Any]) -> str:
    return str(asset.get("name", asset.get("id", "Unknown")))


def _determine_confidence_level(n_obs: int) -> str:
    """v1.1.0: Determine confidence level based on observation count."""
    if n_obs >= TAIL_RISK_THRESHOLDS["confidence_high"]:
        return "high"
    elif n_obs >= TAIL_RISK_THRESHOLDS["confidence_medium"]:
        return "medium"
    return "low"


def _determine_var_method(n_obs: int, var_level: str = "95") -> str:
    """v1.1.0: Determine VaR method based on observation count."""
    if var_level == "99":
        threshold = TAIL_RISK_THRESHOLDS["var_99_min_obs"]
    else:
        threshold = TAIL_RISK_THRESHOLDS["var_95_min_obs"]
    
    return "historical" if n_obs >= threshold else "parametric"


# =============================================================================
# DETECTION FUNCTIONS
# =============================================================================

def detect_leveraged_instruments(allocation: List[Dict[str, Any]]) -> LeverageAnalysis:
    result = LeverageAnalysis()
    leveraged_items = []
    total_leveraged_weight = 0.0
    weighted_leverage = 0.0
    
    for asset in allocation:
        ticker = _extract_ticker(asset)
        name = _extract_name(asset).lower()
        weight = _safe_float(asset.get("weight", asset.get("weight_pct", 0)))
        weight = _normalize_weight(weight)
        
        is_leveraged = False
        leverage_factor = 1.0
        
        if ticker and ticker in LEVERAGE_TICKERS:
            is_leveraged = True
            leverage_factor = LEVERAGE_FACTORS.get(ticker, 2.0)
        
        if not is_leveraged:
            for kw in LEVERAGE_KEYWORDS:
                if kw in name:
                    is_leveraged = True
                    if "3x" in name or "triple" in name:
                        leverage_factor = 3.0
                    elif "2x" in name or "double" in name or "ultra" in name:
                        leverage_factor = 2.0
                    elif "-3x" in name:
                        leverage_factor = -3.0
                    elif "-2x" in name or "ultrashort" in name:
                        leverage_factor = -2.0
                    elif "short" in name or "inverse" in name or "bear" in name:
                        leverage_factor = -1.0
                    break
        
        if not is_leveraged:
            source_data = asset.get("source_data", {})
            raw_lev = source_data.get("leverage", source_data.get("leveraged"))
            if raw_lev:
                norm_lev = _normalize_leverage(raw_lev)
                if abs(norm_lev) > 1.0:
                    is_leveraged = True
                    leverage_factor = norm_lev
        
        if is_leveraged:
            leveraged_items.append({
                "ticker": ticker or name[:20],
                "name": _extract_name(asset),
                "weight_pct": weight * 100,
                "leverage_factor": leverage_factor,
            })
            total_leveraged_weight += weight
            weighted_leverage += weight * abs(leverage_factor)
            if leverage_factor < 0:
                result.has_inverse = True
    
    if leveraged_items:
        result.has_leveraged = True
        result.instruments = [item["ticker"] for item in leveraged_items]
        result.total_weight_pct = total_leveraged_weight * 100
        result.details["items"] = leveraged_items
        non_leveraged_weight = 1.0 - total_leveraged_weight
        result.effective_leverage = non_leveraged_weight * 1.0 + weighted_leverage
        result.stress_multiplier = min(3.0, result.effective_leverage)
    
    return result


def detect_preferred_stocks(allocation: List[Dict[str, Any]]) -> PreferredStockAnalysis:
    result = PreferredStockAnalysis()
    preferred_items = []
    total_weight = 0.0
    
    for asset in allocation:
        ticker = _extract_ticker(asset)
        name = _extract_name(asset).lower()
        weight = _safe_float(asset.get("weight", asset.get("weight_pct", 0)))
        weight = _normalize_weight(weight)
        
        is_preferred = False
        
        if ticker and ticker in PREFERRED_TICKERS:
            is_preferred = True
        
        if not is_preferred:
            for kw in PREFERRED_KEYWORDS:
                if kw in name:
                    is_preferred = True
                    break
        
        if not is_preferred:
            source_data = asset.get("source_data", {})
            fund_type = str(source_data.get("fund_type", "")).lower()
            if "preferred" in fund_type or "convertible" in fund_type:
                is_preferred = True
        
        if is_preferred:
            preferred_items.append({
                "ticker": ticker or name[:20],
                "name": _extract_name(asset),
                "weight_pct": weight * 100,
            })
            total_weight += weight
    
    if preferred_items:
        result.has_preferred = True
        result.instruments = [item["ticker"] for item in preferred_items]
        result.total_weight_pct = total_weight * 100
        result.details["items"] = preferred_items
    
    return result


def detect_low_liquidity(
    allocation: List[Dict[str, Any]], 
    aum_threshold: float = LIQUIDITY_AUM_THRESHOLDS["low"]
) -> List[Dict[str, Any]]:
    illiquid = []
    for asset in allocation:
        source_data = asset.get("source_data", {})
        aum = _safe_float(source_data.get("aum_usd", source_data.get("aum")))
        volume = _safe_float(source_data.get("avg_volume", source_data.get("volume")))
        weight = _normalize_weight(_safe_float(asset.get("weight", asset.get("weight_pct", 0))))
        
        is_illiquid = False
        reasons = []
        
        if aum > 0 and aum < aum_threshold:
            is_illiquid = True
            reasons.append(f"AUM ${aum/1e6:.1f}M < ${aum_threshold/1e6:.0f}M")
        if volume > 0 and volume < LIQUIDITY_VOLUME_THRESHOLDS["low"]:
            is_illiquid = True
            reasons.append(f"Volume {volume/1000:.0f}K < {LIQUIDITY_VOLUME_THRESHOLDS['low']/1000:.0f}K")
        
        if is_illiquid:
            illiquid.append({
                "ticker": _extract_ticker(asset) or _extract_name(asset)[:20],
                "name": _extract_name(asset),
                "weight_pct": weight * 100,
                "aum_usd": aum,
                "volume": volume,
                "reasons": reasons,
            })
    return illiquid


# =============================================================================
# ANALYSIS FUNCTIONS
# =============================================================================

def compute_leverage_stress_multiplier(
    leverage_analysis: LeverageAnalysis, 
    base_stress_impact: float
) -> float:
    if not leverage_analysis.has_leveraged:
        return base_stress_impact
    return base_stress_impact * leverage_analysis.stress_multiplier


def compute_preferred_dual_shock(
    preferred_analysis: PreferredStockAnalysis, 
    equity_shock: float, 
    rate_shock_bps: float, 
    profile_name: str = "Modere"
) -> float:
    if not preferred_analysis.has_preferred:
        return 0.0
    params = PREFERRED_STRESS_PARAMS.get(profile_name, PREFERRED_STRESS_PARAMS["Modere"])
    equity_impact = params["equity_beta"] * equity_shock
    delta_rate = rate_shock_bps / 10000.0
    rate_pnl = -params["duration"] * delta_rate
    total_impact = equity_impact + rate_pnl
    preferred_analysis.equity_sensitivity = params["equity_beta"]
    preferred_analysis.rate_sensitivity = params["duration"]
    preferred_analysis.dual_shock_impact_pct = total_impact * 100
    preferred_analysis.details["equity_component_pct"] = equity_impact * 100
    preferred_analysis.details["rate_component_pct"] = rate_pnl * 100
    return total_impact


def compute_tail_risk_metrics(
    returns: Optional[np.ndarray] = None,
    weights: Optional[np.ndarray] = None,
    cov_matrix: Optional[np.ndarray] = None,
    confidence_levels: Tuple[float, float] = (0.95, 0.99),
    history_metadata: Optional[Dict[str, Any]] = None,
) -> TailRiskMetrics:
    """
    v1.1.0: Hybrid VaR calculation.
    
    - VaR95: historical if n_obs >= 252, else parametric
    - VaR99: historical if n_obs >= 1000, else parametric
    - Skew/Kurtosis: only if n_obs >= 252
    
    Args:
        returns: Historical returns array (T,) or (T, N)
        weights: Portfolio weights (N,)
        cov_matrix: Covariance matrix (N x N) for parametric
        confidence_levels: VaR levels (default: 95%, 99%)
        history_metadata: Metadata from fetch_portfolio_returns()
    
    Returns:
        TailRiskMetrics with method tracking
    """
    result = TailRiskMetrics()
    
    # Extract metadata if provided
    if history_metadata:
        result.n_obs = history_metadata.get("n_obs", 0)
        result.data_start_date = history_metadata.get("first_date")
        result.data_end_date = history_metadata.get("last_date")
        result.leveraged_tickers = history_metadata.get("leveraged_tickers", [])
        result.leveraged_warning = history_metadata.get("leveraged_warning")
        result.confidence_level = history_metadata.get("confidence_level", "low")
        result.var_95_method = history_metadata.get("var_95_method", "parametric")
        result.var_99_method = history_metadata.get("var_99_method", "parametric")
    
    # === PARAMETRIC VaR (always computed as baseline/fallback) ===
    if weights is not None and cov_matrix is not None:
        try:
            port_vol = np.sqrt(weights @ cov_matrix @ weights)
            port_mean = 0.0
            z_95, z_99 = 1.645, 2.326
            
            # Parametric VaR
            param_var_95 = port_mean - z_95 * port_vol
            param_var_99 = port_mean - z_99 * port_vol
            param_cvar_95 = port_mean - port_vol * 2.063
            param_cvar_99 = port_mean - port_vol * 2.665
            
            # Set as default (may be overwritten by historical)
            result.var_95 = param_var_95
            result.var_99 = param_var_99
            result.cvar_95 = param_cvar_95
            result.cvar_99 = param_cvar_99
            
            T = 252
            result.max_drawdown_expected = -port_vol * np.sqrt(2 * np.log(T))
        except Exception as e:
            logger.warning(f"[tail_risk] Parametric calculation error: {e}")
    
    # === HISTORICAL VaR (if returns provided and sufficient) ===
    if returns is not None and len(returns) > 30:
        # Compute portfolio returns
        if weights is not None and returns.ndim == 2:
            port_returns = returns @ weights
        else:
            port_returns = returns.flatten() if returns.ndim > 1 else returns
        
        n_obs = len(port_returns)
        result.n_obs = n_obs
        result.confidence_level = _determine_confidence_level(n_obs)
        result.var_95_method = _determine_var_method(n_obs, "95")
        result.var_99_method = _determine_var_method(n_obs, "99")
        
        # === VaR 95%: historical if n_obs >= 252 ===
        if n_obs >= TAIL_RISK_THRESHOLDS["var_95_min_obs"]:
            result.var_95 = float(np.percentile(port_returns, 5))
            sorted_returns = np.sort(port_returns)
            n_05 = max(1, int(n_obs * 0.05))
            result.cvar_95 = float(np.mean(sorted_returns[:n_05]))
            logger.debug(f"[tail_risk] VaR95 historical: {result.var_95*100:.2f}%")
        
        # === VaR 99%: historical if n_obs >= 1000 ===
        if n_obs >= TAIL_RISK_THRESHOLDS["var_99_min_obs"]:
            result.var_99 = float(np.percentile(port_returns, 1))
            sorted_returns = np.sort(port_returns)
            n_01 = max(1, int(n_obs * 0.01))
            result.cvar_99 = float(np.mean(sorted_returns[:n_01]))
            logger.debug(f"[tail_risk] VaR99 historical: {result.var_99*100:.2f}%")
        else:
            # Keep parametric VaR99 (already set above)
            logger.info(f"[tail_risk] VaR99 parametric (n_obs={n_obs} < 1000)")
        
        # === Skewness & Kurtosis: only if n_obs >= 252 ===
        if n_obs >= TAIL_RISK_THRESHOLDS["moments_min_obs"]:
            if HAS_SCIPY:
                result.skewness = float(scipy_stats.skew(port_returns))
                result.kurtosis = float(scipy_stats.kurtosis(port_returns, fisher=False))
            else:
                mean = np.mean(port_returns)
                std = np.std(port_returns)
                if std > 0:
                    result.skewness = float(np.mean(((port_returns - mean) / std) ** 3))
                    result.kurtosis = float(np.mean(((port_returns - mean) / std) ** 4))
            
            result.fat_tails = result.kurtosis > 4.0
        else:
            # Not enough data for reliable moments
            result.skewness = 0.0
            result.kurtosis = 3.0  # Normal assumption
            result.fat_tails = False
            logger.info(f"[tail_risk] Skew/Kurt skipped (n_obs={n_obs} < 252)")
        
        # Max drawdown from historical
        if n_obs >= TAIL_RISK_THRESHOLDS["var_95_min_obs"]:
            cumulative = np.cumprod(1 + port_returns)
            running_max = np.maximum.accumulate(cumulative)
            drawdowns = (cumulative - running_max) / running_max
            result.max_drawdown_expected = float(np.min(drawdowns))
    
    return result


def compute_liquidity_score(
    allocation: List[Dict[str, Any]], 
    profile_name: str = "Modere"
) -> LiquidityAnalysis:
    result = LiquidityAnalysis()
    if not allocation:
        return result
    
    scores = []
    weights_list = []
    illiquid_weight = 0.0
    
    for asset in allocation:
        source_data = asset.get("source_data", {})
        weight = _normalize_weight(_safe_float(asset.get("weight", asset.get("weight_pct", 0))))
        aum = _safe_float(source_data.get("aum_usd", source_data.get("aum")))
        volume = _safe_float(source_data.get("avg_volume", source_data.get("volume")))
        
        asset_score = 50
        if aum > LIQUIDITY_AUM_THRESHOLDS["high"]:
            asset_score = 100
        elif aum > LIQUIDITY_AUM_THRESHOLDS["medium"]:
            asset_score = 80
        elif aum > LIQUIDITY_AUM_THRESHOLDS["low"]:
            asset_score = 60
        elif aum > 0:
            asset_score = 30
            illiquid_weight += weight
        
        if volume > LIQUIDITY_VOLUME_THRESHOLDS["high"]:
            asset_score = min(100, asset_score + 10)
        elif volume > 0 and volume < LIQUIDITY_VOLUME_THRESHOLDS["low"]:
            asset_score = max(0, asset_score - 20)
            illiquid_weight += weight * 0.5
        
        scores.append(asset_score)
        weights_list.append(weight)
    
    if sum(weights_list) > 0:
        result.portfolio_score = np.average(scores, weights=weights_list)
    result.illiquid_weight_pct = min(illiquid_weight * 100, 100)
    
    weight_array = np.array(weights_list)
    if len(weight_array) > 0:
        hhi = np.sum(weight_array ** 2)
        if hhi > 0.15:
            result.concentration_risk = "high"
        elif hhi > 0.08:
            result.concentration_risk = "medium"
        else:
            result.concentration_risk = "low"
    
    total_aum = 0.0
    total_volume = 0.0
    for a in allocation:
        w_frac = _normalize_weight(_safe_float(a.get("weight", a.get("weight_pct", 0))))
        aum = _safe_float(a.get("source_data", {}).get("aum_usd", 0))
        vol = _safe_float(a.get("source_data", {}).get("avg_volume", 0))
        price = _safe_float(a.get("source_data", {}).get("price", 100))
        total_aum += aum * w_frac
        total_volume += vol * price
    
    if total_volume > 0:
        result.days_to_liquidate_95pct = (0.95 * total_aum) / (0.10 * total_volume)
        result.days_to_liquidate_95pct = min(result.days_to_liquidate_95pct, 30)
    
    return result


# =============================================================================
# ALERT GENERATION
# =============================================================================

def generate_alerts(
    leverage_analysis: LeverageAnalysis, 
    preferred_analysis: PreferredStockAnalysis, 
    tail_risk: TailRiskMetrics, 
    liquidity: LiquidityAnalysis, 
    profile_name: str
) -> List[RiskAlert]:
    alerts = []
    thresholds = ALERT_THRESHOLDS.get(profile_name, ALERT_THRESHOLDS["Modere"])
    
    # === LEVERAGE ALERTS ===
    if leverage_analysis.has_leveraged:
        if leverage_analysis.effective_leverage > thresholds["max_leverage"]:
            level = "warning" if leverage_analysis.effective_leverage < thresholds["max_leverage"] * 1.5 else "critical"
            alerts.append(RiskAlert(
                level=level, 
                alert_type="leverage", 
                message=f"Leverage effectif ({leverage_analysis.effective_leverage:.1f}x) > seuil {profile_name}", 
                recommendation="Reduire positions leveraged", 
                value=leverage_analysis.effective_leverage, 
                threshold=thresholds["max_leverage"]
            ))
        if leverage_analysis.total_weight_pct > thresholds["max_leveraged_weight"]:
            alerts.append(RiskAlert(
                level="warning", 
                alert_type="leverage", 
                message=f"Poids leveraged ({leverage_analysis.total_weight_pct:.1f}%) > seuil", 
                value=leverage_analysis.total_weight_pct, 
                threshold=thresholds["max_leveraged_weight"]
            ))
        if leverage_analysis.has_inverse:
            alerts.append(RiskAlert(
                level="info", 
                alert_type="leverage", 
                message="Portfolio contient des ETF inverse"
            ))
    
    # === PREFERRED ALERTS ===
    if preferred_analysis.has_preferred and abs(preferred_analysis.dual_shock_impact_pct) > 15:
        alerts.append(RiskAlert(
            level="warning", 
            alert_type="preferred", 
            message=f"Impact dual shock preferred eleve ({preferred_analysis.dual_shock_impact_pct:.1f}%)", 
            recommendation="Reduire exposition preferred", 
            value=preferred_analysis.dual_shock_impact_pct
        ))
    
    # === TAIL RISK ALERTS ===
    if tail_risk.var_99 * 100 < thresholds["max_var_99"]:
        alerts.append(RiskAlert(
            level="warning", 
            alert_type="tail_risk", 
            message=f"VaR 99% ({tail_risk.var_99*100:.1f}%) depasse seuil", 
            value=tail_risk.var_99 * 100, 
            threshold=thresholds["max_var_99"]
        ))
    if tail_risk.fat_tails:
        alerts.append(RiskAlert(
            level="info", 
            alert_type="tail_risk", 
            message=f"Kurtosis eleve ({tail_risk.kurtosis:.1f}) - fat tails"
        ))
    if tail_risk.skewness < -0.5:
        alerts.append(RiskAlert(
            level="info", 
            alert_type="tail_risk", 
            message=f"Skewness negatif ({tail_risk.skewness:.2f})"
        ))
    
    # v1.1.0: Alert if VaR99 is parametric
    if tail_risk.var_99_method == "parametric" and tail_risk.n_obs > 0:
        alerts.append(RiskAlert(
            level="info", 
            alert_type="tail_risk", 
            message=f"VaR99 parametrique (n_obs={tail_risk.n_obs} < 1000)", 
            recommendation="Interpreter avec prudence - VaR99 historique requiert 4+ ans de donnees"
        ))
    
    # v1.1.0: Alert if leveraged tickers in portfolio
    if tail_risk.leveraged_tickers:
        alerts.append(RiskAlert(
            level="warning", 
            alert_type="tail_risk", 
            message=f"ETF leveraged detectes: {', '.join(tail_risk.leveraged_tickers[:3])}", 
            recommendation="VaR historique peu fiable pour ETF leveraged (volatility decay)"
        ))
    
    # === LIQUIDITY ALERTS ===
    if liquidity.portfolio_score < thresholds["min_liquidity_score"]:
        alerts.append(RiskAlert(
            level="warning", 
            alert_type="liquidity", 
            message=f"Score liquidite ({liquidity.portfolio_score:.0f}) < seuil", 
            value=liquidity.portfolio_score, 
            threshold=thresholds["min_liquidity_score"]
        ))
    if liquidity.illiquid_weight_pct > thresholds["max_illiquid_weight"]:
        alerts.append(RiskAlert(
            level="warning", 
            alert_type="liquidity", 
            message=f"Poids illiquide ({liquidity.illiquid_weight_pct:.1f}%) > seuil", 
            value=liquidity.illiquid_weight_pct, 
            threshold=thresholds["max_illiquid_weight"]
        ))
    if liquidity.concentration_risk == "high":
        alerts.append(RiskAlert(
            level="warning", 
            alert_type="liquidity", 
            message="Concentration elevee", 
            recommendation="Diversifier"
        ))
    
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: severity_order.get(a.level, 3))
    return alerts


# =============================================================================
# MAIN CLASS: RiskAnalyzer
# =============================================================================

class RiskAnalyzer:
    """
    v1.1.0: Enhanced with historical_data.py integration.
    
    Usage:
        analyzer = RiskAnalyzer(
            allocation=allocation,
            cov_matrix=cov_matrix,
            weights=weights,
            returns_history=returns_matrix,  # From fetch_portfolio_returns()
            history_metadata=metadata,       # From fetch_portfolio_returns()
        )
        result = analyzer.run_full_analysis("Modere")
    """
    
    def __init__(
        self, 
        allocation: List[Dict[str, Any]], 
        cov_matrix: Optional[np.ndarray] = None, 
        weights: Optional[np.ndarray] = None, 
        expected_returns: Optional[np.ndarray] = None, 
        returns_history: Optional[np.ndarray] = None, 
        sectors: Optional[List[str]] = None, 
        asset_classes: Optional[List[str]] = None,
        history_metadata: Optional[Dict[str, Any]] = None,  # v1.1.0
    ):
        self.allocation = allocation
        self.cov_matrix = cov_matrix
        self.weights = weights
        self.expected_returns = expected_returns if expected_returns is not None else (
            np.zeros(len(allocation)) if allocation else np.array([])
        )
        self.returns_history = returns_history
        self.sectors = sectors
        self.asset_classes = asset_classes
        self.history_metadata = history_metadata or {}  # v1.1.0
        
        if self.weights is None and allocation:
            self.weights = np.array([
                _normalize_weight(_safe_float(a.get("weight", a.get("weight_pct", 0)))) 
                for a in allocation
            ])
    
    def run_stress_scenarios(self, profile_name: str = "Modere", scenarios=None) -> Dict[str, Any]:
        if not HAS_STRESS_TESTING:
            return {"error": "stress_testing module not available"}
        if self.cov_matrix is None or self.weights is None:
            return {"error": "cov_matrix and weights required"}
        
        default_scenarios = [
            StressScenario.CORRELATION_SPIKE, 
            StressScenario.VOLATILITY_SHOCK, 
            StressScenario.LIQUIDITY_CRISIS, 
            StressScenario.RATE_SHOCK, 
            StressScenario.MARKET_CRASH
        ]
        pack = run_stress_test_pack(
            weights=self.weights, 
            expected_returns=self.expected_returns, 
            cov_matrix=self.cov_matrix, 
            scenarios=scenarios or default_scenarios, 
            sectors=self.sectors, 
            asset_classes=self.asset_classes
        )
        
        result = pack.to_dict()
        result["source"] = "stress_testing.py"
        result["calibration_note"] = "Indicative scenarios, not calibrated on historical crises"
        
        leverage_analysis = detect_leveraged_instruments(self.allocation)
        if leverage_analysis.has_leveraged:
            result["adjustments_applied"] = result.get("adjustments_applied", {})
            result["adjustments_applied"]["leverage_multiplier"] = leverage_analysis.stress_multiplier
            if pack.worst_case:
                adjusted_loss = compute_leverage_stress_multiplier(
                    leverage_analysis, 
                    pack.worst_case.expected_loss
                )
                result["worst_case_adjusted"] = {
                    "scenario": pack.worst_case.scenario, 
                    "original_loss_pct": pack.worst_case.expected_loss * 100, 
                    "adjusted_loss_pct": adjusted_loss * 100
                }
        
        preferred_analysis = detect_preferred_stocks(self.allocation)
        if preferred_analysis.has_preferred:
            crash_params = get_scenario_parameters(StressScenario.MARKET_CRASH)
            dual_shock = compute_preferred_dual_shock(
                preferred_analysis, 
                equity_shock=crash_params.return_shock, 
                rate_shock_bps=PREFERRED_STRESS_PARAMS.get(profile_name, PREFERRED_STRESS_PARAMS["Modere"])["rate_shock_bps"], 
                profile_name=profile_name
            )
            result["adjustments_applied"] = result.get("adjustments_applied", {})
            result["adjustments_applied"]["preferred_dual_shock"] = True
            result["adjustments_applied"]["preferred_impact_pct"] = dual_shock * 100
        
        return result
    
    def run_full_analysis(
        self, 
        profile_name: str = "Modere", 
        include_stress: bool = True, 
        include_leverage: bool = True, 
        include_preferred: bool = True, 
        include_tail_risk: bool = True, 
        include_liquidity: bool = True
    ) -> RiskAnalysisResult:
        result = RiskAnalysisResult(profile_name=profile_name)
        result.history_metadata = self.history_metadata  # v1.1.0
        
        if include_stress:
            result.stress_tests = self.run_stress_scenarios(profile_name)
        
        if include_leverage:
            result.leverage_analysis = detect_leveraged_instruments(self.allocation)
        
        if include_preferred:
            result.preferred_analysis = detect_preferred_stocks(self.allocation)
            if result.preferred_analysis.has_preferred:
                compute_preferred_dual_shock(
                    result.preferred_analysis, 
                    equity_shock=-0.30, 
                    rate_shock_bps=PREFERRED_STRESS_PARAMS.get(profile_name, PREFERRED_STRESS_PARAMS["Modere"])["rate_shock_bps"], 
                    profile_name=profile_name
                )
        
        if include_tail_risk:
            result.tail_risk = compute_tail_risk_metrics(
                returns=self.returns_history, 
                weights=self.weights, 
                cov_matrix=self.cov_matrix,
                history_metadata=self.history_metadata,  # v1.1.0
            )
        
        if include_liquidity:
            result.liquidity = compute_liquidity_score(self.allocation, profile_name)
        
        result.alerts = generate_alerts(
            result.leverage_analysis, 
            result.preferred_analysis, 
            result.tail_risk, 
            result.liquidity, 
            profile_name
        )
        
        logger.info(
            f"[risk_analysis] {profile_name}: {len(result.alerts)} alerts, "
            f"VaR95={result.tail_risk.var_95_method}, VaR99={result.tail_risk.var_99_method}, "
            f"n_obs={result.tail_risk.n_obs}"
        )
        return result


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def enrich_portfolio_with_risk_analysis(
    portfolio_result: Dict[str, Any], 
    profile_name: str, 
    include_stress: bool = True, 
    include_tail_risk: bool = True, 
    include_liquidity: bool = True,
    returns_history: Optional[np.ndarray] = None,  # v1.1.0
    history_metadata: Optional[Dict[str, Any]] = None,  # v1.1.0
) -> Dict[str, Any]:
    """
    Enrichit un résultat de portfolio avec l'analyse de risque.
    
    v1.1.0: Accepts returns_history and history_metadata from fetch_portfolio_returns().
    
    Args:
        portfolio_result: Résultat de optimizer.build_portfolio()
        profile_name: Profil ("Stable", "Modere", "Agressif")
        include_*: Flags pour analyses
        returns_history: (T x N) matrix from fetch_portfolio_returns()
        history_metadata: Metadata dict from fetch_portfolio_returns()
    
    Returns:
        portfolio_result enrichi avec clé "risk_analysis"
    """
    allocation = portfolio_result.get("allocation", [])
    cov_matrix = portfolio_result.get("cov_matrix")
    weights = portfolio_result.get("weights")
    
    if weights is not None and not isinstance(weights, np.ndarray):
        weights = np.array(weights)
    if cov_matrix is not None and not isinstance(cov_matrix, np.ndarray):
        cov_matrix = np.array(cov_matrix)
    
    sectors = [a.get("sector") for a in allocation] if allocation else None
    asset_classes = [a.get("category", a.get("asset_class")) for a in allocation] if allocation else None
    
    analyzer = RiskAnalyzer(
        allocation=allocation, 
        cov_matrix=cov_matrix, 
        weights=weights, 
        sectors=sectors, 
        asset_classes=asset_classes,
        returns_history=returns_history,  # v1.1.0
        history_metadata=history_metadata,  # v1.1.0
    )
    
    result = analyzer.run_full_analysis(
        profile_name=profile_name, 
        include_stress=include_stress, 
        include_tail_risk=include_tail_risk, 
        include_liquidity=include_liquidity
    )
    
    portfolio_result["risk_analysis"] = result.to_dict()
    return portfolio_result


def fetch_and_enrich_risk_analysis(
    portfolio_result: Dict[str, Any],
    profile_name: str,
    lookback_years: int = 5,
    use_cache: bool = True,
    include_stress: bool = True,
    include_tail_risk: bool = True,
    include_liquidity: bool = True,
) -> Dict[str, Any]:
    """
    v1.1.0: Convenience function that fetches historical data and enriches risk analysis.
    
    Combines:
    1. fetch_portfolio_returns() from historical_data.py
    2. enrich_portfolio_with_risk_analysis()
    
    Args:
        portfolio_result: Résultat de optimizer.build_portfolio()
        profile_name: Profil ("Stable", "Modere", "Agressif")
        lookback_years: Years of historical data (default: 5)
        use_cache: Whether to use cached returns (default: True)
        include_*: Flags for analyses
    
    Returns:
        portfolio_result enrichi avec "risk_analysis" (hybrid VaR)
    """
    if not HAS_HISTORICAL_DATA:
        logger.warning("[risk_analysis] historical_data.py not available, using parametric only")
        return enrich_portfolio_with_risk_analysis(
            portfolio_result=portfolio_result,
            profile_name=profile_name,
            include_stress=include_stress,
            include_tail_risk=include_tail_risk,
            include_liquidity=include_liquidity,
        )
    
    # v1.1.1 FIX: Extract tickers from assets (allocation is {id: weight}, not list)
    assets = portfolio_result.get("assets", [])
    allocation_dict = portfolio_result.get("allocation", {})
    
    tickers = []
    for asset in assets:
        # Get asset ID
        if hasattr(asset, 'id'):
            asset_id = str(asset.id)
        elif isinstance(asset, dict):
            asset_id = str(asset.get("id", ""))
        else:
            continue
        
        # Only include assets that are in the final allocation
        if asset_id not in allocation_dict:
            continue
        
        # Extract ticker
        if hasattr(asset, 'ticker') and asset.ticker:
            ticker = str(asset.ticker).upper()
        elif hasattr(asset, 'symbol') and asset.symbol:
            ticker = str(asset.symbol).upper()
        elif isinstance(asset, dict):
            ticker = (asset.get("ticker") or asset.get("symbol") or "").upper()
        else:
            continue
        
        if ticker and ticker not in tickers:
            tickers.append(ticker)
    
    if not tickers:
        logger.warning("[risk_analysis] No tickers found in assets")
        return enrich_portfolio_with_risk_analysis(
            portfolio_result=portfolio_result,
            profile_name=profile_name,
            include_stress=include_stress,
            include_tail_risk=include_tail_risk,
            include_liquidity=include_liquidity,
        )
    
    # Fetch historical returns
    logger.info(f"[risk_analysis] Fetching {lookback_years}y returns for {len(tickers)} tickers...")
    returns_matrix, history_metadata = fetch_portfolio_returns(
        tickers=tickers,
        lookback_years=lookback_years,
        use_cache=use_cache,
    )
    
    if returns_matrix is None:
        logger.warning(f"[risk_analysis] Failed to fetch returns: {history_metadata.get('error')}")
        return enrich_portfolio_with_risk_analysis(
            portfolio_result=portfolio_result,
            profile_name=profile_name,
            include_stress=include_stress,
            include_tail_risk=include_tail_risk,
            include_liquidity=include_liquidity,
        )
    
    logger.info(
        f"[risk_analysis] Fetched {history_metadata.get('n_obs', 0)} obs, "
        f"confidence: {history_metadata.get('confidence_level', 'unknown')}"
    )
    
    # Enrich with risk analysis
    return enrich_portfolio_with_risk_analysis(
        portfolio_result=portfolio_result,
        profile_name=profile_name,
        include_stress=include_stress,
        include_tail_risk=include_tail_risk,
        include_liquidity=include_liquidity,
        returns_history=returns_matrix,
        history_metadata=history_metadata,
    )


# =============================================================================
# MODULE EXPORTS
# =============================================================================

__all__ = [
    # Main class
    "RiskAnalyzer",
    
    # Convenience functions
    "enrich_portfolio_with_risk_analysis",
    "fetch_and_enrich_risk_analysis",  # v1.1.0
    
    # Detection functions
    "detect_leveraged_instruments",
    "detect_preferred_stocks",
    "detect_low_liquidity",
    
    # Analysis functions
    "compute_leverage_stress_multiplier",
    "compute_preferred_dual_shock",
    "compute_tail_risk_metrics",
    "compute_liquidity_score",
    
    # Alert generation
    "generate_alerts",
    
    # Data classes
    "LeverageAnalysis",
    "PreferredStockAnalysis",
    "TailRiskMetrics",
    "LiquidityAnalysis",
    "RiskAlert",
    "RiskAnalysisResult",
    
    # Constants
    "VERSION",
    "LEVERAGE_TICKERS",
    "PREFERRED_TICKERS",
    "ALERT_THRESHOLDS",
    "TAIL_RISK_THRESHOLDS",  # v1.1.0
    
    # Flags
    "HAS_HISTORICAL_DATA",  # v1.1.0
    "HAS_STRESS_TESTING",
    "HAS_SCIPY",
]
