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
ROIC_MIN = 15.0         # ROIC vraiment élevé (revue expert : 12 % laissait entrer des 12-14 % qui
                        # gagnaient ensuite sur la stabilité → socle « ennuyeux ». Relever = vrai haut de gamme)
ROE_MIN_FIN = 15.0      # financières : ROE (le ROIC/D/E n'ont pas de sens — revue expert)
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

# BANNIS manuels (journal) — une porte connue comme violée mais non appliquée est pire qu'absente (expert).
BANNED = {
    "JBS": "Cotée NY juin 2025 → pas de vrai historique 3Y (young_listing raté) ; entité US/Brésil incohérente (groupe Batista).",
}

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
    if (s.get("buffett_grade") or "") not in ("A", "B"):   # DISCIPLINE VALO explicite (revue expert #6)
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


def _roic_lat_avg_std(s):
    """(courant, moyen 3a, écart-type 3a) du ROIC — ou du ROE pour les financières."""
    if _is_fin(s):
        return _num(s.get("roe")), _num(s.get("roe_avg_3y")), _num(s.get("roe_std_3y"))
    return _num(s.get("roic")), _num(s.get("roic_avg_3y")), _num(s.get("roic_std_3y"))


def _floor(s):
    """PERSISTANCE : plancher estimé du ROIC (pire année ≈ moyenne − écart-type). Plus HAUT = mieux.
    Récompense un ROIC haut ET soutenu — un compounder en accélération n'est pas puni pour sa hausse."""
    _lat, avg, std = _roic_lat_avg_std(s)
    if avg is None:
        return -999.0
    return avg - (std or 0.0)


def _downside(s):
    """BAISSE directionnelle (semi-déviation, revue expert) : de combien le ROIC courant est SOUS sa
    moyenne. 0 s'il est en HAUSSE (Nvidia/TSMC ne sont plus pénalisés), positif s'il DÉCLINE."""
    lat, avg, _std = _roic_lat_avg_std(s)
    if lat is None or avg is None:
        return 0.0
    return max(0.0, avg - lat)


def _instability(s):
    """Instabilité ASYMÉTRIQUE du ROIC (revue expert) : écart-type/moyenne, mais la volatilité
    HAUSSIÈRE est peu pénalisée (×0,3) et la baissière pleinement (×1). Corrige v3 (qui punissait
    Nvidia/TSMC d'avoir PROGRESSÉ) sans casser le reste (les compounders stables restent bas).
    Plus BAS = mieux."""
    lat, avg, std = _roic_lat_avg_std(s)
    if avg is None or std is None or abs(avg) < 1e-6:
        return 9.99
    base = abs(std / avg)
    rising = lat is not None and lat >= avg          # ROIC courant ≥ moyenne → en hausse/stable
    return base * (0.3 if rising else 1.0)


# contexte SECTORIEL + funnel, peuplé au début de build() — le classement est SECTOR-RELATIF (revue user :
# « fondamentaux PAR secteur, le funnel donc conviction, ce que l'entreprise EST »).
_SECTOR_MED = {}   # {secteur GICS : ROIC médian du pool}
_FUNNEL_SET = set()


def _rank_key(s):
    """Départage SECTOR-RELATIF, descriptif :
       durabilité (A>B, ce qu'elle EST) → instabilité asymétrique (régulière/en hausse) →
       LEADERSHIP sectoriel (ROIC − médiane de SON secteur) → conviction funnel → FCF yield (valo).
       Une société est jugée vs SON secteur : un top-semi bat un staple médian même à ROIC absolu plus bas."""
    bucket = 1 if (s.get("durability_grade") == "A") else 0
    lead = (_num(s.get("roic_avg_3y")) or 0.0) - _SECTOR_MED.get(_gics(s), 0.0)   # au-dessus de son secteur ?
    conv = 1 if str(s.get("ticker")) in _FUNNEL_SET else 0
    fcf = _num(s.get("fcf_yield")) or 0.0
    return (bucket, -_instability(s), lead, conv, fcf)   # tri desc


