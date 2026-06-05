#!/usr/bin/env python3
"""
Audit LECTURE SEULE — simulation régénération PEA + CTO sans toucher au baseline.

Compare 3 scénarios :
  A. ACTUEL    : baseline figé v5 (LI/TTE/PUB/CS, VICI/AUTO)
  B. RECALC v1 : régénération avec scoring ACTUEL (yield 0.18 / quality 0.12)
  C. RECALC v2 : régénération avec scoring REBALANCÉ (yield 0.12 / quality 0.18)

Output : tableau comparatif (qui sort, qui entre, yield moyen, Buffett moyen,
quality moyen, secteurs couverts).

AUCUN fichier modifié. Tu décides après avoir vu.
"""
import json

# ============= Données =============
portfolios = json.load(open('data/portfolios.json'))
stocks_all = {}
for f in ['stocks_us.json', 'stocks_europe.json', 'stocks_asia.json']:
    sd = json.load(open(f'data/{f}'))
    for s in sd.get('stocks', []):
        if s.get('ticker'):
            stocks_all[s['ticker']] = s

PEA_COUNTRIES = {"France","Allemagne","Belgique","Italie","Espagne","Portugal","Pays-Bas",
    "Luxembourg","Autriche","Suède","Finlande","Danemark","Irlande","Norvège","Islande"}
CTO_COUNTRIES = {"Etats-Unis","Royaume-Uni","Suisse","Canada","Australie"}

def passes_div_filters(s, country_set):
    if s.get('country') not in country_set: return False
    y = s.get('dividend_yield') or 0
    if y < 2.5 or y > 8.0: return False
    p = s.get('payout_ratio')
    sec = (s.get('sector') or '').lower()
    if p is not None and p > 75 and 'immobilier' not in sec: return False
    r = s.get('roe') or 0
    if r < 10 and 'finance' not in sec: return False
    if (s.get('quality_score') or 0) < 60: return False
    if (s.get('buffett_score') or 0) < 55: return False
    if (s.get('volatility_3y') or 0) > 35: return False
    return True

# ============= Scoring composite =============
def fit_score(s, weights):
    """Reproduit le scoring _make_dividende_policy avec poids configurables."""
    # Income (yield + growth + coverage)
    yield_norm = min((s.get('dividend_yield') or 0) / 6.0, 1.0)
    growth_norm = min(max((s.get('dividend_growth_3y') or 0) / 15.0, 0), 1.0)
    cov_norm = min(max((s.get('dividend_coverage') or 1.0) / 3.0, 0), 1.0)
    # Quality
    qsafety_norm = (s.get('quality_score') or 0) / 100.0  # proxy safety
    qquality_norm = (s.get('buffett_score') or 0) / 100.0  # proxy quality
    qvalue_norm = min(max((s.get('fcf_yield') or 0) / 10.0, 0), 1.0)
    # Risk pénalité
    vol_norm = (s.get('volatility_3y') or 0) / 35.0
    mdd_norm = abs(s.get('max_drawdown_3y') or 0) / 50.0
    # Momentum
    perf_norm = max(min((s.get('perf_1y') or 0) / 30.0, 1.0), -1.0)

    return (
        weights['yield'] * yield_norm +
        weights['growth'] * growth_norm +
        weights['coverage'] * cov_norm +
        weights['qsafety'] * qsafety_norm +
        weights['qquality'] * qquality_norm +
        weights['qvalue'] * qvalue_norm +
        weights['vol'] * vol_norm +
        weights['mdd'] * mdd_norm +
        weights['perf'] * perf_norm
    )

# Config v1 = actuel (preset_meta.py _make_dividende_policy)
WEIGHTS_ACTUEL = {
    'yield':0.18, 'growth':0.17, 'coverage':0.05,
    'qsafety':0.20, 'qquality':0.12, 'qvalue':0.05,
    'vol':-0.10, 'mdd':-0.10, 'perf':0.03,
}
# Config v2 = recalibrage T1>yield proposé par Claude externe
WEIGHTS_PROPOSE = {
    'yield':0.12, 'growth':0.17, 'coverage':0.05,
    'qsafety':0.20, 'qquality':0.18, 'qvalue':0.05,
    'vol':-0.10, 'mdd':-0.10, 'perf':0.03,
}

