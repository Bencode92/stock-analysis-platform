#!/usr/bin/env python3
"""Aperçu de la prochaine vague (socle, conviction) : lecture seule, aucun effet sur les portefeuilles.

Écrit data/wave_preview.json et data/conviction_universe.json. Deux lectures du socle : le moteur tel quel,
et le moteur qui protège les lignes tenues des trous de collecte (data/socle_last_good.json).
Sans appel d'API : tourne sur les fichiers déjà collectés, indépendamment du moteur des portefeuilles.
"""
import importlib.util, json, os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
os.environ.update({"ELITE_DRY": "1", "ELITE_FORCE_WAVE": "1", "CONVICTION_DRY": "1"})


def _module(name, rel):       # pas d'import de paquet : portfolio_engine/calendar.py masque le stdlib
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, rel))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


def _load(name, default=None):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def _socle(prev):
    el = _module("equity_elite", "portfolio_engine/equity_elite.py")
    def read(pf):
        tr, by = pf["_transition"], {h["ticker"]: h for h in pf["holdings"]}
        return {"forced": tr.get("forced_exits") or [], "in": [{"t": a["ticker"], "n": a.get("name"), "reg": a["region"],
                        **{k: by.get(a["ticker"], {}).get(k) for k in ("sector", "durability", "fcf_yield", "vol_3y", "weight", "perf_1y")}}
                       for a in tr.get("added", [])],
                "out": [{"t": d["ticker"], "n": d.get("name"), "reg": d["region"]} for d in tr.get("dropped", [])],
                "weights": {h["ticker"]: h["weight"] for h in pf["holdings"]}}

    el.REPAIR_HOLES = False                  # le risque : ce que ferait le moteur sans la protection des lignes tenues
    raw = read(el.build_elite_portfolio())
    el.REPAIR_HOLES = True
    pf_clean = el.build_elite_portfolio()
    clean = read(pf_clean)
    holes = dict(el.HOLES)
    # suivants du classement (hors modèle) et le plafond qui les retient — lecture seule
    rows = el._dedupe_entities(el._load_stocks())
    el._HELD.clear(); el._HELD.update(tuple(k) for k in prev.get("_keys") or [])
    pool = sorted([r for r in rows if r.get("industry") and el._passes_gates(r, ("A", "B"))], key=el._rank_key, reverse=True)
    H = pf_clean["holdings"]; held_t = {h["ticker"] for h in H}
    ind, sec = {}, {}
    for h in H:
        ind[h["industry"]] = ind.get(h["industry"], 0) + 1; sec[h["sector"]] = sec.get(h["sector"], 0) + 1
    nfin = sum(1 for h in H if h["fin"]); bench = []
    for i, r in enumerate(pool):
        t = str(r["ticker"])
        if t in held_t: continue
        why = []
        if el._PAIR.get(t) in held_t: why.append("paire corrélée avec " + el._PAIR[t])
        if ind.get(r["industry"], 0) >= el.MAX_PER_INDUSTRY: why.append("industrie pleine")
        if sec.get(el._gics(r), 0) >= el.SECTOR_CAP: why.append("secteur plein")
        if el._is_fin(r) and nfin >= el.FIN_CAP: why.append("financières pleines")
        bench.append({"rank": i + 1, "t": t, "n": r.get("name"), "reg": r["_region"], "ind": r.get("industry"), "sec": el._gics(r),
                      "dur": r.get("durability_score"), "q": r.get("quality_score"), "fcf": r.get("fcf_yield"), "roic": r.get("roic_avg_3y"),
                      "p1y": r.get("perf_1y"), "why": why})
        if len(bench) >= 25: break
    return {"raw": raw, "clean": clean, "holes": holes, "bench": bench, "pool": len(pool),
            "rules": "durabilité A/B · qualité A/B · valorisation (grade) · 3 ans d'historique · liquidité · marge > 0 · ROIC (ROE pour les financières) · "
                     "baisse du ROIC sur 6 ans ≤ 35 % (40 % tenu) · dette nette/EBIT ≤ 3 · cash-flow ≥ 1 % (> 0 tenu) · classement : durabilité, persistance, score, qualité, cash-flow · "
                     "40 lignes, 2 par industrie, 8 par secteur, 6 financières, paires corrélées · top 100 pour rester · 10 changements par vague",
            "holdings": [{"t": h["ticker"], "n": h["name"], "reg": h["region"], "w": h["weight"]} for h in prev["holdings"]],
            "wave_min": "2026-12-14", "max_changes": el.TRANSITION_MAX_CHANGES,
            "controls": {"n": pf_clean["n"], "region_split": pf_clean["region_split"], "max_region_pct": pf_clean["max_region_pct"],
                         "sector_split": pf_clean["sector_split"], "n_financials": pf_clean["n_financials"], "fin_cap": el.FIN_CAP,
                         "pool": pf_clean["pool_size"], "changes": pf_clean["_transition"]["changes"]}}


