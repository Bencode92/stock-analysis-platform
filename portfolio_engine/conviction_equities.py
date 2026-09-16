#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
conviction_equities.py — PILIER 3 « Actions-Conviction » : 100 % actions, enablers du funnel, sains, à prix raisonnable.

DOCTRINE (revue expert 2026-09-14/15, docs/CONVICTION_ACTIONS_EXPERT_BRIEF_2026-09-14.md + artefacts) :
  - Le SLEEVE N'ACCEPTE QUE LE MAILLON : seules les sociétés nommées dans une chaîne du funnel (framework.json)
    sont candidates. Le SCREEN par industrie est un RADAR : il PROPOSE (journal), jamais une ligne. Deux statuts,
    jamais un seul (revue expert 2026-09-15) :
      · maillon nommé → candidat automatique ;
      · trouvé par le screen → proposition, jusqu'à QUALIFICATION = porte, pas une phrase : preuve chiffrée
        (≥ 50 % du CA ou du carnet sur le maillon, source citée), ≤ 2 adoptions/an issues du screen, entrée dans
        la fiche du thème (framework = source de vérité), journal des refus (data/conviction_screen_refusals.json).
    Un thème sans enabler éligible reste VIDE — pas de remplisseur, budget laissé de côté, jamais redistribué.
  - SAIN = bilan + trajectoire : durabilité A/B sans mirage · dette nette / EBIT ≤ 4 (proxy d'EBITDA ≤ 3 ;
    fonds propres négatifs → ≤ 2) · marge de FCF ≥ 5 % du CA sur le dernier exercice ET FCF ≥ 0 l'exercice
    précédent (tableau de flux, jamais le champ « statistics ») · ROIC 3 ans ≥ 10 % OU marge en hausse 3 ans ·
    ADV ≥ 5 M$ · ≥ 3 ans de cotation.
  - PRIX relatif à l'industrie : EV/EBIT ≤ 2,5× la médiane (porte d'absurdité) ; budget « cher » (> 1,5×) ≤ 30 % ;
    le prix DÉPARTAGE dans le thème après l'ordre de maillon. EV/EBIT < 0,25× = artefact → écarté.
  - PÉRIMÈTRE : US + Europe + Asie (places accessibles, Benoit 15/09) · une entité = une ligne · EXCLUSION du socle
    (priorité socle, règle Q6) · pas d'ETF (Benoit).
  - POIDS : thème = stance (ACTIF 1 · PROGRESSIF/SÉLECTIF ½ · BORNÉ ⅓) normalisée, cap 30 % ; lignes ∝ poids ;
    équipondéré dans le thème ; 7 % max par ligne.
  - THÈSE avant chaîne : la défense est une thèse EUROPÉENNE « composants > primes » → sleeve scope Europe,
    maillons composants d'abord (revue expert 15/09 point 3). LMT/GD restent éligibles, en file « hors thèse ».
  - RYTHME : vagues trimestrielles ≤ 5 changements ; entre deux vagues le run reproduit la liste.

