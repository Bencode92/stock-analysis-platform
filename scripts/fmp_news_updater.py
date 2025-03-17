#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des actualités et événements depuis Financial Modeling Prep
- General News API: Pour l'actualité économique générale
- Stock News API: Pour les actions et ETF
- Crypto News API: Pour les cryptomonnaies
- Press Releases API: Pour les communiqués de presse des entreprises
- FMP Articles API: Pour les articles rédigés par FMP
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
        "general_news": "https://financialmodelingprep.com/stable/news/general-latest",
        "fmp_articles": "https://financialmodelingprep.com/stable/fmp-articles",
        "stock_news": "https://financialmodelingprep.com/stable/news/stock-latest",
        "crypto_news": "https://financialmodelingprep.com/stable/news/crypto-latest", 
        "press_releases": "https://financialmodelingprep.com/stable/news/press-releases-latest",
        "earnings_calendar": "https://financialmodelingprep.com/api/v3/earning_calendar",
        "economic_calendar": "https://financialmodelingprep.com/api/v3/economic_calendar"
    },
    "news_limits": {
        "general_news": 15,
        "fmp_articles": 10,
        "stock_news": 15,
        "crypto_news": 10,
        "press_releases": 5
    },
    "output_limits": {
        "us": 15,
        "france": 10
    },
    "days_ahead": 7
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

def get_general_news():
    """Récupère les actualités économiques générales"""
    params = {
        "limit": CONFIG["news_limits"]["general_news"]
    }
    return fetch_api_data(CONFIG["endpoints"]["general_news"], params)

def get_fmp_articles():
    """Récupère les articles rédigés par FMP"""
    params = {
        "limit": CONFIG["news_limits"]["fmp_articles"]
    }
    return fetch_api_data(CONFIG["endpoints"]["fmp_articles"], params)

def get_stock_news():
    """Récupère les actualités des actions"""
    params = {
        "limit": CONFIG["news_limits"]["stock_news"]
    }
    return fetch_api_data(CONFIG["endpoints"]["stock_news"], params)

def get_crypto_news():
    """Récupère les actualités des cryptomonnaies"""
    params = {
        "limit": CONFIG["news_limits"]["crypto_news"]
    }
    return fetch_api_data(CONFIG["endpoints"]["crypto_news"], params)

def get_press_releases():
    """Récupère les communiqués de presse"""
    params = {
        "limit": CONFIG["news_limits"]["press_releases"]
    }
    return fetch_api_data(CONFIG["endpoints"]["press_releases"], params)

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

def determine_category(article, source=None):
    """
    Détermine la catégorie de l'actualité:
    - economie: actualités macro-économiques
    - marches: actualités sur les indices, ETF, etc.
    - entreprises: actualités spécifiques aux entreprises
    - crypto: actualités cryptomonnaies
    - tech: actualités technologiques
    """
    # Vérification du symbole pour la crypto
    if article.get("symbol") and any(ticker in str(article.get("symbol")) for ticker in ["BTC", "ETH", "CRYPTO", "COIN"]):
        return "crypto"
        
    # Analyse du texte pour déterminer la catégorie
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    # Catégorie crypto (priorité 1)
    crypto_keywords = [
        "crypto", "bitcoin", "ethereum", "blockchain", "token", "defi", "nft", 
        "altcoin", "binance", "coinbase", "mining", "miner", "wallet", "staking",
        "web3", "cryptocurrency"
    ]
    
    if any(word in text for word in crypto_keywords):
        return "crypto"
    
    # Catégorie tech (priorité 2)
    tech_keywords = [
        "ai", "artificial intelligence", "machine learning", "data science", 
        "software", "hardware", "tech", "technology", "startup", "app", 
        "mobile", "cloud", "computing", "digital", "internet", "online", "web"
    ]
    
    if any(word in text for word in tech_keywords):
        return "tech"
    
    # Catégorie économie (priorité 3)
    economie_keywords = [
        "economy", "économie", "inflation", "gdp", "pib", "fed", "central bank",
        "banque centrale", "interest rate", "taux d'intérêt", "economic", "unemployment",
        "consumer", "spending", "policy", "fiscal", "monetary", "recession"
    ]
    
    if any(word in text for word in economie_keywords):
        return "economie"
    
    # Catégorie marchés (priorité 4)
    marches_keywords = [
        "etf", "fund", "fonds", "index", "indice", "s&p", "dow", "cac", "nasdaq", 
        "bond", "treasury", "yield", "matières premières", "commodities", "oil", 
        "gold", "pétrole", "or", "market", "stock market", "bull market", 
        "bear market", "rally", "correction", "volatility", "vix"
    ]
    
    if any(word in text for word in marches_keywords):
        return "marches"
    
    # Par défaut: entreprises
    return "entreprises"

