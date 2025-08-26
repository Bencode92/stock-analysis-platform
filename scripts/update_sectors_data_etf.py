#!/usr/bin/env python3
"""
Script de mise à jour des données sectorielles via Twelve Data API
Utilise des ETFs sectoriels pour représenter les performances des secteurs
Génère des libellés normalisés bilingues pour l'affichage
Calculs YTD fiabilisés avec fuseaux horaires et close de référence
"""

import os
import csv
import json
import datetime as dt
import io
import time
import re
from typing import Dict, List, Tuple
import logging
from twelvedata import TDClient

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
API_KEY = os.getenv("TWELVE_DATA_API")
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

# Mapping des fuseaux horaires par région
TZ_BY_REGION = {
    "US": "America/New_York",
    "Europe": "Europe/Paris"  # ou Europe/Zurich selon préférence
}

# Client Twelve Data
if API_KEY:
    TD = TDClient(apikey=API_KEY)
else:
    logger.error("❌ Clé API Twelve Data non définie!")
    TD = None

# ==== Normalisation libellés affichage (à partir de TON CSV) ====
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
    (re.compile(r"insurance", re.I), ("Insurance", "Assurance")),
    (re.compile(r"financial\s*services?", re.I), ("Financial Services", "Services financiers")),
    (re.compile(r"media", re.I), ("Media", "Médias")),
    (re.compile(r"telecommunications?", re.I), ("Telecommunications", "Télécommunications")),
    (re.compile(r"construction\s*&\s*materials?", re.I), ("Construction & Materials", "Construction & Matériaux")),
    (re.compile(r"basic\s*resources?", re.I), ("Basic Resources", "Ressources de base")),
    (re.compile(r"chemicals?", re.I), ("Chemicals", "Chimie")),
    (re.compile(r"automobiles?|autos?", re.I), ("Automobiles", "Automobiles")),
    (re.compile(r"smart\s*grid", re.I), ("Smart Grid Infrastructure", "Infrastructures réseaux intelligents")),
    (re.compile(r"transportation", re.I), ("Transportation", "Transports")),
    (re.compile(r"technology\s*dividend", re.I), ("Technology Dividend", "Dividendes technologiques")),
]

def _family_from_row(name: str, symbol: str, region_display: str) -> str:
    """Détermine la famille d'indices (STOXX Europe 600, NASDAQ US, S&P 500) depuis les infos ETF"""
    n = name.lower()
    sym = symbol.upper()
    
    # Forçages spécifiques par symbole
    FORCE_FAMILY = {
        "IYH": "Dow Jones US",  # iShares U.S. Healthcare
    }
    fam = FORCE_FAMILY.get(sym)
    if fam:
        return fam
    
    # Europe
    if region_display == "Europe":
        return "STOXX Europe 600"
    
    # US - détection par nom
    if "nasdaq" in n:
        return "NASDAQ US"
    if "select sector spdr" in n or re.match(r"^XL[A-Z]{1,2}$", sym, re.I):
        return "S&P 500"
    if "dow jones" in n or "dj " in n:
        return "Dow Jones US"
    
    # Fallback US
    return "NASDAQ US"

def _sector_from_name_or_category(etf_name: str, category: str) -> tuple[str, str]:
    """Extrait le secteur/sous-secteur depuis le nom ETF ou retombe sur la catégorie"""
    # Tente un sous-secteur via le nom
    for rx, (en, fr) in SS_PATTERNS:
        if rx.search(etf_name or ""):
            return en, fr
    
    # Sinon retombe sur la catégorie générale
    fr = CAT_FR.get(category, "Composite")
    
    # EN "générique" aligné
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
    """
    À partir des colonnes CSV + nom ETF, retourne:
    - indexFamily (STOXX Europe 600 / NASDAQ US / S&P 500)
    - sector_en / sector_fr
    - display_fr  (ex: 'NASDAQ US — Semi-conducteurs')
    - indexName   (ex: 'NASDAQ US Semiconductor')
    """
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
            }
        },
        "meta": {
            "source": "Twelve Data",
            "timestamp": None,
            "count": 0
        }
    }

