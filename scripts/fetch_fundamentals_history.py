"""Fetcher historique fondamental Twelve Data — P0 (2026-06-19).

Récupère income_statement + balance_sheet + cash_flow + market_cap historique
pour un univers de 50 stocks "laboratoire" de validation. Stockage brut
INTOUCHABLE dans data/fundamentals_history/raw/.

Distinction labo/prod (Fabre 2026-06-19) :
- 50 stocks = labo qui VALIDE la RÈGLE (scoring a-t-il un edge ? α ou β ?)
- 1000 stocks univers prod = applique la règle validée sur fondamentaux actuels

Le backtest ne sélectionne PAS les positions. Il valide la méthode.

Usage :
    # DRY RUN (défaut, sécurité) — affiche ce qui serait fait, ne fetch RIEN
    python3 scripts/fetch_fundamentals_history.py

    # Test étape 4 : NVDA + ASML uniquement, vraies calls
    python3 scripts/fetch_fundamentals_history.py --tickers NVDA,ASML --live

    # Étape 5 : tout l'univers (50 stocks)
    python3 scripts/fetch_fundamentals_history.py --live

Garde-fous (Fabre) :
- Logge EXPLICITEMENT chaque (ticker, fiscal_date) où market_cap n'a pu être
  reconstruit. Pas de None silencieux.
- Rapport de complétude en fin de run : X/50 stocks complets sur 6 ans.
- shares_outstanding manquant = ÉCHEC BRUYANT, pas avalé silencieusement.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

# ─── UNIVERSE LABO (50 stocks armé pour α ET β) ─────────────────────────────
# Fabre 2026-06-19 : armer les deux camps sinon backtest biaisé.
UNIVERSE = {
    # Tech US growth (10) — moteurs de la performance 2020-2026
    "Tech US growth": [
        "NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "AVGO", "ORCL", "ADBE", "CRM",
    ],
    # Compounders chers gagnants (5) — sans eux, β sous-évalué
    "Compounders chers": ["CDNS", "SNPS", "LLY", "FICO", "ANET"],
    # Quality value US (8) — moat + prix raisonnable, candidats α
    "Quality value US": ["PG", "KO", "JNJ", "V", "MA", "COST", "WMT", "JPM"],
    # EU quality (8)
    "EU quality": ["ASML", "NOVN", "ITX", "ROP", "CS", "NESN", "LVMH", "SAP"],
    # EM quality (4)
    "EM quality": ["INFY", "HCLTECH", "TSM", "005930"],
    # Positions actuelles portefeuilles (10) — pour comparer ce qu'on tient
    "Positions actuelles": ["ADM", "BVI", "PUB", "NTGY", "LOGN", "EXPD", "CBOE", "CF", "BMED", "RMD"],
    # Value-traps (5) — sans eux, α sous-évalué
    "Value-traps": ["INTC", "BABA", "T", "F", "GE"],
}

ENDPOINTS = ["income_statement", "balance_sheet", "cash_flow"]
TD_BASE = "https://api.twelvedata.com"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "raw"
ENV_PATH = PROJECT_ROOT / ".env"

# Rate limit (Ultra : 600/min = 100ms entre calls, marge ×2 = 200ms)
RATE_LIMIT_DELAY = 0.2


def load_env() -> Optional[str]:
    """Charge TWELVE_DATA_API depuis .env si présent."""
    if ENV_PATH.exists():
        with ENV_PATH.open() as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return os.getenv("TWELVE_DATA_API") or os.getenv("TWELVE_DATA_API_KEY")


def all_tickers() -> list[str]:
    seen, out = set(), []
    for tickers in UNIVERSE.values():
        for t in tickers:
            if t not in seen:
                seen.add(t)
                out.append(t)
    return out


def fetch_endpoint(symbol: str, endpoint: str, api_key: str) -> Optional[dict]:
    """Fetch un endpoint annual pour un symbole, depuis 2005 (TD borne réelle ~6 ans)."""
    params = {
        "symbol": symbol,
        "period": "annual",
        "start_date": "2005-01-01",
        "apikey": api_key,
    }
    url = f"{TD_BASE}/{endpoint}?{urlencode(params)}"
    try:
        with urlopen(url, timeout=30) as resp:
            payload = json.loads(resp.read())
    except (HTTPError, URLError) as e:
        print(f"  ⚠️  {symbol} [{endpoint}] HTTP/URL error: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  ⚠️  {symbol} [{endpoint}] error: {e}", file=sys.stderr)
        return None

    if isinstance(payload, dict) and payload.get("status") == "error":
        print(f"  ⚠️  {symbol} [{endpoint}] API error: {payload.get('message')}", file=sys.stderr)
        return None
    return payload


def fetch_time_series_at(symbol: str, date_iso: str, api_key: str) -> Optional[float]:
    """Récupère le prix de clôture d'un titre à une date donnée (pour reconstruire market_cap)."""
    params = {
        "symbol": symbol,
        "interval": "1day",
        "start_date": date_iso,
        "end_date": date_iso,
        "apikey": api_key,
    }
    url = f"{TD_BASE}/time_series?{urlencode(params)}"
    try:
        with urlopen(url, timeout=30) as resp:
            payload = json.loads(resp.read())
    except Exception as e:
        print(f"  ⚠️  {symbol} time_series {date_iso} error: {e}", file=sys.stderr)
        return None
    if isinstance(payload, dict) and payload.get("status") == "error":
        return None
    values = payload.get("values", []) if isinstance(payload, dict) else []
    if not values:
        return None
    try:
        return float(values[0].get("close"))
    except (TypeError, ValueError):
        return None


