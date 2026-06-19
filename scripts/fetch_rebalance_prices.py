"""Fetch prix aux dates de rebalance pour le harness backtest (P0 Étape 7).

5 rebalances annuels couvrant 2021-2026 :
- 2021-04-01 : COVID résiduel
- 2022-04-01 : début bear tech
- 2023-04-01 : creux bear
- 2024-04-01 : milieu rotation
- 2025-04-01 : rotation tardive
- 2026-04-01 : récent

Fenêtre [date-10j, date] (déjà testée fiable, gère week-ends/fériés).
Rate limit 1.5s (cohérent avec fetch fundamentals).

Output : data/fundamentals_history/derived/prices_at_rebalance.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DERIVED_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "derived"
ENV_PATH = PROJECT_ROOT / ".env"

REBALANCE_DATES = [
    "2021-04-01", "2022-04-01", "2023-04-01",
    "2024-04-01", "2025-04-01", "2026-04-01",
]
TD_BASE = "https://api.twelvedata.com"
RATE_LIMIT_DELAY = 1.5
RETRY_DELAYS = [30, 60, 120]


def load_env():
    if ENV_PATH.exists():
        with ENV_PATH.open() as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return os.getenv("TWELVE_DATA_API") or os.getenv("TWELVE_DATA_API_KEY")


def fetch_price(symbol: str, date_iso: str, api_key: str, lookback_days: int = 10):
    """Récupère le prix de clôture le plus proche d'une date (gère W-E/fériés)."""
    end = date_iso
    start = (datetime.fromisoformat(date_iso) - timedelta(days=lookback_days)).date().isoformat()
    params = {"symbol": symbol, "interval": "1day", "start_date": start,
              "end_date": end, "apikey": api_key}
    url = f"{TD_BASE}/time_series?{urlencode(params)}"
    for attempt, wait_before in enumerate([0] + RETRY_DELAYS):
        if wait_before > 0:
            print(f"  ⏳ {symbol} {date_iso} retry {attempt}/{len(RETRY_DELAYS)} dans {wait_before}s...", file=sys.stderr)
            time.sleep(wait_before)
        try:
            with urlopen(url, timeout=30) as resp:
                payload = json.loads(resp.read())
        except HTTPError as e:
            if e.code == 429 and attempt < len(RETRY_DELAYS):
                continue
            print(f"  ⚠️  {symbol} {date_iso} HTTP {e.code}", file=sys.stderr)
            return None
        except (URLError, Exception) as e:
            print(f"  ⚠️  {symbol} {date_iso} error: {e}", file=sys.stderr)
            return None
        if isinstance(payload, dict) and payload.get("status") == "error":
            return None
        values = payload.get("values", [])
        if not values:
            return None
        try:
            return float(values[0].get("close"))
        except (TypeError, ValueError):
            return None
    return None


def load_active_tickers():
    """Charge la liste des tickers actifs depuis metrics_by_year.csv (exclut TSM/ITX/CS/LVMH/BMED)."""
    metrics_csv = DERIVED_DIR / "metrics_by_year.csv"
    if not metrics_csv.exists():
        print(f"ERREUR: {metrics_csv} introuvable. Lance d'abord build_derived_metrics.py.", file=sys.stderr)
        sys.exit(1)
    tickers = set()
    with metrics_csv.open() as f:
        for row in csv.DictReader(f):
            tickers.add(row["ticker"])
    return sorted(tickers)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true",
                        help="Lance les vraies calls API. Défaut : dry-run.")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Saute les (ticker, date) déjà dans prices_at_rebalance.csv.")
    args = parser.parse_args()

    api_key = load_env()
    if not api_key and args.live:
        print("ERREUR: TWELVE_DATA_API non défini", file=sys.stderr)
        return 1

    tickers = load_active_tickers()
    n_calls = len(tickers) * len(REBALANCE_DATES)
    print(f"Mode : {'LIVE' if args.live else 'DRY-RUN'}")
    print(f"Tickers actifs : {len(tickers)}")
    print(f"Rebalances : {REBALANCE_DATES}")
    print(f"Calls estimés : {n_calls}")
    print(f"Durée estimée @ {RATE_LIMIT_DELAY}s/call : ~{n_calls * RATE_LIMIT_DELAY:.0f}s "
          f"({n_calls * RATE_LIMIT_DELAY / 60:.1f} min)")

    if not args.live:
        print(f"\n→ DRY-RUN : relance avec --live pour exécuter.")
        return 0

    # Charger l'existant si --skip-existing
    out_csv = DERIVED_DIR / "prices_at_rebalance.csv"
    existing = {}
    if args.skip_existing and out_csv.exists():
        with out_csv.open() as f:
            for r in csv.DictReader(f):
                existing[(r["ticker"], r["rebalance_date"])] = float(r["close"])
        print(f"\n--skip-existing : {len(existing)} prix (ticker, date) déjà en cache")

    rows = [{"ticker": tk, "rebalance_date": d, "close": p}
            for (tk, d), p in existing.items()]
    missing = []
    for i, ticker in enumerate(tickers, 1):
        # Skip si tous les rebalances déjà OK
        if args.skip_existing and all((ticker, d) in existing for d in REBALANCE_DATES):
            continue
        print(f"\n[{i}/{len(tickers)}] {ticker}")
        for date in REBALANCE_DATES:
            if (ticker, date) in existing:
                continue
            time.sleep(RATE_LIMIT_DELAY)
            price = fetch_price(ticker, date, api_key)
            if price is None:
                missing.append((ticker, date))
                print(f"  ❌ {date}: aucun prix")
            else:
                rows.append({"ticker": ticker, "rebalance_date": date, "close": price})
                print(f"  ✓ {date}: ${price:.2f}")

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w") as f:
        writer = csv.DictWriter(f, fieldnames=["ticker", "rebalance_date", "close"])
        writer.writeheader()
        for r in sorted(rows, key=lambda x: (x["ticker"], x["rebalance_date"])):
            writer.writerow(r)

    print(f"\n{'='*60}")
    print(f"✓ Écrit : {out_csv} ({len(rows)} lignes)")
    if missing:
        print(f"⚠️  Prix manquants : {len(missing)} (ticker, date) — voir log stderr")
    print(f"{'='*60}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