Sorties : data/portfolios_conviction_equities.json + profil « Actions-Conviction » dans data/portfolios.json.
CONVICTION_DRY=1 → aperçu sans écriture. CONVICTION_FORCE_WAVE=1 → vague déclenchée.
"""
import json, math, os, re, statistics, sys
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT_FILE = os.path.join(DATA, "portfolios_conviction_equities.json")

N_LINES = 20
THEME_CAP, LINE_CAP = 0.30, 0.07
ND_EBIT_MAX, ND_EBIT_MAX_NEG_EQ = 4.0, 2.0
FCF_MARGIN_MIN = 5.0
ABSURD_REL, CHER_REL, CHER_BUDGET = 2.5, 1.5, 0.30
REL_ARTEFACT = 0.25
ADV_MIN_USD, HISTORY_MIN_DAYS = 5e6, 750
WAVE_DAYS, MAX_CHANGES = 90, 5
DRY = os.environ.get("CONVICTION_DRY") == "1"
FORCE_WAVE = os.environ.get("CONVICTION_FORCE_WAVE") == "1"

# stance → multiplicateur (doctrine conviction_sleeves) ; VEILLE = 0 ; emerging = bucket géo, pas un sleeve
STANCE_MULT = {"ACTIF": 1.0, "PROGRESSIF": 0.5, "SÉLECTIF": 0.5, "BORNÉ": 0.33, "VEILLE": 0.0}
STANCE_OVERRIDE = {"materials": "BORNÉ", "robotics": "VEILLE"}
THEME_LABEL = {"ai_infra": "IA-infra", "nuclear": "Nucléaire", "grid": "Réseau électrique",
               "semi": "Semi-conducteurs", "defense": "Défense", "materials": "Métaux",
               "emerging": "Asie émergente"}   # 15/09 : Asie accessible en direct → thème du funnel activé (PROGRESSIF)
# Industries enablers — périmètre du RADAR (propositions) et médianes de prix. Seuls les maillons du funnel entrent.
ADOPTIONS_PER_YEAR_MAX = 2       # plafond d'adoptions issues du screen (comme « max 2 ajouts/an » des ETF)
PROOF_SHARE_MIN = 50.0           # preuve chiffrée : ≥ 50 % du CA / carnet sur le maillon
# Q3 expert 16/09 — l'exposition au maillon s'applique AUSSI aux maillons nommés (sinon le framework est une porte dérobée) :
# ≥ 50 % du CA → plein ; 20-50 % → demi-poids ; < 20 % → pas un maillon. Champ `maillon_share_pct` sur la fiche société ;
# absent → plein mais « exposition à documenter » (même échéance que les preuves du screen).
EXPOSURE_FULL, EXPOSURE_HALF = 50.0, 20.0
EXPOSURE_DEADLINE = "2026-12-14"
INACCESSIBLE_MICS = {"XMIL", "XSTO", "XCSE", "XHEL", "XOSL"}       # porte 0 (Benoit 16/09) : Milan + places nordiques absentes de Trading 212
BLOC_SOCLE_PCT = 75                # répartition du bloc actions (expert 16/09) : 75 socle / 25 conviction, fixe hors changement de stance
ENABLER_INDUSTRIES = {
    "Semiconductor Equipment & Materials": "semi", "Semiconductors": "semi",
    "Electrical Equipment & Parts": "grid", "Specialty Industrial Machinery": "grid",
    "Engineering & Construction": "grid", "Electronic Components": "ai_infra",
    "Aerospace & Defense": "defense", "Uranium": "nuclear",
    "Utilities - Independent Power Producers": "nuclear",
    "Copper": "materials", "Other Industrial Metals & Mining": "materials",
}
# THÈSE avant chaîne : périmètre géographique du sleeve et ordre de maillons prioritaires
THEME_SCOPE = {"defense": {"regions": {"Europe"}, "maillon_first": ["②", "③"]}}
THEME_NOTE = {
    "ai_infra": "Exprimé sur les maillons ADJACENTS (connecteurs, générateurs) ; le cœur power & cooling "
                "(Vertiv, nVent, GE Vernova) reste hors portes (prix). Seul endroit où un sleeve spéculatif ≤ 5 % aurait un sens.",
    "nuclear": "Combustible et exploitants en phase capex : chers ou FCF négatif sur plusieurs exercices. Non exprimable en actions saines.",
    "materials": "Mineurs cycliques : trajectoire et FCF instables. Non exprimable en actions saines.",
    "emerging": "Thèse du funnel : l'expo semi se prend ICI (péage IA Taïwan/Corée/Japon), pas dans les valeurs US chères. "
                "Chine : conso domestique et champions, jamais l'export en guerre des prix. Change non couvert (TWD, KRW, HKD). "
                "Taïwan = risque géopolitique binaire (assumé, borné par le plafond de ligne).",
    "defense": "Thèse EUROPÉENNE, composants > primes : sleeve scope Europe. Les primes US éligibles (LMT, GD) restent en file « hors thèse ».",
    "semi": "Thèse « l'amont capte la valeur » (ASML, KLA, Lam — pas le chip médiatisé). SCÉNARIO ADVERSE N°1 : si Nvidia "
            "continue de prendre la marge que l'équipement ne prend pas, ce sleeve sous-performe le Nasdaq pendant des années, "
            "et on le saura chaque trimestre. Risque de conviction, pas défaut de méthode.",
}
# table FX = copie de equity_elite.FX_TO_USD (import du paquet impossible ici : portfolio_engine/calendar.py masque le stdlib)
FX_TO_USD = {
    "USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CHF": 1.10, "CAD": 0.73, "SGD": 0.74,
    "JPY": 0.0064, "TWD": 0.031, "HKD": 0.128, "KRW": 0.00074, "CNY": 0.138, "INR": 0.012,
    "IDR": 0.000063, "THB": 0.028, "PLN": 0.25, "ILS": 0.27, "ILA": 0.0027, "PKR": 0.0036,
    "TRY": 0.03, "QAR": 0.27, "ZAc": 0.00053, "PHP": 0.017, "HUF": 0.0028, "SAR": 0.27,
}
FX_MCAP_TO_REPORT = {}   # capitalisation (devise de cotation) vs comptes (devise de reporting) : identique sauf ADR


def _num(v):
    try:
        return float(v) if v not in (None, "", "-") else None
    except (TypeError, ValueError):
        return None


def _load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _stance(theme):
    key = theme["key"]
    if key in STANCE_OVERRIDE:
        return STANCE_OVERRIDE[key]
    s = (theme.get("position") or "").upper().strip()
    # la stance est le PREMIER mot de `position` (« ACTIF long terme (… SMR en veille) » = ACTIF, pas VEILLE)
    head = s.split()[0] if s else ""
    for word, st in (("VEILLE", "VEILLE"), ("BORN", "BORNÉ"), ("SELECT", "SÉLECTIF"), ("SÉLECT", "SÉLECTIF"),
                     ("PROGRESSIF", "PROGRESSIF"), ("ACTIF", "ACTIF"), ("PLEIN", "ACTIF")):
        if head.startswith(word):
            return st
    return "ACTIF"


def _adv_usd(s):
    v = _num(s.get("average_volume")) or _num(s.get("volume"))   # volume moyen d'abord (intraday sinon)
    p, fx = _num(s.get("price")), FX_TO_USD.get(s.get("data_currency"))
    return v * p * fx if (v and p and fx) else None


_NOISE = re.compile(r"[^A-Z0-9]+")
def _entity(s):
    return _NOISE.sub("", (s.get("name") or "").upper())


def load_universe():
    """US + Europe, une entité = une ligne (cotation qui a des fondamentaux, puis la plus liquide), hors socle."""
    rows = []
    # porte 0 « place accessible » (16/09, confirmé Benoit) : US + Europe ; l'Asie passe par les ADR NYSE/Nasdaq du fichier US
    for reg, fn in (("US", "stocks_us.json"), ("Europe", "stocks_europe.json")):
        for s in _load(fn).get("stocks", []):
            if s.get("ticker") and (s.get("data_mic") or "") not in INACCESSIBLE_MICS:   # Milan absent de Trading 212
                s["_region"] = reg; rows.append(s)
    # ADR US doublon d'une cotation asiatique présente (TSM = 2330…) → on garde la cotation d'origine (Asie en direct)
    try:
        adr = _load("adr_home_listing.json")["adr"]
        present = {(str(s["ticker"]), s["_region"]) for s in rows}
        rows = [s for s in rows if not (s["_region"] == "US" and str(s["ticker"]) in adr and (adr[str(s["ticker"])]["home"], "Asie") in present)]
    except (FileNotFoundError, KeyError):
        pass
    groups = defaultdict(list)
    for s in rows:
        groups[_entity(s)].append(s)
    rows = [max(g, key=lambda s: ((_num(s.get("roic")) is not None or _num(s.get("roe")) is not None), _adv_usd(s) or 0))
            for g in groups.values()]
    socle = set()
    try:
        socle = {(h["ticker"], h["region"]) for h in _load("portfolios_elite.json")["holdings"]}
    except Exception:
        pass
    return [s for s in rows if (s["ticker"], s["_region"]) not in socle], socle


def _qualified(c, today):
    """Un adopté du screen n'est un MAILLON que si sa preuve est jointe (≥ 50 %, source) — ou tant que sa date
       limite n'est pas passée (adoptions expert du 15/09 : preuve à joindre avant la vague de décembre)."""
    a = c.get("adopted_from_screen")
    if not a:
        return True, None
    p = a.get("proof") or {}
    if _num(p.get("share_pct")) is not None and _num(p["share_pct"]) >= PROOF_SHARE_MIN and p.get("source"):
        return True, None
    dl = p.get("deadline")
    if dl and today <= date.fromisoformat(dl):
        return True, f"preuve à joindre avant {dl}"
    return False, "adopté du screen sans preuve chiffrée → retour au statut proposition"


