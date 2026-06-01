# portfolio_engine/preset_etf.py
"""
=========================================
ETF Preset Selector v2.4.1
=========================================

CHANGEMENTS vs v2.4.0:
-----------------------
1. NOUVEAU: Preset sector_healthcare (XLV, VHT, IBB, IHI)
   - Fonction _preset_sector_healthcare() — même pattern que sector_energy
   - Matching: sector_top "health" + keywords pharma/biotech/medical
   - PRESET_RULES: ter_max=0.80, vol_max=25, aum_min=200M
   - Ajouté dans PROFILE_PRESET_PRIORITY pour les 3 profils

2. FIX: PRESET_MIN_QUOTAS ajustés
   - Stable: rendement_etf 2→1 (libère slot pour healthcare)
   - Stable: +sector_healthcare quota 1
   - Modéré: sector_energy 1→2 (protège XLE du scoring momentum)
   - Modéré: +sector_healthcare quota 1
   - Agressif: +sector_healthcare quota 1

3. NOUVEAU: SECTORS_HEALTHCARE constant (cohérence avec DEFENSIVE/CYCLICAL)

CHANGEMENTS vs v2.2.13 (fix scoring flat 50.1):
-----------------------------------------------
1. FIX compute_profile_score - SCORES UNIFORMES:
   - Avant: rank(pct=True) donnait ~50.1 pour tous si univers < 5 ou variance = 0
   - Après: Détection cas dégénéré + fallback min-max normalization
   - Condition: n < 5 OR std < 1e-6 → utilise (x-min)/(max-min)*100
   - Si vraiment aucune variance → score neutre 50.0
   - Log warning quand fallback activé

CHANGEMENTS vs v2.2.12 (audit ChatGPT round 4):
-----------------------------------------------
1. FIX apply_hard_constraints - PETIT UNIVERS:
   - Avant: si len(df) <= target_min, retournait d1 même si VIDE
   - Après: relaxation si d1 vide, même sur petit univers
   - Condition: len(d1) >= target_min OR (petit univers AND d1 non vide)

2. FIX _extract_weights - FRAGMENTS DE DATES:
   - Ajout ast.literal_eval avant regex (gère plus de formats)
   - Regex amélioré: priorité aux valeurs après ":" 
   - Filtre les petits entiers isolés (1-12) qui sont probablement des mois/jours
   - Évite pollution HHI par dates type "2024-08-01" → [8, 1]

3. NETTOYAGE FONCTIONS MORTES:
   - Supprimé: _is_fx(), _is_volatility(), _normalize_0_100()
   - Marqué DEPRECATED: _detect_weight_units_pct() (remplacée par row-wise)

4. TESTS UNITAIRES AJOUTÉS:
   - Test fragments de dates ("as_of:2024-08-01, AAPL:5.0")
   - Test petit univers + hard constraints (relaxation sur 0 résultat)

CHANGEMENTS vs v2.2.11 (audit ChatGPT round 3):
-----------------------------------------------
1. CONVERSION ROW-WISE RÉELLE:
   - _to_weight_frac_series(): conversion ligne par ligne (si >1 → %, sinon fraction)
   - _to_weight_frac_scalar(): version scalaire
   - Remplace la détection globale dans _compute_diversification_metrics
   - _get_sector_top_weight_frac() et _get_holding_top_frac() utilisent row-wise

2. RÈGLE SUM > 1.05 RÉINTRODUITE (sécurisée):
   - Dans _weights_to_fraction() pour les LISTES (len >= 5)
   - Avec filtres anti-années, moins de faux positifs
   - Gère le cas equal-weight [0.2, 0.2, ...] en points de %

3. ZÉRO TRAITÉ COMME NaN:
   - sector_top_weight=0 avec sector_top="" → NaN (pas bonus diversification)
   - holding_top=0 → NaN (probablement inconnu)
   - Évite les bonus artificiels de diversification

4. TESTS UNITAIRES AJOUTÉS:
   - run_unit_tests() avec 5 tests discriminants
   - Mixed units row-wise
   - Equal-weight en points de %
   - Années dans strings
   - Yield ambigu
   - sector_top_weight=0 avec vide

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

# v3.1: Import exposure mapping for non-equity exclusion + RADAR
try:
    from portfolio_engine.etf_exposure import detect_etf_exposure
    _HAS_EXPOSURE = True
except ImportError:
    try:
        from etf_exposure import detect_etf_exposure
        _HAS_EXPOSURE = True
    except ImportError:
        _HAS_EXPOSURE = False
        logging.warning("etf_exposure.py not found — preferred securities exclusion disabled")

# v3.1: Exposures that are NOT equity ETFs (exclude from all equity presets)
NON_EQUITY_EXPOSURES = {
    "preferred_stock", "convertibles", "covered_call",
    "multi_asset",                   # v3.3: RLY, RAAX, MOOD — hybrid funds, not pure equity
    "bonds_global", "bonds_hy", "bonds_ig", "bonds_muni",
    "bonds_treasury", "bonds_multisector", "bonds_core",
    "bonds_core_plus", "bonds_short", "bonds_long_gov",
    "bonds_mbs", "bonds_target_maturity", "bonds_structured",
    "bonds_nontraditional",
    "derivative_income", "derivative_income_index",
    "volatility_strategy", "currency",
}

# v3.1: RADAR sector penalty/bonus via exposure mapping
RADAR_PENALTY_EXPOSURES = {
    "financials": 0.85,
    "communications": 0.85,
    "consumer_discretionary": 0.85,
    "telecom": 0.90,
}
RADAR_BONUS_EXPOSURES = {
    # v3.3: Réduit de ×1.10 à ×1.05 — le momentum capture déjà l'avantage
    # RADAR départage à score égal, ne domine plus le scoring
    "energy": 1.05,
    "utilities": 1.05,
    "materials": 1.05,
    "natural_resources": 1.04,
    "infrastructure": 1.03,
    "clean_energy": 1.03,
    "uranium": 1.03,
    "rare_earth": 1.04,           # v3.3: ajouté (REMX)
    "metals_mining": 1.04,        # v3.3: ajouté
    "copper": 1.04,               # v3.3: ajouté
}

# v3.1.1: RADAR penalty/bonus via sector_top (fallback quand exposure ne matche pas)
# SPDW a exposure="eafe" mais sector_top="Financial Services" → doit être pénalisé
RADAR_PENALTY_SECTOR_TOP = {
    "financial services": 0.85,
    "financials": 0.85,
    "communication services": 0.85,
    "consumer cyclical": 0.88,
    "consumer discretionary": 0.88,
}
RADAR_BONUS_SECTOR_TOP = {
    # v3.3: Réduit de ×1.10 à ×1.05
    "energy": 1.05,
    "utilities": 1.05,
    "basic materials": 1.05,
    "materials": 1.05,
    "industrials": 1.02,
}

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
        description="Financials, Industrials, Materials, Energy",
        profiles=["Modéré", "Agressif"],
    ),
    "sector_energy": PresetConfig(
        name="sector_energy",
        role=ETFRole.SATELLITE,
        risk=ETFRiskLevel.MODERATE,
        correlation_group=CorrelationGroup.COMMODITY_BROAD,
        description="Energy sector equity ETFs (oil, gas, exploration)",
        profiles=["Modéré", "Agressif"],
    ),
    # v2.4.1: Healthcare sector preset
    "sector_healthcare": PresetConfig(
        name="sector_healthcare",
        role=ETFRole.DEFENSIVE,
        risk=ETFRiskLevel.LOW,
        correlation_group=CorrelationGroup.EQUITY_BROAD,
        description="Healthcare sector equity ETFs (pharma, biotech, devices)",
        profiles=["Stable", "Modéré", "Agressif"],
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
        "sector_healthcare", # Priorité 5: healthcare (v2.4.1)
        "or_physique",       # Priorité 6: gold
    ],
    "Modéré": [
        "coeur_global",
        "multi_factor",
        "qualite_value",
        "rendement_etf",
        "croissance_tech",
        "emergents",
        "sector_defensive",
        "sector_healthcare", # v2.4.1
        "sector_cyclical",
        "sector_energy",
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
        "sector_energy",
        "sector_healthcare", # v2.4.1
        "commodities_broad",
    ],
}

# Backward compat: PROFILE_PRESETS pointe vers PRIORITY
PROFILE_PRESETS: Dict[str, List[str]] = PROFILE_PRESET_PRIORITY

# Hard constraints par profil (SANS géographie)
# v3.3: sector_concentration_max SUPPRIMÉ des 3 profils
# Cause: XLV (100% Healthcare) éjecté par Stable(0.50) et Modéré(0.70)
# Les exposure caps (MAX_ETF_PER_EXPOSURE_GROUP) gèrent la diversification
PROFILE_CONSTRAINTS: Dict[str, Dict[str, float]] = {
    "Stable": {
        "vol_max_quantile": 0.35,
        "ter_max_quantile": 0.60,
        "hhi_max": 0.20,
        "holding_top_max": 0.12,
    },
    "Modéré": {
        "vol_max_quantile": 0.70,
        "ter_max_quantile": 0.80,
        "hhi_max": 0.30,
        "holding_top_max": 0.20,
    },
    "Agressif": {
        "vol_max_quantile": 1.0,
        "ter_max_quantile": 0.90,
        "hhi_max": 1.0,
        "holding_top_max": 1.0,
    },
}

# === FIX v2.4.0: Fill-up targets ===
FILL_TARGET: Dict[str, int] = {
    "Stable": 18,
    "Modéré": 25,
    "Agressif": 25,
}

# ============= FIX v2.4.0-N: PER-PRESET MINIMUM QUOTAS =============
# v2.4.1: +sector_healthcare, energy Modéré 1→2, rendement Stable 2→1
PRESET_MIN_QUOTAS: Dict[str, Dict[str, int]] = {
    # v3.2: Quotas MINIMAUX — seulement pour catégories qui ne peuvent pas
    # entrer par scoring seul. Le scoring RADAR+performance décide le reste.
    # AVANT: 9-14 slots garantis → pas de place pour les meilleurs ETFs
    # APRÈS: 1-2 slots garantis → le scoring place les meilleurs
    "Stable": {
        "sector_healthcare": 1,      # HC ne peut pas entrer par score seul
    },
    "Modéré": {
        "sector_healthcare": 1,      # HC ne peut pas entrer par score seul
        "sector_energy": 1,          # Protège au moins 1 energy FAVORED
    },
    "Agressif": {
        "sector_healthcare": 1,      # HC ne peut pas entrer par score seul
    },
}

# v3.3: MAX ETFs par exposure group dans le top_n final
# Super-groupe "resources" = energy + materials + miners + commodities
# Empêche 5/5 ETFs dans le même macro-secteur
MAX_ETF_PER_EXPOSURE_GROUP: Dict[str, Dict[str, int]] = {
    # v3.4: Energy séparé de resources — XLE/VDE/FENY sont corrélés >0.95
    # Si 3 energy passent, dedup dans save_portfolios les fusionne → 1 ETF géant
    "Stable": {
        "energy": 1,           # v3.4: Max 1 energy ETF (XLE ou VDE, pas les deux)
        "resources": 1,        # Max 1 non-energy resources (gold, materials, miners)
        "multi_asset": 1,
        "dividend": 2,
        "allocation": 1,
        "healthcare": 1,
        "default": 2,
    },
    "Modéré": {
        "energy": 1,           # v3.4: Max 1 energy
        "resources": 2,        # Max 2 non-energy resources
        "multi_asset": 1,
        "dividend": 1,         # v5.5.0 (Sélection-3): 2→1 — casse la concentration SCHD+FNDX+FNDF+DIVB
        "allocation": 1,       # v5.5.0 : max 1 ETF allocation factor (FNDX/FNDF same factor)
        "healthcare": 1,
        "default": 2,
    },
    "Agressif": {
        "energy": 1,           # v3.4: Max 1 energy (prevents XLE+VDE+FENY dedup disaster)
        "resources": 2,        # Max 2 non-energy resources (gold + materials for diversification)
        "multi_asset": 1,
        "allocation": 1,
        "healthcare": 1,
        "default": 2,
    },
}

# Mapping exposure → group pour les caps
# v3.4: Energy séparé de resources (corr >0.95 entre XLE/VDE/FENY)
EXPOSURE_TO_GROUP = {
    # Energy — separate group, cap 1 (XLE/VDE/FENY = quasi-identiques)
    "energy": "energy", "clean_energy": "energy", "uranium": "energy",
    
    # Resources (non-energy: gold, materials, miners, commodities)
    "commodities": "resources",
    "gold_physical": "resources", "gold_miners": "resources",
    "silver_physical": "resources", "silver_miners": "resources",
    "materials": "resources", "natural_resources": "resources",
    "rare_earth": "resources", "metals_mining": "resources",
    "copper": "resources", "lithium": "resources",
    "critical_materials": "resources", "steel": "resources",
    "agribusiness": "resources",
    
    # Dividend
    "dividend": "dividend", "dividend_growth": "dividend",
    
    # Allocation
    "allocation_conservative": "allocation", "allocation_balanced": "allocation",
    "allocation_aggressive": "allocation", "allocation_income": "allocation",
    
    # Healthcare
    "healthcare": "healthcare", "pharma": "healthcare", "biotech": "healthcare",
    "genomics": "healthcare", "medical_devices": "healthcare",
    "healthcare_sub": "healthcare",
    
    # Tech
    "tech": "tech", "semiconductor": "tech", "nasdaq100": "tech",
    "nasdaq_composite": "tech", "robotics": "tech", "cybersecurity": "tech",
    "cloud_computing": "tech", "innovation": "tech", "fintech": "tech",
    
    # Utilities (separate from resources — defensive)
    "utilities": "utilities", "infrastructure": "infrastructure",
    
    # v3.3.1: Multi-asset (RLY, RAAX, MOOD — not pure equity, limit to 1)
    "multi_asset": "multi_asset",
    "real_assets": "multi_asset",      # RLY/RAAX = multi-asset real return
}

# ============= FIX v2.4.0-N: CROSS-PROFILE ETF PENALTY =============
CROSS_PROFILE_AFFINITY: Dict[str, Dict[str, float]] = {
    "min_vol_global":    {"Stable": 1.0, "Modéré": 0.85, "Agressif": 0.60},
    "rendement_etf":     {"Stable": 1.0, "Modéré": 0.90, "Agressif": 0.70},
    "sector_defensive":  {"Stable": 1.0, "Modéré": 0.90, "Agressif": 0.65},
    "sector_healthcare": {"Stable": 1.0, "Modéré": 0.95, "Agressif": 0.80},  # v2.4.1
    "sector_cyclical":   {"Stable": 0.70, "Modéré": 0.90, "Agressif": 1.0},
    "commodities_broad": {"Stable": 0.50, "Modéré": 0.80, "Agressif": 1.0},
    "smid_quality":      {"Stable": 0.60, "Modéré": 0.85, "Agressif": 1.0},
    "emergents":         {"Stable": 0.65, "Modéré": 0.90, "Agressif": 1.0},
    "income_options":    {"Stable": 0.50, "Modéré": 0.75, "Agressif": 1.0},
}

PROFILE_REQUIRED_METRICS: Dict[str, List[Union[str, Tuple[str, ...]]]] = {
    "Stable": [("vol_3y_pct", "vol_pct"), "total_expense_ratio"],
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
        "yield_min": 5.0,
        "ter_max": 1.20,
    },
    "qualite_value": {
        "ter_max": 0.80,
    },
    "croissance_tech": {
        "ter_max": 1.00,
        "holding_top_max": 0.20,
        "momentum_3m_min": -5.0,
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
   "sector_energy": {
        "ter_max": 0.80,
        "vol_max": 35.0,
        "aum_min": 200_000_000,
    },
    # v3.3: Healthcare sector rules (further relaxed)
    "sector_healthcare": {
        "ter_max": 1.00,
        "vol_max": 35.0,           # v3.3: 30→35 (biotech XBI ~32%)
        "aum_min": 50_000_000,     # v3.3: 100M→50M (plus de candidats)
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

RELAX_STEPS: List[Tuple[str, float, float]] = [
    ("vol_max_quantile", +0.10, 1.00),
    ("ter_max_quantile", +0.10, 1.00),
    # v3.3: sector_concentration_max supprimé (plus dans PROFILE_CONSTRAINTS)
    ("holding_top_max", +0.05, 1.00),
    ("hhi_max", +0.05, 1.00),
]

SCORING_WEIGHTS: Dict[str, Dict[str, float]] = {
    "Stable": {
        "vol": -0.30,
        "ter": -0.20,
        "aum": 0.10,
        "diversif_sector": -0.15,
        "diversif_holdings": -0.10,
        "momentum": 0.02,
        "yield": 0.05,
        "data_quality": 0.03,
    },
    "Modéré": {
        "vol": -0.15,
        "ter": -0.15,
        "aum": 0.10,
        "diversif_sector": -0.12,
        "diversif_holdings": -0.08,
        "momentum": 0.22,
        "yield": 0.10,
        "data_quality": 0.06,
    },
    "Agressif": {
        "momentum": 0.40,
        "vol": 0.12,
        "yield": 0.08,
        "ter": -0.10,
        "aum": 0.08,
        "diversif_sector": 0.0,
        "diversif_holdings": 0.0,
        "data_quality": 0.08,
    },
}

ALT_PREFIX = "ALT_ASSET_"
BUCKET_STRUCTURED = {"STRUCTURED_VEHICLE"}
BUCKET_NON_STANDARD = {"NON_STANDARD", "INDEX_DERIVATIVE"}
BUCKET_DATA_MISSING = {"DATA_MISSING"}

SECTORS_DEFENSIVE = {"utilities", "healthcare", "consumer staples", "consumer defensive"}
SECTORS_CYCLICAL = {"financials", "financial services", "industrials", "materials", "energy"}
SECTORS_GROWTH = {"technology", "information technology", "communication services", "consumer discretionary", "consumer cyclical"}
# v2.4.1: Healthcare sectors constant
SECTORS_HEALTHCARE = {"healthcare", "health care", "biotechnology", "pharmaceuticals"}


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
    FIX v2.2.10: Ajout heuristique q25 pour zone grise 0.10-1.0
    FIX v2.2.11: Option FORCE_TER_UNITS pour bypasser
    """
    if FORCE_TER_UNITS == "pct":
        return False
    if FORCE_TER_UNITS == "decimal":
        return True
    if "total_expense_ratio" not in df.columns:
        return True
    ter = _to_numeric(df["total_expense_ratio"]).dropna()
    ter = ter[ter > 0]
    if len(ter) == 0:
        return True
    q95 = ter.quantile(0.95)
    q25 = ter.quantile(0.25)
    ter_max = ter.max()
    if ter_max > 1.0:
        return False
    if q95 < 0.05 and ter_max < 0.20:
        return True
    if q25 > 0.05 and ter_max < 1.0:
        logger.debug(f"[ETF] TER detected as percentage points: q25={q25:.4f}, max={ter_max:.4f}")
        return False
    if q95 < 0.10 and ter_max < 0.50:
        logger.warning(f"[ETF] TER units ambiguous: q95={q95:.4f}, max={ter_max:.4f}. Assuming decimal.")
        return True
    return False


