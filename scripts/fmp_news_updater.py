#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse News Updater - Enhanced ML Version
Script for extracting news and events from Financial Modeling Prep
- General News API: For general economic news
- Stock News API: For stocks and ETFs
- Crypto News API: For cryptocurrencies
- Press Releases API: For company press releases
- FMP Articles API: For articles written by FMP
- IPOs Calendar: For upcoming IPOs
- Mergers & Acquisitions: For M&A operations

🚀 NEW: ML-enhanced classification, FAISS dynamic keywords, observability
"""

import os
import re
import json
import requests
import logging
import hashlib
import argparse
import asyncio
import numpy as np
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import List, Dict, Literal, Optional, Any, Set
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

# ML & NLP imports
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
    print("📋 To enable ML features, install: pip install sentence-transformers scikit-learn faiss-cpu langdetect spacy orjson")

# Observability & infrastructure imports
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
    print("📋 To enable observability, install: pip install structlog prometheus-client redis pybreaker httpx")

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

# -------------------------------------------------
# === ML MODELS & NLP PIPELINES ==================
# -------------------------------------------------
if ML_ENABLED:
    try:
        EMBED_MODEL = SentenceTransformer("paraphrase-MiniLM-L6-v2")
        print("✅ Sentence transformer model loaded")
    except Exception as e:
        EMBED_MODEL = None
        print(f"⚠️ Failed to load embedding model: {e}")
    
    # Load trained ML classifiers
    try:
        IMPACT_CLF = joblib.load("models/impact_clf.joblib")
        CATEGORY_CLF = joblib.load("models/category_clf.joblib")
        print("✅ ML classifiers loaded")
    except FileNotFoundError:
        IMPACT_CLF = CATEGORY_CLF = None
        print("⚠️ ML classifiers not found, using fallback rules")
    
    # Load spaCy pipelines
    NLP_PIPELINES = {}
    try:
        if os.system("python -m spacy download en_core_web_sm") == 0:
            NLP_PIPELINES["en"] = spacy.load("en_core_web_sm")
        if os.system("python -m spacy download fr_core_news_sm") == 0:
            NLP_PIPELINES["fr"] = spacy.load("fr_core_news_sm")
        print(f"✅ NLP pipelines loaded: {list(NLP_PIPELINES.keys())}")
    except Exception as e:
        print(f"⚠️ Failed to load spaCy pipelines: {e}")
    
    # Language detection
    DetectorFactory.seed = 0  # reproducibility
else:
    EMBED_MODEL = None
    IMPACT_CLF = CATEGORY_CLF = None
    NLP_PIPELINES = {}

# -------------------------------------------------
# === FAISS INDEX for dynamic keywords ===========
# -------------------------------------------------
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

# -------------------------------------------------
# === OBSERVABILITY ==============================
# -------------------------------------------------
if OBSERVABILITY_ENABLED:
    try:
        # Prometheus metrics
        METRIC_LATENCY = Histogram("tp_fetch_latency_seconds", "FMP API latency", ["endpoint"])
        METRIC_ERRORS = Counter("tp_fetch_errors_total", "FMP API errors", ["endpoint"])
        METRIC_FETCH_SUCCESS = Counter("tp_fetch_success_total", "Successful API calls", ["endpoint"])
        
        # Start Prometheus server
        start_http_server(8000)
        print("✅ Prometheus metrics server started on :8000")
        
        # Redis connection
        redis_cli = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"), 
                               port=int(os.getenv("REDIS_PORT", "6379")), 
                               decode_responses=False)
        redis_cli.ping()  # Test connection
        print("✅ Redis connection established")
        
        # Circuit breaker
        breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60)
        
        # Rate limiter
        rate_limiter = asyncio.Semaphore(60)  # 60 req/min
        print("✅ Observability stack initialized")
        
    except Exception as e:
        print(f"⚠️ Observability setup failed: {e}")
        OBSERVABILITY_ENABLED = False
        redis_cli = None
        breaker = None
        rate_limiter = None

# -------------------------------------------------
# === ENHANCED CONFIGURATION (CLEANED) ===========
# -------------------------------------------------

# Dynamic scoring weights (externalized, reloadable)
try:
    WEIGHTS = json.load(open("models/score_weights.json"))
    print("✅ Dynamic scoring weights loaded")
except FileNotFoundError:
    # Fallback weights with explicit structure
    WEIGHTS = {
        "high_keywords": 4.0,
        "medium_keywords": 2.0,
        "source_premium": 3.0,
        "content_length": 1.0,
        "impact_factor": 2.5,
        "recency_boost": 1.2
    }
    print("⚠️ Using fallback scoring weights")

# Source scoring with explicit weights
SOURCE_WEIGHTS = {
    # Premium sources (tier 1)
    "bloomberg": 5,
    "reuters": 5,
    "financial times": 4,
    "wall street journal": 4,
    
    # Major financial media (tier 2)
    "cnbc": 3,
    "marketwatch": 3,
    "seeking alpha": 3,
    "barron's": 3,
    
    # Specialized sources (tier 3)
    "coindesk": 3,  # crypto
    "cointelegraph": 3,  # crypto
    "the block": 3,  # crypto
    
    # Standard sources (tier 4)
    "yahoo finance": 2,
    "motley fool": 2,
    "investor's business daily": 2,
    
    # Basic sources (tier 5)
    "pr newswire": 1,
    "business wire": 1,
    "globe newswire": 1
}

# Keywords with explicit weights and deduplication via sets
KEYWORD_WEIGHTS = {
    "high_impact": {
        # Market crashes & crises
        "crash", "collapse", "crisis", "recession", "default", "bankruptcy", 
        "panic", "contagion", "meltdown", "correction",
        
        # Central banking & monetary policy
        "central bank", "fed decision", "rate hike", "rate cut", "rate decision",
        "inflation", "deflation", "quantitative easing", "tapering",
        
        # Market structure
        "bear market", "market crash", "sell-off", "plunge", "tumble",
        "bond yield", "yield curve", "treasury", "sovereign debt",
        
        # Regulatory & geopolitical
        "sanctions", "trade war", "regulation", "investigation", "lawsuit"
    },
    
    "medium_impact": {
        # Economic indicators
        "gdp", "employment", "unemployment", "job report", "cpi", "pmi",
        "retail sales", "consumer confidence", "manufacturing",
        
        # Corporate actions
        "earnings", "merger", "acquisition", "ipo", "buyback", "dividend",
        "guidance", "outlook", "profit warning", "restructuring",
        
        # Market movements
        "rally", "surge", "jump", "decline", "volatility", "volume"
    },
    
    "low_impact": {
        # General business
        "announcement", "appointment", "recommendation", "forecast",
        "product launch", "partnership", "collaboration", "expansion",
        "investment", "funding", "conference", "meeting"
    }
}

# Convert to regex patterns for better matching
KEYWORD_PATTERNS = {}
for weight_class, keywords in KEYWORD_WEIGHTS.items():
    # Create word boundary regex patterns
    patterns = [re.compile(rf'\b{re.escape(kw)}\b', re.IGNORECASE) for kw in keywords]
    KEYWORD_PATTERNS[weight_class] = patterns

# Theme classification with sets for faster lookups
THEMES_DOMINANTS = {
    "macroeconomics": {
        "inflation": {
            "inflation", "price", "prices", "cpi", "interest rate", 
            "yield", "yields", "consumer price", "cost of living"
        },
        "recession": {
            "recession", "slowdown", "gdp", "contraction", "downturn",
            "economic decline", "negative growth"
        },
        "monetary_policy": {
            "fed", "ecb", "central bank", "tapering", "quantitative easing",
            "qe", "rate hike", "rate cut", "monetary policy", "federal reserve"
        },
        "geopolitics": {
            "conflict", "war", "tensions", "geopolitical", "ukraine", "russia",
            "israel", "china", "taiwan", "middle east", "sanctions", "trade war"
        },
        "energy_transition": {
            "climate", "esg", "biodiversity", "net zero", "carbon neutral",
            "transition", "sustainable", "green energy", "renewable", "solar", "wind"
        }
    },
    "sectors": {
        "technology": {
            "ai", "artificial intelligence", "machine learning", "cloud", "cyber",
            "tech", "semiconductor", "digital", "data", "computing", "software"
        },
        "energy": {
            "oil", "gas", "uranium", "energy", "barrel", "renewable",
            "opec", "crude", "petroleum", "natural gas"
        },
        "defense": {
            "defense", "military", "weapons", "nato", "rearmament",
            "arms", "security", "aerospace"
        },
        "finance": {
            "banks", "insurance", "rates", "bonds", "treasury",
            "financial", "banking", "credit", "loan"
        },
        "real_estate": {
            "real estate", "property", "epra", "reits", "infrastructure",
            "construction", "housing", "mortgage"
        },
        "consumer": {
            "retail", "consumer", "luxury", "purchase", "disposable income",
            "spending", "sales", "e-commerce"
        },
        "healthcare": {
            "health", "biotech", "pharma", "vaccine", "fda",
            "clinical trial", "medicine", "medical", "drug"
        },
        "crypto": {
            "crypto", "cryptocurrency", "bitcoin", "ethereum", "blockchain",
            "altcoin", "token", "defi", "nft", "binance", "coinbase",
            "web3", "mining", "wallet", "staking", "smart contract",
            "btc", "eth", "xrp", "sol", "solana", "cardano", "dao"
        }
    },
    "regions": {
        "europe": {
            "europe", "france", "ecb", "germany", "italy", "eurozone",
            "eu", "european union", "brussels", "london", "uk"
        },
        "usa": {
            "usa", "fed", "s&p", "nasdaq", "dow jones", "united states",
            "america", "washington", "wall street"
        },
        "asia": {
            "china", "japan", "korea", "india", "asia", "emerging asia",
            "beijing", "tokyo", "shanghai", "hong kong"
        },
        "global": {
            "world", "acwi", "international", "global", "worldwide",
            "emerging markets", "brics"
        }
    }
}

# HTTP Session for connection reuse
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "TradePulseBot/1.0",
    "Accept": "application/json",
    "Connection": "keep-alive"
})

# File paths
MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
NEWS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "news.json")
THEMES_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "themes.json")

# Create directories
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(os.path.dirname(NEWS_JSON_PATH), exist_ok=True)

# Dynamic limits allocation
def allocate_limits(total: int, weights: Dict[str, float]) -> Dict[str, int]:
    """Dynamically allocate limits based on weights"""
    total_weight = sum(weights.values())
    allocated = {k: int(total * (w / total_weight)) for k, w in weights.items()}
    
    # Adjust for rounding errors
    diff = total - sum(allocated.values())
    if diff != 0:
        # Add difference to largest allocation
        max_key = max(allocated.keys(), key=lambda k: allocated[k])
        allocated[max_key] += diff
    
    return allocated

# Configuration with dynamic allocation
BASE_COUNTRY_WEIGHTS = {
    "us": 0.30,
    "france": 0.15,
    "uk": 0.12,
    "germany": 0.12,
    "china": 0.10,
    "japan": 0.08,
    "global": 0.13
}

BASE_SOURCE_WEIGHTS = {
    "general_news": 0.25,
    "stock_news": 0.40,
    "crypto_news": 0.15,
    "fmp_articles": 0.12,
    "press_releases": 0.08
}

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
    "news_limits": allocate_limits(120, BASE_SOURCE_WEIGHTS),
    "output_limits": allocate_limits(MAX_TOTAL, BASE_COUNTRY_WEIGHTS),
    "category_limits": {
        "crypto": 8
    },
    "max_total_articles": MAX_TOTAL,
    "days_ahead": DAYS_AHEAD,
    "days_back": DAYS_BACK
}

# -------------------------------------------------
# === ENHANCED HELPER FUNCTIONS ==================
# -------------------------------------------------

def embed(text: str) -> Optional[np.ndarray]:
    """Generate embeddings for text"""
    if not EMBED_MODEL:
        return None
    try:
        return EMBED_MODEL.encode([text])[0]
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        return None

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

def detect_language(text: str) -> str:
    """Language detection with fallback"""
    if not ML_ENABLED:
        return "en"
    try:
        lang = detect(text)[:2]
        return lang if lang in NLP_PIPELINES else "en"
    except:
        return "en"

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

def enhanced_keyword_matching(text: str, weight_class: str) -> int:
    """Enhanced keyword matching with regex and semantic expansion"""
    if weight_class not in KEYWORD_PATTERNS:
        return 0
    
    matches = 0
    text_lower = text.lower()
    
    # Pattern-based matching
    for pattern in KEYWORD_PATTERNS[weight_class]:
        if pattern.search(text):
            matches += 1
    
    # Semantic expansion (if FAISS available)
    if faiss_index is not None:
        for keyword in KEYWORD_WEIGHTS[weight_class]:
            expanded = expand_with_faiss(keyword)
            for exp_kw in expanded:
                if exp_kw in text_lower:
                    matches += 0.5  # Lower weight for semantic matches
    
    return int(matches)

def theme_keyword_matching(text: str, theme_keywords: Set[str]) -> bool:
    """Enhanced theme matching with word boundaries"""
    text_lower = text.lower()
    for keyword in theme_keywords:
        # Use regex with word boundaries for more accurate matching
        pattern = re.compile(rf'\b{re.escape(keyword)}\b', re.IGNORECASE)
        if pattern.search(text):
            return True
        
        # Semantic expansion
        for exp_kw in expand_with_faiss(keyword):
            if exp_kw in text_lower:
                return True
    
    return False

def make_uid(title: str, source: str, raw_date: str) -> str:
    """Generate unique identifier for deduplication"""
    return hashlib.sha256(f"{title}{source}{raw_date}".encode()).hexdigest()[:16]

def make_cache_key(endpoint: str, params: Optional[Dict] = None) -> str:
    """Generate cache key for Redis"""
    return hashlib.md5(f"{endpoint}|{params}".encode()).hexdigest()

def read_existing_news() -> Optional[Dict]:
    """Reads existing JSON file as fallback"""
    try:
        with open(NEWS_JSON_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

# -------------------------------------------------
# === ENHANCED API FETCHING ======================
# -------------------------------------------------

if OBSERVABILITY_ENABLED and breaker:
    @breaker
    async def fetch_api_data_async(endpoint: str, params: Optional[Dict] = None) -> List[Dict]:
        """Enhanced async API fetching with cache, circuit breaker, and metrics"""
        cache_key = make_cache_key(endpoint, params)
        
        # Check cache
        if redis_cli:
            try:
                if (cached := redis_cli.get(cache_key)):
                    return orjson.loads(cached)
            except Exception as e:
                logger.warning(f"Cache read error: {e}")
        
        if params is None:
            params = {}
        params["apikey"] = CONFIG["api_key"]
        
        t0 = datetime.now()
        try:
            async with rate_limiter:
                async with httpx.AsyncClient(timeout=20) as client:
                    r = await client.get(endpoint, params=params, follow_redirects=True)
                    if r.status_code == 429:
                        retry_after = int(r.headers.get("Retry-After", 1))
                        await asyncio.sleep(retry_after)
                        return await fetch_api_data_async(endpoint, params)
                    r.raise_for_status()
            
            data = r.json()
            result = data if isinstance(data, list) else [data] if data else []
            
            # Cache result
            if redis_cli:
                try:
                    redis_cli.setex(cache_key, 900, orjson.dumps(result))  # 15 min
                except Exception as e:
                    logger.warning(f"Cache write error: {e}")
            
            METRIC_FETCH_SUCCESS.labels(endpoint=endpoint).inc()
            return result
            
        except Exception as e:
            METRIC_ERRORS.labels(endpoint=endpoint).inc()
            logger.error(f"API fetch error", endpoint=endpoint, error=str(e))
            return []
        finally:
            METRIC_LATENCY.labels(endpoint=endpoint).observe(
                (datetime.now() - t0).total_seconds()
            )

    def fetch_api_data(endpoint: str, params: Optional[Dict] = None) -> List[Dict]:
        """Sync wrapper for async API fetching"""
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        return loop.run_until_complete(fetch_api_data_async(endpoint, params))

else:
    # Fallback sync implementation
    @retry(wait=wait_random_exponential(multiplier=1, max=30), stop=stop_after_attempt(5)) if HAS_TENACITY else lambda f: f
    def fetch_api_data(endpoint: str, params: Optional[Dict] = None) -> List[Dict]:
        """Fallback sync API fetching"""
        if not CONFIG["api_key"]:
            logger.error("FMP API key not defined. Please set FMP_API_KEY in environment variables.")
            return []
            
        if params is None:
            params = {}
        params["apikey"] = CONFIG["api_key"]
        
        try:
            logger.debug(f"Fetching data from {endpoint}")
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

# -------------------------------------------------
# === NEWS SOURCE GETTERS ========================
# -------------------------------------------------

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

# -------------------------------------------------
# === ENHANCED CLASSIFICATION ====================
# -------------------------------------------------

def determine_category_ml(article: Dict, source: Optional[str] = None) -> Category:
    """ML-enhanced category determination with fallback"""
    text = f"{article.get('title', '')} {article.get('text', '')}"
    
    # Try ML first
    ml_cat, confidence = ml_predict(text, CATEGORY_CLF)
    if ml_cat and confidence > 0.55:
        logger.debug(f"ML category: {ml_cat} (confidence: {confidence:.2f})")
        return ml_cat
    
    # Fallback to rule-based
    return determine_category_fallback(article, source)

def determine_category_fallback(article: Dict, source: Optional[str] = None) -> Category:
    """Enhanced rule-based category determination"""
    # Check symbol for crypto
    if article.get("symbol") and any(ticker in str(article.get("symbol")) for ticker in ["BTC", "ETH", "CRYPTO", "COIN"]):
        return "crypto"
        
    text = (article.get("text", "") + " " + article.get("title", "")).lower()
    
    # Use enhanced theme matching
    for theme_category, themes in THEMES_DOMINANTS["sectors"].items():
        if theme_keyword_matching(text, themes):
            return theme_category if theme_category in ["crypto", "tech"] else "companies"
    
    # Macro themes
    for theme_name, theme_keywords in THEMES_DOMINANTS["macroeconomics"].items():
        if theme_keyword_matching(text, theme_keywords):
            return "economy"
    
    # Default fallback with keyword enhancement
    if enhanced_keyword_matching(text, "high_impact") > 2:
        return "markets"
    
    return "companies"

def determine_impact_ml(article: Dict) -> Impact:
    """ML-enhanced impact determination with fallback"""
    text = f"{article.get('title', '')} {article.get('text', '')}"
    
    # Try ML first
    ml_impact, confidence = ml_predict(text, IMPACT_CLF)
    if ml_impact and confidence > 0.55:
        logger.debug(f"ML impact: {ml_impact} (confidence: {confidence:.2f})")
        return ml_impact
    
    # Fallback to enhanced rule-based
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
    
    # Use enhanced keyword matching
    positive_matches = enhanced_keyword_matching(text, "high_impact")  # Assuming positive context
    negative_matches = enhanced_keyword_matching(text, "medium_impact")  # Mixed sentiment
    
    # Simple heuristic based on keyword patterns
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

def determine_country_ner(article: Dict) -> str:
    """NER-enhanced country determination with fallback"""
    if not NLP_PIPELINES:
        return determine_country_fallback(article)
    
    lang = article.get("lang", "en")
    nlp = NLP_PIPELINES.get(lang, NLP_PIPELINES.get("en"))
    
    if nlp:
        try:
            doc = nlp(article.get("title", ""))
            for ent in doc.ents:
                if ent.label_ == "GPE":  # Geopolitical entity
                    ent_text = ent.text.lower()
                    if "france" in ent_text or "french" in ent_text:
                        return "france"
                    elif "germany" in ent_text or "german" in ent_text:
                        return "germany"
                    elif "uk" in ent_text or "britain" in ent_text or "british" in ent_text:
                        return "uk"
                    elif "china" in ent_text or "chinese" in ent_text:
                        return "china"
                    elif "japan" in ent_text or "japanese" in ent_text:
                        return "japan"
        except Exception as e:
            logger.debug(f"NER error: {e}")
    
    return determine_country_fallback(article)

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
    
    # Use enhanced theme matching for regions
    for region_name, region_keywords in THEMES_DOMINANTS["regions"].items():
        if theme_keyword_matching(text, region_keywords):
            return region_name if region_name in ["france", "uk", "germany", "china", "japan"] else "us"
    
    return "us"

# Use ML-enhanced functions
determine_category = determine_category_ml
determine_impact = determine_impact_ml
determine_country = determine_country_ner

def extract_themes(article: Dict) -> Dict[str, List[str]]:
    """Enhanced theme identification with improved matching"""
    text = article.get("title", "").lower()
    themes_detected = {"macroeconomics": [], "sectors": [], "regions": []}
    
    for axis, groups in THEMES_DOMINANTS.items():
        for theme, keywords in groups.items():
            if theme_keyword_matching(text, keywords):
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
    
    # Add language detection
    if ML_ENABLED:
        normalized["lang"] = detect_language(title + " " + text)
    
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

def compute_importance_score(article: Dict, category: str) -> float:
    """Enhanced importance scoring with explicit weights and semantic matching"""
    content = f"{article.get('title', '')} {article.get('content', '')}".lower()
    article_source = article.get("source", "").lower()
    
    # Enhanced keyword scoring with regex patterns
    high_matches = enhanced_keyword_matching(content, "high_impact")
    medium_matches = enhanced_keyword_matching(content, "medium_impact")
    
    # Apply dynamic weights
    high_keyword_score = min(40, high_matches * WEIGHTS.get("high_keywords", 4))
    medium_keyword_score = min(20, medium_matches * WEIGHTS.get("medium_keywords", 2))
    
    # Enhanced source scoring
    source_score = 0
    for source, weight in SOURCE_WEIGHTS.items():
        if source in article_source:
            source_score = weight * WEIGHTS.get("source_premium", 3)
            break
    
    # Content quality scoring
    title_length = len(article.get("title", ""))
    text_length = len(article.get("content", ""))
    
    content_score = (
        min(5, title_length / 50) + 
        min(10, text_length / 500)
    ) * WEIGHTS.get("content_length", 1)
    
    # Impact scoring with enhanced detection
    impact = article.get("impact", "neutral")
    impact_multiplier = {"negative": 1.2, "positive": 1.1, "neutral": 1.0}[impact]
    impact_score = 10 * impact_multiplier * WEIGHTS.get("impact_factor", 2.5)
    
    # Recency boost
    try:
        article_date = datetime.strptime(article.get("rawDate", "").split(" ")[0], "%Y-%m-%d")
        days_old = (datetime.now() - article_date).days
        recency_multiplier = max(0.5, 1 - (days_old / 30)) * WEIGHTS.get("recency_boost", 1.2)
    except:
        recency_multiplier = 1.0
    
    total_score = (
        high_keyword_score + 
        medium_keyword_score + 
        source_score + 
        content_score + 
        impact_score
    ) * recency_multiplier
    
    # Category-specific adjustments
    if category == "crypto_news":
        total_score *= 0.9  # Slightly reduce crypto importance
    elif category == "general_news":
        total_score *= 1.1  # Boost general news
    
    return min(100, max(0, total_score))

def calculate_output_limits(articles_by_country: Dict, max_total: int = 150) -> Dict[str, int]:
    """Enhanced output limits calculation with dynamic allocation"""
    if not articles_by_country:
        return CONFIG["output_limits"]
    
    # Calculate actual distribution
    actual_counts = {country: len(articles) for country, articles in articles_by_country.items()}
    total_actual = sum(actual_counts.values())
    
    if total_actual == 0:
        return CONFIG["output_limits"]
    
    # Blend base weights with actual distribution
    adjusted_weights = {}
    for country in BASE_COUNTRY_WEIGHTS.keys():
        base_weight = BASE_COUNTRY_WEIGHTS[country]
        actual_weight = actual_counts.get(country, 0) / total_actual
        # 70% base, 30% actual distribution
        adjusted_weights[country] = 0.7 * base_weight + 0.3 * actual_weight
    
    # Handle countries not in base weights
    for country in actual_counts.keys():
        if country not in adjusted_weights:
            adjusted_weights[country] = 0.05  # Small allocation
    
    return allocate_limits(max_total, adjusted_weights)

def determine_event_impact(event: Dict) -> str:
    """Enhanced event impact determination"""
    high_impact_patterns = [
        r'\b(interest rate|fed interest|ecb interest|inflation rate|gdp|employment)\b',
        r'\b(non-farm payrolls|cpi|retail sales|fomc|federal reserve)\b'
    ]
    
    medium_impact_patterns = [
        r'\b(pmi|consumer confidence|trade balance|industrial production)\b',
        r'\b(housing starts|durable goods|factory orders|earnings report)\b'
    ]
    
    event_name = event.get("event", "").lower()
    
    for pattern in high_impact_patterns:
        if re.search(pattern, event_name, re.IGNORECASE):
            return "high"
    
    for pattern in medium_impact_patterns:
        if re.search(pattern, event_name, re.IGNORECASE):
            return "medium"
    
    # Check explicit impact field
    explicit_impact = event.get("impact", "").lower()
    if explicit_impact in ["high", "medium", "low"]:
        return explicit_impact
    
    return "low"

def calculate_event_score(event: Dict) -> int:
    """Enhanced event scoring"""
    score = 0
    
    impact = determine_event_impact(event)
    impact_scores = {"high": 10, "medium": 5, "low": 1}
    score += impact_scores.get(impact, 1)
    
    # Country importance
    country_weights = {"US": 3, "EU": 2, "UK": 2, "CN": 1, "JP": 1}
    country = event.get("country", "")
    score += country_weights.get(country, 0)
    
    # Forecast vs actual deviation
    if event.get("actual") and event.get("forecast"):
        try:
            actual = float(re.sub(r'[^\d.-]', '', str(event.get("actual"))))
            forecast = float(re.sub(r'[^\d.-]', '', str(event.get("forecast"))))
            deviation = abs((actual - forecast) / forecast) if forecast != 0 else 0
            
            if deviation > 0.1:  # 10%+ deviation
                score += 5
            elif deviation > 0.05:  # 5%+ deviation
                score += 3
            elif deviation > 0.02:  # 2%+ deviation
                score += 1
        except (ValueError, TypeError, ZeroDivisionError):
            pass
    
    return score

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
                # Enhanced date parsing
                if "rawDate" in article:
                    date_str = article["rawDate"].split(" ")[0]
                elif "date" in article:
                    # Handle DD/MM/YYYY format
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

def build_theme_summary(theme_name: str, theme_data: Dict) -> str:
    """Enhanced theme summary generation"""
    count = theme_data.get("count", 0)
    articles = theme_data.get("articles", [])
    sentiment_distribution = theme_data.get("sentiment_distribution", {})

    if not articles:
        return f"The theme '{theme_name}' appeared in {count} articles recently."

    sentiment_info = ""
    if sentiment_distribution:
        pos = sentiment_distribution.get("positive", 0)
        neg = sentiment_distribution.get("negative", 0)
        neu = sentiment_distribution.get("neutral", 0)
        
        if pos > neg + 20:
            sentiment_info = f" Market sentiment is predominantly positive ({pos:.1f}%)."
        elif neg > pos + 20:
            sentiment_info = f" Market sentiment is predominantly negative ({neg:.1f}%)."
        else:
            sentiment_info = f" Market sentiment is mixed ({pos:.1f}% positive, {neg:.1f}% negative, {neu:.1f}% neutral)."

    examples = articles[:3]  # Top 3 examples
    examples_text = "Examples: " + " | ".join(f"« {ex} »" for ex in examples)

    return (
        f"📊 **{theme_name.upper()}** was prominent in **{count} articles** during the analysis period."
        f"{sentiment_info} {examples_text}"
    )

def fetch_all_news_sources() -> Dict[str, List[Dict]]:
    """Fetch all news sources concurrently with enhanced error handling"""
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
    """Enhanced news processing with improved diversity tracking"""
    formatted_data = {
        "lastUpdated": datetime.now().isoformat()
    }
    
    for country in CONFIG["output_limits"].keys():
        formatted_data[country] = []
    
    all_articles = []
    
    # Enhanced source diversity tracking
    source_stats = Counter()
    category_stats = Counter()
    
    for source_type, articles in news_sources.items():
        for article in articles:
            normalized = normalize_article(article, source_type)
            
            # Enhanced content quality checks
            if (len(normalized["title"]) < 10 or 
                len(normalized["text"]) < 50 or
                not normalized["title"].strip() or
                not normalized["text"].strip()):
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
            
            # Add language if detected
            if "lang" in normalized:
                news_item["lang"] = normalized["lang"]
            
            # Generate unique ID for deduplication
            news_item["id"] = make_uid(news_item["title"], news_item["source"], news_item["rawDate"])
            
            news_item["importance_score"] = compute_importance_score(news_item, source_type)
            
            all_articles.append(news_item)
            source_stats[normalized["site"]] += 1
            category_stats[category] += 1
    
    # Enhanced diversity analysis
    total_articles = len(all_articles)
    if total_articles > 0:
        logger.info(f"📊 Source diversity analysis:")
        dominant_sources = source_stats.most_common(5)
        for source, count in dominant_sources:
            share = count / total_articles * 100
            logger.info(f"  {source}: {count} articles ({share:.1f}%)")
            if share > 40:  # Alert for over-dominance
                logger.warning(f"⚠️ Source over-dominance detected: {source} ({share:.1f}%)")
        
        logger.info(f"📈 Category distribution:")
        for category, count in category_stats.most_common():
            share = count / total_articles * 100
            logger.info(f"  {category}: {count} articles ({share:.1f}%)")
    
    # Remove duplicates by ID
    all_articles = remove_duplicates_by_id(all_articles)
    logger.info(f"Deduplication: {total_articles} → {len(all_articles)} articles")
    
    # Sort by importance score
    all_articles.sort(key=lambda x: x["importance_score"], reverse=True)
    
    # Distribute by country
    articles_by_country = {}
    for article in all_articles:
        country = article["country"]
        if country not in articles_by_country:
            articles_by_country[country] = []
        articles_by_country[country].append(article)
    
    # Calculate appropriate limits with enhanced logic
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
    
    # Apply category limits with enhanced balancing
    if "category_limits" in CONFIG:
        for category, limit in CONFIG["category_limits"].items():
            category_articles = []
            for country, articles in formatted_data.items():
                if isinstance(articles, list):
                    for article in articles:
                        if article.get("category") == category:
                            category_articles.append((country, article))
            
            if len(category_articles) > limit:
                # Sort by importance score and keep top articles
                category_articles.sort(key=lambda x: x[1].get("importance_score", 0), reverse=True)
                articles_to_remove = category_articles[limit:]
                
                for country, article in articles_to_remove:
                    if country in formatted_data and isinstance(formatted_data[country], list):
                        if article in formatted_data[country]:
                            formatted_data[country].remove(article)
                
                logger.info(f"Limited category '{category}' to {limit} articles (removed {len(articles_to_remove)})")
    
    final_count = sum(len(articles) for articles in formatted_data.values() if isinstance(articles, list))
    logger.info(f"📰 Final article count: {final_count}")
    
    return formatted_data

def process_events_data(earnings: List[Dict], economic: List[Dict]) -> List[Dict]:
    """Enhanced event processing with better scoring"""
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
            symbol = earning.get('symbol', 'Unknown')
            eps = earning.get('epsEstimated', 0)
            
            temp_event = {
                "event": f"Earnings {symbol}",
                "type": "earnings",
                "title": f"Earnings {symbol} - Forecast: ${eps} per share"
            }
            
            impact = "medium"
            score = calculate_event_score(temp_event)
            
            event = {
                "title": f"Earnings {symbol} - Forecast: ${eps} per share",
                "date": format_date(earning.get("date", "")),
                "time": "16:30",
                "type": "earnings",
                "importance": impact,
                "score": score
            }
            events.append(event)
    
    # Sort by score and date, limit to top events
    events.sort(key=lambda x: (x["score"], x["date"]), reverse=True)
    return events[:20]  # Increased limit

def process_ipos_data(ipos: List[Dict]) -> List[Dict]:
    """Enhanced IPO processing"""
    formatted_ipos = []
    for ipo in ipos:
        try:
            company = ipo.get('company', 'Unknown Company')
            symbol = ipo.get('symbol', 'N/A')
            
            formatted_ipos.append({
                "title": f"IPO: {company} ({symbol})",
                "date": format_date(ipo.get("date", "")),
                "time": "09:00",
                "type": "ipo",
                "importance": "medium",
                "score": 6,
                "exchange": ipo.get("exchange", ""),
                "priceRange": ipo.get("priceRange", ""),
                "marketCap": ipo.get("marketCap", ""),
                "status": ipo.get("actions", "Expected")
            })
        except Exception as e:
            logger.warning(f"Error processing IPO: {str(e)}")
    return formatted_ipos

def process_ma_data(ma_list: List[Dict]) -> List[Dict]:
    """Enhanced M&A processing"""
    formatted_ma = []
    for ma in ma_list:
        try:
            company = ma.get('companyName', 'Unknown Company')
            target = ma.get('targetedCompanyName', 'Unknown Target')
            
            formatted_ma.append({
                "title": f"M&A: {company} acquires {target}",
                "date": format_date(ma.get("transactionDate", "")),
                "time": "10:00",
                "type": "m&a",
                "importance": "medium",
                "score": 7,
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
    
    # Generate enhanced summaries
    for period, axes in themes_data.items():
        for axis, themes in axes.items():
            for theme_name, theme_data in themes.items():
                summary = build_theme_summary(theme_name, theme_data)
                themes_data[period][axis][theme_name]["ai_summary"] = summary
    
    themes_output = {
        "themes": themes_data,
        "lastUpdated": datetime.now().isoformat(),
        "analysisCount": sum(len(articles) for articles in news_data.values() if isinstance(articles, list)),
        "weights_version": "enhanced_v2",
        "ml_enabled": ML_ENABLED,
        "observability_enabled": OBSERVABILITY_ENABLED
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
    """Enhanced main execution function"""
    try:
        print("\n🚀 TradePulse News Updater - Enhanced ML Version v2.0")
        print("=" * 70)
        print(f"📊 ML Features: {'✅ Enabled' if ML_ENABLED else '❌ Disabled'}")
        print(f"📈 Observability: {'✅ Enabled' if OBSERVABILITY_ENABLED else '❌ Disabled'}")
        print(f"🔄 Cache: {'✅ Redis' if (OBSERVABILITY_ENABLED and redis_cli) else '❌ Memory only'}")
        print(f"🛡️ Circuit Breaker: {'✅ Active' if (OBSERVABILITY_ENABLED and breaker) else '❌ Disabled'}")
        print(f"🎯 Enhanced Scoring: ✅ Active")
        print(f"🔍 Semantic Matching: {'✅ FAISS' if faiss_index else '❌ Keyword only'}")
        print("=" * 70)
        
        existing_data = read_existing_news()
        
        # Fetch news sources concurrently
        logger.info("🔄 Fetching news from all sources...")
        news_sources = fetch_all_news_sources()
        
        # Fetch events concurrently
        logger.info("📅 Fetching economic events...")
        with ThreadPoolExecutor(max_workers=4) as executor:
            earnings_future = executor.submit(get_earnings_calendar)
            economic_future = executor.submit(get_economic_calendar)
            ipos_future = executor.submit(get_ipos_calendar)
            ma_future = executor.submit(get_mergers_acquisitions)
            
            earnings = earnings_future.result()
            economic = economic_future.result()
            ipos = ipos_future.result()
            mergers = ma_future.result()
        
        total_news = sum(len(articles) for articles in news_sources.values())
        logger.info(f"📰 Total raw news retrieved: {total_news}")
        
        if total_news == 0:
            logger.warning("⚠️ No news retrieved, using existing data")
            if existing_data:
                return True
            return False
        
        # Process news with enhanced pipeline
        logger.info("🧠 Processing news with ML-enhanced pipeline...")
        news_data = process_news_data(news_sources)
        
        # Process events
        logger.info("📊 Processing economic events...")
        events = process_events_data(earnings, economic)
        
        # Process IPOs and M&A
        ipos_events = process_ipos_data(ipos)
        ma_events = process_ma_data(mergers)
        
        events.extend(ipos_events)
        events.extend(ma_events)
        
        # Update files
        logger.info("💾 Updating output files...")
        success_news = update_news_json_file(news_data, events)
        success_themes = generate_themes_json(news_data)
        
        # Display enhanced analytics
        top_themes = extract_top_themes(news_data, days=30)
        logger.info("🎯 Dominant themes over 30 days:")
        for axis, themes in top_themes.items():
            logger.info(f"  📊 {axis.capitalize()}:")
            for theme, details in list(themes.items())[:5]:  # Top 5 per axis
                sentiment = details.get("sentiment_distribution", {})
                pos = sentiment.get("positive", 0)
                neg = sentiment.get("negative", 0)
                logger.info(f"    • {theme}: {details['count']} articles (💚{pos:.0f}% 💔{neg:.0f}%)")
        
        final_stats = {
            "total_processed": sum(len(articles) for articles in news_data.values() if isinstance(articles, list)),
            "events_found": len(events),
            "themes_analyzed": sum(len(themes) for themes in top_themes.values()),
            "sources_used": len(set(art.get("source", "") for articles in news_data.values() 
                                   if isinstance(articles, list) for art in articles)),
            "ml_enabled": ML_ENABLED,
            "observability": OBSERVABILITY_ENABLED
        }
        
        print(f"\n✅ Pipeline completed successfully!")
        print(f"📰 Articles processed: {final_stats['total_processed']}")
        print(f"📅 Events found: {final_stats['events_found']}")
        print(f"🎯 Themes analyzed: {final_stats['themes_analyzed']}")
        print(f"📡 Sources used: {final_stats['sources_used']}")
        print(f"🚀 Performance: {'🔥 Enhanced' if ML_ENABLED else '⚡ Standard'}")
        
        return success_news and success_themes
        
    except Exception as e:
        logger.error(f"❌ Error in script execution: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TradePulse News Updater - Enhanced ML Version v2.0")
    parser.add_argument("--themes-only", action="store_true", 
                       help="Only regenerate themes.json from existing news data")
    parser.add_argument("--profile", action="store_true", 
                       help="Run with profiling enabled")
    parser.add_argument("--ml-benchmark", action="store_true", 
                       help="Benchmark ML vs rule-based classification")
    parser.add_argument("--config-check", action="store_true",
                       help="Validate configuration and show current settings")
    
    args = parser.parse_args()
    
    if args.config_check:
        print("\n🔧 Configuration Check")
        print("=" * 50)
        print(f"📊 Total limits: {CONFIG['max_total_articles']}")
        print(f"📈 Country allocation: {CONFIG['output_limits']}")
        print(f"📰 Source allocation: {CONFIG['news_limits']}")
        print(f"⚖️ Dynamic weights: {WEIGHTS}")
        print(f"🎯 ML models: {'✅' if (IMPACT_CLF and CATEGORY_CLF) else '❌'}")
        print(f"🔍 FAISS index: {'✅' if faiss_index else '❌'}")
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
        success = main()
        profiler.disable()
        
        stats = pstats.Stats(profiler)
        stats.sort_stats('cumulative')
        stats.print_stats(20)  # Top 20 functions
        
        exit(0 if success else 1)
    
    success = main()
    exit(0 if success else 1)
