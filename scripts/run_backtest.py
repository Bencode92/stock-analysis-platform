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

# Paramètres backtest (figés AVANT exécution — voir PREDECLARATION_BACKTEST_MODE3.md)
REBALANCE_DATES = [
    "2021-04-01", "2022-04-01", "2023-04-01",
    "2024-04-01", "2025-04-01", "2026-04-01",
]
LAG_DAYS = 90
TOP_N = 10  # Réformulé Fabre 2026-06-19 : 25 → 10 (correction de construction, 22% sélectivité)
TRANSACTION_COST = 0.0015
PFU_RATE = 0.314
MODE3_N_TRIALS = 100
HOMOGENEITY_THRESHOLD = 0.25  # médiane % stocks ≥83 sur rebalances ; au-dessus = univers homogène


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
            for k in ("buffett_score", "buffett_score_no_valuation", "market_cap"):
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
    """Top N par score avec tie-breaker orthogonal market_cap décroissant.

    Fabre 2026-06-19 : éviter de réinjecter les composantes du scoring
    (roe, fcf_yield qui sont déjà dans buffett_score) comme tie-breaker
    car ça amplifie le signal qu'on teste. market_cap est neutre vs la
    thèse qualité.
    """
    scored = [(r["ticker"], r.get(score_col), r.get("market_cap") or 0)
              for r in eligible if r.get(score_col) is not None]
    # Tri lexicographique : (score, market_cap) décroissant
    scored.sort(key=lambda x: (x[1], x[2]), reverse=True)
    return [tk for tk, _, _ in scored[:n]]


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

    # Sharpe annualisé : mean(returns annuels nets) / stdev — sans rf (≈0 sur la fenêtre)
    period_returns = [r for _, _, r in eq_curve[1:]]  # exclude initial point
    if len(period_returns) >= 2:
        mean_r = mean(period_returns)
        std_r = stdev(period_returns)
        sharpe = mean_r / std_r if std_r > 0 else 0
    else:
        sharpe = 0

    return {
        "label": label,
        "CAGR_net": cagr * 100,
        "MaxDD": max_dd * 100,
        "DD_2022": dd_2022 * 100,
        "worst_3y_cum": worst_3y * 100,
        "turnover_per_year": avg_turnover * 100,
        "Sharpe_ann": sharpe,
        "final_equity": final_equity,
    }


