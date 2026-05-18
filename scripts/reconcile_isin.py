#!/usr/bin/env python3
"""
01_reconcile_isin.py
=====================
Réconciliation ticker -> identité unique via Twelve Data.

PROBLEME RESOLU
---------------
Le ticker `ADM` pointe vers DEUX societes :
  - Archer Daniels Midland (US, NYSE)        -> ce que voit le backend
  - Admiral Group PLC      (UK, LSE)         -> ce que voit le composer UI

Cause racine : la cle primaire est le `symbol` seul. Or un symbole n'est
unique QUE dans le couple (symbol, exchange/MIC). Twelve Data le confirme :
symbol_search renvoie plusieurs instruments pour un meme ticker, distingues
par `exchange`, `mic_code`, `country`, et `isin` (si add-on actif).

STRATEGIE (degradee, robuste meme sans add-on ISIN)
---------------------------------------------------
Cle primaire candidate, par ordre de preference :
  1. ISIN                     (si Data add-on actif sur le plan)
  2. (symbol, mic_code)       (MIC = code marche ISO 10383, ex. XNYS, XLON)
  3. (symbol, country)        (fallback grossier)

Le script :
  - lit ton univers (stocks_europe.json + stocks_us.json)
  - pour chaque (symbol, pays_attendu), interroge symbol_search
  - detecte les collisions : meme symbol -> plusieurs instruments
  - propose une cle composite + flague les lignes a corriger manuellement
  - ecrit reconciliation_report.csv + isin_map.json

DEPENDANCES
-----------
  pip install requests pandas

USAGE
-----
  export TWELVEDATA_API_KEY=xxxxx

  # Mode COMPLET (806 titres, ~100 min @ 8 req/min) :
  python3 01_reconcile_isin.py --universe-dir /chemin/data --rate 8

  # Mode SCOPE REDUIT (recommande pour securiser la prod vite, ~6 min) :
  #   --only "G1A,TTE,ITX,HEN,ML,ACN,SAN,LI,BMED,IBE,SCHN,VICI,PG,EOG,AUTO,NOVN,CTSH,SCHP,ILPT,WCP,ADM,ADP,DG,TSCO,HBAN"
  python3 01_reconcile_isin.py --universe-dir /chemin/data --only "ADM,ADP,DG,..." --rate 8

  # Mode SCOPE depuis un fichier (un ticker par ligne) :
  python3 01_reconcile_isin.py --universe-dir /chemin/data --only-file scope.txt

STRATEGIE D'EXECUTION RECOMMANDEE
---------------------------------
1. MAINTENANT : --only sur baseline + holdings T212 + 19 collisions (~6 min)
   -> securise la production immediatement
2. EN TACHE DE FOND : run complet en GitHub Action (la cle y est deja)
   -> valide l'univers entier a tete reposee

NOTES
-----
- Rate limit : l'API gratuite plafonne (souvent 8 req/min). --rate ajuste.
- AUCUNE cle API n'est ecrite en dur. Variable d'environnement uniquement.
- Le script ne MODIFIE PAS ton dataset. Il produit un rapport a relire.
"""

from __future__ import annotations
import argparse
import json
import os
import sys
import time
import glob
from collections import defaultdict
from pathlib import Path

try:
    import requests
    import pandas as pd
except ImportError:
    print("Manque des libs. Lance : pip install requests pandas", file=sys.stderr)
    sys.exit(1)

API_BASE = "https://api.twelvedata.com"

# MIC attendus par pays, pour valider que le bon instrument est retenu.
# (Liste volontairement courte : etend selon ton univers reel.)
EXPECTED_MIC_BY_COUNTRY = {
    "United States": {"XNYS", "XNAS", "ARCX", "BATS"},
    "United Kingdom": {"XLON"},
    "France": {"XPAR"},
    "Germany": {"XETR", "XFRA"},
    "Spain": {"XMAD"},
    "Italy": {"XMIL"},
    "Ireland": {"XDUB", "XLON"},     # IE souvent cote a Londres aussi
    "Portugal": {"XLIS"},
    "Switzerland": {"XSWX", "XVTX"},
    "Netherlands": {"XAMS"},
    "Canada": {"XTSE", "XTSX"},
    "Australia": {"XASX"},
}


