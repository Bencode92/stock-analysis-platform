#!/usr/bin/env python3
"""
generate_portfolios_v4.py - Orchestrateur complet v5.1.5 (TickerResolver mic_code Fix)
V5.1.4: FIX AUDIT COSMETIC
   - FIX: Pass profile_selections to create_selection_audit (fixes empty hard_filter_stats/profile_stats)
   - FIX: Pass etf_scoring_debug to create_selection_audit (fixes empty etf_scoring_debug)
   - FIX: Collect per-profile hard filter data + ETF scoring diagnostics during pipeline loop

V5.1.3: FIX SCORING FLAT ETF
   - FIX: Supprime roundtrip df→dict→df qui causait NaN dans colonnes numériques
   - NEW: load_csv_robust() avec gestion encoding (utf-8-sig, BOM Windows)
   - NEW: diag_etf_coverage() diagnostique colonnes MISSING/ALL_NAN/FLAT
   - NEW: Post-check scoring avec alerte si scores FLAT
   - FIX: etf_df_master.copy() préserve types numériques dans boucle profils

V5.0.0: OPTION B ARCHITECTURE - preset_meta = seul moteur equity scoring
   - NEW: EQUITY_SCORING_CONFIG explicite ("preset" mode par défaut)
   - NEW: Pipeline documenté avec validation scoring mode
   - FIX: compute_scores() conditionnel (skip si mode="preset")
   - FIX: Logging explicite du mode de scoring utilisé
   - INTEGRATION: preset_meta v5.0.0 (normalize_profile_score, relaxation progressive)

V4.15.0: EU/US PROFILE DIFFERENTIATION + P1 FIXES
   - P0 FIX: EU/US sélection d'équités PAR PROFIL (comme Global) - évite overlap 100%
   - P0 FIX: EU/US Buffett en mode enrichissement (min_score=0), filtrage par PROFILE_POLICY
   - P1 FIX: is_tradable_candidate() pour valider tickers avant backtest
   - P1 FIX: sanity_check max_single basé sur profil (pas hardcodé 15.2%)
   - P1 FIX: sanity_check sur _tickers (actifs individuels), pas _numeric_weights (agrégés)
   - Diagnostic overlap EU/US ajouté

Architecture v4 :
- Python décide les poids (déterministe via portfolio_engine)
- LLM génère uniquement les justifications (prompt compact)
- Compliance AMF appliquée systématiquement
- Backtest 90j intégré avec comparaison des 3 profils
- Filtre Buffett sectoriel intégré

V4.14.0: P0/P1 FIXES - ChatGPT Audit Integration (10/10 PARFAIT FINAL)
   - P0-1: _tickers source unique (sections display dérivées via rebuild_display_sections_from_tickers)
   - P0-2: max_assets violation fix (prune_allocation_to_max_assets + post-prune recheck)
   - P1-3: Séparer hard constraints vs indicators (classify_constraint_results)
   - P1-4: Sanity check ROE > 100% / D/E < 0 (flag_suspicious_roe)
   Round 2-13: Tous fixes intégrés (champs, Buffett, mappings, precision, bucket "Autres",
               _normalize_key, normalisation %, validation sum, boucle cap, EU/US _safe_float)
   Round 14 PARFAIT FINAL (ChatGPT 10/10):
   - FIX R14-1: display_name TOUJOURS unique avec ticker (évite collisions)
   - FIX R14-2: ticker_to_asset_id sans name (évite collisions mapping)
   - FIX R14-3: post_process_allocation() helper unifié (Global + EU/US)
V4.13.2: PROFILE_POLICY FIX - hard_filters + assign_preset + robust normalization
V4.12.2: FIX - ETF selection audit extraction from all_funds_data (dicts) not universe_others (Assets)
V4.9.1: Backtest debug file generation - real prices and calculations export
V4.9.0: RADAR tactical integration - deterministic data-driven tilts
V4.8.7: P1-8c FIX - TER is embedded in ETF prices, use platform_fee instead
V4.8.6: P1-8b - TER (Total Expense Ratio) - DEPRECATED (double-counting)
V4.8.5: P1-8 - Net/gross returns separated for AMF transparency
V4.8.4: FIX - Unpack tuple from load_prices_for_backtest (P1-7 compatibility)
V4.8.3: P0-4 FIX - getattr() for ProfileConstraints (dataclass not dict)
V4.8.2: P0-3 + P0-4 - _limitations field + check_feasibility() ex-ante
V4.8.1: P0-2 - verify_constraints_post_arrondi() + _constraint_report
V4.8.0: P0 COMPLIANCE - Double barrière LLM + audit trail + fallback
V4.7.1: FIX - Handle sharpe_ratio=None in print_comparison_table
V4.7:   FIX P0 - Rounding intelligent pour readable sum = exactement 100%
V4.6:   FIX - Utiliser SYMBOL (BIV,BSV,BND) au lieu de TICKER (KORP)
"""

import os
import json
import logging
import datetime
import math
import re
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from datetime import timedelta
from enum import Enum
import yaml
import pandas as pd

# === Nouveaux modules ===
from portfolio_engine import (
    build_scored_universe,
    rescore_universe_by_profile,
    PortfolioOptimizer,
    convert_universe_to_assets,
    PROFILES,
    build_commentary_prompt,
    generate_commentary_sync,
    generate_fallback_commentary,
    merge_commentary_into_portfolios,
    # Buffett filter
    apply_buffett_filter,
    get_sector_summary,
    SECTOR_PROFILES,
    compute_scores,
    filter_equities,
    sector_balanced_selection,
)

# === v2.2: Import EU/US profiles ===
try:
    from portfolio_engine.optimizer import PROFILES_EUUS
    from portfolio_engine.preset_meta import BLOCKED_REGIONS_EUUS, get_region
    HAS_EUUS_PROFILES = True
except ImportError:
    HAS_EUUS_PROFILES = False
    PROFILES_EUUS = {}
    BLOCKED_REGIONS_EUUS = {"IN", "ASIA_EX_IN", "LATAM"}
    def get_region(country): return "OTHER"

# === v5.0.0: Import PROFILE_POLICY + preset_meta v5.0.0 ===
try:
    from portfolio_engine.preset_meta import (
        PROFILE_POLICY,
        get_profile_policy,
        score_equity_for_profile,
        filter_equities_by_profile,
        compute_universe_stats,
        select_equities_for_profile as select_equities_for_profile_v2,
        diagnose_profile_overlap,
        # v5.0.0: Nouvelles fonctions
        normalize_profile_score,
        apply_hard_filters_with_custom,
        RELAX_STEPS,
    )
    HAS_PROFILE_POLICY = True
    HAS_PRESET_META_V5 = True
except ImportError:
    HAS_PROFILE_POLICY = False
    HAS_PRESET_META_V5 = False
    PROFILE_POLICY = {}
    RELAX_STEPS = []
    def get_profile_policy(p): return {}
    def score_equity_for_profile(e, p, s): return e.get("composite_score", 0)
    def filter_equities_by_profile(e, p): return e
    def compute_universe_stats(e): return {}
    def normalize_profile_score(s, w): return s
    def apply_hard_filters_with_custom(e, f): return e, {}
# === v5.1.0: Import des sélecteurs modulaires ETF/Crypto/Bond ===
try:
    from portfolio_engine import (
        select_etfs_for_profile,
        select_crypto_for_profile,
        select_bonds_for_profile,
    )
    HAS_MODULAR_SELECTORS = True
except ImportError:
    HAS_MODULAR_SELECTORS = False
    def select_etfs_for_profile(df, profile, top_n=None): return df
    def select_crypto_for_profile(df, profile, top_n=None): return df
    def select_bonds_for_profile(df, profile, top_n=None): return df
       
# === v5.2.1: Risk Analysis avec VaR hybride 5 ans ===
try:
    from portfolio_engine import (
        HAS_RISK_ANALYSIS,
        enrich_portfolio_with_risk_analysis,
        fetch_and_enrich_risk_analysis,
    )
except ImportError:
    HAS_RISK_ANALYSIS = False
    enrich_portfolio_with_risk_analysis = None
    fetch_and_enrich_risk_analysis = None     
# === v1.1.0: Import TickerResolver pour résolution mic_code non-US ===
try:
    from portfolio_engine.ticker_resolver import TickerResolver, set_resolver
    HAS_TICKER_RESOLVER = True
except ImportError:
    HAS_TICKER_RESOLVER = False
    logger.warning("⚠️ ticker_resolver not available, non-US tickers may fail in backtest")
# 4.4: Import du chargeur de contexte marché
from portfolio_engine.market_context import load_market_context

# v6.0 (2026-06-03) : Core-Satellite Discipline — couche obligatoire post-optimizer
# Applique caps satellite ≤ 20-25 %, cap 5 %/nom, cœur UCITS broad, Σ=100 % par construction.
# Voir portfolio_engine/core_satellite_discipline.py pour les paramètres figés.
from portfolio_engine.core_satellite_discipline import apply_to_portfolios_dict as _apply_core_satellite_discipline

# v6.15 (2026-06-04) : Archivage scores datés + journal de décision
# Priorités #1 et #4 de Claude externe — construire la donnée point-in-time
# que le pipeline n'a pas encore (besoin 2-3 ans pour walk-forward score qualité).
try:
    from portfolio_engine.score_archiver import archive_scores
    from portfolio_engine.decision_log import log_decision
    _HAS_AUDIT_TOOLS = True
except ImportError:
    _HAS_AUDIT_TOOLS = False

# v4.8.1 P0-2: Import vérification contraintes post-arrondi
# v4.8.2 P0-4: Import check_feasibility pour test ex-ante
from portfolio_engine.constraints import (
    verify_constraints_post_arrondi, 
    ConstraintReport,
    check_feasibility,
    FeasibilityReport,
)

from compliance import (
    generate_compliance_block,
    sanitize_portfolio_output,
    AMF_DISCLAIMER,
)

# v4.8 P0-7: Import du sanitizer LLM
from compliance.sanitizer import sanitize_llm_output

# === Modules existants (compatibilité) ===
try:
    from brief_formatter import format_brief_data
except ImportError:
    def format_brief_data(data): return str(data) if data else ""

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger("portfolio-v4")


# =============================================================================
# v4.14.0 FIX 1b: Helper _safe_float pour cast robuste
# =============================================================================

def _safe_float(value, default=None):
    """Convertit une valeur en float de manière sûre (gère %, N/A, strings)."""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Gérer les pourcentages "12.5%" et les strings "N/A"
        s = value.strip().replace("%", "").replace(",", ".")
        if not s or s.lower() in ("n/a", "nan", "-", ""):
            return default
        try:
            return float(s)
        except ValueError:
            return default
    return default
# =============================================================================
# v5.1.3 FIX: Helpers pour chargement CSV robuste (évite perte types numériques)
# =============================================================================

NUMERIC_COLS_ETF = [
    "vol_pct", "vol_3y_pct", "total_expense_ratio", "aum_usd",
    "yield_ttm", "perf_1m_pct", "perf_3m_pct", "ytd_return_pct",
    "one_year_return_pct", "daily_change_pct", "data_quality_score",
    "sector_top_weight", "holding_top"
]

def load_csv_robust(path: str, numeric_cols: list = None) -> pd.DataFrame:
    """Charge un CSV avec conversion numérique robuste + colonnes clean."""
    last_exc = None
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            df = pd.read_csv(path, encoding=enc, encoding_errors="replace", low_memory=False)
            break
        except Exception as e:
            last_exc = e
            continue
    else:
        raise RuntimeError(f"Impossible de lire {path} (dernier err: {last_exc})")

    # v5.1.3: Nettoyer noms de colonnes (espaces invisibles)
    df.columns = df.columns.str.strip()

    if numeric_cols:
        for col in numeric_cols:
            if col in df.columns:
                df[col] = df[col].map(_safe_float)
                df[col] = pd.to_numeric(df[col], errors="coerce")

    return df

def diag_etf_coverage(df: pd.DataFrame, label: str = "ETF") -> bool:
    """Diagnostique couverture numérique + variance minimale."""
    issues = []
    for col in NUMERIC_COLS_ETF:
        if col not in df.columns:
            issues.append(f"{col}=MISSING")
            continue
        s = df[col]
        n_valid = s.notna().sum()
        n_unique = s.nunique(dropna=True)
        if n_valid == 0:
            issues.append(f"{col}=ALL_NAN")
        elif n_unique <= 1:
            issues.append(f"{col}=FLAT({n_unique})")

    if issues:
        logger.warning(f"[{label}] ⚠️ Colonnes problématiques: {', '.join(issues)}")
        return False

    logger.info(f"[{label}] ✅ Toutes colonnes numériques OK")
    return True
   


def _parse_display_pct(s: str) -> float:
    """
    v4.14.0 FIX Round 5: Parse un pourcentage affiché (gère "<1%").
    
    Args:
        s: String comme "12%", "<1%", "5.5%"
    
    Returns:
        Valeur numérique (0.5 pour "<1%")
    """
    s = (s or "").strip()
    if not s:
        return 0.0
    if s.startswith("<"):
        # "<1%" → 0.5% (valeur conservative pour sommes)
        return 0.5
    try:
        return float(s.replace("%", ""))
    except ValueError:
        return 0.0

# === v4.13: Log disponibilité PROFILE_POLICY après logger init ===
if HAS_PROFILE_POLICY:
    logger.info("✅ Module PROFILE_POLICY disponible")
else:
    logger.warning("⚠️ PROFILE_POLICY non disponible, fallback scoring uniforme")

# ============= PHASE 1: KOREA TRACE DIAGNOSTIC =============

def count_korea(items, step_name):
    """Compte les actions coréennes à chaque étape du pipeline."""
    korea_keywords = ["korea", "corée", "coree", "south korea"]
    
    korea_items = []
    for e in items:
        country = str(e.get("country", "") or "").lower()
        if any(kw in country for kw in korea_keywords):
            korea_items.append(e)
    
    korea_count = len(korea_items)
    korea_names = [e.get("name", "?")[:35] for e in korea_items[:5]]
    
    print(f"[KOREA TRACE] {step_name}: {korea_count} actions coréennes")
    if korea_names:
        print(f"              Exemples: {korea_names}")
    
    return korea_count, korea_items

# ============= FIN PHASE 1 FUNCTION =============

# v4.9.1: Import du générateur de debug backtest
try:
    from backtest_debug_generator import generate_backtest_debug, print_debug_summary
    DEBUG_GENERATOR_AVAILABLE = True
    logger.info("✅ Module backtest_debug_generator disponible")
except ImportError:
    DEBUG_GENERATOR_AVAILABLE = False
    logger.warning("⚠️ backtest_debug_generator non disponible")

# v4.9.0: Import du module RADAR (data-driven tilts)
try:
    from portfolio_engine.market_sector_radar import (
        generate_market_context_radar,
        RadarRules,
        apply_macro_tilts_radar,
    )
    RADAR_AVAILABLE = True
    logger.info("✅ Module RADAR disponible")
except ImportError:
    RADAR_AVAILABLE = False
    logger.warning("⚠️ Module RADAR non disponible, fallback GPT si activé")
# v4.11.0: Import du générateur de justifications LLM par actif
try:
    from portfolio_engine.asset_rationale_generator import (
        generate_asset_rationales_sync,
        load_market_context_radar,
    )
    ASSET_RATIONALE_AVAILABLE = True
    logger.info("✅ Module asset_rationale_generator disponible")
except ImportError:
    ASSET_RATIONALE_AVAILABLE = False
    logger.warning("⚠️ Module asset_rationale_generator non disponible")    

# v4.12.0: Import du module d'audit de sélection
try:
    from portfolio_engine.selection_audit import SelectionAuditor, create_selection_audit
    SELECTION_AUDIT_AVAILABLE = True
    logger.info("✅ Module selection_audit disponible")
except ImportError:
    SELECTION_AUDIT_AVAILABLE = False
    logger.warning("⚠️ Module selection_audit non disponible")
# === v5.1.0: Audit Collector (debug summary/full) ===
try:
    from portfolio_engine.audit_collector import (
        init_audit, get_audit, audit_enabled,
        ReasonCode, ScoreStats
    )
    AUDIT_COLLECTOR_AVAILABLE = True
    logger.info("✅ Module audit_collector disponible")
except ImportError:
    AUDIT_COLLECTOR_AVAILABLE = False
    logger.warning("⚠️ Module audit_collector non disponible")
    def init_audit(*args, **kwargs): return None
    def get_audit(): return None
    def audit_enabled(): return False
    class ReasonCode:
        BUFFETT_SCORE_LOW = "BUFFETT_SCORE_LOW"
        MISSING_DATA = "MISSING_DATA"   
# v4.12.1: Import du module d'explication des sélections TOP caps
try:
    from portfolio_engine.selection_explainer import explain_top_caps_selection
    SELECTION_EXPLAINER_AVAILABLE = True
    logger.info("✅ Module selection_explainer disponible")
except ImportError:
    SELECTION_EXPLAINER_AVAILABLE = False
    logger.warning("⚠️ Module selection_explainer non disponible")    

# ============= CONFIGURATION =============

CONFIG = {
    "stocks_paths": [
        "data/stocks_us.json",
        "data/stocks_europe.json",
        "data/stocks_asia.json",
    ],
    "etf_csv": "data/combined_etfs.csv",
    "bonds_csv": "data/combined_bonds.csv",
    "crypto_csv": "data/filtered/Crypto_filtered_volatility.csv",
    "brief_paths": ["brief_ia.json", "./brief_ia.json", "data/brief_ia.json"],
    "output_path": "data/portfolios.json",
    "history_dir": "data/portfolio_history",
    "backtest_output": "data/backtest_results.json",
    "backtest_euus_output": "data/backtest_results_euus.json",
    "config_path": "config/portfolio_config.yaml",
    "use_llm": True,
    "llm_model": "gpt-4o-mini",
    "run_backtest": True,
    "backtest_days": 90,
    "backtest_freq": "M",
    # === V4.8.7 P1-8c: Platform Fee Config (replaces ter_annual_bp) ===
    # NOTE: TER is ALREADY embedded in ETF adjusted close prices
    # platform_fee = B2C platform fees (if any), creates visible gross/net gap
    "platform_fee_annual_bp": 0.0,  # 0 = no platform fee, set to e.g. 50 for 0.50%/year
    # === Buffett Filter Config ===
    "buffett_mode": "soft",
    "buffett_min_score": 50,
    # v4.14.0: Seuils Buffett PAR PROFIL (permet divergence Agressif vs Stable)
    "buffett_min_score_by_profile": {
        "Agressif": 50,   # Plus permissif → autorise les "pépites" volatiles
        "Modéré": 60,     # Seuil standard
        "Stable": 70,     # Plus strict → qualité Buffett élevée requise
        "Dividende-PEA": 55,  # Niveau Modéré-soft, focus dividende plutôt que Buffett
        "Dividende-CTO": 55,
    },
    # === v8.x: DIVIDENDE PROFILE (PEA + CTO complémentaire) ===
    # Active la génération du 4e profil avec ses 2 sous-enveloppes fiscales.
    # Désactivable d'un seul flag si le pipeline régresse.
    "enable_dividende": True,
    "dividende_envelopes": ["Dividende-PEA", "Dividende-CTO"],
    # v8.x: baseline figé pour Dividende (anti-turnover, buy-and-hold strict).
    # Si True, les tickers de config/dividende_baseline.json restent fixes entre
    # runs (seuls les poids fluctuent). Mettre à True pour forcer une nouvelle
    # sélection complète depuis l'univers (regenerate baseline depuis zéro).
    "force_dividende_rebalance": False,
    "dividende_baseline_path": "config/dividende_baseline.json",
    # === v4.9.0: Tactical Context RADAR (data-driven) ===
    "use_tactical_context": True,
    "tactical_mode": "radar",  # "radar" (déterministe) ou "gpt" (ancien)
    "tactical_rules": {
        "sweet_ytd_min": 10.0,
        "sweet_ytd_max": 35.0,
        "sweet_daily_min": -0.5,
        "overheat_ytd_min": 50.0,
        "smoothing_alpha": 0.3,
        "max_favored_sectors": 5,
        "max_avoided_sectors": 3,
        "max_favored_regions": 4,
        "max_avoided_regions": 3,
    },
    "market_data_dir": "data",
    # === v2.2: EU/US Focus Mode ===
    "generate_euus_portfolios": True,
    "euus_output_path": "data/portfolios_euus.json",
    # === v4.11.0: Asset Rationale LLM Generation ===
    "generate_asset_rationales": True,
    # === v4.12.0: Selection Audit ===
    "generate_selection_audit": True,
    "selection_audit_output": "data/selection_audit.json",
    # v5.1.0: Debug audit (summary/full)
    "debug_audit_level": os.getenv("DEBUG_AUDIT", "summary"),
    "debug_audit_output_dir": "data",
    # === v4.12.1: Selection Explainer (TOP caps analysis) ===
    "generate_selection_explained": True,
    "selection_explained_output": "data/selection_explained.json",
    # === v5.0.0: EQUITY SCORING MODE (Option B Architecture) ===
    # "preset"  = preset_meta.py gère TOUT le scoring equity (recommandé)
    # "factors" = factors.py calcule composite_score (legacy)
    # "blend"   = les deux (pour A/B testing)
    "equity_scoring_mode": "preset",
    # === v5.2.0: Risk Analysis (post-optimization) ===
    "enable_risk_analysis": True,
    # === v5.3.0: Lombard Ranking (yield/credit optimization) ===
    "generate_lombard_ranking": True,
    "lombard_output_path": "data/lombard_ranking.json",
}

# === v4.7 P2: DISCLAIMER BACKTEST ===
BACKTEST_DISCLAIMER = (
    "⚠️ Performances calculées sur {days} jours, hors frais de transaction et fiscalité. "
    "Sharpe ratio annualisé sur période courte (non représentatif long terme). "
    "Les performances passées ne préjugent pas des performances futures."
)

# === v4.8 P0-7: FALLBACK COMMENT SI LLM TROP FILTRÉ ===
FALLBACK_COMPLIANCE_COMMENT = (
    "Commentaire indisponible (filtrage conformité). "
    "Ce contenu est informatif et éducatif ; il ne constitue pas un conseil en investissement."
)
# v4.15.0: Nombre de candidats equities par profil pour l'optimiseur
CANDIDATES_BY_PROFILE = {
    "Agressif": 350,
    "Modéré": 250,
    "Stable": 200,
    # Pool plus restreint car univers déjà filtré par éligibilité fiscale
    "Dividende-PEA": 120,
    "Dividende-CTO": 100,
}


# v8.x: helper de construction de la liste de profils à traiter selon CONFIG
def _active_profiles(config: Dict) -> List[str]:
    """Retourne la liste des profils à traiter selon la CONFIG.

    Les 3 profils historiques restent inconditionnels. Le profil Dividende
    (sous-enveloppes PEA et CTO) ne s'active qu'avec CONFIG['enable_dividende'].
    """
    profiles = ["Agressif", "Modéré", "Stable"]
    if config.get("enable_dividende", False):
        profiles += list(config.get("dividende_envelopes", ["Dividende-PEA", "Dividende-CTO"]))
    return profiles


# v8.x: country filter pré-stage pour les sous-enveloppes Dividende
# v8.x.1: support des overrides PEA pour les cas hybrides (Accenture, STM, etc.)
# v8.x.2: max_country cap post-optimisation pour Dividende (anti-concentration souveraine)
# v8.x.3: baseline figé Dividende (anti-turnover, buy-and-hold strict)

_PEA_OVERRIDES_CACHE: Optional[Dict] = None
_DIVIDENDE_BASELINE_CACHE: Optional[Dict] = None
_DIVIDENDE_BASELINE_ACTIVE: set = set()  # profils où le baseline a été effectivement appliqué
_TICKER_COLLISIONS_DETECTED: Dict[str, List[Dict]] = {}  # ticker → liste d'instances colliding


# v8.x.5: ETF Foundation pour profils Dividende
# Le pipeline produit naturellement les picks. On injecte les ETF foundation
# en post-process pour que le frontend (portefeuille.html) affiche le plan
# d'exécution complet (ETF + picks) tel que validé par l'expert.
ETF_FOUNDATION_DIVIDENDE = {
    "Dividende-PEA": {
        "etf_ticker": "CD9",
        "etf_name": "AMUNDI MSCI EU HIGH DIVIDEND",
        "etf_isin": "LU1812092168",
        "etf_weight": 0.64,
        "picks_total_weight": 0.28,
        "cash_weight": 0.08,
    },
    "Dividende-CTO": {
        "etf_ticker": "SCHD",
        "etf_name": "SCHWAB US DIVIDEND EQUITY ETF",
        "etf_isin": "US8085246083",
        "etf_weight": 0.67,
        "picks_total_weight": 0.33,
        "cash_weight": 0.0,
    },
}


def apply_broker_access_substitution(portfolios_path: str = "data/portfolios.json",
                                     broker_config_path: str = "config/broker_access.json",
                                     asian_map_path: str = "data/asian_alternatives.json"):
    """v6.24: post-process portfolios.json pour substituer les actions
    asiatiques non-accessibles via le broker du user par leur première
    alternative ACTION (même secteur/qualité, bourse accessible).

    Lit config/broker_access.json (édité via broker_access.html) :
      - {"access": {"HEROMOTOCO": false, "3653": true, ...}}

    Pour chaque action satellite dont access=false :
      - Cherche la 1ère alternative_actions dans data/asian_alternatives.json
      - Remplace l'entrée dans Actions (label + ticker dans label) avec
        le poids inchangé
      - Renomme la clé dans _tickers_meta
      - Logge le swap pour traçabilité

    Si aucune alternative disponible : log warning, laisse l'action en place
    (le user devra décider manuellement).
    """
    if not os.path.exists(broker_config_path) or not os.path.exists(asian_map_path):
        return  # silently skip si fichiers absents

    try:
        with open(broker_config_path, "r", encoding="utf-8") as f:
            broker = json.load(f).get("access", {})
        with open(asian_map_path, "r", encoding="utf-8") as f:
            asian_map = json.load(f).get("stocks", {})
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"⚠️ Échec lecture broker_access ou asian_alternatives: {e}")
        return

    # Aucun blocage déclaré => skip
    blocked_tickers = {tk for tk, ok in broker.items() if ok is False}
    if not blocked_tickers:
        return

    if not os.path.exists(portfolios_path):
        return

    with open(portfolios_path, "r", encoding="utf-8") as f:
        portfolios = json.load(f)

    n_swaps = 0
    for prof_name, prof in portfolios.items():
        if prof_name.startswith("_") or not isinstance(prof, dict):
            continue
        actions = prof.get("Actions") or {}
        if not actions:
            continue

        new_actions = {}
        swap_log = []
        for label, weight in actions.items():
            # Extraire ticker du label "NOM (TICKER)"
            if "(" in label and label.endswith(")"):
                ticker = label.rsplit("(", 1)[1].rstrip(")").strip()
            else:
                ticker = label.strip()

            if ticker in blocked_tickers:
                asian_info = asian_map.get(ticker, {})
                alts = asian_info.get("alternative_actions", [])
                if alts:
                    alt = alts[0]
                    new_ticker = alt.get("ticker")
                    new_name = alt.get("name") or new_ticker
                    new_label = f"{new_name} ({new_ticker})"
                    new_actions[new_label] = weight
                    swap_log.append({
                        "from_ticker": ticker,
                        "from_name": asian_info.get("name", ""),
                        "to_ticker": new_ticker,
                        "to_name": new_name,
                        "reason": f"broker_access=false → substitué par 1ère alternative ACTION ({alt.get('match_level','?')} match)",
                        "weight_pct": weight,
                    })
                    n_swaps += 1
                else:
                    logger.warning(f"   [{prof_name}] ⚠️ {ticker} bloqué mais aucune alternative dispo — gardé en place")
                    new_actions[label] = weight
            else:
                new_actions[label] = weight

        if swap_log:
            prof["Actions"] = new_actions
            prof["_broker_substitutions"] = swap_log
            # Sync _tickers_meta : renommer les clés
            meta = prof.get("_tickers_meta") or {}
            for swap in swap_log:
                if swap["from_ticker"] in meta:
                    meta[swap["to_ticker"]] = meta.pop(swap["from_ticker"])
            logger.info(f"   [{prof_name}] 🌏 Broker substitutions : {len(swap_log)} swap(s)")
            for s in swap_log:
                logger.info(f"      • {s['from_ticker']} → {s['to_ticker']} ({s['to_name'][:30]}) at {s['weight_pct']}")

    if n_swaps > 0:
        with open(portfolios_path, "w", encoding="utf-8") as f:
            json.dump(portfolios, f, ensure_ascii=False, indent=2)
        logger.info(f"   🌏 Broker access : {n_swaps} action(s) asiatique(s) substituée(s) au total")


def inject_etf_foundation_dividende(portfolios_path: str = "data/portfolios.json"):
    """v8.x.5: Post-process portfolios.json pour injecter les ETFs Foundation
    dans les profils Dividende. Le pipeline produit les picks ; on ajoute ETF
    + cash pour matcher le plan d'exécution réel (validé expert).

    Pour Dividende-PEA : picks 28% + Amundi MSCI EU HD 64% + cash 8%
    Pour Dividende-CTO : picks 33% + SCHD 67%
    """
    import json as _json
    if not os.path.exists(portfolios_path):
        logger.warning(f"⚠️ {portfolios_path} introuvable, skip injection ETF")
        return
    try:
        with open(portfolios_path, "r", encoding="utf-8") as f:
            data = _json.load(f)
    except (OSError, ValueError) as e:
        logger.warning(f"⚠️ Échec lecture {portfolios_path}: {e}")
        return

    modified = False
    for profile, cfg in ETF_FOUNDATION_DIVIDENDE.items():
        if profile not in data:
            continue
        pf = data[profile]
        actions = pf.get("Actions", {}) or {}
        if not actions:
            logger.info(f"   [{profile}] Pas de picks à scaler, skip injection ETF")
            continue

        # Parse actuel : "Actions" = {"NAME": "XX.X%", ...}
        def _parse_pct(v):
            try:
                return float(str(v).rstrip("%").replace(",", ".").strip())
            except (ValueError, TypeError):
                return 0.0

        current_picks_weight = sum(_parse_pct(v) for v in actions.values())
        if current_picks_weight <= 0:
            continue

        # v8.x.5b: equal-weight strict sur les picks (par décision expert).
        # Conforme au plan d'exécution validé : 4 PEA picks × 7% chacun,
        # 2 CTO picks × 16.5% chacun.
        target_picks_pct = cfg["picks_total_weight"] * 100.0
        n_picks = len(actions)
        per_pick_pct = target_picks_pct / n_picks
        new_actions = {}
        for name in actions:
            new_actions[name] = f"{per_pick_pct:.1f}%"

        # Injecte ETF dans la section ETF
        etf_display = f"{cfg['etf_name']} ({cfg['etf_ticker']})"
        etf_pct = cfg["etf_weight"] * 100.0
        etf_section = pf.get("ETF", {}) or {}
        etf_section[etf_display] = f"{etf_pct:.1f}%"

        # Cash si applicable
        cash_section = pf.get("Cash", {}) or {}
        if cfg["cash_weight"] > 0:
            cash_section["Cash réserve"] = f"{cfg['cash_weight']*100:.1f}%"

        pf["Actions"] = new_actions
        pf["ETF"] = etf_section
        if cash_section:
            pf["Cash"] = cash_section

        # Mise à jour _tickers (décimaux 0-1) — equal-weight aussi
        tickers = pf.get("_tickers", {}) or {}
        per_pick_decimal = cfg["picks_total_weight"] / max(len(tickers), 1)
        new_tickers = {tk: round(per_pick_decimal, 4) for tk in tickers}
        # Ajoute l'ETF dans _tickers
        new_tickers[cfg["etf_ticker"]] = round(cfg["etf_weight"], 4)
        pf["_tickers"] = new_tickers

        # Update _tickers_meta si présent
        tmeta = pf.get("_tickers_meta") or {}
        if isinstance(tmeta, dict):
            tmeta[cfg["etf_ticker"]] = {
                "weight": round(cfg["etf_weight"], 4),
                "category": "ETF",
                "name": cfg["etf_name"],
                "isin": cfg["etf_isin"],
                "_etf_foundation": True,
            }
            pf["_tickers_meta"] = tmeta

        modified = True
        logger.info(f"   [{profile}] ✅ ETF Foundation injecté : "
                    f"{cfg['etf_ticker']} {etf_pct:.0f}% + picks scalés à {target_picks_pct:.0f}%"
                    + (f" + cash {cfg['cash_weight']*100:.0f}%" if cfg["cash_weight"] > 0 else ""))

    if modified:
        with open(portfolios_path, "w", encoding="utf-8") as f:
            _json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"💾 {portfolios_path} mis à jour avec ETF Foundation")


def _detect_ticker_collisions(equities: List[Dict]) -> Dict[str, List[Dict]]:
    """v8.x.5: Détecte les tickers présents avec plusieurs sociétés/pays/MIC.

    Le ticker ADM, par exemple, existe dans stocks_europe.json (Admiral Group
    UK, XLON, quality 72) ET dans stocks_us.json (Archer Daniels Midland,
    XNYS, quality 34). Sans détection, le pipeline traite l'un ou l'autre
    silencieusement selon l'ordre de chargement.

    Retourne un dict {ticker: [list_of_collision_records]} pour les tickers
    avec >1 société distincte. Une "société distincte" est définie par
    (country, MIC) différents.
    """
    by_ticker: Dict[str, List[Dict]] = {}
    for eq in equities:
        tk = (eq.get("ticker") or "").upper().strip()
        if not tk:
            continue
        by_ticker.setdefault(tk, []).append(eq)

    collisions = {}
    for tk, instances in by_ticker.items():
        if len(instances) <= 1:
            continue
        # Vérifie qu'il s'agit bien de sociétés distinctes (country/MIC différent)
        unique_signatures = {(e.get("country", ""), e.get("data_mic") or e.get("exchange", ""))
                              for e in instances}
        if len(unique_signatures) > 1:
            collisions[tk] = [
                {
                    "name": e.get("name") or e.get("name_api", ""),
                    "country": e.get("country", "?"),
                    "mic": e.get("data_mic") or e.get("exchange", "?"),
                    "quality_score": e.get("quality_score"),
                    "dividend_yield": e.get("dividend_yield_regular") or e.get("dividend_yield"),
                }
                for e in instances
            ]
    return collisions


def _match_baseline_key(eq: Dict, key: str) -> bool:
    """v8.x.5: Match d'une équité à une clé baseline.

    Supporte :
      - clé simple "ADM" → match ticker uniquement (peut être ambigu)
      - clé composite "ADM@XLON" → match ticker ET MIC exactement
      - clé composite "ADM@Royaume-Uni" → match ticker ET country exactement

    Recommandation : utiliser des clés composites pour tous les tickers
    en collision (cf. _TICKER_COLLISIONS_DETECTED).
    """
    tk = (eq.get("ticker") or "").upper().strip()
    if "@" not in key:
        return tk == key.upper().strip()
    base_ticker, discriminator = key.upper().split("@", 1)
    if tk != base_ticker.strip():
        return False
    # Discriminateur : MIC ou country
    eq_mic = (eq.get("data_mic") or eq.get("exchange") or "").upper().strip()
    eq_country = (eq.get("country") or "").upper().strip()
    disc = discriminator.strip()
    return disc == eq_mic or disc == eq_country


def _load_dividende_baseline() -> Dict[str, List[str]]:
    """Charge config/dividende_baseline.json (cached).

    Retourne {profile: [list of tickers]} ou {} si fichier absent.
    """
    global _DIVIDENDE_BASELINE_CACHE
    if _DIVIDENDE_BASELINE_CACHE is not None:
        return _DIVIDENDE_BASELINE_CACHE
    path = CONFIG.get("dividende_baseline_path", "config/dividende_baseline.json")
    if not os.path.exists(path):
        _DIVIDENDE_BASELINE_CACHE = {}
        return _DIVIDENDE_BASELINE_CACHE
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _DIVIDENDE_BASELINE_CACHE = data.get("holdings", {})
        logger.info(f"📌 Baseline Dividende chargé : "
                    + ", ".join(f"{p}={len(t)}" for p, t in _DIVIDENDE_BASELINE_CACHE.items()))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"⚠️ Échec lecture baseline {path}: {e}")
        _DIVIDENDE_BASELINE_CACHE = {}
    return _DIVIDENDE_BASELINE_CACHE


def _detect_baseline_toxicity(profile: str, baseline_tickers: List[str],
                                eq_universe: List[dict]) -> List[str]:
    """Détecte les tickers du baseline devenus toxiques (rebalance forcé).

    v8.x.4 (post audit expert) : seuils resserrés :
      - Ticker disparu de l'univers (delisting, M&A)
      - quality_score < 40 (zone alerte qualité — était 30)
      - payout > 100% (paie plus que ses bénéfices — était 110%)
      - dividend_growth_3y < -20% (coupes récurrentes — était -25%)

    Reste tolérant à la dérive modérée (payout 80-100%, quality 40-50)
    pour ne pas rebalancer sur du bruit de marché.

    Retourne la liste des tickers toxiques (vide si baseline encore valide).
    """
    by_ticker = {(e.get("ticker") or "").upper(): e for e in eq_universe}
    toxic = []
    for tk in baseline_tickers:
        tk_up = tk.upper()
        eq = by_ticker.get(tk_up)
        if eq is None:
            toxic.append(f"{tk}:disparu")
            continue
        qs = eq.get("quality_score")
        if qs is not None and qs < 40:
            toxic.append(f"{tk}:quality={qs}")
            continue
        payout = eq.get("payout_ratio_ttm")
        if payout is not None:
            payout_pct = payout if payout > 1.5 else payout * 100
            if payout_pct > 100:
                toxic.append(f"{tk}:payout={payout_pct:.0f}%")
                continue
        dg = eq.get("dividend_growth_3y")
        if dg is not None and dg < -20:
            toxic.append(f"{tk}:div_growth={dg:.0f}%")
            continue
    return toxic


def _apply_dividende_baseline_filter(equities: List[dict], profile: str) -> List[dict]:
    """Filtre les candidats au baseline pour le profil Dividende.

    Si baseline existe pour ce profil ET pas de force_rebalance ET baseline non
    toxique : retourne UNIQUEMENT les équités dont le ticker est dans le baseline.
    Sinon : retourne la liste inchangée (sélection libre).
    """
    if not profile.startswith("Dividende-"):
        return equities
    if CONFIG.get("force_dividende_rebalance", False):
        logger.info(f"   [{profile}] 🔄 force_dividende_rebalance=True — sélection libre")
        return equities
    baseline = _load_dividende_baseline()
    baseline_tickers = baseline.get(profile, [])
    if not baseline_tickers:
        logger.info(f"   [{profile}] ℹ️ Pas de baseline — première sélection libre")
        return equities

    toxic = _detect_baseline_toxicity(profile, baseline_tickers, equities)
    if toxic:
        logger.warning(f"   [{profile}] ⚠️ Baseline toxique ({len(toxic)} positions) — "
                       f"rebalance forcé : {', '.join(toxic[:5])}")
        return equities

    # v8.x.5: support clés composites TICKER@MIC pour désambiguer collisions
    # (ex: "ADM@XLON" = Admiral UK vs "ADM@XNYS" = Archer Daniels US)
    filtered = []
    seen_keys = set()
    for baseline_key in baseline_tickers:
        # Cherche le premier match (1ère occurrence dans l'univers)
        for e in equities:
            if _match_baseline_key(e, baseline_key):
                # Anti-doublon si plusieurs équités matchent la même clé (ne devrait pas arriver avec composite)
                tk_signature = f"{(e.get('ticker') or '').upper()}@{e.get('data_mic') or e.get('country', '')}"
                if tk_signature in seen_keys:
                    continue
                seen_keys.add(tk_signature)
                e["_baseline_protected"] = True
                filtered.append(e)
                break

    _DIVIDENDE_BASELINE_ACTIVE.add(profile)
    logger.info(f"   [{profile}] 📌 Baseline appliqué : "
                f"{len(filtered)}/{len(baseline_tickers)} tickers trouvés "
                f"(turnover sera ≈ 0)")
    return filtered

# Cap par pays pour les profils Dividende (anti-concentration souveraine).
# Spécifique à Dividende car les autres profils ont déjà max_region.
# v8.x.4: caps faisables — vu max_pos PEA=14% et 3 positions FR baseline,
# France peut atteindre 42% (3×14%). Cap 35% laisse marge de respiration.
DIVIDENDE_MAX_COUNTRY_PCT = {
    "Dividende-PEA": 35.0,   # 3 FR × max_pos 14% = 42% théorique, cap 35% = compromis
    "Dividende-CTO": 65.0,   # US naturellement dominant, cap plus permissif
}


def _equal_weight_baseline(assets: list, profile: str) -> Dict[str, float]:
    """v8.x.3: Equal-weight tilté par score sur les baseline tickers présents
    dans le candidate pool. Garantit qu'aucun baseline ticker n'est silencieusement
    drop (poids ≥ min_position_weight pour tous).

    Args:
        assets: liste d'Asset post-baseline_filter (tous tickers du baseline trouvés)
        profile: "Dividende-PEA" ou "Dividende-CTO"

    Returns:
        Dict {asset_id: weight_pct} avec equal-weight + tilt ±20% selon score.
    """
    try:
        from portfolio_engine.optimizer import PROFILES as _PROFS
    except ImportError:
        _PROFS = {}

    constraints = _PROFS.get(profile)
    max_pos_pct = (constraints.max_single_position if constraints else 12.0)
    min_pos_pct = 1.0  # poids minimum plancher

    # Filtrer aux Actions uniquement (Dividende = 100% equity)
    equity_assets = [a for a in assets if getattr(a, "category", "") in ("Actions", "Equity", "equity")]
    if not equity_assets:
        equity_assets = list(assets)
    n = len(equity_assets)
    if n == 0:
        return {}

    base_weight = 100.0 / n

    # Tilt par score (±20% relatif autour de equal-weight)
    scores = [max(0.001, getattr(a, "score", 0) or 0) for a in equity_assets]
    mean_score = sum(scores) / len(scores) or 1.0
    tilt = 0.20

    raw_weights = []
    for a, s in zip(equity_assets, scores):
        mult = 1.0 + tilt * (s / mean_score - 1.0)
        raw_weights.append(base_weight * max(0.5, mult))

    # Cap + renormalisation itérative
    for _ in range(50):
        total = sum(raw_weights)
        if total <= 0:
            break
        raw_weights = [w * 100.0 / total for w in raw_weights]
        capped = [min(max(w, min_pos_pct), max_pos_pct) for w in raw_weights]
        if abs(sum(capped) - 100.0) < 0.1:
            raw_weights = capped
            break
        raw_weights = capped

    allocation = {}
    for a, w in zip(equity_assets, raw_weights):
        aid = getattr(a, "id", None) or getattr(a, "ticker", None)
        if aid:
            allocation[aid] = round(w, 2)

    logger.info(f"   [{profile}] 📐 Equal-weight baseline appliqué : "
                f"{len(allocation)} positions, bornes [{min_pos_pct}%, {max_pos_pct}%]")
    return allocation


def _enforce_caps_iterative(allocation: Dict[str, float], assets: list,
                              profile: str, max_iter: int = 20,
                              tol: float = 0.1) -> Dict[str, float]:
    """v8.x.4: Itération bornée pour respecter SIMULTANÉMENT max_country
    et max_single_position. Sans itération, max_country redistribue les excès
    et viole le cap individuel ; vice-versa.

    Algo (expert reco) :
      for i in range(max_iter):
          weights = cap_positions(weights, max_pos)
          weights = cap_country(weights, max_country)
          weights = renormalize(weights)
          if converged: return
      log warning + best effort

    Reset des contraintes : pour les profils non-Dividende, no-op.
    """
    if not allocation or not profile.startswith("Dividende-"):
        return allocation

    cap_country_pct = DIVIDENDE_MAX_COUNTRY_PCT.get(profile)
    if not cap_country_pct:
        return allocation

    # Charge max_single_position depuis PROFILES
    try:
        from portfolio_engine.optimizer import PROFILES as _PROFS
        constraints = _PROFS.get(profile)
        cap_pos_pct = constraints.max_single_position if constraints else 12.0
    except ImportError:
        cap_pos_pct = 12.0

    # Build country lookup
    aid_to_country = {}
    for a in assets:
        aid = getattr(a, "id", None) or getattr(a, "ticker", None)
        country = (getattr(a, "country", None) or "").strip()
        if aid:
            aid_to_country[aid] = country

    weights = dict(allocation)
    total_before = sum(weights.values())
    if total_before <= 0:
        return weights

    def _normalize(w: Dict[str, float]) -> Dict[str, float]:
        s = sum(w.values())
        if s <= 0:
            return w
        return {k: v * 100.0 / s for k, v in w.items()}

    weights = _normalize(weights)

    for iteration in range(max_iter):
        w_before = dict(weights)

        # 1. Cap par position individuelle — trim ceux au-dessus, redistribue prorata
        over_pos = {k: v for k, v in weights.items() if v > cap_pos_pct + tol}
        if over_pos:
            excess = sum(v - cap_pos_pct for v in over_pos.values())
            for k in over_pos:
                weights[k] = cap_pos_pct
            # Redistribuer l'excès sur les non-cappés (prorata)
            others = {k: v for k, v in weights.items() if k not in over_pos and v < cap_pos_pct - tol}
            other_total = sum(others.values()) or 1.0
            for k in others:
                weights[k] += excess * (others[k] / other_total)

        # 2. Cap par pays
        by_country: Dict[str, float] = {}
        for aid, w in weights.items():
            c = aid_to_country.get(aid, "?")
            by_country[c] = by_country.get(c, 0.0) + w

        over_country = {c: w for c, w in by_country.items() if w > cap_country_pct + tol}
        if over_country:
            for country, total_w in over_country.items():
                excess = total_w - cap_country_pct
                offending = [aid for aid, w in weights.items()
                              if aid_to_country.get(aid) == country]
                # Trim proportionnel
                for aid in offending:
                    cur = weights[aid]
                    weights[aid] = cur * (cap_country_pct / total_w)
                # Redistribuer sur autres pays (prorata, sans dépasser cap_pos)
                others = [aid for aid in weights if aid_to_country.get(aid) != country
                          and weights[aid] < cap_pos_pct - tol]
                other_total = sum(weights[a] for a in others) or 1.0
                for aid in others:
                    add = excess * (weights[aid] / other_total)
                    # Anticipe le cap individuel : limite l'add
                    add_max = max(0, cap_pos_pct - weights[aid])
                    weights[aid] += min(add, add_max)

        # 3. Renormaliser
        weights = _normalize(weights)

        # 4. Test de convergence
        max_change = max(abs(weights[k] - w_before.get(k, 0)) for k in weights)
        if max_change < tol:
            logger.info(f"   [{profile}] 📐 Caps convergés en {iteration+1} itération(s)")
            break
    else:
        logger.warning(f"   [{profile}] ⚠️ Caps non convergés après {max_iter} itérations, "
                       f"best effort retenu (Δ max = {max_change:.2f}pp)")

    # Vérif finale
    final_max = max(weights.values()) if weights else 0
    final_by_country: Dict[str, float] = {}
    for aid, w in weights.items():
        c = aid_to_country.get(aid, "?")
        final_by_country[c] = final_by_country.get(c, 0.0) + w
    final_max_country = max(final_by_country.values()) if final_by_country else 0
    logger.info(f"   [{profile}] 🎯 Final : max_pos={final_max:.1f}% (cap {cap_pos_pct}%), "
                f"max_country={final_max_country:.1f}% (cap {cap_country_pct}%)")

    return {k: round(v, 3) for k, v in weights.items()}


# Alias pour compatibilité descendante avec le code existant
_enforce_max_country = _enforce_caps_iterative


def _load_pea_overrides() -> Dict[str, Dict]:
    """Charge config/pea_eligibility_overrides.json (cached)."""
    global _PEA_OVERRIDES_CACHE
    if _PEA_OVERRIDES_CACHE is not None:
        return _PEA_OVERRIDES_CACHE
    path = os.path.join("config", "pea_eligibility_overrides.json")
    if not os.path.exists(path):
        _PEA_OVERRIDES_CACHE = {}
        return _PEA_OVERRIDES_CACHE
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _PEA_OVERRIDES_CACHE = data.get("overrides", {})
        logger.info(f"📋 PEA eligibility overrides chargés : {len(_PEA_OVERRIDES_CACHE)} tickers")
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"⚠️ Échec lecture {path}: {e}")
        _PEA_OVERRIDES_CACHE = {}
    return _PEA_OVERRIDES_CACHE


def _apply_envelope_country_filter(equities: List[dict], profile: str) -> List[dict]:
    """Applique le filtre pays selon l'enveloppe fiscale (PEA / CTO).

    Pour les 3 profils historiques (Agressif/Modéré/Stable) ou tout profil sans
    sous-enveloppe : retourne la liste inchangée.

    v8.x.1: les overrides PEA (config/pea_eligibility_overrides.json) priment
    sur le filtre pays par défaut pour les cas hybrides (Accenture siège IE
    coté NYSE, STM siège NL coté Paris, etc.).

    v8.x.5: détecte les collisions de tickers au premier appel et logue les
    cas ambigus (ADM = Admiral UK + Archer Daniels US, etc.).
    """
    global _TICKER_COLLISIONS_DETECTED
    # Une fois par session, scanne l'univers pour repérer les collisions
    if not _TICKER_COLLISIONS_DETECTED and equities:
        _TICKER_COLLISIONS_DETECTED = _detect_ticker_collisions(equities)
        if _TICKER_COLLISIONS_DETECTED:
            logger.warning(f"⚠️  Collisions de tickers détectées dans l'univers ({len(_TICKER_COLLISIONS_DETECTED)} tickers) :")
            for tk, instances in _TICKER_COLLISIONS_DETECTED.items():
                logger.warning(f"   • {tk} :")
                for inst in instances:
                    logger.warning(f"       └─ {inst['name'][:40]:40s} | {inst['country']:<14} | {inst['mic']:<10} | "
                                   f"quality={inst['quality_score']} | yield={inst['dividend_yield']}%")
            logger.warning(f"   💡 Utiliser clés composites (ex: 'ADM@XLON') dans dividende_baseline.json")
        else:
            logger.info("✅ Aucune collision de ticker détectée dans l'univers")

    try:
        from portfolio_engine.preset_meta import (
            PROFILE_POLICY,
            PEA_ELIGIBLE_COUNTRIES,
            CTO_ELIGIBLE_COUNTRIES,
        )
    except ImportError:
        return equities

    policy = PROFILE_POLICY.get(profile, {})
    mode = policy.get("_country_filter_mode")
    if not mode:
        return equities

    if mode == "pea":
        allowed = PEA_ELIGIBLE_COUNTRIES
    elif mode == "cto":
        allowed = CTO_ELIGIBLE_COUNTRIES
    else:
        return equities

    overrides = _load_pea_overrides()

    filtered = []
    overrides_applied = 0
    for e in equities:
        ticker = (e.get("ticker") or "").upper().strip()
        country = (e.get("country") or "").strip()
        override = overrides.get(ticker)

        if override is not None:
            # Override explicite : on respecte la décision
            override_pea_eligible = bool(override.get("pea_eligible"))
            if mode == "pea" and override_pea_eligible:
                filtered.append(e)
                overrides_applied += 1
            elif mode == "cto" and not override_pea_eligible:
                filtered.append(e)
                overrides_applied += 1
            # Sinon : on EXCLUT (l'override force le ticker dans l'autre enveloppe)
        else:
            # Pas d'override : filtre pays classique
            if country in allowed:
                filtered.append(e)

    if overrides_applied:
        logger.info(f"   [{profile}] 📋 {overrides_applied} overrides PEA appliqués")
    return filtered

# =============================================================================
# v4.14.0: RESEARCH DISCLAIMER (ChatGPT suggestion for AMF compliance)
# =============================================================================

RESEARCH_DISCLAIMER_V414 = {
    "execution_grade": "research_only",
    "investable": False,
    "disclaimer": (
        "Portefeuilles théoriques à vocation éducative et pédagogique. "
        "Ne constitue pas un conseil en investissement au sens de l'AMF. "
        "Risques obligataires simplifiés (pas d'analyse duration/spread/rating). "
        "Pour un investissement réel, consultez un conseiller financier agréé."
    ),
    "limitations": [
        "Pas d'analyse duration obligataire",
        "Pas de credit spread analysis", 
        "Pas de stress testing historique (2020/2022)",
        "Pas de règles de rebalancement temps réel",
    ],
}
# =============================================================================
# v5.0.0: EQUITY SCORING CONFIGURATION (Option B)
# =============================================================================

EQUITY_SCORING_CONFIG = {
    "mode": CONFIG.get("equity_scoring_mode", "preset"),
    "description": {
        "preset": "preset_meta.py = seul moteur scoring equity (Option B)",
        "factors": "factors.py calcule composite_score (legacy)",
        "blend": "Les deux moteurs actifs (A/B testing)",
    },
    "pipeline": {
        "preset": [
            "1. load equities → enrichir avec Buffett (apply_buffett_filter)",
            "2. select_equities_for_profile_v2() applique:",
            "   - assign_preset_to_equity()",
            "   - apply_hard_filters() avec relaxation progressive",
            "   - score_equity_for_profile() avec normalize_profile_score()",
            "3. Résultat: _profile_score [0,1] pour chaque equity",
            "4. factors.py: buffett_score ONLY (pas de composite_score)",
        ],
        "factors": [
            "1. load equities → compute_scores() via FactorScorer",
            "2. filter_equities() standard",
            "3. select_equities_for_profile() utilise composite_score",
            "4. factors.py: composite_score complet",
        ],
    },
}


def log_scoring_config():
    """v5.0.0: Log la configuration de scoring au démarrage."""
    mode = EQUITY_SCORING_CONFIG["mode"]
    desc = EQUITY_SCORING_CONFIG["description"].get(mode, "unknown")
    logger.info(f"📊 EQUITY_SCORING_MODE = '{mode}' ({desc})")
    if mode == "preset":
        logger.info(f"   ℹ️  compute_scores() sera SKIP pour equities (buffett_score only)")
        logger.info(f"   ℹ️  preset_meta.py v5.0.0 gère: hard_filters, relaxation, normalize_profile_score")
    elif mode == "factors":
        logger.info(f"   ⚠️  Mode legacy: factors.py calcule composite_score")
    elif mode == "blend":
        logger.info(f"   🔬 Mode A/B testing: les deux scores calculés")
def validate_scoring_pipeline(equities: List[dict], profile: str) -> Dict[str, Any]:
    """
    v5.0.0: Valide que le pipeline de scoring a bien fonctionné.
    
    Returns:
        Dict avec statistiques de validation
    """
    mode = EQUITY_SCORING_CONFIG["mode"]
    
    stats = {
        "mode": mode,
        "profile": profile,
        "total": len(equities),
        "has_profile_score": 0,
        "has_composite_score": 0,
        "has_buffett_score": 0,
        "has_matched_preset": 0,
        "score_distribution": {},
    }
    
    for eq in equities:
        if eq.get("_profile_score") is not None:
            stats["has_profile_score"] += 1
        if eq.get("composite_score") is not None:
            stats["has_composite_score"] += 1
        if eq.get("_buffett_score") is not None or eq.get("buffett_score") is not None:
            stats["has_buffett_score"] += 1
        if eq.get("_matched_preset"):
            stats["has_matched_preset"] += 1
    
    # Calculer distribution des scores
    if mode == "preset" and stats["has_profile_score"] > 0:
        scores = [eq.get("_profile_score", 0) for eq in equities if eq.get("_profile_score") is not None]
        if scores:
            stats["score_distribution"] = {
                "min": round(min(scores), 3),
                "max": round(max(scores), 3),
                "avg": round(sum(scores) / len(scores), 3),
                "median": round(sorted(scores)[len(scores)//2], 3),
            }
    
    # Warnings
    stats["warnings"] = []
    
    if mode == "preset":
        if stats["has_profile_score"] == 0:
            stats["warnings"].append("CRITICAL: Aucun _profile_score trouvé en mode 'preset'")
        if stats["has_matched_preset"] == 0:
            stats["warnings"].append("WARNING: Aucun _matched_preset trouvé")
    elif mode == "factors":
        if stats["has_composite_score"] == 0:
            stats["warnings"].append("CRITICAL: Aucun composite_score trouvé en mode 'factors'")
    
    return stats


def print_scoring_validation(stats: Dict[str, Any]):
    """v5.0.0: Affiche le résumé de validation scoring."""
    logger.info(f"\n   [SCORING VALIDATION - {stats['profile']}]")
    logger.info(f"   Mode: {stats['mode']} | Total: {stats['total']}")
    logger.info(f"   _profile_score: {stats['has_profile_score']} | composite_score: {stats['has_composite_score']}")
    logger.info(f"   buffett_score: {stats['has_buffett_score']} | _matched_preset: {stats['has_matched_preset']}")
    
    if stats.get("score_distribution"):
        dist = stats["score_distribution"]
        logger.info(f"   Score distribution: min={dist['min']}, max={dist['max']}, avg={dist['avg']}, median={dist['median']}")
    
    for warning in stats.get("warnings", []):
        logger.warning(f"   ⚠️ {warning}")       
       

# ============= CHARGEMENT DONNÉES =============

def load_json_safe(path: str) -> Dict:
    """Charge un JSON avec gestion d'erreur."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Impossible de charger {path}: {e}")
        return {}


def load_yaml_config(path: str) -> Dict:
    """Charge la configuration YAML."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception as e:
        logger.warning(f"Impossible de charger config {path}: {e}")
        return {}


def load_brief_data() -> Optional[Dict]:
    """Cherche et charge le brief stratégique."""
    for path in CONFIG["brief_paths"]:
        if Path(path).exists():
            data = load_json_safe(path)
            if data:
                logger.info(f"Brief chargé depuis {path}")
                return data
    logger.warning("Aucun brief trouvé")
    return None


def load_stocks_data() -> list:
    """Charge les fichiers stocks JSON."""
    stocks = []
    for path in CONFIG["stocks_paths"]:
        if Path(path).exists():
            data = load_json_safe(path)
            if data:
                stocks.append(data)
                logger.info(f"Stocks: {path} ({len(data.get('stocks', []))} entrées)")
    return stocks


# ============= v4.7 P0: ROUNDING INTELLIGENT =============

def round_weights_to_100(weights: Dict[str, float], decimals: int = 0) -> Dict[str, float]:
    """
    v4.7 P0 FIX: Arrondit les poids pour que la somme = exactement 100%.
    v4.14.0 FIX R7-3: Garantit 100 exact même en fallback proportional.
    """
    if not weights:
        return {}
    
    sorted_items = sorted(weights.items(), key=lambda x: x[1], reverse=True)
    
    if len(sorted_items) == 1:
        return {sorted_items[0][0]: 100.0}
    
    rounded = {}
    running_sum = 0.0
    
    for i, (name, weight) in enumerate(sorted_items):
        if i == 0:
            continue
        rounded_weight = round(weight, decimals)
        rounded[name] = rounded_weight
        running_sum += rounded_weight
    
    first_name = sorted_items[0][0]
    first_weight = round(100.0 - running_sum, decimals)
    
    original_first = sorted_items[0][1]
    if abs(first_weight - original_first) > 3:
        logger.warning(f"Rounding adjustment too large ({original_first:.1f} → {first_weight:.1f}), using proportional")
        total = sum(weights.values())
        proportional = {k: round(v * 100 / total, decimals) for k, v in weights.items()}
        
        # v4.14.0 FIX R7-3: Forcer sum=100 exact même en proportional
        prop_sum = sum(proportional.values())
        if prop_sum != 100.0:
            # Ajuster la plus grande valeur pour compenser
            sorted_prop = sorted(proportional.items(), key=lambda x: x[1], reverse=True)
            largest_key = sorted_prop[0][0]
            proportional[largest_key] = round(proportional[largest_key] + (100.0 - prop_sum), decimals)
        
        return proportional
    
    rounded[first_name] = first_weight
    return rounded


def format_weight_as_percent(weight: float, decimals: int = 0) -> str:
    """Formate un poids en string pourcentage."""
    if decimals == 0:
        return f"{int(round(weight))}%"
    else:
        return f"{weight:.{decimals}f}%"


# =============================================================================
# v4.14.0 P1-4: ROE SANITY CHECK
# =============================================================================

def flag_suspicious_roe(
    roe,
    de_ratio=None,
    pe_ratio=None,
    name: str = ""
) -> Optional[Dict[str, Any]]:
    """
    v4.14.0 P1-4 FIX: Détecte les ROE anormaux (equity négative, levier extrême).
    
    Cas détectés:
    - ROE > 100% → probable equity très faible ou négatif
    - ROE < -50% → perte massive
    - D/E < 0 → equity négative (dette > actifs)
    - ROE > 50% avec D/E > 5 → levier extrême
    
    Returns:
        None si OK, sinon dict avec warning et explanation
    """
    if roe is None:
        return None
    
    try:
        roe = float(roe)
    except (ValueError, TypeError):
        return None
    
    warnings = []
    severity = "info"
    
    # Check ROE anormalement élevé
    if roe > 100:
        warnings.append(f"ROE {roe:.0f}% > 100%: probable equity très faible ou comptabilité spéciale")
        severity = "warning"
    
    if roe > 200:
        warnings.append(f"ROE {roe:.0f}% extrême: likely negative equity or special accounting")
        severity = "critical"
    
    # Check ROE négatif
    if roe < -50:
        warnings.append(f"ROE {roe:.0f}%: pertes massives")
        severity = "warning"
    
    # Check D/E négatif (equity négative)
    if de_ratio is not None:
        try:
            de_ratio = float(de_ratio)
            if de_ratio < 0:
                warnings.append(f"D/E ratio {de_ratio:.2f} négatif: equity négative (dette > actifs)")
                severity = "critical"
            elif de_ratio > 5 and roe > 50:
                warnings.append(f"ROE {roe:.0f}% avec D/E {de_ratio:.1f}: performance amplifiée par levier extrême")
                severity = "warning"
        except (ValueError, TypeError):
            pass
    
    if not warnings:
        return None
    
    return {
        "asset_name": name,
        "roe": roe,
        "de_ratio": de_ratio,
        "pe_ratio": pe_ratio,
        "severity": severity,
        "warnings": warnings,
        "recommendation": (
            "Vérifier manuellement. ROE anormal souvent causé par: equity négative, "
            "one-time charges, stock buybacks, ou secteurs à faible capital."
        ),
    }


def enrich_equities_with_roe_warnings(eq_rows: list) -> list:
    """v4.14.0: Enrichit les equities avec warnings ROE si applicable."""
    roe_warnings_count = 0
    for eq in eq_rows:
        roe = eq.get("roe")
        de_ratio = eq.get("de_ratio")
        pe_ratio = eq.get("pe_ratio")
        name = eq.get("name") or eq.get("ticker") or "Unknown"
        
        warning = flag_suspicious_roe(roe, de_ratio, pe_ratio, name)
        
        if warning:
            eq["_roe_warning"] = warning
            roe_warnings_count += 1
    
    if roe_warnings_count > 0:
        logger.warning(f"⚠️ v4.14.0 P1-4: {roe_warnings_count} equities avec ROE anormal détectées")
    
    return eq_rows


# =============================================================================
# v4.14.0 P0-2: PRUNE ALLOCATION TO RESPECT max_assets
# =============================================================================

def prune_allocation_to_max_assets(
    allocation: Dict[str, float],
    max_assets: int = 18,
    min_weight_pct: float = 1.0,
    redistribution_mode: str = "pro_rata"
) -> Tuple[Dict[str, float], Dict[str, Any]]:
    """
    v4.14.0 P0-2 FIX: Prune les petites positions pour respecter max_assets.
    
    Args:
        allocation: {asset_id: weight_pct}
        max_assets: Nombre max de positions
        min_weight_pct: Poids minimum pour garder une position
        redistribution_mode: "pro_rata" ou "top_scores"
    
    Returns:
        (pruned_allocation, prune_report)
    """
    if len(allocation) <= max_assets:
        return allocation, {"pruned": 0, "reason": "already_compliant"}
    
    # Trier par poids
    sorted_items = sorted(allocation.items(), key=lambda x: x[1], reverse=True)
    
    # Stratégie: Supprimer les positions < min_weight_pct puis les plus petites
    kept = []
    removed = []
    
    for aid, weight in sorted_items:
        if weight < min_weight_pct:
            removed.append((aid, weight))
        else:
            kept.append((aid, weight))
    
    # Si toujours trop de positions, supprimer les plus petites
    if len(kept) > max_assets:
        kept_sorted = sorted(kept, key=lambda x: x[1], reverse=True)
        extra = kept_sorted[max_assets:]
        kept = kept_sorted[:max_assets]
        removed.extend(extra)
    
    # Redistribuer le poids supprimé
    removed_weight = sum(w for _, w in removed)
    kept_dict = dict(kept)
    
    if redistribution_mode == "pro_rata" and kept_dict:
        total_kept = sum(kept_dict.values())
        for aid in kept_dict:
            kept_dict[aid] += removed_weight * (kept_dict[aid] / total_kept)
    
    # v4.14.0 FIX R10-2: Normaliser à 100% avec round_weights_to_100 (garantit somme exacte)
    total = sum(kept_dict.values())
    if total > 0:
        # Convertir en % puis forcer somme exacte
        kept_dict_pct = {k: v * 100 / total for k, v in kept_dict.items()}
        kept_dict = round_weights_to_100(kept_dict_pct, decimals=2)
    
    return kept_dict, {
        "pruned": len(removed),
        "removed_positions": [aid for aid, _ in removed],
        "removed_weight_pct": round(removed_weight, 2),
        "final_count": len(kept_dict),
    }


# =============================================================================
# v4.14.0 R14-3: POST-PROCESS ALLOCATION HELPER
# =============================================================================

def post_process_allocation(
    allocation: Dict[str, float],
    profile_config,
    diagnostics: Dict,
    profile_name: str = "Unknown"
) -> Dict[str, float]:
    """
    v4.14.0 R14-3: Post-processing unifié pour Global et EU/US.
    
    Applique:
    1. Prune si > max_assets
    2. Cap max_single (boucle robuste)
    3. round_weights_to_100
    
    Args:
        allocation: {asset_id: weight_pct}
        profile_config: Configuration du profil (PROFILES.get(profile))
        diagnostics: Dict pour stocker les rapports
        profile_name: Nom du profil pour les logs
    
    Returns:
        allocation post-traitée
    """
    if not allocation:
        return allocation
    
    # 1. Prune si > max_assets
    profile_max_assets = getattr(profile_config, "max_assets", 18)
    if len(allocation) > profile_max_assets:
        allocation, prune_report = prune_allocation_to_max_assets(
            allocation, 
            max_assets=profile_max_assets,
            min_weight_pct=1.25,
        )
        diagnostics["_prune_report"] = prune_report
        logger.info(f"   [{profile_name}] v4.14.0 P0-2: Pruned {prune_report['pruned']} positions to respect max_assets={profile_max_assets}")
    
    # 2. Cap max_single (boucle robuste - jusqu'à 10 itérations pour cascades)
    max_single = getattr(profile_config, "max_single_position", 15.0)
    for iteration in range(10):
        violators = [k for k, v in allocation.items() if v > max_single + 1e-9]
        if not violators:
            break
        for aid in violators:
            weight = allocation[aid]
            logger.warning(f"   [{profile_name}] ⚠️ max_single violation (iter {iteration+1}): {aid}={weight:.1f}% > max_single={max_single}%")
            excess = weight - max_single
            allocation[aid] = max_single
            # Redistribuer pro-rata aux autres
            others = {k: v for k, v in allocation.items() if k != aid}
            if others:
                total_others = sum(others.values())
                for k in others:
                    allocation[k] += excess * (others[k] / total_others)
            diagnostics.setdefault("_max_single_adjustments", []).append({
                "asset": aid,
                "original": weight,
                "capped_to": max_single,
                "excess_redistributed": excess,
                "iteration": iteration + 1,
            })
    
    # 3. Re-normaliser TOUJOURS pour éviter micro-erreurs flottantes
    allocation = {k: float(v) for k, v in allocation.items()}
    allocation = round_weights_to_100(allocation, decimals=2)
    
    # v3.3: ENFORCE CRYPTO CAP after normalization
    # round_weights_to_100 scales proportionally → crypto can exceed cap
    crypto_max = getattr(profile_config, "crypto_max", 10.0)
    crypto_ids = [k for k, v in allocation.items() if "crypto" in k.lower() or "btc" in k.lower() or "eth" in k.lower() or "dcr" in k.lower() or "/usd" in k.lower()]
    crypto_total = sum(allocation.get(k, 0) for k in crypto_ids)
    if crypto_total > crypto_max + 0.1 and crypto_ids:
        excess = crypto_total - crypto_max
        # Scale down crypto proportionally
        ratio = crypto_max / crypto_total if crypto_total > 0 else 0
        freed = 0.0
        for cid in crypto_ids:
            old_w = allocation[cid]
            new_w = round(old_w * ratio, 2)
            freed += old_w - new_w
            allocation[cid] = new_w
        # Redistribute to non-crypto
        non_crypto = {k: v for k, v in allocation.items() if k not in crypto_ids and v > 0}
        if non_crypto and freed > 0.1:
            total_nc = sum(non_crypto.values())
            for k in non_crypto:
                allocation[k] = round(allocation[k] + freed * (non_crypto[k] / total_nc), 2)
        # Final normalization
        allocation = round_weights_to_100(allocation, decimals=2)
        logger.info(f"   [{profile_name}] v3.3: Crypto capped {crypto_total:.1f}% → {crypto_max}% (excess {excess:.1f}% redistributed)")
    
    return allocation


# =============================================================================
# v4.14.0 P1-3: CONSTRAINT CLASSIFIER (hard vs indicators)
# =============================================================================

class ConstraintType(Enum):
    """Type de contrainte pour clarifier le rapport."""
    HARD = "hard"
    SOFT = "soft"
    INDICATOR = "indicator"


def classify_constraint_results(constraint_report: Dict) -> Dict[str, Any]:
    """
    v4.14.0 P1-3 FIX: Classifie les résultats en hard vs indicators.
    Élimine le paradoxe "status=OK mais outside_range=true".
    
    v4.14.0 FIX R7: Utilise priority/is_indicator si présent, AVANT la whitelist.
    v4.14.0 FIX R8: Plus robuste - gère details.priority, details.is_indicator, outside_range.
    
    Args:
        constraint_report: Rapport brut (dict ou ConstraintReport.to_dict())
    
    Returns:
        Dict avec hard_constraints, indicators, summary séparés
    """
    hard_constraints = []
    indicators = []
    
    violations = constraint_report.get("violations", [])
    warnings = constraint_report.get("warnings", [])
    
    # Contraintes HARD (bloquantes) - whitelist de secours
    hard_names = {"sum_100", "bounds_positive", "max_single_position", 
                  "bonds_min", "crypto_max", "max_single_bond"}
    
    # Contraintes INDICATOR (informatives) - whitelist de secours
    indicator_names = {"bucket_core", "bucket_defensive", "bucket_satellite",
                       "n_assets", "vol_target"}
    
    def _determine_type(item: Any) -> Tuple[bool, str]:
        """Détermine si c'est hard ou indicator, et le nom."""
        if not isinstance(item, dict):
            name = str(item)
            is_hard = any(h in name for h in hard_names)
            return is_hard, name
        
        name = item.get("name", "")
        details = item.get("details", {}) if isinstance(item.get("details"), dict) else {}
        
        # v4.14.0 FIX R8: Ordre de priorité pour déterminer le type
        # 1. priority au top-level
        if item.get("priority") == "hard":
            return True, name
        if item.get("priority") == "indicator":
            return False, name
        
        # 2. details.priority
        if details.get("priority") == "hard":
            return True, name
        if details.get("priority") == "indicator":
            return False, name
        
        # 3. is_indicator / is_blocking
        if item.get("is_indicator") or details.get("is_indicator"):
            return False, name
        if item.get("is_blocking") is True or details.get("is_blocking") is True:
            return True, name
        if item.get("is_blocking") is False or details.get("is_blocking") is False:
            return False, name
        
        # 4. Fallback sur whitelist de noms
        return name in hard_names, name
    
    def _determine_status(item: Any, is_hard: bool) -> str:
        """Détermine le status (VIOLATED/OUT_OF_RANGE/IN_RANGE)."""
        if not isinstance(item, dict):
            return "VIOLATED" if is_hard else "OUT_OF_RANGE"
        
        details = item.get("details", {}) if isinstance(item.get("details"), dict) else {}
        
        # v4.14.0 FIX R8: Utiliser outside_range si présent
        outside_range = item.get("outside_range", details.get("outside_range"))
        if outside_range is False:
            return "IN_RANGE"
        if outside_range is True:
            return "OUT_OF_RANGE" if not is_hard else "VIOLATED"
        
        # Fallback
        return "VIOLATED" if is_hard else "OUT_OF_RANGE"
    
    for v in violations:
        is_hard, name = _determine_type(v)
        status = _determine_status(v, is_hard)
        
        # v4.14.0 FIX R9-3: Garde-fou - un item dans violations ne peut pas être IN_RANGE
        if status == "IN_RANGE":
            status = "VIOLATED" if is_hard else "OUT_OF_RANGE"
        
        entry = {
            "name": name,
            "type": "hard" if is_hard else "indicator",
            "status": status,
            "is_blocking": is_hard,
            "details": v if isinstance(v, dict) else {"raw": str(v)},
        }
        
        if is_hard:
            hard_constraints.append(entry)
        else:
            indicators.append(entry)
    
    # Ajouter warnings comme indicators
    for w in warnings:
        is_hard, w_name = _determine_type(w)
        status = _determine_status(w, False)  # Warnings jamais hard
        
        # Forcer indicator pour les warnings
        indicators.append({
            "name": w_name[:50] if len(w_name) > 50 else w_name,
            "type": "indicator",
            "status": status,
            "is_blocking": False,
            "details": w if isinstance(w, dict) else {"warning": str(w)},
        })
    
    return {
        "hard_constraints": hard_constraints,
        "indicators": indicators,
        "summary": {
            "hard_all_satisfied": len(hard_constraints) == 0,
            "hard_violated_count": len(hard_constraints),
            "indicators_count": len(indicators),
            "indicators_out_of_range": len([i for i in indicators if i["status"] == "OUT_OF_RANGE"]),
            "indicators_in_range": len([i for i in indicators if i["status"] == "IN_RANGE"]),
        },
        "original_report": constraint_report,
    }


# =============================================================================
# v4.14.0 P0-1: REBUILD DISPLAY SECTIONS FROM _tickers (source unique)
# =============================================================================

def _normalize_category_for_display(category: str) -> str:
    """Normalise une catégorie vers le format display (Actions/ETF/Obligations/Crypto)."""
    cat = (category or "").lower()
    if "action" in cat or "equity" in cat or "stock" in cat:
        return "Actions"
    if "oblig" in cat or "bond" in cat:
        return "Obligations"
    if "crypto" in cat:
        return "Crypto"
    return "ETF"

# =============================================================================
# v5.2.1 FIX: Build _tickers_meta BEFORE risk_analysis
# =============================================================================

def build_tickers_meta_for_risk(
    allocation_pct: Dict[str, float], 
    assets: list
) -> Dict[str, Dict[str, Any]]:
    """
    v5.2.1: Construit _tickers_meta AVANT risk_analysis.
    
    Root cause fix: évite le fallback dans _build_allocation_list().
    """
    assets_by_id = {}
    for a in (assets or []):
        aid = _safe_get_attr(a, "id")
        if aid:
            assets_by_id[str(aid)] = a

    meta: Dict[str, Dict[str, Any]] = {}
    
    for aid, w_pct in (allocation_pct or {}).items():
        a = assets_by_id.get(str(aid))
        if not a:
            continue

        ticker = _extract_symbol_from_asset(a) or _extract_ticker_from_asset(a, str(aid))
        ticker = _normalize_key(ticker) or ticker
        if not ticker:
            continue

        category_raw = _safe_get_attr(a, "category") or "ETF"
        category = _normalize_category_for_display(category_raw)
        name = _safe_get_attr(a, "name") or ticker

        entry = meta.setdefault(ticker, {
            "weight": 0.0, 
            "category": category,
            "name": name,
            "asset_ids": [],
        })
        entry["weight"] += float(w_pct) / 100.0
        entry["asset_ids"].append(str(aid))
        
        # v5.4.1: Always try to propagate industry + beta (not just on first setdefault)
        # source_data comes from stocks JSON, try multiple access patterns
        _src = None
        if hasattr(a, 'source_data') and a.source_data:
            _src = a.source_data
        elif hasattr(a, 'data') and isinstance(getattr(a, 'data', None), dict):
            _src = a.data
        
        if _src:
            if not entry.get("industry"):
                entry["industry"] = _src.get("industry", "")
            if entry.get("beta") is None:
                # v5.4.2: Prefer beta_provider (standard market beta from data vendor)
                # over beta/beta_capm which are vs REGIONAL benchmarks (VGK for EU)
                # and near-zero for US stocks vs VGK.
                # Priority: beta_provider > beta > beta_capm
                _bp = _src.get("beta_provider")
                if _bp is not None:
                    try:
                        entry["beta"] = float(_bp)
                    except (ValueError, TypeError):
                        pass
                if entry.get("beta") is None:
                    _b = _src.get("beta") or _src.get("beta_capm")
                    if _b is not None:
                        try:
                            entry["beta"] = float(_b)
                        except (ValueError, TypeError):
                            pass
        
        # Fallback: try direct attributes on asset object
        if entry.get("beta") is None:
            for _attr in ["beta", "beta_capm"]:
                _val = getattr(a, _attr, None)
                if _val is not None:
                    try:
                        entry["beta"] = float(_val)
                        break
                    except (ValueError, TypeError):
                        pass

    return meta
   
def rebuild_display_sections_from_tickers(
    tickers_dict: Dict[str, float],
    asset_map: Dict[str, Dict]
) -> Tuple[Dict[str, Dict[str, str]], Dict[str, float]]:
    """
    v4.14.0 P0-1 FIX: Reconstruit les sections display DEPUIS _tickers (source unique).
    
    v4.14.0 FIX R6: Agrège par TICKER (pas name) pour éviter collisions ADR/dual listing.
    v4.14.0 FIX R8: Ne pas drop petites lignes avant round → fidélité à l'allocation réelle.
    Retourne aussi les poids numériques pour calcul de somme fiable.
    
    Args:
        tickers_dict: {ticker: weight_decimal} - source unique de vérité
        asset_map: {ticker: {name, category, ...}} - mapping pour display
    
    Returns:
        (sections_dict, numeric_weights)
        - sections_dict: {"Actions": {...}, "ETF": {...}, ...} avec strings "X.X%"
        - numeric_weights: {display_key: weight_pct} pour calculs
    """
    sections = {"Actions": {}, "ETF": {}, "Obligations": {}, "Crypto": {}}
    numeric_weights = {}  # Pour calcul de somme fiable
    
    # Agréger par (category, ticker) pour éviter collisions de noms
    aggregated = {}  # {(category, ticker, display_name): weight_sum}
    
    for ticker, weight_decimal in tickers_dict.items():
        # v4.14.0 FIX R10-1: Lookup avec clé normalisée (upper + strip)
        ticker_norm = _normalize_key(ticker)
        info = asset_map.get(ticker_norm) or asset_map.get(ticker, {})
        category = _normalize_category_for_display(info.get("category", "ETF"))
        name = info.get("name") or ticker
        
        # v4.15.0 FIX B: Affichage robuste pour éviter collisions sur ISIN longs
        # Évite les collisions si deux actifs ont le même name
        if name and name != ticker:
            # Pour les ISIN/identifiants longs (>12 chars), afficher début…fin
            if len(ticker) > 12:
                display_t = f"{ticker[:4]}…{ticker[-6:]}"
            else:
                display_t = ticker
            display_name = f"{name} ({display_t})"
        else:
            display_name = str(ticker)
        
        key = (category, ticker, display_name)
        aggregated[key] = aggregated.get(key, 0.0) + weight_decimal
    
    # v4.14.0 FIX R8: Convertir TOUTES les lignes en pourcentages (pas de filtre)
    # v4.14.0 FIX R14-1: Sommer au lieu d'écraser pour éviter collisions
    for (category, ticker, display_name), weight in aggregated.items():
        pct_value = weight * 100
        if pct_value > 0:  # Garder tout ce qui est > 0 pour le round
            nw_key = f"{category}:{display_name}"
            numeric_weights[nw_key] = numeric_weights.get(nw_key, 0.0) + pct_value
    
    # Remplir sections (sera écrasé après round_weights_to_100)
    for key, pct in numeric_weights.items():
        cat, name = key.split(":", 1)
        sections[cat][name] = f"{pct:.1f}%"
    
    return sections, numeric_weights


# ============= BUFFETT DIAGNOSTIC =============

def print_buffett_diagnostic(assets: List[dict], title: str = "DIAGNOSTIC FILTRE BUFFETT"):
    """Affiche un diagnostic du filtre Buffett sur l'univers."""
    if not assets:
        print("⚠️  Pas d'actifs à analyser")
        return
        
    print("\n" + "=" * 80)
    print(f"🎯 {title}")
    print("=" * 80)
    
    summary = get_sector_summary(assets)
    
    if not summary:
        print("⚠️  Pas de données sectorielles disponibles")
        return
    
    total_with_roe = sum(1 for a in assets if a.get("roe") and float(a.get("roe", 0) or 0) > 0)
    total_with_de = sum(1 for a in assets if a.get("de_ratio") is not None)
    
    print(f"\n📈 Couverture données: ROE={total_with_roe}/{len(assets)} ({100*total_with_roe//max(1,len(assets))}%), "
          f"D/E={total_with_de}/{len(assets)} ({100*total_with_de//max(1,len(assets))}%)")
    
    print(f"\n{'Secteur':<22} | {'Count':>6} | {'ROE moy':>10} | {'D/E moy':>10} | {'Score':>8} | {'Rejetés':>8}")
    print("-" * 80)
    
    total_count = 0
    total_rejected = 0
    scores = []
    
    sorted_sectors = sorted(
        summary.items(),
        key=lambda x: x[1].get("avg_buffett_score") or 0,
        reverse=True
    )
    
    for sector, stats in sorted_sectors:
        count = stats.get("count", 0)
        avg_roe = stats.get("avg_roe")
        avg_de = stats.get("avg_de")
        avg_score = stats.get("avg_buffett_score")
        rejected = stats.get("rejected_count", 0)
        
        total_count += count
        total_rejected += rejected
        if avg_score:
            scores.append(avg_score)
        
        roe_str = f"{avg_roe:.1f}%" if avg_roe else "N/A"
        
        if avg_de is not None:
            if avg_de < 10:
                de_display = avg_de * 100
            else:
                de_display = avg_de
            de_str = f"{de_display:.0f}%"
        else:
            de_str = "N/A"
        
        score_str = f"{avg_score:.0f}" if avg_score else "N/A"
        
        if avg_score and avg_score >= 70:
            indicator = "🟢"
        elif avg_score and avg_score >= 50:
            indicator = "🟡"
        else:
            indicator = "🔴"
        
        print(f"{indicator} {sector:<20} | {count:>6} | {roe_str:>10} | {de_str:>10} | {score_str:>8} | {rejected:>8}")
    
    print("-" * 80)
    
    avg_global_score = sum(scores) / len(scores) if scores else 0
    print(f"{'TOTAL':<24} | {total_count:>6} | {'':<10} | {'':<10} | {avg_global_score:>7.0f} | {total_rejected:>8}")
    
    print("\n📊 Légende:")
    print("   🟢 Score ≥ 70 : Qualité Buffett excellente")
    print("   🟡 Score 50-69 : Qualité acceptable")
    print("   🔴 Score < 50 : Qualité insuffisante (filtré si score_min > 50)")
    
    scored_assets = [a for a in assets if a.get("_buffett_score") is not None]
    if len(scored_assets) >= 5:
        sorted_by_score = sorted(scored_assets, key=lambda x: x.get("_buffett_score", 0) or 0, reverse=True)
        
        print("\n🏆 TOP 5 Buffett:")
        for a in sorted_by_score[:5]:
            name = (a.get("name") or a.get("ticker") or "?")[:25]
            score = a.get("_buffett_score") or 0
            roe = a.get("roe")
            sector = a.get("_sector_key") or a.get("sector") or "?"
            roe_str = f"{float(roe):.1f}%" if roe and roe != "N/A" else "N/A"
            print(f"   • {name:<25} | Score: {score:>5.0f} | ROE: {roe_str:>8} | {sector}")
        
        print("\n⚠️  BOTTOM 5 Buffett:")
        for a in sorted_by_score[-5:]:
            name = (a.get("name") or a.get("ticker") or "?")[:25]
            score = a.get("_buffett_score") or 0
            reason = a.get("_buffett_reject_reason") or "score faible"
            sector = a.get("_sector_key") or a.get("sector") or "?"
            print(f"   • {name:<25} | Score: {score:>5.0f} | Raison: {reason} | {sector}")
    
    print("=" * 80 + "\n")


# ============= v4.4: TACTICAL CONTEXT DIAGNOSTIC =============

def print_tactical_context_diagnostic(market_context: Dict, mode: str = "radar"):
    """Affiche un diagnostic du contexte marché chargé."""
    print("\n" + "=" * 80)
    mode_label = "RADAR" if mode == "radar" else "GPT"
    print(f"📊 DIAGNOSTIC CONTEXTE TACTIQUE v4.9 - Mode {mode_label}")
    print("=" * 80)
    
    regime = market_context.get("market_regime", "N/A")
    confidence = market_context.get("confidence", "N/A")
    as_of = market_context.get("as_of", "N/A")
    
    print(f"\n📈 Régime marché: {regime} (confidence: {confidence})")
    print(f"   Date: {as_of}")
    
    macro_tilts = market_context.get("macro_tilts", {})
    if macro_tilts:
        favored_sectors = macro_tilts.get("favored_sectors", [])
        avoided_sectors = macro_tilts.get("avoided_sectors", [])
        favored_regions = macro_tilts.get("favored_regions", [])
        avoided_regions = macro_tilts.get("avoided_regions", [])
        rationale = macro_tilts.get("rationale", "N/A")
        
        print(f"\n✅ Tilts tactiques:")
        print(f"   Secteurs favorisés (+15%): {', '.join(favored_sectors) if favored_sectors else 'Aucun'}")
        print(f"   Secteurs évités (-15%): {', '.join(avoided_sectors) if avoided_sectors else 'Aucun'}")
        print(f"   Régions favorisées (+15%): {', '.join(favored_regions) if favored_regions else 'Aucun'}")
        print(f"   Régions évitées (-15%): {', '.join(avoided_regions) if avoided_regions else 'Aucun'}")
        print(f"\n   Rationale: {rationale}")
    else:
        print("\n⚠️ Pas de tilts tactiques (mode neutre)")
    
    trends = market_context.get("key_trends", [])
    risks = market_context.get("risks", [])
    
    if trends:
        print(f"\n📈 Tendances clés: {', '.join(trends)}")
    if risks:
        print(f"⚠️  Risques: {', '.join(risks)}")
    
    meta = market_context.get("_meta", {})
    if meta:
        model = meta.get("model", "N/A")
        is_fallback = meta.get("is_fallback", False)
        print(f"\n🔧 Méta: model={model}, fallback={is_fallback}")
    
    print("\n" + "=" * 80 + "\n")


# ============= v4.13.2: SÉLECTION ÉQUITIES PAR PROFIL (CORRIGÉ) =============
# Phase Sélection-1 (#1) : hard gate liquidité par profil.
# Élimine les small/mid-caps illiquides avant tout scoring.
# market_cap en USD raw (ex : Apple ≈ 3.4e12). ADV en shares (volume).
_LIQUIDITY_GATE = {
    # Note : market_cap est exprimé en devise locale (EUR pour stocks EU, USD pour US,
    # INR pour Indien, etc.). On ne convertit pas — les seuils sont en "B local currency",
    # ce qui filtre correctement les mid-caps locales tout en laissant passer les
    # mega-caps non-USD (ex : Sun Pharma 4425B INR ≈ 53B USD passe).
    # Phase Convexité-1 : seuils mcap revus à la baisse (reco expert).
    # Au sommet de la distribution, mcap et beta sont négativement corrélés
    # → un floor mcap haut agit comme un filtre low-beta furtif et fige
    # Modéré dans un univers structurellement défensif. On laisse le floor
    # volume jouer le rôle de filtre liquidité.
    "Agressif": {"market_cap_min": 1.0e9,  "share_volume_min": 200_000},   # SMid OK pour growth
    "Modéré":   {"market_cap_min": 5.0e9,  "share_volume_min": 500_000},   # 12B → 5B : réinjecte mid-cap beta
    "Stable":   {"market_cap_min": 10.0e9, "share_volume_min": 1_000_000}, # 18B → 10B : reste prudent
    # Profils Dividende perso : seuils intermédiaires (PEA accepte mid-caps EU)
    "Dividende-PEA": {"market_cap_min": 2.0e9, "share_volume_min": 100_000},
    "Dividende-CTO": {"market_cap_min": 2.0e9, "share_volume_min": 100_000},
}


def _apply_liquidity_gate(equities: List[dict], profile: str) -> Tuple[List[dict], Dict[str, int]]:
    """Filtre les équités sous les seuils de liquidité du profil.

    Returns: (kept, stats) où stats = {"rejected": N, "by_reason": {...}}.
    """
    cfg = _LIQUIDITY_GATE.get(profile)
    if not cfg:
        return equities, {"rejected": 0, "by_reason": {}}
    mcap_min = cfg["market_cap_min"]
    vol_min = cfg["share_volume_min"]
    kept = []
    by_reason: Dict[str, int] = {}
    for e in equities:
        # Bonds et ETFs ne sont pas concernés (déjà filtrés par AUM)
        cat = (e.get("category") or "").lower()
        if cat in ("etf", "bond", "obligations", "crypto"):
            kept.append(e); continue
        mcap = e.get("market_cap")
        vol = e.get("volume")
        # Si données absentes, on garde (sera scorée bas via factor liquidity)
        if mcap is None or mcap == 0:
            kept.append(e); continue
        if float(mcap) < mcap_min:
            by_reason["market_cap"] = by_reason.get("market_cap", 0) + 1
            continue
        if vol is not None and vol != 0 and float(vol) < vol_min:
            by_reason["share_volume"] = by_reason.get("share_volume", 0) + 1
            continue
        kept.append(e)
    return kept, {"rejected": sum(by_reason.values()), "by_reason": by_reason}


def select_equities_for_profile(
    eq_filtered: List[dict],
    profile: str,
    market_context: Optional[Dict] = None,
    target_n: int = 25,
) -> Tuple[List[dict], Dict]:
    """
    v4.13.2: Sélection avec VRAIE différenciation via preset_meta.

    Délègue à select_equities_for_profile_v2() de preset_meta.py qui:
    1. Assigne automatiquement _matched_preset
    2. Applique hard_filters (vol_min/vol_max) pour forcer divergence
    3. Score avec normalisation robuste [-S,+S] → [0,1]

    Phase Sélection-1 (#1) : pré-filtre liquidité dur avant scoring.

    Args:
        eq_filtered: Liste d'équités pré-filtrées
        profile: "Agressif", "Modéré", ou "Stable"
        market_context: Contexte RADAR pour tilts
        target_n: Nombre cible d'équités

    Returns:
        (equities_selected, selection_meta)
    """
    # Phase Sélection-1 (#1) : hard gate liquidité par profil
    _before = len(eq_filtered)
    eq_filtered, _liq_stats = _apply_liquidity_gate(eq_filtered, profile)
    if _liq_stats["rejected"]:
        logger.info(
            f"   [{profile}] Liquidity gate: {_liq_stats['rejected']} rejetés "
            f"({_before} → {len(eq_filtered)}) — raisons: {_liq_stats['by_reason']}"
        )

    if not HAS_PROFILE_POLICY:
        logger.warning(f"⚠️ PROFILE_POLICY non disponible pour {profile}, fallback uniforme")
        return sector_balanced_selection(
            assets=eq_filtered,
            target_n=min(target_n, len(eq_filtered)),
            initial_max_per_sector=4,
            score_field="composite_score",
            enable_radar_tiebreaker=True,
            radar_bonus_cap=0.03,
            radar_min_coverage=0.40,
            market_context=market_context,
        )
    
# v4.13.2: Utiliser la fonction corrigée de preset_meta.py
    try:
        equities, selection_meta = select_equities_for_profile_v2(
            equities=eq_filtered,
            profile=profile,
            market_context=market_context,
            target_n=target_n,
        )
        
        # ========== DEBUG PRESETS DISTRIBUTION ==========
        if profile == "Agressif":
            import json
            preset_counts = {}
            for eq in equities:
                preset = eq.get("_matched_preset", "UNKNOWN")
                preset_counts[preset] = preset_counts.get(preset, 0) + 1
            
            print("\n" + "="*70)
            print(f"DEBUG PRESETS DISTRIBUTION - {profile}")
            print("="*70)
            print(json.dumps(preset_counts, indent=2, sort_keys=True))
            print("="*70 + "\n")
        # ================================================
        
        # ========== DEBUG MISSING PRESETS ==========
        if profile == "Agressif":
            all_presets_in_final = set()
            for eq in equities:
                preset = eq.get("_matched_preset", "UNKNOWN")
                all_presets_in_final.add(preset)
            
            print("\n" + "="*70)
            print(f"DEBUG MISSING PRESETS - {profile}")
            print("="*70)
            print(f"Total equities after hard_filters: {len(equities)}")
            print(f"All presets in final selection: {sorted(all_presets_in_final)}")
            print("="*70 + "\n")
        # ============================================
        
        # Enrichir la meta pour compatibilité avec le reste du pipeline
        selection_meta["selected"] = len(equities)
        selection_meta["target_n"] = target_n
        selection_meta["pass_used"] = "PROFILE_POLICY_v4.13.2"
        
        return equities, selection_meta
        
    except Exception as e:
        logger.error(f"❌ select_equities_for_profile_v2 failed: {e}, fallback sector_balanced")
        import traceback
        traceback.print_exc()
        return sector_balanced_selection(
            assets=eq_filtered,
            target_n=min(target_n, len(eq_filtered)),
            initial_max_per_sector=4,
            score_field="composite_score",
            enable_radar_tiebreaker=True,
            radar_bonus_cap=0.03,
            radar_min_coverage=0.40,
            market_context=market_context,
        )
# ============= PIPELINE PRINCIPAL =============

def _enforce_final_turnover(v1_data: Dict, prev_path: str) -> None:
    """Phase 2-B4: garde-fou turnover final sur _tickers, après toute la cascade.

    L'optimizer enforce déjà max_turnover via sa contrainte SLSQP, mais la cascade
    post-processing (caps equity, PE, dedup ETF, redistribution sectorielle, etc.)
    peut faire dériver l'allocation finale. On compare _tickers (final) à _tickers
    du fichier précédent et on blend si dépassement.

    Le blend ne réintroduit JAMAIS de tickers qui ne sont plus dans l'allocation
    actuelle (no resurrection). max_single_position est préservé (combinaison
    linéaire de valeurs ≤ cap reste ≤ cap).

    Mute v1_data en place. No-op si le fichier précédent n'existe pas.
    """
    if not os.path.exists(prev_path):
        return
    try:
        with open(prev_path, encoding="utf-8") as f:
            prev = json.load(f)
    except Exception as e:
        logger.warning(f"[FINAL TURNOVER] could not read {prev_path}: {e}")
        return

    try:
        from portfolio_engine.optimizer import PROFILES as _PROFILES
    except ImportError:
        return

    for profile in ("Agressif", "Modéré", "Stable"):
        if profile not in v1_data:
            continue
        cur = v1_data[profile].get("_tickers") or {}
        prev_t = ((prev.get(profile) or {}).get("_tickers")) or {}
        if not cur or not prev_t:
            continue

        max_to = _PROFILES[profile].max_turnover / 100.0

        # Filtrer prev aux tickers encore présents dans cur (pas de résurrection)
        prev_in_cur = {k: float(v) for k, v in prev_t.items() if k in cur and float(v) > 0}
        prev_total = sum(prev_in_cur.values())
        if prev_total <= 0:
            continue
        prev_in_cur = {k: v / prev_total for k, v in prev_in_cur.items()}

        all_k = set(cur) | set(prev_in_cur)
        turnover = 0.5 * sum(abs(float(cur.get(k, 0.0)) - prev_in_cur.get(k, 0.0)) for k in all_k)

        if turnover <= max_to:
            logger.info(
                f"[FINAL TURNOVER {profile}] ✅ {turnover*100:.1f}% ≤ {max_to*100:.0f}%"
            )
            continue

        alpha = max(0.0, min(1.0, 1.0 - (max_to / turnover)))
        blended = {
            k: alpha * prev_in_cur.get(k, 0.0) + (1.0 - alpha) * float(cur.get(k, 0.0))
            for k in all_k
        }
        # Drop dust (< 0.5%)
        blended = {k: v for k, v in blended.items() if v >= 0.005}
        total = sum(blended.values())
        if total > 0:
            blended = {k: v / total for k, v in blended.items()}

        new_tov = 0.5 * sum(
            abs(blended.get(k, 0.0) - prev_in_cur.get(k, 0.0))
            for k in set(blended) | set(prev_in_cur)
        )
        v1_data[profile]["_tickers"] = blended
        logger.info(
            f"[FINAL TURNOVER {profile}] {turnover*100:.1f}% → {new_tov*100:.1f}% "
            f"(max={max_to*100:.0f}%, alpha={alpha:.2f}, n={len(blended)})"
        )


def _load_previous_allocation(
    path: str,
) -> Dict[str, Dict[str, Dict[str, float]]]:
    """Phase1-B1: Load previous portfolio weights for turnover control.

    Returns {profile: {"standard": {ticker: pct}, "yield": {ticker: pct}}} where
    pct values are in 0-100 scale (matching optimizer.prev_weights convention).
    Empty dict on missing/malformed file → first-run behaviour (no turnover cap).
    """
    try:
        if not os.path.exists(path):
            logger.info(f"   [turnover] No previous file at {path} → first-run mode (no turnover cap)")
            return {}
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        out: Dict[str, Dict[str, Dict[str, float]]] = {}
        for profile in ("Agressif", "Modéré", "Stable"):
            prof = data.get(profile)
            if not isinstance(prof, dict):
                continue
            standard = prof.get("_tickers") or {}
            yield_t = prof.get("_tickers_rendement") or {}
            if not standard and not yield_t:
                continue
            out[profile] = {
                "standard": {k: float(v) * 100.0 for k, v in standard.items() if v},
                "yield": {k: float(v) * 100.0 for k, v in yield_t.items() if v},
            }
        if out:
            logger.info(f"   [turnover] Loaded previous allocation from {path} for {sorted(out.keys())}")
        return out
    except Exception as e:
        logger.warning(f"   [turnover] Failed to load previous allocation from {path}: {e}")
        return {}


def build_portfolios_deterministic() -> Dict[str, Dict]:
    """Pipeline déterministe : mêmes données → mêmes poids."""
    logger.info("🧮 Construction des portefeuilles (déterministe)...")
    
    # === v4.9.0: Tactical Context - RADAR ou GPT ===
    market_context = None
    tactical_mode = CONFIG.get("tactical_mode", "radar")
    
    if CONFIG.get("use_tactical_context", False):
        logger.info(f"📊 Chargement du contexte marché (mode: {tactical_mode})...")
        
        # Branche 1: Mode RADAR (déterministe, data-driven)
        if tactical_mode == "radar" and RADAR_AVAILABLE:
            logger.info("🎯 Mode RADAR activé - tilts déterministes")
            rules_cfg = CONFIG.get("tactical_rules", {})
            rules = RadarRules(
                sweet_ytd_min=rules_cfg.get("sweet_ytd_min", 10.0),
                sweet_ytd_max=rules_cfg.get("sweet_ytd_max", 35.0),
                sweet_daily_min=rules_cfg.get("sweet_daily_min", -0.5),
                overheat_ytd_min=rules_cfg.get("overheat_ytd_min", 50.0),
                smoothing_alpha=rules_cfg.get("smoothing_alpha", 0.3),
                max_favored_sectors=rules_cfg.get("max_favored_sectors", 5),
                max_avoided_sectors=rules_cfg.get("max_avoided_sectors", 3),
                max_favored_regions=rules_cfg.get("max_favored_regions", 4),
                max_avoided_regions=rules_cfg.get("max_avoided_regions", 3),
            )
            market_context = generate_market_context_radar(
                data_dir=CONFIG.get("market_data_dir", "data"),
                rules=rules,
                save_to_file=True,
            )
            logger.info(f"✅ RADAR context généré: regime={market_context.get('market_regime')}")
        
        # Branche 2: Mode GPT (ancien, non déterministe)
        elif tactical_mode == "gpt":
            logger.info("🤖 Mode GPT activé - tilts via brief_ia.json")
            market_context = load_market_context(CONFIG.get("market_data_dir", "data"))
        
        # Branche 3: RADAR demandé mais module absent → fallback GPT
        elif tactical_mode == "radar" and not RADAR_AVAILABLE:
            logger.warning("⚠️ RADAR demandé mais module absent, fallback GPT")
            market_context = load_market_context(CONFIG.get("market_data_dir", "data"))
        
        # Diagnostic du contexte chargé
        if market_context:
            macro_tilts = market_context.get("macro_tilts", {})
            has_tilts = (
                macro_tilts.get("favored_sectors") or 
                macro_tilts.get("avoided_sectors") or
                macro_tilts.get("favored_regions") or
                macro_tilts.get("avoided_regions")
            )
            
            if has_tilts:
                print_tactical_context_diagnostic(market_context, mode=tactical_mode)
                logger.info("✅ Contexte marché chargé pour scoring tactique")
            else:
                is_fallback = market_context.get("_meta", {}).get("is_fallback", False)
                if is_fallback:
                    logger.warning("⚠️ Contexte marché en mode FALLBACK - scoring tactique neutre")
                else:
                    logger.warning("⚠️ Contexte marché sans tilts actifs - scoring tactique désactivé")
    else:
        logger.info("⚠️ Tilts tactiques DÉSACTIVÉS (use_tactical_context=False)")
    
    # 1. Charger les données brutes
    stocks_data = load_stocks_data()
    
    # 2. Charger ETF, Bonds et Crypto
    # v5.1.3 FIX: DataFrame master (préserve types numériques, évite roundtrip dict)
    etf_df_master = pd.DataFrame()
    bonds_data = []
    crypto_data = []
    
    if Path(CONFIG["etf_csv"]).exists():
        try:
            etf_df_master = load_csv_robust(CONFIG["etf_csv"], numeric_cols=NUMERIC_COLS_ETF)
            diag_etf_coverage(etf_df_master, "ETF_GLOBAL")
            logger.info(f"ETF: {CONFIG['etf_csv']} ({len(etf_df_master)} entrées)")
        except Exception as e:
            logger.warning(f"Impossible de charger ETF: {e}")
    
    if Path(CONFIG["bonds_csv"]).exists():
        try:
            df_b = pd.read_csv(CONFIG["bonds_csv"])
            df_b["category"] = "bond"
            # v6.33 FIX: Ne PAS écraser fund_type — preset_bond._dedup_by_fund_type()
            # a besoin des types originaux (Short Government, Corporate Bond, etc.)
            # pour diversifier. Écraser avec "bond" → tous groupés → max 2 pour Stable.
            if "fund_type" not in df_b.columns:
                df_b["fund_type"] = "bond"
            bonds_data = df_b.to_dict("records")
            logger.info(f"Bonds: {CONFIG['bonds_csv']} ({len(bonds_data)} entrées) - fund_type préservé du CSV")
        except Exception as e:
            logger.warning(f"Impossible de charger Bonds: {e}")
    
    if Path(CONFIG["crypto_csv"]).exists():
        try:
            df = pd.read_csv(CONFIG["crypto_csv"])
            crypto_data = df.to_dict('records')
            logger.info(f"Crypto: {CONFIG['crypto_csv']} ({len(crypto_data)} entrées)")
        except Exception as e:
            logger.warning(f"Impossible de charger crypto: {e}")
           
    # v5.1.3: Créer etf_data (list de dicts) pour compatibilité audit/fusion
    # Le scoring utilise etf_df_master.copy() pour préserver les types numériques
    etf_data = etf_df_master.to_dict('records') if not etf_df_master.empty else []       
    
    # 3. Extraire les stocks bruts pour le filtre Buffett
    logger.info("📊 Construction de l'univers...")
    logger.info(f"   Mode Buffett: {CONFIG['buffett_mode']}, Score min: {CONFIG['buffett_min_score']}")
    
    eq_rows = []
    for data in stocks_data:
        stocks_list = data.get("stocks", []) if isinstance(data, dict) else data
        for it in stocks_list:
            eq_rows.append({
                "id": f"EQ_{len(eq_rows)+1}",
                "name": it.get("name") or it.get("ticker"),
                "ticker": it.get("ticker"),
                # === Performances (cast float via _safe_float) ===
                "perf_1m": _safe_float(it.get("perf_1m")),
                "perf_3m": _safe_float(it.get("perf_3m")),
                "perf_1y": _safe_float(it.get("perf_1y")),
                "perf_3y": _safe_float(it.get("perf_3y")),
                "ytd": _safe_float(it.get("perf_ytd") or it.get("ytd")),
                "perf_24h": _safe_float(it.get("perf_1d")),
                # === Volatilité / Drawdown ===
                "vol_3y": _safe_float(it.get("volatility_3y") or it.get("vol")),
                "vol": _safe_float(it.get("volatility_3y") or it.get("vol")),
                "volatility_3y": _safe_float(it.get("volatility_3y")),
                "max_dd": _safe_float(it.get("max_drawdown_ytd")),
                "max_drawdown_ytd": _safe_float(it.get("max_drawdown_ytd")),
                "max_drawdown_3y": _safe_float(it.get("max_drawdown_3y")),
                # === Fondamentaux (v4.14.0 FIX 1) ===
                "liquidity": it.get("market_cap"),
                "market_cap": it.get("market_cap"),
                "sector": it.get("sector", "Unknown"),
                "country": it.get("country", "Global"),
                "category": "equity",
                "roe": _safe_float(it.get("roe")),
                "de_ratio": _safe_float(it.get("de_ratio")),
                "payout_ratio_ttm": _safe_float(it.get("payout_ratio_ttm")),
                "dividend_yield": _safe_float(it.get("dividend_yield")),
                "dividend_coverage": _safe_float(it.get("dividend_coverage")),
                "pe_ratio": _safe_float(it.get("pe_ratio")),
                "eps_ttm": _safe_float(it.get("eps_ttm")),
                # === v4.14.0: Champs scoring avancés ===
                "fcf_yield": _safe_float(it.get("fcf_yield")),
                "eps_growth_5y": _safe_float(it.get("eps_growth_5y")),
                "eps_growth_forecast_5y": _safe_float(it.get("eps_growth_forecast_5y")),
                # v7.3: EPS Surprise (PEAD)
                "eps_surprise_avg_2q": _safe_float(it.get("eps_surprise_avg_2q")),
                "eps_surprise_last": _safe_float(it.get("eps_surprise_last")),
                "eps_beat_streak": _safe_float(it.get("eps_beat_streak")),
                "revenue_growth_5y": _safe_float(it.get("revenue_growth_5y")),
                "gross_margin": _safe_float(it.get("gross_margin")),
                "operating_margin": _safe_float(it.get("operating_margin")),
                "net_margin": _safe_float(it.get("net_margin")),
                "current_ratio": _safe_float(it.get("current_ratio")),
                "quick_ratio": _safe_float(it.get("quick_ratio")),
                "beta": _safe_float(it.get("beta")),
                # === v4.15: Quality score (complément au Buffett moat gate) ===
                "quality_score": _safe_float(it.get("quality_score")),
                "quality_subscores": it.get("quality_subscores"),  # v5.1.2: nested dict for quality_value_sub
                # v5.3.1: Quality coverage + profile (needed for hard filter + FIN safety cap)
                "quality_coverage": _safe_float(it.get("quality_coverage")),
                "quality_profile": it.get("quality_profile"),  # "FIN", "YIELD", or "DEFAULT"
                "sector_api": it.get("sector_api"),  # English sector name for RADAR normalization
                "industry": it.get("industry"),  # v5.3.3: GICS level 3 for correlation penalty
                # === v5.1.4: Préserver buffett_score JS expert ===
                "buffett_score": _safe_float(it.get("buffett_score")),
                # === Legacy ===
                "sector_top": it.get("sector"),
                "country_top": it.get("country"),
            })
    
    logger.info(f"   Equities brutes chargées: {len(eq_rows)}")
    
    # === v5.1.0: AUDIT HOOK 1 - Initial universe ===
    _collector = get_audit()
    if _collector:
        _collector.record_initial_universe(
            equity_count=len(eq_rows),
            etf_count=len(etf_data),
            crypto_count=len(crypto_data),
            bond_count=len(bonds_data),
        )
    
    # === PHASE 1: TRACE 1 - Initial ===
    count_korea(eq_rows, "1. Initial (après chargement)")
    
    # 4. Appliquer le filtre Buffett EN MODE ENRICHISSEMENT (pas suppression)
    eq_rows_before_buffett = eq_rows.copy()  # v4.12.0: Garder pour audit
    
    if CONFIG["buffett_mode"] != "none" and eq_rows:
        logger.info(f"   Application filtre Buffett sur {len(eq_rows)} actions...")
        
        # v4.14.0 FIX Round 3: Mode "enrich" - ajoute _buffett_score sans supprimer
        # La suppression se fait par profil dans select_equities_for_profile_v2
        # qui peut avoir des seuils différents (Agressif plus permissif que Stable)
        eq_rows_enriched = apply_buffett_filter(
            eq_rows,
            mode=CONFIG["buffett_mode"],
            strict=False,
            min_score=0,  # Ne pas filtrer ici, juste enrichir avec scores
        )
        
        # Garder TOUS les equities avec leurs scores Buffett
        # Le filtrage par seuil se fera dans select_equities_for_profile_v2
        eq_rows = eq_rows_enriched
        
        # Diagnostic: combien seraient filtrés avec le seuil global?
        global_threshold = CONFIG["buffett_min_score"]
        would_be_filtered = sum(1 for e in eq_rows if (e.get("_buffett_score") or 0) < global_threshold)
        
        print_buffett_diagnostic(
            eq_rows, 
            f"QUALITÉ SECTORIELLE - {len(eq_rows)} actions enrichies (Buffett min_score appliqué par profil)"
        )
        
        logger.info(f"   Equities après enrichissement Buffett: {len(eq_rows)} (dont {would_be_filtered} sous seuil global {global_threshold})")
        logger.info(f"   ℹ️  Le seuil Buffett sera appliqué PAR PROFIL dans select_equities_for_profile_v2")
    # === PHASE 1: TRACE 2 - After Buffett ===
    count_korea(eq_rows, "2. After Buffett filter")    
    
    # 5. Appliquer scoring quantitatif (conditionnel selon EQUITY_SCORING_MODE v5.0.0)
    scoring_mode = EQUITY_SCORING_CONFIG["mode"]
    
    if scoring_mode == "factors":
        # Mode legacy: factors.py calcule composite_score
        logger.info(f"   [SCORING] Mode '{scoring_mode}': compute_scores() pour equities")
        eq_rows = compute_scores(eq_rows, "equity", None)
    elif scoring_mode == "blend":
        # Mode A/B testing: les deux scores
        logger.info(f"   [SCORING] Mode '{scoring_mode}': compute_scores() + preset_meta")
        eq_rows = compute_scores(eq_rows, "equity", None)
    else:
        # Mode "preset" (Option B): preset_meta gère le scoring
        # buffett_score déjà enrichi via apply_buffett_filter()
        logger.info(f"   [SCORING] Mode '{scoring_mode}': compute_scores() SKIP (preset_meta handles scoring)")
    
    # === v4.14.0 P1-4: Enrichir avec warnings ROE ===
    eq_rows = enrich_equities_with_roe_warnings(eq_rows)
    
    eq_filtered = filter_equities(eq_rows)

    # === v5.6.0 (Sélection-4): Coherence-driven profile assignment ===
    # Annote chaque action avec son profil natif basé sur ses fondamentaux
    # (fit_score Stable/Modéré/Agressif). Permet de router AAPL/GOOG/ASML vers
    # leur profil naturel plutôt que de laisser Agressif rafler les mega-caps.
    try:
        from portfolio_engine.profile_assignment import (
            annotate_universe_with_fits, log_assignment_summary,
        )
        annotate_universe_with_fits(eq_filtered)
        _native_counts = log_assignment_summary(eq_filtered)
        logger.info(
            f"   [Sélection-4] Profile-native: "
            f"Stable={_native_counts['Stable']}, "
            f"Modéré={_native_counts['Modéré']}, "
            f"Agressif={_native_counts['Agressif']}"
        )
    except Exception as _e:
        logger.warning(f"   [Sélection-4] annotate_universe_with_fits failed: {_e}")

    # === v5.1.0: AUDIT HOOK 3 - After hard filters ===
    if _collector:
        with _collector.stage("hard_filters", category="equity") as _stage:
            _stage.before_count = len(eq_rows)
            _stage.after_count = len(eq_filtered)
            rejected = len(eq_rows) - len(eq_filtered)
            if rejected > 0:
                _stage.reason_counts = {ReasonCode.MISSING_DATA: rejected}
    
    # === PHASE 1: TRACE 3 - After filter_equities ===
    count_korea(eq_filtered, "3. After filter_equities")
    
    # === v4.13: Sélection d'équités DIFFÉRENTE par profil ===
    # On garde eq_filtered comme pool, la sélection se fera par profil dans la boucle
    # Cela permet d'avoir des équités DIFFÉRENTES entre Agressif, Modéré et Stable
    
    # Log du pool global (remplace l'ancienne sélection unique)
    logger.info(f"   Pool équités post-filtre: {len(eq_filtered)} (sélection par profil dans la boucle)")

    # === v5.1.0: AUDIT HOOK 4 - Scoring stats ===
    if _collector and eq_filtered:
        profile_scores = [e.get("_profile_score") or 0 for e in eq_filtered if e.get("_profile_score")]
        if profile_scores:
            top_k = sorted(eq_filtered, key=lambda x: x.get("_profile_score") or 0, reverse=True)[:5]
            _collector.record_scoring_stats(
                category="equity",
                scores=profile_scores,
                top_k=[{"ticker": e.get("ticker"), "score": round(e.get("_profile_score", 0), 3)} for e in top_k],
            )
    # === v5.1.4: TOP 10 BY PRESET DEBUG (v5.1.2 doublon supprimé) ===

    # === v5.1.3: TOP 10 BY PRESET DEBUG ===
    if _collector:
        # Assigner les presets aux equities AVANT le hook
        try:
            from portfolio_engine.preset_meta import assign_preset_to_equity
            for eq in eq_filtered:
                if not eq.get("_matched_preset"):
                    eq["_matched_preset"] = assign_preset_to_equity(eq)
            logger.info(f"📊 Presets assignés à {len(eq_filtered)} equities")
        except ImportError:
            logger.warning("⚠️ assign_preset_to_equity non disponible")
        
        # Appeler le hook avec les bons noms de variables
        _collector.record_top10_by_preset(
            equities=eq_filtered,
            etfs=etf_data,
            cryptos=crypto_data,
            bonds=bonds_data,
        )   
    # === v4.13: Import get_stable_uid pour usage ultérieur dans l'audit ===
    try:
        from portfolio_engine.selection_audit import get_stable_uid
    except ImportError:
        def get_stable_uid(item):
            return item.get("ticker") or item.get("name") or item.get("id") or "UNKNOWN"
    
    # NOTE v4.13: Le diagnostic de quota et Korea se fait maintenant PAR PROFIL
    # dans select_equities_for_profile() - supprimé ici car 'equities' n'existe plus
    
    # 6. Fusionner bonds + ETF
    all_funds_data = []
    all_funds_data.extend(etf_data)
    all_funds_data.extend(bonds_data)
    
    logger.info(f"   Fonds combinés (ETF + Bonds): {len(all_funds_data)} ({len(etf_data)} ETF + {len(bonds_data)} Bonds)")
    
    # 7. Construire le reste de l'univers (ETF, Bonds, Crypto)
    universe_others = build_scored_universe(
        stocks_data=None,
        etf_data=all_funds_data,
        crypto_data=crypto_data,
        returns_series=None,
        buffett_mode="none",
        buffett_min_score=0,
    )
    
    # === v4.13: L'univers complet sera construit PAR PROFIL dans la boucle ===
    # universe = equities + universe_others  # SUPPRIMÉ - equities n'existe plus ici
    # Les équités sont maintenant sélectionnées par profil via select_equities_for_profile()
    
    logger.info(f"   Univers ETF/Bonds/Crypto: {len(universe_others)} actifs")
    logger.info(f"   Pool équités disponible: {len(eq_filtered)} (sélection par profil)")
    
    # ============================================================
    # FIX v1.1.0: Build TickerResolver from stock data
    # Resolves non-US tickers: AGS→XBRU, 2360→XTAI, TLX→XETR, etc.
    # Used by historical_data.py (VaR/CVaR) and backtest/data_loader.py
    # ============================================================
    ticker_resolver = None
    if HAS_TICKER_RESOLVER:
        # FIX: eq_filtered n'a PAS data_mic (strippé lors de eq_rows.append).
        # On construit le resolver depuis stocks_data (les JSON bruts) qui contient
        # data_mic, data_exchange, resolved_symbol pour chaque action.
        _raw_stocks = []
        for _sd in stocks_data:
            _raw_stocks.extend(_sd.get("stocks", []) if isinstance(_sd, dict) else _sd)
        ticker_resolver = TickerResolver.from_equities(_raw_stocks)
        set_resolver(ticker_resolver)  # Make globally available
        logger.info(f"   ✅ TickerResolver built: {len(ticker_resolver.mic_code_map)} mic_codes, "
                     f"{len(ticker_resolver.exchange_map)} exchanges, "
                     f"{len(ticker_resolver.resolved_symbol_map)} resolved_symbols")
        
        # v5.4.1: Build ticker→beta/industry lookup for allocation_rules_engine
        _ticker_fundamentals = {}
        for _s in _raw_stocks:
            _stk = _s.get("ticker", "")
            if _stk:
                _ticker_fundamentals[_stk.upper()] = {
                    "beta": _s.get("beta") or _s.get("beta_capm"),
                    "industry": _s.get("industry", ""),
                }
        logger.info(f"   ✅ Ticker fundamentals: {len(_ticker_fundamentals)} stocks with beta/industry")
        # Invalidate cache for previously-failed tickers (AGS, 2360, 3017, etc.)
        _tickers_with_mic = [s.get("ticker") for s in _raw_stocks if s.get("data_mic")]
        if _tickers_with_mic:
            ticker_resolver.invalidate_cache_for(_tickers_with_mic, cache_dir="data/returns_cache")
    
    # 8. Optimiser pour chaque profil
    # v5.1.4 FIX Step7: use_preset_etf=False car select_etfs_for_profile()
    # est déjà appelé L1873 avec le DataFrame complet (sector_top5, holdings_top10).
    # Le double pass dans optimizer perdait _hhi_sector (0/60 non-NaN au pass 2).
    optimizer = PortfolioOptimizer(use_preset_etf=False)
    portfolios = {}
    all_assets = []
    all_assets_ids = set()  # v4.13.2 FIX: Track IDs pour union des 3 profils
    
    feasibility_reports = {}
    # === v4.13: Dict pour stocker équités par profil (diagnostic overlap) ===
    equities_by_profile = {}
   # === v1.5.3 FIX: Collect SCORED ETF/crypto/bonds for audit ===
    all_scored_etfs = {}
    all_scored_cryptos = {}
    all_scored_bonds = {}   
       
    # === v5.1.4 FIX: Collect profile_selections + etf_scoring_debug for selection_audit ===
    _profile_selections_for_audit = {}   # {profile: {before, after, stats, selected, candidates, meta}}
    _etf_scoring_debug_for_audit = {}    # {profile: {stage_counts, scoring_components, ...}}
    # v4.14.0 FIX R5b: Synchroniser PROFILE_POLICY avec seuils Buffett CONFIG
    # Évite le double filtre (CONFIG vs PROFILE_POLICY)
    if HAS_PROFILE_POLICY:
        buffett_thresholds = CONFIG.get("buffett_min_score_by_profile", {})
        for profile_name, threshold in buffett_thresholds.items():
            if profile_name in PROFILE_POLICY:
                old_threshold = PROFILE_POLICY[profile_name].get("min_buffett_score")
                PROFILE_POLICY[profile_name]["min_buffett_score"] = threshold
                if old_threshold != threshold:
                    logger.info(f"   🔄 PROFILE_POLICY[{profile_name}].min_buffett_score: {old_threshold} → {threshold}")

    # === Phase Sélection-5: Charger le dernier bond_strategy du Market Intelligence ===
    # Le MI tourne actuellement APRÈS les select_bonds (architecture v4),
    # on utilise donc le dernier mi_*.json disponible pour orienter les bonds
    # via avoid_securitized / prefer_tips / avoid_em_bonds.
    bond_strategy = None
    try:
        import glob as _glob_mi
        _mi_files = sorted(_glob_mi.glob("data/market_intelligence_audit/mi_*.json"))
        if _mi_files:
            with open(_mi_files[-1], "r", encoding="utf-8") as _f_mi:
                _mi_data = json.load(_f_mi)
            bond_strategy = _mi_data.get("bond_strategy_full") or {}
            if bond_strategy:
                logger.info(
                    f"   [Bond strategy] Loaded from {os.path.basename(_mi_files[-1])}: "
                    f"tips={bond_strategy.get('prefer_tips')}, "
                    f"avoid_sec={bond_strategy.get('avoid_securitized')}, "
                    f"avoid_em={bond_strategy.get('avoid_em_bonds')}, "
                    f"regime={_mi_data.get('regime','?')}"
                )
    except Exception as _e_bs:
        logger.warning(f"   [Bond strategy] Could not load MI: {_e_bs}")
        bond_strategy = None

    # Phase1-B1: Charger l'allocation précédente une seule fois (turnover control)
    _prev_alloc = _load_previous_allocation(CONFIG["output_path"])

    for profile in _active_profiles(CONFIG):
        logger.info(f"⚙️  Optimisation profil {profile}...")

        # v8.x: Country filter pré-stage pour sous-enveloppes Dividende (PEA/CTO).
        # No-op pour les 3 profils historiques.
        eq_filtered_for_profile = _apply_envelope_country_filter(eq_filtered, profile)
        if len(eq_filtered_for_profile) != len(eq_filtered):
            logger.info(
                f"   [{profile}] 🌍 Filtre enveloppe : "
                f"{len(eq_filtered_for_profile)}/{len(eq_filtered)} équités éligibles"
            )

        # v8.x.3: baseline filter pour Dividende — figer les tickers entre runs
        # (buy-and-hold strict, turnover ≈ 0). No-op pour les 3 profils historiques.
        eq_filtered_for_profile = _apply_dividende_baseline_filter(
            eq_filtered_for_profile, profile
        )

        # === v4.13: Sélection d'équités spécifique au profil ===
        # v4.14.0 FIX R6: Une seule source de vérité pour Buffett = PROFILE_POLICY
        # Le filtre Buffett est appliqué dans select_equities_for_profile_v2 via PROFILE_POLICY
        # (synchronisé avec CONFIG["buffett_min_score_by_profile"] au début de la boucle)

        # Log pour diagnostic
        buffett_thresholds = CONFIG.get("buffett_min_score_by_profile", {})
        profile_buffett_min = buffett_thresholds.get(profile, CONFIG.get("buffett_min_score", 40))
        missing_buffett = sum(1 for e in eq_filtered_for_profile if e.get("_buffett_score") is None)
        if missing_buffett > 0:
            logger.warning(f"   [{profile}] ⚠️ {missing_buffett}/{len(eq_filtered_for_profile)} equities sans score Buffett")

        # Passer eq_filtered_for_profile (avec filtre enveloppe appliqué)
        # Le filtrage Buffett se fait dans la fonction via PROFILE_POLICY (source unique)
        profile_equities, profile_selection_meta = select_equities_for_profile(
            eq_filtered=eq_filtered_for_profile,
            profile=profile,
            market_context=market_context,
            target_n=min(CANDIDATES_BY_PROFILE.get(profile, 250), len(eq_filtered_for_profile)),
        )
        profile_selection_meta["buffett_threshold_policy"] = profile_buffett_min
        profile_selection_meta["buffett_missing_count"] = missing_buffett
        
        # ========== DEBUG META STAGES ==========
        if profile == "Agressif":
            import json
            print("\n" + "="*70)
            print(f"DEBUG META STAGES - {profile}")
            print("="*70)
            print(json.dumps(profile_selection_meta.get("stages", {}), indent=2, default=str))
            print("="*70 + "\n")
        # =======================================
        
        equities_by_profile[profile] = profile_equities
        
        # === v5.1.4 FIX R1: Collecter profile_selections pour selection_audit ===
        # Les vraies stats hard_filters sont dans stages.hard_filters (pas top-level)
        # v8.x: utiliser eq_filtered_for_profile pour que before/rejected soient
        #       cohérents avec le filtre enveloppe quand il s'applique
        _hf_stats = profile_selection_meta.get("stages", {}).get("hard_filters", {})
        _profile_selections_for_audit[profile] = {
            "before": eq_filtered_for_profile,
            "after": profile_equities,
            "stats": _hf_stats if _hf_stats else {
                "before": len(eq_filtered_for_profile),
                "after": len(profile_equities),
                "rejected": len(eq_filtered_for_profile) - len(profile_equities),
                "reasons": {},
            },
            "selected": profile_equities,
            "candidates": eq_filtered_for_profile,
            "meta": profile_selection_meta,
        }
        
        # v5.1.4: Tagger _profile sur chaque equity pour traçabilité audit
        for eq in profile_equities:
            if "_profile" not in eq:
                eq["_profile"] = profile
        
        # === v5.1.0: AUDIT HOOK 5 - Selection par profil ===
        if _collector:
            _collector.record_final_selection(
                category="equity",
                selected=profile_equities,
                profile=profile,
            )
        
        # v5.1.4: AUDIT HOOK 6 - Hard filter stats par profil
        if _collector and profile_selection_meta:
            hard_stages = profile_selection_meta.get("stages", {}).get("hard_filters", {})
            if hard_stages:
                try:
                    _collector.track_profile_hard_filters(
                        profile=profile,
                        before_count=hard_stages.get("before", 0),
                        after_count=hard_stages.get("after", 0),
                        filters_applied=hard_stages.get("filters", {}),
                        relaxed_steps=hard_stages.get("relaxed", []),
                    )
                except (AttributeError, TypeError) as e:
                    logger.debug(f"   [{profile}] track_profile_hard_filters not available: {e}")
# === FIX v5.2.0-3: Geopolitical Resilience Penalty (Stable only) ===
        # Expert-validated: penalize sectors/countries exposed to geopolitical shocks
        # Applied multiplicatively on _profile_score BEFORE optimizer
        if profile == "Stable" and profile_equities:
            _GEO_SECTOR_MULT = {
                "Santé": 1.00, "Biens de consommation de base": 1.00,
                "Services publics": 1.00, "Immobilier": 1.00,
                "Technologie de l'information": 0.92, "Communication": 0.92,
                "Finance": 0.93,
                "Industries": 0.90,
                "Biens de consommation cycliques": 0.85,
                "Énergie": 0.80, "Energie": 0.80,
                "Matériaux": 0.75, "Materiaux": 0.75,
            }
            _GEO_COUNTRY_FACTOR = {
                "Etats-Unis": 1.0, "France": 1.0, "Allemagne": 1.0, "Royaume-Uni": 1.0,
                "Japon": 1.0, "Canada": 1.0, "Australie": 1.0, "Pays-Bas": 1.0,
                "Suisse": 1.0, "Belgique": 1.0, "Espagne": 1.0, "Italie": 1.0,
                "Norvège": 1.0, "Suède": 1.0, "Danemark": 1.0, "Finlande": 1.0,
                "Irlande": 1.0, "Autriche": 1.0, "Portugal": 1.0, "Singapour": 1.0,
                "Hong Kong": 1.0, "Nouvelle-Zélande": 1.0,
                "Corée": 1.3, "Taïwan": 1.3, "Israël": 1.3,
                "Inde": 1.5, "Brésil": 1.5, "Mexique": 1.5, "Chili": 1.5,
                "Malaisie": 1.4, "Thaïlande": 1.4, "Indonésie": 1.5,
                "Pologne": 1.3, "République Tchèque": 1.3, "Grèce": 1.3,
                "Turquie": 2.0, "Afrique du Sud": 1.8, "Argentine": 2.0,
                "Chine": 1.8, "Russie": 2.5, "Colombie": 1.7,
            }
            _DEFENSE_KW = ["DEFENSE", "DEFENCE", "AEROSPACE", "MILITARY", "ROTEM",
                           "RHEINMETALL", "HANWHA", "LEONARDO", "THALES", "BAE SYSTEMS",
                           "ELBIT", "LOCKHEED", "RAYTHEON", "NORTHROP", "L3HARRIS",
                           "SAAB", "DASSAULT AVIATION", "KONGSBERG", "GENERAL DYNAMICS"]
            _SEMI_KW = ["SEMICONDUCTOR", "SEMI", "CHIP", "FOUNDRY", "TSMC", "ASML",
                        "MICRON", "NVIDIA", "AMD", "QUALCOMM", "BROADCOM",
                        "APPLIED MATERIALS", "LAM RESEARCH", "TOKYO ELECTRON"]
            _DIV_SHIELD_SECTORS = {"Matériaux", "Materiaux", "Énergie", "Energie"}
            
            _geo_adjusted = 0
            for eq in profile_equities:
                sector = eq.get("sector", "")
                country = eq.get("country", "")
                name_upper = (eq.get("name", "") or "").upper()
                preset = eq.get("_matched_preset", "")
                _dy_raw = eq.get("dividend_yield", 0)
                try:
                    div_yield = float(str(_dy_raw).replace("%", "").strip() or 0)
                except (ValueError, TypeError):
                    div_yield = 0.0
                old_score = eq.get("_profile_score")
                
                if old_score is None:
                    continue
                
                # Base sector multiplier
                sect_mult = _GEO_SECTOR_MULT.get(sector, 0.90)
                
                # Defense exception: bonus instead of penalty
                is_defense = any(kw in name_upper for kw in _DEFENSE_KW)
                if is_defense and sector == "Industries":
                    eq["_profile_score"] = old_score * 1.05
                    eq["_geo_resilience"] = "defense_bonus(×1.05)"
                    _geo_adjusted += 1
                    continue
                
                # Semi-conductor sub-penalty (-15% instead of -8%)
                is_semi = any(kw in name_upper for kw in _SEMI_KW)
                if is_semi and "information" in sector.lower():
                    sect_mult = 0.85
                
                # Country factor amplifies penalty
                c_factor = _GEO_COUNTRY_FACTOR.get(country, 1.3)
                penalty = 1.0 - sect_mult
                amplified = penalty * c_factor
                final_mult = max(0.40, 1.0 - amplified)
                
                # Dividend shield for exposed sectors
                if sector in _DIV_SHIELD_SECTORS and div_yield >= 3.0:
                    final_mult = min(1.0, final_mult + 0.05)
                
                # Defensive preset bonus (+5% additive)
                def_bonus = 0.05 if preset == "defensif" else 0.0
                
                new_score = old_score * final_mult + def_bonus
                
                if abs(new_score - old_score) > 0.001:
                    eq["_profile_score"] = new_score
                    eq["_geo_resilience"] = f"sect={sect_mult:.2f},ctry={c_factor:.1f},final=×{final_mult:.3f}"
                    _geo_adjusted += 1
            
            if _geo_adjusted > 0:
                # Log top adjustments
                _sorted = sorted(profile_equities, key=lambda x: x.get("_profile_score", 0), reverse=True)
                logger.info(f"   [Stable] 🌍 Geo-resilience: {_geo_adjusted}/{len(profile_equities)} scores adjusted")
                for _eq in _sorted[:5]:
                    logger.info(
                        f"   [Stable] 🌍 Top: {_eq.get('name', '?')[:25]:25s} "
                        f"score={_eq.get('_profile_score', 0):.3f} "
                        f"geo={_eq.get('_geo_resilience', 'none')}"
                    )
        
        # === v5.1.0: Sélection ETF/Crypto/Bond par profil ===
        # v8.x: Skip ETF/bonds/crypto pour les profils Dividende (100% actions par construction).
        _is_dividende_profile = profile in ("Dividende-PEA", "Dividende-CTO")
        if _is_dividende_profile:
            logger.info(f"   [{profile}] 💯 100% actions — skip ETF/bonds/crypto selection")
            profile_etf_data = []
            profile_bonds_data = []
            profile_crypto_data = []
        if HAS_MODULAR_SELECTORS and not _is_dividende_profile:
            # --- ETF actions ---
            if not etf_df_master.empty:
                etf_df = etf_df_master.copy()
                etf_selected_df = select_etfs_for_profile(etf_df, profile, top_n=100)
                profile_etf_data = etf_selected_df.to_dict('records') if not etf_selected_df.empty else []
                logger.info(f"   [{profile}] ETF sélectionnés: {len(profile_etf_data)}/{len(etf_df_master)}")

                # ============================================================
                # DEBUG v2.2.15: Vérifier _matched_preset dans ETFs scorés
                # ============================================================
                if profile == "Agressif":
                    _has_col = "_matched_preset" in etf_selected_df.columns
                    _n_preset = 0
                    _preset_vals = set()
                    _sample_empty = 0
                    _sample_nan = 0
                    if _has_col:
                        _vals = etf_selected_df["_matched_preset"]
                        _n_preset = (_vals.notna() & (_vals != "")).sum()
                        _sample_empty = (_vals == "").sum()
                        _sample_nan = _vals.isna().sum()
                        _preset_vals = set(_vals.dropna().unique()[:15])
                    print(f"\n{'='*70}")
                    print(f"DEBUG ETF PRESET [{profile}]")
                    print(f"  _matched_preset column exists: {_has_col}")
                    print(f"  Non-empty values: {_n_preset}/{len(etf_selected_df)}")
                    print(f"  Empty string count: {_sample_empty}")
                    print(f"  NaN count: {_sample_nan}")
                    print(f"  Unique preset values: {_preset_vals}")
                    print(f"  DataFrame columns (first 20): {list(etf_selected_df.columns[:20])}")
                    # Vérifier aussi dans les dicts convertis
                    _dict_presets = set()
                    _dict_missing = 0
                    for _d in profile_etf_data[:20]:
                        _mp = _d.get("_matched_preset")
                        if _mp and str(_mp) not in ["", "nan"]:
                            _dict_presets.add(str(_mp))
                        else:
                            _dict_missing += 1
                    print(f"  Dict presets (first 20 records): {_dict_presets}")
                    print(f"  Dict missing/empty preset: {_dict_missing}/20")
                    print(f"{'='*70}\n")
                # ============================================================
                # FIN DEBUG
                # ============================================================

                # v5.1.3: Post-check scoring (détecte scores FLAT)
                if "_profile_score" in etf_selected_df.columns and not etf_selected_df.empty:
                    scores = etf_selected_df["_profile_score"]
                    # === VÉRIFICATION DU FIX v2.2.14 ===
                    print(f"[ETF {profile}] Min: {scores.min()}, Max: {scores.max()}, Std: {scores.std():.2f}")
                    if scores.nunique() <= 1 or scores.std() < 1:
                        logger.error(f"   [{profile}] ⚠️ ETF SCORE FLAT: {scores.iloc[0] if len(scores) else 'N/A'}")
                    else:
                        logger.info(f"   [{profile}] ✅ ETF scores: [{scores.min():.1f}, {scores.max():.1f}]")
                
                # === v5.1.4: Collecter ETF scoring debug pour selection_audit ===
                if profile not in _etf_scoring_debug_for_audit and not etf_selected_df.empty:
                    _sc = etf_selected_df.get("_profile_score")
                    _etf_scoring_debug_for_audit[profile] = {
                        "stage_counts": {
                            "initial": len(etf_df),
                            "presets": len(etf_selected_df),
                        },
                        "scoring_components": {},
                        "score_stats": {
                            "min": float(_sc.min()) if _sc is not None and not _sc.empty else 0,
                            "max": float(_sc.max()) if _sc is not None and not _sc.empty else 0,
                            "std": float(_sc.std()) if _sc is not None and not _sc.empty else 0,
                        } if "_profile_score" in etf_selected_df.columns else {},
                        "is_flat": (_sc.nunique() <= 1) if "_profile_score" in etf_selected_df.columns and _sc is not None else True,
                        "scoring_method": "rank_percentile",
                    }

                # v5.1.2 FIX: Forcer category="etf" pour éviter reclassification dans build_raw_universe
                for etf in profile_etf_data:
                    etf["_force_category"] = "etf"
                    etf["category"] = "etf"
                # === FIX v2.1.0: Propager _profile_score → score pour ETFs ===
                # Même pattern que crypto FIX v2.0.2 — preset_etf calcule _profile_score
                # mais build_scored_universe/FactorScorer écrase "score" avec composite_score.
                # Sans propagation, 91% des ETFs perdent leur score preset.
                for etf in profile_etf_data:
                    ps = etf.get("_profile_score")
                    if ps is not None:
                        etf["score"] = float(ps)
                        etf["profile_score"] = float(ps)
                        etf["composite_score"] = float(ps)
                    if not etf.get("_matched_preset"):
                        etf["_matched_preset"] = "etf_unclassified"
                _etf_propagated = sum(1 for e in profile_etf_data if e.get("score", 0) > 0)
                logger.info(
                    f"   [{profile}] FIX v2.1.0: {_etf_propagated}/{len(profile_etf_data)} "
                    f"ETFs avec score propagé depuis _profile_score"
                )
                # === FIN FIX v2.1.0 ===
                # v1.5.3 FIX: Collect scored ETFs for audit
                for _etf in profile_etf_data:
                    _uid = _etf.get("etfsymbol") or _etf.get("ticker") or _etf.get("name") or ""
                    if _uid:
                        _existing = all_scored_etfs.get(_uid)
                        _new_s = _etf.get("_profile_score") or 0
                        _old_s = (_existing or {}).get("_profile_score") or 0
                        if _existing is None or _new_s > _old_s:
                            all_scored_etfs[_uid] = _etf.copy()
            else:
                profile_etf_data = []
               
            # --- Bonds ---
            if bonds_data:
                bonds_df = pd.DataFrame(bonds_data)
                # v6.33: top_n par profil — Stable = peu mais qualité, Agressif = plus large
                bonds_top_n = {"Stable": 6, "Modéré": 10, "Agressif": 15}.get(profile, 10)
                bonds_selected_df = select_bonds_for_profile(
                    bonds_df, profile, top_n=bonds_top_n, bond_strategy=bond_strategy,
                )
                profile_bonds_data = bonds_selected_df.to_dict('records') if not bonds_selected_df.empty else []
                logger.info(f"   [{profile}] Bonds sélectionnés: {len(profile_bonds_data)}/{len(bonds_data)}")
                # v5.1.2 FIX: Forcer category="bond"
                for bond in profile_bonds_data:
                    bond["_force_category"] = "bond"
                    bond["category"] = "bond"
                # v1.5.3 FIX: Collect scored bonds for audit
                for _bond in profile_bonds_data:
                    _uid = _bond.get("isin") or _bond.get("name") or ""
                    if _uid:
                        _existing = all_scored_bonds.get(_uid)
                        _new_s = _bond.get("bond_quality_raw") or _bond.get("composite_score") or 0
                        _old_s = (_existing or {}).get("bond_quality_raw") or (_existing or {}).get("composite_score") or 0
                        if _existing is None or _new_s > _old_s:
                            all_scored_bonds[_uid] = _bond.copy()
            else:
                profile_bonds_data = []
            # --- Crypto ---
            # v6.34 FIX: Toujours appeler select_crypto_for_profile, même si crypto_data
            # est vide, pour que le fallback BTC/ETH de _ensure_blue_chips() fonctionne
            crypto_df = pd.DataFrame(crypto_data) if crypto_data else pd.DataFrame()
            crypto_selected_df = select_crypto_for_profile(crypto_df, profile, top_n=30)
            profile_crypto_data = crypto_selected_df.to_dict('records') if not crypto_selected_df.empty else []
            logger.info(f"   [{profile}] Crypto sélectionnés: {len(profile_crypto_data)}/{len(crypto_data)}")
            # v5.2.0 FIX: Forcer category="crypto" pour éviter reclassification
            for cr in profile_crypto_data:
                cr["_force_category"] = "crypto"
                cr["category"] = "crypto"
            # === FIX v2.0.2: Propager _profile_score → score et _role ===
            # preset_crypto calcule _profile_score (0-100) et _role (core/satellite)
            # mais build_scored_universe/convert_universe_to_assets lit "score" et
            # assign_preset_to_asset lit source_data["_role"].
            # Sans ce mapping, score=0 (ou valeur brute CSV) et rôle=LOTTERY.
            for cr in profile_crypto_data:
                # 1) Score: _profile_score → score (ce que l'optimizer lit)
                ps = cr.get("_profile_score")
                if ps is not None:
                    cr["score"] = float(ps)
                    cr["profile_score"] = float(ps)
                # 2) Rôle: déjà dans cr["_role"] — sera copié dans source_data
                #    par convert_universe_to_assets (source_data = dict complet)
                # 3) Preset name pour traçabilité
                if not cr.get("_matched_preset"):
                    cr["_matched_preset"] = f"crypto_preset_{cr.get('_crypto_category', 'other')}"
            _propagated = sum(1 for c in profile_crypto_data if c.get("score", 0) > 0)
            logger.info(
                f"   [{profile}] FIX v2.0.2: {_propagated}/{len(profile_crypto_data)} "
                f"crypto avec score propagé depuis _profile_score"
            )
            # === FIN FIX v2.0.2 ===
            # v1.5.3 FIX: Collect scored crypto for audit
            for _cr in profile_crypto_data:
                _uid = _cr.get("symbol") or _cr.get("ticker") or _cr.get("name") or ""
                if _uid:
                    _existing = all_scored_cryptos.get(_uid)
                    _new_s = _cr.get("_profile_score") or _cr.get("composite_score") or 0
                    _old_s = (_existing or {}).get("_profile_score") or (_existing or {}).get("composite_score") or 0
                    if _existing is None or _new_s > _old_s:
                        all_scored_cryptos[_uid] = _cr.copy()
            # === v5.1.0: AUDIT HOOK - Sélection ETF/Crypto/Bond ===
            if _collector:
                _collector.record_final_selection(category="etf", selected=profile_etf_data, profile=profile)
                _collector.record_final_selection(category="crypto", selected=profile_crypto_data, profile=profile)
                _collector.record_final_selection(category="bond", selected=profile_bonds_data, profile=profile)
            
            # Construire universe_others PAR PROFIL
            all_funds_profile = profile_etf_data + profile_bonds_data
            profile_universe_others = build_scored_universe(
                stocks_data=None,
                etf_data=all_funds_profile,
                crypto_data=profile_crypto_data,
                returns_series=None,
                buffett_mode="none",
                buffett_min_score=0,
            )
        else:
            # Fallback: utiliser universe_others global
            # v8.x: pour les profils Dividende, ne pas inclure d'autres actifs (100% actions)
            profile_universe_others = [] if _is_dividende_profile else universe_others
        # v5.0.0: Log du mode de scoring utilisé
        if scoring_mode == "preset":
            # Vérifier que _profile_score est présent
            has_profile_score = sum(1 for e in profile_equities if e.get("_profile_score") is not None)
            has_composite = sum(1 for e in profile_equities if e.get("composite_score") is not None)
            logger.info(f"   [{profile}] Scoring: _profile_score={has_profile_score}, composite_score={has_composite}")
            
            # Log des relaxations si applicable
            relaxed_steps = profile_selection_meta.get("stages", {}).get("hard_filters", {}).get("relaxed", [])
            if relaxed_steps:
                logger.info(f"   [{profile}] ⚠️ Relaxation progressive appliquée: {len(relaxed_steps)} étapes")
                for step in relaxed_steps[:3]:  # Max 3 pour lisibilité
                    logger.info(f"      • {step}")
        
        # v5.0.0: Validation du pipeline scoring
        validation_stats = validate_scoring_pipeline(profile_equities, profile)
        print_scoring_validation(validation_stats)
        profile_selection_meta["_scoring_validation"] = validation_stats
        
        # Log sélection
        policy_info = profile_selection_meta.get("profile_policy", {})
        radar_info = profile_selection_meta.get("radar", {})
        logger.info(f"   [{profile}] Équités sélectionnées: {len(profile_equities)} (min_buffett={policy_info.get('min_buffett_score', 'N/A')})")

        
        # === v4.13: Construire l'univers POUR CE PROFIL ===
        profile_universe = profile_equities + profile_universe_others
        
        scored_universe = rescore_universe_by_profile(
            profile_universe,
            profile, 
            market_context=market_context
        )
      
        assets = convert_universe_to_assets(scored_universe)
        
        # === FIX v2.0.2: Restaurer scores crypto après pipeline scoring ===
        # build_raw_universe() + FactorScorer écrasent _profile_score.
        # On restaure depuis profile_crypto_data (source de vérité).
        if profile_crypto_data:
            # Lookup par symbol: "PAXG/USD" → {score: 100, role: "core", ...}
            crypto_lookup = {}
            for cr in profile_crypto_data:
                sym = cr.get("symbol") or cr.get("ticker") or ""
                base = sym.split("/")[0].upper().strip() if "/" in sym else sym.upper().strip()
                if base:
                    crypto_lookup[base] = cr
            
            restored_count = 0
            for asset in assets:
                if getattr(asset, 'category', '') != 'Crypto':
                    continue
                # Matcher par nom ou ticker
                asset_name = (getattr(asset, 'name', '') or '').upper().strip()
                asset_ticker = (getattr(asset, 'ticker', '') or '').upper().strip()
                # Extraire base du ticker (ex: "PAXG/USD" → "PAXG")
                if '/' in asset_name:
                    asset_base = asset_name.split('/')[0].strip()
                elif '/' in asset_ticker:
                    asset_base = asset_ticker.split('/')[0].strip()
                else:
                    asset_base = asset_ticker or asset_name
                
                cr = crypto_lookup.get(asset_base)
                if cr and cr.get("_profile_score") is not None:
                    old_score = asset.score
                    preset_score = float(cr["_profile_score"])
                    # v5.2.0: Satellite role gets -20% score discount
                    # Rationale: satellite = niche/unrecognized category, 
                    # shouldn't compete equally with core investments
                    role = cr.get("_role", "core")
                    if role == "satellite":
                        preset_score *= 0.80  # 20% haircut
                    asset.score = preset_score
                    # Aussi injecter dans source_data pour assign_preset_to_asset
                    if asset.source_data is None:
                        asset.source_data = {}
                    asset.source_data["_profile_score"] = cr["_profile_score"]
                    asset.source_data["_role"] = cr.get("_role")
                    asset.source_data["_crypto_category"] = cr.get("_crypto_category")
                    asset.source_data["_matched_preset"] = cr.get("_matched_preset") or f"crypto_preset_{cr.get('_crypto_category', 'other')}"
                    restored_count += 1
                    logger.info(
                        f"   [{profile}] FIX v2.0.2 RESTORE: {asset_base} "
                        f"score {old_score:.1f} → {asset.score:.1f} "
                        f"(role={cr.get('_role', '?')})"
                    )
            
            if restored_count > 0:
                logger.info(f"   [{profile}] FIX v2.0.2: {restored_count} crypto scores restaurés depuis preset")
            elif profile_crypto_data:
                logger.warning(f"   [{profile}] FIX v2.0.2: 0 crypto restaurées! Lookup keys: {list(crypto_lookup.keys())}")
        # === FIN FIX v2.0.2 ===   
        
        # === FIX v2.1.0: Restaurer scores ETF après pipeline scoring ===
        # Même pattern que crypto FIX v2.0.2 RESTORE.
        # build_raw_universe() + FactorScorer écrasent _profile_score ETF.
        # On restaure depuis profile_etf_data (source de vérité).
        if profile_etf_data:
            etf_lookup = {}
            for etf in profile_etf_data:
                sym = etf.get("etfsymbol") or etf.get("ticker") or etf.get("symbol") or ""
                base = sym.upper().strip()
                if base:
                    etf_lookup[base] = etf
                # Aussi par ISIN si disponible
                isin = etf.get("isin", "")
                if isin and str(isin).strip().upper() not in ("", "NAN", "NONE"):
                    etf_lookup[str(isin).strip().upper()] = etf
            
            etf_restored_count = 0
            for asset in assets:
                cat = getattr(asset, 'category', '') or ''
                if cat.lower() not in ('etf',):
                    continue
                # Matcher par id, ticker ou name
                asset_id = str(getattr(asset, 'id', '') or '').upper().strip()
                asset_ticker = str(getattr(asset, 'ticker', '') or '').upper().strip()
                
                etf_original = etf_lookup.get(asset_id) or etf_lookup.get(asset_ticker)
                if etf_original and etf_original.get("_profile_score") is not None:
                    original_score = float(etf_original["_profile_score"])
                    # Restaurer seulement si le score preset est meilleur
                    if original_score > asset.score:
                        old_score = asset.score
                        asset.score = original_score
                        if asset.source_data is None:
                            asset.source_data = {}
                        asset.source_data["_profile_score"] = etf_original["_profile_score"]
                        asset.source_data["_matched_preset"] = etf_original.get("_matched_preset", "")
                        asset.source_data["_role"] = etf_original.get("_role", "")
                        etf_restored_count += 1
                        logger.info(
                            f"   [{profile}] FIX v2.1.0 RESTORE ETF: {asset_id} "
                            f"score {old_score:.1f} → {asset.score:.1f} "
                            f"(preset={etf_original.get('_matched_preset', '?')})"
                        )
            
            if etf_restored_count > 0:
                logger.info(f"   [{profile}] FIX v2.1.0: {etf_restored_count} ETF scores restaurés depuis preset_etf")
            elif profile_etf_data:
                logger.warning(f"   [{profile}] FIX v2.1.0: 0 ETF restaurés! Lookup keys sample: {list(etf_lookup.keys())[:10]}")
        # === FIN FIX v2.1.0 ===
        
        # v4.13.2 FIX: Collecter TOUS les assets de TOUS les profils (union)
        for a in assets:
            a_id = getattr(a, 'id', None)
            if a_id is None:
                continue
            a_id = str(a_id)
            if a_id not in all_assets_ids:
                all_assets.append(a)
                all_assets_ids.add(a_id)
        profile_config = PROFILES.get(profile)
        profile_constraints = {
            "bonds_min": getattr(profile_config, "bonds_min", 5.0),
            "crypto_max": getattr(profile_config, "crypto_max", 10.0),
            "max_single_position": getattr(profile_config, "max_single_position", 15.0),
            "max_single_bond": 25.0,
            "min_assets": getattr(profile_config, "min_assets", 10),
            "max_assets": getattr(profile_config, "max_assets", 18),
            "vol_target": getattr(profile_config, "vol_target", 12.0),
            "vol_tolerance": getattr(profile_config, "vol_tolerance", 3.0),
        }
        
        candidates_for_feasibility = []
        for a in assets:
            cat = getattr(a, 'category', None) or 'ETF'
            cat_normalized = "Obligations" if "bond" in cat.lower() else cat
            vol = getattr(a, 'vol_annual', None) or getattr(a, 'vol', None) or 20.0
            candidates_for_feasibility.append({
                "category": cat_normalized,
                "vol_annual": vol,
                "name": getattr(a, 'name', 'Unknown'),
            })
        
        feasibility = check_feasibility(
            candidates=candidates_for_feasibility,
            profile_constraints=profile_constraints,
            profile_name=profile,
        )
        feasibility_reports[profile] = feasibility
        
        if feasibility.feasible:
            logger.info(f"   ✅ [P0-4] {profile}: Faisabilité OK (capacity: {feasibility.capacity})")
        else:
            logger.warning(f"   ⚠️ [P0-4] {profile}: Faisabilité LIMITÉE - {feasibility.reason}")

        # v7.2: Charger les prix pour covariance empirique (LW + EWMA + PCA)
        try:
            from portfolio_engine.price_loader import load_returns_for_assets
            assets = load_returns_for_assets(assets, cache_path="data/price_cache.json")
            _n_ret = sum(1 for a in assets if getattr(a, 'returns_series', None) is not None)
            logger.info(f"   [{profile}] Returns loaded: {_n_ret}/{len(assets)} assets")
        except Exception as _e:
            logger.warning(f"   [{profile}] Price loading failed: {_e}, using structured only")

        # Phase1-B1: prev_weights pour contrôle turnover (None au premier run)
        _prev_std = (_prev_alloc.get(profile) or {}).get("standard") or None
        _prev_yld = (_prev_alloc.get(profile) or {}).get("yield") or None

        allocation, diagnostics = optimizer.build_portfolio(
            assets, profile, prev_weights=_prev_std
        )

        # v8.x.3: Pour les profils Dividende AVEC baseline ACTIF, on remplace
        # l'output de l'optimizer par un equal-weight (tilté par score) sur TOUS
        # les baseline tickers présents. Sinon l'optimizer drop des baseline
        # tickers (poids < seuil) → sorties silencieuses, casse le buy-and-hold.
        # Le set _DIVIDENDE_BASELINE_ACTIVE est rempli par le baseline filter
        # SI il a effectivement réduit l'univers (pas de toxicité, pas force_rebalance).
        if profile in _DIVIDENDE_BASELINE_ACTIVE:
            allocation = _equal_weight_baseline(assets, profile)

        # v8.x: max_country post-process pour profils Dividende (anti-concentration souveraine)
        if profile in DIVIDENDE_MAX_COUNTRY_PCT:
            allocation = _enforce_max_country(allocation, assets, profile)

        # v7.3: Flow RENDEMENT — mêmes candidats, poids yield-driven
        try:
            alloc_yield, diag_yield = optimizer.build_portfolio_yield(
                assets, profile, prev_weights=_prev_yld
            )
            _wy = diag_yield.get('yield_metrics', {}).get('weighted_yield', '?')
            logger.info(f"   [{profile}] Rendement: {len(alloc_yield)} pos, yield={_wy}%")
        except Exception as _e:
            logger.error(f"   [{profile}] Flow rendement FAILED: {_e}")
            import traceback; traceback.print_exc()
            alloc_yield, diag_yield = {}, {}

        # v4.14.0 FIX R12: Normaliser allocation en % si retournée en décimal (somme ~1)
        total_alloc = sum(allocation.values()) if allocation else 0.0
        if 0.5 < total_alloc < 1.5:  # allocation en décimal, pas en %
            logger.info(f"   [{profile}] Allocation en décimal (sum={total_alloc:.2f}), conversion en %")
            allocation = {k: v * 100.0 for k, v in allocation.items()}
        
        # v4.14.0 FIX R12b: Log validation somme post-conversion
        s = sum(allocation.values()) if allocation else 0.0
        if not (98.0 <= s <= 102.0):
            logger.warning(f"   [{profile}] ⚠️ allocation sum inattendue après R12: {s:.2f}")
        else:
            logger.info(f"   [{profile}] ✅ allocation sum OK après R12: {s:.2f}")
        
        # v4.14.0 R14-3: Post-processing unifié (prune + cap + round)
        allocation = post_process_allocation(allocation, profile_config, diagnostics, profile)
        
        # === v5.3.2: Max single EQUITY cap (individual stocks only, not ETF/bonds) ===
        # VRT was at 13% in Agressif — single stock risk too high for retail
        # ETFs and bonds can remain at higher weights (diversified by nature)
        _MAX_SINGLE_EQUITY = {
            "Agressif": 10.0,
            "Modéré": 11.0,
            "Stable": 10.0,
        }
        # v5.3.3: PE-based cap — don't overweight extreme valuations
        # Principle: stocks with PE > threshold get a lower weight cap
        _PE_CAP_RULES = {
            "Agressif": (60, 6.0),   # PE > 60 → max 6%
            "Modéré":   (40, 5.0),   # PE > 40 → max 5%
            "Stable":   (30, 5.0),   # PE > 30 → max 5%
        }
        _eq_cap = _MAX_SINGLE_EQUITY.get(profile, 11.0)
        _pe_threshold, _pe_cap = _PE_CAP_RULES.get(profile, (60, 6.0))
        _asset_lookup = {a.id: a for a in assets}
        _eq_capped = False
        for aid, weight in list(allocation.items()):
            _asset = _asset_lookup.get(aid)
            if not _asset or _asset.category != "Actions":
                continue
            
            # Get PE ratio
            _pe = None
            if hasattr(_asset, 'source_data') and _asset.source_data:
                _pe = _asset.source_data.get('pe_ratio')
            if _pe is None and hasattr(_asset, 'pe_ratio'):
                _pe = getattr(_asset, 'pe_ratio', None)
            
            # Determine effective cap for this stock
            _effective_cap = _eq_cap
            if _pe is not None and _pe > _pe_threshold and _pe > 0:
                _effective_cap = min(_eq_cap, _pe_cap)
            
            if weight > _effective_cap + 0.01:
                _excess = weight - _effective_cap
                allocation[aid] = _effective_cap
                # Redistribute excess pro-rata to non-equity positions
                _others = {k: v for k, v in allocation.items() 
                          if k != aid and _asset_lookup.get(k) and _asset_lookup[k].category != "Actions"}
                if _others:
                    _total_others = sum(_others.values())
                    for k in _others:
                        allocation[k] += _excess * (_others[k] / _total_others)
                else:
                    # Fallback: redistribute to all others
                    _others_all = {k: v for k, v in allocation.items() if k != aid}
                    _total_all = sum(_others_all.values())
                    if _total_all > 0:
                        for k in _others_all:
                            allocation[k] += _excess * (_others_all[k] / _total_all)
                _pe_str = f" PE={_pe:.0f}>{_pe_threshold}" if _pe and _pe > _pe_threshold else ""
                logger.info(
                    f"   [{profile}] 📉 Equity cap: {_asset.name[:25]} {weight:.1f}%→{_effective_cap:.1f}% "
                    f"(excess {_excess:.1f}% redistributed){_pe_str}"
                )
                _eq_capped = True
        
        if _eq_capped:
            allocation = round_weights_to_100(allocation, decimals=2)
        
        # === PHASE 1: TRACE 5 - Optimizer allocation ===
        allocated_ids = set(allocation.keys())
        korea_allocated = []
        for a in assets:
            if a.id in allocated_ids:
                region = getattr(a, 'region', '') or ''
                if "korea" in region.lower() or "corée" in region.lower():
                    korea_allocated.append(a)
        
        print(f"[KOREA TRACE] 5. {profile} - Allocated by optimizer: {len(korea_allocated)}")
        if korea_allocated:
            for ka in korea_allocated:
                print(f"              • {ka.name[:30]} = {allocation.get(ka.id, 0):.2f}%")
        
        diagnostics["_feasibility"] = feasibility.to_dict()
        
        portfolios[profile] = {
            "allocation": allocation,
            "diagnostics": diagnostics,
            "assets": assets,
        }
        
        # === v5.3.3: Post-Markowitz FAVORED Sector Guarantee ===
        # Problem: FAVORED guarantee in preset_meta.py acts on pool selection, but
        # Markowitz rebuilds allocation by mean-variance → ignores sector signal.
        # Result: 0% Energy actions despite Energy FAVORED #1 (+27% YTD).
        # Fix: After optimizer, if a FAVORED sector has 0% allocation in individual
        # stocks → swap worst non-FAVORED, non-sole-sector stock with best FAVORED candidate.
        # Expert protection: NEVER swap the ONLY representative of a sector.
        if market_context and allocation:
            _fav_sectors_radar = set(
                market_context.get("macro_tilts", {}).get("favored_sectors", [])
            )
            _asset_lookup_fav = {a.id: a for a in assets}
            
            # Shared sector normalization (used by FAVORED + ESSENTIAL guarantees)
            _SEC_NORM = {
                "finance": "financials", "financial services": "financials",
                "technologie de l'information": "information-technology",
                "technology": "information-technology",
                "matériaux": "materials", "basic materials": "materials",
                "energie": "energy", "energy": "energy",
                "industries": "industrials", "industrials": "industrials",
                "santé": "healthcare", "healthcare": "healthcare",
                "biens de consommation cycliques": "consumer-discretionary",
                "consumer cyclical": "consumer-discretionary",
                "biens de consommation de base": "consumer-staples",
                "consumer defensive": "consumer-staples",
                "immobilier": "real-estate", "real estate": "real-estate",
                "services publics": "utilities", "utilities": "utilities",
                "la communication": "communication-services",
                "communication services": "communication-services",
            }
            
            def _norm_sec(a):
                s = (getattr(a, 'sector', '') or '').lower().strip()
                sd = ''
                if hasattr(a, 'source_data') and a.source_data:
                    sd = (a.source_data.get('sector', '') or '').lower().strip()
                    sa = (a.source_data.get('sector_api', '') or '').lower().strip()
                else:
                    sa = ''
                return _SEC_NORM.get(s, _SEC_NORM.get(sd, _SEC_NORM.get(sa, s)))
            
            if _fav_sectors_radar:
                # v5.3.3: Profile-dependent eligibility — same logic as _enforce_caps
                _FAVORED_ELIGIBLE_POST = {
                    "Agressif": {"energy", "materials", "information-technology", "industrials"},
                    "Modéré":   {"energy", "materials", "utilities", "industrials", "healthcare"},
                    "Stable":   {"utilities", "healthcare", "consumer-staples", "energy"},
                }
                _active_fav = _fav_sectors_radar & _FAVORED_ELIGIBLE_POST.get(profile, _fav_sectors_radar)
                
                _alloc_equity_sectors = {}  # sector → list of (aid, weight)
                _alloc_sector_counts = {}  # sector → count (for sole-sector protection)
                
                for aid, weight in allocation.items():
                    a = _asset_lookup_fav.get(aid)
                    if a and a.category == "Actions":
                        _sec = _norm_sec(a)
                        _alloc_equity_sectors.setdefault(_sec, []).append((aid, weight))
                        _alloc_sector_counts[_sec] = _alloc_sector_counts.get(_sec, 0) + 1
                
                _missing_fav = [s for s in _active_fav if s not in _alloc_equity_sectors]
                _fav_swapped = 0
                
                for _fav_sec in sorted(_missing_fav):
                    # Find best FAVORED candidate from full asset pool
                    # v5.3.3: Exclude candidates from AVOIDED regions (don't inject India stocks)
                    _avoided_regions_radar = set(
                        market_context.get("macro_tilts", {}).get("avoided_regions", [])
                    )
                    _fav_candidates = []
                    for a in assets:
                        if a.category != "Actions" or a.id in allocation:
                            continue
                        if _norm_sec(a) == _fav_sec:
                            # Check region is not AVOIDED
                            _a_region = (getattr(a, 'region', '') or '').lower().strip()
                            _a_country = ''
                            if hasattr(a, 'source_data') and a.source_data:
                                _a_country = (a.source_data.get('country', '') or '').lower().strip()
                            _COUNTRY_TO_REGION = {
                                "inde": "india", "india": "india",
                                "allemagne": "germany", "germany": "germany",
                                "argentine": "argentina", "argentina": "argentina",
                            }
                            _a_reg_norm = _COUNTRY_TO_REGION.get(_a_country, _a_region)
                            if _a_reg_norm in _avoided_regions_radar:
                                continue
                            _fav_candidates.append(a)
                    
                    if not _fav_candidates:
                        logger.info(f"   [{profile}] 🎯 POST-MKW FAVORED '{_fav_sec}': no candidates in pool")
                        continue
                    
                    _best_fav = max(_fav_candidates, key=lambda a: a.score)
                    
                    # Find worst non-FAVORED equity that is NOT the sole representative of its sector
                    _replaceable = []
                    for aid, weight in allocation.items():
                        a = _asset_lookup_fav.get(aid)
                        if not a or a.category != "Actions":
                            continue
                        _a_sec = _norm_sec(a)
                        # Don't replace if in FAVORED sector
                        if _a_sec in _fav_sectors_radar:
                            continue
                        # Don't replace if sole representative of its sector (expert protection)
                        if _alloc_sector_counts.get(_a_sec, 0) <= 1:
                            # Check if this sector is "essential" (healthcare, utilities)
                            # Still allow replacement if sector has no special protection
                            _essential_secs = {"healthcare", "utilities"}
                            if _a_sec in _essential_secs:
                                continue
                        _replaceable.append((aid, weight, a))
                    
                    if not _replaceable:
                        logger.info(f"   [{profile}] 🎯 POST-MKW FAVORED '{_fav_sec}': no replaceable stocks")
                        continue
                    
                    # v5.3.3: AVOIDED sector stocks are priority replacement targets
                    # AGS (Finance AVOIDED, score 77.1) should be replaced before
                    # ITX (Consumer Disc, score 45) — the signal matters more than the score
                    _avoided_secs_radar = set(
                        market_context.get("macro_tilts", {}).get("avoided_sectors", [])
                    )
                    _avoided_replaceable = [r for r in _replaceable if _norm_sec(r[2]) in _avoided_secs_radar]
                    
                    if _avoided_replaceable:
                        # Replace worst AVOIDED stock first
                        _avoided_replaceable.sort(key=lambda x: x[2].score)
                        _worst_aid, _worst_w, _worst_a = _avoided_replaceable[0]
                        logger.info(
                            f"   [{profile}] 🎯 POST-MKW: targeting AVOIDED stock "
                            f"{_worst_a.name[:25]} ({_norm_sec(_worst_a)}) for replacement"
                        )
                    else:
                        # No AVOIDED stocks → fallback to worst by score
                        _replaceable.sort(key=lambda x: x[2].score)
                        _worst_aid, _worst_w, _worst_a = _replaceable[0]
                    
                    # Score check: FAVORED candidate must be competitive with the stock it replaces
                    # v5.3.3: No score check when replacing AVOIDED stocks (signal > score)
                    # v5.3.3: 65% threshold for non-AVOIDED (was 40% — SRG 38.6 replaced MU 76.0)
                    _is_replacing_avoided = _norm_sec(_worst_a) in _avoided_secs_radar
                    if not _is_replacing_avoided and _best_fav.score < _worst_a.score * 0.65:
                        logger.info(
                            f"   [{profile}] 🎯 POST-MKW FAVORED '{_fav_sec}': "
                            f"{_best_fav.name[:20]} score={_best_fav.score:.1f} too low vs "
                            f"{_worst_a.name[:20]} score={_worst_a.score:.1f}"
                        )
                        continue
                    
                    # Swap
                    _swap_w = allocation.pop(_worst_aid)
                    allocation[_best_fav.id] = _swap_w
                    _fav_swapped += 1
                    
                    # Update sector counts
                    _old_sec = _norm_sec(_worst_a)
                    _alloc_sector_counts[_old_sec] = _alloc_sector_counts.get(_old_sec, 1) - 1
                    _alloc_sector_counts[_fav_sec] = _alloc_sector_counts.get(_fav_sec, 0) + 1
                    _alloc_equity_sectors.setdefault(_fav_sec, []).append((_best_fav.id, _swap_w))
                    
                    logger.info(
                        f"   [{profile}] 🎯 POST-MKW FAVORED inject: "
                        f"{_best_fav.name[:25]} ({_fav_sec} FAVORED, score={_best_fav.score:.1f}) "
                        f"replaces {_worst_a.name[:25]} ({_old_sec}, score={_worst_a.score:.1f}) "
                        f"→ {_swap_w:.1f}%"
                    )
                
                if _fav_swapped:
                    allocation = round_weights_to_100(allocation, decimals=2)
                    diagnostics["_post_mkw_favored"] = {
                        "swapped": _fav_swapped,
                        "missing_favored": _missing_fav,
                    }
                    logger.info(f"   [{profile}] 🎯 POST-MKW: {_fav_swapped} FAVORED sector(s) injected")
            
            # === v5.3.3: Post-Markowitz ESSENTIAL Sector Guarantee (Healthcare) ===
            # Same pattern as FAVORED guarantee but for structurally important sectors.
            # Healthcare = 13% of MSCI World, most decorrelated from cycles.
            # If 0% healthcare in equity allocation → inject best HC, replace worst AVOIDED or worst overall.
            _ESSENTIAL_SECS_POST_MKW = {"healthcare"}
            
            # Recompute current equity sectors
            _ess_equity_secs = set()
            for aid in allocation:
                a = _asset_lookup_fav.get(aid)
                if a and a.category == "Actions":
                    _ess_equity_secs.add(_norm_sec(a))
            
            _missing_essential = _ESSENTIAL_SECS_POST_MKW - _ess_equity_secs
            _ess_swapped = 0
            
            for _ess_sec in sorted(_missing_essential):
                # Find best candidate from this essential sector
                _ess_candidates = [
                    a for a in assets
                    if a.category == "Actions" and a.id not in allocation and _norm_sec(a) == _ess_sec
                ]
                if not _ess_candidates:
                    logger.info(f"   [{profile}] 🏥 POST-MKW ESSENTIAL '{_ess_sec}': no candidates")
                    continue
                
                _best_ess = max(_ess_candidates, key=lambda a: a.score)
                
                # Find replacement target: prefer AVOIDED, then worst non-essential
                _ess_replaceable = []
                for aid, weight in allocation.items():
                    a = _asset_lookup_fav.get(aid)
                    if not a or a.category != "Actions":
                        continue
                    _a_sec = _norm_sec(a)
                    if _a_sec in _ESSENTIAL_SECS_POST_MKW:
                        continue  # Don't replace another essential
                    if _a_sec in _fav_sectors_radar:
                        continue  # Don't replace FAVORED
                    _ess_replaceable.append((aid, weight, a))
                
                if not _ess_replaceable:
                    logger.info(f"   [{profile}] 🏥 POST-MKW ESSENTIAL '{_ess_sec}': no replaceable")
                    continue
                
                # Priority: AVOIDED stocks first, then worst by score
                _avoided_secs = set(
                    market_context.get("macro_tilts", {}).get("avoided_sectors", [])
                )
                
                _avoided_ess = [r for r in _ess_replaceable if _norm_sec(r[2]) in _avoided_secs]
                if _avoided_ess:
                    _avoided_ess.sort(key=lambda x: x[2].score)
                    _worst_aid, _worst_w, _worst_a = _avoided_ess[0]
                else:
                    _ess_replaceable.sort(key=lambda x: x[2].score)
                    _worst_aid, _worst_w, _worst_a = _ess_replaceable[0]
                
                # Swap
                _swap_w = allocation.pop(_worst_aid)
                allocation[_best_ess.id] = _swap_w
                _ess_swapped += 1
                
                logger.info(
                    f"   [{profile}] 🏥 POST-MKW ESSENTIAL inject: "
                    f"{_best_ess.name[:25]} ({_ess_sec}, score={_best_ess.score:.1f}) "
                    f"replaces {_worst_a.name[:25]} ({_norm_sec(_worst_a)}, "
                    f"score={_worst_a.score:.1f}) → {_swap_w:.1f}%"
                )
            
            if _ess_swapped:
                allocation = round_weights_to_100(allocation, decimals=2)
                diagnostics["_post_mkw_essential"] = {"swapped": _ess_swapped}
                logger.info(f"   [{profile}] 🏥 POST-MKW: {_ess_swapped} ESSENTIAL sector(s) injected")
        
        # === v5.3.3: AVOIDED Sector Equity Cap — max 5% per AVOIDED stock ===
        # Uniform 5% across all profiles. Soft enough to keep good stocks (AGS),
        # hard enough to prevent 9-10% concentration in AVOIDED sectors.
        # No 0% ejection — that creates RADAR-dependent turnover.
        _AVOIDED_EQUITY_CAP = 5.0
        if market_context and allocation:
            _avoided_secs_cap = set(
                market_context.get("macro_tilts", {}).get("avoided_sectors", [])
            )
            if _avoided_secs_cap:
                _av_asset_lookup = {a.id: a for a in assets}
                _SEC_NORM_AV = {
                    "finance": "financials", "financial services": "financials",
                    "la communication": "communication-services",
                    "communication services": "communication-services",
                    "biens de consommation cycliques": "consumer-discretionary",
                    "consumer cyclical": "consumer-discretionary",
                }
                
                _avoided_capped = False
                _total_excess = 0.0
                _non_avoided_ids = []
                
                for aid, weight in list(allocation.items()):
                    a = _av_asset_lookup.get(aid)
                    if not a or a.category != "Actions":
                        _non_avoided_ids.append(aid)
                        continue
                    
                    _s = (getattr(a, 'sector', '') or '').lower().strip()
                    _sd = ''
                    if hasattr(a, 'source_data') and a.source_data:
                        _sd = (a.source_data.get('sector_api', '') or '').lower().strip()
                    _a_sec = _SEC_NORM_AV.get(_s, _SEC_NORM_AV.get(_sd, _s))
                    
                    if _a_sec in _avoided_secs_cap and weight > _AVOIDED_EQUITY_CAP + 0.01:
                        _excess = weight - _AVOIDED_EQUITY_CAP
                        allocation[aid] = _AVOIDED_EQUITY_CAP
                        _total_excess += _excess
                        _avoided_capped = True
                        logger.info(
                            f"   [{profile}] 🔴 AVOIDED CAP: {a.name[:25]} "
                            f"({_a_sec}) {weight:.1f}%→{_AVOIDED_EQUITY_CAP:.1f}% "
                            f"(excess {_excess:.1f}%)"
                        )
                    else:
                        _non_avoided_ids.append(aid)
                
                if _avoided_capped and _total_excess > 0.01:
                    _redist_pool = {k: v for k, v in allocation.items() if k in _non_avoided_ids and v > 0}
                    _redist_total = sum(_redist_pool.values())
                    if _redist_total > 0:
                        for k in _redist_pool:
                            allocation[k] += _total_excess * (_redist_pool[k] / _redist_total)
                    allocation = round_weights_to_100(allocation, decimals=2)
                    logger.info(f"   [{profile}] 🔴 AVOIDED CAP: {_total_excess:.1f}% redistributed")
        
        # === FIX v5.2.0: RADAR hard cap — régions "avoided" → max 5% par stock ===
        _agg_capped_aids = set()  # v5.3.1: track capped positions to protect from dust reinflation
        if market_context:
            # Country name aliases (FR→EN, EN→FR, common variants)
            _COUNTRY_ALIASES = {
                "india": ["inde", "india", "indien"],
                "inde": ["india", "inde", "indien"],
                "brazil": ["brésil", "bresil", "brazil", "brasil"],
                "brésil": ["brazil", "bresil", "brasil"],
                "china": ["chine", "china"],
                "chine": ["china", "chine"],
                "mexico": ["mexique", "mexico"],
                "mexique": ["mexico", "mexique"],
                "israel": ["israël", "israel"],
                "south-korea": ["corée", "coree", "korea", "south korea", "corée du sud"],
                "corée": ["korea", "south-korea", "south korea", "corée du sud"],
                "germany": ["allemagne", "germany"],
                "allemagne": ["germany", "allemagne"],
                "united-kingdom": ["royaume-uni", "uk", "united kingdom"],
                "royaume-uni": ["uk", "united-kingdom", "united kingdom"],
                "japan": ["japon", "japan"],
                "japon": ["japan", "japon"],
                "taiwan": ["taïwan", "taiwan"],
                "taïwan": ["taiwan", "taïwan"],
                "france": ["france"],
                "spain": ["espagne", "spain"],
                "espagne": ["spain", "espagne"],
                "italy": ["italie", "italy"],
                "italie": ["italy", "italie"],
                "belgium": ["belgique", "belgium"],
                "belgique": ["belgium", "belgique"],
                "norway": ["norvège", "norvege", "norway"],
                "norvège": ["norway", "norvege"],
                "netherlands": ["pays-bas", "netherlands"],
                "pays-bas": ["netherlands", "pays-bas"],
                "switzerland": ["suisse", "switzerland"],
                "suisse": ["switzerland", "suisse"],
                "indonesia": ["indonésie", "indonesie", "indonesia"],
                "indonésie": ["indonesia", "indonesie"],
            }
            
            _avoided_regions = set()
            _avoided_expanded = set()  # includes all aliases
            _mt = market_context.get("macro_tilts", {})
            for r in _mt.get("avoided_regions", []):
                r_low = r.lower().strip()
                _avoided_regions.add(r_low)
                _avoided_expanded.add(r_low)
                # Add all known aliases
                for alias in _COUNTRY_ALIASES.get(r_low, []):
                    _avoided_expanded.add(alias.lower())
            
            if _avoided_expanded:
                logger.info(f"   [{profile}] 🎯 RADAR avoided regions: {_avoided_regions} → expanded: {_avoided_expanded}")
                RADAR_MAX_WEIGHT_PCT = 5.0  # 5% max per stock from avoided region
                _capped = []
                _surplus = 0.0
                _non_avoided_total = 0.0
                
                # Phase 1: identify stocks to cap
                for aid, w_pct in allocation.items():
                    asset = next((a for a in assets if getattr(a, 'id', None) == aid), None)
                    if not asset:
                        _non_avoided_total += w_pct
                        continue
                    
                    country = (getattr(asset, 'country', '') or '').lower().strip()
                    region = (getattr(asset, 'region', '') or '').lower().strip()
                    cat = (getattr(asset, 'category', '') or '').lower()
                    
                    # Only cap equities (not ETFs/bonds/crypto)
                    is_equity = cat in ('equity', 'stock', 'action', 'actions', 'equities')
                    is_avoided = (country in _avoided_expanded) or (region in _avoided_expanded)
                    
                    if is_avoided and w_pct > 0:
                        logger.info(f"   [{profile}] 🔍 RADAR check: {getattr(asset, 'name', aid)[:25]} | country='{country}' region='{region}' cat='{cat}' | avoided={is_avoided} equity={is_equity} w={w_pct:.1f}%")
                    
                    if is_equity and is_avoided and w_pct > RADAR_MAX_WEIGHT_PCT:
                        _surplus += w_pct - RADAR_MAX_WEIGHT_PCT
                        _capped.append((aid, getattr(asset, 'name', aid)[:25], w_pct))
                        allocation[aid] = RADAR_MAX_WEIGHT_PCT
                    else:
                        _non_avoided_total += w_pct
                
                # Phase 2: redistribute surplus proportionally
                if _surplus > 0 and _non_avoided_total > 0:
                    for aid in allocation:
                        if aid not in [c[0] for c in _capped] and allocation[aid] > 0:
                            allocation[aid] += _surplus * (allocation[aid] / _non_avoided_total)
                    
                    for aid, name, old_w in _capped:
                        logger.info(f"   [{profile}] 🎯 RADAR hard cap: {name} {old_w:.1f}%→{RADAR_MAX_WEIGHT_PCT:.1f}% (region avoided)")
                    logger.info(f"   [{profile}] 🎯 RADAR surplus {_surplus:.1f}% redistribué aux non-avoided")
                    
                    # Re-round to 100%
                    allocation = round_weights_to_100(allocation)
            
            # === FIX v5.3.1: AGGREGATE CAPS — secteurs/régions avoided + régions overheat ===
            # Problème: le cap per-stock (5%) n'empêche pas 2×5% + ETF 9% = 19% dans la même zone.
            # Ce fix ajoute un plafond AGRÉGÉ post-optimizer.
            AGG_CAP_SECTOR_AVOIDED = 10.0   # max % total par secteur avoided
            AGG_CAP_REGION_AVOIDED = 10.0   # max % total par région avoided
            AGG_CAP_REGION_OVERHEAT = 12.0  # max % total par région overheat

            # 1. Extraire avoided sectors depuis macro_tilts
            _avoided_sectors_set = set()
            for _s in _mt.get("avoided_sectors", []):
                _avoided_sectors_set.add(_s.lower().strip())

            # 2. Extraire overheat regions depuis RADAR diagnostics
            _overheat_regions_set = set()
            _overheat_regions_expanded = set()
            _diag = market_context.get("_meta", {}).get("diagnostics", {})
            for _rc in _diag.get("region_classifications", []):
                if "overheat_w52" in (_rc.get("reason") or ""):
                    _oh_key = _rc["key"].lower().strip()
                    _overheat_regions_set.add(_oh_key)
                    _overheat_regions_expanded.add(_oh_key)
                    for _alias in _COUNTRY_ALIASES.get(_oh_key, []):
                        _overheat_regions_expanded.add(_alias.lower())
            
            if _overheat_regions_set:
                logger.info(f"   [{profile}] 🌡️ Overheat regions detected: {_overheat_regions_set}")

            # 3. Build ETF symbol → sector mapping from RADAR diagnostics
            _etf_to_sector = {}
            for _sc in _diag.get("sector_classifications", []):
                _sym = (_sc.get("symbol") or "").upper().strip()
                if _sym and _sym != "N/A":
                    _etf_to_sector[_sym] = _sc["key"].lower()

            # 4. Helper: get sector for any asset
            # Normalize sector names to RADAR keys
            # Covers: FR (sector), EN API (sector_api), and common variants
            _SECTOR_NORMALIZE = {
                # === Financials ===
                'finance': 'financials',
                'financial services': 'financials',
                'financial': 'financials',
                'financials': 'financials',
                'banks': 'financials',
                'banking': 'financials',
                'banque': 'financials',
                'insurance': 'financials',
                'assurance': 'financials',
                'capital markets': 'financials',
                'diversified financials': 'financials',
                # === Industrials ===
                'industries': 'industrials',
                'industrials': 'industrials',
                'industrial': 'industrials',
                # === IT ===
                "technologie de l'information": 'information-technology',
                'technology': 'information-technology',
                'tech': 'information-technology',
                'information technology': 'information-technology',
                'information-technology': 'information-technology',
                # === Consumer Discretionary ===
                'biens de consommation cycliques': 'consumer-discretionary',
                'consumer cyclical': 'consumer-discretionary',
                'consumer discretionary': 'consumer-discretionary',
                'consumer-discretionary': 'consumer-discretionary',
                # === Healthcare ===
                'santé': 'healthcare',
                'sante': 'healthcare',
                'healthcare': 'healthcare',
                'health care': 'healthcare',
                # === Consumer Staples ===
                'biens de consommation de base': 'consumer-staples',
                'consumer defensive': 'consumer-staples',
                'consumer staples': 'consumer-staples',
                'consumer-staples': 'consumer-staples',
                # === Materials ===
                'matériaux': 'materials',
                'materiaux': 'materials',
                'materials': 'materials',
                'basic materials': 'materials',
                'basic-materials': 'materials',
                # === Utilities ===
                'services publics': 'utilities',
                'utilities': 'utilities',
                # === Communication Services ===
                'la communication': 'communication-services',
                'communication services': 'communication-services',
                'communication-services': 'communication-services',
                # === Real Estate ===
                'immobilier': 'real-estate',
                'real estate': 'real-estate',
                'real-estate': 'real-estate',
                # === Energy ===
                'energie': 'energy',
                'énergie': 'energy',
                'energy': 'energy',
                # === Other ===
                'autres': 'other',
                'other': 'other',
            }

            def _agg_get_sector(asset):
                # a) Try sector field (FR), then sector_api (EN), then sector_top
                for _field in ('sector', 'sector_api', 'sector_top'):
                    s = _safe_get_attr(asset, _field) or ''
                    if not isinstance(s, str):
                        continue  # skip dicts/lists that source_data may return
                    s = s.lower().strip()
                    if s and s != 'unknown':
                        normalized = _SECTOR_NORMALIZE.get(s)
                        if normalized:
                            return normalized
                # b) ETF: lookup via RADAR diagnostics symbol mapping
                _tk_raw = _safe_get_attr(asset, 'ticker') or _safe_get_attr(asset, 'name') or ''
                if not isinstance(_tk_raw, str):
                    _tk_raw = str(_tk_raw)
                tk = _tk_raw.upper().strip()
                if '/' in tk:
                    tk = tk.split('/')[0].strip()
                return _etf_to_sector.get(tk, '')

            # 5. Helper: get canonical region for any asset
            def _agg_get_region(asset):
                c = _safe_get_attr(asset, 'country') or ''
                if not isinstance(c, str):
                    c = ''
                c = c.lower().strip()
                r = getattr(asset, 'region', '') or ''
                if not isinstance(r, str):
                    r = ''
                r = r.lower().strip()
                raw = c or r
                if not raw:
                    return ''
                # Canonicalize via aliases
                for _canon, _aliases in _COUNTRY_ALIASES.items():
                    if raw == _canon or raw in [a.lower() for a in _aliases]:
                        return _canon
                return raw

            # 6. Aggregate exposure by sector and region
            _sec_totals = {}   # {sector: total_pct}
            _sec_aids = {}     # {sector: [(aid, w)]}
            _reg_totals = {}   # {region: total_pct}
            _reg_aids = {}     # {region: [(aid, w)]}

            for _aid, _w in allocation.items():
                if _w <= 0:
                    continue
                _asset = next((a for a in assets if getattr(a, 'id', None) == _aid), None)
                if not _asset:
                    continue
                # Sector
                _sec = _agg_get_sector(_asset)
                if _sec:
                    _sec_totals[_sec] = _sec_totals.get(_sec, 0) + _w
                    _sec_aids.setdefault(_sec, []).append((_aid, _w))
                # Region
                _reg = _agg_get_region(_asset)
                if _reg:
                    _reg_totals[_reg] = _reg_totals.get(_reg, 0) + _w
                    _reg_aids.setdefault(_reg, []).append((_aid, _w))

            # Log pre-cap exposure for avoided/overheat
            for _sec in _avoided_sectors_set:
                if _sec in _sec_totals:
                    logger.info(f"   [{profile}] 📊 PRE-AGG sector '{_sec}' (AVOIDED): {_sec_totals[_sec]:.1f}%")
            for _reg in _avoided_regions:
                _rk = _reg.lower().strip()
                if _rk in _reg_totals:
                    logger.info(f"   [{profile}] 📊 PRE-AGG region '{_rk}' (AVOIDED): {_reg_totals[_rk]:.1f}%")
            for _reg in _overheat_regions_set:
                if _reg in _reg_totals:
                    logger.info(f"   [{profile}] 📊 PRE-AGG region '{_reg}' (OVERHEAT): {_reg_totals[_reg]:.1f}%")

            # 7. Apply aggregate caps
            _agg_surplus = 0.0
            _agg_capped_aids = set()

            def _apply_agg_cap(group_aids, group_total, cap, label):
                """Cap a group of assets to max cap%, return surplus."""
                nonlocal _agg_surplus, _agg_capped_aids
                if group_total <= cap:
                    return
                excess = group_total - cap
                _agg_surplus += excess
                ratio = cap / group_total
                for _a_id, _a_w in group_aids:
                    if _a_id in allocation:
                        allocation[_a_id] = round(allocation[_a_id] * ratio, 2)
                        _agg_capped_aids.add(_a_id)
                logger.info(f"   [{profile}] 🚫 AGG CAP {label}: {group_total:.1f}%→{cap:.1f}%")

            # 7a. Cap secteurs avoided
            for _sec in _avoided_sectors_set:
                _apply_agg_cap(
                    _sec_aids.get(_sec, []),
                    _sec_totals.get(_sec, 0),
                    AGG_CAP_SECTOR_AVOIDED,
                    f"sector '{_sec}' (avoided)"
                )

            # 7b. Cap régions avoided
            for _r in list(_avoided_regions):
                _rk = _r.lower().strip()
                _apply_agg_cap(
                    _reg_aids.get(_rk, []),
                    _reg_totals.get(_rk, 0),
                    AGG_CAP_REGION_AVOIDED,
                    f"region '{_rk}' (avoided)"
                )

            # 7c. Cap régions overheat
            for _r in _overheat_regions_set:
                # Don't double-cap if already avoided
                if _r in _avoided_expanded:
                    continue
                _apply_agg_cap(
                    _reg_aids.get(_r, []),
                    _reg_totals.get(_r, 0),
                    AGG_CAP_REGION_OVERHEAT,
                    f"region '{_r}' (overheat)"
                )

            # 8. Redistribute surplus to non-capped positions
            if _agg_surplus > 0.5:  # Only redistribute if meaningful
                _non_capped_total = sum(
                    w for a_id, w in allocation.items()
                    if a_id not in _agg_capped_aids and w > 0
                )
                if _non_capped_total > 0:
                    for _a_id in allocation:
                        if _a_id not in _agg_capped_aids and allocation[_a_id] > 0:
                            allocation[_a_id] += _agg_surplus * (allocation[_a_id] / _non_capped_total)
                    logger.info(f"   [{profile}] 🔄 AGG surplus {_agg_surplus:.1f}% redistribué aux {len(allocation) - len(_agg_capped_aids)} positions non-cappées")
                
                # 8b. Re-cap max single position after redistribution (schema limit = 15%)
                _MAX_SINGLE_POST_AGG = 15.0
                for _iter in range(5):  # max 5 iterations for cascading caps
                    _over = [(a_id, w) for a_id, w in allocation.items() if w > _MAX_SINGLE_POST_AGG + 0.01]
                    if not _over:
                        break
                    _excess2 = 0.0
                    _capped2 = set()
                    for _a_id, _a_w in _over:
                        _excess2 += _a_w - _MAX_SINGLE_POST_AGG
                        allocation[_a_id] = _MAX_SINGLE_POST_AGG
                        _capped2.add(_a_id)
                        _agg_capped_aids.add(_a_id)  # protect from dust reinflation too
                        logger.info(f"   [{profile}] 🔒 POST-AGG max_single: {_a_id} {_a_w:.1f}%→{_MAX_SINGLE_POST_AGG:.1f}%")
                    # Redistribute excess to remaining non-capped
                    _eligible = sum(w for a_id, w in allocation.items() 
                                    if a_id not in _agg_capped_aids and w > 0)
                    if _eligible > 0 and _excess2 > 0:
                        for _a_id in allocation:
                            if _a_id not in _agg_capped_aids and allocation[_a_id] > 0:
                                allocation[_a_id] += _excess2 * (allocation[_a_id] / _eligible)
                
                allocation = round_weights_to_100(allocation)
            
            # 9. Log post-cap exposure
            for _sec in _avoided_sectors_set:
                _new = sum(allocation.get(a_id, 0) for a_id, _ in _sec_aids.get(_sec, []))
                if _new > 0:
                    logger.info(f"   [{profile}] 📊 POST-AGG sector '{_sec}': {_new:.1f}%")
            for _reg in list(set(list(_avoided_regions) + list(_overheat_regions_set))):
                _rk = _reg.lower().strip()
                _new = sum(allocation.get(a_id, 0) for a_id, _ in _reg_aids.get(_rk, []))
                if _new > 0:
                    logger.info(f"   [{profile}] 📊 POST-AGG region '{_rk}': {_new:.1f}%")
        
        # === FIX v5.2.0-C: Min weight enforcement — positions < 2% supprimées ===
        MIN_POSITION_WEIGHT = 2.0  # %
        _small_positions = [(aid, w) for aid, w in allocation.items() if 0 < w < MIN_POSITION_WEIGHT]
        logger.info(f"   [{profile}] 🧹 Dust check: {len(allocation)} positions, {len(_small_positions)} below {MIN_POSITION_WEIGHT}%")
        if _small_positions:
            for _aid, _w in _small_positions:
                _a = next((a for a in assets if getattr(a, 'id', None) == _aid), None)
                _n = getattr(_a, 'name', _aid)[:25] if _a else _aid
                logger.info(f"   [{profile}] 🧹 Candidate: {_n} ({_aid}) = {_w:.2f}%")
        
        _removed_dust = []
        _dust_total = 0.0
        _keep_total = 0.0
        
        for aid, w_pct in list(allocation.items()):
            if 0 < w_pct < MIN_POSITION_WEIGHT:
                asset = next((a for a in assets if getattr(a, 'id', None) == aid), None)
                cat = getattr(asset, 'category', '') if asset else ''
                name = getattr(asset, 'name', aid)[:25] if asset else aid
                # v3.4: Protect ETFs from dust cleanup — optimizer placed them for diversification
                # EWY at 1.8% and SOXX at 0.7% were removed, leaving only 2 ETFs
                if cat == 'ETF':
                    logger.info(f"   [{profile}] 🧹 PROTECTED ETF: {name} ({aid}) = {w_pct:.2f}% (kept)")
                    _keep_total += w_pct
                    continue
                _removed_dust.append((aid, name, w_pct))
                _dust_total += w_pct
                del allocation[aid]
            elif w_pct > 0:
                _keep_total += w_pct
        
        if _removed_dust and _keep_total > 0:
            # Redistribute proportionally — but EXCLUDE agg-capped positions (v5.3.1)
            # to prevent dust reinflation of avoided sector/region caps
            _dust_eligible_total = sum(
                w for aid, w in allocation.items() 
                if w > 0 and aid not in _agg_capped_aids
            )
            if _dust_eligible_total > 0:
                for aid in allocation:
                    if allocation[aid] > 0 and aid not in _agg_capped_aids:
                        allocation[aid] += _dust_total * (allocation[aid] / _dust_eligible_total)
            elif _keep_total > 0:
                # Fallback: all positions are capped, redistribute to all
                for aid in allocation:
                    if allocation[aid] > 0:
                        allocation[aid] += _dust_total * (allocation[aid] / _keep_total)
            
            for aid, name, old_w in _removed_dust:
                logger.info(f"   [{profile}] 🧹 Dust removed: {name} {old_w:.1f}% < {MIN_POSITION_WEIGHT}%")
            _n_protected = len([a for a in allocation if a in _agg_capped_aids and allocation[a] > 0])
            logger.info(f"   [{profile}] 🧹 {len(_removed_dust)} positions removed, {_dust_total:.1f}% redistributed (protected {_n_protected} capped positions)")
            
            # Re-round
            allocation = round_weights_to_100(allocation)
        
        # === v5.3.1 FIX: Sync allocation back to portfolios dict ===
        # round_weights_to_100() creates a NEW dict, so portfolios[profile]["allocation"]
        # (set at line ~2460) becomes stale after caps/dust. Re-assign to propagate.
        portfolios[profile]["allocation"] = allocation
        
        # === v5.2.1 FIX: Build _tickers_meta BEFORE risk_analysis ===
        try:
            tm = build_tickers_meta_for_risk(allocation, assets)
            
            # v5.4.1: Enrich meta with beta/industry from raw stocks data
            # build_tickers_meta_for_risk may not have access to source_data for all assets
            try:
                _enriched = 0
                for _tk, _meta_entry in tm.items():
                    _fund = _ticker_fundamentals.get(_tk.upper(), {})
                    if _fund:
                        if not _meta_entry.get("beta") and _fund.get("beta"):
                            _meta_entry["beta"] = _fund["beta"]
                            _enriched += 1
                        if not _meta_entry.get("industry") and _fund.get("industry"):
                            _meta_entry["industry"] = _fund["industry"]
                if _enriched:
                    logger.info(f"   [{profile}] v5.4.1: {_enriched} tickers enriched with beta from stocks data")
            except NameError:
                pass  # _ticker_fundamentals not built yet
            
            portfolios[profile]["_tickers_meta"] = tm
            portfolios[profile]["_tickers"] = {k: v["weight"] for k, v in tm.items()}
            
            s = sum(portfolios[profile]["_tickers"].values())
            if abs(s - 1.0) > 0.01:
                logger.warning(f"   [{profile}] _tickers sum={s:.4f} (expected ~1.0)")
            else:
                logger.info(f"   [{profile}] ✅ _tickers_meta built: {len(tm)} tickers, sum={s:.4f}")
        except Exception as e:
            logger.warning(f"   [{profile}] Cannot build _tickers_meta: {e}")
        # v7.3: Store yield allocation in portfolio
        if alloc_yield:
            try:
                _tickers_rend = {}
                # Build lookup from current profile's assets (not all_assets)
                _asset_lookup = {str(getattr(a, 'id', '')): a for a in assets}
                for aid, weight in alloc_yield.items():
                    _a = _asset_lookup.get(str(aid))
                    _tk = (getattr(_a, 'ticker', None) or getattr(_a, 'symbol', None) or aid) if _a else aid
                    _tickers_rend[str(_tk)] = weight / 100.0
                portfolios[profile]["_tickers_rendement"] = _tickers_rend
                portfolios[profile]["_yield_metrics"] = diag_yield.get("yield_metrics", {})
                logger.info(f"   [{profile}] _tickers_rendement: {len(_tickers_rend)} tickers stored")
            except Exception as _e:
                logger.warning(f"   [{profile}] yield tickers mapping: {_e}")
                import traceback; traceback.print_exc()

        # === v5.2.1: Risk Analysis avec VaR hybride 5 ans ===
        if CONFIG.get("enable_risk_analysis", False) and HAS_RISK_ANALYSIS:
            try:
                # v5.2.1: Utiliser fetch_and_enrich pour VaR historique 5 ans
                if fetch_and_enrich_risk_analysis is not None:
                    enriched = fetch_and_enrich_risk_analysis(
                        portfolio_result=portfolios[profile],
                        profile_name=profile,
                        lookback_years=5,
                        use_cache=False,
                    )
                else:
                    # Fallback: VaR paramétrique seulement
                    enriched = enrich_portfolio_with_risk_analysis(
                        portfolio_result=portfolios[profile],
                        profile_name=profile,
                    )
                portfolios[profile]["risk_analysis"] = enriched.get("risk_analysis", {})
                logger.info(f"   ✅ [risk_analysis] Enrichissement OK pour {profile}")
            except Exception as e:
                logger.warning(f"   ⚠️ [risk_analysis] Erreur: {e}, continue sans enrichissement")
        
        # v4.14.0 FIX R8-4: Safe format pour vol (évite TypeError si None)
        vol = diagnostics.get('portfolio_vol')
        vol_str = f"{vol:.1f}%" if isinstance(vol, (int, float)) else "N/A"
        logger.info(f"   → {len(allocation)} lignes, vol={vol_str}")
    
    # === v4.15.0: Diagnostic overlap entre profils (fix: utiliser ticker, pas id) ===
    if HAS_PROFILE_POLICY and len(equities_by_profile) == 3:
        # v4.15.0 FIX: Utiliser ticker uniquement (id=EQ_123 n'est pas stable)
        agg_tickers = {e.get("ticker") for e in equities_by_profile.get("Agressif", []) if e.get("ticker")}
        mod_tickers = {e.get("ticker") for e in equities_by_profile.get("Modéré", []) if e.get("ticker")}
        stb_tickers = {e.get("ticker") for e in equities_by_profile.get("Stable", []) if e.get("ticker")}
        
        overlap_agg_mod = len(agg_tickers & mod_tickers)
        overlap_agg_stb = len(agg_tickers & stb_tickers)
        overlap_mod_stb = len(mod_tickers & stb_tickers)
        overlap_all = len(agg_tickers & mod_tickers & stb_tickers)
        
        logger.info("="*60)
        logger.info("📊 DIAGNOSTIC OVERLAP ÉQUITIES (v4.15.0 PROFILE_POLICY)")
        logger.info("="*60)
        logger.info(f"   Agressif: {len(agg_tickers)} équités")
        logger.info(f"   Modéré:   {len(mod_tickers)} équités")
        logger.info(f"   Stable:   {len(stb_tickers)} équités")
        logger.info(f"   Overlap Agressif ∩ Modéré: {overlap_agg_mod}")
        logger.info(f"   Overlap Agressif ∩ Stable: {overlap_agg_stb}")
        logger.info(f"   Overlap Modéré ∩ Stable:   {overlap_mod_stb}")
        logger.info(f"   Overlap commun (3 profils): {overlap_all}")
        
        # Cibles attendues
        target_overlap_agg_stb = len(agg_tickers) * 0.30  # Max 30%
        if overlap_agg_stb > target_overlap_agg_stb:
            logger.warning(f"   ⚠️ Overlap Agressif-Stable trop élevé: {overlap_agg_stb} > {target_overlap_agg_stb:.0f} (cible <30%)")
        else:
            logger.info(f"   ✅ Overlap Agressif-Stable OK: {overlap_agg_stb} <= {target_overlap_agg_stb:.0f}")
    # === v1.6.1 FIX: Enrichir eq_filtered avec max _profile_score des 3 profils ===
    # Problème: eq_filtered a _buffett_score + _matched_preset mais PAS _profile_score
    # Les _profile_score sont calculés PAR PROFIL dans select_equities_for_profile_v2()
    # et stockés dans equities_by_profile[profile]. On merge le MAX ici pour l'audit.
    _profile_scores_by_ticker = {}  # {ticker: max_profile_score}
    _profile_best_by_ticker = {}    # {ticker: best_profile_name}
    for _prof_name, _prof_eqs in equities_by_profile.items():
        for _eq in _prof_eqs:
            _tk = _eq.get("ticker")
            if not _tk:
                continue
            _ps = _eq.get("_profile_score")
            if _ps is not None:
                if _tk not in _profile_scores_by_ticker or _ps > _profile_scores_by_ticker[_tk]:
                    _profile_scores_by_ticker[_tk] = _ps
                    _profile_best_by_ticker[_tk] = _prof_name
    
    _enriched_count = 0
    for _eq in eq_filtered:
        _tk = _eq.get("ticker")
        if _tk and _tk in _profile_scores_by_ticker:
            _eq["_profile_score"] = _profile_scores_by_ticker[_tk]
            _eq["_best_profile"] = _profile_best_by_ticker[_tk]
            _enriched_count += 1
    
    logger.info(
        f"📊 Audit v1.6.1: {_enriched_count}/{len(eq_filtered)} equities enrichies "
        f"avec _profile_score (max des 3 profils), "
        f"{len(eq_filtered) - _enriched_count} sans score (rejetées par hard filters des 3 profils)"
    )
    # === DEBUG LOG 1: Vérifier le merge _profile_score ===
    logger.info(f"🔍 DEBUG-1A: equities_by_profile sizes = { {p: len(e) for p, e in equities_by_profile.items()} }")
    logger.info(f"🔍 DEBUG-1B: _profile_scores_by_ticker has {len(_profile_scores_by_ticker)} entries")
    if _profile_scores_by_ticker:
        _sample_tickers = list(_profile_scores_by_ticker.items())[:3]
        logger.info(f"🔍 DEBUG-1C: sample scores = {_sample_tickers}")
    else:
        logger.info("🔍 DEBUG-1C: ⚠️ _profile_scores_by_ticker est VIDE!")
    _has_ps = sum(1 for e in eq_filtered if e.get("_profile_score") is not None)
    _has_tk = sum(1 for e in eq_filtered if e.get("ticker") is not None)
    logger.info(f"🔍 DEBUG-1D: eq_filtered: {len(eq_filtered)} total, {_has_tk} avec ticker, {_has_ps} avec _profile_score")
    if eq_filtered:
        _sample = eq_filtered[0]
        logger.info(f"🔍 DEBUG-1E: eq_filtered[0] keys = {sorted(_sample.keys())[:15]}")
        logger.info(f"🔍 DEBUG-1E: eq_filtered[0] ticker={_sample.get('ticker')}, _profile_score={_sample.get('_profile_score')}, _buffett_score={_sample.get('_buffett_score')}")
    for _pn, _peqs in equities_by_profile.items():
        if _peqs:
            _p0 = _peqs[0]
            _p_has_tk = sum(1 for e in _peqs if e.get("ticker"))
            _p_has_ps = sum(1 for e in _peqs if e.get("_profile_score") is not None)
            logger.info(f"🔍 DEBUG-1F: equities_by_profile[{_pn}]: {len(_peqs)} items, {_p_has_tk} avec ticker, {_p_has_ps} avec _profile_score")
            logger.info(f"🔍 DEBUG-1F: [{_pn}][0] ticker={_p0.get('ticker')}, _profile_score={_p0.get('_profile_score')}")
    # === v1.5.3 FIX: Génération de l'audit avec données SCORÉES ===
    if CONFIG.get("generate_selection_audit", False) and SELECTION_AUDIT_AVAILABLE:
        try:
            selected_tickers = set()
            for profile_data in portfolios.values():
                for asset_id in profile_data.get("allocation", {}).keys():
                    selected_tickers.add(asset_id)
            
            # v5.2.1 FIX P0: Interleaving round-robin pour que equities_selected
            # contienne les 3 profils (pas juste Agressif qui consomme tous les slots)
            profile_lists = {p: list(eqs) for p, eqs in equities_by_profile.items()}
            max_len = max((len(v) for v in profile_lists.values()), default=0)
            all_profile_equities = []
            for i in range(max_len):
                for profile_name, eqs in profile_lists.items():
                    if i < len(eqs):
                        eq = eqs[i]
                        if "_profile" not in eq:
                            eq["_profile"] = profile_name
                        all_profile_equities.append(eq)
            # v5.1.4 FIX R2: Dedup par (eid, profile) pour préserver les entrées multi-profil
            # Avant: dedup par eid seul → Agressif gagnait toujours (itéré en premier)
            seen_keys = set()
            equities_final = []
            for e in all_profile_equities:
                eid = e.get("id") or e.get("ticker")
                profile = e.get("_profile", "")
                dedup_key = (eid, profile)
                if dedup_key not in seen_keys:
                    seen_keys.add(dedup_key)
                    equities_final.append(e)
            
            # v1.5.3 FIX: Use SCORED data (has _matched_preset, _profile_score)
            scored_etf_list = list(all_scored_etfs.values()) if all_scored_etfs else etf_data
            scored_crypto_list = list(all_scored_cryptos.values()) if all_scored_cryptos else crypto_data
            scored_bonds_list = list(all_scored_bonds.values()) if all_scored_bonds else []
            
            n_with_preset = sum(1 for e in scored_etf_list if e.get("_matched_preset"))
            n_with_score = sum(1 for e in scored_etf_list if e.get("_profile_score") is not None)
            logger.info(f"   📊 Audit v1.5.3: scored ETFs={len(scored_etf_list)}, _matched_preset={n_with_preset}, _profile_score={n_with_score}")
            
            etf_selected_audit = []
            for etf in scored_etf_list:
                identifiers = set()
                for key in ["id", "ticker", "symbol", "name", "etfsymbol", "isin"]:
                    val = etf.get(key)
                    if val:
                        identifiers.add(str(val))
                if identifiers & selected_tickers:
                    etf_copy = etf.copy()
                    etf_copy["category"] = "etf"
                    etf_selected_audit.append(etf_copy)
            
            crypto_selected_audit = []
            for cr in scored_crypto_list:
                identifiers = set()
                for key in ["id", "ticker", "symbol", "name"]:
                    val = cr.get(key)
                    if val:
                        identifiers.add(str(val))
                if identifiers & selected_tickers:
                    crypto_selected_audit.append(cr)
            
            logger.info(f"   📊 Audit: {len(equities_final)} equities, {len(etf_selected_audit)} ETF, {len(crypto_selected_audit)} crypto sélectionnés")
           # === DEBUG LOG 2: Vérifier les données envoyées à l'audit ===
            _eq_f_ps = sum(1 for e in eq_filtered if e.get("_profile_score") is not None)
            _eq_f_bs = sum(1 for e in eq_filtered if e.get("_buffett_score") is not None)
            _ef_ps = sum(1 for e in equities_final if e.get("_profile_score") is not None)
            logger.info(f"🔍 DEBUG-2A: eq_filtered → audit: {len(eq_filtered)} items, {_eq_f_ps} _profile_score, {_eq_f_bs} _buffett_score")
            logger.info(f"🔍 DEBUG-2B: equities_final → audit: {len(equities_final)} items, {_ef_ps} _profile_score")
            if eq_filtered:
                _scores = [e.get("_profile_score") for e in eq_filtered if e.get("_profile_score") is not None]
                if _scores:
                    logger.info(f"🔍 DEBUG-2C: eq_filtered _profile_score range: min={min(_scores):.4f}, max={max(_scores):.4f}")
                else:
                    logger.info("🔍 DEBUG-2C: ⚠️ AUCUN _profile_score dans eq_filtered → ranking sera 100% _buffett_score!")
            # === FIN DEBUG LOG 2 ===
            
            # v5.1.4: Construire bonds_selected pour l'audit
            bonds_selected_audit = []
            for bond in scored_bonds_list:
                identifiers = set()
                for key in ["id", "ticker", "symbol", "name", "isin"]:
                    val = bond.get(key)
                    if val:
                        identifiers.add(str(val))
                if identifiers & selected_tickers:
                    bond_copy = bond.copy()
                    bond_copy["category"] = "bond"
                    bonds_selected_audit.append(bond_copy)
            
            logger.info(f"   📊 Audit v5.1.4: {len(scored_bonds_list)} bonds scored, {len(bonds_selected_audit)} bonds selected")
            # v5.2.1 FIX P1a: Dedup bonds par nom
            _seen_bond_names = set()
            _bonds_deduped = []
            for _b in bonds_selected_audit:
                _bname = (_b.get("name") or "").strip().lower()
                if _bname and _bname not in _seen_bond_names:
                    _seen_bond_names.add(_bname)
                    _bonds_deduped.append(_b)
            bonds_selected_audit = _bonds_deduped
            create_selection_audit(
                config=CONFIG,
                equities_initial=eq_rows_before_buffett,
                equities_after_buffett=eq_filtered,
                equities_final=equities_final,
                etf_data=scored_etf_list,
                etf_selected=etf_selected_audit,
                crypto_data=scored_crypto_list,
                crypto_selected=crypto_selected_audit,
                bonds_data=scored_bonds_list,
                bonds_selected=bonds_selected_audit,
                market_context=market_context,
                profile_selections=_profile_selections_for_audit,     # v5.1.4: fix empty profile_stats/hard_filter_stats
                etf_scoring_debug=_etf_scoring_debug_for_audit,       # v5.1.4: fix empty etf_scoring_debug
                output_path=CONFIG.get("selection_audit_output", "data/selection_audit.json"),
                selected_tickers=selected_tickers,
            )
            logger.info("✅ Audit de sélection généré (v5.1.4 - profile_selections + etf_scoring_debug)")
        except Exception as e:
            logger.warning(f"⚠️ Erreur génération audit: {e}")
            import traceback
            traceback.print_exc()
# === v4.12.1: Génération de l'explication des sélections TOP caps ===
    if CONFIG.get("generate_selection_explained", False) and SELECTION_EXPLAINER_AVAILABLE:
        try:
            # === PHASE 2 FIX: Utiliser les vrais alloués, pas la pré-sélection ===
            # Collecter les IDs réellement alloués (union des 3 profils)
            allocated_ids = set()
            for profile_name, portfolio in portfolios.items():
                if isinstance(portfolio, dict):
                    for asset_id, weight in portfolio.get("allocation", {}).items():
                        if weight > 0:
                            allocated_ids.add(asset_id)
            
            # v4.13: Filtrer les équités de tous les profils
            all_profile_equities = []
            for profile_eqs in equities_by_profile.values():
                all_profile_equities.extend(profile_eqs)
            
            equities_actually_allocated = [
                e for e in all_profile_equities 
                if e.get("id") in allocated_ids 
                or e.get("ticker") in allocated_ids
                or e.get("name") in allocated_ids
            ]
            
            # Dédupliquer
            seen_ids = set()
            equities_deduped = []
            for e in equities_actually_allocated:
                eid = e.get("id") or e.get("ticker")
                if eid not in seen_ids:
                    seen_ids.add(eid)
                    equities_deduped.append(e)
            
            logger.info(f"   Selection explainer: {len(equities_deduped)} equities réellement allouées")
            
            explain_top_caps_selection(
                eq_rows_initial=eq_rows_before_buffett,
                equities_final=equities_deduped,
                config=CONFIG,
                market_context=market_context,
                output_path=CONFIG.get("selection_explained_output", "data/selection_explained.json"),
            )
            logger.info("✅ Explication des sélections TOP caps générée")
        except Exception as e:
            logger.warning(f"⚠️ Erreur génération explication: {e}")
            import traceback
            traceback.print_exc()
    
    # v4.13.2 CHECK: Vérifier que tous les assets alloués sont dans all_assets
    for profile in ["Agressif", "Modéré", "Stable"]:
        alloc_ids = set(map(str, portfolios[profile]["allocation"].keys()))
        all_ids = set(map(lambda x: str(getattr(x, "id", "")), all_assets))
        missing = alloc_ids - all_ids
        logger.info(f"[CHECK] {profile} missing in all_assets: {len(missing)}")
        if missing:
            logger.warning(f"[CHECK] {profile} examples: {list(missing)[:10]}")
    
    return portfolios, all_assets


def build_portfolios_euus() -> Tuple[Dict[str, Dict], List]:
    """
    v4.15.0 P0 FIX: Pipeline EU/US Focus avec sélection PAR PROFIL.
    
    Changement majeur vs v4.14:
    - Avant: equities sélectionnées UNE FOIS pour tous les profils
    - Maintenant: equities sélectionnées PAR PROFIL (comme Global)
    """
    if not HAS_EUUS_PROFILES:
        logger.warning("⚠️ PROFILES_EUUS non disponible, skip EU/US generation")
        return {}, []
    
    logger.info("🇪🇺🇺🇸 Construction des portefeuilles EU/US Focus (v4.15.0 - PAR PROFIL)...")
    
    # 1. Charger les données
    stocks_data = load_stocks_data()
    
    # v5.1.3 FIX: DataFrame master EU/US (préserve types numériques)
    etf_df_master_euus = pd.DataFrame()
    bonds_data = []
    
    if Path(CONFIG["etf_csv"]).exists():
        try:
            etf_df_master_euus = load_csv_robust(CONFIG["etf_csv"], numeric_cols=NUMERIC_COLS_ETF)
            diag_etf_coverage(etf_df_master_euus, "ETF_EUUS")
        except Exception as e:
            logger.warning(f"Impossible de charger ETF: {e}")
    
    if Path(CONFIG["bonds_csv"]).exists():
        try:
            df_b = pd.read_csv(CONFIG["bonds_csv"])
            df_b["category"] = "bond"
            bonds_data = df_b.to_dict("records")
        except Exception as e:
            logger.warning(f"Impossible de charger Bonds: {e}")
    # v5.1.3: Créer etf_data (list de dicts) pour compatibilité
    etf_data = etf_df_master_euus.to_dict('records') if not etf_df_master_euus.empty else []       
    
    # 2. Extraire equities et filtrer EU/US
    eq_rows = []
    eq_skipped = 0
    for data in stocks_data:
        stocks_list = data.get("stocks", []) if isinstance(data, dict) else data
        for it in stocks_list:
            country = it.get("country", "Global")
            region = get_region(country)
            
            if region in BLOCKED_REGIONS_EUUS:
                eq_skipped += 1
                continue
            
            eq_rows.append({
                "id": f"EQ_{len(eq_rows)+1}",
                "name": it.get("name") or it.get("ticker"),
                "ticker": it.get("ticker"),
                "perf_1m": _safe_float(it.get("perf_1m")),
                "perf_3m": _safe_float(it.get("perf_3m")),
                "ytd": _safe_float(it.get("perf_ytd") or it.get("ytd")),
                "perf_24h": _safe_float(it.get("perf_1d")),
                "vol_3y": _safe_float(it.get("volatility_3y") or it.get("vol")),
                "vol": _safe_float(it.get("volatility_3y") or it.get("vol")),
                "volatility_3y": _safe_float(it.get("volatility_3y")),
                "max_dd": _safe_float(it.get("max_drawdown_ytd")),
                "max_drawdown_ytd": _safe_float(it.get("max_drawdown_ytd")),
                "liquidity": _safe_float(it.get("market_cap")),
                "market_cap": _safe_float(it.get("market_cap")),
                "sector": it.get("sector", "Unknown"),
                "country": country,
                "category": "equity",
                "roe": _safe_float(it.get("roe")),
                "de_ratio": _safe_float(it.get("de_ratio")),
                "payout_ratio_ttm": _safe_float(it.get("payout_ratio_ttm")),
                "dividend_yield": _safe_float(it.get("dividend_yield")),
                "pe_ratio": _safe_float(it.get("pe_ratio")),
                "perf_1y": _safe_float(it.get("perf_1y")),
                "perf_3y": _safe_float(it.get("perf_3y")),
                "max_drawdown_3y": _safe_float(it.get("max_drawdown_3y")),
                "fcf_yield": _safe_float(it.get("fcf_yield")),
                "eps_growth_5y": _safe_float(it.get("eps_growth_5y")),
                "beta": _safe_float(it.get("beta")),
                # === v4.15: Quality score (complément au Buffett moat gate) ===
                "quality_score": _safe_float(it.get("quality_score")),
                "quality_subscores": it.get("quality_subscores"),  # v5.1.2: nested dict for quality_value_sub
                # v5.3.1: Quality coverage + profile (needed for hard filter + FIN safety cap)
                "quality_coverage": _safe_float(it.get("quality_coverage")),
                "quality_profile": it.get("quality_profile"),
                "sector_api": it.get("sector_api"),
                "industry": it.get("industry"),  # v5.3.3: GICS level 3
                # === v5.1.4: Préserver buffett_score JS expert ===
                "buffett_score": _safe_float(it.get("buffett_score")),
                # === Legacy ===
                "sector_top": it.get("sector"),
                "country_top": it.get("country"),
            })
    
    logger.info(f"   Equities EU/US: {len(eq_rows)} (skipped {eq_skipped} non-EU/US)")
    
    # 3. v4.15.0 FIX: Appliquer filtre Buffett en mode ENRICHISSEMENT (min_score=0)
    # Le filtrage par seuil se fait PAR PROFIL dans select_equities_for_profile
    if CONFIG["buffett_mode"] != "none" and eq_rows:
        eq_rows = apply_buffett_filter(
            eq_rows,
            mode=CONFIG["buffett_mode"],
            strict=False,
            min_score=0,  # v4.15.0: Ne pas filtrer ici, enrichir seulement
        )
        logger.info(f"   Equities EU/US après enrichissement Buffett: {len(eq_rows)}")
    
    # v5.0.0: Scoring conditionnel (même logique que Global)
    scoring_mode = EQUITY_SCORING_CONFIG["mode"]
    
    if scoring_mode == "factors":
        logger.info(f"   [EU/US SCORING] Mode '{scoring_mode}': compute_scores()")
        eq_rows = compute_scores(eq_rows, "equity", None)
    elif scoring_mode == "blend":
        logger.info(f"   [EU/US SCORING] Mode '{scoring_mode}': compute_scores() + preset_meta")
        eq_rows = compute_scores(eq_rows, "equity", None)
    else:
        logger.info(f"   [EU/US SCORING] Mode '{scoring_mode}': compute_scores() SKIP")
    
    eq_rows = enrich_equities_with_roe_warnings(eq_rows)  # v4.15.0: Aussi pour EU/US
    eq_filtered = filter_equities(eq_rows)
    
    logger.info(f"   Pool equities EU/US après filtre: {len(eq_filtered)} (sélection PAR PROFIL)")
    
    # 5. Construire universe_others (ETF + Bonds, pas de crypto pour EU/US)
    etf_data = etf_df_master_euus.to_dict('records') if not etf_df_master_euus.empty else []
    all_funds_data = (etf_data or []) + (bonds_data or [])
    universe_others = build_scored_universe(
        stocks_data=None,
        etf_data=all_funds_data,
        crypto_data=[],
        returns_series=None,
        buffett_mode="none",
        buffett_min_score=0,
    )
    
    logger.info(f"   Universe ETF/Bonds EU/US: {len(universe_others)} actifs")

    # 6. v4.15.0 P0 FIX: Optimiser PAR PROFIL avec sélection equities différenciée
    # v5.1.4 FIX Step7: use_preset_etf=False (même raison que pipeline global)
    optimizer = PortfolioOptimizer(use_preset_etf=False)
    portfolios = {}
    all_assets = []
    all_assets_ids = set()
    equities_by_profile_euus = {}  # Pour diagnostic overlap

    # Phase1-B1: prev_weights pour contrôle turnover EU/US
    _prev_alloc_euus = _load_previous_allocation("data/portfolios_euus.json")
    all_scored_etfs = {}  # v1.1.0 FIX: was missing → NameError on line 2825
    all_scored_bonds = {}  # v8.x FIX: was missing → NameError on line 4009

    for profile in ["Agressif", "Modéré", "Stable"]:
        logger.info(f"⚙️  Optimisation EU/US {profile} (sélection PAR PROFIL)...")
        
        # v4.15.0 P0 FIX: Sélection d'équités SPÉCIFIQUE au profil
        profile_equities, selection_meta = select_equities_for_profile(
            eq_filtered=eq_filtered,
            profile=profile,
            market_context=None,  # Pas de RADAR pour EU/US actuellement
            target_n=min(CANDIDATES_BY_PROFILE.get(profile, 250), len(eq_filtered)),
        )
        
        equities_by_profile_euus[profile] = profile_equities
        logger.info(f"   [{profile}] EU/US Équités sélectionnées: {len(profile_equities)}")
        # === v5.1.0: Sélection ETF/Bonds par profil (EU/US - pas de crypto) ===
        if HAS_MODULAR_SELECTORS:
            # v5.1.3 FIX: Utilise etf_df_master_euus.copy() pour préserver types numériques
            if not etf_df_master_euus.empty:
                etf_df = etf_df_master_euus.copy()
                etf_selected_df = select_etfs_for_profile(etf_df, profile, top_n=100)
                profile_etf_data = etf_selected_df.to_dict('records') if not etf_selected_df.empty else []
                logger.info(f"   [{profile}] EU/US ETF sélectionnés: {len(profile_etf_data)}/{len(etf_df_master_euus)}")
                # v5.1.3: Post-check scoring (détecte scores FLAT)
                if "_profile_score" in etf_selected_df.columns and not etf_selected_df.empty:
                    scores = etf_selected_df["_profile_score"]
                    if scores.nunique() <= 1:
                        logger.error(f"   [{profile}] ⚠️ EU/US ETF SCORE FLAT: {scores.iloc[0] if len(scores) else 'N/A'}")
                    else:
                        logger.info(f"   [{profile}] ✅ EU/US ETF scores: [{scores.min():.1f}, {scores.max():.1f}]")
                # v5.1.2 FIX: Forcer category="etf" pour éviter reclassification dans build_raw_universe
                for etf in profile_etf_data:
                    etf["_force_category"] = "etf"
                    etf["category"] = "etf"
                # === FIX v2.1.0: Propager _profile_score → score pour ETFs (EU/US) ===
                for etf in profile_etf_data:
                    ps = etf.get("_profile_score")
                    if ps is not None:
                        etf["score"] = float(ps)
                        etf["profile_score"] = float(ps)
                        etf["composite_score"] = float(ps)
                    if not etf.get("_matched_preset"):
                        etf["_matched_preset"] = "etf_unclassified"
                _etf_propagated = sum(1 for e in profile_etf_data if e.get("score", 0) > 0)
                logger.info(
                    f"   [{profile}] FIX v2.1.0 EU/US: {_etf_propagated}/{len(profile_etf_data)} "
                    f"ETFs avec score propagé depuis _profile_score"
                )
                # === FIN FIX v2.1.0 EU/US ===
                # v1.5.3 FIX: Collect scored ETFs for audit
                for _etf in profile_etf_data:
                    _uid = _etf.get("etfsymbol") or _etf.get("ticker") or _etf.get("name") or ""
                    if _uid:
                        _existing = all_scored_etfs.get(_uid)
                        _new_s = _etf.get("_profile_score") or 0
                        _old_s = (_existing or {}).get("_profile_score") or 0
                        if _existing is None or _new_s > _old_s:
                            all_scored_etfs[_uid] = _etf.copy()
            else:
                profile_etf_data = []
            
            if bonds_data:
                bonds_df = pd.DataFrame(bonds_data)
                bonds_selected_df = select_bonds_for_profile(
                    bonds_df, profile, top_n=20, bond_strategy=bond_strategy,
                )
                profile_bonds_data = bonds_selected_df.to_dict('records') if not bonds_selected_df.empty else []
                logger.info(f"   [{profile}] EU/US Bonds sélectionnés: {len(profile_bonds_data)}/{len(bonds_data)}")
                # v5.1.2 FIX: Forcer category="bond" pour éviter reclassification
                for bond in profile_bonds_data:
                    bond["_force_category"] = "bond"
                    bond["category"] = "bond"
                # v1.5.3 FIX: Collect scored bonds for audit
                for _bond in profile_bonds_data:
                    _uid = _bond.get("isin") or _bond.get("name") or ""
                    if _uid:
                        _existing = all_scored_bonds.get(_uid)
                        _new_s = _bond.get("bond_quality_raw") or _bond.get("composite_score") or 0
                        _old_s = (_existing or {}).get("bond_quality_raw") or (_existing or {}).get("composite_score") or 0
                        if _existing is None or _new_s > _old_s:
                            all_scored_bonds[_uid] = _bond.copy()
            else:
                profile_bonds_data = []
            
            all_funds_profile = profile_etf_data + profile_bonds_data
            profile_universe_others = build_scored_universe(
                stocks_data=None,
                etf_data=all_funds_profile,
                crypto_data=[],
                returns_series=None,
                buffett_mode="none",
                buffett_min_score=0,
            )
        else:
            profile_universe_others = universe_others
        
        # Construire l'univers POUR CE PROFIL
        profile_universe = profile_equities + profile_universe_others
        scored_universe = rescore_universe_by_profile(profile_universe, profile, market_context=None)
        assets = convert_universe_to_assets(scored_universe)
        
        # === FIX v2.1.0: Restaurer scores ETF après pipeline scoring (EU/US) ===
        if profile_etf_data:
            etf_lookup = {}
            for etf in profile_etf_data:
                sym = etf.get("etfsymbol") or etf.get("ticker") or etf.get("symbol") or ""
                base = sym.upper().strip()
                if base:
                    etf_lookup[base] = etf
                isin = etf.get("isin", "")
                if isin and str(isin).strip().upper() not in ("", "NAN", "NONE"):
                    etf_lookup[str(isin).strip().upper()] = etf
            
            etf_restored_count = 0
            for asset in assets:
                cat = getattr(asset, 'category', '') or ''
                if cat.lower() not in ('etf',):
                    continue
                asset_id = str(getattr(asset, 'id', '') or '').upper().strip()
                asset_ticker = str(getattr(asset, 'ticker', '') or '').upper().strip()
                
                etf_original = etf_lookup.get(asset_id) or etf_lookup.get(asset_ticker)
                if etf_original and etf_original.get("_profile_score") is not None:
                    original_score = float(etf_original["_profile_score"])
                    if original_score > asset.score:
                        old_score = asset.score
                        asset.score = original_score
                        if asset.source_data is None:
                            asset.source_data = {}
                        asset.source_data["_profile_score"] = etf_original["_profile_score"]
                        asset.source_data["_matched_preset"] = etf_original.get("_matched_preset", "")
                        asset.source_data["_role"] = etf_original.get("_role", "")
                        etf_restored_count += 1
            
            if etf_restored_count > 0:
                logger.info(f"   [{profile}] FIX v2.1.0 EU/US: {etf_restored_count} ETF scores restaurés depuis preset_etf")
        # === FIN FIX v2.1.0 EU/US ===
        
        # Collecter tous les assets (union des 3 profils)
        for a in assets:
            a_id = getattr(a, 'id', None)
            if a_id is None:
                continue
            a_id = str(a_id)
            if a_id not in all_assets_ids:
                all_assets.append(a)
                all_assets_ids.add(a_id)
        
        # v7.2: Charger les prix pour covariance empirique (LW + EWMA + PCA)
        try:
            from portfolio_engine.price_loader import load_returns_for_assets
            assets = load_returns_for_assets(assets, cache_path="data/price_cache.json")
            _n_ret = sum(1 for a in assets if getattr(a, 'returns_series', None) is not None)
            logger.info(f"   [{profile}] EU/US Returns loaded: {_n_ret}/{len(assets)} assets")
        except Exception as _e:
            logger.warning(f"   [{profile}] EU/US Price loading failed: {_e}, using structured only")

        try:
            # Phase1-B1: prev_weights pour contrôle turnover EU/US
            _prev_std_euus = (_prev_alloc_euus.get(profile) or {}).get("standard") or None
            allocation, diagnostics = optimizer.build_portfolio_euus(
                assets, profile, prev_weights=_prev_std_euus
            )

            # Normaliser allocation en % si retournée en décimal
            total_alloc = sum(allocation.values()) if allocation else 0.0
            if 0.5 < total_alloc < 1.5:
                logger.info(f"   [{profile}] EU/US Allocation en décimal (sum={total_alloc:.2f}), conversion en %")
                allocation = {k: v * 100.0 for k, v in allocation.items()}
            
            # Post-processing unifié (prune + cap + round)
            profile_config = PROFILES_EUUS.get(profile) if PROFILES_EUUS else PROFILES.get(profile)
            if profile_config:
                allocation = post_process_allocation(allocation, profile_config, diagnostics, f"{profile} EU/US")
            
            portfolios[profile] = {
                "allocation": allocation,
                "diagnostics": diagnostics,
                "assets": assets,
            }
            # === v5.2.1 FIX: Build _tickers_meta BEFORE risk_analysis ===
            try:
                tm = build_tickers_meta_for_risk(allocation, assets)
                portfolios[profile]["_tickers_meta"] = tm
                portfolios[profile]["_tickers"] = {k: v["weight"] for k, v in tm.items()}
                
                s = sum(portfolios[profile]["_tickers"].values())
                if abs(s - 1.0) > 0.01:
                    logger.warning(f"   [{profile}] EU/US _tickers sum={s:.4f} (expected ~1.0)")
                else:
                    logger.info(f"   [{profile}] EU/US ✅ _tickers_meta built: {len(tm)} tickers")
            except Exception as e:
                logger.warning(f"   [{profile}] EU/US Cannot build _tickers_meta: {e}")
            
            vol = diagnostics.get('portfolio_vol')
            vol_str = f"{vol:.1f}%" if isinstance(vol, (int, float)) else "N/A"
            logger.info(f"   → {len(allocation)} lignes, vol={vol_str}")
            
        except ValueError as e:
            logger.error(f"❌ EU/US {profile} failed: {e}")
            portfolios[profile] = {
                "allocation": {},
                "diagnostics": {"error": str(e)},
                "assets": [],
            }
   
    # v4.15.0: Diagnostic overlap EU/US (comme Global)
    if len(equities_by_profile_euus) == 3:
        # v4.15.0 FIX: Utiliser ticker (pas id) et la bonne variable
        agg_tickers = {e.get("ticker") for e in equities_by_profile_euus.get("Agressif", []) if e.get("ticker")}
        mod_tickers = {e.get("ticker") for e in equities_by_profile_euus.get("Modéré", []) if e.get("ticker")}
        stb_tickers = {e.get("ticker") for e in equities_by_profile_euus.get("Stable", []) if e.get("ticker")}
        
        overlap_agg_mod = len(agg_tickers & mod_tickers)
        overlap_agg_stb = len(agg_tickers & stb_tickers)
        overlap_mod_stb = len(mod_tickers & stb_tickers)
        
        logger.info("="*60)
        logger.info("📊 DIAGNOSTIC OVERLAP EU/US ÉQUITIES (v4.15.0)")
        logger.info("="*60)
        logger.info(f"   Agressif: {len(agg_tickers)} équités")
        logger.info(f"   Modéré:   {len(mod_tickers)} équités")
        logger.info(f"   Stable:   {len(stb_tickers)} équités")
        logger.info(f"   Overlap Agressif ∩ Modéré: {overlap_agg_mod}")
        logger.info(f"   Overlap Agressif ∩ Stable: {overlap_agg_stb}")
        logger.info(f"   Overlap Modéré ∩ Stable:   {overlap_mod_stb}")
        
        # Alerte si overlap trop élevé
        if len(agg_tickers) > 0:
            overlap_pct = overlap_agg_stb / len(agg_tickers) * 100
            if overlap_pct > 50:
                logger.warning(f"   ⚠️ Overlap Agressif-Stable élevé: {overlap_pct:.0f}% (cible <30%)")
            else:
                logger.info(f"   ✅ Overlap Agressif-Stable OK: {overlap_pct:.0f}%")
    
    return portfolios, all_assets


def add_commentary(
    portfolios: Dict[str, Dict],
    assets: list,
    brief_data: Optional[Dict] = None
) -> Dict[str, Dict]:
    """Ajoute les commentaires et justifications."""
    logger.info("💬 Génération des commentaires...")
    
    portfolios_for_prompt = {
        profile: {
            "allocation": data["allocation"],
            "diagnostics": data["diagnostics"],
        }
        for profile, data in portfolios.items()
    }
    
    if CONFIG["use_llm"]:
        try:
            api_key = os.environ.get("API_CHAT") or os.environ.get("OPENAI_API_KEY")
            if api_key:
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                
                commentary = generate_commentary_sync(
                    portfolios=portfolios_for_prompt,
                    assets=assets,
                    brief_data=brief_data,
                    openai_client=client,
                    model=CONFIG["llm_model"],
                )
                logger.info("✅ Commentaires générés via LLM")
            else:
                logger.warning("⚠️ Pas de clé API, fallback sans LLM")
                commentary = generate_fallback_commentary(portfolios_for_prompt, assets)
        except Exception as e:
            logger.error(f"Erreur LLM: {e}, fallback sans LLM")
            commentary = generate_fallback_commentary(portfolios_for_prompt, assets)
    else:
        commentary = generate_fallback_commentary(portfolios_for_prompt, assets)
    
    disclaimer = BACKTEST_DISCLAIMER.format(days=CONFIG["backtest_days"])
    
    merged = merge_commentary_into_portfolios(portfolios_for_prompt, commentary)
   
    # === v5.2.1: Préserver risk_analysis (sinon perdu dans portfolios_for_prompt) ===
    for profile in merged:
        if profile in portfolios and portfolios[profile].get("risk_analysis"):
            merged[profile]["risk_analysis"] = portfolios[profile]["risk_analysis"]
        if profile in portfolios and portfolios[profile].get("assets"):
            merged[profile]["assets"] = portfolios[profile]["assets"]
        # v7.3: Préserver yield-driven allocation
        if profile in portfolios and portfolios[profile].get("_tickers_rendement"):
            merged[profile]["_tickers_rendement"] = portfolios[profile]["_tickers_rendement"]
        if profile in portfolios and portfolios[profile].get("_yield_metrics"):
            merged[profile]["_yield_metrics"] = portfolios[profile]["_yield_metrics"]
    for profile in merged:
        raw_comment = merged[profile].get("comment", "") or ""
        
        cleaned, report = sanitize_llm_output(
            raw_comment,
            replacement="",
            strict=True,
            log_hits=True
        )
        
        merged[profile].setdefault("_compliance_audit", {})
        merged[profile]["_compliance_audit"]["llm_sanitizer"] = report.to_dict()
        merged[profile]["_compliance_audit"]["timestamp"] = datetime.datetime.now().isoformat()
        merged[profile]["_compliance_audit"]["version"] = "v4.14.0"
        
        if report.removal_ratio > 0.5:
            logger.error(
                f"[P0-7] LLM text too unsafe for {profile}: "
                f"{report.removal_ratio:.0%} removed, using fallback"
            )
            cleaned = FALLBACK_COMPLIANCE_COMMENT
            merged[profile]["_compliance_audit"]["fallback_used"] = True
        else:
            merged[profile]["_compliance_audit"]["fallback_used"] = False
        
        if cleaned and disclaimer not in cleaned:
            cleaned = f"{cleaned}\n\n{disclaimer}"
        elif not cleaned:
            cleaned = f"{FALLBACK_COMPLIANCE_COMMENT}\n\n{disclaimer}"
        
        merged[profile]["comment"] = cleaned
        
        if report.sanitized:
            logger.info(
                f"[P0-7] {profile}: {report.removed_sentences} phrases supprimées, "
                f"{len(report.hits)} hits, ratio={report.removal_ratio:.0%}"
            )
    
    return merged


def apply_compliance(portfolios: Dict[str, Dict]) -> Dict[str, Dict]:
    """Applique la compliance AMF et sanitise le langage."""
    logger.info("🛡️  Application compliance AMF...")
    
    for profile in portfolios:
        portfolios[profile] = sanitize_portfolio_output(portfolios[profile])
        
        diag = portfolios[profile].get("diagnostics", {})
        allocation = portfolios[profile].get("allocation", {})
        
        crypto_exposure = sum(
            w for aid, w in allocation.items()
            if any(c in str(aid).upper() for c in ["CR_", "BTC", "ETH", "CRYPTO"])
        )
        
        portfolios[profile]["compliance"] = generate_compliance_block(
            profile=profile,
            vol_estimate=diag.get("portfolio_vol"),
            crypto_exposure=crypto_exposure,
        )
    
    return portfolios


# ============= BACKTEST =============

def run_backtest_all_profiles(config: Dict) -> Dict:
    """
    Exécute le backtest pour les 3 profils avec POIDS FIXES du portfolio.
    
    V4.8.7 P1-8c: Use platform_fee_annual_bp instead of ter_annual_bp
    - TER is ALREADY embedded in ETF adjusted close prices
    - platform_fee = B2C platform fees (optional)
    """
    logger.info("\n" + "="*60)
    logger.info("📈 BACKTEST - Validation historique (POIDS FIXES)")
    logger.info("="*60)
    
    api_key = os.environ.get("TWELVE_DATA_API")
    if not api_key:
        logger.warning("⚠️ TWELVE_DATA_API non définie, backtest ignoré")
        return {"error": "TWELVE_DATA_API not set", "skipped": True}
    
    try:
        from backtest import BacktestConfig, load_prices_for_backtest
        from backtest.engine import (
            run_backtest_fixed_weights,
            print_backtest_report, 
            compute_backtest_stats
        )
        from backtest.data_loader import extract_portfolio_weights
    except ImportError as e:
        logger.error(f"❌ Import backtest failed: {e}")
        return {"error": str(e), "skipped": True}
    
    yaml_config = load_yaml_config(CONFIG["config_path"])
    if not yaml_config:
        logger.warning("⚠️ Config YAML non trouvée, utilisation des défauts")
        yaml_config = {"backtest": {"test_universe": {"stocks": ["AAPL", "MSFT", "GOOGL"]}}}
    
    end_date = datetime.datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.datetime.now() - timedelta(days=CONFIG["backtest_days"] + 30)).strftime("%Y-%m-%d")
    backtest_start = (datetime.datetime.now() - timedelta(days=CONFIG["backtest_days"])).strftime("%Y-%m-%d")
    
    logger.info("📥 Chargement des poids depuis portfolios.json...")
    portfolio_weights = extract_portfolio_weights(CONFIG["output_path"])
    
    if not portfolio_weights:
        logger.error("❌ Impossible de charger les poids du portfolio")
        return {"error": "No portfolio weights found", "skipped": True}
    
    for profile, weights in portfolio_weights.items():
        logger.info(f"   {profile}: {len(weights)} actifs, total={sum(weights.values()):.1%}")
    
    logger.info(f"📥 Chargement des prix ({CONFIG['backtest_days']}j)...")
    try:
        # FIX : récupérer le resolver globalement (il est créé par
        # build_portfolios_deterministic mais cette fonction tourne dans un
        # autre scope). get_resolver retourne le singleton mis en place via
        # set_resolver(), ou le reconstruit depuis data/ si absent.
        try:
            from portfolio_engine.ticker_resolver import get_resolver as _get_resolver
            _resolver = _get_resolver()
        except Exception as _e:
            logger.warning(f"⚠️ TickerResolver indisponible ({_e}), backtest sans mic_code resolution")
            _resolver = None
        result = load_prices_for_backtest(
            yaml_config,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key,
            plan="ultra",
            resolver=_resolver,  # v1.1.0: mic_code resolution
        )
        
        if isinstance(result, tuple):
            prices, price_diagnostics = result
            logger.info(f"✅ {len(prices.columns)} symboles, {len(prices)} jours")
            bench_diag = price_diagnostics.get("benchmark_coverage", {})
            if bench_diag:
                logger.info(f"   Benchmark coverage: {bench_diag.get('loaded', 0)}/{bench_diag.get('requested', 0)}")
        else:
            prices = result
            price_diagnostics = {}
            logger.info(f"✅ {len(prices.columns)} symboles, {len(prices)} jours")
            
    except Exception as e:
        logger.error(f"❌ Échec chargement prix: {e}")
        return {"error": str(e), "skipped": True}
    
    # V4.8.7 P1-8c: Platform fee config (replaces TER deduction)
    platform_fee_annual_bp = CONFIG.get("platform_fee_annual_bp", 0.0)
    if platform_fee_annual_bp > 0:
        logger.info(f"💰 Platform fee: {platform_fee_annual_bp}bp/an ({platform_fee_annual_bp/100:.2f}%/an)")
    else:
        logger.info(f"💰 No platform fee configured (gross ≈ net except tx costs)")
    logger.info(f"ℹ️  TER is embedded in ETF prices (NOT deducted separately)")
    
    results = []
    profiles = ["Agressif", "Modéré", "Stable"]
    
    for profile in profiles:
        logger.info(f"\n⚙️  Backtest {profile} (poids fixes)...")
        
        fixed_weights = portfolio_weights.get(profile, {})
        
        if not fixed_weights:
            logger.warning(f"⚠️ Pas de poids pour {profile}, skip")
            results.append({
                "profile": profile,
                "success": False,
                "error": "No weights found",
            })
            continue
        
# V4.8.7 P1-8c: Use platform_fee_annual_bp instead of ter_annual_bp
        backtest_config = BacktestConfig(
            profile=profile,
            start_date=backtest_start,
            end_date=end_date,
            rebalance_freq=CONFIG["backtest_freq"],
            transaction_cost_bp=yaml_config.get("backtest", {}).get("transaction_cost_bp", 10),
            platform_fee_annual_bp=platform_fee_annual_bp,  # V4.8.7: NEW - replaces ter_annual_bp
            turnover_penalty=0,
        )
        
        try:
            result = run_backtest_fixed_weights(
                prices=prices,
                fixed_weights=fixed_weights,
                config=backtest_config,
            )
            print_backtest_report(result)
            
            results.append({
                "profile": profile,
                "success": True,
                "stats": result.stats,
                "equity_curve": {
                    str(k.date()): round(v, 2)
                    for k, v in result.equity_curve.items()
                },
            })
        except Exception as e:
            logger.error(f"❌ Backtest {profile} failed: {e}")
            import traceback
            traceback.print_exc()
            results.append({
                "profile": profile,
                "success": False,
                "error": str(e),
            })
    
    print_comparison_table(results)
    
    # ============= V4.9.1: GÉNÉRER FICHIER DEBUG =============
    if DEBUG_GENERATOR_AVAILABLE:
        try:
            debug_output_path = "data/backtest_debug.json"
            
            debug_data = generate_backtest_debug(
                prices=prices,
                portfolio_weights=portfolio_weights,
                backtest_results={
                    "timestamp": datetime.datetime.now().isoformat(),
                    "period_days": CONFIG["backtest_days"],
                    "results": results,
                },
                output_path=debug_output_path,
                n_sample_days=5,
            )
            
            print_debug_summary(debug_data)
            logger.info(f"✅ Fichier debug généré: {debug_output_path}")
            
        except Exception as e:
            logger.warning(f"⚠️ Impossible de générer le fichier debug: {e}")
            import traceback
            traceback.print_exc()
    
    return {
        "timestamp": datetime.datetime.now().isoformat(),
        "period_days": CONFIG["backtest_days"],
        "frequency": CONFIG["backtest_freq"],
        "platform_fee_annual_bp": platform_fee_annual_bp,  # V4.8.7
        "ter_handling": "embedded_in_etf_prices",  # V4.8.7: Explicit
        "symbols_count": len(prices.columns),
        "backtest_mode": "fixed_weights",
        "price_diagnostics": price_diagnostics,
        "debug_file": "data/backtest_debug.json" if DEBUG_GENERATOR_AVAILABLE else None,  # V4.9.1
        "results": results,
        "comparison": {
            r["profile"]: r.get("stats", {})
            for r in results if r.get("success")
        }
    }


def run_backtest_euus_profiles(config: Dict) -> Dict:
    """
    Exécute le backtest pour les portefeuilles EU/US Focus.
    """
    logger.info("\n" + "="*60)
    logger.info("📈 BACKTEST EU/US - Validation historique (POIDS FIXES)")
    logger.info("="*60)
    
    euus_path = CONFIG.get("euus_output_path", "data/portfolios_euus.json")
    if not Path(euus_path).exists():
        logger.warning(f"⚠️ {euus_path} non trouvé, backtest EU/US ignoré")
        return {"error": "EU/US portfolio file not found", "skipped": True}
    
    api_key = os.environ.get("TWELVE_DATA_API")
    if not api_key:
        logger.warning("⚠️ TWELVE_DATA_API non définie, backtest EU/US ignoré")
        return {"error": "TWELVE_DATA_API not set", "skipped": True}
    
    try:
        from backtest import BacktestConfig, load_prices_for_backtest
        from backtest.engine import run_backtest_fixed_weights, print_backtest_report
        from backtest.data_loader import extract_portfolio_weights
    except ImportError as e:
        logger.error(f"❌ Import backtest failed: {e}")
        return {"error": str(e), "skipped": True}
    
    yaml_config = load_yaml_config(CONFIG["config_path"])
    if not yaml_config:
        yaml_config = {"backtest": {"test_universe": {"stocks": ["AAPL", "MSFT", "GOOGL"]}}}
    
    end_date = datetime.datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.datetime.now() - timedelta(days=CONFIG["backtest_days"] + 30)).strftime("%Y-%m-%d")
    backtest_start = (datetime.datetime.now() - timedelta(days=CONFIG["backtest_days"])).strftime("%Y-%m-%d")
    
    logger.info(f"📥 Chargement des poids EU/US depuis {euus_path}...")
    portfolio_weights = extract_portfolio_weights(euus_path)
    
    if not portfolio_weights:
        logger.error("❌ Impossible de charger les poids EU/US")
        return {"error": "No EU/US portfolio weights found", "skipped": True}
    
    for profile, weights in portfolio_weights.items():
        logger.info(f"   EU/US {profile}: {len(weights)} actifs, total={sum(weights.values()):.1%}")
    
    logger.info(f"📥 Chargement des prix ({CONFIG['backtest_days']}j)...")
    try:
        # FIX : récupérer le resolver via le singleton global (cf. run_backtest_all_profiles)
        try:
            from portfolio_engine.ticker_resolver import get_resolver as _get_resolver
            _resolver = _get_resolver()
        except Exception as _e:
            logger.warning(f"⚠️ TickerResolver indisponible ({_e}), backtest EU/US sans mic_code resolution")
            _resolver = None
        result = load_prices_for_backtest(
            yaml_config,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key,
            plan="ultra",
            portfolios_path=euus_path,
            resolver=_resolver,  # v1.1.0: mic_code resolution
        )
        
        if isinstance(result, tuple):
            prices, price_diagnostics = result
        else:
            prices = result
            price_diagnostics = {}
        logger.info(f"✅ {len(prices.columns)} symboles, {len(prices)} jours")
    except Exception as e:
        logger.error(f"❌ Échec chargement prix: {e}")
        return {"error": str(e), "skipped": True}
    
    platform_fee_annual_bp = CONFIG.get("platform_fee_annual_bp", 0.0)
    results = []
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        logger.info(f"\n⚙️  Backtest EU/US {profile}...")
        
        fixed_weights = portfolio_weights.get(profile, {})
        if not fixed_weights:
            results.append({"profile": profile, "success": False, "error": "No weights"})
            continue
        
        backtest_config = BacktestConfig(
            profile=profile,
            start_date=backtest_start,
            end_date=end_date,
            rebalance_freq=CONFIG["backtest_freq"],
            transaction_cost_bp=yaml_config.get("backtest", {}).get("transaction_cost_bp", 10),
            platform_fee_annual_bp=platform_fee_annual_bp,
            turnover_penalty=0,
        )
        
        try:
            result = run_backtest_fixed_weights(
                prices=prices,
                fixed_weights=fixed_weights,
                config=backtest_config,
            )
            print_backtest_report(result)
            
            results.append({
                "profile": profile,
                "success": True,
                "stats": result.stats,
                "equity_curve": {
                    str(k.date()): round(v, 2)
                    for k, v in result.equity_curve.items()
                },
            })
        except Exception as e:
            logger.error(f"❌ Backtest EU/US {profile} failed: {e}")
            results.append({"profile": profile, "success": False, "error": str(e)})
    
    return {
        "timestamp": datetime.datetime.now().isoformat(),
        "period_days": CONFIG["backtest_days"],
        "mode": "EU/US Focus",
        "results": results,
        "comparison": {
            r["profile"]: r.get("stats", {})
            for r in results if r.get("success")
        }
    }


def print_comparison_table(results: List[dict]):
    """
    Affiche un tableau comparatif des 3 profils.
    
    V4.8.7 P1-8c: Updated to show platform_fees instead of TER costs.
    """
    print("\n" + "="*80)
    print("📊 COMPARAISON DES 3 PROFILS (POIDS FIXES)")
    print("="*80)
    
    print(f"\n{'Métrique':<25} | {'Agressif':>15} | {'Modéré':>15} | {'Stable':>15}")
    print("-"*80)
    
    metrics = [
        ("Gross Return", "gross_return_pct", "%"),
        ("Net Return", "net_return_pct", "%"),
        ("Cost Drag", "cost_drag_pct", "%"),
        ("CAGR", "cagr_pct", "%"),
        ("Volatility", "volatility_pct", "%"),
        ("Sharpe Ratio", "sharpe_ratio", ""),
        ("Max Drawdown", "max_drawdown_pct", "%"),
        ("Win Rate", "win_rate_pct", "%"),
        ("Weight Coverage", "weight_coverage_pct", "%"),
        ("Benchmark Return", "benchmark_return_pct", "%"),
        ("Excess Return", "excess_return_pct", "%"),
    ]
    
    by_profile = {r["profile"]: r.get("stats", {}) for r in results if r.get("success")}
    
    for label, key, suffix in metrics:
        agg = by_profile.get("Agressif", {}).get(key, "N/A")
        mod = by_profile.get("Modéré", {}).get(key, "N/A")
        stb = by_profile.get("Stable", {}).get(key, "N/A")
        
        def format_val(val, suffix):
            if val is None:
                return "N/A"
            if isinstance(val, (int, float)):
                return f"{val}{suffix}"
            return str(val)
        
        agg_str = format_val(agg, suffix)
        mod_str = format_val(mod, suffix)
        stb_str = format_val(stb, suffix)
        
        print(f"{label:<25} | {agg_str:>15} | {mod_str:>15} | {stb_str:>15}")
    
    # V4.8.7 P1-8c: Cost breakdown section (updated for platform fees)
    print("-"*80)
    print("💰 DÉTAIL DES COÛTS:")
    print("   Note: TER is embedded in ETF prices (not deducted separately)")
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        stats = by_profile.get(profile, {})
        cost_breakdown = stats.get("cost_breakdown", {})
        
        if cost_breakdown:
            tx_pct = cost_breakdown.get("transaction_costs_pct", 0)
            platform_pct = cost_breakdown.get("platform_fees_pct", 0)
            platform_bp = cost_breakdown.get("platform_fee_annual_bp", 0)
            total = cost_breakdown.get("total", 0)
            
            # V4.8.7: Show TER info if available
            ter_info = cost_breakdown.get("ter_info", {})
            weighted_ter = ter_info.get("weighted_avg_ter_bp")
            
            cost_line = f"   {profile}: Tx={tx_pct:.3f}%"
            if platform_bp > 0:
                cost_line += f" + Platform={platform_pct:.3f}% [{platform_bp}bp/an]"
            cost_line += f" = {tx_pct+platform_pct:.3f}% total ({total:.2f}€)"
            print(cost_line)
            
            if weighted_ter:
                print(f"      (TER info: ~{weighted_ter}bp/an - already in ETF prices)")
    
    print("="*80)
    
    # Verdict
    print("\n🏆 VERDICT:")
    
    sharpes = [
        (r["profile"], r["stats"].get("sharpe_ratio")) 
        for r in results 
        if r.get("success") and r["stats"].get("sharpe_ratio") is not None
    ]
    if sharpes:
        best = max(sharpes, key=lambda x: x[1])
        print(f"   Meilleur Sharpe: {best[0]} ({best[1]:.2f})")
    else:
        print(f"   Meilleur Sharpe: Non calculable (période < 1 an)")
    
    returns = [
        (r["profile"], r["stats"].get("net_return_pct") or r["stats"].get("total_return_pct")) 
        for r in results 
        if r.get("success") and (r["stats"].get("net_return_pct") is not None or r["stats"].get("total_return_pct") is not None)
    ]
    if returns:
        best = max(returns, key=lambda x: x[1])
        print(f"   Meilleur Return (NET): {best[0]} ({best[1]:.2f}%)")
    
    dds = [
        (r["profile"], r["stats"].get("max_drawdown_pct")) 
        for r in results 
        if r.get("success") and r["stats"].get("max_drawdown_pct") is not None
    ]
    if dds:
        best = max(dds, key=lambda x: x[1])
        print(f"   Meilleur Drawdown: {best[0]} ({best[1]:.2f}%)")
    
    print("\n📋 VALIDATION ORDRE DES RETURNS:")
    if returns:
        sorted_returns = sorted(returns, key=lambda x: x[1], reverse=True)
        expected_order = ["Agressif", "Modéré", "Stable"]
        actual_order = [r[0] for r in sorted_returns]
        
        if actual_order == expected_order:
            print("   ✅ Ordre correct: Agressif > Modéré > Stable")
        else:
            print(f"   ⚠️ Ordre inattendu: {' > '.join(actual_order)}")
            print(f"      Attendu: {' > '.join(expected_order)}")
    else:
        print("   ⚠️ Pas de données de return disponibles")
    
    print(f"\n⚠️  RAPPEL: {BACKTEST_DISCLAIMER.format(days=CONFIG['backtest_days'])}")
    print()


# ============= HELPER FUNCTIONS =============

INTERNAL_ID_PATTERN = re.compile(r'^(EQ_|ETF_|BOND_|CRYPTO_|CR_)\d+$', re.IGNORECASE)


def _is_internal_id(value: str) -> bool:
    """Vérifie si une valeur est un ID interne."""
    if not value or not isinstance(value, str):
        return False
    return bool(INTERNAL_ID_PATTERN.match(value))


def _normalize_ticker_value(raw) -> Optional[str]:
    """Normalise une valeur de ticker."""
    if raw is None:
        return None
    
    if isinstance(raw, float):
        if math.isnan(raw):
            return None
        return str(int(raw)) if raw == int(raw) else str(raw)
    
    if isinstance(raw, int):
        return str(raw)
    
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return None
        if s.lower() == "nan":
            return None
        return s
    
    s = str(raw).strip()
    return s if s and s.lower() != "nan" else None


def _normalize_key(x) -> Optional[str]:
    """
    v4.14.0 FIX R10-1: Normalise une clé pour lookup uniforme (upper + strip).
    Garantit que BRK.B, brk.b, Brk.B matchent tous.
    """
    if x is None:
        return None
    s = str(x).strip().upper()
    return s if s and s.lower() != "nan" else None
# =============================================================================
# v4.15.0 P1: VALIDATION TICKER TRADABLE
# =============================================================================

TRADABLE_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-/:]{0,24}$")

def is_tradable_candidate(x: str) -> bool:
    """
    v4.15.0 P1: Vérifie si une clé ressemble à un ticker tradable.
    
    Autorise: AAPL, BRK.B, AIR.PA, FR0000120578 (ISIN), etc.
    Rejette: "Apple Inc", "Vanguard Total Stock", strings avec espaces
    
    Args:
        x: Candidat ticker
    
    Returns:
        True si probablement tradable, False sinon
    """
    if not x:
        return False
    s = str(x).strip().upper()
    if len(s) > 25:
        return False
    # Rejeter si contient des espaces (nom d'entreprise)
    if " " in s:
        return False
    return bool(TRADABLE_RE.match(s))   


def _safe_get_attr(obj, key, default=None):
    """Récupère un attribut d'un objet ou d'un dict de manière sûre."""
    val = None
    
    if hasattr(obj, key):
        val = getattr(obj, key)
        if val is not None:
            return val
    
    if hasattr(obj, 'source_data') and obj.source_data:
        val = obj.source_data.get(key)
        if val is not None:
            return val
    
    if isinstance(obj, dict):
        val = obj.get(key)
        if val is not None:
            return val
    
    return default


def _extract_ticker_from_asset(asset, fallback_id: str) -> str:
    """Extrait le ticker d'un actif de manière robuste."""
    ticker = None
    
    if hasattr(asset, 'ticker'):
        ticker = _normalize_ticker_value(getattr(asset, 'ticker'))
    
    if not ticker and hasattr(asset, 'source_data') and asset.source_data:
        ticker = _normalize_ticker_value(asset.source_data.get('ticker'))
        if not ticker:
            ticker = _normalize_ticker_value(asset.source_data.get('symbol'))
    
    if not ticker and isinstance(asset, dict):
        ticker = _normalize_ticker_value(asset.get('ticker')) or _normalize_ticker_value(asset.get('symbol'))
    
    if ticker and _is_internal_id(ticker):
        ticker = None
    
    if not ticker:
        name = _safe_get_attr(asset, 'name')
        name = _normalize_ticker_value(name)
        if name and not _is_internal_id(name):
            if len(name) <= 5 and name.isupper():
                ticker = name
    
    if not ticker:
        fid = _normalize_ticker_value(fallback_id)
        if fid and not _is_internal_id(fid):
            ticker = fid
        else:
            name = _safe_get_attr(asset, 'name')
            ticker = _normalize_ticker_value(name) or fid or "UNKNOWN"
    
    return ticker


def _extract_symbol_from_asset(asset) -> Optional[str]:
    """Extrait le SYMBOL (vrai ticker marché) d'un actif."""
    symbol = None
    
    if hasattr(asset, 'source_data') and asset.source_data:
        symbol = _normalize_ticker_value(asset.source_data.get('symbol'))
    
    if not symbol and hasattr(asset, 'symbol'):
        symbol = _normalize_ticker_value(getattr(asset, 'symbol'))
    
    if not symbol and isinstance(asset, dict):
        symbol = _normalize_ticker_value(asset.get('symbol'))
    
    if symbol and _is_internal_id(symbol):
        symbol = None
    
    return symbol


# ============= v4.8.2 P0-3: BUILD LIMITATIONS =============

def build_limitations(
    profile: str,
    diagnostics: Dict,
    constraint_report: Optional[Dict],
    feasibility: Optional[Dict],
) -> List[str]:
    """Construit la liste des limitations/compromis pour un profil."""
    limitations = []
    
    opt_mode = diagnostics.get("optimization_mode", "slsqp")
    if opt_mode.startswith("fallback"):
        limitations.append(
            f"Allocation heuristique ({opt_mode}): les contraintes du profil {profile} "
            "sont incompatibles avec l'optimisation Markowitz classique."
        )
    
    vol_realized = diagnostics.get("portfolio_vol")
    vol_target = diagnostics.get("vol_target")
    if vol_realized and vol_target:
        vol_diff = abs(vol_realized - vol_target)
        if vol_diff > 3:
            limitations.append(
                f"Volatilité réalisée ({vol_realized:.1f}%) éloignée de la cible "
                f"({vol_target:.1f}%) - écart de {vol_diff:.1f}%."
            )
    
    # v4.14.0 FIX R10-3: Utiliser hard_constraints du report classifié si disponible
    if constraint_report:
        # Priorité 1: Utiliser hard_constraints directement (report classifié)
        if "hard_constraints" in constraint_report:
            for v in constraint_report["hard_constraints"]:
                name = v.get("name", "unknown")
                details = v.get("details", {})
                expected = details.get("expected", "?") if isinstance(details, dict) else "?"
                actual = details.get("actual", 0) if isinstance(details, dict) else 0
                try:
                    actual_str = f"{float(actual):.1f}%"
                except:
                    actual_str = str(actual)
                limitations.append(
                    f"Contrainte HARD '{name}' violée: attendu {expected}, obtenu {actual_str}."
                )
        else:
            # Fallback: original_report.violations avec priority == "hard"
            raw = constraint_report.get("original_report", constraint_report)
            violations = raw.get("violations", [])
            
            hard_violations = [v for v in violations if isinstance(v, dict) and v.get("priority") == "hard"]
            for v in hard_violations:
                limitations.append(
                    f"Contrainte '{v.get('name', 'unknown')}' violée: attendu {v.get('expected', '?')}, "
                    f"obtenu {v.get('actual', 0):.1f}%."
                )
        
        # Relaxed constraints
        raw = constraint_report.get("original_report", constraint_report)
        relaxed = raw.get("relaxed_constraints", [])
        if relaxed:
            limitations.append(
                f"Contraintes relâchées pour ce profil: {', '.join(relaxed)}."
            )
        
        # Warnings
        warnings = raw.get("warnings", [])
        if warnings:
            for w in warnings:
                limitations.append(f"Avertissement: {w}")
    
    if feasibility and not feasibility.get("feasible", True):
        reason = feasibility.get("reason", "Raison inconnue")
        limitations.append(f"Faisabilité limitée: {reason}")
    
    if not CONFIG.get("use_tactical_context", False):
        limitations.append(
            "Tilts tactiques désactivés (P0-8): les surpondérations sectorielles/régionales "
            "basées sur le contexte marché ne sont pas appliquées."
        )
    
    if diagnostics.get("cov_matrix_fallback"):
        limitations.append(
            "Matrice de corrélation estimée (fallback): pas de données historiques "
            "disponibles pour tous les actifs."
        )
    
    return limitations


# ============= NORMALISATION POUR LE FRONT =============

def normalize_to_frontend_v1(portfolios: Dict[str, Dict], assets: list) -> Dict:
    """Convertit le format interne vers le format v1 attendu par le front."""
    asset_lookup = {}
    ticker_debug = []
    bond_symbol_debug = []
    
    for a in assets:
        aid = _safe_get_attr(a, 'id')
        name = _safe_get_attr(a, 'name') or aid
        category = _safe_get_attr(a, 'category') or 'ETF'
        
        ticker = _extract_ticker_from_asset(a, aid)
        symbol = _extract_symbol_from_asset(a)
        
        isin = None
        if hasattr(a, 'source_data') and a.source_data:
            isin = _normalize_ticker_value(a.source_data.get('isin'))
        
        asset_lookup[str(aid)] = {
            "name": name, 
            "category": category, 
            "ticker": ticker,
            "symbol": symbol,
            "isin": isin,
            "id": aid,
            # v5.4.0: industry for thematic classification (allocation_rules_engine)
            "industry": (a.source_data.get("industry", "") if hasattr(a, 'source_data') and a.source_data else ""),
            # v5.4.1: beta for beta filter actions
            "beta": (a.source_data.get("beta") or a.source_data.get("beta_capm") if hasattr(a, 'source_data') and a.source_data else None),
        }
        
        if len(ticker_debug) < 5:
            ticker_debug.append(f"{aid} -> ticker={ticker}, symbol={symbol}")
        
        if category and ('bond' in category.lower() or 'oblig' in category.lower()):
            if len(bond_symbol_debug) < 10:
                bond_symbol_debug.append(f"{name[:30]} -> symbol={symbol}, ticker={ticker}")
    
    logger.info(f"🔍 Sample ticker mapping: {ticker_debug}")
    if bond_symbol_debug:
        logger.info(f"🔍 V4.6 Bond symbols: {bond_symbol_debug[:5]}")
    # v4.13.2 FIX: Enrichir asset_lookup avec les vrais noms depuis source_data
    for a in assets:
        aid = str(_safe_get_attr(a, 'id'))
        if aid in asset_lookup:
            current_name = asset_lookup[aid].get("name", "")
            # Si le nom actuel est un ID interne, chercher le vrai nom
            if current_name.startswith(("EQ_", "ETF_", "BOND_", "CR_")):
                # Essayer source_data
                if hasattr(a, 'source_data') and a.source_data:
                    real_name = a.source_data.get('name')
                    if real_name and not str(real_name).startswith(("EQ_", "ETF_", "BOND_", "CR_")):
                        asset_lookup[aid]["name"] = real_name    
    
    def _category_v1(cat: str) -> str:
        cat = (cat or "").lower()
        if "action" in cat or "equity" in cat or "stock" in cat:
            return "Actions"
        if "oblig" in cat or "bond" in cat:
            return "Obligations"
        if "crypto" in cat:
            return "Crypto"
        return "ETF"
    
    result = {}
    
    for profile, data in portfolios.items():
        allocation = data.get("allocation", {})
        comment = data.get("comment", "")
        diagnostics = data.get("diagnostics", {})
        
        result[profile] = {
            "Commentaire": comment,
            "Actions": {},
            "ETF": {},
            "Obligations": {},
            "Crypto": {},
            "_tickers": {},
            "_tickers_meta": {},  # v5.2.0: category pour stress test
        }
        
        optimization_mode = diagnostics.get("optimization_mode", "slsqp")
        result[profile]["_optimization"] = {
            "mode": optimization_mode,
            "is_heuristic": optimization_mode.startswith("fallback"),
            "vol_realized": diagnostics.get("portfolio_vol"),
            "vol_target": diagnostics.get("vol_target"),
            # Phase Sélection-1 (#3) : exposer fiabilité cov pour traçabilité
            "covariance_trustworthy": diagnostics.get("covariance_trustworthy"),
            "returns_coverage_pct": diagnostics.get("returns_coverage_pct"),
            "covariance_empirical_weight": diagnostics.get("covariance_empirical_weight"),
        }
        
        # PR3: Enrichir pour les profils heuristiques (Stable)
        if optimization_mode.startswith("fallback"):
            result[profile]["_optimization"]["disclaimer"] = (
                "Ce portefeuille utilise une allocation heuristique (règles prédéfinies) "
                "et non une optimisation mathématique Markowitz. Les contraintes du profil "
                f"({profile}) sont incompatibles avec l'optimisation classique. "
                "Cette approche privilégie la robustesse à l'optimalité théorique."
            )
            
            # PR3: Ajouter les métadonnées heuristiques depuis diagnostics
            if diagnostics.get("heuristic_name"):
                result[profile]["_optimization"]["heuristic_name"] = diagnostics["heuristic_name"]
                result[profile]["_optimization"]["heuristic_version"] = diagnostics.get("heuristic_version")
                result[profile]["_optimization"]["rules_applied"] = diagnostics.get("rules_applied", [])
                result[profile]["_optimization"]["rules_parameters"] = diagnostics.get("rules_parameters", {})
                result[profile]["_optimization"]["why_not_slsqp"] = diagnostics.get("why_not_slsqp")
                result[profile]["_optimization"]["why_not_slsqp_details"] = diagnostics.get("why_not_slsqp_details")
        
        ticker_collisions = {}
        name_collisions = {}
        
        readable_weights = {
            "Actions": {},
            "ETF": {},
            "Obligations": {},
            "Crypto": {},
        }
        
        bond_name_counter = {}
        bond_symbols_used = []
        assets_metadata_for_check = {}
        
        for asset_id, weight in allocation.items():
            asset_id_str = str(asset_id)
            # v4.13.2 FIX: Fallback intelligent - EQ_ = Actions, pas ETF
            default_cat = "equity" if asset_id_str.upper().startswith("EQ_") else "ETF"
            info = asset_lookup.get(asset_id_str, {
                "name": asset_id_str, 
                "category": default_cat, 
                "ticker": asset_id_str, 
                "symbol": None,
                "isin": None, 
                "id": asset_id_str
            })
            
            name = info["name"]
            ticker = info["ticker"]
            symbol = info.get("symbol")
            isin = info.get("isin")
            original_id = info.get("id", asset_id_str)
            cat_v1 = _category_v1(info["category"])
            
            assets_metadata_for_check[asset_id_str] = {
                "category": cat_v1,
                "name": name,
                "ticker": ticker,
            }
            
            if cat_v1 == "Obligations":
                if name in bond_name_counter:
                    bond_name_counter[name] += 1
                    idx = bond_name_counter[name]
                    display_name = f"{name} #{idx}"
                else:
                    bond_name_counter[name] = 1
                    display_name = name
                
                readable_weights[cat_v1][display_name] = weight
                
                if symbol and not _is_internal_id(symbol):
                    pricing_ticker = symbol
                elif isin:
                    pricing_ticker = isin
                elif ticker and not _is_internal_id(ticker):
                    pricing_ticker = ticker
                else:
                    pricing_ticker = name
                
                # v4.14.0 FIX R11-1: Normaliser pour éviter doublons (BRK.B vs brk.b)
                pricing_ticker = _normalize_key(pricing_ticker) or pricing_ticker
                
                tickers_dict = result[profile]["_tickers"]
                prev_weight = tickers_dict.get(pricing_ticker, 0.0)
                # v4.14.0 FIX R9: Garder full precision, arrondir uniquement au rendu
                new_weight = prev_weight + weight / 100.0
                tickers_dict[pricing_ticker] = new_weight
               
                # v5.2.0: Alimenter _tickers_meta pour stress test (catégorie garantie)
                meta = result[profile]["_tickers_meta"].setdefault(pricing_ticker, {
                    "weight": 0.0,
                    "category": cat_v1,     # "Obligations"
                    "name": name,
                    "asset_ids": [],
                })
                meta["weight"] += weight / 100.0
                if str(original_id) not in meta["asset_ids"]:
                    meta["asset_ids"].append(str(original_id))
                
                bond_symbols_used.append(f"{pricing_ticker}={weight}%")
                
                logger.debug(f"V4.6 BOND: {asset_id_str} → display={display_name}, pricing_ticker={pricing_ticker}, weight={weight}%")
            
            else:
                prev_readable = readable_weights[cat_v1].get(name, 0.0)
                readable_weights[cat_v1][name] = prev_readable + weight
                
                if prev_readable > 0:
                    if name not in name_collisions:
                        name_collisions[name] = prev_readable
                    name_collisions[name] = readable_weights[cat_v1][name]
                
                if symbol and not _is_internal_id(symbol):
                    ticker_key = symbol
                elif ticker and not _is_internal_id(ticker):
                    ticker_key = ticker
                else:
                    ticker_key = name
                ticker_key = _normalize_ticker_value(ticker_key) or name
                # v4.14.0 FIX R11-1: Normaliser pour éviter doublons (BRK.B vs brk.b)
                ticker_key = _normalize_key(ticker_key) or ticker_key
                
                tickers_dict = result[profile]["_tickers"]
                prev_weight = tickers_dict.get(ticker_key, 0.0)
                # v4.14.0 FIX R9: Garder full precision, arrondir uniquement au rendu
                new_weight = prev_weight + weight / 100.0
                tickers_dict[ticker_key] = new_weight

                # v5.2.0: Alimenter _tickers_meta pour stress test (catégorie garantie)
                meta = result[profile]["_tickers_meta"].setdefault(ticker_key, {
                    "weight": 0.0,
                    "category": cat_v1,     # "Actions"/"ETF"/"Crypto"
                    "name": name,
                    "asset_ids": [],
                    # v5.4.0: industry for allocation_rules_engine thematic classification
                    "industry": info.get("industry", ""),
                    # v5.4.1: beta for beta filter actions
                    "beta": info.get("beta"),
                })
                meta["weight"] += weight / 100.0
                if str(original_id) not in meta["asset_ids"]:
                    meta["asset_ids"].append(str(original_id))
                   
                if prev_weight > 0:
                    if ticker_key not in ticker_collisions:
                        ticker_collisions[ticker_key] = prev_weight
                    ticker_collisions[ticker_key] = new_weight
        
        for cat_v1, weights_dict in readable_weights.items():
            if not weights_dict:
                continue
            
            for name, weight in weights_dict.items():
                result[profile][cat_v1][name] = format_weight_as_percent(weight, decimals=1)
        
        # Note: Le bloc ci-dessus est écrasé par rebuild_display_sections_from_tickers
        # qui reconstruit les sections depuis _tickers (source unique)
        # === v4.15.0 P1: Séparer tickers tradables vs non-tradables ===
        tickers_raw = result[profile]["_tickers"]
        tickers_pricing = {}
        unpriced_assets = []
        
        for ticker_key, weight in tickers_raw.items():
            if is_tradable_candidate(ticker_key):
                tickers_pricing[ticker_key] = weight
            else:
                unpriced_assets.append({
                    "candidate": ticker_key,
                    "weight_pct": round(weight * 100, 2),
                    "reason": "not_tradable_format"
                })
        
        result[profile]["_tickers_pricing"] = tickers_pricing
        result[profile]["_unpriced_assets"] = unpriced_assets
        result[profile]["_pricing_coverage_pct"] = round(sum(tickers_pricing.values()) * 100, 2)
        
        if unpriced_assets:
            logger.warning(f"   [{profile}] {len(unpriced_assets)} ticker(s) non tradable(s), coverage={result[profile]['_pricing_coverage_pct']:.1f}%")
        # === v4.14.0 FIX 2: Reconstruire sections DEPUIS _tickers (source unique) ===
        # v4.14.0 FIX R10-1: Normaliser toutes les clés (upper + strip) pour lookup uniforme
        # v4.14.0 FIX R13-3: Ne PAS inclure name comme clé (risque collisions)
        ticker_to_asset_info = {}
        for asset_id_str, info in asset_lookup.items():
            # Ajouter seulement symbol/ticker/isin (PAS name - risque collisions)
            for key in [info.get("symbol"), info.get("ticker"), info.get("isin")]:
                if key:
                    key_norm = _normalize_key(key)
                    if key_norm and not _is_internal_id(key_norm):
                        ticker_to_asset_info[key_norm] = info
                    # Aussi garder version originale pour fallback
                    if not _is_internal_id(str(key)):
                        ticker_to_asset_info[key] = info
        
        # v5.2.0-C: Belt-and-suspenders dust cleanup on _tickers before display rebuild
        _tickers_raw = result[profile].get("_tickers", {})
        _dust_tickers = {k: v for k, v in _tickers_raw.items() if 0 < v * 100 < 2.0}
        if _dust_tickers:
            _dust_sum = sum(_dust_tickers.values())
            _keep_sum = sum(v for k, v in _tickers_raw.items() if k not in _dust_tickers and v > 0)
            for k in _dust_tickers:
                logger.info(f"   [{profile}] 🧹 Display dust cleanup: {k} {_dust_tickers[k]*100:.1f}%")
                del _tickers_raw[k]
            if _keep_sum > 0:
                for k in _tickers_raw:
                    if _tickers_raw[k] > 0:
                        _tickers_raw[k] += _dust_sum * (_tickers_raw[k] / _keep_sum)
            
            # v5.3.1 FIX: Re-cap max single position after L2 dust redistribution
            # Without this, positions capped by AGG cap get reinflated above 15%
            _MAX_SINGLE_L2 = 0.15  # 15% in decimal
            for _l2_iter in range(5):
                _l2_over = {k: v for k, v in _tickers_raw.items() if v > _MAX_SINGLE_L2 + 0.001}
                if not _l2_over:
                    break
                _l2_excess = 0.0
                for k, v in _l2_over.items():
                    _l2_excess += v - _MAX_SINGLE_L2
                    logger.info(f"   [{profile}] 🔒 L2 max_single re-cap: {k} {v*100:.1f}%→{_MAX_SINGLE_L2*100:.1f}%")
                    _tickers_raw[k] = _MAX_SINGLE_L2
                _l2_eligible = sum(v for k, v in _tickers_raw.items() if k not in _l2_over and v > 0)
                if _l2_eligible > 0 and _l2_excess > 0:
                    for k in _tickers_raw:
                        if k not in _l2_over and _tickers_raw[k] > 0:
                            _tickers_raw[k] += _l2_excess * (_tickers_raw[k] / _l2_eligible)
            
            result[profile]["_tickers"] = _tickers_raw
        
        # Rebuild sections depuis _tickers pour garantir cohérence
        # v4.14.0 FIX R6: Retourne aussi les poids numériques
        rebuilt_sections, rebuilt_numeric = rebuild_display_sections_from_tickers(
            tickers_dict=result[profile]["_tickers"],
            asset_map=ticker_to_asset_info,
        )
        
        # v4.14.0 FIX R6: Appliquer round_weights_to_100 avec 1 décimale (pas 0)
        # Cela évite les problèmes de précision et les faux warnings
        if rebuilt_numeric:
            rounded_rebuilt = round_weights_to_100(rebuilt_numeric, decimals=1)
            
            # === v5.3.1 SAFETY NET: Hard cap max single position at 15% ===
            # This is the LAST checkpoint before JSON display is written.
            # Catches any reinflation from upstream redistribution steps.
            _FINAL_MAX_SINGLE = 15.0
            for _fn_iter in range(5):
                _fn_over = {k: v for k, v in rounded_rebuilt.items() if v > _FINAL_MAX_SINGLE + 0.05}
                if not _fn_over:
                    break
                _fn_excess = 0.0
                _fn_keys = set(_fn_over.keys())
                for k, v in _fn_over.items():
                    _fn_excess += v - _FINAL_MAX_SINGLE
                    logger.info(f"   [{profile}] 🛡️ SAFETY NET: {k} {v:.1f}%→{_FINAL_MAX_SINGLE:.1f}%")
                    rounded_rebuilt[k] = _FINAL_MAX_SINGLE
                _fn_eligible = sum(v for k, v in rounded_rebuilt.items() if k not in _fn_keys and v > 0)
                if _fn_eligible > 0 and _fn_excess > 0:
                    for k in rounded_rebuilt:
                        if k not in _fn_keys and rounded_rebuilt[k] > 0:
                            rounded_rebuilt[k] += _fn_excess * (rounded_rebuilt[k] / _fn_eligible)
                rounded_rebuilt = round_weights_to_100(rounded_rebuilt, decimals=1)
            
            # Reconstruire les sections avec les poids arrondis (1 décimale)
            for cat in ["Actions", "ETF", "Obligations", "Crypto"]:
                rebuilt_sections[cat] = {}
            
            # v4.14.0 FIX R9-2: Bucket "Autres" pour les petites lignes (garantit somme ~100%)
            others_by_cat = {"Actions": 0.0, "ETF": 0.0, "Obligations": 0.0, "Crypto": 0.0}
            
            for key, weight in rounded_rebuilt.items():
                cat, name = key.split(":", 1)
                if weight >= 0.1:  # Afficher si >= 0.1%
                    rebuilt_sections[cat][name] = f"{weight:.1f}%"
                else:
                    others_by_cat[cat] += weight
            
            # Ajouter bucket "Autres" par catégorie si significatif
            for cat, others_weight in others_by_cat.items():
                if others_weight >= 0.1:
                    rebuilt_sections[cat]["Autres"] = f"{others_weight:.1f}%"
            
            # Stocker les poids numériques pour calcul de somme fiable (FIX R6)
            result[profile]["_numeric_weights"] = rounded_rebuilt
        
        # Écraser les sections avec les versions reconstruites (source unique = _tickers)
        for cat in ["Actions", "ETF", "Obligations", "Crypto"]:
            if rebuilt_sections.get(cat):
                result[profile][cat] = rebuilt_sections[cat]
        
        # v4.14.0 FIX R8-2: Construire allocation_rounded depuis asset_lookup (pas assets_metadata_for_check)
        # car asset_lookup contient symbol/isin/ticker complets
        allocation_rounded = {}
        
        # Créer mapping inverse: ticker/symbol/isin → asset_id depuis asset_lookup
        # v4.14.0 FIX R14-2: Ne PAS inclure name (risque collisions)
        ticker_to_asset_id = {}
        for aid, info in asset_lookup.items():
            for key in [info.get("symbol"), info.get("ticker"), info.get("isin")]:
                if key:
                    # Normaliser la clé
                    key_norm = str(key).strip().upper() if key else None
                    if key_norm and not _is_internal_id(key_norm) and key_norm not in ticker_to_asset_id:
                        ticker_to_asset_id[key_norm] = aid
                    # Aussi garder la version originale (case-sensitive)
                    if key and key not in ticker_to_asset_id:
                        ticker_to_asset_id[key] = aid
        
        # Utiliser _tickers directement (contient ticker → weight_decimal)
        for ticker, weight_decimal in result[profile]["_tickers"].items():
            weight_pct = float(weight_decimal) * 100
            if weight_pct > 0:
                # Trouver l'asset_id correspondant (essayer plusieurs variantes)
                ticker_norm = str(ticker).strip().upper() if ticker else str(ticker)
                asset_id = ticker_to_asset_id.get(ticker) or ticker_to_asset_id.get(ticker_norm) or ticker
                allocation_rounded[asset_id] = allocation_rounded.get(asset_id, 0.0) + weight_pct
        
        # Appliquer round_weights_to_100 pour cohérence
        if allocation_rounded:
            allocation_rounded = round_weights_to_100(allocation_rounded, decimals=1)
        
        profile_config = PROFILES.get(profile)
        profile_constraints = {
            "bonds_min": getattr(profile_config, "bonds_min", 5.0),
            "crypto_max": getattr(profile_config, "crypto_max", 10.0),
            "max_single_position": getattr(profile_config, "max_single_position", 15.0),
            "max_single_bond": 25.0,
            "min_assets": getattr(profile_config, "min_assets", 10),
            "max_assets": getattr(profile_config, "max_assets", 18),
            "vol_target": getattr(profile_config, "vol_target", 12.0),
            "bucket_targets": {},
        }
        
        # === PHASE 1 FIX: Utiliser le constraint_report enrichi de diagnostics ===
        enriched_constraint_report = diagnostics.get("constraint_report")

        if enriched_constraint_report:
            # Phase 1 actif : utiliser le rapport enrichi (quality_score, exposures, etc.)
            # v4.14.0 P1-3: Classifier les contraintes
            classified_report = classify_constraint_results(enriched_constraint_report)
            result[profile]["_constraint_report"] = classified_report
            
            # Ajouter exposures et execution_summary au top-level
            if diagnostics.get("exposures"):
                result[profile]["_exposures"] = diagnostics["exposures"]
            if diagnostics.get("execution_summary"):
                result[profile]["_execution_summary"] = diagnostics["execution_summary"]
            
            # Log depuis le rapport enrichi
            quality_score = enriched_constraint_report.get("quality_score", "N/A")
            n_violations = len(enriched_constraint_report.get("violations", []))
            margins = enriched_constraint_report.get("margins", {})
            
            if n_violations > 0:
                for v in enriched_constraint_report.get("violations", []):
                    logger.warning(f"⚠️ [P0-2] {profile} VIOLATION: {v}")
            else:
                logger.info(f"✅ [P0-2] {profile}: Toutes contraintes satisfaites (quality_score: {quality_score}, margins: {margins})")
        else:
            # Fallback : recalculer un rapport basique
            constraint_report = verify_constraints_post_arrondi(
                allocation=allocation_rounded,
                assets_metadata=assets_metadata_for_check,
                profile_constraints=profile_constraints,
                profile_name=profile,
            )
            # v4.14.0 P1-3: Classifier les contraintes
            classified_report = classify_constraint_results(constraint_report.to_dict())
            result[profile]["_constraint_report"] = classified_report
            
            if not constraint_report.all_hard_satisfied:
                hard_violations = [
                    v for v in constraint_report.violations 
                    if v.priority.value == "hard"
                ]
                for v in hard_violations:
                    logger.error(
                        f"🚨 [P0-2] {profile} HARD VIOLATION: {v.constraint_name} - "
                        f"expected {v.expected}, got {v.actual:.1f}% "
                        f"(context: {v.context})"
                    )
            elif constraint_report.warnings:
                for w in constraint_report.warnings:
                    logger.warning(f"⚠️ [P0-2] {profile} WARNING: {w}")
            else:
                logger.info(f"✅ [P0-2] {profile}: Toutes contraintes satisfaites (margins: {constraint_report.margins})")
        
        feasibility_dict = diagnostics.get("_feasibility")
        limitations = build_limitations(
            profile=profile,
            diagnostics=diagnostics,
            constraint_report=result[profile]["_constraint_report"],
            feasibility=feasibility_dict,
        )
        result[profile]["_limitations"] = limitations
        
        if limitations:
            logger.info(f"📋 [P0-3] {profile}: {len(limitations)} limitation(s) documentée(s)")
            for i, lim in enumerate(limitations[:3], 1):
                logger.info(f"   {i}. {lim[:80]}{'...' if len(lim) > 80 else ''}")
        
        n_bonds_readable = len(result[profile]["Obligations"])
        # v4.14.0 FIX R6: Utiliser _numeric_weights pour calcul fiable
        numeric_weights = result[profile].get("_numeric_weights", {})
        bonds_total_pct = sum(
            v for k, v in numeric_weights.items() if k.startswith("Obligations:")
        )
        
        if n_bonds_readable > 0:
            logger.info(f"   {profile}: {n_bonds_readable} bond(s) distincts, total={bonds_total_pct:.1f}%")
            if bond_symbols_used:
                logger.info(f"   {profile} bond symbols: {bond_symbols_used[:6]}{'...' if len(bond_symbols_used) > 6 else ''}")
        
        if ticker_collisions:
            logger.info(f"   {profile}: {len(ticker_collisions)} ticker(s) agrégé(s) (non-bonds): {ticker_collisions}")
        if name_collisions:
            logger.info(f"   {profile}: {len(name_collisions)} nom(s) agrégé(s) (non-bonds): {name_collisions}")
        
        total_tickers = sum(result[profile]["_tickers"].values())
        
        # v4.14.0 FIX R6: Utiliser _numeric_weights (source numérique) au lieu de parser strings
        total_readable = sum(numeric_weights.values()) if numeric_weights else 0.0
        
        n_allocation = len(allocation)
        n_tickers = len(result[profile]["_tickers"])
        n_readable = sum(len(result[profile][c]) for c in ["Actions", "ETF", "Obligations", "Crypto"])
        
        # v4.14.0 FIX R7: Resserrer tolérance de 2% à 0.5% pour détecter bugs tôt
        if abs(total_tickers - 1.0) > 0.005:
            logger.warning(
                f"⚠️ {profile}: _tickers sum = {total_tickers:.2%} (expected ~100%, tolerance 0.5%) "
                f"→ {n_allocation} lignes allocation, {n_tickers} tickers uniques"
            )
        
        # v4.14.0 FIX R6: Tolérance de 0.2% pour rounding 1 décimale
        if abs(total_readable - 100.0) > 0.2:
            logger.warning(
                f"⚠️ {profile}: readable sum = {total_readable:.1f}% (expected ~100%) "
                f"→ {n_readable} items lisibles"
            )
        else:
            logger.info(f"✅ {profile}: readable={total_readable:.1f}% (OK), _tickers={total_tickers:.2%} ({n_tickers} tickers, {n_readable} items)")
        
        tickers_list = [t for t in list(result[profile]["_tickers"].keys())[:8] if t]
        logger.info(f"   {profile} _tickers sample: {tickers_list}")
        
      # === v4.11.0: Copier _asset_details si présent ===
        if data.get("_asset_details"):
            result[profile]["_asset_details"] = data["_asset_details"]
            logger.info(f"   {profile}: {len(data['_asset_details'])} asset_details copiés")
      # === v5.2.1: Exporter risk_analysis si présent ===
        if data.get("risk_analysis"):
            result[profile]["risk_analysis"] = data["risk_analysis"]     
    
    result["_meta"] = {
        "generated_at": datetime.datetime.now().isoformat(),
        "version": "v4.15.0",
        "buffett_mode": CONFIG["buffett_mode"],
        "buffett_min_score": CONFIG["buffett_min_score"],
        "tactical_context_enabled": CONFIG.get("use_tactical_context", False),
        "tactical_mode": CONFIG.get("tactical_mode", "radar"),
        "tactical_rules": CONFIG.get("tactical_rules", {}),
        "backtest_days": CONFIG["backtest_days"],
        "platform_fee_annual_bp": CONFIG.get("platform_fee_annual_bp", 0.0),
        "ter_handling": "embedded_in_etf_prices",
        "profile_policy_enabled": HAS_PROFILE_POLICY,
        # v4.14.0: Add research disclaimer
        "execution_grade": RESEARCH_DISCLAIMER_V414["execution_grade"],
        "investable": RESEARCH_DISCLAIMER_V414["investable"],
        "research_disclaimer": RESEARCH_DISCLAIMER_V414["disclaimer"],
        "optimization_modes": {
            profile: portfolios[profile].get("diagnostics", {}).get("optimization_mode", "unknown")
            for profile in ["Agressif", "Modéré", "Stable"]
            if profile in portfolios
        },
    }
    
    # v7.3: Propagate yield-driven allocation to v1 output
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in portfolios or profile not in result:
            continue
        src = portfolios[profile]
        if src.get("_tickers_rendement"):
            result[profile]["_tickers_rendement"] = src["_tickers_rendement"]
        if src.get("_yield_metrics"):
            result[profile]["_yield_metrics"] = src["_yield_metrics"]

    return result


# ============= SAUVEGARDE =============

def save_portfolios(portfolios: Dict, assets: list):
    """Sauvegarde les portefeuilles."""
    os.makedirs("data", exist_ok=True)
    os.makedirs(CONFIG["history_dir"], exist_ok=True)
    
    v1_data = normalize_to_frontend_v1(portfolios, assets)
    
    # === v5.3.3: ETF Sector Dedup — consolidate redundant ETFs ===
    # XLE + VDE = same Energy US exposure (corr > 0.95). Keep most liquid, merge weight.
    _ETF_DEDUP_GROUPS = {
        # Group key → list of tickers that are near-identical (corr > 0.90)
        # SECTOR DEDUP
        "energy_us": ["XLE", "VDE", "FENY", "IYE"],
        "semi_us": ["SOXX", "SMH"],
        # v5.4.1: Gold dedup = only identical physical gold (corr > 0.95)
        # Broader gold/silver/miners caps handled by allocation_rules_engine thematic_caps
        "gold_physical": ["GLD", "IAU", "SGOL", "AAAU", "PHYS", "BAR", "OUNZ"],
        # US VALUE — same factor, different providers (corr > 0.95)
        # VTV=CRSP Value, SCHV=Dow Jones Value, VONV=Russell 1000 Value, IVE=S&P 500 Value
        "us_large_value": ["VTV", "SCHV", "VONV", "IVE", "VOOV", "RPV", "IUSV"],
        # v5.4.0 P0-2: HDV RETIRÉ du groupe — corr SCHD/HDV ~0.85, pas ~0.95
        # HDV = high dividend yield (XOM/CVX/PM), SCHD = dividend quality (ABBV/MRK/HD)
        # Complémentaires, pas redondants — expert rec: garder les deux dans Modéré
        "us_dividend": ["SCHD", "DGRO", "VYM", "DVY"],
        # INTL DEVELOPED BROAD — same market cap weighted ex-US (corr > 0.95)
        # VEA=FTSE Developed, EFA=MSCI EAFE, SPDW=S&P Developed ex-US
        "intl_developed": ["VEA", "EFA", "IXUS", "IEFA", "IDEV", "SPDW"],
        # v7.2.1: BOND ETF DEDUP — same duration/credit bucket (corr > 0.90)
        "short_treasury": ["VGSH", "SCHO", "SPTS", "SHV"],
        "tbill_cash": ["SGOV", "GBIL", "CLTL", "BIL"],
        "tips_inflation": ["STIP", "TIP", "VTIP", "SCHP"],
        "clo_aaa": ["PAAA", "JAAA"],
        "ultra_short_bond": ["PULS", "MINT", "JPST", "NEAR"],
        "intermediate_corp": ["VCIT", "IGIB", "SPIB"],
        "short_corp": ["VCSH", "IGSB"],
        "intermediate_treasury": ["IEF", "VGIT", "SCHR"],
        "long_treasury": ["TLT", "EDV", "SPTL"],
        "core_aggregate": ["BND", "AGG"],
        "high_yield": ["HYG", "JNK", "SHYG", "USHY"],
        # v7.2.1: US VALUE — add SPYV (was missing, same as VTV/IUSV)
        "sp500_value": ["SPYV", "IUSV", "VOOV"],
    }
    # v5.4.1: _ETF_DEDUP_PREFER removed — broader gold/silver caps handled by allocation_rules_engine
    for _p_name in ["Agressif", "Modéré", "Stable"]:
        if _p_name not in v1_data:
            continue
        _p_data = v1_data[_p_name]
        _t = _p_data.get("_tickers", {})
        _meta = _p_data.get("_tickers_meta", {})
        
        for _group_name, _group_tickers in _ETF_DEDUP_GROUPS.items():
            _found = [(tk, _t[tk]) for tk in _group_tickers if tk in _t]
            if len(_found) < 2:
                continue
            
            # Keep the one with highest weight (= most liquid / best scored)
            _found.sort(key=lambda x: -x[1])
            _keeper = _found[0]
            _merged_weight = sum(w for _, w in _found)
            
            # Remove duplicates, add weight to keeper
            for tk, w in _found[1:]:
                del _t[tk]
                logger.info(
                    f"   [{_p_name}] 🔄 ETF DEDUP: {tk} ({w*100:.1f}%) merged into "
                    f"{_keeper[0]} — group '{_group_name}'"
                )
            _t[_keeper[0]] = _merged_weight
            
            # Rebuild display for this portfolio
            for _cat in ["Actions", "ETF", "Obligations", "Crypto"]:
                _p_data[_cat] = {}
            _nw = {}
            for _tk, _w_dec in _t.items():
                _w_pct = round(_w_dec * 100, 1)
                if _w_pct < 0.1:
                    continue
                _info = _meta.get(_tk, {})
                _cat = _info.get("category", "ETF")
                _nm = _info.get("name", _tk)
                _display = f"{_nm} ({_tk})" if _tk not in _nm else _nm
                _p_data[_cat][_display] = f"{_w_pct:.1f}%"
                _nw[f"{_cat}:{_display}"] = _w_pct
            _p_data["_numeric_weights"] = _nw
    
    # === v5.3.2 EQUITY CAP: Individual stocks max 10% Agressif, 11% Modéré, 10% Stable ===
    # Runs AFTER all post-processing (RADAR caps, AGG caps, dust cleanup)
    # Catches VRT 11% that survived earlier cap due to redistribution
    _EQ_CAP_FINAL = {"Agressif": 0.10, "Modéré": 0.11, "Stable": 0.10,
                       "Dividende-PEA": 0.08, "Dividende-CTO": 0.12}  # v8.x: 0.10→0.12 sans Asie
    for _p_name in ["Agressif", "Modéré", "Stable"]:
        if _p_name not in v1_data:
            continue
        _p_data = v1_data[_p_name]
        _t = _p_data.get("_tickers", {})
        _meta = _p_data.get("_tickers_meta", {})
        _cap = _EQ_CAP_FINAL.get(_p_name, 0.11)
        _eq_any_capped = False
        
        for _nuc_eq_iter in range(5):
            _eq_over = {}
            for k, v in _t.items():
                _info = _meta.get(k, {})
                if _info.get("category") == "Actions" and v > _cap + 0.001:
                    _eq_over[k] = v
            if not _eq_over:
                break
            _eq_excess = 0.0
            for k, v in _eq_over.items():
                _eq_excess += v - _cap
                logger.info(f"   [{_p_name}] 📉 EQUITY FINAL CAP: {k} {v*100:.1f}%→{_cap*100:.1f}%")
                _t[k] = _cap
                _eq_any_capped = True
            # Redistribute to non-equity positions
            _non_eq = {k: v for k, v in _t.items() if k not in _eq_over and v > 0 and _meta.get(k, {}).get("category") != "Actions"}
            _total_non_eq = sum(_non_eq.values())
            if _total_non_eq > 0 and _eq_excess > 0:
                for k in _non_eq:
                    _t[k] += _eq_excess * (_non_eq[k] / _total_non_eq)
        
        if _eq_any_capped:
            logger.info(f"   [{_p_name}] 📉 EQUITY FINAL CAP applied — rebuilding display sections")
            # Rebuild display
            for _cat in ["Actions", "ETF", "Obligations", "Crypto"]:
                _p_data[_cat] = {}
            _nw = {}
            for _tk, _w_dec in _t.items():
                _w_pct = round(_w_dec * 100, 1)
                if _w_pct < 0.1:
                    continue
                _info = _meta.get(_tk, {})
                _cat = _info.get("category", "ETF")
                _nm = _info.get("name", _tk)
                _display = f"{_nm} ({_tk})" if _tk not in _nm else _nm
                _p_data[_cat][_display] = f"{_w_pct:.1f}%"
                _nw[f"{_cat}:{_display}"] = _w_pct
            _p_data["_numeric_weights"] = _nw

    # === v5.3.3: ETF Individual Cap — max 9% per ETF ===
    # XLE at 11% after dedup is too concentrated. No single ETF should outweigh stocks.
    _ETF_MAX = 0.09  # 9% in decimal
    for _p_name in ["Agressif", "Modéré", "Stable"]:
        if _p_name not in v1_data:
            continue
        _p_data = v1_data[_p_name]
        _t = _p_data.get("_tickers", {})
        _meta = _p_data.get("_tickers_meta", {})
        _etf_any_capped = False
        
        for _etf_cap_iter in range(3):
            _etf_over = {}
            for k, v in _t.items():
                _info = _meta.get(k, {})
                if _info.get("category") == "ETF" and v > _ETF_MAX + 0.001:
                    _etf_over[k] = v
            if not _etf_over:
                break
            _etf_excess = 0.0
            for k, v in _etf_over.items():
                _etf_excess += v - _ETF_MAX
                logger.info(f"   [{_p_name}] 📊 ETF CAP: {k} {v*100:.1f}%→{_ETF_MAX*100:.1f}%")
                _t[k] = _ETF_MAX
                _etf_any_capped = True
            # Redistribute to non-equity positions only (prevents inflating stocks above equity cap)
            _non_capped = {k: v for k, v in _t.items() 
                          if k not in _etf_over and v > 0 
                          and _meta.get(k, {}).get("category") != "Actions"}
            _total_nc = sum(_non_capped.values())
            if _total_nc > 0 and _etf_excess > 0:
                for k in _non_capped:
                    _t[k] += _etf_excess * (_non_capped[k] / _total_nc)
        
        if _etf_any_capped:
            logger.info(f"   [{_p_name}] 📊 ETF CAP applied — rebuilding display")
            for _cat in ["Actions", "ETF", "Obligations", "Crypto"]:
                _p_data[_cat] = {}
            _nw = {}
            for _tk, _w_dec in _t.items():
                _w_pct = round(_w_dec * 100, 1)
                if _w_pct < 0.1:
                    continue
                _info = _meta.get(_tk, {})
                _cat = _info.get("category", "ETF")
                _nm = _info.get("name", _tk)
                _display = f"{_nm} ({_tk})" if _tk not in _nm else _nm
                _p_data[_cat][_display] = f"{_w_pct:.1f}%"
                _nw[f"{_cat}:{_display}"] = _w_pct
            _p_data["_numeric_weights"] = _nw

    # === v5.3.1 NUCLEAR SAFETY NET: Cap all positions at 15% in BOTH _tickers and display ===
    # This is the ABSOLUTE LAST checkpoint before writing JSON.
    
    # v5.4.1: P0-3 (SCHY→IUSV) and P0-4 (HC ETF) removed — now handled by allocation_rules_engine.py
    # All allocation decisions driven by allocation_rules.json
    
    _NUCLEAR_MAX = 0.15  # 15% in decimal
    for _p_name in ["Agressif", "Modéré", "Stable"]:
        if _p_name not in v1_data:
            continue
        _p_data = v1_data[_p_name]
        _t = _p_data.get("_tickers", {})
        if not _t:
            continue
        # Check and cap _tickers
        _any_capped = False
        for _nuc_iter in range(5):
            _nuc_over = {k: v for k, v in _t.items() if v > _NUCLEAR_MAX + 0.001}
            if not _nuc_over:
                break
            _nuc_excess = 0.0
            for k, v in _nuc_over.items():
                _nuc_excess += v - _NUCLEAR_MAX
                logger.info(f"   [{_p_name}] 💣 NUCLEAR CAP: {k} {v*100:.1f}%→{_NUCLEAR_MAX*100:.1f}%")
                _t[k] = _NUCLEAR_MAX
                _any_capped = True
            _nuc_elig = sum(v for k, v in _t.items() if k not in _nuc_over and v > 0)
            if _nuc_elig > 0 and _nuc_excess > 0:
                for k in _t:
                    if k not in _nuc_over and _t[k] > 0:
                        _t[k] += _nuc_excess * (_t[k] / _nuc_elig)
        
        if _any_capped:
            # Rebuild display sections from capped _tickers
            ticker_to_info = _p_data.get("_tickers_meta", {})
            for _cat in ["Actions", "ETF", "Obligations", "Crypto"]:
                _p_data[_cat] = {}
            _nw = {}
            for _tk, _w_dec in _t.items():
                _w_pct = round(_w_dec * 100, 1)
                if _w_pct < 0.1:
                    continue
                _info = ticker_to_info.get(_tk, {})
                _cat = _info.get("category", "ETF")
                _nm = _info.get("name", _tk)
                _display = f"{_nm} ({_tk})" if _tk not in _nm else _nm
                _p_data[_cat][_display] = f"{_w_pct:.1f}%"
                _nw[f"{_cat}:{_display}"] = _w_pct
            _p_data["_numeric_weights"] = _nw
            logger.info(f"   [{_p_name}] 💣 NUCLEAR: Display sections rebuilt after cap")
    
    # === v3.3 CRYPTO NUCLEAR CAP: Force crypto <= crypto_max ABSOLUTE LAST ===
    # ETF dedup, equity cap, and ETF cap all redistribute to non-equity including crypto.
    # This final cap ensures crypto never exceeds the profile limit in the output JSON.
    _CRYPTO_MAX_BY_PROFILE = {"Agressif": 0.10, "Modéré": 0.05, "Stable": 0.0,
                                "Dividende-PEA": 0.0, "Dividende-CTO": 0.0}
    try:
        from optimizer import PROFILES as _OPT_PROFILES
        for _pn in _CRYPTO_MAX_BY_PROFILE:
            _op = _OPT_PROFILES.get(_pn)
            if _op:
                _CRYPTO_MAX_BY_PROFILE[_pn] = getattr(_op, "crypto_max", 10.0) / 100.0
    except Exception:
        pass  # Use defaults above
    
    for _p_name in ["Agressif", "Modéré", "Stable"]:
        if _p_name not in v1_data:
            continue
        _p_data = v1_data[_p_name]
        _t = _p_data.get("_tickers", {})
        _meta = _p_data.get("_tickers_meta", {})
        if not _t:
            continue
        _crypto_max_dec = _CRYPTO_MAX_BY_PROFILE.get(_p_name, 0.10)
        
        # Find crypto tickers via _tickers_meta category
        _crypto_tks = [k for k in _t if _meta.get(k, {}).get("category") == "Crypto"]
        _crypto_total = sum(_t.get(k, 0) for k in _crypto_tks)
        
        if _crypto_total > _crypto_max_dec + 0.001 and _crypto_tks:
            _ratio = _crypto_max_dec / _crypto_total if _crypto_total > 0 else 0
            _freed = 0.0
            for _ck in _crypto_tks:
                _old = _t[_ck]
                _new = _old * _ratio
                if _new < 0.005:
                    _freed += _old
                    del _t[_ck]
                else:
                    _freed += _old - _new
                    _t[_ck] = _new
                logger.info(f"   [{_p_name}] 🪙 CRYPTO CAP: {_ck} {_old*100:.1f}%→{_new*100:.1f}%")
            
            # Redistribute to non-crypto
            _non_crypto = {k: v for k, v in _t.items() if k not in _crypto_tks and v > 0}
            _total_nc = sum(_non_crypto.values())
            if _total_nc > 0 and _freed > 0.001:
                for k in _non_crypto:
                    _t[k] += _freed * (_non_crypto[k] / _total_nc)
            
            # Rebuild display
            for _cat in ["Actions", "ETF", "Obligations", "Crypto"]:
                _p_data[_cat] = {}
            _nw = {}
            for _tk, _w_dec in _t.items():
                _w_pct = round(_w_dec * 100, 1)
                if _w_pct < 0.1:
                    continue
                _info = _meta.get(_tk, {})
                _cat = _info.get("category", "ETF")
                _nm = _info.get("name", _tk)
                _display = f"{_nm} ({_tk})" if _tk not in _nm else _nm
                _p_data[_cat][_display] = f"{_w_pct:.1f}%"
                _nw[f"{_cat}:{_display}"] = _w_pct
            _p_data["_numeric_weights"] = _nw
            _crypto_after = sum(_t.get(k, 0) for k in _crypto_tks if k in _t) * 100
            logger.info(f"   [{_p_name}] 🪙 CRYPTO NUCLEAR CAP: {_crypto_total*100:.1f}%→{_crypto_after:.1f}% (max={_crypto_max_dec*100:.0f}%)")
    
    # === v5.4.0: ALLOCATION RULES ENGINE ===
    # Reads allocation_rules.json and applies:
    # - Thematic caps (semi ≤ 15%, ai_infra ≤ 15%, etc.)
    # - Mandatory hedges (gold, HC ETF, BTC, IG credit)
    # - Profile replacements (TTE → IBE in Stable, SCHY → IUSV)
    # - ETF splits (SLVP → SLVP + SLV)
    # - Beta filter actions (remove high-beta stocks from Stable)
    # - Market conditions (Brent, VIX, gold, CPI → adjust caps/hedges)
    # - Market Intelligence v1.0: Claude Opus as CIO for dynamic allocation
    # All driven by JSON config + AI analysis, zero hardcoded allocation logic.
    try:
        try:
            from portfolio_engine.allocation_rules_engine import (
                load_allocation_rules, apply_allocation_rules,
                fetch_market_conditions, evaluate_market_rules, apply_market_adjustments
            )
        except ImportError:
            from allocation_rules_engine import (
                load_allocation_rules, apply_allocation_rules,
                fetch_market_conditions, evaluate_market_rules, apply_market_adjustments
            )
        try:
            from portfolio_engine.etf_exposure import TICKER_TO_EXPOSURE as _TICKER_EXP
        except ImportError:
            try:
                from etf_exposure import TICKER_TO_EXPOSURE as _TICKER_EXP
            except ImportError:
                _TICKER_EXP = {}
                logger.warning("⚠️ [ALLOC_RULES] TICKER_TO_EXPOSURE not found — ETF themes will be limited")
        
        _alloc_rules = load_allocation_rules()
        if _alloc_rules:
            # v2: Fetch market conditions and adjust rules BEFORE applying to portfolios
            _market_data = {}
            try:
                _td_key = CONFIG.get("twelve_data_api_key") or os.environ.get("TWELVE_DATA_API_KEY") or os.environ.get("TWELVE_DATA_API")
                _market_data = fetch_market_conditions(api_key=_td_key)
                if _market_data:
                    _adjustments = evaluate_market_rules(_alloc_rules, _market_data)
                    if _adjustments.get("active_rules"):
                        _alloc_rules = apply_market_adjustments(_alloc_rules, _adjustments)
                        logger.info(f"✅ [MARKET] {len(_adjustments['active_rules'])} hardcoded rules applied: {_adjustments['active_rules']}")
            except Exception as e:
                logger.warning(f"⚠️ [MARKET] Market conditions fetch failed: {e} — using default rules")
            
            # v2.1: Market Intelligence — Claude Opus AI-driven adjustments
            # Complements hardcoded rules with second-order macro analysis
            # Fallback: if API unavailable, hardcoded rules above are sufficient
            try:
                try:
                    from portfolio_engine.market_intelligence import get_ai_market_adjustments, integrate_ai_adjustments
                except ImportError:
                    from market_intelligence import get_ai_market_adjustments, integrate_ai_adjustments
                
                # Build portfolio summary for context
                _portfolio_summary = {}
                for _ps_name in ["Agressif", "Modéré", "Stable"]:
                    if _ps_name in v1_data:
                        _ps_tickers = v1_data[_ps_name].get("_tickers", {})
                        _ps_meta = v1_data[_ps_name].get("_tickers_meta", {})
                        _ps_bonds = {k: v for k, v in _ps_tickers.items() 
                                    if _ps_meta.get(k, {}).get("category") == "Obligations"}
                        _ps_equity = {k: v for k, v in _ps_tickers.items() 
                                     if _ps_meta.get(k, {}).get("category") in ("Actions", "ETF")}
                        _portfolio_summary[_ps_name] = {
                            "bonds_pct": round(sum(_ps_bonds.values()) * 100, 1),
                            "equity_pct": round(sum(_ps_equity.values()) * 100, 1),
                            "bond_tickers": ", ".join(f"{k} ({v*100:.0f}%)" for k, v in sorted(_ps_bonds.items(), key=lambda x: -x[1])),
                            "n_lines": len(_ps_tickers),
                        }
                
                # v2.1: Enrich _market_data with FRED+TD from macro_indicators.json
                # AND RADAR context from market_context.json
                try:
                    import json as _json_mi
                    
                    # 1) FRED+TD macro indicators (17 fields)
                    _mi_path = "data/macro_indicators.json"
                    if os.path.exists(_mi_path):
                        with open(_mi_path, "r", encoding="utf-8") as _mc_f:
                            _mc_data = _json_mi.load(_mc_f)
                        _flat = _mc_data.get("_market_data_flat", {})
                        if _flat:
                            _n_before = len(_market_data or {})
                            _merged = {**_flat, **{k: v for k, v in (_market_data or {}).items() if v is not None}}
                            _market_data = _merged
                            logger.info(f"🧠 [MI] Enriched with macro_indicators: {_n_before} → {len(_market_data)} fields")
                    
                    # 2) RADAR context (sector momentum, regime, risk profile)
                    _radar_path = "data/market_context.json"
                    if os.path.exists(_radar_path):
                        with open(_radar_path, "r", encoding="utf-8") as _rc_f:
                            _radar = _json_mi.load(_rc_f)
                        
                        # Extract RADAR signals for Claude
                        _tilts = _radar.get("macro_tilts", {})
                        _market_data["radar_regime"] = _radar.get("market_regime", "unknown")
                        _market_data["radar_confidence"] = _radar.get("confidence", 0)
                        _market_data["favored_sectors"] = ", ".join(_tilts.get("favored_sectors", []))
                        _market_data["avoided_sectors"] = ", ".join(_tilts.get("avoided_sectors", []))
                        _market_data["favored_regions"] = ", ".join(_tilts.get("favored_regions", []))
                        _market_data["avoided_regions"] = ", ".join(_tilts.get("avoided_regions", []))
                        _market_data["key_trends"] = " | ".join(_radar.get("key_trends", [])[:5])
                        _market_data["risks"] = " | ".join(_radar.get("risks", [])[:4])
                        
                        # Sector momentum summary
                        _srp = _radar.get("sector_risk_profile", {})
                        _sector_summary = []
                        for _sk, _sv in _srp.items():
                            _cls = _sv.get("classification", "?")
                            _beta = _sv.get("beta", "?")
                            _daily = _sv.get("daily", "?")
                            _sector_summary.append(f"{_sk}({_cls},b={_beta},d={_daily}%)")
                        _market_data["sector_momentum_summary"] = ", ".join(_sector_summary)
                        
                        logger.info(f"🧠 [MI] Enriched with RADAR: regime={_market_data['radar_regime']}, "
                                   f"{len(_srp)} sectors, favored=[{_market_data['favored_sectors']}]")
                    
                except Exception as _e_mc:
                    logger.debug(f"[MI] Could not enrich market data: {_e_mc}")
                
                _ai_adjustments = get_ai_market_adjustments(
                    market_data=_market_data or None,
                    portfolio_summary=_portfolio_summary,
                    fallback_rules=_alloc_rules,
                )
                
                if _ai_adjustments.get("active_rules") and _ai_adjustments.get("ai_regime") != "fallback":
                    _alloc_rules = integrate_ai_adjustments(_alloc_rules, _ai_adjustments)
                    _ai_regime = _ai_adjustments.get("ai_regime", "unknown")
                    _ai_conf = _ai_adjustments.get("ai_regime_confidence", "?")
                    logger.info(f"🧠 [MI] AI regime: {_ai_regime} (confidence {_ai_conf}/5)")
                    for _ai_w in _ai_adjustments.get("ai_warnings", []):
                        logger.warning(f"🧠 [MI] Warning: {_ai_w}")
                else:
                    logger.info("🧠 [MI] AI analysis: no additional adjustments (or fallback mode)")
                    
            except ImportError:
                logger.info("ℹ️ [MI] market_intelligence.py not found — using hardcoded rules only")
            except Exception as e:
                logger.warning(f"⚠️ [MI] AI analysis error: {e} — using hardcoded rules only")
            
            # Apply rules to each profile
            for _p_name in ["Agressif", "Modéré", "Stable"]:
                if _p_name in v1_data:
                    apply_allocation_rules(v1_data[_p_name], _p_name, _alloc_rules, _TICKER_EXP, _market_data)
            logger.info("✅ [ALLOC_RULES] Engine v2.1 applied to all profiles")
            
            # v2.3: Re-run risk_analysis AFTER engine so stress tests use final portfolio
            # The pre-engine run (line ~3382) tested EMHC 5.62%, BTC 7.12%, XLE 12.33%
            # Post-engine: EMHC ejected, BTC capped 2.2%, XLE 2.3%, SGOV injected
            if CONFIG.get("enable_risk_analysis", False) and HAS_RISK_ANALYSIS:
                logger.info("🔄 [risk_analysis] Re-running on POST-ENGINE portfolio (final positions)")
                for _ra_profile in ["Agressif", "Modéré", "Stable"]:
                    if _ra_profile not in v1_data:
                        continue
                    try:
                        if fetch_and_enrich_risk_analysis is not None:
                            _ra_enriched = fetch_and_enrich_risk_analysis(
                                portfolio_result=v1_data[_ra_profile],
                                profile_name=_ra_profile,
                                lookback_years=5,
                                use_cache=True,  # Use cached prices from first run
                            )
                        else:
                            _ra_enriched = enrich_portfolio_with_risk_analysis(
                                portfolio_result=v1_data[_ra_profile],
                                profile_name=_ra_profile,
                            )
                        v1_data[_ra_profile]["risk_analysis"] = _ra_enriched.get("risk_analysis", {})
                        
                        # Log delta vs pre-engine
                        _ra_stress = v1_data[_ra_profile].get("risk_analysis", {}).get("stress_tests", {})
                        _ra_worst = _ra_stress.get("worst_case", {})
                        _ra_loss = _ra_worst.get("expected_loss_pct", "?")
                        _ra_n_pos = len(v1_data[_ra_profile].get("_tickers", {}))
                        logger.info(
                            f"   ✅ [{_ra_profile}] Post-engine risk: worst={_ra_loss}% "
                            f"({_ra_worst.get('scenario', '?')}), {_ra_n_pos} positions"
                        )
                    except Exception as _ra_e:
                        logger.warning(f"   ⚠️ [{_ra_profile}] Post-engine risk_analysis failed: {_ra_e}")
        else:
            logger.info("ℹ️ [ALLOC_RULES] No rules file found — skipping")
    except ImportError:
        logger.warning("⚠️ [ALLOC_RULES] allocation_rules_engine.py not found — skipping")
    except Exception as e:
        logger.warning(f"⚠️ [ALLOC_RULES] Error: {e} — portfolios unchanged")
    
    # v7.3 FINAL GUARD: Cap _tickers après tout le post-processing de save_portfolios
    from portfolio_engine.optimizer import PROFILES as _PROFILES
    for _p_name in ["Agressif", "Modéré", "Stable"]:
        if _p_name not in v1_data:
            continue
        _t = v1_data[_p_name].get("_tickers", {})
        if not _t:
            continue
        _max_cap = _PROFILES[_p_name].max_single_position / 100  # 0.13 pour Stable
        _capped = False
        for _tk, _w in list(_t.items()):
            if _w > _max_cap + 0.001:
                _excess = _w - _max_cap
                _t[_tk] = _max_cap
                # Redistribuer vers la plus petite position
                _others = sorted([(k, v) for k, v in _t.items() if k != _tk], key=lambda x: x[1])
                if _others:
                    _t[_others[0][0]] += _excess
                logger.info(f"[FINAL GUARD {_p_name}] {_tk}: {_w*100:.1f}% → {_max_cap*100:.1f}%")
                _capped = True
        if _capped:
            # Renormaliser à 1.0
            _total = sum(_t.values())
            if abs(_total - 1.0) > 0.001:
                for _tk in _t:
                    _t[_tk] /= _total

    # Inject _alternates (per-bucket runner-up candidates from select_candidates that
    # didn't make the final allocation). Consumed by the Allocator UI to propose
    # substitutes when a target ticker is flagged non-investable by the user.
    for _p_name in ["Agressif", "Modéré", "Stable"]:
        if _p_name not in v1_data or _p_name not in portfolios:
            continue
        _alts = portfolios[_p_name].get("diagnostics", {}).get("alternates")
        if _alts:
            # Filter out alternates whose ticker ended up in the final _tickers (post-dedup)
            _final_tickers = set(v1_data[_p_name].get("_tickers", {}).keys())
            _filtered = {}
            for _bucket, _entries in _alts.items():
                _kept = [e for e in _entries if e.get("ticker") not in _final_tickers]
                if _kept:
                    _filtered[_bucket] = _kept
            if _filtered:
                v1_data[_p_name]["_alternates"] = _filtered
                logger.info(
                    f"   [{_p_name}] _alternates: "
                    + ", ".join(f"{b}={len(e)}" for b, e in _filtered.items())
                )

    v1_path = CONFIG["output_path"]

    # Phase 2-B4: garde-fou turnover final (lit le prev AVANT l'écrasement)
    _enforce_final_turnover(v1_data, v1_path)

    # ═══════════════════════════════════════════════════════════════════════
    # v6.0 (2026-06-03) — CORE-SATELLITE DISCIPLINE
    # ─────────────────────────────────────────────────────────────────────
    # Avant écriture finale, applique la discipline obligatoire :
    #   - Satellite ≤ 10/20/25 % (Stable/Modéré/Agressif)
    #   - Cap 5 %/nom satellite, 50 %/ETF cœur
    #   - Cœur UCITS broad imposé (VWCE.DE, AGGH.AS, IBCI.AS, IBGS.AS, SGLN.AS, IWDA.AS)
    #   - Σ = 100 % par construction (fix le bug historique 102-112 %)
    # Décision conversation 2026-06-03 après walk-forward strict + analyse risque.
    # ═══════════════════════════════════════════════════════════════════════
    logger.info("\n=== CORE-SATELLITE DISCIPLINE v6.0 ===")
    _v1_pre_discipline = v1_data
    v1_data = _apply_core_satellite_discipline(_v1_pre_discipline)
    for _p in ("Stable", "Modéré", "Agressif"):
        _prof = v1_data.get(_p, {})
        _meta = _prof.get("_tickers_meta", {})
        _total = sum(m.get("weight", 0) for m in _meta.values())
        _sat = sum(m.get("weight", 0) for m in _meta.values() if m.get("role") == "satellite")
        logger.info(f"   [{_p}] Σ={_total*100:.2f}%, satellite={_sat*100:.1f}%, {len(_meta)} positions")

    with open(v1_path, "w", encoding="utf-8") as f:
        json.dump(v1_data, f, ensure_ascii=False, indent=2)
    logger.info(f"✅ Sauvegardé (disciplinné): {v1_path}")
    
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_path = f"{CONFIG['history_dir']}/portfolios_v4_{ts}.json"
    
    archive_data = {
        "version": "v4.15.0",
        "timestamp": ts,
        "date": datetime.datetime.now().isoformat(),
        "buffett_config": {
            "mode": CONFIG["buffett_mode"],
            "min_score": CONFIG["buffett_min_score"],
        },
        "tactical_config": {
            "enabled": CONFIG.get("use_tactical_context", False),
            "data_dir": CONFIG.get("market_data_dir", "data"),
        },
        "backtest_config": {
            "days": CONFIG["backtest_days"],
            "freq": CONFIG["backtest_freq"],
            "platform_fee_annual_bp": CONFIG.get("platform_fee_annual_bp", 0.0),  # V4.8.7
            "ter_handling": "embedded_in_etf_prices",  # V4.8.7
        },
        "profile_policy_enabled": HAS_PROFILE_POLICY,
        "portfolios": portfolios,
    }
    
    with open(archive_path, "w", encoding="utf-8") as f:
        json.dump(archive_data, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"✅ Archive: {archive_path}")
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        n_assets = len(portfolios.get(profile, {}).get("allocation", {}))
        logger.info(f"   {profile}: {n_assets} lignes")
    
    # v4.14.0 R13: Sanity check automatique
    logger.info("\n=== SANITY CHECK v4.14.0 ===")
    sanity_check_portfolios(v1_data)

    # v6.9 (2026-06-04) : le profil "Agressif-Thematique" est désormais
    # injecté DIRECTEMENT dans portfolios.json par core_satellite_discipline.py
    # (plus de fichier séparé portfolios_alternative.json). Le dashboard voit
    # maintenant les 4 profils dans le même fichier.

    # ═══════════════════════════════════════════════════════════════════════
    # v6.15 (2026-06-04) — ARCHIVAGE SCORES DATÉS + JOURNAL DÉCISION
    # Priorités #1 et #4 de Claude externe : construire l'historique
    # point-in-time pour permettre dans 2-3 ans un walk-forward réel du
    # score qualité, et logger les décisions pour juger sa propre compétence.
    # ═══════════════════════════════════════════════════════════════════════
    if _HAS_AUDIT_TOOLS:
        try:
            # Charge l'univers annoté pour archiver les fit_scores
            from portfolio_engine.profile_assignment import annotate_universe_with_fits
            _all_stocks_archive = []
            for _fname in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
                _p = os.path.join("data", _fname)
                if os.path.exists(_p):
                    with open(_p) as _f:
                        _d = json.load(_f)
                        _stocks_list = _d.get("stocks", []) if isinstance(_d, dict) else _d
                        _all_stocks_archive.extend(_stocks_list)
            if _all_stocks_archive:
                annotate_universe_with_fits(_all_stocks_archive)
                _archive_path = archive_scores(_all_stocks_archive)
                logger.info(f"📸 Score archive : {_archive_path}")
        except Exception as _e_arch:
            logger.warning(f"⚠️ Score archive failed (non-bloquant): {_e_arch}")

        try:
            _log_path = log_decision(v1_data, pipeline_version="v6.15")
            logger.info(f"📔 Decision log : {_log_path}")
        except Exception as _e_log:
            logger.warning(f"⚠️ Decision log failed (non-bloquant): {_e_log}")
    
    # === v5.3.3: Expert Lineup Regression Test ===
    # Compare produced portfolios against expert consensus targets.
    # WARNING flag if overlap < 40%. Signal only, NOT optimization target.
    # === v5.4.2: PORTFOLIO QUALITY TEST (replaces ticker-based expert regression) ===
    # Tests portfolio PROPERTIES rather than specific tickers.
    # A good portfolio naturally meets these criteria — no forcing needed.
    _QUALITY_RULES = {
        "Agressif": {
            "min_equity_sectors": 3,      # At least 3 distinct equity sectors
            "min_lines": 12,              # Enough diversification
            "max_lines": 20,
            "bond_floor_pct": 10,
            "bond_ceil_pct": 20,
            "has_hedge_gold": True,       # Gold hedge present
            "has_hedge_hc": True,         # Healthcare hedge present
            "max_single_theme_pct": 20,   # No theme > 20%
        },
        "Modéré": {
            "min_equity_sectors": 3,
            "min_lines": 10,
            "max_lines": 16,
            "bond_floor_pct": 20,
            "bond_ceil_pct": 35,
            "has_hedge_gold": True,
            "has_hedge_hc": True,
            "min_low_beta_stocks": 1,     # At least 1 stock with beta < 0.7
            "max_single_theme_pct": 20,
        },
        "Stable": {
            "min_equity_sectors": 2,
            "min_lines": 8,
            "max_lines": 16,              # v5.4.2: engine injects XLV, GLD, VCIT, SCHO → up to 15-16 lines
            "bond_floor_pct": 40,         # v2.1: engine floor=45%, test floor=40% (marge)
            "bond_ceil_pct": 55,          # v2.1: 50→55% (bond floor 45% + engine redistribution)
            "has_hedge_gold": True,
            "has_hedge_hc": True,
            "has_ig_credit": True,        # IG credit present (VCIT/LQD)
            "max_single_theme_pct": 18,
            "min_low_beta_stocks": 1,
        },
    }
    
    logger.info("\n=== PORTFOLIO QUALITY TEST v5.4.2 ===")
    for _qt_profile, _qt_rules in _QUALITY_RULES.items():
        if _qt_profile not in v1_data:
            continue
        _qt_data = v1_data[_qt_profile]
        _qt_tickers = _qt_data.get("_tickers", {})
        _qt_meta = _qt_data.get("_tickers_meta", {})
        _qt_pass = []
        _qt_fail = []
        
        # 1) Line count
        n_lines = len(_qt_tickers)
        if _qt_rules["min_lines"] <= n_lines <= _qt_rules["max_lines"]:
            _qt_pass.append(f"lines={n_lines}")
        else:
            _qt_fail.append(f"lines={n_lines} (expected {_qt_rules['min_lines']}-{_qt_rules['max_lines']})")
        
        # 2) Equity sector diversity
        _eq_sectors = set()
        for _tk, _info in _qt_meta.items():
            if _info.get("category") == "Actions":
                _ind = _info.get("industry", "").lower()
                if _ind:
                    # Map to broad sector
                    if any(x in _ind for x in ["drug", "biotech", "medical", "health"]):
                        _eq_sectors.add("healthcare")
                    elif any(x in _ind for x in ["oil", "gas", "energy"]):
                        _eq_sectors.add("energy")
                    elif any(x in _ind for x in ["semi", "software", "tech"]):
                        _eq_sectors.add("tech")
                    elif any(x in _ind for x in ["bank", "insurance", "financial"]):
                        _eq_sectors.add("financials")
                    elif any(x in _ind for x in ["reit", "real estate"]):
                        _eq_sectors.add("real_estate")
                    elif any(x in _ind for x in ["industrial", "machinery", "aerospace", "defense"]):
                        _eq_sectors.add("industrials")
                    elif any(x in _ind for x in ["mining", "metal", "material"]):
                        _eq_sectors.add("materials")
                    else:
                        _eq_sectors.add("other")
        _min_sec = _qt_rules.get("min_equity_sectors", 2)
        if len(_eq_sectors) >= _min_sec:
            _qt_pass.append(f"sectors={len(_eq_sectors)}")
        else:
            _qt_fail.append(f"sectors={len(_eq_sectors)} < {_min_sec} ({_eq_sectors})")
        
        # 3) Bond allocation
        _bond_pct = sum(w * 100 for _tk, w in _qt_tickers.items()
                       if _qt_meta.get(_tk, {}).get("category") == "Obligations")
        _bf = _qt_rules.get("bond_floor_pct", 0)
        _bc = _qt_rules.get("bond_ceil_pct", 100)
        if _bf <= _bond_pct <= _bc:
            _qt_pass.append(f"bonds={_bond_pct:.0f}%")
        else:
            _qt_fail.append(f"bonds={_bond_pct:.0f}% (expected {_bf}-{_bc}%)")
        
        # 4) Gold hedge
        if _qt_rules.get("has_hedge_gold"):
            _gold_tickers = {"GLD", "GDE", "IAU", "SGOL", "GLDM", "AAAU"}
            if _gold_tickers & set(_qt_tickers.keys()):
                _qt_pass.append("gold=yes")
            else:
                _qt_fail.append("gold=MISSING")
        
        # 5) Healthcare hedge
        if _qt_rules.get("has_hedge_hc"):
            _hc_tickers = {"XLV", "XBI", "VHT", "FHLC", "XPH", "IBB"}
            if _hc_tickers & set(_qt_tickers.keys()):
                _qt_pass.append("hc_etf=yes")
            else:
                _qt_fail.append("hc_etf=MISSING")
        
        # 6) IG credit (Stable)
        if _qt_rules.get("has_ig_credit"):
            _ig_tickers = {"VCIT", "LQD", "IGSB", "VCSH"}
            if _ig_tickers & set(_qt_tickers.keys()):
                _qt_pass.append("ig_credit=yes")
            else:
                _qt_fail.append("ig_credit=MISSING")
        
        # 7) Low-beta stock presence
        _min_lb = _qt_rules.get("min_low_beta_stocks", 0)
        if _min_lb > 0:
            _lb_count = sum(1 for _tk, _info in _qt_meta.items()
                          if _info.get("category") == "Actions" 
                          and _info.get("beta") is not None
                          and float(_info.get("beta", 99)) < 0.7)
            if _lb_count >= _min_lb:
                _qt_pass.append(f"low_beta={_lb_count}")
            else:
                _qt_fail.append(f"low_beta={_lb_count} < {_min_lb}")
        
        # Result
        _qt_score = len(_qt_pass) / max(len(_qt_pass) + len(_qt_fail), 1) * 100
        if _qt_fail:
            logger.warning(
                f"   ⚠️ [{_qt_profile}] Quality {_qt_score:.0f}% — "
                f"PASS: {', '.join(_qt_pass)} | FAIL: {', '.join(_qt_fail)}"
            )
        else:
            logger.info(
                f"   ✅ [{_qt_profile}] Quality {_qt_score:.0f}% — "
                f"ALL PASS: {', '.join(_qt_pass)}"
            )


def save_portfolios_euus(portfolios: Dict, assets: list):
    """Sauvegarde les portefeuilles EU/US Focus."""
    os.makedirs("data", exist_ok=True)
    
    v1_data = normalize_to_frontend_v1(portfolios, assets)
    
    # Ajouter flags EU/US dans meta
    v1_data["_meta"]["euus_mode"] = True
    v1_data["_meta"]["geographic_filter"] = "EU + US only"
    v1_data["_meta"]["blocked_regions"] = ["IN", "ASIA_EX_IN", "LATAM"]
    
    euus_path = CONFIG.get("euus_output_path", "data/portfolios_euus.json")
    with open(euus_path, "w", encoding="utf-8") as f:
        json.dump(v1_data, f, ensure_ascii=False, indent=2)
    logger.info(f"✅ Sauvegardé: {euus_path}")
    
    # Archive
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_path = f"{CONFIG['history_dir']}/portfolios_euus_{ts}.json"
    with open(archive_path, "w", encoding="utf-8") as f:
        json.dump(v1_data, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"✅ Archive EU/US: {archive_path}")
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        n_assets = len(portfolios.get(profile, {}).get("allocation", {}))
        logger.info(f"   EU/US {profile}: {n_assets} lignes")        


def save_backtest_results(backtest_data: Dict):
    """Sauvegarde les résultats du backtest."""
    os.makedirs("data", exist_ok=True)
    
    output_path = CONFIG["backtest_output"]
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(backtest_data, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"✅ Backtest sauvegardé: {output_path}")
    
def save_backtest_results_euus(backtest_data: Dict):
    """Sauvegarde les résultats du backtest EU/US."""
    os.makedirs("data", exist_ok=True)
    
    output_path = CONFIG.get("backtest_euus_output", "data/backtest_results_euus.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(backtest_data, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"✅ Backtest EU/US sauvegardé: {output_path}")  


# ============= MAIN =============

def main():
    """Point d'entrée principal."""
    logger.info("=" * 60)
    logger.info("🚀 Portfolio Engine v5.1.0 - Option B Architecture (preset_meta = equity scoring)")
    logger.info("=" * 60)
    
    # v5.1.0: Initialiser audit collector
    audit_collector = None
    if AUDIT_COLLECTOR_AVAILABLE and CONFIG.get("debug_audit_level", "none") != "none":
        audit_collector = init_audit(
            config=CONFIG,
            universe_asof=datetime.datetime.now().strftime("%Y-%m-%d"),
            previous_summary_path="data/selection_debug.json",
        )
        logger.info(f"📊 Audit collector initialisé (level={CONFIG.get('debug_audit_level')})")
    
    # v5.0.0: Log configuration scoring au démarrage
    log_scoring_config()
    
    # v5.0.0: Validation des dépendances
    if EQUITY_SCORING_CONFIG["mode"] == "preset" and not HAS_PRESET_META_V5:
        logger.warning("⚠️ Mode 'preset' demandé mais preset_meta v5.0.0 non disponible!")
        logger.warning("   → Fallback vers mode 'factors'")
        EQUITY_SCORING_CONFIG["mode"] = "factors"
    
    brief_data = load_brief_data()
    
    # === 1. PORTEFEUILLES GLOBAUX ===
    logger.info("\n" + "=" * 60)
    logger.info("🌍 GÉNÉRATION PORTEFEUILLES GLOBAUX")
    logger.info("=" * 60)
    
    portfolios, assets = build_portfolios_deterministic()
    portfolios = add_commentary(portfolios, assets, brief_data)
    portfolios = apply_compliance(portfolios)
    
    save_portfolios(portfolios, assets)

    # === v8.x.5: Injection ETF Foundation pour profils Dividende ===
    # Le pipeline produit naturellement les picks ; on injecte Amundi MSCI EU HD
    # (64% PEA) et SCHD (67% CTO) en post-process pour que le frontend affiche
    # le plan d'exécution complet validé par l'expert.
    try:
        inject_etf_foundation_dividende(CONFIG.get("output_path", "data/portfolios.json"))
    except Exception as _etf_e:
        logger.warning(f"⚠️ Échec injection ETF Foundation Dividende: {_etf_e}")

    # v6.24: substitution actions asiatiques non-accessibles via broker user
    # Lit config/broker_access.json (édité via broker_access.html)
    try:
        apply_broker_access_substitution(CONFIG.get("output_path", "data/portfolios.json"))
    except Exception as _bk_e:
        logger.warning(f"⚠️ Échec substitution broker access: {_bk_e}")

    # v6.26: top picks curated (meilleures actions pour achats ponctuels)
    # Génère data/top_picks_curated.json — top 25 global + top 10/pays + top 10/secteur
    # avec scoring composite Buffett + Quality + Perf + RADAR contextuel
    try:
        import subprocess
        result = subprocess.run(
            ["python3", "scripts/build_top_picks_curated.py"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            logger.info("   ✓ Top picks curated généré : data/top_picks_curated.json")
        else:
            logger.warning(f"⚠️ Top picks curated stderr: {result.stderr[:300]}")
    except Exception as _tp_e:
        logger.warning(f"⚠️ Échec top picks curated: {_tp_e}")

    # v6.30: archive rendements forward propres pour backtest futur
    # Vérifie quelles fenêtres (1m/3m/6m/12m) se ferment aujourd'hui et archive
    # les rendements correspondants avec corrections : devise EUR, total return
    # (div inclus), délisting (-100% au lieu de NaN), tagging fenêtres pour
    # dédup non-overlap au moment du test.
    try:
        import subprocess
        result = subprocess.run(
            ["python3", "scripts/forward_returns_archiver.py"],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0:
            logger.info("   ✓ Forward returns archiver tourné")
            if result.stdout:
                for line in result.stdout.strip().split("\n")[-3:]:
                    logger.info(f"      {line}")
        else:
            logger.warning(f"⚠️ Forward returns stderr: {result.stderr[:300]}")
    except Exception as _fr_e:
        logger.warning(f"⚠️ Échec forward returns archiver: {_fr_e}")

    # === v7.4: Génération des justifications LLM APRÈS save_portfolios ===
    # Rationales must be generated on the FINAL tickers (post-dedup, post-cap, post-round)
    # Otherwise tickers mismatch: rationale for EMHC but portfolio has SLV after dedup
    if CONFIG.get("generate_asset_rationales", False) and ASSET_RATIONALE_AVAILABLE:
        logger.info("\n" + "=" * 60)
        logger.info("📝 GÉNÉRATION JUSTIFICATIONS LLM PAR ACTIF (Claude Sonnet → fallback)")
        logger.info("=" * 60)

        try:
            import json as _json
            output_path = CONFIG.get("output_path", "data/portfolios.json")
            with open(output_path) as _f:
                saved_portfolios = _json.load(_f)

            # Build fake portfolios dict with allocation from final _tickers
            # v8.x: étendu aux profils Dividende (justifications LLM aussi pour eux)
            portfolios_for_rationale = {}
            for profile in _active_profiles(CONFIG):
                if profile not in saved_portfolios:
                    continue
                _tickers = saved_portfolios[profile].get("_tickers", {})
                # Convert decimal weights to percentage for the rationale prompt
                allocation = {tk: w * 100 for tk, w in _tickers.items() if w > 0}
                portfolios_for_rationale[profile] = {
                    "allocation": allocation,
                    "diagnostics": portfolios.get(profile, {}).get("diagnostics", {}),
                    "assets": portfolios.get(profile, {}).get("assets", []),
                }

            # OpenAI client optionnel (fallback only)
            openai_client = None
            api_key = os.environ.get("API_CHAT") or os.environ.get("OPENAI_API_KEY")
            if api_key:
                try:
                    from openai import OpenAI
                    openai_client = OpenAI(api_key=api_key)
                except ImportError:
                    logger.info("   OpenAI SDK not installed, Claude-only mode")

            market_context = load_market_context_radar(CONFIG.get("market_data_dir", "data"))

            rationales = generate_asset_rationales_sync(
                portfolios=portfolios_for_rationale,
                assets=assets,
                market_context=market_context,
                openai_client=openai_client,
                model=CONFIG.get("llm_model", "gpt-4o-mini"),
            )

            # Inject rationales back into the saved JSON
            # v8.x: étendu aux profils Dividende si actifs
            _profiles_for_inject = _active_profiles(CONFIG)
            for profile in _profiles_for_inject:
                if profile in rationales and rationales[profile]:
                    saved_portfolios[profile]["_asset_details"] = rationales[profile]
                    logger.info(f"✅ {profile}: {len(rationales[profile])} justifications ajoutées")

            # v8.x: injecter les benchmarks de référence pour les profils Dividende
            _bench_path = os.path.join("config", "dividend_benchmarks.json")
            if os.path.exists(_bench_path):
                try:
                    with open(_bench_path, "r", encoding="utf-8") as _bf:
                        _bench_data = _json.load(_bf)
                    _bench_map = _bench_data.get("benchmarks", {})
                    _bench_global = _bench_map.get("global_discipline")
                    _bench_protocol = _bench_data.get("comparison_protocol")
                    for profile in ("Dividende-PEA", "Dividende-CTO"):
                        if profile in saved_portfolios:
                            saved_portfolios[profile]["_benchmarks"] = {
                                "primary": _bench_map.get(profile, {}),
                                "global": _bench_global,
                                "protocol": _bench_protocol,
                            }
                    logger.info("✅ Benchmarks de référence injectés dans les profils Dividende")
                except (OSError, ValueError) as _be:
                    logger.warning(f"⚠️ Échec injection benchmarks: {_be}")

            with open(output_path, "w", encoding="utf-8") as _f:
                _json.dump(saved_portfolios, _f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Justifications injectées dans {output_path}")

        except Exception as e:
            logger.error(f"❌ Erreur génération justifications: {e}")
            import traceback
            traceback.print_exc()

    # v7.2.1: Correlation diagnostics JSON
    try:
        from portfolio_engine.correlation_diagnostics import generate_correlation_diagnostics
        # Re-read saved portfolios (save_portfolios applies dedup + normalization)
        import json as _json
        with open(CONFIG.get("output_path", "data/portfolios.json")) as _f:
            _saved = _json.load(_f)
        generate_correlation_diagnostics(_saved, output_path="data/correlation_diagnostics.json")
        logger.info("✅ Correlation diagnostics generated")
    except Exception as _e:
        logger.warning(f"⚠️ Correlation diagnostics failed: {_e}")

    # === 2. PORTEFEUILLES EU/US FOCUS ===
    if CONFIG.get("generate_euus_portfolios", False) and HAS_EUUS_PROFILES:
        logger.info("\n" + "=" * 60)
        logger.info("🇪🇺🇺🇸 GÉNÉRATION PORTEFEUILLES EU/US FOCUS")
        logger.info("=" * 60)
        
        try:
            portfolios_euus, assets_euus = build_portfolios_euus()
            
            if portfolios_euus and any(p.get("allocation") for p in portfolios_euus.values()):
                portfolios_euus = add_commentary(portfolios_euus, assets_euus, brief_data)
                portfolios_euus = apply_compliance(portfolios_euus)
                save_portfolios_euus(portfolios_euus, assets_euus)
                logger.info("✅ Portefeuilles EU/US générés avec succès")
            else:
                logger.warning("⚠️ Aucun portefeuille EU/US généré (univers insuffisant?)")
        except Exception as e:
            logger.error(f"❌ Erreur génération EU/US: {e}")
            import traceback
            traceback.print_exc()
    else:
        if not CONFIG.get("generate_euus_portfolios", False):
            logger.info("⏭️  Génération EU/US désactivée (generate_euus_portfolios=False)")
        else:
            logger.warning("⚠️ PROFILES_EUUS non disponible")
    
    # === 3. BACKTEST GLOBAL ===
    backtest_results = None
    if CONFIG["run_backtest"]:
        yaml_config = load_yaml_config(CONFIG["config_path"])
        backtest_results = run_backtest_all_profiles(yaml_config)
        
        if not backtest_results.get("skipped"):
            save_backtest_results(backtest_results)
    
    # === 4. BACKTEST EU/US ===
    backtest_euus_results = None
    if CONFIG["run_backtest"] and CONFIG.get("generate_euus_portfolios", False):
        yaml_config = load_yaml_config(CONFIG["config_path"])
        backtest_euus_results = run_backtest_euus_profiles(yaml_config)
        
        if not backtest_euus_results.get("skipped"):
            save_backtest_results_euus(backtest_euus_results)
    # === 4.5 DUMP AUDIT COLLECTOR ===
    if audit_collector:
        try:
            audit_collector.dump(CONFIG.get("debug_audit_output_dir", "data"))
            logger.info("📊 Audit debug exporté")
        except Exception as e:
            logger.error(f"❌ Erreur dump audit: {e}")
    
    # === 4.6 STRESS TEST ===
    stress_results = None
    try:
        from stress_test import run_all_profiles as run_stress_all, save_stress_report, print_stress_summary
        
        logger.info("\n" + "=" * 60)
        logger.info("🧪 STRESS TEST — 5 scénarios historiques")
        logger.info("=" * 60)
        
        # v2.3 FIX: Load v1_data from saved JSON (it's local to save_portfolios, not in main scope)
        _stress_path = CONFIG["output_path"]
        with open(_stress_path, "r", encoding="utf-8") as _sf:
            _v1_for_stress = json.load(_sf)
        
        stress_results = run_stress_all(_v1_for_stress)
        
        if stress_results:
            save_stress_report(stress_results)
            
            # Log summary
            for _st_profile, _st_data in stress_results.items():
                _st_worst = _st_data.get("worst_case", {})
                _st_risk = _st_data.get("risk_assessment", {})
                logger.info(
                    f"  {_st_profile}: worst={_st_worst.get('drawdown_pct', '?'):.1f}% "
                    f"({_st_worst.get('name', '?')}) — {_st_risk.get('level', '?')}"
                )
            
            # Inject stress summary into portfolio data for frontend display
            for _st_profile in ["Agressif", "Modéré", "Stable"]:
                if _st_profile in stress_results and _st_profile in _v1_for_stress:
                    _st = stress_results[_st_profile]
                    _v1_for_stress[_st_profile]["_stress_test"] = {
                        "worst_case": _st["worst_case"],
                        "risk_level": _st["risk_assessment"]["level"],
                        "scenarios": {
                            k: {"drawdown_pct": v["portfolio_drawdown_pct"], "name": v["name"]}
                            for k, v in _st["scenarios"].items()
                        },
                    }
            
            # Re-save portfolios with stress test results
            with open(_stress_path, "w", encoding="utf-8") as _sf:
                json.dump(_v1_for_stress, _sf, ensure_ascii=False, indent=2)
            logger.info(f"✅ Portfolios re-saved with stress test data")
        
    except ImportError:
        logger.info("ℹ️ [STRESS] stress_test.py not found — skipping")
    except Exception as e:
        logger.warning(f"⚠️ [STRESS] Error: {e} — portfolios unchanged")
    
    # === 4.7 LOMBARD RANKING ===
    lombard_results = None
    if CONFIG.get("generate_lombard_ranking", False):
        try:
            from portfolio_engine.lombard_ranking import generate_lombard_ranking
            
            # Charger config YAML si dispo
            _lombard_yaml = {}
            try:
                _lomb_yc = load_yaml_config(CONFIG["config_path"])
                _lombard_yaml = _lomb_yc.get("lombard", {})
            except Exception:
                pass
            
            _lombard_config = {
                **CONFIG,
                "lombard_output_path": _lombard_yaml.get("output_path", CONFIG.get("lombard_output_path", "data/lombard_ranking.json")),
            }
            
            lombard_results = generate_lombard_ranking(
                config=_lombard_config,
                lombard_rates=_lombard_yaml.get("rates", [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]),
                min_yield=_lombard_yaml.get("min_yield", 2.0),
                min_quality=_lombard_yaml.get("min_quality", 0),
                min_market_cap=_lombard_yaml.get("min_market_cap", 2e9),
                max_positions=_lombard_yaml.get("max_positions", 30),
            )
            
            if lombard_results and lombard_results.get("rankings"):
                _n_rates = len(lombard_results["rankings"])
                _n_eligible = lombard_results.get("_meta", {}).get("eligible_count", 0)
                logger.info(f"✅ Lombard: {_n_rates} hypothèses de taux, {_n_eligible} stocks éligibles")
            else:
                logger.warning("⚠️ Lombard ranking vide (aucun stock éligible?)")
                
        except ImportError:
            logger.info("ℹ️ [LOMBARD] lombard_ranking.py not found — skipping")
        except Exception as e:
            logger.warning(f"⚠️ [LOMBARD] Error: {e}")
    
    # === 5. RÉSUMÉ FINAL ===
    logger.info("\n" + "=" * 60)
    logger.info("✨ Génération terminée avec succès!")
    logger.info("=" * 60)
    logger.info("Fichiers générés:")
    logger.info(f"   • {CONFIG['output_path']} (Global)")
    if CONFIG.get("generate_euus_portfolios", False) and HAS_EUUS_PROFILES:
        logger.info(f"   • {CONFIG.get('euus_output_path', 'data/portfolios_euus.json')} (EU/US Focus)")
    if backtest_results and not backtest_results.get("skipped"):
        logger.info(f"   • {CONFIG['backtest_output']} (backtest)")
        if backtest_results.get("debug_file"):
            logger.info(f"   • {backtest_results['debug_file']} (debug détaillé)")
    if stress_results:
        logger.info(f"   • data/stress_test_report.json (stress test)")
    if lombard_results and lombard_results.get("rankings"):
        logger.info(f"   • {CONFIG.get('lombard_output_path', 'data/lombard_ranking.json')} (Lombard Ranking)")
    logger.info("")
    logger.info("Fonctionnalités v4.14.0 (Round 14 PARFAIT FINAL - 10/10):")
    logger.info(f"   • ✅ PROFILE_POLICY: {'ACTIVÉ' if HAS_PROFILE_POLICY else 'DÉSACTIVÉ'}")
    logger.info("   • ✅ P0-1: _tickers source unique (cohérence display)")
    logger.info("   • ✅ P0-2: max_assets enforcement + prune")
    logger.info("   • ✅ P1-3/4: hard vs indicators + ROE sanity check")
    logger.info("   • ✅ Round 9-13: Full precision, bucket 'Autres', normalisation %, EU/US _safe_float")
    logger.info("   • ✅ Round 14: display_name TOUJOURS unique avec ticker")
    logger.info("   • ✅ Round 14: ticker_to_asset_id sans name (évite collisions)")
    logger.info("   • ✅ Round 14: post_process_allocation() unifié Global + EU/US")
    logger.info("   • ✅ Sélection d'équités DIFFÉRENTE par profil (Agressif ≠ Modéré ≠ Stable)")
    logger.info("   • ✅ Scoring différencié: momentum/growth (Agressif), quality/value (Modéré), defensive/dividend (Stable)")
    logger.info("   • ✅ Diagnostic overlap entre profils")
    logger.info("   • ✅ Portefeuilles EU/US Focus (Europe + USA uniquement)")
    logger.info("   • ✅ backtest_debug.json avec prix réels et calculs")
    tactical_mode = CONFIG.get("tactical_mode", "radar")
    if CONFIG.get("use_tactical_context", False):
        smoothing = CONFIG.get("tactical_rules", {}).get("smoothing_alpha", 0.3)
        logger.info(f"   • Tilts tactiques ACTIVÉS (mode={tactical_mode}, smoothing={smoothing})")
    else:
        logger.info("   • Tilts tactiques DÉSACTIVÉS")
    logger.info(f"   • Platform fee: {CONFIG.get('platform_fee_annual_bp', 0)}bp/an")
    buffett_by_profile = CONFIG.get("buffett_min_score_by_profile", {})
    logger.info(f"   • Filtre Buffett: mode={CONFIG['buffett_mode']}, seuils par profil={buffett_by_profile}")


# =============================================================================
# v4.14.0 R13: SANITY CHECK AUTOMATIQUE
# =============================================================================

def sanity_check_portfolios(v1_data: dict) -> bool:
    """
    v4.15.0 P1 FIX: Vérifie les invariants critiques après génération.
    
    Corrections:
    - max_single basé sur le profil (pas hardcodé 15.2%)
    - Vérification sur _tickers (actifs individuels), pas _numeric_weights (agrégés)
    
    Args:
        v1_data: Données normalisées (output de normalize_to_frontend_v1)
    
    Returns:
        True si tous les checks passent, False sinon
    """
    all_ok = True
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in v1_data:
            logger.warning(f"   ⚠️ sanity_check: profil {profile} manquant")
            continue
        
        p = v1_data[profile]
        tickers = p.get("_tickers", {}) or {}
        
        # 1) _tickers somme ~ 1
        s_t = sum(tickers.values()) if tickers else 0.0
        if abs(s_t - 1.0) > 0.005:
            logger.error(f"   ❌ {profile} _tickers sum={s_t:.4f} (expected ~1.0)")
            all_ok = False
        else:
            logger.info(f"   ✅ {profile} _tickers sum={s_t:.4f} OK")
        
        # 2) v6.0 (2026-06-03) : max_single check tient compte du rôle Core-Satellite.
        # Les ETF cœur broad (role="core" dans _tickers_meta) peuvent être ≤ 50%
        # par construction (VWCE 50% Modéré/Agressif, STIP/VGSH 25% Stable cœur).
        # Les positions satellite (role="satellite") sont capées à 5% par le module
        # core_satellite_discipline. Le cap 15% legacy ne s'applique qu'aux positions
        # sans rôle explicite (pipeline v5 et antérieur).
        profile_config = PROFILES.get(profile)
        _profile_max = getattr(profile_config, "max_single_position", 15.0)
        legacy_cap = max(_profile_max, 15.0) + 0.2
        CORE_BROAD_CAP = 55.0    # cœur UCITS broad ETF peut atteindre 50% by design
        SATELLITE_CAP = 5.5      # satellite individuel capé à 5%

        meta = p.get("_tickers_meta", {}) or {}
        biggest = 0.0
        biggest_ticker = None
        violations = []
        for tk, w in tickers.items():
            w_pct = w * 100
            role = (meta.get(tk, {}) or {}).get("role", "")
            if role == "core":
                effective_cap = CORE_BROAD_CAP
            elif role == "satellite":
                effective_cap = SATELLITE_CAP
            else:
                effective_cap = legacy_cap
            if w_pct > biggest:
                biggest = w_pct
                biggest_ticker = tk
            if w_pct > effective_cap:
                violations.append(f"{tk}({role or 'unknown'})={w_pct:.1f}%>{effective_cap:.1f}%")

        if violations:
            logger.error(f"   ❌ {profile} cap violations: {', '.join(violations[:3])}")
            all_ok = False
        else:
            logger.info(f"   ✅ {profile} max position={biggest:.1f}% ({biggest_ticker}) within role-aware caps")
        
        # 3) readable somme ~ 100 (via _numeric_weights pour info)
        nw = p.get("_numeric_weights", {})
        s_r = sum(nw.values()) if nw else 0.0
        if abs(s_r - 100.0) > 0.5:
            logger.warning(f"   ⚠️ {profile} readable sum={s_r:.1f}% (expected ~100%)")
        else:
            logger.info(f"   ✅ {profile} readable sum={s_r:.1f}% OK")
        
        # 4) hard constraints = 0 violation
        cr = p.get("_constraint_report", {})
        hard = cr.get("hard_constraints", [])
        if len(hard) > 0:
            logger.error(f"   ❌ {profile} hard violated: {[h.get('name') for h in hard]}")
            all_ok = False
        else:
            logger.info(f"   ✅ {profile} hard constraints OK (0 violation)")
        
        # 5) v4.15.0: Vérifier les tickers non tradables
        unpriced = p.get("_unpriced_assets", [])
        if unpriced:
            logger.warning(f"   ⚠️ {profile} {len(unpriced)} ticker(s) non tradable(s): {[u.get('candidate', '?')[:20] for u in unpriced[:3]]}")
    
    if all_ok:
        logger.info("✅ SANITY CHECK PASSED: Tous les invariants sont respectés")
    else:
        logger.error("❌ SANITY CHECK FAILED: Certains invariants ne sont pas respectés")
    
    return all_ok
# =============================================================================
# v5.0.0: TESTS SCORING MODE
# =============================================================================

def test_scoring_modes():
    """v5.0.0: Test des différents modes de scoring."""
    print("\n" + "=" * 60)
    print("TEST v5.0.0: EQUITY_SCORING_CONFIG")
    print("=" * 60)
    
    # Test 1: Config exists
    assert "mode" in EQUITY_SCORING_CONFIG
    assert EQUITY_SCORING_CONFIG["mode"] in ["preset", "factors", "blend"]
    print(f"✅ Mode configuré: {EQUITY_SCORING_CONFIG['mode']}")
    
    # Test 2: Log function exists
    try:
        log_scoring_config()
        print("✅ log_scoring_config() OK")
    except Exception as e:
        print(f"❌ log_scoring_config() failed: {e}")
    
    # Test 3: Validation function
    test_equities = [
        {"name": "TEST1", "_profile_score": 0.75, "_matched_preset": "quality_premium", "_buffett_score": 80},
        {"name": "TEST2", "_profile_score": 0.55, "_matched_preset": "croissance", "_buffett_score": 60},
    ]
    stats = validate_scoring_pipeline(test_equities, "Agressif")
    assert stats["has_profile_score"] == 2
    assert stats["has_buffett_score"] == 2
    print(f"✅ validate_scoring_pipeline() OK: {stats['score_distribution']}")
    
    print("\n" + "=" * 60)
    print("v5.0.0 TESTS PASSED")
    print("=" * 60)   


if __name__ == "__main__":
    main()
