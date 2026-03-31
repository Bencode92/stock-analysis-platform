#!/usr/bin/env python3
"""
covariance_benchmark_full.py — Full-universe covariance benchmark.

Tests 8 covariance configs on ~170 tickers (portfolio + top liquid + ETFs + bonds)
to eliminate selection bias from the 53-ticker benchmark.

Usage: TWELVE_DATA_API=xxx python3 scripts/covariance_benchmark_full.py
"""

import json, csv, os, re, time, warnings
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple

import numpy as np
from scipy.optimize import minimize
from sklearn.covariance import LedoitWolf

warnings.filterwarnings("ignore")
np.random.seed(42)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

API_KEY = os.environ.get("TWELVE_DATA_API", "")
API_SLEEP = 0.25
TICKER_RE = re.compile(r'^[A-Z]{1,5}(\.[A-Z]{1,2})?$')
CACHE_FILE = DATA / "prices_cache.json"
CACHE_TTL = 24 * 3600  # 24h

BOND_TICKERS = {
    "BND","AGG","TLT","IEF","SHY","VCIT","VCSH","BIV","BSV","LQD","HYG","GVI",
    "GOVT","TIPS","VGSH","SCHO","SPTS","SGOV","CLTL","STIP","PAAA","SPIB","IGIB",
    "VTEB","GBIL","SHYG","USHY","IGSB","FLOT","JPST","NEAR","MINT","SHV","BIL",
}
GOLD_TICKERS = {"GLD","IAU","SGOL","GLDM","AAAU","SLV","SLVP"}

# v7.2 CORR_* (from optimizer.py)
CORR_SAME_SECTOR = 0.37
CORR_SAME_CAT_STOCK = 0.22
CORR_SAME_CAT_ETF = 0.62
CORR_SAME_CAT_BOND = 0.48
CORR_EQUITY_BOND = 0.05
CORR_ETF_BOND = 0.13
CORR_EQUITY_GOLD = 0.15
CORR_GOLD_BOND = 0.04
CORR_CRYPTO_OTHER = 0.25
CORR_DEFAULT = 0.20

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


def classify(ticker, category=""):
    if ticker in BOND_TICKERS:
        return "bond"
    if ticker in GOLD_TICKERS:
        return "gold"
    c = category.lower()
    if c in ("obligations", "bond", "bonds"):
        return "bond"
    if c == "crypto":
        return "crypto"
    if c == "etf":
        return "etf"
    return "stock"


# ═══════════════════════════════════════════════════════════════════
# 1. LOAD ALL TICKERS
# ═══════════════════════════════════════════════════════════════════

def load_all_tickers():
    """Load and classify all available tickers from all sources."""
    tickers = {}  # ticker -> {ticker, type, sector, region, source, market_cap}

    # Portfolio tickers (priority)
    pf_tickers = set()
    for fname in ["portfolios.json", "portfolios_euus.json"]:
        fp = DATA / fname
        if not fp.exists():
            continue
        pf = json.load(open(fp))
        for profile in ["Agressif", "Modéré", "Stable"]:
            p = pf.get(profile, {})
            for tk in list(p.get("_tickers_meta", {}).keys()) + list(p.get("_tickers", [])):
                if TICKER_RE.match(tk):
                    pf_tickers.add(tk)

    # Stocks
    stock_counts = {}
    for fname, region in [("stocks_us.json", "US"), ("stocks_europe.json", "EU"), ("stocks_asia.json", "ASIA")]:
        fp = DATA / fname
        if not fp.exists():
            continue
        d = json.load(open(fp))
        stocks = d if isinstance(d, list) else d.get("stocks", d.get("data", []))
        count = 0
        for s in stocks:
            tk = s.get("ticker", "")
            if not TICKER_RE.match(tk):
                continue
            count += 1
            tickers[tk] = {
                "ticker": tk,
                "type": classify(tk),
                "sector": SECTOR_MAP.get(s.get("sector", ""), "Other"),
                "region": region,
                "source": "stock",
                "market_cap": float(s.get("market_cap") or 0),
                "vol_3y": float(s.get("volatility_3y") or 0),
                "in_portfolio": tk in pf_tickers,
            }
        stock_counts[region] = count

    # ETFs
    etf_count = 0
    fp = DATA / "combined_etfs.csv"
    if fp.exists():
        for row in csv.DictReader(open(fp)):
            tk = row.get("symbol", "")
            if not TICKER_RE.match(tk) or tk in tickers:
                continue
            etf_count += 1
            tickers[tk] = {
                "ticker": tk,
                "type": classify(tk, "etf"),
                "sector": "ETF",
                "region": "GLOBAL",
                "source": "etf",
                "market_cap": 0,
                "vol_3y": float(row.get("vol_3y_pct") or row.get("vol_pct") or 0),
                "in_portfolio": tk in pf_tickers,
            }

    # Bonds
    bond_count = 0
    fp = DATA / "combined_bonds.csv"
    if fp.exists():
        for row in csv.DictReader(open(fp)):
            tk = row.get("symbol", "")
            if not TICKER_RE.match(tk) or tk in tickers:
                continue
            bond_count += 1
            tickers[tk] = {
                "ticker": tk,
                "type": "bond",
                "sector": "Bond",
                "region": "GLOBAL",
                "source": "bond",
                "market_cap": 0,
                "vol_3y": float(row.get("vol_3y_pct") or row.get("vol_pct") or 0),
                "in_portfolio": tk in pf_tickers,
            }

    print(f"  Stocks: US={stock_counts.get('US',0)} EU={stock_counts.get('EU',0)} Asia={stock_counts.get('ASIA',0)}")
    print(f"  ETFs: {etf_count} | Bonds: {bond_count}")
    print(f"  Portfolio tickers: {len(pf_tickers)}")
    print(f"  Total unique: {len(tickers)}")

    return tickers, pf_tickers