def funnel_index(fw, today=None):
    """(ticker, région, pays) → (thème, indice de maillon, label, rôle) pour les enablers nommés ET qualifiés."""
    today = today or date.today(); idx = {}; adoptions = []; pending = []
    for t in fw["themes"]:
        for mi, m in enumerate(t["maillons"]):
            for c in m.get("companies", []):
                if not c.get("ticker") or c.get("region") not in ("US", "EU", "Asie"):
                    continue
                ok, why = _qualified(c, today)
                a = c.get("adopted_from_screen")
                if a and a.get("date") and (today - date.fromisoformat(a["date"])).days <= 365:
                    adoptions.append((a["date"], c["ticker"]))
                if not ok:
                    pending.append({"ticker": c["ticker"], "theme": t["key"], "why": why}); continue
                reg = {"US": "US", "EU": "Europe", "Asie": "Asie"}[c["region"]]
                key = (c["ticker"].upper(), reg, (c.get("country") or "").lower())
                entry = {"theme": t["key"], "maillon": mi, "label": m.get("label"), "role": c.get("role"), "proof_pending": why,
                         "share_pct": _num(c.get("maillon_share_pct")), "share_estimated": bool(c.get("maillon_share_estimated"))}
                first = THEME_SCOPE.get(t["key"], {}).get("maillon_first", [])
                rank = lambda lab: next((i for i, m0 in enumerate(first) if (lab or "").startswith(m0)), len(first))
                # société citée dans PLUSIEURS maillons (Thales : ① prime ET ③ électronique) → on retient celui que la
                # thèse met en avant (« composants > primes »), pas le premier de la liste
                # Société citée dans PLUSIEURS THÈMES : c'est le framework qui choisit (`primary_theme` sur la fiche
                # société), jamais le remplissage — les budgets de thèmes ne sont pas fongibles (expert 16/09).
                # Sans `primary_theme`, le premier thème du framework garde la société.
                pt = c.get("primary_theme")
                if key in idx and idx[key]["theme"] != t["key"]:
                    if pt == t["key"]:
                        idx[key] = entry
                    continue
                if key not in idx or rank(entry["label"]) < rank(idx[key]["label"]):
                    idx[key] = entry
    if len(adoptions) > ADOPTIONS_PER_YEAR_MAX:
        print(f"⚠️ {len(adoptions)} adoptions issues du screen sur 12 mois (plafond {ADOPTIONS_PER_YEAR_MAX}) : "
              + ", ".join(t for _, t in sorted(adoptions)) + " — les adoptions du 15/09 (revue expert) sont journalisées comme lot fondateur")
    return idx, pending


