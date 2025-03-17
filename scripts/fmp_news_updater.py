#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des actualités et événements depuis Financial Modeling Prep
- Stock News API: Pour les actions et ETF
- Crypto News API: Pour les cryptomonnaies
- General News API: Pour l'actualité économique générale
"""

import os
import json
import requests
import logging
from datetime import datetime, timedelta

# Configuration du logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Chemins des fichiers
NEWS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "news.json")

# Configuration
CONFIG = {
    "api_key": os.environ.get("FMP_API_KEY", ""),
    "endpoints": {
        "stock_news": "https://financialmodelingprep.com/api/v3/stock_news",
        "crypto_news": "https://financialmodelingprep.com/api/v3/crypto_news", 
        "general_news": "https://financialmodelingprep.com/api/v4/general_news",
        "earnings_calendar": "https://financialmodelingprep.com/api/v3/earning_calendar",
        "economic_calendar": "https://financialmodelingprep.com/api/v3/economic_calendar"
    },
    "news_limit": 30,  # Nombre d'actualités par catégorie
    "days_ahead": 14   # Nombre de jours à l'avance pour les événements
}

def read_existing_news():
    """Lit le fichier JSON existant comme fallback"""
    try:
        with open(NEWS_JSON_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

def fetch_api_data(endpoint, params=None):
    """Fonction générique pour récupérer des données depuis l'API FMP"""
    if not CONFIG["api_key"]:
        logger.error("Clé API FMP non définie. Veuillez définir FMP_API_KEY dans les variables d'environnement.")
        return []
        
    if params is None:
        params = {}
    
    params["apikey"] = CONFIG["api_key"]
    
    try:
        logger.info(f"Récupération des données depuis {endpoint}")
        response = requests.get(endpoint, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        logger.info(f"✅ {len(data)} éléments récupérés depuis {endpoint}")
        return data
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération depuis {endpoint}: {str(e)}")
        return []

def get_stock_news():
    """Récupère les actualités des actions"""
    params = {
        "limit": CONFIG["news_limit"]
    }
    return fetch_api_data(CONFIG["endpoints"]["stock_news"], params)

def get_crypto_news():
    """Récupère les actualités des cryptomonnaies"""
    params = {
        "limit": CONFIG["news_limit"]
    }
    return fetch_api_data(CONFIG["endpoints"]["crypto_news"], params)

def get_general_news():
    """Récupère les actualités économiques générales"""
    params = {
        "limit": CONFIG["news_limit"]
    }
    return fetch_api_data(CONFIG["endpoints"]["general_news"], params)

def get_earnings_calendar():
    """Récupère le calendrier des résultats d'entreprises"""
    today = datetime.now().strftime("%Y-%m-%d")
    future = (datetime.now() + timedelta(days=CONFIG["days_ahead"])).strftime("%Y-%m-%d")
    
    params = {
        "from": today,
        "to": future
    }
    return fetch_api_data(CONFIG["endpoints"]["earnings_calendar"], params)

def get_economic_calendar():
    """Récupère le calendrier économique"""
    today = datetime.now().strftime("%Y-%m-%d")
    future = (datetime.now() + timedelta(days=CONFIG["days_ahead"])).strftime("%Y-%m-%d")
    
    params = {
        "from": today,
        "to": future
    }
    return fetch_api_data(CONFIG["endpoints"]["economic_calendar"], params)

def determine_category(article):
    """Détermine la catégorie de l'actualité"""
    if article.get("symbol") and any(ticker in str(article.get("symbol")) for ticker in ["BTC", "ETH", "CRYPTO", "COIN"]):
        return "crypto"
        
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    if any(word in text for word in ["crypto", "bitcoin", "ethereum", "blockchain"]):
        return "crypto"
    elif any(word in text for word in ["fed", "bce", "inflation", "taux", "pib", "interest rate"]):
        return "economie"
    elif any(word in text for word in ["etf", "fund", "index", "s&p", "dow", "cac", "nasdaq"]):
        return "marches"
    else:
        return "entreprises"

def determine_country(article):
    """Détermine le pays de l'actualité (fr/us)"""
    # Par défaut aux États-Unis
    country = "us"
    
    # Vérifier si c'est français
    if article.get("symbol") and any(suffix in str(article.get("symbol")) for suffix in [".PA", ".PAR"]):
        country = "fr"
    
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    french_keywords = ["france", "français", "paris", "cac", "bourse de paris", "euronext"]
    
    if any(keyword in text for keyword in french_keywords):
        country = "fr"
        
    return country

def determine_impact(article):
    """Détermine l'impact de l'actualité (positive/negative/neutral)"""
    # Si le sentiment est fourni par l'API
    sentiment = article.get("sentiment")
    if sentiment:
        try:
            sentiment_value = float(sentiment)
            if sentiment_value > 0.2:
                return "positive"
            elif sentiment_value < -0.2:
                return "negative"
            else:
                return "neutral"
        except:
            pass
    
    # Analyse basique du texte si pas de sentiment fourni
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    positive_words = ["surge", "soar", "gain", "rise", "jump", "boost", "recovery", "profit", "beat", "success", "bullish"]
    negative_words = ["drop", "fall", "decline", "loss", "plunge", "tumble", "crisis", "risk", "warning", "concern", "bearish"]
    
    positive_count = sum(1 for word in positive_words if word in text)
    negative_count = sum(1 for word in negative_words if word in text)
    
    if positive_count > negative_count:
        return "positive"
    elif negative_count > positive_count:
        return "negative"
    else:
        return "neutral"

def format_date(date_str):
    """Formate une date au format YYYY-MM-DD en DD/MM/YYYY"""
    try:
        date_parts = date_str.split(" ")[0].split("-")
        if len(date_parts) == 3:
            return f"{date_parts[2]}/{date_parts[1]}/{date_parts[0]}"
        return date_str.replace("-", "/")
    except:
        # Fallback en cas d'erreur
        return date_str.replace("-", "/")

def format_time(date_str):
    """Extrait l'heure au format HH:MM à partir d'une date complète"""
    try:
        time_parts = date_str.split(" ")[1].split(":")
        if len(time_parts) >= 2:
            return f"{time_parts[0]}:{time_parts[1]}"
        return "00:00"
    except:
        # Fallback en cas d'erreur
        return "00:00"

def process_news_data(all_news):
    """Traite et formate les actualités FMP pour correspondre au format TradePulse"""
    formatted_data = {
        "us": [],
        "france": [],
        "lastUpdated": datetime.now().isoformat()
    }
    
    for article in all_news:
        # Données essentielles
        news_item = {
            "title": article.get("title", ""),
            "content": article.get("text", ""),
            "source": article.get("site", article.get("publisher", "")),
            "date": format_date(article.get("publishedDate", "")),
            "time": format_time(article.get("publishedDate", "")),
            "category": determine_category(article),
            "impact": determine_impact(article),
            "country": determine_country(article)
        }
        
        # Ajouter à la section appropriée
        if news_item["country"] == "fr":
            formatted_data["france"].append(news_item)
        else:
            formatted_data["us"].append(news_item)
    
    return formatted_data

def process_events_data(earnings, economic):
    """Traite et formate les données d'événements"""
    events = []
    
    # Traiter le calendrier des résultats
    for earning in earnings:
        event = {
            "title": f"Résultats {earning.get('symbol')} - Prévision: {earning.get('epsEstimated')}$ par action",
            "date": format_date(earning.get("date", "")),
            "time": "16:30",  # Heure typique pour les annonces de résultats
            "type": "earnings",
            "importance": "high" if earning.get("epsEstimated") else "medium"
        }
        events.append(event)
    
    # Traiter le calendrier économique
    for eco_event in economic:
        # Ne garder que les événements importants
        if eco_event.get("impact") in ["High", "Medium"]:
            event = {
                "title": eco_event.get("event", ""),
                "date": format_date(eco_event.get("date", "")),
                "time": eco_event.get("time", "09:00"),
                "type": "economic",
                "importance": "high" if eco_event.get("impact") == "High" else "medium"
            }
            events.append(event)
    
    # Trier les événements par date et importance
    events.sort(key=lambda x: (x['date'], 0 if x['importance'] == 'high' else 1))
    # Limiter à 20 événements maximum
    return events[:20]

def update_news_json_file(news_data, events):
    """Met à jour le fichier news.json avec les données formatées"""
    try:
        output_data = {
            "us": news_data["us"][:15],  # Limiter à 15 actualités américaines
            "france": news_data["france"][:15],  # Limiter à 15 actualités françaises
            "events": events,
            "lastUpdated": datetime.now().isoformat()
        }
        
        # Créer le dossier data s'il n'existe pas
        os.makedirs(os.path.dirname(NEWS_JSON_PATH), exist_ok=True)
        
        with open(NEWS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"✅ Fichier news.json mis à jour avec succès")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de la mise à jour du fichier: {str(e)}")
        return False

def main():
    """Fonction principale d'exécution"""
    try:
        # 0. Lire les données existantes pour fallback
        existing_data = read_existing_news()
        
        # 1. Récupérer les différentes actualités
        stock_news = get_stock_news()
        crypto_news = get_crypto_news()
        general_news = get_general_news()
        
        # 2. Récupérer les événements
        earnings = get_earnings_calendar()
        economic = get_economic_calendar()
        
        # 3. Combiner toutes les actualités
        all_news = stock_news + crypto_news + general_news
        logger.info(f"Total des actualités récupérées: {len(all_news)}")
        
        # Vérifier si nous avons des données
        if not all_news:
            logger.warning("Aucune actualité récupérée, utilisation des données existantes")
            if existing_data:
                return True
        
        # 4. Traiter et formater les données
        news_data = process_news_data(all_news)
        events = process_events_data(earnings, economic)
        
        # 5. Mettre à jour le fichier JSON
        success = update_news_json_file(news_data, events)
        
        return success
    except Exception as e:
        logger.error(f"❌ Erreur dans l'exécution du script: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = main()
    if not success:
        exit(1)
