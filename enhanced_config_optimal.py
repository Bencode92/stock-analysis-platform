from __future__ import annotations
"""
enhanced_config_optimal.py
==========================

Configuration « tout-en-un » pour le moteur d'intelligence TradePulse.

• 500 racines (≈ 50 / 150 / 300) + expansion sémantique dynamique  
• Pondérations hot-reloadables (score_weights.json)  
• Helpers de self-test et allocation proportionnelle intégrés  
• Module autonome : fonctionne même importé seul grâce aux valeurs env/defaut  
"""

import json
import os
import re
import logging
from typing import Dict

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 0️⃣  Global defaults (surchageables via variables d'environnement)
# ---------------------------------------------------------------------------
MAX_TOTAL: int = int(os.getenv("TP_MAX_TOTAL", "150"))
DAYS_AHEAD: int = int(os.getenv("TP_DAYS_AHEAD", "7"))
DAYS_BACK: int = int(os.getenv("TP_DAYS_BACK", "30"))

# ---------------------------------------------------------------------------
# 1️⃣  Dynamic scoring weights
# ---------------------------------------------------------------------------
_SCORE_WEIGHTS_PATH = os.path.join("models", "score_weights.json")
_DEFAULT_WEIGHTS: Dict[str, float] = {
    # Signal mots-clés
    "high_keywords": 4.0,
    "medium_keywords": 2.0,
    "low_keywords": 1.0,         # contrôle du bruit bas niveau

    # Meta signal
    "source_premium": 3.5,
    "impact_factor": 2.5,
    "content_length": 1.0,
    "recency_boost": 1.3,
    "novelty_penalty": -2.0,     # pénalise les redondances < 60 min
}

try:
    with open(_SCORE_WEIGHTS_PATH, encoding="utf-8") as fh:
        WEIGHTS: Dict[str, float] = json.load(fh)
    logger.info("✅  Dynamic scoring weights loaded from %s", _SCORE_WEIGHTS_PATH)
except FileNotFoundError:
    WEIGHTS = _DEFAULT_WEIGHTS
    logger.warning("⚠️  Using fallback scoring weights (file not found)")

# ---------------------------------------------------------------------------
# 2️⃣  Source tiering
# ---------------------------------------------------------------------------
SOURCE_WEIGHTS: Dict[str, int] = {
    # Tier-1 : market-moving
    "bloomberg": 6,
    "reuters": 6,
    "financial times": 5,
    "wall street journal": 5,

    # Tier-2 : majors
    "cnbc": 4,
    "marketwatch": 4,
    "barron's": 4,
    "seeking alpha": 4,

    # Tier-3 : vertical specialists
    "coindesk": 3,
    "cointelegraph": 3,
    "the block": 3,
    "techcrunch": 3,
    "oilprice": 3,

    # Tier-4 : broad aggregators
    "yahoo finance": 2,
    "motley fool": 2,
    "investor's business daily": 2,

    # Tier-5 : press wires
    "pr newswire": 1,
    "business wire": 1,
    "globe newswire": 1,
}

# ---------------------------------------------------------------------------
# 3️⃣  Keyword roots (static layer)
# ---------------------------------------------------------------------------
KEYWORDS_CONFIG: Dict[str, list[str]] = {
    "high_impact": [
        "crash", "collapse", "crisis", "recession", "default",
        "bankruptcy", "panic", "meltdown", "correction", "bear market",
        "market crash", "sell-off", "plunge", "tumble", "freefall",
        "circuit breaker", "debt ceiling", "sovereign debt", "bond rout",
        "yield curve", "inverted curve", "treasury spike", "rate hike",
        "rate cut", "fed decision", "central bank", "ecb decision",
        "inflation", "hyperinflation", "stagflation", "deflation",
        "quantitative easing", "tapering", "emergency liquidity",
        "capital controls", "sanctions", "trade war", "embargo",
        "nationalisation", "regulation", "investigation", "lawsuit",
        "antitrust", "class action", "cyberattack", "downgrade",
        "bailout", "stress test",
    ],
    "medium_impact": [
        "gdp", "growth", "contraction", "employment", "unemployment",
        "cpi", "ppi", "pmi", "ism", "retail sales", "consumer confidence",
        "manufacturing", "industrial production", "housing starts",
        "earnings", "profits", "losses", "guidance", "profit warning",
        "dividend", "buyback", "merger", "acquisition", "ipo", "spin-off",
        "restructuring", "layoffs", "capex", "deleveraging",
        "bond issue", "share placement", "secondary offering", "rights issue",
        "rating upgrade", "rating downgrade", "volatility", "volume",
        "short squeeze", "index reshuffle", "re-weighting",
        "quantitative tightening", "currency intervention", "commodity rally",
        "oil surge", "gas spike", "gold rally", "copper rally", "lumber surge",
        "housing bubble", "tech bubble", "dot-com", "subprime", "leverage",
        "margin call", "stop loss", "bear trap", "bull trap", "dead cat bounce",
        "oversold", "overbought", "resistance level", "support level", "breakout",
        "breakdown", "trend reversal", "momentum", "rsi", "moving average",
        "bollinger bands", "fibonacci", "elliott wave", "candlestick", "doji",
        "hammer", "shooting star", "engulfing", "harami", "morning star",
        "evening star", "triple top", "triple bottom", "head and shoulders",
        "cup and handle", "flag", "pennant", "wedge", "triangle",
        "channel", "gap up", "gap down", "earnings beat", "earnings miss",
        "revenue growth", "margin expansion", "cost cutting", "synergies",
        "organic growth", "inorganic growth", "market share", "competitive advantage",
        "moat", "disruption", "innovation", "patent", "intellectual property",
        "trade secret", "regulatory approval", "clinical trial", "fda approval",
        "drug approval", "vaccine", "breakthrough therapy", "orphan drug",
        "generic competition", "biosimilar", "pipeline", "r&d", "capex guidance",
        "free cash flow", "return on equity", "return on assets", "debt to equity",
        "current ratio", "quick ratio", "inventory turnover", "receivables turnover",
        "working capital", "cash conversion cycle", "days sales outstanding",
        "gross margin", "operating margin", "net margin", "ebitda margin",
        "price to earnings", "price to book", "price to sales", "ev to ebitda",
        "peg ratio", "dividend yield", "payout ratio", "share repurchase",
        "stock split", "spin off", "carve out", "divestiture", "asset sale",
        "joint venture", "strategic partnership", "licensing deal", "franchise",
        "subscription model", "recurring revenue", "customer acquisition cost",
        "lifetime value", "churn rate", "net promoter score", "market penetration",
        "total addressable market", "serviceable addressable market", "win rate",
        "conversion rate", "engagement", "user growth", "monthly active users",
        "annual recurring revenue", "gross retention", "net retention", "upsell",
        "cross sell", "land and expand", "go to market", "sales funnel",
        "customer success", "product market fit", "minimum viable product",
        "agile development", "scrum", "devops", "continuous integration",
        "continuous deployment", "microservices", "api", "cloud migration",
        "digital transformation", "automation", "robotics", "artificial intelligence",
        "machine learning", "deep learning", "neural networks", "natural language processing",
        "computer vision", "predictive analytics", "big data", "data science",
        "business intelligence", "dashboard", "kpi", "metrics", "analytics"
    ],
    "low_impact": [
        "announcement", "appointment", "price target", "forecast",
        "preview", "product launch", "roadmap", "prototype", "partnership",
        "joint venture", "collaboration", "store opening", "seed funding",
        "series a", "series b", "series c", "conference", "summit",
        "webinar", "meeting", "fireside chat", "newsletter", "whitepaper",
        "case study", "award", "patent", "trade show", "customer win",
        "milestone", "beta", "update", "patch", "feature", "enhancement",
        "bug fix", "maintenance", "routine", "scheduled", "planned",
        "expected", "anticipated", "preliminary", "tentative", "provisional",
        "interim", "temporary", "pilot", "trial", "test", "experiment",
        "proof of concept", "demonstration", "showcase", "exhibition",
        "presentation", "speech", "keynote", "panel", "discussion",
        "workshop", "training", "seminar", "course", "certification",
        "accreditation", "compliance", "audit", "review", "assessment",
        "evaluation", "study", "research", "analysis", "report",
        "survey", "poll", "questionnaire", "interview", "focus group",
        "consultation", "advisory", "recommendation", "suggestion", "proposal",
        "idea", "concept", "vision", "mission", "strategy", "plan",
        "initiative", "program", "project", "campaign", "effort",
        "endeavor", "venture", "enterprise", "business", "operation",
        "activity", "action", "step", "measure", "procedure", "process",
        "method", "approach", "technique", "solution", "answer", "response",
        "reaction", "feedback", "comment", "opinion", "view", "perspective",
        "insight", "observation", "finding", "discovery", "result", "outcome",
        "conclusion", "summary", "overview", "introduction", "background",
        "context", "setting", "environment", "situation", "circumstance",
        "condition", "state", "status", "position", "location", "place",
        "venue", "site", "facility", "building", "office", "headquarters",
        "branch", "subsidiary", "division", "department", "team", "group",
        "unit", "section", "area", "region", "territory", "market",
        "segment", "sector", "industry", "field", "domain", "category",
        "type", "kind", "sort", "variety", "version", "model", "design",
        "style", "format", "structure", "framework", "system", "platform",
        "technology", "tool", "instrument", "device", "equipment", "machine",
        "software", "application", "program", "service", "product", "offering",
        "solution", "package", "bundle", "suite", "collection", "series",
        "line", "range", "portfolio", "catalog", "inventory", "stock",
        "supply", "resource", "asset", "property", "item", "component",
        "element", "part", "piece", "unit", "module", "plugin", "extension",
        "add-on", "upgrade", "improvement", "optimization", "refinement",
        "enhancement", "modification", "adjustment", "change", "alteration",
        "revision", "amendment", "correction", "fix", "repair", "maintenance",
        "service", "support", "help", "assistance", "guidance", "advice",
        "tip", "hint", "clue", "information", "data", "details", "facts",
        "statistics", "numbers", "figures", "metrics", "measurements", "indicators",
        "signals", "signs", "symptoms", "evidence", "proof", "documentation",
        "record", "log", "history", "archive", "backup", "copy", "duplicate",
        "replica", "clone", "mirror", "reflection", "image", "picture",
        "photo", "illustration", "diagram", "chart", "graph", "table",
        "list", "menu", "index", "directory", "guide", "manual", "handbook",
        "reference", "resource", "source", "origin", "basis", "foundation",
        "ground", "root", "core", "heart", "center", "focus", "target",
        "goal", "objective", "purpose", "aim", "intention", "plan",
        "scheme", "design", "blueprint", "roadmap", "timeline", "schedule",
        "agenda", "calendar", "date", "time", "period", "duration",
        "interval", "span", "range", "scope", "extent", "scale",
        "size", "magnitude", "volume", "quantity", "amount", "number",
        "count", "total", "sum", "aggregate", "average", "mean",
        "median", "mode", "standard deviation", "variance", "correlation",
        "regression", "trend", "pattern", "cycle", "season", "quarter"
    ],
}

# ---------------------------------------------------------------------------
# 4️⃣  Mega-regex compilation (une seule passe par niveau)
# ---------------------------------------------------------------------------
KEYWORD_PATTERNS: Dict[str, re.Pattern[str]] = {
    level: re.compile("|".join(rf"\b{re.escape(w)}\b" for w in words), re.I)
    for level, words in KEYWORDS_CONFIG.items()
}

# ---------------------------------------------------------------------------
# 5️⃣  Themes (abridged ; étendez si besoin)
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# 6️⃣  HTTP session (keep-alive + UA custom)
# ---------------------------------------------------------------------------
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "TradePulseBot/1.0",
    "Accept": "application/json",
    "Connection": "keep-alive",
})

