# portfolio_engine/stress_testing.py
"""
Stress Testing Pack for Portfolio Engine.

P2-12 - 2025-12-18
v1.1.1 - 2026-01-28: Fixed shock cumulation bug

Implements parameterized stress scenarios to test portfolio robustness.

Scenarios:
1. CORRELATION_SPIKE: Correlations increase +50%, volatility +50%
2. VOLATILITY_SHOCK: Volatility triples (×3)
3. LIQUIDITY_CRISIS: Spreads widen, small caps -30%
4. RATE_SHOCK: Interest rate spike affecting duration-sensitive assets
5. MARKET_CRASH: 2008-style crash (-40% equities, correlation→1)

Changelog:
- v1.1.1: Fixed shock cumulation + correlation direction (2026-01-28)
  - FIX: Asset class shock now REPLACES return_shock (not adds)
  - FIX: Sector shock is now a capped adjustment (max 50% of base shock)
  - FIX: Correlation stress now pushes toward +1 (crisis-like), not toward magnitude
  - Root cause: Shocks were adding up causing >100% losses
  - Root cause: Negative correlations were becoming more negative (wrong crisis behavior)
- v1.1.0: Asset class mapping for French categories (Actions, ETF, Obligations, Crypto)
- v1.0.0: Initial release

Design rationale:
- Each scenario modifies covariance matrix and/or expected returns
- Scenarios are composable (can combine multiple)
- Output includes stressed VaR, drawdown, and portfolio impact
- Integration with quality gates for automated alerting
"""

import numpy as np
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple
import warnings
import re

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

logger = get_structured_logger("portfolio_engine.stress_testing")

VERSION = "1.1.1"

# ============================================================
# ENUMS & CONSTANTS
# ============================================================

class StressScenario(Enum):
    """Pre-defined stress scenarios."""
    CORRELATION_SPIKE = "correlation_spike"
    VOLATILITY_SHOCK = "volatility_shock"
    LIQUIDITY_CRISIS = "liquidity_crisis"
    RATE_SHOCK = "rate_shock"
    MARKET_CRASH = "market_crash"
    STAGFLATION = "stagflation"
    CUSTOM = "custom"


# ============================================================
# v1.1.0: ASSET CLASS MAPPING
# ============================================================

# Map various category names to standardized asset classes
ASSET_CLASS_MAPPING = {
    # French categories
    "actions": "equity",
    "action": "equity",
    "etf": "equity",  # Default, will be refined by ETF type
    "obligations": "bond",
    "obligation": "bond",
    "crypto": "crypto",
    "cryptomonnaie": "crypto",
    "cryptomonnaies": "crypto",
    "or": "commodity",
    "gold": "commodity",
    "matières premières": "commodity",
    "commodities": "commodity",
    "commodity": "commodity",
    "immobilier": "real_estate",
    "real estate": "real_estate",
    "reit": "real_estate",
    "cash": "cash",
    "liquidités": "cash",
    "monétaire": "cash",
    
    # English categories
    "equity": "equity",
    "stock": "equity",
    "stocks": "equity",
    "bond": "bond",
    "bonds": "bond",
    "fixed income": "bond",
    "fixed_income": "bond",
    
    # Specific bond types
    "treasury": "bond_gov",
    "government": "bond_gov",
    "corporate": "bond_corp",
    "high yield": "bond_hy",
    "high_yield": "bond_hy",
    "investment grade": "bond_ig",
    "investment_grade": "bond_ig",
    "municipal": "bond_muni",
    "tips": "bond_tips",
    "inflation": "bond_tips",
    
    # Specific equity types
    "small cap": "equity_small",
    "small_cap": "equity_small",
    "emerging": "equity_em",
    "emerging markets": "equity_em",
    "emerging_markets": "equity_em",
    "growth": "equity_growth",
    "value": "equity_value",
    "dividend": "equity_dividend",
    "tech": "equity_tech",
    "technology": "equity_tech",
    "financials": "equity_fin",
    "healthcare": "equity_health",
    "energy": "equity_energy",
    "utilities": "equity_util",
    "consumer": "equity_consumer",
    "industrial": "equity_industrial",
}

# Sector name normalization
SECTOR_MAPPING = {
    # Technology
    "technology": "Technology",
    "tech": "Technology",
    "information technology": "Technology",
    "software": "Technology",
    "semiconductors": "Technology",
    "semi-conducteurs": "Technology",
    
    # Financials
    "financials": "Financials",
    "financial": "Financials",
    "finance": "Financials",
    "banks": "Financials",
    "banking": "Financials",
    "insurance": "Financials",
    
    # Healthcare
    "healthcare": "Healthcare",
    "health care": "Healthcare",
    "santé": "Healthcare",
    "pharma": "Healthcare",
    "biotech": "Healthcare",
    
    # Consumer
    "consumer discretionary": "Consumer Discretionary",
    "consumer_discretionary": "Consumer Discretionary",
    "retail": "Consumer Discretionary",
    "consumer staples": "Consumer Staples",
    "consumer_staples": "Consumer Staples",
    "food": "Consumer Staples",
    "beverage": "Consumer Staples",
    
    # Energy & Utilities
    "energy": "Energy",
    "oil": "Energy",
    "gas": "Energy",
    "utilities": "Utilities",
    "utility": "Utilities",
    
    # Industrials
    "industrials": "Industrials",
    "industrial": "Industrials",
    "manufacturing": "Industrials",
    "aerospace": "Industrials",
    "defense": "Industrials",
    
    # Real Estate
    "real estate": "Real Estate",
    "real_estate": "Real Estate",
    "reit": "Real Estate",
    "immobilier": "Real Estate",
    
    # Materials
    "materials": "Materials",
    "basic materials": "Materials",
    "mining": "Materials",
    "metals": "Materials",
    "gold": "Materials",
    "or": "Materials",
    
    # Communication
    "communication": "Communication Services",
    "communication services": "Communication Services",
    "telecom": "Communication Services",
    "media": "Communication Services",
    
    # Small/Mid Cap
    "small cap": "Small Cap",
    "small_cap": "Small Cap",
    "mid cap": "Mid Cap",
    "mid_cap": "Mid Cap",
    
    # Emerging
    "emerging": "Emerging Markets",
    "emerging markets": "Emerging Markets",
    "emerging_markets": "Emerging Markets",
    "em": "Emerging Markets",
}


