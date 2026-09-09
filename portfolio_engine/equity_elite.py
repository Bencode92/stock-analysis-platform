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

# ═══ CLÉ DE DÉPARTAGE : v3 (figée, symétrique provisoire) vs v4 (spec ROIC 6 ans, docs/ELITE_ROIC_10Y_SPEC.md) ═══
# v4 ne s'active QUE sur ELITE_KEY=v4 → le run CI par défaut reste v3 tant que Benoit n'a pas validé le
# before/after. Doctrine : la clé est FIGÉE avant de voir la sortie ; le basculement est un run DÉLIBÉRÉ.
ELITE_KEY = os.environ.get("ELITE_KEY", "v3").lower()
PERSIST_THRESHOLD = 12.0   # spec §3 clé 2 : ROIC (ou ROE fin.) ≥ 12 % compte comme exercice « tenu »
PERSIST_MIN_YEARS = 4      # < 4 exercices dispo → « historique court » → persistance à demi-poids (spec §2)
TRANSITION_TOP_N = 60      # spec §5 : un tenu ne sort que hors top-60 (zone tampon d'hystérésis)
TRANSITION_MAX_CHANGES = 10  # spec §5 : ≤ 10 changements par run ; le surplus par vagues trimestrielles

# BANNIS manuels (journal) — une porte connue comme violée mais non appliquée est pire qu'absente (expert).
BANNED = {
    "JBS": "Cotée NY juin 2025 → pas de vrai historique 3Y (young_listing raté) ; entité US/Brésil incohérente (groupe Batista).",
}
# PAIRES CORRÉLÉES > 0,70 (hebdo) → max 1 par paire. On garde le meilleur départage, on saute l'autre.
# ROST/TJX = 0,74 hebdo (confirmé) → même business, même cycle. Décision APPLIQUÉE (pas 'à appliquer').
CORRELATED_PAIRS = [("ROST", "TJX")]
_PAIR = {}
for _a, _b in CORRELATED_PAIRS:
    _PAIR[_a] = _b; _PAIR[_b] = _a

FX_TO_USD = {
    "USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CHF": 1.10, "CAD": 0.73, "SGD": 0.74,
    "JPY": 0.0064, "TWD": 0.031, "HKD": 0.128, "KRW": 0.00074, "CNY": 0.138, "INR": 0.012,
    "IDR": 0.000063, "THB": 0.028, "PLN": 0.25, "ILS": 0.27, "ILA": 0.0027, "PKR": 0.0036,
    "TRY": 0.03, "QAR": 0.27, "ZAc": 0.00053, "PHP": 0.017, "HUF": 0.0028, "SAR": 0.27,
}
_FIN_RE = re.compile(r"bank|insurance|reinsurance|capital market|financial serv|asset manage|credit serv", re.I)

# --- caps de diversification (revue expert v2) ---
SECTOR_CAP = 8         # max 8 lignes / secteur GICS (20 %) — la concentration est SECTORIELLE
FIN_CAP = 6            # max 6 financières / 40 (ROE = ROE haut de cycle sous levier, prudence)
REGION_TARGET = 0.68   # après rééquilibrage : une région ≤ 68 % (l'alerte à 70 % déclenche une ACTION)

# industrie fine → secteur GICS (regex ordonné, approximatif — le mapping fin est bruité, assumé).
_GICS_RULES = [
    ("Financials", r"insurance|bank|capital market|asset manage|financial data|stock exchange|reinsurance|credit serv|financial serv"),
    ("Santé", r"drug|biotech|medical|diagnostic|health|pharma|life scien"),
    ("Communication", r"internet content|publishing|media|telecom|advertis|entertainment|electronic gaming|interactive"),
    ("Tech", r"software|semiconductor|electronic component|scientific & technical|information technology|computer|it serv|hardware|electronics & comp"),
    ("Conso de base", r"packaged food|beverage|household & personal|tobacco|grocery|confection"),
    ("Conso discrétionnaire", r"apparel|retail|restaurant|leisure|resort|casino|auto|furnishings|rental & leasing|residential construction|gaming|luxury|hotel|footwear|home improv|education"),
    ("Matériaux", r"chemical|mining|metal|materials|agricultural input|packaging|paper|gold|steel|copper|building material"),
    ("Énergie", r"oil|gas|coal|uranium|drilling"),
    ("Immobilier", r"reit|real estate"),
    ("Utilities", r"utilit|electric power|water utility"),
    ("Industrie", r"industrial|machinery|building product|freight|logistics|distribution|security & protection|pollution|business services|aerospace|defense|engineering|electrical equipment|conglomerate|farm & heavy|tools|staffing|waste|railroad|airline|personal services|construction"),
]


