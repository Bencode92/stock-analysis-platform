#!/usr/bin/env python3
"""
Script de mise à jour des données sectorielles via Twelve Data API
Utilise des ETFs sectoriels pour représenter les performances des secteurs
"""

import os
import csv
import json
import datetime as dt
import io
import time
from typing import Dict, List
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

# Client Twelve Data
if API_KEY:
    TD = TDClient(apikey=API_KEY)
else:
    logger.error("❌ Clé API Twelve Data non définie!")
    TD = None

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

def quote_one(sym: str) -> tuple[float, float]:
    """Récupère la quote d'un symbole"""
    try:
        q_json = TD.quote(symbol=sym).as_json()
        
        if isinstance(q_json, tuple):
            q_json = q_json[0]
        
        if "close" in q_json and "percent_change" in q_json:
            return float(q_json["close"]), float(q_json["percent_change"])
        
        raise ValueError(q_json.get("message", "unknown error"))
    except Exception as e:
        logger.error(f"Erreur quote pour {sym}: {e}")
        raise

def ytd_one(sym: str) -> float:
    """Première clôture de l'année"""
    year = dt.date.today().year
    try:
        ts_json = TD.time_series(
            symbol=sym,
            interval="1day",
            start_date=f"{year}-01-01",
            order="ASC"
        ).as_json()

        # Déballage du tuple si nécessaire
        if isinstance(ts_json, tuple):
            ts_json = ts_json[0]

        # 1) Format standard avec clé "values"
        if isinstance(ts_json, dict) and ts_json.get("values"):
            return float(ts_json["values"][0]["close"])

        # 2) Format compact : dict OHLC direct
        if isinstance(ts_json, dict) and "close" in ts_json:
            return float(ts_json["close"])

        # 3) Format liste
        if isinstance(ts_json, list) and ts_json:
            return float(ts_json[0]["close"])

        logger.error(f"Format inattendu pour {sym}: {type(ts_json)}")
        logger.error(f"Contenu: {ts_json}")
        raise ValueError("Unrecognised time_series format")

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

def determine_index_name(etf_name: str, region: str) -> str:
    """Détermine le nom de l'indice basé sur le nom de l'ETF"""
    if "STOXX Europe 600" in etf_name:
        # Extraire le nom du secteur
        if "Real Estate" in etf_name:
            return "STOXX Europe 600 Real Estate"
        elif "Construction" in etf_name:
            return "STOXX Europe 600 Construction & Materials"
        elif "Financial Services" in etf_name:
            return "STOXX Europe 600 Financial Services"
        elif "Chemicals" in etf_name:
            return "STOXX Europe 600 Chemicals"
        elif "Finance" in etf_name:
            return "STOXX Europe 600 Finance"
        elif "Media" in etf_name:
            return "STOXX Europe 600 Media"
        elif "Autos" in etf_name:
            return "STOXX Europe 600 Automobiles"
        elif "Telecommunications" in etf_name:
            return "STOXX Europe 600 Telecommunications"
        elif "Industrials" in etf_name:
            return "STOXX Europe 600 Industrials"
        elif "Health Care" in etf_name:
            return "STOXX Europe 600 Health Care"
        elif "Banks" in etf_name:
            return "STOXX Europe 600 Banks"
        elif "Oil & Gas" in etf_name:
            return "STOXX Europe 600 Oil & Gas"
        elif "Basic Resources" in etf_name:
            return "STOXX Europe 600 Basic Resources"
        elif "Technology" in etf_name:
            return "STOXX Europe 600 Technology"
        elif "Insurance" in etf_name:
            return "STOXX Europe 600 Insurance"
        elif "Utilities" in etf_name:
            return "STOXX Europe 600 Utilities"
        else:
            return "STOXX Europe 600"
    elif "Nasdaq" in etf_name or "NASDAQ" in etf_name:
        # Extraire le nom du secteur NASDAQ
        if "Oil & Gas" in etf_name:
            return "NASDAQ US Oil & Gas"
        elif "Semiconductor" in etf_name:
            return "NASDAQ US Semiconductor"
        elif "Cybersecurity" in etf_name:
            return "NASDAQ US Cybersecurity"
        elif "Smart Grid" in etf_name:
            return "NASDAQ US Smart Grid Infrastructure"
        elif "FINTECH" in etf_name:
            return "NASDAQ US FinTech"
        elif "BIOTECH" in etf_name:
            return "NASDAQ US Biotechnology"
        elif "Retail" in etf_name:
            return "NASDAQ US Retail"
        elif "Food & Beverage" in etf_name:
            return "NASDAQ US Food & Beverage"
        elif "Pharmaceuticals" in etf_name:
            return "NASDAQ US Pharmaceuticals"
        elif "Bank" in etf_name:
            return "NASDAQ US Banks"
        elif "Transportation" in etf_name:
            return "NASDAQ US Transportation"
        elif "Internet" in etf_name:
            return "NASDAQ US Internet"
        elif "Technology Dividend" in etf_name:
            return "NASDAQ US Technology Dividend"
        elif "Artificial Intelligence" in etf_name:
            return "NASDAQ US AI & Robotics"
        else:
            return etf_name
    elif "Select Sector SPDR" in etf_name:
        # Extraire le nom du secteur S&P
        if "Materials" in etf_name:
            return "S&P 500 Materials"
        elif "Real Estate" in etf_name:
            return "S&P 500 Real Estate"
        elif "Industrial" in etf_name:
            return "S&P 500 Industrials"
        elif "Consumer Discretionary" in etf_name:
            return "S&P 500 Consumer Discretionary"
        elif "Utilities" in etf_name:
            return "S&P 500 Utilities"
        else:
            return etf_name.replace("Select Sector SPDR Fund", "").strip()
    elif "iShares" in etf_name:
        if "Healthcare" in etf_name:
            return "S&P 500 Health Care"
        else:
            return etf_name
    else:
        return etf_name

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
            
            # Récupérer les données
            last, day_pct = quote_one(sym)
            
            # Pause avant l'appel YTD
            time.sleep(0.5)
            jan_close = ytd_one(sym)
            
            # Calculer le YTD
            ytd_pct = 100 * (last - jan_close) / jan_close if jan_close > 0 else 0.0
            
            # Déterminer la région pour l'affichage
            region_display = "US" if etf.get("region", "").lower() == "us" else "Europe"
            
            # ➕ Numériques (pour le front & les tops)
            value_num = float(last)
            change_num = float(day_pct)
            ytd_num = float(ytd_pct)
            
            # Créer l'objet de données avec le VRAI NOM DE L'ETF et les valeurs numériques
            sector_entry = {
                "symbol": sym,
                "name": etf.get("name", sym),
                "indexName": determine_index_name(etf.get("name", sym), region_display),
                
                # Affichages formatés
                "value": format_value(last, etf.get("currency", "USD")),
                "changePercent": format_percent(day_pct),
                "ytdChange": format_percent(ytd_pct),
                
                # ➕ Valeurs numériques fiables
                "value_num": value_num,
                "change_num": change_num,
                "ytd_num": ytd_num,
                
                "trend": "down" if day_pct < 0 else "up",
                "region": region_display
            }
            
            # Ajouter à la bonne catégorie
            SECTORS_DATA["sectors"][category].append(sector_entry)
            ALL_SECTORS.append(sector_entry.copy())  # Copie pour éviter les modifications
            processed_count += 1
            
            logger.info(f"✅ {sym} [{category}]: {last} ({day_pct:+.2f}%) YTD: {ytd_pct:+.2f}%")
            
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