def normalize_asset_class(category: Optional[str]) -> str:
    """
    v1.1.0: Normalize asset class name to standard format.
    
    Args:
        category: Raw category name (e.g., "Actions", "ETF", "Obligations")
    
    Returns:
        Normalized asset class (e.g., "equity", "bond", "crypto")
    """
    if not category:
        return "unknown"
    
    key = category.lower().strip()
    return ASSET_CLASS_MAPPING.get(key, "unknown")


def normalize_sector(sector: Optional[str]) -> str:
    """
    v1.1.0: Normalize sector name to standard format.
    
    Args:
        sector: Raw sector name
    
    Returns:
        Normalized sector (e.g., "Technology", "Financials")
    """
    if not sector:
        return "Unknown"
    
    key = sector.lower().strip()
    return SECTOR_MAPPING.get(key, sector.title())


def detect_etf_type(name: str) -> str:
    """
    v1.1.0: Detect ETF type from name for better stress classification.
    
    Args:
        name: ETF name
    
    Returns:
        Specific asset class (e.g., "bond_gov", "equity_small")
    """
    name_lower = name.lower()
    
    # Bond ETFs
    if any(kw in name_lower for kw in ["treasury", "government", "govt"]):
        return "bond_gov"
    if any(kw in name_lower for kw in ["corporate", "corp"]):
        return "bond_corp"
    if any(kw in name_lower for kw in ["high yield", "high-yield", "junk"]):
        return "bond_hy"
    if any(kw in name_lower for kw in ["municipal", "muni"]):
        return "bond_muni"
    if any(kw in name_lower for kw in ["tips", "inflation"]):
        return "bond_tips"
    if any(kw in name_lower for kw in ["bond", "fixed income", "aggregate"]):
        return "bond_ig"
    
    # Equity ETFs
    if any(kw in name_lower for kw in ["small cap", "small-cap", "smallcap"]):
        return "equity_small"
    if any(kw in name_lower for kw in ["emerging", "em market"]):
        return "equity_em"
    if any(kw in name_lower for kw in ["growth"]):
        return "equity_growth"
    if any(kw in name_lower for kw in ["value"]):
        return "equity_value"
    if any(kw in name_lower for kw in ["dividend", "income"]):
        return "equity_dividend"
    if any(kw in name_lower for kw in ["tech", "nasdaq", "semiconductor"]):
        return "equity_tech"
    if any(kw in name_lower for kw in ["international", "developed", "world", "global"]):
        return "equity_intl"
    if any(kw in name_lower for kw in ["real estate", "reit"]):
        return "real_estate"
    if any(kw in name_lower for kw in ["gold", "precious", "commodity"]):
        return "commodity"
    
    # Default to broad equity
    return "equity"


# Historical reference events for calibration
HISTORICAL_EVENTS = {
    "2008_financial_crisis": {
        "description": "2008 Global Financial Crisis",
        "equity_drawdown": -0.57,
        "vol_multiplier": 4.0,
        "correlation_increase": 0.40,
        "duration_months": 17,
    },
    "2020_covid_crash": {
        "description": "COVID-19 Market Crash (Feb-Mar 2020)",
        "equity_drawdown": -0.34,
        "vol_multiplier": 5.0,
        "correlation_increase": 0.35,
        "duration_months": 1,
    },
    "2022_rate_shock": {
        "description": "2022 Interest Rate Shock",
        "equity_drawdown": -0.25,
        "bond_drawdown": -0.15,
        "vol_multiplier": 1.8,
        "correlation_increase": 0.20,
        "duration_months": 10,
    },
    "1987_black_monday": {
        "description": "Black Monday 1987",
        "equity_drawdown": -0.23,  # Single day
        "vol_multiplier": 6.0,
        "correlation_increase": 0.50,
        "duration_months": 0.1,
    },
}


# ============================================================
# SCENARIO PARAMETERS
# ============================================================

