#!/usr/bin/env python3
"""Aperçu de la prochaine vague (socle, conviction) : lecture seule, aucun effet sur les portefeuilles.

Écrit data/wave_preview.json et data/conviction_universe.json. Deux lectures du socle : le moteur tel quel,
et le moteur sans les trous de collecte (dernières valeurs saines : data/socle_last_good.json).
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


HOLE_FIELDS = ("durability_grade", "average_volume", "history_days")


def _socle(prev):
    el = _module("equity_elite", "portfolio_engine/equity_elite.py")
    good = (_load("socle_last_good.json") or {}).get("rows", {})
    held = {(h["ticker"], h["region"]) for h in prev["holdings"]}
    orig_load = el._load_stocks
    holes = {}

    def fetch_with_repair():
        rows = orig_load()
        for s in rows:
            k = (str(s.get("ticker")), s.get("_region"))
            if k not in held:
                continue
            miss = [f for f in HOLE_FIELDS if s.get(f) is None]
            g = good.get(f"{k[0]}|{k[1]}")
            if miss and g:
                holes[k[0]] = miss
                for f, v in g.items():
                    if s.get(f) is None or (f.startswith("years_") and not s.get(f)):   # années à 0 = comptes vides, pas zéro année
                        s[f] = v
        return rows

    def read(pf):
        tr, by = pf["_transition"], {h["ticker"]: h for h in pf["holdings"]}
        return {"forced": tr.get("forced_exits") or [], "in": [{"t": a["ticker"], "n": a.get("name"), "reg": a["region"],
                        **{k: by.get(a["ticker"], {}).get(k) for k in ("sector", "durability", "fcf_yield", "vol_3y", "weight", "perf_1y")}}
                       for a in tr.get("added", [])],
                "out": [{"t": d["ticker"], "n": d.get("name"), "reg": d["region"]} for d in tr.get("dropped", [])],
                "weights": {h["ticker"]: h["weight"] for h in pf["holdings"]}}

    raw = read(el.build_elite_portfolio())
    el._load_stocks = fetch_with_repair
    pf_clean = el.build_elite_portfolio()
    clean = read(pf_clean)
    el._load_stocks = orig_load
    return {"raw": raw, "clean": clean, "holes": holes,
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


if __name__ == "__main__":
    out = {"generated": date.today().isoformat(), "socle": _socle(_load("portfolios_elite.json")), "conviction": _conviction()}
    with open(os.path.join(DATA, "wave_preview.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"), default=str)
    s = out["socle"]
    print("socle tel quel  +", [x["t"] for x in s["raw"]["in"]], "-", [x["t"] for x in s["raw"]["out"]])
    print("socle sans trous +", [x["t"] for x in s["clean"]["in"]], "-", [x["t"] for x in s["clean"]["out"]], "trous", s["holes"])
    print("conviction +", [x["ticker"] for x in out["conviction"]["enter"]], "-", [(x["t"], x["g"]) for x in out["conviction"]["exit"]])
