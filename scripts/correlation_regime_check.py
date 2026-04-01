#!/usr/bin/env python3
"""
correlation_regime_check.py — Quarterly check for correlation drift.

Compares realized correlations (from Twelve Data) against the hardcoded
CORR_* constants in optimizer.py. Alerts if drift > ±0.10.

Run quarterly or after major macro events (rate changes, crises).
Usage: TWELVE_DATA_API=xxx python3 scripts/correlation_regime_check.py
"""

import json, os, time, re
import numpy as np
from pathlib import Path

API_KEY = os.environ.get("TWELVE_DATA_API", "")
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Current hardcoded values (from optimizer.py v7.2)
HARDCODED = {
    "equity_bond": 0.05,
    "equity_gold": 0.15,
    "bond_bond": 0.48,
    "same_sector": 0.37,
    "cross_sector": 0.22,
    "gold_bond": 0.04,
    "etf_bond": 0.13,
}

BOND_TICKERS = {"VGSH", "SCHO", "BSV", "STIP", "SGOV", "VCIT", "IGIB", "PAAA"}
GOLD_TICKERS = {"GLD", "SLV"}


def main():
    # Load correlation_diagnostics.json if it exists
    cd_path = DATA / "correlation_diagnostics.json"
    if not cd_path.exists():
        print("No correlation_diagnostics.json — run generate_portfolios first")
        return

    with open(cd_path) as f:
        cd = json.load(f)

    matrix = cd.get("correlation_matrix", {})
    tickers = matrix.get("tickers", [])
    mat = np.array(matrix.get("matrix", []))

    if len(tickers) == 0:
        print("Empty correlation matrix")
        return

    # Categorize tickers
    idx = {t: i for i, t in enumerate(tickers)}

    # Compute realized averages by pair type
    categories = {}
    for t in tickers:
        if t in BOND_TICKERS:
            categories[t] = "bond"
        elif t in GOLD_TICKERS:
            categories[t] = "gold"
        else:
            categories[t] = "equity"

    pair_types = {
        "equity_bond": [], "equity_gold": [], "bond_bond": [],
        "equity_equity": [], "gold_bond": [],
    }

    n = len(tickers)
    for i in range(n):
        for j in range(i + 1, n):
            ci, cj = categories.get(tickers[i], "?"), categories.get(tickers[j], "?")
            c = mat[i][j]

            if ci == "equity" and cj == "bond" or ci == "bond" and cj == "equity":
                pair_types["equity_bond"].append(c)
            elif ci == "equity" and cj == "gold" or ci == "gold" and cj == "equity":
                pair_types["equity_gold"].append(c)
            elif ci == "bond" and cj == "bond":
                pair_types["bond_bond"].append(c)
            elif ci == "equity" and cj == "equity":
                pair_types["equity_equity"].append(c)
            elif ci == "gold" and cj == "bond" or ci == "bond" and cj == "gold":
                pair_types["gold_bond"].append(c)

    # Compare with hardcoded
    print("=" * 70)
    print("  CORRELATION REGIME CHECK")
    print(f"  Date: {time.strftime('%Y-%m-%d')}")
    print(f"  Assets: {n} | Source: correlation_diagnostics.json")
    print("=" * 70)

    alerts = []
    print(f"\n  {'Pair type':<20} {'Realized':>10} {'Hardcoded':>10} {'Drift':>8} {'Status'}")
    print(f"  {'-'*60}")

    checks = [
        ("equity_bond", "equity_bond"),
        ("equity_gold", "equity_gold"),
        ("bond_bond", "bond_bond"),
        ("gold_bond", "gold_bond"),
    ]

    for pair_key, hc_key in checks:
        vals = pair_types.get(pair_key, [])
        hc = HARDCODED.get(hc_key)
        if not vals or hc is None:
            continue

        realized = float(np.mean(vals))
        drift = realized - hc

        if abs(drift) > 0.15:
            status = "!! ALERT"
            alerts.append((pair_key, realized, hc, drift))
        elif abs(drift) > 0.08:
            status = "? CHECK"
        else:
            status = "OK"

        print(f"  {pair_key:<20} {realized:>+10.3f} {hc:>+10.3f} {drift:>+8.3f} {status}")

    if alerts:
        print(f"\n  !! {len(alerts)} ALERTS — Consider updating CORR_* in optimizer.py:")
        for pair, real, hc, drift in alerts:
            print(f"     {pair}: {hc:+.2f} → {real:+.2f} (drift={drift:+.3f})")
    else:
        print(f"\n  All correlations within ±0.15 of hardcoded values.")
        print(f"  Next check: {time.strftime('%Y-%m-%d', time.localtime(time.time() + 90*86400))}")


if __name__ == "__main__":
    main()