# ---------------------------------------------------------------------------
# 7️⃣  File paths
# ---------------------------------------------------------------------------
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(_BASE_DIR, "models")
NEWS_JSON_PATH = os.path.join(_BASE_DIR, "data", "news.json")
THEMES_JSON_PATH = os.path.join(_BASE_DIR, "data", "themes.json")

for path in (MODELS_DIR, os.path.dirname(NEWS_JSON_PATH)):
    os.makedirs(path, exist_ok=True)

# ---------------------------------------------------------------------------
# 8️⃣  Helpers
# ---------------------------------------------------------------------------
def allocate_limits(total: int, weights: Dict[str, float]) -> Dict[str, int]:
    """Répartit dynamiquement un total en fonction de poids relatifs."""
    total_weight = sum(weights.values())
    allocated = {k: int(total * (w / total_weight)) for k, w in weights.items()}

    # Correction d'arrondi : on compense sur la plus grosse part
    diff = total - sum(allocated.values())
    if diff:
        max_key = max(allocated, key=allocated.get)
        allocated[max_key] += diff
    return allocated


def _quick_self_tests() -> None:
    """Mini-tests unitaires pour valider les helpers clés."""
    _alloc = allocate_limits(100, {"a": 0.5, "b": 0.3, "c": 0.2})
    assert sum(_alloc.values()) == 100, "allocate_limits mauvaise somme"
    assert all(v > 0 for v in _alloc.values()), "allocation nulle"
    logger.info("✅  self-tests allocate_limits OK")

