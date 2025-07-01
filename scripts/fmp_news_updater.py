#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse News Updater - Enhanced Version
Script for extracting news and events from Financial Modeling Prep
- General News API: For general economic news
- Stock News API: For stocks and ETFs
- Crypto News API: For cryptocurrencies
- Press Releases API: For company press releases
- FMP Articles API: For articles written by FMP
- IPOs Calendar: For upcoming IPOs
- Mergers & Acquisitions: For M&A operations
"""

import os
import json
import requests
import logging
import hashlib
import argparse
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import List, Dict, Literal, Optional, Any
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

# Retry logic
try:
    from tenacity import retry, wait_random_exponential, stop_after_attempt
    HAS_TENACITY = True
except ImportError:
    HAS_TENACITY = False
    def retry(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

# Type definitions
Impact = Literal["positive", "neutral", "negative"]
Category = Literal["economy", "markets", "companies", "crypto", "tech"]

@dataclass
class NewsItem:
    """Structured news item with type safety"""
    id: str
    title: str
    content: str
    source: str
    raw_date: str
    date: str
    time: str
    category: Category
    impact: Impact
    country: str
    url: str
    importance_score: float
    themes: Dict[str, List[str]]
    source_type: str

# Environment-based configuration
LOG_LEVEL = os.getenv("TP_LOG_LEVEL", "INFO").upper()
MAX_TOTAL = int(os.getenv("TP_MAX_TOTAL", "150"))
DAYS_BACK = int(os.getenv("TP_DAYS_BACK", "30"))
DAYS_AHEAD = int(os.getenv("TP_DAYS_AHEAD", "7"))
MAX_WORKERS = int(os.getenv("TP_MAX_WORKERS", "3"))

# Logger configuration
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# HTTP Session for connection reuse
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "TradePulseBot/1.0",
    "Accept": "application/json",
    "Connection": "keep-alive"
})

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
        "earnings_calendar": "https://financialmodelingprep.com/api/v3/earning_calendar",
        "economic_calendar": "https://financialmodelingprep.com/api/v3/economic_calendar",
        "ipos_calendar": "https://financialmodelingprep.com/stable/ipos-calendar",
        "mergers_acquisitions": "https://financialmodelingprep.com/stable/mergers-acquisitions-latest"
    },
    "news_limits": {
        "general_news": 20,
        "fmp_articles": 15,
        "stock_news": 50,
        "crypto_news": 20,
        "press_releases": 10
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
    "category_limits": {
        "crypto": 8
    },
    "max_total_articles": MAX_TOTAL,
    "days_ahead": DAYS_AHEAD,
    "days_back": DAYS_BACK
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

# Important sources by category
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
    ]
}

# Premium sources that get extra points
PREMIUM_SOURCES = ["bloomberg", "financial times", "wall street journal", "reuters"]

# High importance keywords by category
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
    ]
}

def make_uid(title: str, source: str, raw_date: str) -> str:
    """Generate unique identifier for deduplication"""
    return hashlib.sha256(f"{title}{source}{raw_date}".encode()).hexdigest()[:16]

def read_existing_news() -> Optional[Dict]:
    """Reads existing JSON file as fallback"""
    try:
        with open(NEWS_JSON_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

@retry(wait=wait_random_exponential(multiplier=1, max=30), stop=stop_after_attempt(5)) if HAS_TENACITY else lambda f: f
def fetch_api_data(endpoint: str, params: Optional[Dict] = None) -> List[Dict]:
    """Generic function to fetch data from FMP API with retry logic"""
    if not CONFIG["api_key"]:
        logger.error("FMP API key not defined. Please set FMP_API_KEY in environment variables.")
        return []
        
    if params is None:
        params = {}
    
    params["apikey"] = CONFIG["api_key"]
    
    try:
        logger.debug(f"Fetching data from {endpoint} with params {params}")
        response = SESSION.get(endpoint, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        logger.info(f"✅ {len(data) if isinstance(data, list) else 1} items retrieved from {endpoint}")
        return data if isinstance(data, list) else [data] if data else []
    except Exception as e:
        logger.error(f"❌ Error fetching from {endpoint}: {str(e)}")
        return []

def fetch_articles_by_period(endpoint: str, start_date: str, end_date: str, 
                           source_type: Optional[str] = None, days_interval: int = 7, 
                           max_pages: int = 5) -> List[Dict]:
    """Fetches articles over a given period by splitting into intervals"""
    logger.info(f"Starting extraction from {start_date} to {end_date} in {days_interval} day chunks")
    
    per_page = CONFIG["news_limits"].get(source_type, 50) if source_type else 50
    
    from_date = datetime.strptime(start_date, "%Y-%m-%d")
    to_date = datetime.strptime(end_date, "%Y-%m-%d")
    all_articles = []
    
    current_from = from_date
    while current_from < to_date:
        current_to = min(current_from + timedelta(days=days_interval), to_date)
        
        logger.debug(f"Processing period {current_from.strftime('%Y-%m-%d')} → {current_to.strftime('%Y-%m-%d')}")
        
        for page in range(max_pages):
            params = {
                "from": current_from.strftime("%Y-%m-%d"),
                "to": current_to.strftime("%Y-%m-%d"),
                "page": page,
                "limit": per_page
            }
            
            articles = fetch_api_data(endpoint, params)
            
            if not articles:
                break
                
            logger.debug(f"  Page {page+1}: {len(articles)} articles retrieved")
            all_articles.extend(articles)
            
            if len(articles) < per_page:
                break
                
        current_from = current_to
    
    logger.info(f"Total articles retrieved for the period: {len(all_articles)}")
    return all_articles

def get_general_news() -> List[Dict]:
    """Fetches general economic news"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["general_news"], start_date, end_date, "general_news")

