# portfolio_engine/factors.py
"""
FactorScorer v2.3.1 — SEUL MOTEUR D'ALPHA
=========================================

v2.3.1 Changes (P1-10 Stable Sort):
- CORRECTIF: rank_assets() utilise maintenant stable_sort_assets()
- Garantit un tri déterministe avec tie-breaker par symbol
- Requis pour P1-5 DETERMINISTIC mode (core_hash cohérent)

v2.3 Changes (Tactical Context Integration):
- NOUVEAU: compute_factor_tactical_context() intégrant:
  - f_sector_trend: momentum du secteur (sectors.json)
  - f_region_trend: momentum de la région (markets.json)
  - f_macro_alignment: alignement aux convictions macro (macro_tilts.json)
- NOUVEAU: FactorWeights.tactical_context (5-10% selon profil)
- NOUVEAU: load_market_context() pour charger sectors/markets/macro_tilts
- MISE À JOUR: FactorScorer accepte market_context optionnel

v2.2 Changes (Bond Risk Factors):
- add_bond_risk_factors() pour enrichir DataFrames bonds
- f_bond_credit_score, f_bond_duration_score, f_bond_volatility_score
- f_bond_quality (composite 0-1) et bond_risk_bucket

v2.1 Changes (P0 Quick Wins):
- Facteur cost_efficiency (TER + yield_ttm) pour ETF/Bonds
- Bonus Sharpe ratio pour crypto dans momentum

Facteurs:
- momentum: 45% (Agressif) → 20% (Stable) — Driver principal
- quality_fundamental: 25-30% — Score Buffett intégré (ROIC, FCF, ROE)
- low_vol: 15-35% — Contrôle du risque
- cost_efficiency: 5-10% — TER + Yield (ETF/Bonds)
- bond_quality: 0-15% — Qualité obligataire (crédit + duration + vol)
- tactical_context: 5-10% — NOUVEAU v2.3: Contexte marché (sector/region/macro)
- liquidity: 5-10% — Filtre technique
- mean_reversion: 5% — Évite sur-extension

Le pari central:
"Des entreprises de qualité fondamentale (ROIC > 10%, FCF positif, dette maîtrisée)
avec un momentum positif sur 3-12 mois, alignées avec le contexte macro,
surperforment à horizon 1-3 ans."
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass
import logging
import math
import json
from pathlib import Path

# P1-10: Import stable sort for deterministic ordering
try:
    from utils.stable_sort import stable_sort_assets
except ImportError:
    # Fallback if utils not in path
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    try:
        from utils.stable_sort import stable_sort_assets
    except ImportError:
        # Ultimate fallback: inline implementation
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


# ============= v2.3 TACTICAL CONTEXT MAPPINGS =============

SECTOR_KEY_MAPPING = {
    # ETF sector_top -> clé dans sectors.json
    "Energy": "energy",
    "Basic Materials": "materials",
    "Materials": "materials",
    "Industrials": "industrials",
    "Industrial": "industrials",
    "Consumer Cyclical": "consumer-discretionary",
    "Consumer Discretionary": "consumer-discretionary",
    "Consumer Defensive": "consumer-staples",
    "Consumer Staples": "consumer-staples",
    "Healthcare": "healthcare",
    "Health Care": "healthcare",
    "Financial Services": "financials",
    "Financials": "financials",
    "Banks": "financials",
    "Insurance": "financials",
    "Technology": "information-technology",
    "Information Technology": "information-technology",
    "Communication Services": "communication-services",
    "Telecommunications": "communication-services",
    "Internet": "communication-services",
    "Utilities": "utilities",
    "Real Estate": "real-estate",
}

COUNTRY_NORMALIZATION = {
    # ETF country_top -> country dans markets.json
    "United States": "Etats-Unis",
    "USA": "Etats-Unis",
    "US": "Etats-Unis",
    "France": "France",
    "Germany": "Allemagne",
    "Spain": "Espagne",
    "Italy": "Italie",
    "Netherlands": "Pays-Bas",
    "Sweden": "Suède",
    "Switzerland": "Suisse",
    "United Kingdom": "Royaume Uni",
    "UK": "Royaume Uni",
    "China": "China",
    "Chine": "Chine",
    "Brazil": "Brésil",
    "Chile": "Chilie",
    "South Africa": "South Africa",
    "India": "Inde",
    "Japan": "Japon",
    "Mexico": "Mexique",
    "Canada": "Canada",
    "Australia": "Australie",
    "Saudi Arabia": "Saudi Arabia",
    "Israel": "Israel",
    "Eurozone": "Zone Euro",
    "Euro Area": "Zone Euro",
    "Taiwan": "Taiwan",
    "South Korea": "Corée du Sud",
    "Korea": "Corée du Sud",
    "Hong Kong": "Hong Kong",
    "Singapore": "Singapour",
    "Argentina": "Argentine",
    "Turkey": "Turquie",
}

DEFAULT_MACRO_TILTS = {
    "favored_sectors": ["Healthcare", "Consumer Defensive", "Utilities"],
    "avoided_sectors": ["Real Estate", "Consumer Discretionary", "Consumer Cyclical"],
    "favored_regions": ["United States", "Switzerland"],
    "avoided_regions": ["China", "Hong Kong"],
}


# ============= v2.3 MARKET CONTEXT LOADER =============

def load_market_context(data_dir: str = "data") -> Dict[str, Any]:
    """
    Charge le contexte marché depuis les fichiers JSON.
    
    Args:
        data_dir: Répertoire contenant sectors.json, markets.json, macro_tilts.json
    
    Returns:
        dict avec keys: 'sectors', 'indices', 'macro_tilts', 'loaded_at'
    """
    data_path = Path(data_dir)
    context = {
        "sectors": {},
        "indices": {},
        "macro_tilts": DEFAULT_MACRO_TILTS,
        "loaded_at": None,
    }
    
    # Charger sectors.json
    sectors_path = data_path / "sectors.json"
    if sectors_path.exists():
        try:
            with open(sectors_path, "r", encoding="utf-8") as f:
                context["sectors"] = json.load(f)
            logger.info(f"✅ Chargé: {sectors_path}")
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {sectors_path}: {e}")
    
    # Charger markets.json (contient les indices par pays/région)
    # Note: markets.json a la structure {"indices": {...}, "top_performers": {...}, "meta": {...}}
    markets_path = data_path / "markets.json"
    if markets_path.exists():
        try:
            with open(markets_path, "r", encoding="utf-8") as f:
                context["indices"] = json.load(f)
            logger.info(f"✅ Chargé: {markets_path}")
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {markets_path}: {e}")
    
    # Charger macro_tilts.json
    tilts_path = data_path / "macro_tilts.json"
    if tilts_path.exists():
        try:
            with open(tilts_path, "r", encoding="utf-8") as f:
                context["macro_tilts"] = json.load(f)
            logger.info(f"✅ Chargé: {tilts_path}")
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {tilts_path}: {e}")
    
    from datetime import datetime
    context["loaded_at"] = datetime.now().isoformat()
    
    return context


def _build_sector_lookup(sectors_data: Dict, preferred_region: str = "US") -> Dict:
    """Construit un lookup sector_key -> données de performance."""
    lookup = {}
    sectors = sectors_data.get("sectors", {})
    
    for key, entries in sectors.items():
        if not entries:
            continue
        
        # Préférence pour region = preferred_region
        candidate = None
        for e in entries:
            if e.get("region") == preferred_region:
                candidate = e
                break
        
        if candidate is None:
            candidate = entries[0]
        
        lookup[key] = candidate
    
    return lookup


def _build_country_lookup(indices_data: Dict) -> Dict:
    """Construit un lookup country -> données d'indice."""
    lookup = {}
    indices = indices_data.get("indices", {})
    
    for region, entries in indices.items():
        for e in entries:
            country = e.get("country")
            if country and country not in lookup:
                lookup[country] = e
    
    return lookup


