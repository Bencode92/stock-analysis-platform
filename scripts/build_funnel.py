#!/usr/bin/env python3
"""Builder ENTONNOIR — Secteur → Chaîne → Région → Action, avec panel multi-axes par nœud.

Lit  : data/framework.json (les chaînes + enablers), data/stocks_{us,europe,asia}.json (90 var/action).
Écrit: data/funnel.json — lu par funnel.html (fetch même-origine, aucune API en direct).

Doctrine : DÉCRIT et FILTRE (médianes), ne classe pas. Momentum = contexte ; Moat/Risque/Valeur = le vrai signal.
Le champ `news` de chaque nœud reste [] — rempli plus tard par le workflow news/IA (Phase B).
"""
import json, statistics as st, os, datetime

BASE = os.path.join(os.path.dirname(__file__), "..", "data")

def rows(fn):
    try:
        d = json.load(open(os.path.join(BASE, fn), encoding="utf-8"))
        return d if isinstance(d, list) else (d.get("stocks") or [v for v in d.values() if isinstance(v, dict)])
    except Exception:
        return []

IDX = {"US": {}, "EU": {}, "Asie": {}}
for reg, fn in [("US", "stocks_us.json"), ("EU", "stocks_europe.json"), ("Asie", "stocks_asia.json")]:
    for r in rows(fn):
        IDX[reg][(r.get("ticker") or "").upper()] = r

FW = json.load(open(os.path.join(BASE, "framework.json"), encoding="utf-8"))

# chaîne → secteur GICS (l'étage 1 de l'entonnoir)
SECTOR = {"semi": "Technologie", "ai_infra": "Technologie", "grid": "Utilities / Industrie",
          "nuclear": "Énergie / Utilities", "defense": "Industrie / Défense",
          "materials": "Matériaux", "robotics": "Industrie"}

# axes du panel : (champ stock, clé sortie). Momentum=contexte ; le reste=signal.
AXES = [("perf_1y", "momentum"), ("roic", "moat"), ("buffett_score", "qualite"),
        ("volatility_3y", "risque"), ("fcf_yield", "valeur")]

def med(idx, tickers, field):
    xs = [idx[t.upper()].get(field) for t in tickers
          if t.upper() in idx and isinstance(idx[t.upper()].get(field), (int, float))]
    return round(st.median(xs), 1) if xs else None

def is_veille(t):
    return t["position"].strip().upper().startswith("VEILLE")

tree = {}
for t in FW["themes"]:
    sec = SECTOR.get(t["key"], "Autre")
    tree.setdefault(sec, {"chains": {}, "news": []})
    ens = [(c["ticker"], c.get("region", ""), c.get("name", ""))
           for m in t["maillons"] for c in m["companies"] if c.get("ticker")]
    # maillons = les ÉTAPES de la chaîne (label + explication + boîtes avec rôle, tagué région)
    def has_data(tk, reg):
        return (tk or "").upper() in IDX.get(reg, {})
    maillons = []
    for m in t["maillons"]:
        comps = [{"ticker": c.get("ticker"), "name": c.get("name"), "role": c.get("role"),
                  "region": c.get("region"), "status": c.get("status"),
                  "has_data": has_data(c.get("ticker"), c.get("region"))}
                 for c in m.get("companies", [])]
        maillons.append({"label": m.get("label"), "desc": m.get("desc"), "companies": comps})
    chain = {"label": t["label"], "position": t["position"], "rank": t.get("rank"),
             "capex_ia": t.get("capex_ia"), "survives_ai": t.get("survives_ai"),
             "veille": is_veille(t), "regions": {}, "news": [],
             # textes riches (le "pourquoi" + la chaîne détaillée)
             "thesis": t.get("thesis"), "diff": t.get("diff"), "decomp": t.get("decomp"),
             "risks": t.get("risks") or [], "gap": t.get("gap"), "maillons": maillons}
    for reg in ["US", "EU", "Asie"]:
        tks = [tk for tk, rg, _ in ens if rg == reg]
        n = sum(1 for tk in tks if tk.upper() in IDX[reg])
        if not tks:
            continue
        panel = {lab: med(IDX[reg], tks, fld) for fld, lab in AXES}
        panel["n"] = n
        actions = []
        for tk, rg, nm in ens:
            if rg != reg:
                continue
            s = IDX[reg].get(tk.upper(), {})
            actions.append({"ticker": tk, "name": nm or s.get("name", ""),
                            "perf_1y": s.get("perf_1y"), "roic": s.get("roic"),
                            "buffett_score": s.get("buffett_score"), "volatility_3y": s.get("volatility_3y"),
                            "fcf_yield": s.get("fcf_yield"), "has_data": tk.upper() in IDX[reg]})
        chain["regions"][reg] = {"panel": panel, "actions": actions, "news": []}
    tree[sec]["chains"][t["key"]] = chain

out = {"meta": {"generated": datetime.datetime.utcnow().isoformat() + "Z",
                "note": "Entonnoir descriptif (médianes). News=[] tant que Phase B n'a pas tourné.",
                "axes": ["momentum", "moat", "qualite", "risque", "valeur"]},
       "sectors": tree}
json.dump(out, open(os.path.join(BASE, "funnel.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# résumé console
nsec = len(tree); nchain = sum(len(v["chains"]) for v in tree.values())
print(f"✅ funnel.json écrit — {nsec} secteurs, {nchain} chaînes")
for sec, v in tree.items():
    for k, ch in v["chains"].items():
        regs = " ".join(f"{r}(n={d['panel']['n']})" for r, d in ch["regions"].items())
        print(f"   {sec[:20]:20} · {ch['label'][:28]:28} [{regs}]")
