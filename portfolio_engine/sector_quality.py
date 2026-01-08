# portfolio_engine/sector_quality.py
"""
Buffett-style Sector Quality Filter v2.1
=========================================

v2.1 - FIX: ROE/ROIC négatifs maintenant correctement pénalisés
  - Bug fix: ROE négatif passait le filtre (ex: POSCO -6.97% → score 80)
  - buffett_hard_filter(): ROE/ROIC ≤ 0 = rejet immédiat
  - compute_buffett_penalty(): ROE/ROIC ≤ 0 = pénalité maximale

Filtre fondamental inspiré des critères Buffett avec seuils ajustés par secteur.
Les REIT, banques et utilities ont des profils de dette/payout différents des techs.

Métriques utilisées (depuis JSON et CSV enrichis):

DEPUIS stock-filter-by-volume.js (CSV):
- roe : Return on Equity (%)
- de_ratio : Debt-to-Equity ratio
- roic : Return on Invested Capital (%) ← v2.0 NOUVEAU

DEPUIS stock-advanced-filter.js (JSON):
- fcf_yield : Free Cash Flow Yield (%) ← v2.0 NOUVEAU
- eps_growth_5y : EPS Growth 5 ans historique (%) ← v2.0 NOUVEAU
- eps_growth_forecast_5y : EPS Growth 5 ans prévision (%)
- peg_ratio : P/E / EPS Growth
- payout_ratio_ttm : Payout ratio TTM (%)
- volatility_3y : Volatilité 3 ans (%)
- max_drawdown_ytd : Drawdown max YTD (%)
- dividend_coverage : Couverture dividende

Logique:
1. Mapping secteur français → clé normalisée
2. Calcul stats sectorielles (médianes)
3. Hard filter optionnel (rejette si hors limites absolues)
4. Soft penalty scoring (pénalise sans rejeter)
5. Score Value (FCF Yield, EPS Growth, PEG)
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


# ============= PROFILS SECTORIELS v2.0 =============

SECTOR_PROFILES = {
    # Tech : ROE/ROIC élevés, dette faible, croissance forte, FCF yield modéré
    "tech": {
        "roe_soft": 12,      # Pénalité si ROE < 12%
        "roe_hard": 5,       # Rejet si ROE < 5%
        "roic_soft": 12,     # v2.0: Pénalité si ROIC < 12%
        "roic_hard": 5,      # v2.0: Rejet si ROIC < 5%
        "de_soft": 80,       # Pénalité si D/E > 80%
        "de_hard": 200,      # Rejet si D/E > 200%
        "fcf_yield_soft": 2, # v2.0: Pénalité si FCF Yield < 2%
        "fcf_yield_hard": 0, # v2.0: Rejet si FCF Yield < 0%
        "eps_growth_soft": 8,  # v2.0: Pénalité si EPS Growth < 8%
        "eps_growth_hard": -5, # v2.0: Rejet si EPS Growth < -5%
        "peg_soft": 2.5,     # v2.0: Pénalité si PEG > 2.5
        "peg_hard": 5.0,     # v2.0: Rejet si PEG > 5
        "payout_soft": 50,   # Pénalité si payout > 50%
        "payout_hard": 80,   # Rejet si payout > 80%
        "vol_soft": 35,      # Pénalité si vol > 35%
        "vol_hard": 70,      # Rejet si vol > 70%
        "dd_soft": 30,       # Pénalité si DD > 30%
        "dd_hard": 50,       # Rejet si DD > 50%
    },
    
    # Finance : ROE modéré, ROIC difficile à calculer (levier), FCF moins pertinent
    "finance": {
        "roe_soft": 8,
        "roe_hard": 4,
        "roic_soft": None,   # v2.0: ROIC non pertinent pour banques
        "roic_hard": None,
        "de_soft": None,     # Pas de limite D/E pour banques
        "de_hard": None,
        "fcf_yield_soft": None,  # v2.0: FCF moins pertinent
        "fcf_yield_hard": None,
        "eps_growth_soft": 5,
        "eps_growth_hard": -10,
        "peg_soft": 2.0,
        "peg_hard": 4.0,
        "payout_soft": 60,
        "payout_hard": 90,
        "vol_soft": 30,
        "vol_hard": 55,
        "dd_soft": 35,
        "dd_hard": 55,
    },
    
    # Real Estate : ROE/ROIC faibles OK, FCF très important, payout très élevé (REIT)
    "real_estate": {
        "roe_soft": 5,
        "roe_hard": 2,
        "roic_soft": 4,      # v2.0: ROIC faible acceptable
        "roic_hard": 1,
        "de_soft": 150,
        "de_hard": 350,
        "fcf_yield_soft": 4, # v2.0: REITs doivent générer du FCF
        "fcf_yield_hard": 1,
        "eps_growth_soft": 3,
        "eps_growth_hard": -5,
        "peg_soft": 3.0,
        "peg_hard": 6.0,
        "payout_soft": 85,   # REITs distribuent 90%+
        "payout_hard": 120,  # Peut dépasser 100% temporairement
        "vol_soft": 25,
        "vol_hard": 50,
        "dd_soft": 30,
        "dd_hard": 50,
    },
    
    # Healthcare : ROE/ROIC variables (biotech vs pharma), croissance importante
    "healthcare": {
        "roe_soft": 10,
        "roe_hard": 3,
        "roic_soft": 8,
        "roic_hard": 2,
        "de_soft": 100,
        "de_hard": 250,
        "fcf_yield_soft": 3,
        "fcf_yield_hard": 0,
        "eps_growth_soft": 6,
        "eps_growth_hard": -10,
        "peg_soft": 2.5,
        "peg_hard": 5.0,
        "payout_soft": 55,
        "payout_hard": 85,
        "vol_soft": 30,
        "vol_hard": 60,
        "dd_soft": 30,
        "dd_hard": 50,
    },
    
    # Consumer Discretionary : Cyclique, ROE variable, croissance modérée
    "consumer_discretionary": {
        "roe_soft": 10,
        "roe_hard": 3,
        "roic_soft": 8,
        "roic_hard": 3,
        "de_soft": 120,
        "de_hard": 250,
        "fcf_yield_soft": 3,
        "fcf_yield_hard": 0,
        "eps_growth_soft": 5,
        "eps_growth_hard": -10,
        "peg_soft": 2.5,
        "peg_hard": 4.5,
        "payout_soft": 50,
        "payout_hard": 80,
        "vol_soft": 30,
        "vol_hard": 55,
        "dd_soft": 35,
        "dd_hard": 55,
    },
    
    # Consumer Staples : Stable, ROE correct, croissance faible mais régulière, FCF élevé
    "consumer_staples": {
        "roe_soft": 12,
        "roe_hard": 6,
        "roic_soft": 10,
        "roic_hard": 5,
        "de_soft": 100,
        "de_hard": 200,
        "fcf_yield_soft": 4,  # v2.0: Staples doivent être cash cows
        "fcf_yield_hard": 1,
        "eps_growth_soft": 4,
        "eps_growth_hard": -3,
        "peg_soft": 2.5,
        "peg_hard": 4.0,
        "payout_soft": 65,
        "payout_hard": 90,
        "vol_soft": 20,
        "vol_hard": 40,
        "dd_soft": 25,
        "dd_hard": 40,
    },
    
    # Industrial : Cyclique, capital-intensive, ROIC important
    "industrial": {
        "roe_soft": 10,
        "roe_hard": 4,
        "roic_soft": 8,
        "roic_hard": 3,
        "de_soft": 120,
        "de_hard": 280,
        "fcf_yield_soft": 3,
        "fcf_yield_hard": 0,
        "eps_growth_soft": 5,
        "eps_growth_hard": -8,
        "peg_soft": 2.5,
        "peg_hard": 4.5,
        "payout_soft": 50,
        "payout_hard": 80,
        "vol_soft": 28,
        "vol_hard": 50,
        "dd_soft": 30,
        "dd_hard": 50,
    },
    
    # Energy : Très cyclique, FCF très variable, croissance volatile
    "energy": {
        "roe_soft": 8,
        "roe_hard": 2,
        "roic_soft": 6,
        "roic_hard": 1,
        "de_soft": 80,
        "de_hard": 200,
        "fcf_yield_soft": 5,  # v2.0: Energy doit générer du cash
        "fcf_yield_hard": -2, # Peut être négatif en investissement
        "eps_growth_soft": 0, # Croissance volatile, pas d'attente
        "eps_growth_hard": -20,
        "peg_soft": None,     # PEG non pertinent (cyclique)
        "peg_hard": None,
        "payout_soft": 50,
        "payout_hard": 85,
        "vol_soft": 35,
        "vol_hard": 65,
        "dd_soft": 40,
        "dd_hard": 60,
    },
    
    # Utilities : Stable, dette élevée normale, FCF régulier, croissance faible
    "utilities": {
        "roe_soft": 8,
        "roe_hard": 4,
        "roic_soft": 5,
        "roic_hard": 2,
        "de_soft": 150,
        "de_hard": 300,
        "fcf_yield_soft": 4,  # v2.0: Utilities = cash cows
        "fcf_yield_hard": 1,
        "eps_growth_soft": 3,
        "eps_growth_hard": -2,
        "peg_soft": 3.0,
        "peg_hard": 5.0,
        "payout_soft": 75,
        "payout_hard": 100,
        "vol_soft": 18,
        "vol_hard": 35,
        "dd_soft": 20,
        "dd_hard": 40,
    },
    
    # Communication : Mix tech/media, croissance modérée
    "communication": {
        "roe_soft": 10,
        "roe_hard": 4,
        "roic_soft": 8,
        "roic_hard": 3,
        "de_soft": 100,
        "de_hard": 220,
        "fcf_yield_soft": 4,
        "fcf_yield_hard": 0,
        "eps_growth_soft": 5,
        "eps_growth_hard": -5,
        "peg_soft": 2.5,
        "peg_hard": 4.5,
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
        "roic_soft": 8,
        "roic_hard": 3,
        "de_soft": 100,
        "de_hard": 220,
        "fcf_yield_soft": 3,
        "fcf_yield_hard": 0,
        "eps_growth_soft": 5,
        "eps_growth_hard": -5,
        "peg_soft": 2.5,
        "peg_hard": 4.5,
        "payout_soft": 60,
        "payout_hard": 90,
        "vol_soft": 30,
        "vol_hard": 55,
        "dd_soft": 30,
        "dd_hard": 50,
    },
}


# ============= PONDÉRATIONS SCORING v2.0 =============

METRIC_WEIGHTS = {
    "roe": 0.20,        # Return on Equity
    "roic": 0.25,       # Return on Invested Capital (plus important que ROE)
    "fcf_yield": 0.20,  # Free Cash Flow Yield
    "eps_growth": 0.15, # EPS Growth
    "de_ratio": 0.10,   # Debt-to-Equity
    "payout": 0.10,     # Payout Ratio
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
    
    v2.0: Ajoute ROIC, FCF Yield, EPS Growth aux stats.
    
    Ajoute à chaque asset:
    - _sector_key: Clé normalisée du secteur
    - _sector_median_roe: Médiane ROE du secteur
    - _sector_median_roic: Médiane ROIC du secteur
    - _sector_median_de: Médiane D/E du secteur
    - _sector_median_fcf_yield: Médiane FCF Yield du secteur
    - _sector_median_eps_growth: Médiane EPS Growth du secteur
    - _roe_vs_sector: ROE / médiane secteur
    - _roic_vs_sector: ROIC / médiane secteur
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
        roics = [safe_float(a.get("roic")) for a in group if safe_float(a.get("roic")) > 0]
        des = [safe_float(a.get("de_ratio")) for a in group if safe_float(a.get("de_ratio")) >= 0]
        fcf_yields = [safe_float(a.get("fcf_yield")) for a in group if safe_float(a.get("fcf_yield")) != 0]
        eps_growths = [safe_float(a.get("eps_growth_5y")) for a in group if a.get("eps_growth_5y") is not None]
        vols = [safe_float(a.get("volatility_3y") or a.get("vol_3y") or a.get("vol")) for a in group]
        vols = [v for v in vols if v > 0]
        
        sector_medians[key] = {
            "roe": np.median(roes) if len(roes) >= 3 else None,
            "roic": np.median(roics) if len(roics) >= 3 else None,
            "de": np.median(des) if len(des) >= 3 else None,
            "fcf_yield": np.median(fcf_yields) if len(fcf_yields) >= 3 else None,
            "eps_growth": np.median(eps_growths) if len(eps_growths) >= 3 else None,
            "vol": np.median(vols) if len(vols) >= 3 else None,
            "count": len(group),
        }
    
    # Médianes globales (fallback)
    all_roes = [safe_float(a.get("roe")) for a in assets if safe_float(a.get("roe")) > 0]
    all_roics = [safe_float(a.get("roic")) for a in assets if safe_float(a.get("roic")) > 0]
    all_des = [safe_float(a.get("de_ratio")) for a in assets if safe_float(a.get("de_ratio")) >= 0]
    all_fcf = [safe_float(a.get("fcf_yield")) for a in assets if safe_float(a.get("fcf_yield")) != 0]
    all_eps = [safe_float(a.get("eps_growth_5y")) for a in assets if a.get("eps_growth_5y") is not None]
    all_vols = [safe_float(a.get("volatility_3y") or a.get("vol_3y") or a.get("vol")) for a in assets]
    all_vols = [v for v in all_vols if v > 0]
    
    global_medians = {
        "roe": np.median(all_roes) if all_roes else 12.0,
        "roic": np.median(all_roics) if all_roics else 10.0,
        "de": np.median(all_des) if all_des else 80.0,
        "fcf_yield": np.median(all_fcf) if all_fcf else 4.0,
        "eps_growth": np.median(all_eps) if all_eps else 8.0,
        "vol": np.median(all_vols) if all_vols else 25.0,
    }
    
    # Enrichir chaque asset
    for a in assets:
        key = get_sector_key(a.get("sector"))
        a["_sector_key"] = key
        
        med = sector_medians.get(key, {})
        
        # Médianes (avec fallback global)
        med_roe = med.get("roe") or global_medians["roe"]
        med_roic = med.get("roic") or global_medians["roic"]
        med_de = med.get("de") or global_medians["de"]
        med_fcf = med.get("fcf_yield") or global_medians["fcf_yield"]
        med_eps = med.get("eps_growth") or global_medians["eps_growth"]
        med_vol = med.get("vol") or global_medians["vol"]
        
        a["_sector_median_roe"] = med_roe
        a["_sector_median_roic"] = med_roic
        a["_sector_median_de"] = med_de
        a["_sector_median_fcf_yield"] = med_fcf
        a["_sector_median_eps_growth"] = med_eps
        a["_sector_median_vol"] = med_vol
        
        # Ratios vs secteur
        roe = safe_float(a.get("roe"))
        roic = safe_float(a.get("roic"))
        de = safe_float(a.get("de_ratio"))
        fcf = safe_float(a.get("fcf_yield"))
        eps = safe_float(a.get("eps_growth_5y"))
        vol = safe_float(a.get("volatility_3y") or a.get("vol_3y") or a.get("vol"))
        
        a["_roe_vs_sector"] = roe / med_roe if med_roe > 0 else 1.0
        a["_roic_vs_sector"] = roic / med_roic if med_roic > 0 else 1.0
        a["_de_vs_sector"] = de / med_de if med_de > 0 else 1.0
        a["_fcf_yield_vs_sector"] = fcf / med_fcf if med_fcf != 0 else 1.0
        a["_eps_growth_vs_sector"] = eps / med_eps if med_eps != 0 else 1.0
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
    
    v2.1 FIX: ROE/ROIC négatifs = rejet immédiat (était ignoré avant)
    v2.0: Ajoute vérifications ROIC, FCF Yield, EPS Growth, PEG.
    
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
    roic = safe_float(asset.get("roic"))
    de = safe_float(asset.get("de_ratio"))
    fcf_yield = safe_float(asset.get("fcf_yield"))
    eps_growth = safe_float(asset.get("eps_growth_5y"))
    peg = safe_float(asset.get("peg_ratio"))
    payout = safe_float(asset.get("payout_ratio_ttm"))
    vol = safe_float(asset.get("volatility_3y") or asset.get("vol_3y") or asset.get("vol"))
    dd = abs(safe_float(asset.get("max_drawdown_ytd") or asset.get("max_dd")))
    
    # Mode strict : rejette si données manquantes
    if strict:
        if roe == 0:
            return False, "missing_roe"
        if de == 0 and profile.get("de_hard") is not None:
            return False, "missing_de"
    
    # ============= v2.1 FIX: ROE négatif = REJET IMMÉDIAT =============
    roe_hard = profile.get("roe_hard")
    if roe_hard is not None:
        # v2.1: Vérifier si ROE existe dans les données (même si 0 après parsing)
        roe_raw = asset.get("roe")
        has_roe_data = roe_raw is not None and str(roe_raw).strip() not in ("", "N/A", "n/a", "-")
        
        if has_roe_data:
            if roe <= 0:
                # ROE négatif ou nul = REJET IMMÉDIAT
                logger.debug(f"Rejet ROE négatif: {asset.get('name')} ROE={roe:.2f}%")
                return False, f"roe_negative_{roe:.1f}%"
            elif roe < roe_hard:
                return False, f"roe_below_{roe_hard}%"
    
    # ============= v2.1 FIX: ROIC négatif = REJET =============
    roic_hard = profile.get("roic_hard")
    if roic_hard is not None:
        roic_raw = asset.get("roic")
        has_roic_data = roic_raw is not None and str(roic_raw).strip() not in ("", "N/A", "n/a", "-")
        
        if has_roic_data:
            if roic < 0:
                # ROIC négatif = REJET
                logger.debug(f"Rejet ROIC négatif: {asset.get('name')} ROIC={roic:.2f}%")
                return False, f"roic_negative_{roic:.1f}%"
            elif roic > 0 and roic < roic_hard:
                return False, f"roic_below_{roic_hard}%"
    
    # D/E
    de_hard = profile.get("de_hard")
    if de_hard is not None and de > de_hard:
        return False, f"de_above_{de_hard}%"
    
    # v2.0: FCF Yield
    fcf_hard = profile.get("fcf_yield_hard")
    if fcf_hard is not None and fcf_yield != 0 and fcf_yield < fcf_hard:
        return False, f"fcf_yield_below_{fcf_hard}%"
    
    # v2.0: EPS Growth
    eps_hard = profile.get("eps_growth_hard")
    if eps_hard is not None and eps_growth != 0 and eps_growth < eps_hard:
        return False, f"eps_growth_below_{eps_hard}%"
    
    # v2.0: PEG Ratio
    peg_hard = profile.get("peg_hard")
    if peg_hard is not None and peg > 0 and peg > peg_hard:
        return False, f"peg_above_{peg_hard}"
    
    # Payout
    payout_hard = profile.get("payout_hard")
    if payout_hard is not None and payout > payout_hard:
        return False, f"payout_above_{payout_hard}%"
    
    # Volatilité
    vol_hard = profile.get("vol_hard")
    if vol_hard is not None and vol > vol_hard:
        return False, f"vol_above_{vol_hard}%"
    
    # Drawdown
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
    
    v2.1 FIX: ROE/ROIC négatifs = pénalité MAXIMALE (1.0)
    v2.0: Intègre ROIC, FCF Yield, EPS Growth avec pondérations.
    
    Args:
        asset: Dict avec métriques
        profile: Profil sectoriel (auto-détecté si None)
    
    Returns:
        Float entre 0 et 1
    """
    if profile is None:
        profile = get_profile(asset.get("sector"))
    
    weighted_penalties = []
    total_weight = 0
    
    # ============= v2.1 FIX: ROE - Pénalité max si négatif =============
    roe = safe_float(asset.get("roe"))
    roe_soft = profile.get("roe_soft", 10)
    roe_raw = asset.get("roe")
    has_roe_data = roe_raw is not None and str(roe_raw).strip() not in ("", "N/A", "n/a", "-")
    
    if has_roe_data:
        if roe <= 0:
            # v2.1: ROE négatif ou nul = pénalité MAXIMALE
            pen = 1.0
            logger.debug(f"Pénalité max ROE: {asset.get('name')} ROE={roe:.2f}%")
        elif roe < roe_soft:
            pen = min(1.0, (roe_soft - roe) / roe_soft)
        else:
            pen = 0.0
        weighted_penalties.append(pen * METRIC_WEIGHTS["roe"])
        total_weight += METRIC_WEIGHTS["roe"]
    
    # ============= v2.1 FIX: ROIC - Pénalité max si négatif =============
    roic = safe_float(asset.get("roic"))
    roic_soft = profile.get("roic_soft")
    roic_raw = asset.get("roic")
    has_roic_data = roic_raw is not None and str(roic_raw).strip() not in ("", "N/A", "n/a", "-")
    
    if roic_soft is not None and has_roic_data:
        if roic < 0:
            # v2.1: ROIC négatif = pénalité MAXIMALE
            pen = 1.0
            logger.debug(f"Pénalité max ROIC: {asset.get('name')} ROIC={roic:.2f}%")
        elif roic == 0:
            # ROIC nul = pénalité élevée mais pas max
            pen = 0.8
        elif roic < roic_soft:
            pen = min(1.0, (roic_soft - roic) / roic_soft)
        else:
            pen = 0.0
        weighted_penalties.append(pen * METRIC_WEIGHTS["roic"])
        total_weight += METRIC_WEIGHTS["roic"]
    
    # D/E : Pénalité si supérieur au soft
    de = safe_float(asset.get("de_ratio"))
    de_soft = profile.get("de_soft")
    if de_soft is not None and de > 0:
        if de > de_soft:
            pen = min(1.0, (de - de_soft) / de_soft)
        else:
            pen = 0.0
        weighted_penalties.append(pen * METRIC_WEIGHTS["de_ratio"])
        total_weight += METRIC_WEIGHTS["de_ratio"]
    
    # v2.0: FCF Yield - Pénalité si inférieur au soft
    fcf = safe_float(asset.get("fcf_yield"))
    fcf_soft = profile.get("fcf_yield_soft")
    if fcf_soft is not None and fcf != 0:
        if fcf < fcf_soft:
            pen = min(1.0, max(0, (fcf_soft - fcf) / fcf_soft))
        else:
            pen = 0.0
        weighted_penalties.append(pen * METRIC_WEIGHTS["fcf_yield"])
        total_weight += METRIC_WEIGHTS["fcf_yield"]
    
    # v2.0: EPS Growth - Pénalité si inférieur au soft
    eps = safe_float(asset.get("eps_growth_5y"))
    eps_soft = profile.get("eps_growth_soft")
    if eps_soft is not None and asset.get("eps_growth_5y") is not None:
        if eps < eps_soft:
            pen = min(1.0, max(0, (eps_soft - eps) / max(1, abs(eps_soft))))
        else:
            pen = 0.0
        weighted_penalties.append(pen * METRIC_WEIGHTS["eps_growth"])
        total_weight += METRIC_WEIGHTS["eps_growth"]
    
    # Payout : Pénalité si supérieur au soft
    payout = safe_float(asset.get("payout_ratio_ttm"))
    payout_soft = profile.get("payout_soft", 60)
    if payout > 0:
        if payout > payout_soft:
            pen = min(1.0, (payout - payout_soft) / payout_soft)
        else:
            pen = 0.0
        weighted_penalties.append(pen * METRIC_WEIGHTS["payout"])
        total_weight += METRIC_WEIGHTS["payout"]
    
    # Moyenne pondérée
    if not weighted_penalties or total_weight == 0:
        return 0.0
    
    return float(sum(weighted_penalties) / total_weight)


