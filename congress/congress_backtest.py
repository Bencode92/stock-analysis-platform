"""
Etage 4 : backtest de la strategie Smart Politician (point-in-time, anti look-ahead).

A chaque date de rebalancing (mensuel) :
  1. on classe les performers avec les SEULES infos connues a cette date
     (trades dont l'horizon 1 an etait deja clos) -> pas de look-ahead sur la selection ;
  2. on construit le portefeuille = leurs achats declares dans la fenetre, conviction-pondere ;
  3. on detient jusqu'au rebalancing suivant, rendement via cours reels (Twelve Data) ;
  4. on chaine -> courbe d'equite, comparee a SPY / QQQ / NANC.

Sorties : congress/data/congress_backtest.json (metriques + courbes).

Le juge de paix : la strategie bat-elle QQQ net de friction ?

Usage:
    export TWELVE_DATA_API="..."
    python congress/congress_backtest.py
Env: BT_START (2019-01-01), TOP_K, WINDOW_DAYS, MAX_HOLDINGS, MAX_WEIGHT,
     SCORE_HORIZON_DAYS (365), MIN_COMPLETED (10), COST_BPS (10)
"""
from __future__ import annotations

import json
import os
import sys
from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median, pstdev

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from prices import make_client  # noqa: E402

DATA = HERE / "data"
TRADES_PATH = DATA / "congress_trades.json"
OUT_PATH = DATA / "congress_backtest.json"

BENCHES = {"SPY": "SPY", "QQQ": "QQQ", "NANC": "NANC"}

P = {
    "start": os.environ.get("BT_START", "2019-01-01"),
    "top_k": int(os.environ.get("TOP_K", "15")),
    "window_days": int(os.environ.get("WINDOW_DAYS", "180")),
    "max_holdings": int(os.environ.get("MAX_HOLDINGS", "30")),
    "max_weight": float(os.environ.get("MAX_WEIGHT", "0.15")),
    "score_horizon_days": int(os.environ.get("SCORE_HORIZON_DAYS", "365")),
    "min_completed": int(os.environ.get("MIN_COMPLETED", "10")),
    "cost_bps": float(os.environ.get("COST_BPS", "10")),  # friction par rebalancing (aller-retour)
}


def _log(m): print(m, flush=True)


def add_days(d: str, n: int) -> str:
    return (datetime.strptime(d, "%Y-%m-%d") + timedelta(days=n)).strftime("%Y-%m-%d")


def month_starts(start: str, end: str) -> list[str]:
    out, y, m = [], int(start[:4]), int(start[5:7])
    while True:
        d = f"{y:04d}-{m:02d}-01"
        if d > end:
            break
        out.append(d)
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


class Series:
    """Cours journaliers tries pour lookup rapide."""
    def __init__(self, price_map: dict[str, float]):
        items = sorted(price_map.items())
        self.dates = [d for d, _ in items]
        self.closes = [c for _, c in items]

    def on_or_after(self, d: str):
        i = bisect_left(self.dates, d)
        return (self.dates[i], self.closes[i]) if i < len(self.dates) else (None, None)


def _pid(t):
    b = t.get("bioguide_id")
    return b if isinstance(b, str) and b.strip() else t.get("representative")


def build_portfolio_at(buys, as_of: str, perf_scores: dict, params: dict) -> dict:
    """Portefeuille conviction-pondere a la date as_of, a partir des performers fournis."""
    cutoff = add_days(as_of, -params["window_days"])
    raw = defaultdict(float)
    for t in buys:
        rd = t["report_date"]
        if cutoff < rd <= as_of and _pid(t) in perf_scores:
            raw[t["ticker"]] += perf_scores[_pid(t)]   # conviction = score du performer
    if not raw:
        return {}
    ranked = sorted(raw.items(), key=lambda kv: kv[1], reverse=True)[:params["max_holdings"]]
    total = sum(v for _, v in ranked)
    w = {k: v / total for k, v in ranked}
    cap = params["max_weight"]
    for _ in range(100):
        over = {k: v for k, v in w.items() if v > cap + 1e-9}
        if not over:
            break
        excess = sum(v - cap for v in over.values())
        for k in over:
            w[k] = cap
        free = {k: v for k, v in w.items() if v < cap - 1e-9}
        fs = sum(free.values())
        if fs <= 0:
            break
        for k in free:
            w[k] += excess * (w[k] / fs)
    return w


def point_in_time_performers(by_pid_completed, as_of: str, params: dict) -> dict:
    """Score des performers avec les seuls trades dont l'horizon est clos avant as_of."""
    scores = {}
    for pid, rows in by_pid_completed.items():
        # rows = liste (completion_date, year, excess) triee par completion_date
        done = [(yr, ex) for (cd, yr, ex) in rows if cd <= as_of and ex is not None]
        if len(done) < params["min_completed"]:
            continue
        per_year = defaultdict(list)
        for yr, ex in done:
            per_year[yr].append(ex)
        annual = [sum(v) / len(v) for v in per_year.values()]
        med = median(annual)
        if med > 0:                       # performance pure : bat le SPY
            scores[pid] = med
    if not scores:
        return {}
    top = dict(sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:params["top_k"]])
    return top


