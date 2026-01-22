# portfolio_engine/preset_etf.py
"""
=========================================
ETF Preset Selector v2.2.11
=========================================

CHANGEMENTS vs v2.2.10 (audit ChatGPT round 2):
-----------------------------------------------
1. DÉTECTION UNITÉS ROW-WISE:
   - _detect_weight_units_pct() log les mix (certains % d'autres fractions)
   - Nouvelle fonction _is_weight_pct_row() pour détection par ligne
   - Alertes si données hétérogènes

2. YIELD DETECTION AMÉLIORÉE:
   - Meilleure gestion du cas 0.6 = 0.6% (pas 60%)
   - Si max <= 1.0 mais q95 > 0.20, probablement des points de %
   - Seuil q95 <= 0.12 pour décimal (au lieu de 0.50)

3. FORCE_*_UNITS OPTIONS:
   - FORCE_TER_UNITS, FORCE_YIELD_UNITS, FORCE_WEIGHT_UNITS
   - Permet de bypasser la détection automatique si elle se trompe

4. _extract_weights FILTRE ANTI-ANNÉES:
   - _is_likely_year() exclut 1900-2100
   - Permet les poids > 50% (gold physique, single-stock)

5. PROFILE_PRESET_PRIORITY EXPLICITE:
   - Ordre de priorité des presets documenté et explicite
   - Plus de dépendance à l'ordre d'insertion dict

6. run_sanity_checks() FONCTION:
   - Rapport de qualité des données
   - Détecte mix d'unités, données manquantes, coverage presets
   - À appeler AVANT select_etfs_for_profile() en production

CHANGEMENTS vs v2.2.9 (audit Claude + ChatGPT):
-----------------------------------------------
1. FIX SCORING sector_top_weight:
   - compute_profile_score() utilise maintenant _sector_top_weight_frac
   - Évite la double division /100 si déjà en fraction

2. FIX _preset_coeur_global() seuil:
   - Utilise _sector_top_weight_frac avec seuil 0.35 (fraction)
   - Au lieu de secw <= 35 (incohérent si données en fraction)

3. FIX _compute_diversification_metrics() holding_top:
   - Priorité: dériver de holdings_top10 (plus fiable)
   - Fallback sur holding_top si NaN
   - Évite le bug 0.8% interprété comme 80%

4. FIX _apply_constraints_once() quantiles:
   - Utilise vol.notna().sum() >= MIN_N au lieu de len(df)
   - Plus correct pour les univers avec beaucoup de NaN

5. FIX _extract_weights() regex:
   - Filtre f <= 50 pour exclure les années (2024, 2023...)
   - Évite HHI faux avec holdings_top10 contenant des dates

6. FIX _weights_to_fraction() heuristique:
   - Retrait règle sum > 1.2 (faux positifs avec 5 holdings à 25%)
   - Seule règle fiable: max > 1.0 → données en %

7. FIX _preset_income_options():
   - Ajout check ~_is_leveraged_or_inverse()
   - Un ETF leveraged avec OPTIONS_OVERLAY était accepté

8. FIX _q_ok() min_n:
   - Utilise MIN_N_FOR_QUANTILE (30) au lieu de 20 hardcodé
   - Cohérence avec _apply_constraints_once()

CHANGEMENTS vs v2.2.8 (audit ChatGPT):
--------------------------------------
1. DÉTECTION % VS FRACTION UNIFIÉE:
   - Nouvelle fonction _detect_weight_units_pct()
   - Appliquée à holding_top ET sector_top_weight (pas juste holdings_top10)
   - Corrige le bug où holding_top=0.8% était interprété comme 80%

2. YIELD DETECTION ROBUSTE:
   - Même heuristique que TER: q95 + max
   - Si max > 1.0 → forcément en %
   - Si q95 <= 0.50 → décimal
   - Important pour les ETF income/options overlay (yields > 15%)

3. HARD CONSTRAINTS MIN_N:
   - Les contraintes quantiles (vol_max_quantile, ter_max_quantile) 
     ne s'appliquent que si n >= MIN_N_FOR_QUANTILE (30)
   - Évite le sur-filtrage sur petits univers (12 ETF → quantile 35% = 4 ETF)

CHANGEMENTS vs v2.2.3:
----------------------
- Preset emergents: ajout keywords régionaux (asia, china, india, latam, africa, etc.)

CHANGEMENTS vs v2.2.2:
----------------------
FIX SCHÉMA COLONNES:
- _get_asset_bucket() cherche maintenant dans: bucket, asset_bucket, sector_bucket
- Détecte automatiquement si sector_bucket contient des classifications produit
  (STANDARD, ALT_ASSET_*, etc.) ou de vrais secteurs
- _get_sector_bucket() fallback sur sector_top si sector_bucket = classifications

CHANGEMENTS vs v2.2.1 (BUG CRITIQUE):
-------------------------------------
⚠️ FIX DOUBLE INVERSION SCORING:
   - AVANT: scores calculés avec higher_is_better=False PUIS inversés par poids négatif
   - RÉSULTAT: double inversion → favorisait HIGH vol/TER pour Stable (inverse du voulu!)
   - FIX: TOUS les scores calculés avec higher_is_better=True, le signe du poids seul fait l'inversion

CHANGEMENTS vs v2.2.0:
----------------------
1. _is_leveraged_or_inverse() robuste: leverage col + reasons + name pattern + symboles connus
2. Vol Agressif: poids corrigé
3. asset_bucket vs sector_bucket séparés
4. sector_defensive/cyclical: utilisent sector_bucket

CHANGEMENTS vs v2.1.0:
----------------------
1. Géographie RETIRÉE (country_top = pays de cotation, pas d'exposition)
2. Roles/RiskLevel définis NATIVEMENT (pas d'import fragile)
3. HHI blend pondéré (40% sector, 60% holdings)
4. Déduplication TER-aware
5. Nouveaux presets: multi_factor, income_options, sector_defensive, sector_cyclical
6. Scoring enrichi avec 8 composantes
7. Gestion robuste des données manquantes

CONVENTION SCORING:
-------------------
TOUS les scores par composante sont calculés avec higher_is_better=True:
  - high raw value → high score (toujours)
  
Le signe du poids dans SCORING_WEIGHTS encode la direction souhaitée:
  - Poids négatif (ex: vol=-0.30): "lower raw value is better"
    → on applique (1 - score) → low vol = high contribution
  - Poids positif (ex: momentum=0.35): "higher raw value is better"
    → on garde score tel quel → high momentum = high contribution

ARCHITECTURE:
-------------
Couche 0: Data QC (qualité, leverage, AUM, TER, exclure bonds)
Couche 1: Hard Constraints (quantiles adaptatifs + relaxation progressive)
Couche 2: Presets Union (bucket-first gate + filtres spécifiques)
Couche 3: Scoring (_profile_score 0-100)
Couche 4: Déduplication (underlying_ticker, TER-aware)

COLONNES ATTENDUES:
-------------------
Core: etfsymbol/symbol, name, isin, fund_type, etf_type, leverage
Métriques: aum_usd, total_expense_ratio, yield_ttm
Performance: daily_change_pct, perf_1m_pct, perf_3m_pct, ytd_return_pct, one_year_return_pct
Volatilité: vol_pct, vol_3y_pct, vol_window
Concentration: sector_top, sector_top_weight, sector_top5, holding_top, holdings_top10
Qualité: data_quality_score, bucket/sector_bucket, sector_trust, sector_signal_ok, reasons
Dédup: underlying_ticker

NOTE SCHÉMA:
------------
Si ta colonne "sector_bucket" contient des valeurs comme STANDARD, ALT_ASSET_*, etc.
(au lieu de vrais secteurs), le code le détecte automatiquement et utilise sector_top
pour les vrais secteurs.

COLONNES IGNORÉES (non fiables):
--------------------------------
- country_top, country_top_weight, country_top5 (= pays de COTATION, pas d'exposition)
"""

from __future__ import annotations

import logging
import re
from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple, Union, Callable

import numpy as np
import pandas as pd

logger = logging.getLogger("portfolio_engine.preset_etf")


# =============================================================================
# ENUMS & TYPES (NATIFS - pas d'import fragile)
# =============================================================================

class ETFRole(Enum):
    """Rôle de l'ETF dans le portefeuille."""
    CORE = "CORE"                 # Cœur stable, exposition large
    DEFENSIVE = "DEFENSIVE"       # Protection, low vol, dividendes
    SATELLITE = "SATELLITE"       # Croissance, momentum, thématique
    ALTERNATIVE = "ALTERNATIVE"   # Commodités, inflation hedge
    INCOME = "INCOME"             # Options overlay, high yield


class ETFRiskLevel(Enum):
    """Niveau de risque."""
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    VERY_HIGH = "VERY_HIGH"


class CorrelationGroup(Enum):
    """Groupe de corrélation pour diversification."""
    EQUITY_BROAD = "equity_broad"
    EQUITY_GROWTH = "equity_growth"
    EQUITY_VALUE = "equity_value"
    EQUITY_DIVIDEND = "equity_dividend"
    EQUITY_SMALL = "equity_small"
    EQUITY_EM = "equity_em"
    COMMODITY_GOLD = "commodity_gold"
    COMMODITY_BROAD = "commodity_broad"
    REAL_ASSETS = "real_assets"
    INCOME_OPTIONS = "income_options"
    MULTI_FACTOR = "multi_factor"


@dataclass
class PresetConfig:
    """Configuration d'un preset."""
    name: str
    role: ETFRole
    risk: ETFRiskLevel
    correlation_group: CorrelationGroup
    description: str = ""
    profiles: List[str] = field(default_factory=list)  # Profils autorisés


# =============================================================================
# CONFIGURATION GLOBALE
# =============================================================================

# FIX v2.2.11: Options pour forcer les unités (si détection automatique échoue)
# Mettre à "pct" ou "decimal" pour forcer, None pour auto-détection
FORCE_TER_UNITS: Optional[str] = None      # "pct" | "decimal" | None
FORCE_YIELD_UNITS: Optional[str] = None    # "pct" | "decimal" | None
FORCE_WEIGHT_UNITS: Optional[str] = None   # "pct" | "decimal" | None

# Seuils Data Quality
MIN_DATA_QUALITY_SCORE = 0.60
MIN_AUM_USD = 100_000_000  # 100M minimum
MAX_LEVERAGE_ALLOWED = 0.0
MIN_N_FOR_QUANTILE = 30  # FIX v2.2.9: Minimum d'ETF pour appliquer les contraintes quantiles