def compute_value_score(asset: dict, profile: Optional[Dict] = None) -> float:
    """
    v2.0: Score Value Investing [0, 100] basé sur FCF Yield, EPS Growth, PEG.
    
    Un score élevé indique une action potentiellement sous-évaluée avec croissance.
    
    Args:
        asset: Dict avec métriques
        profile: Profil sectoriel
    
    Returns:
        Float entre 0 et 100
    """
    if profile is None:
        profile = get_profile(asset.get("sector"))
    
    scores = []
    
    # FCF Yield : Plus c'est élevé, mieux c'est (score 0-100)
    fcf = safe_float(asset.get("fcf_yield"))
    if fcf != 0:
        # FCF Yield de 8%+ = 100, 0% = 0
        fcf_score = min(100, max(0, fcf * 12.5))
        scores.append(fcf_score)
    
    # EPS Growth : Plus c'est élevé, mieux c'est
    eps = safe_float(asset.get("eps_growth_5y"))
    if asset.get("eps_growth_5y") is not None:
        # 20%+ = 100, 0% = 50, -10% = 0
        eps_score = min(100, max(0, 50 + eps * 2.5))
        scores.append(eps_score)
    
    # PEG Ratio : Plus c'est bas, mieux c'est (inversé)
    peg = safe_float(asset.get("peg_ratio"))
    if peg > 0:
        # PEG 0.5 = 100, PEG 2.0 = 50, PEG 4.0 = 0
        peg_score = min(100, max(0, 100 - (peg - 0.5) * 28.5))
        scores.append(peg_score)
    
    if not scores:
        return 50.0  # Neutre si pas de données
    
    return round(np.mean(scores), 1)


