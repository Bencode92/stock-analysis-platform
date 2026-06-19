"""Fetch secteurs TD pour mesure composition sectorielle (Fabre exigence #2).

Cible : 239 tickers actifs de l'univers labo élargi → /profile TD pour sector + industry.

Output : data/fundamentals_history/derived/sectors.json {ticker: {sector, industry}}

Permet de vérifier que le tirage random S&P 500 ne sur-représente pas un secteur
de > 10 pts vs l'indice (sinon biais à déclarer dans le verdict).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DERIVED_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "derived"
ENV_PATH = PROJECT_ROOT / ".env"

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


def fetch_profile(symbol: str, api_key: str) -> dict | None:
    params = {"symbol": symbol, "apikey": api_key}
    url = f"{TD_BASE}/profile?{urlencode(params)}"
    for attempt, wait_before in enumerate([0] + RETRY_DELAYS):
        if wait_before > 0:
            print(f"  ⏳ {symbol} retry {attempt}/{len(RETRY_DELAYS)} dans {wait_before}s...", file=sys.stderr)
            time.sleep(wait_before)
        try:
            with urlopen(url, timeout=30) as resp:
                payload = json.loads(resp.read())
        except HTTPError as e:
            if e.code == 429 and attempt < len(RETRY_DELAYS):
                continue
            print(f"  ⚠️  {symbol} HTTP {e.code}", file=sys.stderr)
            return None
        except (URLError, Exception) as e:
            print(f"  ⚠️  {symbol} error: {e}", file=sys.stderr)
            return None
        if isinstance(payload, dict) and payload.get("status") == "error":
            return None
        return payload
    return None


def load_active_tickers():
    metrics_csv = DERIVED_DIR / "metrics_by_year.csv"
    if not metrics_csv.exists():
        print(f"ERREUR: {metrics_csv} introuvable.", file=sys.stderr)
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
    args = parser.parse_args()

    api_key = load_env()
    if not api_key and args.live:
        print("ERREUR: TWELVE_DATA_API non défini", file=sys.stderr)
        return 1

    tickers = load_active_tickers()
    out_path = DERIVED_DIR / "sectors.json"
    existing = {}
    if out_path.exists():
        with out_path.open() as f:
            existing = json.load(f)

    to_fetch = [t for t in tickers if t not in existing]
    print(f"Mode : {'LIVE' if args.live else 'DRY-RUN'}")
    print(f"Tickers actifs : {len(tickers)}")
    print(f"Déjà fetchés : {len(existing)}")
    print(f"À fetcher : {len(to_fetch)}")
    print(f"Durée estimée : ~{len(to_fetch) * RATE_LIMIT_DELAY:.0f}s "
          f"({len(to_fetch) * RATE_LIMIT_DELAY / 60:.1f} min)")

    if not args.live:
        return 0

    sectors = dict(existing)
    for i, ticker in enumerate(to_fetch, 1):
        time.sleep(RATE_LIMIT_DELAY)
        payload = fetch_profile(ticker, api_key)
        if payload:
            sectors[ticker] = {
                "sector": payload.get("sector"),
                "industry": payload.get("industry"),
                "country": payload.get("country"),
            }
        else:
            sectors[ticker] = {"sector": None, "industry": None, "country": None}
        if i % 20 == 0:
            print(f"  [{i}/{len(to_fetch)}] processed", file=sys.stderr)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(sectors, f, indent=2)
    print(f"\n✓ Écrit : {out_path} ({len(sectors)} tickers)")
    # Compo brute
    from collections import Counter
    sector_counts = Counter(v.get("sector") or "Unknown" for v in sectors.values())
    print(f"\nComposition sectorielle :")
    total = len(sectors)
    for sect, n in sorted(sector_counts.items(), key=lambda x: -x[1]):
        print(f"  {sect or 'Unknown':<30} {n:>4} ({n/total*100:>5.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
