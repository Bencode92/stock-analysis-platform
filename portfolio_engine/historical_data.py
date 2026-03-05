# portfolio_engine/historical_data.py
"""
Historical Data Module v1.1.0

Fetch historical returns from Twelve Data for tail risk calculations (VaR/CVaR).

v1.1.0 FIX: mic_code + exchange resolution for non-US tickers
- AGS → mic_code=XBRU (Euronext Brussels)
- 2360 → mic_code=XTAI (TWSE)
- Uses TickerResolver from portfolio_engine.ticker_resolver
- Fallback: mic_code first, then exchange name if mic_code fails
- resolved_symbol takes priority over raw ticker
- Cache invalidation for previously-failed tickers

Changelog:
- v1.1.0: mic_code/exchange resolution via TickerResolver
  - _fetch_time_series: tries mic_code, fallback exchange on error
  - fetch_single_ticker_returns: accepts resolver or mic_code/exchange
  - fetch_portfolio_returns: accepts TickerResolver for batch resolution
  - Auto-invalidates cache for tickers that previously failed
- v1.0.0: Initial release
"""

import os
import json
import time
import logging
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# v1.1.0: Import TickerResolver
try:
    from portfolio_engine.ticker_resolver import TickerResolver, get_resolver
    HAS_RESOLVER = True
except ImportError:
    HAS_RESOLVER = False
    TickerResolver = None
    def get_resolver(*a, **kw):
        return None

logger = logging.getLogger("portfolio_engine.historical_data")

# =============================================================================
# CONFIGURATION
# =============================================================================

VERSION = "1.1.0"

API_BASE_URL = "https://api.twelvedata.com/time_series"
RATE_LIMIT_DELAY = 0.8

CACHE_DIR_NAME = "returns_cache"
CACHE_EXPIRY_DAYS = 1

TAIL_RISK_THRESHOLDS = {
    "var_95_min_obs": 252,
    "var_99_min_obs": 1000,
    "moments_min_obs": 252,
    "confidence_high": 1000,
    "confidence_medium": 252,
}