@dataclass
class ScenarioParameters:
    """
    Parameters defining a stress scenario.
    
    Attributes:
        name: Scenario identifier
        description: Human-readable description
        correlation_delta: Additive change to correlations (e.g., +0.3)
        volatility_multiplier: Multiplicative factor for volatilities (e.g., 2.0)
        return_shock: Immediate return shock (e.g., -0.20 for -20%)
        sector_shocks: Dict of sector-specific return shocks
        asset_class_shocks: Dict of asset class-specific shocks
        liquidity_impact: Multiplier for transaction costs
        duration_days: Scenario duration for time-based analysis
        probability: Estimated probability (for risk weighting)
    """
    name: str
    description: str = ""
    correlation_delta: float = 0.0
    volatility_multiplier: float = 1.0
    return_shock: float = 0.0
    sector_shocks: Dict[str, float] = field(default_factory=dict)
    asset_class_shocks: Dict[str, float] = field(default_factory=dict)
    liquidity_impact: float = 1.0
    duration_days: int = 21  # ~1 month
    probability: float = 0.05  # 5% default

    def validate(self) -> List[str]:
        """Validate parameters, return list of issues."""
        issues = []
        
        if self.correlation_delta < -1 or self.correlation_delta > 1:
            issues.append(f"correlation_delta {self.correlation_delta} out of [-1, 1]")
        
        if self.volatility_multiplier <= 0:
            issues.append(f"volatility_multiplier must be positive")
        
        if self.return_shock < -1:
            issues.append(f"return_shock {self.return_shock} implies >100% loss")
        
        if self.liquidity_impact < 1:
            issues.append(f"liquidity_impact should be >= 1")
        
        return issues


# ============================================================
# PRE-DEFINED SCENARIOS
# ============================================================

def get_scenario_parameters(scenario: StressScenario) -> ScenarioParameters:
    """
    Get parameters for a pre-defined stress scenario.
    
    v1.1.0: Enhanced with more asset class shocks for better differentiation.
    
    Args:
        scenario: StressScenario enum value
    
    Returns:
        ScenarioParameters with appropriate settings
    """
    scenarios = {
        StressScenario.CORRELATION_SPIKE: ScenarioParameters(
            name="correlation_spike",
            description="Correlations increase sharply (+50%), volatility +50%",
            correlation_delta=0.30,
            volatility_multiplier=1.5,
            return_shock=-0.05,
            probability=0.10,
            # v1.1.0: Enhanced asset class shocks
            asset_class_shocks={
                "equity": -0.08,
                "equity_small": -0.12,
                "equity_em": -0.15,
                "equity_tech": -0.10,
                "equity_intl": -0.09,
                "bond": -0.02,
                "bond_gov": 0.01,  # Flight to quality
                "bond_corp": -0.04,
                "bond_hy": -0.08,
                "crypto": -0.15,
                "commodity": -0.05,
                "real_estate": -0.07,
            },
        ),
        
        StressScenario.VOLATILITY_SHOCK: ScenarioParameters(
            name="volatility_shock",
            description="Volatility triples (×3), similar to VIX spike events",
            correlation_delta=0.15,
            volatility_multiplier=3.0,
            return_shock=-0.10,
            probability=0.05,
            # v1.1.0: Enhanced asset class shocks
            asset_class_shocks={
                "equity": -0.15,
                "equity_small": -0.22,
                "equity_em": -0.25,
                "equity_tech": -0.20,
                "equity_growth": -0.18,
                "equity_intl": -0.16,
                "bond": -0.03,
                "bond_gov": 0.02,  # Safe haven
                "bond_corp": -0.06,
                "bond_hy": -0.12,
                "crypto": -0.30,
                "commodity": -0.10,
                "real_estate": -0.12,
            },
        ),
        
        StressScenario.LIQUIDITY_CRISIS: ScenarioParameters(
            name="liquidity_crisis",
            description="Liquidity dries up, spreads widen, small caps hit hard",
            correlation_delta=0.25,
            volatility_multiplier=2.0,
            return_shock=-0.15,
            sector_shocks={
                "Small Cap": -0.30,
                "Emerging Markets": -0.25,
                "High Yield": -0.20,
                "Real Estate": -0.18,
                "Financials": -0.15,
            },
            asset_class_shocks={
                "equity": -0.18,
                "equity_small": -0.35,
                "equity_em": -0.30,
                "equity_tech": -0.20,
                "equity_intl": -0.20,
                "bond": -0.05,
                "bond_gov": 0.03,
                "bond_corp": -0.10,
                "bond_hy": -0.25,
                "bond_muni": -0.08,
                "crypto": -0.40,
                "commodity": -0.15,
                "real_estate": -0.22,
            },
            liquidity_impact=3.0,
            probability=0.05,
        ),
        
        StressScenario.RATE_SHOCK: ScenarioParameters(
            name="rate_shock",
            description="Sharp interest rate increase (+200bp), bonds and growth hit",
            correlation_delta=0.20,
            volatility_multiplier=1.8,
            return_shock=-0.08,
            sector_shocks={
                "Technology": -0.15,
                "Real Estate": -0.20,
                "Utilities": -0.12,
                "Financials": 0.05,  # Banks benefit from higher rates
                "Consumer Discretionary": -0.10,
            },
            asset_class_shocks={
                "equity": -0.10,
                "equity_growth": -0.18,
                "equity_tech": -0.16,
                "equity_value": -0.05,
                "equity_dividend": -0.08,
                "equity_intl": -0.12,
                "bond": -0.08,
                "bond_gov": -0.10,
                "bond_corp": -0.12,
                "bond_ig": -0.10,
                "bond_hy": -0.08,
                "bond_tips": -0.03,  # Inflation-protected
                "crypto": -0.20,
                "commodity": 0.05,  # Inflation hedge
                "real_estate": -0.15,
            },
            probability=0.08,
        ),
        
        StressScenario.MARKET_CRASH: ScenarioParameters(
            name="market_crash",
            description="2008-style crash: equities -40%, correlations → 1",
            correlation_delta=0.50,
            volatility_multiplier=4.0,
            return_shock=-0.40,
            sector_shocks={
                "Financials": -0.60,
                "Real Estate": -0.50,
                "Consumer Discretionary": -0.45,
                "Technology": -0.42,
                "Industrials": -0.40,
                "Materials": -0.38,
                "Energy": -0.35,
                "Healthcare": -0.25,
                "Consumer Staples": -0.20,
                "Utilities": -0.18,
            },
            asset_class_shocks={
                "equity": -0.45,
                "equity_small": -0.55,
                "equity_em": -0.55,
                "equity_tech": -0.50,
                "equity_growth": -0.48,
                "equity_value": -0.40,
                "equity_fin": -0.60,
                "equity_intl": -0.45,
                "bond": -0.05,
                "bond_gov": 0.08,  # Flight to safety
                "bond_corp": -0.15,
                "bond_ig": -0.10,
                "bond_hy": -0.30,
                "crypto": -0.60,
                "commodity": -0.25,
                "real_estate": -0.45,
                "cash": 0.01,
            },
            liquidity_impact=5.0,
            duration_days=252,  # 1 year
            probability=0.02,
        ),
        
        StressScenario.STAGFLATION: ScenarioParameters(
            name="stagflation",
            description="High inflation + low growth: bonds and equities both suffer",
            correlation_delta=0.35,
            volatility_multiplier=2.0,
            return_shock=-0.15,
            sector_shocks={
                "Technology": -0.20,
                "Consumer Discretionary": -0.18,
                "Real Estate": -0.15,
                "Financials": -0.12,
                "Energy": 0.10,  # Benefits from inflation
                "Materials": 0.05,
            },
            asset_class_shocks={
                "equity": -0.18,
                "equity_growth": -0.25,
                "equity_tech": -0.22,
                "equity_value": -0.12,
                "equity_dividend": -0.10,
                "equity_intl": -0.16,
                "bond": -0.10,
                "bond_gov": -0.12,
                "bond_corp": -0.15,
                "bond_ig": -0.12,
                "bond_hy": -0.18,
                "bond_tips": 0.02,  # TIPS benefit
                "crypto": -0.25,
                "commodity": 0.15,  # Commodities benefit
                "real_estate": -0.08,
            },
            probability=0.05,
        ),
    }
    
    if scenario not in scenarios:
        raise ValueError(f"Unknown scenario: {scenario}")
    
    return scenarios[scenario]


