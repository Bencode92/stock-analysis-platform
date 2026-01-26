# portfolio_engine/risk_analysis.py
"""
Risk Analysis Module v1.0.1

Module d'enrichissement post-optimisation qui:
1. RÉUTILISE stress_testing.py (pas de duplication)
2. AJOUTE: leverage stress, preferred stock dual shock, tail risk, liquidity

Architecture:
- stress_testing.py = scénarios "legacy" (100% réutilisé)
- risk_analysis.py = wrapper + enrichissements + normalisation outputs

Design validé par ChatGPT (2026-01-26).

Changelog:
- v1.0.1: Fixes qualité
  - FIX: Disclaimer data_limits dans output JSON
  - FIX: compute_liquidity_score normalisation poids
  - FIX: stress_multiplier règle unifiée
  - FIX: Guardrails VaR99 fenêtre courte (<126 obs)
- v1.0.0: Initial release
  - Wrapper stress_testing.py
  - Leverage/inverse ETF detection + stress multiplier
  - Preferred stock dual shock (equity + rate)
  - Tail risk metrics (VaR99, CVaR99, skew, kurtosis)
  - Liquidity scoring
  - Alert generation
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

# Import stress_testing.py (existant)
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

# Import scipy pour tail risk (optionnel)
try:
    from scipy import stats as scipy_stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

# Logger
logger = logging.getLogger("portfolio_engine.risk_analysis")


# =============================================================================
# CONSTANTS
# =============================================================================

VERSION = "1.0.1"

# === LEVERAGE DETECTION ===
LEVERAGE_KEYWORDS = {
    "2x", "3x", "-1x", "-2x", "-3x",
    "ultra", "ultrapro", "ultrashort",
    "leveraged", "inverse", "short",
    "bull", "bear",
}

LEVERAGE_TICKERS = {
    # Leveraged Long
    "TQQQ", "SOXL", "UPRO", "SPXL", "TECL", "FAS", "LABU", "NUGT",
    "TNA", "UDOW", "UMDD", "URTY", "NAIL", "DFEN", "WANT", "WEBL",
    "FNGU", "BULZ", "SOXS", "PILL", "RETL", "DPST", "DRN", "ERX",
    # Leveraged Short / Inverse
    "SQQQ", "SPXS", "SDOW", "SDS", "QID", "PSQ", "SH", "DOG",
    "FAZ", "LABD", "DUST", "TZA", "SRTY", "SMDD", "UVXY", "VXX",
    "SOXS", "DRIP", "ERY", "YANG", "CHAD",
}

# Mapping ticker → leverage factor
LEVERAGE_FACTORS = {
    # 3x Long
    "TQQQ": 3.0, "SOXL": 3.0, "UPRO": 3.0, "SPXL": 3.0, "TECL": 3.0,
    "FAS": 3.0, "LABU": 3.0, "NUGT": 3.0, "TNA": 3.0, "UDOW": 3.0,
    # 2x Long
    "SSO": 2.0, "QLD": 2.0, "DDM": 2.0, "UWM": 2.0, "MVV": 2.0,
    # 3x Short
    "SQQQ": -3.0, "SPXS": -3.0, "SDOW": -3.0, "FAZ": -3.0, "LABD": -3.0,
    "DUST": -3.0, "TZA": -3.0, "SRTY": -3.0,
    # 2x Short
    "SDS": -2.0, "QID": -2.0, "DXD": -2.0, "TWM": -2.0, "MZZ": -2.0,
    # 1x Short
    "SH": -1.0, "PSQ": -1.0, "DOG": -1.0, "RWM": -1.0,
}

# === PREFERRED STOCK DETECTION ===
PREFERRED_KEYWORDS = {
    "preferred", "pref", "prfd", "pff", "pffd", "pgx", "psk",
    "convertible", "hybrid", "perpetual",
}

PREFERRED_TICKERS = {
    "PFF", "PFFD", "PGX", "SPFF", "IPFF", "PSK", "PFXF", "PFFV",
    "VRP", "PRFD", "FPE", "FPEI",
}

# === LIQUIDITY THRESHOLDS ===
LIQUIDITY_AUM_THRESHOLDS = {
    "high": 1_000_000_000,    # > $1B = high liquidity
    "medium": 100_000_000,    # $100M-$1B = medium
    "low": 10_000_000,        # $10M-$100M = low
    # < $10M = very low
}

LIQUIDITY_VOLUME_THRESHOLDS = {
    "high": 1_000_000,       # > 1M shares/day
    "medium": 100_000,       # 100K-1M
    "low": 10_000,           # 10K-100K
}

# === ALERT THRESHOLDS ===
ALERT_THRESHOLDS = {
    "Stable": {
        "max_leverage": 1.0,          # Pas de leverage
        "max_leveraged_weight": 0.0,
        "max_illiquid_weight": 10.0,
        "min_liquidity_score": 70.0,
        "max_var_99": -15.0,
        "max_cvar_99": -20.0,
    },
    "Modéré": {
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

# === PREFERRED STOCK STRESS PARAMETERS ===
# Dual shock: impact = equity_beta * equity_shock + duration * rate_shock
PREFERRED_STRESS_PARAMS = {
    "Stable": {
        "equity_beta": 0.3,      # Sensibilité equity réduite
        "duration": 5.0,         # Duration moyenne
        "rate_shock_bps": 100,   # +100bps
    },
    "Modéré": {
        "equity_beta": 0.4,
        "duration": 6.0,
        "rate_shock_bps": 150,
    },
    "Agressif": {
        "equity_beta": 0.5,
        "duration": 7.0,
        "rate_shock_bps": 200,
    },
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class LeverageAnalysis:
    """Résultat de l'analyse leverage."""
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
    """Résultat de l'analyse preferred stocks."""
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
    """Métriques de tail risk."""
    var_95: float = 0.0
    var_99: float = 0.0
    cvar_95: float = 0.0
    cvar_99: float = 0.0
    max_drawdown_expected: float = 0.0
    skewness: float = 0.0
    kurtosis: float = 3.0  # Normal = 3
    fat_tails: bool = False
    # v1.0.1: Flag confiance
    var99_confidence: str = "adequate"  # "adequate" ou "low_sample_size"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "var_95_pct": round(self.var_95 * 100, 2),
            "var_99_pct": round(self.var_99 * 100, 2),
            "cvar_95_pct": round(self.cvar_95 * 100, 2),
            "cvar_99_pct": round(self.cvar_99 * 100, 2),
            "max_drawdown_expected_pct": round(self.max_drawdown_expected * 100, 2),
            "skewness": round(self.skewness, 3),
            "kurtosis": round(self.kurtosis, 3),
            "fat_tails": self.fat_tails,
            "var99_confidence": self.var99_confidence,  # v1.0.1
        }


