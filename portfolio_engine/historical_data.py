# portfolio_engine/historical_data.py
"""
Historical Data Module v1.0.0

Fetch historical returns from Twelve Data for tail risk calculations (VaR/CVaR).
Designed for portfolio_engine, separate from scripts/twelve_data_utils.py.

Architecture:
- Cache par ticker: data/returns_cache/{ticker}.json
- Fetch daily adjusted prices (5 years default)
- Compute log returns
- Align calendars across tickers (inner join)
- Handle leveraged ETF warnings

Usage:
    from portfolio_engine.historical_data import fetch_portfolio_returns
    
    returns_matrix, metadata = fetch_portfolio_returns(
        tickers=["SPY", "QQQ", "TLT"],
        lookback_years=5,
    )
    
    # metadata contains:
    # - n_obs: number of common observations
    # - confidence_level: "high" / "medium" / "low"
    # - var_95_method: "historical" / "parametric"
    # - var_99_method: "historical" / "parametric"
    # - leveraged_tickers: list of leveraged/inverse ETFs

Changelog:
- v1.0.0: Initial release
  - Fetch 5y daily returns from Twelve Data
  - Cache per ticker with 1-day expiry
  - Confidence thresholds for VaR methods
  - Leveraged ETF detection and warnings
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

# Optional: requests for HTTP calls
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

logger = logging.getLogger("portfolio_engine.historical_data")

# =============================================================================
# CONFIGURATION
# =============================================================================

VERSION = "1.0.0"

# API Config
API_BASE_URL = "https://api.twelvedata.com/time_series"
RATE_LIMIT_DELAY = 0.8  # seconds between API calls

# Cache config - relative to repo root
CACHE_DIR_NAME = "returns_cache"
CACHE_EXPIRY_DAYS = 1  # Re-fetch if cache older than N days

# Tail risk thresholds (aligned with ChatGPT recommendations)
TAIL_RISK_THRESHOLDS = {
    # VaR 95% : fiable à partir de 1 an
    "var_95_min_obs": 252,
    
    # VaR 99% : fiable à partir de 4 ans  
    "var_99_min_obs": 1000,
    
    # Skew/Kurtosis : fiable à partir de 1 an
    "moments_min_obs": 252,
    
    # Confidence levels
    "confidence_high": 1000,    # >= 1000 obs = high confidence
    "confidence_medium": 252,   # >= 252 obs = medium
    # < 252 = low
}

# Leveraged/Inverse ETFs - history unreliable due to volatility decay
LEVERAGED_TICKERS = {
    # 3x Long
    "TQQQ", "SOXL", "UPRO", "SPXL", "TECL", "FAS", "LABU", "NUGT",
    "TNA", "UDOW", "FNGU", "BULZ", "NAIL", "DFEN", "WEBL", "WANT",
    "DPST", "DRN", "ERX", "RETL", "PILL",
    # 2x Long
    "SSO", "QLD", "DDM", "UWM", "MVV", "ROM", "UYG", "USD",
    # 3x Short / Inverse
    "SQQQ", "SPXS", "SDOW", "FAZ", "LABD", "DUST", "TZA", "SRTY",
    "SMDD", "YANG", "CHAD", "WEBS", "DRIP", "ERY",
    # 2x Short
    "SDS", "QID", "DXD", "TWM", "MZZ", "SKF", "SRS",
    # 1x Short / Inverse
    "SH", "PSQ", "DOG", "RWM", "SEF", "EUM",
    # Volatility products
    "UVXY", "VXX", "VIXY", "SVXY", "SVIX",
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _get_api_key() -> Optional[str]:
    """Get Twelve Data API key from environment."""
    return os.getenv("TWELVE_DATA_API")


def _get_cache_dir() -> Path:
    """
    Get cache directory path.
    Creates it if it doesn't exist.
    
    Structure: {repo_root}/data/returns_cache/
    """
    # Try to find repo root by looking for portfolio_engine
    current = Path(__file__).parent  # portfolio_engine/
    repo_root = current.parent  # repo root
    
    cache_dir = repo_root / "data" / CACHE_DIR_NAME
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    return cache_dir


def _rate_limit_pause(delay: float = RATE_LIMIT_DELAY):
    """Pause between API calls to respect rate limits."""
    time.sleep(delay)


def _safe_float(value: Any) -> Optional[float]:
    """Safely convert to float."""
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
    """Get cache file path for a ticker."""
    cache_dir = _get_cache_dir()
    # Sanitize ticker for filename
    safe_ticker = ticker.upper().replace("/", "_").replace("\\", "_")
    return cache_dir / f"{safe_ticker}.json"


def _is_cache_valid(cache_path: Path, max_age_days: int = CACHE_EXPIRY_DAYS) -> bool:
    """Check if cache file exists and is recent enough."""
    if not cache_path.exists():
        return False
    
    mtime = datetime.fromtimestamp(cache_path.stat().st_mtime)
    age = datetime.now() - mtime
    return age.days < max_age_days


def _load_from_cache(ticker: str) -> Optional[Dict[str, Any]]:
    """Load ticker data from cache if valid."""
    cache_path = _get_cache_path(ticker)
    
    if not _is_cache_valid(cache_path):
        return None
    
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.debug(f"  📂 Cache hit: {ticker}")
        return data
    except Exception as e:
        logger.warning(f"  ⚠️ Cache read failed for {ticker}: {e}")
        return None


def _save_to_cache(ticker: str, data: Dict[str, Any]) -> bool:
    """Save ticker data to cache."""
    cache_path = _get_cache_path(ticker)
    
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.debug(f"  💾 Cached: {ticker}")
        return True
    except Exception as e:
        logger.warning(f"  ⚠️ Cache write failed for {ticker}: {e}")
        return False


# =============================================================================
# API FUNCTIONS
# =============================================================================

def _fetch_time_series(
    symbol: str,
    outputsize: int = 1500,
    api_key: Optional[str] = None,
) -> List[Tuple[str, float]]:
    """
    Fetch daily time series from Twelve Data API.
    
    Args:
        symbol: Ticker symbol
        outputsize: Number of data points (max 5000)
        api_key: API key (default: from env)
    
    Returns:
        List of (date_str, close_price) tuples, sorted ASC by date
    
    Raises:
        ImportError: If requests library not available
        ValueError: If API key missing or API returns error
    """
    if not HAS_REQUESTS:
        raise ImportError("requests library required for API calls. Install with: pip install requests")
    
    api_key = api_key or _get_api_key()
    if not api_key:
        raise ValueError("TWELVE_DATA_API environment variable not set")
    
    params = {
        "apikey": api_key,
        "symbol": symbol,
        "interval": "1day",
        "outputsize": min(outputsize, 5000),  # API max
        "format": "JSON",
        "timezone": "Exchange",
        "dp": 5,
        "order": "ASC",
    }
    
    logger.info(f"  📡 Fetching {symbol} ({outputsize} points)...")
    
    try:
        response = requests.get(API_BASE_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        raise ValueError(f"API request failed for {symbol}: {e}")
    
    # Handle API errors
    if isinstance(data, dict) and data.get("status") == "error":
        error_msg = data.get("message", "unknown error")
        raise ValueError(f"API error for {symbol}: {error_msg}")
    
    # Parse values
    values = data.get("values", [])
    if not values:
        logger.warning(f"  ⚠️ No data returned for {symbol}")
        return []
    
    # Extract and sort by date
    rows = []
    for v in values:
        d = (v.get("datetime") or "")[:10]  # YYYY-MM-DD
        c = _safe_float(v.get("close"))
        if d and c is not None and c > 0:
            rows.append((d, c))
    
    # Sort by date ASC (API should return ASC but let's be sure)
    rows.sort(key=lambda x: x[0])
    
    if rows:
        logger.info(f"  ✅ {symbol}: {len(rows)} points ({rows[0][0]} → {rows[-1][0]})")
    
    return rows


def _compute_returns(prices: List[Tuple[str, float]]) -> Tuple[List[str], List[float]]:
    """
    Compute log returns from price series.
    
    Args:
        prices: List of (date, price) tuples sorted by date ASC
    
    Returns:
        (dates, returns) where returns[i] = ln(price[i] / price[i-1])
    """
    if len(prices) < 2:
        return [], []
    
    dates = []
    returns = []
    
    for i in range(1, len(prices)):
        d_prev, p_prev = prices[i - 1]
        d_curr, p_curr = prices[i]
        
        if p_prev > 0 and p_curr > 0:
            ret = np.log(p_curr / p_prev)
            # Sanity check: filter extreme returns (data errors)
            if abs(ret) < 0.5:  # < 50% daily move
                dates.append(d_curr)
                returns.append(ret)
    
    return dates, returns


# =============================================================================
# MAIN FUNCTIONS
# =============================================================================

def fetch_single_ticker_returns(
    ticker: str,
    lookback_years: int = 5,
    use_cache: bool = True,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch historical returns for a single ticker.
    
    Args:
        ticker: Ticker symbol (e.g., "SPY", "QQQ")
        lookback_years: Years of history to fetch (default: 5)
        use_cache: Whether to use/update cache (default: True)
        api_key: Twelve Data API key (default: from env)
    
    Returns:
        {
            "ticker": "SPY",
            "dates": ["2021-01-04", ...],
            "returns": [0.0012, -0.0034, ...],
            "n_obs": 1247,
            "first_date": "2021-01-04",
            "last_date": "2026-01-24",
            "is_leveraged": False,
            "history_reliable": True,
            "fetch_timestamp": "2026-01-26T15:30:00Z",
            "error": None,
        }
    """
    ticker = ticker.upper().strip()
    
    # Check cache first
    if use_cache:
        cached = _load_from_cache(ticker)
        if cached:
            return cached
    
    # Calculate outputsize (~252 trading days/year + buffer)
    outputsize = int(lookback_years * 252 * 1.2) + 50
    outputsize = min(outputsize, 5000)  # API max
    
    is_leveraged = ticker in LEVERAGED_TICKERS
    
    try:
        prices = _fetch_time_series(ticker, outputsize, api_key)
        
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
            "history_reliable": not is_leveraged,  # Leveraged = unreliable long history
            "fetch_timestamp": datetime.utcnow().isoformat() + "Z",
            "error": None,
        }
        
        # Save to cache
        if use_cache and dates:
            _save_to_cache(ticker, result)
        
        return result
        
    except Exception as e:
        logger.error(f"  ❌ Error fetching {ticker}: {e}")
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
        }


