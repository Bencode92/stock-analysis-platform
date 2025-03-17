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
import re

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

# --------- AMÉLIORATION: Système de mots-clés plus étendu pour une meilleure classification ---------
# Mots-clés pour le score des actualités
NEWS_KEYWORDS = {
    "high_impact": [
        # Mots-clés de crise et d'effondrement
        "crash", "collapse", "crise", "recession", "fail", "bankruptcy", "récession", 
        "banque centrale", "inflation", "hike", "drop", "plunge", "default", 
        "fitch downgrade", "downgrade", "hausse des taux", "bond yield", "yield curve", 
        "sell-off", "bear market", "effondrement", "chute", "krach", "dégringolade", 
        "catastrophe", "urgence", "alerte", "défaut", "risque", "choc", "contagion",
        "panique", "défaillance", "correction", "faillite", "taux directeur",
        # Nouveaux mots-clés haute priorité
        "breaking news", "urgent", "flash", "dernière minute", "alerte", 
        "market crash", "meltdown", "spiraling", "worst day", "worst week",
        "emergency meeting", "market halt", "circuit breaker", "trading suspended",
        "market turmoil", "massive losses", "steep drop", "historic decline",
        "market panic", "stock plunge", "investor exodus", "record low",
        "rate hike", "crisis mode", "liquidation", "heavy selling"
    ],
    "medium_impact": [
        "growth", "expansion", "job report", "fed decision", "quarterly earnings", "acquisition", 
        "ipo", "merger", "partnership", "profit warning", "bond issuance", "croissance", "emploi", 
        "rapport", "BCE", "FED", "résultats trimestriels", "fusion", "acquisition", "partenariat",
        "bénéfices", "émission obligataire", "émission d'obligations", "perspectives", "avertissement",
        "rachat", "introduction en bourse", "nouveau PDG", "restructuration",
        # Nouveaux mots-clés impact moyen
        "revenue beat", "earnings miss", "outlook", "guidance", "forecast update",
        "investment round", "market trend", "analyst upgrade", "analyst downgrade",
        "sector rotation", "price target", "consensus estimate", "technical breakout",
        "technical breakdown", "trading range", "market momentum", "investor sentiment",
        "liquidity concerns", "volatility spike", "industry disruption"
    ],
    "low_impact": [
        "recommendation", "stock buyback", "dividend", "announcement", "management change", "forecast",
        "recommandation", "rachat d'actions", "dividende", "annonce", "changement de direction", "prévision",
        "nomination", "produit", "service", "stratégie", "marché", "plan", "mise à jour", "tendance",
        # Nouveaux mots-clés faible impact
        "minor update", "small change", "routine", "normal operations", "regular meeting",
        "scheduled announcement", "expected outcome", "in line with expectations", 
        "no surprise", "stable performance", "unchanged", "maintain position"
    ]
}

# Liste des sources importantes - Mise à jour avec plus de sources
IMPORTANT_SOURCES = [
    "Bloomberg", "Reuters", "WSJ", "FT", "CNBC", "Financial Times", "Wall Street Journal", 
    "Les Échos", "La Tribune", "Le Figaro", "Le Monde", "Le Revenu", "BFM Business", 
    "L'AGEFI", "Investir", "Capital", "The Economist", "MarketWatch", "Barron's", 
    "Forbes", "Business Insider", "Seeking Alpha", "Yahoo Finance", "Morningstar",
    "Institutional Investor", "New York Times", "Fox Business", "Benzinga", "ZeroHedge"
]

# --------- AMÉLIORATION: Liste des entreprises majeures pour score d'impact ---------
MAJOR_COMPANIES = [
    # Tech
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "AVGO", "ORCL", "CSCO", "INTC", "AMD", 
    # Finance
    "JPM", "BAC", "WFC", "C", "GS", "MS", "V", "MA", "PYPL", 
    # Healthcare
    "JNJ", "PFE", "MRK", "UNH", "ABBV", "LLY", 
    # Energy
    "XOM", "CVX", "RDS", "BP", "TTE", 
    # Telecom
    "T", "VZ", "TMUS",
    # Retail
    "WMT", "TGT", "COST", "DIS", "NKE", "SBUX",
    # CAC 40
    "AIR.PA", "BNP.PA", "MC.PA", "SAN.PA", "OR.PA", "CAP.PA", "KER.PA"
]

