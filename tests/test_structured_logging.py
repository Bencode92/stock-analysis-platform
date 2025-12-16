# tests/test_structured_logging.py
"""
Tests pour portfolio_engine/structured_logging.py (P2-10)

Valide:
- StructuredFormatter produit du JSON valide
- correlation_id est propagé correctement
- LogContext mesure les durées
- PortfolioLogger produit les bons events
- Filtrage des logs fonctionne
"""

import pytest
import json
import logging
import time
from typing import Dict, Any
from io import StringIO


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def reset_logging():
    """Reset logging state before each test."""
    # Clear all handlers from root logger
    root = logging.getLogger()
    root.handlers.clear()
    
    # Reset context variables
    try:
        from portfolio_engine.structured_logging import (
            set_correlation_id,
            set_current_profile,
            set_run_metadata,
        )
        set_correlation_id('')
        set_current_profile('')
        set_run_metadata({})
    except ImportError:
        pass
    
    yield
    
    # Cleanup after test
    root.handlers.clear()


@pytest.fixture
def capture_logs(reset_logging):
    """Capture logs to a StringIO buffer."""
    try:
        from portfolio_engine.structured_logging import (
            setup_structured_logging,
            StructuredFormatter,
        )
    except ImportError:
        pytest.skip("portfolio_engine.structured_logging not available")
    
    # Create string buffer
    log_buffer = StringIO()
    
    # Create handler with JSON formatter
    handler = logging.StreamHandler(log_buffer)
    handler.setFormatter(StructuredFormatter())
    handler.setLevel(logging.DEBUG)
    
    # Add to root logger
    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    root.addHandler(handler)
    
    yield log_buffer
    
    # Cleanup
    root.removeHandler(handler)


# =============================================================================
# TESTS - StructuredFormatter
# =============================================================================

class TestStructuredFormatter:
    """Tests pour StructuredFormatter."""
    
    def test_produces_valid_json(self, capture_logs):
        """Le formatter produit du JSON valide."""
        logger = logging.getLogger("test.json")
        logger.info("Test message")
        
        output = capture_logs.getvalue()
        lines = [l for l in output.strip().split('\n') if l]
        
        assert len(lines) >= 1, "Should have at least one log line"
        
        # Parse JSON
        for line in lines:
            parsed = json.loads(line)
            assert isinstance(parsed, dict)
    
    def test_contains_required_fields(self, capture_logs):
        """Le JSON contient les champs requis."""
        logger = logging.getLogger("test.fields")
        logger.info("Test message")
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        required_fields = ["timestamp", "level", "logger", "message"]
        for field in required_fields:
            assert field in parsed, f"Missing required field: {field}"
        
        assert parsed["level"] == "INFO"
        assert parsed["logger"] == "test.fields"
        assert "Test message" in parsed["message"]
    
    def test_timestamp_is_iso8601(self, capture_logs):
        """Le timestamp est au format ISO8601."""
        logger = logging.getLogger("test.timestamp")
        logger.info("Test")
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        timestamp = parsed["timestamp"]
        assert timestamp.endswith("Z"), "Timestamp should end with Z (UTC)"
        assert "T" in timestamp, "Timestamp should have T separator"
    
    def test_level_mapping(self, capture_logs):
        """Les niveaux de log sont correctement mappés."""
        logger = logging.getLogger("test.levels")
        
        logger.debug("debug")
        logger.info("info")
        logger.warning("warning")
        logger.error("error")
        
        output = capture_logs.getvalue()
        lines = [l for l in output.strip().split('\n') if l]
        
        levels_found = []
        for line in lines:
            parsed = json.loads(line)
            levels_found.append(parsed["level"])
        
        assert "DEBUG" in levels_found
        assert "INFO" in levels_found
        assert "WARNING" in levels_found
        assert "ERROR" in levels_found


# =============================================================================
# TESTS - correlation_id
# =============================================================================