# ============================================================
# STRESS TRANSFORMATIONS
# ============================================================

def stress_covariance_matrix(
    cov: np.ndarray,
    params: ScenarioParameters,
) -> np.ndarray:
    """
    Apply stress scenario to covariance matrix.
    
    v1.1.1: Fixed correlation stress to push toward +1 (crisis-like behavior).
    In crises, correlations typically converge toward +1 as diversification breaks down.
    
    Args:
        cov: Original covariance matrix (n x n)
        params: Scenario parameters
    
    Returns:
        Stressed covariance matrix
    """
    n = cov.shape[0]
    
    # Extract volatilities and correlation matrix
    vols = np.sqrt(np.diag(cov))
    
    # Avoid division by zero
    vols_safe = np.where(vols > 0, vols, 1e-10)
    
    # Correlation matrix
    D_inv = np.diag(1.0 / vols_safe)
    corr = D_inv @ cov @ D_inv
    
    # Clip correlation to [-1, 1] (numerical stability)
    np.clip(corr, -1, 1, out=corr)
    np.fill_diagonal(corr, 1.0)
    
    # Apply correlation stress: push correlations toward +1 (crisis-like)
    # v1.1.1 FIX: In crises, all correlations tend toward +1, not toward their magnitude
    # Example: corr=-0.3 with delta=0.5 -> 0.35 (hedge becomes less effective)
    if params.correlation_delta != 0:
        stressed_corr = corr + params.correlation_delta * (1.0 - corr)
        np.clip(stressed_corr, -1, 1, out=stressed_corr)
        np.fill_diagonal(stressed_corr, 1.0)
    else:
        stressed_corr = corr
    
    # Apply volatility stress
    stressed_vols = vols * params.volatility_multiplier
    
    # Rebuild covariance matrix
    D_stressed = np.diag(stressed_vols)
    stressed_cov = D_stressed @ stressed_corr @ D_stressed
    
    # Ensure PSD (eigenvalue clipping)
    eigenvalues, eigenvectors = np.linalg.eigh(stressed_cov)
    eigenvalues = np.maximum(eigenvalues, 1e-10)
    stressed_cov = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T
    
    # Symmetry
    stressed_cov = (stressed_cov + stressed_cov.T) / 2
    
    return stressed_cov