# --------- AMÉLIORATION: Événements économiques à fort impact ---------
HIGH_IMPACT_EVENTS = [
    # Décisions de banques centrales
    "Interest Rate Decision", "Fed Interest Rate", "ECB Interest Rate", "Federal Reserve", 
    "Fed Chair Powell", "Jerome Powell", "Christine Lagarde", "Central Bank", "FOMC",
    # Indicateurs économiques majeurs US
    "US Inflation", "US Inflation Rate", "US CPI", "US PPI", "US Employment", "US Unemployment",
    "US Nonfarm Payrolls", "US GDP", "US Retail Sales", "US Consumer Confidence",
    # Indicateurs économiques majeurs Europe
    "Eurozone Inflation", "EU Inflation", "EU CPI", "EU PPI", "Eurozone GDP",
    "EU Unemployment", "ECB Meeting", "ECB Minutes",
    # Autres indicateurs critiques
    "Treasury Yield", "Treasury Auction", "Global PMI", "OPEC Meeting"
]

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

# ----- AMÉLIORATION: Calcul du score des actualités plus précis -----
def calculate_news_score(article):
    """
    Calcule un score pour classer l'importance d'une actualité en fonction des mots-clés
    """
    # Créer un texte combiné pour l'analyse
    content = f"{article.get('title', '')} {article.get('content', '')}".lower()
    
    score = 0
    
    # Compter les occurrences des mots-clés de haut impact
    high_impact_count = 0
    for word in NEWS_KEYWORDS["high_impact"]:
        if word in content:
            high_impact_count += 1
            score += 10
    
    # Compter les occurrences des mots-clés d'impact moyen
    medium_impact_count = 0
    for word in NEWS_KEYWORDS["medium_impact"]:
        if word in content:
            medium_impact_count += 1
            score += 5
    
    # Compter les occurrences des mots-clés de faible impact
    low_impact_count = 0
    for word in NEWS_KEYWORDS["low_impact"]:
        if word in content:
            low_impact_count += 1
            score += 2
    
    # Bonus de densité pour les mots-clés de haute importance
    if high_impact_count > 3:
        score += 15  # Bonus important si plusieurs mots-clés critiques
    elif high_impact_count > 1:
        score += 8   # Bonus modéré si plusieurs mots-clés de haute importance
    
    # Bonus pour les sources importantes
    if any(source.lower() in article.get("source", "").lower() for source in IMPORTANT_SOURCES):
        score += 7
    
    # Bonus pour les actualités négatives (souvent plus impactantes)
    if article.get("impact") == "negative":
        score += 5
    
    # Bonus pour les actualités à fort impact selon la catégorie
    if article.get("category") == "economie":
        score += 4
    elif article.get("category") == "marches":
        score += 3
    elif article.get("category") == "crypto":
        score += 2
    
    # Bonus si l'article mentionne des entreprises importantes
    for company in MAJOR_COMPANIES:
        if company.lower() in content or company in article.get("symbol", ""):
            score += 3
            break  # Un seul bonus par article
    
    # ---- AMÉLIORATION: Classification dans des balises de breaking news ----
    # Déterminer si c'est une "breaking news" en fonction du score
    breaking_threshold = 30  # Seuil pour les breaking news
    important_threshold = 15  # Seuil pour les actualités importantes
    
    if score >= breaking_threshold:
        article["importance_level"] = "breaking"
    elif score >= important_threshold:
        article["importance_level"] = "important"
    else:
        article["importance_level"] = "normal"
    
    return score

