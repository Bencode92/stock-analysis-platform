# tests/test_quality_gates.py
"""
Tests for Quality Gates Monitor module.

P2-11 - 2025-12-18
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from portfolio_engine.quality_gates import (
    # Enums
    Severity,
    Operator,
    # Data classes
    QualityGate,
    Violation,
    # Monitor
    QualityGateMonitor,
    DEFAULT_GATES,
    # Convenience functions
    check_quality_gates,
    create_custom_gate,
    get_gates_for_profile,
)


class TestOperator:
    """Tests for Operator enum."""
    
    def test_all_operators_exist(self):
        """All expected operators are defined."""
        assert Operator.LT.value == "lt"
        assert Operator.GT.value == "gt"
        assert Operator.LTE.value == "lte"
        assert Operator.GTE.value == "gte"
        assert Operator.EQ.value == "eq"
        assert Operator.BETWEEN.value == "between"


class TestSeverity:
    """Tests for Severity enum."""
    
    def test_severity_levels(self):
        """Severity levels are correct."""
        assert Severity.WARNING.value == "warning"
        assert Severity.CRITICAL.value == "critical"


class TestQualityGate:
    """Tests for QualityGate dataclass."""
    
    def test_gate_creation(self):
        """Gate can be created with required fields."""
        gate = QualityGate(
            name="test_gate",
            metric="test_metric",
            operator=Operator.LT,
            warning_threshold=100,
        )
        
        assert gate.name == "test_gate"
        assert gate.metric == "test_metric"
        assert gate.operator == Operator.LT
        assert gate.warning_threshold == 100
        assert gate.critical_threshold is None
    
    def test_gate_with_critical(self):
        """Gate can have critical threshold."""
        gate = QualityGate(
            name="test",
            metric="m",
            operator=Operator.LT,
            warning_threshold=100,
            critical_threshold=200,
        )
        
        assert gate.critical_threshold == 200
    
    # --- LT operator tests ---
    
    def test_lt_pass(self):
        """LT: value < threshold passes."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.LT,
            warning_threshold=100
        )
        passed, severity = gate.check(50)
        assert passed is True
        assert severity is None
    
    def test_lt_warning(self):
        """LT: value >= warning_threshold triggers warning."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.LT,
            warning_threshold=100
        )
        passed, severity = gate.check(100)
        assert passed is False
        assert severity == Severity.WARNING
    
    def test_lt_critical(self):
        """LT: value >= critical_threshold triggers critical."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.LT,
            warning_threshold=100,
            critical_threshold=200
        )
        passed, severity = gate.check(200)
        assert passed is False
        assert severity == Severity.CRITICAL
    
    # --- GT operator tests ---
    
    def test_gt_pass(self):
        """GT: value > threshold passes."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.GT,
            warning_threshold=90
        )
        passed, severity = gate.check(95)
        assert passed is True
        assert severity is None
    
    def test_gt_warning(self):
        """GT: value <= warning_threshold triggers warning."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.GT,
            warning_threshold=90
        )
        passed, severity = gate.check(90)
        assert passed is False
        assert severity == Severity.WARNING
    
    def test_gt_critical(self):
        """GT: value <= critical_threshold triggers critical."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.GT,
            warning_threshold=90,
            critical_threshold=80
        )
        passed, severity = gate.check(75)
        assert passed is False
        assert severity == Severity.CRITICAL
    
    # --- Edge cases ---
    
    def test_boundary_value_lt(self):
        """LT: exactly at threshold fails."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.LT,
            warning_threshold=100
        )
        passed, _ = gate.check(100)
        assert passed is False
    
    def test_boundary_value_gt(self):
        """GT: exactly at threshold fails."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.GT,
            warning_threshold=90
        )
        passed, _ = gate.check(90)
        assert passed is False


class TestViolation:
    """Tests for Violation dataclass."""
    
    def test_violation_creation(self):
        """Violation can be created."""
        gate = QualityGate(
            name="test", metric="m", operator=Operator.LT,
            warning_threshold=100
        )
        now = datetime.now(timezone.utc)
        
        violation = Violation(
            gate=gate,
            actual_value=150,
            severity=Severity.WARNING,
            timestamp=now,
            context={"profile": "Test"}
        )
        
        assert violation.gate == gate
        assert violation.actual_value == 150
        assert violation.severity == Severity.WARNING
        assert violation.context["profile"] == "Test"
    
    def test_violation_to_dict(self):
        """Violation can be serialized to dict."""
        gate = QualityGate(
            name="test_gate", metric="test_metric", operator=Operator.LT,
            warning_threshold=100, critical_threshold=200,
            description="Test description"
        )
        now = datetime.now(timezone.utc)
        
        violation = Violation(
            gate=gate,
            actual_value=150,
            severity=Severity.WARNING,
            timestamp=now,
            context={"key": "value"}
        )
        
        d = violation.to_dict()
        
        assert d["gate_name"] == "test_gate"
        assert d["metric"] == "test_metric"
        assert d["severity"] == "warning"
        assert d["actual_value"] == 150
        assert d["warning_threshold"] == 100
        assert d["critical_threshold"] == 200
        assert d["operator"] == "lt"
        assert d["description"] == "Test description"
        assert d["context"] == {"key": "value"}
        assert "timestamp" in d


class TestQualityGateMonitor:
    """Tests for QualityGateMonitor."""
    
    def test_monitor_creation_default_gates(self):
        """Monitor creates with default gates."""
        monitor = QualityGateMonitor()
        
        assert len(monitor.gates) == len(DEFAULT_GATES)
        assert monitor.rate_limit_seconds == 300
    
    def test_monitor_creation_custom_gates(self):
        """Monitor can use custom gates."""
        custom_gates = [
            QualityGate(name="custom", metric="m", operator=Operator.LT, warning_threshold=50)
        ]
        monitor = QualityGateMonitor(gates=custom_gates)
        
        assert len(monitor.gates) == 1
        assert monitor.gates[0].name == "custom"
    
    def test_add_gate(self):
        """Can add gate to monitor."""
        monitor = QualityGateMonitor(gates=[])
        gate = QualityGate(name="new", metric="m", operator=Operator.LT, warning_threshold=100)
        
        monitor.add_gate(gate)
        
        assert len(monitor.gates) == 1
        assert monitor.gates[0].name == "new"
    
    def test_remove_gate(self):
        """Can remove gate from monitor."""
        gate = QualityGate(name="to_remove", metric="m", operator=Operator.LT, warning_threshold=100)
        monitor = QualityGateMonitor(gates=[gate])
        
        result = monitor.remove_gate("to_remove")
        
        assert result is True
        assert len(monitor.gates) == 0
    
    def test_remove_gate_not_found(self):
        """Removing non-existent gate returns False."""
        monitor = QualityGateMonitor(gates=[])
        result = monitor.remove_gate("nonexistent")
        assert result is False
    
    def test_check_no_violations(self):
        """Check returns empty list when all pass."""
        gates = [
            QualityGate(name="cov", metric="coverage", operator=Operator.GT, warning_threshold=90),
            QualityGate(name="time", metric="time", operator=Operator.LT, warning_threshold=60),
        ]
        monitor = QualityGateMonitor(gates=gates)
        
        violations = monitor.check({"coverage": 95, "time": 30})
        
        assert len(violations) == 0
    
    def test_check_with_violations(self):
        """Check returns violations when gates fail."""
        gates = [
            QualityGate(name="cov", metric="coverage", operator=Operator.GT, warning_threshold=90),
            QualityGate(name="time", metric="time", operator=Operator.LT, warning_threshold=60),
        ]
        monitor = QualityGateMonitor(gates=gates)
        
        violations = monitor.check({"coverage": 85, "time": 30})
        
        assert len(violations) == 1
        assert violations[0].gate.name == "cov"
        assert violations[0].severity == Severity.WARNING
    
    def test_check_with_context(self):
        """Check includes context in violations."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates)
        
        violations = monitor.check(
            {"m": 150},
            context={"profile": "Agressif", "run_id": "abc123"}
        )
        
        assert violations[0].context["profile"] == "Agressif"
        assert violations[0].context["run_id"] == "abc123"
    
    def test_check_skips_missing_metrics(self):
        """Check skips gates for missing metrics."""
        gates = [
            QualityGate(name="g1", metric="present", operator=Operator.LT, warning_threshold=100),
            QualityGate(name="g2", metric="missing", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates)
        
        violations = monitor.check({"present": 150})  # "missing" not in metrics
        
        assert len(violations) == 1
        assert violations[0].gate.name == "g1"
    
    def test_check_all_passed(self):
        """check_all_passed returns True when no violations."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates)
        
        assert monitor.check_all_passed({"m": 50}) is True
        assert monitor.check_all_passed({"m": 150}) is False
    
    def test_violations_history(self):
        """Violations are stored in history."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates)
        
        monitor.check({"m": 150})
        monitor.check({"m": 200})
        
        assert len(monitor.violations_history) == 2
    
    def test_violations_history_limit(self):
        """History respects max_history limit."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates, max_history=3)
        
        for i in range(5):
            monitor.check({"m": 150 + i})
        
        assert len(monitor.violations_history) == 3
    
    def test_emit_alerts_logs(self):
        """emit_alerts logs violations."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates)
        violations = monitor.check({"m": 150})
        
        # Just verify it doesn't raise
        emitted = monitor.emit_alerts(violations)
        assert len(emitted) == 1
    
    def test_emit_alerts_custom_function(self):
        """emit_alerts calls custom alert function."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates)
        violations = monitor.check({"m": 150})
        
        alerts_received = []
        def custom_alert(alert):
            alerts_received.append(alert)
        
        monitor.emit_alerts(violations, alert_fn=custom_alert)
        
        assert len(alerts_received) == 1
        assert alerts_received[0]["gate_name"] == "test"
    
    def test_rate_limiting(self):
        """emit_alerts respects rate limiting."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates, rate_limit_seconds=300)
        
        violations1 = monitor.check({"m": 150})
        emitted1 = monitor.emit_alerts(violations1)
        
        violations2 = monitor.check({"m": 160})
        emitted2 = monitor.emit_alerts(violations2)  # Should be rate limited
        
        assert len(emitted1) == 1
        assert len(emitted2) == 0  # Rate limited
    
    def test_rate_limiting_disabled(self):
        """emit_alerts can skip rate limiting."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates, rate_limit_seconds=300)
        
        violations1 = monitor.check({"m": 150})
        emitted1 = monitor.emit_alerts(violations1)
        
        violations2 = monitor.check({"m": 160})
        emitted2 = monitor.emit_alerts(violations2, respect_rate_limit=False)
        
        assert len(emitted1) == 1
        assert len(emitted2) == 1  # Not rate limited
    
    def test_get_report(self):
        """get_report returns status summary."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates)
        monitor.check({"m": 150})  # Add a violation
        
        report = monitor.get_report()
        
        assert report["quality_gates_version"] == "1.0"
        assert report["n_gates"] == 1
        assert "test" in report["gates"]
        assert report["violations_24h"] >= 1
        assert report["status"] in ["healthy", "warning", "critical"]
    
    def test_get_manifest_entry(self):
        """get_manifest_entry returns dict for manifest."""
        gates = [
            QualityGate(name="test", metric="m", operator=Operator.LT, warning_threshold=100),
        ]
        monitor = QualityGateMonitor(gates=gates)
        violations = monitor.check({"m": 150})
        
        manifest = monitor.get_manifest_entry(violations, {"m": 150})
        
        assert "quality_gates" in manifest
        qg = manifest["quality_gates"]
        assert qg["version"] == "1.0"
        assert qg["n_checks"] == 1
        assert qg["n_violations"] == 1
        assert qg["status"] == "fail"
        assert len(qg["violations"]) == 1


class TestConvenienceFunctions:
    """Tests for convenience functions."""
    
    def test_check_quality_gates_pass(self):
        """check_quality_gates returns True when all pass."""
        passed, violations, manifest = check_quality_gates(
            {"weight_coverage_pct": 98, "condition_number": 5000},
            emit_alerts=False
        )
        
        assert passed is True
        assert len(violations) == 0
        assert manifest["quality_gates"]["status"] == "pass"
    
    def test_check_quality_gates_fail(self):
        """check_quality_gates returns False with violations."""
        passed, violations, manifest = check_quality_gates(
            {"weight_coverage_pct": 50},  # Below 90% critical
            emit_alerts=False
        )
        
        assert passed is False
        assert len(violations) >= 1
        assert manifest["quality_gates"]["status"] == "fail"
    
    def test_create_custom_gate(self):
        """create_custom_gate returns valid gate."""
        gate = create_custom_gate(
            name="custom",
            metric="my_metric",
            warning=50,
            critical=75,
            operator="lt",
            description="Custom gate"
        )
        
        assert gate.name == "custom"
        assert gate.metric == "my_metric"
        assert gate.warning_threshold == 50
        assert gate.critical_threshold == 75
        assert gate.operator == Operator.LT
        assert gate.description == "Custom gate"
    
    def test_get_gates_for_profile_agressif(self):
        """Profile-specific gates for Agressif."""
        gates = get_gates_for_profile("Agressif")
        
        assert len(gates) > 0
        # Should have relaxed thresholds
        coverage_gate = next((g for g in gates if g.name == "portfolio_coverage"), None)
        assert coverage_gate is not None
        assert coverage_gate.warning_threshold == 90.0
    
    def test_get_gates_for_profile_stable(self):
        """Profile-specific gates for Stable."""
        gates = get_gates_for_profile("Stable")
        
        coverage_gate = next((g for g in gates if g.name == "portfolio_coverage"), None)
        assert coverage_gate is not None
        assert coverage_gate.warning_threshold == 98.0  # Stricter
    
    def test_get_gates_for_unknown_profile(self):
        """Unknown profile returns default gates."""
        gates = get_gates_for_profile("Unknown")
        
        assert len(gates) == len(DEFAULT_GATES)


class TestDefaultGates:
    """Tests for default gates configuration."""
    
    def test_default_gates_exist(self):
        """Default gates are defined."""
        assert len(DEFAULT_GATES) >= 5
    
    def test_default_gates_have_names(self):
        """All default gates have unique names."""
        names = [g.name for g in DEFAULT_GATES]
        assert len(names) == len(set(names))  # No duplicates
    
    def test_default_gates_coverage(self):
        """Expected default gates are present."""
        gate_names = {g.name for g in DEFAULT_GATES}
        
        expected = {
            "data_freshness",
            "portfolio_coverage",
            "fallback_rate",
            "covariance_condition",
            "execution_time",
        }
        
        assert expected.issubset(gate_names)


class TestIntegration:
    """Integration tests."""
    
    def test_full_workflow(self):
        """Test complete quality gates workflow."""
        # Simulate a portfolio run
        metrics = {
            "max_price_age_hours": 12,
            "weight_coverage_pct": 98.5,
            "fallback_pct": 5.0,
            "condition_number": 8102,
            "execution_time_seconds": 35,
            "n_assets": 18,
            "weights_sum_pct": 99.98,
        }
        
        context = {
            "profile": "Agressif",
            "run_id": "test-run-123",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        # Check gates
        passed, violations, manifest = check_quality_gates(
            metrics,
            context=context,
            emit_alerts=False
        )
        
        assert passed is True
        assert manifest["quality_gates"]["status"] == "pass"
        
        # Verify manifest structure
        qg = manifest["quality_gates"]
        assert "version" in qg
        assert "n_checks" in qg
        assert "metrics_checked" in qg
        assert qg["metrics_checked"] == metrics
    
    def test_workflow_with_violations(self):
        """Test workflow when quality gates fail."""
        metrics = {
            "weight_coverage_pct": 85,  # Below 90% critical
            "condition_number": 150000,  # Above 100k critical
            "execution_time_seconds": 150,  # Above 120s critical
        }
        
        passed, violations, manifest = check_quality_gates(
            metrics,
            context={"profile": "Test"},
            emit_alerts=False
        )
        
        assert passed is False
        assert len(violations) >= 2
        
        # Check severities
        severities = {v.severity for v in violations}
        assert Severity.CRITICAL in severities
