# portfolio_engine/risk_analysis.py
"""
Risk Analysis Module v1.2.0

Module d'enrichissement post-optimisation qui:
1. RÉUTILISE stress_testing.py (pas de duplication)
2. AJOUTE: leverage stress, preferred stock dual shock, tail risk, liquidity
3. INTÈGRE: historical_data.py pour VaR sur 5 ans de données

Changelog:
- v1.2.0: P0 Bug Fixes (Code Review 2026-01-27)
  - FIX: Alignment weights ↔ returns par ticker (_align_weights_to_tickers)
  - FIX: VaR99 fallback historique si parametric impossible
  - FIX: Convention signe VaR (perte positive en interne)
  - FIX: Fallback cov_matrix depuis returns_history si None
  - FIX: Leveraged detection "short" avec regex (évite faux positifs SUB, MINT)
  - NEW: _align_weights_to_tickers() avec report détaillé
  - NEW: _historical_var_cvar() avec convention perte positive
  - NEW: _is_leveraged_or_inverse() avec LEVERAGE_FALSE_POSITIVES
  - NEW: weight_alignment_report dans TailRiskMetrics
- v1.1.2: Fix allocation format mismatch
- v1.1.1: Fix extraction tickers
- v1.1.0: Hybrid VaR mode + historical_data.py integration
- v1.0.1: Fixes qualité
- v1.0.0: Initial release
"""

import logging
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    from portfolio_engine.stress_testing import (
        StressScenario, StressTestPack, run_stress_test_pack, get_scenario_parameters,
    )
    HAS_STRESS_TESTING = True
except ImportError:
    HAS_STRESS_TESTING = False

try:
    from scipy import stats as scipy_stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

try:
    from portfolio_engine.historical_data import (
        fetch_portfolio_returns, TAIL_RISK_THRESHOLDS as HIST_THRESHOLDS,
    )
    HAS_HISTORICAL_DATA = True
except ImportError:
    HAS_HISTORICAL_DATA = False
    HIST_THRESHOLDS = {"var_95_min_obs": 252, "var_99_min_obs": 1000}

logger = logging.getLogger("portfolio_engine.risk_analysis")

VERSION = "1.2.0"

TAIL_RISK_THRESHOLDS = {
    "var_95_min_obs": 252, "var_99_min_obs": 1000,
    "var_99_fallback_min": 100, "var_99_fallback_low": 250,
    "moments_min_obs": 252, "confidence_high": 1000, "confidence_medium": 252,
}

LEVERAGE_FALSE_POSITIVES = [
    "short-term", "short term", "short duration", "ultra short",
    "ultrashort bond", "short maturity", "near-term", "low duration",
]

SHORT_WORD_RE = re.compile(r"\bshort\b(?!\s*-?\s*term|\s*duration|\s*maturity)", re.IGNORECASE)
LEVERAGE_FACTOR_RE = re.compile(r"(?<!\d)(-?[23]x)\b", re.IGNORECASE)

LEVERAGE_KEYWORDS = {"2x", "3x", "-1x", "-2x", "-3x", "ultra", "ultrapro", "leveraged", "inverse", "bull", "bear"}
LEVERAGE_TICKERS = {"TQQQ", "SOXL", "UPRO", "SPXL", "TECL", "FAS", "LABU", "NUGT", "TNA", "UDOW",
    "SQQQ", "SPXS", "SDOW", "SDS", "QID", "PSQ", "SH", "DOG", "FAZ", "LABD", "DUST", "TZA"}
