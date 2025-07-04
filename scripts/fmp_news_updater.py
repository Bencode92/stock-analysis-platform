#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse News Updater - Enhanced ML Version with Async Fetching & Smart Filtering
Script for extracting news from Financial Modeling Prep
- General News API: For general economic news
- Stock News API: For stocks and ETFs
- Crypto News API: For cryptocurrencies
- Press Releases API: For company press releases
- FMP Articles API: For articles written by FMP
- Forex News API: For forex news

🚀 Async fetching, hard filtering, language detection, ML classification
"""

from __future__ import annotations
import os
import re
import json
import requests
import logging
import hashlib
import argparse
import asyncio
import aiohttp
import numpy as np
import subprocess
import shlex
import importlib.util
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import List, Dict, Literal, Optional, Any, Set
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

# ---------------------------------------------------------------------------
# 🎯 ENHANCED CONFIGURATION MODULE (INTEGRATED)
# ---------------------------------------------------------------------------

# Global defaults (overrideable via environment variables)
MAX_TOTAL: int = int(os.getenv("TP_MAX_TOTAL", "150"))
DAYS_BACK: int = int(os.getenv("TP_DAYS_BACK", "30"))
MAX_WORKERS = int(os.getenv("TP_MAX_WORKERS", "3"))
LOG_LEVEL = os.getenv("TP_LOG_LEVEL", "INFO").upper()

# Async fetch configuration
PAGES_PER_RUN = 3
ITEMS_PER_PAGE = 100
FMP_BASE_URL = "https://financialmodelingprep.com/stable"

# Hard filtering patterns (removed event-related patterns)
DROP_PATTERN = re.compile(
    r"\b(ipo|initial public offering|m&a|merger|acquisition)\b",
    flags=re.I,
)
LANG_WHITELIST = {"en", "fr"}

# Dynamic scoring weights
_SCORE_WEIGHTS_PATH = os.path.join("models", "score_weights.json")
_DEFAULT_WEIGHTS: Dict[str, float] = {
    "high_keywords": 4.0,
    "medium_keywords": 2.0,
    "low_keywords": 1.0,
    "source_premium": 3.5,
    "impact_factor": 2.5,
    "content_length": 1.0,
    "recency_boost": 1.3,
    "novelty_penalty": -2.0,
}

try:
    with open(_SCORE_WEIGHTS_PATH, encoding="utf-8") as fh:
        WEIGHTS: Dict[str, float] = json.load(fh)
    print("✅ Dynamic scoring weights loaded")
except FileNotFoundError:
    WEIGHTS = _DEFAULT_WEIGHTS
    print("⚠️ Using fallback scoring weights")

# Source tiering
SOURCE_WEIGHTS: Dict[str, int] = {
    "bloomberg": 6, "reuters": 6, "financial times": 5, "wall street journal": 5,
    "cnbc": 4, "marketwatch": 4, "barron's": 4, "seeking alpha": 4,
    "coindesk": 3, "cointelegraph": 3, "the block": 3, "techcrunch": 3, "oilprice": 3,
    "yahoo finance": 2, "motley fool": 2, "investor's business daily": 2,
    "pr newswire": 1, "business wire": 1, "globe newswire": 1,
}

# Optimized keyword roots
KEYWORDS_CONFIG: Dict[str, list[str]] = {
    "high_impact": [
        "crash", "collapse", "crisis", "recession", "default", "bankruptcy", "panic", "meltdown", 
        "correction", "bear market", "market crash", "sell-off", "plunge", "tumble", "freefall",
        "circuit breaker", "debt ceiling", "sovereign debt", "bond rout", "yield curve", 
        "inverted curve", "treasury spike", "rate hike", "rate cut", "fed decision", 
        "central bank", "ecb decision", "inflation", "hyperinflation", "stagflation", 
        "deflation", "quantitative easing", "tapering", "emergency liquidity", "capital controls", 
        "sanctions", "trade war", "embargo", "nationalisation", "regulation", "investigation", 
        "lawsuit", "antitrust", "class action", "cyberattack", "downgrade", "bailout", "stress test",
    ],
    "medium_impact": [
        "gdp", "growth", "contraction", "employment", "unemployment", "cpi", "ppi", "pmi", "ism", 
        "retail sales", "consumer confidence", "manufacturing", "industrial production", 
        "housing starts", "earnings", "profits", "losses", "guidance", "profit warning", 
        "dividend", "buyback", "spin-off", "restructuring", 
        "layoffs", "capex", "deleveraging", "bond issue", "share placement", "secondary offering", 
        "rights issue", "rating upgrade", "rating downgrade", "volatility", "volume", 
        "short squeeze", "index reshuffle", "re-weighting", "quantitative tightening", 
        "currency intervention", "commodity rally", "oil surge", "gas spike", "gold rally",
    ],
    "low_impact": [
        "announcement", "appointment", "price target", "forecast", "preview", "product launch", 
        "roadmap", "prototype", "partnership", "joint venture", "collaboration", "store opening", 
        "seed funding", "series a", "series b", "series c", "conference", "summit", "webinar", 
        "meeting", "fireside chat", "newsletter", "whitepaper", "case study", "award", "patent", 
        "trade show", "customer win", "milestone", "beta", "update", "patch", "feature",
    ],
}

# Compiled regex patterns (performance optimization)
KEYWORD_PATTERNS: Dict[str, re.Pattern[str]] = {
    level: re.compile("|".join(rf"\b{re.escape(w)}\b" for w in words), re.I)
    for level, words in KEYWORDS_CONFIG.items()
}

# Theme classification
THEMES_DOMINANTS: Dict[str, dict[str, set[str]]] = {
    "macroeconomics": {
        "inflation": {"inflation", "price", "prices", "cpi", "interest rate", "yield", "yields", "consumer price", "cost of living"},
        "recession": {"recession", "slowdown", "gdp", "contraction", "downturn", "economic decline", "negative growth"},
        "monetary_policy": {"fed", "ecb", "central bank", "tapering", "quantitative easing", "qe", "rate hike", "rate cut", "monetary policy", "federal reserve"},
        "geopolitics": {"conflict", "war", "tensions", "geopolitical", "ukraine", "russia", "israel", "china", "taiwan", "middle east", "sanctions", "trade war"},
        "energy_transition": {"climate", "esg", "biodiversity", "net zero", "carbon neutral", "transition", "sustainable", "green energy", "renewable", "solar", "wind"},
    },
    "sectors": {
        "technology": {"ai", "artificial intelligence", "machine learning", "cloud", "cyber", "tech", "semiconductor", "digital", "data", "computing", "software"},
        "energy": {"oil", "gas", "uranium", "energy", "barrel", "renewable", "opec", "crude", "petroleum", "natural gas"},
        "defense": {"defense", "military", "weapons", "nato", "rearmament", "arms", "security", "aerospace"},
        "finance": {"banks", "insurance", "rates", "bonds", "treasury", "financial", "banking", "credit", "loan"},
        "real_estate": {"real estate", "property", "epra", "reits", "infrastructure", "construction", "housing", "mortgage"},
        "consumer": {"retail", "consumer", "luxury", "purchase", "disposable income", "spending", "sales", "e-commerce"},
        "healthcare": {"health", "biotech", "pharma", "vaccine", "fda", "clinical trial", "medicine", "medical", "drug"},
        "crypto": {"crypto", "cryptocurrency", "bitcoin", "ethereum", "blockchain", "altcoin", "token", "defi", "nft", "binance", "coinbase", "web3", "mining", "wallet", "staking", "smart contract", "btc", "eth", "xrp", "sol", "solana", "cardano", "dao"},
    },
    "regions": {
        "europe": {"europe", "france", "ecb", "germany", "italy", "eurozone", "eu", "european union", "brussels", "london", "uk"},
        "usa": {"usa", "fed", "s&p", "nasdaq", "dow jones", "united states", "america", "washington", "wall street"},
        "asia": {"china", "japan", "korea", "india", "asia", "emerging asia", "beijing", "tokyo", "shanghai", "hong kong"},
        "global": {"world", "acwi", "international", "global", "worldwide", "emerging markets", "brics"},
    },
}

# HTTP Session optimization
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "TradePulseBot/2.0",
    "Accept": "application/json",
    "Connection": "keep-alive",
})

# File paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")
NEWS_JSON_PATH = os.path.join(DATA_DIR, "news.json")
THEMES_JSON_PATH = os.path.join(DATA_DIR, "themes.json")

# Create directories
for path in (MODELS_DIR, DATA_DIR):
    os.makedirs(path, exist_ok=True)

# Helper functions
def allocate_limits(total: int, weights: Dict[str, float]) -> Dict[str, int]:
    """Dynamically allocate limits based on weights"""
    total_weight = sum(weights.values()) or 1
    allocated = {k: max(1, int(total * w / total_weight)) for k, w in weights.items()}
    
    # Adjust for rounding errors
    diff = total - sum(allocated.values())
    if diff:
        max_key = max(allocated, key=allocated.get)
        allocated[max_key] += diff
    return allocated

def _quick_self_tests() -> None:
    """Quick self-tests for core functions"""
    test_weights = {"a": 0.5, "b": 0.3, "c": 0.2}
    alloc = allocate_limits(100, test_weights)
    assert sum(alloc.values()) == 100, "allocate_limits incorrect sum"
    assert all(v > 0 for v in alloc.values()), "Zero allocation detected"
    print("✅ self-test allocate_limits OK")

# Dynamic allocation tables
BASE_COUNTRY_WEIGHTS = {
    "us": 0.30, "france": 0.15, "uk": 0.12, "germany": 0.12,
    "china": 0.10, "japan": 0.08, "global": 0.13,
}

BASE_SOURCE_WEIGHTS = {
    "general_news": 0.25, "stock_news": 0.35, "crypto_news": 0.15,
    "fmp_articles": 0.12, "press_releases": 0.08, "forex_news": 0.05,
}

# Master CONFIG object (cleaned from events)
_API_KEY = os.getenv("FMP_API_KEY", "")

CONFIG = {
    "api_key": _API_KEY,
    "endpoints": {
        "fmp_articles": f"https://financialmodelingprep.com/stable/fmp-articles?page=0&limit=20&apikey={_API_KEY}",
        "general_news": f"https://financialmodelingprep.com/stable/news/general-latest?page=0&limit=20&apikey={_API_KEY}",
        "press_releases": f"https://financialmodelingprep.com/stable/news/press-releases-latest?page=0&limit=20&apikey={_API_KEY}",
        "stock_news": f"https://financialmodelingprep.com/stable/news/stock-latest?page=0&limit=20&apikey={_API_KEY}",
        "crypto_news": f"https://financialmodelingprep.com/stable/news/crypto-latest?page=0&limit=20&apikey={_API_KEY}",
        "forex_news": f"https://financialmodelingprep.com/stable/news/forex-latest?page=0&limit=20&apikey={_API_KEY}",
    },
    "news_limits": allocate_limits(120, BASE_SOURCE_WEIGHTS),
    "output_limits": allocate_limits(MAX_TOTAL, BASE_COUNTRY_WEIGHTS),
    "category_limits": {"crypto": 8},
    "max_total_articles": MAX_TOTAL,
    "days_back": DAYS_BACK,
}

# ---------------------------------------------------------------------------
# 🧠 ML & NLP IMPORTS (OPTIONAL)
# ---------------------------------------------------------------------------

try:
    from sentence_transformers import SentenceTransformer
    from sklearn.linear_model import LogisticRegression
    import faiss
    import joblib
    import orjson
    from langdetect import detect, DetectorFactory
    import spacy
    ML_ENABLED = True
    print("✅ ML dependencies loaded successfully")
except ImportError as e:
    ML_ENABLED = False
    print(f"⚠️ ML dependencies not available: {e}")

try:
    import structlog
    from prometheus_client import Counter, Histogram, start_http_server
    import redis
    import pybreaker
    import httpx
    OBSERVABILITY_ENABLED = True
    print("✅ Observability stack loaded successfully")
except ImportError as e:
    OBSERVABILITY_ENABLED = False
    print(f"⚠️ Observability dependencies not available: {e}")

try:
    from tenacity import retry, wait_random_exponential, stop_after_attempt
    HAS_TENACITY = True
except ImportError:
    HAS_TENACITY = False
    def retry(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

# ---------------------------------------------------------------------------
# 📊 LOGGING SETUP
# ---------------------------------------------------------------------------

if OBSERVABILITY_ENABLED:
    structlog.configure(
        processors=[structlog.processors.JSONRenderer()],
        wrapper_class=structlog.make_filtering_bound_logger(LOG_LEVEL),
    )
    logger = structlog.get_logger(__name__)
else:
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 🤖 ML MODELS & NLP SETUP
# ---------------------------------------------------------------------------

if ML_ENABLED:
    try:
        EMBED_MODEL = SentenceTransformer("paraphrase-MiniLM-L6-v2")
        print("✅ Sentence transformer model loaded")
    except Exception as e:
        EMBED_MODEL = None
        print(f"⚠️ Failed to load embedding model: {e}")
    
    try:
        IMPACT_CLF = joblib.load("models/impact_clf.joblib")
        CATEGORY_CLF = joblib.load("models/category_clf.joblib")
        print("✅ ML classifiers loaded")
    except FileNotFoundError:
        IMPACT_CLF = CATEGORY_CLF = None
        print("⚠️ ML classifiers not found, using fallback rules")
    
    DetectorFactory.seed = 0
else:
    EMBED_MODEL = None
    IMPACT_CLF = CATEGORY_CLF = None

# ---------------------------------------------------------------------------
# 🔍 FAISS INDEX
# ---------------------------------------------------------------------------

if ML_ENABLED:
    try:
        faiss_index = faiss.read_index("models/keywords.index")
        kw_tokens = orjson.loads(open("models/keywords.json", "rb").read())
        print("✅ FAISS keyword index loaded")
    except FileNotFoundError:
        faiss_index, kw_tokens = None, []
        print("⚠️ FAISS index not found, using static keywords")
else:
    faiss_index, kw_tokens = None, []

# ---------------------------------------------------------------------------
# 📈 OBSERVABILITY SETUP
# ---------------------------------------------------------------------------

if OBSERVABILITY_ENABLED:
    try:
        METRIC_LATENCY = Histogram("tp_fetch_latency_seconds", "FMP API latency", ["endpoint"])
        METRIC_ERRORS = Counter("tp_fetch_errors_total", "FMP API errors", ["endpoint"])
        METRIC_FETCH_SUCCESS = Counter("tp_fetch_success_total", "Successful API calls", ["endpoint"])
        
        start_http_server(8000)
        print("✅ Prometheus metrics server started on :8000")
        
        redis_cli = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"), 
                               port=int(os.getenv("REDIS_PORT", "6379")), 
                               decode_responses=False)
        redis_cli.ping()
        print("✅ Redis connection established")
        
        breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60)
        rate_limiter = asyncio.Semaphore(60)
        print("✅ Observability stack initialized")
        
    except Exception as e:
        print(f"⚠️ Observability setup failed: {e}")
        OBSERVABILITY_ENABLED = False
        redis_cli = None
        breaker = None
        rate_limiter = None

# ---------------------------------------------------------------------------
# 🏗️ TYPE DEFINITIONS
# ---------------------------------------------------------------------------

Impact = Literal["positive", "neutral", "negative"]
Category = Literal["economy", "markets", "companies", "crypto", "tech"]

@dataclass
class NewsItem:
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

# ---------------------------------------------------------------------------
# 🔧 ENHANCED HELPER FUNCTIONS
# ---------------------------------------------------------------------------

def _is_valid_article(art: dict) -> bool:
    """Hard filter: unwanted categories + language validation"""
    # Extract text content
    title = art.get('title', '')
    content = art.get('content', '') or art.get('text', '')
    body = f"{title} {content}".strip()
    
    if not body or len(body) < 50:
        return False
    
    # Filter unwanted categories
    if DROP_PATTERN.search(body):
        return False
    
    # Language detection
    if ML_ENABLED:
        try:
            detected_lang = detect(body[:200])  # Use first 200 chars for speed
            if detected_lang not in LANG_WHITELIST:
                return False
        except:
            # If detection fails, assume English and continue
            pass
    
    return True

def enhanced_keyword_matching(text: str, weight_class: str) -> int:
    """Enhanced keyword matching using compiled regex patterns"""
    if weight_class not in KEYWORD_PATTERNS:
        return 0
    
    matches = len(KEYWORD_PATTERNS[weight_class].findall(text))
    
    # Semantic expansion (if FAISS available)
    if faiss_index is not None:
        for keyword in KEYWORDS_CONFIG[weight_class]:
            expanded = expand_with_faiss(keyword)
            for exp_kw in expanded:
                if exp_kw in text.lower():
                    matches += 0.5
    
    return int(matches)

def theme_keyword_matching(text: str, theme_keywords: Set[str]) -> bool:
    """Enhanced theme matching with word boundaries"""
    text_lower = text.lower()
    for keyword in theme_keywords:
        pattern = re.compile(rf'\b{re.escape(keyword)}\b', re.IGNORECASE)
        if pattern.search(text):
            return True
        
        for exp_kw in expand_with_faiss(keyword):
            if exp_kw in text_lower:
                return True
    
    return False

def embed(text: str) -> Optional[np.ndarray]:
    """Generate embeddings for text"""
    if not EMBED_MODEL:
        return None
    try:
        return EMBED_MODEL.encode([text])[0]
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        return None

def expand_with_faiss(token: str, topk: int = 3) -> List[str]:
    """Semantic keyword expansion using FAISS"""
    if faiss_index is None or not EMBED_MODEL:
        return []
    try:
        vec = embed(token)
        if vec is None:
            return []
        vec = vec.reshape(1, -1)
        D, I = faiss_index.search(vec, topk)
        return [kw_tokens[i] for i in I[0] if D[0][list(I[0]).index(i)] > 0.4]
    except Exception as e:
        logger.error(f"FAISS expansion error: {e}")
        return []

def make_uid(title: str, source: str, raw_date: str) -> str:
    """Generate unique identifier for deduplication"""
    return hashlib.sha256(f"{title}{source}{raw_date}".encode()).hexdigest()[:16]

def make_url_hash(url: str) -> str:
    """Generate URL-based hash for deduplication"""
    return hashlib.sha1(url.encode()).hexdigest()

def read_existing_news() -> Optional[Dict]:
    """Reads existing JSON file as fallback"""
    try:
        with open(NEWS_JSON_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

# ---------------------------------------------------------------------------
# 🌐 ENHANCED ASYNC API FETCHING
# ---------------------------------------------------------------------------

async def _fetch_single(session: aiohttp.ClientSession, url: str, params: Dict) -> List[Dict]:
    """Fetch single endpoint with error handling"""
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data if isinstance(data, list) else [data] if data else []
            else:
                logger.warning(f"HTTP {resp.status} for {url}")
                return []
    except Exception as e:
        logger.error(f"Error fetching {url}: {str(e)}")
        return []

async def fetch_fmp_batch_async() -> List[Dict]:
    """Async batch fetch from all FMP endpoints with filtering"""
    if not CONFIG["api_key"]:
        logger.error("FMP API key not defined")
        return []
    
    today = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=CONFIG["days_back"])).strftime("%Y-%m-%d")
    
    tasks = []
    
    async with aiohttp.ClientSession() as session:
        # News endpoints only (no events)
        for endpoint_name, endpoint_url in CONFIG["endpoints"].items():
            for page in range(PAGES_PER_RUN):
                params = {
                    "apikey": CONFIG["api_key"],
                    "page": page,
                    "limit": ITEMS_PER_PAGE,
                    "from": start_date,
                    "to": today
                }
                tasks.append(_fetch_single(session, endpoint_url, params))
        
        # Execute all requests concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Flatten results and filter
    articles = []
    seen_urls = set()
    
    for result in results:
        if isinstance(result, list):
            for art in result:
                if not isinstance(art, dict):
                    continue
                
                # Normalize URL field
                url = art.get('url') or art.get('link', '')
                if not url:
                    continue
                
                # URL-based deduplication
                url_hash = make_url_hash(url)
                if url_hash in seen_urls:
                    continue
                
                # Apply hard filters
                if not _is_valid_article(art):
                    continue
                
                # Add metadata
                art["_id"] = url_hash
                art["fetched_at"] = time.time()
                seen_urls.add(url_hash)
                articles.append(art)
    
    logger.info(f"✅ Async fetch completed: {len(articles)} valid articles after filtering")
    return articles

# Fallback sync fetch (simplified, no events)
@retry(wait=wait_random_exponential(multiplier=1, max=30), stop=stop_after_attempt(5)) if HAS_TENACITY else lambda f: f
def fetch_api_data(endpoint: str, params: Optional[Dict] = None) -> List[Dict]:
    """Fallback sync API fetching"""
    if not CONFIG["api_key"]:
        logger.error("FMP API key not defined")
        return []
        
    if params is None:
        params = {}
    params["apikey"] = CONFIG["api_key"]
    
    try:
        response = SESSION.get(endpoint, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else [data] if data else []
    except Exception as e:
        logger.error(f"❌ Error fetching from {endpoint}: {str(e)}")
        return []

# ---------------------------------------------------------------------------
# 📰 NEWS SOURCE GETTERS (NEWS ONLY)
# ---------------------------------------------------------------------------

def get_all_news_async():
    """Get all news using async batch fetch"""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(fetch_fmp_batch_async())

# ---------------------------------------------------------------------------
# 🧠 ENHANCED CLASSIFICATION
# ---------------------------------------------------------------------------

def ml_predict(text: str, clf):
    """ML prediction with fallback"""
    if clf is None or not EMBED_MODEL:
        return None, 0.0
    try:
        vec = embed(text)
        if vec is None:
            return None, 0.0
        vec = vec.reshape(1, -1)
        prediction = clf.predict(vec)[0]
        confidence = clf.predict_proba(vec).max()
        return prediction, confidence
    except Exception as e:
        logger.error(f"ML prediction error: {e}")
        return None, 0.0

def determine_category_ml(article: Dict, source: Optional[str] = None) -> Category:
    """ML-enhanced category determination with fallback"""
    text = f"{article.get('title', '')} {article.get('text', '')}"
    
    ml_cat, confidence = ml_predict(text, CATEGORY_CLF)
    if ml_cat and confidence > 0.55:
        logger.debug(f"ML category: {ml_cat} (confidence: {confidence:.2f})")
        return ml_cat
    
    return determine_category_fallback(article, source)

def determine_category_fallback(article: Dict, source: Optional[str] = None) -> Category:
    """Enhanced rule-based category determination"""
    if article.get("symbol") and any(ticker in str(article.get("symbol")) for ticker in ["BTC", "ETH", "CRYPTO", "COIN"]):
        return "crypto"
        
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    for theme_category, themes in THEMES_DOMINANTS["sectors"].items():
        if theme_keyword_matching(text, themes):
            return theme_category if theme_category in ["crypto", "tech"] else "companies"
    
    for theme_name, theme_keywords in THEMES_DOMINANTS["macroeconomics"].items():
        if theme_keyword_matching(text, theme_keywords):
            return "economy"
    
    if enhanced_keyword_matching(text, "high_impact") > 2:
        return "markets"
    
    return "companies"

def determine_impact_ml(article: Dict) -> Impact:
    """ML-enhanced impact determination with fallback"""
    text = f"{article.get('title', '')} {article.get('text', '')}"
    
    ml_impact, confidence = ml_predict(text, IMPACT_CLF)
    if ml_impact and confidence > 0.55:
        logger.debug(f"ML impact: {ml_impact} (confidence: {confidence:.2f})")
        return ml_impact
    
    return determine_impact_fallback(article)

def determine_impact_fallback(article: Dict) -> Impact:
    """Enhanced rule-based impact determination"""
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
    
    positive_patterns = [
        r'\b(surge|soar|gain|rise|jump|boost|recovery|profit|beat|success|bullish|rally|growth)\b',
        r'\b(positive|optimistic|momentum|exceed|improvement|confidence|strong|upgrade)\b'
    ]
    
    negative_patterns = [
        r'\b(drop|fall|decline|loss|plunge|tumble|crisis|risk|warning|bearish|slump)\b',
        r'\b(negative|pessimistic|weakness|miss|downgrade|pressure|struggle|slowdown)\b'
    ]
    
    pos_score = sum(len(re.findall(pattern, text, re.IGNORECASE)) for pattern in positive_patterns)
    neg_score = sum(len(re.findall(pattern, text, re.IGNORECASE)) for pattern in negative_patterns)
    
    if pos_score > neg_score:
        return "positive"
    elif neg_score > pos_score:
        return "negative"
    else:
        return "neutral"

def determine_country_fallback(article: Dict) -> str:
    """Enhanced rule-based country determination"""
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
    
    for region_name, region_keywords in THEMES_DOMINANTS["regions"].items():
        if theme_keyword_matching(text, region_keywords):
            return region_name if region_name in ["france", "uk", "germany", "china", "japan"] else "us"
    
    return "us"

# Use enhanced functions
determine_category = determine_category_ml
determine_impact = determine_impact_ml
determine_country = determine_country_fallback

def extract_themes(article: Dict) -> Dict[str, List[str]]:
    """Enhanced theme identification with improved matching"""
    text = article.get("title", "").lower()
    themes_detected = {"macroeconomics": [], "sectors": [], "regions": []}
    
    for axis, groups in THEMES_DOMINANTS.items():
        for theme, keywords in groups.items():
            if theme_keyword_matching(text, keywords):
                themes_detected[axis].append(theme)

    return themes_detected

def compute_importance_score(article: Dict, category: str) -> float:
    """Enhanced importance scoring with optimized weights"""
    content = f"{article.get('title', '')} {article.get('content', '')}"
    article_source = article.get("source", "").lower()
    
    # Enhanced keyword scoring with compiled patterns
    high_matches = enhanced_keyword_matching(content, "high_impact")
    medium_matches = enhanced_keyword_matching(content, "medium_impact")
    low_matches = enhanced_keyword_matching(content, "low_impact")
    
    # Apply dynamic weights
    high_keyword_score = min(40, high_matches * WEIGHTS.get("high_keywords", 4))
    medium_keyword_score = min(20, medium_matches * WEIGHTS.get("medium_keywords", 2))
    low_keyword_score = min(10, low_matches * WEIGHTS.get("low_keywords", 1))
    
    # Enhanced source scoring
    source_score = 0
    for source, weight in SOURCE_WEIGHTS.items():
        if source in article_source:
            source_score = weight * WEIGHTS.get("source_premium", 3.5)
            break
    
    # Content quality scoring
    title_length = len(article.get("title", ""))
    text_length = len(article.get("content", ""))
    
    content_score = (
        min(5, title_length / 50) + 
        min(10, text_length / 500)
    ) * WEIGHTS.get("content_length", 1)
    
    # Impact scoring
    impact = article.get("impact", "neutral")
    impact_multiplier = {"negative": 1.2, "positive": 1.1, "neutral": 1.0}[impact]
    impact_score = 10 * impact_multiplier * WEIGHTS.get("impact_factor", 2.5)
    
    # Recency boost
    try:
        article_date = datetime.strptime(article.get("rawDate", "").split(" ")[0], "%Y-%m-%d")
        days_old = (datetime.now() - article_date).days
        recency_multiplier = max(0.5, 1 - (days_old / 30)) * WEIGHTS.get("recency_boost", 1.3)
    except:
        recency_multiplier = 1.0
    
    total_score = (
        high_keyword_score + 
        medium_keyword_score + 
        low_keyword_score +
        source_score + 
        content_score + 
        impact_score
    ) * recency_multiplier
    
    # Category-specific adjustments
    if category == "crypto_news":
        total_score *= 0.9
    elif category == "general_news":
        total_score *= 1.1
    
    return min(100, max(0, total_score))

# ---------------------------------------------------------------------------
# 📊 DATA PROCESSING FUNCTIONS
# ---------------------------------------------------------------------------

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
    
    normalized = {
        "title": title,
        "text": text,
        "publishedDate": date,
        "symbol": symbol,
        "site": site,
        "url": url,
        "source_type": source
    }
    
    # Add language detection if ML available
    if ML_ENABLED:
        try:
            normalized["lang"] = detect(title + " " + text)[:2]
        except:
            normalized["lang"] = "en"
    
    return normalized

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

def process_news_data_async(articles: List[Dict]) -> Dict:
    """Process async-fetched articles into formatted data"""
    formatted_data = {"lastUpdated": datetime.now().isoformat()}
    
    for country in CONFIG["output_limits"].keys():
        formatted_data[country] = []
    
    all_articles = []
    source_stats = Counter()
    category_stats = Counter()
    
    for article in articles:
        normalized = normalize_article(article, "async_batch")
        
        # Content already validated by _is_valid_article
        category = determine_category(normalized, "async_batch")
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
            "source_type": "async_batch"
        }
        
        if "lang" in normalized:
            news_item["lang"] = normalized["lang"]
        
        news_item["id"] = article.get("_id", make_uid(news_item["title"], news_item["source"], news_item["rawDate"]))
        news_item["importance_score"] = compute_importance_score(news_item, "async_batch")
        
        all_articles.append(news_item)
        source_stats[normalized["site"]] += 1
        category_stats[category] += 1
    
    # Sort by importance
    all_articles.sort(key=lambda x: x["importance_score"], reverse=True)
    
    # Distribute by country
    articles_by_country = {}
    for article in all_articles:
        country = article["country"]
        if country not in articles_by_country:
            articles_by_country[country] = []
        articles_by_country[country].append(article)
    
    # Apply limits by country
    for country, articles in articles_by_country.items():
        limit = CONFIG["output_limits"].get(country, 10)
        if country in formatted_data:
            formatted_data[country] = articles[:limit]
        else:
            if "global" not in formatted_data:
                formatted_data["global"] = []
            formatted_data["global"].extend(articles[:limit])
    
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
                category_articles.sort(key=lambda x: x[1].get("importance_score", 0), reverse=True)
                articles_to_remove = category_articles[limit:]
                
                for country, article in articles_to_remove:
                    if country in formatted_data and isinstance(formatted_data[country], list):
                        if article in formatted_data[country]:
                            formatted_data[country].remove(article)
    
    final_count = sum(len(articles) for articles in formatted_data.values() if isinstance(articles, list))
    logger.info(f"📰 Final article count: {final_count}")
    
    return formatted_data

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

def extract_top_themes(news_data: Dict, days: int = 30, max_examples: int = 3, 
                      exclude_themes: Optional[Dict] = None) -> Dict:
    """Enhanced theme analysis with better date handling"""
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
                    date_str = article["rawDate"].split(" ")[0]
                elif "date" in article:
                    date_parts = article["date"].split("/")
                    if len(date_parts) == 3:
                        date_str = f"{date_parts[2]}-{date_parts[1]}-{date_parts[0]}"
                    else:
                        continue
                else:
                    continue
                
                article_date = datetime.strptime(date_str, "%Y-%m-%d")
                
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
                            if len(themes_details[axis][theme]["articles"]) < max_examples:
                                themes_details[axis][theme]["articles"].append(title)
                
            except Exception as e:
                logger.warning(f"Article ignored for date parsing error: {str(e)}")
                continue
    
    logger.info(f"Theme analysis: {processed_articles}/{total_articles} articles used for the {days} day period")
    
    # Calculate sentiment distributions
    for axis, theme_dict in theme_articles.items():
        for theme, articles in theme_dict.items():
            sentiment_stats = compute_sentiment_distribution(articles)
            if theme in themes_details[axis]:
                themes_details[axis][theme]["sentiment_distribution"] = sentiment_stats
    
    # Filter and rank themes
    top_themes_with_details = {}
    for axis in themes_counter:
        top_themes = themes_counter[axis].most_common(15)
        
        if exclude_themes and axis in exclude_themes:
            top_themes = [(theme, count) for theme, count in top_themes 
                         if theme not in exclude_themes[axis]]
        
        top_themes_with_details[axis] = {}
        for theme, count in top_themes:
            top_themes_with_details[axis][theme] = themes_details[axis].get(
                theme, {"count": count, "articles": []}
            )
    
    return top_themes_with_details

def update_news_json_file(news_data: Dict) -> bool:
    """Updates news.json file with formatted data (no events)"""
    try:
        output_data = {k: v for k, v in news_data.items()}
        # No events section anymore
        
        os.makedirs(os.path.dirname(NEWS_JSON_PATH), exist_ok=True)
        
        with open(NEWS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"✅ news.json file successfully updated")
        return True
    except Exception as e:
        logger.error(f"❌ Error updating file: {str(e)}")
        return False

def generate_themes_json(news_data: Dict) -> bool:
    """Enhanced themes JSON generation"""
    periods = {
        "weekly": 7,
        "monthly": 30,
        "quarterly": 90
    }
    
    themes_data = {}
    for period, days in periods.items():
        exclude_themes = {"sectors": ["crypto"]} if period != "weekly" else {}
        themes_data[period] = extract_top_themes(news_data, days=days, exclude_themes=exclude_themes)
    
    themes_output = {
        "themes": themes_data,
        "lastUpdated": datetime.now().isoformat(),
        "analysisCount": sum(len(articles) for articles in news_data.values() if isinstance(articles, list)),
        "weights_version": "enhanced_v4_async_news_only",
        "ml_enabled": ML_ENABLED,
        "observability_enabled": OBSERVABILITY_ENABLED,
        "async_enabled": True,
        "filtering_enabled": True,
        "events_enabled": False
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

def main(args) -> bool:
    """Enhanced main execution function with async news fetching (no events)"""
    try:
        print("\n🚀 TradePulse News Updater - Enhanced Async Version v4.1 (News Only)")
        print("=" * 70)
        print(f"📊 ML Features: {'✅ Enabled' if ML_ENABLED else '❌ Disabled'}")
        print(f"📈 Observability: {'✅ Enabled' if OBSERVABILITY_ENABLED else '❌ Disabled'}")
        print(f"🚀 Async Fetching: ✅ Active")
        print(f"🔍 Hard Filtering: ✅ Active (IPO/M&A excluded)")
        print(f"🌐 Language Filter: ✅ Active (en/fr only)")
        print(f"⚡ URL Deduplication: ✅ Active")
        print(f"🎯 Enhanced Scoring: ✅ Active")
        print(f"🔍 Semantic Matching: {'✅ FAISS' if faiss_index else '❌ Keyword only'}")
        print(f"⚡ Compiled Patterns: ✅ Active")
        print(f"📰 Focus: News Only (No Events/Calendar)")
        print(f"📊 Sources: General, Stock, Crypto, Press Releases, FMP Articles, Forex")
        print("=" * 70)
        
        existing_data = read_existing_news()
        
        # Fetch news using async batch fetch
        logger.info("🔄 Fetching news with async batch fetch...")
        articles = get_all_news_async()
        
        total_news = len(articles)
        logger.info(f"📰 Total filtered news retrieved: {total_news}")
        
        if total_news == 0:
            logger.warning("⚠️ No news retrieved, using existing data")
            if existing_data:
                return True
            return False
        
        # Process news with enhanced async pipeline
        logger.info("🧠 Processing news with async-enhanced pipeline...")
        news_data = process_news_data_async(articles)
        
        # Update files (with dry-run support)
        logger.info("💾 Updating output files...")
        if args.no_write:
            logger.info("📝 Dry-run : aucun fichier n'a été modifié")
            success_news = success_themes = True
        else:
            success_news = update_news_json_file(news_data)
            success_themes = generate_themes_json(news_data)
        
        # Display enhanced analytics
        top_themes = extract_top_themes(news_data, days=30)
        logger.info("🎯 Dominant themes over 30 days:")
        for axis, themes in top_themes.items():
            logger.info(f"  📊 {axis.capitalize()}:")
            for theme, details in list(themes.items())[:5]:
                sentiment = details.get("sentiment_distribution", {})
                pos = sentiment.get("positive", 0)
                neg = sentiment.get("negative", 0)
                logger.info(f"    • {theme}: {details['count']} articles (💚{pos:.0f}% 💔{neg:.0f}%)")
        
        final_stats = {
            "total_processed": sum(len(articles) for articles in news_data.values() if isinstance(articles, list)),
            "themes_analyzed": sum(len(themes) for themes in top_themes.values()),
            "sources_used": len(set(art.get("source", "") for articles in news_data.values() 
                                   if isinstance(articles, list) for art in articles)),
            "ml_enabled": ML_ENABLED,
            "observability": OBSERVABILITY_ENABLED,
            "async_enabled": True,
            "filtering_enabled": True,
            "events_enabled": False
        }
        
        print(f"\n✅ Pipeline completed successfully!")
        print(f"📰 Articles processed: {final_stats['total_processed']}")
        print(f"🎯 Themes analyzed: {final_stats['themes_analyzed']}")
        print(f"📡 Sources used: {final_stats['sources_used']}")
        print(f"🚀 Performance: {'🔥 Async Enhanced' if ML_ENABLED else '⚡ Async Standard'}")
        print(f"🔍 Filtering: ✅ IPO/M&A excluded, Events removed")
        print(f"📰 Focus: Pure News Pipeline")
        
        return success_news and success_themes
        
    except Exception as e:
        logger.error(f"❌ Error in script execution: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TradePulse News Updater - Enhanced Async Version v4.1 (News Only)")
    parser.add_argument("--themes-only", action="store_true", 
                       help="Only regenerate themes.json from existing news data")
    parser.add_argument("--profile", action="store_true", 
                       help="Run with profiling enabled")
    parser.add_argument("--ml-benchmark", action="store_true", 
                       help="Benchmark ML vs rule-based classification")
    parser.add_argument("--config-check", action="store_true",
                       help="Validate configuration and show current settings")
    parser.add_argument("--no-write", action="store_true",
                       help="Exécute le pipeline sans écrire de fichiers")
    parser.add_argument("--self-test", action="store_true",
                       help="Exécute les tests internes et s'arrête")
    
    args = parser.parse_args()
    
    if args.self_test:
        _quick_self_tests()
        print("Tous les self-tests ont réussi 🎉")
        exit(0)
    
    if args.config_check:
        print("\n🔧 Configuration Check (News Only)")
        print("=" * 50)
        print(f"📊 Total limits: {CONFIG['max_total_articles']}")
        print(f"📈 Country allocation: {CONFIG['output_limits']}")
        print(f"📰 Source allocation: {CONFIG['news_limits']}")
        print(f"⚖️ Dynamic weights: {WEIGHTS}")
        print(f"🎯 ML models: {'✅' if (IMPACT_CLF and CATEGORY_CLF) else '❌'}")
        print(f"🔍 FAISS index: {'✅' if faiss_index else '❌'}")
        print(f"⚡ Compiled patterns: {'✅' if KEYWORD_PATTERNS else '❌'}")
        print(f"🚀 Async fetch: ✅ aiohttp")
        print(f"🔍 Hard filtering: ✅ IPO/M&A")
        print(f"🌐 Language filter: ✅ {LANG_WHITELIST}")
        print(f"📰 Events: ❌ Disabled (News Only)")
        print(f"📊 Sources: {list(CONFIG['endpoints'].keys())}")
        exit(0)
    
    if args.themes_only:
        logger.info("🎯 Running themes-only mode")
        news_json = read_existing_news() or {}
        success = generate_themes_json(news_json)
        exit(0 if success else 1)
    
    if args.ml_benchmark and ML_ENABLED:
        print("\n🔬 ML Benchmark Mode")
        print("Comparing ML vs rule-based classification...")
        print("⚠️ Benchmark mode not yet implemented")
        exit(0)
    
    if args.profile:
        import cProfile
        import pstats
        profiler = cProfile.Profile()
        profiler.enable()
        success = main(args)
        profiler.disable()
        
        stats = pstats.Stats(profiler)
        stats.sort_stats('cumulative')
        stats.print_stats(20)
        
        exit(0 if success else 1)
    
    success = main(args)
    exit(0 if success else 1)