def stress_returns(
    returns: np.ndarray,
    params: ScenarioParameters,
    sectors: Optional[List[str]] = None,
    asset_classes: Optional[List[str]] = None,
    asset_names: Optional[List[str]] = None,
) -> np.ndarray:
    """
    Apply stress scenario to expected returns.
    
    v1.1.1: Fixed shock cumulation bug - shocks now substitute instead of adding.
    v1.1.0: Enhanced with asset class normalization and ETF type detection.
    
    Logic:
    - If asset_class_shock exists for asset → use it (NOT return_shock)
    - If sector_shock exists → add it as adjustment (max 50% of base shock)
    - Otherwise → use return_shock
    
    Args:
        returns: Expected returns array (n,)
        params: Scenario parameters
        sectors: Optional sector labels for each asset
        asset_classes: Optional asset class labels
        asset_names: Optional asset names (for ETF type detection)
    
    Returns:
        Stressed returns array
    """
    stressed = returns.copy()
    n = len(returns)
    
    for i in range(n):
        base_shock = params.return_shock  # Default shock
        
        # v1.1.1: Asset class shock REPLACES return_shock (not adds)
        if asset_classes is not None and i < len(asset_classes) and params.asset_class_shocks:
            ac = asset_classes[i]
            if ac is not None:
                norm_ac = normalize_asset_class(ac)
                
                # Detect ETF type if available
                if norm_ac == "equity" and asset_names and i < len(asset_names):
                    detected_type = detect_etf_type(asset_names[i])
                    if detected_type in params.asset_class_shocks:
                        norm_ac = detected_type
                
                # Use asset class shock if available
                if norm_ac in params.asset_class_shocks:
                    base_shock = params.asset_class_shocks[norm_ac]
                elif norm_ac.startswith("equity") and "equity" in params.asset_class_shocks:
                    base_shock = params.asset_class_shocks["equity"]
                elif norm_ac.startswith("bond") and "bond" in params.asset_class_shocks:
                    base_shock = params.asset_class_shocks["bond"]
        
        # v1.1.1: Sector shock is an ADJUSTMENT (capped at 50% of base_shock magnitude)
        sector_adjustment = 0.0
        if sectors is not None and i < len(sectors) and params.sector_shocks:
            sector = sectors[i]
            if sector is not None:
                norm_sector = normalize_sector(sector)
                if norm_sector in params.sector_shocks:
                    raw_sector_shock = params.sector_shocks[norm_sector]
                    # Cap sector adjustment to avoid double-counting
                    max_adjustment = abs(base_shock) * 0.5
                    sector_adjustment = max(-max_adjustment, min(max_adjustment, raw_sector_shock))
        
        # Apply total shock
        stressed[i] += base_shock + sector_adjustment
    
    return stressed


def stress_weights(
    weights: np.ndarray,
    params: ScenarioParameters,
    liquidity_scores: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, float]:
    """
    Adjust weights based on liquidity stress.
    
    In a liquidity crisis, less liquid assets may need to be reduced.
    
    Args:
        weights: Current weights
        params: Scenario parameters
        liquidity_scores: Liquidity score per asset (0-1, 1=most liquid)
    
    Returns:
        (adjusted_weights, turnover_estimate)
    """
    if params.liquidity_impact <= 1.0 or liquidity_scores is None:
        return weights.copy(), 0.0
    
    # Reduce weights on illiquid assets
    liquidity_factor = 1.0 / params.liquidity_impact
    
    # Assets with low liquidity scores get reduced more
    adjustment = 1 - (1 - liquidity_factor) * (1 - liquidity_scores)
    adjusted = weights * adjustment
    
    # Renormalize
    if adjusted.sum() > 0:
        adjusted = adjusted / adjusted.sum()
    
    turnover = np.sum(np.abs(adjusted - weights)) / 2
    
    return adjusted, turnover


# ============================================================
# PORTFOLIO IMPACT ANALYSIS
# ============================================================

@dataclass
class StressTestResult:
    """
    Results of a stress test on a portfolio.
    
    Attributes:
        scenario: The stress scenario applied
        params: Parameters used
        base_metrics: Metrics before stress
        stressed_metrics: Metrics after stress
        impact: Delta between base and stressed
        var_impact: Change in VaR
        expected_loss: Expected loss under scenario
        warnings: Any warnings generated
    """
    scenario: str
    params: ScenarioParameters
    base_metrics: Dict[str, float]
    stressed_metrics: Dict[str, float]
    impact: Dict[str, float]
    var_impact: float
    expected_loss: float
    vol_after: float = 0.0  # v1.1.0: Volatility after stress
    warnings: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "scenario": self.scenario,
            "parameters": {
                "correlation_delta": self.params.correlation_delta,
                "volatility_multiplier": self.params.volatility_multiplier,
                "return_shock": self.params.return_shock,
                "liquidity_impact": self.params.liquidity_impact,
                "probability": self.params.probability,
            },
            "base_metrics": self.base_metrics,
            "stressed_metrics": self.stressed_metrics,
            "impact": self.impact,
            "var_impact_pct": self.var_impact * 100,
            "expected_loss_pct": self.expected_loss * 100,
            "vol_after_pct": self.vol_after * 100,  # v1.1.0
            "warnings": self.warnings,
            "timestamp": self.timestamp.isoformat(),
        }


def calculate_portfolio_metrics(
    weights: np.ndarray,
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    risk_free_rate: float = 0.02,
) -> Dict[str, float]:
    """
    Calculate key portfolio metrics.
    
    Args:
        weights: Portfolio weights
        expected_returns: Expected returns per asset
        cov_matrix: Covariance matrix
        risk_free_rate: Risk-free rate for Sharpe calculation
    
    Returns:
        Dict of metrics
    """
    # Portfolio return
    port_return = np.dot(weights, expected_returns)
    
    # Portfolio volatility
    port_var = weights @ cov_matrix @ weights
    port_vol = np.sqrt(max(port_var, 0))
    
    # Sharpe ratio
    sharpe = (port_return - risk_free_rate) / port_vol if port_vol > 0 else 0
    
    # VaR (95% parametric)
    var_95 = port_return - 1.645 * port_vol
    
    # VaR (99% parametric)
    var_99 = port_return - 2.326 * port_vol
    
    # Expected Shortfall (CVaR 95%)
    # Approximation for normal: ES ≈ μ - σ * φ(Φ⁻¹(α)) / α
    es_95 = port_return - port_vol * 2.063  # Approx for 95%
    
    # Diversification ratio
    weighted_vols = np.sqrt(np.diag(cov_matrix)) @ weights
    div_ratio = weighted_vols / port_vol if port_vol > 0 else 1
    
    return {
        "expected_return": float(port_return),
        "volatility": float(port_vol),
        "sharpe_ratio": float(sharpe),
        "var_95": float(var_95),
        "var_99": float(var_99),
        "cvar_95": float(es_95),
        "diversification_ratio": float(div_ratio),
    }


