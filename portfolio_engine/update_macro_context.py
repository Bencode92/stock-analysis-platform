#!/usr/bin/env python3
"""
=========================================
update_macro_context.py v1.0.0
=========================================

Récupère les indicateurs macro depuis Twelve Data + FRED API
et les injecte dans data/market_context.json sous "macro_environment".

Sources:
  - Twelve Data (déjà dans le pipeline): Brent (BZ1), Gold (XAU/USD)
  - FRED API (gratuit): VIX (VIXCLS), Fed rate (DFF), CPI (CPIAUCSL), IG spread (BAMLC0A4CBBB)

Usage:
  python scripts/update_macro_context.py

Env vars:
  TWELVE_DATA_API — clé Twelve Data (déjà configurée)
  FRED_API_KEY    — clé FRED (gratuit, https://fred.stlouisfed.org/docs/api/api_key.html)

Output:
  Écrit/met à jour data/market_context.json → section "macro_environment"
  + génère le dict plat attendu par market_intelligence.py → fetch_market_conditions()
"""

import json
import logging
import os
import sys
from datetime import datetime, timedelta
from typing import Dict, Optional, Any

logger = logging.getLogger("update_macro_context")

# =============================================================================
# CONFIG
# =============================================================================

TWELVE_DATA_BASE = "https://api.twelvedata.com"
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

MARKET_CONTEXT_PATH = os.path.join("data", "market_context.json")
MACRO_INDICATORS_PATH = os.path.join("data", "macro_indicators.json")

# FRED series IDs
FRED_SERIES = {
    "vix":       "VIXCLS",
    "fed_rate":  "DFF",
    "cpi":       "CPIAUCSL",
    "cpi_core":  "CPILFESL",       # v2.2: CPI Less Food & Energy (core CPI for MoM)
    "pce":       "PCEPI",          # v2.2: PCE Price Index (Fed's preferred inflation gauge)
    "ig_spread": "BAMLC0A4CBBB",
    "hy_spread": "BAMLH0A0HYM2",
    "us_10y":    "DGS10",
    "us_2y":     "DGS2",
    "breakeven_5y": "T5YIE",
    "brent":     "DCOILBRENTEU",
    "trade_weighted_usd": "DTWEXBGS",
}

# Twelve Data symbols (only verified free-tier symbols)
TD_SYMBOLS = {
    "gold":   "XAU/USD",
    "silver": "XAG/USD",
    "sp500":  "SPY",
    "brent":  "BZ",                  # v2.3: Brent futures (real-time, replaces FRED J-2 lag)
    "eurusd": "EUR/USD",             # v2.2: EUR/USD for FX context
    "nasdaq": "QQQ",                 # v2.2: QQQ as Nasdaq proxy
    "xlu":    "XLU",                 # v2.2: Utilities sector perf
    "xle":    "XLE",                 # v2.2: Energy sector perf
}


# =============================================================================
# HTTP HELPER (no requests dependency — use urllib)
# =============================================================================

def _fetch_json(url: str, timeout: int = 15) -> Optional[Dict]:
    """Fetch JSON from URL using urllib (no external dependency)."""
    import urllib.request
    import urllib.error
    
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "StudyForge-Macro/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        logger.warning(f"[MACRO] Fetch failed: {url[:80]}... → {e}")
        return None
    except Exception as e:
        logger.warning(f"[MACRO] Unexpected error fetching {url[:80]}... → {e}")
        return None


# =============================================================================
# FRED API
# =============================================================================

def fetch_fred_series(series_id: str, api_key: str, n_obs: int = 5) -> Optional[Dict]:
    """
    Fetch latest observations from FRED.
    Returns {value, date, prev_value, change} or None.
    """
    url = (
        f"{FRED_BASE}?series_id={series_id}"
        f"&sort_order=desc&limit={n_obs}"
        f"&api_key={api_key}&file_type=json"
    )
    
    data = _fetch_json(url)
    if not data or "observations" not in data:
        logger.warning(f"[FRED] No data for {series_id}")
        return None
    
    obs = data["observations"]
    if not obs:
        return None
    
    # Filter out "." values (FRED uses "." for missing)
    valid = [o for o in obs if o.get("value", ".") != "."]
    if not valid:
        return None
    
    latest = valid[0]
    value = float(latest["value"])
    date = latest["date"]
    
    result = {"value": value, "date": date}
    
    # Previous value for change calc
    if len(valid) > 1:
        prev = float(valid[1]["value"])
        result["prev_value"] = prev
        result["change"] = round(value - prev, 4)
    
    logger.info(f"[FRED] {series_id}: {value} ({date})")
    return result


