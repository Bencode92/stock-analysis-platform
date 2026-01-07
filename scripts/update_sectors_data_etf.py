#!/usr/bin/env python3
"""
Script de mise à jour des données sectorielles via Twelve Data API
Utilise des ETFs sectoriels pour représenter les performances des secteurs
Génère des libellés normalisés bilingues pour l'affichage

v5 - AJOUT: Calcul 3M et 6M (momentum court/moyen terme)
     - Nouvelles métriques m3_num, m6_num
     - Dates de référence m3_ref_date, m6_ref_date
     - Top performers 3M et 6M
v4 - AJOUT: Calcul 52W (52 semaines glissant)
v3 - FIX: Passage exchange/mic_code aux fonctions API
"""

import os
import csv
import json
import datetime as dt
import io
import re
from typing import Dict, List, Tuple
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

# Référentiel sectoriel:
#  - "ICB" (STOXX/FTSE) : Construction & Materials -> Industrials
#  - "GICS" (S&P/MSCI)  : Construction Materials    -> Materials
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

# Sous-secteurs à extraire depuis le nom (ordre du +spécifique au +général)
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

    # Forçages par symbole (cas ambigus)
    FORCE_FAMILY = {
        "IYH": "Dow Jones US",
        "IYW": "Dow Jones US",
        "IYG": "Dow Jones US",
        "XBI": "S&P US",
    }
    if sym in FORCE_FAMILY:
        return FORCE_FAMILY[sym]

    # Europe simple
    if region_display == "Europe":
        return "STOXX Europe 600"

    # US — heuristiques par nom
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
    """Extrait le secteur/sous-secteur depuis le nom ETF ou retombe sur la catégorie"""
    for rx, (en, fr) in SS_PATTERNS:
        if rx.search(etf_name or ""):
            return en, fr
    
    fr = CAT_FR.get(category, "Composite")
    
    en = {
        "energy": "Energy",
        "materials": "Materials",
        "industrials": "Industrials",
        "consumer-discretionary": "Consumer Discretionary",
        "consumer-staples": "Consumer Staples",
        "healthcare": "Health Care",
        "financials": "Finance",
        "information-technology": "Technology",
        "communication-services": "Communication Services",
        "utilities": "Utilities",
        "real-estate": "Real Estate"
    }.get(category, "Composite")
    
    return en, fr


def region_display_from_code(code: str) -> str:
    """Convertit le code région du CSV en affichage normalisé"""
    return "Europe" if str(code).lower() in ("eu", "europe", "eur") else "US"


def make_display_payload(etf_row: dict) -> dict:
    """Génère les libellés d'affichage normalisés"""
    region_disp = region_display_from_code(etf_row.get("region", "us"))
    family = _family_from_row(etf_row.get("name", ""), etf_row.get("symbol", ""), region_disp)
    sec_en, sec_fr = _sector_from_name_or_category(etf_row.get("name", ""), etf_row.get("category", ""))
    
    return {
        "indexFamily": family,
        "sector_en": sec_en,
        "sector_fr": sec_fr,
        "display_fr": f"{family} — {sec_fr}",
        "indexName": f"{family} {sec_en}",
        "region_display": region_disp,
    }


def create_empty_sectors_data():
    """Crée une structure de données vide pour les secteurs"""
    return {
        "sectors": {
            "energy": [],
            "materials": [],
            "industrials": [],
            "consumer-discretionary": [],
            "consumer-staples": [],
            "healthcare": [],
            "financials": [],
            "information-technology": [],
            "communication-services": [],
            "utilities": [],
            "real-estate": []
        },
        "top_performers": {
            "daily": {
                "best": [],
                "worst": []
            },
            "ytd": {
                "best": [],
                "worst": []
            },
            "m3": {
                "best": [],
                "worst": []
            },
            "m6": {
                "best": [],
                "worst": []
            },
            "w52": {
                "best": [],
                "worst": []
            }
        },
        "meta": {
            "source": "Twelve Data",
            "timestamp": None,
            "count": 0
        }
    }