# Configuration des presets
PRESET_CONFIGS: Dict[str, PresetConfig] = {
    # CORE
    "coeur_global": PresetConfig(
        name="coeur_global",
        role=ETFRole.CORE,
        risk=ETFRiskLevel.LOW,
        correlation_group=CorrelationGroup.EQUITY_BROAD,
        description="World core UCITS, TER bas, AUM élevé, diversifié",
        profiles=["Stable", "Modéré"],
    ),
    "min_vol_global": PresetConfig(
        name="min_vol_global",
        role=ETFRole.DEFENSIVE,
        risk=ETFRiskLevel.LOW,
        correlation_group=CorrelationGroup.EQUITY_BROAD,
        description="Low volatility, défensif",
        profiles=["Stable"],
    ),
    "multi_factor": PresetConfig(
        name="multi_factor",
        role=ETFRole.CORE,
        risk=ETFRiskLevel.MODERATE,
        correlation_group=CorrelationGroup.MULTI_FACTOR,
        description="ETF factoriels (Quality, Value, Momentum, Size)",
        profiles=["Modéré", "Agressif"],
    ),
    
    # DEFENSIVE / INCOME
    "rendement_etf": PresetConfig(
        name="rendement_etf",
        role=ETFRole.DEFENSIVE,
        risk=ETFRiskLevel.LOW,
        correlation_group=CorrelationGroup.EQUITY_DIVIDEND,
        description="Dividend yield élevé, payout stable",
        profiles=["Stable", "Modéré"],
    ),
    "income_options": PresetConfig(
        name="income_options",
        role=ETFRole.INCOME,
        risk=ETFRiskLevel.HIGH,
        correlation_group=CorrelationGroup.INCOME_OPTIONS,
        description="Covered call, buywrite (JEPI, JEPQ, YieldMax)",
        profiles=["Agressif"],
    ),
    
    # SATELLITE GROWTH
    "qualite_value": PresetConfig(
        name="qualite_value",
        role=ETFRole.CORE,
        risk=ETFRiskLevel.MODERATE,
        correlation_group=CorrelationGroup.EQUITY_VALUE,
        description="Quality/Value factor proxy",
        profiles=["Modéré"],
    ),
    "croissance_tech": PresetConfig(
        name="croissance_tech",
        role=ETFRole.SATELLITE,
        risk=ETFRiskLevel.HIGH,
        correlation_group=CorrelationGroup.EQUITY_GROWTH,
        description="Tech/Growth, momentum positif",
        profiles=["Modéré", "Agressif"],
    ),
    "smid_quality": PresetConfig(
        name="smid_quality",
        role=ETFRole.SATELLITE,
        risk=ETFRiskLevel.HIGH,
        correlation_group=CorrelationGroup.EQUITY_SMALL,
        description="Small/Mid caps",
        profiles=["Agressif"],
    ),
    "emergents": PresetConfig(
        name="emergents",
        role=ETFRole.SATELLITE,
        risk=ETFRiskLevel.HIGH,
        correlation_group=CorrelationGroup.EQUITY_EM,
        description="Marchés émergents",
        profiles=["Modéré", "Agressif"],
    ),
    
    # SECTOR THEMATIC
    "sector_defensive": PresetConfig(
        name="sector_defensive",
        role=ETFRole.DEFENSIVE,
        risk=ETFRiskLevel.LOW,
        correlation_group=CorrelationGroup.EQUITY_DIVIDEND,
        description="Utilities, Healthcare, Consumer Staples",
        profiles=["Stable", "Modéré"],
    ),
    "sector_cyclical": PresetConfig(
        name="sector_cyclical",
        role=ETFRole.SATELLITE,
        risk=ETFRiskLevel.HIGH,
        correlation_group=CorrelationGroup.EQUITY_BROAD,
        description="Financials, Industrials, Materials",
        profiles=["Agressif"],
    ),
    
    # ALTERNATIVES
    "inflation_shield": PresetConfig(
        name="inflation_shield",
        role=ETFRole.ALTERNATIVE,
        risk=ETFRiskLevel.MODERATE,
        correlation_group=CorrelationGroup.REAL_ASSETS,
        description="TIPS, commodities, real assets, REIT",
        profiles=["Modéré"],
    ),
    "or_physique": PresetConfig(
        name="or_physique",
        role=ETFRole.ALTERNATIVE,
        risk=ETFRiskLevel.LOW,
        correlation_group=CorrelationGroup.COMMODITY_GOLD,
        description="Gold physical ETF",
        profiles=["Stable", "Modéré"],
    ),
    "commodities_broad": PresetConfig(
        name="commodities_broad",
        role=ETFRole.ALTERNATIVE,
        risk=ETFRiskLevel.HIGH,
        correlation_group=CorrelationGroup.COMMODITY_BROAD,
        description="Commodities diversifiées (hors gold pur)",
        profiles=["Agressif"],
    ),
}

# Presets par profil (dérivé de PRESET_CONFIGS)
# FIX v2.2.11: Ordre EXPLICITE de priorité (premier match gagne)
# Si tu changes l'ordre ici, ça change le matching!
PROFILE_PRESET_PRIORITY: Dict[str, List[str]] = {
    "Stable": [
        "coeur_global",      # Priorité 1: cœur diversifié
        "min_vol_global",    # Priorité 2: low vol
        "rendement_etf",     # Priorité 3: dividendes
        "sector_defensive",  # Priorité 4: secteurs défensifs
        "or_physique",       # Priorité 5: gold
    ],
    "Modéré": [
        "coeur_global",
        "multi_factor",
        "qualite_value",
        "rendement_etf",
        "croissance_tech",
        "emergents",
        "sector_defensive",
        "inflation_shield",
        "or_physique",
    ],
    "Agressif": [
        "multi_factor",
        "croissance_tech",
        "smid_quality",
        "emergents",
        "income_options",
        "sector_cyclical",
        "commodities_broad",
    ],
}

# Backward compat: PROFILE_PRESETS pointe vers PRIORITY
PROFILE_PRESETS: Dict[str, List[str]] = PROFILE_PRESET_PRIORITY

# Hard constraints par profil (SANS géographie)
PROFILE_CONSTRAINTS: Dict[str, Dict[str, float]] = {
    "Stable": {
        "vol_max_quantile": 0.35,
        "ter_max_quantile": 0.60,
        "sector_concentration_max": 0.50,
        "hhi_max": 0.20,
        "holding_top_max": 0.12,
    },
    "Modéré": {
        "vol_max_quantile": 0.70,
        "ter_max_quantile": 0.80,
        "sector_concentration_max": 0.70,
        "hhi_max": 0.30,
        "holding_top_max": 0.20,
    },
    "Agressif": {
        "vol_max_quantile": 1.0,
        "ter_max_quantile": 0.90,
        "sector_concentration_max": 1.0,
        "hhi_max": 1.0,
        "holding_top_max": 1.0,
    },
}

# FIX v2.2.7: Métriques requises par profil (colonnes qui ne doivent pas être NaN)
# FIX v2.2.8: Support tuples = "au moins une des colonnes" (OR)
# Permet de filtrer les ETF mal renseignés selon le niveau d'exigence du profil
PROFILE_REQUIRED_METRICS: Dict[str, List[Union[str, Tuple[str, ...]]]] = {
    "Stable": [("vol_3y_pct", "vol_pct"), "total_expense_ratio"],  # vol_3y OU vol_pct
    "Modéré": ["total_expense_ratio"],
    "Agressif": [],
}

# Règles hard par preset (évite faux positifs)
PRESET_RULES: Dict[str, Dict[str, float]] = {
    "coeur_global": {
        "ter_max": 0.35,
        "aum_min": 200_000_000,
        "holding_top_max": 0.12,
        "sector_trust_min": 0.30,
    },
    "min_vol_global": {
        "ter_max": 0.50,
        "vol_max": 18.0,
        "holding_top_max": 0.15,
    },
    "multi_factor": {
        "ter_max": 0.60,
        "aum_min": 100_000_000,
    },
    "rendement_etf": {
        "yield_min": 1.5,
        "ter_max": 0.80,
        "vol_max": 25.0,
    },
    "income_options": {
        "yield_min": 5.0,  # Options overlay = high yield
        "ter_max": 1.20,
    },
    "qualite_value": {
        "ter_max": 0.80,
    },
    "croissance_tech": {
        "ter_max": 1.00,
        "holding_top_max": 0.20,
        "momentum_3m_min": -5.0,  # Pas de tech en chute libre
    },
    "smid_quality": {
        "ter_max": 1.00,
        "aum_min": 50_000_000,
    },
    "emergents": {
        "ter_max": 1.20,
    },
    "sector_defensive": {
        "ter_max": 0.80,
        "vol_max": 20.0,
    },
    "sector_cyclical": {
        "ter_max": 1.00,
    },
    "inflation_shield": {
        "ter_max": 1.20,
    },
    "or_physique": {
        "ter_max": 1.00,
    },
    "commodities_broad": {
        "ter_max": 1.50,
    },
}

# Relaxation progressive si trop peu d'ETF passent
RELAX_STEPS: List[Tuple[str, float, float]] = [
    ("vol_max_quantile", +0.10, 1.00),
    ("ter_max_quantile", +0.10, 1.00),
    ("sector_concentration_max", +0.10, 1.00),
    ("holding_top_max", +0.05, 1.00),
    ("hhi_max", +0.05, 1.00),
]

# Scoring par profil (8 composantes)
# CONVENTION: 
# - Poids négatif = lower raw value is better (ex: vol -0.30 → low vol = bon)
# - Poids positif = higher raw value is better (ex: momentum 0.35 → high momentum = bon)
# Le signe encode la DIRECTION SOUHAITÉE, l'abs() encode l'IMPORTANCE
SCORING_WEIGHTS: Dict[str, Dict[str, float]] = {
    "Stable": {
        "vol": -0.30,           # Low vol prioritaire
        "ter": -0.20,           # Low TER important
        "aum": 0.10,            # High AUM = liquidité
        "diversif_sector": -0.15,  # Low concentration secteur = bon
        "diversif_holdings": -0.10, # Low concentration titres = bon
        "momentum": 0.08,       # High momentum = bonus
        "yield": 0.05,          # High yield = bonus
        "data_quality": 0.02,   # High quality = bon
    },
    "Modéré": {
        "vol": -0.15,
        "ter": -0.15,
        "aum": 0.10,
        "diversif_sector": -0.12,
        "diversif_holdings": -0.08,
        "momentum": 0.20,
        "yield": 0.15,
        "data_quality": 0.05,
    },
    "Agressif": {
        "momentum": 0.35,       # High momentum prioritaire
        "yield": 0.12,          # High yield = revenu
        "vol": 0.0,             # NEUTRE: on tolère toute vol, ni bonus ni malus
                                # (mettre -0.03 si légère préférence low vol voulue)
        "ter": -0.12,           # Low TER toujours bon
        "aum": 0.10,            # Liquidité
        "diversif_sector": -0.05,  # Concentration tolérée (poids faible)
        "diversif_holdings": -0.05, # Concentration tolérée (poids faible)
        "data_quality": 0.08,   # Qualité plus importante (positions risquées)
    },
}

# Buckets "tordus" (taxonomie)
ALT_PREFIX = "ALT_ASSET_"
BUCKET_STRUCTURED = {"STRUCTURED_VEHICLE"}
BUCKET_NON_STANDARD = {"NON_STANDARD", "INDEX_DERIVATIVE"}
BUCKET_DATA_MISSING = {"DATA_MISSING"}

# Secteurs défensifs vs cycliques (pour presets sectoriels)
SECTORS_DEFENSIVE = {"utilities", "healthcare", "consumer staples", "consumer defensive"}
SECTORS_CYCLICAL = {"financials", "financial services", "industrials", "materials", "energy"}
SECTORS_GROWTH = {"technology", "information technology", "communication services", "consumer discretionary", "consumer cyclical"}


# =============================================================================
# HELPERS - CONVERSION & EXTRACTION
# =============================================================================

def _to_numeric(series: pd.Series) -> pd.Series:
    """Conversion robuste vers numérique."""
    return pd.to_numeric(series, errors="coerce")


def _detect_ter_is_decimal(df: pd.DataFrame) -> bool:
    """
    Détecte si les données TER sont en décimal (0.0072 = 0.72%) ou en % (0.72 = 0.72%).
    
    FIX v2.2.7: Heuristique combinée q95 + max pour robustesse.
    - Si max(TER) > 1 → probablement "points de %" (car TER > 100% impossible)
    - Si q95 < 0.05 ET max < 0.20 → probablement décimal
    - Zone ambiguë → log warning, assume décimal par défaut
    
    FIX v2.2.10: Ajout heuristique q25 pour zone grise 0.10-1.0
    FIX v2.2.11: Option FORCE_TER_UNITS pour bypasser
    """
    # Option pour forcer
    if FORCE_TER_UNITS == "pct":
        return False
    if FORCE_TER_UNITS == "decimal":
        return True
    
    if "total_expense_ratio" not in df.columns:
        return True  # Assume decimal by default
    
    ter = _to_numeric(df["total_expense_ratio"]).dropna()
    ter = ter[ter > 0]  # Ignorer les valeurs nulles/négatives
    if len(ter) == 0:
        return True
    
    q95 = ter.quantile(0.95)
    q25 = ter.quantile(0.25)
    ter_max = ter.max()
    
    # Règle 1: Si max > 1, c'est forcément des points de % (TER > 100% impossible)
    if ter_max > 1.0:
        return False  # Points de %
    
    # Règle 2: Si q95 < 0.05 ET max < 0.20, très probablement décimal
    if q95 < 0.05 and ter_max < 0.20:
        return True  # Décimal
    
    # FIX v2.2.10: Zone grise 0.10-1.0
    # Si q25 > 0.05 et max < 1.0, probablement % (TER min réaliste ~0.03%)
    if q25 > 0.05 and ter_max < 1.0:
        logger.debug(
            f"[ETF] TER detected as percentage points: q25={q25:.4f}, max={ter_max:.4f}"
        )
        return False  # Points de %
    
    # Zone ambiguë: log warning et assume décimal
    if q95 < 0.10 and ter_max < 0.50:
        logger.warning(
            f"[ETF] TER units ambiguous: q95={q95:.4f}, max={ter_max:.4f}. "
            f"Assuming decimal. Override with explicit unit conversion if needed."
        )
        return True  # Assume décimal par défaut
    
    return False  # Points de %