def build():
    fw = _load("framework.json")
    cache = _load("fundamentals_cache.json")["data"]
    cfc = _load("cashflow_cache.json") if os.path.exists(os.path.join(DATA, "cashflow_cache.json")) else {}
    rows, socle = load_universe()
    fidx, pending = funnel_index(fw)
    refusals = (_load("conviction_screen_refusals.json").get("refusals") if os.path.exists(os.path.join(DATA, "conviction_screen_refusals.json")) else {}) or {}
    themes = {t["key"]: t for t in fw["themes"]}
    stance = {k: _stance(t) for k, t in themes.items()}
    active = {k: STANCE_MULT[v] for k, v in stance.items() if STANCE_MULT.get(v, 0) > 0 and k in THEME_LABEL}
    tot = sum(active.values())
    tw = {k: min(THEME_CAP, v / tot) for k, v in active.items()}

    def cval(s):
        return cache.get(f"{s['ticker']}:{(s.get('country') or '').lower().strip()}") or {}

    # EV/EBIT et médianes par industrie (N ≥ 8) puis secteur
    # ADR dont les comptes viennent de la cotation d'origine (`_alias_of` = "2330:taïwan") : bilan en devise locale,
    # capitalisation en USD → on ramène la capitalisation dans la devise des comptes avant l'EV/EBIT.
    ALIAS_CCY = {"taïwan": "TWD", "japon": "JPY", "corée": "KRW", "hong kong": "HKD", "inde": "INR", "chine": "CNY", "singapour": "SGD"}
    def _mc_in_books_ccy(s, c):
        mc = _num(s.get("market_cap"))
        alias = c.get("_alias_of") or ""
        ccy = ALIAS_CCY.get(alias.split(":")[-1].strip().lower()) if ":" in alias else None
        if mc and ccy and (s.get("data_currency") or "USD") == "USD" and FX_TO_USD.get(ccy):
            return mc / FX_TO_USD[ccy]
        return mc
    for s in rows:
        c = cval(s); mc, ebit = _mc_in_books_ccy(s, c), c.get("operating_income")
        debt, cash = c.get("total_debt"), c.get("cash_and_st_investments") or 0
        s["_ev_ebit"] = ((mc + debt - cash) / ebit) if (mc and isinstance(ebit, (int, float)) and ebit > 0
                                                       and isinstance(debt, (int, float))) else None
    by_ind, by_sec = defaultdict(list), defaultdict(list)
    for s in rows:
        e = s["_ev_ebit"]
        if e and 0 < e < 200:
            by_ind[s.get("industry")].append(e); by_sec[s.get("sector_api")].append(e)
    med_ind = {k: statistics.median(v) for k, v in by_ind.items() if len(v) >= 8}
    med_sec = {k: statistics.median(v) for k, v in by_sec.items() if len(v) >= 8}

    def rel(s):
        e, m = s["_ev_ebit"], med_ind.get(s.get("industry")) or med_sec.get(s.get("sector_api"))
        return (e / m) if (e and m) else None

    def fcf_margin(s):
        cf = cfc.get(f"{s['ticker']}:{s['_region']}") or {}
        rev = (cval(s).get("yearly_revenue") or [None])[0]
        f = cf.get("fcf"); hist = cf.get("fcf_hist") or []
        prev_ok = (len(hist) < 2) or (hist[1] is None) or (hist[1] >= 0)
        m = (100.0 * f / rev) if (f is not None and isinstance(rev, (int, float)) and rev > 0) else None
        return m, prev_ok

    def gates(s):
        g, c = [], cval(s)
        if (s.get("durability_grade") or "") not in ("A", "B") or s.get("durability_mirage"):
            g.append("durabilité")
        a = _adv_usd(s)
        if a is None or a < ADV_MIN_USD: g.append("liquidité < 5 M$")
        if (_num(s.get("history_days")) or 0) < HISTORY_MIN_DAYS: g.append("jeune cotation")
        nd, eq = _num(s.get("net_debt_to_ebit")), c.get("total_equity")
        if nd is None:                                    # champ pas encore propagé (Asie) → calcul depuis le cache
            debt, cash, ebit = c.get("total_debt"), c.get("cash_and_st_investments") or 0, c.get("operating_income")
            if isinstance(debt, (int, float)) and isinstance(ebit, (int, float)) and ebit > 0:
                nd = round((debt - cash) / ebit, 2); s["net_debt_to_ebit"] = nd
        if nd is None: g.append("levier n/a")
        elif isinstance(eq, (int, float)) and eq < 0:
            if nd > ND_EBIT_MAX_NEG_EQ: g.append(f"fonds propres < 0 & ND/EBIT {nd:.1f}")
        elif nd > ND_EBIT_MAX: g.append(f"levier ND/EBIT {nd:.1f}")
        fm, prev_ok = fcf_margin(s)
        if fm is None or fm < FCF_MARGIN_MIN: g.append(f"marge FCF {('%.1f' % fm) if fm is not None else 'n/a'} %")
        elif not prev_ok: g.append("FCF négatif l'exercice précédent")
        roic = _num(s.get("roic_avg_3y"))
        nmh = [x for x in (c.get("yearly_net_margin") or []) if isinstance(x, (int, float))]
        trend = (nmh[0] - nmh[min(3, len(nmh) - 1)]) if len(nmh) >= 3 else None
        if not ((roic is not None and roic >= 10) or (trend is not None and trend > 0)): g.append("trajectoire")
        r = rel(s)
        if r is None: g.append("EV/EBIT n/a")
        elif r > ABSURD_REL: g.append(f"prix {r:.1f}×")
        elif r < REL_ARTEFACT: g.append("EV/EBIT artefact")
        return g

    cands = []
    for s in rows:
        key = (s["ticker"].upper(), s["_region"], (s.get("country") or "").lower())
        f = fidx.get(key)
        th, src = (f["theme"], "maillon") if f else (ENABLER_INDUSTRIES.get(s.get("industry")), "screen")
        if not th or th not in tw:
            continue
        fm, _ = fcf_margin(s)
        gf = gates(s)                                     # d'abord (calcule le levier depuis le cache si absent)
        share = f.get("share_pct") if f else None
        factor, expo_note = 1.0, None
        if f and share is not None:
            if share < EXPOSURE_HALF: gf.append(f"exposition au maillon {share:.0f} % < 20 % (pas un maillon)")
            elif share < EXPOSURE_FULL: factor, expo_note = 0.5, f"exposition {share:.0f} % → demi-poids"
            if f.get("share_estimated"): expo_note = (expo_note + " · " if expo_note else "") + f"estimation, source à joindre avant {EXPOSURE_DEADLINE}"
        elif f:
            expo_note = f"exposition au maillon à documenter avant {EXPOSURE_DEADLINE}"
        cands.append({"exposure_pct": share, "weight_factor": factor, "exposure_note": expo_note,
                      "ticker": s["ticker"], "region": s["_region"], "country": s.get("country"), "name": s.get("name"),
                      "theme": th, "src": src, "maillon": f["maillon"] if f else None,
                      "maillon_label": f["label"] if f else None, "role": f["role"] if f else None,
                      "industry": s.get("industry"), "ev_ebit": s["_ev_ebit"], "rel": rel(s), "fcf_margin": fm,
                      "nd_ebit": _num(s.get("net_debt_to_ebit")), "roic_3y": _num(s.get("roic_avg_3y")),
                      "rev_growth_3y": _num(s.get("revenue_growth_3y")), "durability": s.get("durability_grade"),
                      "durability_score": _num(s.get("durability_score")), "quality_score": _num(s.get("quality_score")),
                      "vol_3y": _num(s.get("volatility_3y")), "adv_musd": round((_adv_usd(s) or 0) / 1e6, 1),
                      "proof_pending": f.get("proof_pending") if f else None,
                      "refused": refusals.get(s["ticker"], {}).get("reason") if src == "screen" else None,
                      "gates_failed": gf})

    # ── sélection : maillon seulement, thèse (scope) avant chaîne, prix en départage ──
    def order_key(th):
        first = THEME_SCOPE.get(th, {}).get("maillon_first", [])
        def k(c):
            lab = c["maillon_label"] or ""
            pri = next((i for i, m in enumerate(first) if lab.startswith(m)), len(first))
            return (pri, c["maillon"] if c["maillon"] is not None else 99, c["rel"] or 9)
        return k

    selected, waiting = [], []
    for th, w in sorted(tw.items(), key=lambda kv: -kv[1]):
        scope = THEME_SCOPE.get(th, {}).get("regions")
        pool = [c for c in cands if c["theme"] == th and c["src"] == "maillon" and not c["gates_failed"]]
        in_scope = [c for c in pool if not scope or c["region"] in scope]
        in_scope.sort(key=order_key(th))
        k = max(1, math.ceil(N_LINES * w - 1e-9))   # ceil : un thème ne perd jamais une place à l'arrondi quand un autre s'active
        take, rest = in_scope[:k], in_scope[k:]
        for c in take:
            c["weight"] = round(min(LINE_CAP, w / k) * c.get("weight_factor", 1.0), 4)   # demi-poids : le reste va au « budget en attente de prix »
        selected += take
        for c in rest: c["wait_reason"] = "place prise par un maillon plus en amont"
        for c in pool:
            if scope and c["region"] not in scope: c["wait_reason"] = "hors thèse (" + "/".join(sorted(scope)) + ")"
        waiting += [c for c in pool if c not in take]
    total = round(sum(c["weight"] for c in selected), 4)
    cher = round(sum(c["weight"] for c in selected if (c["rel"] or 0) > CHER_REL), 4)
    assert cher <= CHER_BUDGET + 1e-9, "budget cher dépassé"

    # ── cadence : vagues trimestrielles ; entre deux vagues, on REPRODUIT ──
    prev = _load("portfolios_conviction_equities.json") if os.path.exists(OUT_FILE) else {}
    prev_keys = [tuple(k) for k in prev.get("_keys", [])]
    last_wave = (prev.get("_transition") or {}).get("wave_date")
    days = (date.today() - date.fromisoformat(last_wave)).days if last_wave else None
    wave_due = FORCE_WAVE or days is None or days >= WAVE_DAYS
    new_keys = [(c["ticker"], c["region"]) for c in selected]
    if not wave_due and prev_keys:
        by = {(c["ticker"], c["region"]): c for c in cands}
        selected = [dict(by[k], weight=w) for k, w in zip(prev_keys, [h["weight"] for h in prev["holdings"]]) if k in by]
        new_keys = prev_keys
    added = sorted(set(new_keys) - set(prev_keys)); dropped = sorted(set(prev_keys) - set(new_keys))
    if wave_due and prev_keys and max(len(added), len(dropped)) > MAX_CHANGES:
        print(f"⚠️ vague > {MAX_CHANGES} changements ({len(added)} in / {len(dropped)} out) — à découper (journal)")

    per_theme = {}
    for th in tw:
        L = [c for c in selected if c["theme"] == th]; k = max(1, math.ceil(N_LINES * tw[th] - 1e-9))
        per_theme[th] = {"label": THEME_LABEL[th], "stance": stance[th], "target_pct": round(tw[th] * 100, 1),
                         "allocated_pct": round(sum(c["weight"] for c in L) * 100, 1), "lines": len(L), "slots": k,
                         "status": "exprimé" if len(L) >= k else ("partiel" if L else "non exprimable"),
                         "note": THEME_NOTE.get(th)}
    out = {
        "holdings": selected, "_keys": [list(k) for k in new_keys], "n": len(selected),
        "allocated_pct": round(total * 100, 1), "cher_pct": round(cher * 100, 1), "themes": per_theme,
        "waiting": waiting, "blocked_maillons": [c for c in cands if c["src"] == "maillon" and c["gates_failed"]],
        # RADAR : propositions du screen (saines, prix raisonnable, pas refusées) — jamais des lignes
        "screen_proposals": [c for c in cands if c["src"] == "screen" and not c["gates_failed"] and (c["rel"] or 0) >= REL_ARTEFACT and not c["refused"]],
        "screen_refused": [c for c in cands if c["src"] == "screen" and c["refused"]],
        "qualification_pending": [c for c in cands if c["src"] == "maillon" and c.get("proof_pending")] + pending,
        "medians_ev_ebit": {k: round(v, 1) for k, v in med_ind.items() if k in ENABLER_INDUSTRIES},
        "_transition": {"wave_due": wave_due, "wave_date": date.today().isoformat() if wave_due else last_wave,
                        "days_since_wave": days, "added": [list(k) for k in added], "dropped": [list(k) for k in dropped]},
        "_doctrine": "maillon seulement (le screen = radar, propose sans entrer ; qualification = preuve ≥ 50 % + source, ≤ 2 adoptions/an, journal des refus) · sain (ND/EBIT ≤ 4, marge FCF ≥ 5 % + exercice précédent ≥ 0, trajectoire) · prix relatif "
                     "(≤ 2,5×, cher ≤ 30 %) · thèse avant chaîne · pas d'ETF · exclusion socle · thème vide reste vide",
        "generated": date.today().isoformat(),
    }
    return out


