#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse - Investor-Grade News Updater v5.0 UNIFIED
Script for extracting news and events from Financial Modeling Prep
🚀 NEW v5.0: Unified dual-model ML system (sentiment + importance)
✨ Features: Quality scoring, confidence thresholds, needs_review flag
"""

import os
import json
import requests
import logging
from datetime import datetime, timedelta
import re
from collections import Counter
import time
import psutil
from functools import lru_cache
import subprocess
from pathlib import Path
import hashlib
from typing import List, Dict, Optional, Tuple

# Enhanced sentiment analysis imports
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# Logger configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Performance monitoring
_process = psutil.Process(os.getpid())

# File paths
NEWS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "news.json")
THEMES_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "themes.json")
CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", ".ml_cache.json")

# 🔑 ENHANCED FEATURE FLAGS v5.0 - UNIFIED DUAL MODELS
USE_FINBERT = os.getenv("TRADEPULSE_USE_FINBERT", "1") == "1"
SENTIMENT_PROFILING = os.getenv("TRADEPULSE_SENTIMENT_PROFILING", "0") == "1"
ENABLE_MODEL_METRICS = os.getenv("TRADEPULSE_METRICS", "1") == "1"
USE_CACHE = os.getenv("TRADEPULSE_USE_CACHE", "1") == "1"
BATCH_SIZE = int(os.getenv("TRADEPULSE_BATCH_SIZE", "32"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.65"))

# ---------------------------------------------------------------------------
# 🚀 DUAL FINBERT MODELS CONFIGURATION
# ---------------------------------------------------------------------------

_MODEL_SENTIMENT = os.getenv("TRADEPULSE_MODEL_SENTIMENT", "Bencode92/tradepulse-finbert-sentiment")
_MODEL_IMPORTANCE = os.getenv("TRADEPULSE_MODEL_IMPORTANCE", "Bencode92/tradepulse-finbert-importance")
_HF_TOKEN = os.getenv("HF_READ_TOKEN")

# Importance aliases mapping
_ALIAS = {
    "general": ("general", "générale", "low", "generale"),
    "important": ("important", "importante", "medium"),
    "critical": ("critical", "critique", "high")
}

# Global model metadata
_MODEL_METADATA = {
    "version": "unified-dual-model-v5.0",
    "sentiment_model": _MODEL_SENTIMENT,
    "importance_model": _MODEL_IMPORTANCE,
    "dual_model_system": True,
    "batch_processing": True,
    "load_time": None,
    "performance_metrics": {}
}

# ---------------------------------------------------------------------------
# 🚀 UNIFIED DUAL ML LABELER CLASS v5.0
# ---------------------------------------------------------------------------

class DualMLLabeler:
    """
    Unified dual-model ML labeler for sentiment and importance analysis.
    Loads models once and processes texts in batches with caching.
    """
    
    def __init__(self, 
                 hf_token: Optional[str] = None,
                 batch_size: int = BATCH_SIZE,
                 use_cache: bool = USE_CACHE):
        """
        Initialize the dual ML labeler.
        
        Args:
            hf_token: HuggingFace token for private models
            batch_size: Batch size for inference
            use_cache: Whether to use prediction caching
        """
        self.batch_size = batch_size
        self.use_cache = use_cache
        self.cache: Dict[str, Dict] = {}
        self._cache_hits = 0
        self._cache_misses = 0
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        
        logger.info(f"🚀 Loading dual ML models on {self._device}...")
        self.sent_tok, self.sent_mdl = self._load_model(_MODEL_SENTIMENT, hf_token)
        self.imp_tok, self.imp_mdl = self._load_model(_MODEL_IMPORTANCE, hf_token)
        logger.info("✅ Models loaded successfully")
    
    def _load_model(self, model_name: str, token: Optional[str]) -> Tuple:
        """Load a HuggingFace model with optional token."""
        try:
            kwargs = {"use_auth_token": token} if token else {}
            tokenizer = AutoTokenizer.from_pretrained(model_name, **kwargs)
            model = AutoModelForSequenceClassification.from_pretrained(model_name, **kwargs)
            model = model.to(self._device).eval()
            logger.info(f"✅ Loaded {model_name}")
            return tokenizer, model
        except Exception as e:
            logger.error(f"❌ Failed to load {model_name}: {e}")
            raise
    
    def predict(self, texts: List[str]) -> List[Dict]:
        """
        Predict sentiment and importance for a list of texts.
        
        Args:
            texts: List of text strings to analyze
            
        Returns:
            List of dicts with keys:
                - sentiment: "positive", "neutral", or "negative"
                - sent_conf: sentiment confidence (0-1)
                - importance: "critical", "important", or "general"
                - imp_conf: importance confidence (0-1)
        """
        if not texts:
            return []
        
        results: List[Optional[Dict]] = [None] * len(texts)
        uncached_indices = []
        uncached_texts = []
        
        # Check cache
        for i, text in enumerate(texts):
            if self.use_cache:
                cache_key = self._get_cache_key(text)
                if cache_key in self.cache:
                    results[i] = self.cache[cache_key]
                    self._cache_hits += 1
                else:
                    uncached_indices.append(i)
                    uncached_texts.append(text)
                    self._cache_misses += 1
            else:
                uncached_indices.append(i)
                uncached_texts.append(text)
        
        # Process uncached texts
        if uncached_texts:
            logger.info(f"🔍 Processing {len(uncached_texts)} uncached texts...")
            
            # Get predictions
            sent_probs = self._batch_predict(uncached_texts, self.sent_tok, self.sent_mdl)
            imp_probs = self._batch_predict(uncached_texts, self.imp_tok, self.imp_mdl)
            
            # Merge results
            for j, idx in enumerate(uncached_indices):
                result = self._merge_predictions(sent_probs[j], imp_probs[j])
                results[idx] = result
                
                # Update cache
                if self.use_cache:
                    cache_key = self._get_cache_key(texts[idx])
                    self.cache[cache_key] = result
        
        return results
    
    def _batch_predict(self, texts: List[str], tokenizer, model) -> List[Dict]:
        """Run batch prediction on texts."""
        all_probs = []
        
        for i in range(0, len(texts), self.batch_size):
            batch_texts = texts[i:i + self.batch_size]
            
            try:
                # Tokenize
                inputs = tokenizer(
                    batch_texts,
                    truncation=True,
                    padding=True,
                    max_length=512,
                    return_tensors="pt"
                ).to(self._device)
                
                # Predict
                with torch.no_grad():
                    logits = model(**inputs).logits
                    probs = logits.softmax(dim=-1).cpu()
                
                # Convert to dict format
                id2label = {int(k): v.lower() for k, v in model.config.id2label.items()}
                
                for row in probs:
                    prob_dict = {id2label[k]: float(row[k]) for k in range(len(id2label))}
                    all_probs.append(prob_dict)
                    
            except Exception as e:
                logger.error(f"Batch prediction error: {e}")
                # Return neutral predictions on error
                for _ in batch_texts:
                    all_probs.append({})
        
        return all_probs
    
    def _merge_predictions(self, sent_probs: Dict, imp_probs: Dict) -> Dict:
        """Merge sentiment and importance predictions."""
        # Process sentiment
        if sent_probs:
            # Handle potential label formats
            if "positive" in sent_probs:
                sent_label, sent_conf = max(sent_probs.items(), key=lambda x: x[1])
            else:
                # Handle label_0, label_1, label_2 format
                label_map = {"label_0": "negative", "label_1": "neutral", "label_2": "positive"}
                mapped_probs = {label_map.get(k, k): v for k, v in sent_probs.items()}
                sent_label, sent_conf = max(mapped_probs.items(), key=lambda x: x[1])
        else:
            sent_label, sent_conf = "neutral", 0.33
        
        # Process importance with alias normalization
        if imp_probs:
            normalized = {}
            for target, aliases in _ALIAS.items():
                max_prob = max((imp_probs.get(alias, 0.0) for alias in aliases), default=0.0)
                normalized[target] = max_prob
            
            # Normalize probabilities
            total = sum(normalized.values())
            if total > 0:
                normalized = {k: v/total for k, v in normalized.items()}
            else:
                normalized = {"general": 1.0, "important": 0.0, "critical": 0.0}
            
            imp_label, imp_conf = max(normalized.items(), key=lambda x: x[1])
        else:
            imp_label, imp_conf = "general", 0.5
        
        return {
            "sentiment": sent_label,
            "sent_conf": round(sent_conf, 3),
            "importance": imp_label,
            "imp_conf": round(imp_conf, 3)
        }
    
    def _get_cache_key(self, text: str) -> str:
        """Generate cache key for text."""
        return hashlib.sha256(text.encode()).hexdigest()[:16]
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        total = self._cache_hits + self._cache_misses
        hit_rate = self._cache_hits / total * 100 if total > 0 else 0
        
        return {
            "hits": self._cache_hits,
            "misses": self._cache_misses,
            "hit_rate": round(hit_rate, 1),
            "cache_size": len(self.cache)
        }

# Singleton instance
_labeler_instance = None

def get_labeler(hf_token: Optional[str] = None, **kwargs) -> DualMLLabeler:
    """Get or create singleton labeler instance."""
    global _labeler_instance
    if _labeler_instance is None:
        _labeler_instance = DualMLLabeler(hf_token=hf_token, **kwargs)
    return _labeler_instance

# ---------------------------------------------------------------------------
# 🚀 LEGACY MODEL FUNCTIONS (for compatibility)
# ---------------------------------------------------------------------------

def _load_hf(model_name: str):
    """Legacy function - now uses DualMLLabeler"""
    logger.warning("⚠️ _load_hf is deprecated, use DualMLLabeler instead")
    labeler = get_labeler(_HF_TOKEN)
    if "sentiment" in model_name.lower():
        return labeler.sent_tok, labeler.sent_mdl
    else:
        return labeler.imp_tok, labeler.imp_mdl

@lru_cache(maxsize=1)
def _get_dual_models():
    """Legacy function - returns models from DualMLLabeler"""
    labeler = get_labeler(_HF_TOKEN)
    return {
        "sentiment": (labeler.sent_tok, labeler.sent_mdl),
        "importance": (labeler.imp_tok, labeler.imp_mdl)
    }

# ---------------------------------------------------------------------------
# 🚀 CACHE SYSTEM (kept for backward compatibility)
# ---------------------------------------------------------------------------

class MLCache:
    """Legacy cache - now uses DualMLLabeler's cache"""
    def __init__(self, cache_path=CACHE_PATH):
        self.labeler = get_labeler()
    
    def get_stats(self):
        """Get cache statistics"""
        stats = self.labeler.get_cache_stats()
        return f"Cache: {stats['hits']} hits, {stats['misses']} misses ({stats['hit_rate']}% hit rate)"
    
    def finalize(self):
        """Log stats"""
        logger.info(f"🗄️ {self.get_stats()}")

