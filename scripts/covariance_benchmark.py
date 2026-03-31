#!/usr/bin/env python3
"""
covariance_benchmark.py — Compare 8 covariance estimation methods on REAL data.

Usage: python scripts/covariance_benchmark.py

Pipeline:
  1. Load tickers from portfolios.json + portfolios_euus.json
  2. Fetch 252-day price history via Twelve Data API (plan ultra)
  3. Fallback: backtest_debug.json → combined_etfs.csv → synthetic
  4. Benchmark 8 configs × 2 modes (pure + hybrid)
  5. Output: table + data/covariance_benchmark_real.json
"""

import json
import sys
import os
import csv
import time
import warnings
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Optional

import numpy as np
from scipy.optimize import minimize
from sklearn.covariance import LedoitWolf

warnings.filterwarnings("ignore")
np.random.seed(42)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

API_KEY = os.environ.get("TWELVE_DATA_API", "")
API_SLEEP = 0.3  # Ultra plan — safety delay between requests

# ═══════════════════════════════════════════════════════════════════
# ASSET CLASSIFICATION (explicit, not inferred from sector)
# ═══════════════════════════════════════════════════════════════════

BOND_TICKERS = {
    "BND", "AGG", "TLT", "IEF", "SHY", "VCIT", "VCSH", "BIV", "BSV",
    "LQD", "HYG", "GVI", "GOVT", "TIPS", "VGSH", "SCHO", "SPTS",
    "SGOV", "CLTL", "STIP", "PAAA", "SPIB", "IGIB", "VTEB", "GBIL",
}
GOLD_TICKERS = {"GLD", "IAU", "SGOL", "GLDM", "AAAU", "SLV", "SLVP"}
CRYPTO_TICKERS = {"BTC", "ETH", "SOL", "ADA", "DOGE", "AVAX", "LINK", "DOT"}

import re
TICKER_RE = re.compile(r'^[A-Z]{1,5}(\.[A-Z]{1,2})?$')


def classify_asset(ticker: str, pf_info: dict) -> str:
    """Classify asset into: stock, etf, bond, gold, crypto."""
    if ticker in BOND_TICKERS:
        return "bond"
    if ticker in GOLD_TICKERS:
        return "gold"
    if ticker in CRYPTO_TICKERS:
        return "crypto"
    cat = (pf_info.get("category") or "").lower()
    if cat in ("obligations", "bond", "bonds"):
        return "bond"
    if cat == "crypto":
        return "crypto"
    if cat == "etf":
        return "etf"
    return "stock"


# ═══════════════════════════════════════════════════════════════════
# SECTOR MAPPING + STRUCTURED CORRELATIONS
# ═══════════════════════════════════════════════════════════════════

SECTOR_MAP = {
    "Technologie de l'information": "Tech", "Technology": "Tech",
    "Santé": "Health", "Health Care": "Health", "Healthcare": "Health",
    "Finance": "Finance", "Financials": "Finance",
    "Consommation discrétionnaire": "ConsDisc", "Consumer Discretionary": "ConsDisc",
    "Industrie": "Industrial", "Industrials": "Industrial",
    "Énergie": "Energy", "Energy": "Energy",
    "Matériaux": "Materials", "Materials": "Materials",
    "Services publics": "Utilities", "Utilities": "Utilities",
    "Immobilier": "RealEstate", "Real Estate": "RealEstate",
    "Consommation de base": "ConsStaples", "Consumer Staples": "ConsStaples",
    "Services de communication": "Comms", "Communication Services": "Comms",
}

# v7.2 recalibrées
CORR_SAME_SECTOR = 0.37
CORR_SAME_CATEGORY_STOCK = 0.22
CORR_SAME_CATEGORY_ETF = 0.62
CORR_SAME_CATEGORY_BOND = 0.48
CORR_SAME_CATEGORY = 0.48  # alias legacy pour build_structured_cov
CORR_EQUITY_BOND = 0.05
CORR_ETF_BOND = 0.13
CORR_EQUITY_GOLD = 0.15
CORR_GOLD_BOND = 0.04
CORR_CRYPTO_OTHER = 0.25
CORR_DEFAULT = 0.20

SECTOR_CORR = {
    ("Tech", "Tech"): 0.65, ("Finance", "Finance"): 0.55,
    ("Health", "Health"): 0.45, ("Energy", "Energy"): 0.60,
    ("Industrial", "Industrial"): 0.50,
    ("Tech", "ConsDisc"): 0.40, ("Tech", "Comms"): 0.45,
    ("Finance", "RealEstate"): 0.35, ("Energy", "Materials"): 0.40,
    ("ConsStaples", "Health"): 0.25, ("Utilities", "RealEstate"): 0.30,
}


def get_sector_corr(s1, s2):
    if s1 == s2:
        return SECTOR_CORR.get((s1, s2), CORR_SAME_SECTOR)
    return SECTOR_CORR.get((s1, s2), SECTOR_CORR.get((s2, s1), CORR_DEFAULT))


# ═══════════════════════════════════════════════════════════════════
# 1. LOAD PORTFOLIO TICKERS + METADATA
# ═══════════════════════════════════════════════════════════════════

def load_portfolio_tickers() -> Dict[str, dict]:
    """Load all tickers from portfolios.json + portfolios_euus.json with metadata."""
    tickers = {}

    for fname in ["portfolios.json", "portfolios_euus.json"]:
        fpath = DATA / fname
        if not fpath.exists():
            continue
        with open(fpath) as f:
            pf = json.load(f)
        for profile in ["Agressif", "Modéré", "Stable"]:
            p = pf.get(profile, {})
            meta = p.get("_tickers_meta", {})
            for tk, info in meta.items():
                if tk not in tickers:
                    tickers[tk] = {
                        "ticker": tk,
                        "name": info.get("name", tk),
                        "category": info.get("category", ""),
                        "type": classify_asset(tk, info),
                        "sector": info.get("sector", info.get("industry", "")),
                        "weight": info.get("weight", 0),
                    }
            # Also from _tickers list
            for tk in p.get("_tickers", []):
                if tk not in tickers:
                    tickers[tk] = {"ticker": tk, "name": tk, "category": "",
                                   "type": classify_asset(tk, {}), "sector": "", "weight": 0}

    # Filter: only valid ticker format (exclude ISINs, internal IDs)
    filtered = {tk: v for tk, v in tickers.items() if TICKER_RE.match(tk)}
    skipped = set(tickers.keys()) - set(filtered.keys())
    if skipped:
        print(f"  Skipped non-ticker IDs: {sorted(skipped)}")

    return filtered


