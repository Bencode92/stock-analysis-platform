# tests/test_structured_logging.py
"""
Tests for structured JSON logging module.

P2-10 - 2025-12-18
"""

import json
import logging
import io
import pytest
from unittest.mock import patch

from portfolio_engine.structured_logging import (
    # Correlation ID
    set_correlation_id,
    get_correlation_id,
    clear_correlation_id,
    # Filter & Formatter
    CorrelationIdFilter,
    StructuredJsonFormatter,
    # Logger factory
    get_structured_logger,
    reset_logger_config,
    # Helpers
    log_event,
    logging_context,
    get_logging_manifest_entry,
    # Events
    Events,
)


class TestCorrelationId:
    """Tests for correlation ID management."""
    
    def setup_method(self):
        """Clear correlation ID before each test."""
        clear_correlation_id()
    
    def test_set_auto_generates_uuid(self):
        """set_correlation_id() generates UUID if none provided."""
        cid = set_correlation_id()
        assert cid
        assert len(cid) == 36  # UUID format
        assert "-" in cid
    
    def test_set_custom_id(self):
        """set_correlation_id() accepts custom ID."""
        cid = set_correlation_id("my-custom-id")
        assert cid == "my-custom-id"
        assert get_correlation_id() == "my-custom-id"
    
    def test_get_returns_current(self):
        """get_correlation_id() returns current value."""
        assert get_correlation_id() == ""
        set_correlation_id("test-123")
        assert get_correlation_id() == "test-123"
    
    def test_clear_resets(self):
        """clear_correlation_id() resets to empty."""
        set_correlation_id("test-123")
        clear_correlation_id()
        assert get_correlation_id() == ""


class TestCorrelationIdFilter:
    """Tests for CorrelationIdFilter."""
    
    def setup_method(self):
        clear_correlation_id()
    
    def test_filter_adds_correlation_id(self):
        """Filter adds correlation_id to record."""
        set_correlation_id("filter-test-123")
        
        filter_instance = CorrelationIdFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test message", args=(), exc_info=None
        )
        
        result = filter_instance.filter(record)
        
        assert result is True  # Allow record through
        assert record.correlation_id == "filter-test-123"
    
    def test_filter_with_empty_correlation_id(self):
        """Filter works when no correlation ID set."""
        filter_instance = CorrelationIdFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None
        )
        
        result = filter_instance.filter(record)
        
        assert result is True
        assert record.correlation_id == ""


class TestStructuredJsonFormatter:
    """Tests for StructuredJsonFormatter."""
    
    def setup_method(self):
        clear_correlation_id()
        self.formatter = StructuredJsonFormatter()
    
    def test_basic_format(self):
        """Formatter produces valid JSON."""
        record = logging.LogRecord(
            name="test.logger", level=logging.INFO, pathname="/test.py",
            lineno=42, msg="test message", args=(), exc_info=None
        )
        record.correlation_id = "test-cid"
        
        output = self.formatter.format(record)
        data = json.loads(output)
        
        assert data["level"] == "INFO"
        assert data["logger"] == "test.logger"
        assert data["correlation_id"] == "test-cid"
        assert data["message"] == "test message"
        assert data["context"]["line"] == 42
    
    def test_event_and_message_separation(self):
        """Formatter separates event and message."""
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Human readable message", args=(), exc_info=None
        )
        record.correlation_id = ""
        record.event = "machine_readable_event"
        
        output = self.formatter.format(record)
        data = json.loads(output)
        
        assert data["event"] == "machine_readable_event"
        assert data["message"] == "Human readable message"
    
    def test_data_payload_included(self):
        """Formatter includes data payload."""
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None
        )
        record.correlation_id = ""
        record.data = {"key": "value", "number": 42}
        
        output = self.formatter.format(record)
        data = json.loads(output)
        
        assert data["data"] == {"key": "value", "number": 42}
    
    def test_exception_included(self):
        """Formatter includes exception info."""
        try:
            raise ValueError("test error")
        except ValueError:
            import sys
            exc_info = sys.exc_info()
        
        record = logging.LogRecord(
            name="test", level=logging.ERROR, pathname="", lineno=0,
            msg="error occurred", args=(), exc_info=exc_info
        )
        record.correlation_id = ""
        
        output = self.formatter.format(record)
        data = json.loads(output)
        
        assert "exception" in data
        assert "ValueError" in data["exception"]
        assert "test error" in data["exception"]
    
    def test_timestamp_is_iso_format(self):
        """Timestamp is ISO 8601 format."""
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None
        )
        record.correlation_id = ""
        
        output = self.formatter.format(record)
        data = json.loads(output)
        
        # Should be parseable ISO format
        from datetime import datetime
        timestamp = data["timestamp"]
        assert "T" in timestamp
        assert "+" in timestamp or "Z" in timestamp


