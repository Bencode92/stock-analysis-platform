#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
equity_elite.py — portefeuille full-actions « meilleur des meilleurs », par EMPILEMENT DE FILTRES.

DOCTRINE (cf mémoire) : on JUGE l'entreprise pour ce qu'elle EST (valeur réelle + ratios sains),
JAMAIS par un classement prédictif backtesté (« composite = FILTRE, pas ranking »). Le portefeuille
= les survivants des portes, resserrés par diversification structurelle (champion d'industrie),
équipondérés (A cœur / B extension). Le funnel = tag, pas un poids. Hystérésis = anti-turnover.

Standalone : `python3 portfolio_engine/equity_elite.py`  → data/portfolios_elite.json
"""
import json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# --- PORTES (gates) — seuils = doctrine (logique AVANT chiffre), pas backtestés ---
ROIC_MIN = 12.0         # ROIC élevé (vrai business à moat, pas juste ≥ coût du capital)
MAX_HOLDINGS = 40       # taille cible du portefeuille ; coupe au top-N (durabilité puis ROIC)
MARGIN_MIN = 0.0        # marge nette réellement positive
DE_MAX = 2.5            # levier maîtrisé
MCAP_MIN = 2.0e9        # INVESTABILITÉ : ≥ 2 Md USD (exclut les micro-caps illiquides où le score sature)
# market_cap est en DEVISE LOCALE (piège cross-devise) → normaliser via data_currency.
FX_TO_USD = {
    "USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CHF": 1.10, "CAD": 0.73, "SGD": 0.74,
    "JPY": 0.0064, "TWD": 0.031, "HKD": 0.128, "KRW": 0.00074, "CNY": 0.138, "INR": 0.012,
    "IDR": 0.000063, "THB": 0.028, "PLN": 0.25, "ILS": 0.27, "ILA": 0.0027, "PKR": 0.0036,
    "TRY": 0.03, "QAR": 0.27, "ZAc": 0.00053, "PHP": 0.017, "HUF": 0.0028, "SAR": 0.27,
}


def _mcap_usd(s):
    """market_cap normalisé en USD via data_currency. None si devise inconnue (exclu, prudent)."""
    m = _num(s.get("market_cap"))
    fx = FX_TO_USD.get(s.get("data_currency"))
    return m * fx if (m is not None and fx is not None) else None
QUALITY_OK = ("A", "B")  # qualité peer-relative
DURAB_CORE = "A"        # cœur = durabilité A ; extension = B
DURAB_EXT = "B"
# --- diversification & taille ---
MAX_PER_INDUSTRY = 1    # le CHAMPION de chaque industrie (meilleure durabilité du secteur)
REGION_CAP = 0.45       # max 45 % des lignes par région (évite le tout-Asie)
NAME_CAP = 5.0          # cap par ligne (%)
# --- hystérésis (anti-turnover) : un nom TENU sort seulement s'il casse la porte de SORTIE ---
PREV_FILE = os.path.join(DATA, "portfolios_elite.json")


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _load_stocks():
    rows = []
    for f in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        p = os.path.join(DATA, f)
        if not os.path.exists(p):
            continue
        j = json.load(open(p, encoding="utf-8"))
        arr = j if isinstance(j, list) else j.get("stocks", [])
        reg = {"stocks_us.json": "US", "stocks_europe.json": "Europe", "stocks_asia.json": "Asie"}[f]
        for s in arr:
            s["_region"] = reg
            rows.append(s)
    return rows


def _funnel_tickers():
    try:
        fw = json.load(open(os.path.join(DATA, "framework.json"), encoding="utf-8"))
    except FileNotFoundError:
        return {}
    tags = {}
    for t in fw.get("themes", []):
        for m in t.get("maillons", []):
            for c in m.get("companies", []):
                if c.get("ticker"):
                    tags.setdefault(str(c["ticker"]), t.get("key"))
    return tags


def _passes_gates(s, grades):
    """Porte d'ENTRÉE (stricte) : anti-piège + qualité + rentabilité + solidité."""
    if (s.get("durability_grade") or "") not in grades:
        return False
    if s.get("durability_mirage") is True:              # grade pairs flatté = rejeté
        return False
    if (s.get("quality_grade") or "") not in QUALITY_OK:
        return False
    mcap = _mcap_usd(s)                              # investabilité (taille/liquidité), FX-normalisé
    if mcap is None or mcap < MCAP_MIN:
        return False
    roic, marg, de = _num(s.get("roic_avg_3y")), _num(s.get("net_margin")), _num(s.get("de_ratio"))
    if roic is None or roic < ROIC_MIN:
        return False
    if marg is None or marg <= MARGIN_MIN:
        return False
    if de is not None and de > DE_MAX:
        return False
    return True


def _passes_exit(s):
    """Porte de SORTIE (souple, hystérésis) : un nom tenu reste tant qu'il n'est pas cassé.
    Sort si durabilité C/D, mirage, ROIC négatif, ou marge négative."""
    if (s.get("durability_grade") or "") not in ("A", "B"):
        return False
    if s.get("durability_mirage") is True:
        return False
    roic, marg = _num(s.get("roic_avg_3y")), _num(s.get("net_margin"))
    if roic is None or roic < 0 or marg is None or marg <= 0:
        return False
    return True


def build_elite_portfolio():
    rows = _load_stocks()
    funnel = _funnel_tickers()
    by_tk = {str(s.get("ticker")): s for s in rows if s.get("ticker")}

    # 1) POOL ELITE (porte d'entrée A+B)
    pool = [s for s in rows if _passes_gates(s, ("A", "B")) and s.get("industry")]

    # 2) CHAMPION par industrie fine : meilleure DURABILITÉ du secteur (sélection structurelle
    #    intra-industrie = tiebreak de qualité, PAS un ranking de rendement).
    champ_by_ind = {}
    for s in pool:
        ind = s["industry"]
        cur = champ_by_ind.get(ind)
        if cur is None or (_num(s.get("durability_score")) or 0) > (_num(cur.get("durability_score")) or 0):
            champ_by_ind[ind] = s
    champions = list(champ_by_ind.values())

    # 3) HYSTÉRÉSIS : on garde les noms précédemment tenus qui passent encore la porte de SORTIE
    #    (même s'ils ne sont plus champions) → anti-turnover. Nouveaux champions ajoutés en plus.
    held_prev = set()
    kept_held = []
    if os.path.exists(PREV_FILE):
        try:
            prev = json.load(open(PREV_FILE, encoding="utf-8"))
            for tk in (prev.get("_holdings") or []):
                held_prev.add(str(tk))
        except Exception:
            pass
    selected = {}
    for s in champions:
        selected[str(s["ticker"])] = s
    for tk in held_prev:
        if tk not in selected and tk in by_tk and _passes_exit(by_tk[tk]):
            kept_held.append(tk)
            selected[tk] = by_tk[tk]

    sel = list(selected.values())

    # 4) CAP RÉGION (souple) : si une région > REGION_CAP des lignes, on coupe les plus faibles
    #    (par durabilité) de cette région en surnombre. Priorité de maintien : funnel > durabilité.
    n_total = len(sel)
    cap_n = int(n_total * REGION_CAP) + 1
    by_reg = defaultdict(list)
    for s in sel:
        by_reg[s["_region"]].append(s)
    final = []
    for reg, lst in by_reg.items():
        if len(lst) <= cap_n:
            final.extend(lst)
        else:
            lst.sort(key=lambda s: (str(s.get("ticker")) in funnel, _num(s.get("durability_score")) or 0), reverse=True)
            final.extend(lst[:cap_n])

    # 4b) COUPE au top-N : « meilleur des meilleurs » → on garde les MAX_HOLDINGS plus solides.
    #     Ordre = funnel d'abord (tag prioritaire), puis durabilité, puis ROIC (qualité réelle, pas
    #     un pari de rendement). Les noms tenus par hystérésis restent prioritaires (anti-turnover).
    _held_set = set(kept_held)
    final.sort(key=lambda s: (
        str(s.get("ticker")) in _held_set,
        str(s.get("ticker")) in funnel,
        _num(s.get("durability_score")) or 0,
        _num(s.get("roic_avg_3y")) or 0,
    ), reverse=True)
    final = final[:MAX_HOLDINGS]

    # 5) TIERS + POIDS : A = cœur (poids plein), B = extension (demi-poids). Équipondéré dans le tier.
    core = [s for s in final if (s.get("durability_grade") or "") == DURAB_CORE]
    ext = [s for s in final if (s.get("durability_grade") or "") == DURAB_EXT]
    nA, nB = len(core), len(ext)
    unit = 100.0 / (nA + nB / 2.0) if (nA + nB) else 0.0
    wA = min(unit, NAME_CAP)
    wB = min(unit / 2.0, NAME_CAP)

    def row(s, tier, w):
        return {
            "ticker": str(s.get("ticker")), "name": s.get("name"), "region": s["_region"],
            "industry": s.get("industry"), "tier": tier, "weight": round(w, 2),
            "durability": s.get("durability_grade"), "durability_score": _num(s.get("durability_score")),
            "quality": s.get("quality_grade"), "roic": _num(s.get("roic_avg_3y")),
            "net_margin": _num(s.get("net_margin")), "funnel": funnel.get(str(s.get("ticker"))),
            "held_hysteresis": str(s.get("ticker")) in kept_held,
        }
    holdings = [row(s, "core", wA) for s in core] + [row(s, "extension", wB) for s in ext]
    holdings.sort(key=lambda r: (-{"core": 1, "extension": 0}[r["tier"]], -(r["durability_score"] or 0)))
    total = round(sum(h["weight"] for h in holdings), 1)

    return {
        "holdings": holdings, "_holdings": [h["ticker"] for h in holdings],
        "n_core": nA, "n_extension": nB, "total_pct": total,
        "pool_size": len(pool), "n_industries": len(champ_by_ind), "n_held_hysteresis": len(kept_held),
        "weights": {"core": round(wA, 2), "extension": round(wB, 2)},
    }


def main():
    pf = build_elite_portfolio()
    print(f"\n### PORTEFEUILLE ELITE FULL-ACTIONS (v1) ###\n")
    print(f"Pool elite (portes A+B) : {pf['pool_size']} · {pf['n_industries']} industries")
    print(f"Portefeuille : {pf['n_core']} cœur (A, {pf['weights']['core']}%) + {pf['n_extension']} "
          f"extension (B, {pf['weights']['extension']}%) = {pf['n_core']+pf['n_extension']} lignes, {pf['total_pct']}%")
    if pf["n_held_hysteresis"]:
        print(f"  (dont {pf['n_held_hysteresis']} maintenus par hystérésis — anti-turnover)")
    from collections import Counter
    print("  répartition région :", dict(Counter(h["region"] for h in pf["holdings"])))
    print("  dont dans le funnel :", sum(1 for h in pf["holdings"] if h["funnel"]))
    print("\n— aperçu (cœur A, top durabilité) —")
    for h in [x for x in pf["holdings"] if x["tier"] == "core"][:20]:
        fn = f" 🎯{h['funnel']}" if h["funnel"] else ""
        print(f"   {h['ticker']:<8}{h['weight']:>5}%  {str(h['name'])[:26]:<27}{h['region']:<7}"
              f"dur{h['durability']}({int(h['durability_score'] or 0)}) Q{h['quality']} "
              f"roic{int(h['roic'] or 0)} {str(h['industry'])[:22]}{fn}")
    with open(os.path.join(DATA, "portfolios_elite.json"), "w", encoding="utf-8") as f:
        json.dump(pf, f, ensure_ascii=False, indent=2)
    print(f"\n✅ écrit → data/portfolios_elite.json (revue ; portfolios.json intact)")


if __name__ == "__main__":
    main()
