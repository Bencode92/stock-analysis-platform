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
LIVE_PATH = DATA / "congress_live.json"   # trades recents avec montants (taille des trades)
OUT_PATH = DATA / "congress_portfolio.json"


def _amount_mid(t):
    lo, hi = t.get("amount_min"), t.get("amount_max")
    if lo is None:
        return None
    return (lo + hi) / 2 if hi is not None else lo


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
    n_eligible_raw = len(eligibles)

    # Plancher de QUALITE : on ne suit pas les actifs mediocres (ex. Khanna, mediane +0.1%).
    min_median = float(params.get("min_median", 0) or 0)
    min_win = float(params.get("min_win_rate", 0) or 0)

    def _quality(r):
        m = r.get("median_annual_excess_return")
        if m is None or m < min_median:
            return False
        if min_win > 0 and (r.get("win_rate") is None or r["win_rate"] < min_win):
            return False
        return True
    eligibles = [r for r in eligibles if _quality(r)]

    # Whitelist optionnelle : ne suivre que ces noms (sous-chaine, insensible a la casse).
    wl = [w.strip().lower() for w in params.get("whitelist", []) if w.strip()]
    if wl:
        eligibles = [r for r in eligibles
                     if any(w in r["representative"].lower() or w == str(r["pid"]).lower() for w in wl)]

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

    # 2bis. VENTES recentes des performers retenus = signal de sortie.
    sold_recent = defaultdict(dict)  # ticker -> pid -> derniere date de vente
    for t in trades:
        if (t.get("transaction") == "sell" and t.get("ticker") and t.get("report_date")
                and t["report_date"] >= cutoff):
            pid = _pid(t)
            if pid in top_pids and t["report_date"] > sold_recent[t["ticker"]].get(pid, ""):
                sold_recent[t["ticker"]][pid] = t["report_date"]

    # 3. Conviction par titre, PONDEREE PAR LA TAILLE des trades (gros trades = signal fort).
    #    contrib(performer, titre) = score_regularite x $ total investi dans la fenetre.
    size_mode = params.get("size_mode", "amount")          # "amount" | "conviction"
    min_amount = float(params.get("min_amount", 0) or 0)   # ignore les petits trades CONNUS
    neutral = min_amount if min_amount > 0 else 50000.0    # montant si inconnu (live partiel)
    amount_lookup = params.get("amount_lookup", {})

    pos = defaultdict(lambda: defaultdict(float))  # ticker -> pid -> $ total (ou 1 en mode conviction)
    last_buy = defaultdict(dict)                    # ticker -> pid -> dernier report_date
    for t in recent:
        pid, tk, d = _pid(t), t["ticker"], t["report_date"]
        if size_mode == "amount":
            mid = amount_lookup.get((pid, tk, d))
            if mid is not None and mid < min_amount:
                continue                           # gros trades only : on jette les petits montants connus
            pos[tk][pid] += mid if mid is not None else neutral
        else:
            pos[tk][pid] = 1.0
        if d > last_buy[tk].get(pid, ""):
            last_buy[tk][pid] = d

    # Filtre VENTES : un performer qui a vendu un titre APRES l'avoir acheté en sort -> exclu.
    dropped_by_sell = 0
    for tk in list(pos):
        for pid in list(pos[tk]):
            sd = sold_recent.get(tk, {}).get(pid)
            if sd and sd >= last_buy[tk][pid]:
                del pos[tk][pid]
                dropped_by_sell += 1

    raw = defaultdict(float)
    buyers = defaultdict(list)
    for tk, by_pid in pos.items():
        for pid, amt in by_pid.items():
            raw[tk] += score_by_pid[pid] * amt
            buyers[tk].append({
                "representative": name_by_pid[pid],
                "regularity_score": round(score_by_pid[pid], 2),
                "amount_usd": round(amt) if size_mode == "amount" else None,
                "report_date": last_buy[tk][pid],
            })

    # Anti-dilution : ne garder que les N titres a plus forte conviction (les
    # hyperactifs type Khanna inondent sinon le portefeuille de mono-acheteurs).
    n_candidates = len(raw)
    ranked = sorted(raw.items(), key=lambda kv: kv[1], reverse=True)[:params["max_holdings"]]
    weights = _cap_and_normalize(dict(ranked), params["max_weight"])

    holdings = []
    for tk, w in sorted(weights.items(), key=lambda kv: kv[1], reverse=True):
        bl = sorted(buyers[tk], key=lambda b: b["regularity_score"], reverse=True)
        total_usd = sum(b["amount_usd"] or 0 for b in bl) if size_mode == "amount" else None
        usd_txt = f", ~{round(total_usd/1000)}k$ investis" if total_usd else ""
        holdings.append({
            "ticker": tk,
            "weight": round(w, 4),
            "n_buyers": len(bl),
            "total_amount_usd": total_usd,
            "buyers": bl,
            "rationale": (f"Achete par {len(bl)} performer(s) du Top {params['top_k']} "
                          f"sur {params['window_days']}j{usd_txt} (ex. {bl[0]['representative']}, "
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
                "max_holdings": params["max_holdings"],
                "size_mode": params.get("size_mode", "amount"),
                "min_amount": params.get("min_amount", 0),
                "min_median": min_median,
                "min_win_rate": min_win,
                "whitelist": wl,
                "side_filter": "buy",
            },
            "n_holdings": len(holdings),
            "n_candidates": n_candidates,
            "positions_dropped_by_sell": dropped_by_sell,
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
    p.add_argument("--max-holdings", type=int, default=int(os.environ.get("MAX_HOLDINGS", "30")))
    p.add_argument("--weighting", default=os.environ.get("WEIGHTING", "conviction"),
                   choices=["conviction", "equal"])
    p.add_argument("--size-mode", default=os.environ.get("SIZE_MODE", "amount"),
                   choices=["amount", "conviction"])
    p.add_argument("--min-amount", type=float, default=float(os.environ.get("MIN_AMOUNT", "50000")))
    p.add_argument("--min-median", type=float, default=float(os.environ.get("MIN_MEDIAN", "5")))
    p.add_argument("--min-win-rate", type=float, default=float(os.environ.get("MIN_WIN_RATE", "0")))
    p.add_argument("--whitelist", default=os.environ.get("WHITELIST", ""),
                   help="Noms a suivre, separes par des virgules (vide = tous).")
    args = p.parse_args()

    leaderboard = json.loads(Path(args.leaderboard).read_text(encoding="utf-8"))
    trades = json.loads(Path(args.trades).read_text(encoding="utf-8"))["trades"]

    # Montants depuis le /live/ (le /bulk/ n'en a pas) -> ponderation par taille de trade.
    amount_lookup = {}
    if LIVE_PATH.exists():
        for t in json.loads(LIVE_PATH.read_text(encoding="utf-8")).get("trades", []):
            mid = _amount_mid(t)
            if mid is not None:
                b = t.get("bioguide_id")
                pid = b if isinstance(b, str) and b.strip() else t.get("representative")
                amount_lookup[(pid, t.get("ticker"), t.get("report_date"))] = mid
    print(f"Montants live disponibles : {len(amount_lookup)} trades")

    params = {"top_k": args.top_k, "window_days": args.window,
              "max_weight": args.max_weight, "max_holdings": args.max_holdings,
              "weighting": args.weighting, "size_mode": args.size_mode,
              "min_amount": args.min_amount, "amount_lookup": amount_lookup,
              "min_median": args.min_median, "min_win_rate": args.min_win_rate,
              "whitelist": [w for w in args.whitelist.split(",") if w.strip()]}

    portfolio = build_portfolio(leaderboard, trades, params)
    Path(args.out).write_text(json.dumps(portfolio, ensure_ascii=False, indent=2), encoding="utf-8")

    n = portfolio["meta"].get("n_holdings", 0)
    print(f"OK: portefeuille {n} lignes (Top {args.top_k}, fenetre {args.window}j) -> {args.out}")
    for h in portfolio["holdings"][:15]:
        print(f"  {h['ticker']:<6} {h['weight']*100:5.1f}%  ({h['n_buyers']} acheteur(s))")


if __name__ == "__main__":
    main()