def _conviction():
    ce = _module("conviction_equities", "portfolio_engine/conviction_equities.py")
    pf = ce.build()
    with open(os.path.join(DATA, "conviction_universe.json"), "w", encoding="utf-8") as f:
        json.dump(pf.pop("_universe"), f, ensure_ascii=False, separators=(",", ":"), default=str)
    nw, why = pf["next_wave"], {}
    for L in ("blocked_maillons", "waiting", "screen_refused"):
        for c in pf.get(L) or []:
            why[(c["ticker"], c["region"])] = c.get("gates_failed") or []
    return {"enter": nw["enter"], "exit": [{"t": k[0], "reg": k[1], "g": why.get(tuple(k), [])} for k in nw["exit"]],
            "wave_min": "2026-12-15"}


ETF_KEYS = {"b1": r"electrif|smart grid|power grid|grid infra|power infra|energy infra",
            "b2": r"uranium|nuclear|copper|gold|silver|metal|mining",
            "b3": r"emerging|em imi|india|china|asia ex",
            "b4": r"robot|automation",
            "b5a": r"nasdaq|cyber|software|cloud|artificial intel",
            "b5b": r"semicond|ai infra|chip",
            "def": r"defen|aerospace",
            "lest": r"quality|dividend|low vol|minimum vol"}
ETF_EXCLUDE = r"leverag|inverse|short|2x|3x|option|covered|yieldmax|put write|daily"


def _etfs():
    import csv, re
    try:
        rows = list(csv.DictReader(open(os.path.join(DATA, "combined_etfs.csv"), encoding="utf-8")))
    except FileNotFoundError:
        return {}
    conv = _load("convictions.json") or {}
    mine_names = [str(m.get("name") or "").lower() for m in conv.get("lines", {}).values() if m.get("pie") == "etf"]
    mine_stocks = set(conv.get("lines", {})) | {h["ticker"] for h in (_load("portfolios_elite.json") or {}).get("holdings", [])}
    cat = _load("etf_thematic_catalog.json") or {}
    min_aum = (cat.get("_min_aum_eur_m") or 200) * 1e6 * 1.08
    out = {}
    for b, pat in ETF_KEYS.items():
        L = []
        for r in rows:
            n = r.get("name") or ""
            if not re.search(pat, n, re.I) or re.search(ETF_EXCLUDE, n, re.I) or (r.get("etf_type") or "standard") != "standard":
                continue
            try:
                top = json.loads(r.get("holdings_top10") or "[]")
            except ValueError:
                top = []
            aum = float(r["aum_usd"]) if r.get("aum_usd") else None
            nl = n.lower()
            mine = any(w and nl.startswith(w) and not ("innovation" in nl and "innovation" not in w) for w in mine_names)
            L.append({"t": r["symbol"], "n": n, "mic": r.get("mic_code"), "aum": aum, "ter": float(r["total_expense_ratio"]) if r.get("total_expense_ratio") else None,
                      "top": [h.get("n") for h in top[:3]], "overlap": [h.get("t") for h in top if h.get("t") in mine_stocks],
                      "mine": mine, "small": aum is not None and aum < min_aum})
        L.sort(key=lambda x: (not x["mine"], x["small"], -(x["aum"] or 0)))
        seen, ded = set(), []
        for x in L:                                       # une seule cotation par fonds
            k = x["n"].lower()[:40]
            if k not in seen: seen.add(k); ded.append(x)
        out[b] = ded[:8]
    return out


