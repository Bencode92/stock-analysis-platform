# !/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des actualités et événements depuis Financial Modeling Prep
- General News API: Pour l'actualité économique générale
- Stock News API: Pour les actions et ETF
- Crypto News API: Pour les cryptomonnaies
- Press Releases API: Pour les communiqués de presse des entreprises
- FMP Articles API: Pour les articles rédigés par FMP
- IPOs Calendar: Pour les introductions en bourse à venir
- Mergers & Acquisitions: Pour les opérations de fusion/acquisition
"""

import os
import json
import requests
import logging
from datetime import datetime, timedelta
import re
from collections import Counter

# Configuration du logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Chemins des fichiers
NEWS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "news.json")
THEMES_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "themes.json")

# Configuration
CONFIG = {
    "api_key": os.environ.get("FMP_API_KEY", ""),
    "endpoints": {
        "general_news": "https://financialmodelingprep.com/stable/news/general-latest",
        "fmp_articles": "https://financialmodelingprep.com/stable/fmp-articles",
        "stock_news": "https://financialmodelingprep.com/stable/news/stock",
        "crypto_news": "https://financialmodelingprep.com/stable/news/crypto", 
        "press_releases": "https://financialmodelingprep.com/stable/news/press-releases",
        "earnings_calendar": "https://financialmodelingprep.com/api/v3/earning_calendar",
        "economic_calendar": "https://financialmodelingprep.com/api/v3/economic_calendar",
        "ipos_calendar": "https://financialmodelingprep.com/stable/ipos-calendar",
        "mergers_acquisitions": "https://financialmodelingprep.com/stable/mergers-acquisitions-latest"
    },
    "news_limits": {
        "general_news": 20,
        "fmp_articles": 1,
        "stock_news": 50,
        "crypto_news": 20,
        "press_releases": 1
    },
    "output_limits": {
        "us": 30,
        "france": 20,
        "uk": 15,
        "germany": 15,
        "china": 15,
        "japan": 10,
        "emerging_markets": 15,
        "global": 20
    },
    "max_total_articles": 150,  # Nombre maximum total d'articles à conserver
    "days_ahead": 7,
    "days_back": 30
}

# Mots-clés pour le score des actualités
NEWS_KEYWORDS = {
    "high_impact": [
        "crash", "collapse", "crise", "recession", "fail", "bankruptcy", "récession", "banque centrale", 
        "inflation", "hike", "drop", "plunge", "default", "fitch downgrade", "downgrade", "hausse des taux", 
        "bond yield", "yield curve", "sell-off", "bear market", "effondrement", "chute", "krach",
        "dégringolade", "catastrophe", "urgence", "alerte", "défaut", "risque", "choc", "contagion",
        "panique", "défaillance", "correction", "faillite", "taux directeur"
    ],
    "medium_impact": [
        "growth", "expansion", "job report", "fed decision", "quarterly earnings", "acquisition", 
        "ipo", "merger", "partnership", "profit warning", "bond issuance", "croissance", "emploi", 
        "rapport", "BCE", "FED", "résultats trimestriels", "fusion", "acquisition", "partenariat",
        "bénéfices", "émission obligataire", "émission d'obligations", "perspectives", "avertissement",
        "rachat", "introduction en bourse", "nouveau PDG", "restructuration"
    ],
    "low_impact": [
        "recommendation", "stock buyback", "dividend", "announcement", "management change", "forecast",
        "recommandation", "rachat d'actions", "dividende", "annonce", "changement de direction", "prévision",
        "nomination", "produit", "service", "stratégie", "marché", "plan", "mise à jour", "tendance"
    ]
}

# Structure des thèmes dominants
THEMES_DOMINANTS = {
    "macroeconomie": {
        "inflation": ["inflation", "prix", "CPI", "taux d'intérêt", "interest rate", "yield"],
        "recession": ["recession", "slowdown", "GDP", "PIB", "croissance", "crise"],
        "politique_monetaire": ["fed", "bce", "banque centrale", "tapering", "quantitative easing"],
        "geopolitique": ["conflit", "guerre", "tensions", "ukraine", "israel", "chine", "taiwan"],
        "transition_energetique": ["climat", "esg", "biodiversité", "net zero", "transition", "durable"]
    },
    "secteurs": {
        "technologie": ["ai", "cloud", "cyber", "tech", "semiconducteur", "digital", "data"],
        "énergie": ["pétrole", "gas", "uranium", "énergie", "baril", "oil", "renouvelable"],
        "défense": ["défense", "militaire", "armes", "nato", "réarmement"],
        "finance": ["banques", "assurances", "taux", "obligations", "treasury"],
        "immobilier": ["real estate", "immobilier", "epra", "infrastructure"],
        "consommation": ["retail", "consommation", "luxe", "achat", "revenu disponible"],
        "santé": ["santé", "biotech", "pharma", "vaccin", "fda", "clinical trial", "médicament"],
        "industrie": ["industrie", "manufacturing", "usine", "production", "automation", "supply chain"],
        "transport": ["logistique", "transport", "shipping", "camion", "port", "airline"],
        "agriculture": ["wheat", "corn", "cacao", "agriculture", "engrais", "fertilizer", "commodities"]
    },
    "regions": {
        "europe": ["europe", "france", "bce", "allemagne", "italie", "zone euro", "ue", "union européenne"],
        "usa": ["usa", "fed", "s&p", "nasdaq", "dow jones", "états-unis"],
        "asie": ["chine", "japon", "corée", "inde", "asie", "emerging asia"],
        "latam": ["brésil", "mexique", "latam", "amérique latine"],
        "canada": ["canada", "ottawa", "toronto", "quebec"],
        "australie": ["australie", "sydney", "aussie", "asx"],
        "afrique": ["nigeria", "afrique", "south africa", "johannesburg", "kenya", "lagos"],
        "blocs": ["asean", "ocde", "brics", "opep", "nato", "g7", "g20"],
        "global": ["monde", "acwi", "international", "global", "tous marchés"]
    }
}

# Sources importantes par catégorie (pour le calcul du score)
IMPORTANT_SOURCES = {
    "general_news": [
        "Bloomberg", "Reuters", "Financial Times", "Wall Street Journal", "CNBC", 
        "BBC", "New York Times", "The Economist", "Les Echos", "Le Monde", "La Tribune"
    ],
    "stock_news": [
        "Bloomberg", "Reuters", "CNBC", "MarketWatch", "Seeking Alpha", "Barron's", 
        "Investor's Business Daily", "Motley Fool", "Morningstar", "Yahoo Finance"
    ],
    "crypto_news": [
        "CoinDesk", "Cointelegraph", "The Block", "Decrypt", "Bitcoin Magazine", 
        "CryptoSlate", "Bitcoinist", "CoinMarketCap", "Crypto Briefing"
    ],
    "press_releases": [
        "PR Newswire", "Business Wire", "Globe Newswire", "MarketWatch", "Yahoo Finance",
        "Company Website", "SEC Filing", "Investor Relations"
    ]
}

# Mots-clés importants par catégorie (pour le calcul du score)
HIGH_IMPORTANCE_KEYWORDS = {
    "general_news": [
        "recession", "inflation", "fed", "central bank", "interest rate", "gdp", 
        "unemployment", "market crash", "crisis", "economic growth", "federal reserve",
        "treasury", "ecb", "bce", "default", "geopolitical", "war", "conflict"
    ],
    "stock_news": [
        "earnings", "beat", "miss", "guidance", "outlook", "upgrade", "downgrade", 
        "acquisition", "merger", "ipo", "buyback", "dividend", "profit", "loss",
        "revenue", "forecast", "ceo", "executive", "lawsuit", "regulation"
    ],
    "crypto_news": [
        "bitcoin", "ethereum", "blockchain", "altcoin", "defi", "nft", "regulation", 
        "adoption", "halving", "mining", "exchange", "wallet", "staking", "sec", 
        "token", "smart contract", "dao", "hack", "security", "volatile"
    ],
    "press_releases": [
        "announce", "launch", "partnership", "collaboration", "expansion", 
        "appointment", "award", "contract", "patent", "breakthrough", "milestone", 
        "revenue", "financial results", "quarterly", "annual report"
    ]
}

# Mots-clés d'importance moyenne par catégorie
MEDIUM_IMPORTANCE_KEYWORDS = {
    "general_news": [
        "policy", "regulation", "trade", "budget", "deficit", "surplus", "consumer", 
        "confidence", "retail", "manufacturing", "services", "housing", "real estate"
    ],
    "stock_news": [
        "stock", "shares", "investor", "market", "trading", "performance", "index", 
        "sector", "industry", "competition", "strategy", "launch", "product", "service"
    ],
    "crypto_news": [
        "crypto", "digital asset", "coin", "market cap", "investment", "analyst", 
        "prediction", "whale", "memecoin", "correction", "rally", "bullish", "bearish"
    ],
    "press_releases": [
        "report", "update", "invest", "development", "growth", "statement", 
        "comment", "response", "release", "event", "conference", "meeting"
    ]
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
        logger.info(f"Récupération des données depuis {endpoint} avec params {params}")
        response = requests.get(endpoint, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        logger.info(f"✅ {len(data)} éléments récupérés depuis {endpoint}")
        return data
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération depuis {endpoint}: {str(e)}")
        return []

def fetch_articles_by_period(endpoint, start_date, end_date, source_type=None, days_interval=7, max_pages=5):
    """
    Récupère des articles sur une période donnée en découpant la période en intervalles
    et en utilisant la pagination pour obtenir un maximum d'articles
    """
    logger.info(f"Démarrage de l'extraction d'articles de {start_date} à {end_date} par tranches de {days_interval} jours")
    
    # Utiliser la limite spécifique à la source ou 50 par défaut
    per_page = CONFIG["news_limits"].get(source_type, 50) if source_type else 50
    
    from_date = datetime.strptime(start_date, "%Y-%m-%d")
    to_date = datetime.strptime(end_date, "%Y-%m-%d")
    all_articles = []
    
    # Parcourir la période par intervalles
    current_from = from_date
    while current_from < to_date:
        current_to = min(current_from + timedelta(days=days_interval), to_date)
        
        logger.info(f"Traitement de la période {current_from.strftime('%Y-%m-%d')} → {current_to.strftime('%Y-%m-%d')}")
        
        # Parcourir les pages pour chaque intervalle
        for page in range(max_pages):
            params = {
                "from": current_from.strftime("%Y-%m-%d"),
                "to": current_to.strftime("%Y-%m-%d"),
                "page": page,
                "limit": per_page
            }
            
            articles = fetch_api_data(endpoint, params)
            
            if not articles:
                break  # Plus d'articles pour cette période
                
            logger.info(f"  Page {page+1}: {len(articles)} articles récupérés")
            all_articles.extend(articles)
            
            # Si on a récupéré moins d'articles que la limite, on a atteint la fin
            if len(articles) < per_page:
                break
                
        # Passer à l'intervalle suivant
        current_from = current_to
    
    logger.info(f"Total d'articles récupérés sur la période: {len(all_articles)}")
    return all_articles

def get_general_news():
    """Récupère les actualités économiques générales"""
    # Récupérer les actualités des 30 derniers jours
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["general_news"], start_date, end_date, "general_news")

def get_fmp_articles():
    """Récupère les articles rédigés par FMP"""
    # Récupérer les articles des 30 derniers jours
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["fmp_articles"], start_date, end_date, "fmp_articles")

def get_stock_news():
    """Récupère les actualités des actions"""
    # Récupérer les actualités des 30 derniers jours
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["stock_news"], start_date, end_date, "stock_news")

def get_crypto_news():
    """Récupère les actualités des cryptomonnaies"""
    # Récupérer les actualités des 30 derniers jours
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["crypto_news"], start_date, end_date, "crypto_news")

def get_press_releases():
    """Récupère les communiqués de presse"""
    # Récupérer les communiqués de presse des 30 derniers jours
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["press_releases"], start_date, end_date, "press_releases")

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

def get_ipos_calendar():
    """Récupère les introductions en bourse à venir"""
    today = datetime.now().strftime("%Y-%m-%d")
    future = (datetime.now() + timedelta(days=CONFIG["days_ahead"])).strftime("%Y-%m-%d")

    params = {
        "from": today,
        "to": future
    }

    return fetch_api_data(CONFIG["endpoints"]["ipos_calendar"], params)

def get_mergers_acquisitions(limit=100):
    """Récupère les dernières opérations de fusion/acquisition"""
    params = {
        "page": 0,
        "limit": limit
    }
    return fetch_api_data(CONFIG["endpoints"]["mergers_acquisitions"], params)

def extract_themes(article):
    """Identifie les thèmes dominants à partir du contenu de l'article"""
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    themes_detected = {"macroeconomie": [], "secteurs": [], "regions": []}
    
    for axe, groupes in THEMES_DOMINANTS.items():
        for theme, keywords in groupes.items():
            if any(kw in text for kw in keywords):
                themes_detected[axe].append(theme)

    return themes_detected

