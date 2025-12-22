# portfolio_engine/factors.py
"""
FactorScorer v2.4.2 — SEUL MOTEUR D'ALPHA
=========================================

v2.4.2 Changes (ChatGPT Audit Round 2):
- FIX CRITIQUE: bond_risk_bucket basé sur RAW (0-100), pas sur z-score
- FIX: TER strict - rejet si heuristique incertaine (+ flag pour debug)
- FIX: Bonds strict - rejet/pénalité sévère si duration/vol manquantes
- NOUVEAU: bond_quality_raw stocké séparément de bond_quality (z-score)
- NOUVEAU: _ter_confidence flag pour traçabilité

v2.4.1 Changes (ChatGPT Audit Fixes):
- TER validation stricte avec heuristique décimal vs pourcentage
- Crypto vol - ajout vol_30d_annual_pct dans cascade
- Bonds defaults → warnings explicites
- Tactical context z-score PAR CLASSE

v2.4.0 Changes (Z-Score par Classe + Data Contract Strict):
- Z-score calculé PAR CLASSE (equity/etf/bond/crypto)
- Suppression defaults silencieux
- Pénalités explicites pour données manquantes
- Poids renormalisés par catégorie

Facteurs:
- momentum: 45% (Agressif) → 20% (Stable) — Driver principal
- quality_fundamental: 25-30% — Score Buffett intégré (ROIC, FCF, ROE)
- low_vol: 15-35% — Contrôle du risque
- cost_efficiency: 5-10% — TER + Yield (ETF/Bonds uniquement)
- bond_quality: 0-15% — Qualité obligataire (crédit + duration + vol)
- tactical_context: 5-10% — Contexte marché (sector/region/macro)
- liquidity: 5-10% — Filtre technique
- mean_reversion: 5% — Évite sur-extension

Le pari central:
"Des entreprises de qualité fondamentale (ROIC > 10%, FCF positif, dette maîtrisée)
avec un momentum positif sur 3-12 mois, alignées avec le contexte macro,
surperforment à horizon 1-3 ans."
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Union, Any, Tuple
from dataclasses import dataclass
from collections import defaultdict
import logging
import math
import json
from pathlib import Path

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


# ============= v2.4 CATEGORY NORMALIZATION =============

CATEGORY_NORMALIZE = {
    # Actions
    "equity": "equity",
    "equities": "equity",
    "action": "equity",
    "actions": "equity",
    "stock": "equity",
    "stocks": "equity",
    # ETF
    "etf": "etf",
    "etfs": "etf",
    # Bonds
    "bond": "bond",
    "bonds": "bond",
    "obligation": "bond",
    "obligations": "bond",
    # Crypto
    "crypto": "crypto",
    "cryptocurrency": "crypto",
    "cryptocurrencies": "crypto",
}


def normalize_category(category: str) -> str:
    """Normalise la catégorie vers une clé standard."""
    if not category:
        return "other"
    return CATEGORY_NORMALIZE.get(category.lower().strip(), "other")


# Facteurs applicables par catégorie (v2.4)
FACTORS_BY_CATEGORY = {
    "equity": ["momentum", "quality_fundamental", "low_vol", "tactical_context", "liquidity", "mean_reversion"],
    "etf": ["momentum", "low_vol", "cost_efficiency", "tactical_context", "liquidity", "mean_reversion"],
    "bond": ["momentum", "low_vol", "cost_efficiency", "bond_quality", "liquidity"],
    "crypto": ["momentum", "low_vol", "liquidity", "mean_reversion"],
    "other": ["momentum", "low_vol", "liquidity"],
}

# Pénalités pour données manquantes par catégorie (v2.4)
MISSING_VOL_PENALTY = {
    "equity": 40.0,
    "etf": 30.0,
    "bond": 15.0,
    "crypto": 100.0,
    "other": 30.0,
}

MISSING_LIQUIDITY_PENALTY = {
    "equity": 100_000_000,
    "etf": 50_000_000,
    "bond": 100_000_000,
    "crypto": 10_000_000,
    "other": 50_000_000,
}

# v2.4.2: Seuils pour bond_risk_bucket (basés sur RAW 0-100, pas z-score)
BOND_BUCKET_THRESHOLDS = {
    "defensive": 75,  # >= 75 = defensive
    "core": 55,       # >= 55 = core
    "risky": 35,      # >= 35 = risky
    # < 35 = very_risky
}


# ============= v2.3 TACTICAL CONTEXT MAPPINGS =============

SECTOR_KEY_MAPPING = {
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
    "China": "Chine",
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
    """Charge le contexte marché depuis les fichiers JSON."""
    data_path = Path(data_dir)
    context = {
        "sectors": {},
        "indices": {},
        "macro_tilts": DEFAULT_MACRO_TILTS,
        "loaded_at": None,
    }
    
    sectors_path = data_path / "sectors.json"
    if sectors_path.exists():
        try:
            with open(sectors_path, "r", encoding="utf-8") as f:
                context["sectors"] = json.load(f)
            logger.info(f"✅ Chargé: {sectors_path}")
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {sectors_path}: {e}")
    
    markets_path = data_path / "markets.json"
    if markets_path.exists():
        try:
            with open(markets_path, "r", encoding="utf-8") as f:
                context["indices"] = json.load(f)
            logger.info(f"✅ Chargé: {markets_path}")
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {markets_path}: {e}")
    
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
    "U.S. Government": 100, "GOVERNMENT": 100, "SOVEREIGN": 100,
    "Government": 100, "Sovereign": 100,
    "AAA": 95, "AAA ": 95, "AAA\n": 95, "AAA\r": 95,
    "AAA+": 95, "AAA-": 95, "AAA/Aaa": 95, "Aaa": 95,
    "AA+": 90, "AA PLUS": 90, "AA POSITIVE": 90, "AA POS": 90,
    "AA": 85, "AA-": 80,
    "Aa1": 90, "Aa2": 85, "Aa3": 80,
    "A+": 77, "A": 75, "A-": 72,
    "A1": 77, "A2": 75, "A3": 72,
    "BBB+": 65, "BBB": 60, "BBB-": 55,
    "Baa1": 65, "Baa2": 60, "Baa3": 55,
    "BB+": 50, "BB": 45, "BB-": 40,
    "Ba1": 50, "Ba2": 45, "Ba3": 40,
    "B+": 35, "B": 30, "B-": 25,
    "B1": 35, "B2": 30, "B3": 25,
    "CCC": 15, "CCC+": 17, "CCC-": 13,
    "Caa": 15, "Caa1": 15, "Caa2": 12, "Caa3": 10,
    "CC": 10, "Ca": 10, "C": 5, "D": 0,
    "NOT RATED": 40, "NR": 40, "N/R": 40, "N/A": 40, "Not Rated": 40,
}


def _rating_to_score(rating: str) -> float:
    """Convertit un rating texte en score numérique (0-100)."""
    if pd.isna(rating):
        return np.nan
    s = str(rating).strip()
    return RATING_TO_SCORE.get(s) or RATING_TO_SCORE.get(s.upper(), np.nan)


# ============= BOND RISK FACTORS (v2.2) =============

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

    D_MAX = 10.0
    dur = pd.to_numeric(out.get("bond_avg_duration"), errors="coerce")
    dur_clamped = dur.clip(lower=0, upper=D_MAX)
    dur_norm = dur_clamped / D_MAX
    out["f_bond_duration_score"] = 1.0 - dur_norm

    V_MAX = 12.0
    vol = pd.to_numeric(out.get("vol_pct"), errors="coerce")
    vol_clamped = vol.clip(lower=0, upper=V_MAX)
    vol_norm = vol_clamped / V_MAX
    out["f_bond_volatility_score"] = 1.0 - vol_norm

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

    bins = [-np.inf, 0.3, 0.6, 0.8, np.inf]
    labels = ["very_risky", "risky", "core", "defensive"]
    out["bond_risk_bucket"] = pd.cut(out["f_bond_quality"], bins=bins, labels=labels)

    return out


def get_bond_quality_stats(df: pd.DataFrame) -> Dict[str, any]:
    """Retourne des statistiques sur la qualité obligataire."""
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
    }


# ============= FACTOR WEIGHTS v2.4 =============

@dataclass
class FactorWeights:
    """Poids des facteurs pour un profil donné."""
    momentum: float = 0.30
    quality_fundamental: float = 0.25
    low_vol: float = 0.25
    cost_efficiency: float = 0.05
    bond_quality: float = 0.00
    tactical_context: float = 0.05
    liquidity: float = 0.05
    mean_reversion: float = 0.05


PROFILE_WEIGHTS = {
    "Agressif": FactorWeights(
        momentum=0.40,
        quality_fundamental=0.25,
        low_vol=0.08,
        cost_efficiency=0.05,
        bond_quality=0.00,
        tactical_context=0.10,
        liquidity=0.07,
        mean_reversion=0.05
    ),
    "Modéré": FactorWeights(
        momentum=0.28,
        quality_fundamental=0.25,
        low_vol=0.15,
        cost_efficiency=0.07,
        bond_quality=0.08,
        tactical_context=0.07,
        liquidity=0.05,
        mean_reversion=0.05
    ),
    "Stable": FactorWeights(
        momentum=0.12,
        quality_fundamental=0.20,
        low_vol=0.25,
        cost_efficiency=0.10,
        bond_quality=0.15,
        tactical_context=0.05,
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
        if math.isnan(x):
            return 0.0
        return float(x)
    try:
        import re
        s = re.sub(r"[^0-9.\-]", "", str(x))
        return float(s) if s not in ("", "-", ".", "-.") else 0.0
    except:
        return 0.0


def _is_missing(value) -> bool:
    """Vérifie si une valeur est manquante (None, NaN, 0 négatif)."""
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return False


# ============= v2.4.2 TER VALIDATION STRICTE =============

def _normalize_ter(ter_raw: float, symbol: str = "?") -> Tuple[Optional[float], str]:
    """
    v2.4.2: Normalise le TER avec validation STRICTE.
    
    Returns:
        (ter_pct, confidence) où:
        - ter_pct: TER en % (ex: 0.09 pour 0.09%), ou None si invalide
        - confidence: "high" | "medium" | "low" | "rejected"
    
    Règles:
    - Si ter_raw dans [0.01, 3.0] → high confidence (déjà en %)
    - Si ter_raw dans [0.0001, 0.05] → medium confidence (décimal → *100)
    - Sinon → rejected (trop ambigu)
    """
    if _is_missing(ter_raw) or ter_raw <= 0:
        return None, "missing"
    
    ter = fnum(ter_raw)
    
    # Cas 1: Déjà en % (0.01% à 3%)
    if 0.01 <= ter <= 3.0:
        return ter, "high"
    
    # Cas 2: Probablement décimal (0.0001 à 0.05 → 0.01% à 5%)
    if 0.0001 <= ter < 0.05:
        ter_pct = ter * 100
        if 0.01 <= ter_pct <= 3.0:
            return ter_pct, "medium"
        else:
            logger.warning(f"TER ambigu pour {symbol}: raw={ter_raw} → {ter_pct:.4f}% (hors range)")
            return ter_pct, "low"
    
    # Cas 3: Valeur suspecte
    if ter > 3.0:
        logger.warning(f"TER rejeté pour {symbol}: {ter:.2f}% > 3% (trop élevé)")
        return None, "rejected"
    
    if ter < 0.0001:
        logger.warning(f"TER rejeté pour {symbol}: {ter:.6f} < 0.0001 (trop bas)")
        return None, "rejected"
    
    return None, "rejected"


# ============= v2.4.2 BOND QUALITY RAW =============

def _compute_bond_quality_raw(
    credit_score: float,
    duration: Optional[float],
    vol: Optional[float],
    symbol: str = "?"
) -> Tuple[float, Dict[str, Any]]:
    """
    v2.4.2: Calcule la qualité obligataire RAW (0-100).
    
    Returns:
        (quality_raw_0_100, metadata)
    
    Metadata contient:
        - missing_fields: liste des champs manquants
        - penalty_applied: bool
        - components: détail des scores
    """
    metadata = {
        "missing_fields": [],
        "penalty_applied": False,
        "components": {},
    }
    
    # Score crédit (0-1)
    f_credit = min(1.0, max(0.0, credit_score / 100.0))
    metadata["components"]["credit"] = round(f_credit * 100, 1)
    
    # Score duration (0-1, plus court = mieux)
    D_MAX = 10.0
    if _is_missing(duration):
        metadata["missing_fields"].append("duration")
        # v2.4.2: PÉNALITÉ SÉVÈRE au lieu de default neutre
        f_dur = 0.3  # Équivalent ~7Y (pénalisant)
        metadata["penalty_applied"] = True
        logger.warning(f"bond_quality: missing duration for {symbol} → severe penalty (f_dur=0.3)")
    else:
        dur = fnum(duration)
        f_dur = 1.0 - min(1.0, max(0.0, dur / D_MAX))
    metadata["components"]["duration"] = round(f_dur * 100, 1)
    
    # Score volatilité (0-1, plus bas = mieux)
    V_MAX = 12.0
    if _is_missing(vol):
        metadata["missing_fields"].append("vol")
        # v2.4.2: PÉNALITÉ SÉVÈRE
        f_vol = 0.3  # Équivalent ~8.4% vol (pénalisant)
        metadata["penalty_applied"] = True
        logger.warning(f"bond_quality: missing vol for {symbol} → severe penalty (f_vol=0.3)")
    else:
        v = fnum(vol)
        f_vol = 1.0 - min(1.0, max(0.0, v / V_MAX))
    metadata["components"]["vol"] = round(f_vol * 100, 1)
    
    # Combinaison pondérée
    quality_raw = 0.50 * f_credit + 0.25 * f_dur + 0.25 * f_vol
    quality_raw_0_100 = round(quality_raw * 100, 1)
    
    return quality_raw_0_100, metadata


def _get_bond_risk_bucket(quality_raw_0_100: float) -> str:
    """
    v2.4.2: Détermine le bucket de risque basé sur la qualité RAW (pas z-score).
    
    Seuils:
    - >= 75: defensive
    - >= 55: core
    - >= 35: risky
    - < 35: very_risky
    """
    if quality_raw_0_100 >= BOND_BUCKET_THRESHOLDS["defensive"]:
        return "defensive"
    elif quality_raw_0_100 >= BOND_BUCKET_THRESHOLDS["core"]:
        return "core"
    elif quality_raw_0_100 >= BOND_BUCKET_THRESHOLDS["risky"]:
        return "risky"
    else:
        return "very_risky"


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


# ============= FACTOR SCORER v2.4.2 =============

class FactorScorer:
    """
    Calcule des scores multi-facteur adaptés au profil.
    
    v2.4.2 — FIXES CHATGPT AUDIT ROUND 2:
    - bond_risk_bucket basé sur RAW (0-100), pas sur z-score
    - TER strict: rejet si heuristique incertaine
    - Bonds strict: pénalité sévère si duration/vol manquantes
    - bond_quality_raw stocké séparément
    
    v2.4.1 — FIXES CHATGPT AUDIT:
    - TER validation stricte
    - Crypto vol_30d_annual_pct
    - Tactical z-score par classe
    
    v2.4.0 — CORRECTIFS MAJEURS:
    - Z-score PAR CLASSE
    - Suppression defaults silencieux
    - Poids renormalisés par catégorie
    """
    
    def __init__(self, profile: str = "Modéré", market_context: Optional[Dict] = None):
        if profile not in PROFILE_WEIGHTS:
            raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_WEIGHTS.keys())}")
        self.profile = profile
        self.weights = PROFILE_WEIGHTS[profile]
        self.market_context = market_context or {}
        self._sector_lookup = None
        self._country_lookup = None
        self._macro_tilts = None
        
        # v2.4.2: Stockage des qualités RAW pour bonds (pour bucket)
        self._bond_quality_raw: Dict[int, float] = {}
        
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
        """Z-score winsorisé (LEGACY - utilisé pour compatibilité)."""
        arr = np.array(values, dtype=float)
        arr = np.nan_to_num(arr, nan=0.0)
        
        if len(arr) == 0 or arr.std() < 1e-8:
            return np.zeros_like(arr)
        
        lo, hi = np.percentile(arr, [winsor_pct * 100, 100 - winsor_pct * 100])
        arr = np.clip(arr, lo, hi)
        
        return (arr - arr.mean()) / arr.std()
    
    @staticmethod
    def _zscore_by_class(
        values: List[float], 
        categories: List[str],
        min_samples: int = 5,
        winsor_pct: float = 0.02
    ) -> np.ndarray:
        """
        v2.4: Z-score PAR CLASSE d'actifs.
        """
        n = len(values)
        result = np.zeros(n)
        
        by_cat: Dict[str, List[int]] = defaultdict(list)
        for i, cat in enumerate(categories):
            norm_cat = normalize_category(cat)
            by_cat[norm_cat].append(i)
        
        for cat, indices in by_cat.items():
            if len(indices) < min_samples:
                for i in indices:
                    result[i] = 0.0
                logger.debug(f"Z-score {cat}: {len(indices)} samples < {min_samples} → neutral")
                continue
            
            group_values = np.array([values[i] for i in indices], dtype=float)
            group_values = np.nan_to_num(group_values, nan=0.0)
            
            if len(group_values) > 2:
                lo, hi = np.percentile(group_values, [winsor_pct * 100, 100 - winsor_pct * 100])
                group_values = np.clip(group_values, lo, hi)
            
            std = group_values.std()
            if std < 1e-8:
                for i in indices:
                    result[i] = 0.0
            else:
                mean = group_values.mean()
                zscores = (group_values - mean) / std
                for idx, z in zip(indices, zscores):
                    result[idx] = z
        
        return result
    
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
        
        for i, a in enumerate(assets):
            category = a.get("category", "").lower()
            if category == "crypto":
                sharpe = fnum(a.get("sharpe_ratio", 0))
                sharpe_bonus = max(-20, min(20, sharpe * 10))
                raw[i] += sharpe_bonus
        
        categories = [a.get("category", "other") for a in assets]
        return self._zscore_by_class(raw, categories)
    
    def compute_factor_quality_fundamental(self, assets: List[dict]) -> np.ndarray:
        """Facteur qualité fondamentale: Score Buffett."""
        scores = []
        categories = []
        
        for asset in assets:
            cat = normalize_category(asset.get("category", ""))
            categories.append(cat)
            
            if cat == "equity":
                buffett_score = compute_buffett_quality_score(asset)
                scores.append(buffett_score)
            else:
                scores.append(None)
        
        result = np.zeros(len(assets))
        equity_indices = [i for i, s in enumerate(scores) if s is not None]
        
        if len(equity_indices) >= 5:
            equity_scores = [scores[i] for i in equity_indices]
            eq_arr = np.array(equity_scores, dtype=float)
            if eq_arr.std() > 1e-8:
                zscores = (eq_arr - eq_arr.mean()) / eq_arr.std()
                for idx, z in zip(equity_indices, zscores):
                    result[idx] = z
        
        return result
    
    def compute_factor_low_vol(self, assets: List[dict]) -> np.ndarray:
        """Facteur low volatility avec vol_30d_annual_pct pour crypto."""
        raw_vol = []
        categories = []
        
        for a in assets:
            cat = normalize_category(a.get("category", "other"))
            categories.append(cat)
            
            vol = (
                a.get("vol_3y") or 
                a.get("vol30") or 
                a.get("vol_annual") or 
                a.get("vol") or 
                a.get("vol_pct") or
                a.get("vol_30d_annual_pct")
            )
            
            if _is_missing(vol):
                vol = MISSING_VOL_PENALTY.get(cat, 30.0)
                logger.debug(f"low_vol: missing vol for {a.get('id', a.get('symbol', '?'))} → penalty {vol}")
            else:
                vol = fnum(vol)
            
            raw_vol.append(vol)
        
        zscores = self._zscore_by_class(raw_vol, categories)
        return -zscores
    
    def compute_factor_cost_efficiency(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur coût/rendement pour ETF et Bonds.
        
        v2.4.2: TER validation stricte avec confidence tracking.
        """
        scores = []
        categories = []
        
        for a in assets:
            category = normalize_category(a.get("category", ""))
            categories.append(category)
            
            if category not in ["etf", "bond"]:
                scores.append(None)
                continue
            
            fund_type = str(a.get("fund_type", "")).lower()
            symbol = a.get("symbol", a.get("id", "?"))
            
            # v2.4.2: TER avec validation stricte
            ter_raw = a.get("total_expense_ratio")
            ter_pct, confidence = _normalize_ter(ter_raw, symbol)
            
            if ter_pct is None or confidence == "rejected":
                # TER invalide → pénalité sévère
                ter_score = 20.0
                logger.debug(f"cost_efficiency: TER {confidence} for {symbol} → severe penalty 20")
            elif confidence == "low":
                # TER incertain → pénalité modérée
                ter_score = max(0, 100 - ter_pct * 33) * 0.7  # 30% penalty
                logger.debug(f"cost_efficiency: TER low confidence for {symbol} → 30% penalty")
            else:
                # TER valide
                ter_score = max(0, 100 - ter_pct * 33)
            
            yield_ttm = fnum(a.get("yield_ttm", 0))
            
            if "bond" in fund_type or category == "bond":
                yield_score = min(100, yield_ttm * 12.5)
                final_score = 0.5 * ter_score + 0.5 * yield_score
            else:
                yield_bonus = min(20, yield_ttm * 5)
                final_score = 0.8 * ter_score + 0.2 * yield_bonus
            
            scores.append(final_score)
        
        result = np.zeros(len(assets))
        valid_indices = [i for i, s in enumerate(scores) if s is not None]
        
        if len(valid_indices) >= 5:
            valid_scores = [scores[i] for i in valid_indices]
            valid_cats = [categories[i] for i in valid_indices]
            zscores = self._zscore_by_class(valid_scores, valid_cats)
            for idx, z in zip(valid_indices, zscores):
                result[idx] = z
        
        return result
    
    def compute_factor_bond_quality(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur qualité obligataire.
        
        v2.4.2: Stocke bond_quality_raw séparément pour bucket.
        """
        scores = []
        raw_scores = []  # v2.4.2: RAW pour bucket
        categories = []
        
        self._bond_quality_raw = {}  # Reset
        
        for idx, a in enumerate(assets):
            category = normalize_category(a.get("category", ""))
            fund_type = str(a.get("fund_type", "")).lower()
            categories.append(category)
            symbol = a.get("symbol", a.get("id", "?"))
            
            is_bond = (category == "bond") or ("bond" in fund_type)
            
            if not is_bond:
                scores.append(None)
                raw_scores.append(None)
                continue
            
            # Score crédit
            credit_raw = a.get("bond_credit_score")
            if _is_missing(credit_raw) or credit_raw <= 0:
                rating = a.get("bond_credit_rating", "")
                if rating:
                    credit_raw = _rating_to_score(rating)
                
                if _is_missing(credit_raw) or pd.isna(credit_raw) or credit_raw <= 0:
                    credit_raw = 35.0  # Pénalité BB
                    logger.warning(f"bond_quality: missing credit for {symbol} → penalty 35 (BB)")
            
            # v2.4.2: Calcul RAW avec pénalités sévères
            dur = a.get("bond_avg_duration")
            vol = a.get("vol_pct") or a.get("vol_3y")
            
            quality_raw, metadata = _compute_bond_quality_raw(
                credit_score=fnum(credit_raw),
                duration=dur,
                vol=vol,
                symbol=symbol
            )
            
            raw_scores.append(quality_raw)
            self._bond_quality_raw[idx] = quality_raw  # v2.4.2: Stocké pour bucket
            scores.append(quality_raw)
        
        # Z-score sur les RAW scores
        result = np.zeros(len(assets))
        valid_indices = [i for i, s in enumerate(scores) if s is not None]
        
        if len(valid_indices) >= 3:
            valid_scores = [scores[i] for i in valid_indices]
            valid_arr = np.array(valid_scores, dtype=float)
            if valid_arr.std() > 1e-8:
                zscores = (valid_arr - valid_arr.mean()) / valid_arr.std()
                for idx, z in zip(valid_indices, zscores):
                    result[idx] = z
        
        return result
    
    def compute_factor_tactical_context(self, assets: List[dict]) -> np.ndarray:
        """Facteur contexte tactique avec z-score par classe."""
        if not self._sector_lookup and not self._country_lookup:
            return np.zeros(len(assets))
        
        scores = []
        categories = []
        
        for a in assets:
            sector_top = a.get("sector_top", "")
            country_top = a.get("country_top", "")
            categories.append(a.get("category", "other"))
            
            components = []
            weights = []
            
            if self._sector_lookup and sector_top:
                sector_key = SECTOR_KEY_MAPPING.get(sector_top.strip())
                if sector_key and sector_key in self._sector_lookup:
                    ref = self._sector_lookup[sector_key]
                    ytd = ref.get("ytd_num", 0) or 0
                    daily = ref.get("change_num", 0) or 0
                    raw = 0.7 * (ytd / 25.0) + 0.3 * (daily / 2.0)
                    raw = max(-1.0, min(1.0, raw))
                    f_sector = 0.5 * (raw + 1.0)
                    components.append(f_sector)
                    weights.append(0.4)
            
            if self._country_lookup and country_top:
                norm_country = COUNTRY_NORMALIZATION.get(country_top.strip(), country_top.strip())
                if norm_country in self._country_lookup:
                    ref = self._country_lookup[norm_country]
                    ytd = ref.get("ytd_num", 0) or ref.get("_ytd_value", 0) or 0
                    daily = ref.get("change_num", 0) or ref.get("_change_value", 0) or 0
                    raw = 0.7 * (ytd / 25.0) + 0.3 * (daily / 2.0)
                    raw = max(-1.0, min(1.0, raw))
                    f_region = 0.5 * (raw + 1.0)
                    components.append(f_region)
                    weights.append(0.3)
            
            if self._macro_tilts:
                f_macro = 0.5
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
            
            if components and sum(weights) > 0:
                tactical_score = sum(c * w for c, w in zip(components, weights)) / sum(weights)
            else:
                tactical_score = 0.5
            
            scores.append(tactical_score * 100)
        
        return self._zscore_by_class(scores, categories)
    
    def compute_factor_liquidity(self, assets: List[dict]) -> np.ndarray:
        """Facteur liquidité: log(market_cap ou AUM)."""
        raw_liq = []
        categories = []
        
        for a in assets:
            category = normalize_category(a.get("category", "other"))
            categories.append(category)
            
            liq = a.get("liquidity") or a.get("market_cap") or a.get("aum_usd")
            
            if _is_missing(liq) or liq <= 0:
                liq = MISSING_LIQUIDITY_PENALTY.get(category, 50_000_000)
                logger.debug(f"liquidity: missing for {a.get('id', a.get('symbol', '?'))} → penalty {liq:,.0f}")
            else:
                liq = fnum(liq)
            
            raw_liq.append(math.log(max(liq, 1)))
        
        return self._zscore_by_class(raw_liq, categories)
    
    def compute_factor_mean_reversion(self, assets: List[dict]) -> np.ndarray:
        """Facteur mean reversion: pénalise les sur-extensions."""
        scores = []
        
        for a in assets:
            ytd = fnum(a.get("ytd"))
            p1m = fnum(a.get("perf_1m"))
            
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
        """
        Calcule le score composite pour chaque actif.
        
        v2.4.2: bond_risk_bucket basé sur RAW, pas z-score.
        """
        if not assets:
            return assets
        
        n = len(assets)
        categories = [normalize_category(a.get("category", "other")) for a in assets]
        
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
            
            total_weight = 0.0
            weighted_score = 0.0
            
            for factor_name in applicable_factors:
                base_weight = getattr(self.weights, factor_name, 0)
                if base_weight > 0 and factor_name in factors:
                    factor_value = factors[factor_name][i]
                    weighted_score += base_weight * factor_value
                    total_weight += base_weight
            
            if total_weight > 0:
                composite[i] = weighted_score / total_weight
            else:
                composite[i] = 0.0
        
        # Enrichir les actifs
        for i, asset in enumerate(assets):
            asset["factor_scores"] = {
                name: round(float(values[i]), 3)
                for name, values in factors.items()
            }
            asset["composite_score"] = round(float(composite[i]), 3)
            asset["score"] = asset["composite_score"]
            
            cat = categories[i]
            asset["_scoring_meta"] = {
                "category_normalized": cat,
                "applicable_factors": FACTORS_BY_CATEGORY.get(cat, []),
                "scoring_version": "v2.4.2",
            }
            
            if cat == "equity":
                asset["buffett_score"] = compute_buffett_quality_score(asset)
            
            # v2.4.2 FIX CRITIQUE: bond_risk_bucket basé sur RAW, pas z-score
            if cat == "bond" or "bond" in str(asset.get("fund_type", "")).lower():
                if i in self._bond_quality_raw:
                    raw_quality = self._bond_quality_raw[i]
                    asset["bond_quality_raw"] = raw_quality
                    asset["bond_quality_z"] = factors["bond_quality"][i]
                    asset["bond_risk_bucket"] = _get_bond_risk_bucket(raw_quality)
                else:
                    asset["bond_risk_bucket"] = "unknown"
            
            ytd = fnum(asset.get("ytd"))
            p1m = fnum(asset.get("perf_1m"))
            asset["flags"] = {
                "overextended": (ytd > 80 and p1m <= 0) or (ytd > 150)
            }
        
        # Log stats par catégorie
        for cat in set(categories):
            cat_indices = [i for i, c in enumerate(categories) if c == cat]
            if cat_indices:
                cat_scores = [composite[i] for i in cat_indices]
                logger.info(
                    f"Scores {cat}: n={len(cat_indices)}, "
                    f"mean={np.mean(cat_scores):.3f}, "
                    f"std={np.std(cat_scores):.3f}, "
                    f"range=[{np.min(cat_scores):.2f}, {np.max(cat_scores):.2f}]"
                )
        
        logger.info(
            f"Scores v2.4.2 calculés: {n} actifs (profil {self.profile}) | "
            f"Score moyen global: {composite.mean():.3f}"
        )
        
        return assets
    
    def rank_assets(self, assets: List[dict], top_n: Optional[int] = None) -> List[dict]:
        """Trie les actifs par score décroissant (stable sort)."""
        scored = self.compute_scores(assets)
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
    """Recalcule les scores de tout l'univers pour un profil donné."""
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
            "tactical_context": w.tactical_context,
            "liquidity": w.liquidity,
            "mean_reversion": w.mean_reversion,
        }
        for profile, w in PROFILE_WEIGHTS.items()
    }


