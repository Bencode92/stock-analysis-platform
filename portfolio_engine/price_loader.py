"""
price_loader.py — Load daily returns for portfolio assets via Twelve Data API + local cache.

Graceful: if API key missing or fetch fails, returns assets unchanged (100% structured cov).
Cache: data/price_cache.json persists across runs (24h TTL, 7d full refresh).

Usage:
    from portfolio_engine.price_loader import load_returns_for_assets
    assets = load_returns_for_assets(assets, cache_path="data/price_cache.json")
"""

import json
import logging
import os
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

import numpy as np

logger = logging.getLogger("portfolio_engine.price_loader")

TICKER_RE = re.compile(r'^[A-Z]{1,5}(\.[A-Z]{1,2})?$')
API_BASE = "https://api.twelvedata.com/time_series"
API_SLEEP = 0.25  # Ultra plan
MIN_DAYS = 60     # Minimum days for usable returns


def _is_valid_ticker(ticker: str) -> bool:
    return bool(ticker and TICKER_RE.match(ticker))


# ═══════════════════════════════════════════════════════════════════
# CACHE
# ═══════════════════════════════════════════════════════════════════

def _load_cache(cache_path: str) -> Dict[str, Any]:
    """Load cache from disk. Returns empty dict if missing/corrupt."""
    try:
        p = Path(cache_path)
        if p.exists():
            with open(p) as f:
                return json.load(f)
    except Exception as e:
        logger.debug(f"Cache load failed: {e}")
    return {}


def _save_cache(cache: dict, cache_path: str) -> None:
    """Save cache to disk."""
    try:
        cache["_updated"] = datetime.utcnow().isoformat()
        p = Path(cache_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w") as f:
            json.dump(cache, f)
    except Exception as e:
        logger.warning(f"Cache save failed: {e}")


def _cache_age_hours(cache: dict) -> float:
    """Hours since cache was last updated."""
    updated = cache.get("_updated")
    if not updated:
        return float("inf")
    try:
        dt = datetime.fromisoformat(updated)
        return (datetime.utcnow() - dt).total_seconds() / 3600
    except Exception:
        return float("inf")


def _ticker_cache_fresh(cache: dict, ticker: str, max_age_hours: float) -> bool:
    """Check if a specific ticker's data is fresh enough."""
    entry = cache.get(ticker)
    if not entry or not isinstance(entry, dict):
        return False
    updated = entry.get("_updated")
    if not updated:
        # Use global cache age
        return _cache_age_hours(cache) < max_age_hours
    try:
        dt = datetime.fromisoformat(updated)
        return (datetime.utcnow() - dt).total_seconds() / 3600 < max_age_hours
    except Exception:
        return False


def _cache_to_returns(entry: dict) -> Optional[np.ndarray]:
    """Convert cached price dict to log returns array."""
    prices = entry.get("prices")
    if not prices or len(prices) < MIN_DAYS + 1:
        return None
    try:
        p = np.array(prices, dtype=float)
        p = p[p > 0]  # Remove zero/negative
        if len(p) < MIN_DAYS + 1:
            return None
        return np.diff(np.log(p))
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════
# API FETCH
# ═══════════════════════════════════════════════════════════════════

def _fetch_prices(ticker: str, api_key: str, outputsize: int = 252) -> Optional[List[float]]:
    """Fetch daily close prices from Twelve Data API."""
    import urllib.request
    import urllib.error

    url = f"{API_BASE}?symbol={ticker}&interval=1day&outputsize={outputsize}&apikey={api_key}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PriceLoader/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())

        if data.get("status") == "error" or "values" not in data:
            return None

        # Oldest first
        closes = []
        for v in reversed(data["values"]):
            c = float(v.get("close", 0))
            if c > 0:
                closes.append(c)

        return closes if len(closes) >= MIN_DAYS + 1 else None

    except Exception as e:
        logger.debug(f"Fetch failed for {ticker}: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════
# MAIN API
# ═══════════════════════════════════════════════════════════════════

def load_returns_for_assets(
    assets: List,
    cache_path: str = "data/price_cache.json",
    max_age_hours: float = 24.0,
) -> List:
    """
    Enrich assets with returns_series from Twelve Data API + cache.

    Only fetches for assets with valid tickers (Actions + equity ETFs).
    Falls back gracefully if API key is missing or fetch fails.

    Args:
        assets: List of Asset objects (modified in-place)
        cache_path: Path to JSON cache file
        max_age_hours: Cache freshness threshold (default 24h)

    Returns:
        Same list of assets (mutated with returns_series where available)
    """
    api_key = os.environ.get("TWELVE_DATA_API")
    if not api_key:
        logger.info("[price_loader] TWELVE_DATA_API not set — skipping, 100% structured cov")
        return assets

    cache = _load_cache(cache_path)
    cache_age = _cache_age_hours(cache)

    # If cache > 7 days old, force full refresh
    force_refresh = cache_age > 168  # 7 * 24

    if cache_age < max_age_hours and not force_refresh:
        logger.info(f"[price_loader] Cache fresh ({cache_age:.1f}h old), using cached data")
    elif force_refresh:
        logger.info(f"[price_loader] Cache stale ({cache_age:.0f}h), full refresh")
    else:
        logger.info(f"[price_loader] Cache {cache_age:.1f}h old, incremental update")

    # Determine which tickers need fetching
    tickers_to_fetch = []
    enriched_from_cache = 0

    for asset in assets:
        ticker = getattr(asset, 'ticker', None) or getattr(asset, 'symbol', None) or ''
        ticker = ticker.upper().strip()

        if not _is_valid_ticker(ticker):
            continue

        # Only fetch stocks and equity ETFs (bonds use structured cov)
        cat = getattr(asset, 'category', '')
        if cat == "Obligations":
            continue

        # Check cache
        if not force_refresh and ticker in cache and _ticker_cache_fresh(cache, ticker, max_age_hours):
            returns = _cache_to_returns(cache[ticker])
            if returns is not None:
                asset.returns_series = returns
                enriched_from_cache += 1
                continue

        tickers_to_fetch.append((asset, ticker))

    if enriched_from_cache:
        logger.info(f"[price_loader] {enriched_from_cache} assets loaded from cache")

    # Fetch missing tickers
    if tickers_to_fetch:
        logger.info(f"[price_loader] Fetching {len(tickers_to_fetch)} tickers from Twelve Data...")
        fetched = 0
        failed = 0

        for asset, ticker in tickers_to_fetch:
            prices = _fetch_prices(ticker, api_key)
            if prices is not None:
                cache[ticker] = {
                    "prices": prices,
                    "_updated": datetime.utcnow().isoformat(),
                }
                returns = np.diff(np.log(np.array(prices, dtype=float)))
                asset.returns_series = returns
                fetched += 1
            else:
                failed += 1

            time.sleep(API_SLEEP)

            # Log progress every 20 tickers
            total_done = fetched + failed
            if total_done > 0 and total_done % 20 == 0:
                logger.info(f"[price_loader]   ... {total_done}/{len(tickers_to_fetch)} "
                            f"({fetched} ok, {failed} failed)")

        logger.info(f"[price_loader] Fetched: {fetched} ok, {failed} failed")
        _save_cache(cache, cache_path)
    else:
        logger.info("[price_loader] All tickers served from cache")

    # Summary
    n_with = sum(1 for a in assets if getattr(a, 'returns_series', None) is not None)
    n_total = len(assets)
    logger.info(f"[price_loader] Result: {n_with}/{n_total} assets with returns_series")

    return assets