def compute_sentiment_distribution(articles):
    """Calcule la distribution des sentiments pour un ensemble d'articles"""
    sentiment_counts = Counter(article["impact"] for article in articles if "impact" in article)
    total = sum(sentiment_counts.values())

    if total == 0:
        return {"positive": 0.0, "neutral": 0.0, "negative": 0.0}

    return {
        "positive": round(sentiment_counts["positive"] / total * 100, 1),
        "neutral": round(sentiment_counts["neutral"] / total * 100, 1),
        "negative": round(sentiment_counts["negative"] / total * 100, 1)
    }

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
    """
    Détermine le pays/région de l'actualité en utilisant une analyse plus détaillée
    pour détecter davantage de pays que juste france/us
    """
    # Vérifier le symbole pour information initiale
    symbol = article.get("symbol", "")
    if symbol:
        if any(suffix in str(symbol) for suffix in [".PA", ".PAR"]):
            return "france"
        elif any(suffix in str(symbol) for suffix in [".L", ".LON"]):
            return "uk"
        elif any(suffix in str(symbol) for suffix in [".DE", ".FRA", ".XE"]):
            return "germany"
        elif any(suffix in str(symbol) for suffix in [".SS", ".SZ", ".HK"]):
            return "china"
        elif any(suffix in str(symbol) for suffix in [".T", ".JP"]):
            return "japan"
    
    # Analyse du texte pour une détection plus précise
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    # Keywords pour différents pays/régions
    country_keywords = {
        "france": [
            "france", "français", "paris", "cac", "bourse de paris", "euronext", "amf", 
            "autorité des marchés", "bercy", "matignon", "elysée", "bpifrance", "française", "hexagone"
        ],
        "uk": [
            "uk", "united kingdom", "britain", "british", "london", "ftse", "bank of england", 
            "pound sterling", "gbp", "boe", "royal", "london stock exchange", "britain"
        ],
        "germany": [
            "germany", "allemagne", "berlin", "frankfurt", "dax", "deutsche", "euro", "ecb", 
            "bundesbank", "merkel", "scholz", "german", "allemand"
        ],
        "china": [
            "china", "chinese", "beijing", "shanghai", "hong kong", "shenzhen", "yuan", "renminbi", 
            "pboc", "ccp", "xi jinping", "chinois", "chine"
        ],
        "japan": [
            "japan", "japanese", "tokyo", "nikkei", "yen", "bank of japan", "boj", "abenomics", 
            "japon", "japonais", "kishida", "abe", "jpx"
        ],
        "emerging_markets": [
            "emerging markets", "emerging economies", "brics", "brazil", "russia", "india", 
            "south africa", "indonesia", "turkey", "mexico", "thailand", "vietnam", 
            "manila", "mumbai", "bovespa", "sensex", "micex"
        ],
        "global": [
            "global", "world", "international", "worldwide", "global economy", "global markets",
            "mondial", "monde", "international", "all markets", "across markets"
        ]
    }
    
    # Vérifier chaque pays/région par ordre de priorité
    for country, keywords in country_keywords.items():
        if any(keyword in text for keyword in keywords):
            return country
    
    # Par défaut: "us" (marché le plus important globalement)
    return "us"

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