def compute_buffett_score(asset: dict, profile: Optional[Dict] = None) -> float:
    """
    Calcule un score Buffett combiné [0, 100].
    
    v2.1: Intègre le fix ROE/ROIC négatif via compute_buffett_penalty()
    v2.0: Combine quality score (penalty-based) et value score.
    100 = parfait selon critères Buffett + Value, 0 = très mauvais
    
    Args:
        asset: Dict avec métriques
        profile: Profil sectoriel (auto-détecté si None)
    
    Returns:
        Float entre 0 et 100
    """
    penalty = compute_buffett_penalty(asset, profile)
    quality_score = (1.0 - penalty) * 100
    
    value_score = compute_value_score(asset, profile)
    
    # Combinaison : 60% Quality, 40% Value
    combined = quality_score * 0.6 + value_score * 0.4
    
    return round(combined, 1)


# ============= PIPELINE COMPLET =============

def apply_buffett_filter(
    assets: List[dict],
    mode: str = "soft",
    strict: bool = False,
    min_score: float = 0.0
) -> List[dict]:
    """
    Pipeline complet de filtrage Buffett.
    
    v2.1: Fix ROE/ROIC négatifs (rejet immédiat + pénalité max)
    v2.0: Utilise ROIC, FCF Yield, EPS Growth dans le scoring.
    
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
        - _value_score (v2.0)
        - _buffett_reject_reason (si rejeté)
    """
    if not assets:
        return assets
    
    logger.info(f"🎯 Filtrage Buffett v2.1: {len(assets)} actifs, mode={mode}, strict={strict}")
    
    # Étape 1: Enrichir avec stats sectorielles
    assets = enrich_with_sector_stats(assets)
    
    # Étape 2: Calculer penalty, value score et score combiné pour chaque actif
    for a in assets:
        profile = get_profile(a.get("sector"))
        a["_buffett_penalty"] = compute_buffett_penalty(a, profile)
        a["_value_score"] = compute_value_score(a, profile)
        a["_buffett_score"] = compute_buffett_score(a, profile)
        a["_buffett_reject_reason"] = None
    
    # Étape 3: Hard filter si demandé
    if mode in ("hard", "both"):
        filtered = []
        rejected_count = 0
        rejected_by_reason = {}
        
        for a in assets:
            profile = get_profile(a.get("sector"))
            passed, reason = buffett_hard_filter(a, profile, strict)
            if passed:
                filtered.append(a)
            else:
                a["_buffett_reject_reason"] = reason
                rejected_count += 1
                # v2.1: Tracker les raisons de rejet
                reason_key = reason.split("_")[0] if reason else "unknown"
                rejected_by_reason[reason_key] = rejected_by_reason.get(reason_key, 0) + 1
                logger.debug(f"Rejeté: {a.get('name')} - {reason}")
        
        logger.info(f"Hard filter: {rejected_count} rejetés, {len(filtered)} restants")
        if rejected_by_reason:
            logger.info(f"  Raisons: {rejected_by_reason}")
        assets = filtered
    
    # Étape 4: Filtre par score minimum
    if min_score > 0:
        before = len(assets)
        assets = [a for a in assets if a.get("_buffett_score", 0) >= min_score]
        logger.info(f"Score minimum {min_score}: {before - len(assets)} rejetés, {len(assets)} restants")
    
    logger.info(f"✅ Filtrage Buffett v2.1 terminé: {len(assets)} actifs retenus")
    
    return assets


