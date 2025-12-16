# portfolio_engine/structured_logging.py
"""
Module de logging structuré JSON pour le Portfolio Engine.

P2-10: Logs structurés + correlation_id pour monitoring et debug.

V1.0.0 (2025-12-16):
- StructuredFormatter: Format JSON pour chaque log
- correlation_id: ID unique par run pour traçabilité
- Contexte enrichi: profile, metrics, durations
- Compatible avec Datadog/Grafana/CloudWatch

USAGE:
    from portfolio_engine.structured_logging import (
        setup_structured_logging,
        get_correlation_id,
        log_with_context,
    )
    
    # Au début du run
    setup_structured_logging(correlation_id="run_20251216_130332")
    
    # Dans le code
    log_with_context(
        logger, "INFO", "ETF deduplication completed",
        profile="Agressif",
        context={"before": 993, "after": 592}
    )
"""

import os
import sys
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, Callable
from contextvars import ContextVar
from dataclasses import dataclass, field, asdict
from functools import wraps
import time

__version__ = "1.0.0"


# =============================================================================
# CONTEXT VARIABLES (Thread-safe)
# =============================================================================

# Correlation ID pour ce run (thread-safe)
_correlation_id: ContextVar[str] = ContextVar('correlation_id', default='')

# Profile courant (pour enrichir les logs automatiquement)
_current_profile: ContextVar[str] = ContextVar('current_profile', default='')

# Run metadata
_run_metadata: ContextVar[Dict[str, Any]] = ContextVar('run_metadata', default={})


def get_correlation_id() -> str:
    """Retourne le correlation_id du run courant."""
    return _correlation_id.get()


def set_correlation_id(correlation_id: str) -> None:
    """Définit le correlation_id pour ce run."""
    _correlation_id.set(correlation_id)


def get_current_profile() -> str:
    """Retourne le profil courant."""
    return _current_profile.get()


def set_current_profile(profile: str) -> None:
    """Définit le profil courant pour enrichir les logs."""
    _current_profile.set(profile)


def get_run_metadata() -> Dict[str, Any]:
    """Retourne les métadonnées du run."""
    return _run_metadata.get()


def set_run_metadata(metadata: Dict[str, Any]) -> None:
    """Définit les métadonnées du run."""
    _run_metadata.set(metadata)


def generate_correlation_id() -> str:
    """Génère un correlation_id unique pour ce run."""
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    unique_suffix = uuid.uuid4().hex[:8]
    return f"run_{timestamp}_{unique_suffix}"


# =============================================================================
# STRUCTURED LOG ENTRY
# =============================================================================

