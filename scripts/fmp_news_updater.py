#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script for extracting news and events from Financial Modeling Prep
- General News API: For general economic news
- Stock News API: For stocks and ETFs
- Crypto News API: For cryptocurrencies
- Press Releases API: For company press releases
- FMP Articles API: For articles written by FMP
- Forex News API: For forex/currency market news
"""

import os
import json
import requests
import logging
from datetime import datetime, timedelta
import re
from collections import Counter

# Logger configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# File paths
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
        "forex_news": "https://financialmodelingprep.com/stable/news/forex-latest"
    },
    "news_limits": {
        "general_news": 20,
        "fmp_articles": 1,
        "stock_news": 50,
        "crypto_news": 20,
        "press_releases": 1,
        "forex_news": 20
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
    # Nouvelle configuration pour limiter les articles crypto
    "category_limits": {
        "crypto": 8  # Maximum 8 articles crypto au total (réduit de 10)
    },
    "max_total_articles": 150,  # Maximum total number of articles to keep
    "days_ahead": 7,
    "days_back": 30
}

# Keywords for news scoring
NEWS_KEYWORDS = {
    "high_impact": [
        "crash", "collapse", "crisis", "recession", "fail", "bankruptcy", "central bank", 
        "inflation", "hike", "drop", "plunge", "default", "fitch downgrade", "downgrade", "rate hike", 
        "bond yield", "yield curve", "sell-off", "bear market", "market crash", "fall", "shock", "contagion",
        "panic", "failure", "correction", "bankruptcy", "rate decision"
    ],
    "medium_impact": [
        "growth", "expansion", "job report", "fed decision", "quarterly earnings", "acquisition", 
        "ipo", "merger", "partnership", "profit warning", "bond issuance", "growth", "employment", 
        "report", "ECB", "FED", "quarterly results", "merger", "acquisition", "partnership",
        "profits", "bond issuance", "bond offering", "outlook", "warning",
        "buyout", "initial public offering", "new CEO", "restructuring"
    ],
    "low_impact": [
        "recommendation", "stock buyback", "dividend", "announcement", "management change", "forecast",
        "nomination", "product", "service", "strategy", "market", "plan", "update", "trend"
    ]
}

# Structure of dominant themes
THEMES_DOMINANTS = {
    "macroeconomics": {
        "inflation": ["inflation", "price", "prices", "CPI", "interest rate", "yield", "yields", "consumer price"],
        "recession": ["recession", "slowdown", "GDP", "growth", "crisis", "economic contraction", "economic downturn"],
        "monetary_policy": ["fed", "ecb", "central bank", "tapering", "quantitative easing", "QE", "rate hike", "rate cut", "monetary"],
        "geopolitics": ["conflict", "war", "tensions", "geopolitical", "ukraine", "russia", "israel", "china", "taiwan", "middle east"],
        "energy_transition": ["climate", "esg", "biodiversity", "net zero", "carbon neutral", "transition", "sustainable", "green energy", "renewable"]
    },
    "sectors": {
        "technology": ["ai", "artificial intelligence", "cloud", "cyber", "tech", "semiconductor", "digital", "data", "computing"],
        "energy": ["oil", "gas", "uranium", "energy", "barrel", "renewable", "opec", "crude"],
        "defense": ["defense", "military", "weapons", "nato", "rearmament", "arms", "security"],
        "finance": ["banks", "insurance", "rates", "bonds", "treasury", "financial", "banking"],
        "real_estate": ["real estate", "property", "epra", "reits", "infrastructure", "construction", "housing"],
        "consumer": ["retail", "consumer", "luxury", "purchase", "disposable income", "spending", "sales"],
        "healthcare": ["health", "biotech", "pharma", "vaccine", "fda", "clinical trial", "medicine", "medical"],
        "industry": ["industry", "manufacturing", "factory", "production", "automation", "supply chain", "industrial"],
        "transport": ["logistics", "transport", "shipping", "truck", "port", "airline", "freight", "cargo"],
        "agriculture": ["wheat", "corn", "cocoa", "agriculture", "fertilizer", "commodities", "crop", "farming"],
        # Nouveau secteur crypto ajouté ici
        "crypto": [
            "crypto", "cryptocurrency", "bitcoin", "ethereum", "blockchain", "altcoin", "token", 
            "defi", "nft", "binance", "coinbase", "web3", "mining", "wallet", "staking", 
            "smart contract", "btc", "eth", "xrp", "sol", "solana", "cardano", "polkadot",
            "avalanche", "tether", "usdt", "usdc", "ripple", "chainlink", "exchange", "dao"
        ]
    },
    "regions": {
        "europe": ["europe", "france", "ecb", "germany", "italy", "eurozone", "eu", "european union", "brussels"],
        "usa": ["usa", "fed", "s&p", "nasdaq", "dow jones", "united states", "america", "washington"],
        "asia": ["china", "japan", "korea", "india", "asia", "emerging asia", "beijing", "tokyo"],
        "latam": ["brazil", "mexico", "latam", "latin america", "argentina", "chile"],
        "canada": ["canada", "ottawa", "toronto", "quebec", "canadian"],
        "australia": ["australia", "sydney", "aussie", "asx", "australian"],
        "africa": ["nigeria", "africa", "south africa", "johannesburg", "kenya", "lagos", "african"],
        "blocs": ["asean", "oecd", "brics", "opec", "nato", "g7", "g20", "trade bloc"],
        "global": ["world", "acwi", "international", "global", "all markets", "worldwide"]
    }
}

# Important sources by category (for score calculation)
IMPORTANT_SOURCES = {
    "general_news": [
        "Bloomberg", "Reuters", "Financial Times", "Wall Street Journal", "CNBC", 
        "BBC", "New York Times", "The Economist"
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
    ],
    "forex_news": [
        "ForexLive", "DailyFX", "FXStreet", "Investing.com", "Bloomberg", "Reuters",
        "MarketWatch", "Financial Times", "CNBC", "Yahoo Finance"
    ]
}

# Premium sources that get extra points
PREMIUM_SOURCES = ["bloomberg", "financial times", "wall street journal", "reuters"]

# High importance keywords by category (for score calculation)
HIGH_IMPORTANCE_KEYWORDS = {
    "general_news": [
        "recession", "inflation", "fed", "central bank", "interest rate", "gdp", 
        "unemployment", "market crash", "crisis", "economic growth", "federal reserve",
        "treasury", "ecb", "default", "geopolitical", "war", "conflict"
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
    ],
    "forex_news": [
        "currency", "exchange rate", "forex", "fx", "dollar", "euro", "yen", "pound",
        "intervention", "parity", "devaluation", "appreciation", "depreciation", 
        "carry trade", "volatility", "central bank", "fed", "ecb", "boj"
    ]
}

# Medium importance keywords by category
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
    ],
    "forex_news": [
        "trading", "pair", "cross", "major", "minor", "exotic", "spread", "pip",
        "technical analysis", "support", "resistance", "trend", "breakout", "pattern"
    ]
}

def read_existing_news():
    """Reads existing JSON file as fallback"""
    try:
        with open(NEWS_JSON_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

def fetch_api_data(endpoint, params=None):
    """Generic function to fetch data from FMP API"""
    if not CONFIG["api_key"]:
        logger.error("FMP API key not defined. Please set FMP_API_KEY in environment variables.")
        return []
        
    if params is None:
        params = {}
    
    params["apikey"] = CONFIG["api_key"]
    
    try:
        logger.info(f"Fetching data from {endpoint} with params {params}")
        response = requests.get(endpoint, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        logger.info(f"✅ {len(data)} items retrieved from {endpoint}")
        return data
    except Exception as e:
        logger.error(f"❌ Error fetching from {endpoint}: {str(e)}")
        return []

def fetch_articles_by_period(endpoint, start_date, end_date, source_type=None, days_interval=7, max_pages=5):
    """
    Fetches articles over a given period by splitting the period into intervals
    and using pagination to get as many articles as possible
    """
    logger.info(f"Starting extraction of articles from {start_date} to {end_date} in {days_interval} day chunks")
    
    # Use the source-specific limit or 50 by default
    per_page = CONFIG["news_limits"].get(source_type, 50) if source_type else 50
    
    from_date = datetime.strptime(start_date, "%Y-%m-%d")
    to_date = datetime.strptime(end_date, "%Y-%m-%d")
    all_articles = []
    
    # Process period by intervals
    current_from = from_date
    while current_from < to_date:
        current_to = min(current_from + timedelta(days=days_interval), to_date)
        
        logger.info(f"Processing period {current_from.strftime('%Y-%m-%d')} → {current_to.strftime('%Y-%m-%d')}")
        
        # Process pages for each interval
        for page in range(max_pages):
            params = {
                "from": current_from.strftime("%Y-%m-%d"),
                "to": current_to.strftime("%Y-%m-%d"),
                "page": page,
                "limit": per_page
            }
            
            articles = fetch_api_data(endpoint, params)
            
            if not articles:
                break  # No more articles for this period
                
            logger.info(f"  Page {page+1}: {len(articles)} articles retrieved")
            all_articles.extend(articles)
            
            # If we got fewer articles than the limit, we've reached the end
            if len(articles) < per_page:
                break
                
        # Move to next interval
        current_from = current_to
    
    logger.info(f"Total articles retrieved for the period: {len(all_articles)}")
    return all_articles

def get_general_news():
    """Fetches general economic news"""
    # Get news from the last 30 days
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["general_news"], start_date, end_date, "general_news")

def get_fmp_articles():
    """Fetches articles written by FMP"""
    # Get articles from the last 30 days
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["fmp_articles"], start_date, end_date, "fmp_articles")

def get_stock_news():
    """Fetches stock news"""
    # Get news from the last 30 days
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["stock_news"], start_date, end_date, "stock_news")

def get_crypto_news():
    """Fetches cryptocurrency news"""
    # Get news from the last 30 days
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["crypto_news"], start_date, end_date, "crypto_news")

def get_press_releases():
    """Fetches press releases"""
    # Get press releases from the last 30 days
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["press_releases"], start_date, end_date, "press_releases")

def get_forex_news():
    """Fetches latest forex-market news"""
    # Get news from the last 30 days
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["forex_news"], start_date, end_date, "forex_news")

def extract_themes(article):
    """Identifies dominant themes from title content"""
    text = article.get("title", "").lower()
    themes_detected = {"macroeconomics": [], "sectors": [], "regions": []}
    
    for axis, groups in THEMES_DOMINANTS.items():
        for theme, keywords in groups.items():
            if any(kw in text for kw in keywords):
                themes_detected[axis].append(theme)

    return themes_detected

def compute_sentiment_distribution(articles):
    """Calculates sentiment distribution for a set of articles"""
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
    Determines the news category:
    - economy: macroeconomic news
    - markets: news about indices, ETFs, etc.
    - companies: news specific to companies
    - crypto: cryptocurrency news
    - tech: technology news
    - forex: forex/currency news
    """
    # Check symbol for crypto
    if article.get("symbol") and any(ticker in str(article.get("symbol")) for ticker in ["BTC", "ETH", "CRYPTO", "COIN"]):
        return "crypto"
        
    # Analyze text to determine category
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    # Forex category (priority 1) - New category for forex news
    forex_keywords = [
        "forex", "currency", "usd", "eur", "jpy", "gbp", "cad", "aud", "chf", "nzd",
        "exchange rate", "fx", "dollar index", "eurusd", "usdjpy", "gbpusd", "usdcad",
        "audusd", "usdchf", "nzdusd", "currency pair", "carry trade", "intervention",
        "parity", "devaluation", "appreciation", "depreciation"
    ]
    
    if any(word in text for word in forex_keywords):
        return "forex"
    
    # Crypto category (priority 2) - Utiliser les mêmes mots-clés que dans THEMES_DOMINANTS
    crypto_keywords = THEMES_DOMINANTS["sectors"]["crypto"]
    
    if any(word in text for word in crypto_keywords):
        return "crypto"
    
    # Tech category (priority 3)
    tech_keywords = [
        "ai", "artificial intelligence", "machine learning", "data science", 
        "software", "hardware", "tech", "technology", "startup", "app", 
        "mobile", "cloud", "computing", "digital", "internet", "online", "web"
    ]
    
    if any(word in text for word in tech_keywords):
        return "tech"
    
    # Economy category (priority 4)
    economy_keywords = [
        "economy", "inflation", "gdp", "fed", "central bank",
        "interest rate", "economic", "unemployment",
        "consumer", "spending", "policy", "fiscal", "monetary", "recession"
    ]
    
    if any(word in text for word in economy_keywords):
        return "economy"
    
    # Markets category (priority 5)
    markets_keywords = [
        "etf", "fund", "index", "s&p", "dow", "cac", "nasdaq", 
        "bond", "treasury", "yield", "commodities", "oil", 
        "gold", "market", "stock market", "bull market", 
        "bear market", "rally", "correction", "volatility", "vix"
    ]
    
    if any(word in text for word in markets_keywords):
        return "markets"
    
    # Default: companies
    return "companies"

