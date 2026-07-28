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

# Contexte pédagogique en langage clair (driver + goulot + dépendance) — QUALITATIF, sans chiffre inventé.
# Les stats précises + sourcées (« 50% de l'Europe est nucléaire ») viendront de la couche news/IA (Phase B).
CONTEXT = {
 "semi": "Les semi-conducteurs, ce sont les puces qui font tourner toute l'électronique — et l'IA en dévore des quantités record. Le point clé : on ne peut PAS fabriquer une puce avancée sans passer par une poignée de goulots quasi-monopolistiques en amont. ASML est le SEUL au monde à fabriquer les machines de lithographie EUV (>200 M€ pièce, 2 ans de délai) — sans elle, pas de puce sous 7 nm. À côté : le dépôt, la gravure, le test, puis la fonderie (TSMC domine le leading-edge mondial). C'est la doctrine picks & shovels par excellence : on n'achète pas Nvidia (le produit médiatisé), on achète les fournisseurs incontournables sans qui rien n'existe. Le risque : tout est concentré à Taïwan, au Japon et aux Pays-Bas → forte exposition géopolitique.",
 "grid": "Le réseau électrique, c'est le transport de l'électricité entre les centrales et les prises. Le driver : l'électrification massive (voitures électriques, datacenters, renouvelables) sature des réseaux vieux de 40-50 ans qu'il faut refaire. Le goulot n'est PAS la production d'électricité — c'est le TRANSPORT : les transformateurs haute tension et les câbles, dont les carnets de commande dépassent déjà 3-4 ans. Peu d'acteurs capables d'en fabriquer (surtout européens et asiatiques), donc un vrai chokepoint industriel. En amont : le cuivre, largement importé. C'est un thème lent mais structurel — la demande est mécanique, pas spéculative.",
 "nuclear": "Le nucléaire connaît une relance mondiale pour décarboner sans dépendre du soleil et du vent. Mais le vrai goulot n'est pas de construire des réacteurs — c'est le COMBUSTIBLE. Il faut de l'uranium (concentré au Kazakhstan, Niger, Canada) puis surtout l'ENRICHIR, une étape longtemps dominée par la Russie (Rosatom) — d'où un chokepoint plus géopolitique qu'industriel. Trois horizons : l'existant (entretien des centrales, sûr), le combustible (la vraie tension), et les SMR (petits réacteurs modulaires — prometteur mais pas prouvé, donc en veille). On joue le combustible et l'existant, pas le rêve SMR.",
 "ai_infra": "L'IA-infra, c'est tout ce qui ALIMENTE et REFROIDIT les datacenters d'IA — l'angle mort du boom. Un datacenter IA consomme autant qu'une ville : le goulot devient l'électricité et le refroidissement, pas les puces. Les gagnants : les équipements électriques et thermiques (Vertiv pour le refroidissement, Eaton, Schneider pour la distribution). C'est encore du picks & shovels : on ne parie pas sur le modèle d'IA, on parie sur ce sans quoi aucun datacenter ne tourne. Attention : très couplé au capex-IA — si les géants ralentissent leurs investissements, cette chaîne ralentit avec eux (c'est le pari de régime à surveiller).",
 "defense": "Le réarmement est structurel, l'Europe surtout, après des décennies de sous-investissement. Mais le vrai goulot n'est pas les avions et chars médiatisés (chers, très détenus) — c'est l'amont : les COMPOSANTS critiques (électronique de défense, munitions, capteurs, propulsion) que peu de fournisseurs savent produire et qu'on ne remplace pas en 6 mois. Intérêt supplémentaire : la défense se DÉCORRÈLE des semi/IA en cas de stress (2022 : semi −28% / défense +71%) — c'est le seul hedge robuste du portefeuille. On achète sur repli (c'est cher après la hausse récente), et plutôt les composants que les primes.",
 "materials": "L'électrification et la défense ont un besoin explosif de cuivre, terres rares et lithium. Mais le diagnostic est FORT et les véhicules FAIBLES : le vrai chokepoint n'est pas la mine, c'est le RAFFINAGE — et la Chine y domine massivement (surtout les terres rares). Celui qui raffine tient la chaîne, et c'est un levier géopolitique (la Chine peut restreindre les exports). Problème pratique : peu d'ETF/actions propres pour s'y exposer sans acheter des mineurs très cycliques et politiques (Amérique latine pour le cuivre). Donc exposition bornée, volontairement petite.",
 "robotics": "La robotique et les humanoïdes sont un thème d'avenir médiatisé — mais on est en VEILLE : les critères d'activation ne sont pas remplis (adoption réelle, marges, moat durable encore incertains). C'est le thème le plus spéculatif et le plus « saillant » (en vogue parce qu'il fait la une), donc précisément celui où il faut de la discipline. On surveille les vrais chokepoints (réducteurs de précision, actionneurs), on n'investit pas encore.",
}
def etf_of(t):
    eb = t.get("etf_buy") or {}
    es = t.get("etf_signal") or {}
    sym = eb.get("symbol") if isinstance(eb, dict) else eb
    buyable = sym if sym and sym != "—" else None
    return {"buy": buyable, "buy_name": (eb.get("name") if isinstance(eb, dict) else None),
            "signal_ytd": es.get("ytd"), "signal_w52": es.get("w52"), "signal_3m": es.get("m3")}

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
    def cmet(tk, reg, field):
        return IDX.get(reg, {}).get((tk or "").upper(), {}).get(field)
    maillons = []
    for m in t["maillons"]:
        comps = [{"ticker": c.get("ticker"), "name": c.get("name"), "role": c.get("role"),
                  "region": c.get("region"), "status": c.get("status"),
                  "has_data": has_data(c.get("ticker"), c.get("region")),
                  "perf_1y": cmet(c.get("ticker"), c.get("region"), "perf_1y"),
                  "roic": cmet(c.get("ticker"), c.get("region"), "roic"),
                  "buffett_score": cmet(c.get("ticker"), c.get("region"), "buffett_score")}
                 for c in m.get("companies", [])]
        maillons.append({"label": m.get("label"), "desc": m.get("desc"), "companies": comps})
    chain = {"label": t["label"], "position": t["position"], "rank": t.get("rank"),
             "capex_ia": t.get("capex_ia"), "survives_ai": t.get("survives_ai"),
             "veille": is_veille(t), "regions": {}, "news": [],
             # textes riches (le "pourquoi" + la chaîne détaillée) + comment s'exposer
             "context": CONTEXT.get(t["key"]), "etf": etf_of(t),
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