@dataclass
class LiquidityAnalysis:
    """Résultat de l'analyse de liquidité."""
    portfolio_score: float = 100.0  # 0-100
    illiquid_weight_pct: float = 0.0
    days_to_liquidate_95pct: float = 1.0
    concentration_risk: str = "low"  # low/medium/high
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
    """Alerte de risque."""
    level: str  # "info", "warning", "critical"
    alert_type: str  # "leverage", "preferred", "tail_risk", "liquidity"
    message: str
    recommendation: Optional[str] = None
    value: Optional[float] = None
    threshold: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        d = {
            "level": self.level,
            "type": self.alert_type,
            "message": self.message,
        }
        if self.recommendation:
            d["recommendation"] = self.recommendation
        if self.value is not None:
            d["value"] = self.value
        if self.threshold is not None:
            d["threshold"] = self.threshold
        return d


@dataclass
class RiskAnalysisResult:
    """Résultat complet de l'analyse de risque."""
    version: str = VERSION
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    profile_name: str = ""
    stress_tests: Dict[str, Any] = field(default_factory=dict)
    leverage_analysis: LeverageAnalysis = field(default_factory=LeverageAnalysis)
    preferred_analysis: PreferredStockAnalysis = field(default_factory=PreferredStockAnalysis)
    tail_risk: TailRiskMetrics = field(default_factory=TailRiskMetrics)
    liquidity: LiquidityAnalysis = field(default_factory=LiquidityAnalysis)
    alerts: List[RiskAlert] = field(default_factory=list)
    # v1.0.1: Metadata for data limits
    data_points: int = 63  # Default ~3 months daily
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "timestamp": self.timestamp.isoformat(),
            "profile": self.profile_name,
            # === v1.0.1: Data limits disclaimer ===
            "data_limits": {
                "historical_backtest": "disabled",
                "data_window": "3_months_daily",
                "data_points_approx": self.data_points,
                "stress_tests_calibration": "indicative_scenarios_not_historical",
                "tail_risk_method": "parametric_normal_preferred",
                "var99_confidence": self.tail_risk.var99_confidence,
                "disclaimer": "Stress tests are indicative only, not calibrated on historical crises (2008/2020/2022). VaR99 reliability requires >126 daily observations.",
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
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convertit une valeur en float de manière sécurisée."""
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
    """
    v1.0.1: Normalise un poids en fraction (0-1).
    
    Si weight > 1, on assume qu'il est en % et on divise par 100.
    Sinon on le garde tel quel.
    """
    if weight > 1.0:
        return weight / 100.0
    return weight


def _normalize_leverage(leverage_raw: Any) -> float:
    """
    Normalise la valeur de leverage (0→1 ou string→float).
    
    Gère:
    - 0, 1, 2, 3 (entiers)
    - "2x", "3x" (strings)
    - 200, 300 (pourcentages)
    """
    if leverage_raw is None:
        return 1.0
    
    # String: "2x", "3x", "-2x"
    if isinstance(leverage_raw, str):
        s = leverage_raw.lower().strip()
        match = re.search(r"(-?\d+(?:\.\d+)?)\s*x?", s)
        if match:
            return float(match.group(1))
        return 1.0
    
    # Numeric
    try:
        val = float(leverage_raw)
        # Si > 10, probablement en pourcentage (200 = 2x)
        if val > 10:
            return val / 100.0
        # Si 0, pas de leverage
        if val == 0:
            return 1.0
        return val
    except (TypeError, ValueError):
        return 1.0


def _extract_ticker(asset: Dict[str, Any]) -> Optional[str]:
    """Extrait le ticker d'un asset dict."""
    for key in ["ticker", "symbol", "etfsymbol", "id"]:
        val = asset.get(key)
        if val and isinstance(val, str):
            return val.upper()
    return None


def _extract_name(asset: Dict[str, Any]) -> str:
    """Extrait le nom d'un asset dict."""
    return str(asset.get("name", asset.get("id", "Unknown")))


# =============================================================================
# DETECTION FUNCTIONS
# =============================================================================

def detect_leveraged_instruments(
    allocation: List[Dict[str, Any]]
) -> LeverageAnalysis:
    """
    Détecte les instruments leveraged/inverse dans l'allocation.
    
    Args:
        allocation: Liste de dicts avec 'name', 'ticker', 'weight', etc.
    
    Returns:
        LeverageAnalysis avec détails
    """
    result = LeverageAnalysis()
    leveraged_items = []
    total_leveraged_weight = 0.0
    weighted_leverage = 0.0
    
    for asset in allocation:
        ticker = _extract_ticker(asset)
        name = _extract_name(asset).lower()
        weight = _safe_float(asset.get("weight", asset.get("weight_pct", 0)))
        
        # v1.0.1: Utiliser helper pour normaliser
        weight = _normalize_weight(weight)
        
        is_leveraged = False
        leverage_factor = 1.0
        
        # Check ticker
        if ticker and ticker in LEVERAGE_TICKERS:
            is_leveraged = True
            leverage_factor = LEVERAGE_FACTORS.get(ticker, 2.0)
        
        # Check name keywords
        if not is_leveraged:
            for kw in LEVERAGE_KEYWORDS:
                if kw in name:
                    is_leveraged = True
                    # Essayer d'extraire le factor
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
        
        # Check source_data leverage field
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
        
        # Effective leverage = weighted average
        if total_leveraged_weight > 0:
            avg_leverage = weighted_leverage / total_leveraged_weight
        else:
            avg_leverage = 1.0
        
        # Portfolio effective leverage
        non_leveraged_weight = 1.0 - total_leveraged_weight
        result.effective_leverage = non_leveraged_weight * 1.0 + weighted_leverage
        
        # v1.0.1: Stress multiplier - règle unifiée
        # multiplier = min(3, effective_leverage) pour éviter valeurs extrêmes
        result.stress_multiplier = min(3.0, result.effective_leverage)
    
    return result


def detect_preferred_stocks(
    allocation: List[Dict[str, Any]]
) -> PreferredStockAnalysis:
    """
    Détecte les preferred stocks et instruments hybrides.
    
    Args:
        allocation: Liste de dicts d'assets
    
    Returns:
        PreferredStockAnalysis avec détails
    """
    result = PreferredStockAnalysis()
    preferred_items = []
    total_weight = 0.0
    
    for asset in allocation:
        ticker = _extract_ticker(asset)
        name = _extract_name(asset).lower()
        weight = _safe_float(asset.get("weight", asset.get("weight_pct", 0)))
        
        # v1.0.1: Utiliser helper
        weight = _normalize_weight(weight)
        
        is_preferred = False
        
        # Check ticker
        if ticker and ticker in PREFERRED_TICKERS:
            is_preferred = True
        
        # Check name keywords
        if not is_preferred:
            for kw in PREFERRED_KEYWORDS:
                if kw in name:
                    is_preferred = True
                    break
        
        # Check fund_type
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
    aum_threshold: float = LIQUIDITY_AUM_THRESHOLDS["low"],
) -> List[Dict[str, Any]]:
    """
    Détecte les assets à faible liquidité.
    
    Args:
        allocation: Liste de dicts d'assets
        aum_threshold: Seuil AUM en USD
    
    Returns:
        Liste des assets illiquides avec détails
    """
    illiquid = []
    
    for asset in allocation:
        source_data = asset.get("source_data", {})
        aum = _safe_float(source_data.get("aum_usd", source_data.get("aum")))
        volume = _safe_float(source_data.get("avg_volume", source_data.get("volume")))
        
        weight = _safe_float(asset.get("weight", asset.get("weight_pct", 0)))
        weight = _normalize_weight(weight)
        
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
    base_stress_impact: float,
) -> float:
    """
    Calcule l'impact du stress ajusté pour le leverage.
    
    v1.0.1: Utilise directement stress_multiplier calculé dans detect_leveraged_instruments.
    
    Args:
        leverage_analysis: Résultat de detect_leveraged_instruments()
        base_stress_impact: Impact de base du scénario (ex: -0.20)
    
    Returns:
        Impact ajusté (ex: -0.30 si leverage 1.5x)
    """
    if not leverage_analysis.has_leveraged:
        return base_stress_impact
    
    # v1.0.1: Utiliser directement le stress_multiplier unifié
    return base_stress_impact * leverage_analysis.stress_multiplier


