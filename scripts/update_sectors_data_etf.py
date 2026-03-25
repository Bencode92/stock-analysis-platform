#!/usr/bin/env python3
"""
Script de mise à jour des données sectorielles via Twelve Data API
Utilise des ETFs sectoriels pour représenter les performances des secteurs
Génère des libellés normalisés bilingues pour l'affichage

v6 - AJOUT: Beta + vol_3y dans sectors.json (source duale)
     - US: injection depuis combined_etfs.csv (zero API call)
     - EU: calcul beta maison depuis time_series 3Y (même pattern que baseline_52w)
     - Benchmark: SPY (US) / EXS1 (EU STOXX 600) — cache partagé
     - Fonctions: load_beta_lookup(), fetch_daily_closes(), compute_beta_vol()
     - Guard-rail: beta < 0.05 ou > 4.0 → rejeté
     - Log couverture beta (lookup + computed)
v5 - AJOUT: Calcul 3M et 6M (momentum court/moyen terme)
v4 - AJOUT: Calcul 52W (52 semaines glissant)
v3 - FIX: Passage exchange/mic_code aux fonctions API
"""

import os
import csv
import json
import datetime as dt
import io
import re
import math
import requests  # v1.6: même lib que _time_series_http dans twelve_data_utils
from typing import Dict, List, Tuple, Optional
import logging

# Import du module partagé
from twelve_data_utils import (
    get_td_client,
    quote_one,
    baseline_ytd,
    baseline_52w,
    baseline_3m,
    baseline_6m,
    format_value,
    format_percent,
    parse_percentage,
    rate_limit_pause,
    TZ_BY_REGION,
    API_KEY,
    PERIOD_3M_DAYS,
    PERIOD_6M_DAYS,
    PERIOD_52W_DAYS,
)

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CSV_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sectors_etf_mapping.csv")
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sectors.json")

# v1.6: Source beta US (déjà enrichi par le pipeline ETF)
COMBINED_ETFS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "combined_etfs.csv")

# v1.6: Benchmarks pour calcul beta EU (même pattern HTTP que baseline_52w)
BENCHMARK_CONFIG = {
    "US": {"symbol": "SPY", "mic_code": "ARCX"},
    "Europe": {"symbol": "EXS1", "mic_code": "XETR"},  # iShares Core STOXX Europe 600
}
BETA_LOOKBACK_DAYS = 756     # ~3 ans de jours de trading
BETA_MIN_DATAPOINTS = 120    # minimum ~6 mois de données alignées
BETA_GUARD_MIN = 0.05        # rejeter beta < 0.05 (aberrant)
BETA_GUARD_MAX = 4.0         # rejeter beta > 4.0 (aberrant)

# Référentiel sectoriel
TAXONOMY = os.getenv("SECTOR_TAXONOMY", "ICB").upper()

VALID_CATEGORIES = {
    "energy", "materials", "industrials",
    "consumer-discretionary", "consumer-staples",
    "healthcare", "financials", "information-technology",
    "communication-services", "utilities", "real-estate"
}

# ==== Normalisation libellés affichage ====
CAT_FR = {
    "energy": "Énergie",
    "materials": "Matériaux",
    "industrials": "Industriels",
    "consumer-discretionary": "Consommation discrétionnaire",
    "consumer-staples": "Consommation de base",
    "healthcare": "Santé",
    "financials": "Finance",
    "information-technology": "Technologie",
    "communication-services": "Communication",
    "utilities": "Services publics",
    "real-estate": "Immobilier",
}

