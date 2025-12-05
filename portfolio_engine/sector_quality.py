# portfolio_engine/sector_quality.py
"""
Buffett-style Sector Quality Filter
====================================

Filtre fondamental inspiré des critères Buffett avec seuils ajustés par secteur.
Les REIT, banques et utilities ont des profils de dette/payout différents des techs.

Métriques utilisées (depuis stocks JSON):
- roe : Return on Equity (%)
- de_ratio : Debt-to-Equity ratio
- payout_ratio_ttm : Payout ratio TTM (%)
- volatility_3y : Volatilité 3 ans (%)
- max_drawdown_ytd : Drawdown max YTD (%)
- dividend_coverage : Couverture dividende

Logique:
1. Mapping secteur français → clé normalisée
2. Calcul stats sectorielles (médianes)
3. Hard filter optionnel (rejette si hors limites absolues)
4. Soft penalty scoring (pénalise sans rejeter)
"""

import logging
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from collections import defaultdict

logger = logging.getLogger("portfolio_engine.sector_quality")


# ============= MAPPING SECTEURS =============

SECTOR_MAPPING = {
    # Tech
    "technologie de l'information": "tech",
    "technology": "tech",
    "information technology": "tech",
    "tech": "tech",
    "software": "tech",
    "semiconductors": "tech",
    
    # Finance
    "finance": "finance",
    "financials": "finance",
    "services financiers": "finance",
    "banque": "finance",
    "banking": "finance",
    "insurance": "finance",
    "assurance": "finance",
    
    # Real Estate
    "immobilier": "real_estate",
    "real estate": "real_estate",
    "reit": "real_estate",
    "reits": "real_estate",
    
    # Healthcare
    "santé": "healthcare",
    "healthcare": "healthcare",
    "health care": "healthcare",
    "pharmaceuticals": "healthcare",
    "biotechnology": "healthcare",
    
    # Consumer
    "consommation discrétionnaire": "consumer_discretionary",
    "consumer discretionary": "consumer_discretionary",
    "consommation de base": "consumer_staples",
    "consumer staples": "consumer_staples",
    "retail": "consumer_discretionary",
    
    # Industrial
    "industrie": "industrial",
    "industrials": "industrial",
    "industrial": "industrial",
    "materials": "industrial",
    "matériaux": "industrial",
    
    # Energy
    "énergie": "energy",
    "energy": "energy",
    "oil & gas": "energy",
    "pétrole": "energy",
    
    # Utilities
    "services aux collectivités": "utilities",
    "utilities": "utilities",
    "services publics": "utilities",
    
    # Communication
    "communication": "communication",
    "communication services": "communication",
    "télécommunications": "communication",
    "telecom": "communication",
}


# ============= PROFILS SECTORIELS =============