def metrics(equity: list[float], monthly_ret: list[float], n_years: float) -> dict:
    if len(equity) < 2:
        return {}
    total = equity[-1] / equity[0] - 1
    cagr = (equity[-1] / equity[0]) ** (1 / n_years) - 1 if n_years > 0 else 0.0
    vol = pstdev(monthly_ret) * (12 ** 0.5) if len(monthly_ret) > 1 else 0.0
    sharpe = (cagr / vol) if vol > 0 else 0.0
    peak, mdd = equity[0], 0.0
    for v in equity:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    return {"total_return": round(total * 100, 1), "cagr": round(cagr * 100, 1),
            "vol": round(vol * 100, 1), "sharpe": round(sharpe, 2),
            "max_drawdown": round(mdd * 100, 1)}


def main() -> None:
    payload = json.loads(TRADES_PATH.read_text(encoding="utf-8"))
    buys = [t for t in payload["trades"]
            if t.get("transaction") == "buy" and t.get("ticker") and t.get("report_date")]
    _log(f"{len(buys)} achats charges.")

    # Pre-calcul : par politicien, ses trades 'completes' (completion = report_date + horizon).
    by_pid_completed = defaultdict(list)
    h = params_h = P["score_horizon_days"]
    for t in buys:
        rd = t["report_date"]
        cd = add_days(rd, h)
        yr = int(rd[:4])
        by_pid_completed[_pid(t)].append((cd, yr, t.get("excess_return")))
    for pid in by_pid_completed:
        by_pid_completed[pid].sort()

    client = make_client()
    _log("Benchmarks...")
    bench_series = {}
    for name, sym in BENCHES.items():
        pm = client.get_daily(sym)
        if pm:
            bench_series[name] = Series(pm)
            _log(f"  {name} OK ({len(pm)} points)")
        else:
            _log(f"  {name} indisponible")

    end = max(t["report_date"] for t in buys)
    rebals = month_starts(P["start"], end)
    _log(f"{len(rebals)} rebalancings {P['start']} -> {end}")

    price_cache: dict[str, Series | None] = {}

    def series_for(ticker: str) -> Series | None:
        if ticker not in price_cache:
            pm = client.get_daily(ticker, allow_fetch=True)
            price_cache[ticker] = Series(pm) if pm else None
        return price_cache[ticker]

    # Boucle de backtest.
    eq = {"strategy": [1.0]}
    for name in bench_series:
        eq[name] = [1.0]
    rets = {"strategy": [], **{n: [] for n in bench_series}}
    dates_kept = [rebals[0]]
    n_hold_log = []

    for i in range(len(rebals) - 1):
        t0, t1 = rebals[i], rebals[i + 1]
        perfs = point_in_time_performers(by_pid_completed, t0, P)
        w = build_portfolio_at(buys, t0, perfs, P) if perfs else {}
        n_hold_log.append(len(w))

        # Rendement strategie sur [t0, t1].
        port_ret, wsum = 0.0, 0.0
        for tk, wt in w.items():
            s = series_for(tk)
            if not s:
                continue
            _, c0 = s.on_or_after(t0)
            _, c1 = s.on_or_after(t1)
            if c0 and c1 and c0 > 0:
                port_ret += wt * (c1 / c0 - 1)
                wsum += wt
        port_ret = (port_ret / wsum) if wsum > 0 else 0.0
        if w:  # friction au rebalancing
            port_ret -= P["cost_bps"] / 10000.0
        rets["strategy"].append(port_ret)
        eq["strategy"].append(eq["strategy"][-1] * (1 + port_ret))

        # Benchmarks sur [t0, t1].
        for name, s in bench_series.items():
            _, c0 = s.on_or_after(t0)
            _, c1 = s.on_or_after(t1)
            r = (c1 / c0 - 1) if (c0 and c1 and c0 > 0) else 0.0
            rets[name].append(r)
            eq[name].append(eq[name][-1] * (1 + r))
        dates_kept.append(t1)

    n_years = (datetime.strptime(dates_kept[-1], "%Y-%m-%d")
               - datetime.strptime(dates_kept[0], "%Y-%m-%d")).days / 365.25

    met = {"strategy": metrics(eq["strategy"], rets["strategy"], n_years)}
    for name in bench_series:
        met[name] = metrics(eq[name], rets[name], n_years)
    met["strategy"]["alpha_vs_qqq"] = (
        round(met["strategy"]["cagr"] - met.get("QQQ", {}).get("cagr", 0), 1)
        if "QQQ" in met else None)

    curve = [{"date": d, **{k: round(eq[k][j], 4) for k in eq}} for j, d in enumerate(dates_kept)]
    out = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "params": P,
            "n_rebalances": len(rebals) - 1,
            "avg_holdings": round(sum(n_hold_log) / max(len(n_hold_log), 1), 1),
            "period": [dates_kept[0], dates_kept[-1]],
            "note": "Point-in-time : selection sur trades a horizon clos, entree = report_date. "
                    "Friction COST_BPS par rebalancing. Couverture limitee par les prix dispo.",
        },
        "metrics": met,
        "equity": curve,
    }
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    _log("\n=== RESULTATS ===")
    hdr = f"{'':12}{'CAGR':>8}{'Sharpe':>8}{'MaxDD':>8}{'Total':>9}"
    _log(hdr)
    for name in ["strategy"] + list(bench_series):
        m = met[name]
        _log(f"{name:12}{m.get('cagr',0):>7}%{m.get('sharpe',0):>8}{m.get('max_drawdown',0):>7}%{m.get('total_return',0):>8}%")
    _log(f"\nAlpha strategie vs QQQ : {met['strategy'].get('alpha_vs_qqq')} pts de CAGR")
    _log(f"Periode {out['meta']['period']} | {out['meta']['n_rebalances']} rebalancings | "
         f"~{out['meta']['avg_holdings']} lignes/moy -> {OUT_PATH}")


if __name__ == "__main__":
    main()