def determine_country(article):
    """Détermine le pays de l'actualité (france/us)"""
    # Par défaut aux États-Unis
    country = "us"
    
    # Vérifier si c'est français
    if article.get("symbol") and any(suffix in str(article.get("symbol")) for suffix in [".PA", ".PAR"]):
        country = "france"
    
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    french_keywords = [
        "france", "français", "paris", "cac", "bourse de paris", "euronext",
        "amf", "autorité des marchés", "bercy", "matignon", "elysée", "bpifrance",
        "française", "hexagone"
    ]
    
    european_keywords = [
        "europe", "eurozone", "euro", "european", "européen", "bruxelles",
        "allemagne", "italie", "espagne", "bce", "ecb", "ue", "eu", "commission européenne"
    ]
    
    if any(keyword in text for keyword in french_keywords):
        country = "france"
    elif any(keyword in text for keyword in european_keywords) and country != "france":
        # Marquer européen comme français si pas déjà identifié comme français
        country = "france"
        
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
    
    positive_words = [
        "surge", "soar", "gain", "rise", "jump", "boost", "recovery", "profit", 
        "beat", "success", "bullish", "upward", "rally", "outperform", "growth",
        "positive", "optimistic", "momentum", "exceed", "improvement", "confidence",
        "strong", "strength", "uptick", "upgrade", "hausse", "progresse", "augmente"
    ]
    
    negative_words = [
        "drop", "fall", "decline", "loss", "plunge", "tumble", "crisis", "risk", 
        "warning", "concern", "bearish", "downward", "slump", "underperform", "recession",
        "negative", "pessimistic", "weakness", "miss", "downgrade", "cut", "reduction",
        "pressure", "struggle", "slowdown", "baisse", "chute", "recule", "diminue" 
    ]
    
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

def normalize_article(article, source=None):
    """Normalise les différents formats d'articles FMP en un format standard"""
    # Gérer les différents formats selon l'endpoint
    
    # Déterminer les champs clés
    title = article.get("title", "")
    
    # Pour FMP Articles API
    if "date" in article and "content" in article and "tickers" in article:
        text = article.get("content", "")
        date = article.get("date", "")
        symbol = article.get("tickers", "")
        site = article.get("site", "Financial Modeling Prep")
        url = article.get("link", "")
    # Pour les autres endpoints
    else:
        text = article.get("text", "")
        date = article.get("publishedDate", "")
        symbol = article.get("symbol", "")
        site = article.get("site", article.get("publisher", ""))
        url = article.get("url", "")
    
    # Retourner un article normalisé
    return {
        "title": title,
        "text": text,
        "publishedDate": date,
        "symbol": symbol,
        "site": site,
        "url": url,
        "source_type": source  # Ajout du type de source pour la classification
    }

def remove_duplicates(news_list):
    """Supprime les articles en double basés sur le titre"""
    seen_titles = set()
    unique_news = []
    
    for item in news_list:
        title = item["title"].lower()
        if title not in seen_titles:
            seen_titles.add(title)
            unique_news.append(item)
    
    return unique_news