def fetch_all_fred(api_key: str) -> Dict:
    """Fetch all FRED indicators."""
    results = {}
    
    for name, series_id in FRED_SERIES.items():
        data = fetch_fred_series(series_id, api_key)
        if data:
            results[name] = data
        else:
            logger.warning(f"[FRED] {name} ({series_id}): no data")
    
    # CPI: calculate YoY% from index (need 13 months of data)
    if "cpi" in results:
        cpi_13m = fetch_fred_series("CPIAUCSL", api_key, n_obs=13)
        if cpi_13m:
            # Fetch full 13 obs to get 12-month-ago value
            url = (
                f"{FRED_BASE}?series_id=CPIAUCSL"
                f"&sort_order=desc&limit=13"
                f"&api_key={api_key}&file_type=json"
            )
            raw = _fetch_json(url)
            if raw and "observations" in raw:
                valid = [o for o in raw["observations"] if o.get("value", ".") != "."]
                if len(valid) >= 13:
                    latest_cpi = float(valid[0]["value"])
                    year_ago_cpi = float(valid[12]["value"])
                    cpi_yoy = round((latest_cpi / year_ago_cpi - 1) * 100, 2)
                    results["cpi"]["yoy_pct"] = cpi_yoy
                    logger.info(f"[FRED] CPI YoY: {cpi_yoy}% ({latest_cpi}/{year_ago_cpi})")
    
    # PCE: calculate YoY% from index (same logic as CPI)
    if "pce" in results:
        url = (
            f"{FRED_BASE}?series_id=PCEPI"
            f"&sort_order=desc&limit=13"
            f"&api_key={api_key}&file_type=json"
        )
        raw = _fetch_json(url)
        if raw and "observations" in raw:
            valid = [o for o in raw["observations"] if o.get("value", ".") != "."]
            if len(valid) >= 13:
                latest_pce = float(valid[0]["value"])
                year_ago_pce = float(valid[12]["value"])
                pce_yoy = round((latest_pce / year_ago_pce - 1) * 100, 2)
                results["pce"]["yoy_pct"] = pce_yoy
                logger.info(f"[FRED] PCE YoY: {pce_yoy}% ({latest_pce}/{year_ago_pce})")
    
    return results


# =============================================================================
# TWELVE DATA API
# =============================================================================

def fetch_td_quote(symbol: str, api_key: str) -> Optional[Dict]:
    """
    Fetch quote from Twelve Data.
    Returns {price, change_pct, change_1d, volume} or None.
    """
    url = f"{TWELVE_DATA_BASE}/quote?symbol={symbol}&apikey={api_key}"
    
    data = _fetch_json(url)
    if not data or data.get("status") == "error":
        logger.warning(f"[TD] Error for {symbol}: {data.get('message', 'unknown')}")
        return None
    
    try:
        result = {
            "price": float(data.get("close", 0)),
            "change_pct": float(data.get("percent_change", 0)),
            "change_1d": float(data.get("change", 0)),
            "previous_close": float(data.get("previous_close", 0)),
            "datetime": data.get("datetime", ""),
        }
        logger.info(f"[TD] {symbol}: {result['price']} ({result['change_pct']:+.2f}%)")
        return result
    except (ValueError, TypeError) as e:
        logger.warning(f"[TD] Parse error for {symbol}: {e}")
        return None


def fetch_td_timeseries(symbol: str, api_key: str, n_days: int = 5) -> Optional[list]:
    """Fetch last N days of time series for avg calculation."""
    url = (
        f"{TWELVE_DATA_BASE}/time_series?symbol={symbol}"
        f"&interval=1day&outputsize={n_days}&apikey={api_key}"
    )
    
    data = _fetch_json(url)
    if not data or "values" not in data:
        return None
    
    return [float(v["close"]) for v in data["values"] if v.get("close")]


def fetch_all_td(api_key: str) -> Dict:
    """Fetch all Twelve Data indicators."""
    results = {}
    
    for name, symbol in TD_SYMBOLS.items():
        quote = fetch_td_quote(symbol, api_key)
        if quote:
            results[name] = quote
    
    return results


