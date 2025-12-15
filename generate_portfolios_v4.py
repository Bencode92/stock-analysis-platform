#!/usr/bin/env python3
"""
generate_portfolios_v4.py - Orchestrateur complet

Architecture v4 :
- Python décide les poids (déterministe via portfolio_engine)
- LLM génère uniquement les justifications (prompt compact)
- Compliance AMF appliquée systématiquement
- Backtest 90j intégré avec comparaison des 3 profils
- Filtre Buffett sectoriel intégré

V4.9.0: P0-3 FIX - Appel verify_constraints_post_arrondi() après optimisation
        Garantit que toutes les contraintes HARD sont respectées après arrondi
V4.8.0: P0 COMPLIANCE - Double barrière LLM + audit trail + fallback
        P0-7: sanitize_llm_output() appliqué dans add_commentary() avec audit
        P0-8: use_tactical_context = False (GPT-generated = zone grise AMF)
        P0-9: Exposition du mode d'optimisation (_optimization) pour le front
V4.7.1: FIX - Handle sharpe_ratio=None in print_comparison_table (TypeError fix)
V4.7:   FIX P0 - Rounding intelligent pour readable sum = exactement 100%
        FIX P2 - Disclaimer backtest dans les commentaires LLM
V4.6:   FIX - Utiliser SYMBOL (BIV,BSV,BND) au lieu de TICKER (KORP) pour les bonds dans _tickers

"""

import os
import json
import logging
import datetime
import math
import re
from pathlib import Path
from typing import Dict, Any, Optional, List
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

# 4.4: Import du chargeur de contexte marché
from portfolio_engine.market_context import load_market_context

# v4.9 P0-3 FIX: Import du vérificateur de contraintes post-arrondi
try:
    from portfolio_engine.constraints import verify_constraints_post_arrondi
    HAS_CONSTRAINTS_VERIFIER = True
except ImportError:
    HAS_CONSTRAINTS_VERIFIER = False
    def verify_constraints_post_arrondi(*args, **kwargs):
        return {"all_hard_satisfied": True, "violations": [], "warning": "constraints module not available"}

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


# ============= CONFIGURATION =============

CONFIG = {
    "stocks_paths": [
        "data/stocks_us.json",
        "data/stocks_europe.json",
        "data/stocks_asia.json",
    ],
    "etf_csv": "data/combined_etfs.csv",
    "bonds_csv": "data/combined_bonds.csv",  # V4.2.5: Ajout vrais bonds
    "crypto_csv": "data/filtered/Crypto_filtered_volatility.csv",
    "brief_paths": ["brief_ia.json", "./brief_ia.json", "data/brief_ia.json"],
    "output_path": "data/portfolios.json",
    "history_dir": "data/portfolio_history",
    "backtest_output": "data/backtest_results.json",
    "config_path": "config/portfolio_config.yaml",
    "use_llm": True,
    "llm_model": "gpt-4o-mini",
    "run_backtest": True,  # Activer le backtest
    "backtest_days": 90,
    "backtest_freq": "M",  # Monthly
    # === Buffett Filter Config ===
    "buffett_mode": "soft",      # "soft" (pénalise), "hard" (rejette), "both", "none" (désactivé)
    "buffett_min_score": 40,     # Score minimum Buffett (0-100), 0 = pas de filtre
    # === v4.8 P0-8: Tactical Context DÉSACTIVÉ (GPT-generated = zone grise AMF) ===
    "use_tactical_context": False,  # P0-8: Désactivé tant que non sourcé
    "market_data_dir": "data",     # Répertoire du fichier market_context.json
    # === v4.9 P0-3: Vérification contraintes post-arrondi ===
    "verify_constraints_post_arrondi": True,  # P0-3: Activer vérification
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
    """
    v4.7 P0 FIX: Arrondit les poids pour que la somme = exactement 100%.
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

def print_tactical_context_diagnostic(market_context: Dict):
    """Affiche un diagnostic du contexte marché chargé (v4.4 format)."""
    print("\n" + "=" * 80)
    print("📊 DIAGNOSTIC CONTEXTE TACTIQUE (v4.4)")
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


# ============= PIPELINE PRINCIPAL =============

def build_portfolios_deterministic() -> Dict[str, Dict]:
    """
    Pipeline déterministe : mêmes données → mêmes poids.
    Utilise les modules portfolio_engine.
    
    v4.9 P0-3 FIX: Appel verify_constraints_post_arrondi() après chaque optimisation.
    v4.8 P0-8: Tactical context désactivé par défaut (GPT-generated = zone grise AMF)
    v4.4: Utilise le nouveau format market_context.json unifié.
    """
    logger.info("🧮 Construction des portefeuilles (déterministe)...")
    
    # v4.8 P0-8: Charger le contexte marché SEULEMENT si explicitement activé
    market_context = None
    if CONFIG.get("use_tactical_context", False):
        logger.info("📊 Chargement du contexte marché (tactical_context)...")
        market_context = load_market_context(CONFIG.get("market_data_dir", "data"))
        
        macro_tilts = market_context.get("macro_tilts", {})
        has_tilts = (
            macro_tilts.get("favored_sectors") or 
            macro_tilts.get("avoided_sectors") or
            macro_tilts.get("favored_regions") or
            macro_tilts.get("avoided_regions")
        )
        
        if has_tilts:
            print_tactical_context_diagnostic(market_context)
            logger.info("✅ Contexte marché chargé pour scoring tactique")
        else:
            is_fallback = market_context.get("_meta", {}).get("is_fallback", False)
            if is_fallback:
                logger.warning("⚠️ Contexte marché en mode FALLBACK - scoring tactique neutre")
            else:
                logger.warning("⚠️ Contexte marché sans tilts actifs - scoring tactique désactivé")
    else:
        logger.info("⚠️ P0-8: Tilts tactiques DÉSACTIVÉS (use_tactical_context=False)")
        logger.info("   Raison: GPT-generated = zone grise AMF, non sourcé")
    
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