SECTOR_PROFILES = {
    # Tech : ROE élevé attendu, dette faible, payout faible (réinvestissement)
    "tech": {
        "roe_soft": 12,      # Pénalité si ROE < 12%
        "roe_hard": 5,       # Rejet si ROE < 5%
        "de_soft": 80,       # Pénalité si D/E > 80%
        "de_hard": 200,      # Rejet si D/E > 200%
        "payout_soft": 50,   # Pénalité si payout > 50%
        "payout_hard": 80,   # Rejet si payout > 80%
        "vol_soft": 35,      # Pénalité si vol > 35%
        "vol_hard": 70,      # Rejet si vol > 70%
        "dd_soft": 30,       # Pénalité si DD > 30%
        "dd_hard": 50,       # Rejet si DD > 50%
    },
    
    # Finance : ROE modéré acceptable, D/E élevé normal (levier bancaire)
    "finance": {
        "roe_soft": 8,
        "roe_hard": 4,
        "de_soft": None,     # Pas de limite D/E pour banques
        "de_hard": None,
        "payout_soft": 60,
        "payout_hard": 90,
        "vol_soft": 30,
        "vol_hard": 55,
        "dd_soft": 35,
        "dd_hard": 55,
    },
    
    # Real Estate : ROE faible acceptable, D/E élevé normal, payout très élevé (REIT)
    "real_estate": {
        "roe_soft": 5,
        "roe_hard": 2,
        "de_soft": 150,
        "de_hard": 350,
        "payout_soft": 85,   # REITs distribuent 90%+
        "payout_hard": 120,  # Peut dépasser 100% temporairement
        "vol_soft": 25,
        "vol_hard": 50,
        "dd_soft": 30,
        "dd_hard": 50,
    },
    
    # Healthcare : ROE variable (biotech vs pharma), dette modérée
    "healthcare": {
        "roe_soft": 10,
        "roe_hard": 3,
        "de_soft": 100,
        "de_hard": 250,
        "payout_soft": 55,
        "payout_hard": 85,
        "vol_soft": 30,
        "vol_hard": 60,
        "dd_soft": 30,
        "dd_hard": 50,
    },
    
    # Consumer Discretionary : Cyclique, ROE variable
    "consumer_discretionary": {
        "roe_soft": 10,
        "roe_hard": 3,
        "de_soft": 120,
        "de_hard": 250,
        "payout_soft": 50,
        "payout_hard": 80,
        "vol_soft": 30,
        "vol_hard": 55,
        "dd_soft": 35,
        "dd_hard": 55,
    },
    
    # Consumer Staples : Stable, ROE correct attendu
    "consumer_staples": {
        "roe_soft": 12,
        "roe_hard": 6,
        "de_soft": 100,
        "de_hard": 200,
        "payout_soft": 65,
        "payout_hard": 90,
        "vol_soft": 20,
        "vol_hard": 40,
        "dd_soft": 25,
        "dd_hard": 40,
    },
    
    # Industrial : Cyclique, capital-intensive
    "industrial": {
        "roe_soft": 10,
        "roe_hard": 4,
        "de_soft": 120,
        "de_hard": 280,
        "payout_soft": 50,
        "payout_hard": 80,
        "vol_soft": 28,
        "vol_hard": 50,
        "dd_soft": 30,
        "dd_hard": 50,
    },
    
    # Energy : Très cyclique, dette variable
    "energy": {
        "roe_soft": 8,
        "roe_hard": 2,
        "de_soft": 80,
        "de_hard": 200,
        "payout_soft": 50,
        "payout_hard": 85,
        "vol_soft": 35,
        "vol_hard": 65,
        "dd_soft": 40,
        "dd_hard": 60,
    },
    
    # Utilities : Stable, dette élevée normale, payout élevé
    "utilities": {
        "roe_soft": 8,
        "roe_hard": 4,
        "de_soft": 150,
        "de_hard": 300,
        "payout_soft": 75,
        "payout_hard": 100,
        "vol_soft": 18,
        "vol_hard": 35,
        "dd_soft": 20,
        "dd_hard": 40,
    },
    
    # Communication : Mix tech/media
    "communication": {
        "roe_soft": 10,
        "roe_hard": 4,
        "de_soft": 100,
        "de_hard": 220,
        "payout_soft": 55,
        "payout_hard": 85,
        "vol_soft": 28,
        "vol_hard": 50,
        "dd_soft": 30,
        "dd_hard": 50,
    },
    
    # Default : Profil conservateur
    "_default": {
        "roe_soft": 10,
        "roe_hard": 4,
        "de_soft": 100,
        "de_hard": 220,
        "payout_soft": 60,
        "payout_hard": 90,
        "vol_soft": 30,
        "vol_hard": 55,
        "dd_soft": 30,
        "dd_hard": 50,
    },
}


# ============= HELPERS =============

def safe_float(value: Any, default: float = 0.0) -> float:
    """Conversion robuste vers float, gère strings et None."""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            # Nettoyer la string
            cleaned = value.strip().replace(",", ".")
            cleaned = "".join(c for c in cleaned if c.isdigit() or c in ".-")
            if cleaned and cleaned not in ("-", ".", "-."):
                return float(cleaned)
        except (ValueError, TypeError):
            pass
    return default


def get_sector_key(sector: Optional[str]) -> str:
    """Normalise le secteur vers une clé du profil."""
    if not sector:
        return "_default"
    
    sector_lower = sector.lower().strip()
    
    # Recherche exacte
    if sector_lower in SECTOR_MAPPING:
        return SECTOR_MAPPING[sector_lower]
    
    # Recherche partielle
    for pattern, key in SECTOR_MAPPING.items():
        if pattern in sector_lower or sector_lower in pattern:
            return key
    
    return "_default"


def get_profile(sector: Optional[str]) -> Dict[str, Any]:
    """Retourne le profil sectoriel."""
    key = get_sector_key(sector)
    return SECTOR_PROFILES.get(key, SECTOR_PROFILES["_default"])