# Sous-secteurs à extraire depuis le nom
SS_PATTERNS = [
    (re.compile(r"semiconductors?", re.I), ("Semiconductor", "Semi-conducteurs")),
    (re.compile(r"cyber\s*security", re.I), ("Cybersecurity", "Cybersécurité")),
    (re.compile(r"\bfintech\b", re.I), ("FinTech", "FinTech")),
    (re.compile(r"biotech(nology|)", re.I), ("Biotechnology", "Biotechnologie")),
    (re.compile(r"pharmaceuticals?", re.I), ("Pharmaceuticals", "Pharmaceutiques")),
    (re.compile(r"oil\s*&\s*gas", re.I), ("Oil & Gas", "Pétrole & Gaz")),
    (re.compile(r"food\s*&\s*beverage", re.I), ("Food & Beverage", "Alimentation & Boissons")),
    (re.compile(r"retail", re.I), ("Retail", "Distribution")),
    (re.compile(r"internet", re.I), ("Internet", "Internet")),
    (re.compile(r"ai\s*&\s*robotics|artificial\s*intelligence", re.I), ("AI & Robotics", "IA & Robotique")),
    (re.compile(r"banks?", re.I), ("Banks", "Banques")),
    (re.compile(r"insurance", re.I), ("Insurance", "Assurances")),
    (re.compile(r"financial\s*services?", re.I), ("Financial Services", "Services financiers")),
    (re.compile(r"media", re.I), ("Media", "Médias")),
    (re.compile(r"telecommunications?", re.I), ("Telecommunications", "Télécommunications")),
    (re.compile(r"construction\s*&\s*materials?", re.I), ("Construction & Materials", "Construction & Matériaux")),
    (re.compile(r"basic\s*resources?", re.I), ("Basic Resources", "Ressources de base")),
    (re.compile(r"chemicals?", re.I), ("Chemicals", "Chimie")),
    (re.compile(r"automobiles?\s*&\s*(parts|components?|equip(men)?t(ier)?s?)", re.I),
        ("Automobiles & Parts", "Automobiles & Équipementiers")),
    (re.compile(r"automobiles?|autos?", re.I), ("Automobiles", "Automobiles")),
    (re.compile(r"smart\s*grid", re.I), ("Smart Grid Infrastructure", "Infrastructures réseaux intelligents")),
    (re.compile(r"transportation", re.I), ("Transportation", "Transports")),
    (re.compile(r"(personal\s*&\s*household\s*goods|household\s*&\s*personal\s*products?)", re.I),
        ("Personal & Household Goods", "Biens personnels & ménagers")),
    (re.compile(r"travel\s*&\s*leisure", re.I), ("Travel & Leisure", "Voyages & Loisirs")),
    (re.compile(r"technology\s*dividend", re.I), ("Technology Dividend", "Dividendes technologiques")),
]


def _family_from_row(name: str, symbol: str, region_display: str) -> str:
    """Détermine la famille d'indices pour l'affichage."""
    n = (name or "").lower()
    sym = (symbol or "").upper()
    FORCE_FAMILY = {"IYH": "Dow Jones US", "IYW": "Dow Jones US", "IYG": "Dow Jones US", "XBI": "S&P US"}
    if sym in FORCE_FAMILY:
        return FORCE_FAMILY[sym]
    if region_display == "Europe":
        return "STOXX Europe 600"
    if "dow jones" in n or n.startswith("dj "):
        return "Dow Jones US"
    if "select sector spdr" in n or re.match(r"^XL[A-Z]{1,2}$", sym):
        return "S&P 500"
    if "spdr s&p" in n and "select sector spdr" not in n:
        return "S&P US"
    if re.search(r"\bishares\s+u\.s\.\b", n):
        return "Dow Jones US"
    if "nasdaq" in n:
        return "NASDAQ US"
    return "NASDAQ US"


def _sector_from_name_or_category(etf_name: str, category: str) -> tuple[str, str]:
    for rx, (en, fr) in SS_PATTERNS:
        if rx.search(etf_name or ""):
            return en, fr
    fr = CAT_FR.get(category, "Composite")
    en = {
        "energy": "Energy", "materials": "Materials", "industrials": "Industrials",
        "consumer-discretionary": "Consumer Discretionary", "consumer-staples": "Consumer Staples",
        "healthcare": "Health Care", "financials": "Finance",
        "information-technology": "Technology", "communication-services": "Communication Services",
        "utilities": "Utilities", "real-estate": "Real Estate"
    }.get(category, "Composite")
    return en, fr


def region_display_from_code(code: str) -> str:
    return "Europe" if str(code).lower() in ("eu", "europe", "eur") else "US"


