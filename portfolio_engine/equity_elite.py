#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
equity_elite.py — portefeuille full-actions « meilleur des meilleurs », par EMPILEMENT DE FILTRES.
v2 : intègre la revue expert (portes sectorielles, départage par stabilité, ADV liquidité, historique,
     caps de diversification, sortie resserrée, funnel = TAG SEULEMENT — plus de tri par conviction).

DOCTRINE : juger l'entreprise pour ce qu'elle EST (valeur réelle + ratios sains), JAMAIS un classement
prédictif. Les scores = PORTES. La conviction FILTRE, ne CLASSE pas → funnel = tag, pas un tie-break.

Standalone : `python3 portfolio_engine/equity_elite.py`  → data/portfolios_elite.json
"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# --- PORTES (gates) ---
ROIC_MIN = 12.0         # non-financières : ROIC élevé (business à moat)
ROE_MIN_FIN = 12.0      # financières : ROE (le ROIC/D/E n'ont pas de sens — revue expert)
MARGIN_MIN = 0.0
DE_MAX = 2.5            # levier (non-financières)
ADV_MIN_USD = 5.0e6    # INVESTABILITÉ : volume $ quotidien ≥ 5 M$ (meilleur proxy que la seule mcap)
# --- diversification & taille ---
MAX_HOLDINGS = 40
MAX_PER_INDUSTRY = 2    # cap (contrainte), plus « 1 champion obligatoire par industrie »
REGION_REVIEW = 70.0    # pas de cap dur ; alerte de revue si une région > 70 %
# --- pondération : équipondéré + plafond de contribution au risque (écrête les plus volatils) ---
RISK_CAP_MULT = 1.5
# --- hystérésis (anti-turnover) ---
EXIT_ROIC = 8.0        # sortie à ROIC < 8 % (moitié de l'entrée), pas < 0 (revue expert)
PREV_FILE = os.path.join(DATA, "portfolios_elite.json")

FX_TO_USD = {
    "USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CHF": 1.10, "CAD": 0.73, "SGD": 0.74,
    "JPY": 0.0064, "TWD": 0.031, "HKD": 0.128, "KRW": 0.00074, "CNY": 0.138, "INR": 0.012,
    "IDR": 0.000063, "THB": 0.028, "PLN": 0.25, "ILS": 0.27, "ILA": 0.0027, "PKR": 0.0036,
    "TRY": 0.03, "QAR": 0.27, "ZAc": 0.00053, "PHP": 0.017, "HUF": 0.0028, "SAR": 0.27,
}
_FIN_RE = re.compile(r"bank|insurance|reinsurance|capital market|financial serv|asset manage|credit serv", re.I)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _is_fin(s):
    return bool(_FIN_RE.search((s.get("industry") or "") + " " + (s.get("sector_api") or "")))


def _adv_usd(s):
    """Volume quotidien en USD = volume(actions) × prix × FX. Proxy de liquidité (> market cap)."""
    vol, px, fx = _num(s.get("volume")), _num(s.get("price")), FX_TO_USD.get(s.get("data_currency"))
    return vol * px * fx if (vol and px and fx) else None


def _has_history(s):
    """≥ 3 ans de recul : stats 3Y présentes (exclut les IPO récentes type Slide Insurance 2025)."""
    return all(s.get(k) not in (None, "", "-") for k in ("perf_3y", "roic_std_3y", "max_drawdown_3y"))


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
    """Portes d'entrée — SECTORIELLES (financières jugées au ROE, pas au ROIC/D-E)."""
    if (s.get("durability_grade") or "") not in grades:
        return False
    if s.get("durability_mirage") is True:
        return False
    if (s.get("quality_grade") or "") not in ("A", "B"):
        return False
    if not _has_history(s):                          # historique ≥ 3 ans
        return False
    adv = _adv_usd(s)
    if adv is None or adv < ADV_MIN_USD:             # liquidité
        return False
    marg = _num(s.get("net_margin"))
    if marg is None or marg <= MARGIN_MIN:
        return False
    if _is_fin(s):                                   # FINANCIÈRES : ROE, pas ROIC/D-E
        roe = _num(s.get("roe_avg_3y")) or _num(s.get("roe"))
        return roe is not None and roe >= ROE_MIN_FIN
    roic, de = _num(s.get("roic_avg_3y")), _num(s.get("de_ratio"))
    if roic is None or roic < ROIC_MIN:
        return False
    if de is not None and de > DE_MAX:
        return False
    fcf = _num(s.get("fcf_yield"))                   # génère du cash (proxy anti-accruals ; FCF/RN indispo)
    if fcf is None or fcf <= 0:
        return False
    return True