# ============= RATING TO SCORE MAPPING =============

RATING_TO_SCORE = {
    # Government / Supranational
    "U.S. Government": 100, "GOVERNMENT": 100, "SOVEREIGN": 100,
    "Government": 100, "Sovereign": 100,

    # AAA tier
    "AAA": 95, "AAA ": 95, "AAA\n": 95, "AAA\r": 95,
    "AAA+": 95, "AAA-": 95, "AAA/Aaa": 95,
    "Aaa": 95,

    # AA tier
    "AA+": 90, "AA PLUS": 90, "AA POSITIVE": 90, "AA POS": 90,
    "AA": 85,
    "AA-": 80,
    "Aa1": 90, "Aa2": 85, "Aa3": 80,

    # A tier
    "A+": 77,
    "A": 75,
    "A-": 72,
    "A1": 77, "A2": 75, "A3": 72,

    # BBB tier (Investment Grade floor)
    "BBB+": 65,
    "BBB": 60,
    "BBB-": 55,
    "Baa1": 65, "Baa2": 60, "Baa3": 55,

    # BB tier (High Yield starts)
    "BB+": 50,
    "BB": 45,
    "BB-": 40,
    "Ba1": 50, "Ba2": 45, "Ba3": 40,

    # B tier
    "B+": 35,
    "B": 30,
    "B-": 25,
    "B1": 35, "B2": 30, "B3": 25,

    # CCC and below
    "CCC": 15, "CCC+": 17, "CCC-": 13,
    "Caa": 15, "Caa1": 15, "Caa2": 12, "Caa3": 10,
    "CC": 10, "Ca": 10,
    "C": 5, "D": 0,

    # Not rated
    "NOT RATED": 40, "NR": 40, "N/R": 40, "N/A": 40,
    "Not Rated": 40,
}


def _rating_to_score(rating: str) -> float:
    """Convertit un rating texte en score numérique (0-100)."""
    if pd.isna(rating):
        return np.nan
    s = str(rating).strip()
    return RATING_TO_SCORE.get(s) or RATING_TO_SCORE.get(s.upper(), np.nan)


# ============= BOND RISK FACTORS (v2.2) =============

