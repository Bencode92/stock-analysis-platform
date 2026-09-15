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
EXIT_ADV_USD = 3.0e6   # SORTIE investabilité : un tenu tombé < 3 M$ (bande de grâce vs 5 M$) sort (revue expert 2026-09-10)
# --- diversification & taille ---
MAX_HOLDINGS = 40
MAX_PER_INDUSTRY = 2    # cap (contrainte), plus « 1 champion obligatoire par industrie »
REGION_REVIEW = 70.0    # pas de cap dur ; alerte de revue si une région > 70 %
# --- pondération : équipondéré + plafond de contribution au risque (écrête les plus volatils) ---
RISK_CAP_MULT = 1.5     # (v3) écrêtage de contribution au risque
# ═══ §13 PONDÉRATION v4a (revue expert 2026-09-14, FIGÉE avec la clé jusqu'au 2027-09-14) ═══
W_VOL_FLOOR, W_VOL_CAP = 15.0, 50.0    # vol 3 ans bornée AVANT inversion (sinon les bornes de poids font tout)
W_MIN, W_MAX = 1.5, 4.0                # bornes par ligne (%), itérées jusqu'à somme 100
W_REBAL_BAND = 0.25                    # on ne trade une ligne que si |poids − cible| > 25 % relatif de la cible
# --- hystérésis (anti-turnover) ---
EXIT_ROIC = 8.0        # sortie à ROIC < 8 % (moitié de l'entrée), pas < 0 (revue expert)
PREV_FILE = os.path.join(DATA, "portfolios_elite.json")

# ═══ CLÉ DE DÉPARTAGE : v3 (figée, symétrique provisoire) vs v4 (spec ROIC 6 ans, docs/ELITE_ROIC_10Y_SPEC.md) ═══
# v4 ne s'active QUE sur ELITE_KEY=v4 → le run CI par défaut reste v3 tant que Benoit n'a pas validé le
# before/after. Doctrine : la clé est FIGÉE avant de voir la sortie ; le basculement est un run DÉLIBÉRÉ.
ELITE_KEY = os.environ.get("ELITE_KEY", "v4a").lower()  # ✅ 2026-09-15 : v4a §12-§13 = défaut (run unique exécuté), GELÉE jusqu'au 2027-09-14
# ═══ PORTE 0 « place accessible » (revue expert Q7) : le socle réel = US + Europe ; l'Asie n'est pas achetable ═══
ELITE_REGIONS = set(r.strip() for r in os.environ.get("ELITE_REGIONS", "US,Europe").split(","))
# ═══ VAGUES TRIMESTRIELLES : entre deux vagues, le run CI quotidien REPRODUIT la liste (0 changement) ═══
WAVE_DAYS = 90
ELITE_FORCE_WAVE = os.environ.get("ELITE_FORCE_WAVE") == "1"   # run unique / vague déclenchée à la main
PERSIST_THRESHOLD = 12.0   # spec §3 clé 2 : ROIC (ou ROE fin.) ≥ 12 % compte comme exercice « tenu »
PERSIST_MIN_YEARS = 4      # < 4 exercices dispo → « historique court » → persistance à demi-poids (spec §2)
TRANSITION_TOP_N = 100     # spec §11 (revue expert 2026-09-14) : top-100 = 2,5× le book (top-60 = 15 % du pool, trop serré)
# ═══ RE-SPEC v4a (spec §11, figée 2026-09-14) ═══
DRAWDOWN_MAX = 35.0        # PORTE (pass/fail, entrée) : max drawdown du ROIC 6 ans ≤ 35 % — au-delà = vraie chute
DRAWDOWN_MAX_HELD = 40.0   # spec §12 R4 : bande de grâce pour un TENU (entrée stricte / sortie tolérante)
PERSIST_HIGH = 20.0        # (§11, retiré de la clé par §12 — champ conservé à titre informatif)
# ═══ §12 R1/R2 (2026-09-14, DERNIÈRE retouche — clé gelée 12 mois ensuite) ═══
FCF_MIN_ENTRY = 1.0        # R2 : FCF yield en PORTE à l'entrée (≥ 1 %)
FCF_MAX_VALID = 25.0       # R2 : FCF yield > 25 % = artefact de donnée → traité comme MANQUANT (échoue la porte)
ND_EBIT_MAX = 3.0          # R2 : porte levier net debt / EBIT ≤ 3 (proxy EBITDA indisponible ; remplace D/E ≤ 2,5)
ND_EBIT_MAX_NEG_EQ = 1.5   # R2 : fonds propres négatifs → échec SAUF net debt / EBIT ≤ 1,5 (rachats payés en cash)
_HELD = set()              # (ticker, région) tenus du run précédent — pour les seuils « tenu » (R4)
MIRAGE_PE_MAX, MIRAGE_VOL_MIN = 5.0, 50.0   # flag mirage AUTO : PE < 5 ET vol 3 ans > 50 % (OppFi : PE 2,5 / vol 68)
BANNED_INDUSTRY_RE = re.compile(r"gambling|resorts & casinos", re.I)   # jeux d'argent : hors mandat compounder
TRANSITION_MAX_CHANGES = 10  # spec §5 : ≤ 10 changements par run ; le surplus par vagues trimestrielles