def _detect_yield_is_decimal(df: pd.DataFrame) -> bool:
    """
    Détecte si les données yield sont en décimal (0.05 = 5%) ou en % (5.0 = 5%).
    
    FIX v2.2.9: Heuristique robuste avec q95 + max (comme TER).
    FIX v2.2.11: Meilleure gestion du cas ambigu (yields 0.2-1.0).
    """
    if FORCE_YIELD_UNITS == "pct":
        return False
    if FORCE_YIELD_UNITS == "decimal":
        return True
    if "yield_ttm" not in df.columns:
        return True
    yld = _to_numeric(df["yield_ttm"]).dropna()
    yld = yld[yld >= 0]
    if len(yld) == 0:
        return True
    y_max = float(yld.max())
    q95 = float(yld.quantile(0.95))
    q50 = float(yld.quantile(0.50))
    if y_max > 1.0:
        return False
    if q95 <= 0.12:
        return True
    if y_max <= 1.0 and q95 > 0.20:
        logger.warning(
            f"[ETF] Yield units LIKELY PERCENTAGE POINTS (not decimal): "
            f"max={y_max:.4f}, q95={q95:.4f}, q50={q50:.4f}. "
            f"If wrong, set FORCE_YIELD_UNITS='decimal'."
        )
        return False
    if q95 > 0.12:
        logger.warning(f"[ETF] Yield units ambiguous: max={y_max:.4f}, q95={q95:.4f}. Assuming decimal.")
    return True


def _normalize_threshold_ter(threshold_pct: float, data_is_decimal: bool) -> float:
    """Convertit un seuil TER exprimé en % vers le format des données."""
    if data_is_decimal:
        return threshold_pct / 100.0
    else:
        return threshold_pct


def _normalize_threshold_yield(threshold_pct: float, data_is_decimal: bool) -> float:
    """Convertit un seuil yield exprimé en % vers le format des données."""
    if data_is_decimal:
        return threshold_pct / 100.0
    else:
        return threshold_pct