def extract_shares_outstanding(balance_sheet_payload: dict) -> dict[str, Optional[float]]:
    """Extrait shares_outstanding par fiscal_date depuis balance_sheet.

    TD stocke souvent dans equity.common_stock_shares_outstanding ou similaire.
    Retourne {fiscal_date: shares ou None si introuvable}.
    """
    result = {}
    statements = balance_sheet_payload.get("balance_sheet", []) if isinstance(balance_sheet_payload, dict) else []
    for stmt in statements:
        fd = stmt.get("fiscal_date")
        if not fd:
            continue
        # Chercher dans tous les chemins plausibles
        shares = None
        equity_block = stmt.get("equity") or {}
        for key in ("common_stock_shares_outstanding", "shares_outstanding",
                    "common_stock_outstanding", "ordinary_shares_outstanding"):
            if key in equity_block and equity_block[key] is not None:
                shares = equity_block[key]
                break
            if key in stmt and stmt[key] is not None:
                shares = stmt[key]
                break
        result[fd] = shares
    return result


def reconstruct_market_cap(ticker: str, balance_sheet_payload: dict, api_key: str,
                           completude_log: list) -> dict[str, Optional[float]]:
    """Reconstruit market_cap historique par fiscal_date = shares × prix à la date.

    Logge BRUYAMMENT chaque (ticker, fiscal_date) où shares_outstanding ou prix
    est introuvable. Pas de None silencieux.
    """
    shares_by_date = extract_shares_outstanding(balance_sheet_payload)
    market_caps = {}
    for fd, shares in shares_by_date.items():
        if shares is None:
            completude_log.append(
                f"{ticker} {fd}: shares_outstanding ABSENT du balance_sheet"
            )
            market_caps[fd] = None
            continue
        time.sleep(RATE_LIMIT_DELAY)
        price = fetch_time_series_at(ticker, fd, api_key)
        if price is None:
            completude_log.append(
                f"{ticker} {fd}: prix introuvable via time_series"
            )
            market_caps[fd] = None
            continue
        market_caps[fd] = float(shares) * price
    return market_caps