def determine_country(article):
    """
    Determines the country/region of the news using more detailed analysis
    to detect more countries than just france/us
    """
    # Check symbol for initial information
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
    
    # Analyze text for more precise detection
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    # Keywords for different countries/regions
    country_keywords = {
        "france": [
            "france", "french", "paris", "cac", "paris stock exchange", "euronext", "amf", 
            "france", "paris", "french"
        ],
        "uk": [
            "uk", "united kingdom", "britain", "british", "london", "ftse", "bank of england", 
            "pound sterling", "gbp", "boe", "royal", "london stock exchange", "britain"
        ],
        "germany": [
            "germany", "berlin", "frankfurt", "dax", "deutsche", "euro", "ecb", 
            "bundesbank", "merkel", "scholz", "german"
        ],
        "china": [
            "china", "chinese", "beijing", "shanghai", "hong kong", "shenzhen", "yuan", "renminbi", 
            "pboc", "ccp", "xi jinping", "chinese"
        ],
        "japan": [
            "japan", "japanese", "tokyo", "nikkei", "yen", "bank of japan", "boj", "abenomics", 
            "japan", "japanese", "kishida", "abe", "jpx"
        ],
        "emerging_markets": [
            "emerging markets", "emerging economies", "brics", "brazil", "russia", "india", 
            "south africa", "indonesia", "turkey", "mexico", "thailand", "vietnam", 
            "manila", "mumbai", "bovespa", "sensex", "micex"
        ],
        "global": [
            "global", "world", "international", "worldwide", "global economy", "global markets",
            "world", "international", "all markets", "across markets"
        ]
    }
    
    # Check each country/region by priority order
    for country, keywords in country_keywords.items():
        if any(keyword in text for keyword in keywords):
            return country
    
    # Default: "us" (most important market globally)
    return "us"