def _detect_weight_units_pct(df: pd.DataFrame) -> bool:
    """
    DEPRECATED v2.2.13: Conversion now ROW-WISE via _to_weight_frac_series().
    Gardée pour référence/debug.
    """
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
                pct_above_1 = (s > 1.0).sum() / len(s) * 100
                col_stats[col] = {"max": mx, "pct_above_1": pct_above_1}
    if not candidates:
        return True
    for col, stats in col_stats.items():
        if 5 < stats["pct_above_1"] < 95:
            logger.warning(
                f"[ETF] MIXED UNITS DETECTED in {col}: {stats['pct_above_1']:.1f}% rows > 1.0. "
                f"Data may have inconsistent units. Set FORCE_WEIGHT_UNITS to override."
            )
    return max(candidates) > 1.0


def _is_weight_pct_row(value: float) -> bool:
    """FIX v2.2.11: Détection row-wise si un poids est en % ou fraction."""
    if pd.isna(value):
        return True
    return float(value) > 1.0


def _to_weight_frac_scalar(value: float) -> float:
    """FIX v2.2.12: Conversion ROW-WISE d'un poids scalaire vers fraction [0, 1]."""
    if pd.isna(value):
        return np.nan
    v = float(value)
    if v > 1.0:
        return max(0.0, min(1.0, v / 100.0))
    return max(0.0, min(1.0, v))


def _to_weight_frac_series(s: pd.Series, mask_zero_as_nan: bool = False) -> pd.Series:
    """FIX v2.2.12: Conversion ROW-WISE d'une série de poids vers fractions [0, 1]."""
    s = _to_numeric(s)
    if mask_zero_as_nan:
        s = s.replace(0, np.nan)
    result = pd.Series(np.where(s > 1.0, s / 100.0, s), index=s.index)
    return result.clip(0, 1)


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
    """Récupère le bucket de classification produit."""
    ASSET_BUCKET_VALUES = {
        "STANDARD", "ALT_ASSET_COMMODITY", "ALT_ASSET_CRYPTO", "ALT_ASSET_FX",
        "ALT_ASSET_VOLATILITY", "DATA_MISSING", "INDEX_DERIVATIVE", "NON_STANDARD",
        "SINGLE_STOCK", "SINGLE_STOCK_DERIVATIVE", "STRUCTURED_VEHICLE",
        "VERIFIED_FINANCIAL", "OPTIONS_OVERLAY"
    }
    for col in ["bucket", "asset_bucket", "sector_bucket"]:
        if col in df.columns:
            series = df[col].fillna("").astype(str).str.upper()
            unique_vals = set(series.unique())
            if unique_vals & ASSET_BUCKET_VALUES:
                return series
    return pd.Series("", index=df.index)


def _get_sector_bucket(df: pd.DataFrame) -> pd.Series:
    """Récupère le VRAI secteur (Technology, Financials, Healthcare, etc.)."""
    ASSET_BUCKET_VALUES = {
        "STANDARD", "ALT_ASSET_COMMODITY", "ALT_ASSET_CRYPTO", "ALT_ASSET_FX",
        "ALT_ASSET_VOLATILITY", "DATA_MISSING", "INDEX_DERIVATIVE", "NON_STANDARD",
        "SINGLE_STOCK", "SINGLE_STOCK_DERIVATIVE", "STRUCTURED_VEHICLE",
        "VERIFIED_FINANCIAL", "OPTIONS_OVERLAY"
    }
    if "sector_bucket" in df.columns:
        series = df["sector_bucket"].fillna("").astype(str).str.upper()
        unique_vals = set(series.unique())
        if not (unique_vals & ASSET_BUCKET_VALUES):
            return df["sector_bucket"].fillna("").astype(str).str.lower()
    return _get_sector_top(df)


def _get_bucket(df: pd.DataFrame) -> pd.Series:
    """DEPRECATED: Utiliser _get_asset_bucket() ou _get_sector_bucket()."""
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
    """FIX v2.2.10: Récupère le poids du top secteur en FRACTION [0, 1]."""
    if "_sector_top_weight_frac" in df.columns:
        frac = _to_numeric(df["_sector_top_weight_frac"])
        if not frac.isna().all():
            return frac.clip(0, 1)
    secw = _get_sector_top_weight(df)
    if secw.isna().all():
        return secw
    sector_top = _get_sector_top(df)
    secw_masked = secw.mask((secw == 0) & (sector_top.eq("") | sector_top.isna()), np.nan)
    return _to_weight_frac_series(secw_masked, mask_zero_as_nan=False)


def _get_holding_top_frac(df: pd.DataFrame) -> pd.Series:
    """FIX v2.2.10: Récupère le poids du top holding en FRACTION [0, 1]."""
    if "_holding_top_frac" in df.columns:
        frac = _to_numeric(df["_holding_top_frac"])
        if not frac.isna().all():
            return frac.clip(0, 1)
    htop = _to_numeric(_safe_series(df, "holding_top"))
    if htop.isna().all():
        return htop
    return _to_weight_frac_series(htop, mask_zero_as_nan=True)


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
    """Vérifie si l'ETF est leveraged/inverse. Détection multi-source."""
    leverage = _to_numeric(_safe_series(df, "leverage")).fillna(0)
    from_col = leverage.ne(0)
    reasons = _get_reasons(df)
    from_reasons = (
        _flag_has_reason(reasons, "NON_STANDARD_LEVERAGED") |
        _flag_has_reason(reasons, "NON_STANDARD_INVERSE") |
        _flag_has_reason(reasons, "LEVERAGED") |
        _flag_has_reason(reasons, "INVERSE")
    )
    name = _safe_series(df, "name").fillna("").astype(str)
    from_name = name.str.contains(_LEVERAGED_PATTERN, regex=True, na=False)
    sym = _get_symbol(df).str.upper()
    known_leveraged = sym.str.match(r"^(TQQQ|SQQQ|SOXL|SOXS|UPRO|SPXU|SPXS|UVXY|SVXY|LABU|LABD|TNA|TZA|FAS|FAZ|NUGT|DUST|JNUG|JDST|ERX|ERY|TECL|TECS|FNGU|FNGD|UDOW|SDOW)$", na=False)
    return from_col | from_reasons | from_name | known_leveraged


def _is_leveraged(df: pd.DataFrame) -> pd.Series:
    """Alias pour compatibilité."""
    return _is_leveraged_or_inverse(df)


def _equity_like_gate(df: pd.DataFrame, allow_data_missing: bool = True) -> pd.Series:
    """Gate "equity-like" - Exclut les ETF non-equity."""
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    is_alt = _is_alt_asset(bucket)
    is_bad = (
        _is_structured(bucket, reasons) |
        _is_non_standard(bucket, reasons) |
        _is_options_overlay(reasons) |
        _is_leveraged(df)
    )
    # v3.1: Exclude non-equity via exposure mapping (preferred, bonds, etc.)
    is_non_equity = pd.Series(False, index=df.index)
    if _HAS_EXPOSURE:
        sym_col = _get_symbol(df)
        name_col = _safe_series(df, "name").fillna("").astype(str)
        ft_col = _safe_series(df, "fund_type").fillna("").astype(str)
        for idx in df.index:
            exp = detect_etf_exposure(
                name=name_col.get(idx, ""),
                ticker=sym_col.get(idx, ""),
                fund_type=ft_col.get(idx, ""),
            )
            if exp and exp in NON_EQUITY_EXPOSURES:
                is_non_equity.at[idx] = True
        n_excluded = is_non_equity.sum()
        if n_excluded > 0:
            logger.info(f"[v3.1] _equity_like_gate: {n_excluded} non-equity ETFs excluded via exposure")
    ok = ~is_alt & ~is_bad & ~is_non_equity
    if not allow_data_missing:
        ok &= ~bucket.isin(BUCKET_DATA_MISSING)
    return ok


# =============================================================================
# HELPERS - HHI & DIVERSIFICATION
# =============================================================================

def _is_likely_year(value: float) -> bool:
    """FIX v2.2.11: Détecte si une valeur numérique est probablement une année."""
    return 1900 <= value <= 2100


def _extract_weights(x: Any) -> List[float]:
    """
    Extrait les poids depuis différents formats (dict, list, string).
    
    FIX v2.2.10: Filtre f <= 50 pour exclure les années (2024, 2023...)
    FIX v2.2.11: Filtre "anti-année" explicite (1900-2100) + permet > 50% pour gold/single-stock
    """
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return []
    if isinstance(x, dict):
        vals = []
        for v in x.values():
            try:
                f = float(v)
                if 0 < f <= 100 and not _is_likely_year(f):
                    vals.append(f)
            except Exception:
                pass
        return vals
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
    if isinstance(x, str):
        s = x.strip()
        if not s:
            return []
        if s.startswith("[") or s.startswith("{"):
            try:
                import json
                obj = json.loads(s)
                return _extract_weights(obj)
            except Exception:
                try:
                    import ast
                    obj = ast.literal_eval(s)
                    return _extract_weights(obj)
                except Exception:
                    pass
        vals = []
        pattern_after_colon = re.findall(r":\s*([-+]?\d*\.?\d+)", s.replace(",", "."))
        if pattern_after_colon:
            for n in pattern_after_colon:
                try:
                    f = float(n)
                    if 0 < f <= 100 and not _is_likely_year(f):
                        vals.append(f)
                except Exception:
                    pass
        if not vals:
            nums = re.findall(r"[-+]?\d*\.?\d+", s.replace(",", "."))
            for n in nums:
                try:
                    f = float(n)
                    if 0 < f <= 100 and not _is_likely_year(f):
                        if f <= 12 and "." not in n and f == int(f):
                            continue
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
    """Convertit les poids en fractions [0, 1]."""
    if not weights:
        return []
    w = [float(x) for x in weights if x is not None and not (isinstance(x, float) and np.isnan(x))]
    if not w:
        return []
    mx = max(abs(x) for x in w)
    sm = sum(abs(x) for x in w)
    if mx > 1.0:
        return [max(0.0, min(1.0, x / 100.0)) for x in w]
    if len(w) >= 5 and sm > 1.05:
        logger.debug(f"[ETF] Equal-weight detection: {len(w)} items, sum={sm:.2f} → treating as percentage points")
        return [max(0.0, min(1.0, x / 100.0)) for x in w]
    return [max(0.0, min(1.0, x)) for x in w]


def _compute_hhi(weights: List[float]) -> Optional[float]:
    """Calcule l'indice Herfindahl-Hirschman."""
    w = _weights_to_fraction(weights)
    if not w:
        return None
    return float(sum(x * x for x in w))


def _get_max_holding_from_top10(x: Any) -> float:
    """FIX v2.2.10: Extrait le max holding depuis holdings_top10."""
    w = _weights_to_fraction(_extract_weights(x))
    return max(w) if w else np.nan