def inject_portfolio(pf):
    """Profil « Actions-Conviction » dans data/portfolios.json (Format B, comme Actions-Elite)."""
    path = os.path.join(DATA, "portfolios.json")
    try:
        p = json.load(open(path, encoding="utf-8"))
    except Exception:
        return
    actions, details = {}, []
    # AFFICHAGE (Benoit 16/09) : les poids du profil sont ceux de la PART INVESTIE, ramenés à 100 % — c'est ce qu'on
    # applique au montant réellement placé sur la poche. Le « budget en attente de prix » est porté au niveau du bloc
    # (_bloc_actions) et dans le commentaire ; les poids bruts (× part allouée) restent dans portfolios_conviction_equities.json.
    tot = sum(h["weight"] for h in pf["holdings"]) or 1.0
    disp = [round(h["weight"] / tot * 100, 1) for h in pf["holdings"]]
    if disp:
        disp[0] = round(disp[0] + (100.0 - sum(disp)), 1)             # l'arrondi retombe sur la 1re ligne → total 100,0
    for h, wd in zip(pf["holdings"], disp):
        w = wd
        actions[h["name"] or h["ticker"]] = f"{w:.1f}%"   # schéma : 1 décimale max
        details.append({"ticker": h["ticker"], "name": h["name"], "weight_pct": w, "category": "Actions",
                        "role": "satellite|growth",                      # vocabulaire du schéma portfolio_output.json
                        "theme": THEME_LABEL.get(h["theme"]), "maillon": h["maillon_label"], "maillon_role": h["role"]})
    p["Actions-Conviction"] = {
        "Actions": actions, "ETF": {}, "Obligations": {}, "Crypto": {},
        # le non-alloué est AFFICHÉ (le profil doit lire 100 %) sous son nom : « budget en attente de prix » (expert 16/09, Q6)
        "_tickers": {h["ticker"]: round(h["weight"], 4) for h in pf["holdings"]},
        "_asset_details": details,
        "_bloc_actions": {"socle_pct": BLOC_SOCLE_PCT, "conviction_investie_pct": round((100 - BLOC_SOCLE_PCT) * pf["allocated_pct"] / 100, 1),
                          "budget_en_attente_de_prix_pct": round((100 - BLOC_SOCLE_PCT) * (100 - pf["allocated_pct"]) / 100, 1),
                          "regle": "75 socle / conviction investie / budget en attente de prix — le cash a une fonction (entrer quand Vertiv, GEV, Cameco passent la porte d'absurdité), pas une durée (expert 16/09)"},
        "Commentaire": (f"Actions-Conviction (pilier 3) — {pf['n']} enablers du funnel, 100 % actions. Poids affichés = part investie "
                        f"ramenée à 100 %. Le module n'exprime que {pf['allocated_pct']} % de son enveloppe théorique ({100 - pf['allocated_pct']:.0f} % = "
                        "budget en attente de prix : thèmes non exprimables en actions saines à prix raisonnable, porté au niveau du bloc). Portes : maillon nommé · exposition au maillon ≥ 50 % (20-50 % = demi-poids) · durabilité A/B · "
                        "dette nette/EBIT ≤ 4 · marge de FCF ≥ 5 % · trajectoire · EV/EBIT ≤ 2,5× l'industrie. Poids par thème = stance du funnel. "
                        f"Bloc actions : {BLOC_SOCLE_PCT} % socle / {round((100 - BLOC_SOCLE_PCT) * pf['allocated_pct'] / 100, 1)} % conviction investie / "
                        f"{round((100 - BLOC_SOCLE_PCT) * (100 - pf['allocated_pct']) / 100, 1)} % en attente de prix. Priorité au socle, pas d'ETF."),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=2)
    print("✅ profil 'Actions-Conviction' injecté dans portfolios.json")