def run_stress_test(
    weights: np.ndarray,
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    scenario: StressScenario,
    sectors: Optional[List[str]] = None,
    asset_classes: Optional[List[str]] = None,
    asset_names: Optional[List[str]] = None,
    custom_params: Optional[ScenarioParameters] = None,
) -> StressTestResult:
    """
    Run a single stress test on a portfolio.
    
    v1.1.0: Added asset_names parameter for ETF type detection.
    
    Args:
        weights: Portfolio weights
        expected_returns: Expected returns per asset
        cov_matrix: Covariance matrix
        scenario: Stress scenario to apply
        sectors: Optional sector labels
        asset_classes: Optional asset class labels
        asset_names: Optional asset names (for ETF type detection)
        custom_params: Custom parameters (for CUSTOM scenario)
    
    Returns:
        StressTestResult with full analysis
    """
    # Get scenario parameters
    if scenario == StressScenario.CUSTOM:
        if custom_params is None:
            raise ValueError("custom_params required for CUSTOM scenario")
        params = custom_params
    else:
        params = get_scenario_parameters(scenario)
    
    # Validate parameters
    issues = params.validate()
    warnings_list = [f"Parameter issue: {issue}" for issue in issues]
    
    # Calculate base metrics
    base_metrics = calculate_portfolio_metrics(weights, expected_returns, cov_matrix)
    
    # Apply stress to covariance
    stressed_cov = stress_covariance_matrix(cov_matrix, params)
    
    # Apply stress to returns
    stressed_returns = stress_returns(
        expected_returns, params, sectors, asset_classes, asset_names
    )
    
    # Calculate stressed metrics
    stressed_metrics = calculate_portfolio_metrics(weights, stressed_returns, stressed_cov)
    
    # Calculate impact
    impact = {
        key: stressed_metrics[key] - base_metrics[key]
        for key in base_metrics
    }
    
    # VaR impact
    var_impact = stressed_metrics["var_95"] - base_metrics["var_95"]
    
    # v1.1.1: Calculate expected loss - consistent with stress_returns() logic
    # Asset class shock REPLACES return_shock, sector shock is capped adjustment
    expected_loss = 0.0
    n_assets = len(weights)
    
    for i in range(n_assets):
        base_shock = params.return_shock  # Default
        
        # Get asset class shock if available
        if asset_classes is not None and i < len(asset_classes) and params.asset_class_shocks:
            ac = asset_classes[i]
            if ac is not None:
                norm_ac = normalize_asset_class(ac)
                
                # Detect ETF type if available
                if norm_ac == "equity" and asset_names and i < len(asset_names):
                    detected_type = detect_etf_type(asset_names[i])
                    if detected_type in params.asset_class_shocks:
                        norm_ac = detected_type
                
                # Use asset class shock if available
                if norm_ac in params.asset_class_shocks:
                    base_shock = params.asset_class_shocks[norm_ac]
                elif norm_ac.startswith("equity") and "equity" in params.asset_class_shocks:
                    base_shock = params.asset_class_shocks["equity"]
                elif norm_ac.startswith("bond") and "bond" in params.asset_class_shocks:
                    base_shock = params.asset_class_shocks["bond"]
        
        # Sector adjustment (capped at 50% of base shock)
        sector_adjustment = 0.0
        if sectors is not None and i < len(sectors) and params.sector_shocks:
            sector = sectors[i]
            if sector is not None:
                norm_sector = normalize_sector(sector)
                if norm_sector in params.sector_shocks:
                    raw_sector_shock = params.sector_shocks[norm_sector]
                    max_adjustment = abs(base_shock) * 0.5
                    sector_adjustment = max(-max_adjustment, min(max_adjustment, raw_sector_shock))
        
        expected_loss += weights[i] * (base_shock + sector_adjustment)
    
    # Add warnings for severe impacts
    if impact["volatility"] > 0.10:
        warnings_list.append(f"Severe volatility increase: +{impact['volatility']:.1%}")
    
    if var_impact < -0.15:
        warnings_list.append(f"Severe VaR deterioration: {var_impact:.1%}")
    
    if impact["sharpe_ratio"] < -0.5:
        warnings_list.append(f"Sharpe ratio collapse: {impact['sharpe_ratio']:.2f}")
    
    result = StressTestResult(
        scenario=params.name,
        params=params,
        base_metrics=base_metrics,
        stressed_metrics=stressed_metrics,
        impact=impact,
        var_impact=var_impact,
        expected_loss=expected_loss,
        vol_after=stressed_metrics["volatility"],  # v1.1.0
        warnings=warnings_list,
    )
    
    log_event(logger, "stress_test_completed",
        message=f"Stress test completed: {params.name}",
        scenario=params.name,
        var_impact_pct=var_impact * 100,
        expected_loss_pct=expected_loss * 100,
        n_warnings=len(warnings_list),
    )
    
    return result


# ============================================================
# STRESS TEST PACK (Multiple scenarios)
# ============================================================

