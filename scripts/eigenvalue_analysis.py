#!/usr/bin/env python3
"""
eigenvalue_analysis.py — Marchenko-Pastur analysis on real portfolio data.

Identifies signal vs noise eigenvalues, interprets factors,
and compares clean vs sample vs structured correlations.

Usage: TWELVE_DATA_API=xxx python3 scripts/eigenvalue_analysis.py
"""

import json
import os
import re
import time
import warnings
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple

import numpy as np

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

API_KEY = os.environ.get("TWELVE_DATA_API", "")
API_SLEEP = 0.3
TICKER_RE = re.compile(r'^[A-Z]{1,5}(\.[A-Z]{1,2})?$')

BOND_TICKERS = {
    "BND", "AGG", "TLT", "IEF", "SHY", "VCIT", "VCSH", "BIV", "BSV",
    "LQD", "HYG", "GVI", "GOVT", "TIPS", "VGSH", "SCHO", "SPTS",
    "SGOV", "CLTL", "STIP", "PAAA", "SPIB", "IGIB", "VTEB", "GBIL",
}
GOLD_TICKERS = {"GLD", "IAU", "SGOL", "GLDM", "AAAU", "SLV", "SLVP"}

# Structured correlation constants (from optimizer.py)
CORR_SAME_SECTOR = 0.45
CORR_SAME_CATEGORY = 0.60
CORR_EQUITY_BOND = -0.20
CORR_CRYPTO_OTHER = 0.25
CORR_DEFAULT = 0.15


def classify_asset(ticker, info=None):
    if ticker in BOND_TICKERS:
        return "bond"
    if ticker in GOLD_TICKERS:
        return "gold"
    info = info or {}
    cat = (info.get("category") or "").lower()
    if cat in ("obligations", "bond", "bonds"):
        return "bond"
    if cat == "crypto":
        return "crypto"
    if cat == "etf":
        return "etf"
    return "stock"


def get_structured_corr(a1, a2):
    """What our optimizer.py structured cov would predict."""
    t1, t2 = a1["type"], a2["type"]
    s1, s2 = a1.get("sector", ""), a2.get("sector", "")
    is_bond_1 = t1 == "bond"
    is_bond_2 = t2 == "bond"
    is_eq_1 = t1 in ("stock", "etf")
    is_eq_2 = t2 in ("stock", "etf")

    if is_eq_1 and is_eq_2:
        return CORR_SAME_SECTOR if s1 == s2 and s1 else CORR_SAME_CATEGORY
    if (is_eq_1 and is_bond_2) or (is_bond_1 and is_eq_2):
        return CORR_EQUITY_BOND
    if is_bond_1 and is_bond_2:
        return CORR_SAME_CATEGORY
    if t1 == "crypto" or t2 == "crypto":
        return CORR_CRYPTO_OTHER
    return CORR_DEFAULT


# ═══════════════════════════════════════════════════════════════════
# 1. LOAD DATA
# ═══════════════════════════════════════════════════════════════════

def load_portfolio_tickers():
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
                if tk not in tickers and TICKER_RE.match(tk):
                    tickers[tk] = {
                        "ticker": tk,
                        "name": info.get("name", tk),
                        "category": info.get("category", ""),
                        "type": classify_asset(tk, info),
                        "sector": info.get("sector", info.get("industry", "")),
                    }
            for tk in p.get("_tickers", []):
                if tk not in tickers and TICKER_RE.match(tk):
                    tickers[tk] = {
                        "ticker": tk, "name": tk, "category": "",
                        "type": classify_asset(tk), "sector": "",
                    }
    return tickers