def _detect_yield_is_decimal(df: pd.DataFrame) -> bool:
    """
    Détecte si les données yield sont en décimal (0.05 = 5%) ou en % (5.0 = 5%).
    
    FIX v2.2.9: Heuristique robuste avec q95 + max (comme TER).
    FIX v2.2.11: Meilleure gestion du cas ambigu (yields 0.2-1.0).
    
    ATTENTION: Si yield_ttm max < 1.0 mais q95 > 0.2, c'est probablement des points de %
    (yields réalistes en décimal: q95 typiquement < 0.10 soit 10%)
    """
    # Option pour forcer
    if FORCE_YIELD_UNITS == "pct":
        return False
    if FORCE_YIELD_UNITS == "decimal":
        return True
    
    if "yield_ttm" not in df.columns:
        return True
    
    yld = _to_numeric(df["yield_ttm"]).dropna()
    yld = yld[yld >= 0]  # Ignorer les valeurs négatives
    if len(yld) == 0:
        return True
    
    y_max = float(yld.max())
    q95 = float(yld.quantile(0.95))
    q50 = float(yld.quantile(0.50))
    
    # Règle 1: Si max > 1.0, c'est forcément du % (yield fraction ne peut pas dépasser 1)
    if y_max > 1.0:
        return False  # Points de %
    
    # Règle 2: Si q95 <= 0.12, très probablement décimal (12% yield en q95 = high yield funds)
    if q95 <= 0.12:
        return True  # Décimal
    
    # FIX v2.2.11: Zone ambiguë améliorée
    # Si max <= 1.0 MAIS q95 > 0.20, c'est suspect (20% yield en décimal = très rare)
    # Probablement des points de % (0.6 = 0.6%)
    if y_max <= 1.0 and q95 > 0.20:
        logger.warning(
            f"[ETF] Yield units LIKELY PERCENTAGE POINTS (not decimal): "
            f"max={y_max:.4f}, q95={q95:.4f}, q50={q50:.4f}. "
            f"If wrong, set FORCE_YIELD_UNITS='decimal'."
        )
        return False  # Probablement points de %
    
    # Zone vraiment ambiguë (q95 entre 0.12 et 0.20, max <= 1.0)
    if q95 > 0.12:
        logger.warning(
            f"[ETF] Yield units ambiguous: max={y_max:.4f}, q95={q95:.4f}. "
            f"Assuming decimal. Set FORCE_YIELD_UNITS to override."
        )
    
    return True  # Assume décimal par défaut


def _normalize_threshold_ter(threshold_pct: float, data_is_decimal: bool) -> float:
    """
    Convertit un seuil TER exprimé en % vers le format des données.
    
    Args:
        threshold_pct: Seuil en points de % (ex: 0.35 = 0.35%)
        data_is_decimal: True si données en décimal (0.0035), False si en % (0.35)
    
    Returns:
        Seuil normalisé au format des données
    """
    if data_is_decimal:
        return threshold_pct / 100.0  # 0.35% → 0.0035
    else:
        return threshold_pct  # 0.35% → 0.35


def _normalize_threshold_yield(threshold_pct: float, data_is_decimal: bool) -> float:
    """
    Convertit un seuil yield exprimé en % vers le format des données.
    
    Args:
        threshold_pct: Seuil en points de % (ex: 5.0 = 5%)
        data_is_decimal: True si données en décimal (0.05), False si en % (5.0)
    """
    if data_is_decimal:
        return threshold_pct / 100.0  # 5% → 0.05
    else:
        return threshold_pct  # 5% → 5.0


def _detect_weight_units_pct(df: pd.DataFrame) -> bool:
    """
    FIX v2.2.9: Détecte si les poids (holding_top, sector_top_weight) sont en % ou fraction.
    FIX v2.2.11: Ajout logging + détection de mix (alerte si données hétérogènes).
    
    Heuristique: Si on voit un poids > 1.0, c'est forcément du % (une fraction ne peut pas dépasser 1).
    
    Returns:
        True si les poids sont en % (ex: 15.0 = 15%), False si en fraction (ex: 0.15 = 15%)
    """
    # Option pour forcer
    if FORCE_WEIGHT_UNITS == "pct":
        return True
    if FORCE_WEIGHT_UNITS == "decimal":
        return False
    
    candidates = []
    col_stats = {}
    
    for col in ["sector_top_weight_pct", "sector_top_weight", "holding_top"]:
        if col in df.columns:
            s = _to_numeric(df[col]).dropna()
            if len(s) > 0:
                mx = float(s.max())
                candidates.append(mx)
                # FIX v2.2.11: Détecter les mix (certains > 1, d'autres < 1)
                pct_above_1 = (s > 1.0).sum() / len(s) * 100
                col_stats[col] = {"max": mx, "pct_above_1": pct_above_1}
    
    if not candidates:
        return True  # Assume % by default (plus courant)
    
    # FIX v2.2.11: Log si mix détecté
    for col, stats in col_stats.items():
        if 5 < stats["pct_above_1"] < 95:
            logger.warning(
                f"[ETF] MIXED UNITS DETECTED in {col}: {stats['pct_above_1']:.1f}% rows > 1.0. "
                f"Data may have inconsistent units. Set FORCE_WEIGHT_UNITS to override."
            )
    
    # Si max > 1.0, c'est forcément du %
    return max(candidates) > 1.0


def _is_weight_pct_row(value: float) -> bool:
    """
    FIX v2.2.11: Détection row-wise si un poids est en % ou fraction.
    Utile pour les cas où les données sont hétérogènes.
    
    Règle simple: si value > 1.0, c'est du %.
    """
    if pd.isna(value):
        return True  # Default
    return float(value) > 1.0


def _safe_series(df: pd.DataFrame, col: str) -> pd.Series:
    """Récupère une colonne ou retourne NaN."""
    return df[col] if col in df.columns else pd.Series(np.nan, index=df.index)


def _get_symbol(df: pd.DataFrame) -> pd.Series:
    """Récupère le symbole (etfsymbol ou symbol)."""
    for col in ["etfsymbol", "symbol"]:
        if col in df.columns:
            return df[col].fillna("").astype(str)
    return pd.Series("", index=df.index)


def _get_asset_bucket(df: pd.DataFrame) -> pd.Series:
    """
    Récupère le bucket de classification produit.
    
    Values: STANDARD, ALT_ASSET_COMMODITY, ALT_ASSET_CRYPTO, 
            NON_STANDARD, STRUCTURED_VEHICLE, DATA_MISSING, etc.
    
    NOTE: Dans certains schémas, cette info est dans "sector_bucket" (mal nommé).
    On cherche dans l'ordre: bucket, asset_bucket, sector_bucket
    et on valide que les valeurs correspondent à des classifications produit.
    """
    # Valeurs attendues pour un asset bucket (vs un vrai secteur)
    ASSET_BUCKET_VALUES = {
        "STANDARD", "ALT_ASSET_COMMODITY", "ALT_ASSET_CRYPTO", "ALT_ASSET_FX",
        "ALT_ASSET_VOLATILITY", "DATA_MISSING", "INDEX_DERIVATIVE", "NON_STANDARD",
        "SINGLE_STOCK", "SINGLE_STOCK_DERIVATIVE", "STRUCTURED_VEHICLE",
        "VERIFIED_FINANCIAL", "OPTIONS_OVERLAY"
    }
    
    for col in ["bucket", "asset_bucket", "sector_bucket"]:
        if col in df.columns:
            series = df[col].fillna("").astype(str).str.upper()
            # Vérifier que c'est bien un asset bucket (pas un secteur)
            unique_vals = set(series.unique())
            if unique_vals & ASSET_BUCKET_VALUES:  # Au moins une valeur connue
                return series
    
    return pd.Series("", index=df.index)


def _get_sector_bucket(df: pd.DataFrame) -> pd.Series:
    """
    Récupère le VRAI secteur (Technology, Financials, Healthcare, etc.).
    
    NOTE: Si "sector_bucket" contient des classifications produit (STANDARD, etc.),
    on utilise directement sector_top.
    """
    # Valeurs qui indiquent que c'est un asset bucket, pas un secteur
    ASSET_BUCKET_VALUES = {
        "STANDARD", "ALT_ASSET_COMMODITY", "ALT_ASSET_CRYPTO", "ALT_ASSET_FX",
        "ALT_ASSET_VOLATILITY", "DATA_MISSING", "INDEX_DERIVATIVE", "NON_STANDARD",
        "SINGLE_STOCK", "SINGLE_STOCK_DERIVATIVE", "STRUCTURED_VEHICLE",
        "VERIFIED_FINANCIAL", "OPTIONS_OVERLAY"
    }
    
    # Vérifier si sector_bucket contient des vrais secteurs ou des classifications
    if "sector_bucket" in df.columns:
        series = df["sector_bucket"].fillna("").astype(str).str.upper()
        unique_vals = set(series.unique())
        
        # Si c'est un asset bucket (mal nommé), ignorer et utiliser sector_top
        if unique_vals & ASSET_BUCKET_VALUES:
            pass  # Fallback sur sector_top
        else:
            # C'est un vrai secteur bucket
            return df["sector_bucket"].fillna("").astype(str).str.lower()
    
    # Fallback sur sector_top (c'est le vrai secteur)
    return _get_sector_top(df)


def _get_bucket(df: pd.DataFrame) -> pd.Series:
    """
    DEPRECATED: Utiliser _get_asset_bucket() ou _get_sector_bucket().
    Garde pour backward compat - retourne asset bucket.
    """
    return _get_asset_bucket(df)


def _get_reasons(df: pd.DataFrame) -> pd.Series:
    """Récupère les reasons."""
    if "reasons" in df.columns:
        return df["reasons"].fillna("").astype(str).str.upper()
    return pd.Series("", index=df.index)


def _flag_has_reason(reasons: pd.Series, token: str) -> pd.Series:
    """Vérifie si un token est présent dans reasons."""
    token = token.upper()
    return (
        reasons.str.contains(rf"(?:^|\|){re.escape(token)}(?:\||$)", regex=True) |
        reasons.str.contains(token, regex=False)
    )


def _get_vol(df: pd.DataFrame) -> pd.Series:
    """Récupère la volatilité (priorité vol_3y > vol_pct)."""
    v3y = _to_numeric(_safe_series(df, "vol_3y_pct"))
    v = _to_numeric(_safe_series(df, "vol_pct"))
    out = v3y.where((v3y.notna()) & (v3y > 0), v)
    return out.where((out.notna()) & (out > 0), np.nan)


def _get_sector_top_weight(df: pd.DataFrame) -> pd.Series:
    """Récupère le poids du top secteur (%)."""
    for col in ["sector_top_weight_pct", "sector_top_weight"]:
        if col in df.columns:
            return _to_numeric(df[col])
    return pd.Series(np.nan, index=df.index)


def _get_sector_top(df: pd.DataFrame) -> pd.Series:
    """Récupère le nom du top secteur (lowercase)."""
    if "sector_top" in df.columns:
        return df["sector_top"].fillna("").astype(str).str.lower()
    return pd.Series("", index=df.index)


def _get_sector_top_weight_frac(df: pd.DataFrame) -> pd.Series:
    """
    FIX v2.2.10: Récupère le poids du top secteur en FRACTION [0, 1].
    
    Utilise _sector_top_weight_frac si disponible (calculé par _compute_diversification_metrics),
    sinon calcule à la volée avec détection automatique des unités.
    """
    # Priorité: colonne pré-calculée
    if "_sector_top_weight_frac" in df.columns:
        frac = _to_numeric(df["_sector_top_weight_frac"])
        if not frac.isna().all():
            return frac.clip(0, 1)
    
    # Fallback: calcul à la volée
    secw = _get_sector_top_weight(df)
    if secw.isna().all():
        return secw
    
    weights_pct = _detect_weight_units_pct(df)
    if weights_pct:
        return (secw / 100.0).clip(0, 1)
    else:
        return secw.clip(0, 1)