# ---------------------------------------------------------------------------
# 9️⃣  Dynamic allocation tables
# ---------------------------------------------------------------------------
BASE_COUNTRY_WEIGHTS = {
    "us": 0.30,
    "france": 0.15,
    "uk": 0.12,
    "germany": 0.12,
    "china": 0.10,
    "japan": 0.08,
    "global": 0.13,
}

BASE_SOURCE_WEIGHTS = {
    "general_news": 0.25,
    "stock_news": 0.40,
    "crypto_news": 0.15,
    "fmp_articles": 0.12,
    "press_releases": 0.08,
}

# ---------------------------------------------------------------------------
# 🔟  Master CONFIG object (consommé par le pipeline principal)
# ---------------------------------------------------------------------------
CONFIG: Dict[str, object] = {
    "api_key": os.getenv("FMP_API_KEY", ""),
    "endpoints": {
        "general_news": "https://financialmodelingprep.com/stable/news/general-latest",
        "fmp_articles": "https://financialmodelingprep.com/stable/fmp-articles",
        "stock_news": "https://financialmodelingprep.com/stable/news/stock",
        "crypto_news": "https://financialmodelingprep.com/stable/news/crypto",
        "press_releases": "https://financialmodelingprep.com/stable/news/press-releases",
        "earnings_calendar": "https://financialmodelingprep.com/api/v3/earning_calendar",
        "economic_calendar": "https://financialmodelingprep.com/api/v3/economic_calendar",
        "ipos_calendar": "https://financialmodelingprep.com/stable/ipos-calendar",
        "mergers_acquisitions": "https://financialmodelingprep.com/stable/mergers-acquisitions-latest",
    },
    "news_limits": allocate_limits(120, BASE_SOURCE_WEIGHTS),
    "output_limits": allocate_limits(MAX_TOTAL, BASE_COUNTRY_WEIGHTS),
    "category_limits": {
        "crypto": 8,
    },
    "max_total_articles": MAX_TOTAL,
    "days_ahead": DAYS_AHEAD,
    "days_back": DAYS_BACK,
}

# ---------------------------------------------------------------------------
# 1️⃣1️⃣  Auto-exec : lance les self-tests si appelé en script
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
    _quick_self_tests()
    logger.info("CONFIG ready. Example WEIGHTS: %s", WEIGHTS)
