"""Analyse factorielle des 6 critères Buffett — v6 (2026-06-23).

Référence : docs/PREDECLARATION_BUFFETT_CRITERIA.md (commit AVANT ce code).

Pour chaque critère binaire (PASS/FAIL) :
- Spread = mean(return PASS) - mean(return FAIL) sur 5 années × stocks
- Bootstrap IC95% sur spread + taux catastrophes (<-30%, <-50%)
- Verdict edge/neutre/inversé au seuil Bonferroni α=0.83% (6 tests)

Aucune optimisation de seuil. Aucune modification post-résultat.
"""

from __future__ import annotations

import csv
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean, stdev

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DERIVED_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "derived"

REBALANCE_DATES = [
    "2021-04-01", "2022-04-01", "2023-04-01",
    "2024-04-01", "2025-04-01", "2026-04-01",
]
LAG_DAYS = 90
BOOTSTRAP_ITERATIONS = 1000
ALPHA_BONFERRONI = 0.05 / 6  # = 0.833%

# Seuils des 6 critères Buffett (figés selon stock-advance-filter.js actuel)
def passes_roe_consistent(m):
    roe_avg = m.get("roe_avg_3y")
    roe_std = m.get("roe_std_3y")
    if roe_avg is None: return None
    roe_ok = roe_avg >= 15
    if roe_std is None or abs(roe_avg) == 0: return roe_ok
    cv_ok = (roe_std / abs(roe_avg)) < 0.30
    return roe_ok and cv_ok

def passes_roic_moat(m):
    roic_avg = m.get("roic_avg_3y")
    if roic_avg is None: return None
    return roic_avg >= 10

def passes_leverage_safe(m):
    de = m.get("de_ratio")
    if de is None: return None
    return 0 <= de <= 1.5

def passes_cash_generation(m):
    fcfy = m.get("fcf_yield")
    if fcfy is None: return None
    return fcfy > 3

def passes_valuation_ok(m):
    pe = m.get("pe_ratio")
    if pe is None: return None
    return 0 < pe <= 25

def passes_moat_expansion(m):
    roe_n = m.get("roe")
    roe_3y = m.get("roe_avg_3y")
    if roe_n is None or roe_3y is None or roe_3y == 0: return None
    return (roe_n / roe_3y) >= 0.90

CRITERIA = {
    "roe_consistent":  passes_roe_consistent,
    "roic_moat":       passes_roic_moat,
    "leverage_safe":   passes_leverage_safe,
    "cash_generation": passes_cash_generation,
    "valuation_ok":    passes_valuation_ok,
    "moat_expansion":  passes_moat_expansion,
}


def load_data():
    metrics = []
    with (DERIVED_DIR / "metrics_by_year.csv").open() as f:
        for r in csv.DictReader(f):
            r["excluded_year"] = (r.get("excluded_year") or "").lower() == "true"
            for k in ("roe", "roic", "roe_avg_3y", "roe_std_3y", "roic_avg_3y",
                     "de_ratio", "fcf_yield", "pe_ratio"):
                v = r.get(k)
                r[k] = float(v) if v and v not in ("", "None") else None
            metrics.append(r)
    prices = {}
    with (DERIVED_DIR / "prices_at_rebalance.csv").open() as f:
        for r in csv.DictReader(f):
            prices[(r["ticker"], r["rebalance_date"])] = float(r["close"])
    return metrics, prices


def eligible_at(metrics, rebalance_date):
    """Stocks éligibles avec lag publication, hors excluded_year."""
    cutoff = (datetime.fromisoformat(rebalance_date) - timedelta(days=LAG_DAYS)).date().isoformat()
    by_ticker = {}
    for r in metrics:
        if r["excluded_year"]: continue
        if r["fiscal_date"] > cutoff: continue
        prev = by_ticker.get(r["ticker"])
        if prev is None or r["fiscal_date"] > prev["fiscal_date"]:
            by_ticker[r["ticker"]] = r
    return list(by_ticker.values())