# ============= STATS SECTORIELLES =============

def enrich_with_sector_stats(assets: List[dict]) -> List[dict]:
    """
    Calcule les médianes sectorielles et ajoute les ratios relatifs.
    
    Ajoute à chaque asset:
    - _sector_key: Clé normalisée du secteur
    - _sector_median_roe: Médiane ROE du secteur
    - _sector_median_de: Médiane D/E du secteur
    - _sector_median_vol: Médiane vol du secteur
    - _roe_vs_sector: ROE / médiane secteur
    - _de_vs_sector: D/E / médiane secteur
    - _vol_vs_sector: Vol / médiane secteur
    """
    if not assets:
        return assets
    
    # Grouper par secteur
    by_sector = defaultdict(list)
    for a in assets:
        key = get_sector_key(a.get("sector"))
        by_sector[key].append(a)
    
    # Calculer médianes par secteur
    sector_medians = {}
    for key, group in by_sector.items():
        roes = [safe_float(a.get("roe")) for a in group if safe_float(a.get("roe")) > 0]
        des = [safe_float(a.get("de_ratio")) for a in group if safe_float(a.get("de_ratio")) >= 0]
        vols = [safe_float(a.get("volatility_3y") or a.get("vol_3y") or a.get("vol")) for a in group]
        vols = [v for v in vols if v > 0]
        
        sector_medians[key] = {
            "roe": np.median(roes) if len(roes) >= 3 else None,
            "de": np.median(des) if len(des) >= 3 else None,
            "vol": np.median(vols) if len(vols) >= 3 else None,
            "count": len(group),
        }
    
    # Médianes globales (fallback)
    all_roes = [safe_float(a.get("roe")) for a in assets if safe_float(a.get("roe")) > 0]
    all_des = [safe_float(a.get("de_ratio")) for a in assets if safe_float(a.get("de_ratio")) >= 0]
    all_vols = [safe_float(a.get("volatility_3y") or a.get("vol_3y") or a.get("vol")) for a in assets]
    all_vols = [v for v in all_vols if v > 0]
    
    global_medians = {
        "roe": np.median(all_roes) if all_roes else 12.0,
        "de": np.median(all_des) if all_des else 80.0,
        "vol": np.median(all_vols) if all_vols else 25.0,
    }
    
    # Enrichir chaque asset
    for a in assets:
        key = get_sector_key(a.get("sector"))
        a["_sector_key"] = key
        
        med = sector_medians.get(key, {})
        
        # Médianes (avec fallback global)
        med_roe = med.get("roe") or global_medians["roe"]
        med_de = med.get("de") or global_medians["de"]
        med_vol = med.get("vol") or global_medians["vol"]
        
        a["_sector_median_roe"] = med_roe
        a["_sector_median_de"] = med_de
        a["_sector_median_vol"] = med_vol
        
        # Ratios vs secteur
        roe = safe_float(a.get("roe"))
        de = safe_float(a.get("de_ratio"))
        vol = safe_float(a.get("volatility_3y") or a.get("vol_3y") or a.get("vol"))
        
        a["_roe_vs_sector"] = roe / med_roe if med_roe > 0 else 1.0
        a["_de_vs_sector"] = de / med_de if med_de > 0 else 1.0
        a["_vol_vs_sector"] = vol / med_vol if med_vol > 0 else 1.0
    
    logger.info(f"Stats sectorielles calculées pour {len(assets)} actifs ({len(by_sector)} secteurs)")
    return assets


# ============= FILTRAGE BUFFETT =============