# =============================================================================
# BUILD MACRO ENVIRONMENT
# =============================================================================

def build_macro_environment(fred_data: Dict, td_data: Dict) -> Dict:
    """
    Combine FRED + Twelve Data into a structured macro_environment dict.
    Format compatible with market_context.json.
    """
    macro = {}
    
    # Brent — v2.3: prefer Twelve Data (real-time) over FRED (J-2 lag)
    # FRED DCOILBRENTEU has 1-2 day publication lag. TD BZ is near real-time.
    if "brent" in td_data and td_data["brent"].get("price"):
        _td_brent = td_data["brent"]["price"]
        _fred_brent = fred_data.get("brent", {}).get("value")
        macro["brent"] = {
            "price": _td_brent,
            "source": "twelve_data_BZ",
            "date": td_data["brent"].get("datetime", "today"),
            "avg_5d": _fred_brent or _td_brent,  # FRED for avg context
            "_fred_price": _fred_brent,
            "_fred_date": fred_data.get("brent", {}).get("date"),
        }
        if _fred_brent:
            _lag = round(abs(_td_brent - _fred_brent), 2)
            if _lag > 3:
                logger.warning(f"[MACRO] Brent TD/FRED divergence: TD=${_td_brent} vs FRED=${_fred_brent} (lag ${_lag})")
        logger.info(f"[MACRO] Brent: ${_td_brent} (Twelve Data real-time, FRED=${_fred_brent})")
    elif "brent" in fred_data:
        macro["brent"] = {
            "price": fred_data["brent"]["value"],
            "source": "fred_DCOILBRENTEU",
            "date": fred_data["brent"]["date"],
            "avg_5d": fred_data["brent"]["value"],
        }
        logger.info(f"[MACRO] Brent: ${fred_data['brent']['value']} (FRED only, TD unavailable)")
    
    # Gold (from Twelve Data XAU/USD)
    if "gold" in td_data:
        g = td_data["gold"]
        macro["gold"] = {
            "price": g.get("price"),
            "change_1d_pct": g.get("change_pct"),
            "datetime": g.get("datetime"),
        }
    
    # Silver (from Twelve Data XAG/USD)
    if "silver" in td_data:
        s = td_data["silver"]
        macro["silver"] = {
            "price": s.get("price"),
            "change_1d_pct": s.get("change_pct"),
        }
    
    # Trade-Weighted USD Index (FRED DTWEXBGS)
    # ⚠️ This is NOT the ICE DXY (~99.6). DTWEXBGS scale is ~110-130.
    # Labelled explicitly to avoid confusion in MI prompts.
    if "trade_weighted_usd" in fred_data:
        macro["trade_weighted_usd"] = {
            "value": fred_data["trade_weighted_usd"]["value"],
            "_warning": "FRED DTWEXBGS (Trade-Weighted USD, NOT ICE DXY). Scale ~110-130.",
        }
    
    # S&P 500 (from Twelve Data SPY)
    if "sp500" in td_data:
        sp = td_data["sp500"]
        macro["sp500"] = {
            "level": sp.get("price"),
            "change_1d_pct": sp.get("change_pct"),
        }
    
    # VIX
    if "vix" in fred_data:
        macro["vix"] = {
            "value": fred_data["vix"]["value"],
            "date": fred_data["vix"]["date"],
            "change": fred_data["vix"].get("change"),
        }
    
    # Fed rate
    if "fed_rate" in fred_data:
        macro["fed_rate"] = {
            "value": fred_data["fed_rate"]["value"],
            "date": fred_data["fed_rate"]["date"],
        }
    
    # CPI
    if "cpi" in fred_data:
        macro["cpi"] = {
            "index_value": fred_data["cpi"]["value"],
            "yoy_pct": fred_data["cpi"].get("yoy_pct"),
            "date": fred_data["cpi"]["date"],
        }
    
    # IG spread
    if "ig_spread" in fred_data:
        v = fred_data["ig_spread"]["value"]
        macro["ig_spread"] = {
            "value_pct": v,
            "value_bps": round(v * 100, 0),
            "date": fred_data["ig_spread"]["date"],
        }
    
    # HY spread
    if "hy_spread" in fred_data:
        v = fred_data["hy_spread"]["value"]
        macro["hy_spread"] = {
            "value_pct": v,
            "value_bps": round(v * 100, 0),
            "date": fred_data["hy_spread"]["date"],
        }
    
    # US 10Y yield
    if "us_10y" in fred_data:
        macro["us_10y_yield"] = {
            "value": fred_data["us_10y"]["value"],
            "date": fred_data["us_10y"]["date"],
        }
    
    # US 2Y yield
    if "us_2y" in fred_data:
        macro["us_2y_yield"] = {
            "value": fred_data["us_2y"]["value"],
            "date": fred_data["us_2y"]["date"],
        }
    
    # 2s10s curve
    if "us_10y" in fred_data and "us_2y" in fred_data:
        macro["yield_curve_2s10s"] = {
            "value_bps": round((fred_data["us_10y"]["value"] - fred_data["us_2y"]["value"]) * 100, 0),
        }
    
    # Breakeven inflation 5Y
    if "breakeven_5y" in fred_data:
        macro["breakeven_5y"] = {
            "value": fred_data["breakeven_5y"]["value"],
            "date": fred_data["breakeven_5y"]["date"],
        }
    
    # v2.2: EUR/USD (from Twelve Data)
    if "eurusd" in td_data:
        macro["eurusd"] = {
            "price": td_data["eurusd"].get("price"),
            "change_1d_pct": td_data["eurusd"].get("change_pct"),
        }
    
    # v2.2: Nasdaq proxy (from Twelve Data QQQ)
    if "nasdaq" in td_data:
        macro["nasdaq"] = {
            "level": td_data["nasdaq"].get("price"),
            "change_1d_pct": td_data["nasdaq"].get("change_pct"),
        }
    
    # v2.2: XLU Utilities (from Twelve Data)
    if "xlu" in td_data:
        macro["xlu"] = {
            "price": td_data["xlu"].get("price"),
            "change_1d_pct": td_data["xlu"].get("change_pct"),
        }
    
    # v2.2: XLE Energy (from Twelve Data)
    if "xle" in td_data:
        macro["xle"] = {
            "price": td_data["xle"].get("price"),
            "change_1d_pct": td_data["xle"].get("change_pct"),
        }
    
    # v2.2: CPI Core (Less Food & Energy) — for MoM calculation
    if "cpi_core" in fred_data:
        _core = fred_data["cpi_core"]
        _core_mom = None
        if _core.get("prev_value") and _core["prev_value"] > 0:
            _core_mom = round((_core["value"] / _core["prev_value"] - 1) * 100, 2)
        macro["cpi_core"] = {
            "index_value": _core["value"],
            "mom_pct": _core_mom,
            "date": _core["date"],
        }
    
    # v2.2: PCE Price Index — Fed's preferred inflation gauge
    if "pce" in fred_data:
        _pce = fred_data["pce"]
        _pce_yoy = _pce.get("yoy_pct")
        macro["pce"] = {
            "index_value": _pce["value"],
            "yoy_pct": _pce_yoy,
            "date": _pce["date"],
        }
    
    # v2.2: VIX trend (derived from FRED VIX data — prev vs current)
    if "vix" in fred_data:
        _vix_curr = fred_data["vix"]["value"]
        _vix_prev = fred_data["vix"].get("prev_value")
        if _vix_prev and _vix_prev > 0:
            _vix_delta = round(_vix_curr - _vix_prev, 1)
            _vix_direction = "Rising" if _vix_delta > 1 else "Falling" if _vix_delta < -1 else "Stable"
            macro["vix"]["trend"] = _vix_direction
            macro["vix"]["delta"] = _vix_delta
    
    # v2.2: HY spread trend (derived from FRED HY spread — prev vs current)
    if "hy_spread" in fred_data:
        _hy_curr = fred_data["hy_spread"]["value"]
        _hy_prev = fred_data["hy_spread"].get("prev_value")
        if _hy_prev and _hy_prev > 0:
            _hy_delta = round((_hy_curr - _hy_prev) * 100, 0)  # in bps
            _hy_dir = "Widening" if _hy_delta > 5 else "Tightening" if _hy_delta < -5 else "Stable"
            macro["hy_spread"]["trend"] = _hy_dir
            macro["hy_spread"]["delta_bps"] = _hy_delta
    
    # Stress flags (v1.6.2 — informatif)
    macro["_flags"] = []
    if macro.get("vix", {}).get("value", 0) > 30:
        macro["_flags"].append("volatility_stress")
    if macro.get("ig_spread", {}).get("value_bps", 0) > 200:
        macro["_flags"].append("credit_stress")
    if macro.get("brent", {}).get("price", 0) > 100:
        macro["_flags"].append("energy_shock")
    
    macro["_updated"] = datetime.now().isoformat()
    macro["_sources"] = ["twelve_data", "fred"]
    
    return macro


