# portfolio_engine/factors.py
"""
FactorScorer v3.0.0 — SEUL MOTEUR D'ALPHA
=========================================

v3.0.0 Changes (ÉTAPE 1.2 - Rank Normalization):
- NOUVEAU: USE_RANK_NORMALIZATION = True (remplace z-score)
- NOUVEAU: _rank_by_class() pour distribution uniforme [0,1]
- NOUVEAU: _normalize_by_class() wrapper intelligent
- FIX: Mega-caps ne sont plus comprimées à z≈0
- Distribution uniforme évite le rejet systématique des groupes homogènes

PROBLÈME RÉSOLU:
  AVANT (z-score):
    mega_caps_roe = [28, 29, 30, 31, 32]  # ROE similaires
    z_scores = [-0.95, -0.32, 0.32, 0.95, 1.58]  # Comprimés!
    → Scores ≈ 0.5 pour tous → "Score insuffisant" → REJETÉES
  
  APRÈS (ranks):
    ranks = [0.0, 0.25, 0.50, 0.75, 1.0]  # Distribution uniforme
    → Chaque mega-cap a un rang distinct
    → NVIDIA: 0.72 → SÉLECTIONNÉ

v2.4.7 Changes (RADAR ETF Integration):
- NON_TILTABLE_BUCKETS pour filtrer alt assets
- SECTOR_MAPPING_ETF pour normaliser Twelve Data → RADAR
- _get_sector_for_tilt() et _get_region_for_tilt() helpers
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Union, Any, Tuple, Set
from dataclasses import dataclass
from collections import defaultdict
import logging
import math
import json
from pathlib import Path
from datetime import datetime, timezone

# v3.0.0: Import scipy pour rankdata
try:
    from scipy.stats import rankdata
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False
    def rankdata(a, method='average'):
        """Fallback si scipy non disponible."""
        arr = np.array(a)
        sorter = np.argsort(arr)
        inv = np.empty_like(sorter)
        inv[sorter] = np.arange(len(arr))
        return inv + 1

# P1-10: Import stable sort for deterministic ordering
try:
    from utils.stable_sort import stable_sort_assets
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    try:
        from utils.stable_sort import stable_sort_assets
    except ImportError:
        def stable_sort_assets(assets, score_key="composite_score", id_key="symbol", **kwargs):
            """Fallback stable sort with tie-breaker."""
            def sort_key(a):
                score = a.get(score_key, 0) or 0
                try:
                    score = float(score)
                except (TypeError, ValueError):
                    score = 0.0
                id_val = str(a.get(id_key) or a.get("id") or a.get("ticker") or "").lower()
                return (-score, id_val)
            return sorted(assets, key=sort_key)

logger = logging.getLogger("portfolio_engine.factors")


# ============= v3.0.0 RANK NORMALIZATION CONFIG =============

# v3.0.0: Normalisation par RANKS au lieu de Z-SCORES (Étape 1.2)
# Ranks produisent une distribution uniforme [0,1] au lieu de [-3,+3]
# Cela évite la compression des groupes homogènes (mega-caps avec ROE similaires)
USE_RANK_NORMALIZATION = True  # True = ranks [0,1], False = z-scores (legacy)


# ============= CATEGORY NORMALIZATION =============

CATEGORY_NORMALIZE = {
    "equity": "equity", "equities": "equity", "action": "equity", "actions": "equity",
    "stock": "equity", "stocks": "equity",
    "etf": "etf", "etfs": "etf",
    "bond": "bond", "bonds": "bond", "obligation": "bond", "obligations": "bond",
    "crypto": "crypto", "cryptocurrency": "crypto", "cryptocurrencies": "crypto",
}


def normalize_category(category: str, fund_type: str = "", etf_type: str = "", sector_bucket: str = "") -> str:
    """Normalise la catégorie vers une clé standard."""
    fund_type_lower = str(fund_type).lower().strip() if fund_type else ""
    if "bond" in fund_type_lower or "obligation" in fund_type_lower or "fixed income" in fund_type_lower:
        return "bond"
    if etf_type or sector_bucket:
        return "etf"
    if not category:
        return "other"
    return CATEGORY_NORMALIZE.get(category.lower().strip(), "other")


FACTORS_BY_CATEGORY = {
    "equity": ["momentum", "quality_fundamental", "low_vol", "tactical_context", "liquidity", "mean_reversion"],
    "etf": ["momentum", "low_vol", "cost_efficiency", "tactical_context", "liquidity", "mean_reversion"],
    "bond": ["momentum", "low_vol", "cost_efficiency", "bond_quality", "liquidity"],
    "crypto": ["momentum", "low_vol", "liquidity", "mean_reversion"],
    "other": ["momentum", "low_vol", "liquidity"],
}

MISSING_VOL_PENALTY = {"equity": 40.0, "etf": 30.0, "bond": 15.0, "crypto": 100.0, "other": 30.0}
MISSING_LIQUIDITY_PENALTY = {"equity": 100_000_000, "etf": 50_000_000, "bond": 100_000_000, "crypto": 10_000_000, "other": 50_000_000}

BOND_BUCKET_THRESHOLDS = {"defensive": 75, "core": 55, "risky": 35}

DATA_QUALITY_PENALTY = 0.15
MAX_DQ_PENALTY = 0.6
MARKET_CONTEXT_STALE_DAYS = 7

# ============= SECTOR/COUNTRY MAPPINGS =============

SECTOR_KEY_MAPPING = {
    "Energy": "energy", "Basic Materials": "materials", "Materials": "materials",
    "Industrials": "industrials", "Consumer Cyclical": "consumer-discretionary",
    "Consumer Defensive": "consumer-staples", "Healthcare": "healthcare",
    "Financial Services": "financials", "Financials": "financials",
    "Technology": "information-technology", "Communication Services": "communication-services",
    "Utilities": "utilities", "Real Estate": "real-estate",
}

COUNTRY_NORMALIZATION = {
    "United States": "Etats-Unis", "USA": "Etats-Unis", "US": "Etats-Unis",
    "France": "France", "Germany": "Allemagne", "United Kingdom": "Royaume Uni",
    "UK": "Royaume Uni", "China": "Chine", "Japan": "Japon",
}

DEFAULT_MACRO_TILTS = {
    "favored_sectors": ["healthcare", "consumer-staples", "utilities"],
    "avoided_sectors": ["real-estate", "consumer-discretionary"],
    "favored_regions": ["usa", "switzerland"],
    "avoided_regions": ["china", "hong-kong"],
}

SECTOR_TO_RADAR = {
    "Technology": "information-technology", "Healthcare": "healthcare",
    "Financial Services": "financials", "Finance": "financials",
    "Santé": "healthcare", "Technologie de l'information": "information-technology",
    "Biens de consommation cycliques": "consumer-discretionary",
    "Biens de consommation de base": "consumer-staples",
    "healthcare": "healthcare", "financials": "financials",
    "information-technology": "information-technology",
}

COUNTRY_TO_RADAR = {
    "Corée du Sud": "south-korea", "Corée": "south-korea", "South Korea": "south-korea",
    "Chine": "china", "China": "china", "Japon": "japan", "Japan": "japan",
    "Etats-Unis": "usa", "États-Unis": "usa", "USA": "usa", "US": "usa",
    "Royaume-Uni": "uk", "UK": "uk", "France": "france",
    "Allemagne": "germany", "Germany": "germany",
}

NON_TILTABLE_BUCKETS = {
    "ALT_ASSET_COMMODITY", "ALT_ASSET_CRYPTO", "ALT_ASSET_FX",
    "ALT_ASSET_VOLATILITY", "INDEX_DERIVATIVE", "STRUCTURED_VEHICLE", "DATA_MISSING",
}

SECTOR_MAPPING_ETF = {
    "Technology": "information-technology", "Financial Services": "financials",
    "Healthcare": "healthcare", "Consumer Cyclical": "consumer-discretionary",
    "Consumer Defensive": "consumer-staples", "Industrials": "industrials",
    "Basic Materials": "materials", "Energy": "energy", "Utilities": "utilities",
    "Communication Services": "communication-services", "Real Estate": "real-estate",
}


def normalize_sector_for_tilts(sector: str) -> str:
    if not sector:
        return ""
    if sector in SECTOR_TO_RADAR:
        return SECTOR_TO_RADAR[sector]
    sector_lower = sector.lower()
    for key, value in SECTOR_TO_RADAR.items():
        if key.lower() == sector_lower:
            return value
    return sector_lower.replace(" ", "-").replace("_", "-")


def normalize_region_for_tilts(country: str) -> str:
    if not country:
        return ""
    if country in COUNTRY_TO_RADAR:
        return COUNTRY_TO_RADAR[country]
    country_lower = country.lower()
    for key, value in COUNTRY_TO_RADAR.items():
        if key.lower() == country_lower:
            return value
    return country_lower.replace(" ", "-").replace("_", "-")


def _normalize_tilts_list(tilts: list, normalize_fn) -> list:
    if not tilts:
        return []
    return [normalize_fn(item) for item in tilts if isinstance(item, str) and item.strip() and normalize_fn(item)]


# ============= MARKET CONTEXT & HELPERS =============

def load_market_context(data_dir: str = "data") -> Dict[str, Any]:
    """Charge le contexte marché depuis les fichiers JSON."""
    data_path = Path(data_dir)
    context = {"sectors": {}, "indices": {}, "macro_tilts": DEFAULT_MACRO_TILTS, "loaded_at": None}
    
    for name, file in [("sectors", "sectors.json"), ("indices", "markets.json"), ("macro_tilts", "macro_tilts.json")]:
        path = data_path / file
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    context[name] = json.load(f)
            except Exception as e:
                logger.warning(f"Error reading {path}: {e}")
    
    context["loaded_at"] = datetime.now().isoformat()
    return context


def _build_sector_lookup(sectors_data: Dict, preferred_region: str = "US") -> Dict:
    lookup = {}
    sectors = sectors_data.get("sectors", {})
    for key, entries in sectors.items():
        if not entries:
            continue
        candidate = next((e for e in entries if e.get("region") == preferred_region), entries[0])
        lookup[key] = candidate
    return lookup


def _build_country_lookup(indices_data: Dict) -> Dict:
    lookup = {}
    for region, entries in indices_data.get("indices", {}).items():
        for e in entries:
            country = e.get("country")
            if country and country not in lookup:
                lookup[country] = e
    return lookup


def _get_market_context_age(loaded_at: Optional[str]) -> Tuple[Optional[float], bool]:
    if not loaded_at:
        return None, True
    try:
        dt = datetime.fromisoformat(loaded_at.replace('Z', '+00:00'))
        now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
        age_days = (now - dt).total_seconds() / 86400
        return round(age_days, 2), age_days > MARKET_CONTEXT_STALE_DAYS
    except Exception:
        return None, True


RATING_TO_SCORE = {
    "AAA": 95, "AA+": 90, "AA": 85, "AA-": 80, "A+": 77, "A": 75, "A-": 72,
    "BBB+": 65, "BBB": 60, "BBB-": 55, "BB+": 50, "BB": 45, "BB-": 40,
    "B+": 35, "B": 30, "B-": 25, "CCC": 15, "NOT RATED": 40, "NR": 40,
}


def _rating_to_score(rating: str) -> float:
    if pd.isna(rating):
        return np.nan
    s = str(rating).strip()
    return RATING_TO_SCORE.get(s) or RATING_TO_SCORE.get(s.upper(), np.nan)


def add_bond_risk_factors(df: pd.DataFrame) -> pd.DataFrame:
    """Enrichit un DataFrame de bonds avec des facteurs de risque/qualité."""
    out = df.copy()
    credit_num = pd.to_numeric(out.get("bond_credit_score"), errors="coerce")
    
    if "bond_credit_rating" in out.columns:
        missing = credit_num.isna()
        if missing.any():
            from_rating = out.loc[missing, "bond_credit_rating"].map(_rating_to_score)
            credit_num = credit_num.copy()
            credit_num.loc[missing] = from_rating
    
    out["f_bond_credit_score"] = (credit_num / 100.0).clip(lower=0, upper=1)
    
    D_MAX, V_MAX = 10.0, 12.0
    dur = pd.to_numeric(out.get("bond_avg_duration"), errors="coerce").clip(lower=0, upper=D_MAX) / D_MAX
    out["f_bond_duration_score"] = 1.0 - dur
    
    vol = pd.to_numeric(out.get("vol_pct"), errors="coerce").clip(lower=0, upper=V_MAX) / V_MAX
    out["f_bond_volatility_score"] = 1.0 - vol
    
    f_credit = out["f_bond_credit_score"].fillna(0.5)
    f_dur = out["f_bond_duration_score"].fillna(0.5)
    f_vol = out["f_bond_volatility_score"].fillna(0.5)
    
    out["f_bond_quality"] = (0.50 * f_credit + 0.25 * f_dur + 0.25 * f_vol).clip(0, 1)
    out["f_bond_quality_0_100"] = (out["f_bond_quality"] * 100).round(1)
    
    bins = [-np.inf, 0.3, 0.6, 0.8, np.inf]
    out["bond_risk_bucket"] = pd.cut(out["f_bond_quality"], bins=bins, labels=["very_risky", "risky", "core", "defensive"])
    return out


# ============= FACTOR WEIGHTS =============

@dataclass
class FactorWeights:
    momentum: float = 0.30
    quality_fundamental: float = 0.25
    low_vol: float = 0.25
    cost_efficiency: float = 0.05
    bond_quality: float = 0.00
    tactical_context: float = 0.05
    liquidity: float = 0.05
    mean_reversion: float = 0.05


PROFILE_WEIGHTS = {
    "Agressif": FactorWeights(momentum=0.40, quality_fundamental=0.25, low_vol=0.08, cost_efficiency=0.05,
                              bond_quality=0.00, tactical_context=0.10, liquidity=0.07, mean_reversion=0.05),
    "Modéré": FactorWeights(momentum=0.28, quality_fundamental=0.25, low_vol=0.15, cost_efficiency=0.07,
                            bond_quality=0.08, tactical_context=0.07, liquidity=0.05, mean_reversion=0.05),
    "Stable": FactorWeights(momentum=0.12, quality_fundamental=0.20, low_vol=0.25, cost_efficiency=0.10,
                            bond_quality=0.15, tactical_context=0.05, liquidity=0.08, mean_reversion=0.05),
}


def fnum(x) -> float:
    """Conversion robuste vers float."""
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        return 0.0 if math.isnan(x) else float(x)
    try:
        import re
        s = re.sub(r"[^0-9.\-]", "", str(x))
        return float(s) if s not in ("", "-", ".", "-.") else 0.0
    except:
        return 0.0


def _is_missing(value) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str):
        v = value.strip().lower()
        return v in ("", "n/a", "null", "none", "nan", "-")
    return False


def _is_missing_or_zero(value) -> bool:
    if _is_missing(value):
        return True
    try:
        num = float(value) if not isinstance(value, (int, float)) else value
        return math.isnan(num) or num <= 0
    except:
        return True


def _normalize_ter(ter_raw: float, symbol: str = "?") -> Tuple[Optional[float], str]:
    if _is_missing_or_zero(ter_raw):
        return None, "missing"
    ter = fnum(ter_raw)
    if 0.01 <= ter <= 3.0:
        return ter, "high"
    if 0.0001 <= ter < 0.05:
        ter_pct = ter * 100
        return (ter_pct, "medium") if 0.01 <= ter_pct <= 3.0 else (ter_pct, "low")
    return None, "rejected"


def _compute_bond_quality_raw(credit_score: float, duration: Optional[float], vol: Optional[float], symbol: str = "?") -> Tuple[float, Dict]:
    metadata = {"missing_fields": [], "penalty_applied": False, "components": {}}
    f_credit = min(1.0, max(0.0, credit_score / 100.0))
    metadata["components"]["credit"] = round(f_credit * 100, 1)
    
    D_MAX, V_MAX = 10.0, 12.0
    if _is_missing_or_zero(duration):
        metadata["missing_fields"].append("duration")
        f_dur = 0.3
        metadata["penalty_applied"] = True
    else:
        f_dur = 1.0 - min(1.0, max(0.0, fnum(duration) / D_MAX))
    metadata["components"]["duration"] = round(f_dur * 100, 1)
    
    if _is_missing_or_zero(vol):
        metadata["missing_fields"].append("vol")
        f_vol = 0.3
        metadata["penalty_applied"] = True
    else:
        f_vol = 1.0 - min(1.0, max(0.0, fnum(vol) / V_MAX))
    metadata["components"]["vol"] = round(f_vol * 100, 1)
    
    quality_raw = 0.50 * f_credit + 0.25 * f_dur + 0.25 * f_vol
    return round(quality_raw * 100, 1), metadata


def _get_bond_risk_bucket(quality_raw_0_100: float) -> str:
    if quality_raw_0_100 >= BOND_BUCKET_THRESHOLDS["defensive"]:
        return "defensive"
    elif quality_raw_0_100 >= BOND_BUCKET_THRESHOLDS["core"]:
        return "core"
    elif quality_raw_0_100 >= BOND_BUCKET_THRESHOLDS["risky"]:
        return "risky"
    return "very_risky"


# ============= BUFFETT QUALITY =============

SECTOR_QUALITY_THRESHOLDS = {
    "tech": {"roe_good": 15, "roic_good": 12, "de_max": 80, "fcf_good": 3},
    "finance": {"roe_good": 10, "roic_good": None, "de_max": None, "fcf_good": None},
    "_default": {"roe_good": 12, "roic_good": 10, "de_max": 120, "fcf_good": 3},
}

SECTOR_MAPPING_QUALITY = {
    "technology": "tech", "tech": "tech", "finance": "finance", "financials": "finance",
}


def get_sector_key(sector: Optional[str]) -> str:
    if not sector:
        return "_default"
    sector_lower = sector.lower().strip()
    for pattern, key in SECTOR_MAPPING_QUALITY.items():
        if pattern in sector_lower or sector_lower in pattern:
            return key
    return "_default"


def compute_buffett_quality_score(asset: dict) -> float:
    """Calcule un score de qualité Buffett [0, 100] pour un actif."""
    sector_key = get_sector_key(asset.get("sector"))
    thresholds = SECTOR_QUALITY_THRESHOLDS.get(sector_key, SECTOR_QUALITY_THRESHOLDS["_default"])
    
    scores, weights = [], []
    
    roe = fnum(asset.get("roe"))
    if roe > 0:
        scores.append(min(100, (roe / thresholds.get("roe_good", 12)) * 70))
        weights.append(0.20)
    
    roic = fnum(asset.get("roic"))
    roic_good = thresholds.get("roic_good")
    if roic_good and roic > 0:
        scores.append(min(100, (roic / roic_good) * 70))
        weights.append(0.30)
    
    fcf = fnum(asset.get("fcf_yield"))
    if fcf != 0:
        scores.append(max(0, 50 + (fcf / thresholds.get("fcf_good", 3)) * 25) if fcf > 0 else max(0, 30 + fcf * 5))
        weights.append(0.20)
    
    de = fnum(asset.get("de_ratio"))
    de_max = thresholds.get("de_max")
    if de_max and de >= 0:
        scores.append(80 - (de / de_max) * 30 if de <= de_max else max(0, 50 - (de - de_max) / de_max * 50))
        weights.append(0.15)
    
    eps_growth = fnum(asset.get("eps_growth_5y"))
    if asset.get("eps_growth_5y") is not None:
        if eps_growth >= 15:
            eps_score = 90
        elif eps_growth >= 10:
            eps_score = 75
        elif eps_growth >= 5:
            eps_score = 60
        elif eps_growth >= 0:
            eps_score = 45
        else:
            eps_score = max(0, 30 + eps_growth * 2)
        scores.append(eps_score)
        weights.append(0.15)
    
    if not scores or sum(weights) == 0:
        return 50.0
    return round(sum(s * w for s, w in zip(scores, weights)) / sum(weights), 1)


# ============= FACTOR SCORER v3.0.0 =============

class FactorScorer:
    """
    v3.0.0 — Rank Normalization (Étape 1.2):
    - NOUVEAU: _rank_by_class() pour distribution uniforme
    - NOUVEAU: _normalize_by_class() wrapper intelligent
    - FIX: Mega-caps ne sont plus comprimées
    """
    
    def __init__(self, profile: str = "Modéré", market_context: Optional[Dict] = None):
        if profile not in PROFILE_WEIGHTS:
            raise ValueError(f"Profil inconnu: {profile}")
        self.profile = profile
        self.weights = PROFILE_WEIGHTS[profile]
        self.market_context = market_context or {}
        self._sector_lookup = None
        self._country_lookup = None
        self._macro_tilts = None
        self._market_context_age_days: Optional[float] = None
        self._market_context_stale: bool = True
        
        self._bond_quality_raw: Dict[int, float] = {}
        self._bond_quality_meta: Dict[int, Dict] = {}
        self._ter_confidence: Dict[int, str] = {}
        self._missing_critical_fields: Dict[int, Set[str]] = {}
        
        if self.market_context:
            self._build_lookups()
    
    def _build_lookups(self):
        if "sectors" in self.market_context:
            self._sector_lookup = _build_sector_lookup(self.market_context["sectors"])
        if "indices" in self.market_context:
            self._country_lookup = _build_country_lookup(self.market_context["indices"])
        self._macro_tilts = self.market_context.get("macro_tilts", DEFAULT_MACRO_TILTS)
        
        if self._macro_tilts:
            self._macro_tilts = {
                "favored_sectors": _normalize_tilts_list(self._macro_tilts.get("favored_sectors", []), normalize_sector_for_tilts),
                "avoided_sectors": _normalize_tilts_list(self._macro_tilts.get("avoided_sectors", []), normalize_sector_for_tilts),
                "favored_regions": _normalize_tilts_list(self._macro_tilts.get("favored_regions", []), normalize_region_for_tilts),
                "avoided_regions": _normalize_tilts_list(self._macro_tilts.get("avoided_regions", []), normalize_region_for_tilts),
            }
        
        loaded_at = self.market_context.get("loaded_at")
        self._market_context_age_days, self._market_context_stale = _get_market_context_age(loaded_at)
    
    def _track_missing(self, idx: int, field: str):
        if idx not in self._missing_critical_fields:
            self._missing_critical_fields[idx] = set()
        self._missing_critical_fields[idx].add(field)
    
    # ============= v3.0.0 RANK NORMALIZATION =============
    
    @staticmethod
    def _rank_by_class(values: List[float], categories: List[str], min_samples: int = 5) -> np.ndarray:
        """v3.0.0: Rank percentile PAR CLASSE - distribution uniforme [-1, +1]."""
        n = len(values)
        result = np.zeros(n)
        
        by_cat: Dict[str, List[int]] = defaultdict(list)
        for i, cat in enumerate(categories):
            by_cat[cat].append(i)
        
        for cat, indices in by_cat.items():
            if len(indices) < min_samples:
                continue
            
            group_values = np.array([values[i] for i in indices], dtype=float)
            group_values = np.nan_to_num(group_values, nan=0.0)
            
            ranks = rankdata(group_values, method='average')
            n_group = len(indices)
            if n_group > 1:
                normalized_ranks = (ranks - 1) / (n_group - 1)
                centered_ranks = (normalized_ranks - 0.5) * 2
            else:
                centered_ranks = np.array([0.0])
            
            for idx, rank_val in zip(indices, centered_ranks):
                result[idx] = rank_val
        
        return result
    
    @staticmethod
    def _zscore_by_class(values: List[float], categories: List[str], min_samples: int = 5, winsor_pct: float = 0.02) -> np.ndarray:
        """Z-score PAR CLASSE (legacy)."""
        n = len(values)
        result = np.zeros(n)
        
        by_cat: Dict[str, List[int]] = defaultdict(list)
        for i, cat in enumerate(categories):
            by_cat[cat].append(i)
        
        for cat, indices in by_cat.items():
            if len(indices) < min_samples:
                continue
            
            group_values = np.array([values[i] for i in indices], dtype=float)
            group_values = np.nan_to_num(group_values, nan=0.0)
            
            if len(group_values) > 2:
                lo, hi = np.percentile(group_values, [winsor_pct * 100, 100 - winsor_pct * 100])
                group_values = np.clip(group_values, lo, hi)
            
            std = group_values.std()
            if std > 1e-8:
                mean = group_values.mean()
                zscores = (group_values - mean) / std
                for idx, z in zip(indices, zscores):
                    result[idx] = z
        
        return result
    
    def _normalize_by_class(self, values: List[float], categories: List[str], min_samples: int = 5, 
                           higher_is_better: bool = True, use_ranks: bool = None) -> np.ndarray:
        """v3.0.0: Wrapper intelligent - choisit ranks ou z-scores."""
        if use_ranks is None:
            use_ranks = USE_RANK_NORMALIZATION
        
        if use_ranks:
            result = self._rank_by_class(values, categories, min_samples)
        else:
            result = self._zscore_by_class(values, categories, min_samples)
        
        if not higher_is_better:
            result = -result
        
        return result
    
    def _get_normalized_category(self, asset: dict) -> str:
        return normalize_category(asset.get("category", ""), asset.get("fund_type", ""),
                                  asset.get("etf_type", ""), asset.get("sector_bucket", ""))
    
    def _get_sector_for_tilt(self, asset: dict) -> str:
        cat = self._get_normalized_category(asset)
        if cat == "etf":
            bucket = asset.get("sector_bucket", "")
            if bucket in NON_TILTABLE_BUCKETS or not asset.get("sector_signal_ok", False):
                return ""
            sector_top = asset.get("sector_top", {})
            sector_raw = sector_top.get("sector", "") if isinstance(sector_top, dict) else str(sector_top) if sector_top else ""
            return SECTOR_MAPPING_ETF.get(sector_raw, sector_raw)
        elif cat == "equity":
            return asset.get("sector_top", "") or asset.get("sector", "")
        return ""
    
    def _get_region_for_tilt(self, asset: dict) -> str:
        cat = self._get_normalized_category(asset)
        if cat == "etf":
            return ""
        elif cat == "equity":
            return asset.get("country_top", "") or asset.get("country", "")
        return ""
    
    # ============= FACTOR COMPUTATION =============
    
    def compute_factor_momentum(self, assets: List[dict]) -> np.ndarray:
        n = len(assets)
        p12m = [fnum(a.get("one_year_return_pct") or a.get("perf_12m") or a.get("one_year_return")) for a in assets]
        p1m = [fnum(a.get("perf_1m")) for a in assets]
        p3m = [fnum(a.get("perf_3m")) for a in assets]
        ytd = [fnum(a.get("ytd")) for a in assets]
        
        def mom_12m_1m(r12: float, r1: float) -> float:
            if r1 <= -99:
                return r12
            return ((1 + r12/100) / (1 + r1/100) - 1) * 100
        
        has_12m, has_1m, has_3m = any(p12m), any(p1m), any(p3m)
        
        if has_12m and has_1m:
            raw = [mom_12m_1m(p12m[i], p1m[i]) for i in range(n)]
        elif has_12m:
            raw = p12m[:]
        elif has_3m and has_1m:
            raw = [mom_12m_1m(p3m[i], p1m[i]) for i in range(n)]
        elif has_3m:
            raw = p3m[:]
        elif has_1m:
            raw = [0.6 * p1m[i] + 0.4 * ytd[i] for i in range(n)]
        else:
            p7d = [fnum(a.get("perf_7d")) for a in assets]
            p24h = [fnum(a.get("perf_24h")) for a in assets]
            raw = [0.7 * p7d[i] + 0.3 * p24h[i] for i in range(n)]
        
        for i, a in enumerate(assets):
            if self._get_normalized_category(a) == "crypto":
                sharpe = fnum(a.get("sharpe_ratio", 0))
                ret_90d = fnum(a.get("ret_90d_pct") or a.get("perf_3m") or 0)
                dd = abs(fnum(a.get("drawdown_90d_pct") or a.get("maxdd90") or 0))
                
                sharpe_bonus = max(-20, min(20, sharpe * 10))
                ret_bonus = 15 if ret_90d > 0 else 10 if ret_90d > -15 else 0 if ret_90d > -25 else -10 if ret_90d > -35 else -20 if ret_90d > -45 else -30
                dd_penalty = -20 if dd > 50 else -15 if dd > 40 else -10 if dd > 30 else -5 if dd > 25 else 0
                raw[i] += sharpe_bonus + ret_bonus + dd_penalty
        
        categories = [self._get_normalized_category(a) for a in assets]
        return self._normalize_by_class(raw, categories, higher_is_better=True)
    
    def compute_factor_quality_fundamental(self, assets: List[dict]) -> np.ndarray:
        scores, categories = [], []
        for asset in assets:
            cat = self._get_normalized_category(asset)
            categories.append(cat)
            scores.append(compute_buffett_quality_score(asset) if cat == "equity" else None)
        
        result = np.zeros(len(assets))
        equity_indices = [i for i, s in enumerate(scores) if s is not None]
        
        if len(equity_indices) >= 5:
            equity_scores = [scores[i] for i in equity_indices]
            equity_cats = [categories[i] for i in equity_indices]
            normalized = self._normalize_by_class(equity_scores, equity_cats, higher_is_better=True)
            for idx, norm_val in zip(equity_indices, normalized):
                result[idx] = norm_val
        
        return result
    
    def compute_factor_low_vol(self, assets: List[dict]) -> np.ndarray:
        raw_vol, categories = [], []
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            vol = a.get("vol_3y") or a.get("vol30") or a.get("vol_annual") or a.get("vol") or a.get("vol_pct") or a.get("vol_30d_annual_pct")
            if _is_missing_or_zero(vol):
                vol = MISSING_VOL_PENALTY.get(cat, 30.0)
                self._track_missing(idx, "vol")
            else:
                vol = fnum(vol)
            raw_vol.append(vol)
        return self._normalize_by_class(raw_vol, categories, higher_is_better=False)
    
    def compute_factor_cost_efficiency(self, assets: List[dict]) -> np.ndarray:
        scores, categories = [], []
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            if cat not in ["etf", "bond"]:
                scores.append(None)
                continue
            
            ter_raw = a.get("total_expense_ratio")
            ter_pct, confidence = _normalize_ter(ter_raw, a.get("symbol", "?"))
            self._ter_confidence[idx] = confidence
            
            if ter_pct is None or confidence == "rejected":
                ter_score = 20.0
                self._track_missing(idx, "ter")
            elif confidence == "low":
                ter_score = max(0, 100 - ter_pct * 33) * 0.7
            else:
                ter_score = max(0, 100 - ter_pct * 33)
            
            yield_ttm = fnum(a.get("yield_ttm", 0))
            fund_type = str(a.get("fund_type", "")).lower()
            
            if "bond" in fund_type or cat == "bond":
                final_score = 0.5 * ter_score + 0.5 * min(100, yield_ttm * 12.5)
            else:
                final_score = 0.8 * ter_score + 0.2 * min(20, yield_ttm * 5)
            
            scores.append(final_score)
        
        result = np.zeros(len(assets))
        valid_indices = [i for i, s in enumerate(scores) if s is not None]
        if len(valid_indices) >= 5:
            valid_scores = [scores[i] for i in valid_indices]
            valid_cats = [categories[i] for i in valid_indices]
            normalized = self._normalize_by_class(valid_scores, valid_cats, higher_is_better=True)
            for idx, norm_val in zip(valid_indices, normalized):
                result[idx] = norm_val
        return result
    
    def compute_factor_bond_quality(self, assets: List[dict]) -> np.ndarray:
        scores, categories = [], []
        self._bond_quality_raw, self._bond_quality_meta = {}, {}
        
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            if cat != "bond":
                scores.append(None)
                continue
            
            credit_raw = a.get("bond_credit_score")
            if _is_missing_or_zero(credit_raw):
                rating = a.get("bond_credit_rating", "")
                credit_raw = _rating_to_score(rating) if rating else None
                if _is_missing(credit_raw) or pd.isna(credit_raw) or credit_raw <= 0:
                    credit_raw = 35.0
                    self._track_missing(idx, "credit")
            
            quality_raw, metadata = _compute_bond_quality_raw(fnum(credit_raw), a.get("bond_avg_duration"), 
                                                               a.get("vol_pct") or a.get("vol_3y"), a.get("symbol", "?"))
            self._bond_quality_raw[idx] = quality_raw
            self._bond_quality_meta[idx] = metadata
            scores.append(quality_raw)
            for field in metadata["missing_fields"]:
                self._track_missing(idx, field)
        
        result = np.zeros(len(assets))
        valid_indices = [i for i, s in enumerate(scores) if s is not None]
        if len(valid_indices) >= 3:
            valid_scores = [scores[i] for i in valid_indices]
            valid_cats = [categories[i] for i in valid_indices]
            normalized = self._normalize_by_class(valid_scores, valid_cats, min_samples=3, higher_is_better=True)
            for idx, norm_val in zip(valid_indices, normalized):
                result[idx] = norm_val
        return result
    
    def compute_factor_tactical_context(self, assets: List[dict]) -> np.ndarray:
        if not self._sector_lookup and not self._country_lookup and not self._macro_tilts:
            return np.zeros(len(assets))
        
        scores, categories = [], []
        for a in assets:
            sector_for_tilt = self._get_sector_for_tilt(a)
            region_for_tilt = self._get_region_for_tilt(a)
            categories.append(self._get_normalized_category(a))
            
            components, weights = [], []
            
            if self._sector_lookup and sector_for_tilt:
                sector_key = SECTOR_KEY_MAPPING.get(sector_for_tilt.strip())
                if sector_key and sector_key in self._sector_lookup:
                    ref = self._sector_lookup[sector_key]
                    ytd = ref.get("ytd_num", 0) or 0
                    daily = ref.get("change_num", 0) or 0
                    raw = 0.7 * (ytd / 25.0) + 0.3 * (daily / 2.0)
                    components.append(0.5 * (max(-1.0, min(1.0, raw)) + 1.0))
                    weights.append(0.4)
            
            if self._country_lookup and region_for_tilt:
                norm_country = COUNTRY_NORMALIZATION.get(region_for_tilt.strip(), region_for_tilt.strip())
                if norm_country in self._country_lookup:
                    ref = self._country_lookup[norm_country]
                    ytd = ref.get("ytd_num", 0) or ref.get("_ytd_value", 0) or 0
                    daily = ref.get("change_num", 0) or ref.get("_change_value", 0) or 0
                    raw = 0.7 * (ytd / 25.0) + 0.3 * (daily / 2.0)
                    components.append(0.5 * (max(-1.0, min(1.0, raw)) + 1.0))
                    weights.append(0.3)
            
            if self._macro_tilts:
                f_macro = 0.5
                sector_normalized = normalize_sector_for_tilts(sector_for_tilt)
                region_normalized = normalize_region_for_tilts(region_for_tilt)
                
                if sector_normalized in self._macro_tilts.get("favored_sectors", []):
                    f_macro += 0.2
                elif sector_normalized in self._macro_tilts.get("avoided_sectors", []):
                    f_macro -= 0.2
                
                if region_normalized in self._macro_tilts.get("favored_regions", []):
                    f_macro += 0.15
                elif region_normalized in self._macro_tilts.get("avoided_regions", []):
                    f_macro -= 0.15
                
                components.append(max(0.0, min(1.0, f_macro)))
                weights.append(0.3)
            
            tactical_score = sum(c * w for c, w in zip(components, weights)) / sum(weights) if components else 0.5
            scores.append(tactical_score * 100)
        
        return self._normalize_by_class(scores, categories, higher_is_better=True)
    
    def compute_factor_liquidity(self, assets: List[dict]) -> np.ndarray:
        raw_liq, categories = [], []
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            liq = a.get("liquidity") or a.get("market_cap") or a.get("aum_usd")
            liq = fnum(liq) if not _is_missing_or_zero(liq) else MISSING_LIQUIDITY_PENALTY.get(cat, 50_000_000)
            raw_liq.append(math.log(max(liq, 1)))
        return self._normalize_by_class(raw_liq, categories, higher_is_better=True)
    
    def compute_factor_mean_reversion(self, assets: List[dict]) -> np.ndarray:
        scores = []
        for a in assets:
            ytd, p1m = fnum(a.get("ytd")), fnum(a.get("perf_1m"))
            if ytd > 150:
                scores.append(-2.0)
            elif ytd > 100:
                scores.append(-1.0)
            elif ytd > 80 and p1m <= 0:
                scores.append(-1.5)
            elif ytd > 50 and p1m <= 2:
                scores.append(-0.5)
            else:
                scores.append(0.0)
        return np.array(scores)
    
    def compute_scores(self, assets: List[dict]) -> List[dict]:
        if not assets:
            return assets
        
        self._missing_critical_fields = {}
        self._ter_confidence = {}
        self._bond_quality_raw = {}
        self._bond_quality_meta = {}
        
        n = len(assets)
        categories = [self._get_normalized_category(a) for a in assets]
        
        from collections import Counter
        logger.info(f"[SCORING v3.0.0] {n} assets, USE_RANK_NORMALIZATION={USE_RANK_NORMALIZATION}")
        
        factors = {
            "momentum": self.compute_factor_momentum(assets),
            "quality_fundamental": self.compute_factor_quality_fundamental(assets),
            "low_vol": self.compute_factor_low_vol(assets),
            "cost_efficiency": self.compute_factor_cost_efficiency(assets),
            "bond_quality": self.compute_factor_bond_quality(assets),
            "tactical_context": self.compute_factor_tactical_context(assets),
            "liquidity": self.compute_factor_liquidity(assets),
            "mean_reversion": self.compute_factor_mean_reversion(assets),
        }
        
        composite = np.zeros(n)
        for i, asset in enumerate(assets):
            cat = categories[i]
            applicable_factors = FACTORS_BY_CATEGORY.get(cat, ["momentum", "low_vol", "liquidity"])
            
            total_weight, weighted_score = 0.0, 0.0
            for factor_name in applicable_factors:
                base_weight = getattr(self.weights, factor_name, 0)
                if base_weight > 0 and factor_name in factors:
                    weighted_score += base_weight * factors[factor_name][i]
                    total_weight += base_weight
            
            if total_weight > 0:
                composite[i] = weighted_score / total_weight
            
            missing_fields = self._missing_critical_fields.get(i, set())
            if missing_fields:
                composite[i] -= min(DATA_QUALITY_PENALTY * len(missing_fields), MAX_DQ_PENALTY)
        
        for i, asset in enumerate(assets):
            asset["factor_scores"] = {name: round(float(values[i]), 4) for name, values in factors.items()}
            asset["composite_score"] = round(float(composite[i]), 4)
            asset["score"] = asset["composite_score"]
            
            cat = categories[i]
            missing_fields_list = sorted(list(self._missing_critical_fields.get(i, set())))
            
            asset["_scoring_meta"] = {
                "category_normalized": cat,
                "scoring_version": "v3.0.0",
                "normalization_method": "rank" if USE_RANK_NORMALIZATION else "zscore",
                "missing_critical_fields": missing_fields_list,
            }
            
            if cat == "equity":
                asset["buffett_score"] = compute_buffett_quality_score(asset)
            if cat == "bond" and i in self._bond_quality_raw:
                asset["bond_quality_raw"] = self._bond_quality_raw[i]
                asset["bond_risk_bucket"] = _get_bond_risk_bucket(self._bond_quality_raw[i])
            
            asset["flags"] = {
                "overextended": (fnum(asset.get("ytd")) > 80 and fnum(asset.get("perf_1m")) <= 0) or (fnum(asset.get("ytd")) > 150),
                "incomplete_data": len(missing_fields_list) > 0,
            }
        
        for cat in set(categories):
            cat_indices = [i for i, c in enumerate(categories) if c == cat]
            if cat_indices:
                cat_scores = [composite[i] for i in cat_indices]
                p10, p90 = np.percentile(cat_scores, [10, 90])
                logger.info(f"Scores {cat}: n={len(cat_indices)}, p10={p10:.3f}, p90={p90:.3f}, spread={p90-p10:.3f}")
        
        logger.info(f"✅ Scoring v3.0.0 terminé: {n} actifs (profil {self.profile})")
        return assets
    
    def rank_assets(self, assets: List[dict], top_n: Optional[int] = None) -> List[dict]:
        scored = self.compute_scores(assets)
        ranked = stable_sort_assets(scored, score_key="composite_score", id_key="symbol", reverse_score=True)
        return ranked[:top_n] if top_n else ranked


# ============= UTILITAIRES =============

def rescore_universe_by_profile(universe: Union[List[dict], Dict[str, List[dict]]], profile: str, 
                                market_context: Optional[Dict] = None) -> List[dict]:
    scorer = FactorScorer(profile, market_context=market_context)
    if isinstance(universe, list):
        return scorer.compute_scores(list(universe))
    all_assets = []
    for category in ["equities", "etfs", "bonds", "crypto"]:
        all_assets.extend(list(universe.get(category, [])))
    return scorer.compute_scores(all_assets)


def get_factor_weights_summary() -> Dict[str, Dict[str, float]]:
    return {profile: {f: getattr(w, f) for f in ["momentum", "quality_fundamental", "low_vol", "cost_efficiency", 
                                                   "bond_quality", "tactical_context", "liquidity", "mean_reversion"]}
            for profile, w in PROFILE_WEIGHTS.items()}


def compare_factor_profiles() -> str:
    lines = [f"v3.0.0 - USE_RANK_NORMALIZATION = {USE_RANK_NORMALIZATION}", ""]
    factors = ["momentum", "quality_fundamental", "low_vol", "cost_efficiency", "bond_quality", "tactical_context", "liquidity", "mean_reversion"]
    for factor in factors:
        vals = [getattr(PROFILE_WEIGHTS[p], factor) for p in ["Agressif", "Modéré", "Stable"]]
        lines.append(f"{factor:<22} | {vals[0]:>6.0%} | {vals[1]:>6.0%} | {vals[2]:>6.0%}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(compare_factor_profiles())
    print("\n✅ factors.py v3.0.0 prêt!")