# ============= EXPORT DIAGNOSTICS =============

def get_sector_summary(assets: List[dict]) -> Dict[str, Dict]:
    """
    Résumé des stats par secteur pour diagnostic.
    
    v2.0: Ajoute ROIC, FCF Yield, EPS Growth aux stats.
    
    Returns:
        Dict[sector_key] = {
            "count": int,
            "avg_roe": float,
            "avg_roic": float,
            "avg_de": float,
            "avg_fcf_yield": float,
            "avg_eps_growth": float,
            "avg_buffett_score": float,
            "avg_value_score": float,
            "rejected_count": int,
        }
    """
    summary = defaultdict(lambda: {
        "count": 0,
        "roes": [],
        "roics": [],
        "des": [],
        "fcf_yields": [],
        "eps_growths": [],
        "scores": [],
        "value_scores": [],
        "rejected": 0,
    })
    
    for a in assets:
        key = a.get("_sector_key", get_sector_key(a.get("sector")))
        summary[key]["count"] += 1
        
        roe = safe_float(a.get("roe"))
        if roe > 0:
            summary[key]["roes"].append(roe)
        
        roic = safe_float(a.get("roic"))
        if roic > 0:
            summary[key]["roics"].append(roic)
        
        de = safe_float(a.get("de_ratio"))
        if de > 0:
            summary[key]["des"].append(de)
        
        fcf = safe_float(a.get("fcf_yield"))
        if fcf != 0:
            summary[key]["fcf_yields"].append(fcf)
        
        eps = safe_float(a.get("eps_growth_5y"))
        if a.get("eps_growth_5y") is not None:
            summary[key]["eps_growths"].append(eps)
        
        score = a.get("_buffett_score", 0)
        summary[key]["scores"].append(score)
        
        value_score = a.get("_value_score", 0)
        summary[key]["value_scores"].append(value_score)
        
        if a.get("_buffett_reject_reason"):
            summary[key]["rejected"] += 1
    
    # Calculer moyennes
    result = {}
    for key, data in summary.items():
        result[key] = {
            "count": data["count"],
            "avg_roe": round(np.mean(data["roes"]), 1) if data["roes"] else None,
            "avg_roic": round(np.mean(data["roics"]), 1) if data["roics"] else None,
            "avg_de": round(np.mean(data["des"]), 1) if data["des"] else None,
            "avg_fcf_yield": round(np.mean(data["fcf_yields"]), 2) if data["fcf_yields"] else None,
            "avg_eps_growth": round(np.mean(data["eps_growths"]), 1) if data["eps_growths"] else None,
            "avg_buffett_score": round(np.mean(data["scores"]), 1) if data["scores"] else None,
            "avg_value_score": round(np.mean(data["value_scores"]), 1) if data["value_scores"] else None,
            "rejected_count": data["rejected"],
        }
    
    return dict(result)


def get_fundamentals_coverage(assets: List[dict]) -> Dict[str, float]:
    """
    v2.0: Calcule le taux de couverture de chaque métrique fondamentale.
    
    Returns:
        Dict avec le pourcentage d'actifs ayant chaque métrique.
    """
    if not assets:
        return {}
    
    total = len(assets)
    
    return {
        "roe": round(sum(1 for a in assets if safe_float(a.get("roe")) > 0) / total * 100, 1),
        "roic": round(sum(1 for a in assets if safe_float(a.get("roic")) > 0) / total * 100, 1),
        "de_ratio": round(sum(1 for a in assets if safe_float(a.get("de_ratio")) >= 0) / total * 100, 1),
        "fcf_yield": round(sum(1 for a in assets if a.get("fcf_yield") is not None) / total * 100, 1),
        "eps_growth_5y": round(sum(1 for a in assets if a.get("eps_growth_5y") is not None) / total * 100, 1),
        "peg_ratio": round(sum(1 for a in assets if safe_float(a.get("peg_ratio")) > 0) / total * 100, 1),
        "payout_ratio": round(sum(1 for a in assets if safe_float(a.get("payout_ratio_ttm")) > 0) / total * 100, 1),
    }
