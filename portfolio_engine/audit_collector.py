#!/usr/bin/env python3
"""
audit_collector.py - Debug audit system for portfolio generation pipeline

Provides structured, diffable audit trails for debugging and compliance.

Features:
- Two audit levels: summary (~100KB) and full (gzip ~500KB)
- Standardized reason codes for aggregation
- Reproducibility metadata (git_sha, config_hash, universe_asof)
- Drift detection vs previous run
- Timing per stage
- Filtering by ticker/profile/stage
- v5.1.1: TOP 10 by preset breakdown

Environment variables:
- DEBUG_AUDIT: none | summary | full (default: none)
- DEBUG_AUDIT_TICKERS: comma-separated list of tickers to trace (default: all)
- DEBUG_AUDIT_PROFILES: comma-separated profiles to trace (default: all)
- DEBUG_AUDIT_STAGES: comma-separated stages to trace (default: all)
- DEBUG_AUDIT_AUTO_FULL_ON_DRIFT: true | false (default: true)
- DEBUG_AUDIT_DRIFT_THRESHOLD: percentage threshold for auto-full (default: 20)

v1.1.0 - Added record_top10_by_preset()
v1.0.0 - Initial version
"""

import os
import json
import gzip
import time
import hashlib
import subprocess
import logging
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Set
from contextlib import contextmanager

logger = logging.getLogger("audit-collector")


# ============= STANDARDIZED REASON CODES =============

class ReasonCode:
    """Standardized rejection reason codes for aggregation."""
    
    # Data quality
    MISSING_DATA = "MISSING_DATA"
    MISSING_VOL = "MISSING_VOL"
    MISSING_ROE = "MISSING_ROE"
    MISSING_DIVIDEND_YIELD = "MISSING_DIVIDEND_YIELD"
    MISSING_PAYOUT = "MISSING_PAYOUT"
    MISSING_COVERAGE = "MISSING_COVERAGE"
    MISSING_CREDIT_RATING = "MISSING_CREDIT_RATING"
    MISSING_DURATION = "MISSING_DURATION"
    
    # Volatility filters
    VOL_TOO_LOW = "VOL_TOO_LOW"
    VOL_TOO_HIGH = "VOL_TOO_HIGH"
    VOL_ABERRANT = "VOL_ABERRANT"
    
    # Quality filters
    ROE_TOO_LOW = "ROE_TOO_LOW"
    BUFFETT_SCORE_LOW = "BUFFETT_SCORE_LOW"
    
    # Dividend filters (yield trap detection)
    DIVIDEND_YIELD_LOW = "DIVIDEND_YIELD_LOW"
    PAYOUT_TOO_HIGH = "PAYOUT_TOO_HIGH"
    COVERAGE_TOO_LOW = "COVERAGE_TOO_LOW"
    
    # Liquidity filters
    MARKET_CAP_LOW = "MARKET_CAP_LOW"
    AUM_LOW = "AUM_LOW"
    VOLUME_LOW = "VOLUME_LOW"
    
    # Bond-specific
    CREDIT_RATING_LOW = "CREDIT_RATING_LOW"
    DURATION_MISMATCH = "DURATION_MISMATCH"
    
    # ETF-specific
    TER_TOO_HIGH = "TER_TOO_HIGH"
    TRACKING_ERROR_HIGH = "TRACKING_ERROR_HIGH"
    
    # Crypto-specific
    CRYPTO_VOL_EXTREME = "CRYPTO_VOL_EXTREME"
    
    # Selection
    QUOTA_REACHED = "QUOTA_REACHED"
    SCORE_INSUFFICIENT = "SCORE_INSUFFICIENT"
    PROFILE_MISMATCH = "PROFILE_MISMATCH"
    
    # RADAR
    SECTOR_AVOIDED = "SECTOR_AVOIDED"
    REGION_AVOIDED = "REGION_AVOIDED"


# Mapping from legacy reasons to standard codes
REASON_CODE_MAPPING = {
    "vol_missing": ReasonCode.MISSING_VOL,
    "vol_aberrant": ReasonCode.VOL_ABERRANT,
    "roe_missing": ReasonCode.MISSING_ROE,
    "div_yield_missing": ReasonCode.MISSING_DIVIDEND_YIELD,
    "payout_missing": ReasonCode.MISSING_PAYOUT,
    "coverage_missing": ReasonCode.MISSING_COVERAGE,
}