def make_display_payload(etf_row: dict) -> dict:
    region_disp = region_display_from_code(etf_row.get("region", "us"))
    family = _family_from_row(etf_row.get("name", ""), etf_row.get("symbol", ""), region_disp)
    sec_en, sec_fr = _sector_from_name_or_category(etf_row.get("name", ""), etf_row.get("category", ""))
    return {
        "indexFamily": family, "sector_en": sec_en, "sector_fr": sec_fr,
        "display_fr": f"{family} — {sec_fr}", "indexName": f"{family} {sec_en}",
        "region_display": region_disp,
    }


def create_empty_sectors_data():
    return {
        "sectors": {k: [] for k in VALID_CATEGORIES},
        "top_performers": {
            "daily": {"best": [], "worst": []},
            "ytd": {"best": [], "worst": []},
            "m3": {"best": [], "worst": []},
            "m6": {"best": [], "worst": []},
            "w52": {"best": [], "worst": []}
        },
        "meta": {"source": "Twelve Data", "timestamp": None, "count": 0}
    }


def normalise_category(raw_category: str, symbol: str, etf_name: str) -> str:
    c = (raw_category or "").strip().lower()
    sym = (symbol or "").upper()
    name = (etf_name or "").lower()
    symbol_overrides = {"P3WK": "communication-services"}
    if sym in symbol_overrides:
        return symbol_overrides[sym]
    if any(w in name for w in ["internet", "media", "telecom", "telecommunications"]):
        return "communication-services"
    if "construction & materials" in name or "construction and materials" in name:
        return "industrials" if TAXONOMY == "ICB" else "materials"
    if c in VALID_CATEGORIES:
        return c
    return None


def load_sectors_etf_mapping() -> List[Dict]:
    rows = []
    try:
        with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
            lines = [line for line in f if line.strip() and not line.strip().startswith('#')]
            if not lines:
                logger.error("❌ Aucune donnée trouvée dans le CSV")
                return rows
            filtered_content = io.StringIO(''.join(lines))
            reader = csv.DictReader(filtered_content)
            for idx, r in enumerate(reader):
                try:
                    r = {k.strip(): v.strip() for k, v in r.items() if k}
                    ticker = r.get("symbol", "").strip().upper()
                    if not ticker:
                        continue
                    if not r.get("category"):
                        continue
                    r["symbol"] = ticker
                    rows.append(r)
                except Exception as e:
                    logger.error(f"Erreur ligne {idx+1}: {e}")
    except FileNotFoundError:
        logger.error(f"❌ Fichier CSV non trouvé: {CSV_FILE}")
    except Exception as e:
        logger.error(f"❌ Erreur lors de la lecture du CSV: {e}")
    return rows


# ==================== v1.6: Beta Lookup (US — depuis combined_etfs.csv) ====================

