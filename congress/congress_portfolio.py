"""
Etage 3 : portefeuille Smart Politician (conviction-weighted, performers only).

A partir du leaderboard "performance pure" (etage 2), on prend le Top K politiciens
ELIGIBLES (qui battent reellement le SPY), on agrege leurs ACHATS RECENTS (fenetre
glissante, pas 2012 -> evite le biais survivant), et on pondere chaque titre par la
CONVICTION = somme des scores de regularite des performers qui l'ont achete.

Garde-fous :
- fenetre recente (defaut 180j) : refletent le positionnement actuel, pas l'historique mort ;
- plafond par titre (defaut 15%) : anti-concentration ;
- justification data-driven (qui l'a achete + leur surperf), PAS la notoriete du ticker.

Le tilt fondamental/macro (consigne projet) est un overlay separe (etage 3bis) a brancher
sur les donnees Twelve Data / modules sectoriels existants.

Usage:
    python congress/congress_portfolio.py --top-k 15 --window 180
Env optionnels: TOP_K, WINDOW_DAYS, MAX_WEIGHT, WEIGHTING (conviction|equal)
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
LEADERBOARD_PATH = DATA / "politician_leaderboard.json"
TRADES_PATH = DATA / "congress_trades.json"
OUT_PATH = DATA / "congress_portfolio.json"


def _cap_and_normalize(weights: dict[str, float], cap: float) -> dict[str, float]:
    """Normalise a somme 1 puis applique un plafond par ligne (water-filling)."""
    total = sum(weights.values())
    if total <= 0:
        return {}
    w = {k: v / total for k, v in weights.items()}
    if cap >= 1.0:
        return w
    for _ in range(100):
        over = {k: v for k, v in w.items() if v > cap + 1e-9}
        if not over:
            break
        excess = sum(v - cap for v in over.values())
        for k in over:
            w[k] = cap
        free = {k: v for k, v in w.items() if v < cap - 1e-9}
        free_sum = sum(free.values())
        if free_sum <= 0:
            break
        for k in free:
            w[k] += excess * (w[k] / free_sum)
    return w


def build_portfolio(leaderboard: dict, trades: list[dict], params: dict) -> dict:
    def _pid(t):
        b = t.get("bioguide_id")
        return b if isinstance(b, str) and b.strip() else t.get("representative")

    # Eligibles (Congres) tries par score.
    eligibles = [r for r in leaderboard["ranking"]
                 if r.get("eligible") and r.get("branch") == "Congress"]
    eligibles = sorted(eligibles, key=lambda r: r["regularity_score"], reverse=True)

    # 1. Fenetre recente : cutoff = derniere declaration du DATASET - WINDOW jours.
    all_buys = [t for t in trades
                if t.get("transaction") == "buy" and t.get("ticker") and t.get("report_date")]
    if not all_buys:
        return {"meta": {"error": "aucun achat dans le dataset"}, "holdings": []}
    last = max(t["report_date"] for t in all_buys)
    cutoff = (datetime.strptime(last, "%Y-%m-%d")
              - timedelta(days=params["window_days"])).strftime("%Y-%m-%d")

    # 2. Achats recents par politicien -> ne retenir que les performers ACTIFS.
    #    (un performer historique retraité ne trade plus -> non investable)
    recent_by_pid = defaultdict(list)
    for t in all_buys:
        if t["report_date"] >= cutoff:
            recent_by_pid[_pid(t)].append(t)

    top_by_score = eligibles[:params["top_k"]]
    inactive_top = [r["representative"] for r in top_by_score if r["pid"] not in recent_by_pid]

    active = [r for r in eligibles if r["pid"] in recent_by_pid]
    top = active[:params["top_k"]]
    if not top:
        return {"meta": {"error": "aucun performer actif sur la fenetre"}, "holdings": []}
    score_by_pid = {r["pid"]: r["regularity_score"] for r in top}
    name_by_pid = {r["pid"]: r["representative"] for r in top}
    top_pids = set(score_by_pid)

    recent = [t for pid in top_pids for t in recent_by_pid[pid]]

    # 3. Conviction par titre = somme des scores des performers acheteurs (1 fois/pid).
    raw = defaultdict(float)
    buyers = defaultdict(dict)  # ticker -> pid -> dernier achat
    for t in recent:
        pid = _pid(t)
        tk = t["ticker"]
        if pid not in buyers[tk]:
            contrib = score_by_pid[pid] if params["weighting"] == "conviction" else 1.0
            raw[tk] += contrib
        prev = buyers[tk].get(pid)
        if not prev or t["report_date"] > prev["report_date"]:
            buyers[tk][pid] = {
                "representative": name_by_pid[pid],
                "regularity_score": round(score_by_pid[pid], 2),
                "report_date": t["report_date"],
            }

    weights = _cap_and_normalize(dict(raw), params["max_weight"])

    holdings = []
    for tk, w in sorted(weights.items(), key=lambda kv: kv[1], reverse=True):
        bl = sorted(buyers[tk].values(), key=lambda b: b["regularity_score"], reverse=True)
        holdings.append({
            "ticker": tk,
            "weight": round(w, 4),
            "n_buyers": len(bl),
            "buyers": bl,
            "rationale": (f"Achete par {len(bl)} performer(s) du Top {params['top_k']} "
                          f"sur {params['window_days']}j (ex. {bl[0]['representative']}, "
                          f"score {bl[0]['regularity_score']})."),
            "eligibility": {"pea": False, "cto": True},  # actions US -> CTO (a affiner)
        })

    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "as_of": last,
            "params": {
                "top_k_politicians": params["top_k"],
                "lookback_days": params["window_days"],
                "weighting": params["weighting"],
                "max_weight": params["max_weight"],
                "side_filter": "buy",
            },
            "n_holdings": len(holdings),
            "n_eligible": len(eligibles),
            "n_active": len(active),
            "n_selected": len(top),
            "top_performers": [{"representative": name_by_pid[p], "score": round(s, 2)}
                               for p, s in sorted(score_by_pid.items(), key=lambda kv: kv[1], reverse=True)],
            "inactive_top_performers": inactive_top,
            "note": ("Selection = top performers ACTIFS sur la fenetre (les retraités, "
                     "alpha passé mais 0 trade recent, sont ecartes). PEA/CTO indicatif "
                     "(actions US = CTO). Tilt fondamental/macro = overlay etage 3bis."),
        },
        "holdings": holdings,
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Build conviction-weighted politician portfolio.")
    p.add_argument("--leaderboard", default=str(LEADERBOARD_PATH))
    p.add_argument("--trades", default=str(TRADES_PATH))
    p.add_argument("--out", default=str(OUT_PATH))
    p.add_argument("--top-k", type=int, default=int(os.environ.get("TOP_K", "15")))
    p.add_argument("--window", type=int, default=int(os.environ.get("WINDOW_DAYS", "180")))
    p.add_argument("--max-weight", type=float, default=float(os.environ.get("MAX_WEIGHT", "0.15")))
    p.add_argument("--weighting", default=os.environ.get("WEIGHTING", "conviction"),
                   choices=["conviction", "equal"])
    args = p.parse_args()

    leaderboard = json.loads(Path(args.leaderboard).read_text(encoding="utf-8"))
    trades = json.loads(Path(args.trades).read_text(encoding="utf-8"))["trades"]
    params = {"top_k": args.top_k, "window_days": args.window,
              "max_weight": args.max_weight, "weighting": args.weighting}

    portfolio = build_portfolio(leaderboard, trades, params)
    Path(args.out).write_text(json.dumps(portfolio, ensure_ascii=False, indent=2), encoding="utf-8")

    n = portfolio["meta"].get("n_holdings", 0)
    print(f"OK: portefeuille {n} lignes (Top {args.top_k}, fenetre {args.window}j) -> {args.out}")
    for h in portfolio["holdings"][:15]:
        print(f"  {h['ticker']:<6} {h['weight']*100:5.1f}%  ({h['n_buyers']} acheteur(s))")


if __name__ == "__main__":
    main()