class TestCorrelationId:
    """Tests pour le correlation_id."""
    
    def test_correlation_id_is_set(self, reset_logging):
        """Le correlation_id est défini et propagé."""
        try:
            from portfolio_engine.structured_logging import (
                setup_structured_logging,
                get_correlation_id,
            )
        except ImportError:
            pytest.skip("Module not available")
        
        cid = setup_structured_logging(correlation_id="test_run_123")
        
        assert cid == "test_run_123"
        assert get_correlation_id() == "test_run_123"
    
    def test_auto_generated_correlation_id(self, reset_logging):
        """Un correlation_id est auto-généré si non fourni."""
        try:
            from portfolio_engine.structured_logging import (
                setup_structured_logging,
                get_correlation_id,
            )
        except ImportError:
            pytest.skip("Module not available")
        
        cid = setup_structured_logging()
        
        assert cid.startswith("run_")
        assert len(cid) > 20  # run_YYYYMMDD_HHMMSS_xxxxxxxx
        assert get_correlation_id() == cid
    
    def test_correlation_id_in_logs(self, reset_logging):
        """Le correlation_id apparaît dans les logs."""
        try:
            from portfolio_engine.structured_logging import (
                setup_structured_logging,
                StructuredFormatter,
            )
        except ImportError:
            pytest.skip("Module not available")
        
        # Setup with known correlation_id
        setup_structured_logging(correlation_id="test_cid_456", force_json=True)
        
        # Capture output
        log_buffer = StringIO()
        handler = logging.StreamHandler(log_buffer)
        handler.setFormatter(StructuredFormatter())
        
        logger = logging.getLogger("test.cid")
        logger.addHandler(handler)
        logger.info("Test with correlation_id")
        
        output = log_buffer.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert parsed.get("correlation_id") == "test_cid_456"


# =============================================================================
# TESTS - log_with_context
# =============================================================================

class TestLogWithContext:
    """Tests pour log_with_context."""
    
    def test_context_is_included(self, capture_logs):
        """Le contexte est inclus dans le log."""
        try:
            from portfolio_engine.structured_logging import log_with_context
        except ImportError:
            pytest.skip("Module not available")
        
        logger = logging.getLogger("test.context")
        log_with_context(
            logger, "INFO", "Test with context",
            context={"key": "value", "number": 42}
        )
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert "context" in parsed
        assert parsed["context"]["key"] == "value"
        assert parsed["context"]["number"] == 42
    
    def test_profile_is_included(self, capture_logs):
        """Le profile est inclus dans le log."""
        try:
            from portfolio_engine.structured_logging import log_with_context
        except ImportError:
            pytest.skip("Module not available")
        
        logger = logging.getLogger("test.profile")
        log_with_context(
            logger, "INFO", "Test with profile",
            profile="Agressif"
        )
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert parsed.get("profile") == "Agressif"
    
    def test_duration_is_included(self, capture_logs):
        """La durée est incluse si fournie."""
        try:
            from portfolio_engine.structured_logging import log_with_context
        except ImportError:
            pytest.skip("Module not available")
        
        logger = logging.getLogger("test.duration")
        log_with_context(
            logger, "INFO", "Test with duration",
            duration_ms=150.5
        )
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert parsed.get("duration_ms") == 150.5


# =============================================================================
# TESTS - LogContext
# =============================================================================