def quote_one(sym: str, region_display: str) -> Tuple[float, float, str]:
    """Dernier close 'propre' + var jour; privilégie previous_close si marché ouvert."""
    try:
        timezone = TZ_BY_REGION.get(region_display, "UTC")
        q_json = TD.quote(symbol=sym, timezone=timezone).as_json()
        
        if isinstance(q_json, tuple):
            q_json = q_json[0]
        
        # Par sécurité - récupérer les valeurs
        close = None
        pc = None
        
        if q_json.get("close") not in (None, "None", ""):
            try:
                close = float(q_json.get("close"))
            except (ValueError, TypeError):
                pass
                
        if q_json.get("previous_close") not in (None, "None", ""):
            try:
                pc = float(q_json.get("previous_close"))
            except (ValueError, TypeError):
                pass
        
        is_open = q_json.get("is_market_open", False) == "true" if isinstance(q_json.get("is_market_open"), str) else bool(q_json.get("is_market_open", False))
        
        # Si le marché est ouvert et que previous_close existe -> on prend previous_close
        last_close = pc if (is_open and pc is not None) else close
        
        if last_close is None:
            raise ValueError(f"Quote sans close valide pour {sym}: {q_json}")
        
        day_pct = float(q_json.get("percent_change", 0))
        
        # Informe la source pour debug
        source = "previous_close" if (is_open and pc is not None) else "close"
        
        logger.debug(f"Quote {sym}: {last_close} ({day_pct:+.2f}%), source: {source}, timezone: {timezone}")
        
        return last_close, day_pct, source
        
    except Exception as e:
        logger.error(f"Erreur quote pour {sym}: {e}")
        raise

def first_close_of_year(sym: str, region_display: str) -> Tuple[float, str]:
    """Close de la première séance ouvrée de l'année (price-only) - CORRIGÉ avec outputsize=5000."""
    year = dt.date.today().year
    tz = TZ_BY_REGION.get(region_display, "UTC")
    
    try:
        # IMPORTANT: outputsize=5000 pour récupérer toute l'année
        ts_json = TD.time_series(
            symbol=sym,
            interval="1day",
            start_date=f"{year}-01-01 00:00:00",
            end_date=f"{year}-12-31 23:59:59",
            order="ASC",
            outputsize=5000,  # ⚠️ CRITIQUE: doit être grand pour avoir janvier
            timezone=tz,
        ).as_json()

        if isinstance(ts_json, tuple):
            ts_json = ts_json[0]

        # Normalise les différents formats possibles
        values = []
        if isinstance(ts_json, dict) and ts_json.get("values"):
            values = ts_json["values"]
        elif isinstance(ts_json, list):
            values = ts_json
        elif isinstance(ts_json, dict) and all(k in ts_json for k in ("datetime", "close")):
            values = [ts_json]
        else:
            logger.error(f"Format time_series inattendu pour {sym}: {type(ts_json)}")
            raise ValueError(f"Format time_series inattendu pour {sym}")

        if not values:
            raise ValueError(f"Aucune donnée historique pour {sym}")

        # Prend la première bougie qui a un 'close' numérique
        for row in values:
            # Préférer adjusted_close si disponible (pour le total return)
            close_key = "adjusted_close" if "adjusted_close" in row and row["adjusted_close"] not in (None, "None", "") else "close"
            
            if close_key in row and row[close_key] not in (None, "None", ""):
                try:
                    close_val = float(row[close_key])
                    date_str = str(row.get("datetime", row.get("date", row.get("time", f"{year}-01-XX"))))
                    
                    # VÉRIFICATION CRITIQUE: La date doit être en janvier
                    if not date_str.startswith(f"{year}-01"):
                        logger.warning(f"⚠️ YTD ref date pour {sym} n'est pas en janvier: {date_str}")
                        logger.warning(f"   L'API a peut-être tronqué la série. Vérifiez votre abonnement Twelve Data.")
                    
                    logger.debug(f"Premier close {sym}: {close_val} le {date_str} (timezone: {tz}, type: {close_key})")
                    return close_val, date_str
                    
                except (ValueError, TypeError) as e:
                    logger.warning(f"Erreur conversion close pour {sym}: {e}")
                    continue

        raise ValueError(f"Aucun close utilisable pour {sym} depuis {year}-01-01")

    except Exception as e:
        logger.error(f"Erreur YTD pour {sym}: {e}")
        raise