def compute_preferred_dual_shock(
    preferred_analysis: PreferredStockAnalysis,
    equity_shock: float,
    rate_shock_bps: float,
    profile_name: str = "Modéré",
) -> float:
    """
    Calcule l'impact d'un double choc sur les preferred stocks.
    
    Preferred stocks sont sensibles à:
    1. Equity (beta ~0.3-0.5)
    2. Taux d'intérêt (duration ~5-7 ans)
    
    v1.0.1: Formulation explicite
    - delta_rate = +bps/10000 (hausse des taux)
    - rate_pnl = -duration * delta_rate (hausse taux = perte)
    - total = equity_beta * equity_shock + rate_pnl
    
    Args:
        preferred_analysis: Résultat de detect_preferred_stocks()
        equity_shock: Choc equity en % (ex: -0.30 pour -30%)
        rate_shock_bps: Choc taux en bps (ex: 100 pour +1%)
        profile_name: Profil pour paramètres
    
    Returns:
        Impact total en % sur la portion preferred
    """
    if not preferred_analysis.has_preferred:
        return 0.0
    
    params = PREFERRED_STRESS_PARAMS.get(profile_name, PREFERRED_STRESS_PARAMS["Modéré"])
    
    # Impact equity
    equity_impact = params["equity_beta"] * equity_shock
    
    # v1.0.1: Formulation explicite pour rate shock
    # delta_rate positif = hausse des taux
    delta_rate = rate_shock_bps / 10000.0
    # rate_pnl négatif quand taux montent (bond perd de la valeur)
    rate_pnl = -params["duration"] * delta_rate
    
    # Total impact
    total_impact = equity_impact + rate_pnl
    
    # Stocker les détails
    preferred_analysis.equity_sensitivity = params["equity_beta"]
    preferred_analysis.rate_sensitivity = params["duration"]
    preferred_analysis.dual_shock_impact_pct = total_impact * 100
    preferred_analysis.details["equity_component_pct"] = equity_impact * 100
    preferred_analysis.details["rate_component_pct"] = rate_pnl * 100
    
    return total_impact