def build_flat_market_data(macro: Dict) -> Dict:
    """
    Flatten macro_environment into the dict format expected by
    market_intelligence.py's _build_user_prompt().
    """
    flat = {
        "date": datetime.now().strftime("%Y-%m-%d"),
    }
    
    # Brent
    b = macro.get("brent", {})
    flat["brent_usd"] = b.get("price")
    flat["brent_usd_avg5d"] = b.get("avg_5d", b.get("price"))
    
    # Gold
    g = macro.get("gold", {})
    flat["gold_usd"] = g.get("price")
    # Gold drawdown from ATH — approximate (ATH was ~$3500 in 2025)
    if g.get("price"):
        # We don't have exact ATH, but market_intelligence handles None gracefully
        flat["gold_drawdown_from_ath_pct"] = None
    
    # Silver
    flat["silver_usd"] = macro.get("silver", {}).get("price")
    
    # VIX
    flat["vix"] = macro.get("vix", {}).get("value")
    
    # Fed rate
    flat["fed_funds_rate"] = macro.get("fed_rate", {}).get("value")
    
    # CPI YoY% (calculated from 13-month FRED data)
    _cpi_yoy = macro.get("cpi", {}).get("yoy_pct")
    if _cpi_yoy:
        flat["cpi_yoy_pct"] = _cpi_yoy
    flat["cpi_index"] = macro.get("cpi", {}).get("index_value")
    
    # Spreads
    flat["ig_spread_bps"] = macro.get("ig_spread", {}).get("value_bps")
    flat["hy_spread_bps"] = macro.get("hy_spread", {}).get("value_bps")
    
    # Yields
    flat["us_10y_yield"] = macro.get("us_10y_yield", {}).get("value")
    flat["us_2y_yield"] = macro.get("us_2y_yield", {}).get("value")
    flat["yield_curve_2s10s"] = macro.get("yield_curve_2s10s", {}).get("value_bps")
    flat["breakeven_5y"] = macro.get("breakeven_5y", {}).get("value")
    
    # S&P 500
    flat["sp500_level"] = macro.get("sp500", {}).get("level")
    
    # Trade-Weighted USD (NOT ICE DXY)
    flat["trade_weighted_usd"] = macro.get("trade_weighted_usd", {}).get("value")
    
    # v2.2: EUR/USD
    flat["eurusd"] = macro.get("eurusd", {}).get("price")
    
    # v2.2: Nasdaq (QQQ proxy) — daily change as approx
    _nasdaq = macro.get("nasdaq", {})
    if _nasdaq.get("change_1d_pct"):
        flat["nasdaq_change_1d_pct"] = _nasdaq["change_1d_pct"]
    
    # v2.2: Sector perf (XLU, XLE) — daily change
    _xlu = macro.get("xlu", {})
    if _xlu.get("change_1d_pct"):
        flat["xlu_perf_1d_pct"] = _xlu["change_1d_pct"]
    _xle = macro.get("xle", {})
    if _xle.get("change_1d_pct"):
        flat["xle_perf_1d_pct"] = _xle["change_1d_pct"]
    
    # v2.2: CPI Core MoM (from FRED CPILFESL)
    flat["cpi_core_mom_pct"] = macro.get("cpi_core", {}).get("mom_pct")
    
    # v2.2: PCE YoY (from FRED PCEPI — Fed's preferred inflation gauge)
    flat["pce_yoy_pct"] = macro.get("pce", {}).get("yoy_pct")
    
    # v2.2: VIX trend (derived from FRED prev vs current)
    flat["vix_trend"] = macro.get("vix", {}).get("trend")
    
    # v2.2: HY spread trend (derived from FRED prev vs current)
    flat["hy_spread_trend"] = macro.get("hy_spread", {}).get("trend")
    
    # Stress flags
    flat["_stress_flags"] = macro.get("_flags", [])
    
    # Remove None values
    flat = {k: v for k, v in flat.items() if v is not None}
    
    return flat