def add_bond_risk_factors(df: pd.DataFrame) -> pd.DataFrame:
    """
    Enrichit un DataFrame de bonds avec des facteurs de risque/qualité obligataire.
    
    Ajoute: f_bond_credit_score, f_bond_duration_score, f_bond_volatility_score,
            f_bond_quality, f_bond_quality_0_100, bond_risk_bucket
    """
    out = df.copy()

    # Score de crédit (0–1)
    credit_num = pd.to_numeric(out.get("bond_credit_score"), errors="coerce")

    if "bond_credit_rating" in out.columns:
        missing = credit_num.isna()
        if missing.any():
            from_rating = out.loc[missing, "bond_credit_rating"].map(_rating_to_score)
            credit_num = credit_num.copy()
            credit_num.loc[missing] = from_rating

    out["f_bond_credit_score"] = (credit_num / 100.0).clip(lower=0, upper=1)

    # Score de duration (0–1, plus court = mieux)
    D_MAX = 10.0
    dur = pd.to_numeric(out.get("bond_avg_duration"), errors="coerce")
    dur_clamped = dur.clip(lower=0, upper=D_MAX)
    dur_norm = dur_clamped / D_MAX
    out["f_bond_duration_score"] = 1.0 - dur_norm

    # Score de volatilité (0–1, plus bas = mieux)
    V_MAX = 12.0
    vol = pd.to_numeric(out.get("vol_pct"), errors="coerce")
    vol_clamped = vol.clip(lower=0, upper=V_MAX)
    vol_norm = vol_clamped / V_MAX
    out["f_bond_volatility_score"] = 1.0 - vol_norm

    # Combinaison en score global
    w_credit = 0.50
    w_duration = 0.25
    w_vol = 0.25

    f_credit = out["f_bond_credit_score"].fillna(0.5)
    f_dur = out["f_bond_duration_score"].fillna(0.5)
    f_vol = out["f_bond_volatility_score"].fillna(0.5)

    out["f_bond_quality"] = (
        w_credit * f_credit +
        w_duration * f_dur +
        w_vol * f_vol
    ).clip(lower=0, upper=1)

    out["f_bond_quality_0_100"] = (out["f_bond_quality"] * 100).round(1)

    # Bucket de risque
    bins = [-np.inf, 0.3, 0.6, 0.8, np.inf]
    labels = ["very_risky", "risky", "core", "defensive"]
    out["bond_risk_bucket"] = pd.cut(out["f_bond_quality"], bins=bins, labels=labels)

    return out


def get_bond_quality_stats(df: pd.DataFrame) -> Dict[str, any]:
    """
    Retourne des statistiques sur la qualité obligataire d'un DataFrame.
    Utile pour diagnostics et monitoring.
    """
    if "f_bond_quality" not in df.columns:
        return {"error": "f_bond_quality not found - run add_bond_risk_factors first"}
    
    quality = df["f_bond_quality"]
    bucket_counts = df["bond_risk_bucket"].value_counts().to_dict() if "bond_risk_bucket" in df.columns else {}
    
    return {
        "count": len(df),
        "quality_mean": round(quality.mean(), 3) if not quality.isna().all() else None,
        "quality_median": round(quality.median(), 3) if not quality.isna().all() else None,
        "quality_std": round(quality.std(), 3) if not quality.isna().all() else None,
        "quality_min": round(quality.min(), 3) if not quality.isna().all() else None,
        "quality_max": round(quality.max(), 3) if not quality.isna().all() else None,
        "buckets": bucket_counts,
        "coverage": {
            "credit_score": round((~df["f_bond_credit_score"].isna()).mean() * 100, 1),
            "duration_score": round((~df["f_bond_duration_score"].isna()).mean() * 100, 1),
            "volatility_score": round((~df["f_bond_volatility_score"].isna()).mean() * 100, 1),
        }
    }


# ============= FACTOR WEIGHTS v2.3 =============

@dataclass
class FactorWeights:
    """
    Poids des facteurs pour un profil donné.
    
    v2.3: Ajout tactical_context pour intégrer le contexte marché.
    v2.2: Ajout bond_quality pour les fonds obligataires.
    """
    momentum: float = 0.30
    quality_fundamental: float = 0.25
    low_vol: float = 0.25
    cost_efficiency: float = 0.05
    bond_quality: float = 0.00
    tactical_context: float = 0.05       # NOUVEAU v2.3
    liquidity: float = 0.05
    mean_reversion: float = 0.05


# Configurations par profil
PROFILE_WEIGHTS = {
    "Agressif": FactorWeights(
        momentum=0.40,              # Driver principal fort
        quality_fundamental=0.25,   # Buffett toujours important
        low_vol=0.08,               # Accepte plus de vol
        cost_efficiency=0.05,       # Coûts moins prioritaires
        bond_quality=0.00,          # Pas pertinent pour profil agressif
        tactical_context=0.10,      # v2.3: Contexte marché important
        liquidity=0.07,
        mean_reversion=0.05
    ),
    "Modéré": FactorWeights(
        momentum=0.28,              # Équilibré
        quality_fundamental=0.25,   # Qualité renforcée
        low_vol=0.15,               # Contrôle risque
        cost_efficiency=0.07,       # Coûts importants
        bond_quality=0.08,          # Qualité bonds compte
        tactical_context=0.07,      # v2.3: Contexte marché modéré
        liquidity=0.05,
        mean_reversion=0.05
    ),
    "Stable": FactorWeights(
        momentum=0.12,              # Momentum réduit
        quality_fundamental=0.20,   # Qualité importante
        low_vol=0.25,               # Risque minimal prioritaire
        cost_efficiency=0.10,       # Coûts très importants (long terme)
        bond_quality=0.15,          # Qualité bonds très importante
        tactical_context=0.05,      # v2.3: Contexte moins crucial
        liquidity=0.08,
        mean_reversion=0.05
    ),
}


