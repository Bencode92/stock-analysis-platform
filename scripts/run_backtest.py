"""Harness backtest historique — Étape 7 (P0).

ORDRE LOGIQUE NON NÉGOCIABLE (Fabre 2026-06-19) :
1. Mode 3 (sanité) tourne EN PREMIER : top 25 buffett_score vs 100 tirages random 25.
   Si Mode 3 ne montre PAS d'edge significatif → STOP, le débat α/β est vain.
2. Mode 1 (α vs β) tourne UNIQUEMENT si Mode 3 PASS.
   α = top 25 par buffett_score (6 critères, valuation_ok inclus)
   β = top 25 par buffett_score_no_valuation (5 critères, NVDA/ASML chers éligibles)

PIÈGES FERMÉS :
- Lag 90j : fiscal_date + 90j ≤ rebalance_date (sinon look-ahead → biais)
- Frais 0.15%/trade
- PFU 31.4% sur PV réalisées + dividendes (pénalise β plus que α)
- Sticky bonus OFF (mesure scoring pur)
- Pas de market_context (RADAR neutralisé)

RAPPORT À 5 LIGNES par version (Fabre exigence) — pas un seul CAGR :
- CAGR net
- MaxDD
- DD spécifique 2022 (le seul vrai stress de la fenêtre)
- Sous-perf glissante 3y max
- Turnover/an

Mode 3 séparé : médiane edge + IC 90%.

Limite de fenêtre à GARDER EN TÊTE :
Cette fenêtre 2020-2026 EST l'histoire de NVDA ×15. β va probablement gagner —
ça ne prouve PAS que β est structurellement supérieur, ça prouve que β gagne
dans un régime de croissance tech. C'est conditionnel au régime.
"""

from __future__ import annotations

import argparse
import csv
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean, median, stdev
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DERIVED_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "derived"

# Paramètres backtest (gravés)
REBALANCE_DATES = [
    "2021-04-01", "2022-04-01", "2023-04-01",
    "2024-04-01", "2025-04-01", "2026-04-01",
]
LAG_DAYS = 90
TOP_N = 25
TRANSACTION_COST = 0.0015  # 0.15% par trade
PFU_RATE = 0.314           # 31.4% PV + dividendes (CTO)
MODE3_N_TRIALS = 100       # Monte Carlo
EDGE_SIGNIFICANCE_THRESHOLD = 0.02  # Edge ≥ 2 pts CAGR considéré significatif


def load_metrics():
    """Charge derived/metrics_by_year.csv en mémoire."""
    metrics_csv = DERIVED_DIR / "metrics_by_year.csv"
    if not metrics_csv.exists():
        print(f"ERREUR: {metrics_csv} introuvable.", file=sys.stderr)
        sys.exit(1)
    rows = []
    with metrics_csv.open() as f:
        for row in csv.DictReader(f):
            # Parse champs numériques
            for k in ("buffett_score", "buffett_score_no_valuation"):
                v = row.get(k)
                row[k] = float(v) if v and v != "" else None
            row["excluded_year"] = (row.get("excluded_year") or "").lower() in ("true", "1")
            rows.append(row)
    return rows


def load_prices():
    """Charge derived/prices_at_rebalance.csv → dict[(ticker, date)] = close."""
    prices_csv = DERIVED_DIR / "prices_at_rebalance.csv"
    if not prices_csv.exists():
        print(f"ERREUR: {prices_csv} introuvable. Lance d'abord fetch_rebalance_prices.py.", file=sys.stderr)
        sys.exit(1)
    prices = {}
    with prices_csv.open() as f:
        for row in csv.DictReader(f):
            prices[(row["ticker"], row["rebalance_date"])] = float(row["close"])
    return prices


def eligible_at(metrics, rebalance_date, lag_days=LAG_DAYS):
    """Stocks éligibles à la date avec lag publication 90j + hors excluded_year.

    Pour chaque ticker, retourne le DERNIER fiscal_date tel que
    fiscal_date + lag_days ≤ rebalance_date.
    """
    cutoff = (datetime.fromisoformat(rebalance_date) - timedelta(days=lag_days)).date().isoformat()
    by_ticker = {}
    for r in metrics:
        if r["excluded_year"]:
            continue
        if r["fiscal_date"] > cutoff:
            continue  # encore dans le futur de l'investisseur
        prev = by_ticker.get(r["ticker"])
        if prev is None or r["fiscal_date"] > prev["fiscal_date"]:
            by_ticker[r["ticker"]] = r
    return list(by_ticker.values())


def select_top_by_score(eligible, score_col, n=TOP_N):
    """Top N par score (None traité comme -∞)."""
    scored = [(r["ticker"], r.get(score_col)) for r in eligible if r.get(score_col) is not None]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [tk for tk, _ in scored[:n]]


def select_random(eligible, n=TOP_N, seed=None):
    """Tirage aléatoire de N tickers parmi les éligibles."""
    rng = random.Random(seed)
    pool = [r["ticker"] for r in eligible]
    if len(pool) < n:
        return pool
    return rng.sample(pool, n)