def _compute_diversification_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Ajoute les métriques de diversification (HHI, holding_top, sector_top)."""
    out = df.copy()
    hhi_sector = pd.Series(np.nan, index=df.index)
    if "sector_top5" in df.columns:
        hhi_sector = df["sector_top5"].apply(lambda x: _compute_hhi(_extract_weights(x)))
    out["_hhi_sector"] = hhi_sector
    hhi_holdings = pd.Series(np.nan, index=df.index)
    if "holdings_top10" in df.columns:
        hhi_holdings = df["holdings_top10"].apply(lambda x: _compute_hhi(_extract_weights(x)))
    out["_hhi_holdings"] = hhi_holdings
    hhi_blend = pd.Series(np.nan, index=df.index)
    has_sector = hhi_sector.notna()
    has_holdings = hhi_holdings.notna()
    both = has_sector & has_holdings
    hhi_blend = hhi_blend.where(~both, 0.4 * hhi_sector + 0.6 * hhi_holdings)
    only_sector = has_sector & ~has_holdings
    hhi_blend = hhi_blend.where(~only_sector, hhi_sector)
    only_holdings = has_holdings & ~has_sector
    hhi_blend = hhi_blend.where(~only_holdings, hhi_holdings)
    out["_hhi_blend"] = hhi_blend
    holding_top_frac = pd.Series(np.nan, index=df.index)
    if "holdings_top10" in df.columns:
        holding_top_frac = df["holdings_top10"].apply(_get_max_holding_from_top10)
    missing = holding_top_frac.isna()
    if missing.any() and "holding_top" in df.columns:
        ht = _to_numeric(df["holding_top"])
        fallback = _to_weight_frac_series(ht, mask_zero_as_nan=True)
        holding_top_frac = holding_top_frac.where(~missing, fallback)
    out["_holding_top_frac"] = holding_top_frac.clip(0, 1)
    secw = _get_sector_top_weight(df)
    sector_top = _get_sector_top(df)
    secw_masked = secw.mask((secw == 0) & (sector_top.eq("") | sector_top.isna()), np.nan)
    out["_sector_top_weight_frac"] = _to_weight_frac_series(secw_masked, mask_zero_as_nan=False)
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
    """Calcule le momentum composite (5 horizons)."""
    daily = _to_numeric(_safe_series(df, "daily_change_pct"))
    m1 = _to_numeric(_safe_series(df, "perf_1m_pct"))
    m3 = _to_numeric(_safe_series(df, "perf_3m_pct"))
    ytd = _to_numeric(_safe_series(df, "ytd_return_pct"))
    y1 = _to_numeric(_safe_series(df, "one_year_return_pct"))
    n_missing = (
        daily.isna().astype(int) + m1.isna().astype(int) + m3.isna().astype(int) +
        ytd.isna().astype(int) + y1.isna().astype(int)
    )
    result = (
        0.05 * daily.fillna(0.0) + 0.25 * m1.fillna(0.0) + 0.35 * m3.fillna(0.0) +
        0.15 * ytd.fillna(0.0) + 0.20 * y1.fillna(0.0)
    )
    result = result.where(n_missing <= 2, np.nan)
    return result


# =============================================================================
# HELPERS - SCORING
# =============================================================================

def _rank_percentile(series: pd.Series, higher_is_better: bool = True, penalize_missing: Optional[bool] = None) -> pd.Series:
    """Calcule le rang percentile [0, 1]."""
    ranked = series.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    if penalize_missing is None:
        return ranked
    return ranked.fillna(0.0 if penalize_missing else 0.5)


def _q_threshold(series: pd.Series, q: float, min_n: int = None) -> Optional[float]:
    """Calcule le seuil quantile si assez de données."""
    if min_n is None:
        min_n = MIN_N_FOR_QUANTILE
    if series.notna().sum() < min_n:
        return None
    return float(series.quantile(q))


def _q_ok(series: pd.Series, q: float, op: str, min_n: int = None) -> pd.Series:
    """Vérifie si les valeurs respectent le quantile."""
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
    """Couche 0: Filtres qualité données (communs à tous profils)."""
    if df.empty:
        return df
    mask = pd.Series(True, index=df.index)
    if "data_quality_score" in df.columns:
        dqs = _to_numeric(df["data_quality_score"])
        mask &= (dqs >= MIN_DATA_QUALITY_SCORE) | dqs.isna()
    mask &= ~_is_leveraged_or_inverse(df)
    if "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        mask &= (aum >= MIN_AUM_USD) | aum.isna()
    if "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        mask &= (ter > 0) | ter.isna()
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
    """Applique les contraintes hard une fois."""
    if df.empty:
        return df
    mask = pd.Series(True, index=df.index)
    vol = _get_vol(df)
    vol_q = constraints.get("vol_max_quantile", 1.0)
    n_vol = vol.notna().sum()
    if n_vol >= MIN_N_FOR_QUANTILE and vol_q < 1.0:
        thr = float(vol.quantile(vol_q))
        mask &= (vol <= thr) | vol.isna()
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    ter_q = constraints.get("ter_max_quantile", 1.0)
    n_ter = ter.notna().sum()
    if n_ter >= MIN_N_FOR_QUANTILE and ter_q < 1.0:
        thr = float(ter.quantile(ter_q))
        mask &= (ter <= thr) | ter.isna()
    secw_frac = _get_sector_top_weight_frac(df)
    sec_max = float(constraints.get("sector_concentration_max", 1.0))
    if sec_max < 1.0:
        mask &= (secw_frac <= sec_max) | secw_frac.isna()
    htop = _get_holding_top_frac(df)
    htop_max = float(constraints.get("holding_top_max", 1.0))
    if htop_max < 1.0:
        mask &= (htop <= htop_max) | htop.isna()
    hhi = _to_numeric(_safe_series(df, "_hhi_blend"))
    hhi_max = float(constraints.get("hhi_max", 1.0))
    if hhi_max < 1.0:
        mask &= (hhi <= hhi_max) | hhi.isna()
    return df[mask].copy()


def apply_hard_constraints(df: pd.DataFrame, profile: str, target_min: int = 15) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Couche 1: Contraintes hard avec relaxation progressive."""
    meta: Dict[str, Any] = {"profile": profile, "relaxation": []}
    if df.empty:
        meta.update({"before": 0, "after": 0})
        return df, meta
    if profile not in PROFILE_CONSTRAINTS:
        meta.update({"before": len(df), "after": len(df), "skipped": True})
        return df, meta
    base = PROFILE_CONSTRAINTS[profile].copy()
    meta["before"] = len(df)
    d1 = _apply_constraints_once(df, base)
    meta["after_initial"] = len(d1)
    if len(d1) >= target_min or (len(df) <= target_min and len(d1) > 0):
        meta["after"] = len(d1)
        logger.info(f"[ETF {profile}] Hard constraints: {len(df)} → {len(d1)}")
        return d1, meta
    constraints = base.copy()
    for key, delta, limit in RELAX_STEPS:
        if key not in constraints:
            continue
        old = float(constraints[key])
        new = min(old + delta, limit)
        constraints[key] = new
        d_try = _apply_constraints_once(df, constraints)
        meta["relaxation"].append({"key": key, "old": old, "new": new, "after": len(d_try)})
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
    """Vérifie les règles hard d'un preset."""
    rules = PRESET_RULES.get(preset, {})
    if not rules:
        return pd.Series(True, index=df.index)
    mask = pd.Series(True, index=df.index)
    ter_is_decimal = _detect_ter_is_decimal(df)
    yield_is_decimal = _detect_yield_is_decimal(df)
    if "ter_max" in rules and "total_expense_ratio" in df.columns:
        ter = _to_numeric(df["total_expense_ratio"])
        ter_threshold = _normalize_threshold_ter(rules["ter_max"], ter_is_decimal)
        mask &= (ter <= ter_threshold) | ter.isna()
    if "aum_min" in rules and "aum_usd" in df.columns:
        aum = _to_numeric(df["aum_usd"])
        mask &= (aum >= rules["aum_min"]) | aum.isna()
    if "yield_min" in rules and "yield_ttm" in df.columns:
        yld = _to_numeric(df["yield_ttm"])
        yield_threshold = _normalize_threshold_yield(rules["yield_min"], yield_is_decimal)
        mask &= (yld >= yield_threshold) | yld.isna()
    if "vol_max" in rules:
        vol = _get_vol(df)
        mask &= (vol <= rules["vol_max"]) | vol.isna()
    if "holding_top_max" in rules:
        htop = _get_holding_top_frac(df)
        mask &= (htop <= rules["holding_top_max"]) | htop.isna()
    if "sector_trust_min" in rules and "sector_trust" in df.columns:
        st = _to_numeric(df["sector_trust"])
        mask &= (st >= rules["sector_trust_min"]) | st.isna()
    if "momentum_3m_min" in rules and "perf_3m_pct" in df.columns:
        m3 = _to_numeric(df["perf_3m_pct"])
        mask &= (m3 >= rules["momentum_3m_min"]) | m3.isna()
    return mask


# =============================================================================
# PRESET FILTERS (Couche 2)
# =============================================================================

def _preset_coeur_global(df: pd.DataFrame) -> pd.Series:
    """Preset: Cœur Global — World core UCITS, TER bas, AUM élevé, diversifié."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    if "sector_signal_ok" in df.columns:
        mask &= df["sector_signal_ok"].fillna(True) == True
    if "sector_trust" in df.columns:
        st = _to_numeric(df["sector_trust"])
        mask &= (st >= 0.30) | st.isna()
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    aum = _to_numeric(_safe_series(df, "aum_usd"))
    secw_frac = _get_sector_top_weight_frac(df)
    mask &= _q_ok(ter, 0.40, "<=")
    mask &= _q_ok(aum, 0.60, ">=")
    mask &= (secw_frac <= 0.35) | secw_frac.isna()
    return mask & _check_preset_rules(df, "coeur_global")


def _preset_min_vol_global(df: pd.DataFrame) -> pd.Series:
    """Preset: Minimum Volatility Global."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    vol = _get_vol(df)
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    aum = _to_numeric(_safe_series(df, "aum_usd"))
    mask &= _q_ok(vol, 0.25, "<=")
    mask &= _q_ok(ter, 0.50, "<=")
    mask &= _q_ok(aum, 0.40, ">=")
    return mask & _check_preset_rules(df, "min_vol_global")


