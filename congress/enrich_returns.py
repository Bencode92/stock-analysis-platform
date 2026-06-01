"""
Etage 1bis : enrichir les trades avec un ExcessReturn calcule maison (Twelve Data).

Le bulk Quiver ne fournit pas de rendement. Pour chaque ACHAT, on calcule le
rendement du titre sur un horizon (defaut 252 jours de bourse ~ 1 an) a partir de
la date de DECLARATION (report_date, anti look-ahead), moins le rendement du SPY
sur la meme fenetre -> excess_return (%). On reinjecte excess_return / price_change
/ spy_change dans congress_trades.json ; politician_rank.py s'en sert ensuite.

Couts maitrises : 1 appel Twelve Data par ticker distinct (cache persistant), ordre
de priorite = tickers les plus tradés d'abord, plafond d'appels neufs par run.

Usage:
    export TWELVE_DATA_API="..."
    python congress/enrich_returns.py
Env optionnels: RETURN_HORIZON_DAYS (252), MAX_NEW_TICKERS (800), TWELVE_DATA_RATE (8)
"""
from __future__ import annotations

import json
import os
import sys
from bisect import bisect_left
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # pour importer le module frere `prices`
from prices import RateLimit, make_client  # noqa: E402

TRADES_PATH = Path(os.environ.get("TRADES_FILE", HERE / "data" / "congress_trades.json"))
BENCHMARK = "SPY"
HORIZON = int(os.environ.get("RETURN_HORIZON_DAYS", "252"))
MAX_NEW_TICKERS = int(os.environ.get("MAX_NEW_TICKERS", "800"))


def _sorted_series(price_map: dict[str, float]) -> tuple[list[str], list[float]]:
    items = sorted(price_map.items())  # dates ISO -> tri chrono lexical
    return [d for d, _ in items], [c for _, c in items]


def _forward(dates: list[str], closes: list[float], start: str, horizon: int):
    """(entry_date, entry_close, exit_date, exit_close) ou None si donnees insuffisantes."""
    i = bisect_left(dates, start)
    if i >= len(dates):
        return None
    j = i + horizon
    if j >= len(dates):
        return None  # trade trop recent : pas encore d'horizon complet
    return dates[i], closes[i], dates[j], closes[j]


def _close_on_or_after(dates: list[str], closes: list[float], d: str):
    i = bisect_left(dates, d)
    return closes[i] if i < len(dates) else None


def main() -> None:
    if not TRADES_PATH.exists():
        print(f"{TRADES_PATH} absent : rien a enrichir.")
        return
    payload = json.loads(TRADES_PATH.read_text(encoding="utf-8"))
    trades = payload["trades"]
    buys = [t for t in trades if t.get("transaction") == "buy"
            and t.get("ticker") and t.get("report_date")]
    if not buys:
        print(f"{TRADES_PATH.name} : aucun achat a enrichir.")
        return

    client = make_client()

    # SPY d'abord (benchmark obligatoire).
    spy_map = client.get_daily(BENCHMARK)
    if not spy_map:
        raise SystemExit("Impossible de recuperer le benchmark SPY -> abandon.")
    spy_dates, spy_closes = _sorted_series(spy_map)

    # Tickers par frequence d'achat decroissante (impact maximal d'abord).
    freq = Counter(t["ticker"] for t in buys)
    tickers = [tk for tk, _ in freq.most_common()]

    cache: dict[str, tuple[list[str], list[float]] | None] = {}
    rate_limited = False

    for tk in tickers:
        if tk in cache:
            continue
        allow = (client.calls < MAX_NEW_TICKERS) and not rate_limited
        try:
            pm = client.get_daily(tk, allow_fetch=allow)
        except RateLimit as e:
            print(f"  Rate-limit Twelve Data atteint ({e}). On s'arrete aux tickers en cache.")
            rate_limited = True
            pm = None
        # pm None = pas (encore) dispo ; {} = symbole sans donnees ; sinon series prix
        cache[tk] = _sorted_series(pm) if pm else None

    # Calcul des rendements.
    enriched = 0
    for t in buys:
        ser = cache.get(t["ticker"])
        if not ser:
            continue
        dates, closes = ser
        fw = _forward(dates, closes, t["report_date"], HORIZON)
        if not fw:
            continue
        entry_d, entry_c, exit_d, exit_c = fw
        if entry_c <= 0:
            continue
        stock_ret = exit_c / entry_c - 1.0
        spy_entry = _close_on_or_after(spy_dates, spy_closes, entry_d)
        spy_exit = _close_on_or_after(spy_dates, spy_closes, exit_d)
        if not spy_entry or not spy_exit or spy_entry <= 0:
            continue
        spy_ret = spy_exit / spy_entry - 1.0
        t["price_change"] = round(stock_ret * 100, 2)
        t["spy_change"] = round(spy_ret * 100, 2)
        t["excess_return"] = round((stock_ret - spy_ret) * 100, 2)
        enriched += 1

    payload["meta"]["returns_enriched"] = enriched
    payload["meta"]["returns_horizon_days"] = HORIZON
    payload["meta"]["prices_api_calls"] = client.calls
    TRADES_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    n_buys = len(buys)
    n_tickers = len(tickers)
    cached_ok = sum(1 for v in cache.values() if v)
    print(f"Enrichi {enriched}/{n_buys} achats "
          f"({100*enriched//max(n_buys,1)}%) | "
          f"tickers prix dispo {cached_ok}/{n_tickers} | "
          f"appels API ce run: {client.calls}")
    if rate_limited or cached_ok < n_tickers:
        print("Couverture partielle : relance le workflow (le cache prix se complete "
              "a chaque run jusqu'a couverture totale).")


if __name__ == "__main__":
    main()