# BANNIS manuels (journal) — une porte connue comme violée mais non appliquée est pire qu'absente (expert).
BANNED = {
    "JBS": "Cotée NY juin 2025 → pas de vrai historique 3Y (young_listing raté) ; entité US/Brésil incohérente (groupe Batista).",
    "OPFI": "Prêteur subprime (PE 2,5 · vol 3 ans 68 %) : profil hors mandat compounder — revue expert 2026-09-14 (spec §11). "
            "Couvert aussi par le flag mirage auto ; ban journalisé pour trace.",
}
# PAIRES CORRÉLÉES > 0,70 (hebdo) → max 1 par paire. On garde le meilleur départage, on saute l'autre.
# ROST/TJX = 0,74 hebdo (confirmé) → même business, même cycle. Décision APPLIQUÉE (pas 'à appliquer').
CORRELATED_PAIRS = [("ROST", "TJX"), ("V", "MA"),   # V/MA : réseaux paiement, corr hebdo > 0,8 (revue expert 2026-09-10)
                    ("NMIH", "MTG")]                 # assurance hypothécaire, corr hebdo 0,90 sur 109 sem. (mesurée 2026-09-14) :
                                                     # NMIH n'entre qu'une fois MGIC sorti (tenu prioritaire, comme Visa/MA)
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
# ✅ Revue expert 2026-09-10 : réseaux de paiement (Visa/MA) + bourses (SGX) = capital investi RÉEL → jugés
# au ROIC, PAS au ROE (banques/assureurs/gérants restent au ROE). Sinon SGX au ROE et Visa au ROIC = incohérent.
_FIN_ROIC_RE = re.compile(r"credit serv|stock exchange|financial data", re.I)

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
    txt = (s.get("industry") or "") + " " + (s.get("sector_api") or "")
    if _FIN_ROIC_RE.search(txt):     # réseaux/bourses → jugés au ROIC (non-fin pour le départage + cap 6)
        return False
    return bool(_FIN_RE.search(txt))


def _adv_usd(s):
    """Volume quotidien en USD = volume(actions) × prix × FX. Proxy de liquidité (> market cap)."""
    vol, px, fx = _num(s.get("volume")), _num(s.get("price")), FX_TO_USD.get(s.get("data_currency"))
    return vol * px * fx if (vol and px and fx) else None


def _has_history(s):
    """≥ 3 ans de recul : stats 3Y présentes (exclut les IPO récentes type Slide Insurance 2025).
       Financières : dispersion du ROE (le ROIC n'est pas leur métrique — JPMorgan, BNP, Santander échouaient
       « historique < 3 ans » sur un champ ROIC vide : bug de porte, corrigé 2026-09-15)."""
    disp = "roe_std_3y" if _is_fin(s) else "roic_std_3y"
    return all(s.get(k) not in (None, "", "-") for k in ("perf_3y", disp, "max_drawdown_3y"))