# ============= HELPERS =============

def fnum(x) -> float:
    """Conversion robuste vers float."""
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    try:
        import re
        s = re.sub(r"[^0-9.\-]", "", str(x))
        return float(s) if s not in ("", "-", ".", "-.") else 0.0
    except:
        return 0.0


# ============= BUFFETT QUALITY INTEGRATION =============

SECTOR_QUALITY_THRESHOLDS = {
    "tech": {"roe_good": 15, "roic_good": 12, "de_max": 80, "fcf_good": 3},
    "finance": {"roe_good": 10, "roic_good": None, "de_max": None, "fcf_good": None},
    "real_estate": {"roe_good": 6, "roic_good": 5, "de_max": 200, "fcf_good": 4},
    "healthcare": {"roe_good": 12, "roic_good": 10, "de_max": 150, "fcf_good": 3},
    "consumer_staples": {"roe_good": 15, "roic_good": 12, "de_max": 100, "fcf_good": 4},
    "energy": {"roe_good": 10, "roic_good": 8, "de_max": 80, "fcf_good": 5},
    "utilities": {"roe_good": 8, "roic_good": 6, "de_max": 200, "fcf_good": 4},
    "_default": {"roe_good": 12, "roic_good": 10, "de_max": 120, "fcf_good": 3},
}

SECTOR_MAPPING_QUALITY = {
    "technology": "tech", "tech": "tech", "software": "tech", "semiconductors": "tech",
    "finance": "finance", "financials": "finance", "banking": "finance", "insurance": "finance",
    "real estate": "real_estate", "reit": "real_estate", "immobilier": "real_estate",
    "healthcare": "healthcare", "health care": "healthcare", "pharmaceuticals": "healthcare",
    "consumer staples": "consumer_staples", "consommation de base": "consumer_staples",
    "energy": "energy", "oil & gas": "energy", "énergie": "energy",
    "utilities": "utilities", "services publics": "utilities",
}


def get_sector_key(sector: Optional[str]) -> str:
    """Normalise le secteur vers une clé de seuils."""
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
    
    scores = []
    weights = []
    
    # ROE
    roe = fnum(asset.get("roe"))
    roe_good = thresholds.get("roe_good", 12)
    if roe > 0:
        roe_score = min(100, (roe / roe_good) * 70)
        scores.append(roe_score)
        weights.append(0.20)
    
    # ROIC
    roic = fnum(asset.get("roic"))
    roic_good = thresholds.get("roic_good")
    if roic_good and roic > 0:
        roic_score = min(100, (roic / roic_good) * 70)
        scores.append(roic_score)
        weights.append(0.30)
    
    # FCF Yield
    fcf = fnum(asset.get("fcf_yield"))
    fcf_good = thresholds.get("fcf_good", 3)
    if fcf != 0:
        if fcf < 0:
            fcf_score = max(0, 30 + fcf * 5)
        else:
            fcf_score = min(100, 50 + (fcf / fcf_good) * 25)
        scores.append(fcf_score)
        weights.append(0.20)
    
    # D/E Ratio
    de = fnum(asset.get("de_ratio"))
    de_max = thresholds.get("de_max")
    if de_max and de >= 0:
        if de <= de_max:
            de_score = 80 - (de / de_max) * 30
        else:
            de_score = max(0, 50 - (de - de_max) / de_max * 50)
        scores.append(de_score)
        weights.append(0.15)
    
    # EPS Growth 5Y
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
    
    weighted_score = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
    return round(weighted_score, 1)


# ============= FACTOR SCORER v2.3.1 =============