def compute_importance_score(article, category):
    """
    Calcule un score d'importance pour un article en fonction de sa catégorie et de son contenu.
    
    Args:
        article (dict): L'article contenant title, content, source, etc.
        category (str): La catégorie de l'article (general_news, stock_news, crypto_news, press_releases)
    
    Returns:
        float: Score d'importance entre 0 et 100
    """
    score = 0
    
    # Combinaison du titre et du texte pour analyse
    content = f"{article.get('title', '')} {article.get('content', '')}".lower()
    
    # 1. Score basé sur les mots-clés de haute importance (max 40 points)
    high_keywords = HIGH_IMPORTANCE_KEYWORDS.get(category, [])
    matched_high_keywords = set()
    for keyword in high_keywords:
        if keyword in content:
            matched_high_keywords.add(keyword)
    
    high_keyword_score = min(40, len(matched_high_keywords) * 5)
    
    # 2. Score basé sur les mots-clés d'importance moyenne (max 20 points)
    medium_keywords = MEDIUM_IMPORTANCE_KEYWORDS.get(category, [])
    matched_medium_keywords = set()
    for keyword in medium_keywords:
        if keyword in content:
            matched_medium_keywords.add(keyword)
    
    medium_keyword_score = min(20, len(matched_medium_keywords) * 2.5)
    
    # 3. Score basé sur la source (max 20 points)
    source_score = 0
    article_source = article.get("source", "").lower()
    for important_source in IMPORTANT_SOURCES.get(category, []):
        if important_source.lower() in article_source:
            source_score = 20
            break
    
    # 4. Score basé sur la longueur du titre et du contenu (max 10 points)
    title_length = len(article.get("title", ""))
    text_length = len(article.get("content", ""))
    
    title_score = min(5, title_length / 20)  # 5 points max pour un titre de 100 caractères ou plus
    text_score = min(5, text_length / 500)   # 5 points max pour un texte de 2500 caractères ou plus
    
    # 5. Score basé sur l'impact (max 10 points)
    impact_score = 0
    impact = article.get("impact", "neutral")
    if impact == "negative":
        impact_score = 10  # Les actualités négatives sont souvent plus impactantes
    elif impact == "positive":
        impact_score = 8
    else:
        impact_score = 5
    
    # Calcul du score total
    total_score = high_keyword_score + medium_keyword_score + source_score + title_score + text_score + impact_score
    
    # Normalisation entre 0 et 100
    normalized_score = min(100, total_score)
    
    return normalized_score