def normalize_reason_code(reason: str) -> str:
    """Convert legacy reason strings to standard codes."""
    if reason in REASON_CODE_MAPPING:
        return REASON_CODE_MAPPING[reason]
    
    # Parse dynamic reasons
    if reason.startswith("vol<"):
        return ReasonCode.VOL_TOO_LOW
    if reason.startswith("vol>"):
        return ReasonCode.VOL_TOO_HIGH
    if reason.startswith("roe<"):
        return ReasonCode.ROE_TOO_LOW
    if reason.startswith("div<"):
        return ReasonCode.DIVIDEND_YIELD_LOW
    if reason.startswith("payout>"):
        return ReasonCode.PAYOUT_TOO_HIGH
    if reason.startswith("coverage<"):
        return ReasonCode.COVERAGE_TOO_LOW
    
    # Return as-is if no mapping found (but uppercase for consistency)
    return reason.upper().replace(" ", "_").replace("-", "_")


# ============= CONFIGURATION =============

def get_audit_level() -> str:
    """Get audit level from environment: none | summary | full"""
    return os.getenv("DEBUG_AUDIT", "none").lower()


def should_trace_ticker(ticker: str) -> bool:
    """Check if ticker should be traced based on DEBUG_AUDIT_TICKERS."""
    filter_str = os.getenv("DEBUG_AUDIT_TICKERS", "").strip()
    if not filter_str:
        return True
    allowed = {x.strip().upper() for x in filter_str.split(",") if x.strip()}
    return ticker.upper() in allowed


def should_trace_profile(profile: str) -> bool:
    """Check if profile should be traced based on DEBUG_AUDIT_PROFILES."""
    filter_str = os.getenv("DEBUG_AUDIT_PROFILES", "").strip()
    if not filter_str:
        return True
    allowed = {x.strip().lower() for x in filter_str.split(",") if x.strip()}
    return profile.lower() in allowed


def should_trace_stage(stage: str) -> bool:
    """Check if stage should be traced based on DEBUG_AUDIT_STAGES."""
    filter_str = os.getenv("DEBUG_AUDIT_STAGES", "").strip()
    if not filter_str:
        return True
    allowed = {x.strip().lower() for x in filter_str.split(",") if x.strip()}
    return stage.lower() in allowed


def auto_full_on_drift() -> bool:
    """Check if auto-full on drift is enabled."""
    return os.getenv("DEBUG_AUDIT_AUTO_FULL_ON_DRIFT", "true").lower() == "true"


def drift_threshold() -> float:
    """Get drift threshold percentage for auto-full trigger."""
    try:
        return float(os.getenv("DEBUG_AUDIT_DRIFT_THRESHOLD", "20"))
    except ValueError:
        return 20.0


# ============= METADATA HELPERS =============

def get_git_sha() -> str:
    """Get current git commit SHA."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def get_git_sha_full() -> str:
    """Get full git commit SHA."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def compute_config_hash(config: Dict) -> str:
    """Compute a hash of the configuration for reproducibility."""
    config_str = json.dumps(config, sort_keys=True, default=str)
    return hashlib.md5(config_str.encode()).hexdigest()[:8]