def build_elite_portfolio():
    rows = _load_stocks()
    funnel = _funnel_tickers()
    # clé (ticker, région) : les tickers numériques asiatiques se collisionnent → jamais par ticker seul
    by_key = {(str(s.get("ticker")), s["_region"]): s for s in rows if s.get("ticker")}

    # 1) POOL ELITE (portes sectorielles)
    pool = [s for s in rows if s.get("industry") and _passes_gates(s, ("A", "B"))]
    # contexte SECTOR-RELATIF : médiane ROIC par secteur GICS + set funnel (peuplés AVANT le tri)
    _SECTOR_MED.clear(); _FUNNEL_SET.clear()
    _FUNNEL_SET.update(funnel.keys())
    _by_sec = defaultdict(list)
    for s in pool:
        r = _num(s.get("roic_avg_3y"))
        if r is not None:
            _by_sec[_gics(s)].append(r)
    for sec, vals in _by_sec.items():
        vs = sorted(vals)
        _SECTOR_MED[sec] = vs[len(vs) // 2] if vs else 0.0
    pool.sort(key=_rank_key, reverse=True)           # tri SECTOR-RELATIF (leadership + conviction)

    # CAPS de diversification : max 2/industrie fine, max 8/secteur GICS, max 6 financières.
    ind_c, sec_c = defaultdict(int), defaultdict(int)
    fin_c = [0]

    chosen_ent = set()   # dédup CROSS-LISTING par entité (TJX-US = TJX-Europe = même société)

    def _ent(s):
        return ((s.get("name_api") or s.get("name") or str(s.get("ticker"))) or "").upper()

    def _can_add(s):
        return (_ent(s) not in chosen_ent
                and ind_c[s["industry"]] < MAX_PER_INDUSTRY and sec_c[_gics(s)] < SECTOR_CAP
                and (not _is_fin(s) or fin_c[0] < FIN_CAP))

    def _commit(s):
        ind_c[s["industry"]] += 1; sec_c[_gics(s)] += 1
        chosen_ent.add(_ent(s))
        if _is_fin(s):
            fin_c[0] += 1

    # 2) HYSTÉRÉSIS d'abord : les tenus qui passent la SORTIE restent (respecte les caps) → anti-turnover.
    held_keys = []
    if os.path.exists(PREV_FILE):
        try:
            held_keys = [tuple(k) for k in (json.load(open(PREV_FILE, encoding="utf-8")).get("_keys") or [])]
        except Exception:
            held_keys = []
    kept, chosen = [], set()
    for key in held_keys:
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
            if _instability(s) < _instability(runner) - 1e-6:
                diff = "ROIC plus régulier ou en meilleure trajectoire"
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
            "roic_floor": round(_floor(s), 1), "roic_downside": round(_downside(s), 1),
            "fcf_yield": _num(s.get("fcf_yield")),
            "vol_3y": _num(s.get("volatility_3y")), "adv_musd": round((_adv_usd(s) or 0) / 1e6, 1),
            "funnel": funnel.get(tk), "held_hysteresis": tk in {str(x.get("ticker")) for x in kept[:n_held]},
            "why": _justify(s),
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
    print(f"\n{'TICKER':<8}{'POIDS':>6}  {'NOM':<24}{'RÉG':<7}{'D':<2}{'Q':<2}{'ROICmoy':>8}{'PLANCH':>7}{'BAISSE':>7}  vs / IND")
    for h in pf["holdings"]:
        fn = f" 🧭{h['funnel']}" if h["funnel"] else ""
        fin = "ᶠ" if h["fin"] else " "
        w = h["why"]
        why = f"#{w['industry_rank']}/{w['industry_n']} " + (f"dvt {w['runner_up_ticker']}" if w['runner_up_ticker'] else "seul")
        print(f"{h['ticker']:<8}{h['weight']:>5}%  {str(h['name'])[:23]:<24}{h['region']:<7}"
              f"{h['durability']}{fin}{h['quality']:<2}{int(h['roic_or_roe'] or 0):>7}{h['roic_floor']:>7}{h['roic_downside']:>7}  {why}")
    with open(PREV_FILE, "w", encoding="utf-8") as f:
        json.dump(pf, f, ensure_ascii=False, indent=2)
    print(f"\n✅ écrit → data/portfolios_elite.json")


if __name__ == "__main__":
    main()
