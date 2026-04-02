#!/usr/bin/env python3
"""
correlation_analyzer.py — Analyse de corrélation pour un panier arbitraire.

Calcule la matrice de corrélation, les corrélations conditionnelles (par régime VIX),
et le tableau de sensibilité Dispersion pour n'importe quel groupe de tickers.

Usage:
  # Panier tech Dispersion
  TWELVE_DATA_API=xxx python3 scripts/correlation_analyzer.py NVDA META NFLX AMZN GOOGL MSFT AAPL TSLA

  # Panier custom
  TWELVE_DATA_API=xxx python3 scripts/correlation_analyzer.py XOM CVX SHEL TTE BP

  # Avec options
  TWELVE_DATA_API=xxx python3 scripts/correlation_analyzer.py --days 756 --output data/corr_dispersion.json NVDA META NFLX AMZN GOOGL MSFT AAPL TSLA
"""

import json, os, sys, time, argparse
import numpy as np
from pathlib import Path
from datetime import datetime

API_KEY = os.environ.get("TWELVE_DATA_API", "")
CACHE_FILE = Path("data/price_cache.json")


def load_cache():
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(cache):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f)


def fetch_prices(ticker, cache, days=756):
    """Fetch daily close prices. Cache-aware."""
    if ticker in cache and isinstance(cache[ticker], dict):
        prices = cache[ticker].get("prices", [])
        if len(prices) >= days:
            return np.array(prices[-days:], dtype=float)

    if not API_KEY:
        return None

    import urllib.request
    url = f"https://api.twelvedata.com/time_series?symbol={ticker}&interval=1day&outputsize={days}&apikey={API_KEY}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CorrAnalyzer/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        if "values" in data:
            closes = [float(v["close"]) for v in reversed(data["values"]) if float(v["close"]) > 0]
            cache[ticker] = {"prices": closes, "_updated": datetime.utcnow().isoformat()}
            return np.array(closes[-days:], dtype=float)
    except Exception as e:
        print(f"  !! {ticker}: {e}")
    return None


def compute_correlations(returns_dict, tickers, window=None):
    """Compute correlation matrix from returns dict."""
    valid = [tk for tk in tickers if tk in returns_dict]
    if len(valid) < 2:
        return None, valid

    min_len = min(len(returns_dict[tk]) for tk in valid)
    if window:
        min_len = min(min_len, window)

    ret = np.column_stack([returns_dict[tk][-min_len:] for tk in valid])
    corr = np.corrcoef(ret, rowvar=False)
    return corr, valid


def conditional_correlation(returns_dict, vix_returns, tickers, threshold_high=25, threshold_low=20):
    """Compute correlations conditionally on VIX level."""
    valid = [tk for tk in tickers if tk in returns_dict]
    if len(valid) < 2 or vix_returns is None:
        return {}

    min_len = min(len(returns_dict[tk]) for tk in valid)
    min_len = min(min_len, len(vix_returns))

    ret = np.column_stack([returns_dict[tk][-min_len:] for tk in valid])
    vix = vix_returns[-min_len:]

    results = {}
    regimes = {
        f"Normal (VIX<{threshold_low})": vix < threshold_low,
        f"Modéré (VIX {threshold_low}-{threshold_high})": (vix >= threshold_low) & (vix <= threshold_high),
        f"Stress (VIX>{threshold_high})": vix > threshold_high,
        "Crisis (VIX>30)": vix > 30,
        "Extreme (VIX>35)": vix > 35,
    }

    for label, mask in regimes.items():
        n_days = mask.sum()
        if n_days < 15:
            results[label] = {"n_days": int(n_days), "avg_corr": None, "status": "insufficient"}
            continue

        ret_filtered = ret[mask]
        corr = np.corrcoef(ret_filtered, rowvar=False)
        n = len(valid)
        pairs = [corr[i, j] for i in range(n) for j in range(i + 1, n)]
        results[label] = {
            "n_days": int(n_days),
            "avg_corr": round(float(np.mean(pairs)), 3),
            "median_corr": round(float(np.median(pairs)), 3),
            "min_corr": round(float(np.min(pairs)), 3),
            "max_corr": round(float(np.max(pairs)), 3),
        }

    return results