def load_stock_metadata() -> Dict[str, dict]:
    """Load vol_3y, sector, beta from stocks_*.json for portfolio tickers."""
    meta = {}
    for fname in ["stocks_us.json", "stocks_europe.json", "stocks_asia.json"]:
        fpath = DATA / fname
        if not fpath.exists():
            continue
        with open(fpath) as f:
            d = json.load(f)
        stocks = d if isinstance(d, list) else d.get("stocks", d.get("data", []))
        for s in stocks:
            tk = s.get("ticker", "")
            if tk:
                meta[tk] = {
                    "vol_3y": float(s.get("volatility_3y") or 0),
                    "sector": SECTOR_MAP.get(s.get("sector", ""), "Other"),
                    "beta": float(s.get("beta_capm") or s.get("beta") or 1.0),
                    "market_cap": float(s.get("market_cap") or 0),
                }
    return meta


def load_etf_metadata() -> Dict[str, dict]:
    """Load vol from combined_etfs.csv."""
    meta = {}
    fpath = DATA / "combined_etfs.csv"
    if not fpath.exists():
        return meta
    with open(fpath) as f:
        for row in csv.DictReader(f):
            sym = row.get("symbol", "")
            if sym:
                meta[sym] = {
                    "vol_3y": float(row.get("vol_3y_pct") or row.get("vol_pct") or 0),
                    "sector": "ETF",
                    "daily_change": float(row.get("daily_change_pct") or 0),
                    "perf_1m": float(row.get("perf_1m_pct") or 0),
                    "perf_3m": float(row.get("perf_3m_pct") or 0),
                }
    return meta


def load_bond_metadata() -> Dict[str, dict]:
    """Load vol from combined_bonds.csv."""
    meta = {}
    fpath = DATA / "combined_bonds.csv"
    if not fpath.exists():
        return meta
    with open(fpath) as f:
        for row in csv.DictReader(f):
            sym = row.get("symbol", "")
            if sym:
                meta[sym] = {
                    "vol_3y": float(row.get("vol_3y_pct") or row.get("vol_pct") or 0),
                    "sector": "Bond",
                    "fund_type": row.get("fund_type", ""),
                }
    return meta


# ═══════════════════════════════════════════════════════════════════
# 2. FETCH REAL PRICES VIA TWELVE DATA API
# ═══════════════════════════════════════════════════════════════════

def fetch_prices_twelve_data(tickers: List[str]) -> Dict[str, np.ndarray]:
    """Fetch 252-day daily close prices via Twelve Data API."""
    if not API_KEY:
        print("  ⚠ TWELVE_DATA_API not set — skipping API fetch")
        return {}

    import urllib.request
    import urllib.error

    results = {}
    failed = []

    for i, tk in enumerate(tickers):
        url = (
            f"https://api.twelvedata.com/time_series?"
            f"symbol={tk}&interval=1day&outputsize=252&apikey={API_KEY}"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CovBenchmark/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())

            if data.get("status") == "error" or "values" not in data:
                failed.append(f"{tk}:{data.get('message', 'no values')[:40]}")
                continue

            closes = []
            for v in reversed(data["values"]):  # oldest first
                c = float(v["close"])
                if c > 0:
                    closes.append(c)

            if len(closes) >= 60:
                prices = np.array(closes)
                returns = np.diff(prices) / prices[:-1]
                results[tk] = returns
            else:
                failed.append(f"{tk}:only {len(closes)} days")

        except Exception as e:
            failed.append(f"{tk}:{str(e)[:40]}")

        if (i + 1) % 10 == 0:
            print(f"    ... {i+1}/{len(tickers)} fetched ({len(results)} ok)")
        time.sleep(API_SLEEP)

    if failed:
        print(f"  ⚠ Failed ({len(failed)}): {', '.join(failed[:15])}")
        if len(failed) > 15:
            print(f"    ... and {len(failed) - 15} more")

    return results


def load_backtest_returns() -> Dict[str, dict]:
    """Extract what we can from backtest_debug.json (sparse but real)."""
    fpath = DATA / "backtest_debug.json"
    if not fpath.exists():
        return {}
    with open(fpath) as f:
        bd = json.load(f)
    details = bd.get("asset_details", {})
    meta = {}
    for tk, info in details.items():
        if isinstance(info, dict):
            meta[tk] = {
                "vol_annual": float(info.get("volatility_annual_pct") or 0),
                "n_days": int(info.get("n_days_data") or 0),
                "type": info.get("type", ""),
            }
    return meta


# ═══════════════════════════════════════════════════════════════════
# 3. BUILD RETURNS MATRIX
# ═══════════════════════════════════════════════════════════════════

