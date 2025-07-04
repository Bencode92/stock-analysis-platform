#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse - Investor-Grade News Updater v2.3
Script for extracting news and events from Financial Modeling Prep
Enhanced with MSCI-weighted geographic distribution and sophisticated topic caps
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

# ---------------------------------------------------------------------------
# INVESTOR-GRADE NEWS CONFIG v2.3
# ---------------------------------------------------------------------------

CONFIG = {
    # --------- CONTRAINTES GÉNÉRALES --------------------------------------
    "api_key": os.environ.get("FMP_API_KEY", ""),
    "meta": {
        "max_total_articles": 150,
        "days_back":          21,     # 3 semaines = cycle earnings + macro
        "days_ahead":         10      # pour capter pré-annonces & agendas
    },

    # --------- ENDPOINTS --------------------------------------------------
    "endpoints": {
        "general_news":   "https://financialmodelingprep.com/stable/news/general-latest",
        "fmp_articles":   "https://financialmodelingprep.com/stable/fmp-articles",
        "stock_news":     "https://financialmodelingprep.com/stable/news/stock",
        "crypto_news":    "https://financialmodelingprep.com/stable/news/crypto",
        "press_releases": "https://financialmodelingprep.com/stable/news/press-releases",
        "forex_news":     "https://financialmodelingprep.com/stable/news/forex-latest"
    },

    # --------- BUDGET DE COLLECTE (≈ articles/jour) -----------------------
    "pull_limits": {
        "general_news":    15,   # Réduit pour focus macro quality
        "stock_news":      40,   # Maintenu pour earnings season
        "crypto_news":      6,   # Réduit pour limiter bruit
        "forex_news":      12,   # Ajusté pour nouvelles devises
        "press_releases":   3,   # Minimal pour éviter spam
        "fmp_articles":     2    # Articles d'analyse FMP
    },

    # --------- QUOTA PAR ZONE GÉO  (pondéré MSCI ACWI) ---------------------
    "geo_budgets": {
        "weights": {              # part de capitalisation ACWI (~2025)
            "us":               58,
            "france":            3,
            "europe_other":     13,
            "asia":             20,
            "emerging_markets":  6
        },
        "base": {                # plancher d'articles
            "us":               20,
            "france":            5,
            "europe_other":      8,
            "asia":             10,
            "emerging_markets":  4
        },
        "max_total": 150
    },

    # --------- PLAFONNAGE THÉMATIQUE DYNAMIQUE -----------------------------
    "topic_caps": {
        "fixed": {
            "crypto":      6,
            "esg":         8,
            "ai":         12,
            "meme_stocks": 3
        },
        "relative_pct": 0.20,          # 20 % du flux total
        "overflow": { "extra": 4, "ttl_h": 48 }
    }
}

# ---------------------------------------------------------------------------
# KEYWORD TIERS (impact)  –  tous en minuscules, sans doublons
# ---------------------------------------------------------------------------
KEYWORD_TIERS = {
    "high": [
        # marché & macro choc
        "crash", "collapse", "contagion", "default", "downgrade", "stagflation",
        "recession", "sovereign risk", "yield spike", "volatility spike",
        # banques centrales / inflation
        "cpi", "pce", "core inflation", "rate hike", "rate cut", "qt", "qe",
        # crédit & liquidité
        "credit spread", "cds", "insolvency", "liquidity crunch",
        # fondamentaux entreprise
        "profit warning", "guidance cut", "eps miss", "dividend cut",
        # géopolitique
        "sanction", "embargo", "war", "conflict"
    ],
    "medium": [
        "earnings beat", "eps beat", "revenue beat", "free cash flow",
        "buyback", "merger", "acquisition", "spin-off", "ipo", "stake sale",
        "job cuts", "strike", "production halt", "regulation", "antitrust",
        "fine", "class action", "data breach", "rating watch",
        # macro data
        "payrolls", "unemployment rate", "pmi", "ism", "consumer confidence",
        "ppi", "housing starts"
    ],
    "low": [
        "product launch", "pilot", "partnership", "collaboration", "award",
        "appointment", "roadmap", "milestone", "update", "brand", "marketing",
        "prototype", "survey", "trend"
    ]
}

