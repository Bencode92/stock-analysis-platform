#!/usr/bin/env python3
"""
DIAGNOSTIC §15 (revue expert 2026-09-16, Q1) — fiche DESCRIPTIVE pour les tenus du socle en sous-performance
(≤ −20 % sur un an) ou nommés à surveiller. Aucune conséquence sur la sélection (clé gelée) : la fiche dit si
« les comptes tiennent / se dégradent » et quelle porte de SORTIE serait la plus proche de casser, pour que la vague
de décembre soit comprise et non subie.

Sortie : data/elite_diagnostic.json (+ résumé console).
"""
import json, os, statistics, sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UNDERPERF = -20.0
WATCH = {"ADBE", "G", "REY", "PUB"}      # franchises en re-notation IA (revue 16/09) — surveillées quelle que soit la perf
EXIT_ROIC, DRAWDOWN_HELD, PERSIST_HELD, ND_MAX, ADV_EXIT = 8.0, 40.0, 10.0, 3.0, 3.0e6
FX = {"USD": 1.0, "EUR": 1.08, "GBP": 1.27, "GBp": 0.0127, "CHF": 1.13, "SEK": 0.095, "NOK": 0.093, "DKK": 0.145, "PLN": 0.25}


def _num(v):
    try:
        f = float(v); return f if f == f else None
    except (TypeError, ValueError):
        return None


def _load(n):
    with open(os.path.join(DATA, n), encoding="utf-8") as f:
        return json.load(f)