def build_returns_matrix(
    pf_tickers: Dict[str, dict],
    stock_meta: Dict[str, dict],
    etf_meta: Dict[str, dict],
    bond_meta: Dict[str, dict],
) -> Tuple[np.ndarray, List[dict]]:
    """
    Build aligned returns matrix from all sources.
    Returns (returns_matrix [T×N], asset_info [N items]).
    """
    all_tickers = list(pf_tickers.keys())
    print(f"\n  Target: {len(all_tickers)} tickers from portfolios")

    # 1. Fetch from Twelve Data
    print("  [Source 1] Fetching from Twelve Data API...")
    api_returns = fetch_prices_twelve_data(all_tickers)
    print(f"  → {len(api_returns)} tickers with real daily returns")

    # 2. Load backtest data for fallback vol
    bt_meta = load_backtest_returns()

    # 3. Build matrix
    # Align all API returns to same length
    if api_returns:
        min_len = min(len(r) for r in api_returns.values())
        min_len = max(min_len, 60)  # at least 60 days
        # Cap at 252
        min_len = min(min_len, 251)
    else:
        min_len = 251

    assets_with_returns = []
    returns_list = []

    for tk in all_tickers:
        info = pf_tickers[tk].copy()
        info["ticker"] = tk

        # Resolve sector
        sm = stock_meta.get(tk, {})
        em = etf_meta.get(tk, {})
        bm = bond_meta.get(tk, {})
        info["sector_resolved"] = sm.get("sector") or \
            SECTOR_MAP.get(info.get("sector", ""), "Other")
        info["vol_3y"] = sm.get("vol_3y") or em.get("vol_3y") or bm.get("vol_3y") or \
            bt_meta.get(tk, {}).get("vol_annual") or 20.0
        info["beta"] = sm.get("beta", 1.0)
        info["data_source"] = "unknown"

        if tk in api_returns:
            r = api_returns[tk]
            # Truncate to min_len
            r = r[-min_len:]
            returns_list.append(r)
            info["data_source"] = "twelve_data"
            assets_with_returns.append(info)
        # No API data — will be handled by synthetic fill below

    # If we have enough real data, use it
    n_real = len(returns_list)
    print(f"  → {n_real} assets with real returns (min_len={min_len})")

    # Fill missing tickers with synthetic returns correlated to the real ones
    missing_tickers = [tk for tk in all_tickers if tk not in api_returns]
    if missing_tickers and n_real >= 5:
        print(f"  [Synthetic fill] Generating returns for {len(missing_tickers)} missing tickers...")
        for tk in missing_tickers:
            info = pf_tickers[tk].copy()
            info["ticker"] = tk
            sm = stock_meta.get(tk, {})
            em = etf_meta.get(tk, {})
            bm = bond_meta.get(tk, {})
            info["sector_resolved"] = sm.get("sector") or \
                SECTOR_MAP.get(info.get("sector", ""), "Other")
            info["vol_3y"] = sm.get("vol_3y") or em.get("vol_3y") or bm.get("vol_3y") or \
                bt_meta.get(tk, {}).get("vol_annual") or 20.0
            info["beta"] = sm.get("beta", 1.0)
            info["data_source"] = "synthetic"

            # Generate correlated synthetic returns
            daily_vol = info["vol_3y"] / (100 * np.sqrt(252))
            noise = np.random.randn(min_len) * daily_vol

            # Add market factor from mean of real returns
            if returns_list:
                market = np.mean(np.column_stack(returns_list[:min(20, len(returns_list))]), axis=1)
                beta = info["beta"]
                synth = beta * market[:min_len] + noise[:min_len] * 0.7
            else:
                synth = noise[:min_len]

            returns_list.append(synth)
            assets_with_returns.append(info)

    elif not returns_list:
        # Complete fallback: all synthetic
        print("  [Full synthetic fallback] No API data available")
        for tk in all_tickers:
            info = pf_tickers[tk].copy()
            info["ticker"] = tk
            sm = stock_meta.get(tk, {})
            em = etf_meta.get(tk, {})
            bm = bond_meta.get(tk, {})
            info["sector_resolved"] = sm.get("sector") or \
                SECTOR_MAP.get(info.get("sector", ""), "Other")
            info["vol_3y"] = sm.get("vol_3y") or em.get("vol_3y") or bm.get("vol_3y") or 20.0
            info["beta"] = sm.get("beta", 1.0)
            info["data_source"] = "synthetic"
            assets_with_returns.append(info)

        # Generate correlated returns
        returns_matrix = _generate_correlated_synthetic(assets_with_returns, min_len)
        return returns_matrix, assets_with_returns

    # Align lengths
    actual_len = min(len(r) for r in returns_list)
    returns_matrix = np.column_stack([r[-actual_len:] for r in returns_list])
    # Clean NaN/Inf
    returns_matrix = np.nan_to_num(returns_matrix, nan=0.0, posinf=0.0, neginf=0.0)

    return returns_matrix, assets_with_returns


def _generate_correlated_synthetic(assets: List[dict], n_days: int) -> np.ndarray:
    """Full synthetic returns with sector-based correlations."""
    n = len(assets)
    corr = np.eye(n)
    for i in range(n):
        for j in range(i + 1, n):
            si = assets[i]["sector_resolved"]
            sj = assets[j]["sector_resolved"]
            c = get_sector_corr(si, sj)
            bi, bj = assets[i].get("beta", 1.0), assets[j].get("beta", 1.0)
            c *= max(0, 1.0 - abs(bi - bj) * 0.15)
            corr[i, j] = corr[j, i] = np.clip(c, -0.5, 0.95)

    eigvals, eigvecs = np.linalg.eigh(corr)
    eigvals = np.maximum(eigvals, 1e-4)
    corr = eigvecs @ np.diag(eigvals) @ eigvecs.T
    d = np.sqrt(np.diag(corr))
    corr = corr / np.outer(d, d)
    np.fill_diagonal(corr, 1.0)

    daily_vols = np.array([a["vol_3y"] / (100 * np.sqrt(252)) for a in assets])
    L = np.linalg.cholesky(corr)
    Z = np.random.randn(n_days, n)
    return (Z @ L.T) * daily_vols[None, :]


# ═══════════════════════════════════════════════════════════════════
# 4. COVARIANCE ESTIMATORS
# ═══════════════════════════════════════════════════════════════════

def cov_sample(returns):
    """Config A: Standard sample covariance."""
    return np.cov(returns, rowvar=False) * 252


def cov_ledoit_wolf(returns):
    """Config B: Ledoit-Wolf shrinkage."""
    lw = LedoitWolf()
    lw.fit(returns)
    return lw.covariance_ * 252