# =============================================================================
# INJECT INTO MARKET CONTEXT
# =============================================================================

def inject_into_market_context(macro: Dict, flat: Dict, path: str = MARKET_CONTEXT_PATH):
    """
    Read existing market_context.json, inject macro_environment + flat indicators.
    Also writes a standalone macro_indicators.json (not overwritten by RADAR).
    """
    # Load existing
    ctx = {}
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                ctx = json.load(f)
            logger.info(f"[MACRO] Loaded existing {path}")
        except Exception as e:
            logger.warning(f"[MACRO] Could not load {path}: {e}")
    
    # Inject structured macro environment
    ctx["macro_environment"] = macro
    
    # Inject flat market data for market_intelligence.py
    ctx["_market_data_flat"] = flat
    
    # Update meta
    ctx.setdefault("_meta", {})
    ctx["_meta"]["macro_updated"] = datetime.now().isoformat()
    ctx["_meta"]["macro_sources"] = macro.get("_sources", [])
    ctx["_meta"]["macro_fields_filled"] = len(flat)
    ctx["_meta"]["macro_stress_flags"] = macro.get("_flags", [])
    
    # Write market_context.json (may be overwritten by RADAR later)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(ctx, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"[MACRO] Written {path}")
    
    # Write standalone macro_indicators.json (NEVER overwritten by RADAR)
    standalone = {
        "_market_data_flat": flat,
        "macro_environment": macro,
        "_meta": {
            "updated": datetime.now().isoformat(),
            "sources": macro.get("_sources", []),
            "fields": len(flat),
            "stress_flags": macro.get("_flags", []),
        }
    }
    os.makedirs(os.path.dirname(MACRO_INDICATORS_PATH), exist_ok=True)
    with open(MACRO_INDICATORS_PATH, "w", encoding="utf-8") as f:
        json.dump(standalone, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"[MACRO] ✅ Written {MACRO_INDICATORS_PATH} ({len(flat)} indicators)")
    
    return ctx