# ============= Sélection avec diversif sectorielle =============
def select_topN(eligibles, weights, n_target, max_per_sector):
    """Sélectionne top N actions, max max_per_sector par GICS L1."""
    scored = [(tk, s, fit_score(s, weights)) for tk, s in eligibles]
    scored.sort(key=lambda x: -x[2])
    by_sector = {}
    selected = []
    for tk, s, sc in scored:
        sec = (s.get('sector') or '_').lower()
        if by_sector.get(sec, 0) >= max_per_sector: continue
        by_sector[sec] = by_sector.get(sec, 0) + 1
        selected.append((tk, s, sc))
        if len(selected) >= n_target: break
    return selected

# ============= Analyse par sleeve =============
def analyze_sleeve(name, country_set, n_target, max_per_sector, baseline):
    print(f"\n{'='*82}")
    print(f"  {name}")
    print(f"{'='*82}")

    eligibles = [(tk, s) for tk, s in stocks_all.items() if passes_div_filters(s, country_set)]
    print(f"  Pool éligible : {len(eligibles)} candidats")

    # Scénario A — Baseline figé actuel
    bl_data = [(tk, stocks_all.get(tk, {})) for tk in baseline if tk in stocks_all]
    print(f"\n  --- A. ACTUEL (baseline figé v5) ---")
    print_compo(bl_data)

    # Scénario B — RECALC avec scoring actuel
    sel_b = select_topN(eligibles, WEIGHTS_ACTUEL, n_target, max_per_sector)
    print(f"\n  --- B. RECALC v1 — scoring ACTUEL (yield 0.18 / quality 0.12) ---")
    print_compo([(tk, s) for tk, s, _ in sel_b], scores=[sc for _, _, sc in sel_b])

    # Scénario C — RECALC avec scoring proposé
    sel_c = select_topN(eligibles, WEIGHTS_PROPOSE, n_target, max_per_sector)
    print(f"\n  --- C. RECALC v2 — scoring REBALANCÉ (yield 0.12 / quality 0.18) ---")
    print_compo([(tk, s) for tk, s, _ in sel_c], scores=[sc for _, _, sc in sel_c])

    # Delta C vs A
    set_a = set(baseline)
    set_c = {tk for tk, _, _ in sel_c}
    sortants = set_a - set_c
    entrants = set_c - set_a
    print(f"\n  --- DELTA A→C (recalc rebalancé vs baseline actuel) ---")
    print(f"    Sortants : {sorted(sortants)}")
    print(f"    Entrants : {sorted(entrants)}")
    print(f"    Communs  : {sorted(set_a & set_c)}")

def print_compo(items, scores=None):
    if not items:
        print("    (vide)")
        return
    buf_sum = q_sum = y_sum = n = 0
    secteurs = set()
    print(f"    {'#':>2} {'Ticker':10} {'Buffett':>7} {'Quality':>7} {'Yield':>6} {'Vol':>5} {'Score':>6} {'Secteur':20}")
    for i, (tk, s) in enumerate(items):
        b = s.get('buffett_score') or 0
        q = s.get('quality_score') or 0
        y = s.get('dividend_yield') or 0
        v = s.get('volatility_3y') or 0
        sec = (s.get('sector') or '?')[:20]
        sc = f"{scores[i]:>6.3f}" if scores else "  —"
        print(f"    {i+1:>2} {tk:10} {b:>7} {q:>7} {y:>5.2f}% {v:>4.1f}% {sc} {sec}")
        buf_sum += b; q_sum += q; y_sum += y; n += 1
        secteurs.add(sec.lower())
    print(f"    >>> Moyennes : Buffett {buf_sum/n:.1f}, Quality {q_sum/n:.1f}, Yield {y_sum/n:.2f}%, n_secteurs={len(secteurs)}")

# ============= GO =============
baseline_pea = ["LI", "TTE", "PUB", "CS"]
baseline_cto = ["VICI", "AUTO"]

analyze_sleeve(
    "DIVIDENDE-PEA",
    PEA_COUNTRIES,
    n_target=16,        # target théorique
    max_per_sector=3,
    baseline=baseline_pea,
)
analyze_sleeve(
    "DIVIDENDE-CTO",
    CTO_COUNTRIES,
    n_target=10,        # target théorique
    max_per_sector=2,
    baseline=baseline_cto,
)