def cov_ewma(returns, halflife=63):
    """Config C/D: EWMA covariance."""
    n_obs = returns.shape[0]
    decay = np.log(2) / halflife
    weights = np.exp(-decay * np.arange(n_obs)[::-1])
    w_sum = weights.sum()
    if w_sum == 0 or not np.isfinite(w_sum):
        weights = np.ones(n_obs) / n_obs
    else:
        weights /= w_sum
    mean = np.average(returns, weights=weights, axis=0)
    centered = returns - mean
    cov = (centered * weights[:, None]).T @ centered
    return np.nan_to_num(cov, nan=0.0, posinf=0.0, neginf=0.0) * 252


def cov_pca_fixed(returns, n_factors=5):
    """Config E: PCA with fixed number of factors."""
    cov_raw = np.cov(returns, rowvar=False) * 252
    eigenvalues, eigenvectors = np.linalg.eigh(cov_raw)
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues, eigenvectors = eigenvalues[idx], eigenvectors[:, idx]
    n_factors = min(n_factors, len(eigenvalues))
    B = eigenvectors[:, :n_factors]
    F = np.diag(eigenvalues[:n_factors])
    cov_signal = B @ F @ B.T
    residual = np.diag(np.maximum(np.diag(cov_raw - cov_signal), 0))
    return cov_signal + residual


def cov_pca_mp(returns):
    """Config F: PCA with Marchenko-Pastur threshold."""
    n_obs, n_assets = returns.shape
    cov_raw = np.cov(returns, rowvar=False) * 252
    eigenvalues, eigenvectors = np.linalg.eigh(cov_raw)
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues, eigenvectors = eigenvalues[idx], eigenvectors[:, idx]

    q = n_assets / max(n_obs, 1)
    lambda_plus = (1 + np.sqrt(q)) ** 2
    threshold = lambda_plus * np.mean(eigenvalues)
    n_factors = max(3, min(int(np.sum(eigenvalues > threshold)), 10))

    B = eigenvectors[:, :n_factors]
    F = np.diag(eigenvalues[:n_factors])
    cov_signal = B @ F @ B.T
    residual = np.diag(np.maximum(np.diag(cov_raw - cov_signal), 0))
    return cov_signal + residual


def cov_lw_pca_mp(returns):
    """Config G: Ledoit-Wolf + PCA MP (our target config)."""
    # Step 1: Ledoit-Wolf
    lw = LedoitWolf()
    lw.fit(returns)
    cov_lw = lw.covariance_ * 252
    # Step 2: PCA denoise
    n_obs, n_assets = returns.shape
    eigenvalues, eigenvectors = np.linalg.eigh(cov_lw)
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues, eigenvectors = eigenvalues[idx], eigenvectors[:, idx]

    q = n_assets / max(n_obs, 1)
    lambda_plus = (1 + np.sqrt(q)) ** 2
    threshold = lambda_plus * np.mean(eigenvalues)
    n_factors = max(3, min(int(np.sum(eigenvalues > threshold)), 10))

    B = eigenvectors[:, :n_factors]
    F = np.diag(eigenvalues[:n_factors])
    cov_signal = B @ F @ B.T
    residual = np.diag(np.maximum(np.diag(cov_lw - cov_signal), 0))
    return cov_signal + residual


def cov_ewma_pca_mp(returns):
    """Config H: EWMA 63j + PCA MP."""
    cov_e = cov_ewma(returns, halflife=63)
    n_obs, n_assets = returns.shape
    eigenvalues, eigenvectors = np.linalg.eigh(cov_e)
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues, eigenvectors = eigenvalues[idx], eigenvectors[:, idx]

    q = n_assets / max(n_obs, 1)
    lambda_plus = (1 + np.sqrt(q)) ** 2
    threshold = lambda_plus * np.mean(eigenvalues)
    n_factors = max(3, min(int(np.sum(eigenvalues > threshold)), 10))

    B = eigenvectors[:, :n_factors]
    F = np.diag(eigenvalues[:n_factors])
    cov_signal = B @ F @ B.T
    residual = np.diag(np.maximum(np.diag(cov_e - cov_signal), 0))
    return cov_signal + residual


def build_structured_cov(assets: List[dict]) -> np.ndarray:
    """Build structured covariance — v7.2 cascade recalibrée."""
    n = len(assets)
    cov = np.zeros((n, n))
    for i in range(n):
        vol_i = assets[i]["vol_3y"] / 100
        ti = assets[i].get("type", "stock")
        si = assets[i]["sector_resolved"]
        for j in range(n):
            vol_j = assets[j]["vol_3y"] / 100
            tj = assets[j].get("type", "stock")
            sj = assets[j]["sector_resolved"]
            if i == j:
                cov[i, j] = vol_i ** 2
            else:
                # Gold
                if ti == "gold" or tj == "gold":
                    if ti == "gold" and tj == "gold":
                        corr = 0.95
                    elif _is_bond({"type": ti}) or _is_bond({"type": tj}):
                        corr = CORR_GOLD_BOND
                    else:
                        corr = CORR_EQUITY_GOLD
                # Bond × Equity
                elif (ti == "bond" and tj in ("stock", "etf")) or \
                     (tj == "bond" and ti in ("stock", "etf")):
                    has_stock = ti == "stock" or tj == "stock"
                    corr = CORR_EQUITY_BOND if has_stock else CORR_ETF_BOND
                # Crypto
                elif ti == "crypto" or tj == "crypto":
                    corr = CORR_CRYPTO_OTHER
                # Same category
                elif ti == tj:
                    if ti == "stock":
                        corr = CORR_SAME_SECTOR if (si and si == sj and si != "Other") \
                               else CORR_SAME_CATEGORY_STOCK
                    elif ti == "bond":
                        corr = CORR_SAME_CATEGORY_BOND
                    elif ti == "etf":
                        corr = CORR_SAME_CATEGORY_ETF
                    else:
                        corr = CORR_DEFAULT
                else:
                    corr = CORR_DEFAULT
                cov[i, j] = corr * vol_i * vol_j
    return cov


def hybridize(cov_emp, cov_struct, w_emp=0.85):
    return w_emp * cov_emp + (1 - w_emp) * cov_struct


