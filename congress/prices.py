"""
Couche prix Twelve Data pour le module congress (et le futur backtest etage 4).

Recupere les cours journaliers d'un ticker, avec :
- cache disque (congress/data/prices/{TICKER}.json) -> runs suivants quasi gratuits ;
- throttle configurable pour respecter le rate-limit du plan Twelve Data.

Le cache n'est PAS commite (voir .gitignore) ; en CI il est persiste via actions/cache.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parent / "data" / "prices"
BASE_URL = "https://api.twelvedata.com/time_series"


class RateLimit(Exception):
    """Leve quand Twelve Data refuse pour cause de quota."""


class TwelveData:
    def __init__(self, apikey: str, calls_per_min: int = 8):
        if not apikey:
            raise SystemExit("TWELVE_DATA_API manquant.")
        self.apikey = apikey
        self.min_interval = 60.0 / max(calls_per_min, 1)
        self._last = 0.0
        self.calls = 0
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _throttle(self) -> None:
        wait = self.min_interval - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.time()

    def get_daily(self, symbol: str, allow_fetch: bool = True) -> dict[str, float] | None:
        """Renvoie {date 'YYYY-MM-DD': close}. None si pas en cache et fetch interdit.

        Un dict vide {} = symbole connu mais sans donnees (mis en cache pour ne pas re-essayer).
        """
        safe = symbol.replace("/", "_").replace(":", "_")
        f = CACHE_DIR / f"{safe}.json"
        if f.exists():
            return json.loads(f.read_text())
        if not allow_fetch:
            return None

        self._throttle()
        self.calls += 1
        qs = urllib.parse.urlencode({
            "symbol": symbol, "interval": "1day",
            "outputsize": 5000, "order": "ASC", "apikey": self.apikey,
        })
        try:
            with urllib.request.urlopen(f"{BASE_URL}?{qs}", timeout=30) as r:
                j = json.loads(r.read())
        except urllib.error.HTTPError as he:
            if he.code == 429:
                raise RateLimit("HTTP 429")
            if he.code == 404:
                # symbole delisté / renommé / inconnu : cache vide -> jamais re-tente
                f.write_text("{}")
                return {}
            print(f"  ! {symbol}: HTTP {he.code}", flush=True)
            return None  # 5xx/transitoire : pas de cache, retry au prochain run
        except Exception as e:  # timeout / reseau : pas de cache, retry
            print(f"  ! {symbol}: erreur reseau {e}", flush=True)
            return None

        if isinstance(j, dict) and j.get("status") == "error":
            msg = str(j.get("message", ""))
            if j.get("code") == 429 or "limit" in msg.lower() or "credit" in msg.lower():
                raise RateLimit(msg)
            # symbole inconnu / delisté : cache vide pour ne pas re-payer l'appel
            f.write_text("{}")
            return {}

        data = {v["datetime"]: float(v["close"])
                for v in j.get("values", []) if v.get("close")}
        f.write_text(json.dumps(data))
        return data


def make_client() -> TwelveData:
    key = os.environ.get("TWELVE_DATA_API") or os.environ.get("TWELVE_DATA_API_KEY")
    rate = int(os.environ.get("TWELVE_DATA_RATE", "8"))  # free=8/min ; releve si plan paye
    return TwelveData(key, calls_per_min=rate)