LEVERAGE_FACTORS = {"TQQQ": 3.0, "SOXL": 3.0, "UPRO": 3.0, "SQQQ": -3.0, "SPXS": -3.0, "SH": -1.0, "PSQ": -1.0}
PREFERRED_KEYWORDS = {"preferred", "pref", "prfd", "convertible", "hybrid", "perpetual"}
PREFERRED_TICKERS = {"PFF", "PFFD", "PGX", "SPFF", "PSK", "PFXF"}
LIQUIDITY_AUM_THRESHOLDS = {"high": 1_000_000_000, "medium": 100_000_000, "low": 10_000_000}
LIQUIDITY_VOLUME_THRESHOLDS = {"high": 1_000_000, "medium": 100_000, "low": 10_000}
ALERT_THRESHOLDS = {
    "Stable": {"max_leverage": 1.0, "max_leveraged_weight": 0.0, "max_illiquid_weight": 10.0, "min_liquidity_score": 70.0, "max_var_99": -15.0},
    "Modere": {"max_leverage": 1.5, "max_leveraged_weight": 5.0, "max_illiquid_weight": 15.0, "min_liquidity_score": 60.0, "max_var_99": -20.0},
    "Agressif": {"max_leverage": 2.5, "max_leveraged_weight": 15.0, "max_illiquid_weight": 25.0, "min_liquidity_score": 50.0, "max_var_99": -30.0},
}
PREFERRED_STRESS_PARAMS = {
    "Stable": {"equity_beta": 0.3, "duration": 5.0, "rate_shock_bps": 100},
    "Modere": {"equity_beta": 0.4, "duration": 6.0, "rate_shock_bps": 150},
    "Agressif": {"equity_beta": 0.5, "duration": 7.0, "rate_shock_bps": 200},
}

def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None: return default
    try:
        f = float(value)
        return default if math.isnan(f) or math.isinf(f) else f
    except: return default

def _normalize_weight(weight: float) -> float:
    return weight / 100.0 if weight > 1.0 else weight

def _extract_ticker(asset: Any) -> Optional[str]:
    if isinstance(asset, str): return asset.upper() if asset else None
    if isinstance(asset, dict):
        for key in ["ticker", "symbol", "etfsymbol", "id"]:
            val = asset.get(key)
            if val and isinstance(val, str): return val.upper()
    for attr in ["ticker", "symbol", "id"]:
        val = getattr(asset, attr, None)
        if val and isinstance(val, str): return val.upper()
    return None

def _extract_name(asset: Any) -> str:
    if isinstance(asset, str): return asset
    if isinstance(asset, dict): return str(asset.get("name", asset.get("id", "Unknown")))
    return str(getattr(asset, "name", getattr(asset, "id", "Unknown")))

def _determine_confidence_level(n_obs: int) -> str:
    if n_obs >= 1000: return "high"
    if n_obs >= 252: return "medium"
    return "low"

def _determine_var_method(n_obs: int, var_level: str = "95") -> str:
    threshold = TAIL_RISK_THRESHOLDS["var_99_min_obs"] if var_level == "99" else TAIL_RISK_THRESHOLDS["var_95_min_obs"]
    return "historical" if n_obs >= threshold else "parametric"

def _align_weights_to_tickers(allocation: List[Dict], history_tickers: List[str], allow_shorts: bool = False, strict: bool = False) -> Tuple[np.ndarray, Dict]:
    w_by_ticker, duplicates = {}, []
    for a in allocation:
        ticker = _extract_ticker(a)
        if not ticker: continue
        raw = a.get("weight", a.get("weight_pct", a.get("percentage", 0)))
        w = _normalize_weight(_safe_float(raw))
        if ticker in w_by_ticker:
            duplicates.append(ticker)
            w_by_ticker[ticker] += w
        else:
            w_by_ticker[ticker] = w
    hist = [t.upper().strip() for t in history_tickers]
    missing = [t for t in hist if t not in w_by_ticker]
    extra = [t for t in w_by_ticker if t not in set(hist)]
    weights = np.array([w_by_ticker.get(t, 0.0) for t in hist], dtype=float)
    s = float(np.sum(weights))
    if abs(s) < 1e-12:
        return np.zeros_like(weights), {"missing_in_allocation": missing, "extra_in_allocation": extra, "duplicates_in_allocation": sorted(set(duplicates)), "error": "sum_weights_zero"}
    weights = weights / s
    report = {"missing_in_allocation": missing, "extra_in_allocation": extra, "duplicates_in_allocation": sorted(set(duplicates))}
    if missing or extra: logger.warning(f"[align_weights] Mismatches: missing={missing}, extra={extra}")
    return weights, report

def _historical_var_cvar(port_returns: Optional[np.ndarray], alpha: float = 0.01) -> Tuple[float, float]:
    if port_returns is None or len(port_returns) == 0: return 0.0, 0.0
    q = float(np.quantile(port_returns, alpha))
    var = -q
    tail = port_returns[port_returns <= q]
    cvar = -float(np.mean(tail)) if tail.size > 0 else var
    return var, cvar