def normalise_category(raw_category: str, symbol: str, etf_name: str) -> str:
    """Applique les overrides et la logique ICB/GICS pour retourner une catégorie valide."""
    c = (raw_category or "").strip().lower()
    sym = (symbol or "").upper()
    name = (etf_name or "").lower()

    # Overrides par symbole (prioritaires)
    symbol_overrides = {
        "P3WK": "communication-services",
    }
    if sym in symbol_overrides:
        return symbol_overrides[sym]

    # Heuristiques par libellé
    if any(w in name for w in ["internet", "media", "telecom", "telecommunications"]):
        return "communication-services"

    # Construction & Materials -> dépend du référentiel choisi
    if "construction & materials" in name or "construction and materials" in name:
        return "industrials" if TAXONOMY == "ICB" else "materials"

    # Si déjà correcte
    if c in VALID_CATEGORIES:
        return c

    return None


def load_sectors_etf_mapping() -> List[Dict]:
    """Charge le mapping des ETFs sectoriels depuis le CSV"""
    rows = []
    
    try:
        with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
            lines = []
            for line in f:
                line_stripped = line.strip()
                if line_stripped and not line_stripped.startswith('#'):
                    lines.append(line)
            
            if not lines:
                logger.error("❌ Aucune donnée trouvée dans le CSV")
                return rows
            
            filtered_content = io.StringIO(''.join(lines))
            reader = csv.DictReader(filtered_content)
            
            if reader.fieldnames:
                logger.debug(f"📋 Colonnes CSV: {reader.fieldnames}")
            
            for idx, r in enumerate(reader):
                try:
                    r = {k.strip(): v.strip() for k, v in r.items() if k}
                    
                    ticker = r.get("symbol", "").strip().upper()
                    
                    if not ticker:
                        logger.warning(f"Ligne {idx+1}: Ticker absent, ignoré")
                        continue
                    
                    if not r.get("category"):
                        logger.warning(f"Ligne {idx+1}: Catégorie manquante pour {ticker}")
                        continue
                    
                    r["symbol"] = ticker
                    rows.append(r)
                    logger.debug(f"✅ ETF chargé: {ticker}")
                    
                except Exception as e:
                    logger.error(f"Erreur ligne {idx+1}: {e}")
                    
    except FileNotFoundError:
        logger.error(f"❌ Fichier CSV non trouvé: {CSV_FILE}")
    except Exception as e:
        logger.error(f"❌ Erreur lors de la lecture du CSV: {e}")
    
    return rows


def clean_sector_data(sector_dict: dict) -> dict:
    """Nettoie un dictionnaire en supprimant les propriétés temporaires"""
    return {k: v for k, v in sector_dict.items() if not k.startswith('_')}