def _get_holding_top_frac(df: pd.DataFrame) -> pd.Series:
    """
    FIX v2.2.10: Récupère le poids du top holding en FRACTION [0, 1].
    
    Utilise _holding_top_frac si disponible (calculé par _compute_diversification_metrics),
    sinon calcule à la volée avec détection automatique des unités.
    """
    # Priorité: colonne pré-calculée
    if "_holding_top_frac" in df.columns:
        frac = _to_numeric(df["_holding_top_frac"])
        if not frac.isna().all():
            return frac.clip(0, 1)
    
    # Fallback: calcul à la volée
    htop = _to_numeric(_safe_series(df, "holding_top"))
    if htop.isna().all():
        return htop
    
    weights_pct = _detect_weight_units_pct(df)
    if weights_pct:
        return (htop / 100.0).clip(0, 1)
    else:
        return htop.clip(0, 1)


# =============================================================================
# HELPERS - BUCKET GATES
# =============================================================================

def _is_alt_asset(bucket: pd.Series) -> pd.Series:
    """Vérifie si l'ETF est un actif alternatif."""
    return bucket.str.startswith(ALT_PREFIX)


def _is_crypto(bucket: pd.Series) -> pd.Series:
    """Vérifie si l'ETF est crypto."""
    return bucket.eq("ALT_ASSET_CRYPTO")


def _is_commodity(bucket: pd.Series) -> pd.Series:
    """Vérifie si l'ETF est commodity."""
    return bucket.eq("ALT_ASSET_COMMODITY")


def _is_fx(bucket: pd.Series) -> pd.Series:
    """Vérifie si l'ETF est FX."""
    return bucket.eq("ALT_ASSET_FX")


def _is_volatility(bucket: pd.Series) -> pd.Series:
    """Vérifie si l'ETF est volatilité."""
    return bucket.eq("ALT_ASSET_VOLATILITY")


def _is_structured(bucket: pd.Series, reasons: pd.Series) -> pd.Series:
    """Vérifie si l'ETF est un produit structuré."""
    return bucket.isin(BUCKET_STRUCTURED) | _flag_has_reason(reasons, "STRUCTURED_VEHICLE")


def _is_non_standard(bucket: pd.Series, reasons: pd.Series) -> pd.Series:
    """Vérifie si l'ETF est non-standard (ETN, dérivés d'indice)."""
    return (
        bucket.isin(BUCKET_NON_STANDARD) |
        _flag_has_reason(reasons, "NON_STANDARD") |
        _flag_has_reason(reasons, "INDEX_DERIVATIVE")
    )


def _is_options_overlay(reasons: pd.Series) -> pd.Series:
    """Vérifie si l'ETF utilise des options overlay."""
    return _flag_has_reason(reasons, "OPTIONS_OVERLAY")


_LEVERAGED_PATTERN = re.compile(
    r"(?:\b[2-9]x\b|\b-?[1-9]x\b|ultra|leveraged|inverse|short\b)",
    re.IGNORECASE
)

def _is_leveraged_or_inverse(df: pd.DataFrame) -> pd.Series:
    """
    Vérifie si l'ETF est leveraged/inverse.
    
    Détection multi-source:
    1. Colonne leverage != 0
    2. Reasons: NON_STANDARD_LEVERAGED, NON_STANDARD_INVERSE
    3. Pattern dans le nom (TQQQ, SQQQ, 2x, 3x, Ultra, etc.)
    
    FIX v2.2.10: Pattern resserré (retiré "long" trop large)
    """
    # Source 1: Colonne leverage
    leverage = _to_numeric(_safe_series(df, "leverage")).fillna(0)
    from_col = leverage.ne(0)
    
    # Source 2: Reasons flags
    reasons = _get_reasons(df)
    from_reasons = (
        _flag_has_reason(reasons, "NON_STANDARD_LEVERAGED") |
        _flag_has_reason(reasons, "NON_STANDARD_INVERSE") |
        _flag_has_reason(reasons, "LEVERAGED") |
        _flag_has_reason(reasons, "INVERSE")
    )
    
    # Source 3: Pattern dans le nom
    name = _safe_series(df, "name").fillna("").astype(str)
    from_name = name.str.contains(_LEVERAGED_PATTERN, regex=True, na=False)
    
    # Source 4: Symboles connus
    sym = _get_symbol(df).str.upper()
    known_leveraged = sym.str.match(r"^(TQQQ|SQQQ|SOXL|SOXS|UPRO|SPXU|SPXS|UVXY|SVXY|LABU|LABD|TNA|TZA|FAS|FAZ|NUGT|DUST|JNUG|JDST|ERX|ERY|TECL|TECS|FNGU|FNGD|UDOW|SDOW)$", na=False)
    
    return from_col | from_reasons | from_name | known_leveraged


# Backward compat alias
def _is_leveraged(df: pd.DataFrame) -> pd.Series:
    """Alias pour compatibilité."""
    return _is_leveraged_or_inverse(df)


def _equity_like_gate(df: pd.DataFrame, allow_data_missing: bool = True) -> pd.Series:
    """
    Gate "equity-like" - Exclut les ETF non-equity:
    - Crypto, FX, Volatility, Commodities (gérés via presets dédiés)
    - Structured, Non-standard, Options overlay
    - Leveraged/Inverse
    """
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    
    # Exclusions
    is_alt = _is_alt_asset(bucket)
    is_bad = (
        _is_structured(bucket, reasons) |
        _is_non_standard(bucket, reasons) |
        _is_options_overlay(reasons) |
        _is_leveraged(df)
    )
    
    ok = ~is_alt & ~is_bad
    
    if not allow_data_missing:
        ok &= ~bucket.isin(BUCKET_DATA_MISSING)
    
    return ok


# =============================================================================
# HELPERS - HHI & DIVERSIFICATION
# =============================================================================

def _is_likely_year(value: float) -> bool:
    """
    FIX v2.2.11: Détecte si une valeur numérique est probablement une année.
    """
    return 1900 <= value <= 2100


def _extract_weights(x: Any) -> List[float]:
    """
    Extrait les poids depuis différents formats (dict, list, string).
    
    FIX v2.2.10: Filtre f <= 50 pour exclure les années (2024, 2023...)
    FIX v2.2.11: Filtre "anti-année" explicite (1900-2100) + permet > 50% pour gold/single-stock
    """
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return []
    
    # Dict: {"sector": weight, ...}
    if isinstance(x, dict):
        vals = []
        for v in x.values():
            try:
                f = float(v)
                # FIX v2.2.11: Exclure les années, mais permettre > 50%
                if 0 < f <= 100 and not _is_likely_year(f):
                    vals.append(f)
            except Exception:
                pass
        return vals
    
    # List/Array: [{"s": "Tech", "w": 25}, ...] ou [25, 20, 15, ...]
    if isinstance(x, (list, tuple, np.ndarray)):
        vals = []
        for it in x:
            if isinstance(it, dict):
                for k in ("weight", "w", "pct", "percentage", "value"):
                    if k in it:
                        try:
                            f = float(it[k])
                            if 0 < f <= 100 and not _is_likely_year(f):
                                vals.append(f)
                            break
                        except Exception:
                            continue
            else:
                try:
                    f = float(it)
                    if 0 < f <= 100 and not _is_likely_year(f):
                        vals.append(f)
                except Exception:
                    continue
        return vals
    
    # String: "Tech:25,Finance:20,..." ou "[25, 20, 15]" ou JSON
    if isinstance(x, str):
        s = x.strip()
        if not s:
            return []
        
        # FIX v2.2.6: Tenter json.loads d'abord si ça ressemble à du JSON
        if s.startswith("[") or s.startswith("{"):
            try:
                import json
                obj = json.loads(s)
                return _extract_weights(obj)  # Récursion vers dict/list
            except Exception:
                pass  # Fallback vers regex
        
        # Fallback regex avec filtre anti-années
        nums = re.findall(r"[-+]?\d*\.?\d+", s.replace(",", "."))
        vals = []
        for n in nums:
            try:
                f = float(n)
                # FIX v2.2.11: 0 < f <= 100 ET pas une année
                if 0 < f <= 100 and not _is_likely_year(f):
                    vals.append(f)
            except Exception:
                pass
        return vals
    
    try:
        f = float(x)
        if 0 < f <= 100 and not _is_likely_year(f):
            return [f]
        return []
    except Exception:
        return []


def _weights_to_fraction(weights: List[float]) -> List[float]:
    """
    Convertit les poids en fractions [0, 1].
    
    FIX v2.2.10: Retrait règle sum > 1.2 (faux positifs).
    Seule règle fiable: max > 1.0 → données en %.
    
    Si max <= 1.0, c'est forcément des fractions (même si sum > 1 avec beaucoup de holdings).
    """
    if not weights:
        return []
    
    w = [float(x) for x in weights if x is not None and not (isinstance(x, float) and np.isnan(x))]
    if not w:
        return []
    
    mx = max(abs(x) for x in w)
    
    # FIX v2.2.10: Seule règle fiable
    # Si max > 1.0, c'est forcément du % (une fraction ne peut pas dépasser 1)
    if mx > 1.0:
        return [max(0.0, min(1.0, x / 100.0)) for x in w]
    
    # Sinon: déjà en fraction (même si sum > 1)
    return [max(0.0, min(1.0, x)) for x in w]


def _compute_hhi(weights: List[float]) -> Optional[float]:
    """Calcule l'indice Herfindahl-Hirschman (0 = parfaitement diversifié, 1 = concentré)."""
    w = _weights_to_fraction(weights)
    if not w:
        return None
    return float(sum(x * x for x in w))


def _get_max_holding_from_top10(x: Any) -> float:
    """
    FIX v2.2.10: Extrait le max holding depuis holdings_top10.
    Plus fiable que holding_top car on a le contexte des autres holdings.
    """
    w = _weights_to_fraction(_extract_weights(x))
    return max(w) if w else np.nan