def _estimate_cov_from_returns(returns_history: np.ndarray, min_obs: int = 60) -> Optional[np.ndarray]:
    if returns_history is None or returns_history.ndim != 2 or returns_history.shape[0] < min_obs: return None
    try:
        cov = np.cov(returns_history, rowvar=False)
        if np.any(np.isnan(cov)) or np.any(np.isinf(cov)) or np.any(np.diag(cov) <= 0): return None
        return cov
    except: return None

def _is_leveraged_or_inverse(name: str, ticker: Optional[str]) -> Tuple[bool, float, str]:
    s = (name or "").lower()
    ticker_up = (ticker or "").upper()
    if ticker_up in LEVERAGE_TICKERS:
        factor = LEVERAGE_FACTORS.get(ticker_up, 2.0)
        return True, factor, "inverse" if factor < 0 else "leveraged"
    for fp in LEVERAGE_FALSE_POSITIVES:
        if fp in s: return False, 1.0, "standard"
    m = LEVERAGE_FACTOR_RE.search(s)
    if m:
        token = m.group(0).lower()
        factor = float(token.replace("x", ""))
        return True, factor, "inverse" if token.startswith("-") else "leveraged"
    for kw in LEVERAGE_KEYWORDS:
        if kw in s:
            if kw in ("inverse", "bear"): return True, -1.0, "inverse"
            if kw in ("ultra", "ultrapro", "leveraged", "bull"): return True, 2.0, "leveraged"
    if SHORT_WORD_RE.search(s): return True, -1.0, "inverse"
    return False, 1.0, "standard"

def _build_allocation_list(allocation: Any, assets: Optional[List] = None) -> List[Dict]:
    if isinstance(allocation, list): return allocation
    if isinstance(allocation, dict):
        asset_lookup = {}
        if assets:
            for asset in assets:
                aid = str(getattr(asset, "id", None) or asset.get("id", "") if isinstance(asset, dict) else "")
                if aid: asset_lookup[aid] = asset
        result = []
        for asset_id, weight in allocation.items():
            asset_id_str = str(asset_id)
            asset = asset_lookup.get(asset_id_str)
            if asset:
                if isinstance(asset, dict):
                    entry = dict(asset)
                    entry["weight"], entry["weight_pct"] = weight, weight
                else:
                    entry = {"id": asset_id_str, "weight": weight, "weight_pct": weight,
                             "ticker": getattr(asset, "ticker", None) or getattr(asset, "symbol", None),
                             "name": getattr(asset, "name", asset_id_str)}
            else:
                entry = {"id": asset_id_str, "weight": weight, "weight_pct": weight, "ticker": asset_id_str, "name": asset_id_str}
            result.append(entry)
        return result
    return []

@dataclass
class LeverageAnalysis:
    has_leveraged: bool = False
    has_inverse: bool = False
    instruments: List[str] = field(default_factory=list)
    total_weight_pct: float = 0.0
    effective_leverage: float = 1.0
    stress_multiplier: float = 1.0
    details: Dict[str, Any] = field(default_factory=dict)
    def to_dict(self) -> Dict: return {"has_leveraged": self.has_leveraged, "has_inverse": self.has_inverse, "instruments": self.instruments, "total_weight_pct": round(self.total_weight_pct, 2), "effective_leverage": round(self.effective_leverage, 2), "stress_multiplier": round(self.stress_multiplier, 2), "details": self.details}

@dataclass
class PreferredStockAnalysis:
    has_preferred: bool = False
    instruments: List[str] = field(default_factory=list)
    total_weight_pct: float = 0.0
    equity_sensitivity: float = 0.0
    rate_sensitivity: float = 0.0
    dual_shock_impact_pct: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    def to_dict(self) -> Dict: return {"has_preferred": self.has_preferred, "instruments": self.instruments, "total_weight_pct": round(self.total_weight_pct, 2), "dual_shock_impact_pct": round(self.dual_shock_impact_pct, 2)}