def fetch_portfolio_returns(
    tickers: List[str],
    lookback_years: int = 5,
    weights: Optional[np.ndarray] = None,
    use_cache: bool = True,
    api_key: Optional[str] = None,
    min_common_pct: float = 0.95,
) -> Tuple[Optional[np.ndarray], Dict[str, Any]]:
    """
    Fetch historical returns for a portfolio of tickers.
    
    Aligns calendars across tickers using inner join (common dates only).
    
    Args:
        tickers: List of ticker symbols
        lookback_years: Years of history to fetch (default: 5)
        weights: Portfolio weights (optional, for weighted returns)
        use_cache: Whether to use/update cache (default: True)
        api_key: Twelve Data API key (default: from env)
        min_common_pct: Minimum % of common dates required (default: 95%)
    
    Returns:
        returns_matrix: np.ndarray (T x N) or None if failed
        metadata: {
            "version": "1.0.0",
            "n_obs": 1247,
            "n_tickers": 15,
            "tickers": ["SPY", "QQQ", ...],
            "first_date": "2021-01-04",
            "last_date": "2026-01-24",
            "tickers_with_short_history": ["ARKK"],
            "tickers_with_errors": ["BADTICKER"],
            "leveraged_tickers": ["TQQQ"],
            "min_obs_across_tickers": 847,
            "confidence_level": "high|medium|low",
            "var_95_method": "historical|parametric",
            "var_99_method": "historical|parametric",
            "thresholds": {...},
            "fetch_timestamp": "2026-01-26T15:30:00Z",
        }
    """
    if not tickers:
        return None, {"error": "No tickers provided", "version": VERSION}
    
    # Deduplicate and clean tickers
    tickers = list(dict.fromkeys([t.upper().strip() for t in tickers if t]))
    
    if not tickers:
        return None, {"error": "No valid tickers after cleaning", "version": VERSION}
    
    api_key = api_key or _get_api_key()
    
    logger.info(f"📡 Fetching {len(tickers)} tickers ({lookback_years}y history)...")
    
    # Fetch each ticker
    all_data: Dict[str, Dict[str, Any]] = {}
    errors: List[str] = []
    
    for i, ticker in enumerate(tickers):
        if i > 0:
            _rate_limit_pause()
        
        data = fetch_single_ticker_returns(ticker, lookback_years, use_cache, api_key)
        
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
        }
    
    # Find common date range (inner join)
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
    
    # Check if we have enough common dates
    max_dates = max(len(d["dates"]) for d in all_data.values())
    common_pct = len(common_dates) / max_dates if max_dates > 0 else 0
    
    logger.info(f"📅 Common dates: {common_dates[0]} → {common_dates[-1]} ({len(common_dates)} days, {common_pct:.1%} coverage)")
    
    if common_pct < min_common_pct:
        logger.warning(f"⚠️ Low date coverage: {common_pct:.1%} < {min_common_pct:.1%}")
    
    # Build returns matrix (T x N)
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
    
    # Determine confidence and methods based on common observations
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
    }
    
    # Add warning if leveraged tickers present
    if leveraged:
        metadata["leveraged_warning"] = (
            f"Portfolio contains {len(leveraged)} leveraged/inverse ETF(s): {leveraged}. "
            "Long-term historical returns are unreliable due to volatility decay. "
            "Consider using stress scenarios instead of historical VaR for these instruments."
        )
    
    logger.info(f"✅ Returns matrix: {n_obs} obs x {n_tickers} tickers, confidence: {confidence}")
    
    return returns_matrix, metadata