@dataclass
class StressTestPack:
    """
    Collection of stress test results.
    
    Attributes:
        results: List of individual stress test results
        summary: Aggregated summary statistics
        worst_case: The scenario with worst impact
        risk_budget_impact: How stress affects risk budget
    """
    results: List[StressTestResult]
    summary: Dict[str, Any]
    worst_case: Optional[StressTestResult]
    risk_budget_impact: Dict[str, float]
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "stress_test_pack": {
                "version": VERSION,
                "n_scenarios": len(self.results),
                "timestamp": self.timestamp.isoformat(),
            },
            "summary": self.summary,
            "worst_case": {
                "scenario": self.worst_case.scenario if self.worst_case else None,
                "expected_loss_pct": self.worst_case.expected_loss * 100 if self.worst_case else 0,
                "vol_after_pct": self.worst_case.vol_after * 100 if self.worst_case else 0,
            },
            "risk_budget_impact": self.risk_budget_impact,
            "scenarios": [r.to_dict() for r in self.results],
        }


def run_stress_test_pack(
    weights: np.ndarray,
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    scenarios: Optional[List[StressScenario]] = None,
    sectors: Optional[List[str]] = None,
    asset_classes: Optional[List[str]] = None,
    asset_names: Optional[List[str]] = None,
) -> StressTestPack:
    """
    Run a pack of stress tests.
    
    v1.1.0: Added asset_names parameter for ETF type detection.
    
    Args:
        weights: Portfolio weights
        expected_returns: Expected returns per asset
        cov_matrix: Covariance matrix
        scenarios: List of scenarios to run (default: all standard)
        sectors: Optional sector labels
        asset_classes: Optional asset class labels
        asset_names: Optional asset names (for ETF type detection)
    
    Returns:
        StressTestPack with all results
    """
    if scenarios is None:
        scenarios = [
            StressScenario.CORRELATION_SPIKE,
            StressScenario.VOLATILITY_SHOCK,
            StressScenario.LIQUIDITY_CRISIS,
            StressScenario.RATE_SHOCK,
            StressScenario.MARKET_CRASH,
        ]
    
    results = []
    for scenario in scenarios:
        try:
            result = run_stress_test(
                weights=weights,
                expected_returns=expected_returns,
                cov_matrix=cov_matrix,
                scenario=scenario,
                sectors=sectors,
                asset_classes=asset_classes,
                asset_names=asset_names,
            )
            results.append(result)
        except Exception as e:
            log_event(logger, "stress_test_failed",
                message=f"Stress test failed: {scenario.value}",
                level="ERROR",
                scenario=scenario.value,
                error=str(e),
            )
    
    # Find worst case
    worst_case = None
    if results:
        worst_case = min(results, key=lambda r: r.expected_loss)
    
    # Calculate summary
    summary = {
        "n_scenarios": len(results),
        "avg_var_impact": np.mean([r.var_impact for r in results]) if results else 0,
        "max_var_impact": min([r.var_impact for r in results]) if results else 0,
        "avg_expected_loss": np.mean([r.expected_loss for r in results]) if results else 0,
        "worst_expected_loss": min([r.expected_loss for r in results]) if results else 0,
        "total_warnings": sum(len(r.warnings) for r in results),
    }
    
    # Risk budget impact
    base_vol = results[0].base_metrics["volatility"] if results else 0
    risk_budget_impact = {
        "base_volatility": base_vol,
        "avg_stressed_volatility": np.mean([r.stressed_metrics["volatility"] for r in results]) if results else 0,
        "max_stressed_volatility": max([r.stressed_metrics["volatility"] for r in results]) if results else 0,
        "vol_budget_breach_scenarios": sum(
            1 for r in results 
            if r.stressed_metrics["volatility"] > base_vol * 2
        ),
    }
    
    pack = StressTestPack(
        results=results,
        summary=summary,
        worst_case=worst_case,
        risk_budget_impact=risk_budget_impact,
    )
    
    log_event(logger, "stress_pack_completed",
        message=f"Stress test pack completed: {len(results)} scenarios",
        n_scenarios=len(results),
        worst_case=worst_case.scenario if worst_case else None,
        worst_loss_pct=summary["worst_expected_loss"] * 100,
    )
    
    return pack


# ============================================================
# HISTORICAL SCENARIO REPLAY
# ============================================================

def replay_historical_event(
    weights: np.ndarray,
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    event_name: str,
) -> StressTestResult:
    """
    Replay a historical crisis event.
    
    Args:
        weights: Portfolio weights
        expected_returns: Expected returns
        cov_matrix: Covariance matrix
        event_name: Key from HISTORICAL_EVENTS
    
    Returns:
        StressTestResult calibrated to historical event
    """
    if event_name not in HISTORICAL_EVENTS:
        raise ValueError(f"Unknown event: {event_name}. Available: {list(HISTORICAL_EVENTS.keys())}")
    
    event = HISTORICAL_EVENTS[event_name]
    
    # Create parameters from historical data
    params = ScenarioParameters(
        name=event_name,
        description=event["description"],
        correlation_delta=event.get("correlation_increase", 0.30),
        volatility_multiplier=event.get("vol_multiplier", 2.0),
        return_shock=event.get("equity_drawdown", -0.20),
        duration_days=event.get("duration_months", 3) * 21,
        probability=0.02,  # Historical events are rare
    )
    
    return run_stress_test(
        weights=weights,
        expected_returns=expected_returns,
        cov_matrix=cov_matrix,
        scenario=StressScenario.CUSTOM,
        custom_params=params,
    )