def load_beta_lookup() -> Dict[str, Dict]:
    """
    Charge beta et vol_3y depuis combined_etfs.csv.
    Zero API call — les données existent déjà dans le pipeline ETF.
    """
    lookup: Dict[str, Dict] = {}
    try:
        with open(COMBINED_ETFS_FILE, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                sym = (row.get("symbol") or "").strip().upper()
                if not sym:
                    continue
                beta = _parse_float_safe(row.get("beta"))
                vol_3y = _parse_float_safe(row.get("vol_3y_pct"))
                if beta is not None or vol_3y is not None:
                    lookup[sym] = {"beta": beta, "vol_3y": vol_3y}
        beta_count = sum(1 for v in lookup.values() if v.get("beta") is not None)
        logger.info(f"✅ Beta lookup chargé: {len(lookup)} ETFs ({beta_count} avec beta)")
    except FileNotFoundError:
        logger.warning(f"⚠️ combined_etfs.csv non trouvé → beta lookup vide")
    except Exception as e:
        logger.warning(f"⚠️ Erreur lecture combined_etfs.csv: {e}")
    return lookup


def _parse_float_safe(val) -> Optional[float]:
    """Parse un float, retourne None si invalide/NaN."""
    if val is None:
        return None
    raw = str(val).strip()
    if not raw or raw in ("", "N/A", "nan", "-", "—"):
        return None
    try:
        v = float(raw)
        if v != v:  # NaN check
            return None
        return v
    except (ValueError, TypeError):
        return None


# ==================== v1.6: Beta Computed (EU — depuis time_series 3Y) ====================

def fetch_daily_closes(
    symbol: str,
    mic_code: Optional[str] = None,
    exchange: Optional[str] = None,
    outputsize: int = BETA_LOOKBACK_DAYS,
) -> Optional[List[Tuple[str, float]]]:
    """
    Fetch daily closes via HTTP direct (même pattern que _time_series_http dans twelve_data_utils).
    
    Retourne une liste de (date_str, close) triée par date ASC, ou None si échec.
    """
    if not API_KEY:
        return None

    url = "https://api.twelvedata.com/time_series"
    params = {
        "apikey": API_KEY,
        "symbol": symbol,
        "interval": "1day",
        "outputsize": outputsize,
        "format": "JSON",
        "timezone": "Exchange",
        "dp": 5,
        "order": "ASC",
    }

    # Même logique de tentatives que baseline_period()
    attempts = []
    if mic_code:
        attempts.append(("mic_code", {"mic_code": mic_code}))
        attempts.append(("mic_as_exchange", {"exchange": mic_code}))
    if exchange:
        attempts.append(("exchange", {"exchange": exchange}))
    attempts.append(("symbol_only", {}))

    for label, kwargs in attempts:
        try:
            rate_limit_pause(0.5)
            q = {**params, **kwargs}
            r = requests.get(url, params=q, timeout=30)
            r.raise_for_status()
            js = r.json()

            if isinstance(js, dict) and js.get("status") == "error":
                logger.debug(f"  ⚠️ fetch_closes({symbol}) {label}: {js.get('message')}")
                continue

            # Parser et trier (même logique que _normalize_and_sort)
            values = js.get("values", [])
            if not values:
                continue

            rows = []
            for bar in values:
                d = (bar.get("datetime") or "")[:10]
                c = _parse_float_safe(bar.get("close"))
                if d and c is not None and c > 0:
                    rows.append((d, c))
            
            rows.sort(key=lambda x: x[0])  # ASC par date

            if len(rows) >= BETA_MIN_DATAPOINTS:
                logger.debug(f"  ✅ fetch_closes({symbol}) {label}: {len(rows)} points")
                return rows
            else:
                logger.debug(f"  ⚠️ fetch_closes({symbol}) {label}: {len(rows)} points < {BETA_MIN_DATAPOINTS} min")

        except Exception as e:
            logger.debug(f"  ⚠️ fetch_closes({symbol}) {label}: {e}")
            continue

    return None


def compute_beta_vol(
    etf_closes: List[Tuple[str, float]],
    bench_closes: List[Tuple[str, float]],
) -> Tuple[Optional[float], Optional[float]]:
    """
    Calcule beta et vol annualisée à partir de deux séries de closes alignées par date.
    
    Beta = Cov(R_etf, R_bench) / Var(R_bench)
    Vol  = Std(R_etf) × √252 × 100  (en %)
    
    Pure Python, zero dépendance numpy.
    """
    # Aligner par date (inner join)
    bench_dict = {d: c for d, c in bench_closes}
    aligned = [(d, c, bench_dict[d]) for d, c in etf_closes if d in bench_dict]

    if len(aligned) < BETA_MIN_DATAPOINTS:
        return None, None

    # Daily returns
    etf_ret = []
    bench_ret = []
    for i in range(1, len(aligned)):
        if aligned[i - 1][1] > 0 and aligned[i - 1][2] > 0:
            etf_ret.append(aligned[i][1] / aligned[i - 1][1] - 1.0)
            bench_ret.append(aligned[i][2] / aligned[i - 1][2] - 1.0)

    n = len(etf_ret)
    if n < 60:
        return None, None

    # Moyennes
    mean_e = sum(etf_ret) / n
    mean_b = sum(bench_ret) / n

    # Covariance et variance
    cov = sum((e - mean_e) * (b - mean_b) for e, b in zip(etf_ret, bench_ret)) / (n - 1)
    var_b = sum((b - mean_b) ** 2 for b in bench_ret) / (n - 1)

    if var_b == 0:
        return None, None

    beta = round(cov / var_b, 2)

    # Vol annualisée (%)
    var_e = sum((e - mean_e) ** 2 for e in etf_ret) / (n - 1)
    vol_3y = round(math.sqrt(var_e) * math.sqrt(252) * 100, 2)

    # Guard-rail: rejeter les betas aberrants
    if beta < BETA_GUARD_MIN or beta > BETA_GUARD_MAX:
        logger.warning(f"  ⚠️ Beta={beta} hors garde [{BETA_GUARD_MIN}, {BETA_GUARD_MAX}], rejeté")
        return None, vol_3y

    return beta, vol_3y


def get_benchmark_closes(
    region: str,
    cache: Dict[str, List[Tuple[str, float]]],
) -> Optional[List[Tuple[str, float]]]:
    """
    Retourne les closes du benchmark pour une région, avec cache.
    Fetch une seule fois par région par exécution.
    """
    if region in cache:
        return cache[region]

    config = BENCHMARK_CONFIG.get(region)
    if not config:
        logger.warning(f"⚠️ Pas de benchmark configuré pour région '{region}'")
        return None

    logger.info(f"📡 Fetch benchmark {region}: {config['symbol']} (MIC: {config['mic_code']})")
    closes = fetch_daily_closes(
        symbol=config["symbol"],
        mic_code=config["mic_code"],
        outputsize=BETA_LOOKBACK_DAYS,
    )

    if closes:
        logger.info(f"  ✅ Benchmark {config['symbol']}: {len(closes)} points chargés")
        cache[region] = closes
    else:
        logger.warning(f"  ❌ Benchmark {config['symbol']}: fetch échoué")
        cache[region] = None  # ne pas re-tenter

    return cache[region]


# ============================================================


def clean_sector_data(sector_dict: dict) -> dict:
    return {k: v for k, v in sector_dict.items() if not k.startswith('_')}


def calculate_top_performers(sectors_data: dict, all_sectors: list):
    logger.info("Calcul des top performers sectoriels...")
    for period, key in [("daily", "change_num"), ("ytd", "ytd_num"), ("m3", "m3_num"), ("m6", "m6_num"), ("w52", "w52_num")]:
        items = [s for s in all_sectors if s.get(key) is not None]
        if items:
            sorted_desc = sorted(items, key=lambda x: x[key], reverse=True)
            sorted_asc = sorted(items, key=lambda x: x[key])
            sectors_data["top_performers"][period]["best"] = [clean_sector_data(s) for s in sorted_desc[:3]]
            sectors_data["top_performers"][period]["worst"] = [clean_sector_data(s) for s in sorted_asc[:3]]


def main():
    logger.info("🚀 Début de la mise à jour des données sectorielles...")
    logger.info(f"API key loaded: {bool(API_KEY)}")
    logger.info(f"📊 Référentiel sectoriel: {TAXONOMY}")

    if not API_KEY:
        logger.error("❌ Clé API Twelve Data manquante")
        return

    TD = get_td_client()
    if not TD:
        logger.error("❌ Client Twelve Data non initialisé")
        return

    # Test rapide de l'API
    try:
        logger.info("🔍 Test de connexion à l'API...")
        test_response = TD.quote(symbol="AAPL").as_json()
        if isinstance(test_response, dict) and "close" in test_response:
            logger.info("✅ API fonctionnelle")
        else:
            logger.error(f"❌ Réponse API invalide: {test_response}")
            return
    except Exception as e:
        logger.error(f"❌ Erreur de connexion API: {e}")
        return

    SECTORS_DATA = create_empty_sectors_data()
    ALL_SECTORS = []

    # 1. Charger le mapping des ETFs sectoriels
    sectors_mapping = load_sectors_etf_mapping()

    if not sectors_mapping:
        logger.error("❌ Aucun ETF trouvé dans le fichier CSV")
        SECTORS_DATA["meta"]["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(SECTORS_DATA, f, ensure_ascii=False, indent=2)
        return

    logger.info(f"📊 {len(sectors_mapping)} ETFs sectoriels à traiter")

    # v1.6: Source duale pour beta
    beta_lookup = load_beta_lookup()
    benchmark_cache: Dict[str, Optional[List[Tuple[str, float]]]] = {}

    # 2. Traiter chaque ETF
    processed_count = 0
    error_count = 0
    ytd_warnings = 0
    m3_missing_count = 0
    m6_missing_count = 0
    w52_missing_count = 0
    beta_from_lookup = 0   # v1.6
    beta_computed = 0       # v1.6
    beta_failed = 0         # v1.6
    year = dt.date.today().year

    for idx, etf in enumerate(sectors_mapping):
        sym = etf["symbol"]

        raw_category = etf.get("category", "")
        category = normalise_category(raw_category, sym, etf.get("name", sym))

        if raw_category == "broad-market":
            logger.info(f"⏭️  Ignoré (broad-market): {sym}")
            continue

        if not category or category not in SECTORS_DATA["sectors"]:
            logger.warning(f"⚠️  Catégorie invalide '{raw_category}' → '{category}' pour {sym}")
            continue

        try:
            if idx > 0:
                rate_limit_pause()

            logger.info(f"📡 Traitement {idx+1}/{len(sectors_mapping)}: {sym}")

            norm = make_display_payload(etf)
            region_display = norm["region_display"]

            exchange = (etf.get("exchange") or "").strip().upper() or None
            mic_code = (etf.get("mic_code") or "").strip().upper() or None

            if mic_code:
                logger.info(f"  → MIC: {mic_code}")
            elif exchange:
                logger.info(f"  → Exchange: {exchange}")

            # Récupérer prix + variation jour
            last, day_pct, last_src = quote_one(sym, region_display, exchange=exchange, mic_code=mic_code)
            rate_limit_pause(0.5)

            # Baseline YTD
            base_close, base_date = baseline_ytd(sym, region_display, exchange=exchange, mic_code=mic_code)
            if base_date.startswith(str(year)):
                ytd_warnings += 1
            ytd_pct = 100 * (last - base_close) / base_close if base_close > 0 else 0.0

            # Baseline 3M
            rate_limit_pause(0.5)
            base_3m_close, base_3m_date = baseline_3m(sym, region_display, exchange=exchange, mic_code=mic_code)
            m3_pct = None
            if base_3m_close and base_3m_close > 0:
                m3_pct = 100 * (last - base_3m_close) / base_3m_close
            else:
                m3_missing_count += 1

            # Baseline 6M
            rate_limit_pause(0.5)
            base_6m_close, base_6m_date = baseline_6m(sym, region_display, exchange=exchange, mic_code=mic_code)
            m6_pct = None
            if base_6m_close and base_6m_close > 0:
                m6_pct = 100 * (last - base_6m_close) / base_6m_close
            else:
                m6_missing_count += 1

            # Baseline 52W
            rate_limit_pause(0.5)
            base_52w_close, base_52w_date = baseline_52w(sym, region_display, exchange=exchange, mic_code=mic_code)
            w52_pct = None
            if base_52w_close and base_52w_close > 0:
                w52_pct = 100 * (last - base_52w_close) / base_52w_close
            else:
                w52_missing_count += 1

            # ==================== v1.6: Beta (source duale) ====================
            etf_beta = None
            etf_vol_3y = None
            beta_source = None

            # Source 1: combined_etfs.csv (US principalement)
            beta_data = beta_lookup.get(sym, {})
            if beta_data.get("beta") is not None:
                etf_beta = beta_data["beta"]
                etf_vol_3y = beta_data.get("vol_3y")
                beta_source = "combined_csv"
                beta_from_lookup += 1
                logger.info(f"  📈 Beta lookup: β={etf_beta:.2f}")

            # Source 2: Calcul maison depuis time_series (fallback EU)
            if etf_beta is None:
                logger.info(f"  📐 Beta non trouvé dans lookup → calcul time_series...")
                bench_closes = get_benchmark_closes(region_display, benchmark_cache)

                if bench_closes:
                    etf_closes = fetch_daily_closes(sym, mic_code=mic_code, exchange=exchange)

                    if etf_closes:
                        calc_beta, calc_vol = compute_beta_vol(etf_closes, bench_closes)
                        if calc_beta is not None:
                            etf_beta = calc_beta
                            etf_vol_3y = calc_vol
                            beta_source = "computed_3y"
                            beta_computed += 1
                            bench_sym = BENCHMARK_CONFIG.get(region_display, {}).get("symbol", "?")
                            logger.info(f"  ✅ Beta calculé: β={etf_beta:.2f} vol={etf_vol_3y:.1f}% (vs {bench_sym})")
                        else:
                            beta_failed += 1
                            logger.info(f"  ⚠️ Beta calcul échoué (données insuffisantes ou aberrantes)")
                    else:
                        beta_failed += 1
                        logger.info(f"  ⚠️ Pas assez de données time_series pour calcul beta")
                else:
                    beta_failed += 1
                    logger.info(f"  ⚠️ Benchmark non disponible pour {region_display}")
            # ==================================================================

            # Construire l'entrée
            sector_entry = {
                "symbol": sym,
                "name": etf.get("name", sym),
                "indexFamily": norm["indexFamily"],
                "indexName": norm["indexName"],
                "display_fr": norm["display_fr"],
                "sector_en": norm["sector_en"],
                "sector_fr": norm["sector_fr"],
                "value": format_value(last, etf.get("currency", "USD")),
                "changePercent": format_percent(day_pct),
                "ytdChange": format_percent(ytd_pct),
                "m3Change": format_percent(m3_pct) if m3_pct is not None else None,
                "m6Change": format_percent(m6_pct) if m6_pct is not None else None,
                "w52Change": format_percent(w52_pct) if w52_pct is not None else None,
                "value_num": float(last),
                "change_num": float(day_pct),
                "ytd_num": float(ytd_pct),
                "m3_num": float(m3_pct) if m3_pct is not None else None,
                "m6_num": float(m6_pct) if m6_pct is not None else None,
                "w52_num": float(w52_pct) if w52_pct is not None else None,
                # v1.6: Beta et volatilité (source duale)
                "beta": etf_beta,
                "vol_3y": etf_vol_3y,
                "beta_source": beta_source,
                "last_price_source": last_src,
                "ytd_ref_date": base_date,
                "m3_ref_date": base_3m_date,
                "m6_ref_date": base_6m_date,
                "w52_ref_date": base_52w_date,
                "ytd_method": "price_last_close_prev_year_to_last_close",
                "trend": "down" if day_pct < 0 else "up",
                "region": region_display,
                "exchange": exchange,
                "mic_code": mic_code
            }

            SECTORS_DATA["sectors"][category].append(sector_entry)
            ALL_SECTORS.append(sector_entry.copy())
            processed_count += 1

            # Log résumé
            m3_str = f"3M:{m3_pct:+.1f}%" if m3_pct is not None else "3M:N/A"
            m6_str = f"6M:{m6_pct:+.1f}%" if m6_pct is not None else "6M:N/A"
            w52_str = f"52W:{w52_pct:+.1f}%" if w52_pct is not None else "52W:N/A"
            beta_str = f"β:{etf_beta:.2f}({beta_source})" if etf_beta is not None else "β:N/A"
            logger.info(f"✅ {sym} [{category}]: {last} ({day_pct:+.2f}%) YTD:{ytd_pct:+.1f}% {m3_str} {m6_str} {w52_str} {beta_str}")

        except Exception as e:
            error_count += 1
            logger.warning(f"⚠️  Échec pour {sym}: {type(e).__name__}: {e}")
            if "errors" not in SECTORS_DATA["meta"]:
                SECTORS_DATA["meta"]["errors"] = []
            SECTORS_DATA["meta"]["errors"].append({
                "symbol": sym, "name": etf.get("name", "N/A"),
                "exchange": etf.get("exchange", "N/A"), "mic_code": etf.get("mic_code", "N/A"),
                "error": str(e), "timestamp": dt.datetime.utcnow().isoformat()
            })
            continue

    # 3. Résumé
    logger.info(f"\n📊 Résumé du traitement:")
    logger.info(f"  - ETFs traités avec succès: {processed_count}")
    logger.info(f"  - Erreurs: {error_count}")
    # v1.6: Log couverture beta détaillé
    beta_total = beta_from_lookup + beta_computed
    logger.info(f"  - 📈 Beta couverture: {beta_total}/{processed_count} ({100*beta_total/max(processed_count,1):.0f}%)")
    logger.info(f"    └─ Depuis combined_etfs.csv: {beta_from_lookup}")
    logger.info(f"    └─ Calculé time_series 3Y:  {beta_computed}")
    logger.info(f"    └─ Échec/manquant:          {beta_failed}")
    if ytd_warnings > 0:
        logger.info(f"  - ℹ️ Baselines YTD début {year}: {ytd_warnings}")
    if m3_missing_count > 0:
        logger.info(f"  - ℹ️ ETFs sans données 3M: {m3_missing_count}")
    if m6_missing_count > 0:
        logger.info(f"  - ℹ️ ETFs sans données 6M: {m6_missing_count}")
    if w52_missing_count > 0:
        logger.info(f"  - ℹ️ ETFs sans données 52W: {w52_missing_count}")

    for category, sectors in SECTORS_DATA["sectors"].items():
        if sectors:
            logger.info(f"  - {category}: {len(sectors)} secteurs")

    # 4. Top performers
    if processed_count > 0:
        calculate_top_performers(SECTORS_DATA, ALL_SECTORS)

    # 5. Metadata
    SECTORS_DATA["meta"]["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"
    SECTORS_DATA["meta"]["count"] = processed_count
    SECTORS_DATA["meta"]["total_etfs"] = len(sectors_mapping)
    SECTORS_DATA["meta"]["errors_count"] = error_count
    SECTORS_DATA["meta"]["taxonomy"] = TAXONOMY
    # v1.6: Beta metadata
    SECTORS_DATA["meta"]["beta_coverage"] = {
        "total_with_beta": beta_total,
        "from_combined_csv": beta_from_lookup,
        "computed_3y": beta_computed,
        "failed": beta_failed,
        "total_processed": processed_count,
        "coverage_pct": round(100 * beta_total / max(processed_count, 1), 1),
        "benchmarks": {k: v["symbol"] for k, v in BENCHMARK_CONFIG.items()},
        "guard_rails": {"min": BETA_GUARD_MIN, "max": BETA_GUARD_MAX},
    }
    SECTORS_DATA["meta"]["ytd_calculation"] = {
        "method": "price_last_close_prev_year_to_last_close_with_fallback",
        "baseline_year": year - 1,
        "timezone_mapping": TZ_BY_REGION,
        "note": f"YTD basé sur le dernier close de {year-1} ou fallback 1er jour {year}"
    }
    SECTORS_DATA["meta"]["m3_calculation"] = {
        "method": "price_close_nearest_to_today_minus_91d",
        "lookback_days": PERIOD_3M_DAYS, "max_gap_days": 7,
        "note": "Retourne null si historique < 3 mois"
    }
    SECTORS_DATA["meta"]["m6_calculation"] = {
        "method": "price_close_nearest_to_today_minus_182d",
        "lookback_days": PERIOD_6M_DAYS, "max_gap_days": 10,
        "note": "Retourne null si historique < 6 mois"
    }
    SECTORS_DATA["meta"]["w52_calculation"] = {
        "method": "price_close_nearest_to_today_minus_365d",
        "lookback_days": PERIOD_52W_DAYS, "outputsize": 420, "max_gap_days": 10,
        "note": "Retourne null si historique < 1 an"
    }
    if ytd_warnings > 0:
        SECTORS_DATA["meta"]["ytd_fallback_count"] = ytd_warnings
    if m3_missing_count > 0:
        SECTORS_DATA["meta"]["m3_missing_count"] = m3_missing_count
    if m6_missing_count > 0:
        SECTORS_DATA["meta"]["m6_missing_count"] = m6_missing_count
    if w52_missing_count > 0:
        SECTORS_DATA["meta"]["w52_missing_count"] = w52_missing_count

    # 6. Sauvegarde
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(SECTORS_DATA, f, ensure_ascii=False, indent=2)

    logger.info(f"\n✅ Mise à jour terminée")
    logger.info(f"📄 Fichier sauvegardé : {OUTPUT_FILE}")
    logger.info(f"📊 {processed_count}/{len(sectors_mapping)} secteurs traités")

    if error_count > 0 and "errors" in SECTORS_DATA["meta"]:
        logger.info(f"\n⚠️  Détail des {min(5, error_count)} premières erreurs:")
        for err in SECTORS_DATA["meta"]["errors"][:5]:
            logger.info(f"  - {err['symbol']}: {err['error']}")


if __name__ == "__main__":
    main()