def _load_stocks():
    rows = []
    for f in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        p = os.path.join(DATA, f)
        if not os.path.exists(p):
            continue
        j = json.load(open(p, encoding="utf-8"))
        arr = j if isinstance(j, list) else j.get("stocks", [])
        reg = {"stocks_us.json": "US", "stocks_europe.json": "Europe", "stocks_asia.json": "Asie"}[f]
        if reg not in ELITE_REGIONS:                 # PORTE 0 « place accessible » : un tenu hors périmètre = sortie forcée
            continue
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
    if _mirage_auto(s) or BANNED_INDUSTRY_RE.search(s.get("industry") or ""):   # spec §11 (règle OppFi)
        return False
    if (s.get("quality_grade") or "") not in ("A", "B"):
        return False
    if ELITE_KEY in ("v4a", "v4") and _drawdown(s) > (DRAWDOWN_MAX_HELD if _is_held(s) else DRAWDOWN_MAX):
        return False                                  # §11 PORTE drawdown ; §12 R4 : 35 % entrée / 40 % tenu ; absent (999) → échoue
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
    roic = _num(s.get("roic_avg_3y"))
    if roic is None or roic < ROIC_MIN:
        return False
    if ELITE_KEY in ("v4a", "v4"):
        if not _leverage_ok(s):                      # §12 R2 : net debt / EBIT (fonds propres négatifs → 1,5)
            return False
        fcf = _fcf_valid(s)                          # §12 R2 : FCF yield en PORTE ≥ 1 %, > 25 % = manquant
        if fcf is None:
            return False
        return fcf > 0 if _is_held(s) else fcf >= FCF_MIN_ENTRY   # §12 R4 : tenu = ancienne porte (> 0), entrant ≥ 1 %
    de = _num(s.get("de_ratio"))
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
    adv = _adv_usd(s)                                 # INVESTABILITÉ à la SORTIE (revue expert 2026-09-10) :
    if adv is not None and adv < EXIT_ADV_USD:        # un illiquide tombé < 3 M$ ne se garde plus par hystérésis
        return False                                  # (corrige la fuite v3 : Thinking/Topco tenus sous le seuil)
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
    """Nombre d'exercices disponibles (spec §2 : < 4 → historique court → demi-poids).
       Financières : exercices ROE (le ROIC n'est pas leur métrique — MGIC/RLI avaient 2 ans de ROIC et 6 de ROE,
       et se faisaient couper en deux à tort). Repli sur years_roic_6y si le champ ROE n'est pas encore propagé."""
    if _is_fin(s):
        y = _num(s.get("years_roe_6y"))
        if y is not None:
            return y
    return _num(s.get("years_roic_6y"))


def _persist(s):
    """Spec §3 clé 2 — persistance : nb d'exercices sur 6 avec ROIC (ROE fin.) ≥ 12 %. Plus HAUT = mieux.
       Historique court (< 4 ans dispo) → demi-poids, pour ne pas récompenser un « 3/3 » sur peu de recul."""
    held = _is_held(s)                                # §12 R4 : un tenu est compté à la barre 10 %, pas 12 %
    key = ("roe_persist10_6y" if held else "roe_persist_6y") if _is_fin(s) else ("roic_persist10_6y" if held else "roic_persist_6y")
    p = _num(s.get(key))
    if p is None and held:                            # champ « tenu » pas encore propagé → repli barre 12 %
        p = _num(s.get("roe_persist_6y" if _is_fin(s) else "roic_persist_6y"))
    if p is None:
        return -1.0                                   # champ absent (pipeline pas encore repeuplé) → dernier
    yrs = _years6(s)
    if yrs is not None and yrs < PERSIST_MIN_YEARS:
        return p / 2.0                                # demi-poids historique court (spec §2)
    return p


def _downside(s):
    """(déprécié — remplacé par _drawdown en v4a) semi-déviation sous la médiane 6 ans."""
    key = "roe_downside_6y" if _is_fin(s) else "roic_downside_6y"
    d = _num(s.get(key))
    return d if d is not None else 9.99


def _is_held(s):
    return (str(s.get("ticker")), s.get("_region")) in _HELD