def ensure_pd(cov, min_eig=1e-6):
    cov = np.nan_to_num(cov, nan=0.0, posinf=0.0, neginf=0.0)
    cov = (cov + cov.T) / 2
    eigvals, eigvecs = np.linalg.eigh(cov)
    eigvals = np.maximum(eigvals, min_eig)
    return eigvecs @ np.diag(eigvals) @ eigvecs.T


# ═══════════════════════════════════════════════════════════════════
# 5. PORTFOLIO OPTIMIZATION (min-variance)
# ═══════════════════════════════════════════════════════════════════

def min_variance_portfolio(cov, max_single=0.15):
    n = cov.shape[0]
    cov_pd = ensure_pd(cov)

    def objective(w):
        return float(w @ cov_pd @ w)

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
    bounds = [(0, max_single)] * n
    w0 = np.ones(n) / n
    result = minimize(objective, w0, method="SLSQP", bounds=bounds,
                      constraints=constraints, options={"maxiter": 500, "ftol": 1e-10})
    if result.success:
        w = np.maximum(result.x, 0)
        w /= w.sum()
        return w
    return np.ones(n) / n


# ═══════════════════════════════════════════════════════════════════
# 6. METRICS
# ═══════════════════════════════════════════════════════════════════

# Registry for recomputing cov in rolling/OOS tests
_COV_FUNCS = {}


def _recompute_cov(returns, label):
    func = _COV_FUNCS.get(label)
    return func(returns) if func else np.cov(returns, rowvar=False) * 252


def _is_equity(asset):
    """Is this a stock or equity ETF (not bond, gold, crypto)?"""
    return asset.get("type") in ("stock", "etf")

def _is_bond(asset):
    return asset.get("type") == "bond"

def _is_gold(asset):
    return asset.get("type") == "gold"

def _is_crypto(asset):
    return asset.get("type") == "crypto"


def compute_correlation_rmse(cov_est, returns, assets, pair_type="equity_etf"):
    """Compute RMSE between estimated and realized correlations for specific pair types."""
    n = len(assets)
    corr_realized = np.corrcoef(returns, rowvar=False)

    vols = np.sqrt(np.maximum(np.diag(cov_est), 1e-12))
    corr_estimated = cov_est / np.outer(vols, vols)
    np.fill_diagonal(corr_estimated, 1.0)
    corr_estimated = np.clip(corr_estimated, -1, 1)

    diffs = []
    for i in range(n):
        for j in range(i + 1, n):
            ai, aj = assets[i], assets[j]

            if pair_type == "equity_etf":
                if (ai["type"] == "stock" and aj["type"] == "etf") or \
                   (ai["type"] == "etf" and aj["type"] == "stock"):
                    diffs.append(corr_estimated[i, j] - corr_realized[i, j])
            elif pair_type == "equity_bond":
                if (_is_equity(ai) and _is_bond(aj)) or (_is_bond(ai) and _is_equity(aj)):
                    diffs.append(corr_estimated[i, j] - corr_realized[i, j])

    if not diffs:
        return None
    return float(np.sqrt(np.mean(np.array(diffs) ** 2)))


def compute_mp_factors(returns):
    """Count eigenvalues above Marchenko-Pastur threshold."""
    n_obs, n_assets = returns.shape
    cov_raw = np.cov(returns, rowvar=False) * 252
    eigenvalues = np.linalg.eigvalsh(cov_raw)
    eigenvalues = np.sort(eigenvalues)[::-1]

    q = n_assets / max(n_obs, 1)
    lambda_plus = (1 + np.sqrt(q)) ** 2
    threshold = lambda_plus * np.mean(eigenvalues)
    n_factors = int(np.sum(eigenvalues > threshold))

    # Normalized eigenvalues (as % of total variance)
    total = eigenvalues.sum()
    eig_pct = (eigenvalues / total * 100)[:min(15, len(eigenvalues))]

    return n_factors, eigenvalues, eig_pct, threshold


def get_top_bottom_correlations(returns, assets, n=10):
    """Get top-N most and least correlated pairs (realized)."""
    corr = np.corrcoef(returns, rowvar=False)
    n_assets = len(assets)
    pairs = []
    for i in range(n_assets):
        for j in range(i + 1, n_assets):
            pairs.append((
                assets[i]["ticker"], assets[j]["ticker"],
                float(corr[i, j]),
                assets[i].get("type", "?"), assets[j].get("type", "?"),
            ))
    pairs.sort(key=lambda x: -x[2])
    top_n = pairs[:n]
    bottom_n = pairs[-n:]
    return top_n, bottom_n


def compute_metrics(cov, returns_full, assets, label, cov_struct):
    """Compute all metrics for a given covariance matrix."""
    n = cov.shape[0]
    cov_pd = ensure_pd(cov)
    metrics = {"label": label}

    # a) Stability
    eigvals = np.linalg.eigvalsh(cov_pd)
    metrics["condition_number"] = float(eigvals.max() / max(eigvals.min(), 1e-12))

    lw_ref = cov_ledoit_wolf(returns_full)
    metrics["frobenius_to_lw"] = float(np.linalg.norm(cov_pd - lw_ref, "fro"))

    # b) Portfolio metrics
    w = min_variance_portfolio(cov_pd)
    metrics["top5_weight_pct"] = round(float(np.sort(w)[-5:].sum()) * 100, 1) if n >= 5 else 100.0
    metrics["hhi"] = round(float(np.sum(w ** 2)), 4)
    metrics["n_positions_gt_1pct"] = int(np.sum(w > 0.01))
    port_var = float(w @ cov_pd @ w)
    metrics["port_vol_annual_pct"] = round(np.sqrt(port_var) * 100, 2)

    # c) Temporal stability
    returns_short = returns_full[:-20]
    cov_short = ensure_pd(_recompute_cov(returns_short, label))
    w_short = min_variance_portfolio(cov_short)
    metrics["implied_turnover_pct"] = round(float(0.5 * np.sum(np.abs(w - w_short))) * 100, 1)

    # d) Out-of-sample
    n_obs = returns_full.shape[0]
    train_end = min(200, n_obs - 52)
    if train_end >= 60:
        ret_train = returns_full[:train_end]
        ret_test = returns_full[train_end:]
        cov_train = ensure_pd(_recompute_cov(ret_train, label))
        w_oos = min_variance_portfolio(cov_train)
        predicted_var = float(w_oos @ cov_train @ w_oos) / 252
        realized_returns = ret_test @ w_oos
        realized_var = float(np.var(realized_returns))
        if realized_var > 0:
            metrics["var_ratio"] = round(predicted_var / realized_var, 2)
        else:
            metrics["var_ratio"] = None
        metrics["predicted_daily_vol_bps"] = round(np.sqrt(max(predicted_var, 0)) * 10000, 1)
        metrics["realized_daily_vol_bps"] = round(np.sqrt(max(realized_var, 0)) * 10000, 1)
    else:
        metrics["var_ratio"] = None
        metrics["predicted_daily_vol_bps"] = None
        metrics["realized_daily_vol_bps"] = None

    # e) Correlation RMSE
    metrics["corr_rmse_stock_etf"] = compute_correlation_rmse(cov_pd, returns_full, assets, "equity_etf")
    metrics["corr_rmse_stock_bond"] = compute_correlation_rmse(cov_pd, returns_full, assets, "equity_bond")

    return metrics