def buffett_hard_filter(
    asset: dict,
    profile: Optional[Dict] = None,
    strict: bool = False
) -> Tuple[bool, Optional[str]]:
    """
    Filtre binaire : passe ou ne passe pas.
    
    Args:
        asset: Dict avec métriques
        profile: Profil sectoriel (auto-détecté si None)
        strict: Si True, rejette les données manquantes
    
    Returns:
        (True, None) si passe
        (False, raison) si rejeté
    """
    if profile is None:
        profile = get_profile(asset.get("sector"))
    
    # Extraction métriques
    roe = safe_float(asset.get("roe"))
    de = safe_float(asset.get("de_ratio"))
    payout = safe_float(asset.get("payout_ratio_ttm"))
    vol = safe_float(asset.get("volatility_3y") or asset.get("vol_3y") or asset.get("vol"))
    dd = abs(safe_float(asset.get("max_drawdown_ytd") or asset.get("max_dd")))
    
    # Mode strict : rejette si données manquantes
    if strict:
        if roe == 0:
            return False, "missing_roe"
        if de == 0 and profile.get("de_hard") is not None:
            return False, "missing_de"
    
    # Vérifications hard limits
    roe_hard = profile.get("roe_hard")
    if roe_hard is not None and roe > 0 and roe < roe_hard:
        return False, f"roe_below_{roe_hard}%"
    
    de_hard = profile.get("de_hard")
    if de_hard is not None and de > de_hard:
        return False, f"de_above_{de_hard}%"
    
    payout_hard = profile.get("payout_hard")
    if payout_hard is not None and payout > payout_hard:
        return False, f"payout_above_{payout_hard}%"
    
    vol_hard = profile.get("vol_hard")
    if vol_hard is not None and vol > vol_hard:
        return False, f"vol_above_{vol_hard}%"
    
    dd_hard = profile.get("dd_hard")
    if dd_hard is not None and dd > dd_hard:
        return False, f"dd_above_{dd_hard}%"
    
    return True, None


def compute_buffett_penalty(
    asset: dict,
    profile: Optional[Dict] = None
) -> float:
    """
    Calcule une pénalité normalisée [0, 1] basée sur les soft limits.
    0 = parfait, 1 = très mauvais
    
    Args:
        asset: Dict avec métriques
        profile: Profil sectoriel (auto-détecté si None)
    
    Returns:
        Float entre 0 et 1
    """
    if profile is None:
        profile = get_profile(asset.get("sector"))
    
    penalties = []
    
    # ROE : Pénalité si inférieur au soft
    roe = safe_float(asset.get("roe"))
    roe_soft = profile.get("roe_soft", 10)
    if roe > 0 and roe < roe_soft:
        # Plus le ROE est bas vs soft, plus la pénalité est haute
        pen = min(1.0, (roe_soft - roe) / roe_soft)
        penalties.append(pen)
    elif roe > 0:
        penalties.append(0.0)  # ROE OK
    # Si roe == 0, on ne pénalise pas (donnée manquante)
    
    # D/E : Pénalité si supérieur au soft
    de = safe_float(asset.get("de_ratio"))
    de_soft = profile.get("de_soft")
    if de_soft is not None and de > 0:
        if de > de_soft:
            pen = min(1.0, (de - de_soft) / de_soft)
            penalties.append(pen)
        else:
            penalties.append(0.0)
    
    # Payout : Pénalité si supérieur au soft
    payout = safe_float(asset.get("payout_ratio_ttm"))
    payout_soft = profile.get("payout_soft", 60)
    if payout > 0:
        if payout > payout_soft:
            pen = min(1.0, (payout - payout_soft) / payout_soft)
            penalties.append(pen)
        else:
            penalties.append(0.0)
    
    # Volatilité : Pénalité si supérieure au soft
    vol = safe_float(asset.get("volatility_3y") or asset.get("vol_3y") or asset.get("vol"))
    vol_soft = profile.get("vol_soft", 30)
    if vol > 0:
        if vol > vol_soft:
            pen = min(1.0, (vol - vol_soft) / vol_soft)
            penalties.append(pen)
        else:
            penalties.append(0.0)
    
    # Drawdown : Pénalité si supérieur au soft
    dd = abs(safe_float(asset.get("max_drawdown_ytd") or asset.get("max_dd")))
    dd_soft = profile.get("dd_soft", 30)
    if dd > 0:
        if dd > dd_soft:
            pen = min(1.0, (dd - dd_soft) / dd_soft)
            penalties.append(pen)
        else:
            penalties.append(0.0)
    
    # Moyenne des pénalités (si aucune, 0)
    if not penalties:
        return 0.0
    
    return float(np.mean(penalties))


def compute_buffett_score(asset: dict, profile: Optional[Dict] = None) -> float:
    """
    Calcule un score Buffett [0, 100].
    100 = parfait selon critères Buffett, 0 = très mauvais
    
    Args:
        asset: Dict avec métriques
        profile: Profil sectoriel (auto-détecté si None)
    
    Returns:
        Float entre 0 et 100
    """
    penalty = compute_buffett_penalty(asset, profile)
    return round((1.0 - penalty) * 100, 1)