if __name__ == "__main__":
    pf = build()
    print(f"### ACTIONS-CONVICTION (pilier 3) — {pf['n']} lignes, {pf['allocated_pct']} % alloués, cher {pf['cher_pct']} % ###")
    for th, t in pf["themes"].items():
        print(f"  {t['label']:18} {t['stance']:11} cible {t['target_pct']:>5}% alloué {t['allocated_pct']:>5}%  {t['lines']}/{t['slots']}  {t['status']}")
    for h in pf["holdings"]:
        f = lambda v, fmt: (fmt % v) if isinstance(v, (int, float)) else "n/a"   # une porte n/a ne doit jamais bloquer l'écriture
        print(f"  {THEME_LABEL[h['theme']]:16} {h['ticker']:6} {str(h['name'])[:28]:28} {h['weight']*100:4.1f}%  {f(h['rel'], '%.2f')}×  FCF {f(h['fcf_margin'], '%.0f')}%  ND {f(h['nd_ebit'], '%.1f')}  {h['maillon_label']}")
    tr = pf["_transition"]
    print(f"  vague : {'OUI' if tr['wave_due'] else 'non (' + str(tr['days_since_wave']) + ' j)'} · +{len(tr['added'])} / -{len(tr['dropped'])} · file d'attente {len(pf['waiting'])} · bloqués {len(pf['blocked_maillons'])}")
    if DRY:
        print("🔎 CONVICTION_DRY : rien n'est écrit.")
    else:
        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(pf, f, ensure_ascii=False, indent=1, default=str)
        print(f"✅ écrit → {OUT_FILE}")
        inject_portfolio(pf)
