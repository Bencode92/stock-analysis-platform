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
from datetime import datetime, timedelta
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


def fetch_time_series_at(symbol: str, date_iso: str, api_key: str,
                         lookback_days: int = 10) -> Optional[float]:
    """Récupère le prix de clôture le plus proche d'une fiscal_date.

    Découverte Étape 4 (2026-06-19) : TD time_series renvoie HTTP 400 si
    start_date == end_date (range vide). De plus, beaucoup de fiscal_date
    tombent un week-end ou férié (NVDA 2021-01-31 = dimanche, ASML 2025-12-31
    = Saint-Sylvestre). Solution : élargir à [date - lookback_days, date]
    et prendre la dernière valeur retournée (le close le plus proche).

    Ça gère les deux problèmes en une fois.
    """
    end = date_iso
    start = (datetime.fromisoformat(date_iso) - timedelta(days=lookback_days)).date().isoformat()
    params = {
        "symbol": symbol,
        "interval": "1day",
        "start_date": start,
        "end_date": end,
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
    # TD renvoie values en ordre antéchronologique (plus récent en premier).
    # On veut le close le plus proche de date_iso = values[0]["close"].
    try:
        return float(values[0].get("close"))
    except (TypeError, ValueError):
        return None


def extract_shares_outstanding(income_statement_payload: dict) -> dict[str, Optional[float]]:
    """Extrait shares_outstanding par fiscal_date depuis income_statement.

    DÉCOUVERTE Étape 4 (2026-06-19) : TD met basic_shares_outstanding et
    diluted_shares_outstanding dans income_statement (pas balance_sheet).
    Vérifié sur NVDA + ASML : champ présent sur les 6 années.

    On prend `diluted_shares_outstanding` par défaut (dilution incluse =
    estimation prudente du market cap, cohérent avec EPS diluted utilisé par
    le marché). Fallback sur basic si diluted absent.

    Retourne {fiscal_date: shares ou None si introuvable}.
    """
    result = {}
    statements = income_statement_payload.get("income_statement", []) if isinstance(income_statement_payload, dict) else []
    for stmt in statements:
        fd = stmt.get("fiscal_date")
        if not fd:
            continue
        shares = stmt.get("diluted_shares_outstanding") or stmt.get("basic_shares_outstanding")
        result[fd] = shares
    return result


def reconstruct_market_cap(ticker: str, income_statement_payload: dict, api_key: str,
                           completude_log: list) -> dict[str, Optional[float]]:
    """Reconstruit market_cap historique par fiscal_date = shares × prix à la date.

    Logge BRUYAMMENT chaque (ticker, fiscal_date) où shares_outstanding ou prix
    est introuvable. Pas de None silencieux.
    """
    shares_by_date = extract_shares_outstanding(income_statement_payload)
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


def detect_shares_anomalies(ticker: str, shares_by_date: dict,
                            threshold: float = 0.15) -> list[str]:
    """Détecte des variations inter-année anormales de shares_outstanding.

    Découverte Étape 4 (Fabre 2026-06-19) : ASML 2024-12-31 = 470M shares vs
    377M en 2023 et 388M en 2025 → +24% en 1 an, presque certainement une
    erreur TD (rachats/émissions organiques restent ≤ ~10%/an, splits sont
    normalement ajustés rétroactivement par TD).

    Le rapport de complétude attrape les ABSENCES, pas les VALEURS PRÉSENTES
    MAIS FAUSSES. Ce check comble ce trou : il signale les sauts > 15% entre
    années consécutives pour qu'on les inspecte AVANT de calculer P/E ou FCF
    yield (qui dépendent du market_cap = shares × prix).

    Seuil 15% : rachats/émissions organiques rarement au-delà. Au-dessus,
    soit split mal ajusté par TD, soit erreur — dans les deux cas on veut
    voir avant de scorer.
    """
    flags = []
    # Trier par fiscal_date (chronologique)
    items = sorted(((fd, s) for fd, s in shares_by_date.items() if s is not None),
                   key=lambda x: x[0])
    for i in range(1, len(items)):
        fd_prev, s_prev = items[i - 1]
        fd_curr, s_curr = items[i]
        if s_prev <= 0:
            continue
        delta = (s_curr / s_prev) - 1.0
        if abs(delta) > threshold:
            sign = "+" if delta > 0 else ""
            flags.append(
                f"ANOMALIE shares {ticker} {fd_curr}: {s_curr/1e6:.1f}M vs "
                f"{s_prev/1e6:.1f}M en {fd_prev} ({sign}{delta*100:.1f}%) — "
                f"vérifier split manqué ou erreur TD"
            )
    return flags


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
             "n_years": {}, "market_cap_years_ok": 0, "market_cap_years_fail": 0,
             "shares_anomalies": []}
    is_payload = None  # income_statement payload (shares_outstanding y est)
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
        if endpoint == "income_statement":
            is_payload = payload

    # Reconstruction market_cap historique (étape critique, maillon faible)
    # shares_outstanding est dans income_statement, pas balance_sheet (vérifié 2026-06-19)
    if is_payload is not None:
        # Détection anomalies inter-année AVANT le market_cap (Fabre 2026-06-19)
        # ASML 2024 +24% shares = probable erreur TD, à voir avant scoring
        shares_map = extract_shares_outstanding(is_payload)
        stats["shares_anomalies"] = detect_shares_anomalies(ticker, shares_map)
        market_caps = reconstruct_market_cap(ticker, is_payload, api_key, completude_log)
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

    # Anomalies shares inter-année (Fabre 2026-06-19)
    print(f"\nAnomalies shares inter-année (seuil 15%) :")
    n_anomalies = sum(len(s["shares_anomalies"]) for s in all_stats)
    n_stocks_with_anomalies = sum(1 for s in all_stats if s["shares_anomalies"])
    if n_anomalies == 0:
        print(f"  ✓ Aucune anomalie détectée — shares organiques sur tous les stocks")
    else:
        print(f"  ⚠️  {n_anomalies} anomalie(s) sur {n_stocks_with_anomalies}/{n_total} stocks :")
        for s in all_stats:
            for flag in s["shares_anomalies"]:
                print(f"    - {flag}")
        print(f"\n  → À inspecter AVANT calcul des métriques P/E + FCF yield.")
        print(f"  → Causes possibles : split mal ajusté TD, gross dilution, erreur data.")

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
