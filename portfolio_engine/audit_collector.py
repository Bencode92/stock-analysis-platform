#!/usr/bin/env python3
"""
audit_collector.py - Debug audit system for portfolio generation pipeline

v5.1.2: Detailed top10_by_preset with ALL filter metrics
- EQUITY: buffett, vol, roe, div_yield, payout, perf_ytd, perf_1y, mcap, sector
- ETF: ter, aum, perf_ytd, perf_1y, perf_3y, vol (filtered: TER<1%, perf_1y>0%)
- CRYPTO: mcap, vol, perf_24h, perf_7d, perf_30d (filtered: mcap>100M, vol<200%)
- BOND: yield, rating, duration, maturity

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
    
    MISSING_DATA = "MISSING_DATA"
    MISSING_VOL = "MISSING_VOL"
    MISSING_ROE = "MISSING_ROE"
    MISSING_DIVIDEND_YIELD = "MISSING_DIVIDEND_YIELD"
    MISSING_PAYOUT = "MISSING_PAYOUT"
    MISSING_COVERAGE = "MISSING_COVERAGE"
    MISSING_CREDIT_RATING = "MISSING_CREDIT_RATING"
    MISSING_DURATION = "MISSING_DURATION"
    
    VOL_TOO_LOW = "VOL_TOO_LOW"
    VOL_TOO_HIGH = "VOL_TOO_HIGH"
    VOL_ABERRANT = "VOL_ABERRANT"
    
    ROE_TOO_LOW = "ROE_TOO_LOW"
    BUFFETT_SCORE_LOW = "BUFFETT_SCORE_LOW"
    
    DIVIDEND_YIELD_LOW = "DIVIDEND_YIELD_LOW"
    PAYOUT_TOO_HIGH = "PAYOUT_TOO_HIGH"
    COVERAGE_TOO_LOW = "COVERAGE_TOO_LOW"
    
    MARKET_CAP_LOW = "MARKET_CAP_LOW"
    AUM_LOW = "AUM_LOW"
    VOLUME_LOW = "VOLUME_LOW"
    
    CREDIT_RATING_LOW = "CREDIT_RATING_LOW"
    DURATION_MISMATCH = "DURATION_MISMATCH"
    
    TER_TOO_HIGH = "TER_TOO_HIGH"
    TRACKING_ERROR_HIGH = "TRACKING_ERROR_HIGH"
    
    CRYPTO_VOL_EXTREME = "CRYPTO_VOL_EXTREME"
    
    QUOTA_REACHED = "QUOTA_REACHED"
    SCORE_INSUFFICIENT = "SCORE_INSUFFICIENT"
    PROFILE_MISMATCH = "PROFILE_MISMATCH"
    
    SECTOR_AVOIDED = "SECTOR_AVOIDED"
    REGION_AVOIDED = "REGION_AVOIDED"


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
    
    return reason.upper().replace(" ", "_").replace("-", "_")


# ============= CONFIGURATION =============

def get_audit_level() -> str:
    return os.getenv("DEBUG_AUDIT", "none").lower()


def should_trace_ticker(ticker: str) -> bool:
    filter_str = os.getenv("DEBUG_AUDIT_TICKERS", "").strip()
    if not filter_str:
        return True
    allowed = {x.strip().upper() for x in filter_str.split(",") if x.strip()}
    return ticker.upper() in allowed


def should_trace_profile(profile: str) -> bool:
    filter_str = os.getenv("DEBUG_AUDIT_PROFILES", "").strip()
    if not filter_str:
        return True
    allowed = {x.strip().lower() for x in filter_str.split(",") if x.strip()}
    return profile.lower() in allowed


def should_trace_stage(stage: str) -> bool:
    filter_str = os.getenv("DEBUG_AUDIT_STAGES", "").strip()
    if not filter_str:
        return True
    allowed = {x.strip().lower() for x in filter_str.split(",") if x.strip()}
    return stage.lower() in allowed


def auto_full_on_drift() -> bool:
    return os.getenv("DEBUG_AUDIT_AUTO_FULL_ON_DRIFT", "true").lower() == "true"


def drift_threshold() -> float:
    try:
        return float(os.getenv("DEBUG_AUDIT_DRIFT_THRESHOLD", "20"))
    except ValueError:
        return 20.0


# ============= METADATA HELPERS =============

def get_git_sha() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def get_git_sha_full() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def compute_config_hash(config: Dict) -> str:
    config_str = json.dumps(config, sort_keys=True, default=str)
    return hashlib.md5(config_str.encode()).hexdigest()[:8]


def generate_run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d-%H-%M-%S")


# ============= SCORE STATISTICS =============

@dataclass
class ScoreStats:
    n: int = 0
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    
    @classmethod
    def from_values(cls, values: List[float]) -> "ScoreStats":
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
    ticker: str
    category: str
    last_stage: str
    status: str
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
    if not previous:
        return DriftReport(has_drift=False, drift_percentage=0.0)
    
    details = {}
    max_drift = 0.0
    
    curr_stages = current.get("pipeline_stages", {})
    prev_stages = previous.get("pipeline_stages", {})
    
    for stage_name, curr_data in curr_stages.items():
        if stage_name not in prev_stages:
            continue
        
        prev_data = prev_stages[stage_name]
        
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
        self._top10_by_preset: Dict[str, Dict] = {}
        
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
        return self._level in ("summary", "full")
    
    @property
    def is_full(self) -> bool:
        return self._level == "full"
    
    @contextmanager
    def stage(self, name: str, category: str = None, profile: str = None):
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
            
            key = name
            if profile:
                key = f"{name}_{profile}"
            if category:
                key = f"{key}_{category}"
            
            self.stages[key] = stage_data
            if key not in self._stage_order:
                self._stage_order.append(key)
            
            self.timings[key] = stage_data.duration_sec
    
    def add_trace(self, row: TraceRow):
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
        if not self.is_full:
            return
        
        for asset in assets:
            ticker = asset.get("ticker") or asset.get("symbol") or asset.get("name", "UNKNOWN")
            
            if not should_trace_ticker(ticker):
                continue
            
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
        v5.1.2: Record TOP 10 assets for each preset WITH ALL FILTER METRICS.
        
        Shows the actual values used for filtering decisions:
        - EQUITY: buffett, vol, roe, div_yield, payout, perf_ytd, perf_1y, mcap, sector
        - ETF: ter, aum, perf_ytd, perf_1y, perf_3y, vol (filtered: TER<1%, perf_1y>0%)
        - CRYPTO: mcap, vol, perf_24h, perf_7d, perf_30d (filtered: mcap>100M, vol<200%)
        - BOND: yield, rating, duration, maturity
        """
        if not self.is_enabled:
            return
        
        def safe_float(val, decimals=2):
            if val is None:
                return None
            try:
                return round(float(val), decimals)
            except (ValueError, TypeError):
                return None
        
        def format_large_number(val):
            if val is None:
                return None
            try:
                n = float(val)
                if n >= 1e12:
                    return f"{n/1e12:.1f}T"
                elif n >= 1e9:
                    return f"{n/1e9:.1f}B"
                elif n >= 1e6:
                    return f"{n/1e6:.1f}M"
                else:
                    return f"{n:.0f}"
            except (ValueError, TypeError):
                return str(val) if val else None
        
        result = {"equity": {}, "etf": {}, "crypto": {}, "bond": {}}
        
        # ============================================================
        # EQUITY: group by _matched_preset with FULL METRICS
        # ============================================================
        PRESET_CRITERIA = {
            "defensif": {"vol_max": 28, "roe_min": 10, "buffett_min": 60, "div_yield_min": 0.5},
            "low_volatility": {"vol_max": 22, "buffett_min": 55},
            "rendement": {"vol_max": 28, "div_yield_min": 1.5, "payout_max": 85},
            "value_dividend": {"vol_max": 30, "roe_min": 8, "div_yield_min": 1.0},
            "quality_premium": {"vol_max": 35, "roe_min": 15, "buffett_min": 65},
            "croissance": {"vol_min": 20, "perf_1y_min": 10},
            "momentum_trend": {"vol_min": 25, "perf_ytd_min": 5},
            "agressif": {"vol_min": 35},
            "recovery": {"vol_min": 35, "perf_ytd_max": -10},
        }
        
        preset_groups = {}
        for eq in equities:
            preset = eq.get("_matched_preset", "unknown")
            preset_groups.setdefault(preset, []).append(eq)
        
        for preset_name, assets in sorted(preset_groups.items()):
            sorted_assets = sorted(
                assets,
                key=lambda x: x.get("_profile_score") or x.get("_buffett_score") or x.get("composite_score") or 0,
                reverse=True
            )[:10]
            
            top_10 = []
            for a in sorted_assets:
                entry = {
                    "ticker": a.get("ticker") or a.get("symbol") or "?",
                    "name": (a.get("name") or "")[:30],
                }
                
                buffett = a.get("_buffett_score") or a.get("buffett_score")
                if buffett is not None:
                    entry["buffett"] = safe_float(buffett, 0)
                
                profile_score = a.get("_profile_score")
                if profile_score is not None:
                    entry["score"] = safe_float(profile_score, 3)
                
                vol = a.get("volatility_3y") or a.get("vol")
                if vol is not None:
                    entry["vol"] = safe_float(vol, 1)
                
                roe = a.get("roe")
                if roe is not None:
                    entry["roe"] = safe_float(roe, 1)
                
                div_yield = a.get("dividend_yield")
                if div_yield is not None:
                    entry["div_yield"] = safe_float(div_yield, 2)
                
                payout = a.get("payout_ratio") or a.get("payout_ratio_ttm")
                if payout is not None:
                    entry["payout"] = safe_float(payout, 0)
                
                perf_ytd = a.get("perf_ytd") or a.get("ytd")
                if perf_ytd is not None:
                    entry["perf_ytd"] = safe_float(perf_ytd, 1)
                
                perf_1y = a.get("perf_1y") or a.get("perf_12m")
                if perf_1y is not None:
                    entry["perf_1y"] = safe_float(perf_1y, 1)
                
                market_cap = a.get("market_cap")
                if market_cap:
                    entry["mcap"] = format_large_number(market_cap)
                
                sector = a.get("sector") or a.get("sector_top")
                if sector:
                    entry["sector"] = sector[:20]
                
                top_10.append(entry)
            
            result["equity"][preset_name] = {
                "count": len(assets),
                "criteria": PRESET_CRITERIA.get(preset_name, {}),
                "top_10": top_10
            }
        
        # ============================================================
        # ETF: Filter TER < 1%, Perf 1Y > 0%, with FULL METRICS
        # ============================================================
        ETF_CRITERIA = {"ter_max": 1.0, "perf_1y_min": 0, "aum_min": "10M"}
        
        if etfs:
            etf_filtered = []
            for e in etfs:
                ter = safe_float(e.get("ter") or e.get("frais"))
                perf_1y = safe_float(e.get("perf_1y") or e.get("perf_12m"))
                
                if ter is not None and ter > 1.0:
                    continue
                if perf_1y is not None and perf_1y < 0:
                    continue
                etf_filtered.append(e)
            
            etf_sorted = sorted(
                etf_filtered,
                key=lambda x: x.get("aum") or x.get("market_cap") or x.get("composite_score") or 0,
                reverse=True
            )[:20]
            
            top_20 = []
            for e in etf_sorted:
                entry = {
                    "ticker": e.get("ticker") or e.get("symbol") or "?",
                    "name": (e.get("name") or "")[:35],
                }
                
                ter = e.get("ter") or e.get("frais")
                if ter is not None:
                    entry["ter"] = safe_float(ter, 2)
                
                aum = e.get("aum") or e.get("market_cap")
                if aum:
                    entry["aum"] = format_large_number(aum)
                
                perf_ytd = e.get("perf_ytd")
                if perf_ytd is not None:
                    entry["perf_ytd"] = safe_float(perf_ytd, 1)
                
                perf_1y = e.get("perf_1y") or e.get("perf_12m")
                if perf_1y is not None:
                    entry["perf_1y"] = safe_float(perf_1y, 1)
                
                perf_3y = e.get("perf_3y")
                if perf_3y is not None:
                    entry["perf_3y"] = safe_float(perf_3y, 1)
                
                vol = e.get("volatility_3y") or e.get("vol")
                if vol is not None:
                    entry["vol"] = safe_float(vol, 1)
                
                top_20.append(entry)
            
            result["etf"] = {
                "criteria": ETF_CRITERIA,
                "total": len(etfs),
                "passed": len(etf_filtered),
                "top_20": top_20
            }
        
        # ============================================================
        # CRYPTO: Market cap > 100M, Vol < 200%, with FULL METRICS
        # ============================================================
        CRYPTO_CRITERIA = {"market_cap_min": "100M", "vol_max": 200}
        
        if cryptos:
            crypto_filtered = []
            for c in cryptos:
                mcap = c.get("market_cap") or 0
                vol = safe_float(c.get("volatility") or c.get("vol") or c.get("volatility_3y"))
                
                try:
                    if float(mcap) < 100_000_000:
                        continue
                except (ValueError, TypeError):
                    continue
                
                if vol is not None and vol > 200:
                    continue
                
                crypto_filtered.append(c)
            
            crypto_sorted = sorted(
                crypto_filtered,
                key=lambda x: x.get("market_cap") or 0,
                reverse=True
            )[:20]
            
            top_20 = []
            for c in crypto_sorted:
                entry = {
                    "ticker": c.get("ticker") or c.get("symbol") or "?",
                    "name": (c.get("name") or "")[:25],
                }
                
                mcap = c.get("market_cap")
                if mcap:
                    entry["mcap"] = format_large_number(mcap)
                
                vol = c.get("volatility") or c.get("vol") or c.get("volatility_3y")
                if vol is not None:
                    entry["vol"] = safe_float(vol, 1)
                
                perf_24h = c.get("perf_24h") or c.get("change_24h")
                if perf_24h is not None:
                    entry["perf_24h"] = safe_float(perf_24h, 1)
                
                perf_7d = c.get("perf_7d") or c.get("change_7d")
                if perf_7d is not None:
                    entry["perf_7d"] = safe_float(perf_7d, 1)
                
                perf_30d = c.get("perf_30d") or c.get("change_30d")
                if perf_30d is not None:
                    entry["perf_30d"] = safe_float(perf_30d, 1)
                
                top_20.append(entry)
            
            result["crypto"] = {
                "criteria": CRYPTO_CRITERIA,
                "total": len(cryptos),
                "passed": len(crypto_filtered),
                "top_20": top_20
            }
        
        # ============================================================
        # BONDS: Rating >= BBB, Yield > 0, with FULL METRICS
        # ============================================================
        BOND_CRITERIA = {"rating_min": "BBB", "yield_min": 0}
        
        if bonds:
            bond_sorted = sorted(
                bonds,
                key=lambda x: x.get("yield") or x.get("coupon") or 0,
                reverse=True
            )[:20]
            
            top_20 = []
            for b in bond_sorted:
                entry = {
                    "ticker": b.get("ticker") or b.get("isin") or b.get("symbol") or "?",
                    "name": (b.get("name") or "")[:35],
                }
                
                yld = b.get("yield") or b.get("coupon")
                if yld is not None:
                    entry["yield"] = safe_float(yld, 2)
                
                rating = b.get("rating") or b.get("credit_rating")
                if rating:
                    entry["rating"] = rating
                
                duration = b.get("duration")
                if duration is not None:
                    entry["duration"] = safe_float(duration, 1)
                
                maturity = b.get("maturity") or b.get("maturity_date")
                if maturity:
                    entry["maturity"] = str(maturity)[:10]
                
                top_20.append(entry)
            
            result["bond"] = {
                "criteria": BOND_CRITERIA,
                "total": len(bonds),
                "top_20": top_20
            }
        
        self._top10_by_preset = result
        
        logger.info(f"📊 Top10 by preset recorded: {len(result['equity'])} equity presets, "
                   f"{len(result.get('etf', {}).get('top_20', []))} ETFs, "
                   f"{len(result.get('crypto', {}).get('top_20', []))} cryptos")
    
    def build_summary(self) -> Dict:
        total_duration = time.time() - self._start_time
        
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
        
        if self._top10_by_preset:
            summary["top10_by_preset"] = self._top10_by_preset
        
        if self.previous_summary:
            drift = compute_drift(summary, self.previous_summary, drift_threshold())
            summary["drift_vs_previous"] = drift.to_dict()
            
            if drift.has_drift and auto_full_on_drift() and self._level == "summary":
                logger.warning(
                    f"⚠️ Drift detected ({drift.drift_percentage:.1f}% > {drift_threshold()}%), "
                    f"upgrading to full trace"
                )
                self._level = "full"
        
        return summary
    
    def dump(self, out_dir: str = "data"):
        if not self.is_enabled:
            logger.info("📊 Audit disabled, skipping dump")
            return
        
        out_path = Path(out_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        
        summary = self.build_summary()
        
        summary_path = out_path / "selection_debug.json"
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Audit summary saved: {summary_path} ({summary_path.stat().st_size / 1024:.1f} KB)")
        
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
        logger.warning(f"🚨 Pipeline failure detected, dumping full audit trace")
        
        original_level = self._level
        self._level = "full"
        
        summary = self.build_summary()
        summary["meta"]["failure"] = True
        if error:
            summary["meta"]["error_type"] = type(error).__name__
            summary["meta"]["error_message"] = str(error)[:500]
        
        out_path = Path(out_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        
        summary_path = out_path / "selection_debug_FAILURE.json"
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        if self.trace_rows:
            trace_path = out_path / "selection_trace_FAILURE.jsonl.gz"
            with gzip.open(trace_path, "wt", encoding="utf-8") as f:
                for row in self.trace_rows:
                    f.write(json.dumps(row.to_dict(), ensure_ascii=False) + "\n")
            
            logger.info(f"✅ Failure trace saved: {trace_path}")
        
        self._level = original_level


# ============= SINGLETON INSTANCE =============

_collector: Optional[AuditCollector] = None


def init_audit(
    config: Dict = None,
    universe_asof: str = None,
    previous_summary_path: str = "data/selection_debug.json",
) -> AuditCollector:
    global _collector
    _collector = AuditCollector(
        config=config,
        universe_asof=universe_asof,
        previous_summary_path=previous_summary_path,
    )
    return _collector


def get_audit() -> Optional[AuditCollector]:
    return _collector


def audit_enabled() -> bool:
    return _collector is not None and _collector.is_enabled


def audit_stage(name: str, category: str = None, profile: str = None):
    def decorator(func):
        def wrapper(*args, **kwargs):
            collector = get_audit()
            if collector is None or not collector.is_enabled:
                return func(*args, **kwargs)
            
            with collector.stage(name, category=category, profile=profile) as stage:
                if args and hasattr(args[0], "__len__"):
                    stage.before_count = len(args[0])
                
                result = func(*args, **kwargs)
                
                if result is not None and hasattr(result, "__len__"):
                    stage.after_count = len(result)
                
                return result
        
        return wrapper
    return decorator
