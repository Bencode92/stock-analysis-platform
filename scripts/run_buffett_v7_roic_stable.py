"""Test factoriel isolé `roic_stable` (7e critère candidat) — v7 (2026-06-23).

Référence : docs/PREDECLARATION_BUFFETT_V7_ROIC_STABLE.md (commit AVANT ce code).

Méthode (figée pré-déclaration) :
- Variable : roic_std_3y point-in-time
- Seuil : QUANTILE (tiers le plus stable vs reste), PAS X absolu
- Métrique UNIQUE de décision : catastrophes -50%
- Métrique secondaire (NON décisionnelle) : spread return moyen
- Bonferroni 7 tests : α = 0.71%, IC retenu 99.29%
- Edge confirmé SI (ratio FAIL/PASS ≥ 2× ET IC99.29% exclut 0)

Verdict TERMINAL : edge → 7e critère ajouté. Pas d'edge → reste à 6.
PAS DE 8e CANDIDAT testé.
"""

from __future__ import annotations

import csv
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DERIVED_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "derived"

REBALANCE_DATES = [
    "2021-04-01", "2022-04-01", "2023-04-01",
    "2024-04-01", "2025-04-01", "2026-04-01",
]
LAG_DAYS = 90
BOOTSTRAP_ITERATIONS = 1000
ALPHA_BONFERRONI = 0.05 / 7  # 7 tests = 0.714%
CONFIDENCE = 1 - ALPHA_BONFERRONI  # 99.286%
CATASTROPHE_THRESHOLD = -0.50
RATIO_THRESHOLD = 2.0


def load_data():
    metrics = []
    with (DERIVED_DIR / "metrics_by_year.csv").open() as f:
        for r in csv.DictReader(f):
            r["excluded_year"] = (r.get("excluded_year") or "").lower() == "true"
            for k in ("roic_std_3y",):
                v = r.get(k)
                r[k] = float(v) if v and v not in ("", "None") else None
            metrics.append(r)
    prices = {}
    with (DERIVED_DIR / "prices_at_rebalance.csv").open() as f:
        for r in csv.DictReader(f):
            prices[(r["ticker"], r["rebalance_date"])] = float(r["close"])
    return metrics, prices


def eligible_at_with_roic_std(metrics, rebalance_date):
    """Stocks éligibles avec lag publication + roic_std_3y disponible + hors excluded_year."""
    cutoff = (datetime.fromisoformat(rebalance_date) - timedelta(days=LAG_DAYS)).date().isoformat()
    by_ticker = {}
    for r in metrics:
        if r["excluded_year"]: continue
        if r["roic_std_3y"] is None: continue
        if r["fiscal_date"] > cutoff: continue
        prev = by_ticker.get(r["ticker"])
        if prev is None or r["fiscal_date"] > prev["fiscal_date"]:
            by_ticker[r["ticker"]] = r
    return list(by_ticker.values())


