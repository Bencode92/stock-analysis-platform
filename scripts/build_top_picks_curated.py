#!/usr/bin/env python3
"""
Génère data/top_picks_curated.json — sections "meilleures actions" générées
par le pipeline (à appeler depuis generate_portfolios_v4.py).

Combine pour chaque stock :
  - 40% Buffett score
  - 30% Quality score
  - 15% Perf 1y normalisée (cap [-100, +100])
  - 15% bonus RADAR contextuel (+1 si secteur favorisé, -0.5 si avoided)

Filtre les actions inaccessibles broker (config/broker_access.json).

Output : 3 sections
  - "global"         : top 25 toutes catégories
  - "by_country"     : top 10 par pays (regroupés)
  - "by_sector"      : top 10 par secteur GICS L1
  - "context"        : snapshot RADAR utilisé (favored/avoided/régime)
"""
from __future__ import annotations
import json
from pathlib import Path
from collections import defaultdict, Counter

ROOT = Path(__file__).resolve().parent.parent

W_BUFFETT = 0.40
W_QUALITY = 0.30
W_PERF = 0.15
W_RADAR = 0.15

GICS_SECTOR_FR = {
    "technologie de l'information": "Tech",
    "technology": "Tech",
    "santé": "Santé",
    "healthcare": "Santé",
    "finance": "Finance",
    "financials": "Finance",
    "biens de consommation cycliques": "Conso cyclique",
    "biens de consommation de base": "Conso staples",
    "consumer staples": "Conso staples",
    "consumer cyclical": "Conso cyclique",
    "industries": "Industries",
    "industrials": "Industries",
    "matériaux": "Matériaux",
    "materials": "Matériaux",
    "énergie": "Energie",
    "energie": "Energie",
    "energy": "Energie",
    "services publics": "Utilities",
    "utilities": "Utilities",
    "la communication": "Communication",
    "communication services": "Communication",
    "immobilier": "Immobilier",
    "real estate": "Immobilier",
}

# Mapping RADAR sector keys (anglais) → GICS L1 français normalisé
RADAR_SEC_TO_GICS = {
    "information-technology": "Tech",
    "technology": "Tech",
    "energy": "Energie",
    "materials": "Matériaux",
    "industrials": "Industries",
    "financials": "Finance",
    "consumer-staples": "Conso staples",
    "consumer-discretionary": "Conso cyclique",
    "healthcare": "Santé",
    "utilities": "Utilities",
    "communication-services": "Communication",
    "real-estate": "Immobilier",
}


def normalize_sector(s):
    if not s: return None
    k = s.strip().lower()
    # Match exact GICS_SECTOR_FR
    for needle, label in GICS_SECTOR_FR.items():
        if needle in k:
            return label
    return s.strip()


def load_stocks():
    stocks = []
    for f in ['stocks_us.json', 'stocks_europe.json', 'stocks_asia.json']:
        try:
            d = json.load(open(ROOT / 'data' / f))
            region = 'US' if 'us' in f else ('EU' if 'europe' in f else 'ASIA')
            for s in d.get('stocks', []):
                if not s.get('ticker'): continue
                s['_region'] = region
                stocks.append(s)
        except Exception as e:
            print(f"Warn loading {f}: {e}")
    return stocks


def load_broker_access():
    p = ROOT / 'config' / 'broker_access.json'
    if not p.exists(): return {}
    try:
        return json.load(open(p)).get('access', {})
    except Exception:
        return {}


def load_market_context():
    p = ROOT / 'data' / 'market_context.json'
    if not p.exists(): return {}
    try:
        d = json.load(open(p))
        macro = d.get('macro_tilts') or {}
        return {
            'regime': d.get('market_regime') or d.get('regime'),
            'confidence': d.get('confidence'),
            'as_of': d.get('as_of'),
            'favored_sectors': [RADAR_SEC_TO_GICS.get(s, s) for s in (macro.get('favored_sectors') or d.get('favored_sectors') or [])],
            'avoided_sectors': [RADAR_SEC_TO_GICS.get(s, s) for s in (macro.get('avoided_sectors') or d.get('avoided_sectors') or [])],
            'favored_regions': macro.get('favored_regions') or d.get('favored_regions') or [],
            'avoided_regions': macro.get('avoided_regions') or d.get('avoided_regions') or [],
            'rationale': macro.get('rationale'),
        }
    except Exception as e:
        print(f"Warn loading market_context: {e}")
        return {}