def fetch_returns(tickers):
    """Fetch 252-day daily returns via Twelve Data API."""
    if not API_KEY:
        print("  TWELVE_DATA_API not set!")
        return {}, {}

    import urllib.request

    results = {}
    failed = []

    for i, tk in enumerate(tickers):
        url = (
            f"https://api.twelvedata.com/time_series?"
            f"symbol={tk}&interval=1day&outputsize=252&apikey={API_KEY}"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "EigenAnalysis/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())

            if data.get("status") == "error" or "values" not in data:
                failed.append(tk)
                continue

            closes = []
            for v in reversed(data["values"]):
                c = float(v["close"])
                if c > 0:
                    closes.append(c)

            if len(closes) >= 200:
                prices = np.array(closes)
                # Log returns
                log_ret = np.diff(np.log(prices))
                results[tk] = log_ret
            else:
                failed.append(f"{tk}({len(closes)}d)")

        except Exception as e:
            failed.append(tk)

        if (i + 1) % 10 == 0:
            print(f"    ... {i+1}/{len(tickers)} ({len(results)} ok)")
        time.sleep(API_SLEEP)

    if failed:
        print(f"  Failed: {', '.join(failed[:20])}")
    return results


# ═══════════════════════════════════════════════════════════════════
# 2-3. MARCHENKO-PASTUR ANALYSIS + PLOT
# ═══════════════════════════════════════════════════════════════════

def marchenko_pastur_density(lam, q, sigma2=1.0):
    """MP density for given eigenvalue lambda."""
    lam_min = sigma2 * (1 - np.sqrt(q)) ** 2
    lam_max = sigma2 * (1 + np.sqrt(q)) ** 2
    if lam < lam_min or lam > lam_max:
        return 0.0
    return (1.0 / (2 * np.pi * q * sigma2)) * \
           np.sqrt((lam_max - lam) * (lam - lam_min)) / lam


def mp_analysis(corr_matrix, n_assets, n_obs):
    """Full MP analysis: eigenvalues, threshold, density."""
    eigenvalues = np.linalg.eigvalsh(corr_matrix)
    eigenvalues = np.sort(eigenvalues)[::-1]

    q = n_assets / n_obs
    sigma2 = 1.0  # correlation matrix
    lam_min = sigma2 * (1 - np.sqrt(q)) ** 2
    lam_max = sigma2 * (1 + np.sqrt(q)) ** 2

    n_signal = int(np.sum(eigenvalues > lam_max))

    # MP density curve
    x = np.linspace(max(lam_min * 0.8, 0.01), lam_max * 1.2, 500)
    y = np.array([marchenko_pastur_density(xi, q, sigma2) for xi in x])

    return eigenvalues, lam_min, lam_max, n_signal, x, y


def plot_mp(eigenvalues, lam_max, n_signal, x_mp, y_mp, n_assets, n_obs, out_path):
    """Plot eigenvalue histogram vs MP density."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  matplotlib not available — skipping plot")
        return False

    fig, ax = plt.subplots(figsize=(12, 6))

    # Histogram of eigenvalues
    noise_eigs = eigenvalues[eigenvalues <= lam_max]
    signal_eigs = eigenvalues[eigenvalues > lam_max]

    bins = np.linspace(0, max(eigenvalues.max() * 0.3, lam_max * 1.5), 40)
    ax.hist(noise_eigs, bins=bins, density=True, alpha=0.6,
            color="#4A90D9", label=f"Noise eigenvalues ({len(noise_eigs)})", edgecolor="white")
    if len(signal_eigs) > 0:
        # Plot signal eigenvalues as vertical bars
        for k, eig in enumerate(signal_eigs):
            ax.axvline(eig, color="#E74C3C", linewidth=2, alpha=0.8,
                       label=f"Factor {k+1}: {eig:.2f}" if k < 6 else None)
            ax.annotate(f"F{k+1}\n{eig:.1f}",
                        xy=(eig, 0), xytext=(eig, ax.get_ylim()[1] * 0.85 - k * 0.12),
                        fontsize=8, ha="center", color="#E74C3C", fontweight="bold")

    # MP density curve
    ax.plot(x_mp, y_mp, "k-", linewidth=2.5, label="Marchenko-Pastur (theoretical)")

    # Threshold line
    ax.axvline(lam_max, color="#E74C3C", linestyle="--", linewidth=1.5,
               label=f"MP threshold: {lam_max:.2f}")

    ax.set_xlabel("Eigenvalue", fontsize=12)
    ax.set_ylabel("Density", fontsize=12)
    ax.set_title(
        f"Marchenko-Pastur: Signal vs Bruit — {n_assets} actifs, {n_obs} jours\n"
        f"{n_signal} facteurs significatifs au-dessus du seuil",
        fontsize=13, fontweight="bold"
    )
    ax.legend(loc="upper right", fontsize=9)
    ax.set_xlim(0, max(lam_max * 2, eigenvalues[min(5, len(eigenvalues)-1)] * 1.3))
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"  Plot saved: {out_path}")
    return True


# ═══════════════════════════════════════════════════════════════════
# 4. FACTOR INTERPRETATION
# ═══════════════════════════════════════════════════════════════════

def interpret_factors(corr_matrix, eigenvalues_desc, lam_max, tickers, assets):
    """Extract and interpret eigenvectors for signal eigenvalues."""
    # Full eigen decomposition
    eigvals, eigvecs = np.linalg.eigh(corr_matrix)
    # Sort descending
    idx = np.argsort(eigvals)[::-1]
    eigvals = eigvals[idx]
    eigvecs = eigvecs[:, idx]

    n_signal = int(np.sum(eigvals > lam_max))
    total_var = eigvals.sum()

    factors = []
    for k in range(n_signal):
        vec = eigvecs[:, k]
        eig = eigvals[k]
        pct_var = eig / total_var * 100

        # Top 5 loadings (by absolute value)
        abs_loadings = np.abs(vec)
        top_idx = np.argsort(abs_loadings)[::-1][:5]
        top_loadings = [(tickers[i], float(vec[i]), assets[i]["type"]) for i in top_idx]

        # Interpretation heuristic
        signs = np.sign(vec)
        all_positive = np.sum(signs > 0) > len(signs) * 0.8
        all_negative = np.sum(signs < 0) > len(signs) * 0.8

        if k == 0 and (all_positive or all_negative):
            interp = "Market factor (systematic risk)"
        else:
            # Check if factor separates asset types
            type_loadings = defaultdict(list)
            for i, v in enumerate(vec):
                type_loadings[assets[i]["type"]].append(v)

            avg_by_type = {}
            for t, vals in type_loadings.items():
                if vals:
                    avg_by_type[t] = np.mean(vals)

            # Check bond vs equity separation
            bond_avg = avg_by_type.get("bond", 0)
            stock_avg = avg_by_type.get("stock", 0)
            etf_avg = avg_by_type.get("etf", 0)
            gold_avg = avg_by_type.get("gold", 0)
            eq_avg = (stock_avg + etf_avg) / 2 if (stock_avg or etf_avg) else 0

            if abs(bond_avg - eq_avg) > 0.10:
                direction = "bonds+" if bond_avg > eq_avg else "equity+"
                interp = f"Risk-on/Risk-off ({direction} vs {'equity' if direction == 'bonds+' else 'bonds'})"
            elif abs(gold_avg - eq_avg) > 0.08:
                interp = "Real assets vs equity"
            else:
                # Check sector separation
                sector_loadings = defaultdict(list)
                for i, v in enumerate(vec):
                    s = assets[i].get("sector", "Other")
                    if s:
                        sector_loadings[s].append(v)
                sector_avgs = {s: np.mean(vals) for s, vals in sector_loadings.items() if len(vals) >= 2}
                if sector_avgs:
                    max_s = max(sector_avgs, key=lambda s: sector_avgs[s])
                    min_s = min(sector_avgs, key=lambda s: sector_avgs[s])
                    if sector_avgs[max_s] - sector_avgs[min_s] > 0.08:
                        interp = f"Sector rotation ({max_s[:15]}+ vs {min_s[:15]}-)"
                    else:
                        interp = "Mixed/idiosyncratic factor"
                else:
                    interp = "Mixed/idiosyncratic factor"

        factors.append({
            "rank": k + 1,
            "eigenvalue": round(float(eig), 3),
            "pct_variance": round(pct_var, 1),
            "cumulative_pct": round(float(np.sum(eigvals[:k+1]) / total_var * 100), 1),
            "top_loadings": [(tk, round(w, 3), t) for tk, w, t in top_loadings],
            "interpretation": interp,
        })

    return factors, eigvals, eigvecs


# ═══════════════════════════════════════════════════════════════════
# 5. CLEAN vs SAMPLE vs STRUCTURED CORRELATIONS
# ═══════════════════════════════════════════════════════════════════

def build_clean_corr(eigvals, eigvecs, n_signal, n_assets):
    """Reconstruct correlation matrix using only signal factors."""
    # Signal part
    V_sig = eigvecs[:, :n_signal]
    L_sig = np.diag(eigvals[:n_signal])
    corr_signal = V_sig @ L_sig @ V_sig.T

    # Residual: diagonal of (I - signal)
    residual = np.diag(np.maximum(1.0 - np.diag(corr_signal), 0.01))
    corr_clean = corr_signal + residual

    # Normalize to correlation matrix
    d = np.sqrt(np.diag(corr_clean))
    d[d == 0] = 1.0
    corr_clean = corr_clean / np.outer(d, d)
    np.fill_diagonal(corr_clean, 1.0)
    return np.clip(corr_clean, -1, 1)


def compare_correlations(corr_sample, corr_clean, tickers, assets, ticker_idx):
    """Compare sample, clean, and structured correlations for interesting pairs."""
    # Define interesting pairs based on what's available
    pair_candidates = [
        # (ticker1, ticker2, description)
        ("NVDA", "MU", "Tech × Tech (semis)"),
        ("NVDA", "WDC", "Tech × Tech (storage)"),
        ("NVDA", "JNJ", "Tech × Healthcare"),
        ("NVDA", "XLE", "Tech × Energy ETF"),
        ("HWM", "GD", "Industrial × Defense"),
        ("GLD", "NVDA", "Gold × Tech"),
        ("GLD", "SGOV", "Gold × Treasury"),
        ("GLD", "BSV", "Gold × Short Bond"),
        ("VCIT", "NVDA", "Corp Bond × Tech"),
        ("VCIT", "BSV", "Corp Bond × Short Bond"),
        ("SGOV", "NVDA", "Treasury × Tech"),
        ("SCHO", "NVDA", "Short Treasury × Tech"),
        ("SCHO", "VGSH", "Short Treasury × Short Treasury"),
        ("SOXX", "XBI", "Semis ETF × Biotech ETF"),
        ("VXUS", "VEA", "Intl ETF × Dev Mkts ETF"),
        ("HDV", "SCHD", "Dividend ETFs"),
        ("IUSV", "SPYV", "Value ETFs"),
        ("FLKR", "VPL", "Korea ETF × Pacific ETF"),
        ("XOM", "HAL", "Oil × Oilfield"),
        ("VRT", "MPWR", "Power infra × Power semis"),
    ]

    results = []
    for tk1, tk2, desc in pair_candidates:
        if tk1 in ticker_idx and tk2 in ticker_idx:
            i, j = ticker_idx[tk1], ticker_idx[tk2]
            a1, a2 = assets[i], assets[j]
            c_sample = float(corr_sample[i, j])
            c_clean = float(corr_clean[i, j])
            c_struct = get_structured_corr(a1, a2)

            results.append({
                "pair": f"{tk1}×{tk2}",
                "desc": desc,
                "type1": a1["type"], "type2": a2["type"],
                "corr_sample": round(c_sample, 3),
                "corr_clean": round(c_clean, 3),
                "corr_structured": round(c_struct, 3),
                "gap_struct_vs_sample": round(c_struct - c_sample, 3),
                "gap_clean_vs_sample": round(c_clean - c_sample, 3),
            })

    return results


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

def main():
    t0 = time.time()
    print("=" * 80)
    print("  EIGENVALUE ANALYSIS — Marchenko-Pastur Signal Detection")
    print("=" * 80)

    # 1. Load tickers
    print("\n[1/6] Loading portfolio tickers...")
    pf_tickers = load_portfolio_tickers()
    ticker_list = sorted(pf_tickers.keys())
    print(f"  {len(ticker_list)} tickers: {', '.join(ticker_list[:20])}...")

    # 2. Fetch returns
    print("\n[2/6] Fetching 252-day prices from Twelve Data...")
    returns_dict = fetch_returns(ticker_list)
    print(f"  Got {len(returns_dict)} tickers with 200+ days")

    if len(returns_dict) < 10:
        print("  Not enough data for meaningful analysis!")
        return

    # Align returns
    min_len = min(len(r) for r in returns_dict.values())
    min_len = min(min_len, 251)
    tickers = sorted(returns_dict.keys())
    returns = np.column_stack([returns_dict[tk][-min_len:] for tk in tickers])
    returns = np.nan_to_num(returns, nan=0.0, posinf=0.0, neginf=0.0)

    assets = [pf_tickers.get(tk, {"ticker": tk, "type": classify_asset(tk), "sector": ""})
              for tk in tickers]
    for i, tk in enumerate(tickers):
        assets[i]["ticker"] = tk
    ticker_idx = {tk: i for i, tk in enumerate(tickers)}

    n_obs, n_assets = returns.shape
    print(f"  Returns matrix: {n_obs} days x {n_assets} assets")

    # Type breakdown
    types = defaultdict(int)
    for a in assets:
        types[a["type"]] += 1
    print(f"  Types: {dict(types)}")

    # 3. Correlation matrix + MP analysis
    print("\n[3/6] Marchenko-Pastur eigenvalue analysis...")
    corr_matrix = np.corrcoef(returns, rowvar=False)
    eigenvalues, lam_min, lam_max, n_signal, x_mp, y_mp = mp_analysis(
        corr_matrix, n_assets, n_obs
    )

    q = n_assets / n_obs
    print(f"  q = N/T = {n_assets}/{n_obs} = {q:.3f}")
    print(f"  MP bounds: [{lam_min:.3f}, {lam_max:.3f}]")
    print(f"  Signal eigenvalues (above {lam_max:.3f}): {n_signal}")
    print(f"  Noise eigenvalues: {n_assets - n_signal}")

    total_var = eigenvalues.sum()
    signal_var = eigenvalues[:n_signal].sum() / total_var * 100
    print(f"  Signal explains {signal_var:.1f}% of total variance")
    print(f"  Top 10 eigenvalues: {', '.join(f'{e:.2f}' for e in eigenvalues[:10])}")

    # Plot
    print("\n[4/6] Generating Marchenko-Pastur plot...")
    plot_path = DATA / "marchenko_pastur.png"
    plot_mp(eigenvalues, lam_max, n_signal, x_mp, y_mp, n_assets, n_obs, plot_path)

    # 4. Factor interpretation
    print("\n[5/6] Factor interpretation...")
    factors, eigvals_full, eigvecs_full = interpret_factors(
        corr_matrix, eigenvalues, lam_max, tickers, assets
    )

    print(f"\n  {'Factor':<8} {'Eigenval':>9} {'%Var':>6} {'Cumul':>7} {'Top 5 loadings':<50} {'Interpretation'}")
    print("  " + "-" * 130)
    for f in factors:
        loadings_str = ", ".join(f"{tk}:{w:+.2f}({t[0]})" for tk, w, t in f["top_loadings"])
        print(f"  F{f['rank']:<6} {f['eigenvalue']:>9.3f} {f['pct_variance']:>5.1f}% {f['cumulative_pct']:>6.1f}%  {loadings_str:<50} {f['interpretation']}")

    # 5. Clean vs sample vs structured correlations
    print("\n[6/6] Correlation comparison: Sample vs Clean (PCA) vs Structured (CORR_*)...")
    corr_clean = build_clean_corr(eigvals_full, eigvecs_full, n_signal, n_assets)
    pair_results = compare_correlations(corr_sample=corr_matrix, corr_clean=corr_clean,
                                        tickers=tickers, assets=assets, ticker_idx=ticker_idx)

    print(f"\n  {'Pair':<14} {'Type':>10} {'Sample':>8} {'Clean':>8} {'Struct':>8} {'Gap S-R':>8} {'Verdict'}")
    print("  " + "-" * 80)
    for p in pair_results:
        gap = p["gap_struct_vs_sample"]
        verdict = "OK" if abs(gap) < 0.15 else ("WRONG" if abs(gap) > 0.30 else "CHECK")
        icon = {"OK": "  ", "CHECK": "? ", "WRONG": "!!"}[verdict]
        type_str = f"{p['type1'][0]}×{p['type2'][0]}"
        print(
            f"  {p['pair']:<14} {type_str:>10} {p['corr_sample']:>+8.3f} {p['corr_clean']:>+8.3f} "
            f"{p['corr_structured']:>+8.3f} {gap:>+8.3f} {icon}{verdict}"
        )

    # Summary: biggest structured errors
    print("\n  Biggest structured correlation errors (|gap| > 0.20):")
    sorted_pairs = sorted(pair_results, key=lambda p: -abs(p["gap_struct_vs_sample"]))
    for p in sorted_pairs:
        if abs(p["gap_struct_vs_sample"]) > 0.20:
            print(f"    {p['pair']:<14} structured={p['corr_structured']:+.2f} "
                  f"realized={p['corr_sample']:+.2f} gap={p['gap_struct_vs_sample']:+.3f}  ({p['desc']})")

    # Category-level summary
    print("\n  Category-level correlation summary (realized):")
    cat_pairs = defaultdict(list)
    for i in range(n_assets):
        for j in range(i + 1, n_assets):
            ti, tj = assets[i]["type"], assets[j]["type"]
            key = tuple(sorted([ti, tj]))
            cat_pairs[key].append(float(corr_matrix[i, j]))

    for key in sorted(cat_pairs.keys()):
        vals = cat_pairs[key]
        avg = np.mean(vals)
        print(f"    {key[0]:>6}×{key[1]:<6}  N={len(vals):>4}  avg={avg:+.3f}  "
              f"std={np.std(vals):.3f}  range=[{min(vals):+.3f}, {max(vals):+.3f}]")

    # Save JSON
    output = {
        "_meta": {
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "n_assets": n_assets, "n_obs": n_obs,
            "tickers": tickers,
            "q_ratio": round(q, 4),
        },
        "marchenko_pastur": {
            "lam_min": round(float(lam_min), 4),
            "lam_max": round(float(lam_max), 4),
            "n_signal": n_signal,
            "n_noise": n_assets - n_signal,
            "signal_variance_pct": round(signal_var, 1),
            "top_15_eigenvalues": [round(float(e), 3) for e in eigenvalues[:15]],
        },
        "factors": factors,
        "correlation_pairs": pair_results,
        "category_correlations": {
            f"{k[0]}_{k[1]}": {
                "n": len(v), "mean": round(float(np.mean(v)), 3),
                "std": round(float(np.std(v)), 3),
            }
            for k, v in cat_pairs.items()
        },
    }

    out_path = DATA / "eigenvalue_analysis.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n  Saved: {out_path}")

    elapsed = time.time() - t0
    print(f"\n  Done in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