class TestLogContext:
    """Tests pour LogContext context manager."""
    
    def test_logs_start_and_end(self, capture_logs):
        """LogContext log le début et la fin."""
        try:
            from portfolio_engine.structured_logging import LogContext
        except ImportError:
            pytest.skip("Module not available")
        
        logger = logging.getLogger("test.logcontext")
        
        with LogContext(logger, "Test operation"):
            pass
        
        output = capture_logs.getvalue()
        lines = [l for l in output.strip().split('\n') if l]
        
        assert len(lines) >= 2, "Should have start and end logs"
        
        # Check start
        start_log = json.loads(lines[-2])
        assert "Starting" in start_log["message"]
        
        # Check end
        end_log = json.loads(lines[-1])
        assert "Completed" in end_log["message"]
    
    def test_measures_duration(self, capture_logs):
        """LogContext mesure la durée."""
        try:
            from portfolio_engine.structured_logging import LogContext
        except ImportError:
            pytest.skip("Module not available")
        
        logger = logging.getLogger("test.duration")
        
        with LogContext(logger, "Timed operation"):
            time.sleep(0.05)  # 50ms
        
        output = capture_logs.getvalue()
        lines = [l for l in output.strip().split('\n') if l]
        
        # End log should have duration
        end_log = json.loads(lines[-1])
        assert "duration_ms" in end_log
        assert end_log["duration_ms"] >= 40  # At least 40ms (accounting for timing variance)
    
    def test_logs_error_on_exception(self, capture_logs):
        """LogContext log une erreur si exception."""
        try:
            from portfolio_engine.structured_logging import LogContext
        except ImportError:
            pytest.skip("Module not available")
        
        logger = logging.getLogger("test.error")
        
        with pytest.raises(ValueError):
            with LogContext(logger, "Failing operation"):
                raise ValueError("Test error")
        
        output = capture_logs.getvalue()
        lines = [l for l in output.strip().split('\n') if l]
        
        # Should have error log
        error_log = json.loads(lines[-1])
        assert error_log["level"] == "ERROR"
        assert "Failed" in error_log["message"]


# =============================================================================
# TESTS - PortfolioLogger
# =============================================================================

class TestPortfolioLogger:
    """Tests pour PortfolioLogger."""
    
    def test_optimization_started(self, capture_logs):
        """optimization_started produit le bon event."""
        try:
            from portfolio_engine.structured_logging import PortfolioLogger
        except ImportError:
            pytest.skip("Module not available")
        
        plogger = PortfolioLogger("test.portfolio")
        plogger.optimization_started("Agressif", n_assets=50)
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert parsed["profile"] == "Agressif"
        assert parsed["context"]["event"] == "optimization_started"
        assert parsed["context"]["n_assets"] == 50
    
    def test_optimization_completed(self, capture_logs):
        """optimization_completed inclut toutes les métriques."""
        try:
            from portfolio_engine.structured_logging import PortfolioLogger
        except ImportError:
            pytest.skip("Module not available")
        
        plogger = PortfolioLogger("test.portfolio")
        plogger.optimization_completed(
            "Modéré",
            vol=11.8,
            n_selected=10,
            duration_ms=250.0,
            mode="slsqp"
        )
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert parsed["profile"] == "Modéré"
        assert parsed["context"]["volatility_pct"] == 11.8
        assert parsed["context"]["n_assets_selected"] == 10
        assert parsed["context"]["optimization_mode"] == "slsqp"
        assert parsed["duration_ms"] == 250.0
    
    def test_covariance_warning(self, capture_logs):
        """covariance_warning produit un WARNING."""
        try:
            from portfolio_engine.structured_logging import PortfolioLogger
        except ImportError:
            pytest.skip("Module not available")
        
        plogger = PortfolioLogger("test.portfolio")
        plogger.covariance_warning("Agressif", condition_number=2042133.2)
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert parsed["level"] == "WARNING"
        assert parsed["context"]["condition_number"] == 2042133.2
    
    def test_constraint_violation_hard(self, capture_logs):
        """constraint_violation avec priority=hard produit ERROR."""
        try:
            from portfolio_engine.structured_logging import PortfolioLogger
        except ImportError:
            pytest.skip("Module not available")
        
        plogger = PortfolioLogger("test.portfolio")
        plogger.constraint_violation(
            "Stable",
            constraint_name="bonds_min",
            expected="≥30%",
            actual=25.0,
            priority="hard"
        )
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert parsed["level"] == "ERROR"
        assert parsed["context"]["constraint_name"] == "bonds_min"
        assert parsed["context"]["priority"] == "hard"