def get_fmp_articles() -> List[Dict]:
    """Fetches articles written by FMP"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["fmp_articles"], start_date, end_date, "fmp_articles")

def get_stock_news() -> List[Dict]:
    """Fetches stock news"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["stock_news"], start_date, end_date, "stock_news")

def get_crypto_news() -> List[Dict]:
    """Fetches cryptocurrency news"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["crypto_news"], start_date, end_date, "crypto_news")

def get_press_releases() -> List[Dict]:
    """Fetches press releases"""
    today = datetime.today()
    start_date = (today - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    return fetch_articles_by_period(CONFIG["endpoints"]["press_releases"], start_date, end_date, "press_releases")

def get_earnings_calendar() -> List[Dict]:
    """Fetches earnings calendar"""
    today = datetime.now().strftime("%Y-%m-%d")
    future = (datetime.now() + timedelta(days=CONFIG["days_ahead"])).strftime("%Y-%m-%d")
    
    params = {
        "from": today,
        "to": future
    }
    return fetch_api_data(CONFIG["endpoints"]["earnings_calendar"], params)

def get_economic_calendar() -> List[Dict]:
    """Fetches economic calendar"""
    today = datetime.now().strftime("%Y-%m-%d")
    future = (datetime.now() + timedelta(days=CONFIG["days_ahead"])).strftime("%Y-%m-%d")
    
    params = {
        "from": today,
        "to": future
    }
    return fetch_api_data(CONFIG["endpoints"]["economic_calendar"], params)

def get_ipos_calendar() -> List[Dict]:
    """Fetches upcoming IPOs"""
    today = datetime.now().strftime("%Y-%m-%d")
    future = (datetime.now() + timedelta(days=CONFIG["days_ahead"])).strftime("%Y-%m-%d")

    params = {
        "from": today,
        "to": future
    }

    return fetch_api_data(CONFIG["endpoints"]["ipos_calendar"], params)

def get_mergers_acquisitions(limit: int = 100) -> List[Dict]:
    """Fetches latest M&A operations"""
    params = {
        "page": 0,
        "limit": limit
    }
    return fetch_api_data(CONFIG["endpoints"]["mergers_acquisitions"], params)

def extract_themes(article: Dict) -> Dict[str, List[str]]:
    """Identifies dominant themes from title content"""
    text = article.get("title", "").lower()
    themes_detected = {"macroeconomics": [], "sectors": [], "regions": []}
    
    for axis, groups in THEMES_DOMINANTS.items():
        for theme, keywords in groups.items():
            if any(kw in text for kw in keywords):
                themes_detected[axis].append(theme)

    return themes_detected

def compute_sentiment_distribution(articles: List[Dict]) -> Dict[str, float]:
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

def determine_category(article: Dict, source: Optional[str] = None) -> Category:
    """Determines the news category"""
    # Check symbol for crypto
    if article.get("symbol") and any(ticker in str(article.get("symbol")) for ticker in ["BTC", "ETH", "CRYPTO", "COIN"]):
        return "crypto"
        
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    # Crypto category (priority 1)
    crypto_keywords = THEMES_DOMINANTS["sectors"]["crypto"]
    if any(word in text for word in crypto_keywords):
        return "crypto"
    
    # Tech category (priority 2)
    tech_keywords = [
        "ai", "artificial intelligence", "machine learning", "data science", 
        "software", "hardware", "tech", "technology", "startup", "app", 
        "mobile", "cloud", "computing", "digital", "internet", "online", "web"
    ]
    if any(word in text for word in tech_keywords):
        return "tech"
    
    # Economy category (priority 3)
    economy_keywords = [
        "economy", "inflation", "gdp", "fed", "central bank",
        "interest rate", "economic", "unemployment",
        "consumer", "spending", "policy", "fiscal", "monetary", "recession"
    ]
    if any(word in text for word in economy_keywords):
        return "economy"
    
    # Markets category (priority 4)
    markets_keywords = [
        "etf", "fund", "index", "s&p", "dow", "cac", "nasdaq", 
        "bond", "treasury", "yield", "commodities", "oil", 
        "gold", "market", "stock market", "bull market", 
        "bear market", "rally", "correction", "volatility", "vix"
    ]
    if any(word in text for word in markets_keywords):
        return "markets"
    
    return "companies"

def determine_country(article: Dict) -> str:
    """Determines the country/region of the news"""
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
    
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    country_keywords = {
        "france": ["france", "french", "paris", "cac", "paris stock exchange", "euronext", "amf"],
        "uk": ["uk", "united kingdom", "britain", "british", "london", "ftse", "bank of england", "pound sterling", "gbp"],
        "germany": ["germany", "berlin", "frankfurt", "dax", "deutsche", "euro", "ecb", "bundesbank", "german"],
        "china": ["china", "chinese", "beijing", "shanghai", "hong kong", "shenzhen", "yuan", "renminbi", "pboc"],
        "japan": ["japan", "japanese", "tokyo", "nikkei", "yen", "bank of japan", "boj"],
        "emerging_markets": ["emerging markets", "brics", "brazil", "russia", "india", "south africa", "indonesia", "turkey", "mexico"],
        "global": ["global", "world", "international", "worldwide", "global economy", "global markets"]
    }
    
    for country, keywords in country_keywords.items():
        if any(keyword in text for keyword in keywords):
            return country
    
    return "us"

def determine_impact(article: Dict) -> Impact:
    """Determines the impact of news (positive/negative/neutral)"""
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

def format_date(date_str: str) -> str:
    """Formats a date in YYYY-MM-DD format to DD/MM/YYYY"""
    try:
        date_parts = date_str.split(" ")[0].split("-")
        if len(date_parts) == 3:
            return f"{date_parts[2]}/{date_parts[1]}/{date_parts[0]}"
        return date_str.replace("-", "/")
    except:
        return date_str.replace("-", "/")

def format_time(date_str: str) -> str:
    """Extracts time in HH:MM format from a complete date"""
    try:
        time_parts = date_str.split(" ")[1].split(":")
        if len(time_parts) >= 2:
            return f"{time_parts[0]}:{time_parts[1]}"
        return "00:00"
    except:
        return "00:00"

def normalize_article(article: Dict, source: Optional[str] = None) -> Dict:
    """Normalizes different FMP article formats into a standard format"""
    title = article.get("title", "")
    
    if "date" in article and "content" in article and "tickers" in article:
        text = article.get("content", "")
        date = article.get("date", "")
        symbol = article.get("tickers", "")
        site = article.get("site", "Financial Modeling Prep")
        url = article.get("link", "")
    else:
        text = article.get("text", "")
        date = article.get("publishedDate", "")
        symbol = article.get("symbol", "")
        site = article.get("site", article.get("publisher", ""))
        url = article.get("url", "")
    
    return {
        "title": title,
        "text": text,
        "publishedDate": date,
        "symbol": symbol,
        "site": site,
        "url": url,
        "source_type": source
    }

def remove_duplicates_by_id(news_list: List[Dict]) -> List[Dict]:
    """Removes duplicate articles based on unique ID"""
    seen_ids = set()
    unique_news = []
    
    for item in news_list:
        item_id = item.get("id")
        if item_id and item_id not in seen_ids:
            seen_ids.add(item_id)
            unique_news.append(item)
    
    return unique_news

def compute_importance_score(article: Dict, category: str) -> float:
    """Calculates an importance score for an article"""
    content = f"{article.get('title', '')} {article.get('content', '')}".lower()
    article_source = article.get("source", "").lower()
    
    # High importance keywords
    high_keywords = HIGH_IMPORTANCE_KEYWORDS.get(category, [])
    matched_high_keywords = set()
    for keyword in high_keywords:
        if keyword in content:
            matched_high_keywords.add(keyword)
    
    # Category-specific scoring
    if category == "crypto_news":
        high_keyword_score = min(20, len(matched_high_keywords) * 2)
    elif category == "general_news":
        high_keyword_score = min(40, len(matched_high_keywords) * 5)
    elif category == "stock_news":
        high_keyword_score = min(35, len(matched_high_keywords) * 4.5)
    else:
        high_keyword_score = min(30, len(matched_high_keywords) * 4)
    
    # Medium importance keywords
    medium_keywords = MEDIUM_IMPORTANCE_KEYWORDS.get(category, [])
    matched_medium_keywords = set()
    for keyword in medium_keywords:
        if keyword in content:
            matched_medium_keywords.add(keyword)
    
    if category == "crypto_news":
        medium_keyword_score = min(10, len(matched_medium_keywords) * 1.5)
    else:
        medium_keyword_score = min(20, len(matched_medium_keywords) * 2.5)
    
    # Source score
    source_score = 0
    for important_source in IMPORTANT_SOURCES.get(category, []):
        if important_source.lower() in article_source:
            source_score = 15 if category == "crypto_news" else 20
            break
    
    if any(premium in article_source for premium in PREMIUM_SOURCES):
        source_score = min(25, source_score + 5)
    
    # Content length scores
    title_length = len(article.get("title", ""))
    text_length = len(article.get("content", ""))
    
    title_score = min(3, title_length / 33)
    text_score = min(7, text_length / 360)
    
    # Impact score
    impact = article.get("impact", "neutral")
    if category == "crypto_news":
        impact_score = {"negative": 5, "positive": 4, "neutral": 3}[impact]
    else:
        impact_score = {"negative": 10, "positive": 7, "neutral": 5}[impact]
    
    total_score = high_keyword_score + medium_keyword_score + source_score + title_score + text_score + impact_score
    normalized_score = min(100, total_score)
    
    if category == "crypto_news":
        normalized_score *= 0.9
    
    return normalized_score

def calculate_output_limits(articles_by_country: Dict, max_total: int = 150) -> Dict[str, int]:
    """Calculates output limits for each country/region"""
    base_limits = CONFIG["output_limits"]
    country_counts = {country: len(articles) for country, articles in articles_by_country.items()}
    
    adjusted_limits = {}
    remaining_quota = max_total
    
    for country, count in country_counts.items():
        if country not in base_limits:
            if "global" not in country_counts:
                country_counts["global"] = 0
            country_counts["global"] += count
            continue
            
        min_limit = min(count, max(5, base_limits.get(country, 10) // 2))
        adjusted_limits[country] = min_limit
        remaining_quota -= min_limit
    
    if "global" not in adjusted_limits and "global" in base_limits:
        adjusted_limits["global"] = 0
    
    if remaining_quota > 0:
        total_base = sum(base_limits.get(country, 10) for country in adjusted_limits.keys())
        
        for country in list(adjusted_limits.keys()):
            if total_base > 0:
                country_ratio = base_limits.get(country, 10) / total_base
                additional = int(remaining_quota * country_ratio)
                adjusted_limits[country] += additional
                remaining_quota -= additional
        
        if "global" in adjusted_limits:
            adjusted_limits["global"] += remaining_quota
        elif adjusted_limits:
            first_country = next(iter(adjusted_limits))
            adjusted_limits[first_country] += remaining_quota
    
    return adjusted_limits

def determine_event_impact(event: Dict) -> str:
    """Determines the impact level of an economic event"""
    high_impact_events = [
        "Interest Rate Decision", "Fed Interest Rate", "ECB Interest Rate", 
        "Inflation Rate", "GDP Growth", "GDP Release", "Employment Change",
        "Unemployment Rate", "Non-Farm Payrolls", "CPI", "Retail Sales",
        "FOMC", "FED", "BCE", "ECB", "Fed Chair", "Treasury", "Central Bank"
    ]
    
    medium_impact_events = [
        "PMI", "Consumer Confidence", "Trade Balance", "Industrial Production",
        "Manufacturing Production", "Housing Starts", "Building Permits",
        "Durable Goods Orders", "Factory Orders", "Earnings Report", "Balance Sheet"
    ]
    
    event_name = event.get("event", "").lower()
    
    if any(keyword.lower() in event_name for keyword in high_impact_events):
        return "high"
    
    if any(keyword.lower() in event_name for keyword in medium_impact_events):
        return "medium"
    
    if event.get("impact") == "High":
        return "high"
    elif event.get("impact") == "Medium":
        return "medium"
    
    return "low"

def calculate_event_score(event: Dict) -> int:
    """Calculates a score to prioritize economic events"""
    score = 0
    
    impact = determine_event_impact(event)
    if impact == "high":
        score += 10
    elif impact == "medium":
        score += 5
    else:
        score += 1
    
    if event.get("country") in ["US", "United States"]:
        score += 3
    
    if event.get("actual") and event.get("forecast"):
        try:
            actual = float(event.get("actual").replace("%", ""))
            forecast = float(event.get("forecast").replace("%", ""))
            diff = abs(actual - forecast)
            
            if diff > 5:
                score += 5
            elif diff > 2:
                score += 3
            elif diff > 0.5:
                score += 1
        except (ValueError, AttributeError):
            pass
    
    if event.get("type") == "earnings":
        title = event.get("title", "")
        major_companies = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "PYPL", "DIS"]
        if any(company in title for company in major_companies):
            score += 3
    
    return score

def extract_top_themes(news_data: Dict, days: int = 30, max_examples: int = 3, 
                      exclude_themes: Optional[Dict] = None) -> Dict:
    """Analyzes dominant themes over a given period"""
    cutoff_date = datetime.now() - timedelta(days=days)
    
    themes_counter = {
        "macroeconomics": Counter(),
        "sectors": Counter(),
        "regions": Counter()
    }
    
    themes_details = {
        "macroeconomics": {},
        "sectors": {},
        "regions": {}
    }
    
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
                    for theme in subthemes:
                        if theme not in theme_articles[axis]:
                            theme_articles[axis][theme] = []
                        theme_articles[axis][theme].append(article)
                        
                        themes_counter[axis][theme] += 1
                        
                        if theme not in themes_details[axis]:
                            themes_details[axis][theme] = {
                                "count": 0,
                                "articles": [],
                                "keywords": {}
                            }
                        
                        themes_details[axis][theme]["count"] += 1
                        
                        title = article.get("title", "")
                        if title and title not in themes_details[axis][theme]["articles"]:
                            themes_details[axis][theme]["articles"].append(title)
                        
                        text = (article.get("content", "") or article.get("text", "") + " " + title).lower()
                        
                        if axis in THEMES_DOMINANTS and theme in THEMES_DOMINANTS[axis]:
                            keywords = THEMES_DOMINANTS[axis][theme]
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
    
    logger.info(f"Theme analysis: {processed_articles}/{total_articles} articles used for the {days} day period")
    
    for axis, theme_dict in theme_articles.items():
        for theme, articles in theme_dict.items():
            sentiment_stats = compute_sentiment_distribution(articles)
            if theme in themes_details[axis]:
                themes_details[axis][theme]["sentiment_distribution"] = sentiment_stats
    
    top_themes_with_details = {}
    for axis in themes_counter:
        top_themes = themes_counter[axis].most_common(15)
        
        if exclude_themes and axis in exclude_themes:
            top_themes = [(theme, count) for theme, count in top_themes 
                         if theme not in exclude_themes[axis]]
        
        top_themes_with_details[axis] = {}
        for theme, count in top_themes:
            top_themes_with_details[axis][theme] = themes_details[axis].get(theme, {"count": count, "articles": []})
    
    return top_themes_with_details

def build_theme_summary(theme_name: str, theme_data: Dict) -> str:
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

def fetch_all_news_sources() -> Dict[str, List[Dict]]:
    """Fetch all news sources concurrently"""
    endpoint_funcs = {
        "general_news": get_general_news,
        "fmp_articles": get_fmp_articles,
        "stock_news": get_stock_news,
        "crypto_news": get_crypto_news,
        "press_releases": get_press_releases
    }
    
    results = {}
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_name = {executor.submit(func): name for name, func in endpoint_funcs.items()}
        
        for future in as_completed(future_to_name):
            name = future_to_name[future]
            try:
                results[name] = future.result()
                logger.info(f"✅ {name}: {len(results[name])} articles fetched")
            except Exception as e:
                logger.error(f"❌ {name} failed: {str(e)}")
                results[name] = []
    
    return results

def process_news_data(news_sources: Dict[str, List[Dict]]) -> Dict:
    """Processes and formats FMP news to match TradePulse format"""
    formatted_data = {
        "lastUpdated": datetime.now().isoformat()
    }
    
    for country in CONFIG["output_limits"].keys():
        formatted_data[country] = []
    
    all_articles = []
    
    for source_type, articles in news_sources.items():
        for article in articles:
            normalized = normalize_article(article, source_type)
            
            if len(normalized["title"]) < 10 or len(normalized["text"]) < 50:
                continue
            
            category = determine_category(normalized, source_type)
            country = determine_country(normalized)
            impact = determine_impact(normalized)
            
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
            
            # Generate unique ID for deduplication
            news_item["id"] = make_uid(news_item["title"], news_item["source"], news_item["rawDate"])
            
            news_item["importance_score"] = compute_importance_score(news_item, source_type)
            
            all_articles.append(news_item)
    
    # Remove duplicates by ID
    all_articles = remove_duplicates_by_id(all_articles)
    
    # Sort by importance score
    all_articles.sort(key=lambda x: x["importance_score"], reverse=True)
    
    # Distribute by country
    articles_by_country = {}
    for article in all_articles:
        country = article["country"]
        if country not in articles_by_country:
            articles_by_country[country] = []
        articles_by_country[country].append(article)
    
    # Calculate appropriate limits
    adjusted_limits = calculate_output_limits(articles_by_country, CONFIG["max_total_articles"])
    
    # Apply limits by country
    for country, articles in articles_by_country.items():
        limit = adjusted_limits.get(country, 10)
        if country in formatted_data:
            formatted_data[country] = articles[:limit]
        else:
            if "global" not in formatted_data:
                formatted_data["global"] = []
            formatted_data["global"].extend(articles[:limit])
            logger.info(f"Country {country} not handled, {len(articles[:limit])} articles added to 'global'")
    
    # Apply category limits
    if "category_limits" in CONFIG:
        for category, limit in CONFIG["category_limits"].items():
            category_articles = []
            for country, articles in formatted_data.items():
                if isinstance(articles, list):
                    for article in articles:
                        if article.get("category") == category:
                            category_articles.append((country, article))
            
            if len(category_articles) > limit:
                category_articles.sort(key=lambda x: x[1].get("importance_score", 0))
                articles_to_remove = category_articles[:-limit]
                
                for country, article in articles_to_remove:
                    if country in formatted_data and isinstance(formatted_data[country], list):
                        formatted_data[country] = [a for a in formatted_data[country] if a != article]
                
                logger.info(f"Limited category '{category}' to {limit} articles (removed {len(articles_to_remove)})")
    
    total_articles = sum(len(articles) for articles in formatted_data.values() if isinstance(articles, list))
    logger.info(f"Total processed and formatted articles: {total_articles}")
    
    return formatted_data

def process_events_data(earnings: List[Dict], economic: List[Dict]) -> List[Dict]:
    """Processes and formats event data"""
    events = []
    
    for eco_event in economic:
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
    
    for earning in earnings:
        if earning.get("epsEstimated"):
            temp_event = {
                "event": f"Earnings {earning.get('symbol')}",
                "type": "earnings",
                "title": f"Earnings {earning.get('symbol')} - Forecast: {earning.get('epsEstimated')}$ per share"
            }
            
            impact = "medium"
            score = calculate_event_score(temp_event)
            
            event = {
                "title": f"Earnings {earning.get('symbol')} - Forecast: {earning.get('epsEstimated')}$ per share",
                "date": format_date(earning.get("date", "")),
                "time": "16:30",
                "type": "earnings",
                "importance": impact,
                "score": score
            }
            events.append(event)
    
    events.sort(key=lambda x: (x["score"], x["date"]), reverse=True)
    return events[:15]

def process_ipos_data(ipos: List[Dict]) -> List[Dict]:
    """Formats IPO data for display"""
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
            logger.warning(f"Error processing an IPO: {str(e)}")
    return formatted_ipos

def process_ma_data(ma_list: List[Dict]) -> List[Dict]:
    """Formats M&A data"""
    formatted_ma = []
    for ma in ma_list:
        try:
            formatted_ma.append({
                "title": f"M&A: {ma.get('companyName')} acquires {ma.get('targetedCompanyName')}",
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
            logger.warning(f"Error processing M&A: {str(e)}")
    return formatted_ma

def update_news_json_file(news_data: Dict, events: List[Dict]) -> bool:
    """Updates news.json file with formatted data"""
    try:
        output_data = {k: v for k, v in news_data.items()}
        output_data["events"] = events
        
        os.makedirs(os.path.dirname(NEWS_JSON_PATH), exist_ok=True)
        
        with open(NEWS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"✅ news.json file successfully updated")
        return True
    except Exception as e:
        logger.error(f"❌ Error updating file: {str(e)}")
        return False

def generate_themes_json(news_data: Dict) -> bool:
    """Generates a JSON file with dominant themes over different periods"""
    periods = {
        "weekly": 7,
        "monthly": 30,
        "quarterly": 90
    }
    
    themes_data = {}
    for period, days in periods.items():
        exclude_themes = {"sectors": ["crypto"]}
        themes_data[period] = extract_top_themes(news_data, days=days, exclude_themes=exclude_themes)
    
    for period, axes in themes_data.items():
        for axis, themes in axes.items():
            for theme_name, theme_data in themes.items():
                summary = build_theme_summary(theme_name, theme_data)
                themes_data[period][axis][theme_name]["gpt_summary"] = summary
    
    themes_output = {
        "themes": themes_data,
        "lastUpdated": datetime.now().isoformat(),
        "analysisCount": sum(len(articles) for articles in news_data.values() if isinstance(articles, list))
    }
    
    os.makedirs(os.path.dirname(THEMES_JSON_PATH), exist_ok=True)
    
    try:
        with open(THEMES_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(themes_output, f, ensure_ascii=False, indent=2)
        logger.info(f"✅ themes.json file successfully updated")
        return True
    except Exception as e:
        logger.error(f"❌ Error updating themes.json file: {str(e)}")
        return False

def main() -> bool:
    """Main execution function"""
    try:
        existing_data = read_existing_news()
        
        # Fetch news sources concurrently
        news_sources = fetch_all_news_sources()
        
        # Fetch events concurrently
        with ThreadPoolExecutor(max_workers=3) as executor:
            earnings_future = executor.submit(get_earnings_calendar)
            economic_future = executor.submit(get_economic_calendar)
            ipos_future = executor.submit(get_ipos_calendar)
            ma_future = executor.submit(get_mergers_acquisitions)
            
            earnings = earnings_future.result()
            economic = economic_future.result()
            ipos = ipos_future.result()
            mergers = ma_future.result()
        
        total_news = sum(len(articles) for articles in news_sources.values())
        logger.info(f"Total news retrieved: {total_news}")
        
        if total_news == 0:
            logger.warning("No news retrieved, using existing data")
            if existing_data:
                return True
        
        news_data = process_news_data(news_sources)
        events = process_events_data(earnings, economic)
        
        ipos_events = process_ipos_data(ipos)
        ma_events = process_ma_data(mergers)
        
        events.extend(ipos_events)
        events.extend(ma_events)
        
        success_news = update_news_json_file(news_data, events)
        success_themes = generate_themes_json(news_data)
        
        # Display dominant themes
        top_themes = extract_top_themes(news_data, days=30)
        logger.info("🎯 Dominant themes over 30 days:")
        for axis, themes in top_themes.items():
            logger.info(f"  {axis.capitalize()}:")
            for theme, details in themes.items():
                logger.info(f"    {theme} ({details['count']})")
                if "sentiment_distribution" in details:
                    sentiment = details["sentiment_distribution"]
                    logger.info(f"      Sentiment: {sentiment['positive']}% positive, {sentiment['negative']}% negative, {sentiment['neutral']}% neutral")
        
        return success_news and success_themes
    except Exception as e:
        logger.error(f"❌ Error in script execution: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TradePulse News Updater")
    parser.add_argument("--themes-only", action="store_true", 
                       help="Only regenerate themes.json from existing news data")
    parser.add_argument("--profile", action="store_true", 
                       help="Run with profiling enabled")
    
    args = parser.parse_args()
    
    if args.themes_only:
        logger.info("Running themes-only mode")
        news_json = read_existing_news() or {}
        success = generate_themes_json(news_json)
        exit(0 if success else 1)
    
    if args.profile:
        import cProfile
        import pstats
        profiler = cProfile.Profile()
        profiler.enable()
        success = main()
        profiler.disable()
        
        stats = pstats.Stats(profiler)
        stats.sort_stats('cumulative')
        stats.print_stats(20)  # Top 20 functions
        
        exit(0 if success else 1)
    
    success = main()
    exit(0 if success else 1)