# ============= PIPELINE COMPLET =============

def apply_buffett_filter(
    assets: List[dict],
    mode: str = "soft",
    strict: bool = False,
    min_score: float = 0.0
) -> List[dict]:
    """
    Pipeline complet de filtrage Buffett.
    
    Args:
        assets: Liste des actifs
        mode: 
            - "soft": Pénalise via score mais ne rejette pas (défaut)
            - "hard": Rejette les actifs hors limites dures
            - "both": Hard filter + pénalité soft
        strict: Si True, rejette les actifs sans données fondamentales
        min_score: Score Buffett minimum pour garder l'actif (0-100)
    
    Returns:
        Liste filtrée et enrichie avec:
        - _sector_key
        - _buffett_penalty
        - _buffett_score
        - _buffett_reject_reason (si rejeté)
    """
    if not assets:
        return assets
    
    logger.info(f"🎯 Filtrage Buffett: {len(assets)} actifs, mode={mode}, strict={strict}")
    
    # Étape 1: Enrichir avec stats sectorielles
    assets = enrich_with_sector_stats(assets)
    
    # Étape 2: Calculer penalty et score pour chaque actif
    for a in assets:
        profile = get_profile(a.get("sector"))
        a["_buffett_penalty"] = compute_buffett_penalty(a, profile)
        a["_buffett_score"] = compute_buffett_score(a, profile)
        a["_buffett_reject_reason"] = None
    
    # Étape 3: Hard filter si demandé
    if mode in ("hard", "both"):
        filtered = []
        rejected_count = 0
        for a in assets:
            profile = get_profile(a.get("sector"))
            passed, reason = buffett_hard_filter(a, profile, strict)
            if passed:
                filtered.append(a)
            else:
                a["_buffett_reject_reason"] = reason
                rejected_count += 1
                logger.debug(f"Rejeté: {a.get('name')} - {reason}")
        
        logger.info(f"Hard filter: {rejected_count} rejetés, {len(filtered)} restants")
        assets = filtered
    
    # Étape 4: Filtre par score minimum
    if min_score > 0:
        before = len(assets)
        assets = [a for a in assets if a.get("_buffett_score", 0) >= min_score]
        logger.info(f"Score minimum {min_score}: {before - len(assets)} rejetés, {len(assets)} restants")
    
    # Étape 5: Trier par score Buffett (secondaire) puis score quantitatif (primaire)
    # Le tri principal par score quantitatif reste dans universe.py
    # On ajoute juste le score Buffett comme signal supplémentaire
    
    logger.info(f"✅ Filtrage Buffett terminé: {len(assets)} actifs retenus")
    
    return assets


# ============= EXPORT DIAGNOSTICS =============

def get_sector_summary(assets: List[dict]) -> Dict[str, Dict]:
    """
    Résumé des stats par secteur pour diagnostic.
    
    Returns:
        Dict[sector_key] = {
            "count": int,
            "avg_roe": float,
            "avg_de": float,
            "avg_buffett_score": float,
            "rejected_count": int,
        }
    """
    summary = defaultdict(lambda: {
        "count": 0,
        "roes": [],
        "des": [],
        "scores": [],
        "rejected": 0,
    })
    
    for a in assets:
        key = a.get("_sector_key", get_sector_key(a.get("sector")))
        summary[key]["count"] += 1
        
        roe = safe_float(a.get("roe"))
        if roe > 0:
            summary[key]["roes"].append(roe)
        
        de = safe_float(a.get("de_ratio"))
        if de > 0:
            summary[key]["des"].append(de)
        
        score = a.get("_buffett_score", 0)
        summary[key]["scores"].append(score)
        
        if a.get("_buffett_reject_reason"):
            summary[key]["rejected"] += 1
    
    # Calculer moyennes
    result = {}
    for key, data in summary.items():
        result[key] = {
            "count": data["count"],
            "avg_roe": round(np.mean(data["roes"]), 1) if data["roes"] else None,
            "avg_de": round(np.mean(data["des"]), 1) if data["des"] else None,
            "avg_buffett_score": round(np.mean(data["scores"]), 1) if data["scores"] else None,
            "rejected_count": data["rejected"],
        }
    
    return dict(result)