class TestGetStructuredLogger:
    """Tests for get_structured_logger factory."""
    
    def setup_method(self):
        # Reset any existing config
        reset_logger_config("test.logger.unique")
        clear_correlation_id()
    
    def teardown_method(self):
        reset_logger_config("test.logger.unique")
    
    def test_returns_configured_logger(self):
        """Factory returns a configured logger."""
        logger = get_structured_logger("test.logger.unique")
        
        assert isinstance(logger, logging.Logger)
        assert logger.name == "test.logger.unique"
        assert len(logger.handlers) == 1
    
    def test_anti_duplicate_handler(self):
        """Calling twice doesn't add duplicate handlers."""
        logger1 = get_structured_logger("test.logger.unique")
        n_handlers_1 = len(logger1.handlers)
        
        logger2 = get_structured_logger("test.logger.unique")
        n_handlers_2 = len(logger2.handlers)
        
        assert logger1 is logger2
        assert n_handlers_1 == n_handlers_2 == 1
    
    def test_logger_outputs_json(self):
        """Logger outputs valid JSON."""
        stream = io.StringIO()
        logger = get_structured_logger("test.json.output", stream=stream)
        
        set_correlation_id("json-test-123")
        logger.info("test message")
        
        output = stream.getvalue().strip()
        data = json.loads(output)
        
        assert data["message"] == "test message"
        assert data["correlation_id"] == "json-test-123"


class TestLogEvent:
    """Tests for log_event helper."""
    
    def setup_method(self):
        clear_correlation_id()
        reset_logger_config("test.log_event")
        self.stream = io.StringIO()
        self.logger = get_structured_logger("test.log_event", stream=self.stream)
    
    def teardown_method(self):
        reset_logger_config("test.log_event")
    
    def test_log_event_basic(self):
        """log_event logs with event name."""
        log_event(self.logger, "test_event")
        
        output = self.stream.getvalue().strip()
        data = json.loads(output)
        
        assert data["event"] == "test_event"
    
    def test_log_event_with_message(self):
        """log_event uses custom message."""
        log_event(self.logger, "my_event", message="Custom message")
        
        output = self.stream.getvalue().strip()
        data = json.loads(output)
        
        assert data["event"] == "my_event"
        assert data["message"] == "Custom message"
    
    def test_log_event_with_data(self):
        """log_event includes data payload."""
        log_event(self.logger, "data_event",
            profile="Agressif",
            n_assets=18,
            score=0.95
        )
        
        output = self.stream.getvalue().strip()
        data = json.loads(output)
        
        assert data["data"]["profile"] == "Agressif"
        assert data["data"]["n_assets"] == 18
        assert data["data"]["score"] == 0.95
    
    def test_log_event_levels(self):
        """log_event respects log level."""
        log_event(self.logger, "debug_event", level="DEBUG")
        log_event(self.logger, "warning_event", level="WARNING")
        log_event(self.logger, "error_event", level="ERROR")
        
        lines = self.stream.getvalue().strip().split("\n")
        # DEBUG might not show depending on level, but WARNING and ERROR should
        
        levels = [json.loads(line)["level"] for line in lines if line]
        assert "WARNING" in levels
        assert "ERROR" in levels
    
    def test_log_event_with_exc_info(self):
        """log_event includes exception when exc_info=True."""
        try:
            raise RuntimeError("test exception")
        except RuntimeError:
            log_event(self.logger, "error_event", level="ERROR", exc_info=True)
        
        output = self.stream.getvalue().strip()
        data = json.loads(output)
        
        assert "exception" in data
        assert "RuntimeError" in data["exception"]