class FactorScorer:
    """
    Calcule des scores multi-facteur adaptés au profil.
    
    v2.3.1 — P1-10: rank_assets() utilise stable_sort_assets()
    v2.3 — Ajout tactical_context:
    - momentum: Performance récente (1m/3m/YTD) + Sharpe bonus (crypto)
    - quality_fundamental: Score Buffett intégré
    - low_vol: Inverse de la volatilité
    - cost_efficiency: TER + yield_ttm
    - bond_quality: Crédit + Duration + Vol pour bonds
    - tactical_context: NOUVEAU - Sector trend + Region trend + Macro alignment
    - liquidity: Log(market_cap ou AUM)
    - mean_reversion: Pénalise les sur-extensions
    """
    
    def __init__(self, profile: str = "Modéré", market_context: Optional[Dict] = None):
        """
        Args:
            profile: 'Agressif' | 'Modéré' | 'Stable'
            market_context: Optionnel - résultat de load_market_context()
        """
        if profile not in PROFILE_WEIGHTS:
            raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_WEIGHTS.keys())}")
        self.profile = profile
        self.weights = PROFILE_WEIGHTS[profile]
        
        # v2.3: Contexte marché pour tactical_context
        self.market_context = market_context or {}
        self._sector_lookup = None
        self._country_lookup = None
        self._macro_tilts = None
        
        if self.market_context:
            self._build_lookups()
    
    def _build_lookups(self):
        """Construit les lookups pour le scoring tactique."""
        if "sectors" in self.market_context:
            self._sector_lookup = _build_sector_lookup(self.market_context["sectors"])
        if "indices" in self.market_context:
            self._country_lookup = _build_country_lookup(self.market_context["indices"])
        self._macro_tilts = self.market_context.get("macro_tilts", DEFAULT_MACRO_TILTS)
    
    @staticmethod
    def _zscore(values: List[float], winsor_pct: float = 0.02) -> np.ndarray:
        """Z-score winsorisé."""
        arr = np.array(values, dtype=float)
        arr = np.nan_to_num(arr, nan=0.0)
        
        if len(arr) == 0 or arr.std() < 1e-8:
            return np.zeros_like(arr)
        
        lo, hi = np.percentile(arr, [winsor_pct * 100, 100 - winsor_pct * 100])
        arr = np.clip(arr, lo, hi)
        
        return (arr - arr.mean()) / arr.std()
    
    def compute_factor_momentum(self, assets: List[dict]) -> np.ndarray:
        """Facteur momentum: combinaison perf 1m/3m/YTD."""
        n = len(assets)
        
        p1m = [fnum(a.get("perf_1m")) for a in assets]
        p3m = [fnum(a.get("perf_3m")) for a in assets]
        ytd = [fnum(a.get("ytd")) for a in assets]
        
        has_3m = any(p3m)
        has_1m = any(p1m)
        
        if has_3m and has_1m:
            raw = [0.5 * p3m[i] + 0.3 * p1m[i] + 0.2 * ytd[i] for i in range(n)]
        elif has_3m:
            raw = [0.7 * p3m[i] + 0.3 * ytd[i] for i in range(n)]
        elif has_1m:
            raw = [0.6 * p1m[i] + 0.4 * ytd[i] for i in range(n)]
        else:
            p7d = [fnum(a.get("perf_7d")) for a in assets]
            p24h = [fnum(a.get("perf_24h")) for a in assets]
            raw = [0.7 * p7d[i] + 0.3 * p24h[i] for i in range(n)]
        
        # Bonus Sharpe pour crypto
        for i, a in enumerate(assets):
            category = a.get("category", "").lower()
            if category == "crypto":
                sharpe = fnum(a.get("sharpe_ratio", 0))
                sharpe_bonus = max(-20, min(20, sharpe * 10))
                raw[i] += sharpe_bonus
        
        return self._zscore(raw)
    
    def compute_factor_quality_fundamental(self, assets: List[dict]) -> np.ndarray:
        """Facteur qualité fondamentale: Score Buffett intégré."""
        scores = []
        for asset in assets:
            category = asset.get("category", "").lower()
            
            if category in ["equity", "equities", "action", "actions", "stock"]:
                buffett_score = compute_buffett_quality_score(asset)
                scores.append(buffett_score)
            else:
                scores.append(50.0)
        
        return self._zscore(scores)
    
    def compute_factor_low_vol(self, assets: List[dict]) -> np.ndarray:
        """Facteur low volatility: inverse de la vol."""
        vol = [fnum(a.get("vol_3y") or a.get("vol30") or a.get("vol_annual") or a.get("vol") or a.get("vol_pct") or 20) for a in assets]
        return -self._zscore(vol)
    
    def compute_factor_cost_efficiency(self, assets: List[dict]) -> np.ndarray:
        """Facteur coût/rendement pour ETF et Bonds."""
        scores = []
        
        for a in assets:
            category = a.get("category", "").lower()
            fund_type = str(a.get("fund_type", "")).lower()
            
            if category in ["etf", "bond", "bonds"]:
                ter_raw = fnum(a.get("total_expense_ratio", 0))
                ter_pct = ter_raw * 100 if ter_raw < 1 else ter_raw
                
                if ter_pct <= 0:
                    ter_score = 75.0
                else:
                    ter_score = max(0, 100 - ter_pct * 100)
                
                yield_ttm = fnum(a.get("yield_ttm", 0))
                
                if "bond" in fund_type or "bond" in category:
                    yield_score = min(100, yield_ttm * 12.5)
                    final_score = 0.5 * ter_score + 0.5 * yield_score
                else:
                    yield_bonus = min(20, yield_ttm * 5)
                    final_score = 0.8 * ter_score + 0.2 * yield_bonus
                
                scores.append(final_score)
            else:
                scores.append(50.0)
        
        return self._zscore(scores)
    
    def compute_factor_bond_quality(self, assets: List[dict]) -> np.ndarray:
        """Facteur qualité obligataire spécifique."""
        scores = []
        
        for a in assets:
            category = a.get("category", "").lower()
            fund_type = str(a.get("fund_type", "")).lower()
            
            is_bond = "bond" in category or "bond" in fund_type
            
            if is_bond:
                # Score crédit
                credit_raw = fnum(a.get("bond_credit_score", 0))
                if credit_raw <= 0:
                    rating = a.get("bond_credit_rating", "")
                    credit_raw = _rating_to_score(rating) if rating else 50.0
                    if pd.isna(credit_raw):
                        credit_raw = 50.0
                f_credit = min(1.0, max(0.0, credit_raw / 100.0))
                
                # Score duration
                D_MAX = 10.0
                dur = fnum(a.get("bond_avg_duration", 5))
                f_dur = 1.0 - min(1.0, max(0.0, dur / D_MAX))
                
                # Score volatilité
                V_MAX = 12.0
                vol = fnum(a.get("vol_pct") or a.get("vol_3y") or 6)
                f_vol = 1.0 - min(1.0, max(0.0, vol / V_MAX))
                
                bond_quality = 0.50 * f_credit + 0.25 * f_dur + 0.25 * f_vol
                scores.append(bond_quality * 100)
            else:
                scores.append(50.0)
        
        return self._zscore(scores)
    
    def compute_factor_tactical_context(self, assets: List[dict]) -> np.ndarray:
        """
        v2.3 NOUVEAU: Facteur contexte tactique.
        
        Combine:
        - f_sector_trend: momentum du secteur (YTD + daily)
        - f_region_trend: momentum de la région
        - f_macro_alignment: alignement aux convictions macro
        
        Retourne un z-score. Score élevé = bien positionné dans le contexte actuel.
        """
        if not self._sector_lookup and not self._country_lookup:
            # Pas de données marché → score neutre pour tous
            return np.zeros(len(assets))
        
        scores = []
        
        for a in assets:
            sector_top = a.get("sector_top", "")
            country_top = a.get("country_top", "")
            
            components = []
            weights = []
            
            # === Sector Trend ===
            if self._sector_lookup and sector_top:
                sector_key = SECTOR_KEY_MAPPING.get(sector_top.strip())
                if sector_key and sector_key in self._sector_lookup:
                    ref = self._sector_lookup[sector_key]
                    ytd = ref.get("ytd_num", 0) or 0
                    daily = ref.get("change_num", 0) or 0
                    
                    # Normaliser: YTD/25 + daily/2, clamp [-1, 1], puis [0, 1]
                    raw = 0.7 * (ytd / 25.0) + 0.3 * (daily / 2.0)
                    raw = max(-1.0, min(1.0, raw))
                    f_sector = 0.5 * (raw + 1.0)
                    
                    components.append(f_sector)
                    weights.append(0.4)
            
            # === Region Trend ===
            if self._country_lookup and country_top:
                norm_country = COUNTRY_NORMALIZATION.get(country_top.strip(), country_top.strip())
                if norm_country in self._country_lookup:
                    ref = self._country_lookup[norm_country]
                    # markets.json has both ytd_num and _ytd_value, prefer ytd_num
                    ytd = ref.get("ytd_num", 0) or ref.get("_ytd_value", 0) or 0
                    daily = ref.get("change_num", 0) or ref.get("_change_value", 0) or 0
                    
                    raw = 0.7 * (ytd / 25.0) + 0.3 * (daily / 2.0)
                    raw = max(-1.0, min(1.0, raw))
                    f_region = 0.5 * (raw + 1.0)
                    
                    components.append(f_region)
                    weights.append(0.3)
            
            # === Macro Alignment ===
            if self._macro_tilts:
                f_macro = 0.5  # base neutre
                
                if sector_top:
                    if sector_top in self._macro_tilts.get("favored_sectors", []):
                        f_macro += 0.2
                    elif sector_top in self._macro_tilts.get("avoided_sectors", []):
                        f_macro -= 0.2
                
                if country_top:
                    if country_top in self._macro_tilts.get("favored_regions", []):
                        f_macro += 0.15
                    elif country_top in self._macro_tilts.get("avoided_regions", []):
                        f_macro -= 0.15
                
                f_macro = max(0.0, min(1.0, f_macro))
                components.append(f_macro)
                weights.append(0.3)
            
            # Combiner
            if components and sum(weights) > 0:
                tactical_score = sum(c * w for c, w in zip(components, weights)) / sum(weights)
            else:
                tactical_score = 0.5  # neutre
            
            # Convertir en score centré sur 50 pour z-score
            scores.append(tactical_score * 100)
        
        return self._zscore(scores)
    
    def compute_factor_liquidity(self, assets: List[dict]) -> np.ndarray:
        """Facteur liquidité: log(market_cap ou AUM)."""
        liq = [
            math.log(max(fnum(a.get("liquidity") or a.get("market_cap") or a.get("aum_usd") or 1), 1))
            for a in assets
        ]
        return self._zscore(liq)
    
    def compute_factor_mean_reversion(self, assets: List[dict]) -> np.ndarray:
        """Facteur mean reversion: pénalise les sur-extensions."""
        scores = []
        
        for a in assets:
            ytd = fnum(a.get("ytd"))
            p1m = fnum(a.get("perf_1m"))
            
            if ytd > 80 and p1m <= 0:
                scores.append(-1.5)
            elif ytd > 50 and p1m <= 2:
                scores.append(-0.5)
            elif ytd > 100:
                scores.append(-1.0)
            elif ytd > 150:
                scores.append(-2.0)
            else:
                scores.append(0.0)
        
        return np.array(scores)
    
    def compute_scores(self, assets: List[dict]) -> List[dict]:
        """
        Calcule le score composite pour chaque actif.
        
        v2.3: Ajout facteur tactical_context.
        """
        if not assets:
            return assets
        
        n = len(assets)
        
        # Calculer chaque facteur
        factors = {
            "momentum": self.compute_factor_momentum(assets),
            "quality_fundamental": self.compute_factor_quality_fundamental(assets),
            "low_vol": self.compute_factor_low_vol(assets),
            "cost_efficiency": self.compute_factor_cost_efficiency(assets),
            "bond_quality": self.compute_factor_bond_quality(assets),
            "tactical_context": self.compute_factor_tactical_context(assets),  # v2.3
            "liquidity": self.compute_factor_liquidity(assets),
            "mean_reversion": self.compute_factor_mean_reversion(assets),
        }
        
        # Score composite pondéré
        composite = np.zeros(n)
        for factor_name, factor_values in factors.items():
            weight = getattr(self.weights, factor_name, 0)
            composite += weight * factor_values
        
        # Enrichir les actifs
        for i, asset in enumerate(assets):
            asset["factor_scores"] = {
                name: round(float(values[i]), 3)
                for name, values in factors.items()
            }
            asset["composite_score"] = round(float(composite[i]), 3)
            asset["score"] = asset["composite_score"]
            
            # Score Buffett pour diagnostics
            if asset.get("category", "").lower() in ["equity", "equities", "action", "actions", "stock"]:
                asset["buffett_score"] = compute_buffett_quality_score(asset)
            
            # bond_risk_bucket pour bonds
            category = asset.get("category", "").lower()
            fund_type = str(asset.get("fund_type", "")).lower()
            if "bond" in category or "bond" in fund_type:
                bq = factors["bond_quality"][i]
                if bq > 0.8:
                    asset["bond_risk_bucket"] = "defensive"
                elif bq > 0:
                    asset["bond_risk_bucket"] = "core"
                elif bq > -0.8:
                    asset["bond_risk_bucket"] = "risky"
                else:
                    asset["bond_risk_bucket"] = "very_risky"
            
            # Flag sur-extension
            ytd = fnum(asset.get("ytd"))
            p1m = fnum(asset.get("perf_1m"))
            asset["flags"] = {
                "overextended": (ytd > 80 and p1m <= 0) or (ytd > 150)
            }
        
        logger.info(
            f"Scores calculés: {n} actifs (profil {self.profile}) | "
            f"Score moyen: {composite.mean():.3f} | Range: [{composite.min():.2f}, {composite.max():.2f}]"
        )
        
        return assets
    
    def rank_assets(self, assets: List[dict], top_n: Optional[int] = None) -> List[dict]:
        """
        Trie les actifs par score décroissant et retourne le top N.
        
        v2.3.1 P1-10: Utilise stable_sort_assets() avec tie-breaker par symbol
        pour garantir un ordre déterministe (requis pour P1-5 DETERMINISTIC mode).
        """
        scored = self.compute_scores(assets)
        
        # P1-10: Tri stable avec tie-breaker par symbol
        # Avant: sorted(scored, key=lambda x: x.get("composite_score", 0), reverse=True)
        # Problème: Quand deux assets ont le même score, l'ordre était non-déterministe
        ranked = stable_sort_assets(
            scored,
            score_key="composite_score",
            id_key="symbol",
            reverse_score=True
        )
        
        if top_n:
            ranked = ranked[:top_n]
        
        return ranked


