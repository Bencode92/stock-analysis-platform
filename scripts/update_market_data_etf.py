#!/usr/bin/env python3
"""
Script de mise à jour des données de marché via Twelve Data API
Utilise des ETFs pour représenter les indices boursiers
"""

import os
import csv
import json
import datetime as dt
from typing import Dict, List, Optional
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
CSV_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "indices_etf_mapping.csv")
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "markets.json")

# Client Twelve Data
TD = TDClient(apikey=API_KEY)

# Mapping MIC vers Exchange pour Twelve Data
MIC2EX = {
    "XPAR": "PARIS",
    "XMUN": "XETRA", 
    "XLON": "LSE",
    "XSWX": "SWX",
    "XMIL": "MILAN",
    "XAMS": "EURONEXT",
    "XMAD": "BME",
    "XSTO": "OMX",
    "XTSE": "TSX",
    "ARCX": "NYSE",
    "XNMS": "NASDAQ",
    "XASX": "ASX"
}

# Structure de données de sortie
MARKET_DATA = {
    "indices": {
        "europe": [],
        "north-america": [],
        "latin-america": [],
        "asia": [],
        "other": []
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

# Liste pour stocker tous les indices
ALL_INDICES = []

def determine_region(country: str) -> str:
    """Détermine la région en fonction du pays"""
    europe = ["France", "Allemagne", "Royaume-Uni", "Italie", "Espagne", 
              "Suisse", "Pays-Bas", "Suède", "Zone Euro"]
    north_america = ["États-Unis", "Canada", "Mexique"]
    latin_america = ["Brésil", "Argentine", "Chili", "Colombie", "Pérou"]
    asia = ["Japon", "Chine", "Hong Kong", "Taiwan", "Corée du Sud", 
            "Singapour", "Inde", "Asie"]
    
    if country in europe:
        return "europe"
    elif country in north_america:
        return "north-america"
    elif country in latin_america:
        return "latin-america"
    elif country in asia:
        return "asia"
    else:
        return "other"

def parse_symbol(symbol_td: str, mic_code: str) -> tuple[str, Optional[str]]:
    """Parse le symbole et retourne (symbol, exchange)"""
    # Si le symbole contient un point, le séparer
    if "." in symbol_td:
        sym, _ = symbol_td.split(".", 1)
    else:
        sym = symbol_td
    
    # Mapper le MIC code vers l'exchange Twelve Data
    exchange = MIC2EX.get(mic_code)
    
    return sym, exchange

def quote_one(sym: str, exch: Optional[str] = None) -> tuple[float, float]:
    """Récupère la quote d'un symbole"""
    try:
        if exch:
            q = TD.quote(symbol=sym, exchange=exch).as_json()
        else:
            q = TD.quote(symbol=sym).as_json()
            
        if q["status"] != "ok":
            raise ValueError(q.get("message", "Unknown error"))
            
        return float(q["close"]), float(q["percent_change"])
    except Exception as e:
        logger.error(f"Erreur quote pour {sym} ({exch}): {e}")
        raise

def ytd_one(sym: str, exch: Optional[str] = None) -> float:
    """Récupère la première valeur de l'année"""
    try:
        year = dt.date.today().year
        
        params = {
            "symbol": sym,
            "interval": "1day",
            "start_date": f"{year}-01-01",
            "order": "ASC",  # Plus ancien en premier
            "outputsize": 1
        }
        
        if exch:
            params["exchange"] = exch
            
        ts = TD.time_series(**params).as_json()
        
        if ts["status"] != "ok" or not ts["values"]:
            raise ValueError(ts.get("message", "No data"))
            
        return float(ts["values"][0]["close"])
    except Exception as e:
        logger.error(f"Erreur YTD pour {sym} ({exch}): {e}")
        raise

def format_value(value: float, currency: str) -> str:
    """Formate une valeur selon la devise"""
    if currency in ["EUR", "USD", "GBP", "CHF", "CAD"]:
        return f"{value:,.2f}"
    elif currency in ["JPY", "KRW", "TWD"]:
        return f"{value:,.0f}"
    else:
        return f"{value:,.2f}"

def format_percent(value: float) -> str:
    """Formate un pourcentage avec signe"""
    return f"{value:+.2f} %"

def load_etf_mapping() -> List[Dict]:
    """Charge le mapping des ETFs depuis le CSV"""
    etf_list = []
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            etf_list.append(row)
    return etf_list

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
    """Calcule les indices avec les meilleures et pires performances"""
    logger.info("Calcul des top performers...")
    
    daily_indices = [idx for idx in ALL_INDICES if idx.get("changePercent")]
    ytd_indices = [idx for idx in ALL_INDICES if idx.get("ytdChange")]
    
    # Trier par variation quotidienne
    if daily_indices:
        for idx in daily_indices:
            idx["_change_value"] = parse_percentage(idx["changePercent"])
        
        sorted_daily = sorted(daily_indices, key=lambda x: x["_change_value"], reverse=True)
        best_daily = sorted_daily[:3]
        worst_daily = sorted(sorted_daily, key=lambda x: x["_change_value"])[:3]
        
        for idx in best_daily:
            idx_copy = {k: v for k, v in idx.items() if k != "_change_value"}
            MARKET_DATA["top_performers"]["daily"]["best"].append(idx_copy)
        
        for idx in worst_daily:
            idx_copy = {k: v for k, v in idx.items() if k != "_change_value"}
            MARKET_DATA["top_performers"]["daily"]["worst"].append(idx_copy)
    
    # Trier par variation YTD
    if ytd_indices:
        for idx in ytd_indices:
            idx["_ytd_value"] = parse_percentage(idx["ytdChange"])
        
        sorted_ytd = sorted(ytd_indices, key=lambda x: x["_ytd_value"], reverse=True)
        best_ytd = sorted_ytd[:3]
        worst_ytd = sorted(sorted_ytd, key=lambda x: x["_ytd_value"])[:3]
        
        for idx in best_ytd:
            idx_copy = {k: v for k, v in idx.items() if k != "_ytd_value"}
            MARKET_DATA["top_performers"]["ytd"]["best"].append(idx_copy)
        
        for idx in worst_ytd:
            idx_copy = {k: v for k, v in idx.items() if k != "_ytd_value"}
            MARKET_DATA["top_performers"]["ytd"]["worst"].append(idx_copy)

def main():
    logger.info("🚀 Début de la mise à jour des données de marché...")
    
    if not API_KEY:
        logger.error("❌ Clé API Twelve Data manquante")
        return
    
    # 1. Charger le mapping des ETFs
    etf_mapping = load_etf_mapping()
    logger.info(f"📊 {len(etf_mapping)} ETFs à traiter")
    
    # 2. Traiter chaque ETF individuellement
    processed_count = 0
    
    for etf in etf_mapping:
        symbol_td = etf["symbol_td"]
        mic_code = etf.get("mic_code", "")
        
        # Parser le symbole et l'exchange
        sym, exch = parse_symbol(symbol_td, mic_code)
        
        try:
            # Récupérer les données
            last, day_pct = quote_one(sym, exch)
            jan_close = ytd_one(sym, exch)
            
            # Calculer le YTD
            ytd_pct = 100 * (last - jan_close) / jan_close if jan_close > 0 else 0
            
            # Créer l'objet de données
            market_entry = {
                "country": etf["Country"],
                "index_name": symbol_td,  # Afficher le symbole original
                "value": format_value(last, etf["currency"]),
                "changePercent": format_percent(day_pct),
                "ytdChange": format_percent(ytd_pct),
                "trend": "down" if day_pct < 0 else "up"
            }
            
            # Ajouter à la bonne région
            region = determine_region(etf["Country"])
            MARKET_DATA["indices"][region].append(market_entry)
            ALL_INDICES.append(market_entry)
            processed_count += 1
            
            logger.info(f"✅ {symbol_td}: {last} ({day_pct:+.2f}%)")
            
        except Exception as e:
            logger.warning(f"⚠️  Pas de données pour {symbol_td} - {e}")
            continue
    
    # 3. Calculer les top performers
    calculate_top_performers()
    
    # 4. Mettre à jour les métadonnées
    MARKET_DATA["meta"]["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"
    MARKET_DATA["meta"]["count"] = processed_count
    
    # 5. Sauvegarder le fichier JSON
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(MARKET_DATA, f, ensure_ascii=False, indent=2)
    
    logger.info(f"✅ Mise à jour terminée : {processed_count} indices traités")
    logger.info(f"📄 Fichier sauvegardé : {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