def compute_portfolio_returns(
    returns_matrix: np.ndarray,
    weights: np.ndarray,
) -> np.ndarray:
    """
    Compute portfolio returns from asset returns and weights.
    
    Args:
        returns_matrix: (T x N) matrix of asset returns
        weights: (N,) array of portfolio weights (should sum to 1)
    
    Returns:
        (T,) array of portfolio returns
    """
    if returns_matrix.shape[1] != len(weights):
        raise ValueError(
            f"Shape mismatch: returns_matrix has {returns_matrix.shape[1]} assets, "
            f"but weights has {len(weights)}"
        )
    
    # Normalize weights to sum to 1 if needed
    weights = np.array(weights)
    if not np.isclose(weights.sum(), 1.0):
        weights = weights / weights.sum()
    
    return returns_matrix @ weights


def clear_cache(tickers: Optional[List[str]] = None) -> int:
    """
    Clear cached return data.
    
    Args:
        tickers: Specific tickers to clear (default: all)
    
    Returns:
        Number of cache files deleted
    """
    cache_dir = _get_cache_dir()
    deleted = 0
    
    if tickers:
        # Clear specific tickers
        for ticker in tickers:
            cache_path = _get_cache_path(ticker.upper())
            if cache_path.exists():
                cache_path.unlink()
                deleted += 1
                logger.info(f"🗑️ Cleared cache: {ticker}")
    else:
        # Clear all
        for cache_file in cache_dir.glob("*.json"):
            cache_file.unlink()
            deleted += 1
        logger.info(f"🗑️ Cleared all cache: {deleted} files")
    
    return deleted


def get_cache_info() -> Dict[str, Any]:
    """
    Get information about cached data.
    
    Returns:
        {
            "cache_dir": "/path/to/cache",
            "n_cached_tickers": 42,
            "cached_tickers": ["SPY", "QQQ", ...],
            "total_size_mb": 1.5,
            "oldest_cache": "2026-01-25T10:00:00Z",
            "newest_cache": "2026-01-26T15:30:00Z",
        }
    """
    cache_dir = _get_cache_dir()
    cache_files = list(cache_dir.glob("*.json"))
    
    if not cache_files:
        return {
            "cache_dir": str(cache_dir),
            "n_cached_tickers": 0,
            "cached_tickers": [],
            "total_size_mb": 0,
        }
    
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


# =============================================================================
# MODULE EXPORTS
# =============================================================================

__all__ = [
    # Main functions
    "fetch_portfolio_returns",
    "fetch_single_ticker_returns",
    "compute_portfolio_returns",
    
    # Cache management
    "clear_cache",
    "get_cache_info",
    
    # Constants
    "TAIL_RISK_THRESHOLDS",
    "LEVERAGED_TICKERS",
    "VERSION",
]
