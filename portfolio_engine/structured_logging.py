# portfolio_engine/structured_logging.py
"""
Structured JSON logging with correlation ID tracking.

V1.0 - 2025-12-18 (P2-10)

Features:
- Anti-duplicate handler pattern (no double logging)
- CorrelationIdFilter (proper logging.Filter, not makeRecord bypass)
- Separate event vs message fields (SIEM-compatible)
- Compatible with exc_info, filters, multiple handlers
- Context manager for automatic correlation ID lifecycle

Output schema (Datadog/ELK/Splunk ready):
{
    "timestamp": "2025-12-18T10:15:00.123Z",
    "level": "INFO",
    "logger": "portfolio_engine.optimizer",
    "event": "covariance_computed",
    "message": "Covariance matrix computed",
    "correlation_id": "a1b2c3d4-...",
    "data": {...},
    "context": {"module": "...", "function": "...", "line": 42},
    "exception": "..."
}
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from contextvars import ContextVar
from contextlib import contextmanager
from typing import Any, Dict, Optional, Set

# ============================================================
# CORRELATION ID (thread-safe via contextvars)
# ============================================================

_correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")


def set_correlation_id(cid: Optional[str] = None) -> str:
    """
    Set correlation ID for current context.
    
    Args:
        cid: Optional correlation ID. If None, generates a new UUID.
    
    Returns:
        The correlation ID that was set.
    
    Example:
        cid = set_correlation_id()  # Auto-generate
        cid = set_correlation_id("my-custom-id")  # Custom
    """
    cid = cid or str(uuid.uuid4())
    _correlation_id.set(cid)
    return cid


def get_correlation_id() -> str:
    """
    Get current correlation ID.
    
    Returns:
        Current correlation ID or empty string if not set.
    """
    return _correlation_id.get()


def clear_correlation_id() -> None:
    """Clear the current correlation ID."""
    _correlation_id.set("")


# ============================================================
# FILTER: Injects correlation_id into every record
# ============================================================

class CorrelationIdFilter(logging.Filter):
    """
    Filter that adds correlation_id to all log records.
    
    This is the proper way to inject context into logs,
    rather than bypassing the logging system with makeRecord.
    """
    
    def filter(self, record: logging.LogRecord) -> bool:
        """Add correlation_id to record and allow it through."""
        record.correlation_id = get_correlation_id()
        return True


# ============================================================
# FORMATTER: JSON output with event/message separation
# ============================================================

class StructuredJsonFormatter(logging.Formatter):
    """
    JSON formatter for structured logging.
    
    Produces SIEM-compatible JSON with:
    - event: Machine-readable event name
    - message: Human-readable description
    - data: Structured payload
    - context: Source location
    - exception: Stack trace if present
    """
    
    # Fields to include in context
    CONTEXT_FIELDS = ("module", "funcName", "lineno", "pathname")
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        # Base structure
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "correlation_id": getattr(record, "correlation_id", ""),
        }
        
        # Event vs Message separation
        # Priority: extra['event'] > message as event
        event = getattr(record, "event", None)
        if event:
            log_entry["event"] = event
            log_entry["message"] = record.getMessage()
        else:
            # Fallback: treat message as event (backward compat)
            log_entry["event"] = record.getMessage()
            log_entry["message"] = record.getMessage()
        
        # Structured data payload
        data = getattr(record, "data", None)
        if data:
            log_entry["data"] = data
        
        # Context (module, function, line)
        log_entry["context"] = {
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        # Stack info if present
        if record.stack_info:
            log_entry["stack_info"] = record.stack_info
        
        return json.dumps(log_entry, default=str, ensure_ascii=False)


# ============================================================
# LOGGER FACTORY: Anti-duplicate handler pattern
# ============================================================

_configured_loggers: Set[str] = set()


def get_structured_logger(
    name: str,
    level: int = logging.INFO,
    stream: Any = None
) -> logging.Logger:
    """
    Get a logger configured for structured JSON output.
    
    Anti-duplicate pattern: only configures handler once per logger name.
    Safe to call multiple times with same name.
    
    Args:
        name: Logger name (e.g., "portfolio_engine.optimizer")
        level: Logging level (default: INFO)
        stream: Output stream (default: stderr via StreamHandler)
    
    Returns:
        Configured logger instance.
    
    Example:
        logger = get_structured_logger("portfolio_engine.optimizer")
        logger.info("Something happened", extra={"event": "my_event"})
    """
    logger = logging.getLogger(name)
    
    # Avoid duplicate configuration
    if name in _configured_loggers:
        return logger
    
    # Check if already has a StructuredJsonFormatter handler
    for handler in logger.handlers:
        if isinstance(handler.formatter, StructuredJsonFormatter):
            _configured_loggers.add(name)
            return logger
    
    # Configure new handler
    handler = logging.StreamHandler(stream)
    handler.setFormatter(StructuredJsonFormatter())
    handler.addFilter(CorrelationIdFilter())
    
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False  # Avoid duplicate logs from parent
    
    _configured_loggers.add(name)
    return logger


def reset_logger_config(name: str) -> None:
    """
    Reset logger configuration (mainly for testing).
    
    Args:
        name: Logger name to reset.
    """
    if name in _configured_loggers:
        _configured_loggers.remove(name)
    
    logger = logging.getLogger(name)
    logger.handlers.clear()
    logger.setLevel(logging.NOTSET)
    logger.propagate = True


# ============================================================
# CONVENIENCE: log_event helper
# ============================================================

def log_event(
    logger: logging.Logger,
    event: str,
    message: Optional[str] = None,
    level: str = "INFO",
    exc_info: bool = False,
    **data
) -> None:
    """
    Log a structured event with optional data payload.
    
    This is the recommended way to log events with structured data.
    
    Args:
        logger: Logger instance
        event: Machine-readable event name (e.g., "covariance_computed")
        message: Human-readable message (optional, defaults to event name)
        level: Log level ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
        exc_info: Include exception traceback (default: False)
        **data: Structured data to include in log
    
    Example:
        log_event(logger, "optimization_complete",
            message="Portfolio optimization finished",
            profile="Agressif",
            n_assets=18,
            duration_ms=1234
        )
    
    Output:
        {
            "event": "optimization_complete",
            "message": "Portfolio optimization finished",
            "data": {"profile": "Agressif", "n_assets": 18, "duration_ms": 1234}
        }
    """
    log_level = getattr(logging, level.upper(), logging.INFO)
    
    # Use extra dict for additional fields
    extra = {
        "event": event,
        "data": data if data else None,
    }
    
    # Message: use provided or default to formatted event name
    msg = message or event.replace("_", " ").capitalize()
    
    logger.log(log_level, msg, extra=extra, exc_info=exc_info)


# ============================================================
# CONTEXT MANAGER: Auto correlation ID for a run
# ============================================================

@contextmanager
def logging_context(correlation_id: Optional[str] = None):
    """
    Context manager that sets correlation ID for the duration.
    
    All logs within this context will share the same correlation ID,
    making it easy to trace a complete run through the system.
    
    Args:
        correlation_id: Optional custom ID. If None, generates UUID.
    
    Yields:
        The correlation ID being used.
    
    Example:
        with logging_context() as run_id:
            log_event(logger, "run_started")
            # ... all logs in this block share same run_id
            process_data()
            log_event(logger, "run_completed")
        
        # After context, correlation_id is cleared
    """
    cid = set_correlation_id(correlation_id)
    try:
        yield cid
    finally:
        clear_correlation_id()


# ============================================================
# MANIFEST INTEGRATION
# ============================================================

def get_logging_manifest_entry() -> Dict[str, Any]:
    """
    Get logging context info for inclusion in output manifest.
    
    Returns:
        Dict with correlation_id and timestamp for manifest.
    
    Example:
        manifest["_logging"] = get_logging_manifest_entry()
    """
    return {
        "correlation_id": get_correlation_id(),
        "log_timestamp": datetime.now(timezone.utc).isoformat(),
        "log_version": "1.0",
    }


# ============================================================
# STANDARD EVENTS (recommended event names)
# ============================================================

class Events:
    """
    Standard event names for consistency across modules.
    
    Usage:
        log_event(logger, Events.OPTIMIZATION_STARTED, ...)
    """
    # Generation lifecycle
    GENERATION_STARTED = "generation_started"
    GENERATION_COMPLETED = "generation_completed"
    GENERATION_FAILED = "generation_failed"
    
    # Data pipeline
    DATA_FETCH_STARTED = "data_fetch_started"
    DATA_FETCH_COMPLETED = "data_fetch_completed"
    DATA_FETCH_FAILED = "data_fetch_failed"
    DATA_CACHE_HIT = "data_cache_hit"
    DATA_CACHE_MISS = "data_cache_miss"
    
    # Optimization
    OPTIMIZATION_STARTED = "optimization_started"
    OPTIMIZATION_COMPLETED = "optimization_completed"
    OPTIMIZATION_FAILED = "optimization_failed"
    OPTIMIZATION_FALLBACK = "optimization_fallback"
    
    # Covariance
    COVARIANCE_COMPUTED = "covariance_computed"
    COVARIANCE_SHRINKAGE_APPLIED = "covariance_shrinkage_applied"
    COVARIANCE_WARNING = "covariance_warning"
    
    # Constraints
    CONSTRAINTS_VERIFIED = "constraints_verified"
    CONSTRAINTS_VIOLATION = "constraints_violation"
    
    # Backtest
    BACKTEST_STARTED = "backtest_started"
    BACKTEST_COMPLETED = "backtest_completed"
    BACKTEST_FAILED = "backtest_failed"
    
    # Quality gates
    QUALITY_GATE_PASSED = "quality_gate_passed"
    QUALITY_GATE_FAILED = "quality_gate_failed"
    
    # LLM
    LLM_REQUEST_STARTED = "llm_request_started"
    LLM_REQUEST_COMPLETED = "llm_request_completed"
    LLM_SANITIZATION_APPLIED = "llm_sanitization_applied"


# ============================================================
# EXAMPLE USAGE (for documentation)
# ============================================================

def _example_usage():
    """
    Example showing complete usage pattern.
    
    This function is for documentation only.
    """
    # Get logger (safe to call multiple times)
    logger = get_structured_logger("portfolio_engine.optimizer")
    
    # Start a run with correlation ID
    with logging_context() as run_id:
        
        # Log start
        log_event(logger, Events.GENERATION_STARTED,
            message="Starting portfolio generation",
            profile="Agressif",
            n_candidates=150
        )
        
        # Log intermediate steps
        log_event(logger, Events.COVARIANCE_COMPUTED,
            message="Covariance matrix ready",
            condition_number=8102.04,
            shrinkage_lambda=0.02,
            method="diag_shrink"
        )
        
        # Log with exception
        try:
            raise ValueError("Example error")
        except Exception:
            log_event(logger, Events.OPTIMIZATION_FAILED,
                message="Optimization failed",
                level="ERROR",
                exc_info=True,
                profile="Agressif"
            )
        
        # Log completion
        log_event(logger, Events.GENERATION_COMPLETED,
            message="Portfolio generation finished",
            duration_ms=1234,
            n_assets_selected=18
        )
        
        # Include in manifest
        manifest_entry = get_logging_manifest_entry()
        print(f"Manifest entry: {manifest_entry}")