@dataclass
class TailRiskMetrics:
    var_95: float = 0.0
    var_99: float = 0.0
    cvar_95: float = 0.0
    cvar_99: float = 0.0
    max_drawdown_expected: float = 0.0
    skewness: float = 0.0
    kurtosis: float = 3.0
    fat_tails: bool = False
    var_95_method: str = "parametric"
    var_99_method: str = "parametric"
    n_obs: int = 0
    confidence_level: str = "low"
    data_start_date: Optional[str] = None
    data_end_date: Optional[str] = None
    leveraged_tickers: List[str] = field(default_factory=list)
    leveraged_warning: Optional[str] = None
    weight_alignment_report: Dict[str, Any] = field(default_factory=dict)
    def to_dict(self) -> Dict:
        d = {"var_95_pct": round(-self.var_95 * 100, 2), "var_99_pct": round(-self.var_99 * 100, 2), "cvar_95_pct": round(-self.cvar_95 * 100, 2), "cvar_99_pct": round(-self.cvar_99 * 100, 2), "max_drawdown_expected_pct": round(self.max_drawdown_expected * 100, 2), "skewness": round(self.skewness, 3), "kurtosis": round(self.kurtosis, 3), "fat_tails": self.fat_tails, "method": {"var_95": self.var_95_method, "var_99": self.var_99_method}, "n_obs": self.n_obs, "confidence_level": self.confidence_level}
        if self.weight_alignment_report: d["weight_alignment_report"] = self.weight_alignment_report
        if self.leveraged_tickers: d["leveraged_tickers"], d["leveraged_warning"] = self.leveraged_tickers, self.leveraged_warning
        return d

@dataclass
class LiquidityAnalysis:
    portfolio_score: float = 100.0
    illiquid_weight_pct: float = 0.0
    days_to_liquidate_95pct: float = 1.0
    concentration_risk: str = "low"
    details: Dict[str, Any] = field(default_factory=dict)
    def to_dict(self) -> Dict: return {"portfolio_score": round(self.portfolio_score, 1), "illiquid_weight_pct": round(self.illiquid_weight_pct, 2), "days_to_liquidate_95pct": round(self.days_to_liquidate_95pct, 1), "concentration_risk": self.concentration_risk}

@dataclass
class RiskAlert:
    level: str
    alert_type: str
    message: str
    recommendation: Optional[str] = None
    value: Optional[float] = None
    threshold: Optional[float] = None
    def to_dict(self) -> Dict:
        d = {"level": self.level, "type": self.alert_type, "message": self.message}
        if self.recommendation: d["recommendation"] = self.recommendation
        if self.value is not None: d["value"] = self.value
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
    history_metadata: Dict[str, Any] = field(default_factory=dict)
    def to_dict(self) -> Dict:
        n_obs = self.tail_risk.n_obs
        return {"version": self.version, "timestamp": self.timestamp.isoformat(), "profile": self.profile_name, "data_limits": {"data_points": n_obs, "var_95_method": self.tail_risk.var_95_method, "var_99_method": self.tail_risk.var_99_method, "confidence_level": self.tail_risk.confidence_level}, "stress_tests": self.stress_tests, "leverage_analysis": self.leverage_analysis.to_dict(), "preferred_analysis": self.preferred_analysis.to_dict(), "tail_risk": self.tail_risk.to_dict(), "liquidity": self.liquidity.to_dict(), "alerts": [a.to_dict() for a in self.alerts], "alert_summary": {"total": len(self.alerts), "critical": sum(1 for a in self.alerts if a.level == "critical"), "warning": sum(1 for a in self.alerts if a.level == "warning")}}

def detect_leveraged_instruments(allocation: List[Dict]) -> LeverageAnalysis:
    result = LeverageAnalysis()
    leveraged_items, total_w, weighted_lev = [], 0.0, 0.0
    for asset in allocation:
        ticker, name = _extract_ticker(asset), _extract_name(asset)
        weight = _normalize_weight(_safe_float(asset.get("weight", asset.get("weight_pct", 0))))
        is_lev, factor, classification = _is_leveraged_or_inverse(name, ticker)
        if is_lev:
            leveraged_items.append({"ticker": ticker or name[:20], "name": name, "weight_pct": weight * 100, "leverage_factor": factor, "classification": classification})
            total_w += weight
            weighted_lev += weight * abs(factor)
            if factor < 0: result.has_inverse = True
    if leveraged_items:
        result.has_leveraged, result.instruments = True, [i["ticker"] for i in leveraged_items]
        result.total_weight_pct, result.details["items"] = total_w * 100, leveraged_items
        result.effective_leverage = (1.0 - total_w) + weighted_lev
        result.stress_multiplier = min(3.0, result.effective_leverage)
    return result