def _fcf_valid(s):
    """§12 R2 — FCF yield exploitable : présent et ≤ 25 % (au-delà = artefact → manquant)."""
    f = _num(s.get("fcf_yield"))
    return f if (f is not None and f <= FCF_MAX_VALID) else None


def _leverage_ok(s):
    """§12 R2 — porte levier : net debt / EBIT ≤ 3 ; fonds propres négatifs → échec sauf ND/EBIT ≤ 1,5.
       Champ `net_debt_to_ebit` propagé par le pipeline ; repli D/E ≤ 2,5 tant qu'il n'est pas peuplé."""
    nd = _num(s.get("net_debt_to_ebit"))
    eq = _num(s.get("total_equity"))
    neg_eq = (eq is not None and eq < 0) or ((_num(s.get("de_ratio")) or 0) < 0)
    if nd is None:                                    # pas encore propagé → ancienne porte (transition)
        de = _num(s.get("de_ratio"))
        return not (neg_eq or (de is not None and de > DE_MAX))
    if neg_eq:
        return nd <= ND_EBIT_MAX_NEG_EQ
    return nd <= ND_EBIT_MAX


def _mirage_auto(s):
    """Spec §11 — flag mirage AUTOMATIQUE : PE < 5 ET vol 3 ans > 50 % (un multiple de 2,5× sur un titre qui bouge
       de 68 %/an n'est pas une aubaine, c'est le marché qui dit que le bénéfice ne tient pas)."""
    pe, vol = _num(s.get("pe_ratio")), _num(s.get("volatility_3y"))
    return pe is not None and vol is not None and 0 < pe < MIRAGE_PE_MAX and vol > MIRAGE_VOL_MIN


def _persist_high(s):
    """Spec §11 clé 4 — ÉCHELLE de persistance : nb d'exercices /6 à ROIC (ROE fin.) ≥ 20 %. Plus HAUT = mieux.
       Départage « à quelle hauteur au-dessus de la barre », sans classer par niveau de ROIC. Demi-poids si < 4 ans."""
    key = "roe_persist20_6y" if _is_fin(s) else "roic_persist20_6y"
    p = _num(s.get(key))
    if p is None:
        return -1.0                                   # champ absent (pipeline pas encore repeuplé) → dernier
    yrs = _years6(s)
    if yrs is not None and yrs < PERSIST_MIN_YEARS:
        return p / 2.0
    return p


def _drawdown(s):
    """T2 (spec §8) — MAX DRAWDOWN du ROIC (ROE fin.) sur 6 ans, en %. Plus BAS = mieux ; un riser pur = 0.
       Remplace la semi-déviation (qui punissait les hausses) : seule une VRAIE chute pénalise."""
    key = "roe_drawdown_6y" if _is_fin(s) else "roic_drawdown_6y"
    d = _num(s.get(key))
    return d if d is not None else 999.0              # absent → pénalisé (départage descendant)


def _valuation_ok(s):
    """Spec §3bis — porte valo au CRITÈRE binaire `valuation_ok`, pas au grade Buffett (un grade B peut
       s'obtenir en RATANT précisément la valo). ASML/Lam (PE ~55) sortent, Nvidia (PE 28,7) reste."""
    for c in (s.get("buffett_criteria") or []):
        if c.get("name") == "valuation_ok":
            return c.get("passed") is True
    return None                                       # critère absent → indéterminé (géré par l'appelant)


def _gate_miss(s):
    """Sévérité d'échec aux portes d'entrée (0 = passe tout ; plus HAUT = rate plus fort). DÉTERMINISTE :
       ordonne les sorties au-delà du plafond par distance au seuil, pas par ordre de liste (revue expert)."""
    miss = 0.0
    adv = _adv_usd(s)
    if adv is not None and adv < ADV_MIN_USD:
        miss += (ADV_MIN_USD - adv) / ADV_MIN_USD
    if _is_fin(s):
        roe = _num(s.get("roe_avg_3y")) or _num(s.get("roe")) or 0.0
        if roe < ROE_MIN_FIN:
            miss += (ROE_MIN_FIN - roe) / ROE_MIN_FIN
    else:
        roic = _num(s.get("roic_avg_3y")) or 0.0
        if roic < ROIC_MIN:
            miss += (ROIC_MIN - roic) / ROIC_MIN
    if _valuation_ok(s) is False:
        miss += 1.0
    return miss