def is_accessible(stock, access_map):
    """ASIA tagué false dans broker = bloqué. US/EU toujours accessibles."""
    if stock.get('_region') == 'ASIA':
        return access_map.get(stock['ticker']) is not False
    return True


def score_stock(s, context):
    buf = s.get('buffett_score') or 0
    q = s.get('quality_score') or 0
    perf = s.get('perf_1y') or 0
    # Normalisations
    buf_n = buf / 100.0
    q_n = q / 100.0
    perf_n = max(-1.0, min(1.0, perf / 100.0))  # cap [-100, +100] → [-1, 1]
    # RADAR bonus
    sec_norm = normalize_sector(s.get('sector'))
    radar_n = 0.0
    if context.get('favored_sectors') and sec_norm in context['favored_sectors']:
        radar_n = 1.0
    elif context.get('avoided_sectors') and sec_norm in context['avoided_sectors']:
        radar_n = -0.5
    score = W_BUFFETT * buf_n + W_QUALITY * q_n + W_PERF * perf_n + W_RADAR * radar_n
    return score


def fmt_market_cap(mc):
    """Convertit market cap en string lisible (B/M)."""
    if mc is None: return None
    try:
        mc = float(mc)
        if mc >= 1e12: return f"{mc/1e12:.1f}T"
        if mc >= 1e9: return f"{mc/1e9:.1f}B"
        if mc >= 1e6: return f"{mc/1e6:.0f}M"
        return f"{mc:.0f}"
    except: return str(mc)


def stock_entry(s, score, context):
    sec_norm = normalize_sector(s.get('sector'))
    is_favored = sec_norm in (context.get('favored_sectors') or [])
    is_avoided = sec_norm in (context.get('avoided_sectors') or [])

    # Décomposition du score composite
    buf = s.get('buffett_score') or 0
    q = s.get('quality_score') or 0
    perf = s.get('perf_1y') or 0
    perf_n = max(-1.0, min(1.0, perf / 100.0))
    radar_n = 1.0 if is_favored else (-0.5 if is_avoided else 0.0)
    score_breakdown = {
        'buffett_contribution': round(W_BUFFETT * (buf/100.0), 4),
        'quality_contribution': round(W_QUALITY * (q/100.0), 4),
        'perf_contribution': round(W_PERF * perf_n, 4),
        'radar_contribution': round(W_RADAR * radar_n, 4),
    }

    return {
        # Identité
        'ticker': s.get('ticker'),
        'name': (s.get('name') or s.get('stock_name') or '')[:50],
        'country': s.get('country'),
        'region': s.get('_region'),
        'exchange': s.get('exchange'),
        'sector': s.get('sector'),
        'sector_normalized': sec_norm,
        'industry': s.get('industry'),
        # Scores
        'buffett_score': s.get('buffett_score'),
        'buffett_grade': s.get('buffett_grade'),
        'quality_score': s.get('quality_score'),
        'quality_grade': s.get('quality_grade'),
        'quality_peer_global_rank': s.get('quality_peer_global_rank'),
        'quality_peer_size': s.get('quality_peer_size'),
        # Fondamentaux
        'pe_ratio': s.get('pe_ratio'),
        'roe': s.get('roe'),
        'roic': s.get('roic'),
        'net_margin': s.get('net_margin'),
        'fcf_yield': s.get('fcf_yield'),
        'de_ratio': s.get('de_ratio'),
        'revenue_growth_3y': s.get('revenue_growth_3y'),
        'eps_growth_5y': s.get('eps_growth_5y'),
        'eps_growth_forecast_5y': s.get('eps_growth_forecast_5y'),
        # Dividende
        'dividend_yield': s.get('dividend_yield'),
        'dividend_yield_ttm': s.get('dividend_yield_ttm'),
        'dividend_growth_3y': s.get('dividend_growth_3y'),
        'dividend_coverage': s.get('dividend_coverage'),
        'payout_ratio_ttm': s.get('payout_ratio_ttm'),
        # Risque
        'volatility_3y': s.get('volatility_3y'),
        'beta': s.get('beta'),
        'max_drawdown_3y': s.get('max_drawdown_3y'),
        # Performance
        'perf_1m': s.get('perf_1m'),
        'perf_3m': s.get('perf_3m'),
        'perf_ytd': s.get('perf_ytd'),
        'perf_1y': s.get('perf_1y'),
        'perf_3y': s.get('perf_3y'),
        'distance_52w_high': s.get('distance_52w_high'),
        'distance_52w_low': s.get('distance_52w_low'),
        # Cours et taille
        'price': s.get('price'),
        'data_currency': s.get('data_currency'),
        'market_cap': s.get('market_cap'),
        'market_cap_str': fmt_market_cap(s.get('market_cap')),
        'range_52w': s.get('range_52w'),
        # Composite
        'composite_score': round(score, 4),
        'composite_breakdown': score_breakdown,
        'is_favored_sector': is_favored,
        'is_avoided_sector': is_avoided,
    }