# ============================================================
# REVERSE STRESS TESTING
# ============================================================

def reverse_stress_test(
    weights: np.ndarray,
    cov_matrix: np.ndarray,
    max_loss: float = -0.20,
    confidence: float = 0.95,
) -> Dict[str, Any]:
    """
    Find scenarios that would cause a specified loss.
    
    Reverse stress testing answers: "What would have to happen
    for us to lose X%?"
    
    Args:
        weights: Portfolio weights
        cov_matrix: Covariance matrix
        max_loss: Target loss threshold (e.g., -0.20 for -20%)
        confidence: Confidence level for VaR calculation
    
    Returns:
        Dict describing scenario parameters that cause the loss
    """
    from scipy.stats import norm
    
    port_vol = np.sqrt(weights @ cov_matrix @ weights)
    z_score = norm.ppf(1 - confidence)
    
    # What volatility multiplier would cause max_loss at given confidence?
    # max_loss = -z * vol * multiplier
    # multiplier = -max_loss / (z * vol)
    
    if port_vol > 0:
        vol_multiplier_needed = -max_loss / (-z_score * port_vol)
    else:
        vol_multiplier_needed = float('inf')
    
    # What correlation increase would cause max_loss?
    # Higher correlation reduces diversification, increasing effective vol
    # Rough approximation: corr_increase ≈ (multiplier - 1) * 0.3
    corr_increase_needed = max(0, (vol_multiplier_needed - 1) * 0.3)
    
    return {
        "target_loss": max_loss,
        "confidence_level": confidence,
        "current_vol": float(port_vol),
        "scenario_to_cause_loss": {
            "vol_multiplier_needed": float(min(vol_multiplier_needed, 10)),
            "correlation_increase_needed": float(min(corr_increase_needed, 0.5)),
            "interpretation": (
                f"A {vol_multiplier_needed:.1f}x volatility increase or "
                f"+{corr_increase_needed:.0%} correlation shift would cause "
                f"{max_loss:.0%} loss at {confidence:.0%} confidence"
            ),
        },
        "historical_comparison": {
            "2008_crisis_vol_mult": 4.0,
            "2020_covid_vol_mult": 5.0,
            "likelihood": "high" if vol_multiplier_needed < 2 else (
                "medium" if vol_multiplier_needed < 4 else "low"
            ),
        },
    }


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

def quick_stress_check(
    weights: np.ndarray,
    cov_matrix: np.ndarray,
    expected_returns: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Quick stress check with default scenarios.
    
    Args:
        weights: Portfolio weights
        cov_matrix: Covariance matrix
        expected_returns: Optional expected returns (defaults to zeros)
    
    Returns:
        Summary dict with key stress metrics
    """
    n = len(weights)
    
    if expected_returns is None:
        expected_returns = np.zeros(n)
    
    # Run core scenarios
    pack = run_stress_test_pack(
        weights=weights,
        expected_returns=expected_returns,
        cov_matrix=cov_matrix,
        scenarios=[
            StressScenario.CORRELATION_SPIKE,
            StressScenario.VOLATILITY_SHOCK,
            StressScenario.MARKET_CRASH,
        ],
    )
    
    return {
        "quick_stress_summary": {
            "n_scenarios": len(pack.results),
            "worst_case": pack.worst_case.scenario if pack.worst_case else None,
            "max_loss_pct": pack.summary["worst_expected_loss"] * 100,
            "max_vol_increase": pack.risk_budget_impact["max_stressed_volatility"] - pack.risk_budget_impact["base_volatility"],
            "warnings": pack.summary["total_warnings"],
        }
    }


def get_manifest_entry(pack: StressTestPack) -> Dict[str, Any]:
    """
    Get stress test pack entry for output manifest.
    
    Args:
        pack: StressTestPack results
    
    Returns:
        Dict for inclusion in _manifest
    """
    return {
        "stress_tests": {
            "version": VERSION,
            "n_scenarios": len(pack.results),
            "timestamp": pack.timestamp.isoformat(),
            "summary": {
                "worst_case_scenario": pack.worst_case.scenario if pack.worst_case else None,
                "worst_expected_loss_pct": pack.summary["worst_expected_loss"] * 100,
                "avg_var_impact_pct": pack.summary["avg_var_impact"] * 100,
                "total_warnings": pack.summary["total_warnings"],
            },
            "risk_budget": pack.risk_budget_impact,
            "status": "fail" if pack.summary["total_warnings"] > 5 else "pass",
        }
    }


# ============================================================
# MODULE EXPORTS
# ============================================================

__all__ = [
    # Version
    "VERSION",
    
    # Enums
    "StressScenario",
    
    # Data classes
    "ScenarioParameters",
    "StressTestResult",
    "StressTestPack",
    
    # Core functions
    "get_scenario_parameters",
    "run_stress_test",
    "run_stress_test_pack",
    
    # Transformations
    "stress_covariance_matrix",
    "stress_returns",
    "stress_weights",
    
    # Utilities
    "calculate_portfolio_metrics",
    "quick_stress_check",
    "replay_historical_event",
    "reverse_stress_test",
    "get_manifest_entry",
    
    # v1.1.0: Mapping functions
    "normalize_asset_class",
    "normalize_sector",
    "detect_etf_type",
    
    # Constants
    "HISTORICAL_EVENTS",
    "ASSET_CLASS_MAPPING",
    "SECTOR_MAPPING",
]