def collect_returns_by_criterion(metrics, prices, criterion_name, passes_fn):
    """Pour chaque (stock × année), classer PASS/FAIL/UNKNOWN et collecter return."""
    pass_returns, fail_returns, n_unknown = [], [], 0
    for i in range(len(REBALANCE_DATES) - 1):
        date_start, date_end = REBALANCE_DATES[i], REBALANCE_DATES[i + 1]
        eligible = eligible_at(metrics, date_start)
        for r in eligible:
            tk = r["ticker"]
            p0 = prices.get((tk, date_start))
            p1 = prices.get((tk, date_end))
            if not p0 or not p1 or p0 <= 0: continue
            ret = p1 / p0 - 1
            result = passes_fn(r)
            if result is None:
                n_unknown += 1
                continue
            if result:
                pass_returns.append(ret)
            else:
                fail_returns.append(ret)
    return pass_returns, fail_returns, n_unknown


def bootstrap_diff_mean(group_a, group_b, n_iter=BOOTSTRAP_ITERATIONS, alpha=0.05, seed=42):
    """Bootstrap IC sur mean(a) - mean(b). Retourne (diff, ic_lo, ic_hi)."""
    if not group_a or not group_b: return None, None, None
    rng = random.Random(seed)
    diffs = []
    for _ in range(n_iter):
        sa = [rng.choice(group_a) for _ in range(len(group_a))]
        sb = [rng.choice(group_b) for _ in range(len(group_b))]
        diffs.append(mean(sa) - mean(sb))
    diffs.sort()
    lo_idx = int((alpha / 2) * n_iter)
    hi_idx = int((1 - alpha / 2) * n_iter)
    diff_med = diffs[n_iter // 2]
    return diff_med, diffs[lo_idx], diffs[hi_idx]


def bootstrap_diff_prop(group_a, group_b, threshold, n_iter=BOOTSTRAP_ITERATIONS, alpha=0.05, seed=42):
    """Bootstrap IC sur (% group_a < threshold) - (% group_b < threshold).

    Positive si group_a a plus de catastrophes que group_b.
    """
    if not group_a or not group_b: return None, None, None, None, None
    rng = random.Random(seed)
    p_a = sum(1 for v in group_a if v < threshold) / len(group_a)
    p_b = sum(1 for v in group_b if v < threshold) / len(group_b)
    diffs = []
    for _ in range(n_iter):
        sa = [rng.choice(group_a) for _ in range(len(group_a))]
        sb = [rng.choice(group_b) for _ in range(len(group_b))]
        pa_s = sum(1 for v in sa if v < threshold) / len(sa)
        pb_s = sum(1 for v in sb if v < threshold) / len(sb)
        diffs.append(pa_s - pb_s)
    diffs.sort()
    lo_idx = int((alpha / 2) * n_iter)
    hi_idx = int((1 - alpha / 2) * n_iter)
    return p_a, p_b, diffs[n_iter // 2], diffs[lo_idx], diffs[hi_idx]


def main():
    metrics, prices = load_data()
    print(f"{'='*75}")
    print(f"ANALYSE FACTORIELLE — 6 critères Buffett (binaires, v6 pré-déclarée)")
    print(f"{'='*75}")
    print(f"Référence : PREDECLARATION_BUFFETT_CRITERIA.md (commit AVANT)")
    print(f"Univers : {len({r['ticker'] for r in metrics})} stocks, fenêtre 2021-2026")
    print(f"Seuil Bonferroni : α = {ALPHA_BONFERRONI*100:.3f}% (6 tests)")
    print(f"Bootstrap : {BOOTSTRAP_ITERATIONS} iter, seed=42")

    results = {}

    for crit_name, passes_fn in CRITERIA.items():
        print(f"\n{'─'*75}")
        print(f"CRITÈRE : {crit_name}")
        print(f"{'─'*75}")

        pass_rets, fail_rets, n_unk = collect_returns_by_criterion(metrics, prices, crit_name, passes_fn)

        n_pass, n_fail = len(pass_rets), len(fail_rets)
        m_pass = mean(pass_rets) * 100 if pass_rets else 0
        m_fail = mean(fail_rets) * 100 if fail_rets else 0
        print(f"  N PASS = {n_pass:>4}, mean return = {m_pass:>+6.2f}%")
        print(f"  N FAIL = {n_fail:>4}, mean return = {m_fail:>+6.2f}%")
        if n_unk > 0:
            print(f"  N UNKNOWN (data manquante) = {n_unk}")

        # Spread mean return (Bonferroni 99.17% CI)
        spread, sp_lo, sp_hi = bootstrap_diff_mean(pass_rets, fail_rets, alpha=ALPHA_BONFERRONI)
        if spread is not None:
            sig = (sp_lo > 0 or sp_hi < 0)
            print(f"  Spread mean (PASS - FAIL) = {spread*100:+.2f}%")
            print(f"  IC99.17% (Bonferroni)      = [{sp_lo*100:+.2f}%, {sp_hi*100:+.2f}%] {'★ SIGNIFICATIF' if sig else '(inclut 0)'}")

        # Catastrophes -30% (IC95% standard)
        p_a30, p_b30, dm30, dl30, dh30 = bootstrap_diff_prop(fail_rets, pass_rets, -0.30, alpha=0.05)
        if p_a30 is not None:
            ratio_30 = (p_a30 / p_b30) if p_b30 > 0 else float("inf")
            sig30 = (dl30 > 0 or dh30 < 0)
            print(f"  Catastrophes -30% : FAIL={p_a30*100:.2f}%, PASS={p_b30*100:.2f}%, ratio={ratio_30:.2f}×")
            print(f"    IC95% diff = [{dl30*100:+.2f}%, {dh30*100:+.2f}%] {'★' if sig30 else '(inclut 0)'}")

        # Catastrophes -50%
        p_a50, p_b50, dm50, dl50, dh50 = bootstrap_diff_prop(fail_rets, pass_rets, -0.50, alpha=0.05)
        if p_a50 is not None:
            ratio_50 = (p_a50 / p_b50) if p_b50 > 0 else float("inf")
            sig50 = (dl50 > 0 or dh50 < 0)
            print(f"  Catastrophes -50% : FAIL={p_a50*100:.2f}%, PASS={p_b50*100:.2f}%, ratio={ratio_50:.2f}×")
            print(f"    IC95% diff = [{dl50*100:+.2f}%, {dh50*100:+.2f}%] {'★' if sig50 else '(inclut 0)'}")

        # Verdict pré-déclaré
        if spread is None:
            verdict = "INSUFFISANT (données manquantes)"
        elif sp_lo > 0:
            verdict = "✓ EDGE (PASS > FAIL au seuil Bonferroni)"
        elif sp_hi < 0:
            verdict = "✗ INVERSÉ (PASS < FAIL au seuil Bonferroni)"
        else:
            verdict = "○ NEUTRE (IC inclut 0)"
        print(f"  → VERDICT : {verdict}")

        results[crit_name] = {
            "spread_pct": spread * 100 if spread else None,
            "ic_lo_pct": sp_lo * 100 if sp_lo else None,
            "ic_hi_pct": sp_hi * 100 if sp_hi else None,
            "ratio_50": ratio_50 if 'ratio_50' in dir() else None,
            "verdict": verdict,
        }

    print(f"\n{'='*75}")
    print(f"SYNTHÈSE")
    print(f"{'='*75}")
    print(f"{'Critère':<20} {'Spread':>10} {'IC99.17%':>20} {'Verdict':<35}")
    for crit_name, r in results.items():
        if r["spread_pct"] is None:
            print(f"  {crit_name:<18} {'-':>10} {'-':>20} {r['verdict']}")
        else:
            print(f"  {crit_name:<18} {r['spread_pct']:>+9.2f}%  [{r['ic_lo_pct']:+.2f}, {r['ic_hi_pct']:+.2f}]   {r['verdict']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