def compute_tail_risk_metrics(
    returns: np.ndarray,
    weights: Optional[np.ndarray] = None,
    cov_matrix: Optional[np.ndarray] = None,
    confidence_levels: Tuple[float, float] = (0.95, 0.99),
) -> TailRiskMetrics:
    """
    Calcule les métriques de tail risk.
    
    v1.0.1: Guardrails pour fenêtre courte
    - Si < 126 obs: VaR99 historique désactivé (non fiable)
    - Préférence au paramétrique pour VaR99
    
    Args:
        returns: Array de returns (T,) ou (T, N) pour N assets
        weights: Poids du portfolio (optionnel)
        cov_matrix: Matrice de covariance (optionnel)
        confidence_levels: Niveaux de confiance pour VaR
    
    Returns:
        TailRiskMetrics avec VaR, CVaR, skew, kurtosis
    """
    result = TailRiskMetrics()
    
    # === Approche paramétrique (si cov_matrix fournie) ===
    if weights is not None and cov_matrix is not None:
        try:
            port_vol = np.sqrt(weights @ cov_matrix @ weights)
            port_mean = 0.0  # Assume zero expected return for risk calc
            
            # VaR paramétrique (assume normal)
            z_95 = 1.645
            z_99 = 2.326
            
            result.var_95 = port_mean - z_95 * port_vol
            result.var_99 = port_mean - z_99 * port_vol
            
            # CVaR (Expected Shortfall) pour normal
            # ES = μ - σ * φ(z) / (1-α)
            result.cvar_95 = port_mean - port_vol * 2.063
            result.cvar_99 = port_mean - port_vol * 2.665
            
            # Max drawdown attendu (approximation)
            # E[MDD] ≈ σ * sqrt(2 * ln(T)) pour T périodes
            T = 252  # 1 an
            result.max_drawdown_expected = -port_vol * np.sqrt(2 * np.log(T))
        except Exception as e:
            logger.warning(f"[tail_risk] Erreur calcul paramétrique: {e}")
    
    # === Approche historique (si returns fournie) ===
    if returns is not None and len(returns) > 30:
        # Portfolio returns si weights fournis
        if weights is not None and returns.ndim == 2:
            port_returns = returns @ weights
        else:
            port_returns = returns.flatten() if returns.ndim > 1 else returns
        
        n_obs = len(port_returns)
        
        # v1.0.1: Guardrails fenêtre courte
        # VaR99 historique fiable seulement si >= 126 observations (~6 mois daily)
        # Car 1% quantile sur 63 obs = 0.63 observation = non significatif
        
        MIN_OBS_FOR_VAR99 = 126
        
        if n_obs >= MIN_OBS_FOR_VAR99:
            # Historical VaR (fiable)
            result.var_95 = float(np.percentile(port_returns, 5))
            result.var_99 = float(np.percentile(port_returns, 1))
            
            sorted_returns = np.sort(port_returns)
            n_05 = max(1, int(n_obs * 0.05))
            n_01 = max(1, int(n_obs * 0.01))
            result.cvar_95 = float(np.mean(sorted_returns[:n_05]))
            result.cvar_99 = float(np.mean(sorted_returns[:n_01]))
            result.var99_confidence = "adequate"
        else:
            # Fenêtre courte: VaR95 historique OK, VaR99 reste paramétrique
            result.var_95 = float(np.percentile(port_returns, 5))
            # VaR99/CVaR99: on garde les valeurs paramétriques calculées plus haut
            # Si pas de cov, fallback sur scaling de VaR95
            if result.var_99 == 0.0:
                result.var_99 = result.var_95 * 1.4  # Approx z99/z95 = 2.326/1.645
                result.cvar_99 = result.var_99 * 1.15  # CVaR > VaR
            result.var99_confidence = "low_sample_size"
            logger.info(f"[tail_risk] {n_obs} obs < {MIN_OBS_FOR_VAR99}: VaR99 paramétrique utilisé")
        
        # Skewness et Kurtosis (toujours calculables)
        if HAS_SCIPY:
            result.skewness = float(scipy_stats.skew(port_returns))
            result.kurtosis = float(scipy_stats.kurtosis(port_returns, fisher=False))
        else:
            # Fallback manual calculation
            mean = np.mean(port_returns)
            std = np.std(port_returns)
            if std > 0:
                result.skewness = float(np.mean(((port_returns - mean) / std) ** 3))
                result.kurtosis = float(np.mean(((port_returns - mean) / std) ** 4))
        
        # Fat tails: kurtosis > 3 (normal)
        result.fat_tails = result.kurtosis > 4.0
        
        # Max drawdown historique
        cumulative = np.cumprod(1 + port_returns)
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / running_max
        result.max_drawdown_expected = float(np.min(drawdowns))
    
    return result