def _passes_exit(s):
    """Porte de SORTIE (hystérésis) resserrée : durab A/B, pas mirage, rentabilité ≥ moitié de l'entrée."""
    if (s.get("durability_grade") or "") not in ("A", "B") or s.get("durability_mirage") is True:
        return False
    key = "roe_avg_3y" if _is_fin(s) else "roic_avg_3y"
    v = _num(s.get(key)) if s.get(key) is not None else _num(s.get("roe") if _is_fin(s) else s.get("roic_avg_3y"))
    return v is not None and v >= EXIT_ROIC


def _stability(s):
    """Instabilité du ROIC (ou ROE pour les financières) = écart-type / |moyenne|. Plus BAS = mieux."""
    if _is_fin(s):
        avg, std = _num(s.get("roe_avg_3y")), _num(s.get("roe_std_3y"))
    else:
        avg, std = _num(s.get("roic_avg_3y")), _num(s.get("roic_std_3y"))
    if avg is None or std is None or abs(avg) < 1e-6:
        return 9.99
    return abs(std / avg)


def _rank_key(s):
    """Départage LEXICOGRAPHIQUE, tout descriptif (revue expert E) :
       durabilité (A>B) → stabilité du ROIC (persistance) → FCF yield (valo, pas prédiction)."""
    bucket = 1 if (s.get("durability_grade") == "A") else 0
    fcf = _num(s.get("fcf_yield")) or 0.0
    return (bucket, -_stability(s), fcf)   # tri desc : bucket haut, instabilité basse, fcf haut