def sample_tickers(all_tickers, pf_tickers, target=170):
    """Smart sampling: portfolio + top liquid + ETFs + bonds."""
    selected = set()

    # 1. ALL portfolio tickers
    for tk in pf_tickers:
        if tk in all_tickers:
            selected.add(tk)
    print(f"  [1] Portfolio: {len(selected)}")

    # 2. Top 30 US stocks by market_cap (not already selected)
    us_stocks = sorted(
        [t for t in all_tickers.values() if t["region"] == "US" and t["source"] == "stock" and t["ticker"] not in selected],
        key=lambda x: -x["market_cap"]
    )
    for s in us_stocks[:30]:
        selected.add(s["ticker"])
    print(f"  [2] +Top 30 US stocks: {len(selected)}")

    # 3. Top 20 EU stocks
    eu_stocks = sorted(
        [t for t in all_tickers.values() if t["region"] == "EU" and t["source"] == "stock" and t["ticker"] not in selected],
        key=lambda x: -x["market_cap"]
    )
    for s in eu_stocks[:20]:
        selected.add(s["ticker"])
    print(f"  [3] +Top 20 EU stocks: {len(selected)}")

    # 4. Top 15 Asia stocks (only valid ticker format)
    asia_stocks = sorted(
        [t for t in all_tickers.values() if t["region"] == "ASIA" and t["source"] == "stock" and t["ticker"] not in selected],
        key=lambda x: -x["market_cap"]
    )
    for s in asia_stocks[:15]:
        selected.add(s["ticker"])
    print(f"  [4] +Top 15 Asia stocks: {len(selected)}")

    # 5. Sample ETFs (diversified by sector/type)
    etfs = [t for t in all_tickers.values() if t["source"] == "etf" and t["ticker"] not in selected]
    # Pick top 50 by vol_3y diversity (spread across vol spectrum)
    etfs_sorted = sorted(etfs, key=lambda x: x["vol_3y"])
    step = max(1, len(etfs_sorted) // 50)
    for i in range(0, len(etfs_sorted), step):
        if len(selected) - len(pf_tickers) > target - len(pf_tickers) - 20:
            break
        selected.add(etfs_sorted[i]["ticker"])
    print(f"  [5] +ETFs: {len(selected)}")

    # 6. Sample bonds
    bonds = [t for t in all_tickers.values() if t["source"] == "bond" and t["ticker"] not in selected]
    bonds_sorted = sorted(bonds, key=lambda x: x["vol_3y"])
    step = max(1, len(bonds_sorted) // 25)
    for i in range(0, len(bonds_sorted), step):
        selected.add(bonds_sorted[i]["ticker"])
    print(f"  [6] +Bonds: {len(selected)}")

    return sorted(selected)


# ═══════════════════════════════════════════════════════════════════
# 2. PRICE FETCH WITH CACHE
# ═══════════════════════════════════════════════════════════════════

def load_cache():
    if CACHE_FILE.exists():
        mtime = os.path.getmtime(CACHE_FILE)
        if time.time() - mtime < CACHE_TTL:
            cache = json.load(open(CACHE_FILE))
            print(f"  Cache loaded: {len(cache)} tickers (age: {(time.time()-mtime)/3600:.1f}h)")
            return cache
        else:
            print(f"  Cache expired ({(time.time()-mtime)/3600:.0f}h old)")
    return {}


def save_cache(cache):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f)
    print(f"  Cache saved: {len(cache)} tickers")


def fetch_prices(ticker_list, cache):
    """Fetch prices, using cache when available."""
    if not API_KEY:
        print("  TWELVE_DATA_API not set!")
        return {}, []

    import urllib.request
    results = {}
    failed = []
    fetched = 0

    for i, tk in enumerate(ticker_list):
        # Check cache first
        if tk in cache:
            closes = cache[tk]
            if len(closes) >= 200:
                results[tk] = np.array(closes)
                continue

        # Fetch from API
        url = f"https://api.twelvedata.com/time_series?symbol={tk}&interval=1day&outputsize=252&apikey={API_KEY}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CovBench/2.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())

            if data.get("status") == "error" or "values" not in data:
                failed.append(tk)
                fetched += 1
                time.sleep(API_SLEEP)
                continue

            closes = [float(v["close"]) for v in reversed(data["values"]) if float(v["close"]) > 0]
            cache[tk] = closes  # Save to cache

            if len(closes) >= 200:
                results[tk] = np.array(closes)
            else:
                failed.append(f"{tk}({len(closes)}d)")

        except Exception:
            failed.append(tk)

        fetched += 1
        if fetched % 20 == 0:
            print(f"    ... {fetched} fetched from API, {len(results)} total ok")
            save_cache(cache)  # Periodic save
        time.sleep(API_SLEEP)

    return results, failed


# ═══════════════════════════════════════════════════════════════════
# 3. COVARIANCE ESTIMATORS (same as benchmark)
# ═══════════════════════════════════════════════════════════════════

def cov_sample(r): return np.cov(r, rowvar=False) * 252

def cov_lw(r):
    lw = LedoitWolf(); lw.fit(r); return lw.covariance_ * 252

def cov_ewma(r, hl=63):
    n = r.shape[0]; d = np.log(2)/hl; w = np.exp(-d*np.arange(n)[::-1])
    s = w.sum(); w = w/s if s > 0 and np.isfinite(s) else np.ones(n)/n
    m = np.average(r, weights=w, axis=0); c = r - m
    return np.nan_to_num((c*w[:,None]).T @ c, nan=0.0) * 252

def cov_pca(r, nf=5):
    C = np.cov(r, rowvar=False)*252; e,v = np.linalg.eigh(C)
    i = np.argsort(e)[::-1]; e,v = e[i],v[:,i]; nf = min(nf,len(e))
    S = v[:,:nf] @ np.diag(e[:nf]) @ v[:,:nf].T
    return S + np.diag(np.maximum(np.diag(C-S),0))

def cov_pca_mp(r):
    n_obs,n_a = r.shape; C = np.cov(r,rowvar=False)*252
    e,v = np.linalg.eigh(C); i = np.argsort(e)[::-1]; e,v = e[i],v[:,i]
    q = n_a/max(n_obs,1); th = (1+np.sqrt(q))**2 * np.mean(e)
    nf = max(3,min(int(np.sum(e>th)),10))
    S = v[:,:nf] @ np.diag(e[:nf]) @ v[:,:nf].T
    return S + np.diag(np.maximum(np.diag(C-S),0))

def cov_lw_pca_mp(r):
    lw = LedoitWolf(); lw.fit(r); C = lw.covariance_*252
    n_obs,n_a = r.shape; e,v = np.linalg.eigh(C)
    i = np.argsort(e)[::-1]; e,v = e[i],v[:,i]
    q = n_a/max(n_obs,1); th = (1+np.sqrt(q))**2 * np.mean(e)
    nf = max(3,min(int(np.sum(e>th)),10))
    S = v[:,:nf] @ np.diag(e[:nf]) @ v[:,:nf].T
    return S + np.diag(np.maximum(np.diag(C-S),0))

def cov_ewma_pca_mp(r):
    C = cov_ewma(r,63); n_obs,n_a = r.shape
    e,v = np.linalg.eigh(C); i = np.argsort(e)[::-1]; e,v = e[i],v[:,i]
    q = n_a/max(n_obs,1); th = (1+np.sqrt(q))**2 * np.mean(e)
    nf = max(3,min(int(np.sum(e>th)),10))
    S = v[:,:nf] @ np.diag(e[:nf]) @ v[:,:nf].T
    return S + np.diag(np.maximum(np.diag(C-S),0))


def build_structured(assets):
    n = len(assets); cov = np.zeros((n,n))
    for i in range(n):
        vi = max(assets[i].get("vol_3y",20),1)/100; ti = assets[i]["type"]; si = assets[i].get("sector","")
        for j in range(n):
            vj = max(assets[j].get("vol_3y",20),1)/100; tj = assets[j]["type"]; sj = assets[j].get("sector","")
            if i==j: cov[i,j] = vi**2; continue
            if ti=="gold" or tj=="gold":
                if ti=="gold" and tj=="gold": c=0.95
                elif "bond" in (ti,tj): c=CORR_GOLD_BOND
                else: c=CORR_EQUITY_GOLD
            elif (ti=="bond" and tj in("stock","etf")) or (tj=="bond" and ti in("stock","etf")):
                c = CORR_EQUITY_BOND if "stock" in (ti,tj) else CORR_ETF_BOND
            elif ti=="crypto" or tj=="crypto": c=CORR_CRYPTO_OTHER
            elif ti==tj:
                if ti=="stock": c = CORR_SAME_SECTOR if (si and si==sj and si!="Other") else CORR_SAME_CAT_STOCK
                elif ti=="bond": c=CORR_SAME_CAT_BOND
                elif ti=="etf": c=CORR_SAME_CAT_ETF
                else: c=CORR_DEFAULT
            else: c=CORR_DEFAULT
            cov[i,j] = c*vi*vj
    return cov

def hybridize(emp, struct, w=0.85): return w*emp + (1-w)*struct

def ensure_pd(cov):
    cov = np.nan_to_num((cov+cov.T)/2); e,v = np.linalg.eigh(cov)
    return v @ np.diag(np.maximum(e,1e-6)) @ v.T

def min_var(cov, mx=0.10):
    n = cov.shape[0]; C = ensure_pd(cov)
    r = minimize(lambda w: float(w@C@w), np.ones(n)/n, method="SLSQP",
                 bounds=[(0,mx)]*n, constraints=[{"type":"eq","fun":lambda w:np.sum(w)-1}],
                 options={"maxiter":500,"ftol":1e-10})
    if r.success: w=np.maximum(r.x,0); w/=w.sum(); return w
    return np.ones(n)/n

_COV_FNS = {}
def _recov(r,label):
    f=_COV_FNS.get(label); return f(r) if f else np.cov(r,rowvar=False)*252


# ═══════════════════════════════════════════════════════════════════
# 4. METRICS
# ═══════════════════════════════════════════════════════════════════

def metrics(cov, ret, assets, label, struct):
    C = ensure_pd(cov); m = {"label": label}
    e = np.linalg.eigvalsh(C); m["cond"] = float(e.max()/max(e.min(),1e-12))
    lw_ref = cov_lw(ret); m["frob"] = float(np.linalg.norm(C-lw_ref,"fro"))
    w = min_var(C); n = C.shape[0]
    m["top5"] = round(float(np.sort(w)[-5:].sum())*100,1) if n>=5 else 100
    m["hhi"] = round(float(np.sum(w**2)),4)
    m["npos"] = int(np.sum(w>0.01))
    m["vol"] = round(np.sqrt(float(w@C@w))*100,2)
    # Turnover
    rs = ret[:-20]; Cs = ensure_pd(_recov(rs,label)); ws = min_var(Cs)
    m["turn"] = round(float(.5*np.sum(np.abs(w-ws)))*100,1)
    # OOS
    no = ret.shape[0]; te = min(200,no-52)
    if te >= 60:
        Ct = ensure_pd(_recov(ret[:te],label)); wo = min_var(Ct)
        pv = float(wo@Ct@wo)/252; rv = float(np.var(ret[te:]@wo))
        m["vr"] = round(pv/rv,2) if rv>0 else None
    else: m["vr"] = None
    return m


def corr_breakdown(ret, assets):
    """Compute realized correlations by pair category."""
    corr = np.corrcoef(ret, rowvar=False)
    n = len(assets)
    buckets = defaultdict(list)

    for i in range(n):
        for j in range(i+1, n):
            ti, tj = assets[i]["type"], assets[j]["type"]
            ri, rj = assets[i].get("region", ""), assets[j].get("region", "")
            si, sj = assets[i].get("sector", ""), assets[j].get("sector", "")
            c = corr[i, j]

            if ti == "stock" and tj == "stock":
                if ri == rj == "US": buckets["US×US"].append(c)
                elif ri == rj == "EU": buckets["EU×EU"].append(c)
                elif ri == rj == "ASIA": buckets["Asia×Asia"].append(c)
                elif ri != rj: buckets["Cross-region"].append(c)
                if si and si == sj: buckets["Same sector"].append(c)
                else: buckets["Diff sector"].append(c)
            elif (ti == "stock" and tj == "etf") or (ti == "etf" and tj == "stock"):
                buckets["Stock×ETF"].append(c)
            elif (ti in ("stock","etf") and tj == "bond") or (tj in ("stock","etf") and ti == "bond"):
                buckets["Equity×Bond"].append(c)
            elif ti == "bond" and tj == "bond":
                buckets["Bond×Bond"].append(c)
            elif ti == "gold" or tj == "gold":
                buckets["Gold×Other"].append(c)

    return buckets


def mp_analysis(ret):
    n_obs, n_a = ret.shape
    C = np.corrcoef(ret, rowvar=False)
    e = np.sort(np.linalg.eigvalsh(C))[::-1]
    q = n_a / n_obs
    th = (1+np.sqrt(q))**2 * np.mean(e)
    nf = int(np.sum(e > th))
    total = e.sum()
    return nf, e, th, [(round(float(ei/total*100),1)) for ei in e[:15]]


def factor_loadings(ret, tickers, assets, lam_max):
    C = np.corrcoef(ret, rowvar=False)
    e, v = np.linalg.eigh(C)
    idx = np.argsort(e)[::-1]; e, v = e[idx], v[:, idx]
    nf = int(np.sum(e > lam_max))
    factors = []
    for k in range(min(nf, 8)):
        vec = v[:, k]
        top = np.argsort(np.abs(vec))[::-1][:5]
        loadings = [(tickers[i], round(float(vec[i]),3), assets[i]["type"]) for i in top]
        factors.append({"rank": k+1, "eigenvalue": round(float(e[k]),2),
                        "pct": round(float(e[k]/e.sum()*100),1),
                        "top5": loadings})
    return factors


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

def main():
    t0 = time.time()
    print("=" * 90)
    print("  FULL-UNIVERSE COVARIANCE BENCHMARK — ~170 tickers")
    print("=" * 90)

    # 1. Load all tickers
    print("\n[1/7] Loading all tickers...")
    all_tickers, pf_tickers = load_all_tickers()

    # 2. Sample
    print("\n[2/7] Smart sampling...")
    selected_list = sample_tickers(all_tickers, pf_tickers, target=170)
    print(f"  Final selection: {len(selected_list)} tickers")

    # Type breakdown
    type_counts = defaultdict(int)
    region_counts = defaultdict(int)
    for tk in selected_list:
        info = all_tickers.get(tk, {})
        type_counts[info.get("type", "?")] += 1
        region_counts[info.get("region", "?")] += 1
    print(f"  Types: {dict(type_counts)}")
    print(f"  Regions: {dict(region_counts)}")

    # 3. Fetch prices
    print("\n[3/7] Fetching prices...")
    cache = load_cache()
    prices, failed = fetch_prices(selected_list, cache)
    save_cache(cache)
    print(f"  {len(prices)}/{len(selected_list)} ok, {len(failed)} failed")
    if failed:
        print(f"  Failed: {', '.join(failed[:30])}")

    if len(prices) < 30:
        print("  Not enough data!"); return

    # Build returns matrix
    tickers = sorted(prices.keys())
    min_len = min(len(prices[tk]) for tk in tickers)
    min_len = min(min_len - 1, 251)  # -1 for diff

    returns_list = []
    valid_tickers = []
    valid_assets = []
    for tk in tickers:
        p = prices[tk]
        r = np.diff(p) / p[:-1]  # simple returns
        r = r[-min_len:]
        if len(r) == min_len:
            returns_list.append(r)
            valid_tickers.append(tk)
            info = all_tickers.get(tk, {"ticker": tk, "type": classify(tk), "sector": "Other", "region": "?"})
            info["ticker"] = tk
            valid_assets.append(info)

    ret = np.column_stack(returns_list)
    ret = np.nan_to_num(ret, nan=0.0, posinf=0.0, neginf=0.0)
    n_obs, n_assets = ret.shape
    print(f"\n  Returns: {n_obs} days × {n_assets} assets")

    # 4. MP analysis
    print("\n[4/7] Marchenko-Pastur analysis...")
    nf_full, eigs_full, th_full, eig_pct_full = mp_analysis(ret)
    print(f"  Factors (full {n_assets}): {nf_full} above threshold {th_full:.3f}")
    print(f"  Top 10 eigenvalue %: {', '.join(f'{p}%' for p in eig_pct_full[:10])}")

    # Compare with portfolio-only subset
    pf_idx = [i for i, tk in enumerate(valid_tickers) if tk in pf_tickers]
    if len(pf_idx) >= 20:
        ret_pf = ret[:, pf_idx]
        nf_pf, _, th_pf, eig_pct_pf = mp_analysis(ret_pf)
        print(f"  Factors (portfolio {len(pf_idx)}): {nf_pf} above threshold {th_pf:.3f}")
        print(f"  Top 10 eigenvalue %: {', '.join(f'{p}%' for p in eig_pct_pf[:10])}")
    else:
        nf_pf = None

    # Factor loadings
    print("\n[5/7] Factor interpretation (full universe)...")
    factors = factor_loadings(ret, valid_tickers, valid_assets, th_full)
    print(f"\n  {'F#':<4} {'Eigenval':>9} {'%Var':>6} {'Top 5 loadings'}")
    print("  " + "-" * 80)
    for f in factors:
        ls = ", ".join(f"{tk}:{w:+.2f}({t[0]})" for tk, w, t in f["top5"])
        print(f"  F{f['rank']:<3} {f['eigenvalue']:>9.2f} {f['pct']:>5.1f}%  {ls}")

    # 5. Correlation breakdown
    print("\n[6/7] Realized correlation breakdown...")
    buckets = corr_breakdown(ret, valid_assets)

    hardcoded = {
        "US×US": CORR_SAME_CAT_STOCK, "EU×EU": CORR_SAME_CAT_STOCK,
        "Asia×Asia": CORR_SAME_CAT_STOCK, "Cross-region": CORR_DEFAULT,
        "Same sector": CORR_SAME_SECTOR, "Diff sector": CORR_SAME_CAT_STOCK,
        "Stock×ETF": CORR_SAME_CAT_ETF, "Equity×Bond": CORR_EQUITY_BOND,
        "Bond×Bond": CORR_SAME_CAT_BOND, "Gold×Other": CORR_EQUITY_GOLD,
    }

    corr_comparison = {}
    print(f"\n  {'Pair type':<20} {'N':>6} {'Realized':>10} {'Std':>8} {'Hardcoded':>10} {'Gap':>8} {'Status'}")
    print("  " + "-" * 80)
    for bucket in ["US×US","EU×EU","Asia×Asia","Cross-region","Same sector",
                    "Diff sector","Stock×ETF","Equity×Bond","Bond×Bond","Gold×Other"]:
        vals = buckets.get(bucket, [])
        hc = hardcoded.get(bucket)
        if not vals:
            print(f"  {bucket:<20} {0:>6}        —        —   {hc or '?':>10}        —")
            continue
        avg = float(np.mean(vals)); std = float(np.std(vals))
        gap = avg - hc if hc is not None else None
        status = ""
        if gap is not None:
            if abs(gap) > 0.15: status = "WRONG"
            elif abs(gap) > 0.08: status = "CHECK"
            else: status = "OK"
        gstr = f"{gap:+.3f}" if gap is not None else "  N/A"
        hstr = f"{hc:+.2f}" if hc is not None else "  N/A"
        print(f"  {bucket:<20} {len(vals):>6} {avg:>+10.3f} {std:>8.3f} {hstr:>10} {gstr:>8}  {status}")
        corr_comparison[bucket] = {"n": len(vals), "realized": round(avg, 3),
                                    "std": round(std, 3), "hardcoded": hc,
                                    "gap": round(gap, 3) if gap is not None else None}

    # 6. Benchmark
    print("\n[7/7] Benchmark: 8 configs × 2 modes...")
    struct = build_structured(valid_assets)

    configs = [
        ("A: Sample", cov_sample), ("B: Ledoit-Wolf", cov_lw),
        ("C: EWMA 63j", lambda r: cov_ewma(r,63)), ("D: EWMA 42j", lambda r: cov_ewma(r,42)),
        ("E: PCA 5f", lambda r: cov_pca(r,5)), ("F: PCA MP", cov_pca_mp),
        ("G: LW+PCA", cov_lw_pca_mp), ("H: EWMA+PCA", cov_ewma_pca_mp),
    ]
    for name, fn in configs:
        _COV_FNS[f"{name} (pure)"] = fn
        _COV_FNS[f"{name} (hybrid)"] = lambda r, f=fn: hybridize(f(r), build_structured(valid_assets))

    results = []
    for name, fn in configs:
        for mode, cov_fn in [("pure", fn), ("hybrid", lambda r, f=fn: hybridize(f(r), struct))]:
            label = f"{name} ({mode})"
            C = cov_fn(ret)
            m = metrics(C, ret, valid_assets, label, struct)
            results.append(m)
            print(f"  {label:<28} cond={m['cond']:>10.0f} vol={m['vol']:>5.2f}% hhi={m['hhi']:.4f} turn={m['turn']}% vr={m['vr'] or 'N/A'}")

    # Ranking
    print("\n" + "=" * 90)
    scores = defaultdict(float)
    for metric in ["cond","frob","hhi","turn"]:
        vals = sorted([(m["label"],m[metric]) for m in results], key=lambda x:x[1])
        for rank,(l,_) in enumerate(vals): scores[l] += rank
    vr = sorted([(m["label"],abs(m["vr"]-1)) for m in results if m["vr"]], key=lambda x:x[1])
    for rank,(l,_) in enumerate(vr): scores[l] += rank
    np_vals = sorted([(m["label"],m["npos"]) for m in results], key=lambda x:-x[1])
    for rank,(l,_) in enumerate(np_vals): scores[l] += rank

    ranked = sorted(scores.items(), key=lambda x:x[1])
    print("\nOverall ranking:")
    for i,(l,s) in enumerate(ranked[:8]):
        mark = " <-- BEST" if i==0 else ""
        print(f"  {i+1}. {l:<28} score={s:.0f}{mark}")

    # Comparison: 53 vs full
    print("\n" + "=" * 90)
    print("  53 TICKERS vs FULL UNIVERSE — Correlation stability")
    print("=" * 90)
    if len(pf_idx) >= 20:
        buckets_pf = corr_breakdown(ret_pf, [valid_assets[i] for i in pf_idx])
        print(f"\n  {'Pair type':<20} {'Portfolio':>10} {'Full':>10} {'Delta':>8}")
        print("  " + "-" * 55)
        for bucket in ["Equity×Bond","Bond×Bond","Same sector","Diff sector","Stock×ETF","Gold×Other"]:
            pf_vals = buckets_pf.get(bucket,[])
            full_vals = buckets.get(bucket,[])
            if pf_vals and full_vals:
                pavg = np.mean(pf_vals); favg = np.mean(full_vals)
                print(f"  {bucket:<20} {pavg:>+10.3f} {favg:>+10.3f} {favg-pavg:>+8.3f}")
            elif full_vals:
                print(f"  {bucket:<20}        N/A {np.mean(full_vals):>+10.3f}        —")

    # Save
    output = {
        "_meta": {"generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
                  "n_assets": n_assets, "n_obs": n_obs,
                  "n_portfolio": len(pf_idx), "n_failed": len(failed)},
        "mp_factors_full": nf_full, "mp_factors_portfolio": nf_pf,
        "factors": factors,
        "correlation_breakdown": corr_comparison,
        "results": results,
        "ranking": [{"rank":i+1,"label":l,"score":round(s,1)} for i,(l,s) in enumerate(ranked)],
    }
    out = DATA / "covariance_benchmark_full.json"
    with open(out, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n  Saved: {out}")
    print(f"  Done in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