class TestLoggingContext:
    """Tests for logging_context context manager."""
    
    def setup_method(self):
        clear_correlation_id()
    
    def test_sets_correlation_id(self):
        """Context manager sets correlation ID."""
        with logging_context() as cid:
            assert cid
            assert get_correlation_id() == cid
    
    def test_clears_on_exit(self):
        """Context manager clears ID on exit."""
        with logging_context():
            pass
        
        assert get_correlation_id() == ""
    
    def test_clears_on_exception(self):
        """Context manager clears ID even on exception."""
        try:
            with logging_context():
                raise ValueError("test")
        except ValueError:
            pass
        
        assert get_correlation_id() == ""
    
    def test_custom_correlation_id(self):
        """Context manager accepts custom ID."""
        with logging_context("my-custom-id") as cid:
            assert cid == "my-custom-id"
            assert get_correlation_id() == "my-custom-id"


class TestGetLoggingManifestEntry:
    """Tests for manifest integration."""
    
    def setup_method(self):
        clear_correlation_id()
    
    def test_returns_dict(self):
        """Returns dict with expected fields."""
        set_correlation_id("manifest-test")
        
        entry = get_logging_manifest_entry()
        
        assert isinstance(entry, dict)
        assert entry["correlation_id"] == "manifest-test"
        assert "log_timestamp" in entry
        assert entry["log_version"] == "1.0"
    
    def test_empty_correlation_id(self):
        """Works with no correlation ID."""
        entry = get_logging_manifest_entry()
        assert entry["correlation_id"] == ""


class TestEvents:
    """Tests for standard event names."""
    
    def test_events_are_strings(self):
        """All events are non-empty strings."""
        events = [
            Events.GENERATION_STARTED,
            Events.GENERATION_COMPLETED,
            Events.OPTIMIZATION_STARTED,
            Events.COVARIANCE_COMPUTED,
            Events.BACKTEST_COMPLETED,
        ]
        
        for event in events:
            assert isinstance(event, str)
            assert len(event) > 0
            assert "_" in event  # snake_case format


class TestIntegration:
    """Integration tests for complete logging flow."""
    
    def setup_method(self):
        clear_correlation_id()
        reset_logger_config("test.integration")
        self.stream = io.StringIO()
        self.logger = get_structured_logger("test.integration", stream=self.stream)
    
    def teardown_method(self):
        reset_logger_config("test.integration")
    
    def test_complete_run_flow(self):
        """Test complete logging flow with context."""
        with logging_context() as run_id:
            log_event(self.logger, Events.GENERATION_STARTED,
                message="Starting generation",
                profile="Agressif"
            )
            
            log_event(self.logger, Events.COVARIANCE_COMPUTED,
                condition_number=8102.04,
                method="diag_shrink"
            )
            
            log_event(self.logger, Events.GENERATION_COMPLETED,
                duration_ms=1234
            )
        
        lines = self.stream.getvalue().strip().split("\n")
        assert len(lines) == 3
        
        # All should have same correlation ID
        logs = [json.loads(line) for line in lines]
        cids = [log["correlation_id"] for log in logs]
        assert all(cid == run_id for cid in cids)
        
        # Check events
        events = [log["event"] for log in logs]
        assert events[0] == Events.GENERATION_STARTED
        assert events[1] == Events.COVARIANCE_COMPUTED
        assert events[2] == Events.GENERATION_COMPLETED
        
        # Check data
        assert logs[0]["data"]["profile"] == "Agressif"
        assert logs[1]["data"]["condition_number"] == 8102.04
        assert logs[2]["data"]["duration_ms"] == 1234