def detect_preferred_stocks(allocation: List[Dict]) -> PreferredStockAnalysis:
    result = PreferredStockAnalysis()
    items, total_w = [], 0.0
    for asset in allocation:
        ticker, name = _extract_ticker(asset), _extract_name(asset).lower()
        weight = _normalize_weight(_safe_float(asset.get("weight", asset.get("weight_pct", 0))))
        is_pref = ticker in PREFERRED_TICKERS or any(kw in name for kw in PREFERRED_KEYWORDS)
        if is_pref:
            items.append({"ticker": ticker or name[:20], "weight_pct": weight * 100})
            total_w += weight
    if items:
        result.has_preferred, result.instruments, result.total_weight_pct = True, [i["ticker"] for i in items], total_w * 100
    return result

def compute_tail_risk_metrics(returns: Optional[np.ndarray] = None, weights: Optional[np.ndarray] = None, cov_matrix: Optional[np.ndarray] = None, history_metadata: Optional[Dict] = None) -> TailRiskMetrics:
    result = TailRiskMetrics()
    if history_metadata:
        result.n_obs = history_metadata.get("n_obs", 0)
        result.data_start_date, result.data_end_date = history_metadata.get("first_date"), history_metadata.get("last_date")
        result.leveraged_tickers = history_metadata.get("leveraged_tickers", [])
        result.confidence_level = history_metadata.get("confidence_level", "low")
    if cov_matrix is None and returns is not None and returns.ndim == 2:
        cov_matrix = _estimate_cov_from_returns(returns)
    param_var_99_ok = False
    if weights is not None and cov_matrix is not None:
        try:
            port_vol = np.sqrt(weights @ cov_matrix @ weights)
            z_95, z_99 = 1.645, 2.326
            result.var_95, result.var_99 = z_95 * port_vol, z_99 * port_vol
            result.cvar_95, result.cvar_99 = 2.063 * port_vol, 2.665 * port_vol
            result.max_drawdown_expected = -port_vol * np.sqrt(2 * np.log(252))
            param_var_99_ok = True
        except Exception as e: logger.warning(f"[tail_risk] Parametric error: {e}")
    if returns is not None and len(returns) > 30:
        port_returns = returns @ weights if weights is not None and returns.ndim == 2 else returns.flatten()
        n_obs = len(port_returns)
        result.n_obs, result.confidence_level = n_obs, _determine_confidence_level(n_obs)
        result.var_95_method, result.var_99_method = _determine_var_method(n_obs, "95"), _determine_var_method(n_obs, "99")
        if n_obs >= 252:
            var_95, cvar_95 = _historical_var_cvar(port_returns, 0.05)
            result.var_95, result.cvar_95 = var_95, cvar_95
        if n_obs >= 1000:
            var_99, cvar_99 = _historical_var_cvar(port_returns, 0.01)
            result.var_99, result.cvar_99 = var_99, cvar_99
        elif not param_var_99_ok or result.var_99 == 0.0:
            if n_obs >= 100:
                var_99, cvar_99 = _historical_var_cvar(port_returns, 0.01)
                result.var_99, result.cvar_99 = var_99, cvar_99
                result.var_99_method = "historical_low_confidence" if n_obs < 250 else "historical"
        if n_obs >= 252:
            if HAS_SCIPY:
                result.skewness, result.kurtosis = float(scipy_stats.skew(port_returns)), float(scipy_stats.kurtosis(port_returns, fisher=False))
            result.fat_tails = result.kurtosis > 4.0
            cumulative = np.cumprod(1 + port_returns)
            running_max = np.maximum.accumulate(cumulative)
            result.max_drawdown_expected = float(np.min((cumulative - running_max) / running_max))
    return result

def compute_liquidity_score(allocation: List[Dict], profile_name: str = "Modere") -> LiquidityAnalysis:
    result = LiquidityAnalysis()
    if not allocation: return result
    scores, weights_list, illiquid_w = [], [], 0.0
    for asset in allocation:
        source = asset.get("source_data", {})
        weight = _normalize_weight(_safe_float(asset.get("weight", asset.get("weight_pct", 0))))
        aum = _safe_float(source.get("aum_usd", source.get("aum")))
        score = 100 if aum > 1e9 else 80 if aum > 1e8 else 60 if aum > 1e7 else 30 if aum > 0 else 50
        if aum > 0 and aum < 1e7: illiquid_w += weight
        scores.append(score)
        weights_list.append(weight)
    if sum(weights_list) > 0: result.portfolio_score = np.average(scores, weights=weights_list)
    result.illiquid_weight_pct = min(illiquid_w * 100, 100)
    wa = np.array(weights_list)
    hhi = np.sum(wa ** 2) if len(wa) > 0 else 0
    result.concentration_risk = "high" if hhi > 0.15 else "medium" if hhi > 0.08 else "low"
    return result