# =============================================================================
# TESTS - Log Filtering
# =============================================================================

class TestLogFiltering:
    """Tests pour les fonctions de filtrage des logs."""
    
    def test_filter_by_correlation_id(self):
        """filter_logs_by_correlation_id fonctionne."""
        try:
            from portfolio_engine.structured_logging import filter_logs_by_correlation_id
        except ImportError:
            pytest.skip("Module not available")
        
        log_lines = [
            '{"correlation_id": "run_123", "message": "msg1"}',
            '{"correlation_id": "run_456", "message": "msg2"}',
            '{"correlation_id": "run_123", "message": "msg3"}',
        ]
        
        filtered = filter_logs_by_correlation_id(log_lines, "run_123")
        
        assert len(filtered) == 2
        assert filtered[0]["message"] == "msg1"
        assert filtered[1]["message"] == "msg3"
    
    def test_filter_by_profile(self):
        """filter_logs_by_profile fonctionne."""
        try:
            from portfolio_engine.structured_logging import filter_logs_by_profile
        except ImportError:
            pytest.skip("Module not available")
        
        log_lines = [
            '{"profile": "Agressif", "message": "msg1"}',
            '{"profile": "Modéré", "message": "msg2"}',
            '{"profile": "Agressif", "message": "msg3"}',
        ]
        
        filtered = filter_logs_by_profile(log_lines, "Agressif")
        
        assert len(filtered) == 2
    
    def test_filter_by_level(self):
        """filter_logs_by_level fonctionne."""
        try:
            from portfolio_engine.structured_logging import filter_logs_by_level
        except ImportError:
            pytest.skip("Module not available")
        
        log_lines = [
            '{"level": "INFO", "message": "info"}',
            '{"level": "WARNING", "message": "warning"}',
            '{"level": "ERROR", "message": "error"}',
            '{"level": "INFO", "message": "info2"}',
        ]
        
        filtered = filter_logs_by_level(log_lines, ["WARNING", "ERROR"])
        
        assert len(filtered) == 2
        assert filtered[0]["level"] == "WARNING"
        assert filtered[1]["level"] == "ERROR"


# =============================================================================
# TESTS - Edge Cases
# =============================================================================

class TestEdgeCases:
    """Tests pour les cas limites."""
    
    def test_empty_context(self, capture_logs):
        """Contexte vide ne casse pas le formatage."""
        try:
            from portfolio_engine.structured_logging import log_with_context
        except ImportError:
            pytest.skip("Module not available")
        
        logger = logging.getLogger("test.empty")
        log_with_context(logger, "INFO", "No context")
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        # Should not have empty context in output (cleaned)
        assert parsed.get("context", {}) == {} or "context" not in parsed
    
    def test_unicode_in_message(self, capture_logs):
        """Les caractères unicode sont correctement gérés."""
        logger = logging.getLogger("test.unicode")
        logger.info("Message avec émojis 🚀 et accents éàü")
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert "🚀" in parsed["message"]
        assert "éàü" in parsed["message"]
    
    def test_special_characters_in_context(self, capture_logs):
        """Les caractères spéciaux dans le contexte sont échappés."""
        try:
            from portfolio_engine.structured_logging import log_with_context
        except ImportError:
            pytest.skip("Module not available")
        
        logger = logging.getLogger("test.special")
        log_with_context(
            logger, "INFO", "Test",
            context={"path": "/data/file.json", "query": "a=1&b=2"}
        )
        
        output = capture_logs.getvalue()
        parsed = json.loads(output.strip().split('\n')[-1])
        
        assert parsed["context"]["path"] == "/data/file.json"
        assert parsed["context"]["query"] == "a=1&b=2"


# =============================================================================
# RUN
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