def generate_run_id() -> str:
    """Generate a unique run ID."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d-%H-%M-%S")


# ============= SCORE STATISTICS =============

@dataclass
class ScoreStats:
    """Statistics for a set of scores."""
    n: int = 0
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    
    @classmethod
    def from_values(cls, values: List[float]) -> "ScoreStats":
        """Compute statistics from a list of values."""
        if not values:
            return cls(n=0)
        
        import statistics
        n = len(values)
        sorted_vals = sorted(values)
        
        return cls(
            n=n,
            min=round(sorted_vals[0], 4),
            max=round(sorted_vals[-1], 4),
            mean=round(statistics.mean(values), 4),
            median=round(statistics.median(values), 4),
            std=round(statistics.stdev(values), 4) if n > 1 else 0.0,
        )
    
    def to_dict(self) -> Dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


# ============= STAGE DATA =============

@dataclass
class StageData:
    """Data for a single pipeline stage."""
    name: str
    category: Optional[str] = None
    profile: Optional[str] = None
    before_count: int = 0
    after_count: int = 0
    reason_counts: Dict[str, int] = field(default_factory=dict)
    score_stats: Optional[ScoreStats] = None
    top_k: List[Dict] = field(default_factory=list)
    bottom_k: List[Dict] = field(default_factory=list)
    duration_sec: Optional[float] = None
    extra: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        d = {
            "name": self.name,
            "before": self.before_count,
            "after": self.after_count,
            "rejected": self.before_count - self.after_count,
        }
        if self.category:
            d["category"] = self.category
        if self.profile:
            d["profile"] = self.profile
        if self.reason_counts:
            d["reason_counts"] = self.reason_counts
        if self.score_stats:
            d["score_stats"] = self.score_stats.to_dict()
        if self.top_k:
            d["top_k"] = self.top_k
        if self.bottom_k:
            d["bottom_k"] = self.bottom_k
        if self.duration_sec is not None:
            d["duration_sec"] = round(self.duration_sec, 3)
        if self.extra:
            d.update(self.extra)
        return d


# ============= TRACE ROW =============

@dataclass
class TraceRow:
    """Single asset trace row for full audit."""
    ticker: str
    category: str
    last_stage: str
    status: str  # "kept" | "rejected"
    reason_code: Optional[str] = None
    profile: Optional[str] = None
    scores_raw: Dict[str, float] = field(default_factory=dict)
    scores_normalized: Dict[str, float] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        d = {
            "ticker": self.ticker,
            "category": self.category,
            "last_stage": self.last_stage,
            "status": self.status,
        }
        if self.reason_code:
            d["reason_code"] = self.reason_code
        if self.profile:
            d["profile"] = self.profile
        if self.scores_raw:
            d["scores_raw"] = self.scores_raw
        if self.scores_normalized:
            d["scores_normalized"] = self.scores_normalized
        if self.metrics:
            d["metrics"] = self.metrics
        return d


# ============= DRIFT DETECTION =============

@dataclass
class DriftReport:
    """Drift detection report vs previous run."""
    has_drift: bool = False
    drift_percentage: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "has_drift": self.has_drift,
            "drift_pct": round(self.drift_percentage, 2),
            "details": self.details,
        }


def compute_drift(current: Dict, previous: Dict, threshold: float = 20.0) -> DriftReport:
    """
    Compute drift between current and previous run summaries.
    
    Returns DriftReport with has_drift=True if any metric exceeds threshold.
    """
    if not previous:
        return DriftReport(has_drift=False, drift_percentage=0.0)
    
    details = {}
    max_drift = 0.0
    
    # Compare stage counts
    curr_stages = current.get("pipeline_stages", {})
    prev_stages = previous.get("pipeline_stages", {})
    
    for stage_name, curr_data in curr_stages.items():
        if stage_name not in prev_stages:
            continue
        
        prev_data = prev_stages[stage_name]
        
        # Compare counts
        for key in ["after", "equity", "etf", "crypto", "bond"]:
            curr_val = curr_data.get(key)
            prev_val = prev_data.get(key)
            
            if curr_val is not None and prev_val is not None and prev_val > 0:
                pct_change = abs(curr_val - prev_val) / prev_val * 100
                if pct_change > 0:
                    details[f"{stage_name}.{key}"] = {
                        "current": curr_val,
                        "previous": prev_val,
                        "delta": curr_val - prev_val,
                        "pct_change": round(pct_change, 2),
                    }
                    max_drift = max(max_drift, pct_change)
    
    return DriftReport(
        has_drift=max_drift > threshold,
        drift_percentage=max_drift,
        details=details,
    )


# ============= MAIN AUDIT COLLECTOR =============

class AuditCollector:
    """
    Main audit collector class.
    
    Usage:
        collector = AuditCollector(config=my_config)
        
        with collector.stage("buffett_filter", category="equity") as stage:
            stage.before_count = len(before)
            # ... do filtering ...
            stage.after_count = len(after)
            stage.reason_counts = {"BUFFETT_SCORE_LOW": 15}
        
        collector.add_trace(TraceRow(...))
        collector.dump("data/")
    """
    
    def __init__(
        self,
        config: Dict = None,
        universe_asof: str = None,
        previous_summary_path: str = None,
    ):
        self.config = config or {}
        self.run_id = generate_run_id()
        self.git_sha = get_git_sha()
        self.git_sha_full = get_git_sha_full()
        self.config_hash = compute_config_hash(self.config)
        self.universe_asof = universe_asof or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self.timestamp_utc = datetime.now(timezone.utc).isoformat()
        
        self.stages: Dict[str, StageData] = {}
        self.trace_rows: List[TraceRow] = []
        self.timings: Dict[str, float] = {}
        self._stage_order: List[str] = []
        
        # v5.1.1: Top 10 by preset storage
        self._top10_by_preset: Dict[str, Dict] = {}
        
        # Load previous summary for drift detection
        self.previous_summary: Optional[Dict] = None
        if previous_summary_path and Path(previous_summary_path).exists():
            try:
                with open(previous_summary_path, "r", encoding="utf-8") as f:
                    self.previous_summary = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load previous summary: {e}")
        
        self._level = get_audit_level()
        self._start_time = time.time()
        
        logger.info(f"📊 AuditCollector initialized: level={self._level}, run_id={self.run_id}")
    
    @property
    def is_enabled(self) -> bool:
        """Check if audit collection is enabled."""
        return self._level in ("summary", "full")
    
    @property
    def is_full(self) -> bool:
        """Check if full trace is enabled."""
        return self._level == "full"
    
    @contextmanager
    def stage(
        self,
        name: str,
        category: str = None,
        profile: str = None,
    ):
        """
        Context manager for tracking a pipeline stage.
        
        Usage:
            with collector.stage("buffett_filter", category="equity") as s:
                s.before_count = 1000
                # ... processing ...
                s.after_count = 800
                s.reason_counts = {"BUFFETT_SCORE_LOW": 200}
        """
        if not self.is_enabled:
            yield StageData(name=name)
            return
        
        if not should_trace_stage(name):
            yield StageData(name=name)
            return
        
        if profile and not should_trace_profile(profile):
            yield StageData(name=name)
            return
        
        stage_data = StageData(name=name, category=category, profile=profile)
        start_time = time.time()
        
        try:
            yield stage_data
        finally:
            stage_data.duration_sec = time.time() - start_time
            
            # Generate unique key for stage
            key = name
            if profile:
                key = f"{name}_{profile}"
            if category:
                key = f"{key}_{category}"
            
            self.stages[key] = stage_data
            if key not in self._stage_order:
                self._stage_order.append(key)
            
            self.timings[key] = stage_data.duration_sec
            
            logger.debug(
                f"📊 Stage {key}: {stage_data.before_count} → {stage_data.after_count} "
                f"({stage_data.duration_sec:.2f}s)"
            )
    
    def add_trace(self, row: TraceRow):
        """Add a trace row for full audit."""
        if not self.is_full:
            return
        
        if not should_trace_ticker(row.ticker):
            return
        
        if row.profile and not should_trace_profile(row.profile):
            return
        
        self.trace_rows.append(row)
    
    def add_traces_batch(
        self,
        assets: List[Dict],
        category: str,
        stage: str,
        status: str,
        reason_code: str = None,
        profile: str = None,
    ):
        """Add trace rows for a batch of assets."""
        if not self.is_full:
            return
        
        for asset in assets:
            ticker = asset.get("ticker") or asset.get("symbol") or asset.get("name", "UNKNOWN")
            
            if not should_trace_ticker(ticker):
                continue
            
            # Extract scores
            scores_raw = {}
            scores_normalized = {}
            
            for key in ["buffett_score", "_buffett_score", "composite_score", "_composite_score",
                        "_profile_score", "_momentum_score", "_quality_score"]:
                val = asset.get(key)
                if val is not None:
                    clean_key = key.lstrip("_")
                    scores_raw[clean_key] = round(float(val), 4)
            
            factor_scores = asset.get("factor_scores", {})
            if factor_scores:
                scores_normalized = {k: round(float(v), 4) for k, v in factor_scores.items() if v is not None}
            
            # Extract key metrics
            metrics = {}
            for key in ["volatility_3y", "vol", "roe", "market_cap", "aum", "ter", "dividend_yield"]:
                val = asset.get(key)
                if val is not None:
                    metrics[key] = val
            
            row = TraceRow(
                ticker=ticker,
                category=category,
                last_stage=stage,
                status=status,
                reason_code=reason_code,
                profile=profile,
                scores_raw=scores_raw,
                scores_normalized=scores_normalized,
                metrics=metrics,
            )
            self.trace_rows.append(row)
    
    def record_initial_universe(
        self,
        equity_count: int = 0,
        etf_count: int = 0,
        crypto_count: int = 0,
        bond_count: int = 0,
    ):
        """Record initial universe counts."""
        if not self.is_enabled:
            return
        
        stage = StageData(
            name="initial_universe",
            before_count=equity_count + etf_count + crypto_count + bond_count,
            after_count=equity_count + etf_count + crypto_count + bond_count,
            extra={
                "equity": equity_count,
                "etf": etf_count,
                "crypto": crypto_count,
                "bond": bond_count,
            }
        )
        self.stages["1_initial"] = stage
        self._stage_order.insert(0, "1_initial")
    
    def record_scoring_stats(
        self,
        category: str,
        scores: List[float],
        top_k: List[Dict] = None,
        bottom_k: List[Dict] = None,
    ):
        """Record scoring statistics for a category."""
        if not self.is_enabled:
            return
        
        key = f"4_scoring_{category}"
        
        stage = StageData(
            name=f"scoring_{category}",
            category=category,
            before_count=len(scores),
            after_count=len(scores),
            score_stats=ScoreStats.from_values(scores),
            top_k=top_k or [],
            bottom_k=bottom_k or [],
        )
        self.stages[key] = stage
        if key not in self._stage_order:
            self._stage_order.append(key)
    
    def record_final_selection(
        self,
        category: str,
        selected: List[Dict],
        profile: str = None,
    ):
        """Record final selection for a category/profile."""
        if not self.is_enabled:
            return
        
        key = f"5_selection_{category}"
        if profile:
            key = f"{key}_{profile}"
        
        top_k = []
        for asset in selected[:10]:
            ticker = asset.get("ticker") or asset.get("symbol", "?")
            score = asset.get("composite_score") or asset.get("_profile_score") or asset.get("_composite_score")
            entry = {"ticker": ticker}
            if score is not None:
                entry["score"] = round(float(score), 4)
            top_k.append(entry)
        
        stage = StageData(
            name=f"selection_{category}",
            category=category,
            profile=profile,
            before_count=len(selected),
            after_count=len(selected),
            top_k=top_k,
        )
        self.stages[key] = stage
        if key not in self._stage_order:
            self._stage_order.append(key)
    
    def record_top10_by_preset(
        self,
        equities: List[Dict],
        etfs: List[Dict] = None,
        cryptos: List[Dict] = None,
        bonds: List[Dict] = None,
    ):
        """
        v5.1.1: Record TOP 10 assets for each preset.
        
        Output structure:
        {
            "equity": {
                "quality_premium": {"count": 67, "top_10": [{"ticker": "AAPL", "score": 0.85, "vol": 25.2}, ...]},
                "croissance": {...},
                "defensif": {...},
                ...
            },
            "etf": {"top_20": [...]},
            "crypto": {"top_20": [...]},
            "bond": {"top_20": [...]}
        }
        """
        if not self.is_enabled:
            return
        
        result = {"equity": {}, "etf": {}, "crypto": {}, "bond": {}}
        
        # === EQUITY: group by _matched_preset ===
        preset_groups = {}
        for eq in equities:
            preset = eq.get("_matched_preset", "unknown")
            preset_groups.setdefault(preset, []).append(eq)
        
        for preset_name, assets in sorted(preset_groups.items()):
            # Sort by best score
            sorted_assets = sorted(
                assets,
                key=lambda x: x.get("_profile_score") or x.get("_buffett_score") or x.get("composite_score") or 0,
                reverse=True
            )[:10]
            
            top_10 = []
            for a in sorted_assets:
                ticker = a.get("ticker") or a.get("symbol") or a.get("name", "?")
                score = a.get("_profile_score") or a.get("_buffett_score") or a.get("composite_score")
                vol = a.get("volatility_3y") or a.get("vol")
                entry = {"ticker": ticker}
                if score is not None:
                    entry["score"] = round(float(score), 4)
                if vol is not None:
                    try:
                        entry["vol"] = round(float(vol), 1)
                    except (ValueError, TypeError):
                        pass
                top_10.append(entry)
            
            result["equity"][preset_name] = {
                "count": len(assets),
                "top_10": top_10
            }
        
        # === ETF: top 20 by score ===
        if etfs:
            etf_sorted = sorted(
                etfs,
                key=lambda x: x.get("composite_score") or x.get("score") or 0,
                reverse=True
            )[:20]
            
            result["etf"]["top_20"] = [
                {
                    "ticker": e.get("ticker") or e.get("symbol", "?"),
                    "name": (e.get("name") or "")[:35],
                    "score": round(float(e.get("composite_score") or e.get("score") or 0), 4),
                }
                for e in etf_sorted
            ]
            result["etf"]["total_count"] = len(etfs)
        
        # === CRYPTO: top 20 by score ===
        if cryptos:
            crypto_sorted = sorted(
                cryptos,
                key=lambda x: x.get("composite_score") or x.get("score") or 0,
                reverse=True
            )[:20]
            
            result["crypto"]["top_20"] = [
                {
                    "ticker": c.get("ticker") or c.get("symbol", "?"),
                    "name": (c.get("name") or "")[:25],
                    "score": round(float(c.get("composite_score") or c.get("score") or 0), 4),
                }
                for c in crypto_sorted
            ]
            result["crypto"]["total_count"] = len(cryptos)
        
        # === BONDS: top 20 by score ===
        if bonds:
            bond_sorted = sorted(
                bonds,
                key=lambda x: x.get("composite_score") or x.get("score") or 0,
                reverse=True
            )[:20]
            
            result["bond"]["top_20"] = [
                {
                    "ticker": b.get("ticker") or b.get("symbol", "?"),
                    "name": (b.get("name") or "")[:35],
                    "score": round(float(b.get("composite_score") or b.get("score") or 0), 4),
                }
                for b in bond_sorted
            ]
            result["bond"]["total_count"] = len(bonds)
        
        # Store for later inclusion in summary
        self._top10_by_preset = result
        
        logger.info(f"📊 Top10 by preset recorded: {len(result['equity'])} equity presets")
    
    def build_summary(self) -> Dict:
        """Build the summary JSON structure."""
        total_duration = time.time() - self._start_time
        
        # Organize stages
        pipeline_stages = {}
        for key in self._stage_order:
            if key in self.stages:
                pipeline_stages[key] = self.stages[key].to_dict()
        
        summary = {
            "schema_version": 1,
            "meta": {
                "run_id": self.run_id,
                "git_sha": self.git_sha,
                "git_sha_full": self.git_sha_full,
                "config_hash": self.config_hash,
                "universe_asof": self.universe_asof,
                "timestamp_utc": self.timestamp_utc,
                "audit_level": self._level,
                "total_duration_sec": round(total_duration, 2),
            },
            "config_snapshot": {
                k: v for k, v in self.config.items()
                if k in ["buffett_mode", "buffett_min_score", "tactical_mode", "use_tactical_context"]
            },
            "timings_sec": {k: round(v, 3) for k, v in self.timings.items()},
            "pipeline_stages": pipeline_stages,
        }
        
        # v5.1.1: Add top10 by preset if recorded
        if self._top10_by_preset:
            summary["top10_by_preset"] = self._top10_by_preset
        
        # Add drift report if previous summary available
        if self.previous_summary:
            drift = compute_drift(summary, self.previous_summary, drift_threshold())
            summary["drift_vs_previous"] = drift.to_dict()
            
            # Auto-upgrade to full if drift detected and enabled
            if drift.has_drift and auto_full_on_drift() and self._level == "summary":
                logger.warning(
                    f"⚠️ Drift detected ({drift.drift_percentage:.1f}% > {drift_threshold()}%), "
                    f"upgrading to full trace"
                )
                self._level = "full"
        
        return summary
    
    def dump(self, out_dir: str = "data"):
        """
        Dump audit files to output directory.
        
        Creates:
        - selection_debug.json (summary, always if enabled)
        - selection_trace.jsonl.gz (full trace, only if level=full)
        """
        if not self.is_enabled:
            logger.info("📊 Audit disabled, skipping dump")
            return
        
        out_path = Path(out_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        
        # Build and save summary
        summary = self.build_summary()
        
        summary_path = out_path / "selection_debug.json"
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Audit summary saved: {summary_path} ({summary_path.stat().st_size / 1024:.1f} KB)")
        
        # Save full trace if enabled
        if self.is_full and self.trace_rows:
            trace_path = out_path / "selection_trace.jsonl.gz"
            with gzip.open(trace_path, "wt", encoding="utf-8") as f:
                for row in self.trace_rows:
                    f.write(json.dumps(row.to_dict(), ensure_ascii=False) + "\n")
            
            logger.info(
                f"✅ Audit trace saved: {trace_path} "
                f"({trace_path.stat().st_size / 1024:.1f} KB, {len(self.trace_rows)} rows)"
            )
    
    def dump_on_failure(self, out_dir: str = "data", error: Exception = None):
        """
        Dump full audit on pipeline failure.
        
        Always dumps full trace regardless of DEBUG_AUDIT level.
        """
        logger.warning(f"🚨 Pipeline failure detected, dumping full audit trace")
        
        # Force full level
        original_level = self._level
        self._level = "full"
        
        # Add error info to summary
        summary = self.build_summary()
        summary["meta"]["failure"] = True
        if error:
            summary["meta"]["error_type"] = type(error).__name__
            summary["meta"]["error_message"] = str(error)[:500]
        
        out_path = Path(out_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        
        # Save summary with failure marker
        summary_path = out_path / "selection_debug_FAILURE.json"
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        # Save trace
        if self.trace_rows:
            trace_path = out_path / "selection_trace_FAILURE.jsonl.gz"
            with gzip.open(trace_path, "wt", encoding="utf-8") as f:
                for row in self.trace_rows:
                    f.write(json.dumps(row.to_dict(), ensure_ascii=False) + "\n")
            
            logger.info(f"✅ Failure trace saved: {trace_path}")
        
        # Restore original level
        self._level = original_level


# ============= SINGLETON INSTANCE =============

_collector: Optional[AuditCollector] = None


def init_audit(
    config: Dict = None,
    universe_asof: str = None,
    previous_summary_path: str = "data/selection_debug.json",
) -> AuditCollector:
    """
    Initialize the global audit collector.
    
    Call this at the start of the pipeline.
    """
    global _collector
    _collector = AuditCollector(
        config=config,
        universe_asof=universe_asof,
        previous_summary_path=previous_summary_path,
    )
    return _collector


def get_audit() -> Optional[AuditCollector]:
    """Get the global audit collector instance."""
    return _collector


def audit_enabled() -> bool:
    """Check if audit is enabled."""
    return _collector is not None and _collector.is_enabled


# ============= CONVENIENCE DECORATORS =============

def audit_stage(name: str, category: str = None, profile: str = None):
    """
    Decorator to automatically track a function as a pipeline stage.
    
    Usage:
        @audit_stage("buffett_filter", category="equity")
        def apply_buffett_filter(assets):
            # ...
            return filtered_assets
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            collector = get_audit()
            if collector is None or not collector.is_enabled:
                return func(*args, **kwargs)
            
            with collector.stage(name, category=category, profile=profile) as stage:
                # Try to get before count from first argument
                if args and hasattr(args[0], "__len__"):
                    stage.before_count = len(args[0])
                
                result = func(*args, **kwargs)
                
                # Try to get after count from result
                if result is not None and hasattr(result, "__len__"):
                    stage.after_count = len(result)
                
                return result
        
        return wrapper
    return decorator