# ---------------------------------------------------------------------------
# THEMES  –  ajout d'un axe "fundamentals" + sous-thème AI
# ---------------------------------------------------------------------------
THEMES = {
    "macroeconomics": {
        "inflation":        ["cpi", "pce", "inflation", "ppi"],
        "growth":           ["gdp", "pmi", "industrial production"],
        "monetary_policy":  ["fed", "ecb", "boj", "rate hike", "qt"],
        "employment":       ["payrolls", "unemployment", "jobless claims"],
        "geopolitics":      ["sanction", "embargo", "war", "conflict"],
        "energy_transition":["esg", "net zero", "carbon", "renewable"]
    },
    "fundamentals": {
        "earnings":   ["eps", "revenue", "guidance", "margin"],
        "capital":    ["buyback", "dividend", "capex", "leverage"],
        "credit":     ["spread", "rating", "cds", "bond issuance"]
    },
    "sectors": {
        "ai":         ["genai", "chatgpt", "large language model", "copilot", "artificial intelligence"],
        "technology": ["semiconductor", "cloud", "cybersecurity"],
        "energy":     ["oil", "lng", "opec"],
        "finance":    ["banks", "treasury", "insurance"],
        "defense":    ["military", "nato", "contract"],
        "healthcare": ["fda", "clinical trial", "biotech"],
        "consumer":   ["retail", "luxury", "e-commerce"],
        "industry":   ["manufacturing", "supply chain", "automation"],
        "transport":  ["shipping", "airline", "logistics"],
        "agriculture":["crop", "fertilizer", "commodity"],
        "crypto":     ["bitcoin", "ethereum", "defi", "nft"]
    },
    "regions": {
        "us":     ["united states", "washington", "fed"],
        "europe": ["eurozone", "ecb", "paris", "frankfurt", "london"],
        "asia":   ["china", "japan", "korea", "india"],
        "em":     ["brazil", "russia", "south africa", "turkey"],
        "global": ["global", "worldwide", "international"]
    }
}

# ---------------------------------------------------------------------------
# SOURCES  –  premium boost + shortlist par catégorie
# ---------------------------------------------------------------------------
SOURCES = {
    "premium": ["bloomberg", "reuters", "financial times", "wall street journal"],

    "whitelist": {
        "general_news": [
            "bloomberg", "reuters", "financial times", "wall street journal",
            "cnbc", "the economist", "axios macro"
        ],
        "stock_news": [
            "bloomberg", "reuters", "barron's", "marketwatch",
            "seeking alpha", "yahoo finance", "investor's business daily"
        ],
        "crypto_news": [
            "bloomberg crypto", "coindesk", "cointelegraph", "the block",
            "decrypt", "dlnews"
        ],
        "press_releases": [
            "business wire", "pr newswire", "globe newswire",
            "company website"
        ],
        "forex_news": [
            "bloomberg", "reuters", "dailyfx", "fxstreet", "forexlive"
        ]
    }
}

# Backwards compatibility mappings
NEWS_KEYWORDS = {
    "high_impact": KEYWORD_TIERS["high"],
    "medium_impact": KEYWORD_TIERS["medium"], 
    "low_impact": KEYWORD_TIERS["low"]
}

THEMES_DOMINANTS = {
    "macroeconomics": THEMES["macroeconomics"],
    "sectors": THEMES["sectors"],
    "regions": THEMES["regions"],
    "fundamentals": THEMES["fundamentals"]  # Nouveau axe
}

IMPORTANT_SOURCES = SOURCES["whitelist"]
PREMIUM_SOURCES = SOURCES["premium"]