def portfolio_return(tickers, date_prev, date_curr, prices):
    """Return equipondéré du portefeuille entre 2 dates."""
    returns = []
    for tk in tickers:
        p0 = prices.get((tk, date_prev))
        p1 = prices.get((tk, date_curr))
        if p0 and p1 and p0 > 0:
            returns.append(p1 / p0 - 1)
    return mean(returns) if returns else 0.0


def backtest_strategy(metrics, prices, strategy_fn, **strategy_kwargs):
    """Backteste une stratégie sur les rebalances. Retourne equity curve + turnover."""
    equity = 1.0
    eq_curve = [(REBALANCE_DATES[0], equity, 0.0)]  # (date, equity, period_return_net)
    portfolio = []
    turnover_history = []

    for i in range(1, len(REBALANCE_DATES)):
        date_prev, date_curr = REBALANCE_DATES[i - 1], REBALANCE_DATES[i]
        eligible = eligible_at(metrics, date_prev)
        new_portfolio = strategy_fn(eligible, **strategy_kwargs)

        # Turnover : fraction de stocks changés vs portefeuille précédent
        if portfolio:
            n_changed = len(set(new_portfolio) - set(portfolio))
            turnover = n_changed / len(new_portfolio) if new_portfolio else 0
        else:
            turnover = 1.0  # 100% pour la 1ère période (achat initial complet)
        turnover_history.append(turnover)

        # Return brut équipondéré
        r_gross = portfolio_return(new_portfolio, date_prev, date_curr, prices)

        # Frais : 2 × turnover × cost (acheter les nouveaux + vendre les sortants)
        transaction_cost = 2 * turnover * TRANSACTION_COST

        # PFU 31.4% sur PV réalisées (sur la part positive du return)
        # Simplification : applique le PFU sur la part positive du return total annuel.
        # Hypothèse défensive : tout gain ≥ 0 est réalisé. Pénalise β (turnover plus élevé).
        r_after_costs = r_gross - transaction_cost
        if r_after_costs > 0:
            r_net = r_after_costs * (1 - PFU_RATE)
        else:
            r_net = r_after_costs

        equity *= (1 + r_net)
        eq_curve.append((date_curr, equity, r_net))
        portfolio = new_portfolio

    return eq_curve, turnover_history


def compute_metrics(eq_curve, turnover_history, label=""):
    """Calcule CAGR net, MaxDD, DD 2022, sous-perf 3y max, turnover/an."""
    n_years = len(eq_curve) - 1
    final_equity = eq_curve[-1][1]
    cagr = (final_equity ** (1 / n_years)) - 1 if n_years > 0 else 0

    # MaxDD
    peak = eq_curve[0][1]
    max_dd = 0.0
    for _, eq, _ in eq_curve:
        peak = max(peak, eq)
        dd = eq / peak - 1
        max_dd = min(max_dd, dd)

    # DD spécifique 2022 : equity au 2022-04-01 vs 2023-04-01 (bear tech)
    eq_2022 = next((eq for d, eq, _ in eq_curve if d == "2022-04-01"), final_equity)
    eq_2023 = next((eq for d, eq, _ in eq_curve if d == "2023-04-01"), final_equity)
    dd_2022 = eq_2023 / eq_2022 - 1 if eq_2022 > 0 else 0

    # Sous-perf glissante 3y : ici on n'a pas le bench, on retourne -1 (à compléter avec VWCE proxy)
    # Simplification : retourner le pire return 3y cumulé (proxy de "souffrance")
    if len(eq_curve) >= 4:
        rolling_3y = []
        for i in range(3, len(eq_curve)):
            r3 = eq_curve[i][1] / eq_curve[i - 3][1] - 1
            rolling_3y.append(r3)
        worst_3y = min(rolling_3y) if rolling_3y else 0
    else:
        worst_3y = 0

    avg_turnover = mean(turnover_history) if turnover_history else 0

    return {
        "label": label,
        "CAGR_net": cagr * 100,
        "MaxDD": max_dd * 100,
        "DD_2022": dd_2022 * 100,
        "worst_3y_cum": worst_3y * 100,
        "turnover_per_year": avg_turnover * 100,
        "final_equity": final_equity,
    }