@dataclass
class StructuredLogEntry:
    """Entrée de log structurée."""
    
    timestamp: str
    level: str
    logger: str
    message: str
    correlation_id: str = ""
    profile: str = ""
    context: Dict[str, Any] = field(default_factory=dict)
    duration_ms: Optional[float] = None
    error: Optional[Dict[str, Any]] = None
    
    # Metadata
    version: str = __version__
    environment: str = field(default_factory=lambda: os.environ.get("ENV", "development"))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dict, excluant les valeurs None/vides."""
        data = asdict(self)
        # Remove empty/None values for cleaner JSON
        return {k: v for k, v in data.items() if v is not None and v != "" and v != {}}
    
    def to_json(self) -> str:
        """Sérialise en JSON."""
        return json.dumps(self.to_dict(), ensure_ascii=False, default=str)


# =============================================================================
# STRUCTURED FORMATTER
# =============================================================================

class StructuredFormatter(logging.Formatter):
    """
    Formatter qui produit des logs JSON structurés.
    
    Chaque ligne de log devient un objet JSON avec:
    - timestamp ISO8601
    - level (INFO, WARNING, ERROR, etc.)
    - logger name
    - message
    - correlation_id (pour tracer un run complet)
    - profile (si défini)
    - context (données additionnelles)
    """
    
    def __init__(self, include_stack_info: bool = False):
        super().__init__()
        self.include_stack_info = include_stack_info
    
    def format(self, record: logging.LogRecord) -> str:
        """Formate le LogRecord en JSON."""
        
        # Build structured entry
        entry = StructuredLogEntry(
            timestamp=datetime.utcnow().isoformat() + "Z",
            level=record.levelname,
            logger=record.name,
            message=record.getMessage(),
            correlation_id=get_correlation_id(),
            profile=get_current_profile(),
        )
        
        # Add context if provided via extra
        if hasattr(record, 'context') and record.context:
            entry.context = record.context
        
        # Add profile override if provided via extra
        if hasattr(record, 'profile') and record.profile:
            entry.profile = record.profile
        
        # Add duration if provided
        if hasattr(record, 'duration_ms'):
            entry.duration_ms = record.duration_ms
        
        # Add error info for exceptions
        if record.exc_info:
            entry.error = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else "Unknown",
                "message": str(record.exc_info[1]) if record.exc_info[1] else "",
            }
            if self.include_stack_info and record.exc_text:
                entry.error["stack_trace"] = record.exc_text
        
        return entry.to_json()


class HybridFormatter(logging.Formatter):
    """
    Formatter hybride: JSON structuré pour fichiers, human-readable pour console.
    
    Détecte automatiquement si la sortie est un TTY (terminal) ou non.
    """
    
    def __init__(
        self,
        human_format: str = "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        force_json: bool = False,
        force_human: bool = False,
    ):
        super().__init__(human_format)
        self.human_format = human_format
        self.json_formatter = StructuredFormatter()
        self.force_json = force_json
        self.force_human = force_human
    
    def format(self, record: logging.LogRecord) -> str:
        """Formate selon le contexte (TTY vs fichier)."""
        
        if self.force_json:
            return self.json_formatter.format(record)
        
        if self.force_human:
            return super().format(record)
        
        # Auto-detect: JSON for non-TTY (files, pipes), human for terminals
        if hasattr(sys.stdout, 'isatty') and sys.stdout.isatty():
            return super().format(record)
        else:
            return self.json_formatter.format(record)


# =============================================================================
# SETUP FUNCTIONS
# =============================================================================

def setup_structured_logging(
    correlation_id: Optional[str] = None,
    level: int = logging.INFO,
    force_json: bool = False,
    force_human: bool = False,
    log_file: Optional[str] = None,
    run_metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Configure le logging structuré pour le run.
    
    Args:
        correlation_id: ID unique pour ce run (auto-généré si None)
        level: Niveau de log (default: INFO)
        force_json: Force le format JSON même sur terminal
        force_human: Force le format human-readable même en fichier
        log_file: Fichier de log optionnel (toujours JSON)
        run_metadata: Métadonnées du run à inclure
    
    Returns:
        Le correlation_id utilisé
    """
    # Generate or use provided correlation_id
    if correlation_id is None:
        correlation_id = generate_correlation_id()
    
    set_correlation_id(correlation_id)
    
    # Store run metadata
    if run_metadata:
        set_run_metadata(run_metadata)
    
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Remove existing handlers
    root_logger.handlers.clear()
    
    # Console handler (hybrid: human for TTY, JSON otherwise)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(HybridFormatter(
        force_json=force_json,
        force_human=force_human,
    ))
    root_logger.addHandler(console_handler)
    
    # File handler (always JSON)
    if log_file:
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(level)
        file_handler.setFormatter(StructuredFormatter())
        root_logger.addHandler(file_handler)
    
    return correlation_id


def get_logger(name: str) -> logging.Logger:
    """
    Retourne un logger configuré avec les méthodes contextuelles.
    
    Usage:
        logger = get_logger(__name__)
        logger.info("Message", extra={"context": {"key": "value"}})
    """
    return logging.getLogger(name)


# =============================================================================
# CONTEXTUAL LOGGING HELPERS
# =============================================================================