def compute_liquidity_score(
    allocation: List[Dict[str, Any]],
    profile_name: str = "Modéré",
) -> LiquidityAnalysis:
    """
    Calcule un score de liquidité pour le portfolio.
    
    v1.0.1: Fix normalisation des poids dans calcul total_aum
    
    Score 0-100 basé sur:
    - AUM des instruments
    - Volume de trading
    - Concentration
    
    Args:
        allocation: Liste d'assets
        profile_name: Profil pour pondération
    
    Returns:
        LiquidityAnalysis avec score et détails
    """
    result = LiquidityAnalysis()
    
    if not allocation:
        return result
    
    scores = []
    weights_list = []
    illiquid_weight = 0.0
    
    for asset in allocation:
        source_data = asset.get("source_data", {})
        weight = _safe_float(asset.get("weight", asset.get("weight_pct", 0)))
        # v1.0.1: Utiliser helper
        weight = _normalize_weight(weight)
        
        aum = _safe_float(source_data.get("aum_usd", source_data.get("aum")))
        volume = _safe_float(source_data.get("avg_volume", source_data.get("volume")))
        
        # Score par asset (0-100)
        asset_score = 50  # Default
        
        if aum > LIQUIDITY_AUM_THRESHOLDS["high"]:
            asset_score = 100
        elif aum > LIQUIDITY_AUM_THRESHOLDS["medium"]:
            asset_score = 80
        elif aum > LIQUIDITY_AUM_THRESHOLDS["low"]:
            asset_score = 60
        elif aum > 0:
            asset_score = 30
            illiquid_weight += weight
        
        # Ajustement volume
        if volume > LIQUIDITY_VOLUME_THRESHOLDS["high"]:
            asset_score = min(100, asset_score + 10)
        elif volume > 0 and volume < LIQUIDITY_VOLUME_THRESHOLDS["low"]:
            asset_score = max(0, asset_score - 20)
            illiquid_weight += weight * 0.5  # Pénalité partielle
        
        scores.append(asset_score)
        weights_list.append(weight)
    
    # Score pondéré
    if sum(weights_list) > 0:
        result.portfolio_score = np.average(scores, weights=weights_list)
    
    result.illiquid_weight_pct = min(illiquid_weight * 100, 100)
    
    # Concentration risk
    weight_array = np.array(weights_list)
    if len(weight_array) > 0:
        hhi = np.sum(weight_array ** 2)  # Herfindahl index
        if hhi > 0.15:
            result.concentration_risk = "high"
        elif hhi > 0.08:
            result.concentration_risk = "medium"
        else:
            result.concentration_risk = "low"
    
    # v1.0.1: Fix calcul days to liquidate
    # Assume 10% of daily volume can be liquidated without impact
    total_aum = 0.0
    total_volume = 0.0
    
    for a in allocation:
        w = _safe_float(a.get("weight", a.get("weight_pct", 0)))
        # v1.0.1: Normaliser correctement
        w_frac = _normalize_weight(w)
        
        aum = _safe_float(a.get("source_data", {}).get("aum_usd", 0))
        vol = _safe_float(a.get("source_data", {}).get("avg_volume", 0))
        price = _safe_float(a.get("source_data", {}).get("price", 100))
        
        total_aum += aum * w_frac
        total_volume += vol * price
    
    if total_volume > 0:
        # 95% of portfolio / (10% daily volume)
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
    profile_name: str,
) -> List[RiskAlert]:
    """
    Génère des alertes basées sur les analyses.
    
    Args:
        leverage_analysis: Résultat analyse leverage
        preferred_analysis: Résultat analyse preferred
        tail_risk: Métriques tail risk
        liquidity: Score de liquidité
        profile_name: Profil pour seuils
    
    Returns:
        Liste d'alertes triées par gravité
    """
    alerts = []
    thresholds = ALERT_THRESHOLDS.get(profile_name, ALERT_THRESHOLDS["Modéré"])
    
    # === LEVERAGE ALERTS ===
    if leverage_analysis.has_leveraged:
        if leverage_analysis.effective_leverage > thresholds["max_leverage"]:
            alerts.append(RiskAlert(
                level="warning" if leverage_analysis.effective_leverage < thresholds["max_leverage"] * 1.5 else "critical",
                alert_type="leverage",
                message=f"Leverage effectif ({leverage_analysis.effective_leverage:.1f}x) > seuil {profile_name} ({thresholds['max_leverage']:.1f}x)",
                recommendation=f"Réduire les positions leveraged de {leverage_analysis.total_weight_pct:.1f}% à <{thresholds['max_leveraged_weight']:.0f}%",
                value=leverage_analysis.effective_leverage,
                threshold=thresholds["max_leverage"],
            ))
        
        if leverage_analysis.total_weight_pct > thresholds["max_leveraged_weight"]:
            alerts.append(RiskAlert(
                level="warning",
                alert_type="leverage",
                message=f"Poids leveraged ({leverage_analysis.total_weight_pct:.1f}%) > seuil ({thresholds['max_leveraged_weight']:.0f}%)",
                recommendation=f"Réduire: {', '.join(leverage_analysis.instruments[:3])}",
                value=leverage_analysis.total_weight_pct,
                threshold=thresholds["max_leveraged_weight"],
            ))
        
        if leverage_analysis.has_inverse:
            alerts.append(RiskAlert(
                level="info",
                alert_type="leverage",
                message="Portfolio contient des ETF inverse - vérifier cohérence avec vue marché",
            ))
    
    # === PREFERRED STOCK ALERTS ===
    if preferred_analysis.has_preferred:
        if abs(preferred_analysis.dual_shock_impact_pct) > 15:
            alerts.append(RiskAlert(
                level="warning",
                alert_type="preferred",
                message=f"Impact dual shock preferred élevé ({preferred_analysis.dual_shock_impact_pct:.1f}%)",
                recommendation="Réduire exposition preferred ou hedger le risque taux",
                value=preferred_analysis.dual_shock_impact_pct,
            ))
    
    # === TAIL RISK ALERTS ===
    if tail_risk.var_99 * 100 < thresholds["max_var_99"]:
        alerts.append(RiskAlert(
            level="warning",
            alert_type="tail_risk",
            message=f"VaR 99% ({tail_risk.var_99*100:.1f}%) dépasse seuil ({thresholds['max_var_99']:.0f}%)",
            recommendation="Réduire positions volatiles ou augmenter diversification",
            value=tail_risk.var_99 * 100,
            threshold=thresholds["max_var_99"],
        ))
    
    if tail_risk.fat_tails:
        alerts.append(RiskAlert(
            level="info",
            alert_type="tail_risk",
            message=f"Kurtosis élevé ({tail_risk.kurtosis:.1f}) indique des fat tails - risques extrêmes sous-estimés par VaR",
        ))
    
    if tail_risk.skewness < -0.5:
        alerts.append(RiskAlert(
            level="info",
            alert_type="tail_risk",
            message=f"Skewness négatif ({tail_risk.skewness:.2f}) - distribution asymétrique vers les pertes",
        ))
    
    # v1.0.1: Alerte confiance VaR99
    if tail_risk.var99_confidence == "low_sample_size":
        alerts.append(RiskAlert(
            level="info",
            alert_type="tail_risk",
            message="VaR99 basé sur approche paramétrique (fenêtre historique < 6 mois)",
            recommendation="Interpréter avec prudence - idéalement attendre 6+ mois de données",
        ))
    
    # === LIQUIDITY ALERTS ===
    if liquidity.portfolio_score < thresholds["min_liquidity_score"]:
        alerts.append(RiskAlert(
            level="warning",
            alert_type="liquidity",
            message=f"Score liquidité ({liquidity.portfolio_score:.0f}) < seuil ({thresholds['min_liquidity_score']:.0f})",
            recommendation="Remplacer instruments illiquides par ETF plus liquides",
            value=liquidity.portfolio_score,
            threshold=thresholds["min_liquidity_score"],
        ))
    
    if liquidity.illiquid_weight_pct > thresholds["max_illiquid_weight"]:
        alerts.append(RiskAlert(
            level="warning",
            alert_type="liquidity",
            message=f"Poids illiquide ({liquidity.illiquid_weight_pct:.1f}%) > seuil ({thresholds['max_illiquid_weight']:.0f}%)",
            value=liquidity.illiquid_weight_pct,
            threshold=thresholds["max_illiquid_weight"],
        ))
    
    if liquidity.concentration_risk == "high":
        alerts.append(RiskAlert(
            level="warning",
            alert_type="liquidity",
            message="Concentration élevée - risque de liquidité en cas de sortie",
            recommendation="Diversifier sur plus de positions",
        ))
    
    # Trier par gravité
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: severity_order.get(a.level, 3))
    
    return alerts