def determine_impact(article):
    """Determines the impact of news (positive/negative/neutral)"""
    # If sentiment is provided by the API
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
    
    # Basic text analysis if no sentiment provided
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    positive_words = [
        "surge", "soar", "gain", "rise", "jump", "boost", "recovery", "profit", 
        "beat", "success", "bullish", "upward", "rally", "outperform", "growth",
        "positive", "optimistic", "momentum", "exceed", "improvement", "confidence",
        "strong", "strength", "uptick", "upgrade", "increase", "uptrend"
    ]
    
    negative_words = [
        "drop", "fall", "decline", "loss", "plunge", "tumble", "crisis", "risk", 
        "warning", "concern", "bearish", "downward", "slump", "underperform", "recession",
        "negative", "pessimistic", "weakness", "miss", "downgrade", "cut", "reduction",
        "pressure", "struggle", "slowdown", "decrease", "downtrend"
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
    """Formats a date in YYYY-MM-DD format to DD/MM/YYYY"""
    try:
        date_parts = date_str.split(" ")[0].split("-")
        if len(date_parts) == 3:
            return f"{date_parts[2]}/{date_parts[1]}/{date_parts[0]}"
        return date_str.replace("-", "/")
    except:
        # Fallback in case of error
        return date_str.replace("-", "/")

def format_time(date_str):
    """Extracts time in HH:MM format from a complete date"""
    try:
        time_parts = date_str.split(" ")[1].split(":")
        if len(time_parts) >= 2:
            return f"{time_parts[0]}:{time_parts[1]}"
        return "00:00"
    except:
        # Fallback in case of error
        return "00:00"

def normalize_article(article, source=None):
    """Normalizes different FMP article formats into a standard format"""
    # Handle different formats based on endpoint
    
    # Determine key fields
    title = article.get("title", "")
    
    # For FMP Articles API
    if "date" in article and "content" in article and "tickers" in article:
        text = article.get("content", "")
        date = article.get("date", "")
        symbol = article.get("tickers", "")
        site = article.get("site", "Financial Modeling Prep")
        url = article.get("link", "")
    # For other endpoints
    else:
        text = article.get("text", "")
        date = article.get("publishedDate", "")
        symbol = article.get("symbol", "")
        site = article.get("site", article.get("publisher", ""))
        url = article.get("url", "")
    
    # Return normalized article
    return {
        "title": title,
        "text": text,
        "publishedDate": date,
        "symbol": symbol,
        "site": site,
        "url": url,
        "source_type": source  # Add source type for classification
    }

def remove_duplicates(news_list):
    """Removes duplicate articles based on title"""
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
    Calculates an importance score for an article based on its category and content.
    
    Args:
        article (dict): The article containing title, content, source, etc.
        category (str): The article category (general_news, stock_news, crypto_news, press_releases, forex_news)
    
    Returns:
        float: Importance score between 0 and 100
    """
    # For debug logging of intermediate scores
    debug_scores = {}
    
    # Combination of title and text for analysis
    content = f"{article.get('title', '')} {article.get('content', '')}".lower()
    title = article.get('title', '').lower()
    article_source = article.get("source", "").lower()
    
    # 1. Score based on high importance keywords (varying by category)
    high_keywords = HIGH_IMPORTANCE_KEYWORDS.get(category, [])
    matched_high_keywords = set()
    for keyword in high_keywords:
        if keyword in content:
            matched_high_keywords.add(keyword)
    
    # Vary the maximum score by category
    if category == "crypto_news":
        high_keyword_score = min(20, len(matched_high_keywords) * 2)
    elif category == "general_news":
        high_keyword_score = min(40, len(matched_high_keywords) * 5)
    elif category == "stock_news":
        high_keyword_score = min(35, len(matched_high_keywords) * 4.5)
    elif category == "press_releases":
        high_keyword_score = min(30, len(matched_high_keywords) * 4)
    elif category == "forex_news":
        high_keyword_score = min(32, len(matched_high_keywords) * 4.2)
    else:
        high_keyword_score = min(30, len(matched_high_keywords) * 4)
    
    debug_scores["high_keywords"] = high_keyword_score
    
    # 2. Score based on medium importance keywords (max 20 points, adjusted by category)
    medium_keywords = MEDIUM_IMPORTANCE_KEYWORDS.get(category, [])
    matched_medium_keywords = set()
    for keyword in medium_keywords:
        if keyword in content:
            matched_medium_keywords.add(keyword)
    
    # Adjust medium importance by category
    if category == "crypto_news":
        medium_keyword_score = min(10, len(matched_medium_keywords) * 1.5)
    elif category == "press_releases":
        medium_keyword_score = min(15, len(matched_medium_keywords) * 2.0)
    elif category == "forex_news":
        medium_keyword_score = min(18, len(matched_medium_keywords) * 2.2)
    else:
        medium_keyword_score = min(20, len(matched_medium_keywords) * 2.5)
    
    debug_scores["medium_keywords"] = medium_keyword_score
    
    # 3. Score based on source (max 20 points, adjusted by category)
    source_score = 0
    for important_source in IMPORTANT_SOURCES.get(category, []):
        if important_source.lower() in article_source:
            # Adjust score based on category
            if category == "crypto_news":
                source_score = 10
            elif category == "press_releases":
                source_score = 15
            elif category == "forex_news":
                source_score = 18
            else:
                source_score = 20
            break
    
    # Extra points for premium sources
    if any(premium in article_source for premium in PREMIUM_SOURCES):
        source_score = min(25, source_score + 5)  # +5 points for premium sources, max 25
    
    debug_scores["source"] = source_score
    
    # 4. Score based on title and content length (rebalanced to 3 + 7 points)
    title_length = len(article.get("title", ""))
    text_length = len(article.get("content", ""))
    
    # 3 points max for title
    title_score = min(3, title_length / 33)  # 3 points max for a title of 100 characters
    
    # 7 points max for content
    text_score = min(7, text_length / 360)   # 7 points max for a text of ~2500 characters
    
    debug_scores["title_length"] = title_score
    debug_scores["content_length"] = text_score
    
    # 5. Score based on impact (max 10 points, adjusted for crypto and by sentiment value)
    impact = article.get("impact", "neutral")
    
    if category == "crypto_news":
        if impact == "negative":
            impact_score = 5  # Reduced from 10
        elif impact == "positive":
            impact_score = 4  # Reduced from 7
        else:
            impact_score = 3  # Reduced from 5
    else:
        if impact == "negative":
            impact_score = 10  # Negative news often has more impact
        elif impact == "positive":
            impact_score = 7   # Reduced from 8
        else:
            impact_score = 5
    
    debug_scores["impact"] = impact_score
    
    # Calculate total score
    total_score = high_keyword_score + medium_keyword_score + source_score + title_score + text_score + impact_score
    
    # Normalize between 0 and 100
    normalized_score = min(100, total_score)
    
    # Apply category-specific adjustments
    if category == "crypto_news":
        normalized_score = normalized_score * 0.9  # 10% de pénalité pour crypto
    
    # Add debug logging if needed
    if logger.level <= logging.DEBUG:
        title_snippet = article.get('title', '')[:30] + ('...' if len(article.get('title', '')) > 30 else '')
        logger.debug(f"Article: '{title_snippet}' | Category: {category} | Total: {normalized_score:.1f}")
        logger.debug(f"  Scores: {debug_scores}")
    
    return normalized_score

def calculate_output_limits(articles_by_country, max_total=150):
    """
    Calculates output limits for each country/region based on available articles
    and their importance.
    
    Args:
        articles_by_country (dict): Dictionary of articles by country
        max_total (int): Maximum total number of articles to keep
    
    Returns:
        dict: Limits for each country/region
    """
    # Base configuration of limits by country/region
    base_limits = CONFIG["output_limits"]
    
    # Count articles by country
    country_counts = {country: len(articles) for country, articles in articles_by_country.items()}
    
    # Adjust limits based on available articles
    adjusted_limits = {}
    remaining_quota = max_total
    
    # First pass: allocate a minimum for each country with articles
    for country, count in country_counts.items():
        # If country not defined in base_limits, consider it as global
        if country not in base_limits:
            if "global" not in country_counts:
                country_counts["global"] = 0
            country_counts["global"] += count
            continue
            
        min_limit = min(count, max(5, base_limits.get(country, 10) // 2))
        adjusted_limits[country] = min_limit
        remaining_quota -= min_limit
    
    # Ensure global is considered even if it has no articles
    if "global" not in adjusted_limits and "global" in base_limits:
        adjusted_limits["global"] = 0
    
    # Second pass: distribute remaining quota proportionally
    if remaining_quota > 0:
        # Calculate total base limits for countries with articles
        total_base = sum(base_limits.get(country, 10) for country in adjusted_limits.keys())
        
        # Distribute proportionally
        for country in list(adjusted_limits.keys()):  # Use a copy of keys
            if total_base > 0:
                country_ratio = base_limits.get(country, 10) / total_base
                additional = int(remaining_quota * country_ratio)
                adjusted_limits[country] += additional
                remaining_quota -= additional
        
        # Assign any remaining quota to global or first country if global doesn't exist
        if "global" in adjusted_limits:
            adjusted_limits["global"] += remaining_quota
        elif adjusted_limits:
            first_country = next(iter(adjusted_limits))
            adjusted_limits[first_country] += remaining_quota
    
    return adjusted_limits

def extract_top_themes(news_data, days=30, max_examples=3, exclude_themes=None):
    """
    Analyzes dominant themes over a given period (e.g., 30 days) with detailed keyword analysis
    
    Args:
        news_data: The news data to analyze
        days: Number of days to look back
        max_examples: Maximum examples to include per theme
        exclude_themes: Dict of axes and themes to exclude, e.g. {"sectors": ["crypto"]}
    """
    cutoff_date = datetime.now() - timedelta(days=days)
    
    # Simple counter for the 5 most frequent themes
    themes_counter = {
        "macroeconomics": Counter(),
        "sectors": Counter(),
        "regions": Counter()
    }
    
    # Advanced structure to store details of each theme
    themes_details = {
        "macroeconomics": {},
        "sectors": {},
        "regions": {}
    }
    
    # Collection of articles by theme to calculate sentiment distribution
    theme_articles = {
        "macroeconomics": {},
        "sectors": {},
        "regions": {}
    }
    
    total_articles = 0
    processed_articles = 0
    
    for country_articles in news_data.values():
        if not isinstance(country_articles, list):
            continue
        
        total_articles += len(country_articles)
        
        for article in country_articles:
            # Use rawDate if available, otherwise fallback to formatted date
            try:
                if "rawDate" in article:
                    # Format YYYY-MM-DD HH:MM:SS
                    article_date = datetime.strptime(article["rawDate"].split(" ")[0], "%Y-%m-%d")
                else:
                    # Format DD/MM/YYYY (for compatibility with old data)
                    article_date = datetime.strptime(article["date"], "%d/%m/%Y")
                
                if article_date < cutoff_date:
                    continue
                
                processed_articles += 1
                
                themes = article.get("themes", {})
                for axis, subthemes in themes.items():
                    for theme in subthemes:
                        # Collection for sentiment calculation later
                        if theme not in theme_articles[axis]:
                            theme_articles[axis][theme] = []
                        theme_articles[axis][theme].append(article)
                        
                        # Update simple counter
                        themes_counter[axis][theme] += 1
                        
                        # Initialize detailed structure if it doesn't exist yet
                        if theme not in themes_details[axis]:
                            themes_details[axis][theme] = {
                                "count": 0,
                                "articles": [],
                                "keywords": {}
                            }
                        
                        # Increment counter in detailed structure
                        themes_details[axis][theme]["count"] += 1
                        
                        # Add ALL titles associated with the theme
                        title = article.get("title", "")
                        if title and title not in themes_details[axis][theme]["articles"]:
                            themes_details[axis][theme]["articles"].append(title)
                        
                        # Analyze specific keywords
                        text = (article.get("content", "") or article.get("text", "") + " " + title).lower()
                        
                        # Get list of keywords for this theme
                        if axis in THEMES_DOMINANTS and theme in THEMES_DOMINANTS[axis]:
                            keywords = THEMES_DOMINANTS[axis][theme]
                            for keyword in keywords:
                                if keyword.lower() in text:
                                    if keyword not in themes_details[axis][theme]["keywords"]:
                                        themes_details[axis][theme]["keywords"][keyword] = {
                                            "count": 0,
                                            "examples": []
                                        }
                                    # Increment keyword counter
                                    themes_details[axis][theme]["keywords"][keyword]["count"] += 1
                                    # Add example for this specific keyword
                                    if (len(themes_details[axis][theme]["keywords"][keyword]["examples"]) < max_examples and
                                        title not in themes_details[axis][theme]["keywords"][keyword]["examples"]):
                                        themes_details[axis][theme]["keywords"][keyword]["examples"].append(title)
                
            except Exception as e:
                logger.warning(f"Article ignored for invalid date: {article.get('title')} | Error: {str(e)}")
                continue
    
    logger.info(f"Theme analysis: {processed_articles}/{total_articles} articles used for the {days} day period")
    
    # Add sentiment stats to details
    for axis, theme_dict in theme_articles.items():
        for theme, articles in theme_dict.items():
            sentiment_stats = compute_sentiment_distribution(articles)
            if theme in themes_details[axis]:
                themes_details[axis][theme]["sentiment_distribution"] = sentiment_stats
    
    # Get main themes for each axis with their details
    # CORRECTION: Use most_common(15) instead of most_common(5) to show more themes
    top_themes_with_details = {}
    for axis in themes_counter:
        top_themes = themes_counter[axis].most_common(15)  # Show top 15 themes
        
        # Filtrer les thèmes à exclure
        if exclude_themes and axis in exclude_themes:
            top_themes = [(theme, count) for theme, count in top_themes 
                         if theme not in exclude_themes[axis]]
        
        top_themes_with_details[axis] = {}
        for theme, count in top_themes:
            top_themes_with_details[axis][theme] = themes_details[axis].get(theme, {"count": count, "articles": []})
    
    return top_themes_with_details

def build_theme_summary(theme_name, theme_data):
    """Automatically generates a simple text summary for a theme"""
    count = theme_data.get("count", 0)
    articles = theme_data.get("articles", [])
    keywords = theme_data.get("keywords", {})
    sentiment_distribution = theme_data.get("sentiment_distribution", {})

    keywords_list = sorted(keywords.items(), key=lambda x: x[1]["count"], reverse=True)
    keywords_str = ", ".join([f"{kw} ({info['count']})" for kw, info in keywords_list[:5]])

    if not articles:
        return f"The theme '{theme_name}' appeared in {count} articles recently."

    sentiment_info = ""
    if sentiment_distribution:
        pos = sentiment_distribution.get("positive", 0)
        neg = sentiment_distribution.get("negative", 0)
        if pos > neg + 20:
            sentiment_info = f" Sentiment is mostly positive ({pos}% vs {neg}% negative)."
        elif neg > pos + 20:
            sentiment_info = f" Sentiment is mostly negative ({neg}% vs {pos}% positive)."
        else:
            sentiment_info = f" Sentiment is mixed ({pos}% positive, {neg}% negative)."

    return (
        f"📰 The theme **{theme_name}** was detected in **{count} articles** "
        f"during the period, mainly through topics like: {keywords_str}."
        f"{sentiment_info} "
        f"Examples of articles: « {articles[0]} »"
        + (f", « {articles[1]} »" if len(articles) > 1 else "")
        + (f", « {articles[2]} »" if len(articles) > 2 else "") + "."
    )

def process_news_data(news_sources):
    """Processes and formats FMP news to match TradePulse format"""
    # Initialize structure for all possible countries/regions
    formatted_data = {
        "lastUpdated": datetime.now().isoformat()
    }
    
    for country in CONFIG["output_limits"].keys():
        formatted_data[country] = []
    
    # List of all articles before country separation
    all_articles = []
    
    # Process each news source
    for source_type, articles in news_sources.items():
        for article in articles:
            # Normalize article
            normalized = normalize_article(article, source_type)
            
            # Check if title is long enough to be relevant
            if len(normalized["title"]) < 10:
                continue
                
            # Check if content is detailed enough
            if len(normalized["text"]) < 50:
                continue
            
            # Determine category and country
            category = determine_category(normalized, source_type)
            country = determine_country(normalized)
            impact = determine_impact(normalized)
            
            # Essential data
            news_item = {
                "title": normalized["title"],
                "content": normalized["text"],
                "source": normalized["site"],
                "rawDate": normalized["publishedDate"],  # Keep raw date for filtering
                "date": format_date(normalized["publishedDate"]),
                "time": format_time(normalized["publishedDate"]),
                "category": category,
                "impact": impact,
                "country": country,
                "url": normalized.get("url", ""),
                "themes": extract_themes(normalized),
                "source_type": source_type
            }
            
            # Calculate importance score
            news_item["importance_score"] = compute_importance_score(news_item, source_type)
            
            # Add to global list
            all_articles.append(news_item)
    
    # Remove duplicates
    all_articles = remove_duplicates(all_articles)
    
    # Sort by importance score
    all_articles.sort(key=lambda x: x["importance_score"], reverse=True)
    
    # Distribute by country
    articles_by_country = {}
    for article in all_articles:
        country = article["country"]
        if country not in articles_by_country:
            articles_by_country[country] = []
        articles_by_country[country].append(article)
    
    # Calculate appropriate limits for each country
    adjusted_limits = calculate_output_limits(articles_by_country, CONFIG["max_total_articles"])
    
    # Apply limits by country
    for country, articles in articles_by_country.items():
        limit = adjusted_limits.get(country, 10)
        # If country exists in formatted_data
        if country in formatted_data:
            formatted_data[country] = articles[:limit]
        else:
            # Otherwise, add to global
            if "global" not in formatted_data:
                formatted_data["global"] = []
            formatted_data["global"].extend(articles[:limit])
            logger.info(f"Country {country} not handled, {len(articles[:limit])} articles added to 'global'")
    
    # NOUVEAU: Appliquer les limites par catégorie
    if "category_limits" in CONFIG:
        for category, limit in CONFIG["category_limits"].items():
            # Compter les articles de cette catégorie dans le résultat final
            category_articles = []
            for country, articles in formatted_data.items():
                if isinstance(articles, list):
                    for article in articles:
                        if article.get("category") == category:
                            category_articles.append((country, article))
            
            # Si le nombre dépasse la limite, supprimer les moins importants
            if len(category_articles) > limit:
                # Trier par score d'importance (du moins important au plus important)
                category_articles.sort(key=lambda x: x[1].get("importance_score", 0))
                
                # Garder seulement les articles les plus importants
                articles_to_remove = category_articles[:-limit]  # On garde les "limit" derniers (plus importants)
                
                # Supprimer les articles excédentaires
                for country, article in articles_to_remove:
                    if country in formatted_data and isinstance(formatted_data[country], list):
                        formatted_data[country] = [a for a in formatted_data[country] if a != article]
                
                logger.info(f"Limité la catégorie '{category}' à {limit} articles (supprimé {len(articles_to_remove)})")
    
    # Statistics on data
    total_articles = sum(len(articles) for articles in formatted_data.values() if isinstance(articles, list))
    logger.info(f"Total processed and formatted articles: {total_articles}")
    
    return formatted_data

def update_news_json_file(news_data):
    """Updates news.json file with formatted data"""
    try:
        # Create a copy to avoid modifying the original
        output_data = {k: v for k, v in news_data.items()}
        
        # Create data folder if it doesn't exist
        os.makedirs(os.path.dirname(NEWS_JSON_PATH), exist_ok=True)
        
        with open(NEWS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"✅ news.json file successfully updated")
        return True
    except Exception as e:
        logger.error(f"❌ Error updating file: {str(e)}")
        return False

def generate_themes_json(news_data):
    """Generates a JSON file with dominant themes over different periods"""
    
    # Define analysis periods
    periods = {
        "weekly": 7,
        "monthly": 30,
        "quarterly": 90
    }
    
    # Extract dominant themes for each period
    themes_data = {}
    for period, days in periods.items():
        # MODIFICATION: Exclure crypto des thèmes dominants pour toutes les périodes
        exclude_themes = {"sectors": ["crypto"]}
        themes_data[period] = extract_top_themes(news_data, days=days, exclude_themes=exclude_themes)
    
    # Add automated GPT-like summary to each theme
    for period, axes in themes_data.items():
        for axis, themes in axes.items():
            for theme_name, theme_data in themes.items():
                summary = build_theme_summary(theme_name, theme_data)
                themes_data[period][axis][theme_name]["gpt_summary"] = summary
    
    # Add metadata
    themes_output = {
        "themes": themes_data,
        "lastUpdated": datetime.now().isoformat(),
        "analysisCount": sum(len(articles) for articles in news_data.values() if isinstance(articles, list))
    }
    
    # Create data folder if it doesn't exist
    os.makedirs(os.path.dirname(THEMES_JSON_PATH), exist_ok=True)
    
    # Write to file
    try:
        with open(THEMES_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(themes_output, f, ensure_ascii=False, indent=2)
        logger.info(f"✅ themes.json file successfully updated")
        return True
    except Exception as e:
        logger.error(f"❌ Error updating themes.json file: {str(e)}")
        return False

def main():
    """Main execution function"""
    try:
        # 0. Read existing data for fallback
        existing_data = read_existing_news()
        
        # 1. Fetch different news sources
        general_news = get_general_news()
        fmp_articles = get_fmp_articles()
        stock_news = get_stock_news()
        crypto_news = get_crypto_news()
        press_releases = get_press_releases()
        forex_news = get_forex_news()
        
        # 2. Organize news sources
        news_sources = {
            "general_news": general_news,
            "fmp_articles": fmp_articles,
            "stock_news": stock_news,
            "crypto_news": crypto_news,
            "press_releases": press_releases,
            "forex_news": forex_news
        }
        
        # Count total news
        total_news = sum(len(articles) for articles in news_sources.values())
        logger.info(f"Total news retrieved: {total_news}")
        
        # Check if we have data
        if total_news == 0:
            logger.warning("No news retrieved, using existing data")
            if existing_data:
                return True
        
        # 3. Process and format data with new scoring system
        news_data = process_news_data(news_sources)
        
        # 4. Update news JSON file
        success_news = update_news_json_file(news_data)
        
        # 5. Generate dominant themes file
        success_themes = generate_themes_json(news_data)
        
        # 6. Display dominant themes over 30 days (for log)
        top_themes = extract_top_themes(news_data, days=30)
        logger.info("🎯 Dominant themes over 30 days:")
        for axis, themes in top_themes.items():
            logger.info(f"  {axis.capitalize()}:")
            for theme, details in themes.items():
                logger.info(f"    {theme} ({details['count']})")
                # Display sentiment distribution if available
                if "sentiment_distribution" in details:
                    sentiment = details["sentiment_distribution"]
                    logger.info(f"      Sentiment: {sentiment['positive']}% positive, {sentiment['negative']}% negative, {sentiment['neutral']}% neutral")
                if "keywords" in details and details["keywords"]:
                    for keyword, kw_details in details["keywords"].items():
                        logger.info(f"      - {keyword} ({kw_details['count']})")
        
        return success_news and success_themes
    except Exception as e:
        logger.error(f"❌ Error in script execution: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = main()
    if not success:
        exit(1)