def calculate_output_limits(articles_by_country, max_total=150):
    """
    Calcule les limites de sortie pour chaque pays/région en fonction des articles disponibles
    et de leur importance.
    
    Args:
        articles_by_country (dict): Dictionnaire des articles par pays
        max_total (int): Nombre maximum total d'articles à conserver
    
    Returns:
        dict: Limites pour chaque pays/région
    """
    # Configuration de base des limites par pays/région
    base_limits = CONFIG["output_limits"]
    
    # Compter les articles par pays
    country_counts = {country: len(articles) for country, articles in articles_by_country.items()}
    
    # Ajuster les limites en fonction des articles disponibles
    adjusted_limits = {}
    remaining_quota = max_total
    
    # Première passe : attribuer un minimum pour chaque pays qui a des articles
    for country, count in country_counts.items():
        # Si pays non défini dans base_limits, le considérer comme global
        if country not in base_limits:
            if "global" not in country_counts:
                country_counts["global"] = 0
            country_counts["global"] += count
            continue
            
        min_limit = min(count, max(5, base_limits.get(country, 10) // 2))
        adjusted_limits[country] = min_limit
        remaining_quota -= min_limit
    
    # Assurer que global est pris en compte même s'il n'a pas d'articles
    if "global" not in adjusted_limits and "global" in base_limits:
        adjusted_limits["global"] = 0
    
    # Deuxième passe : distribuer le quota restant proportionnellement
    if remaining_quota > 0:
        # Calculer le total des limites de base pour les pays avec des articles
        total_base = sum(base_limits.get(country, 10) for country in adjusted_limits.keys())
        
        # Distribuer proportionnellement
        for country in list(adjusted_limits.keys()):  # Utiliser une copie des clés
            if total_base > 0:
                country_ratio = base_limits.get(country, 10) / total_base
                additional = int(remaining_quota * country_ratio)
                adjusted_limits[country] += additional
                remaining_quota -= additional
        
        # Attribuer tout quota restant à global ou au premier pays si global n'existe pas
        if "global" in adjusted_limits:
            adjusted_limits["global"] += remaining_quota
        elif adjusted_limits:
            first_country = next(iter(adjusted_limits))
            adjusted_limits[first_country] += remaining_quota
    
    return adjusted_limits

def determine_event_impact(event):
    """Détermine le niveau d'impact d'un événement économique"""
    # Événements à fort impact
    high_impact_events = [
        "Interest Rate Decision", "Fed Interest Rate", "ECB Interest Rate", 
        "Inflation Rate", "GDP Growth", "GDP Release", "Employment Change",
        "Unemployment Rate", "Non-Farm Payrolls", "CPI", "Retail Sales",
        "FOMC", "FED", "BCE", "ECB", "Fed Chair", "Treasury", "Central Bank"
    ]
    
    # Événements à impact moyen
    medium_impact_events = [
        "PMI", "Consumer Confidence", "Trade Balance", "Industrial Production",
        "Manufacturing Production", "Housing Starts", "Building Permits",
        "Durable Goods Orders", "Factory Orders", "Earnings Report", "Balance Sheet"
    ]
    
    # Vérifier le nom de l'événement
    event_name = event.get("event", "").lower()
    
    if any(keyword.lower() in event_name for keyword in high_impact_events):
        return "high"
    
    if any(keyword.lower() in event_name for keyword in medium_impact_events):
        return "medium"
    
    # Vérifier si l'événement est déjà classé par FMP
    if event.get("impact") == "High":
        return "high"
    elif event.get("impact") == "Medium":
        return "medium"
    
    # Par défaut, impact faible
    return "low"

def calculate_event_score(event):
    """Calcule un score pour hiérarchiser l'importance des événements économiques"""
    score = 0
    
    # Impact de l'événement
    impact = determine_event_impact(event)
    if impact == "high":
        score += 10
    elif impact == "medium":
        score += 5
    else:
        score += 1
    
    # Bonus pour les États-Unis (marché influent)
    if event.get("country") == "US" or event.get("country") == "United States":
        score += 3
    
    # Bonus pour les événements avec écart important vs prévisions
    if event.get("actual") and event.get("forecast"):
        try:
            actual = float(event.get("actual").replace("%", ""))
            forecast = float(event.get("forecast").replace("%", ""))
            diff = abs(actual - forecast)
            
            if diff > 5:
                score += 5  # Écart très important
            elif diff > 2:
                score += 3  # Écart significatif
            elif diff > 0.5:
                score += 1  # Écart notable
        except (ValueError, AttributeError):
            # Si on ne peut pas convertir en float, on ignore
            pass
    
    # Ajustement par type d'événement pour les résultats d'entreprises
    if event.get("type") == "earnings":
        # Essayer d'extraire le symbole de l'action des résultats
        title = event.get("title", "")
        
        # Bonus pour les entreprises importantes
        major_companies = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "PYPL", "DIS"]
        if any(company in title for company in major_companies):
            score += 3
    
    return score

def extract_top_themes(news_data, days=30, max_examples=3):
    """Analyse les thèmes dominants sur une période donnée (ex: 30 jours) avec analyse détaillée des mots-clés"""
    cutoff_date = datetime.now() - timedelta(days=days)
    
    # Compteur simple pour les 5 thèmes les plus fréquents
    themes_counter = {
        "macroeconomie": Counter(),
        "secteurs": Counter(),
        "regions": Counter()
    }
    
    # Structure avancée pour stocker les détails de chaque thème
    themes_details = {
        "macroeconomie": {},
        "secteurs": {},
        "regions": {}
    }
    
    # Collection d'articles par thème pour calculer la distribution des sentiments
    theme_articles = {
        "macroeconomie": {},
        "secteurs": {},
        "regions": {}
    }
    
    total_articles = 0
    processed_articles = 0
    
    for country_articles in news_data.values():
        if not isinstance(country_articles, list):
            continue
        
        total_articles += len(country_articles)
        
        for article in country_articles:
            # Utiliser rawDate si disponible, sinon fallback sur date formatée
            try:
                if "rawDate" in article:
                    # Format YYYY-MM-DD HH:MM:SS
                    article_date = datetime.strptime(article["rawDate"].split(" ")[0], "%Y-%m-%d")
                else:
                    # Format DD/MM/YYYY (pour compatibilité avec anciennes données)
                    article_date = datetime.strptime(article["date"], "%d/%m/%Y")
                
                if article_date < cutoff_date:
                    continue
                
                processed_articles += 1
                
                themes = article.get("themes", {})
                for axe, subthemes in themes.items():
                    for theme in subthemes:
                        # Collecte pour le calcul des sentiments plus tard
                        if theme not in theme_articles[axe]:
                            theme_articles[axe][theme] = []
                        theme_articles[axe][theme].append(article)
                        
                        # Mettre à jour le compteur simple
                        themes_counter[axe][theme] += 1
                        
                        # Initialiser la structure détaillée si elle n'existe pas encore
                        if theme not in themes_details[axe]:
                            themes_details[axe][theme] = {
                                "count": 0,
                                "examples": [],
                                "keywords": {}
                            }
                        
                        # Incrémenter le compteur dans la structure détaillée
                        themes_details[axe][theme]["count"] += 1
                        
                        # Ajouter l'exemple (limité à max_examples)
                        title = article.get("title", "")
                        if (len(themes_details[axe][theme]["examples"]) < max_examples and 
                            title not in themes_details[axe][theme]["examples"]):
                            themes_details[axe][theme]["examples"].append(title)
                        
                        # Analyser les mots-clés spécifiques
                        text = (article.get("content", "") or article.get("text", "") + " " + title).lower()
                        
                        # Récupérer la liste des mots-clés pour ce thème
                        if axe in THEMES_DOMINANTS and theme in THEMES_DOMINANTS[axe]:
                            keywords = THEMES_DOMINANTS[axe][theme]
                            for keyword in keywords:
                                if keyword.lower() in text:
                                    if keyword not in themes_details[axe][theme]["keywords"]:
                                        themes_details[axe][theme]["keywords"][keyword] = {
                                            "count": 0,
                                            "examples": []
                                        }
                                    # Incrémenter le compteur du mot-clé
                                    themes_details[axe][theme]["keywords"][keyword]["count"] += 1
                                    # Ajouter l'exemple pour ce mot-clé spécifique
                                    if (len(themes_details[axe][theme]["keywords"][keyword]["examples"]) < max_examples and
                                        title not in themes_details[axe][theme]["keywords"][keyword]["examples"]):
                                        themes_details[axe][theme]["keywords"][keyword]["examples"].append(title)
                
            except Exception as e:
                logger.warning(f"Article ignoré pour date invalide: {article.get('title')} | Erreur: {str(e)}")
                continue
    
    logger.info(f"Analyse des thèmes: {processed_articles}/{total_articles} articles utilisés pour la période de {days} jours")
    
    # Ajouter les stats de sentiment dans les détails
    for axe, theme_dict in theme_articles.items():
        for theme, articles in theme_dict.items():
            sentiment_stats = compute_sentiment_distribution(articles)
            if theme in themes_details[axe]:
                themes_details[axe][theme]["sentiment_distribution"] = sentiment_stats
    
    # Obtenir les 5 thèmes principaux pour chaque axe avec leurs détails
    top_themes_with_details = {}
    for axe in themes_counter:
        top_themes = themes_counter[axe].most_common(5)
        top_themes_with_details[axe] = {}
        for theme, count in top_themes:
            top_themes_with_details[axe][theme] = themes_details[axe].get(theme, {"count": count, "examples": []})
    
    return top_themes_with_details

def build_theme_summary(theme_name, theme_data):
    """Génère automatiquement un résumé texte simple pour un thème"""
    count = theme_data.get("count", 0)
    examples = theme_data.get("examples", [])
    keywords = theme_data.get("keywords", {})
    sentiment_distribution = theme_data.get("sentiment_distribution", {})

    keywords_list = sorted(keywords.items(), key=lambda x: x[1]["count"], reverse=True)
    keywords_str = ", ".join([f"{kw} ({info['count']})" for kw, info in keywords_list[:5]])

    if not examples:
        return f"Le thème '{theme_name}' est apparu dans {count} articles récemment."

    sentiment_info = ""
    if sentiment_distribution:
        pos = sentiment_distribution.get("positive", 0)
        neg = sentiment_distribution.get("negative", 0)
        if pos > neg + 20:
            sentiment_info = f" Le sentiment est majoritairement positif ({pos}% vs {neg}% négatif)."
        elif neg > pos + 20:
            sentiment_info = f" Le sentiment est majoritairement négatif ({neg}% vs {pos}% positif)."
        else:
            sentiment_info = f" Le sentiment est mitigé ({pos}% positif, {neg}% négatif)."

    return (
        f"📰 Le thème **{theme_name}** a été détecté dans **{count} articles** "
        f"au cours de la période, principalement à travers des sujets comme : {keywords_str}."
        f"{sentiment_info} "
        f"Exemples d'articles : « {examples[0]} »"
        + (f", « {examples[1]} »" if len(examples) > 1 else "")
        + (f", « {examples[2]} »" if len(examples) > 2 else "") + "."
    )

def process_news_data(news_sources):
    """Traite et formate les actualités FMP pour correspondre au format TradePulse"""
    # Initialiser la structure pour tous les pays/régions possibles
    formatted_data = {
        "lastUpdated": datetime.now().isoformat()
    }
    
    for country in CONFIG["output_limits"].keys():
        formatted_data[country] = []
    
    # Liste de tous les articles avant la séparation par pays
    all_articles = []
    
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
            
            # Déterminer la catégorie et le pays
            category = determine_category(normalized, source_type)
            country = determine_country(normalized)
            impact = determine_impact(normalized)
            
            # Données essentielles
            news_item = {
                "title": normalized["title"],
                "content": normalized["text"],
                "source": normalized["site"],
                "rawDate": normalized["publishedDate"],  # Conserver la date brute pour le filtrage
                "date": format_date(normalized["publishedDate"]),
                "time": format_time(normalized["publishedDate"]),
                "category": category,
                "impact": impact,
                "country": country,
                "url": normalized.get("url", ""),
                "themes": extract_themes(normalized),
                "source_type": source_type
            }
            
            # Calculer le score d'importance
            news_item["importance_score"] = compute_importance_score(news_item, source_type)
            
            # Ajouter à la liste globale
            all_articles.append(news_item)
    
    # Supprimer les doublons
    all_articles = remove_duplicates(all_articles)
    
    # Trier par score d'importance
    all_articles.sort(key=lambda x: x["importance_score"], reverse=True)
    
    # Répartir par pays
    articles_by_country = {}
    for article in all_articles:
        country = article["country"]
        if country not in articles_by_country:
            articles_by_country[country] = []
        articles_by_country[country].append(article)
    
    # Calculer les limites appropriées pour chaque pays
    adjusted_limits = calculate_output_limits(articles_by_country, CONFIG["max_total_articles"])
    
    # Appliquer les limites par pays
    for country, articles in articles_by_country.items():
        limit = adjusted_limits.get(country, 10)
        # Si le pays existe dans formatted_data
        if country in formatted_data:
            formatted_data[country] = articles[:limit]
        else:
            # Sinon, ajouter au global
            if "global" not in formatted_data:
                formatted_data["global"] = []
            formatted_data["global"].extend(articles[:limit])
            logger.info(f"Pays {country} non géré, {len(articles[:limit])} articles ajoutés à 'global'")
    
    # Statistiques sur les données
    total_articles = sum(len(articles) for articles in formatted_data.values() if isinstance(articles, list))
    logger.info(f"Total des articles traités et formatés: {total_articles}")
    
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
            "score": score
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
                "score": score
            }
            events.append(event)
    
    # Trier les événements par score puis par date
    events.sort(key=lambda x: (x["score"], x["date"]), reverse=True)
    
    # Limiter à 15 événements maximum
    return events[:15]

