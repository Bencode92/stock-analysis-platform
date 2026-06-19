"""Test de survie (Branche B) — GARDÉS vs REJETÉS.

Référence : docs/PREDECLARATION_BACKTEST_SURVIE.md (committée AVANT ce code).

Aucune modification de la pré-déclaration après lecture des résultats.
Une seule exécution, un verdict, accepté tel quel.

Méthode :
- Univers : 239 stocks actifs (post-nettoyage backtest D)
- Pour chaque rebalance, séparer en GARDÉS (Buf≥70) et REJETÉS (Buf<70)
- Calculer returns annuels (entre rebalances) pour chaque (stock, année)
- M1 : queue gauche du return annuel (5e percentile + pire absolu)
- M2 : taux catastrophes (% returns < -30% et < -50%)
- M3 : taux de ruine 6 ans (% stocks avec return cumulé < -50%)
- Bootstrap IC95% sur M2 et M3 (1000 itérations)
- Verdict selon ≥ 2 conditions sur 3 + IC95% ≠ 0

NOTE : Le verdict est lu et tracé ; il n'est pas modifié post-hoc.
"""

from __future__ import annotations

import csv
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean, median

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DERIVED_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "derived"

# Paramètres figés (pré-déclaration)
BUFFETT_THRESHOLD = 70.0
REBALANCE_DATES = [
    "2021-04-01", "2022-04-01", "2023-04-01",
    "2024-04-01", "2025-04-01", "2026-04-01",
]
LAG_DAYS = 90
CATASTROPHE_MODERATE = -0.30   # -30%
CATASTROPHE_EXTREME = -0.50    # -50%
RUIN_THRESHOLD = -0.50         # -50% cumulé sur 6 ans
BOOTSTRAP_ITERATIONS = 1000

# Seuils significativité a priori
M1_QUEUE_LEFT_DELTA_PTS = 10.0    # 5e pct rejetés < gardés - 10 pts
M2_RATIO_THRESHOLD = 2.0           # rejetés ≥ 2× gardés
M3_RATIO_THRESHOLD = 2.0           # rejetés ≥ 2× gardés


def load_data():
    metrics = []
    with (DERIVED_DIR / "metrics_by_year.csv").open() as f:
        for r in csv.DictReader(f):
            r["excluded_year"] = (r.get("excluded_year") or "").lower() == "true"
            r["buffett_score"] = float(r["buffett_score"]) if r.get("buffett_score") else None
            metrics.append(r)
    prices = {}
    with (DERIVED_DIR / "prices_at_rebalance.csv").open() as f:
        for r in csv.DictReader(f):
            prices[(r["ticker"], r["rebalance_date"])] = float(r["close"])
    return metrics, prices


def eligible_at(metrics, rebalance_date):
    """Stocks éligibles avec lag publication 90j, hors excluded_year, avec buffett_score."""
    cutoff = (datetime.fromisoformat(rebalance_date) - timedelta(days=LAG_DAYS)).date().isoformat()
    by_ticker = {}
    for r in metrics:
        if r["excluded_year"] or r["buffett_score"] is None:
            continue
        if r["fiscal_date"] > cutoff:
            continue
        prev = by_ticker.get(r["ticker"])
        if prev is None or r["fiscal_date"] > prev["fiscal_date"]:
            by_ticker[r["ticker"]] = r
    return list(by_ticker.values())


def collect_annual_returns(metrics, prices):
    """Pour chaque (rebalance N → N+1), retourne returns annuels par stock + groupe.

    Returns : list of (ticker, period_start, period_end, return, group)
    où group ∈ {"GARDÉ", "REJETÉ"} déterminé par buffett_score au rebalance N.
    """
    annual = []
    for i in range(len(REBALANCE_DATES) - 1):
        date_start, date_end = REBALANCE_DATES[i], REBALANCE_DATES[i + 1]
        eligible = eligible_at(metrics, date_start)
        for r in eligible:
            tk = r["ticker"]
            p0 = prices.get((tk, date_start))
            p1 = prices.get((tk, date_end))
            if not p0 or not p1 or p0 <= 0:
                continue
            ret = p1 / p0 - 1
            group = "GARDÉ" if r["buffett_score"] >= BUFFETT_THRESHOLD else "REJETÉ"
            annual.append({
                "ticker": tk,
                "period_start": date_start,
                "period_end": date_end,
                "return": ret,
                "group": group,
                "buffett_score": r["buffett_score"],
            })
    return annual


