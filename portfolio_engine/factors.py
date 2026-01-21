# portfolio_engine/factors.py
"""
=========================================
FactorScorer v4.1.0 — MULTI-ASSET SCORING ENGINE
=================================================
v4.1.0 Changes (VOL MAPPING ALIGNMENT):
- NEW: _as_pct() helper for decimal vs % conversion
- NEW: _get_vol_for_scoring() aligned with optimizer.py v6.28
- FIX: compute_factor_low_vol() uses correct vol priority per category
- FIX: compute_factor_bond_quality() uses _get_vol_for_scoring()
- IMPACT: Reduces false "missing vol" penalties for ETF/Bond/Crypto

v4.0.0 Changes (EQUITY SCORING MODE):
- NEW: EQUITY_SCORING_MODE config ("preset" | "factors" | "blend")
- NEW: Mode "preset" (default) → skip composite_score pour equities
- NEW: preset_meta.py devient le seul moteur de scoring equity
- NEW: buffett_score toujours calculé pour equities (input pour preset_meta)
- FIX: Évite le double-scoring equity (factors + preset_meta)

v3.0.1 Changes (FIX STALE CONTEXT WARNING):

v3.0.1 Changes (FIX STALE CONTEXT WARNING):
- FIX: Warning "stale context" ne se déclenche plus si market_context est vide
- NEW: _has_meaningful_context() helper pour vérifier si context a des données
- Logique: warning SEULEMENT si context a des données ET loaded_at absent/ancien

v3.0.0 Changes (RANK NORMALIZATION - Step 1.2):
- NEW: USE_RANK_NORMALIZATION config flag (default: True)
- NEW: _rank_by_class() method for percentile-based normalization
- NEW: _normalize_by_class() wrapper with higher_is_better parameter
- FIX: Z-scores compressaient les groupes homogènes (mega-caps similaires → scores ≈ 0.5)
- FIX: Rank normalization produit une distribution uniforme [-1, +1]
- IMPACT: NVIDIA/APPLE peuvent maintenant être sélectionnés, p10-p90 > 0.3

v2.4.6 Changes (RADAR ETF Integration):
- NEW: NON_TILTABLE_BUCKETS pour filtrer alt assets
- NEW: SECTOR_MAPPING_ETF pour normaliser Twelve Data → RADAR
- NEW: _get_sector_for_tilt() et _get_region_for_tilt() helpers
- FIX: Tilt géo désactivé pour ETFs (domicile ≠ exposition)
- FIX: Early return permet RADAR sans lookups
- FIX: DEFAULT_MACRO_TILTS en format RADAR (kebab-case)
- NEW: Logs de couverture RADAR par catégorie
- Couverture ETFs: 0% → ~75%

v2.4.5 Changes (FIX RADAR tilts):
- FIX CRITIQUE: Les tilts RADAR sont maintenant appliqués correctement
- NOUVEAU: SECTOR_TO_RADAR mapping (FR/EN → format RADAR)
- NOUVEAU: COUNTRY_TO_RADAR mapping (FR/EN → format RADAR)
- NOUVEAU: normalize_sector_for_tilts() et normalize_region_for_tilts()
- NOUVEAU: _radar_matching stocké dans asset pour debug/traçabilité

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

import copy
import json
import logging
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Union, Any, Tuple, Set

import numpy as np
import pandas as pd

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

# v3.0.0: Import scipy.stats.rankdata for rank normalization
try:
    from scipy.stats import rankdata
except ImportError:
    def rankdata(a, method='average'):
        """Fallback rankdata implementation when scipy is not available."""
        arr = np.asarray(a)
        sorter = np.argsort(arr)
        inv = np.empty(sorter.size, dtype=np.intp)
        inv[sorter] = np.arange(sorter.size, dtype=np.intp)
        
        if method == 'average':
            arr_sorted = arr[sorter]
            obs = np.r_[True, arr_sorted[1:] != arr_sorted[:-1]]
            dense = obs.cumsum()[inv]
            count = np.r_[np.nonzero(obs)[0], len(obs)]
            return 0.5 * (count[dense] + count[dense - 1] + 1)
        elif method == 'ordinal':
            return inv + 1
        else:
            return inv + 1


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


def normalize_category(category: str, fund_type: str = "", etf_type: str = "", sector_bucket: str = "") -> str:
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
    
    # v2.4.7 FIX: Détection ETF via etf_type ou sector_bucket
    if etf_type or sector_bucket:
        return "etf"
    
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

# v3.0.0: Configuration pour la normalisation par rang
USE_RANK_NORMALIZATION = True  # Si False, utilise z-score classique
# v4.0.0: Mode de scoring equity
# "preset" = preset_meta.py gère le scoring equity (défaut)
# "factors" = factors.py calcule composite_score pour equities
# "blend" = les deux scores sont calculés (pour tests)
EQUITY_SCORING_MODE = "preset"

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

# APRÈS
DEFAULT_MACRO_TILTS = {
    "favored_sectors": ["healthcare", "consumer-staples", "utilities"],
    "avoided_sectors": ["real-estate", "consumer-discretionary"],
    "favored_regions": ["usa", "switzerland"],
    "avoided_regions": ["china", "hong-kong"],
}


# ============= v2.4.5 RADAR TILTS NORMALIZATION =============

# Mapping secteur → format RADAR (lowercase, hyphenated)
# Sources: sectors.json (EN/FR) + stocks (FR)
SECTOR_TO_RADAR = {
    # === Depuis sectors.json (EN) ===
    "Technology": "information-technology",
    "Semiconductor": "information-technology",
    "Cybersecurity": "information-technology",
    "Internet": "communication-services",
    "Telecommunications": "communication-services",
    
    "Health Care": "healthcare",
    "Pharmaceuticals": "healthcare",
    "Biotechnology": "healthcare",
    
    "Financial Services": "financials",
    "Banks": "financials",
    "Insurance": "financials",
    
    "Consumer Discretionary": "consumer-discretionary",
    "Retail": "consumer-discretionary",
    "Travel & Leisure": "consumer-discretionary",
    "Automobiles & Parts": "consumer-discretionary",
    "Personal & Household Goods": "consumer-discretionary",
    
    "Food & Beverage": "consumer-staples",
    
    "Energy": "energy",
    "Oil & Gas": "energy",
    
    "Industrials": "industrials",
    "Transportation": "industrials",
    "Construction & Materials": "industrials",
    
    "Materials": "materials",
    "Basic Resources": "materials",
    "Chemicals": "materials",
    
    "Utilities": "utilities",
    "Smart Grid Infrastructure": "utilities",
    
    "Real Estate": "real-estate",
    
    # === Depuis stocks (FR) ===
    "Technologie de l'information": "information-technology",
    "Santé": "healthcare",
    "Finance": "financials",
    "Biens de consommation cycliques": "consumer-discretionary",
    "Biens de consommation de base": "consumer-staples",
    "Energie": "energy",
    "Industries": "industrials",
    "Matériaux": "materials",
    "La communication": "communication-services",
    "Services publics": "utilities",
    "Immobilier": "real-estate",
    "Autres": "_other",
    
    # === Depuis sectors.json (FR) ===
    "Pétrole & Gaz": "energy",
    "Énergie": "energy",
    "Ressources de base": "materials",
    "Chimie": "materials",
    "Construction & Matériaux": "industrials",
    "Industriels": "industrials",
    "Transports": "industrials",
    "Automobiles & Équipementiers": "consumer-discretionary",
    "Biens personnels & ménagers": "consumer-discretionary",
    "Distribution": "consumer-discretionary",
    "Voyages & Loisirs": "consumer-discretionary",
    "Consommation discrétionnaire": "consumer-discretionary",
    "Alimentation & Boissons": "consumer-staples",
    "Pharmaceutiques": "healthcare",
    "Biotechnologie": "healthcare",
    "Banques": "financials",
    "Services financiers": "financials",
    "Assurances": "financials",
    "Technologie": "information-technology",
    "Semi-conducteurs": "information-technology",
    "Télécommunications": "communication-services",
    "Infrastructures réseaux intelligents": "utilities",
    
    # === Mappings additionnels (lowercase) ===
    "healthcare": "healthcare",
    "financials": "financials",
    "information-technology": "information-technology",
    "consumer-discretionary": "consumer-discretionary",
    "consumer-staples": "consumer-staples",
    "energy": "energy",
    "industrials": "industrials",
    "materials": "materials",
    "communication-services": "communication-services",
    "utilities": "utilities",
    "real-estate": "real-estate",
}

# Mapping pays → format RADAR (lowercase, hyphenated)
# Sources: markets.json + stocks (Asia/Europe)
COUNTRY_TO_RADAR = {
    # === Asie ===
    "Corée du Sud": "south-korea",
    "Corée": "south-korea",
    "South Korea": "south-korea",
    "Korea": "south-korea",
    
    "Chine": "china",
    "China": "china",
    
    "Japon": "japan",
    "Japan": "japan",
    
    "Inde": "india",
    "India": "india",
    
    "Taiwan": "taiwan",
    "Taïwan": "taiwan",
    
    "Hong Kong": "hong-kong",
    
    "Singapour": "singapore",
    "Singapore": "singapore",
    
    "Indonésie": "indonesia",
    "Indonesia": "indonesia",
    
    "Philippines": "philippines",
    
    "Thaïlande": "thailand",
    "Thailand": "thailand",
    
    "Malaisie": "malaysia",
    "Malaysia": "malaysia",
    
    # === Europe ===
    "Allemagne": "germany",
    "Germany": "germany",
    
    "France": "france",
    
    "Royaume-Uni": "uk",
    "Royaume Uni": "uk",
    "United Kingdom": "uk",
    "UK": "uk",
    
    "Italie": "italy",
    "Italy": "italy",
    
    "Espagne": "spain",
    "Spain": "spain",
    
    "Pays-Bas": "netherlands",
    "Netherlands": "netherlands",
    
    "Suisse": "switzerland",
    "Switzerland": "switzerland",
    
    "Belgique": "belgium",
    "Belgium": "belgium",
    
    "Autriche": "austria",
    "Austria": "austria",
    
    "Irlande": "ireland",
    "Ireland": "ireland",
    
    "Portugal": "portugal",
    
    "Norvège": "norway",
    "Norway": "norway",
    
    "Suède": "sweden",
    "Sweden": "sweden",
    
    "Danemark": "denmark",
    "Denmark": "denmark",
    
    "Finlande": "finland",
    "Finland": "finland",
    
    # === Amériques ===
    "Etats-Unis": "usa",
    "États-Unis": "usa",
    "United States": "usa",
    "USA": "usa",
    "US": "usa",
    
    "Canada": "canada",
    
    "Mexique": "mexico",
    "Mexico": "mexico",
    
    "Brésil": "brazil",
    "Brazil": "brazil",
    
    "Argentine": "argentina",
    "Argentina": "argentina",
    
    "Chili": "chile",
    "Chile": "chile",
    
    # === Autres ===
    "Australie": "australia",
    "Australia": "australia",
    
    "Israel": "israel",
    "Israël": "israel",
    
    "Saudi Arabia": "saudi-arabia",
    "Arabie Saoudite": "saudi-arabia",
    
    "South Africa": "south-africa",
    "Afrique du Sud": "south-africa",
    
    "Turquie": "turkey",
    "Turkey": "turkey",
    
    # === RÉGIONS À IGNORER (retournent chaîne vide) ===
    "Asie": "",
    "Europe": "",
    "Zone Euro": "",
}
# ============= v2.4.6 ETF RADAR INTEGRATION =============

# v2.4.6: Buckets ETF à exclure du tilt sectoriel
NON_TILTABLE_BUCKETS = {
    "ALT_ASSET_COMMODITY",
    "ALT_ASSET_CRYPTO",
    "ALT_ASSET_FX",
    "ALT_ASSET_VOLATILITY",
    "INDEX_DERIVATIVE",
    "STRUCTURED_VEHICLE",
    "DATA_MISSING",
}

# v2.4.6: Mapping Twelve Data sectors → format RADAR
SECTOR_MAPPING_ETF = {
    "Technology": "information-technology",
    "Financial Services": "financials",
    "Financial": "financials",
    "Healthcare": "healthcare",
    "Health Care": "healthcare",
    "Consumer Cyclical": "consumer-discretionary",
    "Consumer Discretionary": "consumer-discretionary",
    "Consumer Defensive": "consumer-staples",
    "Consumer Staples": "consumer-staples",
    "Industrials": "industrials",
    "Industrial": "industrials",
    "Basic Materials": "materials",
    "Materials": "materials",
    "Energy": "energy",
    "Utilities": "utilities",
    "Communication Services": "communication-services",
    "Real Estate": "real-estate",
}

def normalize_sector_for_tilts(sector: str) -> str:
    """
    v2.4.5: Normalise un secteur vers le format RADAR.
    
    Exemples:
        "Healthcare" → "healthcare"
        "Santé" → "healthcare"
        "Financial Services" → "financials"
        "Technologie de l'information" → "information-technology"
    
    Args:
        sector: Nom du secteur (FR ou EN, mixed case)
    
    Returns:
        Secteur au format RADAR (lowercase, hyphenated) ou chaîne vide si non trouvé
    """
    if not sector:
        return ""
    
    sector_clean = sector.strip()
    
    # 1. Mapping direct
    if sector_clean in SECTOR_TO_RADAR:
        return SECTOR_TO_RADAR[sector_clean]
    
    # 2. Essayer en lowercase
    sector_lower = sector_clean.lower()
    for key, value in SECTOR_TO_RADAR.items():
        if key.lower() == sector_lower:
            return value
    
    # 3. Recherche partielle (contient)
    for key, value in SECTOR_TO_RADAR.items():
        if sector_lower in key.lower() or key.lower() in sector_lower:
            return value
    
    # 4. Fallback: convertir en lowercase hyphenated
    return sector_clean.lower().replace(" ", "-").replace("_", "-")


def normalize_region_for_tilts(country: str) -> str:
    """
    v2.4.5: Normalise un pays vers le format RADAR.
    
    Exemples:
        "Corée du Sud" → "south-korea"
        "Corée" → "south-korea"
        "Chine" → "china"
        "Etats-Unis" → "usa"
    
    Args:
        country: Nom du pays (FR ou EN, mixed case)
    
    Returns:
        Pays au format RADAR (lowercase, hyphenated) ou chaîne vide si non trouvé/région
    """
    if not country:
        return ""
    
    country_clean = country.strip()
    
    # 1. Mapping direct
    if country_clean in COUNTRY_TO_RADAR:
        return COUNTRY_TO_RADAR[country_clean]
    
    # 2. Essayer en lowercase
    country_lower = country_clean.lower()
    for key, value in COUNTRY_TO_RADAR.items():
        if key.lower() == country_lower:
            return value
    
    # 3. Fallback: convertir en lowercase hyphenated
    return country_clean.lower().replace(" ", "-").replace("_", "-")
    
 # ============= v2.4.6 TILTS NORMALIZATION HELPER =============

def _normalize_tilts_list(tilts: list, normalize_fn) -> list:
    """v2.4.6: Normalise une liste de tilts vers le format RADAR."""
    if not tilts:
        return []
    result = []
    for item in tilts:
        if not isinstance(item, str) or not item.strip():
            continue
        normalized = normalize_fn(item)
        if normalized:
            result.append(normalized)
    return result    


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


def _has_meaningful_context(market_context: Dict) -> bool:
    """
    v3.0.1: Vérifie si le market_context contient des données significatives.
    
    Retourne True si au moins un de ces éléments est présent et non-vide:
    - sectors (dict non-vide)
    - indices (dict non-vide)  
    - macro_tilts différent du DEFAULT
    
    Utilisé pour éviter le warning "stale" sur un context vide.
    """
    if not market_context:
        return False
    
    # Vérifier sectors
    sectors = market_context.get("sectors", {})
    if sectors and isinstance(sectors, dict) and len(sectors) > 0:
        return True
    
    # Vérifier indices
    indices = market_context.get("indices", {})
    if indices and isinstance(indices, dict) and len(indices) > 0:
        return True
    
    # Vérifier macro_tilts (différent du default)
    macro_tilts = market_context.get("macro_tilts")
    if macro_tilts and macro_tilts != DEFAULT_MACRO_TILTS:
        return True
    
    return False


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
  # ============= v4.1.0 VOL MAPPING ALIGNED WITH OPTIMIZER =============

def _as_pct(val: Any) -> Optional[float]:
    """
    v4.1.0: Convertit une valeur en % (gère décimal vs %).
    Aligné avec optimizer.py v6.28.
    """
    if val is None:
        return None
    try:
        v = float(val)
    except (TypeError, ValueError):
        return None
    if math.isnan(v):
        return None
    if v <= 0:
        return None
    if 0 < v < 1.5:
        v *= 100.0
    return v


def _get_vol_for_scoring(asset: dict, cat: str) -> Optional[float]:
    """
    v4.1.0: Retourne vol annualisée en % selon la catégorie.
    Aligné avec _get_vol_from_item() dans optimizer.py v6.28.
    """
    if cat == "crypto":
        candidates = [
            asset.get("vol_30d_annual_pct"),
            asset.get("vol_7d_annual_pct"),
            asset.get("vol_pct"),
            asset.get("vol_annual"),
            asset.get("vol"),
        ]
    elif cat == "bond":
        candidates = [
            asset.get("vol_pct"),
            asset.get("vol_3y_pct"),
            asset.get("vol_3y"),
            asset.get("vol_annual"),
            asset.get("vol"),
        ]
    else:
        candidates = [
            asset.get("vol_3y_pct"),
            asset.get("vol_pct"),
            asset.get("vol_3y"),
            asset.get("vol_annual"),
            asset.get("vol30"),
            asset.get("vol"),
        ]
    
    for val in candidates:
        result = _as_pct(val)
        if result is not None and result > 0:
            return result
    
    return None      


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
    fcf_good = thresholds.get("fcf_good") or 3  # v4.15.0 FIX: Handle None value
    if fcf != 0 and fcf_good:  # v4.15.0 FIX: Double check fcf_good is not None
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


# ============= FACTOR SCORER v3.0.1 =============

class FactorScorer:
    """
    Calcule des scores multi-facteur adaptés au profil.
    
    v3.0.1 — FIX STALE CONTEXT WARNING:
    - Warning "stale context" ne se déclenche plus si market_context est vide
    - Nouvelle méthode _has_meaningful_context() pour vérifier si context a des données
    
    v3.0.0 — RANK NORMALIZATION (Step 1.2):
    - Nouvelle méthode _rank_by_class() pour normalisation par rang
    - Nouvelle méthode _normalize_by_class() avec higher_is_better
    - USE_RANK_NORMALIZATION config pour basculer entre ranks et z-scores
    - Fix: Z-scores compressaient les groupes homogènes
    
    v2.4.5 — FIX RADAR tilts:
    - Les tilts RADAR sont maintenant appliqués correctement
    - Nouveaux mappings SECTOR_TO_RADAR et COUNTRY_TO_RADAR
    - normalize_sector_for_tilts() et normalize_region_for_tilts()
    - _radar_matching stocké dans asset pour debug
    
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
    
    def __init__(
        self, 
        profile: str = "Modéré", 
        market_context: Optional[Dict] = None,
        config: Optional[Dict] = None
    ):
        if profile not in PROFILE_WEIGHTS:
            raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_WEIGHTS.keys())}")
        self.profile = profile
        self.weights = PROFILE_WEIGHTS[profile]
        self.market_context = market_context or {}
        self._sector_lookup = None
        self._country_lookup = None
        self._macro_tilts = None
        
        # v4.0.0: Configuration scoring
        self.config = config or {}
        self.equity_scoring_mode = self.config.get("equity_scoring_mode", EQUITY_SCORING_MODE)
        
        # v2.4.4: Staleness tracking
        self._market_context_age_days: Optional[float] = None
        self._market_context_stale: bool = True
        
        # v2.4.2/3/4: Stockage pour traçabilité
        self._bond_quality_raw: Dict[int, float] = {}
        self._bond_quality_meta: Dict[int, Dict] = {}
        self._ter_confidence: Dict[int, str] = {}
        # v2.4.4 FIX: Utilise Set au lieu de List pour éviter doublons
        self._missing_critical_fields: Dict[int, Set[str]] = {}
        
        # v1.3: TOUJOURS appeler _build_lookups
        self._build_lookups()
    
    def _build_lookups(self):
        """Construit les lookups pour le scoring tactique."""
        if "sectors" in self.market_context:
            self._sector_lookup = _build_sector_lookup(self.market_context["sectors"])
        if "indices" in self.market_context:
            self._country_lookup = _build_country_lookup(self.market_context["indices"])
    
        # v1.3 FIX: deepcopy TOUJOURS pour éviter mutation du global
        tilts_src = self.market_context.get("macro_tilts") or DEFAULT_MACRO_TILTS
        self._macro_tilts = copy.deepcopy(tilts_src)
        
        # v2.4.6: Normaliser les tilts vers format RADAR
        if self._macro_tilts:
            self._macro_tilts = {
                "favored_sectors": _normalize_tilts_list(
                    self._macro_tilts.get("favored_sectors", []),
                    normalize_sector_for_tilts
                ),
                "avoided_sectors": _normalize_tilts_list(
                    self._macro_tilts.get("avoided_sectors", []),
                    normalize_sector_for_tilts
                ),
                "favored_regions": _normalize_tilts_list(
                    self._macro_tilts.get("favored_regions", []),
                    normalize_region_for_tilts
                ),
                "avoided_regions": _normalize_tilts_list(
                    self._macro_tilts.get("avoided_regions", []),
                    normalize_region_for_tilts
                ),
            }
            logger.debug(f"v2.4.6: Normalized macro_tilts: {self._macro_tilts}")
        
        # v3.0.1 FIX: Compute staleness SEULEMENT si context a des données
        loaded_at = self.market_context.get("loaded_at")
        self._market_context_age_days, self._market_context_stale = _get_market_context_age(loaded_at)
        
        # v3.0.1 FIX: Ne warning QUE si le context contient des données significatives
        # Un context vide n'est pas "stale", il est juste "not configured"
        has_data = _has_meaningful_context(self.market_context)
        
        if has_data and self._market_context_stale:
            logger.warning(
                f"Market context is stale: {self._market_context_age_days} days old "
                f"(threshold: {MARKET_CONTEXT_STALE_DAYS} days)"
            )
        elif not has_data:
            # Context vide = pas de warning, juste debug
            logger.debug("Market context is empty or default - no staleness check needed")
            # Marquer comme non-stale pour éviter les faux positifs
            self._market_context_stale = False
    
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
    def _rank_by_class(
        values: List[float],
        categories: List[str],
        min_samples: int = 5
    ) -> np.ndarray:
        """
        v3.0.0: Normalisation par RANG au sein de chaque classe d'actifs.
        
        Retourne un percentile normalisé dans [-1, +1] où:
        - -1 = pire rang (percentile 0)
        - +1 = meilleur rang (percentile 100)
        - 0 = rang médian (percentile 50)
        
        Avantages vs z-score:
        - Distribution uniforme garantie (pas de compression pour groupes homogènes)
        - Robuste aux outliers (pas besoin de winsorisation)
        - Interprétable: score = position relative dans le groupe
        
        Args:
            values: Liste des valeurs brutes
            categories: Liste des catégories (equity/etf/bond/crypto)
            min_samples: Nombre minimum d'éléments pour calculer les rangs
        
        Returns:
            Array de scores normalisés [-1, +1]
        """
        n = len(values)
        result = np.zeros(n)
        
        # Grouper par catégorie
        by_cat: Dict[str, List[int]] = defaultdict(list)
        for i, cat in enumerate(categories):
            by_cat[cat].append(i)
        
        for cat, indices in by_cat.items():
            if len(indices) < min_samples:
                # Pas assez d'échantillons → score neutre
                for i in indices:
                    result[i] = 0.0
                logger.debug(f"Rank {cat}: {len(indices)} samples < {min_samples} → neutral")
                continue
            
            # Extraire les valeurs du groupe
            group_values = np.array([values[i] for i in indices], dtype=float)
            group_values = np.nan_to_num(group_values, nan=0.0)
            
            # Calculer les rangs (1 = plus petit, n = plus grand)
            ranks = rankdata(group_values, method='average')
            
            # Convertir en percentile [0, 1]
            n_group = len(indices)
            percentiles = (ranks - 1) / (n_group - 1) if n_group > 1 else np.full_like(ranks, 0.5)
            
            # Normaliser vers [-1, +1]
            normalized = 2 * percentiles - 1
            
            for idx, norm_val in zip(indices, normalized):
                result[idx] = norm_val
            
            logger.debug(
                f"Rank {cat}: n={n_group}, "
                f"range=[{normalized.min():.2f}, {normalized.max():.2f}], "
                f"spread(p10-p90)={np.percentile(normalized, 90) - np.percentile(normalized, 10):.2f}"
            )
        
        return result
    
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
    
    @staticmethod
    def _normalize_by_class(
        values: List[float],
        categories: List[str],
        higher_is_better: bool = True,
        min_samples: int = 5
    ) -> np.ndarray:
        """
        v3.0.0: Wrapper de normalisation avec choix de méthode.
        
        Utilise rank normalization si USE_RANK_NORMALIZATION=True,
        sinon utilise z-score classique.
        
        Args:
            values: Liste des valeurs brutes
            categories: Liste des catégories
            higher_is_better: Si True, valeur élevée = bon score
                             Si False, valeur basse = bon score (ex: volatilité)
            min_samples: Nombre minimum d'éléments par groupe
        
        Returns:
            Array de scores normalisés
        """
        if USE_RANK_NORMALIZATION:
            scores = FactorScorer._rank_by_class(values, categories, min_samples)
        else:
            scores = FactorScorer._zscore_by_class(values, categories, min_samples)
        
        # Inverser si lower is better
        if not higher_is_better:
            scores = -scores
        
        return scores
    
    def _get_normalized_category(self, asset: dict) -> str:
        """v2.4.7: Normalise catégorie avec détection ETF."""
        return normalize_category(
            asset.get("category", ""),
            asset.get("fund_type", ""),
            asset.get("etf_type", ""),
            asset.get("sector_bucket", "")
        )
        
    # ============= v2.4.6 ETF RADAR HELPERS =============
    
    def _get_sector_for_tilt(self, asset: dict) -> str:
        """v2.4.6: Extrait le secteur pour le tilt RADAR."""
        cat = self._get_normalized_category(asset)
        
        if cat == "etf":
            bucket = asset.get("sector_bucket", "")
            if bucket in NON_TILTABLE_BUCKETS:
                return ""
            if not asset.get("sector_signal_ok", False):
                return ""
            
            sector_top = asset.get("sector_top", {})
            if isinstance(sector_top, dict):
                sector_raw = sector_top.get("sector", "")
                return SECTOR_MAPPING_ETF.get(sector_raw, sector_raw)
            elif isinstance(sector_top, str):
                return SECTOR_MAPPING_ETF.get(sector_top, sector_top)
            return ""
        
        elif cat == "equity":
            return asset.get("sector_top", "") or asset.get("sector", "")
        
        return ""
    
    def _get_region_for_tilt(self, asset: dict) -> str:
        """v2.4.6: Extrait la région pour le tilt RADAR (désactivé pour ETFs)."""
        cat = self._get_normalized_category(asset)
        
        if cat == "etf":
            # PAS DE TILT GÉO pour ETFs (domicile ≠ exposition)
            return ""
        elif cat == "equity":
            return asset.get("country_top", "") or asset.get("country", "")
        
        return ""    
    
    def compute_factor_momentum(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur momentum: Jegadeesh-Titman 12m-1m (académique).
        
        v3.0.0: Utilise _normalize_by_class() avec rank normalization
        v2.5.0: Implémente le vrai momentum académique 12m-1m
        - Formule: (1+R12)/(1+R1) - 1 (pas une simple soustraction)
        - Exclut le dernier mois pour éviter l'effet reversal court-terme
        
        Référence: Jegadeesh & Titman (1993)
        """
        n = len(assets)
        
        # Récupération des données de performance
        p12m = [fnum(a.get("one_year_return_pct") or a.get("perf_12m") or a.get("one_year_return")) for a in assets]
        p1m = [fnum(a.get("perf_1m")) for a in assets]
        p3m = [fnum(a.get("perf_3m")) for a in assets]
        ytd = [fnum(a.get("ytd")) for a in assets]
        
        has_12m = any(p12m)
        has_1m = any(p1m)
        has_3m = any(p3m)
        
        def mom_12m_1m(r12: float, r1: float) -> float:
            """
            Calcule le momentum 12m-1m avec la formule correcte.
            R_{2-12} = (1 + R_{12}) / (1 + R_{1}) - 1
            où r12 et r1 sont en % (ex: 12.3 pour 12.3%)
            """
            if r1 <= -99:  # Protection division par zéro
                return r12
            return ((1 + r12/100) / (1 + r1/100) - 1) * 100
        
        # Cascade de fallbacks selon disponibilité
        if has_12m and has_1m:
            # ✅ Momentum académique Jegadeesh-Titman: 12m-1m
            raw = [mom_12m_1m(p12m[i], p1m[i]) for i in range(n)]
            logger.debug("Momentum: using 12m-1m (Jegadeesh-Titman)")
        elif has_12m:
            raw = [p12m[i] for i in range(n)]
            logger.debug("Momentum: using 12m only")
        elif has_3m and has_1m:
            # 3m-1m (version courte)
            raw = [mom_12m_1m(p3m[i], p1m[i]) for i in range(n)]
            logger.debug("Momentum: using 3m-1m")
        elif has_3m:
            raw = [p3m[i] for i in range(n)]
            logger.debug("Momentum: using 3m only")
        elif has_1m:
            raw = [0.6 * p1m[i] + 0.4 * ytd[i] for i in range(n)]
            logger.debug("Momentum: using 1m + YTD fallback")
        else:
            p7d = [fnum(a.get("perf_7d")) for a in assets]
            p24h = [fnum(a.get("perf_24h")) for a in assets]
            raw = [0.7 * p7d[i] + 0.3 * p24h[i] for i in range(n)]
            logger.debug("Momentum: using 7d/24h crypto fallback")
        
        for i, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            if cat == "crypto":
                # 1. Sharpe bonus (existant)
                sharpe = fnum(a.get("sharpe_ratio", 0))
                sharpe_bonus = max(-20, min(20, sharpe * 10))
                
                # 2. NOUVEAU: ret_90d bonus/malus
                ret_90d = fnum(a.get("ret_90d_pct") or a.get("perf_3m") or 0)
                if ret_90d > 0:
                    ret_bonus = 15
                elif ret_90d > -15:
                    ret_bonus = 10
                elif ret_90d > -25:
                    ret_bonus = 0
                elif ret_90d > -35:
                    ret_bonus = -10
                elif ret_90d > -45:
                    ret_bonus = -20
                else:
                    ret_bonus = -30
                
                # 3. NOUVEAU v2.6: drawdown penalty (seuils abaissés - ChatGPT review)
                dd = abs(fnum(a.get("drawdown_90d_pct") or a.get("maxdd90") or 0))
                if dd > 50:
                    dd_penalty = -20
                elif dd > 40:
                    dd_penalty = -15
                elif dd > 30:
                    dd_penalty = -10
                elif dd > 25:
                    dd_penalty = -5
                else:
                    dd_penalty = 0
                
                raw[i] += sharpe_bonus + ret_bonus + dd_penalty
        
        categories = [self._get_normalized_category(a) for a in assets]
        # v3.0.0: Utilise _normalize_by_class avec higher_is_better=True
        return self._normalize_by_class(raw, categories, higher_is_better=True)
    
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
        """
        Facteur low volatility avec vol_30d_annual_pct pour crypto.
        
        v4.1.0: Utilise _get_vol_for_scoring aligné avec optimizer v6.28
        v3.0.0: Utilise _normalize_by_class avec higher_is_better=False
        (volatilité basse = meilleur score)
        """
        raw_vol = []
        categories = []
        
        for idx, a in enumerate(assets):
            cat = self._get_normalized_category(a)
            categories.append(cat)
            symbol = a.get("symbol", a.get("id", "?"))
            
            # v4.1.0 FIX: Utilise _get_vol_for_scoring aligné avec optimizer v6.28
            vol = _get_vol_for_scoring(a, cat)
            
            if vol is None or vol <= 0:
                vol = MISSING_VOL_PENALTY.get(cat, 30.0)
                logger.debug(f"low_vol: missing vol for {symbol} ({cat}) → penalty {vol}")
                # v2.4.4: Utilise _track_missing
                self._track_missing(idx, "vol")
            
            raw_vol.append(vol)
        
        # v3.0.0: Utilise _normalize_by_class avec higher_is_better=False
        # (volatilité basse = meilleur score)
        return self._normalize_by_class(raw_vol, categories, higher_is_better=False)
        
        # v3.0.0: Utilise _normalize_by_class avec higher_is_better=False
        # (volatilité basse = meilleur score)
        return self._normalize_by_class(raw_vol, categories, higher_is_better=False)
    
    def compute_factor_cost_efficiency(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur coût/rendement pour ETF et Bonds.
        
        v3.0.0: Utilise _normalize_by_class avec higher_is_better=True
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
            # v3.0.0: Utilise _normalize_by_class avec higher_is_better=True
            normalized = self._normalize_by_class(valid_scores, valid_cats, higher_is_better=True)
            for idx, norm_val in zip(valid_indices, normalized):
                result[idx] = norm_val
        
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
            # v4.1.0 FIX: Utilise _get_vol_for_scoring aligné avec optimizer v6.28
            vol = _get_vol_for_scoring(a, "bond")
            
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
        """
        Facteur contexte tactique avec z-score par classe.
        
        v3.0.0: Utilise _normalize_by_class avec higher_is_better=True
        v2.4.6 FIX: Utilise _get_sector_for_tilt() et _get_region_for_tilt() helpers.
        v2.4.5 FIX: Normalise secteurs et régions AVANT comparaison avec macro_tilts.
        """
        if not self._sector_lookup and not self._country_lookup and not self._macro_tilts:
            logger.warning("tactical_context: no lookups AND no macro_tilts → skipping")
            return np.zeros(len(assets))
        
        scores = []
        categories = []
        
        for a in assets:
            # v2.4.6: Utiliser les helpers pour extraction secteur/région
            sector_for_tilt = self._get_sector_for_tilt(a)
            region_for_tilt = self._get_region_for_tilt(a)
            categories.append(self._get_normalized_category(a))
            
            components = []
            weights = []
            
            # 1. Score secteur basé sur données marché
            if self._sector_lookup and sector_for_tilt:
                sector_key = SECTOR_KEY_MAPPING.get(sector_for_tilt.strip())
                if sector_key and sector_key in self._sector_lookup:
                    ref = self._sector_lookup[sector_key]
                    ytd = ref.get("ytd_num", 0) or 0
                    daily = ref.get("change_num", 0) or 0
                    raw = 0.7 * (ytd / 25.0) + 0.3 * (daily / 2.0)
                    raw = max(-1.0, min(1.0, raw))
                    f_sector = 0.5 * (raw + 1.0)
                    components.append(f_sector)
                    weights.append(0.4)
            
            # 2. Score région basé sur indices
            if self._country_lookup and region_for_tilt:
                norm_country = COUNTRY_NORMALIZATION.get(region_for_tilt.strip(), region_for_tilt.strip())
                if norm_country in self._country_lookup:
                    ref = self._country_lookup[norm_country]
                    ytd = ref.get("ytd_num", 0) or ref.get("_ytd_value", 0) or 0
                    daily = ref.get("change_num", 0) or ref.get("_change_value", 0) or 0
                    raw = 0.7 * (ytd / 25.0) + 0.3 * (daily / 2.0)
                    raw = max(-1.0, min(1.0, raw))
                    f_region = 0.5 * (raw + 1.0)
                    components.append(f_region)
                    weights.append(0.3)
            
            # 3. Score macro tilts (RADAR) - v2.4.6 FIX: NORMALISER AVANT MATCHING
            if self._macro_tilts:
                f_macro = 0.5
                
                # v2.4.6 FIX: Normaliser secteur et région vers format RADAR
                sector_normalized = normalize_sector_for_tilts(sector_for_tilt)
                region_normalized = normalize_region_for_tilts(region_for_tilt)
                
                favored_sectors = self._macro_tilts.get("favored_sectors", [])
                avoided_sectors = self._macro_tilts.get("avoided_sectors", [])
                favored_regions = self._macro_tilts.get("favored_regions", [])
                avoided_regions = self._macro_tilts.get("avoided_regions", [])
                
                # v2.4.6: Boost/malus secteur avec normalisation
                sector_tilt = "neutral"
                if sector_normalized and sector_normalized in favored_sectors:
                    f_macro += 0.2
                    sector_tilt = "favored"
                    logger.debug(f"RADAR sector boost: {sector_for_tilt} → {sector_normalized} in favored")
                elif sector_normalized and sector_normalized in avoided_sectors:
                    f_macro -= 0.2
                    sector_tilt = "avoided"
                    logger.debug(f"RADAR sector penalty: {sector_for_tilt} → {sector_normalized} in avoided")
                
                # v2.4.6: Boost/malus région avec normalisation
                region_tilt = "neutral"
                if region_normalized and region_normalized in favored_regions:
                    f_macro += 0.15
                    region_tilt = "favored"
                    logger.debug(f"RADAR region boost: {region_for_tilt} → {region_normalized} in favored")
                elif region_normalized and region_normalized in avoided_regions:
                    f_macro -= 0.15
                    region_tilt = "avoided"
                    logger.debug(f"RADAR region penalty: {region_for_tilt} → {region_normalized} in avoided")
                
                f_macro = max(0.0, min(1.0, f_macro))
                components.append(f_macro)
                weights.append(0.3)
                
                # v2.4.6: Stocker les détails du matching pour debug/traçabilité
                a["_radar_matching"] = {
                    "sector_raw": sector_for_tilt,
                    "sector_normalized": sector_normalized,
                    "sector_in_favored": sector_normalized in favored_sectors if sector_normalized else False,
                    "sector_in_avoided": sector_normalized in avoided_sectors if sector_normalized else False,
                    "sector_tilt": sector_tilt,
                    "region_raw": region_for_tilt,
                    "region_normalized": region_normalized,
                    "region_in_favored": region_normalized in favored_regions if region_normalized else False,
                    "region_in_avoided": region_normalized in avoided_regions if region_normalized else False,
                    "region_tilt": region_tilt,
                    "f_macro_final": round(f_macro, 3),
                }
            
            if components and sum(weights) > 0:
                tactical_score = sum(c * w for c, w in zip(components, weights)) / sum(weights)
            else:
                tactical_score = 0.5
            
            scores.append(tactical_score * 100)
        
        # v3.0.0: Utilise _normalize_by_class avec higher_is_better=True
        return self._normalize_by_class(scores, categories, higher_is_better=True)
    
    def compute_factor_liquidity(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur liquidité: log(market_cap ou AUM).
        
        v3.0.0: Utilise _normalize_by_class avec higher_is_better=True
        """
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
        
        # v3.0.0: Utilise _normalize_by_class avec higher_is_better=True
        return self._normalize_by_class(raw_liq, categories, higher_is_better=True)
    
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
        
        v4.0.0: Mode equity_scoring_mode pour déléguer scoring equity à preset_meta.
        v3.0.0: Rank normalization pour meilleure distribution des scores.
        v2.4.5: Fix RADAR tilts + tracking _radar_matching.
        v2.4.4: Fix doublons + cap pénalité + staleness.
        """
        if not assets:
            return assets
        
        # Reset tracking dicts
        self._missing_critical_fields = {}  # v2.4.4: Dict[int, Set[str]]
        self._ter_confidence = {}
        self._bond_quality_raw = {}
        self._bond_quality_meta = {}
        
        # v4.0.0: Log du mode equity
        logger.info(f"[FactorScorer] equity_scoring_mode = {self.equity_scoring_mode}")
        
        n = len(assets)
        categories = [self._get_normalized_category(a) for a in assets]
        from collections import Counter
        cat_counts = Counter(categories)
        print(f"[DIAG] Scoring {len(assets)} assets")
        print(f"[DIAG] Categories: {dict(cat_counts)}")
        for cat, count in cat_counts.items():
            if count < 5:
                print(f"[DIAG] ⚠️ Catégorie '{cat}' = {count} éléments (< 5)")
        
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
            
            # v4.0.0: Si mode="preset" et catégorie equity → skip composite_score
            # preset_meta.py calculera _profile_score
            if cat == "equity" and self.equity_scoring_mode == "preset":
                # On garde composite[i] = 0, buffett_score sera calculé plus bas
                continue
            
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
            cat = categories[i]
            
            # v4.0.0: Toujours calculer buffett_score pour equity (utilisé par preset_meta)
            if cat == "equity":
                asset["buffett_score"] = compute_buffett_quality_score(asset)
            
            # v4.0.0: Si mode="preset" et equity → PAS de composite_score
            if cat == "equity" and self.equity_scoring_mode == "preset":
                asset["factor_scores"] = {}  # Vide car non calculé
                asset["composite_score"] = None  # Explicitement None
                asset["score"] = None
                asset["_scoring_meta"] = {
                    "category_normalized": cat,
                    "scoring_version": "v4.1.0",
                    "equity_scoring_mode": self.equity_scoring_mode,
                    "note": "composite_score skipped - preset_meta handles equity scoring",
                    "buffett_score_computed": True,
                }
                continue  # Passer à l'asset suivant
            
            # Comportement normal pour non-equity ou mode != "preset"
            asset["factor_scores"] = {
                name: round(float(values[i]), 3)
                for name, values in factors.items()
            }
            asset["composite_score"] = round(float(composite[i]), 3)
            asset["score"] = asset["composite_score"]
            
            # v2.4.4: Conversion set → sorted list pour JSON
            missing_fields_set = self._missing_critical_fields.get(i, set())
            missing_fields_list = sorted(list(missing_fields_set))
            
            # v3.0.0: Stockage complet dans _scoring_meta avec info rank normalization
            asset["_scoring_meta"] = {
                "category_normalized": cat,
                "category_original": asset.get("category", ""),
                "fund_type": asset.get("fund_type", ""),
                "applicable_factors": FACTORS_BY_CATEGORY.get(cat, []),
                "scoring_version": "v4.1.0",
                "normalization_method": "rank" if USE_RANK_NORMALIZATION else "zscore",
                "equity_scoring_mode": self.equity_scoring_mode,
                "ter_confidence": self._ter_confidence.get(i),
                "missing_critical_fields": missing_fields_list,
                "missing_fields_count": len(missing_fields_list),
                "data_quality_penalty_applied": len(missing_fields_list) > 0,
                "data_quality_penalty_value": round(min(DATA_QUALITY_PENALTY * len(missing_fields_list), MAX_DQ_PENALTY), 3) if missing_fields_list else 0,
                # v2.4.4: Market context staleness
                "market_context_age_days": self._market_context_age_days,
                "market_context_stale": self._market_context_stale,
            }
            
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
        
        # v2.4.5: Log RADAR tilts summary
        radar_favored_count = sum(1 for a in assets if a.get("_radar_matching", {}).get("sector_tilt") == "favored" or a.get("_radar_matching", {}).get("region_tilt") == "favored")
        radar_avoided_count = sum(1 for a in assets if a.get("_radar_matching", {}).get("sector_tilt") == "avoided" or a.get("_radar_matching", {}).get("region_tilt") == "avoided")
        logger.info(f"RADAR tilts applied: {radar_favored_count} favored, {radar_avoided_count} avoided (out of {n} assets)")
        
        # Log data quality summary
        incomplete_count = sum(1 for i in range(n) if self._missing_critical_fields.get(i))
        if incomplete_count > 0:
            logger.warning(f"Data quality: {incomplete_count}/{n} assets have missing critical fields")
        
        # v4.0.0: Log avec mode equity
        norm_method = "RANK" if USE_RANK_NORMALIZATION else "Z-SCORE"
        logger.info(
            f"Scores v4.0.0 calculés: {n} actifs (profil {self.profile}, norm={norm_method}, equity_mode={self.equity_scoring_mode}) | "
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
        "Comparaison des poids factoriels par profil (v3.0.1):",
        "",
        "v3.0.1: FIX stale context warning + RANK NORMALIZATION",
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
# =============================================================================
# v1.3: RADAR BONUS HELPER (pour tie-breaker dans universe.py)
# =============================================================================

def compute_radar_bonus_from_matching(
    asset: dict,
    cap: float = 0.03,
    sector_trust_threshold: float = 0.6
) -> Tuple[float, Dict[str, Any]]:
    """
    Calcule le bonus RADAR à partir du _radar_matching existant.
    
    Ne recalcule PAS les tilts - utilise ce qui a été calculé par FactorScorer.
    Cela garantit la cohérence entre scoring et tie-breaker.
    
    Args:
        asset: Dictionnaire de l'actif avec _radar_matching
        cap: Bonus maximum (±cap)
        sector_trust_threshold: Seuil en dessous duquel on ignore le tilt ETF
        
    Returns:
        (bonus, metadata) où bonus est dans [-cap, +cap]
    """
    matching = asset.get("_radar_matching") or {}
    
    if not matching:
        return 0.0, {"reason": "no_radar_matching", "bonus": 0.0}
    
    # ETF: si sector_trust faible, ignorer (évite faux positifs type AAAU)
    sector_trust = asset.get("sector_trust")
    if sector_trust is not None and sector_trust < sector_trust_threshold:
        return 0.0, {
            "reason": "low_sector_trust", 
            "sector_trust": sector_trust,
            "threshold": sector_trust_threshold,
            "bonus": 0.0
        }
    
    # Calculer les "units" de bonus
    units = 0
    
    sector_tilt = matching.get("sector_tilt", "neutral")
    if sector_tilt == "favored":
        units += 1
    elif sector_tilt == "avoided":
        units -= 1
    
    # Région uniquement pour actions (ETFs n'ont pas de tilt géo fiable)
    category = asset.get("category", "").lower()
    region_tilt = matching.get("region_tilt", "neutral")
    
    if category == "equity":
        if region_tilt == "favored":
            units += 1
        elif region_tilt == "avoided":
            units -= 1
    
    # 1 unit = cap/2, 2 units = cap (max)
    unit_value = cap / 2.0
    bonus = max(-cap, min(cap, units * unit_value))
    
    metadata = {
        "units": units,
        "bonus": round(bonus, 6),
        "cap": cap,
        "sector_tilt": sector_tilt,
        "region_tilt": region_tilt if category == "equity" else "n/a (etf)",
        "category": category,
    }
    
    return bonus, metadata    


# ============= MAIN (pour test) =============

if __name__ == "__main__":
    # v4.0.0: Test EQUITY_SCORING_MODE
    print("=" * 60)
    print("Test v4.0.0: EQUITY_SCORING_MODE...")
    print("=" * 60)
    
    test_equity = {"symbol": "TEST", "category": "equity", "roe": 20, "sector": "Technology"}
    test_etf = {"symbol": "SPY", "category": "etf", "ytd": 15, "vol_3y": 18}
    
    # Mode preset (défaut)
    scorer_preset = FactorScorer("Modéré", config={"equity_scoring_mode": "preset"})
    result_preset = scorer_preset.compute_scores([test_equity, test_etf])
    
    print(f"\nMode 'preset':")
    print(f"  Equity composite_score: {result_preset[0].get('composite_score')}")
    print(f"  Equity buffett_score: {result_preset[0].get('buffett_score')}")
    print(f"  ETF composite_score: {result_preset[1].get('composite_score')}")
    
    assert result_preset[0].get("composite_score") is None, "Equity should have no composite_score in preset mode"
    assert result_preset[0].get("buffett_score") is not None, "Equity should have buffett_score"
    assert result_preset[1].get("composite_score") is not None, "ETF should have composite_score"
    
    print("✅ Mode 'preset' OK")
    
    # Mode factors (ancien comportement)
    scorer_factors = FactorScorer("Modéré", config={"equity_scoring_mode": "factors"})
    result_factors = scorer_factors.compute_scores([test_equity.copy(), test_etf.copy()])
    
    print(f"\nMode 'factors':")
    print(f"  Equity composite_score: {result_factors[0].get('composite_score')}")
    
    assert result_factors[0].get("composite_score") is not None, "Equity should have composite_score in factors mode"
    
    print("✅ Mode 'factors' OK")
    print("\n" + "=" * 60)
    print(compare_factor_profiles())
    print("\n" + "=" * 60)
    print("Test v3.0.1: STALE CONTEXT FIX + RANK NORMALIZATION...")
    
    # Test _has_meaningful_context
    print("\n--- Test _has_meaningful_context() ---")
    
    empty_ctx = {}
    default_ctx = {"macro_tilts": DEFAULT_MACRO_TILTS}
    data_ctx = {"sectors": {"tech": [{"name": "Tech"}]}, "loaded_at": datetime.now().isoformat()}
    
    print(f"Empty context: {_has_meaningful_context(empty_ctx)}")  # False
    print(f"Default tilts only: {_has_meaningful_context(default_ctx)}")  # False
    print(f"With sectors data: {_has_meaningful_context(data_ctx)}")  # True
    
    # Test _rank_by_class
    print("\n--- Test _rank_by_class() ---")
    test_values = [10, 20, 30, 40, 50, 15, 25, 35, 45, 55]
    test_cats = ["equity"] * 5 + ["etf"] * 5
    
    ranks = FactorScorer._rank_by_class(test_values, test_cats)
    print(f"Values: {test_values}")
    print(f"Categories: {test_cats}")
    print(f"Ranks: {[round(r, 2) for r in ranks]}")
    
    # Vérification: distribution uniforme dans [-1, +1]
    equity_ranks = ranks[:5]
    etf_ranks = ranks[5:]
    print(f"Equity ranks range: [{min(equity_ranks):.2f}, {max(equity_ranks):.2f}]")
    print(f"ETF ranks range: [{min(etf_ranks):.2f}, {max(etf_ranks):.2f}]")
    
    # Test avec groupes homogènes (cas problématique pour z-score)
    print("\n--- Test avec groupes homogènes (mega-caps similaires) ---")
    homogeneous_values = [98, 99, 100, 101, 102]  # Valeurs très proches
    homogeneous_cats = ["equity"] * 5
    
    zscore_result = FactorScorer._zscore_by_class(homogeneous_values, homogeneous_cats)
    rank_result = FactorScorer._rank_by_class(homogeneous_values, homogeneous_cats)
    
    print(f"Values (homogeneous): {homogeneous_values}")
    print(f"Z-scores: {[round(z, 2) for z in zscore_result]}")
    print(f"Ranks: {[round(r, 2) for r in rank_result]}")
    print(f"Z-score spread (p90-p10): {np.percentile(zscore_result, 90) - np.percentile(zscore_result, 10):.2f}")
    print(f"Rank spread (p90-p10): {np.percentile(rank_result, 90) - np.percentile(rank_result, 10):.2f}")
    
    # Test _normalize_by_class avec higher_is_better
    print("\n--- Test _normalize_by_class() avec higher_is_better ---")
    vol_values = [10, 20, 30, 40, 50]  # Volatilité (lower is better)
    vol_cats = ["equity"] * 5
    
    higher_better = FactorScorer._normalize_by_class(vol_values, vol_cats, higher_is_better=True)
    lower_better = FactorScorer._normalize_by_class(vol_values, vol_cats, higher_is_better=False)
    
    print(f"Vol values: {vol_values}")
    print(f"higher_is_better=True: {[round(v, 2) for v in higher_better]}")
    print(f"higher_is_better=False: {[round(v, 2) for v in lower_better]}")
    
    # Test complet avec assets
    print("\n--- Test scoring complet ---")
    test_assets = [
        {"symbol": "NVDA", "category": "equity", "sector": "Technology", "ytd": 150, "perf_1m": 10, "vol_3y": 45, "roe": 50, "market_cap": 3000e9},
        {"symbol": "AAPL", "category": "equity", "sector": "Technology", "ytd": 25, "perf_1m": 3, "vol_3y": 25, "roe": 160, "market_cap": 3500e9},
        {"symbol": "MSFT", "category": "equity", "sector": "Technology", "ytd": 15, "perf_1m": 2, "vol_3y": 22, "roe": 40, "market_cap": 3200e9},
        {"symbol": "GOOGL", "category": "equity", "sector": "Technology", "ytd": 35, "perf_1m": 5, "vol_3y": 28, "roe": 30, "market_cap": 2000e9},
        {"symbol": "META", "category": "equity", "sector": "Technology", "ytd": 60, "perf_1m": 8, "vol_3y": 38, "roe": 35, "market_cap": 1500e9},
    ]
    
    scorer = FactorScorer("Modéré")
    scored = scorer.compute_scores(test_assets)
    
    print("\nRésultats:")
    for a in sorted(scored, key=lambda x: x["composite_score"], reverse=True):
        meta = a.get("_scoring_meta", {})
        print(f"  {a['symbol']}: score={a['composite_score']:.3f} (norm={meta.get('normalization_method', 'unknown')})")
        print(f"    momentum={a['factor_scores']['momentum']:.2f}, low_vol={a['factor_scores']['low_vol']:.2f}")
    
    print("\n✅ v3.0.1 STALE CONTEXT FIX + RANK NORMALIZATION test completed!")
    print(f"   Normalization method: {'RANK' if USE_RANK_NORMALIZATION else 'Z-SCORE'}")