def measure_universe_homogeneity(metrics) -> tuple[float, list[float]]:
    """Médiane sur les rebalances du % stocks éligibles avec buffett_score ≥ 83.

    Si médiane > HOMOGENEITY_THRESHOLD (25%), univers labo trop riche en
    qualité → un random tire mécaniquement de la qualité → faux négatif
    possible. Pré-déclaré comme garde-fou anti-faux-négatif (Fabre 2026-06-19).
    """
    pct_per_rebalance = []
    for date in REBALANCE_DATES[:-1]:  # rebalances effectives (sauf la dernière qui sert juste de fin de période)
        eligible = eligible_at(metrics, date)
        scored = [r for r in eligible if r.get("buffett_score") is not None]
        if not scored:
            continue
        n_top = sum(1 for r in scored if r["buffett_score"] >= 83)
        pct_per_rebalance.append(n_top / len(scored))
    median_pct = median(pct_per_rebalance) if pct_per_rebalance else 0
    return median_pct, pct_per_rebalance


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

    # ─── MODE 3 REFORMULÉ — voir PREDECLARATION_BACKTEST_MODE3.md ─────────
    # Verdicts pré-déclarés AVANT exécution (commit 2026-06-19) :
    #   A  : edge CAGR + edge Sharpe       → scoring robuste, Mode 1
    #   B  : pas d'edge CAGR + edge Sharpe → scoring défensif confirmé, Mode 1 lu en protection
    #   C  : pas d'edge ni l'un ni l'autre → vérifier homogénéité univers avant condamner scoring
    #   D-bis : edge INVERSÉ (buffett < IC90_low) → urgence, scoring anti-sélectionne
    print(f"\n{'='*70}")
    print(f"MODE 3 — SANITÉ REFORMULÉ : top {TOP_N} buffett vs {args.mode3_trials} random")
    print(f"  Tie-breaker : market_cap décroissant (orthogonal au scoring)")
    print(f"  Métriques juge : CAGR + Sharpe annualisé (pré-déclarés)")
    print(f"{'='*70}")

    # Stratégie scoring
    eq_curve_scored, to_scored = backtest_strategy(
        metrics, prices, select_top_by_score, score_col="buffett_score"
    )
    res_scored = compute_metrics(eq_curve_scored, to_scored, label=f"Buffett-{TOP_N}")
    print(f"\nBuffett top {TOP_N} : CAGR net = {res_scored['CAGR_net']:.2f}%, "
          f"Sharpe = {res_scored['Sharpe_ann']:.3f}, MaxDD = {res_scored['MaxDD']:.2f}%")

    # Random Monte Carlo — mêmes paramètres (top N tirage aléatoire dans pool éligible)
    random_cagrs = []
    random_sharpes = []
    for trial in range(args.mode3_trials):
        eq_curve_r, to_r = backtest_strategy(
            metrics, prices, select_random, seed=trial
        )
        res_r = compute_metrics(eq_curve_r, to_r, label=f"Random-{trial}")
        random_cagrs.append(res_r["CAGR_net"])
        random_sharpes.append(res_r["Sharpe_ann"])

    def quantiles(values):
        s = sorted(values)
        n = len(s)
        return {
            "median": s[n // 2],
            "ic90_low": s[int(0.05 * n)],
            "ic90_high": s[int(0.95 * n)],
        }

    cagr_q = quantiles(random_cagrs)
    sharpe_q = quantiles(random_sharpes)

    print(f"\nRandom CAGR  ({args.mode3_trials} tirages) : médiane = {cagr_q['median']:.2f}%, "
          f"IC90 = [{cagr_q['ic90_low']:.2f}%, {cagr_q['ic90_high']:.2f}%]")
    print(f"Random Sharpe ({args.mode3_trials} tirages) : médiane = {sharpe_q['median']:.3f}, "
          f"IC90 = [{sharpe_q['ic90_low']:.3f}, {sharpe_q['ic90_high']:.3f}]")

    # Classification edge selon pré-déclaration
    def classify(value, q):
        if value > q["ic90_high"]:
            return "edge", "AU-DESSUS IC90"
        elif value < q["ic90_low"]:
            return "inversé", "SOUS IC90 (anti-sélection)"
        else:
            return "neutre", "DANS IC90"

    cagr_status, cagr_desc = classify(res_scored["CAGR_net"], cagr_q)
    sharpe_status, sharpe_desc = classify(res_scored["Sharpe_ann"], sharpe_q)

    print(f"\nVerdict CAGR   : Buffett={res_scored['CAGR_net']:.2f}% → {cagr_desc} → '{cagr_status}'")
    print(f"Verdict Sharpe : Buffett={res_scored['Sharpe_ann']:.3f} → {sharpe_desc} → '{sharpe_status}'")

    # Mesure homogénéité univers (pré-déclarée comme garde-fou faux négatif)
    homog_median, homog_per_rebalance = measure_universe_homogeneity(metrics)
    print(f"\nHomogénéité univers (médiane % stocks score≥83) : {homog_median*100:.1f}% "
          f"(par rebalance : {[f'{p*100:.0f}%' for p in homog_per_rebalance]})")
    print(f"Seuil pré-déclaré : > {HOMOGENEITY_THRESHOLD*100:.0f}% = univers homogène (faux négatif possible)")

    # Verdict final (ordre : D-bis urgence d'abord, puis A/B/C)
    print(f"\n{'='*70}")
    if cagr_status == "inversé" or sharpe_status == "inversé":
        verdict = "D-bis"
        msg = (f"Verdict D-bis — EDGE INVERSÉ détecté ({cagr_status=}, {sharpe_status=})\n"
               f"  → Le scoring anti-sélectionne sur au moins une dimension.\n"
               f"  → STOP urgent. Diagnostic immédiat AVANT toute autre étape.\n"
               f"  → Hypothèses : (1) tri inversé, (2) métrique mal définie, (3) doctrine fausse.")
    elif cagr_status == "edge" and sharpe_status == "edge":
        verdict = "A"
        msg = (f"Verdict A — Scoring ROBUSTE sur les 2 dimensions (CAGR edge + Sharpe edge).\n"
               f"  → Passe à Mode 1 (α vs β).")
    elif cagr_status == "neutre" and sharpe_status == "edge":
        verdict = "B"
        msg = (f"Verdict B — Scoring DÉFENSIF confirmé (pas d'alpha CAGR mais edge Sharpe).\n"
               f"  → Cohérent avec doctrine : Thematique = moteur perf, Buffett = filtre défensif.\n"
               f"  → Mode 1 (α vs β) à lire comme 'lequel protège mieux', pas 'lequel rapporte plus'.")
    elif cagr_status == "neutre" and sharpe_status == "neutre":
        verdict = "C"
        if homog_median > HOMOGENEITY_THRESHOLD:
            msg = (f"Verdict C* — Pas d'edge détecté, MAIS univers homogène ({homog_median*100:.1f}% > "
                   f"{HOMOGENEITY_THRESHOLD*100:.0f}%).\n"
                   f"  → Test NON CONCLUANT : random tire mécaniquement de la qualité dans pool présélectionné.\n"
                   f"  → (D) légitime : élargir univers à 100+ stocks pour vrai contrefactuel.\n"
                   f"  → Ne PAS condamner le scoring sans cette vérification.")
        else:
            msg = (f"Verdict C — Pas d'edge, univers hétérogène ({homog_median*100:.1f}% ≤ "
                   f"{HOMOGENEITY_THRESHOLD*100:.0f}%).\n"
                   f"  → Le scoring n'a pas d'edge sur sa propre promesse.\n"
                   f"  → STOP, retour au design du scoring AVANT de raffiner.\n"
                   f"  → Pas de 4e config (engagement anti-p-hacking).")
    else:
        verdict = "?"
        msg = f"Verdict NON COUVERT par pré-déclaration : CAGR={cagr_status}, Sharpe={sharpe_status}"

    print(f"VERDICT FINAL : {verdict}")
    print(msg)
    print(f"{'='*70}")

    mode3_passed = verdict in ("A", "B")
    if not mode3_passed and not args.force_mode1:
        print(f"\n(Mode 1 non lancé — verdict {verdict}. Use --force-mode1 si debug requis.)")
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