def load_universe(universe_dir: str) -> pd.DataFrame:
    """Charge tous les *.json du dataset en un DataFrame [symbol, country, name]."""
    rows = []
    for fp in glob.glob(os.path.join(universe_dir, "stocks_*.json")):
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Tolerance de schema : liste d'objets OU dict {ticker: {...}}
        records = data.values() if isinstance(data, dict) else data
        for r in records:
            if not isinstance(r, dict):
                continue
            sym = r.get("symbol") or r.get("ticker")
            if not sym:
                continue
            rows.append({
                "symbol": str(sym).strip().upper(),
                "country_expected": (r.get("country") or r.get("pays") or "").strip(),
                "name_backend": (r.get("name") or r.get("company") or "").strip(),
                "source_file": os.path.basename(fp),
            })
    if not rows:
        raise SystemExit(
            f"Aucun titre charge depuis {universe_dir}. "
            "Verifie le chemin et le schema des JSON."
        )
    return pd.DataFrame(rows).drop_duplicates(subset=["symbol", "source_file"])


def symbol_search(symbol: str, api_key: str, timeout: int = 15) -> list[dict]:
    """Appelle /symbol_search. Retourne la liste 'data' (peut etre vide)."""
    try:
        resp = requests.get(
            f"{API_BASE}/symbol_search",
            params={"symbol": symbol, "apikey": api_key, "outputsize": 30},
            timeout=timeout,
        )
        resp.raise_for_status()
        payload = resp.json()
    except (requests.RequestException, ValueError) as e:
        return [{"_error": str(e)}]
    # Format attendu : {"data": [ {symbol, instrument_name, exchange,
    #                              mic_code, country, currency, isin?}, ... ]}
    return payload.get("data", []) if isinstance(payload, dict) else []


