#!/usr/bin/env python3
"""
Script de mise à jour des données de marché via Twelve Data API
Utilise des ETFs pour représenter les indices boursiers
"""

import os
import csv
import json
import datetime as dt
from typing import Dict, List
import logging
import time
import requests

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
BASE_URL = "https://api.twelvedata.com"

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

# Liste pour stocker tous les indices avant le filtrage
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

def chunks(lst: List, n: int) -> List[List]:
    """Divise une liste en chunks de taille n"""
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def fetch_quotes_batch(symbols: List[str]) -> Dict[str, Dict]:
    """
    Récupère les cotations pour un batch de symboles
    Retourne {symbol: {"close": float, "change_pct": float}}
    """
    try:
        # Appel batch pour les quotes
        url = f"{BASE_URL}/quote"
        params = {
            "symbol": ",".join(symbols),
            "apikey": API_KEY
        }
        
        response = requests.get(url, params=params)
        response.raise_for_status()
        
        data = response.json()
        quotes = {}
        
        # Gérer le cas où data est une liste (batch) ou un dict (single)
        if isinstance(data, list):
            for quote in data:
                if quote.get("status") == "ok":
                    quotes[quote["symbol"]] = {
                        "close": float(quote.get("close", 0)),
                        "change_pct": float(quote.get("percent_change", 0))
                    }
        elif isinstance(data, dict):
            if data.get("status") == "ok":
                quotes[data["symbol"]] = {
                    "close": float(data.get("close", 0)),
                    "change_pct": float(data.get("percent_change", 0))
                }
        
        return quotes
    except Exception as e:
        logger.error(f"Erreur fetch_quotes: {e}")
        return {}

def fetch_ytd_batch(symbols: List[str]) -> Dict[str, float]:
    """
    Récupère la première valeur de l'année pour calculer le YTD
    Retourne {symbol: first_close_of_year}
    """
    try:
        year = dt.date.today().year
        start_date = f"{year}-01-01"
        
        # Appel batch pour les time series
        url = f"{BASE_URL}/time_series"
        params = {
            "symbol": ",".join(symbols),
            "interval": "1day",
            "start_date": start_date,
            "outputsize": 1,
            "apikey": API_KEY
        }
        
        response = requests.get(url, params=params)
        response.raise_for_status()
        
        data = response.json()
        ytd_bases = {}
        
        # Gérer les différents formats de réponse
        for symbol in symbols:
            if symbol in data and data[symbol].get("status") == "ok":
                values = data[symbol].get("values", [])
                if values:
                    first_close = float(values[0]["close"])
                    ytd_bases[symbol] = first_close
                    
        return ytd_bases
    except Exception as e:
        logger.error(f"Erreur fetch_ytd: {e}")
        return {}

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
    
    # Supprimer les caractères non numériques sauf le point décimal et le signe moins
    clean_str = percent_str.replace('%', '').replace(' ', '').replace(',', '.')
    
    try:
        return float(clean_str)
    except ValueError:
        return 0.0