# ============= UTILITAIRES =============

def rescore_universe_by_profile(
    universe: Union[List[dict], Dict[str, List[dict]]],
    profile: str,
    market_context: Optional[Dict] = None
) -> List[dict]:
    """
    Recalcule les scores de tout l'univers pour un profil donné.
    
    v2.3: Accepte market_context optionnel pour tactical_context.
    """
    scorer = FactorScorer(profile, market_context=market_context)
    
    if isinstance(universe, list):
        return scorer.compute_scores(list(universe))
    
    all_assets = []
    for category in ["equities", "etfs", "bonds", "crypto"]:
        assets = universe.get(category, [])
        all_assets.extend(list(assets))
    
    return scorer.compute_scores(all_assets)


def get_factor_weights_summary() -> Dict[str, Dict[str, float]]:
    """Retourne un résumé des poids par profil."""
    return {
        profile: {
            "momentum": w.momentum,
            "quality_fundamental": w.quality_fundamental,
            "low_vol": w.low_vol,
            "cost_efficiency": w.cost_efficiency,
            "bond_quality": w.bond_quality,
            "tactical_context": w.tactical_context,  # v2.3
            "liquidity": w.liquidity,
            "mean_reversion": w.mean_reversion,
        }
        for profile, w in PROFILE_WEIGHTS.items()
    }