def process_news_data(news_sources):
    """Traite et formate les actualités FMP pour correspondre au format TradePulse"""
    formatted_data = {
        "us": [],
        "france": [],
        "lastUpdated": datetime.now().isoformat()
    }
    
    # Traiter chaque source d'actualités
    for source_type, articles in news_sources.items():
        for article in articles:
            # Normaliser l'article
            normalized = normalize_article(article, source_type)
            
            # Vérifier si le titre est suffisamment long pour être pertinent
            if len(normalized["title"]) < 10:
                continue
                
            # Vérifier si le contenu est suffisamment détaillé
            if len(normalized["text"]) < 50:
                continue
            
            # Données essentielles
            news_item = {
                "title": normalized["title"],
                "content": normalized["text"],
                "source": normalized["site"],
                "date": format_date(normalized["publishedDate"]),
                "time": format_time(normalized["publishedDate"]),
                "category": determine_category(normalized, source_type),
                "impact": determine_impact(normalized),
                "country": determine_country(normalized),
                "url": normalized.get("url", "")
            }
            
            # Ajouter à la section par pays
            if news_item["country"] == "france":
                formatted_data["france"].append(news_item)
            else:
                formatted_data["us"].append(news_item)
    
    # Trier chaque catégorie par date (plus récent en premier)
    for country in ["us", "france"]:
        formatted_data[country] = sorted(
            formatted_data[country], 
            key=lambda x: (x["date"], x["time"]), 
            reverse=True
        )
        
        # Supprimer les doublons
        formatted_data[country] = remove_duplicates(formatted_data[country])
        
        # Limiter le nombre d'articles
        formatted_data[country] = formatted_data[country][:CONFIG["output_limits"][country]]
    
    return formatted_data

def process_events_data(earnings, economic):
    """Traite et formate les données d'événements"""
    events = []
    
    # Traiter le calendrier économique (priorité plus élevée)
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
    
    # Traiter le calendrier des résultats (uniquement les plus importants)
    for earning in earnings:
        # Ne garder que les résultats avec des prévisions
        if earning.get("epsEstimated"):
            event = {
                "title": f"Résultats {earning.get('symbol')} - Prévision: {earning.get('epsEstimated')}$ par action",
                "date": format_date(earning.get("date", "")),
                "time": "16:30",  # Heure typique pour les annonces de résultats
                "type": "earnings",
                "importance": "high"
            }
            events.append(event)
    
    # Trier les événements par date et importance
    events.sort(key=lambda x: (x['date'], 0 if x['importance'] == 'high' else 1))
    
    # Limiter à 10 événements maximum
    return events[:10]

def update_news_json_file(news_data, events):
    """Met à jour le fichier news.json avec les données formatées"""
    try:
        output_data = {
            "us": news_data["us"],
            "france": news_data["france"],
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
        general_news = get_general_news()
        fmp_articles = get_fmp_articles()
        stock_news = get_stock_news()
        crypto_news = get_crypto_news()
        press_releases = get_press_releases()
        
        # 2. Récupérer les événements
        earnings = get_earnings_calendar()
        economic = get_economic_calendar()
        
        # 3. Organiser les sources d'actualités
        news_sources = {
            "general_news": general_news,
            "fmp_articles": fmp_articles,
            "stock_news": stock_news,
            "crypto_news": crypto_news,
            "press_releases": press_releases
        }
        
        # Compter le nombre total d'actualités
        total_news = sum(len(articles) for articles in news_sources.values())
        logger.info(f"Total des actualités récupérées: {total_news}")
        
        # Vérifier si nous avons des données
        if total_news == 0:
            logger.warning("Aucune actualité récupérée, utilisation des données existantes")
            if existing_data:
                return True
        
        # 4. Traiter et formater les données
        news_data = process_news_data(news_sources)
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
