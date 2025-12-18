# portfolio_engine/quality_gates.py
"""
Quality Gates Monitor for Portfolio Engine.

V1.0 - 2025-12-18 (P2-11)

Quality gates are run-time checks that validate output quality.
NOT true SLOs (no time-series aggregation / burn-rate).

Features:
- Configurable thresholds (warning/critical)
- Rate limiting to avoid alert fatigue
- Integration with structured logging
- Manifest entry generation

Design notes (from ChatGPT review):
- Renamed from "SLOMonitor" to "QualityGateMonitor" (more accurate)
- Removed unused `window_hours` field
- Added rate limiting / grouping for alerts
- Support for warning AND critical levels per gate
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple
from enum import Enum
import hashlib
import json

# Try to import structured logging
try:
    from portfolio_engine.structured_logging import (
        get_structured_logger,
        log_event,
        Events,
    )
    HAS_STRUCTURED_LOGGING = True
except ImportError:
    HAS_STRUCTURED_LOGGING = False
    def get_structured_logger(name):
        return logging.getLogger(name)
    def log_event(logger, event, **kwargs):
        logger.info(f"{event}: {kwargs}")

logger = get_structured_logger("portfolio_engine.quality_gates")


# ============================================================
# ENUMS & DATA CLASSES
# ============================================================

class Severity(Enum):
    """Severity levels for quality gate violations."""
    WARNING = "warning"
    CRITICAL = "critical"


class Operator(Enum):
    """Comparison operators for thresholds."""
    LT = "lt"          # value < threshold (e.g., condition_number < 10000)
    GT = "gt"          # value > threshold (e.g., coverage > 95%)
    LTE = "lte"        # value <= threshold
    GTE = "gte"        # value >= threshold
    EQ = "eq"          # value == threshold
    BETWEEN = "between"  # min <= value <= max


@dataclass
class QualityGate:
    """
    Definition of a quality gate.
    
    A gate has two thresholds:
    - warning_threshold: soft limit, triggers warning
    - critical_threshold: hard limit, triggers critical alert
    
    Example:
        QualityGate(
            name="coverage",
            metric="weight_coverage_pct",
            operator=Operator.GT,
            warning_threshold=95.0,
            critical_threshold=90.0,
            description="Portfolio weight coverage"
        )
    """
    name: str
    metric: str
    operator: Operator
    warning_threshold: float
    critical_threshold: Optional[float] = None
    description: str = ""
    unit: str = ""
    
    def check(self, value: float) -> Tuple[bool, Optional[Severity]]:
        """
        Check if value passes the gate.
        
        Returns:
            (passed, severity) - passed=True if OK, severity=None if passed
        """
        # Check critical first (if defined)
        if self.critical_threshold is not None:
            if self._violates(value, self.critical_threshold):
                return False, Severity.CRITICAL
        
        # Check warning
        if self._violates(value, self.warning_threshold):
            return False, Severity.WARNING
        
        return True, None
    
    def _violates(self, value: float, threshold: float) -> bool:
        """Returns True if value violates the threshold."""
        if self.operator == Operator.LT:
            return value >= threshold  # Violated if NOT less than
        elif self.operator == Operator.GT:
            return value <= threshold  # Violated if NOT greater than
        elif self.operator == Operator.LTE:
            return value > threshold
        elif self.operator == Operator.GTE:
            return value < threshold
        elif self.operator == Operator.EQ:
            return value != threshold
        return False


@dataclass
class Violation:
    """Record of a quality gate violation."""
    gate: QualityGate
    actual_value: float
    severity: Severity
    timestamp: datetime
    context: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "gate_name": self.gate.name,
            "metric": self.gate.metric,
            "severity": self.severity.value,
            "actual_value": self.actual_value,
            "warning_threshold": self.gate.warning_threshold,
            "critical_threshold": self.gate.critical_threshold,
            "operator": self.gate.operator.value,
            "description": self.gate.description,
            "timestamp": self.timestamp.isoformat(),
            "context": self.context,
        }


# ============================================================
# DEFAULT QUALITY GATES
# ============================================================

DEFAULT_GATES: List[QualityGate] = [
    # Data freshness (max age in hours)
    QualityGate(
        name="data_freshness",
        metric="max_price_age_hours",
        operator=Operator.LT,
        warning_threshold=24,
        critical_threshold=48,
        description="Maximum age of price data",
        unit="hours"
    ),
    
    # Portfolio coverage
    QualityGate(
        name="portfolio_coverage",
        metric="weight_coverage_pct",
        operator=Operator.GT,
        warning_threshold=95.0,
        critical_threshold=90.0,
        description="Percentage of portfolio weights with price data",
        unit="%"
    ),
    
    # Fallback rate
    QualityGate(
        name="fallback_rate",
        metric="fallback_pct",
        operator=Operator.LT,
        warning_threshold=10.0,
        critical_threshold=25.0,
        description="Percentage of assets using fallback/heuristic",
        unit="%"
    ),
    
    # Covariance condition number
    QualityGate(
        name="covariance_condition",
        metric="condition_number",
        operator=Operator.LT,
        warning_threshold=10000,
        critical_threshold=100000,
        description="Condition number of covariance matrix",
        unit=""
    ),
    
    # Execution time
    QualityGate(
        name="execution_time",
        metric="execution_time_seconds",
        operator=Operator.LT,
        warning_threshold=60,
        critical_threshold=120,
        description="Total execution time",
        unit="seconds"
    ),
    
    # Asset count
    QualityGate(
        name="asset_count",
        metric="n_assets",
        operator=Operator.GT,
        warning_threshold=5,
        critical_threshold=3,
        description="Number of assets in portfolio",
        unit=""
    ),
    
    # Weights sum (should be ~100%)
    QualityGate(
        name="weights_sum",
        metric="weights_sum_pct",
        operator=Operator.BETWEEN,
        warning_threshold=99.0,  # Min for warning (also need max check)
        critical_threshold=98.0,  # Min for critical
        description="Sum of portfolio weights",
        unit="%"
    ),
]


# ============================================================
# QUALITY GATE MONITOR
# ============================================================

class QualityGateMonitor:
    """
    Monitor that checks quality gates and manages violations.
    
    Features:
    - Configurable gates with warning/critical thresholds
    - Rate limiting to avoid alert fatigue
    - History tracking for debugging
    - Integration with structured logging
    
    Example:
        monitor = QualityGateMonitor()
        
        metrics = {
            "weight_coverage_pct": 92.5,
            "condition_number": 8102,
            "execution_time_seconds": 45,
        }
        
        violations = monitor.check(metrics, context={"profile": "Agressif"})
        
        if violations:
            monitor.emit_alerts(violations)
    """
    
    def __init__(
        self,
        gates: Optional[List[QualityGate]] = None,
        rate_limit_seconds: int = 300,  # 5 minutes between same alerts
        max_history: int = 100,
    ):
        """
        Initialize the monitor.
        
        Args:
            gates: List of quality gates to check (default: DEFAULT_GATES)
            rate_limit_seconds: Minimum seconds between same alert type
            max_history: Maximum violations to keep in history
        """
        self.gates = gates or DEFAULT_GATES.copy()
        self.rate_limit_seconds = rate_limit_seconds
        self.max_history = max_history
        
        # History and rate limiting
        self.violations_history: List[Violation] = []
        self._last_alert_time: Dict[str, datetime] = {}
    
    def add_gate(self, gate: QualityGate) -> None:
        """Add a custom quality gate."""
        self.gates.append(gate)
    
    def remove_gate(self, name: str) -> bool:
        """Remove a gate by name. Returns True if found and removed."""
        for i, gate in enumerate(self.gates):
            if gate.name == name:
                self.gates.pop(i)
                return True
        return False
    
    def check(
        self,
        metrics: Dict[str, float],
        context: Optional[Dict[str, Any]] = None
    ) -> List[Violation]:
        """
        Check all gates against provided metrics.
        
        Args:
            metrics: Dict of metric_name -> value
            context: Optional context (profile, run_id, etc.)
        
        Returns:
            List of violations (empty if all pass)
        """
        violations = []
        now = datetime.now(timezone.utc)
        
        for gate in self.gates:
            if gate.metric not in metrics:
                continue
            
            value = metrics[gate.metric]
            passed, severity = gate.check(value)
            
            if not passed and severity is not None:
                violation = Violation(
                    gate=gate,
                    actual_value=value,
                    severity=severity,
                    timestamp=now,
                    context=context or {},
                )
                violations.append(violation)
                
                # Add to history (with size limit)
                self.violations_history.append(violation)
                if len(self.violations_history) > self.max_history:
                    self.violations_history = self.violations_history[-self.max_history:]
        
        return violations
    
    def check_all_passed(self, metrics: Dict[str, float]) -> bool:
        """Quick check if all gates pass. Returns True if no violations."""
        return len(self.check(metrics)) == 0
    
    def emit_alerts(
        self,
        violations: List[Violation],
        alert_fn: Optional[Callable[[Dict], None]] = None,
        respect_rate_limit: bool = True,
    ) -> List[Dict]:
        """
        Emit alerts for violations.
        
        Args:
            violations: List of violations to alert on
            alert_fn: Optional custom alert function
            respect_rate_limit: If True, skip recently alerted gates
        
        Returns:
            List of alert dicts that were emitted
        """
        now = datetime.now(timezone.utc)
        emitted = []
        
        for violation in violations:
            gate_key = f"{violation.gate.name}:{violation.severity.value}"
            
            # Rate limiting
            if respect_rate_limit and gate_key in self._last_alert_time:
                last_time = self._last_alert_time[gate_key]
                if (now - last_time).total_seconds() < self.rate_limit_seconds:
                    continue
            
            # Build alert
            alert = {
                "type": "quality_gate_violation",
                "gate_name": violation.gate.name,
                "severity": violation.severity.value,
                "metric": violation.gate.metric,
                "actual_value": violation.actual_value,
                "warning_threshold": violation.gate.warning_threshold,
                "critical_threshold": violation.gate.critical_threshold,
                "description": violation.gate.description,
                "timestamp": violation.timestamp.isoformat(),
                "context": violation.context,
            }
            
            # Emit via custom function or logging
            if alert_fn:
                alert_fn(alert)
            else:
                self._log_alert(violation, alert)
            
            # Update rate limit tracker
            self._last_alert_time[gate_key] = now
            emitted.append(alert)
        
        return emitted
    
    def _log_alert(self, violation: Violation, alert: Dict) -> None:
        """Log alert using structured logging."""
        event = (Events.QUALITY_GATE_FAILED 
                 if HAS_STRUCTURED_LOGGING 
                 else "quality_gate_failed")
        
        if violation.severity == Severity.CRITICAL:
            log_event(logger, event,
                message=f"CRITICAL: {violation.gate.name} failed",
                level="ERROR",
                **alert
            )
        else:
            log_event(logger, event,
                message=f"WARNING: {violation.gate.name} failed",
                level="WARNING",
                **alert
            )
    
    def get_report(self) -> Dict[str, Any]:
        """
        Generate quality gates status report.
        
        Returns:
            Dict with gate status, recent violations, etc.
        """
        now = datetime.now(timezone.utc)
        recent_cutoff = now - timedelta(hours=24)
        
        recent_violations = [
            v for v in self.violations_history
            if v.timestamp > recent_cutoff
        ]
        
        critical_count = sum(
            1 for v in recent_violations 
            if v.severity == Severity.CRITICAL
        )
        warning_count = sum(
            1 for v in recent_violations 
            if v.severity == Severity.WARNING
        )
        
        return {
            "quality_gates_version": "1.0",
            "n_gates": len(self.gates),
            "gates": [g.name for g in self.gates],
            "violations_24h": len(recent_violations),
            "critical_24h": critical_count,
            "warning_24h": warning_count,
            "last_violations": [
                v.to_dict() for v in recent_violations[-5:]
            ],
            "status": "critical" if critical_count > 0 else (
                "warning" if warning_count > 0 else "healthy"
            ),
        }
    
    def get_manifest_entry(
        self,
        violations: List[Violation],
        metrics: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Get entry for output manifest.
        
        Args:
            violations: Violations from this run
            metrics: Metrics that were checked
        
        Returns:
            Dict for inclusion in _manifest
        """
        return {
            "quality_gates": {
                "version": "1.0",
                "n_checks": len(self.gates),
                "n_violations": len(violations),
                "status": "fail" if violations else "pass",
                "violations": [v.to_dict() for v in violations],
                "metrics_checked": metrics,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        }


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

def check_quality_gates(
    metrics: Dict[str, float],
    context: Optional[Dict] = None,
    gates: Optional[List[QualityGate]] = None,
    emit_alerts: bool = True,
) -> Tuple[bool, List[Violation], Dict]:
    """
    Convenience function to check quality gates in one call.
    
    Args:
        metrics: Metrics to check
        context: Optional context
        gates: Optional custom gates (default: DEFAULT_GATES)
        emit_alerts: Whether to emit alerts for violations
    
    Returns:
        (all_passed, violations, manifest_entry)
    
    Example:
        passed, violations, manifest = check_quality_gates({
            "weight_coverage_pct": 98.5,
            "condition_number": 8102,
            "execution_time_seconds": 35,
        }, context={"profile": "Agressif"})
        
        if not passed:
            print(f"Quality issues: {len(violations)} violations")
    """
    monitor = QualityGateMonitor(gates=gates)
    violations = monitor.check(metrics, context)
    
    if emit_alerts and violations:
        monitor.emit_alerts(violations)
    
    manifest_entry = monitor.get_manifest_entry(violations, metrics)
    all_passed = len(violations) == 0
    
    return all_passed, violations, manifest_entry


def create_custom_gate(
    name: str,
    metric: str,
    warning: float,
    critical: Optional[float] = None,
    operator: str = "lt",
    description: str = "",
) -> QualityGate:
    """
    Factory function to create custom quality gates.
    
    Args:
        name: Gate name
        metric: Metric to check
        warning: Warning threshold
        critical: Critical threshold (optional)
        operator: Comparison operator ("lt", "gt", "eq", etc.)
        description: Human-readable description
    
    Returns:
        QualityGate instance
    
    Example:
        gate = create_custom_gate(
            name="max_position",
            metric="max_position_weight_pct",
            warning=15.0,
            critical=20.0,
            operator="lt",
            description="Maximum single position weight"
        )
    """
    op = Operator(operator)
    return QualityGate(
        name=name,
        metric=metric,
        operator=op,
        warning_threshold=warning,
        critical_threshold=critical,
        description=description,
    )


# ============================================================
# PROFILE-SPECIFIC GATES
# ============================================================

def get_gates_for_profile(profile: str) -> List[QualityGate]:
    """
    Get quality gates customized for a risk profile.
    
    Different profiles may have different acceptable thresholds.
    
    Args:
        profile: "Agressif", "Modéré", or "Stable"
    
    Returns:
        List of QualityGate customized for profile
    """
    # Start with defaults
    gates = DEFAULT_GATES.copy()
    
    # Profile-specific adjustments
    profile_adjustments = {
        "Agressif": {
            "portfolio_coverage": (90.0, 85.0),  # More tolerance
            "asset_count": (8, 5),
        },
        "Modéré": {
            "portfolio_coverage": (95.0, 90.0),
            "asset_count": (10, 6),
        },
        "Stable": {
            "portfolio_coverage": (98.0, 95.0),  # Stricter
            "asset_count": (12, 8),
            "covariance_condition": (8000, 50000),  # Stricter
        },
    }
    
    adjustments = profile_adjustments.get(profile, {})
    
    for gate in gates:
        if gate.name in adjustments:
            warn, crit = adjustments[gate.name]
            gate.warning_threshold = warn
            gate.critical_threshold = crit
    
    return gates


# ============================================================
# EXAMPLE USAGE
# ============================================================

def _example_usage():
    """Example showing complete usage pattern."""
    
    # 1. Simple check with defaults
    metrics = {
        "weight_coverage_pct": 98.5,
        "condition_number": 8102,
        "execution_time_seconds": 35,
        "n_assets": 18,
        "fallback_pct": 5.0,
    }
    
    passed, violations, manifest = check_quality_gates(
        metrics,
        context={"profile": "Agressif", "run_id": "abc123"}
    )
    
    print(f"All passed: {passed}")
    print(f"Violations: {len(violations)}")
    
    # 2. Custom monitor with profile-specific gates
    monitor = QualityGateMonitor(
        gates=get_gates_for_profile("Stable"),
        rate_limit_seconds=60,
    )
    
    # Add custom gate
    monitor.add_gate(create_custom_gate(
        name="max_position",
        metric="max_position_weight_pct",
        warning=12.0,
        critical=15.0,
        operator="lt",
        description="Maximum single position"
    ))
    
    violations = monitor.check(metrics)
    
    if violations:
        # Emit alerts (respects rate limiting)
        emitted = monitor.emit_alerts(violations)
        print(f"Emitted {len(emitted)} alerts")
    
    # 3. Get report
    report = monitor.get_report()
    print(f"Status: {report['status']}")