def format_report(results):
    """Imprime le tableau à 5 lignes par version."""
    print("\n" + "=" * 70)
    print(f"{'Métrique':<25} " + " ".join(f"{r['label']:>12}" for r in results))
    print("-" * 70)
    print(f"{'CAGR net':<25} " + " ".join(f"{r['CAGR_net']:>11.2f}%" for r in results))
    print(f"{'MaxDD':<25} " + " ".join(f"{r['MaxDD']:>11.2f}%" for r in results))
    print(f"{'DD spécifique 2022':<25} " + " ".join(f"{r['DD_2022']:>11.2f}%" for r in results))
    print(f"{'Sous-perf 3y max (cum)':<25} " + " ".join(f"{r['worst_3y_cum']:>11.2f}%" for r in results))
    print(f"{'Turnover/an':<25} " + " ".join(f"{r['turnover_per_year']:>11.2f}%" for r in results))
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode3-trials", type=int, default=MODE3_N_TRIALS,
                        help=f"Nb tirages Monte Carlo Mode 3 (défaut {MODE3_N_TRIALS})")
    parser.add_argument("--force-mode1", action="store_true",
                        help="Lance Mode 1 même si Mode 3 échoue (debug)")
    args = parser.parse_args()

    print(f"{'='*70}")
    print(f"BACKTEST HARNESS — Mode 3 (sanité) PUIS Mode 1 (α vs β)")
    print(f"{'='*70}")
    print(f"Rebalances : {REBALANCE_DATES} (5 années)")
    print(f"Lag publication : {LAG_DAYS} jours")
    print(f"Frais : {TRANSACTION_COST*100:.2f}%/trade")
    print(f"PFU : {PFU_RATE*100:.1f}% sur PV réalisées + dividendes")
    print(f"Top N : {TOP_N}")

    metrics = load_metrics()
    prices = load_prices()
    print(f"\nMétriques chargées : {len(metrics)} lignes ({len({r['ticker'] for r in metrics})} stocks)")
    print(f"Prix chargés : {len(prices)} (ticker, date)")

    # ─── MODE 3 : SANITÉ ──────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"MODE 3 — SANITÉ : top 25 buffett vs {args.mode3_trials} tirages random")
    print(f"{'='*70}")

    # Stratégie scoring
    eq_curve_scored, to_scored = backtest_strategy(
        metrics, prices, select_top_by_score, score_col="buffett_score"
    )
    res_scored = compute_metrics(eq_curve_scored, to_scored, label="Buffett-25")
    print(f"\nBuffett top 25 : CAGR net = {res_scored['CAGR_net']:.2f}%, "
          f"MaxDD = {res_scored['MaxDD']:.2f}%")

    # Random Monte Carlo
    random_cagrs = []
    for trial in range(args.mode3_trials):
        eq_curve_r, to_r = backtest_strategy(
            metrics, prices, select_random, seed=trial
        )
        res_r = compute_metrics(eq_curve_r, to_r, label=f"Random-{trial}")
        random_cagrs.append(res_r["CAGR_net"])

    random_cagrs.sort()
    median_random = median(random_cagrs)
    ci90_low = random_cagrs[int(0.05 * len(random_cagrs))]
    ci90_high = random_cagrs[int(0.95 * len(random_cagrs))]

    print(f"\nRandom 25 ({args.mode3_trials} tirages) : "
          f"médiane CAGR = {median_random:.2f}%, IC90 = [{ci90_low:.2f}%, {ci90_high:.2f}%]")

    edge = res_scored["CAGR_net"] - median_random
    print(f"\nEdge buffett vs random (médiane) : {edge:+.2f} pts CAGR")
    print(f"Buffett vs IC90 random : {'AU-DESSUS' if res_scored['CAGR_net'] > ci90_high else 'DANS IC' if res_scored['CAGR_net'] >= ci90_low else 'AU-DESSOUS'}")

    mode3_passed = edge >= EDGE_SIGNIFICANCE_THRESHOLD * 100 and res_scored["CAGR_net"] > ci90_low
    if mode3_passed:
        print(f"\n✓ MODE 3 PASS — scoring montre un edge ≥ {EDGE_SIGNIFICANCE_THRESHOLD*100:.0f} pts vs aléatoire.")
    else:
        print(f"\n✗ MODE 3 FAIL — scoring sans edge significatif vs aléatoire.")
        print(f"  → Le débat α vs β est vain tant que le scoring n'a pas d'edge brut.")
        print(f"  → Action recommandée : retour au design du scoring AVANT de raffiner.")
        if not args.force_mode1:
            print(f"\n(Use --force-mode1 to run Mode 1 anyway for debug.)")
            return 0

    # ─── MODE 1 : α vs β ──────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"MODE 1 — α (Buffett 6 critères) vs β (Buffett 5 critères, valuation_ok exclu)")
    print(f"{'='*70}")

    eq_alpha, to_alpha = backtest_strategy(
        metrics, prices, select_top_by_score, score_col="buffett_score"
    )
    res_alpha = compute_metrics(eq_alpha, to_alpha, label="α (Buf 6)")

    eq_beta, to_beta = backtest_strategy(
        metrics, prices, select_top_by_score, score_col="buffett_score_no_valuation"
    )
    res_beta = compute_metrics(eq_beta, to_beta, label="β (Buf 5)")

    format_report([res_alpha, res_beta])

    # Verdict
    delta_cagr = res_beta["CAGR_net"] - res_alpha["CAGR_net"]
    delta_dd_2022 = res_beta["DD_2022"] - res_alpha["DD_2022"]
    print(f"\nΔ CAGR net (β - α) : {delta_cagr:+.2f} pts")
    print(f"Δ DD 2022 (β - α)  : {delta_dd_2022:+.2f} pts")

    print(f"\nRappel limite de fenêtre (Fabre) :")
    print(f"  Cette fenêtre 2021-2026 EST l'histoire de NVDA ×15. β va probablement gagner.")
    print(f"  Le verdict est CONDITIONNEL au régime tech, pas universel.")
    print(f"  Lire avec la grille : CAGR net + DD 2022 + sous-perf 3y, pas le CAGR seul.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