def main():
    parser = argparse.ArgumentParser(description="Correlation Analyzer")
    parser.add_argument("tickers", nargs="+", help="Tickers to analyze")
    parser.add_argument("--days", type=int, default=756, help="Days of history (default 756 = 3Y)")
    parser.add_argument("--output", default=None, help="Output JSON path")
    args = parser.parse_args()

    tickers = [tk.upper() for tk in args.tickers]
    print("=" * 80)
    print(f"  CORRELATION ANALYZER — {len(tickers)} tickers, {args.days} jours")
    print("=" * 80)

    cache = load_cache()

    # Fetch all tickers + VIX
    returns_db = {}
    all_tickers = tickers + ["VIX"]

    for tk in all_tickers:
        prices = fetch_prices(tk, cache, args.days)
        if prices is not None and len(prices) >= 60:
            returns_db[tk] = np.diff(np.log(prices))
            print(f"  {tk:>6}: {len(returns_db[tk])} returns ✅")
        else:
            print(f"  {tk:>6}: no data ❌")
        time.sleep(0.25)

    save_cache(cache)

    vix_prices = fetch_prices("VIX", cache, args.days)
    vix_levels = vix_prices[1:] if vix_prices is not None else None  # Align with returns

    # ── 1. Full correlation matrix ──
    print(f"\n{'─' * 80}")
    print(f"  MATRICE DE CORRÉLATION")

    for window_name, window in [("1Y (252j)", 252), ("3Y (756j)", 756)]:
        corr, valid = compute_correlations(returns_db, tickers, window)
        if corr is None:
            print(f"\n  {window_name}: données insuffisantes")
            continue

        n = len(valid)
        pairs = [corr[i, j] for i in range(n) for j in range(i + 1, n)]

        print(f"\n  {window_name} — {n} tickers")
        print(f"  {'':>7}", "  ".join(f"{tk:>6}" for tk in valid))
        for i, tk in enumerate(valid):
            row = "  ".join(f"{corr[i, j]:>6.3f}" for j in range(n))
            print(f"  {tk:>7} {row}")

        print(f"\n  Moyenne: {np.mean(pairs):.3f} | Médiane: {np.median(pairs):.3f} | "
              f"[{np.min(pairs):.3f}, {np.max(pairs):.3f}]")

    # ── 2. Top/bottom pairs ──
    corr_1y, valid_1y = compute_correlations(returns_db, tickers, 252)
    if corr_1y is not None:
        n = len(valid_1y)
        pairs_detail = [(valid_1y[i], valid_1y[j], corr_1y[i, j])
                        for i in range(n) for j in range(i + 1, n)]
        pairs_detail.sort(key=lambda x: -x[2])

        print(f"\n{'─' * 80}")
        print(f"  PAIRES EXTRÊMES (1Y)")
        print(f"  Plus corrélées:")
        for t1, t2, c in pairs_detail[:5]:
            print(f"    {t1:>5} × {t2:<5}: {c:+.3f}")
        print(f"  Moins corrélées:")
        for t1, t2, c in pairs_detail[-5:]:
            print(f"    {t1:>5} × {t2:<5}: {c:+.3f}")

    # ── 3. Conditional correlation ──
    if vix_levels is not None and len(vix_levels) >= 60:
        print(f"\n{'─' * 80}")
        print(f"  CORRÉLATION CONDITIONNELLE (par régime VIX)")

        cond = conditional_correlation(returns_db, vix_levels, tickers)
        print(f"\n  {'Régime':<25} {'Jours':>6} {'Corr moy':>9} {'Médiane':>8} {'Range':>16}")
        print(f"  {'─' * 70}")
        for label, info in cond.items():
            if info.get("avg_corr") is not None:
                print(f"  {label:<25} {info['n_days']:>6} {info['avg_corr']:>+9.3f} "
                      f"{info['median_corr']:>+8.3f} [{info['min_corr']:+.3f}, {info['max_corr']:+.3f}]")
            else:
                print(f"  {label:<25} {info['n_days']:>6} {'—':>9} (insuffisant)")

    # ── 4. Dispersion sensitivity ──
    print(f"\n{'─' * 80}")
    print(f"  TABLEAU SENSIBILITÉ DISPERSION")

    avg_1y = np.mean([corr_1y[i, j] for i in range(len(valid_1y)) for j in range(i + 1, len(valid_1y))]) if corr_1y is not None else 0.3

    print(f"\n  {'Scénario':<25} {'Corr moy':>9} {'Dispersion':>12} {'Rdt net ~':>10}")
    print(f"  {'─' * 60}")
    scenarios = [
        ("Actuel (1Y)", round(avg_1y, 2)),
        ("Normal historique", 0.30),
        ("Stress modéré", 0.50),
        ("Stress élevé", 0.70),
        ("Crash", 0.90),
    ]
    for name, corr_val in scenarios:
        disp = "élevée" if corr_val < 0.35 else "moyenne" if corr_val < 0.55 else "moy-faible" if corr_val < 0.70 else "faible" if corr_val < 0.85 else "très faible"
        rdt = max(0, round(15 * (1 - corr_val)))
        print(f"  {name:<25} {corr_val:>9.2f} {disp:>12} {'~' + str(rdt) + '%':>10}")

    # ── 5. Save output ──
    if args.output:
        output = {
            "_meta": {
                "generated": datetime.utcnow().isoformat(),
                "tickers": tickers,
                "days_requested": args.days,
            },
            "correlation_1y": {
                "tickers": valid_1y if corr_1y is not None else [],
                "matrix": corr_1y.tolist() if corr_1y is not None else [],
                "avg": round(avg_1y, 4),
            },
            "conditional": cond if vix_levels is not None else {},
            "pairs_sorted": [(t1, t2, round(c, 4)) for t1, t2, c in pairs_detail] if corr_1y is not None else [],
        }
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2, default=str)
        print(f"\n  Saved: {args.output}")


if __name__ == "__main__":
    main()