def pick_best_match(symbol: str, country_expected: str,
                    candidates: list[dict]) -> tuple[dict | None, str]:
    """
    Choisit l'instrument le plus coherent avec le pays attendu du backend.
    Retourne (match, statut) ou statut in
      {OK, COLLISION, COUNTRY_MISMATCH, NOT_FOUND, API_ERROR}
    """
    if not candidates:
        return None, "NOT_FOUND"
    if any("_error" in c for c in candidates):
        return None, "API_ERROR"

    exact = [c for c in candidates
             if str(c.get("symbol", "")).upper() == symbol.upper()]
    pool = exact or candidates

    # Detection de collision : plusieurs pays distincts pour le meme ticker
    countries = {c.get("country", "") for c in pool if c.get("country")}
    is_collision = len(countries) > 1

    # On essaie d'aligner sur le pays attendu
    expected_mics = EXPECTED_MIC_BY_COUNTRY.get(country_expected, set())
    by_country = [c for c in pool if c.get("country") == country_expected]
    by_mic = [c for c in pool if c.get("mic_code") in expected_mics]

    chosen = (by_mic or by_country or pool)[0]

    if is_collision:
        # Collision averee : on retient le match aligne pays mais on FLAGUE
        if by_country or by_mic:
            return chosen, "COLLISION"          # resolu mais a verifier
        return chosen, "COLLISION_UNRESOLVED"   # ambigu, intervention humaine

    if country_expected and chosen.get("country") and \
       chosen.get("country") != country_expected:
        return chosen, "COUNTRY_MISMATCH"

    return chosen, "OK"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--universe-dir", required=True,
                    help="Dossier contenant stocks_*.json")
    ap.add_argument("--only", default="",
                    help="Liste de tickers separes par virgule a reconcilier "
                         "uniquement (mode scope reduit)")
    ap.add_argument("--only-file", default="",
                    help="Fichier texte, un ticker par ligne (mode scope reduit)")
    ap.add_argument("--rate", type=float, default=8,
                    help="Requetes/minute max (plan gratuit ~8)")
    ap.add_argument("--out-dir", default=".",
                    help="Dossier de sortie des rapports")
    args = ap.parse_args()

    api_key = os.environ.get("TWELVEDATA_API_KEY")
    if not api_key:
        sys.exit("Definis TWELVEDATA_API_KEY (variable d'environnement).")

    df = load_universe(args.universe_dir)
    print(f"{len(df)} titres charges depuis {args.universe_dir}")

    # --- Filtrage scope reduit (option 'la plus optimale') ---
    scope: set[str] = set()
    if args.only:
        scope |= {s.strip().upper() for s in args.only.split(",") if s.strip()}
    if args.only_file:
        with open(args.only_file, encoding="utf-8") as f:
            scope |= {ln.strip().upper() for ln in f if ln.strip()}
    if scope:
        before = len(df)
        df = df[df["symbol"].isin(scope)].reset_index(drop=True)
        missing = scope - set(df["symbol"])
        print(f"SCOPE REDUIT : {len(df)}/{before} titres retenus "
              f"(~{len(df) * (60.0/args.rate)/60:.1f} min estimees)")
        if missing:
            print(f"  ATTENTION : {len(missing)} tickers du scope absents "
                  f"du dataset : {sorted(missing)}")
        if df.empty:
            sys.exit("Aucun ticker du scope trouve dans le dataset. "
                     "Verifie l'orthographe des tickers.")

    sleep_s = max(60.0 / args.rate, 0.0)
    results = []
    isin_map: dict[str, dict] = {}

    for i, row in df.iterrows():
        sym = row["symbol"]
        cands = symbol_search(sym, api_key)
        match, status = pick_best_match(sym, row["country_expected"], cands)

        rec = {
            "symbol": sym,
            "country_expected": row["country_expected"],
            "name_backend": row["name_backend"],
            "status": status,
            "n_candidates": len(cands),
            "matched_name": (match or {}).get("instrument_name", ""),
            "matched_country": (match or {}).get("country", ""),
            "matched_exchange": (match or {}).get("exchange", ""),
            "matched_mic": (match or {}).get("mic_code", ""),
            "matched_currency": (match or {}).get("currency", ""),
            "matched_isin": (match or {}).get("isin", ""),  # vide si add-on off
        }
        results.append(rec)

        # Cle composite recommandee
        if match:
            composite = rec["matched_isin"] or f"{sym}@{rec['matched_mic'] or rec['matched_country']}"
            isin_map[sym] = {
                "composite_key": composite,
                "isin": rec["matched_isin"],
                "mic": rec["matched_mic"],
                "country": rec["matched_country"],
                "needs_review": status not in ("OK",),
            }

        flag = "" if status == "OK" else "  <-- A VERIFIER"
        print(f"[{i+1:>4}/{len(df)}] {sym:<6} {status:<20}{flag}")
        time.sleep(sleep_s)

    out = Path(args.out_dir)
    rep = pd.DataFrame(results)
    rep.to_csv(out / "reconciliation_report.csv", index=False)
    with open(out / "isin_map.json", "w", encoding="utf-8") as f:
        json.dump(isin_map, f, indent=2, ensure_ascii=False)

    # Resume console : ce qui compte
    print("\n" + "=" * 60)
    print("RESUME")
    print("=" * 60)
    print(rep["status"].value_counts().to_string())
    collisions = rep[rep["status"].str.startswith("COLLISION")]
    if not collisions.empty:
        print(f"\n{len(collisions)} COLLISION(S) DE TICKER detectee(s) :")
        print(collisions[["symbol", "country_expected",
                          "matched_country", "matched_name"]].to_string(index=False))
    print(f"\nRapports ecrits dans : {out.resolve()}")


if __name__ == "__main__":
    main()
