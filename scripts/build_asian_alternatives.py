#!/usr/bin/env python3
"""
[DEPRECATED — phase 2.2, 2026-06-11]

Le mapping data/asian_alternatives.json n'est plus utilisé par le pipeline
principal : apply_broker_access_substitution() est dépréciée et remplacée par
le pré-filtrage broker EN AMONT (portfolio_engine/broker_filter.py).

Le fichier généré par ce script est archivé sous
data/archive/asian_alternatives.deprecated_phase2.json. Script conservé pour
permettre une régénération si la doctrine change à nouveau, mais aucune partie
du pipeline ne lit son output aujourd'hui.

──────────────────────────────────────────────────────────────────────────────
Construit data/asian_alternatives.json — mapping pour chaque action asiatique
du pipeline vers : ADR US si dispo, alternatives ACTIONS individuelles
(même secteur + qualité ≥ buf-10 + pays accessible), et proxy ETF en
dernier recours.

Doctrine : un proxy ETF (INDA, EWT) remplace une conviction par un INDICE
entier = dilue le pari. Donc on privilégie d'abord ADR (= même action),
puis alternative ACTION individuelle de qualité comparable, et ETF
seulement en marqueur de dernier recours.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ============= Mapping manuel — ADR US et bourse cotation =============
# Note : la plupart des Taiwanaises mid-cap n'ont pas d'ADR. Les Indiennes
# parfois ont une société mère US cotée (CMI pour Cummins India). À distinguer
# strictement de l'ADR strict sens (= même action cotée NY).
ASIAN_MAP = {
    # === Inde ===
    "HEROMOTOCO": {
        "yahoo_ticker": "HEROMOTOCO.NS",
        "exchange": "NSE (National Stock Exchange of India)",
        "adr_us": None,  # Pas d'ADR US listé pour Hero MotoCorp
        "parent_company": None,
        "notes": "Pas d'ADR US. Achat via broker avec accès NSE direct (peu de brokers EU)."
    },
    "LUPIN": {
        "yahoo_ticker": "LUPIN.NS",
        "exchange": "NSE",
        "adr_us": None,
        "parent_company": None,
        "notes": "Pas d'ADR US. Cotée uniquement BSE/NSE."
    },
    "CUMMINSIND": {
        "yahoo_ticker": "CUMMINSIND.NS",
        "exchange": "NSE",
        "adr_us": None,  # Pas strict ADR
        "parent_company": "CMI (Cummins Inc, NYSE) — société mère cotée US, ATTENTION : pas la même action que Cummins India",
        "notes": "Société mère CMI cotée NYSE. Note : Cummins Inc et Cummins India ne sont pas identiques (Inc = global, India = filiale Inde) mais corrélation forte."
    },
    "POWERINDIA": {
        "yahoo_ticker": "POWERINDIA.NS",
        "exchange": "NSE",
        "adr_us": None,
        "parent_company": "Hitachi Energy = ABB spin-off + Hitachi JV. Possible proxy : ABBN.SW (ABB Ltd, Suisse)",
        "notes": "Filiale du JV Hitachi Energy. ABBN.SW (ABB, Suisse, EUR/CHF) est le proxy industrie le plus proche, achetable depuis broker EU."
    },
    # === Taïwan ===
    "2345": {
        "yahoo_ticker": "2345.TW",
        "exchange": "TWSE (Taiwan Stock Exchange)",
        "adr_us": None,
        "parent_company": None,
        "notes": "Accton Technology — pas d'ADR US. Achat via broker avec accès TWSE."
    },
    "2368": {
        "yahoo_ticker": "2368.TW",
        "exchange": "TWSE",
        "adr_us": None,
        "parent_company": None,
        "notes": "Gold Circuit Electronics — pas d'ADR US."
    },
    "3017": {
        "yahoo_ticker": "3017.TW",
        "exchange": "TWSE",
        "adr_us": None,
        "parent_company": None,
        "notes": "Asia Vital Components — pas d'ADR US."
    },
    "3443": {
        "yahoo_ticker": "3443.TW",
        "exchange": "TWSE",
        "adr_us": None,
        "parent_company": None,
        "notes": "Global Unichip Corp — pas d'ADR US. Filiale TSMC (TSM US disponible comme proxy semis Taiwan)."
    },
    "3653": {
        "yahoo_ticker": "3653.TW",
        "exchange": "TWSE",
        "adr_us": None,
        "parent_company": None,
        "notes": "Jentech Precision Industrial — pas d'ADR US."
    },
    "6669": {
        "yahoo_ticker": "6669.TW",
        "exchange": "TWSE",
        "adr_us": None,
        "parent_company": None,
        "notes": "Wiwynn Corp (server AI infra) — pas d'ADR US. Proxy AI server : SMCI US, DELL US."
    },
}

# ============= Proxy ETF par pays (dernier recours, flagged) =============
ETF_PROXY_BY_COUNTRY = {
    "Inde": {"ticker": "INDA", "name": "iShares MSCI India ETF", "warning": "Indice entier — dilue la conviction"},
    "Taïwan": {"ticker": "EWT", "name": "iShares MSCI Taiwan ETF", "warning": "Indice entier — dilue la conviction"},
    "Corée": {"ticker": "EWY", "name": "iShares MSCI Korea ETF", "warning": "Indice entier — dilue la conviction"},
    "Chine": {"ticker": "MCHI", "name": "iShares MSCI China ETF", "warning": "Indice entier — dilue la conviction"},
    "Japon": {"ticker": "EWJ", "name": "iShares MSCI Japan ETF", "warning": "Indice entier — dilue la conviction"},
}

# ============= Pays "accessibles" pour broker EU =============
ACCESSIBLE_COUNTRIES = {
    "Etats-Unis", "Royaume-Uni", "Suisse", "France", "Allemagne",
    "Pays-Bas", "Espagne", "Italie", "Belgique", "Portugal",
    "Suède", "Finlande", "Danemark", "Norvège", "Irlande", "Autriche"
}


def find_replacements(target, all_stocks, n=2):
    """Trouve n actions individuelles : même industry (priorité) ou secteur,
    qualité comparable (Buffett ≥ target_buf-10), bourse accessible."""
    t_industry = (target.get('industry') or '').lower()
    t_sector = (target.get('sector') or '').lower()
    t_buf = target.get('buffett_score') or 0

    candidates = []
    for tk, s in all_stocks.items():
        if tk == target.get('ticker'): continue
        if s.get('country') not in ACCESSIBLE_COUNTRIES: continue
        if (s.get('buffett_score') or 0) < t_buf - 15: continue
        if (s.get('quality_score') or 0) < 60: continue
        # Tag match level
        ind_match = (s.get('industry') or '').lower() == t_industry
        sec_match = (s.get('sector') or '').lower() == t_sector
        if not ind_match and not sec_match: continue
        candidates.append({
            "ticker": tk,
            "name": s.get('name') or s.get('stock_name') or '',
            "country": s.get('country'),
            "sector": s.get('sector'),
            "industry": s.get('industry'),
            "buffett_score": s.get('buffett_score'),
            "quality_score": s.get('quality_score'),
            "dividend_yield": s.get('dividend_yield'),
            "match_level": "industry" if ind_match else "sector",
        })
    # Tri : match industry > sector, puis Buffett desc, Quality desc
    candidates.sort(key=lambda x: (
        -1 if x["match_level"] == "industry" else 0,
        -(x.get("buffett_score") or 0),
        -(x.get("quality_score") or 0),
    ))
    return candidates[:n]


COUNTRY_SUFFIX_MAP = {
    "Inde": ".NS",
    "Taïwan": ".TW", "Taiwan": ".TW",
    "Corée": ".KS", "Korea": ".KS",
    "Chine": ".SS", "China": ".SS",
    "Thaïlande": ".BK", "Thailand": ".BK",
    "Philippines": ".PS",
    "Japon": ".T", "Japan": ".T",
    "Hong Kong": ".HK", "HongKong": ".HK",
    "Singapour": ".SI",
    "Indonésie": ".JK",
    "Malaisie": ".KL",
}

COUNTRY_EXCHANGE_NAME = {
    "Inde": "NSE (National Stock Exchange of India)",
    "Taïwan": "TWSE (Taiwan Stock Exchange)",
    "Corée": "KRX (Korea Exchange)",
    "Chine": "SSE (Shanghai Stock Exchange)",
    "Thaïlande": "SET (Stock Exchange of Thailand)",
    "Philippines": "PSE (Philippine Stock Exchange)",
    "Japon": "TSE (Tokyo Stock Exchange)",
    "Hong Kong": "HKEX (Hong Kong Stock Exchange)",
}


def _build_yahoo_ticker(ticker: str, country: str) -> str:
    """Construit le ticker yfinance à partir du ticker et pays."""
    sfx = COUNTRY_SUFFIX_MAP.get(country, "")
    if not sfx:
        return ticker
    if ticker.endswith(sfx):
        return ticker
    return ticker + sfx


def main():
    # Charger univers
    stocks_all = {}
    for f in ['stocks_us.json', 'stocks_europe.json', 'stocks_asia.json']:
        try:
            for s in json.load(open(ROOT / 'data' / f)).get('stocks', []):
                if s.get('ticker'):
                    stocks_all[s['ticker']] = s
        except Exception as e:
            print(f"Warn: {f} : {e}")

    # Récupère TOUS les stocks asia
    asia_tickers = []
    asia_path = ROOT / 'data' / 'stocks_asia.json'
    if asia_path.exists():
        for s in json.load(open(asia_path)).get('stocks', []):
            tk = s.get('ticker')
            if tk:
                asia_tickers.append(tk)
    print(f"Total stocks asia chargés : {len(asia_tickers)}")

    output = {
        "_meta": {
            "purpose": "Mapping actions asiatiques → ADR US / alternatives ACTIONS / proxy ETF dernier recours",
            "doctrine": "1. Ticker complet (test broker) → 2. ADR US si dispo (= même action) → 3. Alternative ACTION individuelle même secteur/qualité accessible → 4. Proxy ETF en dernier recours, flagged comme dilutant",
            "coverage": f"Couvre tous les {len(asia_tickers)} stocks asia. ADR/parent_company renseignés manuellement pour ~10 stocks dans ASIAN_MAP, null pour le reste.",
        },
        "stocks": {}
    }

    # Tous les stocks asia (algorithme automatique)
    for tk in asia_tickers:
        target = stocks_all.get(tk)
        if not target:
            continue
        target["ticker"] = tk

        # Mapping manuel prioritaire si présent
        if tk in ASIAN_MAP:
            asian_meta = ASIAN_MAP[tk]
        else:
            # Auto-generated mapping
            country = target.get('country')
            yahoo_ticker = _build_yahoo_ticker(tk, country)
            exchange = COUNTRY_EXCHANGE_NAME.get(country, country or "?")
            asian_meta = {
                "yahoo_ticker": yahoo_ticker,
                "exchange": exchange,
                "adr_us": None,
                "parent_company": None,
                "notes": f"Coté {exchange}. Vérifier accès broker pour ce marché.",
            }

        # Alternatives ACTION individuelles
        replacements = find_replacements(target, stocks_all, n=3)

        # Proxy ETF
        country = target.get('country')
        etf_proxy = ETF_PROXY_BY_COUNTRY.get(country)

        entry = {
            "ticker": tk,
            "name": target.get('name') or target.get('stock_name') or '',
            "country": country,
            "sector": target.get('sector'),
            "industry": target.get('industry'),
            "buffett_score": target.get('buffett_score'),
            "quality_score": target.get('quality_score'),
            "dividend_yield": target.get('dividend_yield'),
            # Mapping
            "yahoo_ticker": asian_meta["yahoo_ticker"],
            "exchange": asian_meta["exchange"],
            "yahoo_url": f"https://finance.yahoo.com/quote/{asian_meta['yahoo_ticker']}",
            "adr_us": asian_meta["adr_us"],
            "parent_company": asian_meta["parent_company"],
            "notes": asian_meta["notes"],
            # Alternatives
            "alternative_actions": replacements,
            "etf_last_resort": etf_proxy,
        }
        output["stocks"][tk] = entry

    out_path = ROOT / "data" / "asian_alternatives.json"
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"\n✅ Écrit : {out_path}")
    print(f"   {len(output['stocks'])} actions asiatiques mappées")

    # Print résumé
    print(f"\n{'='*80}\nRésumé du mapping :\n{'='*80}")
    for tk, e in output['stocks'].items():
        print(f"\n  {tk} — {e['name']} ({e['country']}, {e['industry']})")
        print(f"    Yahoo: {e['yahoo_ticker']} ({e['exchange']})")
        if e['adr_us']:
            print(f"    ADR US: {e['adr_us']}")
        if e['parent_company']:
            print(f"    Société mère/proxy: {e['parent_company']}")
        print(f"    Alternatives ACTION ({len(e['alternative_actions'])}) :")
        for a in e['alternative_actions']:
            print(f"      • {a['ticker']:10} {a['name'][:30]:30} ({a['country']}, {a['industry'][:20]:20}) Buf {a['buffett_score']} Q {a['quality_score']} match={a['match_level']}")
        if e['etf_last_resort']:
            print(f"    ⚠️  ETF dernier recours: {e['etf_last_resort']['ticker']} ({e['etf_last_resort']['warning']})")


if __name__ == "__main__":
    main()