def process_ipos_data(ipos):
    """Formate les données d'IPO pour affichage"""
    formatted_ipos = []
    for ipo in ipos:
        try:
            formatted_ipos.append({
                "title": f"IPO: {ipo.get('company')} ({ipo.get('symbol')})",
                "date": format_date(ipo.get("date")),
                "time": "09:00",
                "type": "ipo",
                "importance": "medium",
                "score": 5,
                "exchange": ipo.get("exchange", ""),
                "priceRange": ipo.get("priceRange", ""),
                "marketCap": ipo.get("marketCap", ""),
                "status": ipo.get("actions", "Expected")
            })
        except Exception as e:
            logger.warning(f"Erreur lors du traitement d'une IPO: {str(e)}")
    return formatted_ipos

def process_ma_data(ma_list):
    """Formate les données de fusions/acquisitions"""
    formatted_ma = []
    for ma in ma_list:
        try:
            formatted_ma.append({
                "title": f"M&A: {ma.get('companyName')} acquiert {ma.get('targetedCompanyName')}",
                "date": format_date(ma.get("transactionDate")),
                "time": "10:00",
                "type": "m&a",
                "importance": "medium",
                "score": 6,
                "source": ma.get("link", ""),
                "symbol": ma.get("symbol", ""),
                "targetedSymbol": ma.get("targetedSymbol", "")
            })
        except Exception as e:
            logger.warning(f"Erreur lors du traitement M&A: {str(e)}")
    return formatted_ma

