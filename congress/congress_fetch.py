"""
Etage 1 de la pipeline Smart Politician Portfolio (TradePulse).

Rapatrie tous les trades du Congres depuis Quiver, les normalise au schema
`schemas/congress_trades.schema.json`, et ecrit un cache JSON dans data/.

Usage:
    export QUIVER_API_KEY="ta_cle"
    python services/congress_fetch.py            # full refresh
    python services/congress_fetch.py --recent   # seulement les nouveaux trades

Dependances: pip install quiverquant
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
CACHE_PATH = DATA_DIR / "congress_trades.json"

# Quiver renvoie les montants sous forme de fourchette texte: "$1,001 - $15,000".
_RANGE_RE = re.compile(r"\$?\s*([\d,]+)(?:\s*-\s*\$?\s*([\d,]+))?")
_BUY_TOKENS = ("purchase", "buy")
_SELL_TOKENS = ("sale", "sell")


def _parse_amount_range(raw: str | None) -> tuple[float | None, float | None]:
    """'$1,001 - $15,000' -> (1001.0, 15000.0). Tolere les valeurs manquantes."""
    if not raw or not isinstance(raw, str):
        return None, None
    m = _RANGE_RE.search(raw)
    if not m:
        return None, None
    lo = float(m.group(1).replace(",", "")) if m.group(1) else None
    hi = float(m.group(2).replace(",", "")) if m.group(2) else lo
    return lo, hi


def _normalize_side(raw: str | None) -> str | None:
    """Purchase/Sale/Sale (Partial) -> buy/sell."""
    if not raw:
        return None
    low = raw.lower()
    if any(t in low for t in _BUY_TOKENS):
        return "buy"
    if any(t in low for t in _SELL_TOKENS):
        return "sell"
    return None


def _to_date(raw) -> str | None:
    """Normalise vers 'YYYY-MM-DD'. Accepte datetime, Timestamp pandas, ou str."""
    if raw is None or (isinstance(raw, float)):
        return None
    if hasattr(raw, "strftime"):
        return raw.strftime("%Y-%m-%d")
    s = str(raw)[:10]
    return s if re.match(r"\d{4}-\d{2}-\d{2}", s) else None


def _lag_days(transaction_date: str | None, report_date: str | None) -> int | None:
    if not transaction_date or not report_date:
        return None
    try:
        t = datetime.strptime(transaction_date, "%Y-%m-%d")
        r = datetime.strptime(report_date, "%Y-%m-%d")
        return max((r - t).days, 0)
    except ValueError:
        return None


def _fnum(v) -> float | None:
    try:
        if v is None:
            return None
        f = float(v)
        return None if f != f else f  # NaN guard
    except (TypeError, ValueError):
        return None


def normalize_row(row: dict) -> dict:
    """Mappe une ligne brute Quiver vers le schema congress_trades.

    Les endpoints /live/ et /bulk/ n'ont pas les memes noms de colonnes :
    - live : TransactionDate / ReportDate
    - bulk : Traded / Filed
    On accepte les deux jeux de noms.
    """
    transaction_date = _to_date(row.get("TransactionDate") or row.get("Traded"))
    report_date = _to_date(row.get("ReportDate") or row.get("Filed"))
    amount_min, amount_max = _parse_amount_range(row.get("Range") or row.get("Amount"))
    return {
        "representative": (row.get("Representative") or row.get("Name") or "").strip(),
        "bioguide_id": row.get("BioGuideID") or None,
        "party": row.get("Party") or None,
        "house": row.get("House") or None,
        "ticker": (row.get("Ticker") or "").strip().upper() or None,
        "ticker_type": row.get("TickerType") or None,
        "transaction": _normalize_side(row.get("Transaction")),
        "transaction_date": transaction_date,
        "report_date": report_date,
        "disclosure_lag_days": _lag_days(transaction_date, report_date),
        "amount_min": amount_min,
        "amount_max": amount_max,
        "excess_return": _fnum(row.get("ExcessReturn")),
        "price_change": _fnum(row.get("PriceChange")),
        "spy_change": _fnum(row.get("SPYChange")),
    }


def fetch_raw(token: str) -> list[dict]:
    """Pull complet via le package officiel quiverquant. Renvoie une liste de dicts."""
    import quiverquant  # import tardif: le module ne sert qu'ici

    client = quiverquant.quiver(token)
    # recent=False -> endpoint /bulk/ = TOUT l'historique (depuis 2016).
    # recent=True (defaut) ne renvoie que les trades recents (~2 ans) -> insuffisant
    # pour juger la regularite d'un politicien.
    df = client.congress_trading(recent=False)  # pandas.DataFrame
    return df.to_dict(orient="records")


def build_cache(raw_rows: list[dict]) -> dict:
    trades = [normalize_row(r) for r in raw_rows]
    # On ne garde que les lignes exploitables: ticker + les 2 dates + sens connu.
    trades = [
        t for t in trades
        if t["ticker"] and t["transaction_date"] and t["report_date"] and t["transaction"]
    ]
    history_start = min((t["transaction_date"] for t in trades), default=None)
    return {
        "meta": {
            "source": "quiver",
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "count": len(trades),
            "history_start": history_start,
        },
        "trades": trades,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Congress trades from Quiver into a JSON cache.")
    parser.add_argument("--out", default=str(CACHE_PATH), help="Chemin du cache de sortie.")
    args = parser.parse_args()

    # Accepte le nom de secret TradePulse (QUIVERAPI) ou la convention generique.
    token = os.environ.get("QUIVERAPI") or os.environ.get("QUIVER_API_KEY")
    if not token:
        raise SystemExit("Cle Quiver manquante. -> export QUIVERAPI=... (ou QUIVER_API_KEY)")

    print("Pull Quiver congress_trading() ...")
    raw = fetch_raw(token)
    cache = build_cache(raw)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {cache['meta']['count']} trades -> {out} (depuis {cache['meta']['history_start']})")


if __name__ == "__main__":
    main()