def build_elite_portfolio():
    rows = _load_stocks()
    funnel = _funnel_tickers()
    # clé (ticker, région) : les tickers numériques asiatiques se collisionnent → jamais par ticker seul
    by_key = {(str(s.get("ticker")), s["_region"]): s for s in rows if s.get("ticker")}

    # 1) POOL ELITE (portes sectorielles)
    pool = [s for s in rows if s.get("industry") and _passes_gates(s, ("A", "B"))]
    pool.sort(key=_rank_key, reverse=True)           # meilleur départage d'abord — SANS funnel (doctrine)

    # 2) SÉLECTION greedy : meilleurs globalement, CAP max 2 / industrie fine (contrainte, pas quota)
    per_ind = defaultdict(int)
    fresh = []
    for s in pool:
        ind = s["industry"]
        if per_ind[ind] >= MAX_PER_INDUSTRY:
            continue
        fresh.append(s)
        per_ind[ind] += 1
        if len(fresh) >= MAX_HOLDINGS:
            break

    # 3) HYSTÉRÉSIS : les tenus qui passent encore la SORTIE restent ; on complète avec du frais.
    held_keys = []
    if os.path.exists(PREV_FILE):
        try:
            held_keys = [tuple(k) for k in (json.load(open(PREV_FILE, encoding="utf-8")).get("_keys") or [])]
        except Exception:
            held_keys = []
    kept, seen_ind, chosen = [], defaultdict(int), set()
    for key in held_keys:                             # priorité aux positions tenues (anti-turnover)
        s = by_key.get(tuple(key))
        if s and _passes_exit(s) and s.get("industry") and seen_ind[s["industry"]] < MAX_PER_INDUSTRY:
            kept.append(s); chosen.add((str(s.get("ticker")), s["_region"])); seen_ind[s["industry"]] += 1
    n_held = len(kept)
    for s in fresh:                                   # complète jusqu'à MAX_HOLDINGS
        k = (str(s.get("ticker")), s["_region"])
        if k in chosen or seen_ind[s["industry"]] >= MAX_PER_INDUSTRY:
            continue
        if len(kept) >= MAX_HOLDINGS:
            break
        kept.append(s); chosen.add(k); seen_ind[s["industry"]] += 1
    final = kept

    # 4) POIDS : équipondéré + plafond de contribution au risque (écrête les plus volatils, sans tri)
    base = 100.0 / len(final) if final else 0.0
    vols = [v for v in (_num(s.get("volatility_3y")) for s in final) if v]
    med_vol = sorted(vols)[len(vols) // 2] if vols else None
    raw = {}
    for s in final:
        w = base
        vol = _num(s.get("volatility_3y"))
        if med_vol and vol and vol > 0:
            w = min(base, base * med_vol * RISK_CAP_MULT / vol)
        raw[str(s.get("ticker"))] = w
    tot = sum(raw.values()) or 1.0
    weights = {tk: round(w / tot * 100, 2) for tk, w in raw.items()}   # renormalisé à 100 %

    def row(s):
        tk = str(s.get("ticker"))
        fin = _is_fin(s)
        return {
            "ticker": tk, "name": s.get("name"), "region": s["_region"], "industry": s.get("industry"),
            "weight": weights.get(tk), "durability": s.get("durability_grade"),
            "durability_score": _num(s.get("durability_score")), "quality": s.get("quality_grade"),
            "fin": fin, "roic_or_roe": _num(s.get("roe_avg_3y") if fin else s.get("roic_avg_3y")),
            "stability": round(_stability(s), 2), "fcf_yield": _num(s.get("fcf_yield")),
            "vol_3y": _num(s.get("volatility_3y")), "adv_musd": round((_adv_usd(s) or 0) / 1e6, 1),
            "funnel": funnel.get(tk), "held_hysteresis": tk in {str(x.get("ticker")) for x in kept[:n_held]},
        }
    holdings = [row(s) for s in final]
    holdings.sort(key=lambda r: (-(r["weight"] or 0), -(r["durability_score"] or 0)))
    from collections import Counter
    reg = Counter(h["region"] for h in holdings)
    max_reg = max((100 * v / len(holdings)) for v in reg.values()) if holdings else 0

    return {
        "holdings": holdings, "_holdings": [h["ticker"] for h in holdings],
        "_keys": [[h["ticker"], h["region"]] for h in holdings],
        "n": len(holdings), "pool_size": len(pool), "n_held_hysteresis": n_held,
        "total_pct": round(sum(h["weight"] or 0 for h in holdings), 1),
        "region_split": dict(reg), "max_region_pct": round(max_reg, 0),
        "region_review_flag": max_reg > REGION_REVIEW,
        "n_financials": sum(1 for h in holdings if h["fin"]), "n_funnel": sum(1 for h in holdings if h["funnel"]),
    }


def main():
    pf = build_elite_portfolio()
    print(f"\n### PORTEFEUILLE ELITE FULL-ACTIONS (v2 — revue expert) ###\n")
    print(f"Pool elite (portes sectorielles + historique + ADV) : {pf['pool_size']}")
    print(f"Portefeuille : {pf['n']} lignes, {pf['total_pct']}% | régions {pf['region_split']}"
          + (f"  ⚠ REVUE (>{REGION_REVIEW:.0f}% sur une région)" if pf["region_review_flag"] else ""))
    print(f"  financières (jugées au ROE) : {pf['n_financials']} · tags funnel : {pf['n_funnel']}"
          + (f" · maintenus hystérésis : {pf['n_held_hysteresis']}" if pf["n_held_hysteresis"] else ""))
    print(f"\n{'TICKER':<8}{'POIDS':>6}  {'NOM':<26}{'RÉG':<7}{'D':<2}{'Q':<2}{'ROIC/E':>7}{'STAB':>6}{'FCF%':>6}{'VOL%':>6}  IND")
    for h in pf["holdings"]:
        fn = f" 🧭{h['funnel']}" if h["funnel"] else ""
        fin = "ᶠ" if h["fin"] else " "
        print(f"{h['ticker']:<8}{h['weight']:>5}%  {str(h['name'])[:25]:<26}{h['region']:<7}"
              f"{h['durability']}{fin}{h['quality']:<2}{int(h['roic_or_roe'] or 0):>6} {h['stability']:>5}"
              f"{round(h['fcf_yield'] or 0,1):>6}{int(h['vol_3y'] or 0):>6}  {str(h['industry'])[:20]}{fn}")
    with open(PREV_FILE, "w", encoding="utf-8") as f:
        json.dump(pf, f, ensure_ascii=False, indent=2)
    print(f"\n✅ écrit → data/portfolios_elite.json")


if __name__ == "__main__":
    main()