def generate_alerts(leverage: LeverageAnalysis, preferred: PreferredStockAnalysis, tail_risk: TailRiskMetrics, liquidity: LiquidityAnalysis, profile_name: str) -> List[RiskAlert]:
    alerts = []
    thresholds = ALERT_THRESHOLDS.get(profile_name, ALERT_THRESHOLDS["Modere"])
    if leverage.has_leveraged:
        if leverage.effective_leverage > thresholds["max_leverage"]:
            alerts.append(RiskAlert("warning" if leverage.effective_leverage < thresholds["max_leverage"] * 1.5 else "critical", "leverage", f"Leverage effectif ({leverage.effective_leverage:.1f}x) > seuil", "Reduire positions leveraged", leverage.effective_leverage, thresholds["max_leverage"]))
        if leverage.has_inverse: alerts.append(RiskAlert("info", "leverage", "Portfolio contient des ETF inverse"))
    var_99_disp = -tail_risk.var_99 * 100
    if var_99_disp < thresholds["max_var_99"]: alerts.append(RiskAlert("warning", "tail_risk", f"VaR 99% ({var_99_disp:.1f}%) depasse seuil", None, var_99_disp, thresholds["max_var_99"]))
    if tail_risk.var_99_method == "historical_low_confidence": alerts.append(RiskAlert("warning", "tail_risk", f"VaR99 basse confiance (n={tail_risk.n_obs} < 250)", "VaR99 fiable requiert 4+ ans"))
    if tail_risk.weight_alignment_report:
        rep = tail_risk.weight_alignment_report
        if rep.get("missing_in_allocation") or rep.get("extra_in_allocation"):
            alerts.append(RiskAlert("warning", "data_quality", f"Alignment poids: {len(rep.get('missing_in_allocation',[]))} missing, {len(rep.get('extra_in_allocation',[]))} extra"))
    if liquidity.portfolio_score < thresholds["min_liquidity_score"]: alerts.append(RiskAlert("warning", "liquidity", f"Score liquidite ({liquidity.portfolio_score:.0f}) < seuil"))
    if liquidity.concentration_risk == "high": alerts.append(RiskAlert("warning", "liquidity", "Concentration elevee", "Diversifier"))
    alerts.sort(key=lambda a: {"critical": 0, "warning": 1, "info": 2}.get(a.level, 3))
    return alerts

class RiskAnalyzer:
    def __init__(self, allocation: List[Dict], cov_matrix: Optional[np.ndarray] = None, weights: Optional[np.ndarray] = None, expected_returns: Optional[np.ndarray] = None, returns_history: Optional[np.ndarray] = None, sectors: Optional[List[str]] = None, asset_classes: Optional[List[str]] = None, history_metadata: Optional[Dict] = None):
        self.allocation, self.cov_matrix, self.weights = allocation, cov_matrix, weights
        self.expected_returns = expected_returns if expected_returns is not None else np.zeros(len(allocation)) if allocation else np.array([])
        self.returns_history, self.sectors, self.asset_classes = returns_history, sectors, asset_classes
        self.history_metadata = history_metadata or {}
        self.weight_alignment_report = {}
        if returns_history is not None and self.history_metadata.get("tickers") and allocation:
            self.weights, self.weight_alignment_report = _align_weights_to_tickers(allocation, self.history_metadata["tickers"])
        if self.weights is None and allocation:
            self.weights = np.array([_normalize_weight(_safe_float(a.get("weight", a.get("weight_pct", 0)))) for a in allocation])

    def run_full_analysis(self, profile_name: str = "Modere", include_stress: bool = True, include_leverage: bool = True, include_preferred: bool = True, include_tail_risk: bool = True, include_liquidity: bool = True) -> RiskAnalysisResult:
        result = RiskAnalysisResult(profile_name=profile_name)
        result.history_metadata = self.history_metadata
        if include_leverage: result.leverage_analysis = detect_leveraged_instruments(self.allocation)
        if include_preferred: result.preferred_analysis = detect_preferred_stocks(self.allocation)
        if include_tail_risk:
            result.tail_risk = compute_tail_risk_metrics(self.returns_history, self.weights, self.cov_matrix, self.history_metadata)
            result.tail_risk.weight_alignment_report = self.weight_alignment_report
        if include_liquidity: result.liquidity = compute_liquidity_score(self.allocation, profile_name)
        result.alerts = generate_alerts(result.leverage_analysis, result.preferred_analysis, result.tail_risk, result.liquidity, profile_name)
        logger.info(f"[risk_analysis] {profile_name}: {len(result.alerts)} alerts, VaR99={result.tail_risk.var_99_method}, n_obs={result.tail_risk.n_obs}")
        return result