LEVERAGED_TICKERS = {
    "TQQQ", "SOXL", "UPRO", "SPXL", "TECL", "FAS", "LABU", "NUGT",
    "TNA", "UDOW", "FNGU", "BULZ", "NAIL", "DFEN", "WEBL", "WANT",
    "DPST", "DRN", "ERX", "RETL", "PILL",
    "SSO", "QLD", "DDM", "UWM", "MVV", "ROM", "UYG", "USD",
    "SQQQ", "SPXS", "SDOW", "FAZ", "LABD", "DUST", "TZA", "SRTY",
    "SMDD", "YANG", "CHAD", "WEBS", "DRIP", "ERY",
    "SDS", "QID", "DXD", "TWM", "MZZ", "SKF", "SRS",
    "SH", "PSQ", "DOG", "RWM", "SEF", "EUM",
    "UVXY", "VXX", "VIXY", "SVXY", "SVIX",
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _get_api_key() -> Optional[str]:
    return os.getenv("TWELVE_DATA_API")


def _get_cache_dir() -> Path:
    current = Path(__file__).parent
    repo_root = current.parent
    cache_dir = repo_root / "data" / CACHE_DIR_NAME
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _rate_limit_pause(delay: float = RATE_LIMIT_DELAY):
    time.sleep(delay)


def _safe_float(value: Any) -> Optional[float]:
    if value is None or value == "" or value == "None":
        return None
    try:
        f = float(value)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (ValueError, TypeError):
        return None


def _get_cache_path(ticker: str) -> Path:
    cache_dir = _get_cache_dir()
    safe_ticker = ticker.upper().replace("/", "_").replace("\\", "_")
    return cache_dir / f"{safe_ticker}.json"


def _is_cache_valid(cache_path: Path, max_age_days: int = CACHE_EXPIRY_DAYS) -> bool:
    if not cache_path.exists():
        return False
    mtime = datetime.fromtimestamp(cache_path.stat().st_mtime)
    age = datetime.now() - mtime
    return age.days < max_age_days


def _load_from_cache(ticker: str) -> Optional[Dict[str, Any]]:
    cache_path = _get_cache_path(ticker)
    if not _is_cache_valid(cache_path):
        return None
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # v1.1.0: Skip cache if it contains an error (previously failed)
        if data.get("error"):
            logger.debug(f"  📂 Cache skip (previous error): {ticker}")
            return None
        logger.debug(f"  📂 Cache hit: {ticker}")
        return data
    except Exception as e:
        logger.warning(f"  ⚠️ Cache read failed for {ticker}: {e}")
        return None


def _save_to_cache(ticker: str, data: Dict[str, Any]) -> bool:
    cache_path = _get_cache_path(ticker)
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        logger.warning(f"  ⚠️ Cache write failed for {ticker}: {e}")
        return False


# =============================================================================
# API FUNCTIONS — v1.1.0: mic_code + exchange fallback
# =============================================================================

def _fetch_time_series(
    symbol: str,
    outputsize: int = 1500,
    api_key: Optional[str] = None,
    mic_code: Optional[str] = None,
    exchange: Optional[str] = None,
) -> List[Tuple[str, float]]:
    """
    Fetch daily time series from Twelve Data API.
    
    v1.1.0: Tries mic_code first, falls back to exchange name if API returns error.
    This mirrors the tdParamTrials approach in stock-advanced-filter.js.
    
    Args:
        symbol: Ticker symbol (use resolved_symbol when available)
        outputsize: Number of data points
        api_key: API key
        mic_code: MIC code (e.g., "XBRU", "XTAI") — tried first
        exchange: Exchange name (e.g., "Euronext", "TWSE") — fallback
    
    Returns:
        List of (date_str, close_price) tuples, sorted ASC
    """
    if not HAS_REQUESTS:
        raise ImportError("requests library required")
    
    api_key = api_key or _get_api_key()
    if not api_key:
        raise ValueError("TWELVE_DATA_API environment variable not set")
    
    # Build base params
    base_params = {
        "apikey": api_key,
        "symbol": symbol,
        "interval": "1day",
        "outputsize": min(outputsize, 5000),
        "format": "JSON",
        "timezone": "Exchange",
        "dp": 5,
        "order": "ASC",
    }
    
    # v1.1.0: Build trial list (like JS tdParamTrials)
    # Try: 1) mic_code  2) exchange  3) bare symbol
    trials = []
    if mic_code:
        trials.append({"mic_code": mic_code})
    if exchange:
        trials.append({"exchange": exchange})
    if not trials:
        trials.append({})  # bare symbol (US stocks, ETFs, crypto)
    
    last_error = None
    
    for i, extra_params in enumerate(trials):
        params = {**base_params, **extra_params}
        
        trial_desc = f"mic_code={extra_params.get('mic_code')}" if 'mic_code' in extra_params \
            else f"exchange={extra_params.get('exchange')}" if 'exchange' in extra_params \
            else "bare"
        
        if i == 0:
            logger.info(f"  📡 Fetching {symbol} ({outputsize} points, {trial_desc})...")
        else:
            logger.info(f"  🔄 Retry {symbol} with {trial_desc}...")
        
        try:
            response = requests.get(API_BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.RequestException as e:
            last_error = f"API request failed for {symbol}: {e}"
            continue
        
        # Check for API error
        if isinstance(data, dict) and data.get("status") == "error":
            last_error = f"API error for {symbol} ({trial_desc}): {data.get('message', 'unknown')}"
            logger.debug(f"  ⚠️ {last_error}")
            # Try next trial
            if i < len(trials) - 1:
                _rate_limit_pause(0.3)  # Short pause between retries
                continue
            else:
                raise ValueError(last_error)
        
        # Parse values
        values = data.get("values", [])
        if not values:
            last_error = f"No data returned for {symbol} ({trial_desc})"
            if i < len(trials) - 1:
                _rate_limit_pause(0.3)
                continue
            logger.warning(f"  ⚠️ {last_error}")
            return []
        
        # Success! Parse rows
        rows = []
        for v in values:
            d = (v.get("datetime") or "")[:10]
            c = _safe_float(v.get("close"))
            if d and c is not None and c > 0:
                rows.append((d, c))
        
        rows.sort(key=lambda x: x[0])
        
        if rows:
            logger.info(f"  ✅ {symbol}: {len(rows)} points ({rows[0][0]} → {rows[-1][0]})")
        
        return rows
    
    # All trials failed
    raise ValueError(last_error or f"All resolution attempts failed for {symbol}")


def _compute_returns(prices: List[Tuple[str, float]]) -> Tuple[List[str], List[float]]:
    if len(prices) < 2:
        return [], []
    
    dates = []
    returns = []
    
    for i in range(1, len(prices)):
        d_prev, p_prev = prices[i - 1]
        d_curr, p_curr = prices[i]
        
        if p_prev > 0 and p_curr > 0:
            ret = np.log(p_curr / p_prev)
            if abs(ret) < 0.5:
                dates.append(d_curr)
                returns.append(ret)
    
    return dates, returns


# =============================================================================
# MAIN FUNCTIONS — v1.1.0: TickerResolver support
# =============================================================================

def fetch_single_ticker_returns(
    ticker: str,
    lookback_years: int = 5,
    use_cache: bool = True,
    api_key: Optional[str] = None,
    mic_code: Optional[str] = None,
    exchange: Optional[str] = None,
    resolved_symbol: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch historical returns for a single ticker.
    
    v1.1.0: Supports mic_code, exchange fallback, and resolved_symbol.
    
    Args:
        ticker: Ticker symbol
        lookback_years: Years of history
        use_cache: Use/update cache
        api_key: API key
        mic_code: MIC code for API resolution (e.g., "XBRU")
        exchange: Exchange name for API fallback (e.g., "Euronext")
        resolved_symbol: Exact symbol that worked in JS enrichment
    """
    ticker = ticker.upper().strip()
    
    # v1.1.0: Use resolved_symbol if provided
    api_symbol = resolved_symbol or ticker
    
    # Check cache (keyed by original ticker, not resolved_symbol)
    if use_cache:
        cached = _load_from_cache(ticker)
        if cached:
            return cached
    
    outputsize = int(lookback_years * 252 * 1.2) + 50
    outputsize = min(outputsize, 5000)
    
    is_leveraged = ticker in LEVERAGED_TICKERS
    
    try:
        prices = _fetch_time_series(
            api_symbol, outputsize, api_key,
            mic_code=mic_code,
            exchange=exchange,
        )
        
        if not prices:
            result = {
                "ticker": ticker,
                "dates": [],
                "returns": [],
                "n_obs": 0,
                "first_date": None,
                "last_date": None,
                "is_leveraged": is_leveraged,
                "history_reliable": False,
                "fetch_timestamp": datetime.utcnow().isoformat() + "Z",
                "error": "No data returned from API",
                "resolution": {"symbol": api_symbol, "mic_code": mic_code, "exchange": exchange},
            }
            return result
        
        dates, returns = _compute_returns(prices)
        
        result = {
            "ticker": ticker,
            "dates": dates,
            "returns": returns,
            "n_obs": len(returns),
            "first_date": dates[0] if dates else None,
            "last_date": dates[-1] if dates else None,
            "is_leveraged": is_leveraged,
            "history_reliable": not is_leveraged,
            "fetch_timestamp": datetime.utcnow().isoformat() + "Z",
            "error": None,
            "resolution": {"symbol": api_symbol, "mic_code": mic_code, "exchange": exchange},
        }
        
        if use_cache and dates:
            _save_to_cache(ticker, result)
        
        return result
        
    except Exception as e:
        logger.error(f"  ❌ Error fetching {ticker} (symbol={api_symbol}, mic={mic_code}): {e}")
        return {
            "ticker": ticker,
            "dates": [],
            "returns": [],
            "n_obs": 0,
            "first_date": None,
            "last_date": None,
            "is_leveraged": is_leveraged,
            "history_reliable": False,
            "fetch_timestamp": datetime.utcnow().isoformat() + "Z",
            "error": str(e),
            "resolution": {"symbol": api_symbol, "mic_code": mic_code, "exchange": exchange},
        }


def fetch_portfolio_returns(
    tickers: List[str],
    lookback_years: int = 5,
    weights: Optional[np.ndarray] = None,
    use_cache: bool = True,
    api_key: Optional[str] = None,
    min_common_pct: float = 0.95,
    resolver: Optional["TickerResolver"] = None,
    # Legacy params (used if resolver not provided)
    mic_code_map: Optional[Dict[str, str]] = None,
    exchange_map: Optional[Dict[str, str]] = None,
) -> Tuple[Optional[np.ndarray], Dict[str, Any]]:
    """
    Fetch historical returns for a portfolio of tickers.
    
    v1.1.0: Supports TickerResolver for automatic mic_code/exchange/resolved_symbol
    resolution. Falls back to mic_code_map/exchange_map dicts if resolver not provided.
    
    Args:
        tickers: List of ticker symbols
        lookback_years: Years of history
        weights: Portfolio weights (optional)
        use_cache: Use/update cache
        api_key: API key
        min_common_pct: Minimum % of common dates
        resolver: TickerResolver instance (preferred)
        mic_code_map: Dict ticker→mic_code (legacy fallback)
        exchange_map: Dict ticker→exchange (legacy fallback)
    """
    if not tickers:
        return None, {"error": "No tickers provided", "version": VERSION}
    
    tickers = list(dict.fromkeys([t.upper().strip() for t in tickers if t]))
    
    if not tickers:
        return None, {"error": "No valid tickers after cleaning", "version": VERSION}
    
    api_key = api_key or _get_api_key()
    
    # v1.1.0: Auto-load resolver if not provided
    if resolver is None and HAS_RESOLVER:
        try:
            resolver = get_resolver()
        except Exception:
            pass
    
    logger.info(f"📡 Fetching {len(tickers)} tickers ({lookback_years}y history)...")
    if resolver and resolver._loaded:
        logger.info(f"   [v1.1.0] TickerResolver active: {len(resolver.mic_code_map)} mic_codes")
    
    # v1.1.0: Invalidate cache for tickers that previously failed
    # This ensures we retry with mic_code after deployment
    _invalidate_failed_cache(tickers)
    
    all_data: Dict[str, Dict[str, Any]] = {}
    errors: List[str] = []
    resolutions: Dict[str, Dict] = {}
    
    for i, ticker in enumerate(tickers):
        if i > 0:
            _rate_limit_pause()
        
        # v1.1.0: Resolve ticker
        mic = None
        exchange = None
        resolved_sym = None
        
        if resolver:
            resolved_sym_raw, mic, exchange = resolver.resolve(ticker)
            if resolved_sym_raw != ticker:
                resolved_sym = resolved_sym_raw
        elif mic_code_map or exchange_map:
            mic = (mic_code_map or {}).get(ticker)
            exchange = (exchange_map or {}).get(ticker)
        
        resolutions[ticker] = {"mic": mic, "exchange": exchange, "resolved": resolved_sym}
        
        data = fetch_single_ticker_returns(
            ticker, lookback_years, use_cache, api_key,
            mic_code=mic,
            exchange=exchange,
            resolved_symbol=resolved_sym,
        )
        
        if data.get("error") or not data.get("dates"):
            errors.append(ticker)
            logger.warning(f"  ⚠️ {ticker}: {data.get('error', 'no data')}")
        else:
            all_data[ticker] = data
    
    if not all_data:
        return None, {
            "error": "No valid data for any ticker",
            "version": VERSION,
            "tickers_with_errors": errors,
            "resolutions": resolutions,
        }
    
    # Find common dates (inner join)
    all_dates_sets = [set(d["dates"]) for d in all_data.values()]
    common_dates = set.intersection(*all_dates_sets)
    common_dates = sorted(common_dates)
    
    if not common_dates:
        return None, {
            "error": "No common dates across tickers",
            "version": VERSION,
            "tickers": list(all_data.keys()),
            "tickers_with_errors": errors,
        }
    
    max_dates = max(len(d["dates"]) for d in all_data.values())
    common_pct = len(common_dates) / max_dates if max_dates > 0 else 0
    
    logger.info(f"📅 Common dates: {common_dates[0]} → {common_dates[-1]} ({len(common_dates)} days, {common_pct:.1%} coverage)")
    
    if common_pct < min_common_pct:
        logger.warning(f"⚠️ Low date coverage: {common_pct:.1%} < {min_common_pct:.1%}")
    
    # Build returns matrix
    valid_tickers = list(all_data.keys())
    n_obs = len(common_dates)
    n_tickers = len(valid_tickers)
    returns_matrix = np.zeros((n_obs, n_tickers))
    
    for j, ticker in enumerate(valid_tickers):
        data = all_data[ticker]
        date_to_return = dict(zip(data["dates"], data["returns"]))
        for i, d in enumerate(common_dates):
            returns_matrix[i, j] = date_to_return.get(d, 0.0)
    
    # Build metadata
    short_history = [
        t for t, d in all_data.items()
        if d["n_obs"] < TAIL_RISK_THRESHOLDS["var_95_min_obs"]
    ]
    leveraged = [t for t, d in all_data.items() if d["is_leveraged"]]
    min_obs = min(d["n_obs"] for d in all_data.values()) if all_data else 0
    
    if n_obs >= TAIL_RISK_THRESHOLDS["confidence_high"]:
        confidence = "high"
    elif n_obs >= TAIL_RISK_THRESHOLDS["confidence_medium"]:
        confidence = "medium"
    else:
        confidence = "low"
    
    var_95_method = "historical" if n_obs >= TAIL_RISK_THRESHOLDS["var_95_min_obs"] else "parametric"
    var_99_method = "historical" if n_obs >= TAIL_RISK_THRESHOLDS["var_99_min_obs"] else "parametric"
    
    metadata = {
        "version": VERSION,
        "n_obs": n_obs,
        "n_tickers": n_tickers,
        "tickers": valid_tickers,
        "first_date": common_dates[0],
        "last_date": common_dates[-1],
        "date_coverage_pct": round(common_pct * 100, 1),
        "tickers_with_short_history": short_history,
        "tickers_with_errors": errors,
        "leveraged_tickers": leveraged,
        "min_obs_across_tickers": min_obs,
        "confidence_level": confidence,
        "var_95_method": var_95_method,
        "var_99_method": var_99_method,
        "thresholds": TAIL_RISK_THRESHOLDS,
        "fetch_timestamp": datetime.utcnow().isoformat() + "Z",
        "resolutions_used": {k: v for k, v in resolutions.items() if v.get("mic") or v.get("resolved")},
    }
    
    if leveraged:
        metadata["leveraged_warning"] = (
            f"Portfolio contains {len(leveraged)} leveraged/inverse ETF(s): {leveraged}. "
            "Long-term historical returns are unreliable due to volatility decay."
        )
    
    logger.info(f"✅ Returns matrix: {n_obs} obs x {n_tickers} tickers, confidence: {confidence}")
    
    return returns_matrix, metadata


def _invalidate_failed_cache(tickers: List[str]):
    """
    v1.1.0: Delete cache entries that contain errors.
    This ensures we retry previously-failed tickers with mic_code after fix deployment.
    """
    cache_dir = _get_cache_dir()
    invalidated = 0
    
    for ticker in tickers:
        cache_path = _get_cache_path(ticker)
        if not cache_path.exists():
            continue
        
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("error") or not data.get("dates"):
                cache_path.unlink()
                invalidated += 1
                logger.debug(f"  🗑️ Cache invalidated (error): {ticker}")
        except Exception:
            pass
    
    if invalidated:
        logger.info(f"[v1.1.0] Cache invalidated: {invalidated} failed entries cleared")


def compute_portfolio_returns(
    returns_matrix: np.ndarray,
    weights: np.ndarray,
) -> np.ndarray:
    if returns_matrix.shape[1] != len(weights):
        raise ValueError(
            f"Shape mismatch: returns_matrix has {returns_matrix.shape[1]} assets, "
            f"but weights has {len(weights)}"
        )
    weights = np.array(weights)
    if not np.isclose(weights.sum(), 1.0):
        weights = weights / weights.sum()
    return returns_matrix @ weights


def clear_cache(tickers: Optional[List[str]] = None) -> int:
    cache_dir = _get_cache_dir()
    deleted = 0
    if tickers:
        for ticker in tickers:
            cache_path = _get_cache_path(ticker.upper())
            if cache_path.exists():
                cache_path.unlink()
                deleted += 1
    else:
        for cache_file in cache_dir.glob("*.json"):
            cache_file.unlink()
            deleted += 1
    logger.info(f"🗑️ Cleared cache: {deleted} files")
    return deleted


def get_cache_info() -> Dict[str, Any]:
    cache_dir = _get_cache_dir()
    cache_files = list(cache_dir.glob("*.json"))
    if not cache_files:
        return {"cache_dir": str(cache_dir), "n_cached_tickers": 0, "cached_tickers": [], "total_size_mb": 0}
    tickers = [f.stem for f in cache_files]
    total_size = sum(f.stat().st_size for f in cache_files)
    mtimes = [datetime.fromtimestamp(f.stat().st_mtime) for f in cache_files]
    return {
        "cache_dir": str(cache_dir),
        "n_cached_tickers": len(tickers),
        "cached_tickers": sorted(tickers),
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "oldest_cache": min(mtimes).isoformat() + "Z",
        "newest_cache": max(mtimes).isoformat() + "Z",
    }


__all__ = [
    "fetch_portfolio_returns",
    "fetch_single_ticker_returns",
    "compute_portfolio_returns",
    "clear_cache",
    "get_cache_info",
    "TAIL_RISK_THRESHOLDS",
    "LEVERAGED_TICKERS",
    "VERSION",
]