def collect_returns_by_stability(metrics, prices):
    """Pour chaque rebalance, séparer en tiers stable (PASS) vs reste (FAIL) par quantile.

    PASS = tiers le plus stable (1/3 du bas roic_std)
    FAIL = 2/3 supérieurs (les moins stables)
    """
    pass_returns, fail_returns = [], []
    rebalance_stats = []

    for i in range(len(REBALANCE_DATES) - 1):
        date_start, date_end = REBALANCE_DATES[i], REBALANCE_DATES[i + 1]
        eligible = eligible_at_with_roic_std(metrics, date_start)
        if not eligible: continue

        # Calculer le seuil de quantile à 1/3 (tiers le plus stable)
        stds = sorted([r["roic_std_3y"] for r in eligible])
        threshold_q33 = stds[len(stds) // 3]  # tiers inférieur = plus stable
        rebalance_stats.append({
            "date": date_start,
            "n_eligible": len(eligible),
            "threshold_q33": threshold_q33,
            "stds_sample": (stds[0], stds[len(stds)//6], threshold_q33, stds[len(stds)//2], stds[-1]),
        })

        for r in eligible:
            tk = r["ticker"]
            p0 = prices.get((tk, date_start))
            p1 = prices.get((tk, date_end))
            if not p0 or not p1 or p0 <= 0: continue
            ret = p1 / p0 - 1
            if r["roic_std_3y"] <= threshold_q33:
                pass_returns.append(ret)
            else:
                fail_returns.append(ret)

    return pass_returns, fail_returns, rebalance_stats


def bootstrap_diff_prop(group_a, group_b, threshold, n_iter=BOOTSTRAP_ITERATIONS, alpha=ALPHA_BONFERRONI, seed=42):
    """Bootstrap IC sur (% group_a < threshold) - (% group_b < threshold).

    Positive si group_a (FAIL/instables) a plus de catastrophes que group_b (PASS/stables).
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


def bootstrap_diff_mean(group_a, group_b, n_iter=BOOTSTRAP_ITERATIONS, alpha=ALPHA_BONFERRONI, seed=42):
    """Bootstrap IC sur mean(a) - mean(b). Informatif uniquement (non décisionnel)."""
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
    return diffs[n_iter // 2], diffs[lo_idx], diffs[hi_idx]


def main():
    metrics, prices = load_data()
    print(f"{'='*75}")
    print(f"TEST 7e CRITÈRE CANDIDAT — roic_stable (Novy-Marx, v7 pré-déclarée)")
    print(f"{'='*75}")
    print(f"Référence : PREDECLARATION_BUFFETT_V7_ROIC_STABLE.md (commit AVANT)")
    print(f"Seuil : QUANTILE tiers stable vs reste (PAS X absolu)")
    print(f"Métrique décisionnelle : catastrophes -50% (cohérent rôle anti-ruine)")
    print(f"Bonferroni 7 tests : α = {ALPHA_BONFERRONI*100:.3f}%, IC = {CONFIDENCE*100:.2f}%")

    pass_rets, fail_rets, stats = collect_returns_by_stability(metrics, prices)

    print(f"\n--- Statistiques par rebalance ---")
    print(f"{'Date':<14} {'N éligibles':>12} {'Q33 seuil':>12}  {'min / Q17 / Q33 / médiane / max'}")
    for s in stats:
        min_s, q17, q33, med, max_s = s["stds_sample"]
        print(f"{s['date']:<14} {s['n_eligible']:>12} {q33:>12.2f}  {min_s:.2f} / {q17:.2f} / {q33:.2f} / {med:.2f} / {max_s:.2f}")

    print(f"\n--- Groupes ---")
    print(f"PASS (tiers le plus stable) : N = {len(pass_rets)} (stock × année)")
    print(f"FAIL (2/3 moins stables)    : N = {len(fail_rets)} (stock × année)")
    if pass_rets and fail_rets:
        print(f"Mean return PASS = {mean(pass_rets)*100:+.2f}%")
        print(f"Mean return FAIL = {mean(fail_rets)*100:+.2f}%")

    # Métrique secondaire INFORMATIVE (non décisionnelle) — spread return moyen
    print(f"\n--- Métrique SECONDAIRE (informative, non décisionnelle) ---")
    spread, sp_lo, sp_hi = bootstrap_diff_mean(pass_rets, fail_rets)
    if spread is not None:
        print(f"Spread mean (PASS - FAIL) : {spread*100:+.2f}%")
        print(f"IC{CONFIDENCE*100:.2f}% (Bonferroni)    : [{sp_lo*100:+.2f}%, {sp_hi*100:+.2f}%]")
        print(f"(Pas utilisé pour le verdict, juste pour information)")

    # ─── Métrique DÉCISIONNELLE : catastrophes -50% ───
    print(f"\n{'─'*75}")
    print(f"MÉTRIQUE DÉCISIONNELLE : catastrophes -50%")
    print(f"{'─'*75}")
    p_a, p_b, diff_med, ic_lo, ic_hi = bootstrap_diff_prop(fail_rets, pass_rets, CATASTROPHE_THRESHOLD)
    if p_a is not None:
        ratio = (p_a / p_b) if p_b > 0 else float("inf")
        ic_excludes_zero = (ic_lo > 0 or ic_hi < 0)
        n_cat_pass = sum(1 for v in pass_rets if v < CATASTROPHE_THRESHOLD)
        n_cat_fail = sum(1 for v in fail_rets if v < CATASTROPHE_THRESHOLD)

        print(f"\n  Catastrophes -50% :")
        print(f"    PASS (stables)  : {p_b*100:.2f}% ({n_cat_pass}/{len(pass_rets)})")
        print(f"    FAIL (instables): {p_a*100:.2f}% ({n_cat_fail}/{len(fail_rets)})")
        print(f"    Ratio FAIL/PASS = {ratio:.2f}× (seuil pré-déclaré ≥ {RATIO_THRESHOLD}×)")
        print(f"    Bootstrap diff IC{CONFIDENCE*100:.2f}% = [{ic_lo*100:+.3f}%, {ic_hi*100:+.3f}%]")
        print(f"    IC {'EXCLUT 0 ★' if ic_excludes_zero else 'INCLUT 0 (non significatif)'}")

        # ─── VERDICT TERMINAL ───
        print(f"\n{'='*75}")
        print(f"VERDICT TERMINAL (pré-déclaré)")
        print(f"{'='*75}")

        cond_ratio = ratio >= RATIO_THRESHOLD
        cond_ic = ic_excludes_zero and ic_lo > 0

        print(f"  Condition 1 (ratio ≥ {RATIO_THRESHOLD}×) : {'✓' if cond_ratio else '✗'} (mesuré {ratio:.2f}×)")
        print(f"  Condition 2 (IC{CONFIDENCE*100:.2f}% exclut 0) : {'✓' if cond_ic else '✗'} ([{ic_lo*100:+.3f}%, {ic_hi*100:+.3f}%])")

        if cond_ratio and cond_ic:
            verdict = "✓ EDGE CONFIRMÉ"
            decision = ("AJOUTER roic_stable comme 7e critère dans Buffett v2026.\n"
                        "  Théorie Novy-Marx empiriquement validée sur cette fenêtre.")
        elif ic_hi < 0:
            verdict = "✗ INVERSÉ — anomalie"
            decision = ("Sens contraire : stables font PLUS de catastrophes.\n"
                        "  Investiguer comme BUG (résultat contre-théorique fort).\n"
                        "  NE PAS ajouter, scoring reste à 6.")
        else:
            verdict = "○ NEUTRE — pas d'edge significatif"
            decision = ("Pas d'edge anti-ruine prouvé pour roic_stable sur cette mesure.\n"
                        "  TERMINAL : scoring v2026 reste à 6 critères.\n"
                        "  PAS DE 8e CANDIDAT testé (engagement anti-p-hacking).")

        print(f"\n  → {verdict}")
        print(f"  → {decision}")
        print(f"{'='*75}")
    else:
        print(f"\nDonnées insuffisantes pour conclure.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