def _cash_checks():
    """Fiche « investit ou brûle » des lignes tenues dont le cash-flow est faible : 4 questions, sans effet sur la sélection."""
    cache = (_load("fundamentals_cache.json") or {}).get("data", {})
    cfc = _load("cashflow_cache.json") or {}
    elite = (_load("portfolios_elite.json") or {}).get("holdings", [])
    conv = _load("convictions.json") or {}
    stocks = {}
    for reg, fn in (("US", "stocks_us.json"), ("Europe", "stocks_europe.json")):
        for s in (_load(fn) or {}).get("stocks", []):
            stocks.setdefault((s.get("ticker"), reg), []).append(s)
    def pick(t, reg, name):                              # même symbole ≠ même société (NXT = Next plc, pas Nueva Expresión)
        L = stocks.get((t, reg)) or []
        return next((x for x in L if x.get("name") == name), None) or (L[0] if len(L) == 1 else {})
    uni = {(r["t"], r["reg"]): r for r in (_load("conviction_universe.json") or {}).get("rows", [])}
    todo = [(h["ticker"], h["region"], "socle", h["name"], 0.0) for h in elite]
    todo += [(k[0], k[1], "convictions", r.get("n"), 5.0) for k, r in uni.items() if r.get("st") == "mine"]
    out = []
    for t, reg, pf, name, floor in todo:
        s = pick(t, reg, name)
        fcf = s.get("fcf_yield") if pf == "socle" else uni[(t, reg)].get("fcf")
        if fcf is None or fcf > floor:
            continue
        c = cache.get(f"{t}:{(s.get('country') or '').lower()}") or {}
        roics = [x for x in (c.get("yearly_roic") or [])[:3] if isinstance(x, (int, float))]
        ic, aic = c.get("invested_capital"), c.get("avg_invested_capital")
        growing = isinstance(ic, (int, float)) and isinstance(aic, (int, float)) and ic > aic
        q2 = None if not roics else (min(roics) >= 15 and roics[0] >= roics[-1] - 5)
        debt, cash, ebit = c.get("total_debt"), c.get("cash_and_st_investments"), c.get("operating_income")
        net = (cash - debt) if isinstance(cash, (int, float)) and isinstance(debt, (int, float)) else None
        q3 = None if net is None else (net >= 0 or (isinstance(ebit, (int, float)) and ebit > 0 and -net / ebit <= 1.5))
        y = ((cfc.get(f"{t}:{reg}") or {}).get("years") or [])
        y0 = y[0] if y else {}
        q1 = None if y0.get("ocf") is None or y0.get("da") is None else y0["ocf"] > abs(y0["da"])
        hist = (cfc.get(f"{t}:{reg}") or {}).get("fcf_hist") or []
        neg = 0
        for x in hist:
            if isinstance(x, (int, float)) and x < 0: neg += 1
            else: break
        q4 = None if not hist else neg <= 1
        bad = [q for q in (q2, q3) if q is False]
        verdict = "brûle" if bad else ("investit" if q2 and q3 and q1 is not False else "à juger")
        out.append({"t": t, "reg": reg, "pf": pf, "n": s.get("name"), "fcf": fcf, "floor": floor,
                    "q1": q1, "q2": q2, "q3": q3, "q4": q4, "roic": roics, "growing": growing,
                    "net_cash_bn": round(net / 1e9, 1) if net is not None else None, "neg_years": neg if hist else None,
                    "capex_bn": round(abs(y0["capex"]) / 1e9, 1) if y0.get("capex") is not None else None,
                    "da_bn": round(abs(y0["da"]) / 1e9, 1) if y0.get("da") is not None else None, "verdict": verdict})
    return out


if __name__ == "__main__":
    out = {"generated": date.today().isoformat(), "socle": _socle(_load("portfolios_elite.json")), "conviction": _conviction(), "etf": _etfs()}
    out["cash_checks"] = _cash_checks()
    with open(os.path.join(DATA, "wave_preview.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"), default=str)
    s = out["socle"]
    print("socle tel quel  +", [x["t"] for x in s["raw"]["in"]], "-", [x["t"] for x in s["raw"]["out"]])
    print("socle sans trous +", [x["t"] for x in s["clean"]["in"]], "-", [x["t"] for x in s["clean"]["out"]], "trous", s["holes"])
    print("conviction +", [x["ticker"] for x in out["conviction"]["enter"]], "-", [(x["t"], x["g"]) for x in out["conviction"]["exit"]])