def compare_factor_profiles() -> str:
    """Génère une comparaison textuelle des profils."""
    lines = [
        "Comparaison des poids factoriels par profil (v2.3.1):",
        "",
        "PARI CENTRAL: Quality + Momentum + Contexte tactique surperforment à horizon 1-3 ans.",
        ""
    ]
    
    factors = ["momentum", "quality_fundamental", "low_vol", "cost_efficiency", "bond_quality", "tactical_context", "liquidity", "mean_reversion"]
    header = f"{'Facteur':<22} | {'Agressif':>10} | {'Modéré':>10} | {'Stable':>10}"
    lines.append(header)
    lines.append("-" * len(header))
    
    for factor in factors:
        vals = [getattr(PROFILE_WEIGHTS[p], factor) for p in ["Agressif", "Modéré", "Stable"]]
        line = f"{factor:<22} | {vals[0]:>10.0%} | {vals[1]:>10.0%} | {vals[2]:>10.0%}"
        lines.append(line)
    
    return "\n".join(lines)


def get_quality_coverage(assets: List[dict]) -> Dict[str, float]:
    """
    Calcule le taux de couverture des métriques de qualité.
    
    v2.3: Ajout couverture tactical_context.
    """
    if not assets:
        return {}
    
    total = len(assets)
    equities = [a for a in assets if a.get("category", "").lower() in ["equity", "equities", "action", "actions", "stock"]]
    etf_bonds = [a for a in assets if a.get("category", "").lower() in ["etf", "bond", "bonds"]]
    bonds_only = [a for a in assets if "bond" in a.get("category", "").lower() or "bond" in str(a.get("fund_type", "")).lower()]
    n_eq = len(equities) or 1
    n_etf = len(etf_bonds) or 1
    n_bonds = len(bonds_only) or 1
    
    return {
        # Métriques actions
        "roe": round(sum(1 for a in equities if fnum(a.get("roe")) > 0) / n_eq * 100, 1),
        "roic": round(sum(1 for a in equities if fnum(a.get("roic")) > 0) / n_eq * 100, 1),
        "fcf_yield": round(sum(1 for a in equities if a.get("fcf_yield") is not None) / n_eq * 100, 1),
        "de_ratio": round(sum(1 for a in equities if fnum(a.get("de_ratio")) >= 0) / n_eq * 100, 1),
        "eps_growth_5y": round(sum(1 for a in equities if a.get("eps_growth_5y") is not None) / n_eq * 100, 1),
        # Métriques ETF/Bonds
        "total_expense_ratio": round(sum(1 for a in etf_bonds if fnum(a.get("total_expense_ratio")) > 0) / n_etf * 100, 1),
        "yield_ttm": round(sum(1 for a in etf_bonds if fnum(a.get("yield_ttm")) > 0) / n_etf * 100, 1),
        # Métriques Bonds spécifiques
        "bond_credit_score": round(sum(1 for a in bonds_only if fnum(a.get("bond_credit_score")) > 0) / n_bonds * 100, 1),
        "bond_avg_duration": round(sum(1 for a in bonds_only if fnum(a.get("bond_avg_duration")) > 0) / n_bonds * 100, 1),
        "bond_avg_maturity": round(sum(1 for a in bonds_only if fnum(a.get("bond_avg_maturity")) > 0) / n_bonds * 100, 1),
        # v2.3: Couverture tactical context
        "sector_top": round(sum(1 for a in assets if a.get("sector_top")) / total * 100, 1),
        "country_top": round(sum(1 for a in assets if a.get("country_top")) / total * 100, 1),
        # Compteurs
        "equities_count": len(equities),
        "etf_bonds_count": len(etf_bonds),
        "bonds_only_count": len(bonds_only),
        "total_count": total,
    }


