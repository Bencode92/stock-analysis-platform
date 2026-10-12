#!/usr/bin/env python3
"""Suivi des portefeuilles modèles — prix d'entrée et performance depuis l'entrée, par ligne.

Lit  : data/portfolios_elite.json (socle), data/portfolios_conviction_equities.json (conviction),
       data/stocks_{us,europe}.json (prix du jour), data/portfolio_entries.json (prix d'entrée, figés).
Écrit: data/portfolio_tracking.json — lu par funnel.html (badge « en portefeuille »).

Portefeuilles MODÈLES uniquement (aucun montant réel). Une ligne nouvelle reçoit le prix du jour comme
prix d'entrée au premier passage ; `--init` reconstruit les entrées depuis l'historique git (vague du 16/09).
Perf en devise de cotation, hors dividendes et hors change.
"""
import json, os, subprocess, sys, datetime

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BASE = os.path.join(ROOT, "data")
ENTRIES = os.path.join(BASE, "portfolio_entries.json")
OUT = os.path.join(BASE, "portfolio_tracking.json")
FILES = {"US": "stocks_us.json", "Europe": "stocks_europe.json"}
PILLARS = (("socle", "portfolios_elite.json"), ("conviction", "portfolios_conviction_equities.json"))


def _stocks(raw):
    d = json.loads(raw)
    return d if isinstance(d, list) else d.get("stocks", [])


def _price(rows, ticker, name):
    """Prix d'une ligne : ticker + nom (les tickers se collisionnent entre places)."""
    cand = [s for s in rows if s.get("ticker") == ticker and s.get("price")]
    if not cand:
        return None, None
    nm = (name or "").upper()[:12]
    s = next((s for s in cand if (s.get("name") or "").upper()[:12] == nm), cand[0])
    return float(s["price"]), s.get("data_currency")


def _holdings(raw_by_pillar):
    out = {}
    for pillar, raw in raw_by_pillar.items():
        for h in json.loads(raw).get("holdings", []):
            out[f"{h['ticker']}:{h['region']}"] = {"pillar": pillar, "ticker": h["ticker"], "region": h["region"],
                                                    "name": h.get("name"), "weight": h.get("weight")}
    return out


def _git(*args):
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True, check=True).stdout


def init(since="2026-09-16"):
    """Prix d'entrée depuis l'historique : chaque ligne tenue aujourd'hui prend le prix du snapshot
       stocks_*.json le plus proche (avant) du premier commit de portefeuille où elle apparaît."""
    cur = _holdings({p: open(os.path.join(BASE, f), encoding="utf-8").read() for p, f in PILLARS})
    first = {}
    for pillar, f in PILLARS:
        commits = _git("log", "--reverse", f"--since={since}T00:00:00Z", "--format=%H %cI", "--", f"data/{f}").split("\n")
        for line in filter(None, commits):
            sha, when = line.split()
            hs = _holdings({pillar: _git("show", f"{sha}:data/{f}")})
            for k in hs:
                if k in cur and k not in first:
                    first[k] = when
    entries, cache = {}, {}
    for k, h in cur.items():
        when = first.get(k)
        if not when:
            continue
        reg = h["region"]
        sha = _git("log", "-1", f"--before={when}", "--format=%H", "--", f"data/{FILES[reg]}").strip()
        if (sha, reg) not in cache:
            cache[(sha, reg)] = _stocks(_git("show", f"{sha}:data/{FILES[reg]}"))
        px, ccy = _price(cache[(sha, reg)], h["ticker"], h["name"])
        if px:
            entries[k] = {"entry_date": when[:10], "entry_price": px, "currency": ccy}
    json.dump({"note": "Prix d'entrée des portefeuilles modèles (figés). Reconstruits le "
                       f"{datetime.date.today().isoformat()} depuis l'historique git.", "lines": entries},
              open(ENTRIES, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"✅ {len(entries)} prix d'entrée → {ENTRIES}")


def build():
    cur = _holdings({p: open(os.path.join(BASE, f), encoding="utf-8").read() for p, f in PILLARS})
    rows = {reg: _stocks(open(os.path.join(BASE, fn), encoding="utf-8").read()) for reg, fn in FILES.items()}
    ent = json.load(open(ENTRIES, encoding="utf-8")) if os.path.exists(ENTRIES) else {"lines": {}}
    today = datetime.date.today().isoformat()
    lines, added = {}, 0
    for k, h in cur.items():
        px, ccy = _price(rows[h["region"]], h["ticker"], h["name"])
        e = ent["lines"].get(k)
        if not e and px:                                  # nouvelle ligne : entrée au prix du jour
            e = ent["lines"][k] = {"entry_date": today, "entry_price": px, "currency": ccy}
            added += 1
        perf = round(100 * (px / e["entry_price"] - 1), 1) if (e and px) else None
        lines[k] = {**h, "entry_date": e and e["entry_date"], "entry_price": e and e["entry_price"],
                    "price": px, "currency": ccy, "perf_since_entry": perf}
    pillars = {}
    for p, _ in PILLARS:
        L = [l for l in lines.values() if l["pillar"] == p and l["perf_since_entry"] is not None and l["weight"]]
        w = sum(l["weight"] for l in L)
        pillars[p] = {"lines": sum(1 for l in lines.values() if l["pillar"] == p),
                      "perf_weighted": round(sum(l["weight"] * l["perf_since_entry"] for l in L) / w, 1) if w else None}
    if added:
        json.dump(ent, open(ENTRIES, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"generated": today, "pillars": pillars, "lines": lines,
               "note": "Portefeuilles modèles · perf depuis l'entrée en devise de cotation, hors dividendes et change."},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"✅ {len(lines)} lignes suivies ({added} nouvelle(s) entrée(s)) → {OUT} · {pillars}")


if __name__ == "__main__":
    init() if "--init" in sys.argv else build()