def save_raw(ticker: str, endpoint: str, payload: dict) -> Path:
    """Sauvegarde le brut INTOUCHABLE. Jamais modifié après écriture."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    safe_ticker = ticker.replace("/", "_").replace(":", "_")
    path = RAW_DIR / f"{safe_ticker}_{endpoint}.json"
    with path.open("w") as f:
        json.dump(payload, f, indent=2)
    return path


def fetch_ticker(ticker: str, api_key: str, completude_log: list) -> dict:
    """Fetch les 3 endpoints + market_cap pour un ticker. Retourne stats."""
    stats = {"ticker": ticker, "endpoints_ok": [], "endpoints_fail": [],
             "n_years": {}, "market_cap_years_ok": 0, "market_cap_years_fail": 0}
    bs_payload = None
    for endpoint in ENDPOINTS:
        time.sleep(RATE_LIMIT_DELAY)
        payload = fetch_endpoint(ticker, endpoint, api_key)
        if payload is None:
            stats["endpoints_fail"].append(endpoint)
            continue
        save_raw(ticker, endpoint, payload)
        stats["endpoints_ok"].append(endpoint)
        # Compte les années
        key_in_payload = endpoint  # même nom que l'endpoint
        years = len(payload.get(key_in_payload, [])) if isinstance(payload, dict) else 0
        stats["n_years"][endpoint] = years
        if endpoint == "balance_sheet":
            bs_payload = payload

    # Reconstruction market_cap historique (étape critique, maillon faible)
    if bs_payload is not None:
        market_caps = reconstruct_market_cap(ticker, bs_payload, api_key, completude_log)
        stats["market_cap_years_ok"] = sum(1 for v in market_caps.values() if v is not None)
        stats["market_cap_years_fail"] = sum(1 for v in market_caps.values() if v is None)
        # Sauvegarde séparée market_cap (dérivé, mais conservé en raw/ car coût API)
        meta_path = RAW_DIR / f"{ticker.replace('/', '_').replace(':', '_')}_market_cap.json"
        with meta_path.open("w") as f:
            json.dump(market_caps, f, indent=2)
    return stats


def print_completude_report(all_stats: list, completude_log: list) -> None:
    """Rapport de complétude bruyant en fin de run (exigence Fabre)."""
    print("\n" + "=" * 70)
    print("RAPPORT DE COMPLÉTUDE")
    print("=" * 70)
    n_total = len(all_stats)
    n_endpoints_complete = sum(1 for s in all_stats if len(s["endpoints_ok"]) == 3)
    print(f"\nEndpoints (income + balance + cash) :")
    print(f"  {n_endpoints_complete}/{n_total} stocks avec 3/3 endpoints OK")
    for s in all_stats:
        if len(s["endpoints_ok"]) < 3:
            print(f"  ❌ {s['ticker']}: {s['endpoints_ok']} OK, {s['endpoints_fail']} FAIL")
    # Profondeur attendue : 6 ans (mesuré sur NVDA/ASML/INFY)
    print(f"\nProfondeur attendue : 6 ans annuels par endpoint")
    short = [(s["ticker"], s["n_years"]) for s in all_stats
             if any(y < 6 for y in s["n_years"].values() if y is not None)]
    if short:
        print(f"  ⚠️  Stocks avec < 6 ans sur ≥ 1 endpoint :")
        for tk, years in short:
            print(f"    - {tk}: {years}")
    else:
        print(f"  ✓ Tous les stocks ont 6 ans sur tous les endpoints")

    print(f"\nMarket cap historique (MAILLON FAIBLE, Fabre 2026-06-19) :")
    n_mc_complete = sum(1 for s in all_stats if s["market_cap_years_fail"] == 0)
    print(f"  {n_mc_complete}/{n_total} stocks avec market_cap reconstruit sur toutes les années")
    for s in all_stats:
        if s["market_cap_years_fail"] > 0:
            print(f"  ❌ {s['ticker']}: {s['market_cap_years_ok']} OK / {s['market_cap_years_fail']} trous")

    if completude_log:
        print(f"\n📋 Détail des trous (à inspecter avant étape 5) :")
        for entry in completude_log[:30]:
            print(f"  - {entry}")
        if len(completude_log) > 30:
            print(f"  ... et {len(completude_log) - 30} autres trous")
    print("\n" + "=" * 70)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true",
                        help="Lance les vraies calls API. Par défaut : --dry-run (sécurité).")
    parser.add_argument("--tickers", type=str, default=None,
                        help="Liste de tickers séparés par virgule (ex: NVDA,ASML). "
                             "Par défaut : tout l'univers (50 stocks).")
    args = parser.parse_args()

    api_key = load_env()
    if not api_key and args.live:
        print("ERREUR: TWELVE_DATA_API non défini (.env requis pour --live)", file=sys.stderr)
        return 1

    # Liste des tickers à traiter
    if args.tickers:
        tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    else:
        tickers = all_tickers()

    print(f"Mode : {'LIVE (calls réels)' if args.live else 'DRY-RUN (aucun call)'}")
    print(f"Univers : {len(tickers)} stock(s) — {', '.join(tickers[:10])}"
          + (f", … (+{len(tickers)-10})" if len(tickers) > 10 else ""))
    print(f"Endpoints : {', '.join(ENDPOINTS)} + market_cap reconstruit")
    print(f"Stockage : {RAW_DIR}")
    n_calls_estim = len(tickers) * (len(ENDPOINTS) + 6)  # 3 endpoints + ~6 time_series par stock
    print(f"Calls API estimés : ~{n_calls_estim}")
    print(f"Durée estimée @ 0.2s/call : ~{n_calls_estim * RATE_LIMIT_DELAY:.0f}s")

    if not args.live:
        print("\n→ DRY-RUN : aucun call, aucune écriture. Relance avec --live pour exécuter.")
        return 0

    # LIVE
    print(f"\n🚀 LIVE — début fetch")
    all_stats = []
    completude_log = []
    for i, ticker in enumerate(tickers, 1):
        print(f"\n[{i}/{len(tickers)}] {ticker}")
        stats = fetch_ticker(ticker, api_key, completude_log)
        all_stats.append(stats)
        print(f"  ✓ endpoints OK: {stats['endpoints_ok']}")
        print(f"  ✓ market_cap : {stats['market_cap_years_ok']} OK / {stats['market_cap_years_fail']} trous")

    print_completude_report(all_stats, completude_log)

    # Sauve aussi le rapport pour traçabilité
    report_path = RAW_DIR / "_completude_report.json"
    with report_path.open("w") as f:
        json.dump({"stats": all_stats, "completude_log": completude_log}, f, indent=2)
    print(f"\nRapport sauvegardé : {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