def format_value(value: float, currency: str) -> str:
    """Formate une valeur selon la devise"""
    if currency in ["EUR", "USD", "GBP", "GBp", "CHF", "CAD", "AUD", "HKD", "SGD", "ILA", "MXN"]:
        return f"{value:,.2f}"
    elif currency in ["JPY", "KRW", "TWD", "INR", "TRY"]:
        return f"{value:,.0f}"
    else:
        return f"{value:,.2f}"

def format_percent(value: float) -> str:
    """Formate un pourcentage avec signe"""
    return f"{value:+.2f} %"

def normalise_category(raw_category: str, symbol: str, etf_name: str) -> str:
    """Applique les overrides et la logique ICB/GICS pour retourner une catégorie valide."""
    c = (raw_category or "").strip().lower()
    sym = (symbol or "").upper()
    name = (etf_name or "").lower()

    # Overrides par symbole (prioritaires)
    symbol_overrides = {
        "P3WK": "communication-services",  # Invesco NASDAQ Internet -> Com Services
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
    """Charge le mapping des ETFs sectoriels depuis le CSV en gérant les commentaires"""
    rows = []
    
    try:
        with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
            # Lire toutes les lignes et filtrer les commentaires et lignes vides
            lines = []
            for line in f:
                line_stripped = line.strip()
                if line_stripped and not line_stripped.startswith('#'):
                    lines.append(line)
            
            # Si aucune ligne de données
            if not lines:
                logger.error("❌ Aucune donnée trouvée dans le CSV (seulement des commentaires?)")
                return rows
            
            # Parser le CSV filtré
            filtered_content = io.StringIO(''.join(lines))
            reader = csv.DictReader(filtered_content)
            
            # Vérifier les colonnes
            if reader.fieldnames:
                logger.debug(f"📋 Colonnes CSV: {reader.fieldnames}")
            
            for idx, r in enumerate(reader):
                try:
                    # Nettoyer les espaces dans les clés et valeurs
                    r = {k.strip(): v.strip() for k, v in r.items() if k}
                    
                    ticker = r.get("symbol", "").strip().upper()
                    
                    if not ticker:
                        logger.warning(f"Ligne {idx+1}: Ticker absent, ignoré")
                        continue
                    
                    # Vérifier les champs requis
                    if not r.get("category"):
                        logger.warning(f"Ligne {idx+1}: Catégorie manquante pour {ticker}")
                        continue
                    
                    r["symbol"] = ticker
                    rows.append(r)
                    logger.debug(f"✅ ETF chargé: {ticker} - {r.get('name', 'N/A')} ({r.get('category')})")
                    
                except Exception as e:
                    logger.error(f"Erreur ligne {idx+1}: {e}")
                    
    except FileNotFoundError:
        logger.error(f"❌ Fichier CSV non trouvé: {CSV_FILE}")
    except Exception as e:
        logger.error(f"❌ Erreur lors de la lecture du CSV: {e}")
    
    return rows

def clean_sector_data(sector_dict: dict) -> dict:
    """Nettoie un dictionnaire de secteur en supprimant les propriétés temporaires"""
    # Créer une copie sans les propriétés temporaires
    cleaned = {}
    for key, value in sector_dict.items():
        if not key.startswith('_'):
            cleaned[key] = value
    return cleaned

def calculate_top_performers(sectors_data: dict, all_sectors: list):
    """Calcule top/bottom jour et YTD à partir des champs numériques."""
    logger.info("Calcul des top performers sectoriels...")

    daily = [s for s in all_sectors if isinstance(s.get("change_num"), (int, float))]
    ytd   = [s for s in all_sectors if isinstance(s.get("ytd_num"), (int, float))]

    if daily:
        daily_sorted = sorted(daily, key=lambda x: x["change_num"], reverse=True)
        best_daily   = daily_sorted[:3]
        worst_daily  = sorted(daily, key=lambda x: x["change_num"])[:3]

        sectors_data["top_performers"]["daily"]["best"]  = [clean_sector_data(s) for s in best_daily]
        sectors_data["top_performers"]["daily"]["worst"] = [clean_sector_data(s) for s in worst_daily]

    if ytd:
        ytd_sorted  = sorted(ytd, key=lambda x: x["ytd_num"], reverse=True)
        best_ytd    = ytd_sorted[:3]
        worst_ytd   = sorted(ytd, key=lambda x: x["ytd_num"])[:3]

        sectors_data["top_performers"]["ytd"]["best"]  = [clean_sector_data(s) for s in best_ytd]
        sectors_data["top_performers"]["ytd"]["worst"] = [clean_sector_data(s) for s in worst_ytd]

def main():
    logger.info("🚀 Début de la mise à jour des données sectorielles...")
    logger.info(f"API key loaded: {bool(API_KEY)}")
    logger.info(f"📊 Référentiel sectoriel: {TAXONOMY}")
    
    if not API_KEY:
        logger.error("❌ Clé API Twelve Data manquante")
        logger.error("Définissez TWELVE_DATA_API dans vos variables d'environnement")
        return
    
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
    
    # Créer une structure de données complètement nouvelle
    SECTORS_DATA = create_empty_sectors_data()
    ALL_SECTORS = []
    
    # 1. Charger le mapping des ETFs sectoriels
    sectors_mapping = load_sectors_etf_mapping()
    
    if not sectors_mapping:
        logger.error("❌ Aucun ETF trouvé dans le fichier CSV")
        # Sauvegarder quand même un fichier vide
        SECTORS_DATA["meta"]["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(SECTORS_DATA, f, ensure_ascii=False, indent=2)
        return
    
    logger.info(f"📊 {len(sectors_mapping)} ETFs sectoriels à traiter")
    
    # 2. Traiter chaque ETF individuellement
    processed_count = 0
    error_count = 0
    ytd_warnings = 0  # Compteur d'avertissements YTD
    
    for idx, etf in enumerate(sectors_mapping):
        sym = etf["symbol"]
        
        # Catégorie brute du CSV
        raw_category = etf.get("category", "")
        # Normalisation (overrides + ICB/GICS)
        category = normalise_category(raw_category, sym, etf.get("name", sym))
        
        # Ignorer les broad-market
        if raw_category == "broad-market":
            logger.info(f"⏭️  Ignoré (broad-market): {sym} - {etf.get('name', 'N/A')}")
            continue
            
        # Vérifier que la catégorie finale est utilisable
        if not category or category not in SECTORS_DATA["sectors"]:
            logger.warning(f"⚠️  Catégorie invalide '{raw_category}' → '{category}' pour {sym}, ignoré")
            continue
        
        try:
            # Pause entre les appels pour respecter les limites API
            if idx > 0:
                time.sleep(0.8)  # 800ms entre chaque appel
            
            logger.info(f"📡 Traitement {idx+1}/{len(sectors_mapping)}: {sym}")
            
            # Normalisation libellé d'affichage à partir des colonnes CSV
            norm = make_display_payload(etf)
            region_display = norm["region_display"]
            
            # Récupérer les données avec le bon fuseau horaire
            last, day_pct, last_src = quote_one(sym, region_display)
            
            # Pause avant l'appel YTD
            time.sleep(0.5)
            jan_close, jan_date = first_close_of_year(sym, region_display)
            
            # Vérifier si la date YTD est bien en janvier
            year = dt.date.today().year
            if not jan_date.startswith(f"{year}-01"):
                ytd_warnings += 1
                logger.warning(f"⚠️ {sym}: YTD ref date incorrecte ({jan_date}), série peut-être tronquée")
            
            # Calculer le YTD
            ytd_pct = 100 * (last - jan_close) / jan_close if jan_close > 0 else 0.0
            
            # Valeurs numériques (pour le front & les tops)
            value_num = float(last)
            change_num = float(day_pct)
            ytd_num = float(ytd_pct)
            
            # Créer l'objet de données avec les libellés normalisés et métadonnées de calcul
            sector_entry = {
                "symbol": sym,
                "name": etf.get("name", sym),          # nom complet ETF (tooltip front)
                "indexFamily": norm["indexFamily"],    # ex: 'STOXX Europe 600' / 'NASDAQ US' / 'S&P 500'
                "indexName": norm["indexName"],        # ex: 'NASDAQ US Semiconductor'
                "display_fr": norm["display_fr"],      # ex: 'NASDAQ US — Semi-conducteurs'
                "sector_en": norm["sector_en"],
                "sector_fr": norm["sector_fr"],
                
                # Affichages formatés
                "value": format_value(last, etf.get("currency", "USD")),
                "changePercent": format_percent(day_pct),
                "ytdChange": format_percent(ytd_pct),
                
                # Valeurs numériques fiables
                "value_num": value_num,
                "change_num": change_num,
                "ytd_num": ytd_num,
                
                # Métadonnées pour traçabilité YTD
                "last_price_source": last_src,
                "ytd_ref_date": jan_date,
                "ytd_method": "price_close_to_close",
                
                "trend": "down" if day_pct < 0 else "up",
                "region": region_display      # 'Europe' / 'US'
            }
            
            # Ajouter à la bonne catégorie
            SECTORS_DATA["sectors"][category].append(sector_entry)
            ALL_SECTORS.append(sector_entry.copy())  # Copie pour éviter les modifications
            processed_count += 1
            
            logger.info(f"✅ {sym} [{category}]: {last} ({day_pct:+.2f}%) YTD: {ytd_pct:+.2f}% (ref: {jan_date})")
            
        except Exception as e:
            error_count += 1
            logger.warning(f"⚠️  Échec pour {sym}: {type(e).__name__}: {e}")
            
            # Optionnel: ajouter les erreurs dans les métadonnées
            if "errors" not in SECTORS_DATA["meta"]:
                SECTORS_DATA["meta"]["errors"] = []
            
            SECTORS_DATA["meta"]["errors"].append({
                "symbol": sym,
                "name": etf.get("name", "N/A"),
                "error": str(e),
                "timestamp": dt.datetime.utcnow().isoformat()
            })
            continue
    
    # 3. Log du résumé avant calcul des top performers
    logger.info(f"\n📊 Résumé du traitement:")
    logger.info(f"  - ETFs traités avec succès: {processed_count}")
    logger.info(f"  - Erreurs: {error_count}")
    if ytd_warnings > 0:
        logger.warning(f"  - ⚠️ Avertissements YTD (dates hors janvier): {ytd_warnings}")
        logger.warning(f"    → Vérifiez votre abonnement Twelve Data (série peut-être tronquée)")
    
    # Log par catégorie
    for category, sectors in SECTORS_DATA["sectors"].items():
        if sectors:
            logger.info(f"  - {category}: {len(sectors)} secteurs")
    
    # 4. Calculer les top performers seulement s'il y a des données
    if processed_count > 0:
        calculate_top_performers(SECTORS_DATA, ALL_SECTORS)
    else:
        logger.warning("⚠️  Aucune donnée pour calculer les top performers")
    
    # 5. Mettre à jour les métadonnées avec le référentiel utilisé
    SECTORS_DATA["meta"]["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"
    SECTORS_DATA["meta"]["count"] = processed_count
    SECTORS_DATA["meta"]["total_etfs"] = len(sectors_mapping)
    SECTORS_DATA["meta"]["errors_count"] = error_count
    SECTORS_DATA["meta"]["taxonomy"] = TAXONOMY  # Garder la trace du référentiel
    SECTORS_DATA["meta"]["ytd_calculation"] = {
        "method": "price_close_to_close",
        "timezone_mapping": TZ_BY_REGION,
        "outputsize": 5000,
        "note": "YTD basé sur le premier close de l'année dans le fuseau local"
    }
    if ytd_warnings > 0:
        SECTORS_DATA["meta"]["ytd_warnings"] = ytd_warnings
    
    # 6. Sauvegarder le fichier JSON
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(SECTORS_DATA, f, ensure_ascii=False, indent=2)
    
    logger.info(f"\n✅ Mise à jour terminée")
    logger.info(f"📄 Fichier sauvegardé : {OUTPUT_FILE}")
    logger.info(f"📊 {processed_count}/{len(sectors_mapping)} secteurs traités avec succès")
    
    # Afficher quelques erreurs si présentes
    if error_count > 0 and "errors" in SECTORS_DATA["meta"]:
        logger.info(f"\n⚠️  Détail des {min(5, error_count)} premières erreurs:")
        for err in SECTORS_DATA["meta"]["errors"][:5]:
            logger.info(f"  - {err['symbol']}: {err['error']}")

if __name__ == "__main__":
    main()