def _compute_diversification_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ajoute les métriques de diversification:
    - _hhi_sector: HHI basé sur sector_top5
    - _hhi_holdings: HHI basé sur holdings_top10
    - _hhi_blend: Moyenne pondérée (40% sector, 60% holdings)
    - _holding_top_frac: Poids du top holding (fraction)
    - _top10_frac: Somme des poids top 10
    - _sector_top_weight_frac: Poids du top secteur (fraction)
    
    FIX v2.2.10: holding_top_frac dérivé de holdings_top10 en priorité
    """
    out = df.copy()
    
    # HHI Sector
    hhi_sector = pd.Series(np.nan, index=df.index)
    if "sector_top5" in df.columns:
        hhi_sector = df["sector_top5"].apply(
            lambda x: _compute_hhi(_extract_weights(x))
        )
    out["_hhi_sector"] = hhi_sector
    
    # HHI Holdings
    hhi_holdings = pd.Series(np.nan, index=df.index)
    if "holdings_top10" in df.columns:
        hhi_holdings = df["holdings_top10"].apply(
            lambda x: _compute_hhi(_extract_weights(x))
        )
    out["_hhi_holdings"] = hhi_holdings
    
    # HHI Blend (pondéré: holdings plus critique)
    # 40% sector, 60% holdings
    hhi_blend = pd.Series(np.nan, index=df.index)
    has_sector = hhi_sector.notna()
    has_holdings = hhi_holdings.notna()
    
    # Les deux disponibles
    both = has_sector & has_holdings
    hhi_blend = hhi_blend.where(
        ~both,
        0.4 * hhi_sector + 0.6 * hhi_holdings
    )
    # Seulement sector
    only_sector = has_sector & ~has_holdings
    hhi_blend = hhi_blend.where(~only_sector, hhi_sector)
    # Seulement holdings
    only_holdings = has_holdings & ~has_sector
    hhi_blend = hhi_blend.where(~only_holdings, hhi_holdings)
    
    out["_hhi_blend"] = hhi_blend
    
    # FIX v2.2.10: Holding top (fraction) - priorité holdings_top10
    holding_top_frac = pd.Series(np.nan, index=df.index)
    
    # Source 1: holdings_top10 (plus fiable car on a le contexte)
    if "holdings_top10" in df.columns:
        holding_top_frac = df["holdings_top10"].apply(_get_max_holding_from_top10)
    
    # Source 2: fallback sur holding_top si NaN
    missing = holding_top_frac.isna()
    if missing.any() and "holding_top" in df.columns:
        ht = _to_numeric(df["holding_top"])
        weights_pct = _detect_weight_units_pct(df)
        if weights_pct:
            fallback = (ht / 100.0).clip(0, 1)
        else:
            fallback = ht.clip(0, 1)
        holding_top_frac = holding_top_frac.where(~missing, fallback)
    
    out["_holding_top_frac"] = holding_top_frac.clip(0, 1)
    
    # Sector top weight (fraction)
    weights_are_pct = _detect_weight_units_pct(df)
    secw = _get_sector_top_weight(df)
    if weights_are_pct:
        out["_sector_top_weight_frac"] = (secw / 100.0).clip(0, 1)
    else:
        out["_sector_top_weight_frac"] = secw.clip(0, 1)
    
    # Top 10 sum (fraction)
    top10_frac = pd.Series(np.nan, index=df.index)
    if "holdings_top10" in df.columns:
        def _sum_top10(x):
            w = _weights_to_fraction(_extract_weights(x))
            return float(sum(w)) if w else np.nan
        top10_frac = df["holdings_top10"].apply(_sum_top10)
    out["_top10_frac"] = top10_frac
    
    return out


# =============================================================================
# HELPERS - MOMENTUM
# =============================================================================

def _compute_momentum(df: pd.DataFrame) -> pd.Series:
    """
    Calcule le momentum composite (4 horizons).
    Pondérations: daily 5%, 1m 25%, 3m 35%, YTD 15%, 1Y 20%
    
    FIX v2.2.10: Retourne NaN si > 2 composantes manquantes
    (évite de favoriser les ETF sans données vs ceux avec perf négative)
    """
    daily = _to_numeric(_safe_series(df, "daily_change_pct"))
    m1 = _to_numeric(_safe_series(df, "perf_1m_pct"))
    m3 = _to_numeric(_safe_series(df, "perf_3m_pct"))
    ytd = _to_numeric(_safe_series(df, "ytd_return_pct"))
    y1 = _to_numeric(_safe_series(df, "one_year_return_pct"))
    
    # Compter les NaN par ligne
    n_missing = (
        daily.isna().astype(int) +
        m1.isna().astype(int) +
        m3.isna().astype(int) +
        ytd.isna().astype(int) +
        y1.isna().astype(int)
    )
    
    # Calcul avec fillna(0) pour le calcul
    result = (
        0.05 * daily.fillna(0.0) +
        0.25 * m1.fillna(0.0) +
        0.35 * m3.fillna(0.0) +
        0.15 * ytd.fillna(0.0) +
        0.20 * y1.fillna(0.0)
    )
    
    # FIX v2.2.10: Si > 2 composantes NaN, retourner NaN
    result = result.where(n_missing <= 2, np.nan)
    
    return result


# =============================================================================
# HELPERS - SCORING
# =============================================================================

def _rank_percentile(
    series: pd.Series,
    higher_is_better: bool = True,
    penalize_missing: Optional[bool] = None
) -> pd.Series:
    """
    Calcule le rang percentile [0, 1].
    - higher_is_better: True = valeur haute = bon score
    - penalize_missing: 
        - True = NaN → 0.0
        - False = NaN → 0.5
        - None = NaN reste NaN (FIX v2.2.7)
    """
    ranked = series.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    
    if penalize_missing is None:
        return ranked  # Laisse les NaN pour traitement ultérieur
    return ranked.fillna(0.0 if penalize_missing else 0.5)


def _normalize_0_100(x: pd.Series) -> pd.Series:
    """Normalise vers [0, 100]."""
    x = x.fillna(0.0)
    lo, hi = float(x.min()), float(x.max())
    if hi - lo < 1e-12:
        return pd.Series(50.0, index=x.index)
    return 100.0 * (x - lo) / (hi - lo)


def _q_threshold(series: pd.Series, q: float, min_n: int = None) -> Optional[float]:
    """Calcule le seuil quantile si assez de données."""
    if min_n is None:
        min_n = MIN_N_FOR_QUANTILE  # FIX v2.2.10: Utiliser la constante globale
    if series.notna().sum() < min_n:
        return None
    return float(series.quantile(q))


def _q_ok(series: pd.Series, q: float, op: str, min_n: int = None) -> pd.Series:
    """
    Vérifie si les valeurs respectent le quantile.
    - op: "<=" ou ">="
    - Si pas assez de données, retourne True pour tous
    
    FIX v2.2.10: min_n utilise MIN_N_FOR_QUANTILE par défaut
    """
    if min_n is None:
        min_n = MIN_N_FOR_QUANTILE
    
    thr = _q_threshold(series, q, min_n)
    if thr is None:
        return pd.Series(True, index=series.index)
    
    if op == "<=":
        return (series <= thr) | series.isna()
    if op == ">=":
        return (series >= thr) | series.isna()
    return pd.Series(True, index=series.index)


# =============================================================================
# DATA QUALITY FILTERS (Couche 0)
# =============================================================================

def apply_data_qc_filters(df: pd.DataFrame) -> pd.DataFrame:
    """
    Couche 0: Filtres qualité données (communs à tous profils).
    
    - data_quality_score >= seuil
    - leverage = 0
    - AUM minimum
    - TER > 0
    - Exclut les bonds (traités séparément)
    """
    if df.empty:
        return df
    
    mask = pd.Series(True, index=df.index)
    
    # Data quality score
    if "data_quality_score" in df.columns:
        dqs = _to_numeric(df["data_quality_score"])
        mask &= (dqs >= MIN_DATA_QUALITY_SCORE) | dqs.isna()
    
    # FIX v2.2.6: Pas de levier NI inverse (utilise _is_leveraged_or_inverse)
    # Avant: lev <= 0 laissait passer les inverses (leverage = -1)
    mask &= ~_is_leveraged_or_inverse(df)
    
    # AUM minimum
    if "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        mask &= (aum >= MIN_AUM_USD) | aum.isna()
    
    # TER > 0
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        mask &= (ter > 0) | ter.isna()
    
    # Exclure les bonds
    if "fund_type" in df.columns:
        ft = df["fund_type"].fillna("").str.lower()
        is_bond = ft.str.contains("bond|obligation|fixed income", regex=True)
        mask &= ~is_bond
    
    out = df[mask].copy()
    logger.info(f"[ETF] Data QC: {len(df)} → {len(out)} ({len(df) - len(out)} exclus)")
    
    return out


# =============================================================================
# HARD CONSTRAINTS + RELAXATION (Couche 1)
# =============================================================================

def _apply_constraints_once(df: pd.DataFrame, constraints: Dict[str, float]) -> pd.DataFrame:
    """
    Applique les contraintes hard une fois.
    
    FIX v2.2.10: Les contraintes quantiles utilisent notna().sum() >= MIN_N
    au lieu de len(df) >= MIN_N (plus correct pour univers avec NaN).
    """
    if df.empty:
        return df
    
    mask = pd.Series(True, index=df.index)
    
    # Volatilité max (quantile) - seulement si assez de données non-NaN
    vol = _get_vol(df)
    vol_q = constraints.get("vol_max_quantile", 1.0)
    n_vol = vol.notna().sum()  # FIX v2.2.10
    if n_vol >= MIN_N_FOR_QUANTILE and vol_q < 1.0:
        thr = float(vol.quantile(vol_q))
        mask &= (vol <= thr) | vol.isna()
    
    # TER max (quantile) - seulement si assez de données non-NaN
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    ter_q = constraints.get("ter_max_quantile", 1.0)
    n_ter = ter.notna().sum()  # FIX v2.2.10
    if n_ter >= MIN_N_FOR_QUANTILE and ter_q < 1.0:
        thr = float(ter.quantile(ter_q))
        mask &= (ter <= thr) | ter.isna()
    
    # Concentration secteur (top sector weight fraction)
    # FIX v2.2.10: Utilise _get_sector_top_weight_frac() helper
    secw_frac = _get_sector_top_weight_frac(df)
    sec_max = float(constraints.get("sector_concentration_max", 1.0))
    if sec_max < 1.0:
        mask &= (secw_frac <= sec_max) | secw_frac.isna()
    
    # Holding top (fraction)
    htop = _get_holding_top_frac(df)
    htop_max = float(constraints.get("holding_top_max", 1.0))
    if htop_max < 1.0:
        mask &= (htop <= htop_max) | htop.isna()
    
    # HHI blend
    hhi = _to_numeric(_safe_series(df, "_hhi_blend"))
    hhi_max = float(constraints.get("hhi_max", 1.0))
    if hhi_max < 1.0:
        mask &= (hhi <= hhi_max) | hhi.isna()
    
    return df[mask].copy()


def apply_hard_constraints(
    df: pd.DataFrame,
    profile: str,
    target_min: int = 15
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Couche 1: Contraintes hard avec relaxation progressive.
    
    Args:
        df: DataFrame avec métriques de diversification calculées
        profile: "Stable", "Modéré", ou "Agressif"
        target_min: Nombre minimum d'ETF cible
    
    Returns:
        (df_filtered, meta)
    """
    meta: Dict[str, Any] = {"profile": profile, "relaxation": []}
    
    if df.empty:
        meta.update({"before": 0, "after": 0})
        return df, meta
    
    if profile not in PROFILE_CONSTRAINTS:
        meta.update({"before": len(df), "after": len(df), "skipped": True})
        return df, meta
    
    base = PROFILE_CONSTRAINTS[profile].copy()
    meta["before"] = len(df)
    
    # Premier essai
    d1 = _apply_constraints_once(df, base)
    meta["after_initial"] = len(d1)
    
    # Si assez d'ETF, on s'arrête
    if len(d1) >= target_min or len(df) <= target_min:
        meta["after"] = len(d1)
        logger.info(f"[ETF {profile}] Hard constraints: {len(df)} → {len(d1)}")
        return d1, meta
    
    # Relaxation progressive
    constraints = base.copy()
    for key, delta, limit in RELAX_STEPS:
        if key not in constraints:
            continue
        
        old = float(constraints[key])
        new = min(old + delta, limit)
        constraints[key] = new
        
        d_try = _apply_constraints_once(df, constraints)
        meta["relaxation"].append({
            "key": key,
            "old": old,
            "new": new,
            "after": len(d_try)
        })
        
        if len(d_try) >= target_min:
            d1 = d_try
            break
    
    meta["after"] = len(d1)
    logger.info(f"[ETF {profile}] Hard constraints: {len(df)} → {len(d1)} (relaxation: {len(meta['relaxation'])} steps)")
    
    return d1, meta


# =============================================================================
# PRESET RULES VALIDATION
# =============================================================================

def _check_preset_rules(df: pd.DataFrame, preset: str) -> pd.Series:
    """Vérifie les règles hard d'un preset.
    
    FIX v2.2.5: Auto-détection des unités TER/yield (décimal vs %)
    et normalisation des seuils pour correspondre au format des données.
    """
    rules = PRESET_RULES.get(preset, {})
    if not rules:
        return pd.Series(True, index=df.index)
    
    mask = pd.Series(True, index=df.index)
    
    # === Auto-détection des unités ===
    ter_is_decimal = _detect_ter_is_decimal(df)
    yield_is_decimal = _detect_yield_is_decimal(df)
    
    # TER max (seuils exprimés en points de %, ex: 0.35 = 0.35%)
    if "ter_max" in rules and "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        ter_threshold = _normalize_threshold_ter(rules["ter_max"], ter_is_decimal)
        mask &= (ter <= ter_threshold) | ter.isna()
    
    # AUM min
    if "aum_min" in rules and "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        mask &= (aum >= rules["aum_min"]) | aum.isna()
    
    # Yield min (seuils exprimés en %, ex: 5.0 = 5%)
    if "yield_min" in rules and "yield_ttm" in df.columns:
        yld = _to_numeric(df["yield_ttm"])
        yield_threshold = _normalize_threshold_yield(rules["yield_min"], yield_is_decimal)
        mask &= (yld >= yield_threshold) | yld.isna()
    
    # Vol max (déjà en % dans les données, pas de conversion)
    if "vol_max" in rules:
        vol = _get_vol(df)
        mask &= (vol <= rules["vol_max"]) | vol.isna()
    
    # Holding top max - FIX v2.2.10: utilise _get_holding_top_frac()
    if "holding_top_max" in rules:
        htop = _get_holding_top_frac(df)
        mask &= (htop <= rules["holding_top_max"]) | htop.isna()
    
    # Sector trust min
    if "sector_trust_min" in rules and "sector_trust" in df.columns:
        st = _to_numeric(df["sector_trust"])
        mask &= (st >= rules["sector_trust_min"]) | st.isna()
    
    # Momentum 3m min
    if "momentum_3m_min" in rules and "perf_3m_pct" in df.columns:
        m3 = _to_numeric(df["perf_3m_pct"])
        mask &= (m3 >= rules["momentum_3m_min"]) | m3.isna()
    
    return mask