def _gics(s):
    ind = (s.get("industry") or "").lower()
    for sector, pat in _GICS_RULES:
        if re.search(pat, ind):
            return sector
    return "Industrie"   # défaut (la majorité des non-classés sont industriels)


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
    if str(s.get("ticker")) in BANNED:               # banni manuel journalisé
        return False
    if (s.get("durability_grade") or "") not in grades:
        return False
    if s.get("durability_mirage") is True:
        return False
    if (s.get("quality_grade") or "") not in ("A", "B"):
        return False
    if ELITE_KEY == "v4":
        vok = _valuation_ok(s)                       # spec §3bis : porte valo au CRITÈRE, pas au grade
        if vok is False:                             # PE trop cher → sort (ASML/Lam PE ~55)
            return False
        if vok is None and (s.get("buffett_grade") or "") not in ("A", "B"):
            return False                             # critère absent → repli sur le grade (prudence)
    elif (s.get("buffett_grade") or "") not in ("A", "B"):   # v3 : DISCIPLINE VALO via grade (revue expert #6)
        return False
    if s.get("young_listing") is True:               # jeune cotation → porte historique renforcée
        return False
    if not _has_history(s):                          # historique ≥ 3 ans (stats 3Y présentes)
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
    if str(s.get("ticker")) in BANNED:               # un banni sort aussi par la porte de sortie
        return False
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


def _years6(s):
    """Nombre d'exercices ROIC disponibles (spec §2 : < 4 → historique court → demi-poids)."""
    return _num(s.get("years_roic_6y"))


def _persist(s):
    """Spec §3 clé 2 — persistance : nb d'exercices sur 6 avec ROIC (ROE fin.) ≥ 12 %. Plus HAUT = mieux.
       Historique court (< 4 ans dispo) → demi-poids, pour ne pas récompenser un « 3/3 » sur peu de recul."""
    key = "roe_persist_6y" if _is_fin(s) else "roic_persist_6y"
    p = _num(s.get(key))
    if p is None:
        return -1.0                                   # champ absent (pipeline pas encore repeuplé) → dernier
    yrs = _years6(s)
    if yrs is not None and yrs < PERSIST_MIN_YEARS:
        return p / 2.0                                # demi-poids historique court (spec §2)
    return p


def _downside(s):
    """Spec §3 clé 3 — semi-déviation SOUS la médiane 6 ans (jamais l'écart-type total). Plus BAS = mieux.
       Une hausse de ROIC ne pénalise pas ; seule la baisse compte."""
    key = "roe_downside_6y" if _is_fin(s) else "roic_downside_6y"
    d = _num(s.get(key))
    return d if d is not None else 9.99               # absent → pénalisé (départage descendant)


def _valuation_ok(s):
    """Spec §3bis — porte valo au CRITÈRE binaire `valuation_ok`, pas au grade Buffett (un grade B peut
       s'obtenir en RATANT précisément la valo). ASML/Lam (PE ~55) sortent, Nvidia (PE 28,7) reste."""
    for c in (s.get("buffett_criteria") or []):
        if c.get("name") == "valuation_ok":
            return c.get("passed") is True
    return None                                       # critère absent → indéterminé (géré par l'appelant)