def enrich_portfolio_with_risk_analysis(portfolio_result: Dict, profile_name: str, include_stress: bool = True, include_tail_risk: bool = True, include_liquidity: bool = True, returns_history: Optional[np.ndarray] = None, history_metadata: Optional[Dict] = None) -> Dict:
    allocation_list = _build_allocation_list(portfolio_result.get("allocation", []), portfolio_result.get("assets", []))
    if not allocation_list:
        portfolio_result["risk_analysis"] = {"version": VERSION, "error": "Empty allocation", "profile": profile_name}
        return portfolio_result
    cov_matrix = portfolio_result.get("cov_matrix")
    weights = portfolio_result.get("weights")
    if weights is not None and not isinstance(weights, np.ndarray): weights = np.array(weights)
    if cov_matrix is not None and not isinstance(cov_matrix, np.ndarray): cov_matrix = np.array(cov_matrix)
    analyzer = RiskAnalyzer(allocation_list, cov_matrix, weights, returns_history=returns_history, history_metadata=history_metadata)
    result = analyzer.run_full_analysis(profile_name, include_stress, True, True, include_tail_risk, include_liquidity)
    portfolio_result["risk_analysis"] = result.to_dict()
    return portfolio_result

def fetch_and_enrich_risk_analysis(portfolio_result: Dict, profile_name: str, lookback_years: int = 5, use_cache: bool = True, include_stress: bool = True, include_tail_risk: bool = True, include_liquidity: bool = True) -> Dict:
    if not HAS_HISTORICAL_DATA:
        return enrich_portfolio_with_risk_analysis(portfolio_result, profile_name, include_stress, include_tail_risk, include_liquidity)
    assets, allocation_dict = portfolio_result.get("assets", []), portfolio_result.get("allocation", {})
    tickers = []
    for asset in assets:
        aid = str(getattr(asset, "id", None) or asset.get("id", "") if isinstance(asset, dict) else "")
        if aid not in allocation_dict: continue
        ticker = str(getattr(asset, "ticker", None) or getattr(asset, "symbol", None) or (asset.get("ticker") or asset.get("symbol") or "") if isinstance(asset, dict) else "").upper()
        if ticker and ticker not in tickers: tickers.append(ticker)
    if not tickers: return enrich_portfolio_with_risk_analysis(portfolio_result, profile_name, include_stress, include_tail_risk, include_liquidity)
    returns_matrix, history_metadata = fetch_portfolio_returns(tickers, lookback_years, use_cache)
    if returns_matrix is None: return enrich_portfolio_with_risk_analysis(portfolio_result, profile_name, include_stress, include_tail_risk, include_liquidity)
    return enrich_portfolio_with_risk_analysis(portfolio_result, profile_name, include_stress, include_tail_risk, include_liquidity, returns_matrix, history_metadata)

__all__ = ["RiskAnalyzer", "enrich_portfolio_with_risk_analysis", "fetch_and_enrich_risk_analysis", "detect_leveraged_instruments", "detect_preferred_stocks", "compute_tail_risk_metrics", "compute_liquidity_score", "_align_weights_to_tickers", "_historical_var_cvar", "_is_leveraged_or_inverse", "generate_alerts", "LeverageAnalysis", "PreferredStockAnalysis", "TailRiskMetrics", "LiquidityAnalysis", "RiskAlert", "RiskAnalysisResult", "VERSION", "LEVERAGE_TICKERS", "LEVERAGE_FALSE_POSITIVES", "TAIL_RISK_THRESHOLDS", "HAS_HISTORICAL_DATA", "HAS_STRESS_TESTING", "HAS_SCIPY"]