# ----- AMÉLIORATION: Détection plus précise de l'impact des événements -----
def determine_event_impact(event):
    """Détermine le niveau d'impact d'un événement économique"""
    # Vérifier si l'événement est déjà classé par FMP
    if event.get("impact") == "High":
        return "high"
    elif event.get("impact") == "Medium":
        return "medium"
    elif event.get("impact") == "Low":
        return "low"
    
    # Vérifier le nom de l'événement
    event_name = event.get("event", "").lower()
    
    # Événements à fort impact
    if any(keyword.lower() in event_name for keyword in HIGH_IMPACT_EVENTS):
        return "high"
    
    # Événements à impact moyen
    medium_impact_events = [
        "PMI", "Consumer Confidence", "Trade Balance", "Industrial Production",
        "Manufacturing Production", "Housing Starts", "Building Permits",
        "Durable Goods Orders", "Factory Orders", "Earnings Report", "Balance Sheet"
    ]
    
    if any(keyword.lower() in event_name for keyword in medium_impact_events):
        return "medium"
    
    # Par défaut, impact faible
    return "low"

# ----- AMÉLIORATION: Calcul avancé du score des événements -----
def calculate_event_score(event):
    """Calcule un score pour hiérarchiser l'importance des événements économiques"""
    score = 0
    event_name = event.get("event", "").lower()
    
    # Impact de l'événement
    impact = determine_event_impact(event)
    if impact == "high":
        score += 15
    elif impact == "medium":
        score += 8
    else:
        score += 3
    
    # ---- Bonus pour des mots-clés très spécifiques ----
    critical_keywords = ["fed", "interest rate", "inflation", "cpi", "unemployment", "gdp", "recession"]
    for keyword in critical_keywords:
        if keyword in event_name:
            score += 5
    
    # Bonus pour les États-Unis (marché influent)
    if event.get("country") == "US" or event.get("country") == "United States":
        score += 4
    
    # Bonus pour la France et l'Europe (pertinent pour l'utilisateur)
    if event.get("country") in ["France", "Euro Area", "European Union", "EU", "Eurozone"]:
        score += 3
    
    # Bonus pour les événements avec écart important vs prévisions
    if event.get("actual") and event.get("forecast"):
        try:
            # Nettoyer les valeurs
            actual_str = str(event.get("actual")).replace("%", "").replace(",", ".")
            forecast_str = str(event.get("forecast")).replace("%", "").replace(",", ".")
            
            actual = float(actual_str)
            forecast = float(forecast_str)
            
            # Calculer l'écart en pourcentage relatif
            if forecast != 0:
                diff_pct = abs((actual - forecast) / forecast) * 100
            else:
                diff_pct = abs(actual - forecast)
            
            if diff_pct > 20:
                score += 10  # Écart extrêmement important
            elif diff_pct > 10:
                score += 7   # Écart très important
            elif diff_pct > 5:
                score += 5   # Écart significatif
            elif diff_pct > 2:
                score += 3   # Écart notable
        except (ValueError, AttributeError):
            # Si on ne peut pas convertir en float, on ignore
            pass
    
    # Ajustement par type d'événement pour les résultats d'entreprises
    if event.get("type") == "earnings":
        # Essayer d'extraire le symbole de l'action des résultats
        symbol = ""
        if isinstance(event.get("title", ""), str):
            # Chercher des symboles entre parenthèses comme "Results (AAPL)"
            match = re.search(r'\(([A-Z\.]+)\)', event.get("title", ""))
            if match:
                symbol = match.group(1)
        
        # Si on a trouvé un symbole, vérifier s'il s'agit d'une entreprise majeure
        if symbol and any(company == symbol for company in MAJOR_COMPANIES):
            score += 8
    
    # ---- AMÉLIORATION: Classification dans des niveaux d'importance ----
    # Déterminer le niveau d'importance de l'événement
    critical_threshold = 25  # Seuil pour les événements critiques
    major_threshold = 15     # Seuil pour les événements majeurs
    
    if score >= critical_threshold:
        event["importance_level"] = "critical"
    elif score >= major_threshold:
        event["importance_level"] = "major"
    else:
        event["importance_level"] = "standard"
    
    return score

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
    
    # ---- AMÉLIORATION: Ajouter le score et la classification d'importance ----
    breaking_news = {"us": [], "france": []}
    important_news = {"us": [], "france": []}
    normal_news = {"us": [], "france": []}
    
    # Ajouter un score à chaque actualité et les classer
    for country in ["us", "france"]:
        for article in formatted_data[country]:
            article["score"] = calculate_news_score(article)
            
            # Classer selon le niveau d'importance déterminé par calculate_news_score
            if article.get("importance_level") == "breaking":
                breaking_news[country].append(article)
            elif article.get("importance_level") == "important":
                important_news[country].append(article)
            else:
                normal_news[country].append(article)
    
    # Trier chaque catégorie par score (plus élevé en premier), puis par date (plus récent en premier)
    for country in ["us", "france"]:
        breaking_news[country] = sorted(
            breaking_news[country], 
            key=lambda x: (x["score"], x["date"], x["time"]), 
            reverse=True
        )
        
        important_news[country] = sorted(
            important_news[country], 
            key=lambda x: (x["score"], x["date"], x["time"]), 
            reverse=True
        )
        
        normal_news[country] = sorted(
            normal_news[country], 
            key=lambda x: (x["date"], x["time"]), 
            reverse=True
        )
        
        # Combiner les listes dans l'ordre de priorité
        combined_news = breaking_news[country] + important_news[country] + normal_news[country]
        
        # Supprimer les doublons
        combined_news = remove_duplicates(combined_news)
        
        # Limiter le nombre d'articles
        formatted_data[country] = combined_news[:CONFIG["output_limits"][country]]
    
    return formatted_data