# ═══════════════════════════════════════════════════════════════════
# 7. MAIN BENCHMARK
# ═══════════════════════════════════════════════════════════════════

def run_benchmark():
    t0 = time.time()
    print("=" * 80)
    print("📐 COVARIANCE BENCHMARK — 8 configs × 2 modes — REAL DATA")
    print("=" * 80)

    # ── Load metadata ──
    print("\n[1/6] Loading portfolio tickers + metadata...")
    pf_tickers = load_portfolio_tickers()
    stock_meta = load_stock_metadata()
    etf_meta = load_etf_metadata()
    bond_meta = load_bond_metadata()
    print(f"  Portfolio tickers: {len(pf_tickers)}")
    print(f"  Stock meta: {len(stock_meta)} | ETF meta: {len(etf_meta)} | Bond meta: {len(bond_meta)}")

    # ── Build returns matrix ──
    print("\n[2/6] Building returns matrix...")
    returns, assets = build_returns_matrix(pf_tickers, stock_meta, etf_meta, bond_meta)
    n_obs, n_assets = returns.shape
    print(f"  Returns: {n_obs} days × {n_assets} assets")

    # Data source breakdown
    sources = defaultdict(int)
    for a in assets:
        sources[a["data_source"]] += 1
    print(f"  Sources: {dict(sources)}")

    # Type breakdown
    types = defaultdict(int)
    for a in assets:
        types[a.get("type", "?")] += 1
    print(f"  Types: {dict(types)}")

    # ── Marchenko-Pastur analysis ──
    print("\n[3/6] Marchenko-Pastur eigenvalue analysis...")
    n_mp_factors, eigenvalues_raw, eig_pct, mp_threshold = compute_mp_factors(returns)
    print(f"  MP threshold: {mp_threshold:.4f}")
    print(f"  Significant factors (above MP): {n_mp_factors}")
    print(f"  Top 10 eigenvalue % of variance: {', '.join(f'{p:.1f}%' for p in eig_pct[:10])}")
    cumulative = np.cumsum(eig_pct)
    print(f"  Cumulative: {', '.join(f'{c:.0f}%' for c in cumulative[:10])}")
    if n_mp_factors < 5:
        print(f"  ⚠ Only {n_mp_factors} real factors — PCA 5 factors may overfit!")
    elif n_mp_factors > 7:
        print(f"  ℹ {n_mp_factors} real factors — PCA 5 factors may underfit")

    # ── Top/bottom correlations ──
    print("\n[4/6] Realized correlations (top/bottom 10 pairs)...")
    top_pairs, bottom_pairs = get_top_bottom_correlations(returns, assets)

    print("  🔴 Most correlated:")
    for tk1, tk2, corr, t1, t2 in top_pairs:
        print(f"    {tk1:>6} ({t1:>5}) × {tk2:<6} ({t2:<5}) = {corr:+.3f}")
    print("  🔵 Least correlated:")
    for tk1, tk2, corr, t1, t2 in bottom_pairs:
        print(f"    {tk1:>6} ({t1:>5}) × {tk2:<6} ({t2:<5}) = {corr:+.3f}")

    # Compare with structured predictions for these pairs
    cov_struct = build_structured_cov(assets)
    vols_struct = np.sqrt(np.maximum(np.diag(cov_struct), 1e-12))
    corr_struct = cov_struct / np.outer(vols_struct, vols_struct)
    np.fill_diagonal(corr_struct, 1.0)

    asset_idx = {a["ticker"]: i for i, a in enumerate(assets)}
    print("\n  Realized vs Structured (top 10 most correlated):")
    for tk1, tk2, corr_r, _, _ in top_pairs:
        i, j = asset_idx.get(tk1), asset_idx.get(tk2)
        if i is not None and j is not None:
            corr_s = corr_struct[i, j]
            gap = corr_r - corr_s
            print(f"    {tk1:>6}×{tk2:<6}: realized={corr_r:+.3f} structured={corr_s:+.3f} gap={gap:+.3f}")

    # ── Benchmark configs ──
    print("\n[5/6] Computing 8 covariance configurations × 2 modes...")

    configs = [
        ("A: Sample", cov_sample),
        ("B: Ledoit-Wolf", cov_ledoit_wolf),
        ("C: EWMA 63j", lambda r: cov_ewma(r, halflife=63)),
        ("D: EWMA 42j", lambda r: cov_ewma(r, halflife=42)),
        ("E: PCA 5 factors", lambda r: cov_pca_fixed(r, n_factors=5)),
        ("F: PCA Marchenko-Pastur", cov_pca_mp),
        ("G: LW + PCA MP", cov_lw_pca_mp),
        ("H: EWMA63 + PCA MP", cov_ewma_pca_mp),
    ]

    # Register recompute funcs
    for name, func in configs:
        _COV_FUNCS[f"{name} (pure)"] = func
        _COV_FUNCS[f"{name} (hybrid)"] = lambda r, f=func, a=assets: hybridize(f(r), build_structured_cov(a))

    results = []
    for name, func in configs:
        cov_emp = func(returns)

        # Pure
        lp = f"{name} (pure)"
        m = compute_metrics(cov_emp, returns, assets, lp, cov_struct)
        results.append(m)
        print(f"  ✓ {lp}: cond={m['condition_number']:.0f}, vol={m['port_vol_annual_pct']}%, turn={m['implied_turnover_pct']}%")

        # Hybrid
        cov_hyb = hybridize(cov_emp, cov_struct)
        lh = f"{name} (hybrid)"
        m2 = compute_metrics(cov_hyb, returns, assets, lh, cov_struct)
        results.append(m2)
        print(f"  ✓ {lh}: cond={m2['condition_number']:.0f}, vol={m2['port_vol_annual_pct']}%, turn={m2['implied_turnover_pct']}%")

    # ═══════════════════════════════════════════════════════════════
    # OUTPUT
    # ═══════════════════════════════════════════════════════════════

    print("\n[6/6] Results:")
    print("=" * 160)
    hdr = (
        f"{'Config':<30} {'Cond#':>8} {'Frob':>7} {'Vol%':>6} {'Top5%':>6} "
        f"{'HHI':>7} {'#Pos':>5} {'Turn%':>6} {'VarR':>6} "
        f"{'CorrEq-ETF':>10} {'CorrEq-Bd':>10}"
    )
    print(hdr)
    print("-" * 160)

    best_by = defaultdict(lambda: (None, float("inf")))

    for m in results:
        vr = f"{m['var_ratio']:.2f}" if m["var_ratio"] is not None else " N/A"
        ce = f"{m['corr_rmse_stock_etf']:.3f}" if m["corr_rmse_stock_etf"] is not None else "  N/A"
        cb = f"{m['corr_rmse_stock_bond']:.3f}" if m["corr_rmse_stock_bond"] is not None else "  N/A"
        print(
            f"{m['label']:<30} {m['condition_number']:>8.0f} {m['frobenius_to_lw']:>7.2f} "
            f"{m['port_vol_annual_pct']:>6.2f} {m['top5_weight_pct']:>6.1f} "
            f"{m['hhi']:>7.4f} {m['n_positions_gt_1pct']:>5} {m['implied_turnover_pct']:>6.1f} "
            f"{vr:>6} {ce:>10} {cb:>10}"
        )

        label = m["label"]
        for metric in ["condition_number", "frobenius_to_lw", "hhi", "implied_turnover_pct"]:
            val = m[metric]
            if val < best_by[metric][1]:
                best_by[metric] = (label, val)
        if m["n_positions_gt_1pct"] > -best_by["n_positions_gt_1pct"][1]:
            best_by["n_positions_gt_1pct"] = (label, -m["n_positions_gt_1pct"])
        if m["var_ratio"] is not None:
            dist = abs(m["var_ratio"] - 1.0)
            if dist < best_by["var_ratio"][1]:
                best_by["var_ratio"] = (label, dist)
        if m["corr_rmse_stock_etf"] is not None:
            if m["corr_rmse_stock_etf"] < best_by["corr_rmse_stock_etf"][1]:
                best_by["corr_rmse_stock_etf"] = (label, m["corr_rmse_stock_etf"])
        if m["corr_rmse_stock_bond"] is not None:
            if m["corr_rmse_stock_bond"] < best_by["corr_rmse_stock_bond"][1]:
                best_by["corr_rmse_stock_bond"] = (label, m["corr_rmse_stock_bond"])

    print("-" * 160)
    print("\n🏆 Best by metric:")
    for metric in sorted(best_by.keys()):
        label, val = best_by[metric]
        if label:
            print(f"  {metric:<30} → {label}")

    # Ranking
    print("\n" + "=" * 80)
    print("📋 OVERALL RANKING")
    print("=" * 80)

    rank_metrics = ["condition_number", "frobenius_to_lw", "hhi", "implied_turnover_pct"]
    scores = defaultdict(float)

    for metric in rank_metrics:
        vals = sorted([(m["label"], m[metric]) for m in results], key=lambda x: x[1])
        for rank, (label, _) in enumerate(vals):
            scores[label] += rank

    vr_vals = sorted([(m["label"], abs(m["var_ratio"] - 1.0)) for m in results if m["var_ratio"] is not None], key=lambda x: x[1])
    for rank, (label, _) in enumerate(vr_vals):
        scores[label] += rank

    np_vals = sorted([(m["label"], m["n_positions_gt_1pct"]) for m in results], key=lambda x: -x[1])
    for rank, (label, _) in enumerate(np_vals):
        scores[label] += rank

    for metric in ["corr_rmse_stock_etf", "corr_rmse_stock_bond"]:
        vals = [(m["label"], m[metric]) for m in results if m[metric] is not None]
        vals.sort(key=lambda x: x[1])
        for rank, (label, _) in enumerate(vals):
            scores[label] += rank

    ranked = sorted(scores.items(), key=lambda x: x[1])

    print("\nOverall ranking (lower score = better):")
    for i, (label, score) in enumerate(ranked[:8]):
        marker = " ← RECOMMENDED" if i == 0 else ""
        print(f"  {i+1}. {label:<30} score={score:.0f}{marker}")

    winner = ranked[0][0]
    print(f"\n✅ Best overall: {winner}")

    # ══════════════════════════════════════════════════════════════════
    # CORRÉLATIONS RÉALISÉES vs HARDCODÉES
    # ══════════════════════════════════════════════════════════════════
    print("\n" + "=" * 80)
    print("📊 CORRÉLATIONS RÉALISÉES vs HARDCODÉES")
    print("=" * 80)

    corr_realized = np.corrcoef(returns, rowvar=False)
    pair_buckets = {
        "equity_equity_same_sector": [],
        "equity_equity_diff_sector": [],
        "equity_bond": [],
        "equity_gold": [],
        "bond_bond": [],
        "crypto_other": [],
    }

    for i in range(n_assets):
        for j in range(i + 1, n_assets):
            ai, aj = assets[i], assets[j]
            c = corr_realized[i, j]

            if _is_equity(ai) and _is_equity(aj):
                if ai["sector_resolved"] == aj["sector_resolved"] and ai["sector_resolved"] != "Other":
                    pair_buckets["equity_equity_same_sector"].append(c)
                else:
                    pair_buckets["equity_equity_diff_sector"].append(c)
            elif (_is_equity(ai) and _is_bond(aj)) or (_is_bond(ai) and _is_equity(aj)):
                pair_buckets["equity_bond"].append(c)
            elif (_is_equity(ai) and _is_gold(aj)) or (_is_gold(ai) and _is_equity(aj)):
                pair_buckets["equity_gold"].append(c)
            elif _is_bond(ai) and _is_bond(aj):
                pair_buckets["bond_bond"].append(c)
            elif _is_crypto(ai) or _is_crypto(aj):
                pair_buckets["crypto_other"].append(c)

    corr_comparison = {}
    hardcoded = {
        "equity_equity_same_sector": ("CORR_SAME_SECTOR", CORR_SAME_SECTOR),
        "equity_equity_diff_sector": ("CORR_DEFAULT", CORR_DEFAULT),
        "equity_bond": ("CORR_EQUITY_BOND", CORR_EQUITY_BOND),
        "equity_gold": ("(no constant)", None),
        "bond_bond": ("CORR_SAME_CATEGORY", CORR_SAME_CATEGORY),
        "crypto_other": ("CORR_CRYPTO_OTHER", CORR_CRYPTO_OTHER),
    }

    print(f"\n  {'Pair Type':<30} {'N pairs':>8} {'Realized':>10} {'Std':>8} {'Hardcoded':>12} {'Gap':>8} {'Status'}")
    print("  " + "-" * 100)

    for bucket, pairs in pair_buckets.items():
        hc_name, hc_val = hardcoded[bucket]
        n_pairs = len(pairs)
        if n_pairs == 0:
            print(f"  {bucket:<30} {0:>8}       —         —   {hc_name:>12}       —")
            corr_comparison[bucket] = {"n": 0, "realized": None, "hardcoded": hc_val}
            continue

        avg = float(np.mean(pairs))
        std = float(np.std(pairs))
        hc_str = f"{hc_val:+.2f}" if hc_val is not None else "  N/A"
        gap = avg - hc_val if hc_val is not None else None
        gap_str = f"{gap:+.3f}" if gap is not None else "  N/A"
        status = ""
        if gap is not None:
            if abs(gap) > 0.15:
                status = "⚠ WRONG"
            elif abs(gap) > 0.08:
                status = "⚡ CHECK"
            else:
                status = "✅ OK"

        print(f"  {bucket:<30} {n_pairs:>8} {avg:>+10.3f} {std:>8.3f} {hc_str:>12} {gap_str:>8} {status}")
        corr_comparison[bucket] = {
            "n": n_pairs, "realized_mean": round(avg, 3), "realized_std": round(std, 3),
            "hardcoded_name": hc_name, "hardcoded_value": hc_val,
            "gap": round(gap, 3) if gap is not None else None,
        }

    # Recommendations
    print("\n  Recommendations:")
    for bucket, info in corr_comparison.items():
        if info.get("gap") is not None and abs(info["gap"]) > 0.10:
            print(f"    → {info['hardcoded_name']}: change from {info['hardcoded_value']:+.2f} to {info['realized_mean']:+.2f} "
                  f"(gap={info['gap']:+.3f}, N={info['n']} pairs)")
    if any(pair_buckets["equity_gold"]):
        avg_gold = float(np.mean(pair_buckets["equity_gold"]))
        print(f"    → ADD CORR_EQUITY_GOLD = {avg_gold:.2f} (currently using default={CORR_DEFAULT})")

    # MP factors summary
    print(f"\n  Marchenko-Pastur factors: {n_mp_factors}")
    print(f"  Recommendation for PCA: use {n_mp_factors} factors (currently testing 5 fixed)")
    if n_mp_factors != 5:
        print(f"  ⚠ PCA 5 factors is {'overfitting' if n_mp_factors < 5 else 'underfitting'} "
              f"(optimal = {n_mp_factors})")

    # ── Save JSON ──
    output = {
        "_meta": {
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "n_assets": n_assets,
            "n_days": n_obs,
            "data_sources": dict(sources),
            "asset_types": dict(types),
            "tickers": [a["ticker"] for a in assets],
        },
        "eigenvalue_analysis": {
            "mp_factors": n_mp_factors,
            "mp_threshold": round(float(mp_threshold), 6),
            "top_10_eigenvalue_pct": [round(float(p), 2) for p in eig_pct[:10]],
            "cumulative_pct": [round(float(c), 1) for c in cumulative[:10]],
        },
        "correlation_comparison": corr_comparison,
        "correlation_top_pairs": {
            "most_correlated": [{"t1": t1, "t2": t2, "corr": round(c, 3), "type1": ty1, "type2": ty2}
                                for t1, t2, c, ty1, ty2 in top_pairs],
            "least_correlated": [{"t1": t1, "t2": t2, "corr": round(c, 3), "type1": ty1, "type2": ty2}
                                 for t1, t2, c, ty1, ty2 in bottom_pairs],
        },
        "results": results,
        "ranking": [{"rank": i + 1, "label": l, "score": round(s, 1)} for i, (l, s) in enumerate(ranked)],
        "recommendation": winner,
        "best_by_metric": {k: v[0] for k, v in best_by.items() if v[0]},
    }

    out_path = DATA / "covariance_benchmark_real.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n  Saved to {out_path}")

    elapsed = time.time() - t0
    print(f"\n⏱ Done in {elapsed:.1f}s")
    return output


if __name__ == "__main__":
    run_benchmark()