def _rank_key(s):
    """Départage LEXICOGRAPHIQUE, tout descriptif.
       v3 (figée) : durabilité (A>B) → stabilité du ROIC (symétrique) → FCF yield.
       v4 (spec ROIC 6 ans §3) : durabilité → persistance ↑ → semi-déviation sous médiane ↓ → FCF yield."""
    bucket = 1 if (s.get("durability_grade") == "A") else 0
    fcf = _num(s.get("fcf_yield")) or 0.0
    if ELITE_KEY == "v4":
        return (bucket, _persist(s), -_downside(s), fcf)  # tri desc : durab, persistance, faible baisse, fcf
    return (bucket, -_stability(s), fcf)   # v3 : bucket haut, instabilité basse, fcf haut


def build_elite_portfolio():
    rows = _load_stocks()
    funnel = _funnel_tickers()
    # clé (ticker, région) : les tickers numériques asiatiques se collisionnent → jamais par ticker seul
    by_key = {(str(s.get("ticker")), s["_region"]): s for s in rows if s.get("ticker")}

    # 1) POOL ELITE (portes sectorielles)
    pool = [s for s in rows if s.get("industry") and _passes_gates(s, ("A", "B"))]
    pool.sort(key=_rank_key, reverse=True)           # meilleur départage d'abord — SANS funnel (doctrine)

    # CAPS de diversification : max 2/industrie fine, max 8/secteur GICS, max 6 financières.
    ind_c, sec_c = defaultdict(int), defaultdict(int)
    fin_c = [0]

    chosen_tk = set()   # tickers retenus, pour la règle des paires corrélées (max 1)

    def _can_add(s):
        return (_PAIR.get(str(s.get("ticker"))) not in chosen_tk            # paire corrélée → max 1
                and ind_c[s["industry"]] < MAX_PER_INDUSTRY and sec_c[_gics(s)] < SECTOR_CAP
                and (not _is_fin(s) or fin_c[0] < FIN_CAP))

    def _commit(s):
        ind_c[s["industry"]] += 1; sec_c[_gics(s)] += 1
        chosen_tk.add(str(s.get("ticker")))
        if _is_fin(s):
            fin_c[0] += 1

    # 2) HYSTÉRÉSIS d'abord : les tenus qui passent la SORTIE restent (respecte les caps) → anti-turnover.
    held_keys = []
    if os.path.exists(PREV_FILE):
        try:
            held_keys = [tuple(k) for k in (json.load(open(PREV_FILE, encoding="utf-8")).get("_keys") or [])]
        except Exception:
            held_keys = []
    # traiter les tenus par MEILLEUR départage d'abord → sur une paire corrélée, le meilleur est gardé
    held_keys.sort(key=lambda k: _rank_key(by_key[k]) if k in by_key else (-1,), reverse=True)

    # v4 — RÈGLE DE TRANSITION (spec §5) : un tenu ne sort que s'il CASSE la sortie OU tombe hors top-60,
    # et on plafonne à 10 changements/run (le surplus attend une vague trimestrielle). En v3 : inchangé.
    drop_v4 = set()   # tenus qu'on laisse VOLONTAIREMENT sortir ce run (hors top-60, dans le budget)
    if ELITE_KEY == "v4":
        pool_rank = {(str(s.get("ticker")), s["_region"]): i for i, s in enumerate(pool)}
        forced, optional = [], []   # forced = casse la sortie (obligé) ; optional = hors top-60 (au choix)
        for key in held_keys:
            s = by_key.get(tuple(key))
            if not (s and _passes_exit(s) and s.get("industry")):
                forced.append(key)                       # casse la sortie → sortie obligatoire
            elif pool_rank.get(key, 10**9) >= TRANSITION_TOP_N:
                optional.append(key)                     # passe la sortie mais hors top-60 → candidat sortie
        budget = max(0, TRANSITION_MAX_CHANGES - len(forced))
        # on exécute les PIRES sorties optionnelles d'abord (rang de pool le plus mauvais), dans le budget
        optional.sort(key=lambda k: pool_rank.get(k, 10**9), reverse=True)
        drop_v4 = set(optional[:budget])                 # le reste des « hors top-60 » est CONSERVÉ ce run

    kept, chosen = [], set()
    for key in held_keys:
        if key in drop_v4:                               # sortie volontaire différée-bornée (spec §5)
            continue
        s = by_key.get(tuple(key))
        if s and _passes_exit(s) and s.get("industry") and _can_add(s):
            kept.append(s); chosen.add((str(s.get("ticker")), s["_region"])); _commit(s)
    n_held = len(kept)
    # 3) COMPLÈTE au top-40 depuis le pool trié (meilleur départage), sous tous les caps.
    for s in pool:
        k = (str(s.get("ticker")), s["_region"])
        if k in chosen or not _can_add(s):
            continue
        if len(kept) >= MAX_HOLDINGS:
            break
        kept.append(s); chosen.add(k); _commit(s)
    final = kept

    # 4) RÉGION : PAS de cap dur / swap automatique (revue expert : un cap ajoute des noms « un cran en
    #    dessous » ; retirer Alphabet pour équilibrer la géo est un changement radical injustifié).
    #    On garde l'ALERTE > 70 % ; l'ACTION est une REVUE HUMAINE (assumer, ou swap manuel des plus
    #    faibles). Le vrai correctif du biais Japon est le barème ROIC-hors-cash (à faire au pipeline).
    region_swaps = []

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

    port_tks = {str(s.get("ticker")) for s in final}

    def _justify(s):
        """Pourquoi CELLE-CI : rang dans son industrie (pool) + concurrent EXCLU devancé + différenciateur."""
        ind = s.get("industry")
        tk = str(s.get("ticker"))
        peers = sorted((p for p in pool if p.get("industry") == ind), key=_rank_key, reverse=True)
        n = len(peers)
        try:
            rank = peers.index(s) + 1
        except ValueError:
            rank = None
        # concurrent = meilleur pair du POOL NON retenu au portefeuille (ce qu'on a écarté)
        runner = next((p for p in peers if str(p.get("ticker")) not in port_tks and str(p.get("ticker")) != tk), None)
        diff = None
        if runner is not None:
            if _stability(s) < _stability(runner) - 1e-6:
                diff = "ROIC plus régulier"
            elif (_num(s.get("roic_avg_3y")) or 0) > (_num(runner.get("roic_avg_3y")) or 0):
                diff = "rentabilité plus élevée"
            elif (_num(s.get("fcf_yield")) or 0) > (_num(runner.get("fcf_yield")) or 0):
                diff = "moins cher (FCF)"
            else:
                diff = "durabilité supérieure"
        return {"industry_rank": rank, "industry_n": n,
                "runner_up": (runner.get("name") if runner else None),
                "runner_up_ticker": (str(runner.get("ticker")) if runner else None),
                "differentiator": diff}

    def row(s):
        tk = str(s.get("ticker"))
        fin = _is_fin(s)
        return {
            "ticker": tk, "name": s.get("name"), "region": s["_region"], "industry": s.get("industry"),
            "sector": _gics(s), "weight": weights.get(tk), "durability": s.get("durability_grade"),
            "durability_score": _num(s.get("durability_score")), "quality": s.get("quality_grade"),
            "fin": fin, "roic_or_roe": _num(s.get("roe_avg_3y") if fin else s.get("roic_avg_3y")),
            "stability": round(_stability(s), 2), "fcf_yield": _num(s.get("fcf_yield")),
            "vol_3y": _num(s.get("volatility_3y")), "adv_musd": round((_adv_usd(s) or 0) / 1e6, 1),
            "funnel": funnel.get(tk), "held_hysteresis": tk in {str(x.get("ticker")) for x in kept[:n_held]},
            "why": _justify(s),
            # performance + métriques (pour l'affichage portefeuille)
            "perf_ytd": _num(s.get("perf_ytd")), "perf_1y": _num(s.get("perf_1y")),
            "perf_3m": _num(s.get("perf_3m")), "perf_1m": _num(s.get("perf_1m")),
            "roe": _num(s.get("roe")), "pe": _num(s.get("pe_ratio")),
            "div_yield": _num(s.get("dividend_yield_ttm")) if s.get("dividend_yield_ttm") is not None else _num(s.get("dividend_yield")),
            "buffett": _num(s.get("buffett_score")), "max_dd_3y": _num(s.get("max_drawdown_3y")),
        }
    holdings = [row(s) for s in final]
    holdings.sort(key=lambda r: (-(r["weight"] or 0), -(r["durability_score"] or 0)))
    from collections import Counter
    reg = Counter(h["region"] for h in holdings)
    max_reg = max((100 * v / len(holdings)) for v in reg.values()) if holdings else 0

    # DIAGNOSTIC DE TRANSITION vs run précédent (spec §5 : borne ≤ 10 changements/run)
    prev_set = set(held_keys)
    new_set = {(h["ticker"], h["region"]) for h in holdings}
    _name = {(str(s.get("ticker")), s["_region"]): s.get("name") for s in rows if s.get("ticker")}
    added = sorted(new_set - prev_set)
    dropped = sorted(prev_set - new_set)
    transition = {
        "key_version": ELITE_KEY, "changes": max(len(added), len(dropped)),
        "added": [{"ticker": k[0], "region": k[1], "name": _name.get(k)} for k in added],
        "dropped": [{"ticker": k[0], "region": k[1], "name": _name.get(k)} for k in dropped],
        "deferred_top60_drops": len(drop_v4),   # sorties hors top-60 non exécutées ce run (vagues suivantes)
    }

    return {
        "holdings": holdings, "_holdings": [h["ticker"] for h in holdings],
        "_keys": [[h["ticker"], h["region"]] for h in holdings],
        "_transition": transition,
        "n": len(holdings), "pool_size": len(pool), "n_held_hysteresis": n_held,
        "total_pct": round(sum(h["weight"] or 0 for h in holdings), 1),
        "region_split": dict(reg), "max_region_pct": round(max_reg, 0),
        "region_review_flag": max_reg > REGION_REVIEW, "region_swaps": region_swaps,
        "sector_split": dict(Counter(h["sector"] for h in holdings).most_common()),
        "n_financials": sum(1 for h in holdings if h["fin"]), "n_funnel": sum(1 for h in holdings if h["funnel"]),
    }