# =============================================================================
# MAIN
# =============================================================================

def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    
    logger.info("=" * 60)
    logger.info("MACRO CONTEXT UPDATE v1.0.0")
    logger.info("=" * 60)
    
    # Get API keys
    td_key = os.environ.get("TWELVE_DATA_API") or os.environ.get("TWELVE_DATA_API_KEY")
    fred_key = os.environ.get("FRED_API_KEY")
    
    if not td_key and not fred_key:
        logger.error("[MACRO] No API keys found (TWELVE_DATA_API, FRED_API_KEY)")
        sys.exit(1)
    
    # Fetch data
    fred_data = {}
    td_data = {}
    
    if fred_key:
        logger.info("[MACRO] Fetching FRED data...")
        fred_data = fetch_all_fred(fred_key)
        logger.info(f"[MACRO] FRED: {len(fred_data)}/{len(FRED_SERIES)} series OK")
    else:
        logger.warning("[MACRO] FRED_API_KEY not set — skipping FRED data")
    
    if td_key:
        logger.info("[MACRO] Fetching Twelve Data...")
        td_data = fetch_all_td(td_key)
        logger.info(f"[MACRO] Twelve Data: {len(td_data)}/{len(TD_SYMBOLS)} quotes OK")
    else:
        logger.warning("[MACRO] TWELVE_DATA_API not set — skipping Twelve Data")
    
    if not fred_data and not td_data:
        logger.error("[MACRO] No data fetched from any source")
        sys.exit(1)
    
    # Build macro environment
    macro = build_macro_environment(fred_data, td_data)
    flat = build_flat_market_data(macro)
    
    logger.info(f"[MACRO] Built macro_environment: {len(macro)} sections")
    logger.info(f"[MACRO] Flat market data: {len(flat)} fields")
    if macro.get("_flags"):
        logger.warning(f"[MACRO] ⚠️ Stress flags: {macro['_flags']}")
    
    # Inject into market_context.json
    inject_into_market_context(macro, flat)
    
    # Summary
    logger.info("")
    logger.info("SUMMARY:")
    for key, val in sorted(flat.items()):
        if not key.startswith("_"):
            logger.info(f"  {key}: {val}")
    
    logger.info("")
    logger.info("✅ Macro context update complete")


if __name__ == "__main__":
    main()