def _rank_key(s):
    """Départage LEXICOGRAPHIQUE, tout descriptif.
       v3 (figée) : durabilité (A>B) → stabilité du ROIC (symétrique) → FCF yield.
       v4a / v4 (§12, 2026-09-14, GELÉE 12 MOIS) : durabilité A/B → persistance ↑ → durability_score ↑ →
       quality_score ↑ → FCF yield ↑ (dernier). Le drawdown est une PORTE (35 % entrée / 40 % tenu), pas un rang.
       (v4a = ce départage + porte valo v3 par grade ; v4 = idem + porte valuation_ok v4b.)"""
    bucket = 1 if (s.get("durability_grade") == "A") else 0
    fcf = _num(s.get("fcf_yield")) or 0.0
    if ELITE_KEY in ("v4a", "v4"):
        # spec §12 R1 : durab A/B → persistance (12 % entrée / 10 % tenu) → SCORE de durabilité continu →
        # quality score → FCF yield en dernier (> 25 % = manquant → 0). Le drawdown est une PORTE, pas un rang.
        # Financières au ROE : le FCF yield n'est pas une métrique (revue expert 2026-09-14) → non applicable (0)
        fcf_v = 0.0 if _is_fin(s) else (_fcf_valid(s) or 0.0)
        return (bucket, _persist(s), _num(s.get("durability_score")) or 0.0, _num(s.get("quality_score")) or 0.0, fcf_v)
    return (bucket, -_stability(s), fcf)   # v3 : bucket haut, instabilité basse, fcf haut