# High importance keywords by category (for score calculation)
HIGH_IMPORTANCE_KEYWORDS = {
    "general_news": [
        "recession", "inflation", "fed", "central bank", "interest rate", "gdp", 
        "unemployment", "market crash", "crisis", "economic growth", "federal reserve",
        "treasury", "ecb", "default", "geopolitical", "war", "conflict", "cpi", "pce"
    ],
    "stock_news": [
        "earnings", "beat", "miss", "guidance", "outlook", "upgrade", "downgrade", 
        "acquisition", "merger", "ipo", "buyback", "dividend", "profit", "loss",
        "revenue", "forecast", "ceo", "executive", "lawsuit", "regulation", "eps"
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
        "confidence", "retail", "manufacturing", "services", "housing", "real estate",
        "pmi", "ism", "payrolls"
    ],
    "stock_news": [
        "stock", "shares", "investor", "market", "trading", "performance", "index", 
        "sector", "industry", "competition", "strategy", "launch", "product", "service",
        "free cash flow", "margin"
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
    per_page = CONFIG["pull_limits"].get(source_type, 50) if source_type else 50
    
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
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["meta"]["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["general_news"], start_date, end_date, "general_news")

def get_fmp_articles():
    """Fetches articles written by FMP"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["meta"]["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["fmp_articles"], start_date, end_date, "fmp_articles")

def get_stock_news():
    """Fetches stock news"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["meta"]["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["stock_news"], start_date, end_date, "stock_news")

def get_crypto_news():
    """Fetches cryptocurrency news"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["meta"]["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["crypto_news"], start_date, end_date, "crypto_news")

def get_press_releases():
    """Fetches press releases"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["meta"]["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["press_releases"], start_date, end_date, "press_releases")

def get_forex_news():
    """Fetches latest forex-market news"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["meta"]["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["forex_news"], start_date, end_date, "forex_news")

def extract_themes(article):
    """Identifies dominant themes from title content including new fundamentals axis"""
    text = article.get("title", "").lower()
    themes_detected = {"macroeconomics": [], "sectors": [], "regions": [], "fundamentals": []}
    
    for axis, groups in THEMES.items():
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
    Determines the news category with investor-grade focus:
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
    
    # Crypto category (priority 2)
    crypto_keywords = THEMES["sectors"]["crypto"]
    
    if any(word in text for word in crypto_keywords):
        return "crypto"
    
    # Tech category (priority 3) - Enhanced for AI detection
    tech_keywords = THEMES["sectors"]["ai"] + THEMES["sectors"]["technology"] + [
        "software", "hardware", "tech", "technology", "startup", "app", 
        "mobile", "cloud", "computing", "digital", "internet", "online", "web"
    ]
    
    if any(word in text for word in tech_keywords):
        return "tech"
    
    # Economy category (priority 4) - Enhanced with macro indicators
    economy_keywords = THEMES["macroeconomics"]["inflation"] + THEMES["macroeconomics"]["growth"] + [
        "economy", "fed", "central bank", "economic", "consumer", "spending", 
        "policy", "fiscal", "monetary", "recession"
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
    Enhanced country detection for investor-grade geographic distribution
    """
    # Check symbol for initial information
    symbol = article.get("symbol", "")
    if symbol:
        if any(suffix in str(symbol) for suffix in [".PA", ".PAR"]):
            return "france"
        elif any(suffix in str(symbol) for suffix in [".L", ".LON"]):
            return "europe_other"  # UK goes to europe_other
        elif any(suffix in str(symbol) for suffix in [".DE", ".FRA", ".XE"]):
            return "europe_other"  # Germany goes to europe_other
        elif any(suffix in str(symbol) for suffix in [".SS", ".SZ", ".HK"]):
            return "asia"
        elif any(suffix in str(symbol) for suffix in [".T", ".JP"]):
            return "asia"
    
    # Analyze text for more precise detection
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    # Keywords for different countries/regions
    country_keywords = {
        "france": [
            "france", "french", "paris", "cac", "paris stock exchange", "euronext", "amf"
        ],
        "europe_other": [
            "uk", "united kingdom", "britain", "british", "london", "ftse", "bank of england",
            "germany", "berlin", "frankfurt", "dax", "deutsche", "bundesbank"
        ],
        "asia": [
            "china", "chinese", "beijing", "shanghai", "hong kong", "shenzhen", "yuan", "renminbi",
            "japan", "japanese", "tokyo", "nikkei", "yen", "bank of japan", "boj"
        ],
        "emerging_markets": [
            "emerging markets", "emerging economies", "brics", "brazil", "russia", "india", 
            "south africa", "indonesia", "turkey", "mexico", "thailand", "vietnam"
        ],
        "global": [
            "global", "world", "international", "worldwide", "global economy", "global markets"
        ]
    }
    
    # Check each country/region by priority order
    for country, keywords in country_keywords.items():
        if any(keyword in text for keyword in keywords):
            return country
    
    # Default: "us" (most important market globally)
    return "us"

def determine_impact(article):
    """Enhanced impact determination with investor-grade sentiment analysis"""
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
    
    # Enhanced text analysis with investor-grade keywords
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    positive_words = [
        "surge", "soar", "gain", "rise", "jump", "boost", "recovery", "profit", 
        "beat", "success", "bullish", "upward", "rally", "outperform", "growth",
        "positive", "optimistic", "momentum", "exceed", "improvement", "confidence",
        "strong", "strength", "uptick", "upgrade", "increase", "uptrend",
        "earnings beat", "revenue beat", "free cash flow"
    ]
    
    negative_words = [
        "drop", "fall", "decline", "loss", "plunge", "tumble", "crisis", "risk", 
        "warning", "concern", "bearish", "downward", "slump", "underperform", "recession",
        "negative", "pessimistic", "weakness", "miss", "downgrade", "cut", "reduction",
        "pressure", "struggle", "slowdown", "decrease", "downtrend",
        "profit warning", "guidance cut", "eps miss"
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
        return date_str.replace("-", "/")

def format_time(date_str):
    """Extracts time in HH:MM format from a complete date"""
    try:
        time_parts = date_str.split(" ")[1].split(":")
        if len(time_parts) >= 2:
            return f"{time_parts[0]}:{time_parts[1]}"
        return "00:00"
    except:
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
    Enhanced importance scoring with investor-grade criteria
    
    Args:
        article (dict): The article containing title, content, source, etc.
        category (str): The article category (general_news, stock_news, crypto_news, press_releases, forex_news)
    
    Returns:
        float: Importance score between 0 and 100
    """
    # Combination of title and text for analysis
    content = f"{article.get('title', '')} {article.get('content', '')}".lower()
    title = article.get('title', '').lower()
    article_source = article.get("source", "").lower()
    
    # 1. Enhanced keyword scoring using KEYWORD_TIERS
    high_keyword_score = 0
    medium_keyword_score = 0
    
    # Count high impact keywords
    for keyword in KEYWORD_TIERS["high"]:
        if keyword in content:
            high_keyword_score += 8  # Higher base score for high impact
    
    # Count medium impact keywords  
    for keyword in KEYWORD_TIERS["medium"]:
        if keyword in content:
            medium_keyword_score += 4
    
    # Cap the scores
    high_keyword_score = min(40, high_keyword_score)
    medium_keyword_score = min(20, medium_keyword_score)
    
    # 2. Enhanced source scoring with premium boost
    source_score = 0
    
    # Check if source is in whitelist for this category
    category_sources = SOURCES["whitelist"].get(category, [])
    for important_source in category_sources:
        if important_source.lower() in article_source:
            source_score = 15
            break
    
    # Premium source boost
    if any(premium in article_source for premium in SOURCES["premium"]):
        source_score = min(25, source_score + 10)  # +10 points for premium sources
    
    # 3. Content quality scoring
    title_length = len(article.get("title", ""))
    text_length = len(article.get("content", ""))
    
    title_score = min(5, title_length / 20)  # 5 points max for title
    text_score = min(10, text_length / 300)  # 10 points max for content
    
    # 4. Enhanced impact scoring
    impact = article.get("impact", "neutral")
    
    if category == "crypto_news":
        # Reduced scoring for crypto to limit noise
        if impact == "negative":
            impact_score = 6
        elif impact == "positive":
            impact_score = 4
        else:
            impact_score = 2
    else:
        if impact == "negative":
            impact_score = 12  # Negative news often more impactful
        elif impact == "positive":
            impact_score = 8
        else:
            impact_score = 5
    
    # Calculate total score
    total_score = high_keyword_score + medium_keyword_score + source_score + title_score + text_score + impact_score
    
    # Normalize between 0 and 100
    normalized_score = min(100, total_score)
    
    # Apply category-specific adjustments for investor focus
    if category == "crypto_news":
        normalized_score = normalized_score * 0.8  # 20% penalty for crypto noise
    elif category == "general_news" and any(kw in content for kw in ["cpi", "pce", "payrolls", "gdp"]):
        normalized_score = normalized_score * 1.2  # 20% boost for key macro indicators
    elif category == "stock_news" and any(kw in content for kw in ["earnings", "eps", "guidance"]):
        normalized_score = normalized_score * 1.1  # 10% boost for fundamentals
    
    return min(100, normalized_score)

def calculate_output_limits(articles_by_country, max_total=150):
    """
    Enhanced output limits calculation using geo_budgets v2.3 with MSCI weights
    """
    geo_config = CONFIG["geo_budgets"]
    base_allocations = geo_config["base"]
    weights = geo_config["weights"]
    
    # Count articles by country
    country_counts = {country: len(articles) for country, articles in articles_by_country.items()}
    
    # Initialize with base allocations
    adjusted_limits = {}
    total_base_used = 0
    
    # Step 1: Allocate base minimums
    for country in base_allocations:
        if country in country_counts:
            base_min = min(country_counts[country], base_allocations[country])
            adjusted_limits[country] = base_min
            total_base_used += base_min
            logger.info(f"Base allocation for {country}: {base_min} articles")
    
    # Step 2: Calculate remaining quota for proportional distribution
    remaining_quota = max_total - total_base_used
    logger.info(f"Remaining quota after base allocations: {remaining_quota}")
    
    if remaining_quota > 0:
        # Step 3: Calculate total weight for countries with available articles
        total_weight = sum(weights.get(country, 0) for country in adjusted_limits.keys())
        
        if total_weight > 0:
            # Step 4: Distribute remaining quota proportionally
            for country in adjusted_limits.keys():
                country_weight = weights.get(country, 0)
                if country_weight > 0:
                    proportional_share = int(remaining_quota * (country_weight / total_weight))
                    additional_articles = min(
                        proportional_share,
                        country_counts[country] - adjusted_limits[country]
                    )
                    adjusted_limits[country] += additional_articles
                    logger.info(f"Additional allocation for {country}: +{additional_articles} (weight: {country_weight}%)")
    
    # Step 5: Handle unmapped countries
    for country, articles in articles_by_country.items():
        if country not in adjusted_limits:
            # Map to closest region or set minimal allocation
            if country in ["uk", "germany"]:
                target = "europe_other"
            elif country in ["china", "japan"]:
                target = "asia"
            else:
                target = "global"
            
            # Add small allocation if we have space
            if sum(adjusted_limits.values()) < max_total:
                adjusted_limits[country] = min(3, len(articles))
                logger.info(f"Minimal allocation for unmapped country {country}: {adjusted_limits[country]} articles")
    
    logger.info(f"Final distribution: {adjusted_limits}")
    return adjusted_limits

def apply_topic_caps(formatted_data):
    """
    Apply sophisticated topic caps with fixed/relative/overflow logic
    """
    topic_config = CONFIG["topic_caps"]
    fixed_caps = topic_config["fixed"]
    relative_pct = topic_config["relative_pct"]
    overflow_config = topic_config["overflow"]
    
    # Calculate total articles
    total_articles = sum(len(articles) for articles in formatted_data.values() if isinstance(articles, list))
    
    # Count articles by topic
    topic_counts = {}
    topic_articles = {}  # Store (country, article) pairs for each topic
    
    for country, articles in formatted_data.items():
        if isinstance(articles, list):
            for article in articles:
                # Check if article matches topics
                for topic in fixed_caps.keys():
                    matches_topic = False
                    
                    # Check category match
                    if article.get("category") == topic:
                        matches_topic = True
                    
                    # Check themes match
                    if not matches_topic:
                        themes = article.get("themes", {})
                        for axis_themes in themes.values():
                            if topic in axis_themes:
                                matches_topic = True
                                break
                    
                    # Check content keywords for special cases
                    if not matches_topic and topic == "meme_stocks":
                        content = f"{article.get('title', '')} {article.get('content', '')}".lower()
                        meme_keywords = ["gamestop", "amc", "reddit", "wsb", "wallstreetbets", "meme stock"]
                        if any(kw in content for kw in meme_keywords):
                            matches_topic = True
                    
                    if matches_topic:
                        if topic not in topic_counts:
                            topic_counts[topic] = 0
                            topic_articles[topic] = []
                        
                        topic_counts[topic] += 1
                        topic_articles[topic].append((country, article))
    
    # Apply caps for each topic
    for topic, count in topic_counts.items():
        if topic in fixed_caps:
            # Calculate effective cap
            fixed_cap = fixed_caps[topic]
            relative_cap = int(total_articles * relative_pct)
            effective_cap = min(fixed_cap, relative_cap)
            
            # TODO: Implement overflow logic here if needed (48h grace period)
            # For now, use just the effective cap
            
            if count > effective_cap:
                # Sort by importance score and keep only the best
                articles_to_sort = topic_articles[topic]
                articles_to_sort.sort(key=lambda x: x[1].get("importance_score", 0), reverse=True)
                
                # Keep only the top articles
                articles_to_keep = articles_to_sort[:effective_cap]
                articles_to_remove = articles_to_sort[effective_cap:]
                
                # Remove excess articles
                for country, article in articles_to_remove:
                    if country in formatted_data and isinstance(formatted_data[country], list):
                        if article in formatted_data[country]:
                            formatted_data[country].remove(article)
                
                logger.info(f"Applied topic cap for '{topic}': kept {effective_cap}/{count} articles (removed {len(articles_to_remove)})")
    
    return formatted_data

def extract_top_themes(news_data, days=30, max_examples=3, exclude_themes=None):
    """
    Enhanced theme analysis with fundamentals axis
    """
    cutoff_date = datetime.now() - timedelta(days=days)
    
    # Include fundamentals axis in theme counters
    themes_counter = {
        "macroeconomics": Counter(),
        "sectors": Counter(),
        "regions": Counter(),
        "fundamentals": Counter()  # New axis
    }
    
    themes_details = {
        "macroeconomics": {},
        "sectors": {},
        "regions": {},
        "fundamentals": {}  # New axis
    }
    
    theme_articles = {
        "macroeconomics": {},
        "sectors": {},
        "regions": {},
        "fundamentals": {}  # New axis
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
                    article_date = datetime.strptime(article["rawDate"].split(" ")[0], "%Y-%m-%d")
                else:
                    article_date = datetime.strptime(article["date"], "%d/%m/%Y")
                
                if article_date < cutoff_date:
                    continue
                
                processed_articles += 1
                
                themes = article.get("themes", {})
                for axis, subthemes in themes.items():
                    if axis not in themes_counter:
                        continue  # Skip unknown axes
                        
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
                        
                        # Add titles associated with the theme
                        title = article.get("title", "")
                        if title and title not in themes_details[axis][theme]["articles"]:
                            themes_details[axis][theme]["articles"].append(title)
                        
                        # Analyze specific keywords
                        text = (article.get("content", "") or article.get("text", "") + " " + title).lower()
                        
                        # Get list of keywords for this theme
                        if axis in THEMES and theme in THEMES[axis]:
                            keywords = THEMES[axis][theme]
                            for keyword in keywords:
                                if keyword.lower() in text:
                                    if keyword not in themes_details[axis][theme]["keywords"]:
                                        themes_details[axis][theme]["keywords"][keyword] = {
                                            "count": 0,
                                            "examples": []
                                        }
                                    themes_details[axis][theme]["keywords"][keyword]["count"] += 1
                                    if (len(themes_details[axis][theme]["keywords"][keyword]["examples"]) < max_examples and
                                        title not in themes_details[axis][theme]["keywords"][keyword]["examples"]):
                                        themes_details[axis][theme]["keywords"][keyword]["examples"].append(title)
                
            except Exception as e:
                logger.warning(f"Article ignored for invalid date: {article.get('title')} | Error: {str(e)}")
                continue
    
    logger.info(f"Enhanced theme analysis: {processed_articles}/{total_articles} articles used for the {days} day period")
    
    # Add sentiment stats to details
    for axis, theme_dict in theme_articles.items():
        for theme, articles in theme_dict.items():
            sentiment_stats = compute_sentiment_distribution(articles)
            if theme in themes_details[axis]:
                themes_details[axis][theme]["sentiment_distribution"] = sentiment_stats
    
    # Get main themes for each axis with their details
    top_themes_with_details = {}
    for axis in themes_counter:
        top_themes = themes_counter[axis].most_common(15)
        
        # Filter excluded themes
        if exclude_themes and axis in exclude_themes:
            top_themes = [(theme, count) for theme, count in top_themes 
                         if theme not in exclude_themes[axis]]
        
        top_themes_with_details[axis] = {}
        for theme, count in top_themes:
            top_themes_with_details[axis][theme] = themes_details[axis].get(theme, {"count": count, "articles": []})
    
    return top_themes_with_details

def build_theme_summary(theme_name, theme_data):
    """Generates investor-focused theme summary"""
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
            sentiment_info = f" Market sentiment is predominantly positive ({pos}% vs {neg}% negative)."
        elif neg > pos + 20:
            sentiment_info = f" Market sentiment shows concern ({neg}% vs {pos}% positive)."
        else:
            sentiment_info = f" Market sentiment is mixed ({pos}% positive, {neg}% negative)."

    return (
        f"📊 **{theme_name}** emerged in **{count} articles** "
        f"with key focus areas: {keywords_str}."
        f"{sentiment_info} "
        f"Notable coverage: « {articles[0]} »"
        + (f", « {articles[1]} »" if len(articles) > 1 else "")
        + (f", « {articles[2]} »" if len(articles) > 2 else "") + "."
    )

def process_news_data(news_sources):
    """Enhanced news processing with investor-grade filtering v2.3"""
    # Initialize structure for all possible countries/regions using geo_budgets
    formatted_data = {
        "lastUpdated": datetime.now().isoformat()
    }
    
    # Initialize all countries from geo_budgets
    for country in CONFIG["geo_budgets"]["weights"].keys():
        formatted_data[country] = []
    
    # Add global if not present
    if "global" not in formatted_data:
        formatted_data["global"] = []
    
    # List of all articles before country separation
    all_articles = []
    
    # Process each news source
    for source_type, articles in news_sources.items():
        for article in articles:
            # Normalize article
            normalized = normalize_article(article, source_type)
            
            # Enhanced quality filters
            if len(normalized["title"]) < 15:  # Stricter title length
                continue
                
            if len(normalized["text"]) < 100:  # Stricter content length
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
                "rawDate": normalized["publishedDate"],
                "date": format_date(normalized["publishedDate"]),
                "time": format_time(normalized["publishedDate"]),
                "category": category,
                "impact": impact,
                "country": country,
                "url": normalized.get("url", ""),
                "themes": extract_themes(normalized),
                "source_type": source_type
            }
            
            # Calculate enhanced importance score
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
    
    # Calculate appropriate limits for each country using new geo_budgets
    adjusted_limits = calculate_output_limits(articles_by_country, CONFIG["geo_budgets"]["max_total"])
    
    # Apply limits by country
    for country, articles in articles_by_country.items():
        limit = adjusted_limits.get(country, 3)  # Default to 3 if not in limits
        if country in formatted_data:
            formatted_data[country] = articles[:limit]
        else:
            # Add to global or closest region
            formatted_data["global"].extend(articles[:limit])
            logger.info(f"Country {country} mapped to global, {len(articles[:limit])} articles added")
    
    # Apply sophisticated topic caps
    formatted_data = apply_topic_caps(formatted_data)
    
    # Statistics
    total_articles = sum(len(articles) for articles in formatted_data.values() if isinstance(articles, list))
    logger.info(f"✅ Enhanced processing v2.3 complete: {total_articles} investor-grade articles")
    
    # Log distribution by region
    for country, articles in formatted_data.items():
        if isinstance(articles, list) and articles:
            logger.info(f"  📍 {country}: {len(articles)} articles")
    
    return formatted_data

def update_news_json_file(news_data):
    """Updates news.json file with formatted data"""
    try:
        output_data = {k: v for k, v in news_data.items()}
        
        os.makedirs(os.path.dirname(NEWS_JSON_PATH), exist_ok=True)
        
        with open(NEWS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"✅ news.json file successfully updated with investor-grade data v2.3")
        return True
    except Exception as e:
        logger.error(f"❌ Error updating file: {str(e)}")
        return False

def generate_themes_json(news_data):
    """Generates enhanced themes JSON with fundamentals axis"""
    
    periods = {
        "weekly": 7,
        "monthly": 30,
        "quarterly": 90
    }
    
    # Extract dominant themes for each period
    themes_data = {}
    for period, days in periods.items():
        # Exclude crypto from dominant themes but include fundamentals
        exclude_themes = {"sectors": ["crypto"]}
        themes_data[period] = extract_top_themes(news_data, days=days, exclude_themes=exclude_themes)
    
    # Add enhanced summaries
    for period, axes in themes_data.items():
        for axis, themes in axes.items():
            for theme_name, theme_data in themes.items():
                summary = build_theme_summary(theme_name, theme_data)
                themes_data[period][axis][theme_name]["investor_summary"] = summary
    
    # Add metadata
    themes_output = {
        "themes": themes_data,
        "lastUpdated": datetime.now().isoformat(),
        "analysisCount": sum(len(articles) for articles in news_data.values() if isinstance(articles, list)),
        "config_version": "investor-grade-v2.3"
    }
    
    os.makedirs(os.path.dirname(THEMES_JSON_PATH), exist_ok=True)
    
    try:
        with open(THEMES_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(themes_output, f, ensure_ascii=False, indent=2)
        logger.info(f"✅ Enhanced themes.json with fundamentals axis updated (v2.3)")
        return True
    except Exception as e:
        logger.error(f"❌ Error updating themes.json file: {str(e)}")
        return False

def main():
    """Enhanced main execution with investor-grade logging v2.3"""
    try:
        logger.info("🚀 Starting investor-grade news collection v2.3...")
        
        # Read existing data for fallback
        existing_data = read_existing_news()
        
        # Fetch different news sources with enhanced limits
        logger.info("📊 Fetching news sources with MSCI-weighted geo limits...")
        general_news = get_general_news()
        fmp_articles = get_fmp_articles()
        stock_news = get_stock_news()
        crypto_news = get_crypto_news()
        press_releases = get_press_releases()
        forex_news = get_forex_news()
        
        # Organize news sources
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
        logger.info(f"📈 Total news collected: {total_news} articles")
        
        # Log collection breakdown
        for source, articles in news_sources.items():
            logger.info(f"  {source}: {len(articles)} articles")
        
        # Check if we have data
        if total_news == 0:
            logger.warning("⚠️ No news retrieved, using existing data")
            if existing_data:
                return True
        
        # Process with enhanced investor-grade system v2.3
        logger.info("🔍 Processing with enhanced MSCI-weighted distribution...")
        news_data = process_news_data(news_sources)
        
        # Update files
        success_news = update_news_json_file(news_data)
        success_themes = generate_themes_json(news_data)
        
        # Enhanced theme analysis logging
        top_themes = extract_top_themes(news_data, days=30)
        logger.info("🎯 Investor-grade dominant themes (30 days):")
        for axis, themes in top_themes.items():
            logger.info(f"  📊 {axis.upper()}:")
            for theme, details in list(themes.items())[:5]:  # Top 5 only
                logger.info(f"    • {theme}: {details['count']} articles")
                if "sentiment_distribution" in details:
                    sentiment = details["sentiment_distribution"]
                    logger.info(f"      Sentiment: {sentiment['positive']}%↑ {sentiment['negative']}%↓")
        
        logger.info("✅ Investor-grade news update v2.3 completed successfully")
        return success_news and success_themes
        
    except Exception as e:
        logger.error(f"❌ Error in investor-grade execution v2.3: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = main()
    if not success:
        exit(1)