# ============= MAIN (pour test) =============

if __name__ == "__main__":
    print(compare_factor_profiles())
    print("\n" + "=" * 60)
    print("Test avec données fictives...")
    
    # Charger contexte marché (si fichiers présents)
    market_context = load_market_context("data")
    
    # Actifs de test
    test_assets = [
        {"symbol": "IYW", "category": "etf", "sector_top": "Technology", "country_top": "United States", "ytd": 26.87, "perf_1m": 2.5, "perf_3m": 8.2, "vol_pct": 18.5, "total_expense_ratio": 0.40, "aum_usd": 15e9},
        {"symbol": "XLV", "category": "etf", "sector_top": "Healthcare", "country_top": "United States", "ytd": 2.05, "perf_1m": -1.1, "perf_3m": 1.5, "vol_pct": 12.3, "total_expense_ratio": 0.10, "aum_usd": 12e9},
        {"symbol": "AGG", "category": "bond", "fund_type": "bond", "sector_top": "Financial Services", "country_top": "United States", "ytd": 1.5, "perf_1m": 0.3, "vol_pct": 4.2, "total_expense_ratio": 0.03, "bond_credit_score": 87, "bond_avg_duration": 3.75, "yield_ttm": 4.5, "aum_usd": 90e9},
        {"symbol": "MCHI", "category": "etf", "sector_top": "Technology", "country_top": "China", "ytd": -5.79, "perf_1m": -1.4, "perf_3m": -3.2, "vol_pct": 22.8, "total_expense_ratio": 0.59, "aum_usd": 8e9},
    ]
    
    # Scorer
    scorer = FactorScorer("Modéré", market_context=market_context)
    scored = scorer.compute_scores(test_assets)
    
    print("\nRésultats:")
    for a in sorted(scored, key=lambda x: x["composite_score"], reverse=True):
        print(f"  {a['symbol']:6} | score: {a['composite_score']:+.3f} | tactical: {a['factor_scores']['tactical_context']:+.3f}")
    
    # Test P1-10: Vérifier que rank_assets est stable
    print("\n" + "=" * 60)
    print("Test P1-10: Stabilité du tri...")
    
    # Créer des actifs avec scores identiques
    tie_test = [
        {"symbol": "ZZZ", "category": "etf", "composite_score": 0.5},
        {"symbol": "AAA", "category": "etf", "composite_score": 0.5},
        {"symbol": "MMM", "category": "etf", "composite_score": 0.5},
    ]
    
    ranked1 = stable_sort_assets(tie_test, score_key="composite_score", id_key="symbol")
    ranked2 = stable_sort_assets(list(reversed(tie_test)), score_key="composite_score", id_key="symbol")
    
    order1 = [a["symbol"] for a in ranked1]
    order2 = [a["symbol"] for a in ranked2]
    
    if order1 == order2 == ["AAA", "MMM", "ZZZ"]:
        print("  ✅ P1-10 OK: Tri stable avec tie-breaker alphabétique")
    else:
        print(f"  ❌ P1-10 FAIL: order1={order1}, order2={order2}")