def calculate_top_performers():
    """Calcule les indices avec les meilleures et pires performances"""
    logger.info("Calcul des top performers...")
    
    # Filtrer les indices avec des valeurs valides
    daily_indices = [idx for idx in ALL_INDICES if idx.get("changePercent")]
    ytd_indices = [idx for idx in ALL_INDICES if idx.get("ytdChange")]
    
    # Trier par variation quotidienne
    if daily_indices:
        # Convertir les pourcentages en valeurs numériques pour le tri
        for idx in daily_indices:
            idx["_change_value"] = parse_percentage(idx["changePercent"])
        
        # Trier et sélectionner les 3 meilleurs et les 3 pires
        sorted_daily = sorted(daily_indices, key=lambda x: x["_change_value"], reverse=True)
        
        # Sélectionner les 3 meilleurs
        best_daily = sorted_daily[:3]
        # Sélectionner les 3 pires
        worst_daily = sorted(sorted_daily, key=lambda x: x["_change_value"])[:3]
        
        # Ajouter aux résultats en supprimant le champ temporaire
        for idx in best_daily:
            idx_copy = {k: v for k, v in idx.items() if k != "_change_value"}
            MARKET_DATA["top_performers"]["daily"]["best"].append(idx_copy)
        
        for idx in worst_daily:
            idx_copy = {k: v for k, v in idx.items() if k != "_change_value"}
            MARKET_DATA["top_performers"]["daily"]["worst"].append(idx_copy)
    
    # Trier par variation YTD
    if ytd_indices:
        # Convertir les pourcentages en valeurs numériques pour le tri
        for idx in ytd_indices:
            idx["_ytd_value"] = parse_percentage(idx["ytdChange"])
        
        # Trier et sélectionner les 3 meilleurs et les 3 pires
        sorted_ytd = sorted(ytd_indices, key=lambda x: x["_ytd_value"], reverse=True)
        
        # Sélectionner les 3 meilleurs
        best_ytd = sorted_ytd[:3]
        # Sélectionner les 3 pires
        worst_ytd = sorted(sorted_ytd, key=lambda x: x["_ytd_value"])[:3]
        
        # Ajouter aux résultats
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
    symbols = [etf["symbol_td"] for etf in etf_mapping]
    
    logger.info(f"📊 {len(symbols)} ETFs à traiter")
    
    # 2. Récupérer les données par batch de 120 (limite Twelve Data)
    all_quotes = {}
    all_ytd_bases = {}
    
    for i, batch in enumerate(chunks(symbols, 120)):
        logger.info(f"📡 Traitement du batch {i+1}/{(len(symbols)-1)//120 + 1}")
        
        # Quotes (close + change%)
        quotes = fetch_quotes_batch(batch)
        all_quotes.update(quotes)
        
        # Attendre un peu entre les requêtes pour respecter les limites
        time.sleep(0.5)
        
        # YTD bases
        ytd_bases = fetch_ytd_batch(batch)
        all_ytd_bases.update(ytd_bases)
        
        time.sleep(0.5)
    
    # 3. Construire les données de marché
    processed_count = 0
    
    for etf in etf_mapping:
        symbol = etf["symbol_td"]
        quote = all_quotes.get(symbol)
        ytd_base = all_ytd_bases.get(symbol)
        
        if not quote:
            logger.warning(f"⚠️  Pas de données pour {symbol}")
            continue
        
        # Calculer le YTD
        ytd_change = ""
        if ytd_base and ytd_base > 0:
            ytd_pct = 100 * (quote["close"] - ytd_base) / ytd_base
            ytd_change = format_percent(ytd_pct)
        
        # Créer l'objet de données
        market_entry = {
            "country": etf["Country"],
            "index_name": symbol,  # Utiliser le symbole au lieu du nom
            "value": format_value(quote["close"], etf["currency"]),
            "changePercent": format_percent(quote["change_pct"]),
            "ytdChange": ytd_change,
            "trend": "down" if quote["change_pct"] < 0 else "up"
        }
        
        # Ajouter à la bonne région
        region = determine_region(etf["Country"])
        MARKET_DATA["indices"][region].append(market_entry)
        ALL_INDICES.append(market_entry)  # Pour le calcul des top performers
        processed_count += 1
    
    # 4. Calculer les top performers
    calculate_top_performers()
    
    # 5. Mettre à jour les métadonnées
    MARKET_DATA["meta"]["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"
    MARKET_DATA["meta"]["count"] = processed_count
    
    # 6. Sauvegarder le fichier JSON
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(MARKET_DATA, f, ensure_ascii=False, indent=2)
    
    logger.info(f"✅ Mise à jour terminée : {processed_count} indices traités")
    logger.info(f"📄 Fichier sauvegardé : {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