def update_news_json_file(news_data, events):
    """Met à jour le fichier news.json avec les données formatées"""
    try:
        # Créer une copie pour ne pas modifier l'original
        output_data = {k: v for k, v in news_data.items()}
        output_data["events"] = events
        
        # Créer le dossier data s'il n'existe pas
        os.makedirs(os.path.dirname(NEWS_JSON_PATH), exist_ok=True)
        
        with open(NEWS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"✅ Fichier news.json mis à jour avec succès")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de la mise à jour du fichier: {str(e)}")
        return False

def generate_themes_json(news_data):
    """Génère un fichier JSON avec les thèmes dominants sur différentes périodes"""
    
    # Définir les périodes d'analyse
    periods = {
        "weekly": 7,
        "monthly": 30,
        "quarterly": 90
    }
    
    # Extraire les thèmes dominants pour chaque période
    themes_data = {
        period: extract_top_themes(news_data, days=days) 
        for period, days in periods.items()
    }
    
    # Ajouter un résumé automatique GPT-like à chaque thème
    for period, axes in themes_data.items():
        for axe, themes in axes.items():
            for theme_name, theme_data in themes.items():
                summary = build_theme_summary(theme_name, theme_data)
                themes_data[period][axe][theme_name]["gpt_summary"] = summary
    
    # Ajouter des métadonnées
    themes_output = {
        "themes": themes_data,
        "lastUpdated": datetime.now().isoformat(),
        "analysisCount": sum(len(articles) for articles in news_data.values() if isinstance(articles, list))
    }
    
    # Créer le dossier data s'il n'existe pas
    os.makedirs(os.path.dirname(THEMES_JSON_PATH), exist_ok=True)
    
    # Écrire dans le fichier
    try:
        with open(THEMES_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(themes_output, f, ensure_ascii=False, indent=2)
        logger.info(f"✅ Fichier themes.json mis à jour avec succès")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de la mise à jour du fichier themes.json: {str(e)}")
        return False

def main():
    """Fonction principale d'exécution"""
    try:
        # 0. Lire les données existantes pour fallback
        existing_data = read_existing_news()
        
        # 1. Récupérer les différentes actualités (avec la nouvelle approche par période)
        general_news = get_general_news()
        fmp_articles = get_fmp_articles()
        stock_news = get_stock_news()
        crypto_news = get_crypto_news()
        press_releases = get_press_releases()
        
        # 2. Récupérer les événements
        earnings = get_earnings_calendar()
        economic = get_economic_calendar()
        
        # 2.b Récupérer les IPOs et M&A
        ipos = get_ipos_calendar()
        mergers = get_mergers_acquisitions()
        
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
        
        # 4. Traiter et formater les données avec le nouveau système de scoring
        news_data = process_news_data(news_sources)
        events = process_events_data(earnings, economic)
        
        # 4.b Traiter les données IPO et M&A
        ipos_events = process_ipos_data(ipos)
        ma_events = process_ma_data(mergers)
        
        # Fusionner avec les autres événements
        events.extend(ipos_events)
        events.extend(ma_events)
        
        # 5. Mettre à jour le fichier JSON des actualités
        success_news = update_news_json_file(news_data, events)
        
        # 6. Générer le fichier des thèmes dominants
        success_themes = generate_themes_json(news_data)
        
        # 7. Afficher les thèmes dominants sur 30 jours (pour le log)
        top_themes = extract_top_themes(news_data, days=30)
        logger.info("🎯 Thèmes dominants sur 30 jours:")
        for axe, themes in top_themes.items():
            logger.info(f"  {axe.capitalize()}:")
            for theme, details in themes.items():
                logger.info(f"    {theme} ({details['count']})")
                # Afficher la distribution des sentiments si disponible
                if "sentiment_distribution" in details:
                    sentiment = details["sentiment_distribution"]
                    logger.info(f"      Sentiment: {sentiment['positive']}% positif, {sentiment['negative']}% négatif, {sentiment['neutral']}% neutre")
                if "keywords" in details and details["keywords"]:
                    for keyword, kw_details in details["keywords"].items():
                        logger.info(f"      - {keyword} ({kw_details['count']})")
        
        return success_news and success_themes
    except Exception as e:
        logger.error(f"❌ Erreur dans l'exécution du script: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = main()
    if not success:
        exit(1)