def log_with_context(
    logger: logging.Logger,
    level: str,
    message: str,
    profile: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    **kwargs
) -> None:
    """
    Log un message avec contexte structuré.
    
    Args:
        logger: Logger à utiliser
        level: Niveau (INFO, WARNING, ERROR, DEBUG)
        message: Message principal
        profile: Profil de portefeuille (override le contexte global)
        context: Données contextuelles additionnelles
        duration_ms: Durée de l'opération en ms
        **kwargs: Arguments supplémentaires pour le logger
    """
    extra = {
        'context': context or {},
        'profile': profile or get_current_profile(),
    }
    
    if duration_ms is not None:
        extra['duration_ms'] = duration_ms
    
    level_map = {
        'DEBUG': logging.DEBUG,
        'INFO': logging.INFO,
        'WARNING': logging.WARNING,
        'ERROR': logging.ERROR,
        'CRITICAL': logging.CRITICAL,
    }
    
    log_level = level_map.get(level.upper(), logging.INFO)
    logger.log(log_level, message, extra=extra, **kwargs)


class LogContext:
    """
    Context manager pour logger automatiquement la durée d'une opération.
    
    Usage:
        with LogContext(logger, "Optimisation portfolio", profile="Agressif"):
            # ... code ...
        # Log automatique avec duration_ms
    """
    
    def __init__(
        self,
        logger: logging.Logger,
        operation: str,
        profile: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        level_start: str = "INFO",
        level_end: str = "INFO",
    ):
        self.logger = logger
        self.operation = operation
        self.profile = profile
        self.context = context or {}
        self.level_start = level_start
        self.level_end = level_end
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        log_with_context(
            self.logger,
            self.level_start,
            f"Starting: {self.operation}",
            profile=self.profile,
            context=self.context,
        )
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.perf_counter() - self.start_time) * 1000
        
        if exc_type:
            log_with_context(
                self.logger,
                "ERROR",
                f"Failed: {self.operation}",
                profile=self.profile,
                context={**self.context, "error": str(exc_val)},
                duration_ms=duration_ms,
            )
        else:
            log_with_context(
                self.logger,
                self.level_end,
                f"Completed: {self.operation}",
                profile=self.profile,
                context=self.context,
                duration_ms=duration_ms,
            )
        
        return False  # Don't suppress exceptions


def timed_operation(
    logger: logging.Logger,
    operation: str,
    profile: Optional[str] = None,
):
    """
    Décorateur pour logger automatiquement la durée d'une fonction.
    
    Usage:
        @timed_operation(logger, "Calcul covariance")
        def compute_covariance(data):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            with LogContext(logger, operation, profile=profile):
                return func(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# SPECIALIZED LOGGERS
# =============================================================================

class PortfolioLogger:
    """
    Logger spécialisé pour le portfolio engine avec méthodes contextuelles.
    
    Usage:
        plogger = PortfolioLogger("portfolio_engine.optimizer")
        plogger.optimization_started("Agressif", n_assets=50)
        plogger.optimization_completed("Agressif", vol=17.6, n_selected=10, duration_ms=150)
    """
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
    
    def optimization_started(self, profile: str, **context):
        """Log le début d'une optimisation."""
        log_with_context(
            self.logger, "INFO",
            f"Starting optimization for {profile}",
            profile=profile,
            context={"event": "optimization_started", **context},
        )
    
    def optimization_completed(
        self,
        profile: str,
        vol: float,
        n_selected: int,
        duration_ms: float,
        mode: str = "slsqp",
        **context
    ):
        """Log la fin d'une optimisation."""
        log_with_context(
            self.logger, "INFO",
            f"Optimization completed for {profile}: {n_selected} assets, vol={vol:.1f}%",
            profile=profile,
            context={
                "event": "optimization_completed",
                "volatility_pct": vol,
                "n_assets_selected": n_selected,
                "optimization_mode": mode,
                **context,
            },
            duration_ms=duration_ms,
        )
    
    def covariance_warning(self, profile: str, condition_number: float, threshold: float = 1000.0):
        """Log un warning de matrice de covariance mal conditionnée."""
        log_with_context(
            self.logger, "WARNING",
            f"Covariance matrix ill-conditioned for {profile}",
            profile=profile,
            context={
                "event": "covariance_warning",
                "condition_number": condition_number,
                "threshold": threshold,
                "action": "using_regularization",
            },
        )
    
    def fallback_used(self, profile: str, reason: str, fallback_type: str = "heuristic"):
        """Log l'utilisation d'un fallback."""
        log_with_context(
            self.logger, "WARNING",
            f"Fallback used for {profile}: {fallback_type}",
            profile=profile,
            context={
                "event": "fallback_used",
                "fallback_type": fallback_type,
                "reason": reason,
            },
        )
    
    def constraint_violation(
        self,
        profile: str,
        constraint_name: str,
        expected: Any,
        actual: Any,
        priority: str = "hard",
    ):
        """Log une violation de contrainte."""
        level = "ERROR" if priority == "hard" else "WARNING"
        log_with_context(
            self.logger, level,
            f"Constraint violation for {profile}: {constraint_name}",
            profile=profile,
            context={
                "event": "constraint_violation",
                "constraint_name": constraint_name,
                "expected": expected,
                "actual": actual,
                "priority": priority,
            },
        )
    
    def data_loaded(self, source: str, n_items: int, **context):
        """Log le chargement de données."""
        log_with_context(
            self.logger, "INFO",
            f"Loaded {n_items} items from {source}",
            context={
                "event": "data_loaded",
                "source": source,
                "n_items": n_items,
                **context,
            },
        )
    
    def backtest_completed(
        self,
        profile: str,
        return_pct: float,
        sharpe: Optional[float],
        duration_ms: float,
        **context
    ):
        """Log la fin d'un backtest."""
        log_with_context(
            self.logger, "INFO",
            f"Backtest completed for {profile}: return={return_pct:.2f}%",
            profile=profile,
            context={
                "event": "backtest_completed",
                "return_pct": return_pct,
                "sharpe_ratio": sharpe,
                **context,
            },
            duration_ms=duration_ms,
        )