# Global cache instance (for compatibility)
_ml_cache = MLCache()

def profile_step(label: str, start_ts: float):
    """Logge la durée et le delta-RSS depuis start_ts."""
    if not SENTIMENT_PROFILING:
        return
    dur = time.perf_counter() - start_ts
    rss = _process.memory_info().rss / 1024**2
    logger.info(f"⏱️  {label}: {dur:5.2f}s | RSS={rss:.0f} MB")

# ---------------------------------------------------------------------------
# QUALITY SCORING
# ---------------------------------------------------------------------------

PREMIUM_SOURCES = ["bloomberg", "reuters", "financial times", "wall street journal", "cnbc", "the economist"]

def calculate_quality_score(article):
    """
    Calculate quality score (0-100) based on multiple factors.
    Harmonized with SmartNewsCollector logic.
    """
    score = 0
    
    # Title length (max 20 points)
    title_len = len(article.get("title", ""))
    score += min(20, title_len / 5)
    
    # Content length (max 30 points)
    content = article.get("content", article.get("text", ""))
    score += min(30, len(content) / 100)
    
    # ML confidence scores (max 20 points)
    if "sentiment_conf" in article:
        score += article["sentiment_conf"] * 10
    if "importance_conf" in article:
        score += article["importance_conf"] * 10
    
    # Premium source bonus (25 points)
    source = article.get("source", "").lower()
    if any(premium in source for premium in PREMIUM_SOURCES):
        score += 25
    
    # URL presence (5 points)
    if article.get("url"):
        score += 5
    
    return min(round(score), 100)

# ---------------------------------------------------------------------------
# 🔍  BATCH INFERENCE UTILITIES (deprecated - kept for compatibility)
# ---------------------------------------------------------------------------

def batch_predict_probs(tokenizer, model, texts: list, batch_size=BATCH_SIZE) -> list[dict[str, float]]:
    """
    Legacy function - now uses DualMLLabeler internally
    """
    logger.warning("⚠️ batch_predict_probs is deprecated, use DualMLLabeler.predict() instead")
    # This is just a wrapper for compatibility
    labeler = get_labeler()
    return labeler._batch_predict(texts, tokenizer, model)

# ---------------------------------------------------------------------------
# INVESTOR-GRADE NEWS CONFIG v5.0 - OPTIMIZED FOR 30 DAYS
# ---------------------------------------------------------------------------