# =============================================================================
# PRESET FILTERS (Couche 2)
# =============================================================================

def _preset_coeur_global(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Cœur Global
    World core UCITS, TER bas, AUM élevé, diversifié.
    
    FIX v2.2.10: Utilise _get_sector_top_weight_frac() avec seuil 0.35
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    # Qualité sector data
    if "sector_signal_ok" in df.columns:
        mask &= df["sector_signal_ok"].fillna(True) == True
    if "sector_trust" in df.columns:
        st = _to_numeric(df["sector_trust"])
        mask &= (st >= 0.30) | st.isna()
    
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    aum = _to_numeric(_safe_series(df, "aum_usd"))
    
    # FIX v2.2.10: Utilise fraction (0.35) au lieu de % (35)
    secw_frac = _get_sector_top_weight_frac(df)
    
    mask &= _q_ok(ter, 0.40, "<=")
    mask &= _q_ok(aum, 0.60, ">=")
    mask &= (secw_frac <= 0.35) | secw_frac.isna()
    
    return mask & _check_preset_rules(df, "coeur_global")


def _preset_min_vol_global(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Minimum Volatility Global
    ETF low vol, core défensif.
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    vol = _get_vol(df)
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    aum = _to_numeric(_safe_series(df, "aum_usd"))
    
    mask &= _q_ok(vol, 0.25, "<=")
    mask &= _q_ok(ter, 0.50, "<=")
    mask &= _q_ok(aum, 0.40, ">=")
    
    return mask & _check_preset_rules(df, "min_vol_global")


def _preset_multi_factor(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Multi-Factor
    ETF factoriels (Quality, Value, Momentum, Size, Multi-Factor).
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    
    kw_mask = pd.Series(False, index=df.index)
    factor_keywords = [
        "factor", "multi-factor", "multifactor", "quality", "value",
        "momentum", "size", "low volatility", "min vol", "fundamental",
        "garp", "smart beta", "strategic beta"
    ]
    for kw in factor_keywords:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    
    return mask & kw_mask & _check_preset_rules(df, "multi_factor")


def _preset_rendement_etf(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Rendement ETF
    Dividend yield élevé, vol contenue (PAS options overlay).
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    # Exclure options overlay (géré par income_options)
    reasons = _get_reasons(df)
    mask &= ~_is_options_overlay(reasons)
    
    yld = _to_numeric(_safe_series(df, "yield_ttm"))
    vol = _get_vol(df)
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    
    mask &= _q_ok(yld, 0.60, ">=")
    mask &= _q_ok(vol, 0.70, "<=")
    mask &= _q_ok(ter, 0.70, "<=")
    
    return mask & _check_preset_rules(df, "rendement_etf")


def _preset_income_options(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Income Options
    Covered call, buywrite (JEPI, JEPQ, YieldMax, etc.).
    
    FIX v2.2.10: Ajout check ~_is_leveraged_or_inverse()
    """
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    
    # Doit avoir OPTIONS_OVERLAY
    is_options = _is_options_overlay(reasons)
    
    # Pas structured/non-standard
    not_bad = ~_is_structured(bucket, reasons) & ~_is_non_standard(bucket, reasons)
    
    # FIX v2.2.10: Pas leveraged/inverse
    not_leveraged = ~_is_leveraged_or_inverse(df)
    
    return is_options & not_bad & not_leveraged & _check_preset_rules(df, "income_options")


def _preset_qualite_value(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Qualité/Value
    Quality/Value factor proxy (via objective/name).
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    
    kw_mask = pd.Series(False, index=df.index)
    keywords = ["value", "quality", "dividend", "fundamental", "garp"]
    for kw in keywords:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    
    # Fallback: yield + aum élevés
    yld = _to_numeric(_safe_series(df, "yield_ttm"))
    aum = _to_numeric(_safe_series(df, "aum_usd"))
    fallback = _q_ok(yld, 0.50, ">=") & _q_ok(aum, 0.60, ">=")
    kw_mask |= fallback
    
    return mask & kw_mask & _check_preset_rules(df, "qualite_value")


def _preset_croissance_tech(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Croissance Tech
    Tech/Growth, momentum positif.
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    sector = _get_sector_top(df)
    
    kw_mask = pd.Series(False, index=df.index)
    keywords = [
        "tech", "technology", "growth", "innovation", "digital",
        "software", "semiconductor", "ai", "cloud", "nasdaq", "qqq"
    ]
    for kw in keywords:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    
    # Via sector_top
    kw_mask |= sector.str.contains("tech|software|semi|information technology", regex=True)
    
    # Momentum positif (1m ou 3m)
    p1m = _to_numeric(_safe_series(df, "perf_1m_pct"))
    p3m = _to_numeric(_safe_series(df, "perf_3m_pct"))
    mom_ok = (p1m > 0) | (p3m > 0)
    
    return mask & kw_mask & (mom_ok | mom_ok.isna()) & _check_preset_rules(df, "croissance_tech")


def _preset_smid_quality(df: pd.DataFrame) -> pd.Series:
    """
    Preset: SMID Quality
    Small/Mid caps.
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    ft = _safe_series(df, "fund_type").fillna("").astype(str).str.lower()
    
    kw_mask = pd.Series(False, index=df.index)
    keywords = ["small", "mid", "smid", "micro", "russell 2000", "msci small", "s&p 600", "s&p 400"]
    for kw in keywords:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    kw_mask |= ft.str.contains("small|mid|smid", regex=True)
    
    return mask & kw_mask & _check_preset_rules(df, "smid_quality")


def _preset_emergents(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Marchés Émergents
    EM diversifiés + régions asiatiques/latam/africa.
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    ft = _safe_series(df, "fund_type").fillna("").astype(str).str.lower()
    
    kw_mask = pd.Series(False, index=df.index)
    keywords = [
        # EM génériques
        "emerging", "émergent", "frontier", "developing", "em ", "em-", "msci em", "ftse em",
        # Régions Asie (hors Japon/Australie développés)
        "asia ex", "asia-pac", "asian", "asie", 
        "china", "chinese", "chine", "hong kong",
        "india", "indian", "inde",
        "korea", "korean", "corée",
        "taiwan", "taïwan",
        "southeast asia", "asean",
        "vietnam", "indonesia", "thailand", "philippines", "malaysia",
        # Amérique Latine
        "latin america", "latam", "amérique latine",
        "brazil", "brazilian", "brésil",
        "mexico", "mexican", "mexique",
        # Autres EM
        "africa", "african", "afrique",
        "middle east", "moyen-orient",
        "bric", "brics",
    ]
    for kw in keywords:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    kw_mask |= ft.str.contains("emerging|emerg|asia|pacific", regex=True)
    
    return mask & kw_mask & _check_preset_rules(df, "emergents")


def _preset_sector_defensive(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Sector Defensive
    Utilities, Healthcare, Consumer Staples.
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    # Via sector_bucket OU sector_top (PAS asset bucket!)
    sector_bucket = _get_sector_bucket(df)  # lowercase
    sector_top = _get_sector_top(df)  # lowercase
    
    sector_ok = pd.Series(False, index=df.index)
    for s in SECTORS_DEFENSIVE:
        sector_ok |= sector_bucket.str.contains(s, regex=False)
        sector_ok |= sector_top.str.contains(s, regex=False)
    
    # Via objective/name
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    for s in SECTORS_DEFENSIVE:
        sector_ok |= obj.str.contains(s, regex=False)
        sector_ok |= name.str.contains(s, regex=False)
    
    # Vol contenue
    vol = _get_vol(df)
    vol_ok = _q_ok(vol, 0.50, "<=")
    
    return mask & sector_ok & vol_ok & _check_preset_rules(df, "sector_defensive")


def _preset_sector_cyclical(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Sector Cyclical
    Financials, Industrials, Materials, Energy.
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    # Via sector_bucket OU sector_top (PAS asset bucket!)
    sector_bucket = _get_sector_bucket(df)  # lowercase
    sector_top = _get_sector_top(df)  # lowercase
    
    sector_ok = pd.Series(False, index=df.index)
    for s in SECTORS_CYCLICAL:
        sector_ok |= sector_bucket.str.contains(s, regex=False)
        sector_ok |= sector_top.str.contains(s, regex=False)
    
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    for s in SECTORS_CYCLICAL:
        sector_ok |= obj.str.contains(s, regex=False)
        sector_ok |= name.str.contains(s, regex=False)
    
    return mask & sector_ok & _check_preset_rules(df, "sector_cyclical")


def _preset_inflation_shield(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Inflation Shield
    TIPS, commodities, real assets, REIT, infrastructure.
    """
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    
    # Pas structured/non-standard/crypto
    not_bad = (
        ~_is_structured(bucket, reasons) &
        ~_is_non_standard(bucket, reasons) &
        ~_is_crypto(bucket) &
        ~_is_options_overlay(reasons)
    )
    
    # Commodities OK
    is_commodity = _is_commodity(bucket)
    
    # Equity-like avec secteurs real assets
    eq_like = _equity_like_gate(df, allow_data_missing=True)
    sector = _get_sector_top(df)
    sector_ok = sector.str.contains("energy|materials|utilities|real estate", regex=True)
    
    # Keywords
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    kw_mask = pd.Series(False, index=df.index)
    keywords = [
        "tips", "inflation", "protected", "real assets", "commodity",
        "commodities", "natural resources", "infrastructure", "reit", "real estate"
    ]
    for kw in keywords:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    
    return not_bad & (is_commodity | (eq_like & (sector_ok | kw_mask))) & _check_preset_rules(df, "inflation_shield")


def _preset_or_physique(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Or Physique
    Gold physical ETF.
    """
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    
    # Commodity clean (pas options overlay, pas structured)
    base = (
        _is_commodity(bucket) &
        ~_is_options_overlay(reasons) &
        ~_is_structured(bucket, reasons)
    )
    
    # Keywords gold
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    
    gold_kw = pd.Series(False, index=df.index)
    # FIX v2.2.6: Suppression de "or " qui matchait trop large (Corporate, World, Morgan...)
    # Les ETF or utilisent généralement "gold" ou sont dans la whitelist
    keywords = ["gold", "physical gold", "bullion", "lingot", "or physique"]
    for kw in keywords:
        gold_kw |= obj.str.contains(kw.strip(), regex=False)
        gold_kw |= name.str.contains(kw.strip(), regex=False)
    
    # Whitelist symboles
    sym = _get_symbol(df).str.upper()
    gold_whitelist = sym.isin([
        "GLD", "IAU", "GLDM", "SGOL", "IAUM", "AAAU", "PHYS", "BAR", "OUNZ",
        "GOLD", "EGLN", "IGLN", "4GLD", "ZGLD"
    ])
    
    return base & (gold_kw | gold_whitelist) & _check_preset_rules(df, "or_physique")


def _preset_commodities_broad(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Commodities Broad
    Commodities diversifiées (hors gold pur).
    """
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    
    # Commodity clean
    base = (
        _is_commodity(bucket) &
        ~_is_options_overlay(reasons) &
        ~_is_structured(bucket, reasons)
    )
    
    # Exclure gold pur (géré par or_physique)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    sym = _get_symbol(df).str.upper()
    
    gold_only = (
        obj.str.contains("gold", regex=False) &
        ~obj.str.contains("commodity|commodities|broad|diversified", regex=True)
    )
    gold_whitelist = sym.isin(["GLD", "IAU", "GLDM", "SGOL", "IAUM", "AAAU", "PHYS", "BAR", "OUNZ"])
    
    not_gold_only = ~gold_only & ~gold_whitelist
    
    return base & not_gold_only & _check_preset_rules(df, "commodities_broad")


# Mapping preset → fonction
PRESET_FUNCTIONS: Dict[str, Callable[[pd.DataFrame], pd.Series]] = {
    "coeur_global": _preset_coeur_global,
    "min_vol_global": _preset_min_vol_global,
    "multi_factor": _preset_multi_factor,
    "rendement_etf": _preset_rendement_etf,
    "income_options": _preset_income_options,
    "qualite_value": _preset_qualite_value,
    "croissance_tech": _preset_croissance_tech,
    "smid_quality": _preset_smid_quality,
    "emergents": _preset_emergents,
    "sector_defensive": _preset_sector_defensive,
    "sector_cyclical": _preset_sector_cyclical,
    "inflation_shield": _preset_inflation_shield,
    "or_physique": _preset_or_physique,
    "commodities_broad": _preset_commodities_broad,
}


# =============================================================================
# PRESET UNION & ASSIGNMENT
# =============================================================================

def apply_presets_union(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """Couche 2: Union des presets pour le profil."""
    if df.empty:
        return df
    
    presets = PROFILE_PRESETS.get(profile, [])
    if not presets:
        logger.warning(f"[ETF] Aucun preset défini pour profil {profile}")
        return df
    
    mask = pd.Series(False, index=df.index)
    preset_counts = {}
    
    for p in presets:
        fn = PRESET_FUNCTIONS.get(p)
        if not fn:
            continue
        p_mask = fn(df)
        count = p_mask.sum()
        preset_counts[p] = count
        mask |= p_mask
    
    out = df[mask].copy()
    logger.info(f"[ETF {profile}] Presets union: {len(df)} → {len(out)}")
    logger.debug(f"[ETF {profile}] Preset counts: {preset_counts}")
    
    return out


def assign_best_preset(df: pd.DataFrame, profile: str) -> pd.Series:
    """Assigne le meilleur preset à chaque ETF (premier match dans l'ordre de priorité)."""
    presets = PROFILE_PRESETS.get(profile, [])
    if not presets:
        return pd.Series("", index=df.index)
    
    assigned = pd.Series("", index=df.index)
    
    # Pré-calculer les masques
    preset_masks = {}
    for p in presets:
        fn = PRESET_FUNCTIONS.get(p)
        if fn:
            preset_masks[p] = fn(df)
    
    # Assigner dans l'ordre
    for p in presets:
        m = preset_masks.get(p)
        if m is None:
            continue
        assigned = assigned.mask((assigned == "") & m, p)
    
    return assigned


# =============================================================================
# SCORING (Couche 3)
# =============================================================================

def compute_profile_score(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """
    Calcule le _profile_score pour chaque ETF.
    
    Scoring à 8 composantes avec pondérations signées:
    - Poids positif = higher is better
    - Poids négatif = lower is better
    
    FIX v2.2.10: Utilise _sector_top_weight_frac et _holding_top_frac
    """
    if df.empty:
        return df
    
    df = df.copy()
    weights = SCORING_WEIGHTS.get(profile, SCORING_WEIGHTS["Modéré"])
    
    # Métriques brutes
    vol = _get_vol(df)
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    aum = _to_numeric(_safe_series(df, "aum_usd"))
    yld = _to_numeric(_safe_series(df, "yield_ttm"))
    momentum_raw = _compute_momentum(df)
    
    # FIX v2.2.10: Utilise les colonnes pré-calculées (fraction)
    secw_frac = _get_sector_top_weight_frac(df)
    htop_frac = _get_holding_top_frac(df)
    
    hhi_sector = _to_numeric(_safe_series(df, "_hhi_sector"))
    hhi_holdings = _to_numeric(_safe_series(df, "_hhi_holdings"))
    dqs = _to_numeric(_safe_series(df, "data_quality_score"))
    
    # Scores par composante
    # CONVENTION: TOUS les scores sont calculés avec higher_is_better=True
    # Le signe du poids dans SCORING_WEIGHTS fait l'inversion:
    #   - Poids négatif → "lower raw value is better" → on applique (1 - score)
    #   - Poids positif → "higher raw value is better" → on garde score tel quel
    # FIX v2.2.7: penalize_missing=None pour GARDER les NaN jusqu'au fill final
    scores = pd.DataFrame(index=df.index)
    
    # Vol: high vol → high score (le poids négatif inversera pour favoriser low vol)
    # penalize_missing=None pour garder NaN jusqu'au fill selon signe
    scores["vol"] = _rank_percentile(vol, higher_is_better=True, penalize_missing=None)
    
    # TER: high TER → high score (le poids négatif inversera pour favoriser low TER)
    scores["ter"] = _rank_percentile(ter, higher_is_better=True, penalize_missing=None)
    
    # AUM: high AUM → high score (poids positif = on veut high AUM)
    scores["aum"] = _rank_percentile(aum, higher_is_better=True, penalize_missing=None)
    
    # Yield: high yield → high score
    scores["yield"] = _rank_percentile(yld, higher_is_better=True, penalize_missing=None)
    
    # Momentum: high momentum → high score
    scores["momentum"] = _rank_percentile(momentum_raw, higher_is_better=True, penalize_missing=None)
    
    # FIX v2.2.10: Diversif sector: utilise secw_frac (déjà en fraction)
    diversif_sector = secw_frac.combine_first(hhi_sector)
    scores["diversif_sector"] = _rank_percentile(diversif_sector, higher_is_better=True, penalize_missing=None)
    
    # FIX v2.2.10: Diversif holdings: utilise htop_frac (déjà en fraction)
    diversif_holdings = htop_frac.combine_first(hhi_holdings)
    scores["diversif_holdings"] = _rank_percentile(diversif_holdings, higher_is_better=True, penalize_missing=None)
    
    # Data quality: high quality → high score
    scores["data_quality"] = _rank_percentile(dqs, higher_is_better=True, penalize_missing=None)
    
    # Score pondéré
    # FIX v2.2.7: Pénalisation NaN selon le signe du poids
    # Maintenant les NaN arrivent vraiment ici car penalize_missing=None
    #   - Poids < 0: "lower raw value is better" → NaN devient score=1 → (1-1)=0 (pas de bonus)
    #   - Poids > 0: "higher raw value is better" → NaN devient score=0 → 0*w=0 (pas de bonus)
    total = pd.Series(0.0, index=df.index)
    total_weight = 0.0
    
    for component, weight in weights.items():
        if component not in scores.columns:
            continue
        
        s = scores[component].copy()
        w = abs(weight)
        
        if weight < 0:
            # Lower raw value is better → inverser le score
            # NaN doit devenir 1.0 pour que (1-1)=0 (pas de bonus pour données manquantes)
            s = s.fillna(1.0)
            total += (1 - s) * w
        else:
            # Higher raw value is better → garder le score
            # NaN doit devenir 0.0 pour que 0*w=0 (pas de bonus pour données manquantes)
            s = s.fillna(0.0)
            total += s * w
        total_weight += w
    
    if total_weight > 0:
        total /= total_weight
    
    # FIX v2.2.8: Normalisation par PERCENTILE au lieu de min-max
    # Plus stable et comparable entre runs (moins sensible aux outliers)
    # Note: Les scores restent relatifs à l'univers filtré
    df["_profile_score"] = (total.rank(pct=True) * 100).round(2)
    df["_preset_profile"] = profile
    df["_asset_class"] = "etf"
    
    # Assigner le meilleur preset
    df["_matched_preset"] = assign_best_preset(df, profile)
    
    # Tags Role/Risk/Correlation
    def _get_config_field(preset_name: str, field: str) -> str:
        cfg = PRESET_CONFIGS.get(preset_name)
        if not cfg:
            return ""
        val = getattr(cfg, field, None)
        if val is None:
            return ""
        return val.value if hasattr(val, "value") else str(val)
    
    df["_role"] = df["_matched_preset"].apply(lambda p: _get_config_field(p, "role"))
    df["_risk"] = df["_matched_preset"].apply(lambda p: _get_config_field(p, "risk"))
    df["_correlation_group"] = df["_matched_preset"].apply(lambda p: _get_config_field(p, "correlation_group"))
    
    # Stats
    logger.info(
        f"[ETF {profile}] Scores: mean={df['_profile_score'].mean():.1f}, "
        f"std={df['_profile_score'].std():.1f}, "
        f"range=[{df['_profile_score'].min():.1f}, {df['_profile_score'].max():.1f}]"
    )
    
    return df


# =============================================================================
# DEDUPLICATION (Couche 4) - TER-aware
# =============================================================================

def deduplicate_underlying(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Déduplique par underlying_ticker en favorisant le meilleur TER.
    
    FIX v2.2.5: Clé HYBRIDE row-by-row pour éviter d'écraser les ETF
    quand underlying_ticker est vide (cas fréquent).
    
    Priorité: underlying_ticker → isin → symbol
    
    Score de dédup = 0.4 * ter_rank + 0.4 * score_rank + 0.2 * AUM_rank
    
    FIX v2.2.10: Check défensif si _profile_score absent
    """
    meta = {"dedup_key": "hybrid", "before": len(df), "after": len(df), "removed": 0}
    
    if df.empty:
        return df, meta
    
    d = df.copy()
    
    # === FIX: Clé hybride row-by-row ===
    # Priorité: underlying_ticker (si non-vide) → isin (si non-vide) → symbol
    sym = _get_symbol(d).fillna("").astype(str)
    isin = _safe_series(d, "isin").fillna("").astype(str)
    und = _safe_series(d, "underlying_ticker").fillna("").astype(str)
    
    # Construire la clé hybride ligne par ligne
    dedup_key = und.where(und.str.len() > 0, isin)
    dedup_key = dedup_key.where(dedup_key.str.len() > 0, sym)
    
    d["_dedup_key"] = dedup_key
    
    # Score de déduplication
    ter = _to_numeric(_safe_series(d, "total_expense_ratio"))
    aum = _to_numeric(_safe_series(d, "aum_usd"))
    
    # FIX v2.2.10: Check défensif si _profile_score absent
    if "_profile_score" in d.columns:
        score = _to_numeric(d["_profile_score"])
    else:
        score = pd.Series(50.0, index=d.index)  # Score neutre par défaut
    
    ter_rank = _rank_percentile(ter, higher_is_better=False, penalize_missing=True)
    aum_rank = _rank_percentile(aum, higher_is_better=True, penalize_missing=False)
    score_rank = _rank_percentile(score, higher_is_better=True, penalize_missing=False)
    
    d["_dedup_score"] = 0.4 * ter_rank + 0.4 * score_rank + 0.2 * aum_rank
    
    # Trier et dédupliquer
    d = d.sort_values("_dedup_score", ascending=False)
    d = d.drop_duplicates(subset=["_dedup_key"], keep="first")
    d = d.drop(columns=["_dedup_key", "_dedup_score"], errors="ignore")
    
    meta["after"] = len(d)
    meta["removed"] = meta["before"] - meta["after"]
    
    if meta["removed"] > 0:
        logger.info(f"[ETF] Dedup (hybrid): {meta['before']} → {meta['after']} (-{meta['removed']})")
    
    return d, meta


# =============================================================================
# MAIN FUNCTION
# =============================================================================

def select_etfs_for_profile(
    df: pd.DataFrame,
    profile: str,
    top_n: Optional[int] = None,
    return_meta: bool = False,
    strict_metrics: bool = True,  # FIX v2.2.7: Exiger métriques non-NaN selon profil
) -> Union[pd.DataFrame, Tuple[pd.DataFrame, Dict[str, Any]]]:
    """
    Sélectionne les ETF pour un profil donné.
    
    Pipeline:
    1. Data QC (qualité, leverage, AUM, TER)
    1b. FIX v2.2.7: Filtrage métriques requises (si strict_metrics=True)
    2. Métriques de diversification
    3. Hard constraints (avec relaxation)
    4. Presets union
    5. Scoring
    6. Déduplication
    7. Top N
    
    Args:
        df: DataFrame avec les ETF
        profile: "Stable", "Modéré", ou "Agressif"
        top_n: Nombre max d'ETF à retourner
        return_meta: Si True, retourne aussi les métadonnées
        strict_metrics: Si True, exclut les ETF avec métriques manquantes selon profil
    
    Returns:
        DataFrame filtré avec _profile_score (et meta si return_meta=True)
    """
    if profile not in PROFILE_PRESETS:
        raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_PRESETS.keys())}")
    
    meta: Dict[str, Any] = {"profile": profile, "stages": {}}
    logger.info(f"[ETF] Sélection pour profil {profile} - Univers initial: {len(df)}")
    
    # Couche 0: Data QC
    d0 = apply_data_qc_filters(df)
    meta["stages"]["qc"] = {"before": len(df), "after": len(d0)}
    
    # FIX v2.2.7: Filtrage métriques requises (étape 0b)
    # FIX v2.2.8: Support tuples = "au moins une des colonnes" (OR)
    if strict_metrics:
        required = PROFILE_REQUIRED_METRICS.get(profile, [])
        if required:
            before = len(d0)
            mask = pd.Series(True, index=d0.index)
            
            for req in required:
                if isinstance(req, tuple):
                    # Tuple = OR: au moins une des colonnes doit être non-NaN
                    cols = [c for c in req if c in d0.columns]
                    if cols:
                        mask &= d0[cols].notna().any(axis=1)
                else:
                    # String = AND: la colonne doit être non-NaN
                    if req in d0.columns:
                        mask &= d0[req].notna()
            
            d0 = d0[mask].copy()
            removed = before - len(d0)
            meta["stages"]["required_metrics"] = {
                "required": [list(r) if isinstance(r, tuple) else r for r in required],
                "before": before,
                "after": len(d0),
                "removed": removed
            }
            if removed > 0:
                logger.info(f"[ETF {profile}] Métriques requises: {before} → {len(d0)} (-{removed})")
    
    # Métriques de diversification
    d0 = _compute_diversification_metrics(d0)
    
    # Couche 1: Hard constraints
    target_min = max(10, int((top_n or 50) * 0.6))
    d1, hard_meta = apply_hard_constraints(d0, profile, target_min=target_min)
    meta["stages"]["hard"] = hard_meta
    
    # Couche 2: Presets union
    d2 = apply_presets_union(d1, profile)
    meta["stages"]["presets_union"] = {"before": len(d1), "after": len(d2)}
    
    # Fallback si vide
    if d2.empty and not d1.empty:
        logger.warning(f"[ETF {profile}] Presets vides, fallback sur contraintes hard")
        d2 = d1
        meta["stages"]["fallback"] = True
    else:
        meta["stages"]["fallback"] = False
    
    # Couche 3: Scoring
    d3 = compute_profile_score(d2, profile)
    
    # Couche 4: Déduplication
    d4, dedup_meta = deduplicate_underlying(d3)
    meta["stages"]["dedup"] = dedup_meta
    
    # Tri final
    d4 = d4.sort_values("_profile_score", ascending=False)
    
    # Top N
    if top_n and len(d4) > top_n:
        d4 = d4.head(top_n)
    
    meta["final_count"] = len(d4)
    logger.info(f"[ETF {profile}] Sélection finale: {len(d4)} ETF")
    
    if return_meta:
        return d4, meta
    return d4


# =============================================================================
# SANITY CHECKS (FIX v2.2.11)
# =============================================================================

def run_sanity_checks(df: pd.DataFrame, verbose: bool = True) -> Dict[str, Any]:
    """
    FIX v2.2.11: Rapport de qualité des données avant sélection.
    
    Détecte:
    - Mix d'unités (% vs fraction)
    - Données manquantes critiques
    - Distributions suspectes
    - Buckets/presets coverage
    
    Args:
        df: DataFrame des ETF
        verbose: Si True, affiche les alertes
    
    Returns:
        Dict avec les alertes et stats
    """
    report: Dict[str, Any] = {
        "n_total": len(df),
        "alerts": [],
        "unit_detection": {},
        "coverage": {},
        "missing": {},
    }
    
    def alert(level: str, msg: str):
        report["alerts"].append({"level": level, "message": msg})
        if verbose:
            icon = "🔴" if level == "ERROR" else "🟡" if level == "WARNING" else "ℹ️"
            logger.warning(f"{icon} [{level}] {msg}")
    
    # === 1. Détection mix d'unités ===
    for col in ["sector_top_weight", "holding_top", "yield_ttm", "total_expense_ratio"]:
        if col not in df.columns:
            continue
        s = _to_numeric(df[col]).dropna()
        if len(s) == 0:
            continue
        
        n_above_1 = (s > 1.0).sum()
        n_below_1 = (s <= 1.0).sum()
        pct_above = n_above_1 / len(s) * 100
        
        report["unit_detection"][col] = {
            "n_total": len(s),
            "n_above_1": n_above_1,
            "n_below_1": n_below_1,
            "pct_above_1": pct_above,
            "max": float(s.max()),
            "min": float(s.min()),
            "q50": float(s.quantile(0.50)),
            "q95": float(s.quantile(0.95)),
        }
        
        # Alerte si mix significatif
        if 5 < pct_above < 95:
            alert("ERROR", f"MIXED UNITS in '{col}': {pct_above:.1f}% > 1.0, {100-pct_above:.1f}% <= 1.0")
    
    # === 2. Yield suspect (0.2-1.0 = probablement %) ===
    if "yield_ttm" in df.columns:
        yld = _to_numeric(df["yield_ttm"]).dropna()
        if len(yld) > 0:
            y_max = float(yld.max())
            q95 = float(yld.quantile(0.95))
            if y_max <= 1.0 and q95 > 0.15:
                alert("WARNING", f"Yield looks like PERCENTAGE POINTS (max={y_max:.3f}, q95={q95:.3f}). Check FORCE_YIELD_UNITS.")
    
    # === 3. Données manquantes critiques ===
    critical_cols = ["aum_usd", "total_expense_ratio", "vol_3y_pct", "vol_pct"]
    for col in critical_cols:
        if col in df.columns:
            pct_missing = df[col].isna().sum() / len(df) * 100
            report["missing"][col] = pct_missing
            if pct_missing > 30:
                alert("WARNING", f"High missing rate for '{col}': {pct_missing:.1f}%")
    
    # === 4. Leveraged/Inverse non filtrés ===
    n_leveraged = _is_leveraged_or_inverse(df).sum()
    report["coverage"]["n_leveraged"] = n_leveraged
    if n_leveraged > 0:
        alert("INFO", f"{n_leveraged} leveraged/inverse ETF detected (will be filtered)")
    
    # === 5. Presets coverage ===
    df_test = _compute_diversification_metrics(df.copy())
    for profile in ["Stable", "Modéré", "Agressif"]:
        presets = PROFILE_PRESETS.get(profile, [])
        matched = pd.Series(False, index=df_test.index)
        for p in presets:
            fn = PRESET_FUNCTIONS.get(p)
            if fn:
                matched |= fn(df_test)
        
        pct_matched = matched.sum() / len(df_test) * 100 if len(df_test) > 0 else 0
        report["coverage"][f"preset_match_{profile}"] = pct_matched
        
        if pct_matched < 10:
            alert("WARNING", f"Low preset coverage for {profile}: only {pct_matched:.1f}% of ETF match any preset")
    
    # === 6. Summary ===
    n_errors = sum(1 for a in report["alerts"] if a["level"] == "ERROR")
    n_warnings = sum(1 for a in report["alerts"] if a["level"] == "WARNING")
    
    if verbose:
        print(f"\n{'='*60}")
        print(f"SANITY CHECK SUMMARY: {n_errors} errors, {n_warnings} warnings")
        print(f"{'='*60}")
    
    report["summary"] = {"n_errors": n_errors, "n_warnings": n_warnings}
    
    return report


# =============================================================================
# UTILITIES
# =============================================================================

def get_etf_preset_summary() -> Dict[str, Any]:
    """Retourne un résumé des presets ETF."""
    return {
        "version": "2.2.11",
        "profiles": {
            p: {
                "presets": PROFILE_PRESETS[p],
                "constraints": PROFILE_CONSTRAINTS[p],
                "weights": SCORING_WEIGHTS[p],
            }
            for p in PROFILE_PRESETS
        },
        "preset_configs": {
            name: {
                "role": cfg.role.value,
                "risk": cfg.risk.value,
                "correlation_group": cfg.correlation_group.value,
                "description": cfg.description,
                "profiles": cfg.profiles,
            }
            for name, cfg in PRESET_CONFIGS.items()
        },
        "preset_rules": PRESET_RULES,
        "relax_steps": RELAX_STEPS,
        "bucket_logic": {
            "alt_prefix": ALT_PREFIX,
            "structured": list(BUCKET_STRUCTURED),
            "non_standard": list(BUCKET_NON_STANDARD),
            "data_missing": list(BUCKET_DATA_MISSING),
            "sectors_defensive": list(SECTORS_DEFENSIVE),
            "sectors_cyclical": list(SECTORS_CYCLICAL),
            "sectors_growth": list(SECTORS_GROWTH),
        },
    }


def get_preset_config(preset_name: str) -> Optional[PresetConfig]:
    """Récupère la configuration d'un preset."""
    return PRESET_CONFIGS.get(preset_name)


# =============================================================================
# TEST
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    
    # Test avec données fictives
    test_data = pd.DataFrame({
        "etfsymbol": ["SPY", "QQQ", "VTI", "SCHD", "VWO", "XLK", "IJR", "GLD", "JEPI", "DBC"],
        "name": [
            "S&P 500 ETF", "Nasdaq 100 Growth", "Total Market", "High Dividend",
            "EM Vanguard", "Tech Select", "Small Cap", "Gold Trust",
            "JPMorgan Equity Premium Income", "Commodities Index"
        ],
        "fund_type": ["Equity", "Equity", "Equity", "Equity", "Emerging", "Technology", "Small Blend", "Commodity", "Equity", "Commodity"],
        "bucket": ["STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD", "ALT_ASSET_COMMODITY", "STANDARD", "ALT_ASSET_COMMODITY"],
        "reasons": ["", "", "", "", "", "", "", "", "OPTIONS_OVERLAY", ""],
        "aum_usd": [500e9, 200e9, 300e9, 50e9, 80e9, 60e9, 40e9, 60e9, 30e9, 10e9],
        "total_expense_ratio": [0.09, 0.20, 0.03, 0.06, 0.10, 0.10, 0.06, 0.40, 0.35, 0.85],
        "yield_ttm": [1.3, 0.5, 1.4, 3.5, 2.8, 0.8, 1.2, 0.0, 8.5, 0.0],
        "vol_3y_pct": [18, 24, 19, 15, 22, 26, 22, 15, 12, 20],
        "vol_pct": [17, 23, 18, 14, 21, 25, 21, 14, 11, 19],
        "perf_1m_pct": [2.1, 3.5, 2.0, 1.5, -0.5, 4.2, 1.8, 1.2, 0.8, -1.5],
        "perf_3m_pct": [5.2, 8.1, 5.0, 3.2, 2.1, 9.5, 4.5, 3.5, 2.0, -3.0],
        "ytd_return_pct": [8.5, 12.3, 8.0, 5.2, 3.5, 15.2, 6.5, 5.0, 4.5, -2.0],
        "one_year_return_pct": [22.5, 28.3, 21.0, 12.5, 8.5, 32.2, 15.5, 12.0, 10.5, 5.0],
        "daily_change_pct": [0.5, 0.8, 0.4, 0.2, -0.3, 1.2, 0.3, 0.1, 0.2, -0.5],
        "sector_top": ["Technology", "Technology", "Technology", "Financials", "Financials", "Technology", "Industrials", "", "", "Energy"],
        "sector_top_weight": [25, 55, 28, 22, 28, 95, 18, 0, 30, 40],
        "holding_top": [7.2, 10.5, 6.8, 4.2, 5.5, 22.0, 1.8, 100, 3.5, 15.0],
        "data_quality_score": [0.95, 0.92, 0.94, 0.88, 0.82, 0.85, 0.80, 0.90, 0.85, 0.75],
        "leverage": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        "sector_trust": [0.9, 0.85, 0.88, 0.82, 0.78, 0.95, 0.75, 0.5, 0.70, 0.6],
        "sector_signal_ok": [True, True, True, True, True, True, True, True, True, True],
        "objective": [
            "S&P 500 Index", "Nasdaq 100 Growth", "Total US Market", "High Dividend Yield",
            "Emerging Markets", "Technology Select", "Small Cap Blend", "Physical Gold Bullion",
            "Equity Premium Income Options Strategy", "Broad Commodities Index"
        ],
    })
    
    print("\n" + "=" * 70)
    print("TEST PRESET ETF v2.2.11")
    print("=" * 70)
    
    for profile in ["Stable", "Modéré", "Agressif"]:
        print(f"\n{'='*70}")
        print(f"PROFIL: {profile}")
        print("=" * 70)
        
        result, meta = select_etfs_for_profile(test_data.copy(), profile, top_n=5, return_meta=True)
        
        print(f"\nStages: {meta['stages']}")
        print(f"\nRésultats ({len(result)} ETF):")
        
        if not result.empty:
            cols = ["etfsymbol", "name", "_matched_preset", "_role", "_risk", "_profile_score"]
            cols = [c for c in cols if c in result.columns]
            print(result[cols].to_string(index=False))
    
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    summary = get_etf_preset_summary()
    print(f"Version: {summary['version']}")
    print(f"Presets: {list(summary['preset_configs'].keys())}")
    
    print("\n✅ Test terminé")