def _preset_multi_factor(df: pd.DataFrame) -> pd.Series:
    """Preset: Multi-Factor — ETF factoriels."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    kw_mask = pd.Series(False, index=df.index)
    for kw in ["factor", "multi-factor", "multifactor", "quality", "value",
                "momentum", "size", "low volatility", "min vol", "fundamental",
                "garp", "smart beta", "strategic beta"]:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    return mask & kw_mask & _check_preset_rules(df, "multi_factor")


def _preset_rendement_etf(df: pd.DataFrame) -> pd.Series:
    """Preset: Rendement ETF — Dividend yield élevé, vol contenue."""
    mask = _equity_like_gate(df, allow_data_missing=True)
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
    """Preset: Income Options — Covered call, buywrite."""
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    is_options = _is_options_overlay(reasons)
    not_bad = ~_is_structured(bucket, reasons) & ~_is_non_standard(bucket, reasons)
    not_leveraged = ~_is_leveraged_or_inverse(df)
    return is_options & not_bad & not_leveraged & _check_preset_rules(df, "income_options")


def _preset_qualite_value(df: pd.DataFrame) -> pd.Series:
    """Preset: Qualité/Value — Quality/Value factor proxy."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    kw_mask = pd.Series(False, index=df.index)
    for kw in ["value", "quality", "dividend", "fundamental", "garp"]:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    yld = _to_numeric(_safe_series(df, "yield_ttm"))
    aum = _to_numeric(_safe_series(df, "aum_usd"))
    fallback = _q_ok(yld, 0.50, ">=") & _q_ok(aum, 0.60, ">=")
    kw_mask |= fallback
    return mask & kw_mask & _check_preset_rules(df, "qualite_value")


def _preset_croissance_tech(df: pd.DataFrame) -> pd.Series:
    """Preset: Croissance Tech — Tech/Growth, momentum positif."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    sector = _get_sector_top(df)
    kw_mask = pd.Series(False, index=df.index)
    for kw in ["tech", "technology", "growth", "innovation", "digital",
                "software", "semiconductor", "ai", "cloud", "nasdaq", "qqq"]:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    kw_mask |= sector.str.contains("tech|software|semi|information technology", regex=True)
    p1m = _to_numeric(_safe_series(df, "perf_1m_pct"))
    p3m = _to_numeric(_safe_series(df, "perf_3m_pct"))
    mom_ok = (p1m > 0) | (p3m > 0)
    return mask & kw_mask & (mom_ok | mom_ok.isna()) & _check_preset_rules(df, "croissance_tech")


def _preset_smid_quality(df: pd.DataFrame) -> pd.Series:
    """Preset: SMID Quality — Small/Mid caps."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    ft = _safe_series(df, "fund_type").fillna("").astype(str).str.lower()
    kw_mask = pd.Series(False, index=df.index)
    for kw in ["small", "mid", "smid", "micro", "russell 2000", "msci small", "s&p 600", "s&p 400"]:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    kw_mask |= ft.str.contains("small|mid|smid", regex=True)
    return mask & kw_mask & _check_preset_rules(df, "smid_quality")


def _preset_emergents(df: pd.DataFrame) -> pd.Series:
    """Preset: Marchés Émergents — EM diversifiés + régions."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    ft = _safe_series(df, "fund_type").fillna("").astype(str).str.lower()
    kw_mask = pd.Series(False, index=df.index)
    for kw in ["emerging", "émergent", "frontier", "developing", "em ", "em-", "msci em", "ftse em",
                "asia ex", "asia-pac", "asian", "asie", "china", "chinese", "chine", "hong kong",
                "india", "indian", "inde", "korea", "korean", "corée", "taiwan", "taïwan",
                "southeast asia", "asean", "vietnam", "indonesia", "thailand", "philippines", "malaysia",
                "latin america", "latam", "amérique latine", "brazil", "brazilian", "brésil",
                "mexico", "mexican", "mexique", "africa", "african", "afrique",
                "middle east", "moyen-orient", "bric", "brics"]:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    kw_mask |= ft.str.contains("emerging|emerg|asia|pacific", regex=True)
    return mask & kw_mask & _check_preset_rules(df, "emergents")


def _preset_sector_defensive(df: pd.DataFrame) -> pd.Series:
    """Preset: Sector Defensive — Utilities, Healthcare, Consumer Staples."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    sector_bucket = _get_sector_bucket(df)
    sector_top = _get_sector_top(df)
    sector_ok = pd.Series(False, index=df.index)
    for s in SECTORS_DEFENSIVE:
        sector_ok |= sector_bucket.str.contains(s, regex=False)
        sector_ok |= sector_top.str.contains(s, regex=False)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    for s in SECTORS_DEFENSIVE:
        sector_ok |= obj.str.contains(s, regex=False)
        sector_ok |= name.str.contains(s, regex=False)
    vol = _get_vol(df)
    vol_ok = _q_ok(vol, 0.50, "<=")
    return mask & sector_ok & vol_ok & _check_preset_rules(df, "sector_defensive")


