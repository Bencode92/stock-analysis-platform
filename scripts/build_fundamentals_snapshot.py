#!/usr/bin/env python3
"""Seed du snapshot des DERNIÈRES valeurs fondamentales SAINES (roic + quality, calculés ensemble).

Le scoring fetch ~11 000 titres en un job de 6h et se fait tuer à la limite GitHub → roic ET le subscore
`quality` (qui dépend du roic) sortent null → gate solidité KO → « DONNÉES INSUFF. ». Ce snapshot capture
le dernier état sain (par marché, depuis git) pour qu'un run incomplet soit re-hydraté (voir
hydrate_fundamentals.py). Clé = ticker:pays normalisé (lowercase+trim), comme buildCacheKey v2.13.

Seed one-shot : refs saines détectées (coverage jusqu'à 100 + roic présent). Ré-exécutable (merge).
"""
import json, os, subprocess

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SNAP = os.path.join(DATA, "fundamentals_snapshot.json")

# derniers commits SAINS par marché (roic + coverage 100)
GOOD = {
    "stocks_us.json":     "c46eb2a",   # 2026-07-29
    "stocks_asia.json":   "89a67268",   # 2026-07-30
    "stocks_europe.json": "73d34bf8",   # 2026-07-31
}
FIELDS = ["roic", "roic_avg_3y", "roic_std_3y", "roe", "roe_avg_3y", "roe_std_3y",
          "de_ratio", "net_margin", "revenue_growth_3y", "quality_coverage", "quality_subscores"]


def key(tk, country):
    c = (country or "").lower().strip()
    return f"{tk}:{c}" if c else tk


def main():
    snap = {"data": {}}
    if os.path.exists(SNAP):
        snap = json.load(open(SNAP, encoding="utf-8"))
        snap.setdefault("data", {})
    added = 0
    for fn, ref in GOOD.items():
        arr = json.loads(subprocess.check_output(["git", "show", f"{ref}:data/{fn}"]))
        arr = arr if isinstance(arr, list) else arr.get("stocks") or arr.get("data") or []
        for s in arr:
            tk = str(s.get("ticker") or s.get("symbol") or "")
            if not tk or s.get("roic_avg_3y") is None:
                continue
            rec = {f: s.get(f) for f in FIELDS if s.get(f) is not None}
            snap["data"][key(tk, s.get("country") or s.get("Pays") or "")] = rec
            added += 1
    snap["seeded_from"] = GOOD
    json.dump(snap, open(SNAP, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"✅ fundamentals_snapshot.json : {len(snap['data'])} entrées ({added} écrites depuis refs saines)")


if __name__ == "__main__":
    main()