def _weights_sector_invvol(final):
    """§13 — sector-balanced × inverse-vol : part égale par secteur GICS présent, puis ∝ 1/vol (vol bornée 15-50)
       dans le secteur ; bornes 1,5-4 % par ligne itérées jusqu'à somme 100. Vol absente → vol médiane du book."""
    if not final:
        return {}
    vols = {str(s.get("ticker")): _num(s.get("volatility_3y")) for s in final}
    known = [v for v in vols.values() if v]
    med = sorted(known)[len(known) // 2] if known else 30.0
    inv = {tk: 1.0 / min(W_VOL_CAP, max(W_VOL_FLOOR, (v or med))) for tk, v in vols.items()}
    by_sec = defaultdict(list)
    for s in final:
        by_sec[_gics(s)].append(str(s.get("ticker")))
    w = {}
    for sec, tks in by_sec.items():
        tot = sum(inv[t] for t in tks)
        for t in tks:
            w[t] = (100.0 / len(by_sec)) * inv[t] / tot
    for _ in range(100):                               # bornes 1,5-4 %, redistribution sur les lignes libres
        w = {t: min(W_MAX, max(W_MIN, x)) for t, x in w.items()}
        gap = 100.0 - sum(w.values())
        free = [t for t in w if W_MIN < w[t] < W_MAX]
        if abs(gap) < 1e-6 or not free:
            break
        for t in free:
            w[t] += gap / len(free)
    tot = sum(w.values()) or 1.0
    return {t: x / tot * 100 for t, x in w.items()}


_NAME_NOISE = re.compile(r"[^A-Z0-9]+")
def _entity_key(s):
    """Nom normalisé = identité d'entité (VISA INC. CLASS A = VISA INC. CLASS A, cotée NYSE ou LSE)."""
    return _NAME_NOISE.sub("", (s.get("name") or "").upper())


def _dedupe_entities(rows):
    """PORTE 0 bis (2026-09-15) — UNE ENTITÉ = UNE LIGNE : une société cotée sur plusieurs places (Visa NYSE + VUSD
       Londres, Nike Xetra, Ferrovial Amsterdam/NASDAQ…) ne peut pas entrer deux fois au socle. On garde la cotation la
       plus liquide (ADV) ; un TENU garde sa cotation. Les scores par cotation divergent (durabilité 98 vs 95 pour
       Visa) : seule la cotation retenue est jugée."""
    groups = defaultdict(list)
    for s in rows:
        k = _entity_key(s)
        if k:
            groups[k].append(s)
    keep, dropped = [], 0
    for k, lst in groups.items():
        if len(lst) == 1:
            keep.append(lst[0]); continue
        held = [s for s in lst if (str(s.get("ticker")), s["_region"]) in _HELD]
        # cotation retenue : un TENU d'abord ; sinon celle qui a des FONDAMENTAUX (une ligne sans bilan est un
        # doublon mal étiqueté — GDX Xetra « General Dynamics » sans états financiers, volume aberrant), puis l'ADV
        best = held[0] if held else max(lst, key=lambda s: ((_num(s.get("roic")) is not None or _num(s.get("roe")) is not None), _adv_usd(s) or 0))
        keep.append(best); dropped += len(lst) - 1
    if dropped:
        print(f"🧬 {dropped} cotation(s) secondaire(s) écartée(s) (une entité = une ligne, cotation la plus liquide)")
    return keep


def build_elite_portfolio():
    rows = _load_stocks()
    funnel = _funnel_tickers()
    # clé (ticker, région) : les tickers numériques asiatiques se collisionnent → jamais par ticker seul
    by_key = {(str(s.get("ticker")), s["_region"]): s for s in rows if s.get("ticker")}

    # §12 R4 : les TENUS du run précédent sont jugés avec leurs seuils « tenu » (drawdown 40 %, persistance 10 %)
    _HELD.clear()
    if os.path.exists(PREV_FILE):
        try:
            _HELD.update(tuple(k) for k in (json.load(open(PREV_FILE, encoding="utf-8")).get("_keys") or []))
        except Exception:
            pass
    rows = _dedupe_entities(rows)                    # porte 0 bis : une entité = une ligne
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
    forced, optional = [], []
    # ═══ CADENCE : vague trimestrielle (WAVE_DAYS) ou run forcé ; sinon le run CI quotidien REPRODUIT la liste ═══
    prev_tr = {}
    if os.path.exists(PREV_FILE):
        try:
            prev_tr = json.load(open(PREV_FILE, encoding="utf-8")).get("_transition") or {}
        except Exception:
            prev_tr = {}
    from datetime import date
    last_wave = prev_tr.get("wave_date")
    # date.fromisoformat (pas strptime : strptime importe le module stdlib `calendar`, masqué par portfolio_engine/calendar.py)
    days_since = (date.today() - date.fromisoformat(last_wave)).days if last_wave else None
    wave_due = ELITE_FORCE_WAVE or (ELITE_KEY == "v3") or (days_since is None) or (days_since >= WAVE_DAYS)
    if ELITE_KEY in ("v4a", "v4"):
        pool_rank = {(str(s.get("ticker")), s["_region"]): i for i, s in enumerate(pool)}
        forced, optional = [], []   # forced = casse la sortie (obligé) ; optional = hors top-60 (au choix)
        for key in held_keys:
            s = by_key.get(tuple(key))
            if not (s and _passes_exit(s) and s.get("industry")):
                forced.append(key)                       # casse la sortie → sortie obligatoire
            elif pool_rank.get(key, 10**9) >= TRANSITION_TOP_N:
                optional.append(key)                     # passe la sortie mais hors top-60 → candidat sortie
        budget = max(0, TRANSITION_MAX_CHANGES - len(forced)) if wave_due else 0
        # DÉTERMINISTE (revue expert) : on sort les PIRES d'abord — pire rang de pool, puis pire échec de
        # porte (distance au seuil), puis ticker en dernier recours. Plus d'ordre-de-liste arbitraire.
        optional.sort(key=lambda k: (-pool_rank.get(k, 10**9), -_gate_miss(by_key[k]), k[0]))
        drop_v4 = set(optional[:budget])                 # le reste des « hors top-60 » est CONSERVÉ ce run

    kept, chosen = [], set()
    for key in held_keys:
        if key in drop_v4:                               # sortie volontaire différée-bornée (spec §5)
            continue
        s = by_key.get(tuple(key))
        if s is None or not s.get("industry"):
            continue                                     # hors périmètre / hors données → sortie (forcée)
        if not wave_due and ELITE_KEY in ("v4a", "v4"):  # entre deux vagues : on REPRODUIT, porte cassée journalisée
            kept.append(s); chosen.add((str(s.get("ticker")), s["_region"])); _commit(s); continue
        if _passes_exit(s) and _can_add(s):
            kept.append(s); chosen.add((str(s.get("ticker")), s["_region"])); _commit(s)
    n_held = len(kept)
    # 3) COMPLÈTE au top-40 depuis le pool trié (meilleur départage), sous tous les caps.
    for s in pool:
        k = (str(s.get("ticker")), s["_region"])
        if k in chosen or k in drop_v4 or not _can_add(s):   # §12 : un sorti volontaire n'est pas ré-admis ce run
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

    # 4) POIDS
    if ELITE_KEY in ("v4a", "v4"):
        # §13 : sector-balanced × inverse-vol (vol bornée 15-50 avant inversion), bornes 1,5-4 %, bandes de rebal ±25 %
        targets = _weights_sector_invvol(final)
        prev_w = {}
        if os.path.exists(PREV_FILE):
            try:
                _prev = json.load(open(PREV_FILE, encoding="utf-8"))
                # bandes de rebalancement seulement entre deux vagues du MÊME schéma (§13) ; première application
                # du schéma (run unique depuis v3) → toutes les lignes à leur cible
                if (_prev.get("_transition") or {}).get("key_version") in ("v4a", "v4"):
                    prev_w = {h["ticker"]: _num(h.get("weight")) for h in (_prev.get("holdings") or [])}
            except Exception:
                prev_w = {}
        held_w = {}
        for tk, tgt in targets.items():
            pw = prev_w.get(tk)
            if pw and tgt and abs(pw - tgt) / tgt <= W_REBAL_BAND:
                held_w[tk] = pw                       # dans la bande → on ne trade pas, poids conservé
            else:
                held_w[tk] = tgt                      # entrant / sortie de bande → cible
        tot = sum(held_w.values()) or 1.0
        held_w = {tk: min(W_MAX, max(W_MIN, w / tot * 100)) for tk, w in held_w.items()}   # renormalisé, bornes tenues
        tot = sum(held_w.values()) or 1.0
        weights = {tk: round(w / tot * 100, 2) for tk, w in held_w.items()}
        weight_targets = {tk: round(w, 2) for tk, w in targets.items()}
    else:
        # v3 : équipondéré + plafond de contribution au risque (écrête les plus volatils, sans tri)
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
        weight_targets = dict(weights)

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
            "sector": _gics(s), "weight": weights.get(tk), "weight_target": weight_targets.get(tk), "durability": s.get("durability_grade"),
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
        "wave_due": wave_due,
        "wave_date": (date.today().isoformat() if (wave_due and ELITE_KEY in ("v4a", "v4")) else last_wave),
        "days_since_wave": days_since,
        "forced_exits": [k[0] for k in forced],                       # porte de sortie cassée (exécutées si vague)
        "optional_drops_executed": [k[0] for k in sorted(drop_v4)],   # hors top-N, dans le budget
        "optional_drops_deferred": [k[0] for k in optional if k not in drop_v4],   # hors top-N, vagues suivantes
        "deferred_top60_drops": len([k for k in optional if k not in drop_v4]),   # (compat) sorties différées
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
            print(f"  … {tr['deferred_top60_drops']} sortie(s) hors top-{TRANSITION_TOP_N} différée(s) (vague trimestrielle) : "
                  + ", ".join(tr.get("optional_drops_deferred") or []))
        if tr.get("wave_due") is False:
            print(f"  ⏸ entre deux vagues ({tr.get('days_since_wave')} j depuis {tr.get('wave_date')}) : liste reproduite, "
                  f"portes cassées en attente : {', '.join(tr.get('forced_exits') or []) or 'aucune'}")

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
                            + ("fondamentaux, pas la notoriété. Porte : drawdown ROIC 6 ans ≤ 35 %. "
                               "Départage : persistance ROIC 6 ans, puis score de durabilité, qualité, FCF. " if ELITE_KEY in ("v4a", "v4")
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