def process_events_data(earnings, economic):
    """Traite et formate les données d'événements"""
    events = []
    
    # Traiter le calendrier économique
    for eco_event in economic:
        # Ajouter l'impact et le score
        impact = determine_event_impact(eco_event)
        score = calculate_event_score(eco_event)
        
        event = {
            "title": eco_event.get("event", ""),
            "date": format_date(eco_event.get("date", "")),
            "time": eco_event.get("time", "09:00"),
            "type": "economic",
            "importance": impact,
            "score": score,
            "importance_level": eco_event.get("importance_level", "standard")
        }
        events.append(event)
    
    # Traiter le calendrier des résultats
    for earning in earnings:
        # Ne garder que les résultats avec des prévisions
        if earning.get("epsEstimated"):
            # Créer un faux événement pour le calcul du score
            temp_event = {
                "event": f"Earnings {earning.get('symbol')}",
                "type": "earnings",
                "title": f"Résultats {earning.get('symbol')} - Prévision: {earning.get('epsEstimated')}$ par action"
            }
            
            impact = "medium"  # Par défaut pour les résultats
            score = calculate_event_score(temp_event)
            
            event = {
                "title": f"Résultats {earning.get('symbol')} - Prévision: {earning.get('epsEstimated')}$ par action",
                "date": format_date(earning.get("date", "")),
                "time": "16:30",  # Heure typique pour les annonces de résultats
                "type": "earnings",
                "importance": impact,
                "score": score,
                "importance_level": temp_event.get("importance_level", "standard")
            }
            events.append(event)
    
    # ---- AMÉLIORATION: Classification des événements par priorité ----
    critical_events = []
    major_events = []
    standard_events = []
    
    # Classer les événements selon leur niveau d'importance
    for event in events:
        if event.get("importance_level") == "critical":
            critical_events.append(event)
        elif event.get("importance_level") == "major":
            major_events.append(event)
        else:
            standard_events.append(event)
    
    # Trier par score et par date
    critical_events.sort(key=lambda x: (x.get("score", 0), x["date"]), reverse=True)
    major_events.sort(key=lambda x: (x.get("score", 0), x["date"]), reverse=True)
    standard_events.sort(key=lambda x: x["date"])
    
    # Combiner les listes dans l'ordre de priorité
    combined_events = critical_events + major_events + standard_events
    
    # ---- AMÉLIORATION: Augmenter le nombre d'événements affichés ----
    # Dans la version originale, on limitait à 10 événements, maintenant on en inclut plus
    return combined_events[:15]  # Afficher plus d'événements

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
