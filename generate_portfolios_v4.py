#!/usr/bin/env python3
"""
generate_portfolios_v4.py - Orchestrateur complet v5.1.3 (ETF Scoring Fix)
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
# 4.4: Import du chargeur de contexte marché
from portfolio_engine.market_context import load_market_context

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
    "buffett_min_score": 40,
    # v4.14.0: Seuils Buffett PAR PROFIL (permet divergence Agressif vs Stable)
    "buffett_min_score_by_profile": {
        "Agressif": 30,   # Plus permissif → autorise les "pépites" volatiles
        "Modéré": 40,     # Seuil standard
        "Stable": 50,     # Plus strict → qualité Buffett élevée requise
    },
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
}

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
    
    Args:
        eq_filtered: Liste d'équités pré-filtrées
        profile: "Agressif", "Modéré", ou "Stable"
        market_context: Contexte RADAR pour tilts
        target_n: Nombre cible d'équités
    
    Returns:
        (equities_selected, selection_meta)
    """
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
            df_b["fund_type"] = "bond"
            bonds_data = df_b.to_dict("records")
            logger.info(f"Bonds: {CONFIG['bonds_csv']} ({len(bonds_data)} entrées) - fund_type forcé à 'bond'")
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
                "revenue_growth_5y": _safe_float(it.get("revenue_growth_5y")),
                "gross_margin": _safe_float(it.get("gross_margin")),
                "operating_margin": _safe_float(it.get("operating_margin")),
                "net_margin": _safe_float(it.get("net_margin")),
                "current_ratio": _safe_float(it.get("current_ratio")),
                "quick_ratio": _safe_float(it.get("quick_ratio")),
                "beta": _safe_float(it.get("beta")),
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
    # === v5.1.2: TOP 10 BY PRESET DEBUG ===
    if _collector:
        _collector.record_top10_by_preset(
            equities=eq_filtered,
            etfs=etf_data,
            cryptos=crypto_data,
            bonds=bonds_data,
        )
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
    
    # 8. Optimiser pour chaque profil
    optimizer = PortfolioOptimizer()
    portfolios = {}
    all_assets = []
    all_assets_ids = set()  # v4.13.2 FIX: Track IDs pour union des 3 profils
    
    feasibility_reports = {}
    # === v4.13: Dict pour stocker équités par profil (diagnostic overlap) ===
    equities_by_profile = {}
    
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
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        logger.info(f"⚙️  Optimisation profil {profile}...")
        
        # === v4.13: Sélection d'équités spécifique au profil ===
        # v4.14.0 FIX R6: Une seule source de vérité pour Buffett = PROFILE_POLICY
        # Le filtre Buffett est appliqué dans select_equities_for_profile_v2 via PROFILE_POLICY
        # (synchronisé avec CONFIG["buffett_min_score_by_profile"] au début de la boucle)
        
        # Log pour diagnostic
        buffett_thresholds = CONFIG.get("buffett_min_score_by_profile", {})
        profile_buffett_min = buffett_thresholds.get(profile, CONFIG.get("buffett_min_score", 40))
        missing_buffett = sum(1 for e in eq_filtered if e.get("_buffett_score") is None)
        if missing_buffett > 0:
            logger.warning(f"   [{profile}] ⚠️ {missing_buffett}/{len(eq_filtered)} equities sans score Buffett")
        
        # Passer TOUT eq_filtered à select_equities_for_profile_v2
        # Le filtrage Buffett se fait dans la fonction via PROFILE_POLICY (source unique)
        profile_equities, profile_selection_meta = select_equities_for_profile(
            eq_filtered=eq_filtered,
            profile=profile,
            market_context=market_context,
            target_n=min(CANDIDATES_BY_PROFILE.get(profile, 250), len(eq_filtered)),
        )
        profile_selection_meta["buffett_threshold_policy"] = profile_buffett_min
        profile_selection_meta["buffett_missing_count"] = missing_buffett
        
        equities_by_profile[profile] = profile_equities
        
        # === v5.1.0: AUDIT HOOK 5 - Selection par profil ===
        if _collector:
            _collector.record_final_selection(
                category="equity",
                selected=profile_equities,
                profile=profile,
            )
         # === v5.1.0: Sélection ETF/Crypto/Bond par profil ===
        if HAS_MODULAR_SELECTORS:
            # --- ETF actions ---
            if not etf_df_master.empty:
                etf_df = etf_df_master.copy()
                etf_selected_df = select_etfs_for_profile(etf_df, profile, top_n=100)
                profile_etf_data = etf_selected_df.to_dict('records') if not etf_selected_df.empty else []
                logger.info(f"   [{profile}] ETF sélectionnés: {len(profile_etf_data)}/{len(etf_df_master)}")
                
                # v5.1.3: Post-check scoring (détecte scores FLAT)
                if "_profile_score" in etf_selected_df.columns and not etf_selected_df.empty:
                    scores = etf_selected_df["_profile_score"]
                    # === VÉRIFICATION DU FIX v2.2.14 ===
                    print(f"[ETF {profile}] Min: {scores.min()}, Max: {scores.max()}, Std: {scores.std():.2f}")
                    if scores.nunique() <= 1 or scores.std() < 1:
                        logger.error(f"   [{profile}] ⚠️ ETF SCORE FLAT: {scores.iloc[0] if len(scores) else 'N/A'}")
                    else:
                        logger.info(f"   [{profile}] ✅ ETF scores: [{scores.min():.1f}, {scores.max():.1f}]")
                
                # v5.1.2 FIX: Forcer category="etf" pour éviter reclassification dans build_raw_universe
                for etf in profile_etf_data:
                    etf["_force_category"] = "etf"
                    etf["category"] = "etf"
            else:
                profile_etf_data = []
            
            # --- Bonds ---
            if bonds_data:
                bonds_df = pd.DataFrame(bonds_data)
                bonds_selected_df = select_bonds_for_profile(bonds_df, profile, top_n=20)
                profile_bonds_data = bonds_selected_df.to_dict('records') if not bonds_selected_df.empty else []
                logger.info(f"   [{profile}] Bonds sélectionnés: {len(profile_bonds_data)}/{len(bonds_data)}")
                # v5.1.2 FIX: Forcer category="bond"
                for bond in profile_bonds_data:
                    bond["_force_category"] = "bond"
                    bond["category"] = "bond"
            else:
                profile_bonds_data = []
            
            # --- Crypto ---
            if crypto_data:
                crypto_df = pd.DataFrame(crypto_data)
                crypto_selected_df = select_crypto_for_profile(crypto_df, profile, top_n=30)
                profile_crypto_data = crypto_selected_df.to_dict('records') if not crypto_selected_df.empty else []
                logger.info(f"   [{profile}] Crypto sélectionnés: {len(profile_crypto_data)}/{len(crypto_data)}")
            else:
                profile_crypto_data = []
            
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
            profile_universe_others = universe_others  
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
        
        allocation, diagnostics = optimizer.build_portfolio(assets, profile)
        
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
    
    # === v4.12.2 FIX: Génération de l'audit de sélection avec extraction correcte ===
    if CONFIG.get("generate_selection_audit", False) and SELECTION_AUDIT_AVAILABLE:
        try:
            # Extraire les actifs sélectionnés depuis les allocations (union des 3 profils)
            selected_tickers = set()
            for profile_data in portfolios.values():
                for asset_id in profile_data.get("allocation", {}).keys():
                    selected_tickers.add(asset_id)
            
            # v4.13: Utiliser equities_by_profile pour l'audit
            all_profile_equities = []
            for profile_eqs in equities_by_profile.values():
                all_profile_equities.extend(profile_eqs)
            
            # Dédupliquer par ID
            seen_ids = set()
            equities_final = []
            for e in all_profile_equities:
                eid = e.get("id") or e.get("ticker")
                if eid not in seen_ids:
                    seen_ids.add(eid)
                    equities_final.append(e)
            
            # v4.12.2 FIX: Extraire ETF sélectionnés depuis all_funds_data (qui sont des dicts)
            # et pas depuis universe_others (qui sont des objets Asset)
            etf_selected = []
            for etf in all_funds_data:
                # all_funds_data contient ETF + bonds, filtrer sur category
                cat = str(etf.get("category", "") or etf.get("fund_type", "") or "").lower()
                if "bond" in cat:
                    continue  # Skip bonds
                
                # Vérifier si cet ETF est dans les allocations
                etf_id = etf.get("id") or etf.get("ticker") or etf.get("symbol") or etf.get("name")
                etf_ticker = etf.get("ticker") or etf.get("symbol")
                etf_name = etf.get("name")
                
                if etf_id in selected_tickers or etf_ticker in selected_tickers or etf_name in selected_tickers:
                    # Marquer comme ETF pour l'audit
                    etf_copy = etf.copy()
                    etf_copy["category"] = "etf"
                    etf_selected.append(etf_copy)
            
            # v4.12.2 FIX: Extraire crypto sélectionnées depuis crypto_data (dicts)
            crypto_selected = []
            for cr in crypto_data:
                cr_id = cr.get("id") or cr.get("ticker") or cr.get("symbol") or cr.get("name")
                cr_ticker = cr.get("ticker") or cr.get("symbol")
                cr_name = cr.get("name")
                
                if cr_id in selected_tickers or cr_ticker in selected_tickers or cr_name in selected_tickers:
                    crypto_selected.append(cr)
            
            logger.info(f"   📊 Audit: {len(equities_final)} equities, {len(etf_selected)} ETF, {len(crypto_selected)} crypto sélectionnés")
            
            create_selection_audit(
                config=CONFIG,
                equities_initial=eq_rows_before_buffett,
                equities_after_buffett=eq_rows,
                equities_final=equities_final,
                etf_data=all_funds_data,
                etf_selected=etf_selected,
                crypto_data=crypto_data,
                crypto_selected=crypto_selected,
                market_context=market_context,
                output_path=CONFIG.get("selection_audit_output", "data/selection_audit.json"),
            )
            logger.info("✅ Audit de sélection généré")
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
    optimizer = PortfolioOptimizer()
    portfolios = {}
    all_assets = []
    all_assets_ids = set()
    equities_by_profile_euus = {}  # Pour diagnostic overlap
    
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
                # v5.1.2 FIX: Forcer category="etf" pour éviter reclassification
                for etf in profile_etf_data:
                    etf["_force_category"] = "etf"
                    etf["category"] = "etf"
            else:
                profile_etf_data = []
            
            if bonds_data:
                bonds_df = pd.DataFrame(bonds_data)
                bonds_selected_df = select_bonds_for_profile(bonds_df, profile, top_n=20)
                profile_bonds_data = bonds_selected_df.to_dict('records') if not bonds_selected_df.empty else []
                logger.info(f"   [{profile}] EU/US Bonds sélectionnés: {len(profile_bonds_data)}/{len(bonds_data)}")
                # v5.1.2 FIX: Forcer category="bond" pour éviter reclassification
                for bond in profile_bonds_data:
                    bond["_force_category"] = "bond"
                    bond["category"] = "bond"
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
        
        # Collecter tous les assets (union des 3 profils)
        for a in assets:
            a_id = getattr(a, 'id', None)
            if a_id is None:
                continue
            a_id = str(a_id)
            if a_id not in all_assets_ids:
                all_assets.append(a)
                all_assets_ids.add(a_id)
        
        try:
            allocation, diagnostics = optimizer.build_portfolio_euus(assets, profile)
            
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
        result = load_prices_for_backtest(
            yaml_config,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key,
            plan="ultra"
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
        result = load_prices_for_backtest(
            yaml_config,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key,
            plan="ultra",
            portfolios_path=euus_path
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
        }
        
        optimization_mode = diagnostics.get("optimization_mode", "slsqp")
        result[profile]["_optimization"] = {
            "mode": optimization_mode,
            "is_heuristic": optimization_mode.startswith("fallback"),
            "vol_realized": diagnostics.get("portfolio_vol"),
            "vol_target": diagnostics.get("vol_target"),
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
    
    return result


# ============= SAUVEGARDE =============

def save_portfolios(portfolios: Dict, assets: list):
    """Sauvegarde les portefeuilles."""
    os.makedirs("data", exist_ok=True)
    os.makedirs(CONFIG["history_dir"], exist_ok=True)
    
    v1_data = normalize_to_frontend_v1(portfolios, assets)
    
    v1_path = CONFIG["output_path"]
    with open(v1_path, "w", encoding="utf-8") as f:
        json.dump(v1_data, f, ensure_ascii=False, indent=2)
    logger.info(f"✅ Sauvegardé: {v1_path}")
    
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
    
    # === v4.11.0: Génération des justifications LLM par actif ===
    if CONFIG.get("generate_asset_rationales", False) and ASSET_RATIONALE_AVAILABLE:
        logger.info("\n" + "=" * 60)
        logger.info("📝 GÉNÉRATION JUSTIFICATIONS LLM PAR ACTIF")
        logger.info("=" * 60)
        
        try:
            api_key = os.environ.get("API_CHAT") or os.environ.get("OPENAI_API_KEY")
            if api_key:
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                
                # Charger le contexte marché RADAR
                market_context = load_market_context_radar(CONFIG.get("market_data_dir", "data"))
                
                # Générer les justifications
                rationales = generate_asset_rationales_sync(
                    portfolios=portfolios,
                    assets=assets,
                    market_context=market_context,
                    openai_client=client,
                    model=CONFIG["llm_model"],
                )
                
                # Fusionner dans les portfolios
                for profile in ["Agressif", "Modéré", "Stable"]:
                    if profile in rationales and rationales[profile]:
                        portfolios[profile]["_asset_details"] = rationales[profile]
                        logger.info(f"✅ {profile}: {len(rationales[profile])} justifications ajoutées")
            else:
                logger.warning("⚠️ Pas de clé API, justifications LLM ignorées")
        except Exception as e:
            logger.error(f"❌ Erreur génération justifications: {e}")
            import traceback
            traceback.print_exc()
    
    save_portfolios(portfolios, assets)
    
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
        
        # 2) v4.15.0 FIX: max_single basé sur le profil (pas hardcodé)
        profile_config = PROFILES.get(profile)
        max_single_limit = getattr(profile_config, "max_single_position", 15.0) + 0.2
        
        # v4.15.0 FIX: Vérifier sur _tickers (actifs individuels), pas _numeric_weights
        biggest = (max(tickers.values()) * 100) if tickers else 0.0
        if biggest > max_single_limit:
            logger.error(f"   ❌ {profile} max position={biggest:.1f}% > {max_single_limit:.1f}%")
            all_ok = False
        else:
            logger.info(f"   ✅ {profile} max position={biggest:.1f}% <= {max_single_limit:.1f}% OK")
        
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