# =============================================================================
# MAIN CLASS: RiskAnalyzer
# =============================================================================

class RiskAnalyzer:
    """
    Analyseur de risque post-optimisation.
    
    Wrapper autour de stress_testing.py + enrichissements.
    
    Usage:
        analyzer = RiskAnalyzer(allocation, cov_matrix, weights)
        result = analyzer.run_full_analysis("Modéré")
        print(result.to_dict())
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
    ):
        """
        Initialize RiskAnalyzer.
        
        Args:
            allocation: Liste de dicts d'assets avec weights
            cov_matrix: Matrice de covariance (n x n)
            weights: Poids du portfolio (n,)
            expected_returns: Returns attendus (n,)
            returns_history: Historique de returns (T x n)
            sectors: Labels secteur par asset
            asset_classes: Labels classe d'actif par asset
        """
        self.allocation = allocation
        self.cov_matrix = cov_matrix
        self.weights = weights
        self.expected_returns = expected_returns if expected_returns is not None else (
            np.zeros(len(allocation)) if allocation else np.array([])
        )
        self.returns_history = returns_history
        self.sectors = sectors
        self.asset_classes = asset_classes
        
        # Extract weights from allocation if not provided
        if self.weights is None and allocation:
            self.weights = np.array([
                _normalize_weight(_safe_float(a.get("weight", a.get("weight_pct", 0))))
                for a in allocation
            ])
    
    def run_stress_scenarios(
        self,
        profile_name: str = "Modéré",
        scenarios: Optional[List[StressScenario]] = None,
    ) -> Dict[str, Any]:
        """
        Exécute les stress tests via stress_testing.py + ajustements.
        
        Args:
            profile_name: Profil pour paramètres
            scenarios: Liste de scénarios (default: standard set)
        
        Returns:
            Dict avec résultats stress + ajustements
        """
        if not HAS_STRESS_TESTING:
            logger.warning("stress_testing.py non disponible, skip stress tests")
            return {"error": "stress_testing module not available"}
        
        if self.cov_matrix is None or self.weights is None:
            return {"error": "cov_matrix and weights required for stress tests"}
        
        # 1. Appel du module existant (100% réutilisation)
        default_scenarios = [
            StressScenario.CORRELATION_SPIKE,
            StressScenario.VOLATILITY_SHOCK,
            StressScenario.LIQUIDITY_CRISIS,
            StressScenario.RATE_SHOCK,
            StressScenario.MARKET_CRASH,
        ]
        
        pack: StressTestPack = run_stress_test_pack(
            weights=self.weights,
            expected_returns=self.expected_returns,
            cov_matrix=self.cov_matrix,
            scenarios=scenarios or default_scenarios,
            sectors=self.sectors,
            asset_classes=self.asset_classes,
        )
        
        # 2. Résultats de base
        result = pack.to_dict()
        result["source"] = "stress_testing.py"
        # v1.0.1: Disclaimer
        result["calibration_note"] = "Indicative scenarios, not calibrated on historical crises"
        
        # 3. Ajustements leverage
        leverage_analysis = detect_leveraged_instruments(self.allocation)
        if leverage_analysis.has_leveraged:
            result["adjustments_applied"] = result.get("adjustments_applied", {})
            result["adjustments_applied"]["leverage_multiplier"] = leverage_analysis.stress_multiplier
            
            # Ajuster worst case
            if pack.worst_case:
                adjusted_loss = compute_leverage_stress_multiplier(
                    leverage_analysis,
                    pack.worst_case.expected_loss,
                )
                result["worst_case_adjusted"] = {
                    "scenario": pack.worst_case.scenario,
                    "original_loss_pct": pack.worst_case.expected_loss * 100,
                    "adjusted_loss_pct": adjusted_loss * 100,
                }
        
        # 4. Ajustements preferred stocks
        preferred_analysis = detect_preferred_stocks(self.allocation)
        if preferred_analysis.has_preferred:
            # Get market crash params for dual shock
            crash_params = get_scenario_parameters(StressScenario.MARKET_CRASH)
            rate_params = get_scenario_parameters(StressScenario.RATE_SHOCK)
            
            dual_shock = compute_preferred_dual_shock(
                preferred_analysis,
                equity_shock=crash_params.return_shock,
                rate_shock_bps=PREFERRED_STRESS_PARAMS[profile_name]["rate_shock_bps"],
                profile_name=profile_name,
            )
            
            result["adjustments_applied"] = result.get("adjustments_applied", {})
            result["adjustments_applied"]["preferred_dual_shock"] = True
            result["adjustments_applied"]["preferred_impact_pct"] = dual_shock * 100
        
        return result
    
    def run_full_analysis(
        self,
        profile_name: str = "Modéré",
        include_stress: bool = True,
        include_leverage: bool = True,
        include_preferred: bool = True,
        include_tail_risk: bool = True,
        include_liquidity: bool = True,
    ) -> RiskAnalysisResult:
        """
        Exécute l'analyse complète.
        
        Args:
            profile_name: Profil pour seuils
            include_*: Flags pour inclure/exclure analyses
        
        Returns:
            RiskAnalysisResult complet
        """
        result = RiskAnalysisResult(profile_name=profile_name)
        
        # v1.0.1: Track data points
        if self.returns_history is not None:
            result.data_points = len(self.returns_history)
        
        # 1. Stress tests
        if include_stress:
            result.stress_tests = self.run_stress_scenarios(profile_name)
        
        # 2. Leverage analysis
        if include_leverage:
            result.leverage_analysis = detect_leveraged_instruments(self.allocation)
        
        # 3. Preferred stocks
        if include_preferred:
            result.preferred_analysis = detect_preferred_stocks(self.allocation)
            if result.preferred_analysis.has_preferred:
                # Compute dual shock impact
                compute_preferred_dual_shock(
                    result.preferred_analysis,
                    equity_shock=-0.30,  # Market crash
                    rate_shock_bps=PREFERRED_STRESS_PARAMS[profile_name]["rate_shock_bps"],
                    profile_name=profile_name,
                )
        
        # 4. Tail risk
        if include_tail_risk:
            result.tail_risk = compute_tail_risk_metrics(
                returns=self.returns_history,
                weights=self.weights,
                cov_matrix=self.cov_matrix,
            )
        
        # 5. Liquidity
        if include_liquidity:
            result.liquidity = compute_liquidity_score(
                self.allocation,
                profile_name,
            )
        
        # 6. Alerts
        result.alerts = generate_alerts(
            result.leverage_analysis,
            result.preferred_analysis,
            result.tail_risk,
            result.liquidity,
            profile_name,
        )
        
        logger.info(
            f"[risk_analysis] {profile_name}: "
            f"{len(result.alerts)} alerts "
            f"(leverage={result.leverage_analysis.has_leveraged}, "
            f"preferred={result.preferred_analysis.has_preferred})"
        )
        
        return result


# =============================================================================
# CONVENIENCE FUNCTION
# =============================================================================

def enrich_portfolio_with_risk_analysis(
    portfolio_result: Dict[str, Any],
    profile_name: str,
    include_stress: bool = True,
    include_tail_risk: bool = True,
    include_liquidity: bool = True,
) -> Dict[str, Any]:
    """
    Enrichit un résultat de portfolio avec l'analyse de risque.
    
    Fonction de convenance pour intégration dans generate_portfolios_v4.py.
    
    Args:
        portfolio_result: Résultat de optimizer.build_portfolio()
        profile_name: Profil ("Stable", "Modéré", "Agressif")
        include_*: Flags pour analyses
    
    Returns:
        portfolio_result enrichi avec clé "risk_analysis"
    """
    # Extraire données nécessaires
    allocation = portfolio_result.get("allocation", [])
    cov_matrix = portfolio_result.get("cov_matrix")
    weights = portfolio_result.get("weights")
    
    # Convertir weights si nécessaire
    if weights is not None and not isinstance(weights, np.ndarray):
        weights = np.array(weights)
    if cov_matrix is not None and not isinstance(cov_matrix, np.ndarray):
        cov_matrix = np.array(cov_matrix)
    
    # Extraire sectors et asset_classes si disponibles
    sectors = [a.get("sector") for a in allocation] if allocation else None
    asset_classes = [a.get("category", a.get("asset_class")) for a in allocation] if allocation else None
    
    # Run analysis
    analyzer = RiskAnalyzer(
        allocation=allocation,
        cov_matrix=cov_matrix,
        weights=weights,
        sectors=sectors,
        asset_classes=asset_classes,
    )
    
    result = analyzer.run_full_analysis(
        profile_name=profile_name,
        include_stress=include_stress,
        include_tail_risk=include_tail_risk,
        include_liquidity=include_liquidity,
    )
    
    # Ajouter au portfolio_result
    portfolio_result["risk_analysis"] = result.to_dict()
    
    return portfolio_result


# =============================================================================
# MODULE EXPORTS
# =============================================================================

__all__ = [
    # Main class
    "RiskAnalyzer",
    
    # Convenience function
    "enrich_portfolio_with_risk_analysis",
    
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
]