CONFIG = {
    # --------- CONTRAINTES GÉNÉRALES --------------------------------------
    "api_key": os.environ.get("FMP_API_KEY", ""),
    "meta": {
        "max_total_articles": 300,     # 🔧 Réduit de 500 à 300
        "days_back":          30,      # 🔧 OPTIMIZED: 90 → 30 jours
        "days_ahead":         10       # pour capter pré-annonces & agendas
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
        "general_news":    20,   # Réduit pour focus macro quality
        "stock_news":      50,   # Maintenu pour earnings season
        "crypto_news":      8,   # Réduit pour limiter bruit
        "forex_news":      15,   # Ajusté pour nouvelles devises
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
            "us":               15,  # 🔧 Réduit de 20 à 15
            "france":            4,  # 🔧 Réduit de 5 à 4
            "europe_other":      6,  # 🔧 Réduit de 8 à 6
            "asia":              8,  # 🔧 Réduit de 10 à 8
            "emerging_markets":  3   # 🔧 Réduit de 4 à 3
        },
        "max_total": 300       # 🔧 Réduit de 500 à 300
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
# THEMES v5 – haute précision (≈9-10/10) – fundamentals retiré
# ---------------------------------------------------------------------------

THEMES = {
    "macroeconomics": {
        # ───────── Inflation ─────────
        "inflation": [
            "cpi", "headline cpi", "core cpi",
            "pce", "core pce", "hicp",
            "inflation rate", "inflationary",
            "sticky prices", "price index"
        ],
        # ───────── Croissance ─────────
        "growth": [
            "gdp", "gdp growth", "gdp-yoy", "gdp-qoq",
            "retail sales", "industrial production", "industrial output",
            "construction spending", "services pmi", "manufacturing pmi",
            "ism", "business confidence"
        ],
        # ───────── Politique monétaire ─────────
        "monetary_policy": [
            # banques centrales
            "fed", "fomc", "ecb", "boj", "pboc", "boe", "snb", "rba",
            # actions
            "rate hike", "rate cut", "interest-rate", "policy rate",
            "quantitative easing", "quantitative tightening", "qe", "qt",
            "rate decision", "minutes"
        ],
        # ───────── Emploi ─────────
        "employment": [
            "non-farm payrolls", "nfp", "payrolls",
            "unemployment rate", "initial jobless claims", "jobless claims",
            "jolts", "labor market", "employment report",
            "layoffs", "job additions", "hiring"
        ],
        # ───────── Géopolitique ─────────
        "geopolitics": [
            "geopolitical", "geopolitical tension",
            "military conflict", "invasion", "war", "sanction", "embargo",
            "conflict zone", "ceasefire", "truce"
        ],
        # ───────── Transition énergétique / climat ─────────
        "energy_transition": [
            "esg", "climate policy", "net zero",
            "carbon credit", "carbon emission", "carbon market",
            "renewable", "clean energy", "green transition",
            "solar", "wind power", "hydrogen",
            "electric vehicle", "ev adoption"
        ]
    },

    "sectors": {
        # ───────── Intelligence artificielle ─────────
        "ai": [
            "artificial intelligence", "ai", "generative ai", "genai",
            "large language model", "llm", "chatgpt", "gpt-4", "openai",
            "copilot", "ai chip", "nvidia h100", "tpu", "edge ai"
        ],
        # ───────── Technologie hors-AI ─────────
        "technology": [
            "semiconductor", "chipmaker", "foundry", "fab",
            "cloud computing", "saas", "software-as-a-service",
            "cybersecurity", "5g", "iot", "data center",
            "consumer electronics", "smartphone", "pc shipments"
        ],
        # ───────── Énergie ─────────
        "energy": [
            "brent", "wti", "oil prices", "opec", "opec+",
            "lng", "natural gas", "refinery", "hydrocarbon",
            "shale", "rig count", "energy sector"
        ],
        # ───────── Finance ─────────
        "finance": [
            "bank", "banks", "lender", "treasury",
            "bond yield", "insurance", "brokerage",
            "asset management", "fintech", "stress test",
            "net interest margin", "capital ratio", "credit suisse", "regulator"
        ],
        # ───────── Défense ─────────
        "defense": [
            "military contractor", "defense contract", "pentagon", "dod",
            "nato", "defense ministry", "missile", "fighter jet",
            "army procurement", "dapa"
        ],
        # ───────── Santé ─────────
        "healthcare": [
            "fda", "ema", "mhra",
            "clinical trial", "phase iii", "phase ii",
            "biotech", "pharma", "drug approval", "vaccine",
            "medical device", "healthcare sector"
        ],
        # ───────── Consommation ─────────
        "consumer": [
            "retail sales", "same-store sales", "foot traffic",
            "e-commerce", "online shopping", "luxury brand",
            "consumer spending", "mall operator", "apparel",
            "brand release", "back-to-school"
        ],
        # ───────── Industrie & fabrication ─────────
        "industry": [
            "manufacturing", "factory output", "industrial automation",
            "robotics", "3d printing", "supply chain", "logistics",
            "industrial production", "capex cycle"
        ],
        # ───────── Transport & logistique ─────────
        "transport": [
            "shipping", "container rates", "freight", "dry bulk",
            "airline", "air traffic", "rail", "truck freight",
            "port backlog", "logistics provider"
        ],
        # ───────── Agriculture & matières premières ─────────
        "agriculture": [
            "crop", "wheat", "corn", "soybean", "grain",
            "fertilizer", "agri commodity", "harvest",
            "usda", "cotton", "coffee", "palm oil"
        ],
        # ───────── Crypto ─────────
        "crypto": [
            "bitcoin", "btc", "ethereum", "eth",
            "solana", "sol", "xrp", "doge",
            "defi", "stablecoin", "nft", "layer 2",
            "staking", "crypto exchange", "blockchain"
        ]
    },

    "regions": {
        # ───────── États-Unis ─────────
        "us": [
            "united states", "usa", "us economy",
            "washington", "white house", "treasury",
            "federal reserve", "fed", "fomc", "s&p 500"
        ],
        # ───────── Europe développée ─────────
        "europe": [
            "eurozone", "eu", "european union", "brussels",
            "ecb", "bank of england", "boe",
            "paris", "frankfurt", "london",
            "dax", "cac", "ftse", "stoxx 600"
        ],
        # ───────── Asie développée & émergente ─────────
        "asia": [
            "china", "beijing", "shanghai", "hong kong", "hsi", "yuan", "pboc",
            "japan", "tokyo", "nikkei", "yen", "boj",
            "india", "mumbai", "sensex", "korea", "kospi", "taiwan", "tsec",
            "singapore", "asean"
        ],
        # ───────── Marchés émergents ─────────
        "em": [
            "emerging markets", "emerging economy", "brics",
            "brazil", "bovespa", "rio",
            "russia", "moscow", "mosbirzha",
            "south africa", "johannesburg", "turkey", "istanbul", "bist",
            "mexico", "mexb", "indonesia", "jakarta",
            "thailand", "bangkok", "vietnam", "ho chi minh"
        ],
        # ───────── Global ─────────
        "global": [
            "global", "worldwide", "international", "world economy",
            "global markets", "imf", "world bank", "oecd", "g20", "g7"
        ]
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

THEMES_DOMINANTS = THEMES

IMPORTANT_SOURCES = SOURCES["whitelist"]
# PREMIUM_SOURCES = SOURCES["premium"]  # Already defined above

# ---------------------------------------------------------------------------
# 🔧 ENHANCED GIT HANDLER FOR ROBUST CI/CD OPERATIONS
# ---------------------------------------------------------------------------

class GitHandlerError(Exception):
    """Exception personnalisée pour les erreurs Git"""
    pass

class EnhancedGitHandler:
    """Gestionnaire Git robuste pour TradePulse CI/CD"""
    
    def __init__(self, repo_path="."):
        self.repo_path = Path(repo_path)
        self.files_to_commit = ["data/news.json", "data/themes.json"]
        self.is_ci = os.getenv("CI", "false").lower() == "true"
        
    def run_command(self, command, check=True, timeout=60):
        """Exécute une commande shell avec gestion d'erreurs"""
        try:
            logger.info(f"🔧 Git: {command}")
            result = subprocess.run(
                command,
                shell=True,
                check=check,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self.repo_path
            )
            
            if result.stdout and result.stdout.strip():
                logger.info(f"📤 Git output: {result.stdout.strip()}")
            
            return result
            
        except subprocess.TimeoutExpired:
            logger.error(f"⏰ Git command timed out: {command}")
            raise GitHandlerError(f"Command timed out: {command}")
            
        except subprocess.CalledProcessError as e:
            logger.error(f"❌ Git command failed: {command}")
            if e.stderr:
                logger.error(f"❌ Error: {e.stderr}")
            raise GitHandlerError(f"Command failed: {e.stderr}")
    
    def configure_git(self):
        """Configure Git pour l'environnement CI/CD"""
        logger.info("⚙️ Configuring Git for CI/CD...")
        
        commands = [
            'git config --local user.email "tradepulse-bot@github-actions.com"',
            'git config --local user.name "TradePulse Bot [Unified v5.0]"',
            'git config --local core.autocrlf false',
            'git config --local pull.rebase true'
        ]
        
        for command in commands:
            self.run_command(command)
            
        logger.info("✅ Git configured successfully")
    
    def check_changes(self):
        """Vérifie s'il y a des changements à committer"""
        logger.info("🔍 Checking for changes...")
        
        changes_detected = False
        
        # Ajouter les fichiers s'ils existent
        for file_path in self.files_to_commit:
            full_path = self.repo_path / file_path
            if full_path.exists():
                self.run_command(f"git add {file_path}")
                logger.info(f"✅ Added {file_path}")
                changes_detected = True
            else:
                logger.warning(f"⚠️ File not found: {file_path}")
        
        if not changes_detected:
            logger.info("📝 No files to add")
            return False
        
        # Vérifier s'il y a des changements staged
        result = self.run_command("git diff --staged --quiet", check=False)
        
        if result.returncode == 0:
            logger.info("📝 No changes detected in staged files")
            return False
        
        logger.info("📝 Changes detected and staged")
        return True
    
    def generate_commit_message(self):
        """Génère un message de commit informatif avec statistiques périodes"""
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
        
        stats_info = ""
        try:
            news_file = self.repo_path / "data/news.json"
            themes_file = self.repo_path / "data/themes.json"
            
            if news_file.exists():
                with open(news_file, 'r', encoding='utf-8') as f:
                    news_data = json.load(f)
                
                # Stats articles
                total_articles = sum(len(v) for k, v in news_data.items() if isinstance(v, list))
                
                # Stats dates si disponibles
                all_dates = []
                for articles in news_data.values():
                    if isinstance(articles, list):
                        for article in articles:
                            if 'date' in article:
                                all_dates.append(article['date'])
                
                date_range_info = ""
                if all_dates:
                    date_range_info = f"\n📅 Période couverte: {min(all_dates)} à {max(all_dates)}"
                
                stats_info = f"\n📊 Articles collectés: {total_articles}{date_range_info}"
            
            if themes_file.exists():
                with open(themes_file, 'r', encoding='utf-8') as f:
                    themes_data = json.load(f)
                
                # Compter les thèmes par période
                if 'periods' in themes_data:
                    theme_counts = {}
                    for period in ['weekly', 'monthly']:  # Removed quarterly
                        if period in themes_data['periods']:
                            count = sum(
                                len(themes) 
                                for axis_themes in themes_data['periods'][period].values() 
                                for themes in axis_themes.values() if isinstance(themes, dict)
                            )
                            theme_counts[period] = count
                    
                    if theme_counts:
                        stats_info += f"\n📈 Thèmes: W={theme_counts.get('weekly', 0)} M={theme_counts.get('monthly', 0)}"
                        
        except Exception as e:
            logger.warning(f"⚠️ Could not read statistics: {e}")
        
        commit_message = f"""🤖 Auto-update: TradePulse news & themes (Unified ML v5.0)

📅 Timestamp: {timestamp}
🔗 Source: Financial Modeling Prep API
🧠 AI Models: Unified Dual-Model System (sentiment + importance)
🌍 Window: 30 days rolling{stats_info}

✨ v5.0: Unified ML with quality scoring & confidence thresholds
[skip ci]"""
        
        return commit_message
    
    def sync_with_remote(self, max_retries=3):
        """Synchronise avec le remote de manière robuste"""
        logger.info("🔄 Syncing with remote repository...")
        
        for attempt in range(max_retries):
            try:
                # Fetch les derniers changements
                logger.info(f"📥 Fetching latest changes (attempt {attempt + 1}/{max_retries})")
                self.run_command("git fetch origin main")
                
                # Vérifier s'il y a des changements locaux
                result = self.run_command("git status --porcelain", check=False)
                if result.stdout.strip():
                    logger.info("📝 Local changes detected, preparing rebase...")
                
                # Tenter le rebase
                logger.info("🔄 Attempting rebase...")
                self.run_command("git pull --rebase --autostash origin main")
                logger.info("✅ Rebase successful")
                return True
                
            except GitHandlerError as e:
                logger.warning(f"⚠️ Sync attempt {attempt + 1}/{max_retries} failed: {e}")
                
                if attempt < max_retries - 1:
                    # Annuler le rebase en cours si nécessaire
                    try:
                        self.run_command("git rebase --abort", check=False)
                        logger.info("🔄 Rebase aborted, will retry")
                    except:
                        pass
                    
                    # Attendre avant le prochain essai
                    time.sleep(2 ** attempt)  # Backoff exponentiel
                else:
                    logger.error("❌ All sync attempts failed")
                    raise
        
        return False
    
    def commit_and_push(self, max_retries=3):
        """Effectue le commit et push de manière sécurisée"""
        if not self.check_changes():
            logger.info("📝 No changes to commit")
            return True
        
        try:
            # Configuration Git
            self.configure_git()
            
            # Créer le commit
            commit_message = self.generate_commit_message()
            logger.info("📝 Creating commit...")
            self.run_command(f'git commit -m "{commit_message}"')
            
            # Synchroniser avec le remote
            if not self.sync_with_remote():
                logger.error("❌ Failed to sync with remote")
                return False
            
            # Push avec retry
            for attempt in range(max_retries):
                try:
                    logger.info(f"🚀 Pushing changes (attempt {attempt + 1}/{max_retries})")
                    
                    if self.is_ci:
                        # En CI, utiliser push standard après rebase
                        self.run_command("git push origin HEAD:main")
                    else:
                        # En local, utiliser --force-with-lease pour plus de sécurité
                        self.run_command("git push --force-with-lease origin HEAD:main")
                    
                    logger.info("✅ Changes pushed successfully")
                    return True
                    
                except GitHandlerError as e:
                    logger.warning(f"⚠️ Push attempt {attempt + 1}/{max_retries} failed: {e}")
                    
                    if attempt < max_retries - 1:
                        # Re-sync avant le prochain essai
                        try:
                            self.sync_with_remote(max_retries=1)
                        except:
                            pass
                        time.sleep(1)
                    else:
                        logger.error("❌ All push attempts failed")
                        raise
            
            return False
            
        except Exception as e:
            logger.error(f"❌ Commit and push failed: {e}")
            return False
    
    def get_repo_status(self):
        """Obtient le statut du repository"""
        try:
            result = self.run_command("git status --short", check=False)
            return result.stdout.strip()
        except:
            return "Unable to get status"

def read_existing_news():
    """Reads existing JSON file as fallback"""
    try:
        with open(NEWS_JSON_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

def fetch_api_data_with_retry(endpoint, params=None, max_retries=3):
    """
    Fetch API data with retry logic
    """
    for attempt in range(max_retries):
        try:
            data = fetch_api_data(endpoint, params)
            if data:
                return data
            logger.warning(f"Empty response from {endpoint}, attempt {attempt + 1}/{max_retries}")
        except Exception as e:
            logger.warning(f"API call failed, attempt {attempt + 1}/{max_retries}: {e}")
        
        if attempt < max_retries - 1:
            time.sleep(2 ** attempt)  # Exponential backoff
    
    logger.error(f"All {max_retries} attempts failed for {endpoint}")
    return []

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

def fetch_articles_by_period(endpoint, start_date, end_date, source_type=None, days_interval=7, max_pages=10):  # 🔧 max_pages réduit
    """
    Fetches articles with improved pagination and date control
    """
    logger.info(f"Starting extraction from {start_date} to {end_date} in {days_interval} day chunks")
    
    per_page = CONFIG["pull_limits"].get(source_type, 50) if source_type else 50
    
    from_date = datetime.strptime(start_date, "%Y-%m-%d")
    to_date = datetime.strptime(end_date, "%Y-%m-%d")
    all_articles = []
    
    # Stats pour audit
    oldest_date_seen = None
    total_api_calls = 0
    
    current_from = from_date
    while current_from < to_date:
        current_to = min(current_from + timedelta(days=days_interval), to_date)
        
        logger.info(f"Processing period {current_from.strftime('%Y-%m-%d')} → {current_to.strftime('%Y-%m-%d')}")
        
        for page in range(max_pages):
            params = {
                "from": current_from.strftime("%Y-%m-%d"),
                "to": current_to.strftime("%Y-%m-%d"),
                "page": page,
                "limit": per_page
            }
            
            articles = fetch_api_data_with_retry(endpoint, params)
            total_api_calls += 1
            
            if not articles:
                break
            
            # Tracking de la date la plus ancienne
            for article in articles:
                pub_date = article.get("publishedDate", "")
                if pub_date and (not oldest_date_seen or pub_date < oldest_date_seen):
                    oldest_date_seen = pub_date
            
            logger.info(f"  Page {page+1}: {len(articles)} articles (total API calls: {total_api_calls})")
            all_articles.extend(articles)
            
            # Si on a moins d'articles que la limite, on a tout récupéré
            if len(articles) < per_page:
                break
        
        current_from = current_to
    
    # Log d'audit
    logger.info(f"✅ Total articles: {len(all_articles)} | API calls: {total_api_calls}")
    logger.info(f"📅 Date range in data: {oldest_date_seen} to {end_date}")
    
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
    # 🔧 CORRECTIF 3: Extraction thèmes sur title + content (pas juste title)
    text = (article.get("title", "") + " " + 
            article.get("content", article.get("text", ""))).lower()
    
    themes_detected = {"macroeconomics": [], "sectors": [], "regions": []}
    
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
        return {"positive": 0, "neutral": 0, "negative": 0}

    return {
        "positive": round(sentiment_counts["positive"] / total * 100),
        "neutral": round(sentiment_counts["neutral"] / total * 100),
        "negative": round(sentiment_counts["negative"] / total * 100)
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

def calculate_output_limits(articles_by_country, max_total=300):  # 🔧 max_total réduit
    """
    Enhanced output limits calculation using geo_budgets v5.0 with MSCI weights
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
    Apply sophisticated topic caps with fixed/relative/overflow logic v5.0
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
                        content = f"{article.get('title', '')} {article.get('content', '')}"
                        if not content:
                            content = f"{article.get('title', '')} {article.get('text', '')}"
                        content = content.lower()
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
    🚀 Enhanced theme analysis v5.0 with diagnostics
    """
    cutoff_date = datetime.now() - timedelta(days=days)
    
    # Include fundamentals axis in theme counters
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
    article_dates = []  # 🔧 Pour tracking des dates
    
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
                
                article_dates.append(article_date)  # 🔧 Tracking
                
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
                                "keywords": {},
                                "headlines": []  # ← NEW v4.1: top headlines for compact format
                            }
                        
                        # Increment counter in detailed structure
                        themes_details[axis][theme]["count"] += 1
                        
                        # Add titles associated with the theme
                        title = article.get("title", "")
                        url = article.get("url", "")
                        if title and title not in themes_details[axis][theme]["articles"]:
                            themes_details[axis][theme]["articles"].append(title)
                            # ✨ NEW v4.1: Store headline + url for compact format
                            if len(themes_details[axis][theme]["headlines"]) < 3:
                                themes_details[axis][theme]["headlines"].append([title, url])
                        
                        # Analyze specific keywords
                        content = article.get("content", "") or article.get("text", "")
                        text = (content + " " + title).lower()
                        
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
    
    # 🔧 Diagnostic logs
    logger.info(f"📊 Theme analysis for {days} days:")
    logger.info(f"  - Total articles in dataset: {total_articles}")
    logger.info(f"  - Articles within period: {processed_articles} ({processed_articles/total_articles*100:.1f}%)")
    
    if article_dates:
        oldest = min(article_dates)
        newest = max(article_dates)
        logger.info(f"  - Date range in data: {oldest.strftime('%Y-%m-%d')} to {newest.strftime('%Y-%m-%d')}")
        logger.info(f"  - Actual days covered: {(newest - oldest).days}")
    
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
            top_themes_with_details[axis][theme] = themes_details[axis].get(theme, {
                "count": count, 
                "articles": [], 
                "headlines": [],
                "sentiment_distribution": {"positive": 33, "neutral": 34, "negative": 33}
            })
    
    return top_themes_with_details

def pack_theme_compact(theme_data, w_count, m_count):
    """
    Pack theme data into ultra-compact format (sans quarterly)
    """
    w, m = w_count, m_count or 1
    
    # Get sentiment distribution
    sentiment_dist = theme_data.get("sentiment_distribution", {"positive": 33, "neutral": 34, "negative": 33})
    
    # Pack into compact format
    packed = {
        "c": [w, m],  # count timeline: [Weekly, Monthly]
        "s": [sentiment_dist["positive"], sentiment_dist["negative"], sentiment_dist["neutral"]],  # sentiment: [pos, neg, neu]
        "h": theme_data.get("headlines", [])[:3]  # top-3 headlines with URLs
    }
    
    return packed

def build_theme_summary(theme_name, theme_data):
    """Generates investor-focused theme summary v5.0"""
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

def process_news_data_batch(news_sources):
    """
    🚀 NEW v5.0: Enhanced news processing with UNIFIED DUAL ML SYSTEM
    """
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
    logger.info("🔄 Normalizing articles...")
    for source_type, articles in news_sources.items():
        for article in articles:
            # Normalize article
            normalized = normalize_article(article, source_type)
            
            # Enhanced quality filters
            if len(normalized["title"]) < 15:  # Stricter title length
                continue
                
            if len(normalized["text"]) < 100:  # Stricter content length
                continue
            
            # Early exit for press releases with no content
            if source_type == "press_releases" and len(normalized["text"]) < 200:
                continue
            
            # Determine category and country
            category = determine_category(normalized, source_type)
            country = determine_country(normalized)
            
            # Create news item
            news_item = {
                "title": normalized["title"],
                "content": normalized["text"],
                "source": normalized["site"],
                "rawDate": normalized["publishedDate"],
                "date": format_date(normalized["publishedDate"]),
                "time": format_time(normalized["publishedDate"]),
                "category": category,
                "country": country,
                "url": normalized.get("url", ""),
                "themes": extract_themes(normalized),
                "source_type": source_type,
                "_text_for_ml": f"{normalized['title']} {normalized['text']}"  # Combined text for ML
            }
            
            all_articles.append(news_item)
    
    logger.info(f"📊 Normalized {len(all_articles)} articles")
    
    # 🚀 UNIFIED DUAL ML PROCESSING v5.0
    if USE_FINBERT and all_articles:
        logger.info("🚀 Starting unified dual-model ML processing...")
        
        # Initialize labeler (singleton)
        labeler = get_labeler(hf_token=_HF_TOKEN)
        
        # Extract texts for ML
        texts_for_ml = [article["_text_for_ml"] for article in all_articles]
        
        # Get predictions in batch
        t0 = time.time()
        predictions = labeler.predict(texts_for_ml)
        logger.info(f"✅ ML processing completed in {time.time() - t0:.1f}s")
        
        # Log cache stats
        cache_stats = labeler.get_cache_stats()
        logger.info(f"🗄️ Cache stats: {cache_stats['hits']} hits, {cache_stats['misses']} misses ({cache_stats['hit_rate']}% hit rate)")
        
        # Apply predictions to articles
        logger.info("📝 Applying ML results to articles...")
        for article, pred in zip(all_articles, predictions):
            # Sentiment (compatible with existing format)
            article["impact"] = pred["sentiment"]
            article["sentiment_conf"] = pred["sent_conf"]
            article["impact_prob"] = {
                "positive": pred["sent_conf"] if pred["sentiment"] == "positive" else 0.1,
                "neutral": pred["sent_conf"] if pred["sentiment"] == "neutral" else 0.1,
                "negative": pred["sent_conf"] if pred["sentiment"] == "negative" else 0.1
            }
            
            # Importance
            article["importance_level"] = pred["importance"]
            article["importance_conf"] = pred["imp_conf"]
            
            # Calculate importance score (harmonized with original)
            importance_scores = {
                "general": 35,
                "important": 60,
                "critical": 90
            }
            article["importance_score"] = importance_scores.get(pred["importance"], 50)
            
            # NEW v5.0: Quality score
            article["quality_score"] = calculate_quality_score(article)
            
            # NEW v5.0: Review flag (same logic as SmartNewsCollector)
            article["needs_review"] = (
                pred["sent_conf"] < CONFIDENCE_THRESHOLD or 
                pred["imp_conf"] < CONFIDENCE_THRESHOLD
            )
            
            # Clean up temporary field
            del article["_text_for_ml"]
    
    # 🔧 Remove duplicates AVANT le tri
    logger.info(f"Articles avant déduplication: {len(all_articles)}")
    
    # Déduplication par URL
    seen_urls = set()
    unique_articles = []
    for article in all_articles:
        url = article.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_articles.append(article)
        elif not url:  # Si pas d'URL, on garde quand même
            unique_articles.append(article)
    
    all_articles = unique_articles
    logger.info(f"Articles après déduplication: {len(all_articles)} (-{len(unique_articles)} doublons)")
    
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
        
        # -- MODIFIED: Réserve 1 article "general" si possible --------------------
        general_keep = next((a for a in articles if a["importance_level"] == "general"), None)
        if general_keep:
            # On met l'article "general" au début de la liste pour qu'il passe le slicing
            articles.insert(0, articles.pop(articles.index(general_keep)))
        # --------------------------------------------------------------------------
        
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
    logger.info(f"✅ Enhanced processing v5.0 complete: {total_articles} investor-grade articles")
    
    # Log distribution by region
    for country, articles in formatted_data.items():
        if isinstance(articles, list) and articles:
            logger.info(f"  📍 {country}: {len(articles)} articles")
    
    # Enhanced sentiment distribution stats with dual model info
    all_processed_articles = []
    for articles in formatted_data.values():
        if isinstance(articles, list):
            all_processed_articles.extend(articles)
    
    if all_processed_articles:
        sentiment_stats = compute_sentiment_distribution(all_processed_articles)
        logger.info(f"📊 Sentiment distribution: {sentiment_stats['positive']}% positive, {sentiment_stats['negative']}% negative, {sentiment_stats['neutral']}% neutral")
        
        # 🚀 Unified model usage stats v5.0
        sentiment_used = sum(1 for article in all_processed_articles if "sentiment_conf" in article)
        importance_used = sum(1 for article in all_processed_articles if "importance_level" in article)
        
        if sentiment_used > 0:
            logger.info(f"🎯 Sentiment model analyzed {sentiment_used}/{len(all_processed_articles)} articles ({sentiment_used/len(all_processed_articles)*100:.1f}%)")
            
            # Confidence stats
            confidence_scores = [article["sentiment_conf"] for article in all_processed_articles if "sentiment_conf" in article]
            if confidence_scores:
                avg_confidence = sum(confidence_scores) / len(confidence_scores)
                logger.info(f"📈 Average sentiment confidence: {avg_confidence:.3f}")
        
        if importance_used > 0:
            logger.info(f"⚡ Importance model analyzed {importance_used}/{len(all_processed_articles)} articles ({importance_used/len(all_processed_articles)*100:.1f}%)")
            
            # Distribution par niveau d'importance
            importance_levels = Counter(article["importance_level"] for article in all_processed_articles if "importance_level" in article)
            logger.info(f"📊 Importance levels: {dict(importance_levels)}")
            
            # Average importance scores
            importance_scores = [article["importance_score"] for article in all_processed_articles if "importance_score" in article]
            if importance_scores:
                avg_importance = sum(importance_scores) / len(importance_scores)
                logger.info(f"📊 Average importance score: {avg_importance:.1f}")
            
            # Quality score stats
            quality_scores = [article.get("quality_score", 0) for article in all_processed_articles]
            avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0
            
            # Review needed count
            review_needed = sum(1 for article in all_processed_articles if article.get("needs_review", False))
            
            logger.info(f"📊 Quality metrics:")
            logger.info(f"  Average quality score: {avg_quality:.1f}/100")
            logger.info(f"  Articles needing review: {review_needed}/{len(all_processed_articles)} ({review_needed/len(all_processed_articles)*100:.1f}%)")
                
            # Update model metadata
            _MODEL_METADATA["performance_metrics"] = {
                "sentiment_articles": sentiment_used,
                "importance_articles": importance_used,
                "avg_confidence": avg_confidence if sentiment_used > 0 else 0,
                "avg_importance": avg_importance if importance_used > 0 else 0,
                "avg_quality": avg_quality,
                "importance_distribution": dict(importance_levels),
                "review_needed_count": review_needed,
                "batch_processing": True,
                "cache_stats": labeler.get_cache_stats()
            }
    
    return formatted_data

def update_news_json_file(news_data):
    """
    🚀 NEW v5.0: Updates news.json with COMPACT lightweight format
    • Includes: quality_score, needs_review fields
    • Removes: content (full text), internal ML fields
    • Adds: snippet (180 chars), t (theme tags), imp (importance score)
    • Result: ~6x smaller file size
    """
    try:
        # ═══ COMPACT FORMAT TRANSFORMATION ═══════════════════════════════════
        keep_fields = ["title", "snippet", "date", "country", "impact", "imp", "t", "url", "source", "category", "quality_score", "needs_review"]
        
        output_data = {}
        total_original_size = 0
        total_compact_size = 0
        
        for key, value in news_data.items():
            if isinstance(value, list):
                # Process articles for compaction
                compact_articles = []
                
                for article in value:
                    # Calculate original size for statistics
                    original_json_size = len(json.dumps(article))
                    total_original_size += original_json_size
                    
                    # Create compact version
                    compact_article = {}
                    
                    # Essential fields with transformation
                    compact_article["title"] = article.get("title", "")
                    
                    # 🚀 NEW: snippet instead of full content (180 chars max)
                    full_content = article.get("content", "")
                    compact_article["snippet"] = (full_content[:180] + "…") if len(full_content) > 180 else full_content
                    
                    compact_article["date"] = article.get("date", "")
                    compact_article["country"] = article.get("country", "")
                    compact_article["impact"] = article.get("impact", "neutral")
                    compact_article["url"] = article.get("url", "")
                    compact_article["source"] = article.get("source", "")
                    compact_article["category"] = article.get("category", "general")
                    
                    # 🚀 NEW: flattened theme tags (all themes in one array)
                    themes = article.get("themes", {})
                    all_themes = []
                    for axis_themes in themes.values():
                        all_themes.extend(axis_themes)
                    compact_article["t"] = list(set(all_themes))  # Remove duplicates
                    
                    # 🚀 NEW: importance score as float (not full object)
                    compact_article["imp"] = article.get("importance_score", 25.0)
                    
                    # 🚀 NEW v5.0: quality score and needs_review
                    compact_article["quality_score"] = article.get("quality_score", 50)
                    compact_article["needs_review"] = article.get("needs_review", False)
                    
                    # Calculate compact size for statistics
                    compact_json_size = len(json.dumps(compact_article))
                    total_compact_size += compact_json_size
                    
                    compact_articles.append(compact_article)
                
                output_data[key] = compact_articles
            else:
                # Keep non-article data as-is
                output_data[key] = value
        
        # Add model metadata to output (if enabled)
        if ENABLE_MODEL_METRICS:
            output_data["model_metadata"] = _MODEL_METADATA
            # Add compact format info
            output_data["model_metadata"]["format_version"] = "v5.0-compact-unified"
            output_data["model_metadata"]["size_reduction"] = round(
                (total_original_size - total_compact_size) / total_original_size * 100, 1
            ) if total_original_size > 0 else 0
        
        # ═══ WRITE COMPACT FILE ═══════════════════════════════════════════════
        os.makedirs(os.path.dirname(NEWS_JSON_PATH), exist_ok=True)
        
        with open(NEWS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        
        # Log compression statistics
        if total_original_size > 0:
            compression_ratio = total_compact_size / total_original_size
            logger.info(f"✅ news.json v5.0 compact format updated")
            logger.info(f"📦 Size reduction: {total_original_size/1024/1024:.1f}MB → {total_compact_size/1024/1024:.1f}MB (×{1/compression_ratio:.1f} smaller)")
        else:
            logger.info(f"✅ news.json v5.0 compact format updated")
            
        return True
    except Exception as e:
        logger.error(f"❌ Error updating news.json file: {str(e)}")
        return False

def generate_themes_json(news_data):
    """
    🚀 NEW v5.0: Generates ULTRA-COMPACT themes JSON (hebdo + mensuel only)
    • Structure: {"c":[W,M], "s":[pos,neg,neu], "h":headlines}
    • Pre-computed axisMax for instant frontend rendering
    • Result: ~10x smaller than v4.0
    """
    
    logger.info("🚀 Generating v5.0 ultra-compact themes format (W+M only)...")
    
    periods = {
        "weekly": 7,
        "monthly": 30
    }
    
    # ═══ EXTRACT THEMES FOR ALL PERIODS ═══════════════════════════════════════
    logger.info("📊 Extracting themes for weekly and monthly periods...")
    
    exclude_themes = {"sectors": ["crypto"]}  # Exclude crypto but include fundamentals
    
    weekly_themes = extract_top_themes(news_data, days=7, exclude_themes=exclude_themes)
    monthly_themes = extract_top_themes(news_data, days=30, exclude_themes=exclude_themes)
    
    # ═══ BUILD COMPACT STRUCTURE ═══════════════════════════════════════════════
    logger.info("🔄 Building ultra-compact structure...")
    
    compact_periods = {}
    axis_max_data = {}
    
    for period_key in ["weekly", "monthly"]:
        compact_periods[period_key] = {}
        axis_max_data[period_key] = {}
        
        # Get data for current period
        if period_key == "weekly":
            current_themes = weekly_themes
        else:
            current_themes = monthly_themes
        
        # Process each axis (macroeconomics, sectors, regions)
        for axis, themes in current_themes.items():
            compact_periods[period_key][axis] = {}
            axis_counts = []
            
            # Process each theme
            for theme_name, theme_data in themes.items():
                # Get counts for W/M
                w_count = weekly_themes[axis].get(theme_name, {}).get("count", 0)
                m_count = monthly_themes[axis].get(theme_name, {}).get("count", 0)  
                
                # Pack into compact format
                compact_theme = pack_theme_compact(theme_data, w_count, m_count)
                compact_periods[period_key][axis][theme_name] = compact_theme
                
                # Track counts for axisMax calculation
                axis_counts.append(w_count if period_key == "weekly" else m_count)
            
            # Calculate axisMax for this axis/period
            axis_max_data[period_key][axis] = max(axis_counts) if axis_counts else 1
    
    # ═══ FINAL COMPACT OUTPUT ═══════════════════════════════════════════════════
    logger.info("📦 Finalizing compact output...")
    
    themes_output = {
        "lastUpdated": datetime.now().isoformat(),
        "periods": compact_periods,
        "axisMax": axis_max_data,  # ← 🚀 Pre-computed for instant frontend rendering
        "config_version": "v5.0-compact-WM",
        "compression_info": {
            "format": "c=count[W,M], s=sentiment[pos,neg,neu], h=headlines[[title,url]]",
            "estimated_size_reduction": "~10x smaller than v4.0"
        }
    }
    
    # Add model info if enabled
    if ENABLE_MODEL_METRICS:
        themes_output["model_info"] = _MODEL_METADATA
    
    # ═══ WRITE COMPACT FILE ═══════════════════════════════════════════════════
    os.makedirs(os.path.dirname(THEMES_JSON_PATH), exist_ok=True)
    
    try:
        with open(THEMES_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(themes_output, f, ensure_ascii=False, indent=2)
        
        # Calculate file size for logging
        file_size = os.path.getsize(THEMES_JSON_PATH) / 1024  # KB
        
        logger.info(f"✅ themes.json v5.0 ultra-compact format updated")
        logger.info(f"📦 File size: {file_size:.0f}KB")
        logger.info(f"🎯 Features: pre-computed axisMax, top-3 headlines, W+M only")
        
        # Log axis maximums for verification
        for period, axes in axis_max_data.items():
            logger.info(f"📊 {period.title()} axisMax: {axes}")
        
        return True
    except Exception as e:
        logger.error(f"❌ Error updating themes.json file: {str(e)}")
        return False

def main():
    """🚀 Enhanced main execution with Unified Dual ML System v5.0"""
    try:
        logger.info("🚀 Starting TradePulse News Collection v5.0 UNIFIED...")
        logger.info(f"🎯 Unified Dual-Model System: sentiment + importance")
        logger.info(f"✨ NEW v5.0: Quality scoring, confidence thresholds, needs_review flag")
        logger.info(f"⚙️ Settings: CONFIDENCE_THRESHOLD={CONFIDENCE_THRESHOLD}")
        
        # Pré-charge les modèles via DualMLLabeler
        start_time = time.time()
        labeler = get_labeler(_HF_TOKEN)
        load_time = time.time() - start_time
        _MODEL_METADATA["load_time"] = load_time
        logger.info(f"🤖 Unified dual models loaded in {load_time:.2f}s")
        
        # Read existing data for fallback
        existing_data = read_existing_news()
        
        # Fetch different news sources with enhanced limits
        logger.info(f"📊 Fetching news sources with MSCI-weighted geo limits ({CONFIG['meta']['days_back']}-day window)...")
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
            logger.warning("⚠️ No news retrieved - ML processing skipped")
            if existing_data:
                logger.info("📁 Using existing data as fallback")
                return True
            return False
        
        # 🚀 Process with UNIFIED ML SYSTEM v5.0
        logger.info("🔍 Processing with unified dual-model system (v5.0)...")
        news_data = process_news_data_batch(news_sources)
        
        # 🚀 Update files with NEW v5.0 compact formats
        logger.info("📦 Updating files with v5.0 ultra-compact formats...")
        success_news = update_news_json_file(news_data)
        success_themes = generate_themes_json(news_data)
        
        # 🔧 ENHANCED: Git operations with robust conflict handling
        if success_news and success_themes:
            logger.info("🔧 Initiating Git operations with enhanced conflict resolution...")
            
            # Initialize Git handler
            git_handler = EnhancedGitHandler()
            
            # Check repository status
            repo_status = git_handler.get_repo_status()
            if repo_status:
                logger.info(f"📋 Repository status: {repo_status}")
            
            # Attempt commit and push with retry logic
            git_success = git_handler.commit_and_push()
            
            if git_success:
                logger.info("✅ Git operations completed successfully")
            else:
                logger.warning("⚠️ Git operations failed, but data files were updated")
                # Don't fail the entire process if Git operations fail
        
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
        
        # 🚀 Unified model performance summary v5.0
        logger.info("🎯 Unified Dual-Model Performance Summary v5.0:")
        logger.info(f"  Sentiment Model: {_MODEL_METADATA['sentiment_model']}")
        logger.info(f"  Importance Model: {_MODEL_METADATA['importance_model']}")
        logger.info(f"  System Version: {_MODEL_METADATA['version']}")
        logger.info(f"  Load Time: {_MODEL_METADATA['load_time']:.2f}s")
        logger.info(f"  Batch Processing: ENABLED (size={BATCH_SIZE})")
        logger.info(f"  Confidence Threshold: {CONFIDENCE_THRESHOLD}")
        
        if "performance_metrics" in _MODEL_METADATA:
            metrics = _MODEL_METADATA["performance_metrics"]
            logger.info(f"  Sentiment Articles: {metrics.get('sentiment_articles', 0)}")
            logger.info(f"  Importance Articles: {metrics.get('importance_articles', 0)}")
            logger.info(f"  Avg Confidence: {metrics.get('avg_confidence', 0):.3f}")
            logger.info(f"  Avg Importance: {metrics.get('avg_importance', 0):.1f}")
            logger.info(f"  Avg Quality Score: {metrics.get('avg_quality', 0):.1f}/100")
            logger.info(f"  Articles Needing Review: {metrics.get('review_needed_count', 0)}")
            if "importance_distribution" in metrics:
                logger.info(f"  Importance Levels: {metrics['importance_distribution']}")
            if "cache_stats" in metrics:
                cache = metrics["cache_stats"]
                logger.info(f"  Cache Performance: {cache['hit_rate']}% hit rate ({cache['hits']} hits, {cache['misses']} misses)")
        
        logger.info("✅ TradePulse v5.0 UNIFIED completed successfully!")
        logger.info("🚀 Benefits: Unified ML system, quality scoring, confidence thresholds")
        return success_news and success_themes
        
    except Exception as e:
        logger.error(f"❌ Error in Unified Dual-Model execution v5.0: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = main()
    if not success:
        exit(1)