def main():
    pf = build_elite_portfolio()
    print(f"\n### PORTEFEUILLE ELITE FULL-ACTIONS (v2 — revue expert) ###\n")
    print(f"Pool elite (portes sectorielles + historique + ADV) : {pf['pool_size']}")
    print(f"Portefeuille : {pf['n']} lignes, {pf['total_pct']}% | régions {pf['region_split']}"
          + (f"  ⚠ REVUE (>{REGION_REVIEW:.0f}% sur une région)" if pf["region_review_flag"] else ""))
    print(f"  secteurs GICS : {pf['sector_split']}")
    print(f"  financières (au ROE, cap {FIN_CAP}) : {pf['n_financials']} · tags funnel : {pf['n_funnel']}"
          + (f" · maintenus hystérésis : {pf['n_held_hysteresis']}" if pf["n_held_hysteresis"] else ""))
    if pf.get("region_swaps"):
        print(f"  ⇄ rééquilibrage région (action) : {pf['region_swaps']}")
    print(f"\n{'TICKER':<8}{'POIDS':>6}  {'NOM':<26}{'RÉG':<7}{'D':<2}{'Q':<2}{'ROIC/E':>7}{'STAB':>6}{'FCF%':>6}{'VOL%':>6}  IND")
    for h in pf["holdings"]:
        fn = f" 🧭{h['funnel']}" if h["funnel"] else ""
        fin = "ᶠ" if h["fin"] else " "
        print(f"{h['ticker']:<8}{h['weight']:>5}%  {str(h['name'])[:25]:<26}{h['region']:<7}"
              f"{h['durability']}{fin}{h['quality']:<2}{int(h['roic_or_roe'] or 0):>6} {h['stability']:>5}"
              f"{round(h['fcf_yield'] or 0,1):>6}{int(h['vol_3y'] or 0):>6}  {str(h['industry'])[:20]}{fn}")
    # DIAGNOSTIC DE TRANSITION (spec §5) — surtout utile au run v4 avant validation
    tr = pf.get("_transition") or {}
    if tr:
        print(f"\n── TRANSITION (clé {tr.get('key_version')}) : {tr.get('changes')} changement(s) "
              f"[plafond {TRANSITION_MAX_CHANGES}] ──")
        for a in tr.get("added", []):
            print(f"  + IN  {a['ticker']:<8} {str(a.get('name'))[:30]:<30} ({a['region']})")
        for d in tr.get("dropped", []):
            print(f"  - OUT {d['ticker']:<8} {str(d.get('name'))[:30]:<30} ({d['region']})")
        if tr.get("deferred_top60_drops"):
            print(f"  … {tr['deferred_top60_drops']} sortie(s) hors top-60 différée(s) (vague trimestrielle)")

    # ELITE_DRY=1 → aperçu seul (utile pour comparer v4 sans écraser le v3 commité). Sinon : écriture normale.
    if os.environ.get("ELITE_DRY"):
        print(f"\n🔎 ELITE_DRY : aperçu — data/portfolios_elite.json & portfolios.json NON modifiés.")
        return
    with open(PREV_FILE, "w", encoding="utf-8") as f:
        json.dump(pf, f, ensure_ascii=False, indent=2)
    print(f"\n✅ écrit → data/portfolios_elite.json")
    _inject_into_portfolios(pf)