def main():
    print("=== Building top_picks_curated.json ===")
    stocks = load_stocks()
    access = load_broker_access()
    context = load_market_context()

    # Filtrer accessibles + qualité minimum (Buf>=60 OR Q>=60)
    accessible = [
        s for s in stocks
        if is_accessible(s, access)
        and ((s.get('buffett_score') or 0) >= 60 or (s.get('quality_score') or 0) >= 60)
    ]
    print(f"  Univers : {len(stocks)} stocks, {len(accessible)} accessibles & quality ≥ 60")

    # Score chaque accessible
    scored = [(s, score_stock(s, context)) for s in accessible]
    scored.sort(key=lambda x: -x[1])

    # === Section 1: Global top 25 — avec cap secteur ===
    # Doctrine : T4 (diversification) appliqué aussi sur le top global.
    # Sans cap : 67% du top sur Tech + Industries + Finance (mesuré 2026-06-08).
    # Avec cap 5/secteur : forcer la diversification structurelle.
    MAX_PER_SECTOR_TOP = 5
    global_top_raw = []
    sec_count = defaultdict(int)
    for s, sc in scored:
        sec = normalize_sector(s.get('sector')) or '_'
        if sec_count[sec] >= MAX_PER_SECTOR_TOP:
            continue
        sec_count[sec] += 1
        global_top_raw.append((s, sc))
        if len(global_top_raw) >= 25:
            break
    global_top = [stock_entry(s, sc, context) for s, sc in global_top_raw]

    # === Section 2: par pays ===
    by_country = defaultdict(list)
    for s, sc in scored:
        c = s.get('country')
        if not c: continue
        if len(by_country[c]) < 10:  # top 10 par pays
            by_country[c].append(stock_entry(s, sc, context))

    # === Section 3: par secteur GICS L1 ===
    by_sector = defaultdict(list)
    for s, sc in scored:
        sec = normalize_sector(s.get('sector'))
        if not sec: continue
        if len(by_sector[sec]) < 10:  # top 10 par secteur
            by_sector[sec].append(stock_entry(s, sc, context))

    # === Section 4: par industrie (GICS L2 — niveau plus fin) ===
    by_industry = defaultdict(list)
    for s, sc in scored:
        ind = (s.get('industry') or '').strip()
        if not ind: continue
        if len(by_industry[ind]) < 8:  # top 8 par industrie
            by_industry[ind].append(stock_entry(s, sc, context))

    # === Section 5: Focus régional précomputé pour le frontend ===
    # Mapping country → region
    COUNTRY_TO_REGION = {
        'Etats-Unis':'US','Royaume-Uni':'EU','Suisse':'EU','France':'EU','Allemagne':'EU','Pays-Bas':'EU','Espagne':'EU','Italie':'EU','Belgique':'EU','Portugal':'EU','Suède':'EU','Finlande':'EU','Danemark':'EU','Norvège':'EU','Irlande':'EU','Autriche':'EU','Pologne':'EU',
        'Inde':'ASIA','Taïwan':'ASIA','Corée':'ASIA','Chine':'ASIA','Thaïlande':'ASIA','Philippines':'ASIA','Japon':'ASIA','Hong Kong':'ASIA',
    }

    regional_focus = {}
    for region_code in ('US', 'EU', 'ASIA'):
        # Toutes les actions de cette région (depuis le scoring complet)
        region_stocks = [(s, sc) for s, sc in scored if COUNTRY_TO_REGION.get(s.get('country')) == region_code]
        if not region_stocks:
            continue
        # Top 50 de la région
        top_50 = [stock_entry(s, sc, context) for s, sc in region_stocks[:50]]
        # Distribution sectorielle
        sec_dist = Counter(normalize_sector(s.get('sector')) for s, _ in region_stocks if s.get('sector'))
        sec_dist = [{'sector': sec, 'count': n} for sec, n in sec_dist.most_common(10) if sec]
        # Distribution industrie (≥ 2 stocks)
        ind_dist = Counter(s.get('industry') for s, _ in region_stocks if s.get('industry'))
        ind_dist = [{'industry': ind, 'count': n} for ind, n in ind_dist.most_common(15) if ind and n >= 2]
        # Intersection RADAR avec la région
        radar_favored = [s_['sector'] for s_ in sec_dist if s_['sector'] in (context.get('favored_sectors') or [])]
        radar_avoided = [s_['sector'] for s_ in sec_dist if s_['sector'] in (context.get('avoided_sectors') or [])]
        # Top pays dans la région (granularité utile pour Europe / Asie)
        country_dist = Counter(s.get('country') for s, _ in region_stocks if s.get('country'))
        country_dist = [{'country': c, 'count': n} for c, n in country_dist.most_common(10)]

        regional_focus[region_code] = {
            'n_accessible': len(region_stocks),
            'top_50': top_50,
            'top_sectors': sec_dist,
            'top_industries': ind_dist,
            'top_countries': country_dist,
            'radar_favored_in_region': radar_favored,
            'radar_avoided_in_region': radar_avoided,
        }

    # === Output ===
    output = {
        '_meta': {
            'generated_at': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
            'universe_size': len(stocks),
            'accessible_count': len(accessible),
            'scoring_weights': {
                'buffett': W_BUFFETT,
                'quality': W_QUALITY,
                'perf_1y': W_PERF,
                'radar_contextual': W_RADAR,
            },
            'filters': 'broker_accessible AND (buffett >= 60 OR quality >= 60)',
        },
        'context': context,
        'global_top_25': global_top,
        'by_country': {c: top for c, top in sorted(by_country.items(), key=lambda x: -len(x[1]))},
        'by_sector': dict(by_sector),
        'by_industry': {i: top for i, top in sorted(by_industry.items(), key=lambda x: -len(x[1])) if len(top) >= 3},
        'regional_focus': regional_focus,
    }

    out_path = ROOT / 'data' / 'top_picks_curated.json'
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"✓ Sauvé : {out_path}")
    print(f"  Global top 25 — pays représentés : {len(set(e['country'] for e in global_top if e.get('country')))}")
    print(f"  By country  : {len(by_country)} pays")
    print(f"  By sector   : {len(by_sector)} secteurs")
    print(f"  By industry : {sum(1 for v in by_industry.values() if len(v) >= 3)} industries (≥ 3 stocks)")
    if context.get('favored_sectors'):
        print(f"  RADAR favored : {context['favored_sectors']}")
    if context.get('avoided_sectors'):
        print(f"  RADAR avoided : {context['avoided_sectors']}")


if __name__ == "__main__":
    main()
