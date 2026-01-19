#!/usr/bin/env python3
"""
generate_portfolios_v4.py - Orchestrateur complet

Architecture v4 :
- Python décide les poids (déterministe via portfolio_engine)
- LLM génère uniquement les justifications (prompt compact)
- Compliance AMF appliquée systématiquement
- Backtest 90j intégré avec comparaison des 3 profils
- Filtre Buffett sectoriel intégré

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

# === v4.13.2: Import PROFILE_POLICY + select_equities_for_profile corrigé ===
try:
    from portfolio_engine.preset_meta import (
        PROFILE_POLICY,
        get_profile_policy,
        score_equity_for_profile,
        filter_equities_by_profile,
        compute_universe_stats,
        select_equities_for_profile as select_equities_for_profile_v2,  # v4.13.2
        diagnose_profile_overlap,  # v4.13.2
    )
    HAS_PROFILE_POLICY = True
except ImportError:
    HAS_PROFILE_POLICY = False
    PROFILE_POLICY = {}
    def get_profile_policy(p): return {}
    def score_equity_for_profile(e, p, s): return e.get("composite_score", 0)
    def filter_equities_by_profile(e, p): return e
    def compute_universe_stats(e): return {}

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
    # === v4.12.1: Selection Explainer (TOP caps analysis) ===
    "generate_selection_explained": True,
    "selection_explained_output": "data/selection_explained.json",
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
    """v4.7 P0 FIX: Arrondit les poids pour que la somme = exactement 100%."""
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
        return {k: round(v * 100 / total, decimals) for k, v in weights.items()}
    
    rounded[first_name] = first_weight
    return rounded


def format_weight_as_percent(weight: float, decimals: int = 0) -> str:
    """Formate un poids en string pourcentage."""
    if decimals == 0:
        return f"{int(round(weight))}%"
    else:
        return f"{weight:.{decimals}f}%"


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
    etf_data = []
    bonds_data = []
    crypto_data = []
    
    if Path(CONFIG["etf_csv"]).exists():
        try:
            df = pd.read_csv(CONFIG["etf_csv"])
            etf_data = df.to_dict('records')
            logger.info(f"ETF: {CONFIG['etf_csv']} ({len(etf_data)} entrées)")
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
                "perf_1m": it.get("perf_1m"),
                "perf_3m": it.get("perf_3m"),
                "ytd": it.get("perf_ytd") or it.get("ytd"),
                "perf_24h": it.get("perf_1d"),
                "vol_3y": it.get("volatility_3y") or it.get("vol"),
                "vol": it.get("volatility_3y") or it.get("vol"),
                "volatility_3y": it.get("volatility_3y"),
                "max_dd": it.get("max_drawdown_ytd"),
                "max_drawdown_ytd": it.get("max_drawdown_ytd"),
                "liquidity": it.get("market_cap"),
                "market_cap": it.get("market_cap"),
                "sector": it.get("sector", "Unknown"),
                "country": it.get("country", "Global"),
                "category": "equity",
                "roe": it.get("roe"),
                "de_ratio": it.get("de_ratio"),
                "payout_ratio_ttm": it.get("payout_ratio_ttm"),
                "dividend_yield": it.get("dividend_yield"),
                "dividend_coverage": it.get("dividend_coverage"),
                "pe_ratio": it.get("pe_ratio"),
                "eps_ttm": it.get("eps_ttm"),
                "sector_top": it.get("sector"),
                "country_top": it.get("country"),
            })
    
    logger.info(f"   Equities brutes chargées: {len(eq_rows)}")
    
    # === PHASE 1: TRACE 1 - Initial ===
    count_korea(eq_rows, "1. Initial (après chargement)")
    
    # 4. Appliquer le filtre Buffett
    eq_rows_before_buffett = eq_rows.copy()  # v4.12.0: Garder pour audit
    
    if CONFIG["buffett_mode"] != "none" and eq_rows:
        logger.info(f"   Application filtre Buffett sur {len(eq_rows)} actions...")
        
        eq_rows_filtered = apply_buffett_filter(
            eq_rows,
            mode=CONFIG["buffett_mode"],
            strict=False,
            min_score=CONFIG["buffett_min_score"],
        )
        
        print_buffett_diagnostic(
            eq_rows_filtered, 
            f"QUALITÉ SECTORIELLE - {len(eq_rows_filtered)}/{len(eq_rows)} actions après filtre Buffett"
        )
        
        logger.info(f"   Equities après filtre Buffett: {len(eq_rows_filtered)}")
        eq_rows = eq_rows_filtered
    # === PHASE 1: TRACE 2 - After Buffett ===
    count_korea(eq_rows, "2. After Buffett filter")    
    
    # 5. Appliquer scoring quantitatif et filtres standards
    eq_rows = compute_scores(eq_rows, "equity", None)
    eq_filtered = filter_equities(eq_rows)
    
    # === PHASE 1: TRACE 3 - After filter_equities ===
    count_korea(eq_filtered, "3. After filter_equities")
    
    # === v4.13: Sélection d'équités DIFFÉRENTE par profil ===
    # On garde eq_filtered comme pool, la sélection se fera par profil dans la boucle
    # Cela permet d'avoir des équités DIFFÉRENTES entre Agressif, Modéré et Stable
    
    # Log du pool global (remplace l'ancienne sélection unique)
    logger.info(f"   Pool équités post-filtre: {len(eq_filtered)} (sélection par profil dans la boucle)")
    
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
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        logger.info(f"⚙️  Optimisation profil {profile}...")
        
        # === v4.13: Sélection d'équités spécifique au profil ===
        profile_equities, profile_selection_meta = select_equities_for_profile(
            eq_filtered=eq_filtered,
            profile=profile,
            market_context=market_context,
            target_n=min(25, len(eq_filtered)),
        )
        
        equities_by_profile[profile] = profile_equities
        
        # Log sélection
        policy_info = profile_selection_meta.get("profile_policy", {})
        radar_info = profile_selection_meta.get("radar", {})
        logger.info(f"   [{profile}] Équités sélectionnées: {len(profile_equities)} (min_buffett={policy_info.get('min_buffett_score', 'N/A')})")
        
        # === v4.13: Construire l'univers POUR CE PROFIL ===
        profile_universe = profile_equities + universe_others
        
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
        
        logger.info(
            f"   → {len(allocation)} lignes, "
            f"vol={diagnostics.get('portfolio_vol', 'N/A'):.1f}%"
        )
    
    # === v4.13: Diagnostic overlap entre profils ===
    if HAS_PROFILE_POLICY and len(equities_by_profile) == 3:
        agg_ids = {e.get("id") or e.get("ticker") for e in equities_by_profile.get("Agressif", [])}
        mod_ids = {e.get("id") or e.get("ticker") for e in equities_by_profile.get("Modéré", [])}
        stb_ids = {e.get("id") or e.get("ticker") for e in equities_by_profile.get("Stable", [])}
        
        overlap_agg_mod = len(agg_ids & mod_ids)
        overlap_agg_stb = len(agg_ids & stb_ids)
        overlap_mod_stb = len(mod_ids & stb_ids)
        overlap_all = len(agg_ids & mod_ids & stb_ids)
        
        logger.info("="*60)
        logger.info("📊 DIAGNOSTIC OVERLAP ÉQUITIES (v4.13 PROFILE_POLICY)")
        logger.info("="*60)
        logger.info(f"   Agressif: {len(agg_ids)} équités")
        logger.info(f"   Modéré:   {len(mod_ids)} équités")
        logger.info(f"   Stable:   {len(stb_ids)} équités")
        logger.info(f"   Overlap Agressif ∩ Modéré: {overlap_agg_mod}")
        logger.info(f"   Overlap Agressif ∩ Stable: {overlap_agg_stb}")
        logger.info(f"   Overlap Modéré ∩ Stable:   {overlap_mod_stb}")
        logger.info(f"   Overlap commun (3 profils): {overlap_all}")
        
        # Cibles attendues
        target_overlap_agg_stb = len(agg_ids) * 0.30  # Max 30%
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
    Pipeline EU/US Focus : filtre géographique + optimisation.
    """
    if not HAS_EUUS_PROFILES:
        logger.warning("⚠️ PROFILES_EUUS non disponible, skip EU/US generation")
        return {}, []
    
    logger.info("🇪🇺🇺🇸 Construction des portefeuilles EU/US Focus...")
    
    # 1. Charger les données
    stocks_data = load_stocks_data()
    
    etf_data = []
    bonds_data = []
    
    if Path(CONFIG["etf_csv"]).exists():
        try:
            df = pd.read_csv(CONFIG["etf_csv"])
            etf_data = df.to_dict('records')
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
                "perf_1m": it.get("perf_1m"),
                "perf_3m": it.get("perf_3m"),
                "ytd": it.get("perf_ytd") or it.get("ytd"),
                "perf_24h": it.get("perf_1d"),
                "vol_3y": it.get("volatility_3y") or it.get("vol"),
                "vol": it.get("volatility_3y") or it.get("vol"),
                "volatility_3y": it.get("volatility_3y"),
                "max_dd": it.get("max_drawdown_ytd"),
                "max_drawdown_ytd": it.get("max_drawdown_ytd"),
                "liquidity": it.get("market_cap"),
                "market_cap": it.get("market_cap"),
                "sector": it.get("sector", "Unknown"),
                "country": country,
                "category": "equity",
                "roe": it.get("roe"),
                "de_ratio": it.get("de_ratio"),
                "payout_ratio_ttm": it.get("payout_ratio_ttm"),
                "dividend_yield": it.get("dividend_yield"),
                "pe_ratio": it.get("pe_ratio"),
                "sector_top": it.get("sector"),
                "country_top": it.get("country"),
            })
    
    logger.info(f"   Equities EU/US: {len(eq_rows)} (skipped {eq_skipped} non-EU/US)")
    
    # 3. Appliquer filtre Buffett
    if CONFIG["buffett_mode"] != "none" and eq_rows:
        eq_rows = apply_buffett_filter(
            eq_rows,
            mode=CONFIG["buffett_mode"],
            strict=False,
            min_score=CONFIG["buffett_min_score"],
        )
        logger.info(f"   Equities EU/US après Buffett: {len(eq_rows)}")
    
   # 4. Scoring et sélection
    eq_rows = compute_scores(eq_rows, "equity", None)
    eq_filtered = filter_equities(eq_rows)
    equities, selection_meta = sector_balanced_selection(
        assets=eq_filtered, 
        target_n=min(25, len(eq_filtered)),
        initial_max_per_sector=4,
        score_field="composite_score",
        enable_radar_tiebreaker=True,
        radar_bonus_cap=0.03,
        radar_min_coverage=0.40,
        market_context=None,
    )
    logger.info(f"   [TOP-N EU/US] Sélection: {selection_meta['selected']}/{selection_meta['target_n']} (PASS {selection_meta['pass_used']})")
    
    # 5. Fusionner ETF + Bonds
    all_funds_data = etf_data + bonds_data
    
    # 6. Construire univers (pas de crypto pour simplifier)
    universe_others = build_scored_universe(
        stocks_data=None,
        etf_data=all_funds_data,
        crypto_data=[],
        returns_series=None,
        buffett_mode="none",
        buffett_min_score=0,
    )
    
    universe = equities + universe_others
    logger.info(f"   Univers EU/US total: {len(universe)} actifs")
    
    # 7. Optimiser pour chaque profil
    optimizer = PortfolioOptimizer()
    portfolios = {}
    all_assets = []
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        logger.info(f"⚙️  Optimisation EU/US {profile}...")
        
        scored_universe = rescore_universe_by_profile(universe, profile, market_context=None)
        assets = convert_universe_to_assets(scored_universe)
        
        if not all_assets:
            all_assets = assets
        
        try:
            allocation, diagnostics = optimizer.build_portfolio_euus(assets, profile)
            
            portfolios[profile] = {
                "allocation": allocation,
                "diagnostics": diagnostics,
                "assets": assets,
            }
            
            logger.info(
                f"   → {len(allocation)} lignes, "
                f"vol={diagnostics.get('portfolio_vol', 'N/A'):.1f}%"
            )
        except ValueError as e:
            logger.error(f"❌ EU/US {profile} failed: {e}")
            portfolios[profile] = {
                "allocation": {},
                "diagnostics": {"error": str(e)},
                "assets": [],
            }
    
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
        merged[profile]["_compliance_audit"]["version"] = "v4.13.0"
        
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
    
    if constraint_report:
        violations = constraint_report.get("violations", [])
        hard_violations = [v for v in violations if v.get("priority") == "hard"]
        if hard_violations:
            for v in hard_violations:
                limitations.append(
                    f"Contrainte '{v['name']}' violée: attendu {v['expected']}, "
                    f"obtenu {v['actual']:.1f}%."
                )
        
        relaxed = constraint_report.get("relaxed_constraints", [])
        if relaxed:
            limitations.append(
                f"Contraintes relâchées pour ce profil: {', '.join(relaxed)}."
            )
        
        warnings = constraint_report.get("warnings", [])
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
        
        if category and 'bond' in category.lower() or 'oblig' in category.lower():
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
                
                tickers_dict = result[profile]["_tickers"]
                prev_weight = tickers_dict.get(pricing_ticker, 0.0)
                new_weight = round(prev_weight + weight / 100.0, 4)
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
                
                tickers_dict = result[profile]["_tickers"]
                prev_weight = tickers_dict.get(ticker_key, 0.0)
                new_weight = round(prev_weight + weight / 100.0, 4)
                tickers_dict[ticker_key] = new_weight
                
                if prev_weight > 0:
                    if ticker_key not in ticker_collisions:
                        ticker_collisions[ticker_key] = prev_weight
                    ticker_collisions[ticker_key] = new_weight
        
        for cat_v1, weights_dict in readable_weights.items():
            if not weights_dict:
                continue
            
            for name, weight in weights_dict.items():
                result[profile][cat_v1][name] = format_weight_as_percent(weight, decimals=0)
        
        all_readable_weights = {}
        for cat_v1 in ["Actions", "ETF", "Obligations", "Crypto"]:
            for name, pct_str in result[profile][cat_v1].items():
                try:
                    pct_val = float(pct_str.replace("%", ""))
                    all_readable_weights[f"{cat_v1}:{name}"] = pct_val
                except:
                    pass
        
        if all_readable_weights:
            rounded_weights = round_weights_to_100(all_readable_weights, decimals=0)
            
            for key, weight in rounded_weights.items():
                cat_v1, name = key.split(":", 1)
                result[profile][cat_v1][name] = format_weight_as_percent(weight, decimals=0)
        
        allocation_rounded = {}
        for cat_v1 in ["Actions", "ETF", "Obligations", "Crypto"]:
            for name, pct_str in result[profile][cat_v1].items():
                try:
                    pct_val = float(pct_str.replace("%", ""))
                    for aid, meta in assets_metadata_for_check.items():
                        if meta["name"] == name or name.startswith(meta["name"]):
                            allocation_rounded[aid] = pct_val
                            break
                    else:
                        allocation_rounded[name] = pct_val
                except:
                    pass
        
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
            result[profile]["_constraint_report"] = enriched_constraint_report
            
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
            result[profile]["_constraint_report"] = constraint_report.to_dict()
            
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
        bonds_total_pct = sum(
            int(v.replace("%", "")) 
            for v in result[profile]["Obligations"].values()
        ) if result[profile]["Obligations"] else 0
        
        if n_bonds_readable > 0:
            logger.info(f"   {profile}: {n_bonds_readable} bond(s) distincts, total={bonds_total_pct}%")
            if bond_symbols_used:
                logger.info(f"   {profile} bond symbols: {bond_symbols_used[:6]}{'...' if len(bond_symbols_used) > 6 else ''}")
        
        if ticker_collisions:
            logger.info(f"   {profile}: {len(ticker_collisions)} ticker(s) agrégé(s) (non-bonds): {ticker_collisions}")
        if name_collisions:
            logger.info(f"   {profile}: {len(name_collisions)} nom(s) agrégé(s) (non-bonds): {name_collisions}")
        
        total_tickers = sum(result[profile]["_tickers"].values())
        
        total_readable = 0
        for cat_v1 in ["Actions", "ETF", "Obligations", "Crypto"]:
            for name, pct_str in result[profile][cat_v1].items():
                try:
                    pct_val = int(pct_str.replace("%", ""))
                    total_readable += pct_val
                except:
                    pass
        
        n_allocation = len(allocation)
        n_tickers = len(result[profile]["_tickers"])
        n_readable = sum(len(result[profile][c]) for c in ["Actions", "ETF", "Obligations", "Crypto"])
        
        if abs(total_tickers - 1.0) > 0.02:
            logger.warning(
                f"⚠️ {profile}: _tickers sum = {total_tickers:.2%} (expected ~100%) "
                f"→ {n_allocation} lignes allocation, {n_tickers} tickers uniques"
            )
        
        if total_readable != 100:
            logger.warning(
                f"⚠️ {profile}: readable sum = {total_readable}% (should be exactly 100%) "
                f"→ {n_readable} items lisibles"
            )
        else:
            logger.info(f"✅ {profile}: readable={total_readable}% (exact), _tickers={total_tickers:.2%} ({n_tickers} tickers, {n_readable} items)")
        
        tickers_list = [t for t in list(result[profile]["_tickers"].keys())[:8] if t]
        logger.info(f"   {profile} _tickers sample: {tickers_list}")
        
      # === v4.11.0: Copier _asset_details si présent ===
        if data.get("_asset_details"):
            result[profile]["_asset_details"] = data["_asset_details"]
            logger.info(f"   {profile}: {len(data['_asset_details'])} asset_details copiés")
    
    result["_meta"] = {
        "generated_at": datetime.datetime.now().isoformat(),
        "version": "v4.13.0",
        "buffett_mode": CONFIG["buffett_mode"],
        "buffett_min_score": CONFIG["buffett_min_score"],
        "tactical_context_enabled": CONFIG.get("use_tactical_context", False),
        "tactical_mode": CONFIG.get("tactical_mode", "radar"),
        "tactical_rules": CONFIG.get("tactical_rules", {}),
        "backtest_days": CONFIG["backtest_days"],
        "platform_fee_annual_bp": CONFIG.get("platform_fee_annual_bp", 0.0),
        "ter_handling": "embedded_in_etf_prices",
        "profile_policy_enabled": HAS_PROFILE_POLICY,
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
        "version": "v4.13.0",
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
    logger.info("🚀 Portfolio Engine v4.13.0 - PROFILE_POLICY + Global + EU/US Focus")
    logger.info("=" * 60)
    
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
    logger.info("Fonctionnalités v4.13.0:")
    logger.info(f"   • ✅ PROFILE_POLICY: {'ACTIVÉ' if HAS_PROFILE_POLICY else 'DÉSACTIVÉ'}")
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
    logger.info(f"   • Filtre Buffett: mode={CONFIG['buffett_mode']}, score_min={CONFIG['buffett_min_score']}")


if __name__ == "__main__":
    main()