# =============================================================================
# QUERY HELPERS (for log analysis)
# =============================================================================

def parse_structured_log_line(line: str) -> Optional[Dict[str, Any]]:
    """
    Parse une ligne de log structuré JSON.
    
    Utile pour analyser les fichiers de log.
    """
    try:
        return json.loads(line.strip())
    except json.JSONDecodeError:
        return None


def filter_logs_by_correlation_id(
    log_lines: list,
    correlation_id: str,
) -> list:
    """Filtre les logs par correlation_id."""
    results = []
    for line in log_lines:
        parsed = parse_structured_log_line(line)
        if parsed and parsed.get('correlation_id') == correlation_id:
            results.append(parsed)
    return results


def filter_logs_by_profile(
    log_lines: list,
    profile: str,
) -> list:
    """Filtre les logs par profile."""
    results = []
    for line in log_lines:
        parsed = parse_structured_log_line(line)
        if parsed and parsed.get('profile') == profile:
            results.append(parsed)
    return results


def filter_logs_by_level(
    log_lines: list,
    levels: list,
) -> list:
    """Filtre les logs par niveau (INFO, WARNING, ERROR, etc.)."""
    results = []
    levels_upper = [l.upper() for l in levels]
    for line in log_lines:
        parsed = parse_structured_log_line(line)
        if parsed and parsed.get('level') in levels_upper:
            results.append(parsed)
    return results


# =============================================================================
# CLI / TEST
# =============================================================================

if __name__ == "__main__":
    # Test du module
    cid = setup_structured_logging(force_json=True)
    
    logger = get_logger("test")
    plogger = PortfolioLogger("portfolio_engine.test")
    
    print(f"\n📋 Testing structured logging (correlation_id={cid})\n")
    
    # Test basic logging
    log_with_context(
        logger, "INFO", "Test message",
        context={"key": "value", "number": 42}
    )
    
    # Test portfolio logger
    set_current_profile("Agressif")
    plogger.optimization_started("Agressif", n_assets=50, universe_size=1000)
    plogger.covariance_warning("Agressif", condition_number=2042133.2)
    plogger.optimization_completed(
        "Agressif", vol=17.6, n_selected=10, duration_ms=150.5, mode="slsqp"
    )
    
    # Test timed context
    with LogContext(logger, "Test operation", profile="Test"):
        import time
        time.sleep(0.1)
    
    print("\n✅ Structured logging test completed")