def collect_cumulative_returns(metrics, prices):
    """Pour chaque stock présent sur toute la fenêtre : return cumulé 2021→2026.

    Le groupe est déterminé par buffett_score AU PREMIER rebalance (point de tri initial).
    """
    cumul = []
    first_eligible = eligible_at(metrics, REBALANCE_DATES[0])
    by_ticker = {r["ticker"]: r for r in first_eligible}
    for tk, r in by_ticker.items():
        p0 = prices.get((tk, REBALANCE_DATES[0]))
        p1 = prices.get((tk, REBALANCE_DATES[-1]))
        if not p0 or not p1 or p0 <= 0:
            continue
        cum_ret = p1 / p0 - 1
        group = "GARDÉ" if r["buffett_score"] >= BUFFETT_THRESHOLD else "REJETÉ"
        cumul.append({"ticker": tk, "cum_return": cum_ret, "group": group})
    return cumul


def percentile(values, p):
    """Percentile p (entre 0 et 100). Linéaire interpolation simple."""
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * (p / 100)
    f, c = int(k), int(k) + 1
    if c >= len(s):
        return s[-1]
    return s[f] + (s[c] - s[f]) * (k - f)


def bootstrap_proportion_diff_ci(group_a, group_b, threshold, n_iter=BOOTSTRAP_ITERATIONS, seed=42):
    """Bootstrap IC95% sur la différence des proportions (group_b < threshold) - (group_a < threshold).

    group_a = gardés, group_b = rejetés. Différence positive = rejetés concentrent plus de catastrophes.
    Retourne (p_a, p_b, diff_median, ic95_low, ic95_high).
    """
    rng = random.Random(seed)
    if not group_a or not group_b:
        return None, None, None, None, None
    p_a = sum(1 for v in group_a if v < threshold) / len(group_a)
    p_b = sum(1 for v in group_b if v < threshold) / len(group_b)
    diffs = []
    for _ in range(n_iter):
        sa = [rng.choice(group_a) for _ in range(len(group_a))]
        sb = [rng.choice(group_b) for _ in range(len(group_b))]
        pa_s = sum(1 for v in sa if v < threshold) / len(sa)
        pb_s = sum(1 for v in sb if v < threshold) / len(sb)
        diffs.append(pb_s - pa_s)
    diffs.sort()
    ic_low = diffs[int(0.025 * n_iter)]
    ic_high = diffs[int(0.975 * n_iter)]
    return p_a, p_b, diffs[n_iter // 2], ic_low, ic_high


def main():
    metrics, prices = load_data()
    annual = collect_annual_returns(metrics, prices)
    cumul = collect_cumulative_returns(metrics, prices)

    print("=" * 70)
    print("TEST DE SURVIE — Branche B (suite Verdict D)")
    print("Référence pré-déclaration : docs/PREDECLARATION_BACKTEST_SURVIE.md")
    print("=" * 70)
    print(f"\nSeuil filtre : buffett_score ≥ {BUFFETT_THRESHOLD}")
    print(f"Univers : 239 stocks actifs, fenêtre 2021-2026 (5 années)")

    # Séparer en GARDÉS et REJETÉS
    annual_gardes = [r for r in annual if r["group"] == "GARDÉ"]
    annual_rejetes = [r for r in annual if r["group"] == "REJETÉ"]
    cumul_gardes = [r for r in cumul if r["group"] == "GARDÉ"]
    cumul_rejetes = [r for r in cumul if r["group"] == "REJETÉ"]

    print(f"\n(stock × année) total : {len(annual)}")
    print(f"  GARDÉS  (Buf≥70) : {len(annual_gardes)}")
    print(f"  REJETÉS (Buf<70) : {len(annual_rejetes)}")
    print(f"\nStocks présents sur 5 ans complets : {len(cumul)}")
    print(f"  GARDÉS  : {len(cumul_gardes)}")
    print(f"  REJETÉS : {len(cumul_rejetes)}")

    # ───────── M1 : queue gauche du return annuel ─────────
    print(f"\n{'─'*70}")
    print(f"M1 — Queue gauche du return annuel (figée pré-déclaration)")
    print(f"{'─'*70}")
    rets_gardes = [r["return"] for r in annual_gardes]
    rets_rejetes = [r["return"] for r in annual_rejetes]
    p5_gardes = percentile(rets_gardes, 5) * 100
    p5_rejetes = percentile(rets_rejetes, 5) * 100
    pire_gardes = min(rets_gardes) * 100
    pire_rejetes = min(rets_rejetes) * 100
    print(f"  5e percentile : GARDÉS {p5_gardes:>+7.2f}%  |  REJETÉS {p5_rejetes:>+7.2f}%")
    print(f"  Pire absolu   : GARDÉS {pire_gardes:>+7.2f}%  |  REJETÉS {pire_rejetes:>+7.2f}%")
    delta_5pct = p5_gardes - p5_rejetes  # positif si rejetés ont pire 5pct
    m1_pass = (p5_rejetes < p5_gardes - M1_QUEUE_LEFT_DELTA_PTS)
    print(f"  Δ 5e pct (gardés - rejetés) : {delta_5pct:+.2f} pts (seuil ≥ {M1_QUEUE_LEFT_DELTA_PTS})")
    print(f"  M1 verdict : {'✓ EDGE' if m1_pass else '✗ pas d edge'}")

    # ───────── M2 : taux de catastrophes ─────────
    print(f"\n{'─'*70}")
    print(f"M2 — Taux de catastrophes annuelles")
    print(f"{'─'*70}")
    for thr_name, thr in (("-30%", CATASTROPHE_MODERATE), ("-50%", CATASTROPHE_EXTREME)):
        p_g, p_r, diff_med, ic_lo, ic_hi = bootstrap_proportion_diff_ci(rets_gardes, rets_rejetes, thr)
        ratio = (p_r / p_g) if p_g > 0 else float("inf")
        ic_excl_zero = (ic_lo > 0) or (ic_hi < 0)
        print(f"  Seuil {thr_name} :")
        print(f"    Taux GARDÉS  = {p_g*100:>5.2f}%   ({sum(1 for v in rets_gardes if v < thr)}/{len(rets_gardes)})")
        print(f"    Taux REJETÉS = {p_r*100:>5.2f}%   ({sum(1 for v in rets_rejetes if v < thr)}/{len(rets_rejetes)})")
        print(f"    Ratio R/G    = {ratio:>5.2f}× (seuil ≥ {M2_RATIO_THRESHOLD}×)")
        print(f"    Bootstrap diff IC95% = [{ic_lo*100:+.2f}%, {ic_hi*100:+.2f}%]"
              f" {'EXCLUT 0' if ic_excl_zero else 'INCLUT 0 (non significatif)'}")
    # M2 verdict basé sur -30% (le plus directement testable)
    p_g_30, p_r_30, _, ic_lo_30, ic_hi_30 = bootstrap_proportion_diff_ci(rets_gardes, rets_rejetes, CATASTROPHE_MODERATE)
    ratio_30 = (p_r_30 / p_g_30) if p_g_30 > 0 else float("inf")
    m2_pass = (ratio_30 >= M2_RATIO_THRESHOLD) and (ic_lo_30 > 0 or ic_hi_30 < 0)
    print(f"\n  M2 verdict (seuil -30% + IC95%) : {'✓ EDGE' if m2_pass else '✗ pas d edge'}")

    # ───────── M3 : taux de ruine 6 ans ─────────
    print(f"\n{'─'*70}")
    print(f"M3 — Taux de ruine sur fenêtre complète 2021→2026")
    print(f"{'─'*70}")
    cum_rets_gardes = [r["cum_return"] for r in cumul_gardes]
    cum_rets_rejetes = [r["cum_return"] for r in cumul_rejetes]
    if cum_rets_gardes and cum_rets_rejetes:
        p_g, p_r, _, ic_lo, ic_hi = bootstrap_proportion_diff_ci(cum_rets_gardes, cum_rets_rejetes, RUIN_THRESHOLD)
        ratio = (p_r / p_g) if p_g > 0 else float("inf")
        ic_excl_zero = (ic_lo > 0) or (ic_hi < 0)
        print(f"  Seuil ruine = return cumulé < -50% sur 5 ans")
        print(f"    Taux GARDÉS  = {p_g*100:>5.2f}%   ({sum(1 for v in cum_rets_gardes if v < RUIN_THRESHOLD)}/{len(cum_rets_gardes)})")
        print(f"    Taux REJETÉS = {p_r*100:>5.2f}%   ({sum(1 for v in cum_rets_rejetes if v < RUIN_THRESHOLD)}/{len(cum_rets_rejetes)})")
        print(f"    Ratio R/G    = {ratio:>5.2f}× (seuil ≥ {M3_RATIO_THRESHOLD}×)")
        print(f"    Bootstrap diff IC95% = [{ic_lo*100:+.2f}%, {ic_hi*100:+.2f}%]"
              f" {'EXCLUT 0' if ic_excl_zero else 'INCLUT 0 (non significatif)'}")
        m3_pass = (ratio >= M3_RATIO_THRESHOLD) and ic_excl_zero
    else:
        print(f"  Données insuffisantes")
        m3_pass = False
    print(f"\n  M3 verdict : {'✓ EDGE' if m3_pass else '✗ pas d edge'}")

    # ───────── Verdict final ─────────
    print(f"\n{'='*70}")
    print(f"VERDICT FINAL (pré-déclaré)")
    print(f"{'='*70}")
    n_pass = sum([m1_pass, m2_pass, m3_pass])
    print(f"\nConditions remplies : {n_pass}/3")
    print(f"  M1 (queue gauche) : {'✓' if m1_pass else '✗'}")
    print(f"  M2 (catastrophes) : {'✓' if m2_pass else '✗'}")
    print(f"  M3 (ruine)        : {'✓' if m3_pass else '✗'}")

    # Vérification inversion (sens contraire significatif)
    inverted = False
    if p_g_30 > p_r_30 and (ic_hi_30 < 0):
        # gardés concentrent plus catastrophes que rejetés = sens inverse
        inverted = True

    print()
    if inverted:
        verdict = "SURVIE INVERSÉE"
        msg = ("Le filtre attire le pire (anti-sélection). Diagnostic urgent — "
               "bug dans le scoring lui-même.")
    elif n_pass >= 2:
        verdict = "SURVIE ✓"
        msg = ("Edge de survie RÉEL. Le filtre Buffett ≥ 70 a une valeur de "
               "PROTECTION (évite le pire), même sans edge de sélection. "
               "Doctrine signée tient : α conservé non pour alpha mais pour "
               "structure défensive PROUVÉE empiriquement.")
    else:
        verdict = "NEUTRE"
        msg = ("Le filtre ne protège pas du pire. Résultat DUR : le scoring "
               "n'a NI edge de sélection NI edge de protection. Implique "
               "refonte ou abandon au profit d'équipondération + Thematique.")
    print(f"→ {verdict}")
    print(f"\n{msg}")
    print(f"\n{'='*70}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