def _median(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if len(xs) >= 5 else None


def _trend(series, n=3):
    """(dernier, moyenne des n précédents) sur une série ordonnée du plus récent au plus ancien."""
    s = [x for x in (series or []) if isinstance(x, (int, float))]
    if len(s) < 2:
        return None, None
    return s[0], statistics.mean(s[1:1 + n])


def main():
    elite = _load("portfolios_elite.json")
    rows = []
    for fn, reg in (("stocks_us.json", "US"), ("stocks_europe.json", "Europe")):
        for s in _load(fn).get("stocks", []):
            s["_region"] = reg; rows.append(s)
    by = {(str(s.get("ticker")), s["_region"]): s for s in rows}
    cache = _load("fundamentals_cache.json")["data"]
    fin = lambda s: (s.get("sector_api") or "") == "Financial Services"
    # médianes d'industrie (ROIC 3 ans, marge nette) sur tout l'univers US+Europe
    ind = {}
    for s in rows:
        k = s.get("industry")
        ind.setdefault(k, {"roic": [], "nm": []})
        ind[k]["roic"].append(_num(s.get("roic_avg_3y"))); ind[k]["nm"].append(_num(s.get("net_margin")))

    fiches = []
    for h in elite["holdings"]:
        s = by.get((h["ticker"], h["region"]))
        if not s:
            continue
        p1y = _num(s.get("perf_1y"))
        if not ((p1y is not None and p1y <= UNDERPERF) or h["ticker"] in WATCH):
            continue
        c = cache.get(f"{h['ticker']}:{(s.get('country') or '').lower()}") or {}
        rev_last, rev_prev = _trend(c.get("yearly_revenue"))
        nm_last, nm_prev = _trend(c.get("yearly_net_margin"))
        key = "yearly_roe" if fin(s) else "yearly_roic"
        r_last, r_prev = _trend(c.get(key))
        med = ind.get(s.get("industry"), {})
        roic3 = _num(s.get("roe_avg_3y" if fin(s) else "roic_avg_3y"))
        # portes de SORTIE (tenu) : distance au seuil, en % du seuil — la plus petite = la plus proche de casser
        dist = {}
        if roic3 is not None: dist["ROIC/ROE < 8"] = (roic3 - EXIT_ROIC) / EXIT_ROIC
        dd = _num(s.get("roe_drawdown_6y" if fin(s) else "roic_drawdown_6y"))
        if dd is not None: dist["drawdown ROIC > 40"] = (DRAWDOWN_HELD - dd) / DRAWDOWN_HELD
        nd = _num(s.get("net_debt_to_ebit"))
        if nd is not None and not fin(s): dist["ND/EBIT > 3"] = (ND_MAX - nd) / ND_MAX
        fcf = _num(s.get("fcf_yield"))
        if fcf is not None and not fin(s): dist["FCF ≤ 0"] = fcf / 3.0
        v = (_num(s.get("average_volume")) or _num(s.get("volume")) or 0) * (_num(s.get("price")) or 0) * FX.get(s.get("data_currency"), 0)
        if v: dist["ADV < 3 M$"] = (v - ADV_EXIT) / ADV_EXIT
        if s.get("durability_grade") not in ("A", "B"): dist["durabilité hors A/B"] = 0.0
        nearest = min(dist.items(), key=lambda kv: kv[1]) if dist else (None, None)
        # verdict DESCRIPTIF : les comptes tiennent si CA ≥ 97 % de la moyenne précédente ET rentabilité ≥ 85 % ET marge pas en chute > 20 %
        checks = []
        if rev_last is not None and rev_prev: checks.append(("CA", rev_last / rev_prev))
        if r_last is not None and r_prev: checks.append(("ROIC/ROE", r_last / r_prev))
        if nm_last is not None and nm_prev and nm_prev > 0: checks.append(("marge nette", nm_last / nm_prev))
        weak = [k for k, r in checks if r < (0.97 if k == "CA" else 0.85 if k == "ROIC/ROE" else 0.80)]
        verdict = "comptes : tiennent" if checks and not weak else ("comptes : se dégradent (" + ", ".join(weak) + ")" if weak else "comptes : données insuffisantes")
        fiches.append({
            "ticker": h["ticker"], "name": h.get("name"), "region": h["region"], "industry": s.get("industry"), "weight": h["weight"],
            "why": "sous-performance 1 an" if (p1y is not None and p1y <= UNDERPERF) else "franchise en re-notation IA (surveillance)",
            "perf_1y": p1y, "perf_ytd": _num(s.get("perf_ytd")), "max_drawdown_3y": _num(s.get("max_drawdown_3y")),
            "revenue_last": rev_last, "revenue_prev_avg": rev_prev, "revenue_ratio": round(rev_last / rev_prev, 3) if rev_last and rev_prev else None,
            "net_margin_last": nm_last, "net_margin_prev_avg": nm_prev, "net_margin_industry_median": _median(med.get("nm", [])),
            "roic_last": r_last, "roic_prev_avg": r_prev, "roic_avg_3y": roic3, "roic_industry_median": _median(med.get("roic", [])),
            "exit_gates_distance_pct": {k: round(v * 100, 1) for k, v in dist.items()},
            "nearest_exit_gate": nearest[0], "nearest_exit_margin_pct": round(nearest[1] * 100, 1) if nearest[1] is not None else None,
            "verdict": verdict,
        })
    out = {"as_of": date.today().isoformat(), "rule": "§15 diagnostic — descriptif, sans effet sur la sélection (clé gelée jusqu'au 2027-09-14)",
           "threshold_perf_1y": UNDERPERF, "watch_list": sorted(WATCH), "n": len(fiches), "fiches": fiches}
    with open(os.path.join(DATA, "elite_diagnostic.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"### DIAGNOSTIC §15 — {len(fiches)} fiche(s) ###")
    for f_ in fiches:
        rr = f"CA {f_['revenue_ratio']:.2f}×" if f_["revenue_ratio"] else "CA n/a"
        print(f"  {f_['ticker']:5} {str(f_['name'])[:24]:24} 1a {f_['perf_1y'] if f_['perf_1y'] is not None else 'n/a':>6}  {rr:9} ROIC {f_['roic_last'] and round(f_['roic_last'])} vs {f_['roic_prev_avg'] and round(f_['roic_prev_avg'])} (ind. méd. {f_['roic_industry_median'] and round(f_['roic_industry_median'])})  → {f_['verdict']} · porte la plus proche : {f_['nearest_exit_gate']} ({f_['nearest_exit_margin_pct']} % de marge)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
