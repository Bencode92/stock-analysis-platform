# portfolio_engine/factors.py
"""
FactorScorer v2.4.4 — SEUL MOTEUR D'ALPHA
=========================================

v2.4.4 Changes (P0 Fix - Doublons + Cap pénalité):
- FIX CRITIQUE: _missing_critical_fields utilise set() au lieu de list (évite doublons)
- FIX: Cap sur data_quality_penalty (MAX_DQ_PENALTY = 0.6)
- NOUVEAU: _track_missing() helper method pour tracking unifié
- NOUVEAU: market_context_age_days + market_context_stale dans _scoring_meta

v2.4.3 Changes:
- ter_confidence stocké dans _scoring_meta
- Bond ETF cohérence: fund_type="bond" → catégorie "bond"
- _is_missing_or_zero() pour TER/vol/duration
- data_quality_penalty sur composite

v2.4.2 Changes:
- bond_risk_bucket basé sur RAW (0-100)
- TER validation stricte avec confidence
- Bonds: pénalités sévères pour missing

v2.4.1 Changes:
- TER validation stricte avec heuristique
- Crypto vol_30d_annual_pct
- Tactical z-score par classe

v2.4.0 Changes:
- Z-score PAR CLASSE (equity/etf/bond/crypto)
- Suppression defaults silencieux
- Pénalités explicites pour données manquantes
- Poids renormalisés par catégorie

Facteurs:
- momentum: 45% (Agressif) → 20% (Stable) — Driver principal
- quality_fundamental: 25-30% — Score Buffett intégré
- low_vol: 15-35% — Contrôle du risque
- cost_efficiency: 5-10% — TER + Yield (ETF/Bonds)
- bond_quality: 0-15% — Qualité obligataire
- tactical_context: 5-10% — Contexte marché
- liquidity: 5-10% — Filtre technique
- mean_reversion: 5% — Évite sur-extension
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


def normalize_category(category: str, fund_type: str = "") -> str:
    """
    v2.4.3: Normalise la catégorie vers une clé standard.
    
    RÈGLE IMPORTANTE: Si fund_type contient "bond", force catégorie = "bond"
    même si category = "etf". Cela garantit que les ETF obligataires
    utilisent les facteurs bond_quality.
    """
    # v2.4.3 FIX 2: Bond ETF → catégorie "bond"
    fund_type_lower = str(fund_type).lower().strip() if fund_type else ""
    if "bond" in fund_type_lower or "obligation" in fund_type_lower or "fixed income" in fund_type_lower:
        return "bond"
    
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

# v2.4.2: Seuils pour bond_risk_bucket (basés sur RAW 0-100)
BOND_BUCKET_THRESHOLDS = {
    "defensive": 75,
    "core": 55,
    "risky": 35,
}

# v2.4.4: Pénalité composite pour données manquantes critiques (avec cap)
DATA_QUALITY_PENALTY = 0.15  # Par champ manquant (calibré: ~15 percentiles)
MAX_DQ_PENALTY = 0.6  # Cap total (évite sur-pénalisation)

# v2.4.4: Staleness threshold pour market context
MARKET_CONTEXT_STALE_DAYS = 7


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


def _get_market_context_age(loaded_at: Optional[str]) -> Tuple[Optional[float], bool]:
    """
    v2.4.4: Calcule l'âge du market context en jours.
    
    Returns:
        (age_days, is_stale)
    """
    if not loaded_at:
        return None, True
    
    try:
        dt = datetime.fromisoformat(loaded_at.replace('Z', '+00:00'))
        now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
        age_days = (now - dt).total_seconds() / 86400
        is_stale = age_days > MARKET_CONTEXT_STALE_DAYS
        return round(age_days, 2), is_stale
    except Exception as e:
        logger.warning(f"Cannot parse market_context loaded_at: {loaded_at} - {e}")
        return None, True


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
    """
    v2.4.3 FIX 3: Vérifie si une valeur est manquante.
    
    Détecte: None, NaN, chaîne vide, "N/A", "null"
    NOTE: Ne détecte PAS 0 comme manquant (utiliser _is_missing_or_zero pour ça)
    """
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("", "n/a", "null", "none", "nan", "-"):
            return True
    return False


def _is_missing_or_zero(value) -> bool:
    """
    v2.4.3: Vérifie si une valeur est manquante OU égale à zéro/négative.
    
    Utilisé pour les champs où 0 est invalide: TER, vol, duration, market_cap
    """
    if _is_missing(value):
        return True
    try:
        num = float(value) if not isinstance(value, (int, float)) else value
        if math.isnan(num):
            return True
        return num <= 0
    except (TypeError, ValueError):
        return True


# ============= v2.4.2 TER VALIDATION STRICTE =============

def _normalize_ter(ter_raw: float, symbol: str = "?") -> Tuple[Optional[float], str]:
    """
    v2.4.2: Normalise le TER avec validation STRICTE.
    
    Returns:
        (ter_pct, confidence) où:
        - ter_pct: TER en % (ex: 0.09 pour 0.09%), ou None si invalide
        - confidence: "high" | "medium" | "low" | "rejected" | "missing"
    """
    if _is_missing_or_zero(ter_raw):
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
    if _is_missing_or_zero(duration):
        metadata["missing_fields"].append("duration")
        f_dur = 0.3  # Pénalité sévère
        metadata["penalty_applied"] = True
        logger.warning(f"bond_quality: missing duration for {symbol} → severe penalty (f_dur=0.3)")
    else:
        dur = fnum(duration)
        f_dur = 1.0 - min(1.0, max(0.0, dur / D_MAX))
    metadata["components"]["duration"] = round(f_dur * 100, 1)
    
    # Score volatilité (0-1, plus bas = mieux)
    V_MAX = 12.0
    if _is_missing_or_zero(vol):
        metadata["missing_fields"].append("vol")
        f_vol = 0.3  # Pénalité sévère
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
    """v2.4.2: Détermine le bucket de risque basé sur la qualité RAW."""
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
    
    roe = fnum(asset.get("roe"))
    roe_good = thresholds.get("roe_good", 12)
    if roe > 0:
        roe_score = min(100, (roe / roe_good) * 70)
        scores.append(roe_score)
        weights.append(0.20)
    
    roic = fnum(asset.get("roic"))
    roic_good = thresholds.get("roic_good")
    if roic_good and roic > 0:
        roic_score = min(100, (roic / roic_good) * 70)
        scores.append(roic_score)
        weights.append(0.30)
    
    fcf = fnum(asset.get("fcf_yield"))
    fcf_good = thresholds.get("fcf_good", 3)
    if fcf != 0:
        if fcf < 0:
            fcf_score = max(0, 30 + fcf * 5)
        else:
            fcf_score = min(100, 50 + (fcf / fcf_good) * 25)
        scores.append(fcf_score)
        weights.append(0.20)
    
    de = fnum(asset.get("de_ratio"))
    de_max = thresholds.get("de_max")
    if de_max and de >= 0:
        if de <= de_max:
            de_score = 80 - (de / de_max) * 30
        else:
            de_score = max(0, 50 - (de - de_max) / de_max * 50)
        scores.append(de_score)
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
    
    weighted_score = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
    return round(weighted_score, 1)


# ============= FACTOR SCORER v2.4.4 =============

class FactorScorer:
    """
    Calcule des scores multi-facteur adaptés au profil.
    
    v2.4.4 — P0 FIX (Doublons + Cap):
    - _missing_critical_fields utilise set() (évite doublons)
    - Cap sur data_quality_penalty (MAX_DQ_PENALTY)
    - _track_missing() helper method
    - market_context_age_days + stale dans _scoring_meta
    
    v2.4.3:
    - ter_confidence stocké dans _scoring_meta
    - Bond ETF: fund_type="bond" → catégorie "bond"
    - _is_missing_or_zero() pour TER/vol/duration
    - data_quality_penalty sur composite
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
        
        # v2.4.4: Staleness tracking
        self._market_context_age_days: Optional[float] = None
        self._market_context_stale: bool = True
        
        # v2.4.2/3/4: Stockage pour traçabilité
        self._bond_quality_raw: Dict[int, float] = {}
        self._bond_quality_meta: Dict[int, Dict] = {}
        self._ter_confidence: Dict[int, str] = {}
        # v2.4.4 FIX: Utilise Set au lieu de List pour éviter doublons
        self._missing_critical_fields: Dict[int, Set[str]] = {}
        
        if self.market_context:
            self._build_lookups()
    
    def _build_lookups(self):
        """Construit les lookups pour le scoring tactique."""
        if "sectors" in self.market_context:
            self._sector_lookup = _build_sector_lookup(self.market_context["sectors"])
        if "indices" in self.market_context:
            self._country_lookup = _build_country_lookup(self.market_context["indices"])
        self._macro_tilts = self.market_context.get("macro_tilts", DEFAULT_MACRO_TILTS)
        
        # v2.4.4: Compute staleness
        loaded_at = self.market_context.get("loaded_at")
        self._market_context_age_days, self._market_context_stale = _get_market_context_age(loaded_at)
        
        if self._market_context_stale:
            logger.warning(
                f"Market context is stale: {self._market_context_age_days} days old "
                f"(threshold: {MARKET_CONTEXT_STALE_DAYS} days)"
            )
    
    def _track_missing(self, idx: int, field: str):
        """
        v2.4.4: Helper pour tracker les champs manquants (utilise set pour éviter doublons).
        """
        if idx not in self._missing_critical_fields:
            self._missing_critical_fields[idx] = set()
        self._missing_critical_fields[idx].add(field)
    
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
    
    @staticmethod
    def _zscore_by_class(
        values: List[float], 
        categories: List[str],
        min_samples: int = 5,
        winsor_pct: float = 0.02
    ) -> np.ndarray:
        """Z-score PAR CLASSE d'actifs."""
        n = len(values)
        result = np.zeros(n)
        
        by_cat: Dict[str, List[int]] = defaultdict(list)
        for i, cat in enumerate(categories):
            by_cat[cat].append(i)
        
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
    
    def _get_normalized_category(self, asset: dict) -> str:
        """v2.4.3: Normalise catégorie avec règle fund_type bond."""
        return normalize_category(
            asset.get("category", ""),
            asset.get("fund_type", "")
        )
    
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
            cat = self._get_normalized_category(a)
            if cat == "crypto":
                sharpe = fnum(a.get("sharpe_ratio", 0))
                sharpe_bonus = max(-20, min(20, sharpe * 10))
                raw[i] += sharpe_bonus
        
        categories = [self._get_normalized_category(a) for a in assets]
        return self._zscore_by_class(raw, categories)
    
    def compute_factor_quality_fundamental(self, assets: List[dict]) -> np.ndarray:
        """Facteur qualité fondamentale: Score Buffett."""
        scores = []
        categories = []
        
        for asset in assets:
            cat = self._get_normalized_category(asset)
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
        
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            symbol = a.get("symbol", a.get("id", "?"))
            
            vol = (
                a.get("vol_3y") or 
                a.get("vol30") or 
                a.get("vol_annual") or 
                a.get("vol") or 
                a.get("vol_pct") or
                a.get("vol_30d_annual_pct")
            )
            
            if _is_missing_or_zero(vol):
                vol = MISSING_VOL_PENALTY.get(cat, 30.0)
                logger.debug(f"low_vol: missing vol for {symbol} → penalty {vol}")
                # v2.4.4: Utilise _track_missing
                self._track_missing(idx, "vol")
            else:
                vol = fnum(vol)
            
            raw_vol.append(vol)
        
        zscores = self._zscore_by_class(raw_vol, categories)
        return -zscores
    
    def compute_factor_cost_efficiency(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur coût/rendement pour ETF et Bonds.
        
        v2.4.3 FIX 1: Stocke ter_confidence pour traçabilité.
        """
        scores = []
        categories = []
        
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            
            if cat not in ["etf", "bond"]:
                scores.append(None)
                continue
            
            fund_type = str(a.get("fund_type", "")).lower()
            symbol = a.get("symbol", a.get("id", "?"))
            
            # TER avec stockage confidence
            ter_raw = a.get("total_expense_ratio")
            ter_pct, confidence = _normalize_ter(ter_raw, symbol)
            self._ter_confidence[idx] = confidence
            
            if ter_pct is None or confidence == "rejected":
                ter_score = 20.0
                logger.debug(f"cost_efficiency: TER {confidence} for {symbol} → severe penalty 20")
                # v2.4.4: Utilise _track_missing
                self._track_missing(idx, "ter")
            elif confidence == "low":
                ter_score = max(0, 100 - ter_pct * 33) * 0.7
                logger.debug(f"cost_efficiency: TER low confidence for {symbol} → 30% penalty")
            else:
                ter_score = max(0, 100 - ter_pct * 33)
            
            yield_ttm = fnum(a.get("yield_ttm", 0))
            
            if "bond" in fund_type or cat == "bond":
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
        """Facteur qualité obligataire avec RAW stocké."""
        scores = []
        categories = []
        
        self._bond_quality_raw = {}
        self._bond_quality_meta = {}
        
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            symbol = a.get("symbol", a.get("id", "?"))
            
            is_bond = (cat == "bond")
            
            if not is_bond:
                scores.append(None)
                continue
            
            # Score crédit
            credit_raw = a.get("bond_credit_score")
            if _is_missing_or_zero(credit_raw):
                rating = a.get("bond_credit_rating", "")
                if rating:
                    credit_raw = _rating_to_score(rating)
                
                if _is_missing(credit_raw) or pd.isna(credit_raw) or credit_raw <= 0:
                    credit_raw = 35.0
                    logger.warning(f"bond_quality: missing credit for {symbol} → penalty 35 (BB)")
                    # v2.4.4: Utilise _track_missing
                    self._track_missing(idx, "credit")
            
            dur = a.get("bond_avg_duration")
            vol = a.get("vol_pct") or a.get("vol_3y")
            
            quality_raw, metadata = _compute_bond_quality_raw(
                credit_score=fnum(credit_raw),
                duration=dur,
                vol=vol,
                symbol=symbol
            )
            
            self._bond_quality_raw[idx] = quality_raw
            self._bond_quality_meta[idx] = metadata
            scores.append(quality_raw)
            
            # v2.4.4: Track missing fields from metadata (utilise set, pas de doublons)
            for field in metadata["missing_fields"]:
                self._track_missing(idx, field)
        
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
            categories.append(self._get_normalized_category(a))
            
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
        
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            symbol = a.get("symbol", a.get("id", "?"))
            
            liq = a.get("liquidity") or a.get("market_cap") or a.get("aum_usd")
            
            if _is_missing_or_zero(liq):
                liq = MISSING_LIQUIDITY_PENALTY.get(cat, 50_000_000)
                logger.debug(f"liquidity: missing for {symbol} → penalty {liq:,.0f}")
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
        
        v2.4.4: Fix doublons + cap pénalité + staleness.
        """
        if not assets:
            return assets
        
        # Reset tracking dicts
        self._missing_critical_fields = {}  # v2.4.4: Dict[int, Set[str]]
        self._ter_confidence = {}
        self._bond_quality_raw = {}
        self._bond_quality_meta = {}
        
        n = len(assets)
        categories = [self._get_normalized_category(a) for a in assets]
        
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
            
            # v2.4.4: Data quality penalty avec SET (pas de doublons) + CAP
            missing_fields = self._missing_critical_fields.get(i, set())
            if missing_fields:
                raw_penalty = DATA_QUALITY_PENALTY * len(missing_fields)
                penalty = min(raw_penalty, MAX_DQ_PENALTY)  # Cap!
                composite[i] -= penalty
                logger.debug(
                    f"data_quality_penalty for {asset.get('symbol', '?')}: "
                    f"-{penalty:.2f} (raw={raw_penalty:.2f}, cap={MAX_DQ_PENALTY}) "
                    f"(missing: {sorted(missing_fields)})"
                )
        
        # Enrichir les actifs
        for i, asset in enumerate(assets):
            asset["factor_scores"] = {
                name: round(float(values[i]), 3)
                for name, values in factors.items()
            }
            asset["composite_score"] = round(float(composite[i]), 3)
            asset["score"] = asset["composite_score"]
            
            cat = categories[i]
            
            # v2.4.4: Conversion set → sorted list pour JSON
            missing_fields_set = self._missing_critical_fields.get(i, set())
            missing_fields_list = sorted(list(missing_fields_set))
            
            # v2.4.4: Stockage complet dans _scoring_meta avec staleness
            asset["_scoring_meta"] = {
                "category_normalized": cat,
                "category_original": asset.get("category", ""),
                "fund_type": asset.get("fund_type", ""),
                "applicable_factors": FACTORS_BY_CATEGORY.get(cat, []),
                "scoring_version": "v2.4.4",
                "ter_confidence": self._ter_confidence.get(i),
                "missing_critical_fields": missing_fields_list,
                "missing_fields_count": len(missing_fields_list),
                "data_quality_penalty_applied": len(missing_fields_list) > 0,
                "data_quality_penalty_value": round(min(DATA_QUALITY_PENALTY * len(missing_fields_list), MAX_DQ_PENALTY), 3) if missing_fields_list else 0,
                # v2.4.4: Market context staleness
                "market_context_age_days": self._market_context_age_days,
                "market_context_stale": self._market_context_stale,
            }
            
            if cat == "equity":
                asset["buffett_score"] = compute_buffett_quality_score(asset)
            
            # bond_risk_bucket basé sur RAW
            if cat == "bond":
                if i in self._bond_quality_raw:
                    raw_quality = self._bond_quality_raw[i]
                    asset["bond_quality_raw"] = raw_quality
                    asset["bond_quality_z"] = factors["bond_quality"][i]
                    asset["bond_risk_bucket"] = _get_bond_risk_bucket(raw_quality)
                    asset["_scoring_meta"]["bond_quality_meta"] = self._bond_quality_meta.get(i)
                else:
                    asset["bond_risk_bucket"] = "unknown"
            
            ytd = fnum(asset.get("ytd"))
            p1m = fnum(asset.get("perf_1m"))
            asset["flags"] = {
                "overextended": (ytd > 80 and p1m <= 0) or (ytd > 150),
                "incomplete_data": len(missing_fields_list) > 0,
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
        
        # Log data quality summary
        incomplete_count = sum(1 for i in range(n) if self._missing_critical_fields.get(i))
        if incomplete_count > 0:
            logger.warning(f"Data quality: {incomplete_count}/{n} assets have missing critical fields")
        
        logger.info(
            f"Scores v2.4.4 calculés: {n} actifs (profil {self.profile}) | "
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
        "Comparaison des poids factoriels par profil (v2.4.4):",
        "",
        "v2.4.4 FIXES: set() pour doublons + cap pénalité + staleness market_context",
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
    
    def get_cat(a):
        return normalize_category(a.get("category", ""), a.get("fund_type", ""))
    
    equities = [a for a in assets if get_cat(a) == "equity"]
    bonds = [a for a in assets if get_cat(a) == "bond"]
    etfs = [a for a in assets if get_cat(a) == "etf"]
    
    n_eq = len(equities) or 1
    n_bonds = len(bonds) or 1
    n_etfs = len(etfs) or 1
    
    return {
        "roe": round(sum(1 for a in equities if fnum(a.get("roe")) > 0) / n_eq * 100, 1),
        "roic": round(sum(1 for a in equities if fnum(a.get("roic")) > 0) / n_eq * 100, 1),
        "fcf_yield": round(sum(1 for a in equities if a.get("fcf_yield") is not None) / n_eq * 100, 1),
        "total_expense_ratio_etf": round(sum(1 for a in etfs if not _is_missing_or_zero(a.get("total_expense_ratio"))) / n_etfs * 100, 1),
        "total_expense_ratio_bond": round(sum(1 for a in bonds if not _is_missing_or_zero(a.get("total_expense_ratio"))) / n_bonds * 100, 1),
        "bond_credit_score": round(sum(1 for a in bonds if fnum(a.get("bond_credit_score")) > 0) / n_bonds * 100, 1),
        "bond_avg_duration": round(sum(1 for a in bonds if not _is_missing_or_zero(a.get("bond_avg_duration"))) / n_bonds * 100, 1),
        "equities_count": len(equities),
        "etfs_count": len(etfs),
        "bonds_count": len(bonds),
        "total_count": total,
    }


# ============= MAIN (pour test) =============

if __name__ == "__main__":
    print(compare_factor_profiles())
    print("\n" + "=" * 60)
    print("Test v2.4.4: P0 Fix (doublons + cap)...")
    
    # Test set() pour éviter doublons
    print("\n--- Test set() pour missing_critical_fields ---")
    scorer = FactorScorer("Stable")
    
    # Simuler tracking de champs manquants (avec doublons potentiels)
    scorer._track_missing(0, "vol")
    scorer._track_missing(0, "vol")  # Doublon!
    scorer._track_missing(0, "ter")
    scorer._track_missing(0, "duration")
    scorer._track_missing(0, "vol")  # Encore un doublon!
    
    result = scorer._missing_critical_fields.get(0, set())
    print(f"  Après ajouts avec doublons: {sorted(result)}")
    print(f"  Nombre unique: {len(result)} (devrait être 3, pas 5)")
    assert len(result) == 3, "BUG: doublons non filtrés!"
    print("  ✅ set() fonctionne correctement")
    
    # Test cap pénalité
    print("\n--- Test cap pénalité ---")
    print(f"  DATA_QUALITY_PENALTY = {DATA_QUALITY_PENALTY}")
    print(f"  MAX_DQ_PENALTY = {MAX_DQ_PENALTY}")
    
    # 5 champs manquants → raw = 0.75, capped à 0.6
    raw_penalty = DATA_QUALITY_PENALTY * 5
    capped_penalty = min(raw_penalty, MAX_DQ_PENALTY)
    print(f"  5 champs manquants: raw={raw_penalty:.2f}, capped={capped_penalty:.2f}")
    assert capped_penalty == MAX_DQ_PENALTY, "Cap non appliqué!"
    print("  ✅ Cap fonctionne correctement")
    
    # Test complet avec assets
    print("\n--- Test scoring complet ---")
    test_assets = [
        {"symbol": "AAPL", "category": "equity", "ytd": 28, "perf_1m": 5, "perf_3m": 12, "vol_3y": 28, "roe": 147, "roic": 56, "market_cap": 3e12},
        {"symbol": "AGG", "category": "etf", "fund_type": "bond", "ytd": 2, "perf_1m": 0.5, "vol_pct": 4.2, "total_expense_ratio": 0.03, "bond_credit_score": 87, "bond_avg_duration": 3.75, "aum_usd": 90e9},
        {"symbol": "MISSING_ALL", "category": "etf", "fund_type": "bond", "ytd": 1, "perf_1m": 0.2},  # Beaucoup de données manquantes
    ]
    
    scorer2 = FactorScorer("Stable")
    scored = scorer2.compute_scores(test_assets)
    
    print("\nRésultats:")
    for a in scored:
        meta = a.get("_scoring_meta", {})
        flags = a.get("flags", {})
        missing_count = meta.get("missing_fields_count", 0)
        penalty = meta.get("data_quality_penalty_value", 0)
        print(f"  {a['symbol']:12} | score={a['composite_score']:+.3f} | missing={missing_count} | penalty={penalty:.2f} | incomplete={flags.get('incomplete_data')}")
    
    # Vérifier que MISSING_ALL a la pénalité cappée
    missing_all = next(a for a in scored if a["symbol"] == "MISSING_ALL")
    if missing_all["_scoring_meta"]["missing_fields_count"] >= 4:
        assert missing_all["_scoring_meta"]["data_quality_penalty_value"] == MAX_DQ_PENALTY, "Cap non appliqué sur asset!"
        print("\n  ✅ Cap appliqué correctement sur MISSING_ALL")
    
    print("\n✅ v2.4.4 test completed")