def calculate_top_performers(sectors_data: dict, all_sectors: list):
    """Calcule top/bottom jour, YTD, 3M, 6M et 52W"""
    logger.info("Calcul des top performers sectoriels...")

    daily = [s for s in all_sectors if isinstance(s.get("change_num"), (int, float))]
    ytd = [s for s in all_sectors if isinstance(s.get("ytd_num"), (int, float))]
    m3 = [s for s in all_sectors if s.get("m3_num") is not None]
    m6 = [s for s in all_sectors if s.get("m6_num") is not None]
    w52 = [s for s in all_sectors if s.get("w52_num") is not None]

    # Daily
    if daily:
        daily_sorted = sorted(daily, key=lambda x: x["change_num"], reverse=True)
        best_daily = daily_sorted[:3]
        worst_daily = sorted(daily, key=lambda x: x["change_num"])[:3]

        sectors_data["top_performers"]["daily"]["best"] = [clean_sector_data(s) for s in best_daily]
        sectors_data["top_performers"]["daily"]["worst"] = [clean_sector_data(s) for s in worst_daily]

    # YTD
    if ytd:
        ytd_sorted = sorted(ytd, key=lambda x: x["ytd_num"], reverse=True)
        best_ytd = ytd_sorted[:3]
        worst_ytd = sorted(ytd, key=lambda x: x["ytd_num"])[:3]

        sectors_data["top_performers"]["ytd"]["best"] = [clean_sector_data(s) for s in best_ytd]
        sectors_data["top_performers"]["ytd"]["worst"] = [clean_sector_data(s) for s in worst_ytd]

    # 3M (v5)
    if m3:
        m3_sorted = sorted(m3, key=lambda x: x["m3_num"], reverse=True)
        best_m3 = m3_sorted[:3]
        worst_m3 = sorted(m3, key=lambda x: x["m3_num"])[:3]

        sectors_data["top_performers"]["m3"]["best"] = [clean_sector_data(s) for s in best_m3]
        sectors_data["top_performers"]["m3"]["worst"] = [clean_sector_data(s) for s in worst_m3]

    # 6M (v5)
    if m6:
        m6_sorted = sorted(m6, key=lambda x: x["m6_num"], reverse=True)
        best_m6 = m6_sorted[:3]
        worst_m6 = sorted(m6, key=lambda x: x["m6_num"])[:3]

        sectors_data["top_performers"]["m6"]["best"] = [clean_sector_data(s) for s in best_m6]
        sectors_data["top_performers"]["m6"]["worst"] = [clean_sector_data(s) for s in worst_m6]

    # 52W
    if w52:
        w52_sorted = sorted(w52, key=lambda x: x["w52_num"], reverse=True)
        best_w52 = w52_sorted[:3]
        worst_w52 = sorted(w52, key=lambda x: x["w52_num"])[:3]

        sectors_data["top_performers"]["w52"]["best"] = [clean_sector_data(s) for s in best_w52]
        sectors_data["top_performers"]["w52"]["worst"] = [clean_sector_data(s) for s in worst_w52]


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
    
    # 2. Traiter chaque ETF
    processed_count = 0
    error_count = 0
    ytd_warnings = 0
    m3_missing_count = 0
    m6_missing_count = 0
    w52_missing_count = 0
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
            # Rate limiting
            if idx > 0:
                rate_limit_pause()
            
            logger.info(f"📡 Traitement {idx+1}/{len(sectors_mapping)}: {sym}")
            
            norm = make_display_payload(etf)
            region_display = norm["region_display"]
            
            # ===== FIX v3: Récupérer et normaliser exchange/mic_code =====
            exchange = (etf.get("exchange") or "").strip().upper() or None
            mic_code = (etf.get("mic_code") or "").strip().upper() or None
            
            if mic_code:
                logger.info(f"  → MIC: {mic_code}")
            elif exchange:
                logger.info(f"  → Exchange: {exchange}")
            # ==============================================================
            
            # Récupérer les données avec timezone ET exchange/mic_code
            last, day_pct, last_src = quote_one(
                sym, 
                region_display,
                exchange=exchange,
                mic_code=mic_code
            )
            
            rate_limit_pause(0.5)
            
            # Baseline YTD (dernier close N-1) - AUSSI avec exchange/mic_code
            base_close, base_date = baseline_ytd(
                sym, 
                region_display,
                exchange=exchange,
                mic_code=mic_code
            )
            
            if base_date.startswith(str(year)):
                ytd_warnings += 1
                logger.info(f"ℹ️ {sym}: YTD baseline début {year}")
            
            ytd_pct = 100 * (last - base_close) / base_close if base_close > 0 else 0.0
            
            # ==================== v5: Baseline 3M ====================
            rate_limit_pause(0.5)
            
            base_3m_close, base_3m_date = baseline_3m(
                sym,
                region_display,
                exchange=exchange,
                mic_code=mic_code
            )
            
            m3_pct = None
            if base_3m_close and base_3m_close > 0:
                m3_pct = 100 * (last - base_3m_close) / base_3m_close
            else:
                m3_missing_count += 1
                logger.info(f"ℹ️ {sym}: Pas de données 3M (historique < 3 mois)")
            
            # ==================== v5: Baseline 6M ====================
            rate_limit_pause(0.5)
            
            base_6m_close, base_6m_date = baseline_6m(
                sym,
                region_display,
                exchange=exchange,
                mic_code=mic_code
            )
            
            m6_pct = None
            if base_6m_close and base_6m_close > 0:
                m6_pct = 100 * (last - base_6m_close) / base_6m_close
            else:
                m6_missing_count += 1
                logger.info(f"ℹ️ {sym}: Pas de données 6M (historique < 6 mois)")
            
            # ==================== Baseline 52W ====================
            rate_limit_pause(0.5)
            
            base_52w_close, base_52w_date = baseline_52w(
                sym,
                region_display,
                exchange=exchange,
                mic_code=mic_code
            )
            
            w52_pct = None
            if base_52w_close and base_52w_close > 0:
                w52_pct = 100 * (last - base_52w_close) / base_52w_close
            else:
                w52_missing_count += 1
                logger.info(f"ℹ️ {sym}: Pas de données 52W (historique < 1 an)")
            
            # ==================== Construire l'entrée ====================
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
            m3_str = f"3M: {m3_pct:+.2f}%" if m3_pct is not None else "3M: N/A"
            m6_str = f"6M: {m6_pct:+.2f}%" if m6_pct is not None else "6M: N/A"
            w52_str = f"52W: {w52_pct:+.2f}%" if w52_pct is not None else "52W: N/A"
            logger.info(f"✅ {sym} [{category}]: {last} ({day_pct:+.2f}%) YTD: {ytd_pct:+.2f}% {m3_str} {m6_str} {w52_str}")
            
        except Exception as e:
            error_count += 1
            logger.warning(f"⚠️  Échec pour {sym}: {type(e).__name__}: {e}")
            
            if "errors" not in SECTORS_DATA["meta"]:
                SECTORS_DATA["meta"]["errors"] = []
            
            SECTORS_DATA["meta"]["errors"].append({
                "symbol": sym,
                "name": etf.get("name", "N/A"),
                "exchange": etf.get("exchange", "N/A"),
                "mic_code": etf.get("mic_code", "N/A"),
                "error": str(e),
                "timestamp": dt.datetime.utcnow().isoformat()
            })
            continue
    
    # 3. Résumé
    logger.info(f"\n📊 Résumé du traitement:")
    logger.info(f"  - ETFs traités avec succès: {processed_count}")
    logger.info(f"  - Erreurs: {error_count}")
    if ytd_warnings > 0:
        logger.info(f"  - ℹ️ Baselines YTD début {year}: {ytd_warnings}")
    if m3_missing_count > 0:
        logger.info(f"  - ℹ️ ETFs sans données 3M (historique < 3 mois): {m3_missing_count}")
    if m6_missing_count > 0:
        logger.info(f"  - ℹ️ ETFs sans données 6M (historique < 6 mois): {m6_missing_count}")
    if w52_missing_count > 0:
        logger.info(f"  - ℹ️ ETFs sans données 52W (historique < 1 an): {w52_missing_count}")
    
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
    SECTORS_DATA["meta"]["ytd_calculation"] = {
        "method": "price_last_close_prev_year_to_last_close_with_fallback",
        "baseline_year": year - 1,
        "timezone_mapping": TZ_BY_REGION,
        "note": f"YTD basé sur le dernier close de {year-1} ou fallback 1er jour {year}"
    }
    # v5: Metadata pour 3M et 6M
    SECTORS_DATA["meta"]["m3_calculation"] = {
        "method": "price_close_nearest_to_today_minus_91d",
        "lookback_days": PERIOD_3M_DAYS,
        "max_gap_days": 7,
        "note": "Retourne null si historique < 3 mois"
    }
    SECTORS_DATA["meta"]["m6_calculation"] = {
        "method": "price_close_nearest_to_today_minus_182d",
        "lookback_days": PERIOD_6M_DAYS,
        "max_gap_days": 10,
        "note": "Retourne null si historique < 6 mois"
    }
    SECTORS_DATA["meta"]["w52_calculation"] = {
        "method": "price_close_nearest_to_today_minus_365d",
        "lookback_days": PERIOD_52W_DAYS,
        "outputsize": 420,
        "max_gap_days": 10,
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
