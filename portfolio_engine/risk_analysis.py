# portfolio_engine/risk_analysis.py
"""
Risk Analysis Module v1.2.4

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
- v1.2.6: Expose allocation_breakdown in stress_tests output (2026-01-28)
  - NEW: allocation_breakdown.by_category shows weight per asset class
  - NEW: allocation_breakdown.top_positions shows positions with category
  - Purpose: Debug/validate category propagation in stress tests
- v1.2.5: Consume _tickers_meta for guaranteed category (2026-01-28)
  - NEW: _build_allocation_list() priority 0 = _tickers_meta
  - NEW: enrich_portfolio_with_risk_analysis() passes tickers_meta
  - FIX: Stress test now uses category from source (not heuristic guessing)
  - Root cause: _tickers only had {ticker: weight}, category was lost
- v1.2.4: Fix weights alignment bug in stress testing (2026-01-28)
- v1.2.4: Fix weights alignment bug in stress testing (2026-01-28)
  - FIX: Recalculate weights from aligned allocation_list
  - Root cause: weights in original order, asset_classes in history_tickers order
  - Impact: Stable market_crash was -314% instead of -24%
- v1.2.1: Fix stress tests cov_matrix + asset_names + annualization + asset_classes (2026-01-28)
  - FIX: Estimate cov_matrix BEFORE run_stress_scenarios() (was after)
  - FIX: Support _tickers_pricing from generate_portfolios_v4.py
  - NEW: Pass asset_names to stress_testing for ETF type detection
  - CRITICAL FIX: Annualize covariance (× 252) - returns are daily, shocks are annual
  - CRITICAL FIX: Use _asset_details for allocation_list (has category!)
  - CRITICAL FIX: Reconstruct from Actions/ETF/Obligations/Crypto if no _asset_details
  - Root cause: asset_classes was None → all assets got return_shock → cumulation
- v1.2.0: P0 Bug Fixes (Code Review 2026-01-27)
  - FIX: Alignment weights ↔ returns par ticker (évite VaR fausse)
  - FIX: VaR99 fallback historique si parametric impossible (plus de 0.0)
  - FIX: Convention signe VaR (perte positive en interne)
  - FIX: Fallback cov_matrix depuis returns_history si None
  - FIX: Leveraged detection "short" avec regex (évite faux positifs SUB, MINT)
  - NEW: _align_weights_to_tickers() avec report détaillé
  - NEW: _historical_var_cvar() avec convention perte positive
  - NEW: _estimate_cov_from_returns() fallback
  - NEW: LEVERAGE_FALSE_POSITIVES pour "short-term", etc.
  - NEW: TailRiskMetrics.weight_alignment_report
- v1.1.2: Fix allocation format mismatch
  - FIX: enrich_portfolio_with_risk_analysis() now handles allocation as dict {id: weight}
  - FIX: Build allocation_list from assets + allocation dict for RiskAnalyzer
  - FIX: fetch_and_enrich_risk_analysis() passes assets to enrich function
  - Root cause: generate_portfolios_v4.py passes allocation={id: weight_pct} not list
- v1.1.1: Fix extraction tickers
  - FIX: Extract tickers from assets list (not allocation dict which is {id: weight})
  - FIX: Version number updated to match code functionality
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

VERSION = "1.2.7"

# v1.1.0: Tail risk thresholds (aligned with historical_data.py)
TAIL_RISK_THRESHOLDS = {
    "var_95_min_obs": 252,      # 1 year daily → historical VaR95
    "var_99_min_obs": 1000,     # 4 years daily → historical VaR99
    "var_99_fallback_min_obs": 100,  # v1.2.0: Minimum for historical fallback
    "moments_min_obs": 252,     # 1 year for skew/kurtosis
    "confidence_high": 1000,    # >= 1000 obs
    "confidence_medium": 252,   # >= 252 obs
}

# v1.2.0: False positives pour leveraged detection
LEVERAGE_FALSE_POSITIVES = [
    "short-term", "short term", "short duration",
    "ultra short", "ultrashort bond", "short maturity",
    "short treasury", "short government", "short municipal",
    "short muni", "short corporate",
]

# v1.2.0: Regex pour "short" isolé (pas "short-term")
SHORT_WORD_RE = re.compile(
    r"\bshort\b(?!\s*-?\s*term|\s*duration|\s*maturity|\s*treasury|\s*government|\s*muni)",
    re.IGNORECASE
)

# v1.2.0: Regex pour facteur leverage (2x, 3x, -2x, -3x)
LEVERAGE_FACTOR_RE = re.compile(r"(?<!\d)(-?[23]x)\b", re.IGNORECASE)

# v1.2.0: Removed "short" and "ultrashort" to avoid false positives
LEVERAGE_KEYWORDS = {
    "2x", "3x", "-1x", "-2x", "-3x",
    "ultra", "ultrapro",
    "leveraged", "inverse",
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
    v1.2.0: Convention PERTE POSITIVE pour var_95, var_99, cvar_95, cvar_99.
    Exemple: var_95 = 0.03 signifie une perte de 3%.
    L'affichage dans to_dict() montre -3% pour compatibilité dashboards.
    
    v1.1.0: Enriched with method/n_obs/confidence_level for hybrid VaR.
    """
    var_95: float = 0.0  # Perte positive (0.03 = 3% loss)
    var_99: float = 0.0  # Perte positive
    cvar_95: float = 0.0  # Perte positive
    cvar_99: float = 0.0  # Perte positive
    max_drawdown_expected: float = 0.0
    skewness: float = 0.0
    kurtosis: float = 3.0
    fat_tails: bool = False
    # v1.1.0: Method tracking
    var_95_method: str = "parametric"  # "historical" or "parametric"
    var_99_method: str = "parametric"  # "historical", "parametric", or "historical_low_confidence"
    n_obs: int = 0
    confidence_level: str = "low"  # "high", "medium", "low"
    data_start_date: Optional[str] = None
    data_end_date: Optional[str] = None
    leveraged_tickers: List[str] = field(default_factory=list)
    leveraged_warning: Optional[str] = None
    # v1.2.0: Weight alignment report
    weight_alignment_report: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        # v1.2.0: Affichage en perte négative pour compatibilité dashboards
        d = {
            "var_95_pct": round(-self.var_95 * 100, 2),  # -3.0 pour 3% loss
            "var_99_pct": round(-self.var_99 * 100, 2),
            "cvar_95_pct": round(-self.cvar_95 * 100, 2),
            "cvar_99_pct": round(-self.cvar_99 * 100, 2),
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
        # v1.2.0: Include alignment report if issues detected
        if self.weight_alignment_report:
            has_issues = (
                self.weight_alignment_report.get("missing_in_allocation") or
                self.weight_alignment_report.get("extra_in_allocation") or
                self.weight_alignment_report.get("duplicates_in_allocation") or
                self.weight_alignment_report.get("error")
            )
            if has_issues:
                d["weight_alignment_report"] = self.weight_alignment_report
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


def _extract_ticker(asset: Any) -> Optional[str]:
    """
    v1.1.2: Extract ticker from asset (handles dict, object, or string).
    """
    # If asset is already a string (e.g., from dict keys), return it
    if isinstance(asset, str):
        return asset.upper() if asset else None
    
    # If asset is a dict
    if isinstance(asset, dict):
        for key in ["ticker", "symbol", "etfsymbol", "id"]:
            val = asset.get(key)
            if val and isinstance(val, str):
                return val.upper()
        return None
    
    # If asset is an object with attributes
    for attr in ["ticker", "symbol", "id"]:
        val = getattr(asset, attr, None)
        if val and isinstance(val, str):
            return val.upper()
    
    # Try source_data
    source_data = getattr(asset, "source_data", None)
    if source_data and isinstance(source_data, dict):
        for key in ["ticker", "symbol"]:
            val = source_data.get(key)
            if val and isinstance(val, str):
                return val.upper()
    
    return None


def _extract_name(asset: Any) -> str:
    """v1.1.2: Extract name from asset (handles dict, object, or string)."""
    if isinstance(asset, str):
        return asset
    if isinstance(asset, dict):
        return str(asset.get("name", asset.get("id", "Unknown")))
    name = getattr(asset, "name", None)
    if name:
        return str(name)
    return str(getattr(asset, "id", "Unknown"))


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


def _build_allocation_list(
    allocation: Any,
    assets: Optional[List[Any]] = None,
    asset_details: Optional[List[Dict]] = None,
    portfolio_categories: Optional[Dict[str, Dict]] = None,
    tickers_meta: Optional[Dict[str, Dict]] = None,  # v5.2.0: NEW
) -> List[Dict[str, Any]]:
    """
    v5.2.0: Build a list of allocation dicts from various input formats.
    
    Priority order:
    0. tickers_meta (_tickers_meta from portfolios.json) - BEST (guaranteed category)
    1. asset_details (_asset_details from portfolios.json)
    2. allocation as list of dicts (original format)
    3. allocation as dict {asset_id: weight_pct} + assets list
    4. portfolio_categories (Actions/ETF/Obligations/Crypto dicts)
    
    Returns:
        List of dicts with at least {"id", "weight", "ticker", "name", "category", ...}
    """
      # v5.2.0: PRIORITY 0 - Use _tickers_meta (source of truth, guaranteed category)
    if tickers_meta and isinstance(tickers_meta, dict) and len(tickers_meta) > 0:
        result = []
        for ticker, meta in tickers_meta.items():
            if not isinstance(meta, dict):
                continue
            w = meta.get("weight", 0.0)
            entry = {
                "ticker": ticker,
                "name": meta.get("name", ticker),
                "category": meta.get("category", "unknown"),  # ← GUARANTEED
                "weight": w,
                "weight_pct": w * 100,
                "asset_ids": meta.get("asset_ids", []),
            }
            result.append(entry)
        if result:
            logger.info(f"[risk_analysis] Built allocation_list from _tickers_meta: {len(result)} items")
            # Log category distribution
            cats = {}
            for r in result:
                c = r.get("category", "unknown")
                cats[c] = cats.get(c, 0) + 1
            logger.info(f"[risk_analysis] Categories from _tickers_meta: {cats}")
            return result
    # v1.2.1: PRIORITY 1 - Use _asset_details if available (has category!)
    if asset_details and isinstance(asset_details, list) and len(asset_details) > 0:
        result = []
        for ad in asset_details:
            if not isinstance(ad, dict):
                continue
            entry = {
                "name": ad.get("name", ""),
                "ticker": ad.get("ticker", ""),
                "category": ad.get("category", "unknown"),  # ← CRITICAL for stress tests
                "weight": ad.get("weight_pct", ad.get("weight", 0)) / 100 if ad.get("weight_pct", 0) > 1 else ad.get("weight_pct", ad.get("weight", 0)),
                "weight_pct": ad.get("weight_pct", ad.get("weight", 0)),
                "sector": ad.get("sector"),
                "role": ad.get("role"),
            }
            result.append(entry)
        if result:
            logger.info(f"[risk_analysis] Built allocation_list from _asset_details: {len(result)} items")
            return result
    
    # v1.2.1: PRIORITY 2 - Reconstruct from portfolio categories (Actions, ETF, etc.)
    if portfolio_categories:
        result = []
        for category, items in portfolio_categories.items():
            if category.startswith("_") or not isinstance(items, dict):
                continue
            if category not in ["Actions", "ETF", "Obligations", "Crypto"]:
                continue
            for name, weight_val in items.items():
                # Parse weight (can be "13.6%" or 0.136)
                if isinstance(weight_val, str):
                    w = float(weight_val.replace("%", "").replace(",", ".")) / 100
                else:
                    w = float(weight_val)
                
                # Extract ticker from name if format is "NAME (TICKER)"
                ticker = None
                if "(" in name and ")" in name:
                    ticker = name.split("(")[-1].replace(")", "").strip()
                
                entry = {
                    "name": name,
                    "ticker": ticker,
                    "category": category,
                    "weight": w,
                    "weight_pct": w * 100,
                }
                result.append(entry)
        if result:
            logger.info(f"[risk_analysis] Built allocation_list from categories: {len(result)} items")
            return result
    
    # Case 3: allocation is already a list
    if isinstance(allocation, list):
        return allocation
    
    # Case 4: allocation is a dict {asset_id: weight_pct}
    if isinstance(allocation, dict):
        result = []
        
        # Build asset lookup from assets list
        asset_lookup = {}
        if assets:
            for asset in assets:
                # Get asset ID
                if hasattr(asset, "id"):
                    aid = str(asset.id)
                elif isinstance(asset, dict):
                    aid = str(asset.get("id", ""))
                else:
                    continue
                asset_lookup[aid] = asset
        
        # Build allocation list
        for asset_id, weight in allocation.items():
            asset_id_str = str(asset_id)
            
            # Try to find asset in lookup
            asset = asset_lookup.get(asset_id_str)
            
            if asset:
                # Build dict from asset object/dict
                if isinstance(asset, dict):
                    entry = dict(asset)  # Copy
                    entry["weight"] = weight
                    entry["weight_pct"] = weight
                else:
                    # Asset is an object
                    entry = {
                        "id": asset_id_str,
                        "weight": weight,
                        "weight_pct": weight,
                        "ticker": getattr(asset, "ticker", None) or getattr(asset, "symbol", None),
                        "name": getattr(asset, "name", asset_id_str),
                        "category": getattr(asset, "category", "unknown"),
                        "sector": getattr(asset, "sector", None),
                    }
                    # Include source_data if available
                    if hasattr(asset, "source_data") and asset.source_data:
                        entry["source_data"] = asset.source_data
            else:
                # No asset found, create minimal entry
                entry = {
                    "id": asset_id_str,
                    "weight": weight,
                    "weight_pct": weight,
                    "ticker": asset_id_str if not asset_id_str.startswith(("EQ_", "ETF_", "BOND_", "CR_")) else None,
                    "name": asset_id_str,
                }
            
            result.append(entry)
        
        logger.debug(f"[risk_analysis] Built allocation_list: {len(result)} items from dict")
        return result
    
    # Case 5: Unknown format
    logger.warning(f"[risk_analysis] Unknown allocation format: {type(allocation)}")
    return []


# =============================================================================
# v1.2.0: NEW FUNCTIONS FOR P0 FIXES
# =============================================================================

def _align_weights_to_tickers(
    allocation: List[Dict[str, Any]],
    history_tickers: List[str],
    allow_shorts: bool = False,
    strict: bool = False,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    v1.2.0: Aligne les poids de l'allocation sur l'ordre des tickers de l'historique.
    
    CRITIQUE: Cette fonction résout le bug d'alignement où returns @ weights
    calculait une VaR sur le mauvais portefeuille car l'ordre des colonnes
    ne correspondait pas à l'ordre des poids.
    
    Args:
        allocation: Liste de dicts avec au moins {ticker, weight}
        history_tickers: Liste des tickers dans l'ordre de la matrice de returns
        allow_shorts: Autoriser les poids négatifs
        strict: Lever une exception si incohérence majeure
    
    Returns:
        (weights_aligned, report) où:
        - weights_aligned: np.array dans l'ordre de history_tickers
        - report: dict avec missing_in_allocation, extra_in_allocation, duplicates
    """
    # Build weight dict from allocation
    w_by_ticker = {}
    duplicates = []
    
    for a in allocation:
        ticker = _extract_ticker(a)
        if not ticker:
            continue
        
        raw = a.get("weight", a.get("weight_pct", a.get("percentage", 0)))
        w = _safe_float(raw)
        w = _normalize_weight(w)
        
        if ticker in w_by_ticker:
            duplicates.append(ticker)
            w_by_ticker[ticker] += w  # Sum duplicates
        else:
            w_by_ticker[ticker] = w
    
    # Normalize history tickers
    hist = [t.upper().strip() for t in history_tickers]
    
    # Find mismatches
    hist_set = set(hist)
    alloc_set = set(w_by_ticker.keys())
    missing_in_alloc = [t for t in hist if t not in alloc_set]
    extra_in_alloc = [t for t in alloc_set if t not in hist_set]
    
    # Build aligned weights array
    weights = np.array([w_by_ticker.get(t, 0.0) for t in hist], dtype=float)
    
    # Handle shorts
    if not allow_shorts and np.any(weights < -1e-12):
        if strict:
            raise ValueError(f"Poids négatifs détectés mais allow_shorts=False")
        logger.warning("[align_weights] Negative weights detected, setting to 0")
        weights = np.maximum(weights, 0.0)
    
    # Check sum
    s = float(np.sum(weights))
    if abs(s) < 1e-12:
        if strict:
            raise ValueError("Somme des poids ~0")
        logger.warning("[align_weights] Sum of weights ~0, returning zeros")
        return np.zeros_like(weights), {
            "missing_in_allocation": missing_in_alloc,
            "extra_in_allocation": extra_in_alloc,
            "duplicates_in_allocation": sorted(set(duplicates)),
            "error": "sum_weights_zero",
        }
    
    # Normalize
    if allow_shorts:
        gross = float(np.sum(np.abs(weights)))
        if gross > 1e-12:
            weights = weights / gross
    else:
        weights = weights / s
    
    report = {
        "missing_in_allocation": missing_in_alloc,
        "extra_in_allocation": extra_in_alloc,
        "duplicates_in_allocation": sorted(set(duplicates)),
    }
    
    if missing_in_alloc or extra_in_alloc or duplicates:
        logger.info(f"[align_weights] Report: {report}")
    
    return weights, report
  
def _align_allocation_to_tickers(
    allocation_list: List[Dict[str, Any]],
    history_tickers: List[str],
) -> List[Dict[str, Any]]:
    """
    v1.2.3 FIX: Reorder allocation_list to match history_tickers order.
    
    CRITICAL: This ensures asset_classes extracted from allocation_list
    are in the same order as weights aligned to history_tickers.
    
    v1.2.3: Added detailed logging to debug alignment issues.
    """
    if not allocation_list or not history_tickers:
        return allocation_list
    
    # Build lookup by ticker (case-insensitive)
    alloc_by_ticker = {}
    for a in allocation_list:
        ticker = _extract_ticker(a)
        if ticker:
            alloc_by_ticker[ticker.upper()] = a
    
    logger.info(f"[align_alloc v1.2.3] {len(alloc_by_ticker)} tickers in allocation, {len(history_tickers)} in history")
    
    # Reorder to match history_tickers
    result = []
    matched = 0
    unmatched = []
    
    for t in history_tickers:
        t_upper = t.upper().strip()
        if t_upper in alloc_by_ticker:
            result.append(alloc_by_ticker[t_upper])
            matched += 1
        else:
            logger.warning(f"[align_alloc v1.2.3] Ticker {t_upper} not found in allocation")
            unmatched.append(t_upper)
            result.append({
                "ticker": t_upper,
                "name": t_upper,
                "category": "unknown",
                "weight": 0.0,
            })
    
    # Log category distribution after alignment
    cats = {}
    for a in result:
        cat = a.get("category", "unknown")
        cats[cat] = cats.get(cat, 0) + 1
    logger.info(f"[align_alloc v1.2.3] Aligned {matched}/{len(history_tickers)}, categories: {cats}")
    
    if unmatched:
        logger.warning(f"[align_alloc v1.2.3] Unmatched: {unmatched[:5]}")
    
    return result


def _historical_var_cvar(
    port_returns: np.ndarray,
    alpha: float = 0.01,
) -> Tuple[float, float]:
    """
    v1.2.0: Calcule VaR et CVaR historiques avec convention perte positive.
    
    Convention: VaR et CVaR sont retournés en PERTE POSITIVE.
    Exemple: Si le quantile 1% est -0.05 (perte de 5%), retourne VaR=0.05.
    
    Args:
        port_returns: Array des rendements du portefeuille
        alpha: Niveau de confiance (0.01 pour 99%, 0.05 pour 95%)
    
    Returns:
        (VaR, CVaR) en perte positive
    """
    if port_returns is None or len(port_returns) == 0:
        return 0.0, 0.0
    
    # Quantile (sera négatif pour des pertes)
    q = float(np.quantile(port_returns, alpha))
    
    # VaR = perte positive (on inverse le signe du quantile négatif)
    var = -q
    
    # CVaR = moyenne des pertes au-delà de la VaR
    tail = port_returns[port_returns <= q]
    cvar = -float(np.mean(tail)) if tail.size > 0 else var
    
    return var, cvar


def _estimate_cov_from_returns(
    returns_history: np.ndarray,
    min_obs: int = 60,
    annualize: bool = True,
    trading_days_per_year: int = 252,
) -> Optional[np.ndarray]:
    """
    v1.2.1: Estime la matrice de covariance depuis l'historique des returns.
    
    Fallback utilisé quand cov_matrix n'est pas fournie.
    
    Args:
        returns_history: Matrice (T x N) des rendements journaliers
        min_obs: Minimum d'observations requis
        annualize: Si True, annualise la covariance (× 252)
        trading_days_per_year: Nombre de jours de trading par an
    
    Returns:
        Matrice de covariance (N x N) annualisée ou None si impossible
    
    Note:
        v1.2.1: CRITICAL FIX - Returns are daily from historical_data.py
        Stress shocks (-40%) are total crisis drawdowns (annual scale).
        Must annualize cov to match shock horizon.
    """
    if returns_history is None:
        return None
    
    if returns_history.ndim != 2:
        return None
    
    n_obs, n_assets = returns_history.shape
    
    if n_obs < min_obs:
        logger.warning(f"[estimate_cov] Insufficient obs ({n_obs} < {min_obs})")
        return None
    
    if n_obs < n_assets * 2:
        logger.warning(f"[estimate_cov] n_obs ({n_obs}) < 2*n_assets ({n_assets*2}), cov may be unstable")
    
    try:
        cov = np.cov(returns_history, rowvar=False)
        
        # Sanity check
        if np.any(np.isnan(cov)) or np.any(np.isinf(cov)):
            logger.warning("[estimate_cov] NaN/Inf in covariance matrix")
            return None
        if np.any(np.diag(cov) <= 0):
            logger.warning("[estimate_cov] Non-positive variance on diagonal")
            return None
        
        # v1.2.1: Annualize covariance (daily → annual)
        # Var(annual) = Var(daily) × 252 (assuming i.i.d. returns)
        if annualize:
            cov = cov * trading_days_per_year
            daily_vols = np.sqrt(np.diag(cov) / trading_days_per_year)
            annual_vols = np.sqrt(np.diag(cov))
            logger.info(f"[estimate_cov] Annualized: daily vol ~{daily_vols.mean()*100:.2f}% → annual vol ~{annual_vols.mean()*100:.1f}%")
        
        return cov
    except Exception as e:
        logger.warning(f"[estimate_cov] Error: {e}")
        return None


def _is_leveraged_or_inverse(
    name: str,
    ticker: Optional[str],
) -> Tuple[bool, float, str]:
    """
    v1.2.0: Détection améliorée des ETF leveraged/inverse.
    
    Évite les faux positifs comme "Short-Term Bond" (SUB).
    
    Args:
        name: Nom de l'ETF
        ticker: Ticker de l'ETF
    
    Returns:
        (is_leveraged, factor, classification) où:
        - is_leveraged: True si leveraged ou inverse
        - factor: Facteur de leverage (3.0, -2.0, etc.)
        - classification: "leveraged", "inverse", ou "standard"
    """
    s = (name or "").lower()
    ticker_up = (ticker or "").upper()
    
    # 1. Check known tickers first
    if ticker_up in LEVERAGE_TICKERS:
        factor = LEVERAGE_FACTORS.get(ticker_up, 2.0)
        classification = "inverse" if factor < 0 else "leveraged"
        return True, factor, classification
    
    # 2. Check false positives (short-term, etc.)
    for fp in LEVERAGE_FALSE_POSITIVES:
        if fp in s:
            return False, 1.0, "standard"
    
    # 3. Check explicit factor (2x, 3x, -2x, -3x)
    m = LEVERAGE_FACTOR_RE.search(s)
    if m:
        token = m.group(0).lower()
        if token.startswith("-"):
            return True, float(token.replace("x", "")), "inverse"
        return True, float(token.replace("x", "")), "leveraged"
    
    # 4. Check keywords
    if "inverse" in s:
        return True, -1.0, "inverse"
    if "leveraged" in s:
        return True, 2.0, "leveraged"
    if "ultra" in s and "ultrashort" not in s:  # ultra but not ultrashort bond
        return True, 2.0, "leveraged"
    
    # 5. Check "short" with regex (not "short-term")
    if SHORT_WORD_RE.search(s):
        return True, -1.0, "inverse"
    
    # 6. Check bull/bear
    if "bear" in s:
        return True, -1.0, "inverse"
    if "bull" in s:
        return True, 2.0, "leveraged"
    
    return False, 1.0, "standard"


# =============================================================================
# DETECTION FUNCTIONS
# =============================================================================

def detect_leveraged_instruments(allocation: List[Dict[str, Any]]) -> LeverageAnalysis:
    """
    v1.2.0: Uses improved _is_leveraged_or_inverse() to avoid false positives.
    """
    result = LeverageAnalysis()
    leveraged_items = []
    total_leveraged_weight = 0.0
    weighted_leverage = 0.0
    
    for asset in allocation:
        ticker = _extract_ticker(asset)
        name = _extract_name(asset)
        weight = _safe_float(asset.get("weight", asset.get("weight_pct", 0)))
        weight = _normalize_weight(weight)
        
        # v1.2.0: Use improved detection
        is_leveraged, leverage_factor, classification = _is_leveraged_or_inverse(name, ticker)
        
        if is_leveraged:
            leveraged_items.append({
                "ticker": ticker or name[:20],
                "name": name,
                "weight_pct": weight * 100,
                "leverage_factor": leverage_factor,
                "classification": classification,
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
    v1.2.0: Enhanced with:
    - Weight alignment via history_metadata["tickers"]
    - VaR99 fallback to historical if parametric fails
    - Consistent sign convention (positive loss)
    - Covariance estimation fallback
    
    v1.1.0: Hybrid VaR calculation.
    
    - VaR95: historical if n_obs >= 252, else parametric
    - VaR99: historical if n_obs >= 1000, else parametric (with fallback)
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
    
    # v1.2.0: Align weights if history_metadata provides tickers
    aligned_weights = weights
    if (
        weights is not None 
        and history_metadata 
        and "tickers" in history_metadata
        and "allocation" in history_metadata
    ):
        try:
            aligned_weights, alignment_report = _align_weights_to_tickers(
                allocation=history_metadata["allocation"],
                history_tickers=history_metadata["tickers"],
                allow_shorts=False,
            )
            result.weight_alignment_report = alignment_report
            if alignment_report.get("missing_in_allocation") or alignment_report.get("extra_in_allocation"):
                logger.warning(f"[tail_risk] Weight alignment issues: {alignment_report}")
        except Exception as e:
            logger.warning(f"[tail_risk] Weight alignment failed: {e}")
            aligned_weights = weights
    
    # v1.2.0: Fallback cov_matrix estimation if None
    if cov_matrix is None and returns is not None and returns.ndim == 2:
        cov_matrix = _estimate_cov_from_returns(returns)
        if cov_matrix is not None:
            logger.info("[tail_risk] Estimated cov_matrix from returns_history")
    
    # === PARAMETRIC VaR (always computed as baseline/fallback) ===
    if aligned_weights is not None and cov_matrix is not None:
        try:
            port_vol = np.sqrt(aligned_weights @ cov_matrix @ aligned_weights)
            port_mean = 0.0
            z_95, z_99 = 1.645, 2.326
            
            # Parametric VaR (convention: perte positive)
            # VaR = z * vol (pour perte positive, on ne soustrait pas)
            param_var_95 = z_95 * port_vol  # Perte positive
            param_var_99 = z_99 * port_vol  # Perte positive
            param_cvar_95 = port_vol * 2.063  # Perte positive
            param_cvar_99 = port_vol * 2.665  # Perte positive
            
            # Set as default (may be overwritten by historical)
            result.var_95 = param_var_95
            result.var_99 = param_var_99
            result.cvar_95 = param_cvar_95
            result.cvar_99 = param_cvar_99
            
            T = 252
            result.max_drawdown_expected = port_vol * np.sqrt(2 * np.log(T))  # Perte positive
        except Exception as e:
            logger.warning(f"[tail_risk] Parametric calculation error: {e}")
    
    # === HISTORICAL VaR (if returns provided and sufficient) ===
    if returns is not None and len(returns) > 30:
        # Compute portfolio returns
        if aligned_weights is not None and returns.ndim == 2:
            port_returns = returns @ aligned_weights
        else:
            port_returns = returns.flatten() if returns.ndim > 1 else returns
        
        n_obs = len(port_returns)
        result.n_obs = n_obs
        result.confidence_level = _determine_confidence_level(n_obs)
        result.var_95_method = _determine_var_method(n_obs, "95")
        result.var_99_method = _determine_var_method(n_obs, "99")
        
        # === VaR 95%: historical if n_obs >= 252 ===
        if n_obs >= TAIL_RISK_THRESHOLDS["var_95_min_obs"]:
            var_95, cvar_95 = _historical_var_cvar(port_returns, alpha=0.05)
            result.var_95 = var_95
            result.cvar_95 = cvar_95
            logger.debug(f"[tail_risk] VaR95 historical: {result.var_95*100:.2f}%")
        
        # === VaR 99%: historical if n_obs >= 1000 ===
        if n_obs >= TAIL_RISK_THRESHOLDS["var_99_min_obs"]:
            var_99, cvar_99 = _historical_var_cvar(port_returns, alpha=0.01)
            result.var_99 = var_99
            result.cvar_99 = cvar_99
            result.var_99_method = "historical"
            logger.debug(f"[tail_risk] VaR99 historical: {result.var_99*100:.2f}%")
        else:
            # v1.2.0: Fallback - if parametric VaR99 is 0 or NaN, use historical anyway
            if (
                result.var_99 == 0.0 
                or result.var_99 is None 
                or (isinstance(result.var_99, float) and math.isnan(result.var_99))
            ):
                if n_obs >= TAIL_RISK_THRESHOLDS["var_99_fallback_min_obs"]:
                    var_99, cvar_99 = _historical_var_cvar(port_returns, alpha=0.01)
                    result.var_99 = var_99
                    result.cvar_99 = cvar_99
                    if n_obs >= TAIL_RISK_THRESHOLDS["var_95_min_obs"]:
                        result.var_99_method = "historical"
                    else:
                        result.var_99_method = "historical_low_confidence"
                    logger.info(f"[tail_risk] VaR99 fallback historical (n_obs={n_obs}): {result.var_99*100:.2f}%")
                else:
                    logger.warning(f"[tail_risk] VaR99 = 0 and n_obs={n_obs} < 100, cannot compute reliable VaR99")
            else:
                # Keep parametric VaR99
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
            result.max_drawdown_expected = -float(np.min(drawdowns))  # Perte positive
    
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
    # v1.2.0: VaR is now positive loss, threshold is negative, so compare -var_99*100 < threshold
    if -tail_risk.var_99 * 100 < thresholds["max_var_99"]:
        alerts.append(RiskAlert(
            level="warning", 
            alert_type="tail_risk", 
            message=f"VaR 99% ({-tail_risk.var_99*100:.1f}%) depasse seuil", 
            value=-tail_risk.var_99 * 100, 
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
    
    # v1.2.0: Alert if VaR99 is low confidence
    if tail_risk.var_99_method == "historical_low_confidence":
        alerts.append(RiskAlert(
            level="warning", 
            alert_type="tail_risk", 
            message=f"VaR99 historique low confidence (n_obs={tail_risk.n_obs} < 250)", 
            recommendation="Interpreter avec prudence - VaR99 peu fiable"
        ))
    elif tail_risk.var_99_method == "parametric" and tail_risk.n_obs > 0:
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
    
    # v1.2.0: Alert if weight alignment issues
    if tail_risk.weight_alignment_report:
        missing = tail_risk.weight_alignment_report.get("missing_in_allocation", [])
        extra = tail_risk.weight_alignment_report.get("extra_in_allocation", [])
        if missing:
            alerts.append(RiskAlert(
                level="warning", 
                alert_type="data_quality", 
                message=f"Tickers manquants dans allocation: {', '.join(missing[:3])}", 
                recommendation="Verifier l'allocation - ces tickers ont poids=0 dans le calcul VaR"
            ))
        if extra:
            alerts.append(RiskAlert(
                level="info", 
                alert_type="data_quality", 
                message=f"Tickers en trop dans allocation: {', '.join(extra[:3])}", 
                recommendation="Ces tickers ne sont pas dans l'historique et sont exclus du calcul VaR"
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
    v1.2.0: Enhanced with P0 fixes (alignment, VaR99 fallback, sign convention).
    v1.1.2: Enhanced with historical_data.py integration and dict allocation support.
    
    Usage:
        analyzer = RiskAnalyzer(
            allocation=allocation_list,  # List of dicts with weight, ticker, etc.
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
        asset_names: Optional[List[str]] = None,  # v1.2.1: For ETF type detection
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
        self.asset_names = asset_names  # v1.2.1
        self.history_metadata = history_metadata or {}  # v1.1.0
        
        # v1.2.0: Store allocation in history_metadata for alignment
        if allocation and "allocation" not in self.history_metadata:
            self.history_metadata["allocation"] = allocation
        
        # v1.2.1: Extract asset_names from allocation if not provided
        if self.asset_names is None and allocation:
            self.asset_names = [_extract_name(a) for a in allocation]
        
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
            asset_classes=self.asset_classes,
            asset_names=self.asset_names,  # v1.2.1: For ETF type detection
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
        
        # v1.2.1: Estimate cov_matrix BEFORE stress tests if not provided
        if self.cov_matrix is None and self.returns_history is not None:
            estimated_cov = _estimate_cov_from_returns(self.returns_history)
            if estimated_cov is not None:
                self.cov_matrix = estimated_cov
                logger.info("[run_full_analysis] Estimated cov_matrix from returns_history")
        
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
    
    v1.2.4: FIX - Recalculate weights from ALIGNED allocation_list.
    v1.2.3: FIX - Extract asset_classes ONLY AFTER alignment to history_tickers.
    v1.2.0: Passes allocation to history_metadata for weight alignment.
    v1.1.2: Handles allocation as dict {id: weight_pct} or list of dicts.
    v1.1.0: Accepts returns_history and history_metadata from fetch_portfolio_returns().
    
    Args:
        portfolio_result: Résultat de optimizer.build_portfolio()
            Expected keys: "allocation" (dict or list), "assets" (list), 
                          "cov_matrix", "weights"
        profile_name: Profil ("Stable", "Modere", "Agressif")
        include_*: Flags pour analyses
        returns_history: (T x N) matrix from fetch_portfolio_returns()
        history_metadata: Metadata dict from fetch_portfolio_returns()
    
    Returns:
        portfolio_result enrichi avec clé "risk_analysis"
    """
    # v1.1.2: Get allocation and assets
    allocation_raw = portfolio_result.get("allocation", [])
    assets = portfolio_result.get("assets", [])
    
   # v1.2.1: Get _asset_details (has category!) and portfolio categories
    asset_details = portfolio_result.get("_asset_details", [])
    portfolio_categories = {
        k: v for k, v in portfolio_result.items() 
        if k in ["Actions", "ETF", "Obligations", "Crypto"] and isinstance(v, dict)
    }
    
    # v5.2.0: Get _tickers_meta (guaranteed category from generate_portfolios_v4.py)
    tickers_meta = portfolio_result.get("_tickers_meta", {})
    
    # v5.2.0: Build allocation list with category support (priority: _tickers_meta)
    allocation_list = _build_allocation_list(
        allocation_raw, 
        assets,
        asset_details=asset_details,
        portfolio_categories=portfolio_categories,
        tickers_meta=tickers_meta,  # v5.2.0: NEW
    )
    
    if not allocation_list:
        logger.warning("[risk_analysis] Empty allocation, returning minimal risk_analysis")
        portfolio_result["risk_analysis"] = {
            "version": VERSION,
            "error": "Empty allocation",
            "profile": profile_name,
        }
        return portfolio_result
    
    logger.info(f"[risk_analysis] Processing {len(allocation_list)} positions for {profile_name}")
    
    cov_matrix = portfolio_result.get("cov_matrix")
    weights = portfolio_result.get("weights")
    
    if weights is not None and not isinstance(weights, np.ndarray):
        weights = np.array(weights)
    if cov_matrix is not None and not isinstance(cov_matrix, np.ndarray):
        cov_matrix = np.array(cov_matrix)
    
    # v1.2.3 FIX: Do NOT extract asset_classes before alignment!
    # The bug was that asset_classes came from _asset_details order,
    # while weights came from history_tickers order.
    
    if history_metadata is None:
        history_metadata = {}
    if "allocation" not in history_metadata:
        history_metadata["allocation"] = allocation_list
    
    # v1.2.3: CRITICAL - Align FIRST, then extract asset_classes
    if history_metadata and "tickers" in history_metadata:
        logger.info(f"[risk_analysis v1.2.3] Aligning to {len(history_metadata['tickers'])} history tickers")
        
        # Align allocation_list to history_tickers order
        allocation_list = _align_allocation_to_tickers(
            allocation_list, 
            history_metadata["tickers"]
        )
        
        # v1.2.3: Extract ONLY AFTER alignment
        sectors = [a.get("sector") for a in allocation_list]
        asset_classes = [a.get("category", a.get("asset_class")) for a in allocation_list]
        asset_names = [_extract_name(a) for a in allocation_list]
        
        # v1.2.4 FIX: Recalculate weights from ALIGNED allocation_list
        # This ensures weights[i] and asset_classes[i] refer to the same asset
        aligned_weights = np.array([
            _normalize_weight(_safe_float(a.get("weight", a.get("weight_pct", 0)))) 
            for a in allocation_list
        ])
        # Normalize to sum to 1
        if aligned_weights.sum() > 1e-12:
            aligned_weights = aligned_weights / aligned_weights.sum()
        else:
            logger.warning("[risk_analysis v1.2.4] Sum of aligned weights ~0, using uniform weights")
            aligned_weights = np.ones(len(allocation_list)) / len(allocation_list)

        # v1.2.4: Verify alignment (first 5 items for debugging)
        logger.info(f"[risk_analysis v1.2.4] Alignment verification:")
        for i in range(min(5, len(history_metadata.get("tickers", [])))):
            ht = history_metadata["tickers"][i]
            at = _extract_ticker(allocation_list[i]) if i < len(allocation_list) else "?"
            ac = asset_classes[i] if i < len(asset_classes) else "?"
            wt = aligned_weights[i] * 100 if i < len(aligned_weights) else 0
            match = "✓" if ht.upper() == (at or "").upper() else "❌ MISMATCH"
            logger.info(f"  [{i}] {ht} -> {at} ({ac}, {wt:.1f}%) {match}")
    else:
        logger.warning("[risk_analysis v1.2.3] No history_tickers - using original order")
        sectors = [a.get("sector") for a in allocation_list] if allocation_list else None
        asset_classes = [a.get("category", a.get("asset_class")) for a in allocation_list] if allocation_list else None
        asset_names = [_extract_name(a) for a in allocation_list] if allocation_list else None
        aligned_weights = weights  # v1.2.4: Fallback to original weights
    
    analyzer = RiskAnalyzer(
        allocation=allocation_list,  # v1.1.2: Use built list
        cov_matrix=cov_matrix, 
        weights=aligned_weights,  # v1.2.4 FIX: Use ALIGNED weights
        sectors=sectors, 
        asset_classes=asset_classes,
        asset_names=asset_names,  # v1.2.1: For ETF type detection
        returns_history=returns_history,  # v1.1.0
        history_metadata=history_metadata,  # v1.1.0
    )
    
    result = analyzer.run_full_analysis(
        profile_name=profile_name, 
        include_stress=include_stress, 
        include_tail_risk=include_tail_risk, 
        include_liquidity=include_liquidity
    )
    # v1.2.7 FIX: Inject allocation_breakdown into stress_tests for transparency
    # Use weight_pct directly (already in percent), do NOT use _normalize_weight
    if result.stress_tests and isinstance(result.stress_tests, dict):
        allocation_by_category = {}
        for item in allocation_list:
            cat = item.get("category", "unknown")
            # weight_pct is in percent (e.g., 14.44 = 14.44%)
            w_pct = _safe_float(item.get("weight_pct", 0))
            allocation_by_category[cat] = allocation_by_category.get(cat, 0.0) + w_pct

        # Round for clean output (values are in percent)
        allocation_by_category = {k: round(v, 2) for k, v in allocation_by_category.items()}

        # Top positions sorted by weight_pct (descending)
        top_positions = [
            {
                "ticker": _extract_ticker(a) or a.get("name", "?")[:10],
                "category": a.get("category", "unknown"),
                "weight_pct": round(_safe_float(a.get("weight_pct", 0)), 2),
            }
            for a in sorted(allocation_list, key=lambda x: _safe_float(x.get("weight_pct", 0)), reverse=True)[:20]
        ]

        # Determine source
        source = "tickers_meta" if (tickers_meta and len(tickers_meta) > 0) else "fallback"

        result.stress_tests["allocation_breakdown"] = {
            "by_category": allocation_by_category,
            "total_weight_pct": round(sum(allocation_by_category.values()), 2),
            "n_positions": len(allocation_list),
            "top_positions": top_positions,
            "source": source,
        }
        logger.info(f"[risk_analysis v1.2.7] allocation_breakdown: {allocation_by_category}, source={source}")

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
    v1.1.2: Convenience function that fetches historical data and enriches risk analysis.
    
    Combines:
    1. fetch_portfolio_returns() from historical_data.py
    2. enrich_portfolio_with_risk_analysis()
    
    Args:
        portfolio_result: Résultat de optimizer.build_portfolio()
            Expected keys: "allocation" (dict {id: weight_pct}), "assets" (list)
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
    
    # v1.1.2: Extract tickers from assets (allocation is {id: weight}, not list)
    # v1.2.1: Prioritize _tickers_pricing if available (from generate_portfolios_v4.py)
    assets = portfolio_result.get("assets", [])
    allocation_dict = portfolio_result.get("allocation", {})
    tickers_pricing = portfolio_result.get("_tickers_pricing", {})
    
    tickers = []
    weights_by_ticker = {}
    
    # v1.2.1: Use _tickers_pricing if available (already contains tradable tickers)
    if tickers_pricing:
        tickers = list(tickers_pricing.keys())
        weights_by_ticker = {t: w for t, w in tickers_pricing.items() if w > 0}
        logger.info(f"[risk_analysis] Using _tickers_pricing: {len(tickers)} tickers")
    else:
        # Fallback: extract from assets
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
    
# v1.2.5 FIX: Ne pas écraser metadata["tickers"]!
    # history_metadata["tickers"] contient DÉJÀ les tickers valides
    # retournés par fetch_portfolio_returns().
    # L'écrasement avec `tickers` (liste originale) causait un désalignement
    # entre weights (N original) et cov_matrix (M valide × M valide).
    valid_tickers = history_metadata.get("tickers", [])
    tickers_with_errors = history_metadata.get("tickers_with_errors", [])
    
    if tickers_with_errors:
        logger.warning(
            f"[risk_analysis v1.2.5] {len(tickers_with_errors)} tickers exclus "
            f"(pas de données historiques): {tickers_with_errors[:5]}"
            f"{'...' if len(tickers_with_errors) > 5 else ''}"
        )
    
    # SUPPRIMÉ (bug v1.2.0-v1.2.4): history_metadata["tickers"] = tickers
    
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
    
    # v1.2.0: New helper functions
    "_align_weights_to_tickers",
    "_align_allocation_to_tickers",  # v1.2.2
    "_historical_var_cvar",
    "_estimate_cov_from_returns",
    "_is_leveraged_or_inverse",
    
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
    "LEVERAGE_FALSE_POSITIVES",  # v1.2.0
    "PREFERRED_TICKERS",
    "ALERT_THRESHOLDS",
    "TAIL_RISK_THRESHOLDS",  # v1.1.0
    
    # Flags
    "HAS_HISTORICAL_DATA",  # v1.1.0
    "HAS_STRESS_TESTING",
    "HAS_SCIPY",
]