def _preset_sector_cyclical(df: pd.DataFrame) -> pd.Series:
    """Preset: Sector Cyclical — Financials, Industrials, Materials, Energy."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    sector_bucket = _get_sector_bucket(df)
    sector_top = _get_sector_top(df)
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


def _preset_sector_energy(df: pd.DataFrame) -> pd.Series:
    """Preset: Sector Energy — ETFs actions secteur énergie (XLE, VDE, XOP, etc.)."""
    mask = _equity_like_gate(df, allow_data_missing=True)
    sector_top = _get_sector_top(df)
    sector_bucket = _get_sector_bucket(df)
    energy_sector = (
        sector_top.str.contains("energy", case=False, regex=False) |
        sector_bucket.str.contains("energy", case=False, regex=False)
    )
    secw_frac = _get_sector_top_weight_frac(df)
    high_energy_weight = energy_sector & ((secw_frac >= 0.50) | secw_frac.isna())
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    energy_kw = pd.Series(False, index=df.index)
    for kw in ["energy select", "energy sector", "oil & gas", "oil and gas",
                "exploration & production", "e&p etf", "petroleum",
                "clean energy", "solar energy", "renewable energy"]:
        energy_kw |= obj.str.contains(kw, regex=False)
        energy_kw |= name.str.contains(kw, regex=False)
    energy_ok = high_energy_weight | energy_kw
    return mask & energy_ok & _check_preset_rules(df, "sector_energy")


# v2.4.1: NOUVEAU — Healthcare sector preset (même pattern que sector_energy)
def _preset_sector_healthcare(df: pd.DataFrame) -> pd.Series:
    """
    Preset: Sector Healthcare
    ETFs actions secteur santé (pharma, biotech, devices, services).
    XLV, VHT, IBB, IHI, IYH, FHLC, etc.
    
    v3.3: 3 paths de détection:
    1. sector_top contient "health" + weight >= 50%
    2. name/objective contient keywords HC
    3. etf_exposure.py mappe vers healthcare/biotech/pharma/genomics/medical_devices
    """
    mask = _equity_like_gate(df, allow_data_missing=True)
    
    # Path 1: Via sector_top (le plus fiable pour XLV: sector_top="Healthcare", weight~100%)
    sector_top = _get_sector_top(df)
    sector_bucket = _get_sector_bucket(df)
    
    healthcare_sector = (
        sector_top.str.contains("health", case=False, regex=False) |
        sector_bucket.str.contains("health", case=False, regex=False)
    )
    
    secw_frac = _get_sector_top_weight_frac(df)
    high_hc_weight = (
        healthcare_sector &
        ((secw_frac >= 0.50) | secw_frac.isna())
    )
    
    # Path 2: Via name/objective (fallback)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    
    hc_kw = pd.Series(False, index=df.index)
    keywords = [
        "health care", "healthcare", "biotech", "biotechnology",
        "pharmaceutical", "pharma", "medical device", "medical instruments",
        "genomics", "immunology", "oncology", "cardiovascular",
    ]
    for kw in keywords:
        hc_kw |= obj.str.contains(kw, regex=False)
        hc_kw |= name.str.contains(kw, regex=False)
    
    # Path 3: Via etf_exposure.py (attrape les biotech classés "Technology" dans sector_top)
    hc_exposure = pd.Series(False, index=df.index)
    if _HAS_EXPOSURE:
        HC_EXPOSURES = {"healthcare", "biotech", "pharma", "genomics",
                        "medical_devices", "healthcare_sub"}
        sym = _get_symbol(df)
        name_col = _safe_series(df, "name").fillna("").astype(str)
        ft_col = _safe_series(df, "fund_type").fillna("").astype(str)
        for idx in df.index:
            exp = detect_etf_exposure(
                name=name_col.get(idx, ""),
                ticker=sym.get(idx, ""),
                fund_type=ft_col.get(idx, ""),
            )
            if exp and exp in HC_EXPOSURES:
                hc_exposure.at[idx] = True
        n_from_exposure = hc_exposure.sum()
        if n_from_exposure > 0:
            logger.info(f"[v3.3] _preset_sector_healthcare: {n_from_exposure} ETFs matched via exposure")
    
    hc_ok = high_hc_weight | hc_kw | hc_exposure
    
    return mask & hc_ok & _check_preset_rules(df, "sector_healthcare")


def _preset_inflation_shield(df: pd.DataFrame) -> pd.Series:
    """Preset: Inflation Shield — TIPS, commodities, real assets, REIT."""
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    not_bad = (
        ~_is_structured(bucket, reasons) & ~_is_non_standard(bucket, reasons) &
        ~_is_crypto(bucket) & ~_is_options_overlay(reasons)
    )
    is_commodity = _is_commodity(bucket)
    eq_like = _equity_like_gate(df, allow_data_missing=True)
    sector = _get_sector_top(df)
    sector_ok = sector.str.contains("energy|materials|utilities|real estate", regex=True)
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    kw_mask = pd.Series(False, index=df.index)
    for kw in ["tips", "inflation", "protected", "real assets", "commodity",
                "commodities", "natural resources", "infrastructure", "reit", "real estate"]:
        kw_mask |= obj.str.contains(kw, regex=False)
        kw_mask |= name.str.contains(kw, regex=False)
    return not_bad & (is_commodity | (eq_like & (sector_ok | kw_mask))) & _check_preset_rules(df, "inflation_shield")


def _preset_or_physique(df: pd.DataFrame) -> pd.Series:
    """Preset: Or Physique — Gold physical ETF."""
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    base = (_is_commodity(bucket) & ~_is_options_overlay(reasons) & ~_is_structured(bucket, reasons))
    obj = _safe_series(df, "objective").fillna("").astype(str).str.lower()
    name = _safe_series(df, "name").fillna("").astype(str).str.lower()
    gold_kw = pd.Series(False, index=df.index)
    for kw in ["gold", "physical gold", "bullion", "lingot", "or physique"]:
        gold_kw |= obj.str.contains(kw.strip(), regex=False)
        gold_kw |= name.str.contains(kw.strip(), regex=False)
    sym = _get_symbol(df).str.upper()
    gold_whitelist = sym.isin([
        "GLD", "IAU", "GLDM", "SGOL", "IAUM", "AAAU", "PHYS", "BAR", "OUNZ",
        "GOLD", "EGLN", "IGLN", "4GLD", "ZGLD"
    ])
    return base & (gold_kw | gold_whitelist) & _check_preset_rules(df, "or_physique")


def _preset_commodities_broad(df: pd.DataFrame) -> pd.Series:
    """Preset: Commodities Broad — Commodities diversifiées (hors gold pur)."""
    bucket = _get_bucket(df)
    reasons = _get_reasons(df)
    base = (_is_commodity(bucket) & ~_is_options_overlay(reasons) & ~_is_structured(bucket, reasons))
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


# Mapping preset → fonction (v2.4.1: +sector_healthcare)
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
    "sector_energy": _preset_sector_energy,
    "sector_healthcare": _preset_sector_healthcare,   # v2.4.1
    "inflation_shield": _preset_inflation_shield,
    "or_physique": _preset_or_physique,
    "commodities_broad": _preset_commodities_broad,
}


# =============================================================================
# PRESET UNION & ASSIGNMENT
# =============================================================================

def apply_presets_union(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """Couche 2: Union des presets pour le profil.
    
    FIX v2.2.15: Assigne _matched_preset ICI sur l'univers complet (d1),
    AVANT le filtrage par les masques preset.
    """
    if df.empty:
        return df
    presets = PROFILE_PRESETS.get(profile, [])
    if not presets:
        logger.warning(f"[ETF] Aucun preset défini pour profil {profile}")
        return df
    df = df.copy()
    df["_matched_preset"] = assign_best_preset(df, profile)
    n_matched = (df["_matched_preset"] != "").sum()
    logger.info(f"[ETF {profile}] Preset assignment (pre-filter): {n_matched}/{len(df)} matched")
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
    preset_masks = {}
    for p in presets:
        fn = PRESET_FUNCTIONS.get(p)
        if fn:
            preset_masks[p] = fn(df)
    for p in presets:
        m = preset_masks.get(p)
        if m is None:
            continue
        assigned = assigned.mask((assigned == "") & m, p)
    return assigned


# =============================================================================
# SCORING (Couche 3) - VERSION DEBUG v2.2.15
# =============================================================================

def compute_profile_score(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """Calcule le _profile_score pour chaque ETF (8 composantes pondérées signées)."""
    if df.empty:
        return df
    df = df.copy()
    
    logger.warning(f"[DEBUG {profile}] === ENTRÉE compute_profile_score ===")
    logger.warning(f"[DEBUG {profile}] Shape: {df.shape}")
    logger.warning(f"[DEBUG {profile}] Colonnes: {df.columns.tolist()}")
    
    critical_cols = ["total_expense_ratio", "aum_usd", "yield_ttm",
                     "perf_1m_pct", "perf_3m_pct", "vol_pct", "data_quality_score"]
    for col in critical_cols:
        if col in df.columns:
            n_valid = df[col].notna().sum()
            sample = df[col].dropna().head(3).tolist() if n_valid > 0 else []
            dtype = df[col].dtype
            logger.warning(f"[DEBUG {profile}] {col}: {n_valid}/{len(df)} non-NaN, dtype={dtype}, sample={sample}")
        else:
            logger.warning(f"[DEBUG {profile}] {col}: COLONNE ABSENTE!")
    
    diversif_cols = ["sector_top_weight", "_sector_top_weight_frac",
                     "holdings_top10", "_holding_top_frac", "_hhi_sector", "_hhi_holdings"]
    for col in diversif_cols:
        if col in df.columns:
            n_valid = df[col].notna().sum()
            sample = df[col].dropna().head(3).tolist() if n_valid > 0 else []
            logger.warning(f"[DEBUG {profile}] {col}: {n_valid}/{len(df)} non-NaN, sample={sample}")
        else:
            logger.warning(f"[DEBUG {profile}] {col}: absent")
    
    weights = SCORING_WEIGHTS.get(profile, SCORING_WEIGHTS["Modéré"])
    vol = _get_vol(df)
    ter = _to_numeric(_safe_series(df, "total_expense_ratio"))
    aum = _to_numeric(_safe_series(df, "aum_usd"))
    yld = _to_numeric(_safe_series(df, "yield_ttm"))
    momentum_raw = _compute_momentum(df)
    secw_frac = _get_sector_top_weight_frac(df)
    htop_frac = _get_holding_top_frac(df)
    hhi_sector = _to_numeric(_safe_series(df, "_hhi_sector"))
    hhi_holdings = _to_numeric(_safe_series(df, "_hhi_holdings"))
    dqs = _to_numeric(_safe_series(df, "data_quality_score"))
    
    logger.warning(f"[DEBUG {profile}] === MÉTRIQUES BRUTES ===")
    logger.warning(f"[DEBUG {profile}] vol: {vol.notna().sum()}/{len(vol)} valid")
    logger.warning(f"[DEBUG {profile}] ter: {ter.notna().sum()}/{len(ter)} valid")
    logger.warning(f"[DEBUG {profile}] aum: {aum.notna().sum()}/{len(aum)} valid")
    logger.warning(f"[DEBUG {profile}] yld: {yld.notna().sum()}/{len(yld)} valid")
    logger.warning(f"[DEBUG {profile}] momentum: {momentum_raw.notna().sum()}/{len(momentum_raw)} valid")
    logger.warning(f"[DEBUG {profile}] secw_frac: {secw_frac.notna().sum()}/{len(secw_frac)} valid")
    logger.warning(f"[DEBUG {profile}] htop_frac: {htop_frac.notna().sum()}/{len(htop_frac)} valid")
    logger.warning(f"[DEBUG {profile}] dqs: {dqs.notna().sum()}/{len(dqs)} valid")
    
    scores = pd.DataFrame(index=df.index)
    scores["vol"] = _rank_percentile(vol, higher_is_better=True, penalize_missing=None)
    scores["ter"] = _rank_percentile(ter, higher_is_better=True, penalize_missing=None)
    scores["aum"] = _rank_percentile(aum, higher_is_better=True, penalize_missing=None)
    scores["yield"] = _rank_percentile(yld, higher_is_better=True, penalize_missing=None)
    scores["momentum"] = _rank_percentile(momentum_raw, higher_is_better=True, penalize_missing=None)
    diversif_sector = secw_frac.combine_first(hhi_sector)
    scores["diversif_sector"] = _rank_percentile(diversif_sector, higher_is_better=True, penalize_missing=None)
    diversif_holdings = htop_frac.combine_first(hhi_holdings)
    scores["diversif_holdings"] = _rank_percentile(diversif_holdings, higher_is_better=True, penalize_missing=None)
    scores["data_quality"] = _rank_percentile(dqs, higher_is_better=True, penalize_missing=None)
    
    total = pd.Series(0.0, index=df.index)
    total_weight = 0.0
    for component, weight in weights.items():
        if component not in scores.columns:
            continue
        s = scores[component].copy()
        w = abs(weight)
        if weight < 0:
            s = s.fillna(1.0)
            total += (1 - s) * w
        else:
            s = s.fillna(0.0)
            total += s * w
        total_weight += w
    if total_weight > 0:
        total /= total_weight
    
    # v3.1.1: RADAR sector penalty/bonus via exposure + sector_top fallback
    # v5.4.0 P2: Beta gate — RADAR bonus only if ETF beta >= profile threshold
    # Expert rec: XLU (beta 0.32) should not get bonus in Agressif
    # Penalties always apply (avoid financials regardless of beta)
    _RADAR_BETA_MIN = {
        "Agressif": 0.80,   # Only high-beta ETFs get RADAR boost
        "Modéré": 0.40,     # Most pass except ultra-defensive
        "Stable": 0.0,      # No beta gate — low-beta welcome
    }
    _beta_gate = _RADAR_BETA_MIN.get(profile, 0.0)
    _has_beta_col = "beta" in df.columns
    if _has_beta_col:
        _beta_col = pd.to_numeric(df["beta"], errors="coerce")
    
    _st_col = _get_sector_top(df)  # sector_top column (lowercase)
    if _HAS_EXPOSURE:
        _sym_col = _get_symbol(df)
        _name_col = _safe_series(df, "name").fillna("").astype(str)
        _ft_col = _safe_series(df, "fund_type").fillna("").astype(str)
        radar_adj_count = 0
        radar_beta_blocked = 0
        for idx in df.index:
            exp = detect_etf_exposure(
                name=_name_col.get(idx, ""),
                ticker=_sym_col.get(idx, ""),
                fund_type=_ft_col.get(idx, ""),
            )
            adjusted = False
            # Get beta for this ETF (null = no gate, let bonus through)
            _etf_beta = _beta_col.get(idx) if _has_beta_col else None
            _beta_ok = (_etf_beta is None) or (pd.isna(_etf_beta)) or (_etf_beta >= _beta_gate)
            
            # Priority 1: Check exposure mapping
            if exp:
                if exp in RADAR_PENALTY_EXPOSURES:
                    # Penalties always apply regardless of beta
                    total.at[idx] *= RADAR_PENALTY_EXPOSURES[exp]
                    adjusted = True
                elif exp in RADAR_BONUS_EXPOSURES:
                    if _beta_ok:
                        total.at[idx] *= RADAR_BONUS_EXPOSURES[exp]
                        adjusted = True
                    else:
                        # Beta too low for this profile — skip bonus
                        radar_beta_blocked += 1
                        adjusted = True  # Don't fall through to sector_top
            # Priority 2: Fallback on sector_top (catches SPDW=eafe with sector_top=Financial Services)
            if not adjusted:
                st = _st_col.get(idx, "").lower().strip()
                if st in RADAR_PENALTY_SECTOR_TOP:
                    total.at[idx] *= RADAR_PENALTY_SECTOR_TOP[st]
                    adjusted = True
                elif st in RADAR_BONUS_SECTOR_TOP:
                    if _beta_ok:
                        total.at[idx] *= RADAR_BONUS_SECTOR_TOP[st]
                        adjusted = True
                    else:
                        radar_beta_blocked += 1
                        adjusted = True
            if adjusted:
                radar_adj_count += 1
        if radar_adj_count > 0:
            logger.info(f"[v3.1.1 {profile}] RADAR adjustments: {radar_adj_count} ETFs")
        if radar_beta_blocked > 0:
            logger.info(f"[v5.4.0 {profile}] RADAR beta gate: {radar_beta_blocked} bonus blocked (beta < {_beta_gate})")
    else:
        # No exposure module — use sector_top only
        radar_adj_count = 0
        radar_beta_blocked = 0
        for idx in df.index:
            st = _st_col.get(idx, "").lower().strip()
            _etf_beta = _beta_col.get(idx) if _has_beta_col else None
            _beta_ok = (_etf_beta is None) or (pd.isna(_etf_beta)) or (_etf_beta >= _beta_gate)
            if st in RADAR_PENALTY_SECTOR_TOP:
                total.at[idx] *= RADAR_PENALTY_SECTOR_TOP[st]
                radar_adj_count += 1
            elif st in RADAR_BONUS_SECTOR_TOP:
                if _beta_ok:
                    total.at[idx] *= RADAR_BONUS_SECTOR_TOP[st]
                    radar_adj_count += 1
                else:
                    radar_beta_blocked += 1
        if radar_adj_count > 0:
            logger.info(f"[v3.1.1 {profile}] RADAR sector_top adjustments: {radar_adj_count} ETFs")
        if radar_beta_blocked > 0:
            logger.info(f"[v5.4.0 {profile}] RADAR beta gate (fallback): {radar_beta_blocked} bonus blocked")
    
    logger.warning(f"[DEBUG {profile}] === SCORES COMPOSANTS ===")
    for component in scores.columns:
        s = scores[component]
        n_nan = s.isna().sum()
        s_std = s.std() if s.notna().sum() > 1 else 0
        s_min = s.min() if s.notna().sum() > 0 else float('nan')
        s_max = s.max() if s.notna().sum() > 0 else float('nan')
        logger.warning(f"[DEBUG {profile}] {component}: n_nan={n_nan}/{len(s)}, std={s_std:.4f}, range=[{s_min:.2f}, {s_max:.2f}]")
    logger.warning(f"[DEBUG {profile}] TOTAL: n_valid={len(total.dropna())}, std={total.std():.6f}, range=[{total.min():.4f}, {total.max():.4f}]")

    n_valid = len(total.dropna())
    total_std = total.std() if n_valid > 1 else 0.0

    if n_valid < 5 or total_std < 1e-6:
        t_min, t_max = total.min(), total.max()
        if t_max - t_min < 1e-9:
            df["_profile_score"] = 50.0
            logger.warning(f"[ETF {profile}] Scoring fallback (neutral 50): n={n_valid}, std={total_std:.6f}")
        else:
            df["_profile_score"] = (((total - t_min) / (t_max - t_min)) * 100).round(2)
            logger.warning(f"[ETF {profile}] Scoring fallback (min-max): n={n_valid}, std={total_std:.6f}")
    else:
        df["_profile_score"] = (total.rank(pct=True) * 100).round(2)

    df["_preset_profile"] = profile
    df["_asset_class"] = "etf"

    if "_matched_preset" in df.columns:
        affinity_adjustments = 0
        for idx, row in df.iterrows():
            preset = row.get("_matched_preset", "")
            if preset in CROSS_PROFILE_AFFINITY:
                mult = CROSS_PROFILE_AFFINITY[preset].get(profile, 1.0)
                if mult != 1.0:
                    df.at[idx, "_profile_score"] = round(df.at[idx, "_profile_score"] * mult, 2)
                    affinity_adjustments += 1
        if affinity_adjustments > 0:
            logger.info(f"[ETF {profile}] Cross-profile affinity: {affinity_adjustments} scores adjusted")

    if "_matched_preset" not in df.columns or (df["_matched_preset"] == "").all():
        df["_matched_preset"] = assign_best_preset(df, profile)
        logger.info(f"[ETF {profile}] _matched_preset computed in scoring (no pre-assignment found)")
    else:
        n_preset = (df["_matched_preset"] != "").sum()
        logger.info(f"[ETF {profile}] Keeping pre-assigned _matched_preset: {n_preset}/{len(df)} matched")

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
    """Déduplique par underlying_ticker en favorisant le meilleur TER."""
    meta = {"dedup_key": "hybrid", "before": len(df), "after": len(df), "removed": 0}
    if df.empty:
        return df, meta
    d = df.copy()
    sym = _get_symbol(d).fillna("").astype(str)
    isin = _safe_series(d, "isin").fillna("").astype(str)
    und = _safe_series(d, "underlying_ticker").fillna("").astype(str)
    dedup_key = und.where(und.str.len() > 0, isin)
    dedup_key = dedup_key.where(dedup_key.str.len() > 0, sym)
    d["_dedup_key"] = dedup_key
    ter = _to_numeric(_safe_series(d, "total_expense_ratio"))
    aum = _to_numeric(_safe_series(d, "aum_usd"))
    if "_profile_score" in d.columns:
        score = _to_numeric(d["_profile_score"])
    else:
        score = pd.Series(50.0, index=d.index)
    ter_rank = _rank_percentile(ter, higher_is_better=False, penalize_missing=True)
    aum_rank = _rank_percentile(aum, higher_is_better=True, penalize_missing=False)
    score_rank = _rank_percentile(score, higher_is_better=True, penalize_missing=False)
    d["_dedup_score"] = 0.4 * ter_rank + 0.4 * score_rank + 0.2 * aum_rank
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
    strict_metrics: bool = True,
) -> Union[pd.DataFrame, Tuple[pd.DataFrame, Dict[str, Any]]]:
    """Sélectionne les ETF pour un profil donné. Pipeline complet Couche 0-4."""
    if profile not in PROFILE_PRESETS:
        raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_PRESETS.keys())}")
    meta: Dict[str, Any] = {"profile": profile, "stages": {}}
    logger.info(f"[ETF] Sélection pour profil {profile} - Univers initial: {len(df)}")
    
    # Couche 0: Data QC
    d0 = apply_data_qc_filters(df)
    meta["stages"]["qc"] = {"before": len(df), "after": len(d0)}
    
    # FIX v2.2.7: Filtrage métriques requises
    if strict_metrics:
        required = PROFILE_REQUIRED_METRICS.get(profile, [])
        if required:
            before = len(d0)
            mask = pd.Series(True, index=d0.index)
            for req in required:
                if isinstance(req, tuple):
                    cols = [c for c in req if c in d0.columns]
                    if cols:
                        mask &= d0[cols].notna().any(axis=1)
                else:
                    if req in d0.columns:
                        mask &= d0[req].notna()
            d0 = d0[mask].copy()
            removed = before - len(d0)
            meta["stages"]["required_metrics"] = {
                "required": [list(r) if isinstance(r, tuple) else r for r in required],
                "before": before, "after": len(d0), "removed": removed
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
    
    if d2.empty and not d1.empty:
        logger.warning(f"[ETF {profile}] Presets vides, fallback sur contraintes hard")
        d2 = d1
        meta["stages"]["fallback"] = True
    else:
        meta["stages"]["fallback"] = False
    
    # Couche 2b: FIX v2.4.0 — Quality Fill-Up
    fill_target = FILL_TARGET.get(profile, 20)
    if len(d2) < fill_target and len(d1) > len(d2):
        d2_indices = set(d2.index)
        d1_remaining = d1[~d1.index.isin(d2_indices)].copy()
        if not d1_remaining.empty:
            fill_score = pd.Series(0.0, index=d1_remaining.index)
            mom = _compute_momentum(d1_remaining)
            mom_rank = mom.rank(pct=True, method="average").fillna(0.5)
            fill_score += 0.40 * mom_rank
            aum = _to_numeric(_safe_series(d1_remaining, "aum_usd"))
            aum_rank = aum.rank(pct=True, method="average").fillna(0.3)
            fill_score += 0.30 * aum_rank
            ter = _to_numeric(_safe_series(d1_remaining, "total_expense_ratio"))
            ter_rank = (1 - ter.rank(pct=True, method="average")).fillna(0.5)
            fill_score += 0.30 * ter_rank
            d1_remaining["_fill_score"] = fill_score
            d1_remaining = d1_remaining.sort_values("_fill_score", ascending=False)
            n_fill = fill_target - len(d2)
            fill_candidates = d1_remaining.head(n_fill).copy()
            fill_candidates["_matched_preset"] = "quality_fill"
            n_preset = len(d2)
            d2 = pd.concat([d2, fill_candidates], ignore_index=False)
            logger.info(f"[ETF {profile}] FIX v2.4.0 Fill-Up: +{len(fill_candidates)} ETFs ({n_preset} preset + {len(fill_candidates)} fill = {len(d2)} total)")
            meta["stages"]["fill_up"] = {
                "preset_matched": n_preset, "fill_added": len(fill_candidates),
                "total": len(d2), "target": fill_target,
            }
            if "_fill_score" in d2.columns:
                d2 = d2.drop(columns=["_fill_score"], errors="ignore")
    else:
        meta["stages"]["fill_up"] = {
            "preset_matched": len(d2), "fill_added": 0,
            "total": len(d2), "target": fill_target,
        }

    # Couche 3: Scoring
    d3 = compute_profile_score(d2, profile)
    
    # Couche 4: Déduplication
    d4, dedup_meta = deduplicate_underlying(d3)
    meta["stages"]["dedup"] = dedup_meta
    d4 = d4.sort_values("_profile_score", ascending=False)
    
    # FIX v2.4.0-N: Quota-aware Top N selection
    if top_n and len(d4) > top_n:
        quotas = PRESET_MIN_QUOTAS.get(profile, {})
        if quotas and "_matched_preset" in d4.columns:
            guaranteed = pd.DataFrame()
            remaining_indices = set(d4.index)
            quota_filled = {}
            for preset, min_n in quotas.items():
                preset_etfs = d4[
                    (d4["_matched_preset"] == preset) &
                    (d4.index.isin(remaining_indices))
                ].head(min_n)
                quota_filled[preset] = len(preset_etfs)
                if not preset_etfs.empty:
                    guaranteed = pd.concat([guaranteed, preset_etfs])
                    remaining_indices -= set(preset_etfs.index)
            slots_remaining = top_n - len(guaranteed)
            if slots_remaining > 0:
                # v3.2: Apply exposure caps to prevent over-concentration
                rest_pool = d4[d4.index.isin(remaining_indices)].copy()
                caps = MAX_ETF_PER_EXPOSURE_GROUP.get(profile, {})
                if caps and _HAS_EXPOSURE:
                    group_counts = {}
                    # Count guaranteed ETFs per group
                    sym_g = _get_symbol(guaranteed)
                    name_g = _safe_series(guaranteed, "name").fillna("").astype(str)
                    ft_g = _safe_series(guaranteed, "fund_type").fillna("").astype(str)
                    for idx in guaranteed.index:
                        exp = detect_etf_exposure(
                            name=name_g.get(idx, ""),
                            ticker=sym_g.get(idx, ""),
                            fund_type=ft_g.get(idx, ""),
                        )
                        grp = EXPOSURE_TO_GROUP.get(exp, "other") if exp else "other"
                        group_counts[grp] = group_counts.get(grp, 0) + 1
                    
                    # Select rest respecting caps
                    selected_rest = []
                    sym_r = _get_symbol(rest_pool)
                    name_r = _safe_series(rest_pool, "name").fillna("").astype(str)
                    ft_r = _safe_series(rest_pool, "fund_type").fillna("").astype(str)
                    for idx in rest_pool.index:
                        if len(selected_rest) >= slots_remaining:
                            break
                        exp = detect_etf_exposure(
                            name=name_r.get(idx, ""),
                            ticker=sym_r.get(idx, ""),
                            fund_type=ft_r.get(idx, ""),
                        )
                        grp = EXPOSURE_TO_GROUP.get(exp, "other") if exp else "other"
                        cap = caps.get(grp, caps.get("default", 3))
                        current = group_counts.get(grp, 0)
                        if current < cap:
                            selected_rest.append(idx)
                            group_counts[grp] = current + 1
                        else:
                            logger.info(
                                f"[v3.2 {profile}] Capped {sym_r.get(idx, '?')} "
                                f"(group={grp}, count={current}/{cap})"
                            )
                    rest = rest_pool.loc[selected_rest] if selected_rest else rest_pool.head(0)
                    logger.info(f"[v3.2 {profile}] Exposure caps: {group_counts}")
                else:
                    rest = rest_pool.head(slots_remaining)
                d4 = pd.concat([guaranteed, rest]).sort_values("_profile_score", ascending=False)
            else:
                d4 = guaranteed.sort_values("_profile_score", ascending=False)
            preset_dist = d4["_matched_preset"].value_counts().to_dict()
            logger.info(f"[ETF {profile}] Quota-aware selection: guaranteed={len(guaranteed)}, fill={min(slots_remaining, len(d4)-len(guaranteed))}, total={len(d4)}")
            logger.info(f"[ETF {profile}] Preset distribution: {preset_dist}")
            meta["stages"]["quotas"] = {"guaranteed": quota_filled, "final_distribution": preset_dist}
        else:
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
    """Rapport de qualité des données avant sélection."""
    report: Dict[str, Any] = {"n_total": len(df), "alerts": [], "unit_detection": {}, "coverage": {}, "missing": {}}
    def alert(level: str, msg: str):
        report["alerts"].append({"level": level, "message": msg})
        if verbose:
            icon = "🔴" if level == "ERROR" else "🟡" if level == "WARNING" else "ℹ️"
            logger.warning(f"{icon} [{level}] {msg}")
    for col in ["sector_top_weight", "holding_top", "yield_ttm", "total_expense_ratio"]:
        if col not in df.columns:
            continue
        s = _to_numeric(df[col]).dropna()
        if len(s) == 0:
            continue
        n_above_1 = (s > 1.0).sum()
        pct_above = n_above_1 / len(s) * 100
        report["unit_detection"][col] = {
            "n_total": len(s), "n_above_1": n_above_1,
            "pct_above_1": pct_above, "max": float(s.max()),
            "min": float(s.min()), "q50": float(s.quantile(0.50)), "q95": float(s.quantile(0.95)),
        }
        if 5 < pct_above < 95:
            alert("ERROR", f"MIXED UNITS in '{col}': {pct_above:.1f}% > 1.0")
    if "yield_ttm" in df.columns:
        yld = _to_numeric(df["yield_ttm"]).dropna()
        if len(yld) > 0:
            y_max = float(yld.max())
            q95 = float(yld.quantile(0.95))
            if y_max <= 1.0 and q95 > 0.15:
                alert("WARNING", f"Yield looks like PERCENTAGE POINTS (max={y_max:.3f}, q95={q95:.3f})")
    critical_cols = ["aum_usd", "total_expense_ratio", "vol_3y_pct", "vol_pct"]
    for col in critical_cols:
        if col in df.columns:
            pct_missing = df[col].isna().sum() / len(df) * 100
            report["missing"][col] = pct_missing
            if pct_missing > 30:
                alert("WARNING", f"High missing rate for '{col}': {pct_missing:.1f}%")
    n_leveraged = _is_leveraged_or_inverse(df).sum()
    report["coverage"]["n_leveraged"] = n_leveraged
    if n_leveraged > 0:
        alert("INFO", f"{n_leveraged} leveraged/inverse ETF detected")
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
            alert("WARNING", f"Low preset coverage for {profile}: {pct_matched:.1f}%")
    n_errors = sum(1 for a in report["alerts"] if a["level"] == "ERROR")
    n_warnings = sum(1 for a in report["alerts"] if a["level"] == "WARNING")
    if verbose:
        print(f"\n{'='*60}")
        print(f"SANITY CHECK SUMMARY: {n_errors} errors, {n_warnings} warnings")
        print(f"{'='*60}")
    report["summary"] = {"n_errors": n_errors, "n_warnings": n_warnings}
    return report


def run_unit_tests(verbose: bool = True) -> Dict[str, Any]:
    """8 tests unitaires discriminants (v2.2.12-v2.2.14)."""
    results = {"passed": 0, "failed": 0, "tests": []}
    def test(name: str, condition: bool, detail: str = ""):
        passed = bool(condition)
        results["tests"].append({"name": name, "passed": passed, "detail": detail})
        if passed:
            results["passed"] += 1
            if verbose: print(f"✓ {name}")
        else:
            results["failed"] += 1
            if verbose: print(f"✗ {name}: {detail}")
    
    # TEST 1: Mixed units row-wise
    s = pd.Series([0.08, 8.0, 15.0, 0.5])
    frac = _to_weight_frac_series(s)
    test("Mixed units row-wise",
         abs(frac.iloc[0] - 0.08) < 0.01 and abs(frac.iloc[1] - 0.08) < 0.01 and abs(frac.iloc[2] - 0.15) < 0.01,
         f"Got {frac.tolist()}")
    
    # TEST 2: Equal-weight en points de %
    fracs = _weights_to_fraction([0.2] * 10)
    test("Equal-weight points de %", sum(fracs) < 0.05, f"sum={sum(fracs):.4f}")
    
    # TEST 3: Années dans strings
    weights = _extract_weights("AAPL:3.2, 2024, MSFT:2.9, 2023")
    test("Années filtrées", not any(1900 <= w <= 2100 for w in weights) and len(weights) == 2, f"Got {weights}")
    
    # TEST 4: Yield ambigu
    is_decimal = _detect_yield_is_decimal(pd.DataFrame({"yield_ttm": [0.6, 0.8, 0.5, 0.7]}))
    test("Yield ambigu 0.6-0.8 détecté comme %", is_decimal == False, f"Got {is_decimal}")
    
    # TEST 5: sector_top_weight=0 avec vide → NaN
    df_zero = _compute_diversification_metrics(pd.DataFrame({
        "sector_top_weight": [0.0, 25.0, 0.0], "sector_top": ["", "Technology", "Financials"]
    }))
    test("sector_top_weight=0 vide → NaN", pd.isna(df_zero["_sector_top_weight_frac"].iloc[0]),
         f"Got {df_zero['_sector_top_weight_frac'].iloc[0]}")
    
    # TEST 6: Fragments de dates
    dw = _extract_weights("as_of:2024-08-01, AAPL:5.0, MSFT:3.0")
    test("Fragments dates filtrés", not (8 in dw or 1 in dw) and 5.0 in dw and 3.0 in dw, f"Got {dw}")
    
    # TEST 7: Petit univers relaxation
    df_small = pd.DataFrame({
        "etfsymbol": [f"ETF{i}" for i in range(5)], "name": [f"Test {i}" for i in range(5)],
        "vol_3y_pct": [50.0, 55.0, 60.0, 45.0, 52.0],
        "total_expense_ratio": [0.01, 0.02, 0.015, 0.025, 0.018],
        "_sector_top_weight_frac": [0.3, 0.35, 0.28, 0.32, 0.29],
        "_holding_top_frac": [0.08, 0.09, 0.07, 0.1, 0.085],
        "_hhi_blend": [0.15, 0.16, 0.14, 0.17, 0.155],
    })
    r_small, m_small = apply_hard_constraints(df_small, "Stable", target_min=3)
    test("Petit univers relaxation", len(r_small) > 0 or len(m_small.get("relaxation", [])) > 0,
         f"Got {len(r_small)} ETF")
    
    # TEST 8: Scoring dégénéré
    df_scoring = pd.DataFrame({
        "etfsymbol": ["A", "B", "C"], "name": ["ETF A", "ETF B", "ETF C"],
        "vol_3y_pct": [15.0, 20.0, 25.0], "total_expense_ratio": [0.10, 0.20, 0.30],
        "aum_usd": [1e9, 2e9, 3e9], "yield_ttm": [1.0, 2.0, 3.0],
        "perf_1m_pct": [1.0, 2.0, 3.0], "perf_3m_pct": [2.0, 4.0, 6.0],
        "data_quality_score": [0.9, 0.85, 0.8],
        "_sector_top_weight_frac": [0.25, 0.30, 0.35],
        "_holding_top_frac": [0.05, 0.08, 0.10],
        "_hhi_sector": [0.10, 0.15, 0.20], "_hhi_holdings": [0.08, 0.12, 0.16],
    })
    df_scored = compute_profile_score(df_scoring.copy(), "Agressif")
    score_std = df_scored["_profile_score"].std()
    test("Scoring petit univers non-uniforme", score_std > 1.0, f"std={score_std:.2f}")
    
    if verbose:
        print(f"\n{'='*50}")
        print(f"UNIT TESTS: {results['passed']}/{results['passed']+results['failed']} passed")
        print(f"{'='*50}")
    return results


# =============================================================================
# UTILITIES
# =============================================================================

def get_etf_preset_summary() -> Dict[str, Any]:
    """Retourne un résumé des presets ETF."""
    return {
        "version": "2.4.1",
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
            "sectors_healthcare": list(SECTORS_HEALTHCARE),
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
    print("TEST PRESET ETF v2.4.1")
    print("=" * 70)
    
    print("\n--- UNIT TESTS ---\n")
    run_unit_tests()
    
    print("\n--- SANITY CHECKS ---\n")
    run_sanity_checks(test_data)
    
    for p in ["Stable", "Modéré", "Agressif"]:
        print(f"\n--- PROFIL {p.upper()} ---\n")
        result, meta = select_etfs_for_profile(test_data, p, top_n=5, return_meta=True)
        print(f"  Sélectionnés: {len(result)}")
        if "_matched_preset" in result.columns:
            print(f"  Presets: {result['_matched_preset'].value_counts().to_dict()}")
        if "_profile_score" in result.columns:
            print(f"  Scores: {result['_profile_score'].tolist()}")