def _inject_into_portfolios(pf):
    """Ajoute le socle comme profil 'Actions-Elite' dans data/portfolios.json (Format B) → onglet
    dans portefeuille.html comme les autres. La justification par ligne va dans _asset_details.rationale."""
    path = os.path.join(DATA, "portfolios.json")
    if not os.path.exists(path):
        return
    try:
        import math
        p = json.load(open(path, encoding="utf-8"))
        actions, details = {}, []
        for h in pf["holdings"]:
            tk, nm, w = h["ticker"], (h.get("name") or h["ticker"]), (h["weight"] or 0)
            label = f"{nm} ({tk})"
            actions[label] = "<1%" if w < 1 else f"{round(w, 1)}%"   # schéma : 1 décimale max
            wy = h.get("why") or {}
            rat = f"n°{wy.get('industry_rank')}/{wy.get('industry_n')} de {h.get('industry')} en solidité"
            if wy.get("runner_up_ticker"):
                rat += f" — préféré à {wy['runner_up_ticker']} ({wy.get('differentiator') or ''})"
            details.append({"ticker": tk, "name": label, "weight_pct": w, "category": "Actions",
                            "role": "core", "rationale": rat, "sector": h.get("sector"),
                            "country": h.get("region"), "risk_note": "",
                            "metrics": {"roe": h.get("roe"), "pe_ratio": h.get("pe"),
                                        "dividend_yield": h.get("div_yield"), "ytd": h.get("perf_ytd"),
                                        "perf_1y": h.get("perf_1y"), "perf_3m": h.get("perf_3m"),
                                        "volatility": h.get("vol_3y"), "buffett_score": h.get("buffett"),
                                        "max_dd_3y": h.get("max_dd_3y")}})
        tickers = {str(h["ticker"]): round((h["weight"] or 0) / 100.0, 4) for h in pf["holdings"]}
        p["Actions-Elite"] = {
            "Actions": actions, "ETF": {}, "Obligations": {}, "Crypto": {},
            "_tickers": tickers,
            "Commentaire": (f"Socle actions elite ({ELITE_KEY}) — 40 compounders sélectionnés par EMPILEMENT "
                            "DE FILTRES (anti-piège durabilité + qualité + valo + ROIC + FCF + "
                            "investabilité), équipondérés, diversifiés par secteur GICS. Jugé sur les "
                            + ("fondamentaux, pas la notoriété. Départage : persistance ROIC 6 ans + "
                               "semi-déviation sous médiane (spec §3). " if ELITE_KEY == "v4"
                               else "fondamentaux, pas la notoriété. ")
                            + "Évolution douce (portes de sortie), pas de churn."),
            "_asset_details": details,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(p, f, ensure_ascii=False, indent=2, default=str)
        print("✅ profil 'Actions-Elite' injecté dans portfolios.json (→ onglet portefeuille.html)")
    except Exception as _e:
        print(f"⚠️ injection portfolios.json échouée (non-bloquant) : {_e}")


if __name__ == "__main__":
    main()