def compare_factor_profiles() -> str:
    """Génère une comparaison textuelle des profils."""
    lines = [
        "Comparaison des poids factoriels par profil (v2.4.2):",
        "",
        "PARI CENTRAL: Quality + Momentum + Contexte tactique surperforment à horizon 1-3 ans.",
        "",
        "v2.4.2 FIXES: bond_risk_bucket sur RAW + TER strict + bonds pénalités sévères",
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
    """Calcule le taux de couverture des métriques de qualité."""
    if not assets:
        return {}
    
    total = len(assets)
    equities = [a for a in assets if normalize_category(a.get("category", "")) == "equity"]
    etf_bonds = [a for a in assets if normalize_category(a.get("category", "")) in ["etf", "bond"]]
    bonds_only = [a for a in assets if normalize_category(a.get("category", "")) == "bond"]
    n_eq = len(equities) or 1
    n_etf = len(etf_bonds) or 1
    n_bonds = len(bonds_only) or 1
    
    return {
        "roe": round(sum(1 for a in equities if fnum(a.get("roe")) > 0) / n_eq * 100, 1),
        "roic": round(sum(1 for a in equities if fnum(a.get("roic")) > 0) / n_eq * 100, 1),
        "fcf_yield": round(sum(1 for a in equities if a.get("fcf_yield") is not None) / n_eq * 100, 1),
        "de_ratio": round(sum(1 for a in equities if fnum(a.get("de_ratio")) >= 0) / n_eq * 100, 1),
        "eps_growth_5y": round(sum(1 for a in equities if a.get("eps_growth_5y") is not None) / n_eq * 100, 1),
        "total_expense_ratio": round(sum(1 for a in etf_bonds if fnum(a.get("total_expense_ratio")) > 0) / n_etf * 100, 1),
        "yield_ttm": round(sum(1 for a in etf_bonds if fnum(a.get("yield_ttm")) > 0) / n_etf * 100, 1),
        "bond_credit_score": round(sum(1 for a in bonds_only if fnum(a.get("bond_credit_score")) > 0) / n_bonds * 100, 1),
        "bond_avg_duration": round(sum(1 for a in bonds_only if fnum(a.get("bond_avg_duration")) > 0) / n_bonds * 100, 1),
        "sector_top": round(sum(1 for a in assets if a.get("sector_top")) / total * 100, 1),
        "country_top": round(sum(1 for a in assets if a.get("country_top")) / total * 100, 1),
        "equities_count": len(equities),
        "etf_bonds_count": len(etf_bonds),
        "bonds_only_count": len(bonds_only),
        "total_count": total,
    }


# ============= MAIN (pour test) =============

if __name__ == "__main__":
    print(compare_factor_profiles())
    print("\n" + "=" * 60)
    print("Test v2.4.2: bond_risk_bucket sur RAW...")
    
    # Test TER normalization
    print("\n--- Test TER normalization ---")
    test_cases = [
        (0.0009, "ETF_A"),  # Décimal API → medium
        (0.09, "ETF_B"),    # Déjà en % → high
        (0.9, "ETF_C"),     # 0.9% → high
        (5.0, "ETF_D"),     # 5% → rejected
        (0.00001, "ETF_E"), # Trop bas → rejected
    ]
    for ter_raw, symbol in test_cases:
        result, confidence = _normalize_ter(ter_raw, symbol)
        print(f"  {symbol}: raw={ter_raw} → {result}% ({confidence})")
    
    # Test bond_risk_bucket basé sur RAW
    print("\n--- Test bond_risk_bucket sur RAW ---")
    test_bonds = [
        {"symbol": "AGG", "category": "bond", "fund_type": "bond", "bond_credit_score": 90, "bond_avg_duration": 3.5, "vol_pct": 4.0, "ytd": 2, "perf_1m": 0.5},
        {"symbol": "HYG", "category": "bond", "fund_type": "bond", "bond_credit_score": 45, "bond_avg_duration": 4.0, "vol_pct": 8.0, "ytd": 5, "perf_1m": 1.0},
        {"symbol": "TLT", "category": "bond", "fund_type": "bond", "bond_credit_score": 95, "bond_avg_duration": 17.0, "vol_pct": 15.0, "ytd": -5, "perf_1m": -1.0},
        {"symbol": "MISSING", "category": "bond", "fund_type": "bond", "bond_credit_score": 80, "ytd": 1, "perf_1m": 0.2},  # duration/vol missing
    ]
    
    scorer = FactorScorer("Stable")
    scored_bonds = scorer.compute_scores(test_bonds)
    
    print("\nBonds avec bucket basé sur RAW:")
    for b in scored_bonds:
        raw = b.get("bond_quality_raw", "N/A")
        z = b.get("bond_quality_z", "N/A")
        bucket = b.get("bond_risk_bucket", "N/A")
        print(f"  {b['symbol']:8} | RAW={raw:>5} | Z={z:>+6.2f} | bucket={bucket}")
    
    print("\n✅ v2.4.2 test completed")
