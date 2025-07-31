#!/usr/bin/env python3
"""
Script de mise à jour des données sectorielles via Twelve Data API
Utilise des ETFs sectoriels pour représenter les performances des secteurs
"""

import os
import csv
import json
import datetime as dt
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

# Client Twelve Data
TD = TDClient(apikey=API_KEY)

# Structure de données de sortie
SECTORS_DATA = {
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
        "sources": ["STOXX Europe 600", "NASDAQ", "S&P Select Sectors"],
        "timestamp": None,
        "count": 0
    }
}

# Liste pour stocker tous les secteurs
ALL_SECTORS = []

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
        else:
            return etf_name.replace("Select Sector SPDR Fund", "").strip()
    elif "iShares" in etf_name:
        if "Healthcare" in etf_name:
            return "S&P 500 Health Care"
        else:
            return etf_name
    else:
        return etf_name

def load_sectors_etf_mapping() -> List[Dict]:
    """Charge le mapping des ETFs sectoriels depuis le CSV"""
    rows = []
    with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            # Nettoyer tous les espaces dans les clés et valeurs
            r = {k.strip(): v.strip() for k, v in r.items()}
            
            ticker = r.get("symbol", "").strip().upper()
            
            if not ticker:
                logger.warning("Ticker absent, ligne ignorée : %s", r)
                continue
                
            r["symbol"] = ticker
            rows.append(r)
    
    return rows

def parse_percentage(percent_str: str) -> float:
    """Convertit une chaîne de pourcentage en nombre flottant"""
    if not percent_str:
        return 0.0
    clean_str = percent_str.replace('%', '').replace(' ', '').replace(',', '.')
    try:
        return float(clean_str)
    except ValueError:
        return 0.0

def calculate_top_performers():
    """Calcule les secteurs avec les meilleures et pires performances"""
    logger.info("Calcul des top performers sectoriels...")
    
    daily_sectors = [s for s in ALL_SECTORS if s.get("changePercent")]
    ytd_sectors = [s for s in ALL_SECTORS if s.get("ytdChange")]
    
    # Trier par variation quotidienne
    if daily_sectors:
        for s in daily_sectors:
            s["_change_value"] = parse_percentage(s["changePercent"])
        
        sorted_daily = sorted(daily_sectors, key=lambda x: x["_change_value"], reverse=True)
        best_daily = sorted_daily[:3]
        worst_daily = sorted(sorted_daily, key=lambda x: x["_change_value"])[:3]
        
        for s in best_daily:
            s_copy = {k: v for k, v in s.items() if k != "_change_value"}
            SECTORS_DATA["top_performers"]["daily"]["best"].append(s_copy)
        
        for s in worst_daily:
            s_copy = {k: v for k, v in s.items() if k != "_change_value"}
            SECTORS_DATA["top_performers"]["daily"]["worst"].append(s_copy)
    
    # Trier par variation YTD
    if ytd_sectors:
        for s in ytd_sectors:
            s["_ytd_value"] = parse_percentage(s["ytdChange"])
        
        sorted_ytd = sorted(ytd_sectors, key=lambda x: x["_ytd_value"], reverse=True)
        best_ytd = sorted_ytd[:3]
        worst_ytd = sorted(sorted_ytd, key=lambda x: x["_ytd_value"])[:3]
        
        for s in best_ytd:
            s_copy = {k: v for k, v in s.items() if k != "_ytd_value"}
            SECTORS_DATA["top_performers"]["ytd"]["best"].append(s_copy)
        
        for s in worst_ytd:
            s_copy = {k: v for k, v in s.items() if k != "_ytd_value"}
            SECTORS_DATA["top_performers"]["ytd"]["worst"].append(s_copy)

def main():
    logger.info("🚀 Début de la mise à jour des données sectorielles...")
    logger.info("API key loaded: %s", bool(API_KEY))
    
    if not API_KEY:
        logger.error("❌ Clé API Twelve Data manquante")
        return
    
    # 1. Charger le mapping des ETFs sectoriels
    sectors_mapping = load_sectors_etf_mapping()
    logger.info(f"📊 {len(sectors_mapping)} ETFs sectoriels à traiter")
    
    # 2. Traiter chaque ETF individuellement
    processed_count = 0
    
    for etf in sectors_mapping:
        sym = etf["symbol"]
        
        # Ignorer les ETFs de catégorie "broad-market"
        category = etf.get("category", "")
        if category == "broad-market":
            logger.info(f"⏭️  Ignoré (broad-market): {sym} - {etf['name']}")
            continue
            
        # Vérifier que la catégorie existe dans notre structure
        if category not in SECTORS_DATA["sectors"]:
            logger.warning(f"⚠️  Catégorie inconnue '{category}' pour {sym}, ignoré")
            continue
        
        try:
            # Récupérer les données
            last, day_pct = quote_one(sym)
            jan_close = ytd_one(sym)
            
            # Calculer le YTD
            ytd_pct = 100 * (last - jan_close) / jan_close if jan_close > 0 else 0
            
            # Déterminer la source en fonction de la région
            source = "Les Echos" if etf["region"] == "europe" else "Boursorama"
            
            # Créer l'objet de données
            sector_entry = {
                "name": determine_index_name(etf["name"], etf["region"]),
                "value": format_value(last, etf["currency"]),
                "changePercent": format_percent(day_pct),
                "ytdChange": format_percent(ytd_pct),
                "trend": "down" if day_pct < 0 else "up",
                "region": etf["region"].upper() if etf["region"] == "us" else "Europe",
                "source": source
            }
            
            # Ajouter à la bonne catégorie
            SECTORS_DATA["sectors"][category].append(sector_entry)
            ALL_SECTORS.append(sector_entry)
            processed_count += 1
            
            logger.info(f"✅ {sym}: {last} ({day_pct:+.2f}%) - {etf['name']}")
            
        except Exception as e:
            logger.warning(f"⚠️  Pas de données pour {sym} - {e}")
            continue
    
    # 3. Calculer les top performers
    calculate_top_performers()
    
    # 4. Mettre à jour les métadonnées
    SECTORS_DATA["meta"]["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"
    SECTORS_DATA["meta"]["count"] = processed_count
    
    # 5. Sauvegarder le fichier JSON
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(SECTORS_DATA, f, ensure_ascii=False, indent=2)
    
    logger.info(f"✅ Mise à jour terminée : {processed_count} secteurs traités")
    logger.info(f"📄 Fichier sauvegardé : {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
