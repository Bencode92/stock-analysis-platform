#!/usr/bin/env python3
"""
generate_portfolios_v4.py - Orchestrateur complet

Architecture v4 :
- Python décide les poids (déterministe via portfolio_engine)
- LLM génère uniquement les justifications (prompt compact)
- Compliance AMF appliquée systématiquement
- Backtest 90j intégré avec comparaison des 3 profils
- Filtre Buffett sectoriel intégré

V4.8.5: P1-8 - Net/gross returns separated for AMF transparency
V4.8.4: FIX - Unpack tuple from load_prices_for_backtest (P1-7 compatibility)
V4.8.3: P0-4 FIX - getattr() for ProfileConstraints (dataclass not dict)
V4.8.2: P0-3 + P0-4 - _limitations field + check_feasibility() ex-ante
        P0-3: Champ _limitations exposant compromis/limites de chaque profil
        P0-4: check_feasibility() appelée AVANT optimisation
V4.8.1: P0-2 - verify_constraints_post_arrondi() appelée après arrondi
        + _constraint_report dans chaque profil pour audit trail
V4.8.0: P0 COMPLIANCE - Double barrière LLM + audit trail + fallback
        P0-7: sanitize_llm_output() appliqué dans add_commentary() avec audit
        P0-8: use_tactical_context = False (GPT-generated = zone grise AMF)
        P0-9: Exposition du mode d'optimisation (_optimization) pour le front
V4.7.1: FIX - Handle sharpe_ratio=None in print_comparison_table (TypeError fix)
V4.7:   FIX P0 - Rounding intelligent pour readable sum = exactement 100%
        FIX P2 - Disclaimer backtest dans les commentaires LLM
V4.6:   FIX - Utiliser SYMBOL (BIV,BSV,BND) au lieu de TICKER (KORP) pour les bonds dans _tickers
V4.5:   FIX - Ne pas agréger les Obligations par nom/ticker (évite KORP monopole)
V3.4:   FIX - Forcer fund_type="bond" pour TOUS les bonds (pas juste si colonne absente)
V4.4.1: FIX - Bug mapping % (agrégation cohérente front + _tickers)
V4.4:   FEAT - Nouveau format market_context.json unifié (GPT génère secteurs/régions favorisés)
V4.3.1: FIX - Utiliser markets.json au lieu de indices.json pour les données régionales
V4.3.0: FEAT - Intégration tactical_context (sectors.json + markets.json + macro_tilts.json)
        Le scoring inclut maintenant le contexte marché (momentum secteur/région + convictions macro)
V4.2.5: FIX - Charger combined_bonds.csv (vrais bonds, pas seulement ETF obligataires)
V4.2.4: FIX TICKER - ticker/symbol dans universe.py pour ETF/bonds
V4.2.3: FIX NaN float pandas + agrégation poids par ticker (+=)
V4.2.2: FIX TICKER - Récupérer ticker depuis source_data, pas Asset.ticker
V4.2.1: FIX AttributeError - utiliser getattr() pour Asset
V4.2: FIX EXPORT - Ajoute bloc _tickers pour le backtest (Solution C)
V4.1: FIX BACKTEST - Utilise poids FIXES du portfolio (pas recalcul dynamique)




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
    
    Algorithme:
    1. Arrondir tous les poids sauf le plus grand
    2. Fixer le plus grand à 100 - somme(autres arrondis)
    
    Cela évite les "readable sum = 97%" ou "103%" qui perturbent l'UX.
    
    Args:
        weights: Dict {nom: poids_float} (ex: {"AAPL": 14.23, "MSFT": 12.77})
        decimals: Nombre de décimales (0 = entier)
    
    Returns:
        Dict {nom: poids_arrondi} avec sum = 100
    """
    if not weights:
        return {}
    
    # Trier par poids décroissant
    sorted_items = sorted(weights.items(), key=lambda x: x[1], reverse=True)
    
    if len(sorted_items) == 1:
        return {sorted_items[0][0]: 100.0}
    
    # Arrondir tous sauf le premier (le plus grand)
    rounded = {}
    running_sum = 0.0
    
    for i, (name, weight) in enumerate(sorted_items):
        if i == 0:
            # Skip le premier, on le calcule à la fin
            continue
        
        rounded_weight = round(weight, decimals)
        rounded[name] = rounded_weight
        running_sum += rounded_weight
    
    # Le premier = 100 - somme des autres
    first_name = sorted_items[0][0]
    first_weight = round(100.0 - running_sum, decimals)
    
    # Vérifier que le premier reste raisonnable
    original_first = sorted_items[0][1]
    if abs(first_weight - original_first) > 3:
        # Si l'écart est trop grand, fallback sur normalisation proportionnelle
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
    """
    Affiche un diagnostic du filtre Buffett sur l'univers.
    
    Args:
        assets: Liste des actifs avec métriques Buffett (_buffett_score, etc.)
        title: Titre du diagnostic
    """
    if not assets:
        print("⚠️  Pas d'actifs à analyser")
        return
        
    print("\n" + "=" * 80)
    print(f"🎯 {title}")
    print("=" * 80)
    
    # Récupérer les stats sectorielles
    summary = get_sector_summary(assets)
    
    if not summary:
        print("⚠️  Pas de données sectorielles disponibles")
        return
    
    # Compter les actifs avec données
    total_with_roe = sum(1 for a in assets if a.get("roe") and float(a.get("roe", 0) or 0) > 0)
    total_with_de = sum(1 for a in assets if a.get("de_ratio") is not None)
    
    print(f"\n📈 Couverture données: ROE={total_with_roe}/{len(assets)} ({100*total_with_roe//max(1,len(assets))}%), "
          f"D/E={total_with_de}/{len(assets)} ({100*total_with_de//max(1,len(assets))}%)")
    
    # Afficher le tableau
    print(f"\n{'Secteur':<22} | {'Count':>6} | {'ROE moy':>10} | {'D/E moy':>10} | {'Score':>8} | {'Rejetés':>8}")
    print("-" * 80)
    
    total_count = 0
    total_rejected = 0
    scores = []
    
    # Trier par score décroissant
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
        
        # Formatage - D/E peut être en décimal (0.25) ou en % (25)
        roe_str = f"{avg_roe:.1f}%" if avg_roe else "N/A"
        
        # Si D/E < 10, c'est probablement en décimal, convertir en %
        if avg_de is not None:
            if avg_de < 10:
                de_display = avg_de * 100
            else:
                de_display = avg_de
            de_str = f"{de_display:.0f}%"
        else:
            de_str = "N/A"
        
        score_str = f"{avg_score:.0f}" if avg_score else "N/A"
        
        # Emoji indicateur
        if avg_score and avg_score >= 70:
            indicator = "🟢"
        elif avg_score and avg_score >= 50:
            indicator = "🟡"
        else:
            indicator = "🔴"
        
        print(f"{indicator} {sector:<20} | {count:>6} | {roe_str:>10} | {de_str:>10} | {score_str:>8} | {rejected:>8}")
    
    print("-" * 80)
    
    # Totaux
    avg_global_score = sum(scores) / len(scores) if scores else 0
    print(f"{'TOTAL':<24} | {total_count:>6} | {'':<10} | {'':<10} | {avg_global_score:>7.0f} | {total_rejected:>8}")
    
    print("\n📊 Légende:")
    print("   🟢 Score ≥ 70 : Qualité Buffett excellente")
    print("   🟡 Score 50-69 : Qualité acceptable")
    print("   🔴 Score < 50 : Qualité insuffisante (filtré si score_min > 50)")
    
    # Top 5 et Bottom 5 - avec protection contre None
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
    """
    Affiche un diagnostic du contexte marché chargé (v4.4 format).
    
    Args:
        market_context: Résultat de load_market_context()
    """
    print("\n" + "=" * 80)
    print("📊 DIAGNOSTIC CONTEXTE TACTIQUE (v4.4)")
    print("=" * 80)
    
    # Régime
    regime = market_context.get("market_regime", "N/A")
    confidence = market_context.get("confidence", "N/A")
    as_of = market_context.get("as_of", "N/A")
    
    print(f"\n📈 Régime marché: {regime} (confidence: {confidence})")
    print(f"   Date: {as_of}")
    
    # Macro tilts
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
    
    # Trends et risques
    trends = market_context.get("key_trends", [])
    risks = market_context.get("risks", [])
    
    if trends:
        print(f"\n📈 Tendances clés: {', '.join(trends)}")
    if risks:
        print(f"⚠️  Risques: {', '.join(risks)}")
    
    # Meta
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
    
    v4.8.3 P0-4 FIX: Utilise getattr() pour ProfileConstraints (dataclass)
    v4.8.2 P0-4: Appel check_feasibility() AVANT optimisation
    v4.8 P0-8: Tactical context désactivé par défaut (GPT-generated = zone grise AMF)
    v4.4: Utilise le nouveau format market_context.json unifié.
    """
    logger.info("🧮 Construction des portefeuilles (déterministe)...")
    
    # v4.8 P0-8: Charger le contexte marché SEULEMENT si explicitement activé
    market_context = None
    if CONFIG.get("use_tactical_context", False):
        logger.info("📊 Chargement du contexte marché (tactical_context)...")
        market_context = load_market_context(CONFIG.get("market_data_dir", "data"))
        
        # v4.4 FIX: Vérifier macro_tilts au lieu de sectors/indices
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
            # Vérifier si c'est un fallback explicite
            is_fallback = market_context.get("_meta", {}).get("is_fallback", False)
            if is_fallback:
                logger.warning("⚠️ Contexte marché en mode FALLBACK - scoring tactique neutre")
            else:
                logger.warning("⚠️ Contexte marché sans tilts actifs - scoring tactique désactivé")
            # On garde market_context pour éviter les erreurs, mais les tilts seront 0
    else:
        # v4.8 P0-8: Log explicite que les tilts sont désactivés
        logger.info("⚠️ P0-8: Tilts tactiques DÉSACTIVÉS (use_tactical_context=False)")
        logger.info("   Raison: GPT-generated = zone grise AMF, non sourcé")
    
    # 1. Charger les données brutes
    stocks_data = load_stocks_data()
    
    # 2. Charger ETF, Bonds et Crypto (V4.2.5: ajout bonds séparés)
    etf_data = []
    bonds_data = []
    crypto_data = []
    
    # ETF
    if Path(CONFIG["etf_csv"]).exists():
        try:
            df = pd.read_csv(CONFIG["etf_csv"])
            etf_data = df.to_dict('records')
            logger.info(f"ETF: {CONFIG['etf_csv']} ({len(etf_data)} entrées)")
        except Exception as e:
            logger.warning(f"Impossible de charger ETF: {e}")
    
    # V3.4 FIX: Charger les vrais bonds depuis combined_bonds.csv
    # TOUJOURS forcer fund_type="bond" car TOUT le fichier = bonds
    if Path(CONFIG["bonds_csv"]).exists():
        try:
            df_b = pd.read_csv(CONFIG["bonds_csv"])
            # V3.4: Forcer TOUJOURS (pas juste si colonne absente)
            # Tous les assets de combined_bonds.csv sont des bonds par définition
            df_b["category"] = "bond"
            df_b["fund_type"] = "bond"
            bonds_data = df_b.to_dict("records")
            logger.info(f"Bonds: {CONFIG['bonds_csv']} ({len(bonds_data)} entrées) - fund_type forcé à 'bond'")
        except Exception as e:
            logger.warning(f"Impossible de charger Bonds: {e}")
    
    # Crypto
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
    
    # Construire la liste d'equities brutes
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
                # Métriques fondamentales pour Buffett filter
                "roe": it.get("roe"),
                "de_ratio": it.get("de_ratio"),
                "payout_ratio_ttm": it.get("payout_ratio_ttm"),
                "dividend_yield": it.get("dividend_yield"),
                "dividend_coverage": it.get("dividend_coverage"),
                "pe_ratio": it.get("pe_ratio"),
                "eps_ttm": it.get("eps_ttm"),
                # v4.3.0: Champs pour tactical_context
                "sector_top": it.get("sector"),
                "country_top": it.get("country"),
            })
    
    logger.info(f"   Equities brutes chargées: {len(eq_rows)}")
    
    # 4. Appliquer le filtre Buffett sur TOUS les stocks bruts AVANT le scoring
    if CONFIG["buffett_mode"] != "none" and eq_rows:
        logger.info(f"   Application filtre Buffett sur {len(eq_rows)} actions...")
        
        eq_rows_filtered = apply_buffett_filter(
            eq_rows,
            mode=CONFIG["buffett_mode"],
            strict=False,
            min_score=CONFIG["buffett_min_score"],
        )
        
        # === DIAGNOSTIC BUFFETT ===
        print_buffett_diagnostic(
            eq_rows_filtered, 
            f"QUALITÉ SECTORIELLE - {len(eq_rows_filtered)}/{len(eq_rows)} actions après filtre Buffett"
        )
        
        logger.info(f"   Equities après filtre Buffett: {len(eq_rows_filtered)}")
        eq_rows = eq_rows_filtered
    
    # 5. Appliquer scoring quantitatif et filtres standards
    eq_rows = compute_scores(eq_rows, "equity", None)
    eq_filtered = filter_equities(eq_rows)
    equities = sector_balanced_selection(eq_filtered, min(25, len(eq_filtered)))
    
    logger.info(f"   Equities finales sélectionnées: {len(equities)}")
    
    # 6. V4.2.5: Fusionner bonds + ETF pour build_scored_universe
    #    (car build_scored_universe ne supporte pas bonds_data séparément)
    all_funds_data = []
    all_funds_data.extend(etf_data)
    all_funds_data.extend(bonds_data)
    
    logger.info(f"   Fonds combinés (ETF + Bonds): {len(all_funds_data)} ({len(etf_data)} ETF + {len(bonds_data)} Bonds)")
    
    # 7. Construire le reste de l'univers (ETF, bonds, crypto) via build_scored_universe
    universe_others = build_scored_universe(
        stocks_data=None,  # Pas de stocks, on les a déjà
        etf_data=all_funds_data,  # V4.2.5: ETF + Bonds fusionnés
        crypto_data=crypto_data,
        returns_series=None,
        buffett_mode="none",  # Pas de Buffett pour ETF/crypto/bonds
        buffett_min_score=0,
    )
    
    # Combiner equities + autres
    universe = equities + universe_others
    
    logger.info(f"   Univers final: {len(universe)} actifs total")
    
    # 8. Optimiser pour chaque profil
    optimizer = PortfolioOptimizer()
    portfolios = {}
    all_assets = []
    
    # v4.8.2 P0-4: Stocker les rapports de faisabilité
    feasibility_reports = {}
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        logger.info(f"⚙️  Optimisation profil {profile}...")
        
        # v4.8 P0-8: Re-scorer selon le profil SANS le contexte marché si désactivé
        scored_universe = rescore_universe_by_profile(
            universe, 
            profile, 
            market_context=market_context  # None si use_tactical_context=False
        )
        
        # Convertir en objets Asset
        assets = convert_universe_to_assets(scored_universe)
        if not all_assets:
            all_assets = assets
        
        # === v4.8.3 P0-4 FIX: CHECK FEASIBILITY EX-ANTE ===
        # Note: PROFILES[profile] retourne un ProfileConstraints (dataclass), pas un dict
        profile_config = PROFILES.get(profile)
        profile_constraints = {
            "bonds_min": getattr(profile_config, "bonds_min", 5.0),  # Déjà en %
            "crypto_max": getattr(profile_config, "crypto_max", 10.0),  # Déjà en %
            "max_single_position": getattr(profile_config, "max_single_position", 15.0),  # Déjà en %
            "max_single_bond": 25.0,  # Constante, pas dans ProfileConstraints
            "min_assets": getattr(profile_config, "min_assets", 10),
            "max_assets": getattr(profile_config, "max_assets", 18),
            "vol_target": getattr(profile_config, "vol_target", 12.0),
            "vol_tolerance": getattr(profile_config, "vol_tolerance", 3.0),
        }
        
        # Préparer les candidats pour check_feasibility
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
        
        # Optimiser
        allocation, diagnostics = optimizer.build_portfolio(assets, profile)
        
        # Stocker le rapport de faisabilité dans diagnostics
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
    
    return portfolios, all_assets


def add_commentary(
    portfolios: Dict[str, Dict],
    assets: list,
    brief_data: Optional[Dict] = None
) -> Dict[str, Dict]:
    """
    Ajoute les commentaires et justifications.
    Via LLM si disponible, sinon fallback.
    
    v4.8 P0-7: DOUBLE BARRIÈRE LLM
    - sanitize_llm_output() appliqué APRÈS génération LLM
    - Audit trail dans _compliance_audit
    - Fallback si >50% du contenu supprimé
    
    v4.7 P2: Ajoute le disclaimer backtest au commentaire.
    """
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
    
    # v4.7 P2: Disclaimer backtest
    disclaimer = BACKTEST_DISCLAIMER.format(days=CONFIG["backtest_days"])
    
    merged = merge_commentary_into_portfolios(portfolios_for_prompt, commentary)
    
    # === v4.8 P0-7: DOUBLE BARRIÈRE LLM + AUDIT TRAIL ===
    for profile in merged:
        # 1. Récupérer le commentaire brut
        raw_comment = merged[profile].get("comment", "") or ""
        
        # 2. Appliquer le filtre LLM STRICT
        cleaned, report = sanitize_llm_output(
            raw_comment,
            replacement="",
            strict=True,
            log_hits=True
        )
        
        # 3. Audit trail (pour traçabilité AMF)
        merged[profile].setdefault("_compliance_audit", {})
        merged[profile]["_compliance_audit"]["llm_sanitizer"] = report.to_dict()
        merged[profile]["_compliance_audit"]["timestamp"] = datetime.datetime.now().isoformat()
        merged[profile]["_compliance_audit"]["version"] = "v4.8.5"
        
        # 4. Fallback si trop de contenu supprimé (>50%)
        if report.removal_ratio > 0.5:
            logger.error(
                f"[P0-7] LLM text too unsafe for {profile}: "
                f"{report.removal_ratio:.0%} removed, using fallback"
            )
            cleaned = FALLBACK_COMPLIANCE_COMMENT
            merged[profile]["_compliance_audit"]["fallback_used"] = True
        else:
            merged[profile]["_compliance_audit"]["fallback_used"] = False
        
        # 5. Ajouter le disclaimer backtest
        if cleaned and disclaimer not in cleaned:
            cleaned = f"{cleaned}\n\n{disclaimer}"
        elif not cleaned:
            cleaned = f"{FALLBACK_COMPLIANCE_COMMENT}\n\n{disclaimer}"
        
        merged[profile]["comment"] = cleaned
        
        # 6. Log résumé
        if report.sanitized:
            logger.info(
                f"[P0-7] {profile}: {report.removed_sentences} phrases supprimées, "
                f"{len(report.hits)} hits, ratio={report.removal_ratio:.0%}"
            )
    
    return merged


def apply_compliance(portfolios: Dict[str, Dict]) -> Dict[str, Dict]:
    """
    Applique la compliance AMF et sanitise le langage.
    """
    logger.info("🛡️  Application compliance AMF...")
    
    for profile in portfolios:
        portfolios[profile] = sanitize_portfolio_output(portfolios[profile])
        
        diag = portfolios[profile].get("diagnostics", {})
        allocation = portfolios[profile].get("allocation", {})
        
        # Fix: Convert aid to string before calling .upper()
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
    
    V4.8.4: FIX - Unpack tuple from load_prices_for_backtest (P1-7 compatibility)
    V4.1: Utilise run_backtest_fixed_weights() au lieu de run_backtest()
    pour refléter vraiment la performance du portfolio généré.
    """
    logger.info("\n" + "="*60)
    logger.info("📈 BACKTEST - Validation historique (POIDS FIXES)")
    logger.info("="*60)
    
    # Vérifier la clé API Twelve Data
    api_key = os.environ.get("TWELVE_DATA_API")
    if not api_key:
        logger.warning("⚠️ TWELVE_DATA_API non définie, backtest ignoré")
        return {"error": "TWELVE_DATA_API not set", "skipped": True}
    
    try:
        from backtest import BacktestConfig, load_prices_for_backtest
        from backtest.engine import (
            run_backtest_fixed_weights,  # ✅ NOUVELLE FONCTION
            print_backtest_report, 
            compute_backtest_stats
        )
        from backtest.data_loader import extract_portfolio_weights  # ✅ NOUVEAU
    except ImportError as e:
        logger.error(f"❌ Import backtest failed: {e}")
        return {"error": str(e), "skipped": True}
    
    # Charger la config YAML
    yaml_config = load_yaml_config(CONFIG["config_path"])
    if not yaml_config:
        logger.warning("⚠️ Config YAML non trouvée, utilisation des défauts")
        yaml_config = {"backtest": {"test_universe": {"stocks": ["AAPL", "MSFT", "GOOGL"]}}}
    
    # Dates
    end_date = datetime.datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.datetime.now() - timedelta(days=CONFIG["backtest_days"] + 30)).strftime("%Y-%m-%d")
    backtest_start = (datetime.datetime.now() - timedelta(days=CONFIG["backtest_days"])).strftime("%Y-%m-%d")
    
    # ✅ NOUVEAU: Charger les poids FIXES depuis portfolios.json
    logger.info("📥 Chargement des poids depuis portfolios.json...")
    portfolio_weights = extract_portfolio_weights(CONFIG["output_path"])
    
    if not portfolio_weights:
        logger.error("❌ Impossible de charger les poids du portfolio")
        return {"error": "No portfolio weights found", "skipped": True}
    
    for profile, weights in portfolio_weights.items():
        logger.info(f"   {profile}: {len(weights)} actifs, total={sum(weights.values()):.1%}")
    
    # Charger les prix UNE SEULE FOIS
    logger.info(f"📥 Chargement des prix ({CONFIG['backtest_days']}j)...")
    try:
        # V4.8.4 FIX: load_prices_for_backtest now returns (prices_df, diagnostics) tuple
        result = load_prices_for_backtest(
            yaml_config,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key,
            plan="ultra"  # Plan ultra = pas de rate limit
        )
        
        # Unpack the tuple if it's a tuple, otherwise use directly
        if isinstance(result, tuple):
            prices, price_diagnostics = result
            logger.info(f"✅ {len(prices.columns)} symboles, {len(prices)} jours")
            # Log benchmark coverage from diagnostics
            bench_diag = price_diagnostics.get("benchmark_coverage", {})
            if bench_diag:
                logger.info(f"   Benchmark coverage: {bench_diag.get('loaded', 0)}/{bench_diag.get('requested', 0)}")
        else:
            # Backward compatibility: if it's just a DataFrame
            prices = result
            price_diagnostics = {}
            logger.info(f"✅ {len(prices.columns)} symboles, {len(prices)} jours")
            
    except Exception as e:
        logger.error(f"❌ Échec chargement prix: {e}")
        return {"error": str(e), "skipped": True}
    
    # Exécuter les 3 profils avec POIDS FIXES
    results = []
    profiles = ["Agressif", "Modéré", "Stable"]
    
    for profile in profiles:
        logger.info(f"\n⚙️  Backtest {profile} (poids fixes)...")
        
        # Récupérer les poids fixes pour ce profil
        fixed_weights = portfolio_weights.get(profile, {})
        
        if not fixed_weights:
            logger.warning(f"⚠️ Pas de poids pour {profile}, skip")
            results.append({
                "profile": profile,
                "success": False,
                "error": "No weights found",
            })
            continue
        
        backtest_config = BacktestConfig(
            profile=profile,
            start_date=backtest_start,
            end_date=end_date,
            rebalance_freq=CONFIG["backtest_freq"],
            transaction_cost_bp=yaml_config.get("backtest", {}).get("transaction_cost_bp", 10),
            turnover_penalty=0,  # Pas de pénalité, poids fixes
        )
        
        try:
            # ✅ UTILISE LA NOUVELLE FONCTION AVEC POIDS FIXES
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
    
    # Tableau comparatif
    print_comparison_table(results)
    
    return {
        "timestamp": datetime.datetime.now().isoformat(),
        "period_days": CONFIG["backtest_days"],
        "frequency": CONFIG["backtest_freq"],
        "symbols_count": len(prices.columns),
        "backtest_mode": "fixed_weights",  # ✅ NOUVEAU
        "price_diagnostics": price_diagnostics,  # V4.8.4: Include price loading diagnostics
        "results": results,
        "comparison": {
            r["profile"]: r.get("stats", {})
            for r in results if r.get("success")
        }
    }


def print_comparison_table(results: List[dict]):
    """
    Affiche un tableau comparatif des 3 profils.
    
    V4.8.5 P1-8: Added gross/net/cost metrics for transparency.
    v4.7.1 FIX: Handle sharpe_ratio=None to avoid TypeError.
    """
    print("\n" + "="*80)
    print("📊 COMPARAISON DES 3 PROFILS (POIDS FIXES)")
    print("="*80)
    
    print(f"\n{'Métrique':<25} | {'Agressif':>15} | {'Modéré':>15} | {'Stable':>15}")
    print("-"*80)
    
    # V4.8.5 P1-8: Added gross/net/cost metrics for AMF transparency
    metrics = [
        ("Gross Return", "gross_return_pct", "%"),      # P1-8: Before costs
        ("Net Return", "net_return_pct", "%"),          # P1-8: After costs
        ("Cost Drag", "cost_drag_pct", "%"),            # P1-8: Impact of costs
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
        
        # v4.7.1 FIX: Handle None values gracefully
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
    
    print("="*80)
    
    # Verdict
    print("\n🏆 VERDICT:")
    
    # v4.7.1 FIX: Filter out None sharpe values before comparison
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
    
    # V4.8.5 P1-8: Use net_return for comparison (fallback to total_return)
    returns = [
        (r["profile"], r["stats"].get("net_return_pct") or r["stats"].get("total_return_pct")) 
        for r in results 
        if r.get("success") and (r["stats"].get("net_return_pct") is not None or r["stats"].get("total_return_pct") is not None)
    ]
    if returns:
        best = max(returns, key=lambda x: x[1])
        print(f"   Meilleur Return (NET): {best[0]} ({best[1]:.2f}%)")
    
    # v4.7.1 FIX: Filter out None/invalid drawdown values
    dds = [
        (r["profile"], r["stats"].get("max_drawdown_pct")) 
        for r in results 
        if r.get("success") and r["stats"].get("max_drawdown_pct") is not None
    ]
    if dds:
        best = max(dds, key=lambda x: x[1])
        print(f"   Meilleur Drawdown: {best[0]} ({best[1]:.2f}%)")
    
    # Vérifier l'ordre attendu
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
    
    # v4.7 P2: Rappel disclaimer
    print(f"\n⚠️  RAPPEL: {BACKTEST_DISCLAIMER.format(days=CONFIG['backtest_days'])}")
    print()


# ============= HELPER FUNCTIONS =============

# Regex pour détecter les IDs internes
INTERNAL_ID_PATTERN = re.compile(r'^(EQ_|ETF_|BOND_|CRYPTO_|CR_)\d+$', re.IGNORECASE)


def _is_internal_id(value: str) -> bool:
    """Vérifie si une valeur est un ID interne (EQ_10, ETF_123, etc.)."""
    if not value or not isinstance(value, str):
        return False
    return bool(INTERNAL_ID_PATTERN.match(value))


def _normalize_ticker_value(raw) -> Optional[str]:
    """
    V4.2.3: Normalise une valeur de ticker.
    
    Gère les cas problématiques de pandas:
    - float('nan') → None
    - "" ou "  " → None
    - "nan" (string) → None
    - int/float valides → string
    
    Returns:
        String propre ou None si invalide.
    """
    if raw is None:
        return None
    
    # Cas pandas: float NaN
    if isinstance(raw, float):
        if math.isnan(raw):
            return None
        # Float valide (rare) → string
        return str(int(raw)) if raw == int(raw) else str(raw)
    
    # Cas int
    if isinstance(raw, int):
        return str(raw)
    
    # Cas string
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return None
        if s.lower() == "nan":
            return None
        return s
    
    # Autre type: fallback string
    s = str(raw).strip()
    return s if s and s.lower() != "nan" else None


def _safe_get_attr(obj, key, default=None):
    """
    Récupère un attribut d'un objet ou d'un dict de manière sûre.
    
    V4.2.3: Utilise _normalize_ticker_value pour nettoyer les valeurs.
    
    Ordre de recherche:
    1. Attribut direct sur l'objet
    2. Dans source_data (si Asset)
    3. Dans le dict (si dict)
    4. Valeur par défaut
    """
    val = None
    
    # 1. Essayer l'attribut direct
    if hasattr(obj, key):
        val = getattr(obj, key)
        if val is not None:
            # Ne pas normaliser ici, juste retourner
            return val
    
    # 2. Essayer dans source_data (pour les objets Asset)
    if hasattr(obj, 'source_data') and obj.source_data:
        val = obj.source_data.get(key)
        if val is not None:
            return val
    
    # 3. Essayer comme dict
    if isinstance(obj, dict):
        val = obj.get(key)
        if val is not None:
            return val
    
    return default


def _extract_ticker_from_asset(asset, fallback_id: str) -> str:
    """
    V4.2.3: Extrait le ticker d'un actif de manière robuste.
    
    Gère:
    - float('nan') de pandas
    - strings vides ou "nan"
    - IDs internes (EQ_10, ETF_123)
    
    Returns:
        Ticker valide (jamais None, NaN ou ID interne si évitable)
    """
    ticker = None
    
    # 1. Attribut ticker direct
    if hasattr(asset, 'ticker'):
        ticker = _normalize_ticker_value(getattr(asset, 'ticker'))
    
    # 2. Dans source_data
    if not ticker and hasattr(asset, 'source_data') and asset.source_data:
        ticker = _normalize_ticker_value(asset.source_data.get('ticker'))
        if not ticker:
            ticker = _normalize_ticker_value(asset.source_data.get('symbol'))
    
    # 3. Si c'est un dict
    if not ticker and isinstance(asset, dict):
        ticker = _normalize_ticker_value(asset.get('ticker')) or _normalize_ticker_value(asset.get('symbol'))
    
    # 4. Validation: rejeter les IDs internes
    if ticker and _is_internal_id(ticker):
        ticker = None
    
    # 5. Fallback: utiliser le nom si pas de ticker valide
    if not ticker:
        name = _safe_get_attr(asset, 'name')
        name = _normalize_ticker_value(name)
        if name and not _is_internal_id(name):
            # Pour les ETF, le nom peut être le ticker (SPY, QQQ, URTH...)
            if len(name) <= 5 and name.isupper():
                ticker = name
    
    # 6. Dernier recours: utiliser l'ID seulement si ce n'est pas un ID interne
    if not ticker:
        fid = _normalize_ticker_value(fallback_id)
        if fid and not _is_internal_id(fid):
            ticker = fid
        else:
            # ID interne → utiliser le nom brut
            name = _safe_get_attr(asset, 'name')
            ticker = _normalize_ticker_value(name) or fid or "UNKNOWN"
    
    return ticker


def _extract_symbol_from_asset(asset) -> Optional[str]:
    """
    V4.6: Extrait le SYMBOL (vrai ticker marché) d'un actif.
    
    Pour les bonds ETF:
    - symbol = BIV, BSV, BND, AGG (vrai ticker marché)
    - ticker = KORP (proxy interne, à NE PAS utiliser)
    
    Returns:
        Symbol valide ou None
    """
    symbol = None
    
    # 1. Dans source_data (prioritaire)
    if hasattr(asset, 'source_data') and asset.source_data:
        symbol = _normalize_ticker_value(asset.source_data.get('symbol'))
    
    # 2. Attribut symbol direct
    if not symbol and hasattr(asset, 'symbol'):
        symbol = _normalize_ticker_value(getattr(asset, 'symbol'))
    
    # 3. Si c'est un dict
    if not symbol and isinstance(asset, dict):
        symbol = _normalize_ticker_value(asset.get('symbol'))
    
    # 4. Validation: rejeter les IDs internes
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
    """
    v4.8.2 P0-3: Construit la liste des limitations/compromis pour un profil.
    
    Args:
        profile: Nom du profil
        diagnostics: Diagnostics de l'optimisation
        constraint_report: Rapport de contraintes post-arrondi
        feasibility: Rapport de faisabilité ex-ante
    
    Returns:
        Liste de strings décrivant les limitations
    """
    limitations = []
    
    # 1. Mode d'optimisation
    opt_mode = diagnostics.get("optimization_mode", "slsqp")
    if opt_mode.startswith("fallback"):
        limitations.append(
            f"Allocation heuristique ({opt_mode}): les contraintes du profil {profile} "
            "sont incompatibles avec l'optimisation Markowitz classique."
        )
    
    # 2. Volatilité réalisée vs cible
    vol_realized = diagnostics.get("portfolio_vol")
    vol_target = diagnostics.get("vol_target")
    if vol_realized and vol_target:
        vol_diff = abs(vol_realized - vol_target)
        if vol_diff > 3:
            limitations.append(
                f"Volatilité réalisée ({vol_realized:.1f}%) éloignée de la cible "
                f"({vol_target:.1f}%) - écart de {vol_diff:.1f}%."
            )
    
    # 3. Contraintes post-arrondi
    if constraint_report:
        # Violations HARD
        violations = constraint_report.get("violations", [])
        hard_violations = [v for v in violations if v.get("priority") == "hard"]
        if hard_violations:
            for v in hard_violations:
                limitations.append(
                    f"Contrainte '{v['name']}' violée: attendu {v['expected']}, "
                    f"obtenu {v['actual']:.1f}%."
                )
        
        # Contraintes relâchées
        relaxed = constraint_report.get("relaxed_constraints", [])
        if relaxed:
            limitations.append(
                f"Contraintes relâchées pour ce profil: {', '.join(relaxed)}."
            )
        
        # Warnings
        warnings = constraint_report.get("warnings", [])
        if warnings:
            for w in warnings:
                limitations.append(f"Avertissement: {w}")
    
    # 4. Faisabilité ex-ante
    if feasibility and not feasibility.get("feasible", True):
        reason = feasibility.get("reason", "Raison inconnue")
        limitations.append(f"Faisabilité limitée: {reason}")
    
    # 5. Tilts tactiques désactivés
    if not CONFIG.get("use_tactical_context", False):
        limitations.append(
            "Tilts tactiques désactivés (P0-8): les surpondérations sectorielles/régionales "
            "basées sur le contexte marché ne sont pas appliquées."
        )
    
    # 6. Pas de données de corrélation
    if diagnostics.get("cov_matrix_fallback"):
        limitations.append(
            "Matrice de corrélation estimée (fallback): pas de données historiques "
            "disponibles pour tous les actifs."
        )
    
    return limitations


# ============= NORMALISATION POUR LE FRONT =============

def normalize_to_frontend_v1(portfolios: Dict[str, Dict], assets: list) -> Dict:
    """
    V4.8.5: Convertit le format interne vers le format v1 attendu par le front.
    
    AJOUTS v4.8.3 P0-4 FIX:
    - Utilise getattr() pour ProfileConstraints (dataclass pas dict)
    
    AJOUTS v4.8.2 P0-3:
    - Champ _limitations exposant les compromis/limites de chaque profil
    
    AJOUTS v4.8.1 P0-2:
    - Appel verify_constraints_post_arrondi() APRÈS round_weights_to_100()
    - Stockage du _constraint_report dans chaque profil
    - Logging des violations HARD (erreurs), warnings, succès
    
    AJOUTS v4.8 P0-9:
    - Exposition du mode d'optimisation dans _optimization
    - Disclaimer si fallback heuristique (profil Stable)
    
    CORRECTIONS v4.7 P0:
    - FIX: Utilise round_weights_to_100() pour garantir sum = exactement 100%
    - Plus de "readable sum = 97%" ou "103%"
    
    CORRECTIONS v4.6:
    - FIX CRITIQUE: Utiliser SYMBOL (BIV, BSV, BND, AGG) au lieu de TICKER (KORP) pour les bonds
    - Le champ 'symbol' contient le vrai ticker marché pour TwelveData
    - Le champ 'ticker' contient le proxy interne (KORP) - NE PAS utiliser pour _tickers
    
    Structure:
        "Agressif": {
            "Commentaire": "...",
            "Actions": { "ELI LILLY AND CO": "14%", ... },  # Pour le front
            "ETF": { ... },
            "_tickers": { "LLY": 0.14, "BIV": 0.05, ... },   # Pour le backtest (vrais symbols)
            "_optimization": { "mode": "slsqp", ... }        # v4.8 P0-9
            "_constraint_report": { ... }                     # v4.8.1 P0-2
            "_limitations": [ ... ]                           # v4.8.2 P0-3
        }
    """
    # Construire le lookup avec extraction robuste du ticker ET symbol
    asset_lookup = {}
    ticker_debug = []  # Pour debug
    bond_symbol_debug = []  # V4.6: Debug spécifique bonds
    
    for a in assets:
        aid = _safe_get_attr(a, 'id')
        name = _safe_get_attr(a, 'name') or aid
        category = _safe_get_attr(a, 'category') or 'ETF'
        
        # V4.2.3: Extraction robuste du ticker avec nettoyage NaN
        ticker = _extract_ticker_from_asset(a, aid)
        
        # V4.6: Extraire aussi le SYMBOL (vrai ticker marché)
        symbol = _extract_symbol_from_asset(a)
        
        # V4.5: Pour les bonds, récupérer aussi l'ISIN pour différenciation
        isin = None
        if hasattr(a, 'source_data') and a.source_data:
            isin = _normalize_ticker_value(a.source_data.get('isin'))
        
        asset_lookup[str(aid)] = {
            "name": name, 
            "category": category, 
            "ticker": ticker,
            "symbol": symbol,  # V4.6: Vrai ticker marché (BIV, BSV, BND, AGG)
            "isin": isin,      # V4.5: Pour différencier les bonds
            "id": aid,         # V4.5: Garder l'ID pour fallback
        }
        
        # Debug log pour les premiers actifs
        if len(ticker_debug) < 5:
            ticker_debug.append(f"{aid} -> ticker={ticker}, symbol={symbol}")
        
        # V4.6: Debug spécifique pour les bonds
        if category and 'bond' in category.lower() or 'oblig' in category.lower():
            if len(bond_symbol_debug) < 10:
                bond_symbol_debug.append(f"{name[:30]} -> symbol={symbol}, ticker={ticker}")
    
    logger.info(f"🔍 Sample ticker mapping: {ticker_debug}")
    if bond_symbol_debug:
        logger.info(f"🔍 V4.6 Bond symbols: {bond_symbol_debug[:5]}")
    
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
            "_tickers": {},  # V4.2: Bloc pour le backtest
        }
        
        # === v4.8 P0-9: Exposer le mode d'optimisation ===
        optimization_mode = diagnostics.get("optimization_mode", "slsqp")
        result[profile]["_optimization"] = {
            "mode": optimization_mode,
            "is_heuristic": optimization_mode.startswith("fallback"),
            "vol_realized": diagnostics.get("portfolio_vol"),
            "vol_target": diagnostics.get("vol_target"),
        }
        
        # P0-9: Disclaimer si fallback heuristique
        if optimization_mode.startswith("fallback"):
            result[profile]["_optimization"]["disclaimer"] = (
                "Ce portefeuille utilise une allocation heuristique (règles prédéfinies) "
                "et non une optimisation mathématique Markowitz. Les contraintes du profil "
                f"({profile}) sont incompatibles avec l'optimisation classique. "
                "Cette approche privilégie la robustesse à l'optimalité théorique."
            )
        
        # V4.4.1: Tracks pour agrégation ET debug
        ticker_collisions = {}
        name_collisions = {}  # NEW: Track collisions de noms aussi
        
        # V4.4.1: Dictionnaires pour agrégation des poids lisibles (en float)
        readable_weights = {
            "Actions": {},
            "ETF": {},
            "Obligations": {},
            "Crypto": {},
        }
        
        # V4.5: Counter pour bonds avec même nom (évite agrégation display)
        bond_name_counter = {}
        
        # V4.6: Tracking des vrais symbols utilisés pour _tickers
        bond_symbols_used = []
        
        # v4.8.1 P0-2: Construire assets_metadata pour la vérification des contraintes
        assets_metadata_for_check = {}
        
        for asset_id, weight in allocation.items():
            asset_id_str = str(asset_id)
            info = asset_lookup.get(asset_id_str, {
                "name": asset_id_str, 
                "category": "ETF", 
                "ticker": asset_id_str, 
                "symbol": None,
                "isin": None, 
                "id": asset_id_str
            })
            name = info["name"]
            ticker = info["ticker"]
            symbol = info.get("symbol")  # V4.6: Vrai ticker marché
            isin = info.get("isin")
            original_id = info.get("id", asset_id_str)
            cat_v1 = _category_v1(info["category"])
            
            # v4.8.1 P0-2: Stocker les métadonnées pour vérification contraintes
            assets_metadata_for_check[asset_id_str] = {
                "category": cat_v1,
                "name": name,
                "ticker": ticker,
            }
            
            # V4.6 FIX: Pour les Obligations, utiliser SYMBOL (pas TICKER) pour _tickers
            if cat_v1 == "Obligations":
                # === DISPLAY NAME (pour le front) ===
                # Compter les occurrences de ce nom pour ajouter un index si collision
                if name in bond_name_counter:
                    bond_name_counter[name] += 1
                    idx = bond_name_counter[name]
                    display_name = f"{name} #{idx}"
                else:
                    bond_name_counter[name] = 1
                    display_name = name
                
                # PAS d'agrégation pour les bonds (affichage)
                readable_weights[cat_v1][display_name] = weight
                
                # === TICKER KEY pour _tickers (backtest) ===
                # V4.6 FIX CRITIQUE: Utiliser SYMBOL (BIV, BSV, BND, AGG) PAS ticker (KORP)
                # Priorité: symbol > isin > ticker > name
                if symbol and not _is_internal_id(symbol):
                    pricing_ticker = symbol  # ✅ Vrai ticker marché (BIV, BSV, etc.)
                elif isin:
                    pricing_ticker = isin
                elif ticker and not _is_internal_id(ticker):
                    pricing_ticker = ticker  # Fallback sur ticker si pas de symbol
                else:
                    pricing_ticker = name  # Dernier recours
                
                # Pour _tickers: agréger par pricing_ticker (si même ETF apparaît 2x)
                tickers_dict = result[profile]["_tickers"]
                prev_weight = tickers_dict.get(pricing_ticker, 0.0)
                new_weight = round(prev_weight + weight / 100.0, 4)
                tickers_dict[pricing_ticker] = new_weight
                
                # V4.6: Track pour debug
                bond_symbols_used.append(f"{pricing_ticker}={weight}%")
                
                logger.debug(f"V4.6 BOND: {asset_id_str} → display={display_name}, pricing_ticker={pricing_ticker}, weight={weight}%")
            
            else:
                # Pour Actions, ETF, Crypto: logique d'agrégation normale
                # V4.4.1: AGRÉGATION pour le format lisible aussi (+=)
                prev_readable = readable_weights[cat_v1].get(name, 0.0)
                readable_weights[cat_v1][name] = prev_readable + weight
                
                # Track collision de nom pour debug
                if prev_readable > 0:
                    if name not in name_collisions:
                        name_collisions[name] = prev_readable
                    name_collisions[name] = readable_weights[cat_v1][name]
                
                # V4.2.3: Nettoyage final du ticker_key
                # Pour non-bonds: symbol > ticker > name
                if symbol and not _is_internal_id(symbol):
                    ticker_key = symbol
                elif ticker and not _is_internal_id(ticker):
                    ticker_key = ticker
                else:
                    ticker_key = name
                ticker_key = _normalize_ticker_value(ticker_key) or name
                
                # V4.2.3: AGRÉGATION avec += au lieu d'écrasement =
                tickers_dict = result[profile]["_tickers"]
                prev_weight = tickers_dict.get(ticker_key, 0.0)
                new_weight = round(prev_weight + weight / 100.0, 4)
                tickers_dict[ticker_key] = new_weight
                
                # Track collision ticker pour debug
                if prev_weight > 0:
                    if ticker_key not in ticker_collisions:
                        ticker_collisions[ticker_key] = prev_weight
                    ticker_collisions[ticker_key] = new_weight
        
        # === v4.7 P0 FIX: Utiliser round_weights_to_100() pour chaque catégorie ===
        for cat_v1, weights_dict in readable_weights.items():
            if not weights_dict:
                continue
            
            # Arrondir intelligemment pour que la catégorie soit cohérente
            # (Note: on ne garantit pas 100% par catégorie, mais par portfolio total)
            for name, weight in weights_dict.items():
                result[profile][cat_v1][name] = format_weight_as_percent(weight, decimals=0)
        
        # === v4.7 P0 FIX: Ajuster pour que le total = exactement 100% ===
        # Collecter tous les poids lisibles
        all_readable_weights = {}
        for cat_v1 in ["Actions", "ETF", "Obligations", "Crypto"]:
            for name, pct_str in result[profile][cat_v1].items():
                try:
                    pct_val = float(pct_str.replace("%", ""))
                    all_readable_weights[f"{cat_v1}:{name}"] = pct_val
                except:
                    pass
        
        # Appliquer le rounding intelligent
        if all_readable_weights:
            rounded_weights = round_weights_to_100(all_readable_weights, decimals=0)
            
            # Réinjecter les poids arrondis
            for key, weight in rounded_weights.items():
                cat_v1, name = key.split(":", 1)
                result[profile][cat_v1][name] = format_weight_as_percent(weight, decimals=0)
        
        # === v4.8.1 P0-2: VÉRIFICATION CONTRAINTES POST-ARRONDI ===
        # Reconstruire l'allocation avec poids arrondis pour vérification
        allocation_rounded = {}
        for cat_v1 in ["Actions", "ETF", "Obligations", "Crypto"]:
            for name, pct_str in result[profile][cat_v1].items():
                try:
                    pct_val = float(pct_str.replace("%", ""))
                    # Trouver l'asset_id correspondant
                    for aid, meta in assets_metadata_for_check.items():
                        if meta["name"] == name or name.startswith(meta["name"]):
                            allocation_rounded[aid] = pct_val
                            break
                    else:
                        # Fallback: utiliser le nom comme clé
                        allocation_rounded[name] = pct_val
                except:
                    pass
        
        # === v4.8.3 P0-4 FIX: Extraire les contraintes du profil avec getattr() ===
        # Note: PROFILES[profile] retourne un ProfileConstraints (dataclass), pas un dict
        profile_config = PROFILES.get(profile)
        profile_constraints = {
            "bonds_min": getattr(profile_config, "bonds_min", 5.0),  # Déjà en %
            "crypto_max": getattr(profile_config, "crypto_max", 10.0),  # Déjà en %
            "max_single_position": getattr(profile_config, "max_single_position", 15.0),  # Déjà en %
            "max_single_bond": 25.0,  # Constante, pas dans ProfileConstraints
            "min_assets": getattr(profile_config, "min_assets", 10),
            "max_assets": getattr(profile_config, "max_assets", 18),
            "vol_target": getattr(profile_config, "vol_target", 12.0),
            "bucket_targets": {},  # Non disponible dans ProfileConstraints
        }
        
        # Appeler la vérification
        constraint_report = verify_constraints_post_arrondi(
            allocation=allocation_rounded,
            assets_metadata=assets_metadata_for_check,
            profile_constraints=profile_constraints,
            profile_name=profile,
        )
        
        # Stocker le rapport dans le résultat
        result[profile]["_constraint_report"] = constraint_report.to_dict()
        
        # Logging selon le résultat
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
        
        # === v4.8.2 P0-3: BUILD LIMITATIONS ===
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
        
        # V4.6: Log spécial pour bonds avec vrais symbols
        n_bonds_readable = len(result[profile]["Obligations"])
        bonds_total_pct = sum(
            int(v.replace("%", "")) 
            for v in result[profile]["Obligations"].values()
        ) if result[profile]["Obligations"] else 0
        
        if n_bonds_readable > 0:
            logger.info(f"   {profile}: {n_bonds_readable} bond(s) distincts, total={bonds_total_pct}%")
            # V4.6: Afficher les vrais symbols utilisés
            if bond_symbols_used:
                logger.info(f"   {profile} bond symbols: {bond_symbols_used[:6]}{'...' if len(bond_symbols_used) > 6 else ''}")
        
        # V4.4.1: Log les collisions si présentes (seulement pour non-bonds)
        if ticker_collisions:
            logger.info(f"   {profile}: {len(ticker_collisions)} ticker(s) agrégé(s) (non-bonds): {ticker_collisions}")
        if name_collisions:
            logger.info(f"   {profile}: {len(name_collisions)} nom(s) agrégé(s) (non-bonds): {name_collisions}")
        
        # === v4.7 P0: Validation avec sum exacte ===
        total_tickers = sum(result[profile]["_tickers"].values())
        
        # Calculer total des sections lisibles
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
        
        # v4.7 P0: Validation plus stricte
        if abs(total_tickers - 1.0) > 0.02:
            logger.warning(
                f"⚠️ {profile}: _tickers sum = {total_tickers:.2%} (expected ~100%) "
                f"→ {n_allocation} lignes allocation, {n_tickers} tickers uniques"
            )
        
        # v4.7 P0: Le total readable doit être EXACTEMENT 100%
        if total_readable != 100:
            logger.warning(
                f"⚠️ {profile}: readable sum = {total_readable}% (should be exactly 100%) "
                f"→ {n_readable} items lisibles"
            )
        else:
            logger.info(f"✅ {profile}: readable={total_readable}% (exact), _tickers={total_tickers:.2%} ({n_tickers} tickers, {n_readable} items)")
        
        # V4.6: Log les tickers pour debug (montrer vrais symbols)
        tickers_list = [t for t in list(result[profile]["_tickers"].keys())[:8] if t]
        logger.info(f"   {profile} _tickers sample: {tickers_list}")
    
    # === v4.8.5: Ajouter les modes d'optimisation dans _meta ===
    result["_meta"] = {
        "generated_at": datetime.datetime.now().isoformat(),
        "version": "v4.8.5",
        "buffett_mode": CONFIG["buffett_mode"],
        "buffett_min_score": CONFIG["buffett_min_score"],
        "tactical_context_enabled": CONFIG.get("use_tactical_context", False),
        "backtest_days": CONFIG["backtest_days"],
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
    
    # 1. Format v1 pour le front
    v1_data = normalize_to_frontend_v1(portfolios, assets)
    
    v1_path = CONFIG["output_path"]
    with open(v1_path, "w", encoding="utf-8") as f:
        json.dump(v1_data, f, ensure_ascii=False, indent=2)
    logger.info(f"✅ Sauvegardé: {v1_path}")
    
    # 2. Archive v4 complète
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_path = f"{CONFIG['history_dir']}/portfolios_v4_{ts}.json"
    
    archive_data = {
        "version": "v4.8.5",
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
        },
        "portfolios": portfolios,
    }
    
    with open(archive_path, "w", encoding="utf-8") as f:
        json.dump(archive_data, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"✅ Archive: {archive_path}")
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        n_assets = len(portfolios.get(profile, {}).get("allocation", {}))
        logger.info(f"   {profile}: {n_assets} lignes")


def save_backtest_results(backtest_data: Dict):
    """Sauvegarde les résultats du backtest."""
    os.makedirs("data", exist_ok=True)
    
    output_path = CONFIG["backtest_output"]
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(backtest_data, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"✅ Backtest sauvegardé: {output_path}")


# ============= MAIN =============

def main():
    """Point d'entrée principal."""
    logger.info("=" * 60)
    logger.info("🚀 Portfolio Engine v4.8.5 - P1-8 Net/Gross")
    logger.info("=" * 60)
    
    # 1. Charger le brief (optionnel)
    brief_data = load_brief_data()
    
    # 2. Construire les portefeuilles (déterministe + Buffett + Tactical OFF)
    #    Le diagnostic Buffett s'affiche ICI, avant l'optimisation
    #    v4.8.2 P0-4: check_feasibility() appelée avant optimisation
    portfolios, assets = build_portfolios_deterministic()
    
    # 3. Ajouter les commentaires (LLM ou fallback) + disclaimer v4.7
    #    v4.8 P0-7: Double barrière LLM + audit trail
    portfolios = add_commentary(portfolios, assets, brief_data)
    
    # 4. Appliquer compliance AMF
    portfolios = apply_compliance(portfolios)
    
    # 5. Sauvegarder les portfolios
    save_portfolios(portfolios, assets)
    
    # 6. Backtest (si activé) - AVEC POIDS FIXES
    backtest_results = None
    if CONFIG["run_backtest"]:
        yaml_config = load_yaml_config(CONFIG["config_path"])
        backtest_results = run_backtest_all_profiles(yaml_config)
        
        if not backtest_results.get("skipped"):
            save_backtest_results(backtest_results)
    
    # 7. Résumé final
    logger.info("\n" + "=" * 60)
    logger.info("✨ Génération terminée avec succès!")
    logger.info("=" * 60)
    logger.info("Fichiers générés:")
    logger.info(f"   • {CONFIG['output_path']} (portfolios)")
    if backtest_results and not backtest_results.get("skipped"):
        logger.info(f"   • {CONFIG['backtest_output']} (backtest)")
    logger.info("")
    logger.info("Fonctionnalités v4.8.5 P1-8:")
    logger.info("   • Poids déterministes (Python, pas LLM)")
    logger.info("   • Prompt LLM réduit ~1500 tokens")
    logger.info("   • Compliance AMF automatique")
    logger.info("   • Backtest 90j avec POIDS FIXES ✅")
    logger.info("   • Export _tickers - FIX NaN + agrégation ✅")
    logger.info("   • P0-2: verify_constraints_post_arrondi() + _constraint_report ✅")
    logger.info("   • P0-3: _limitations field exposant compromis/limites ✅")
    logger.info("   • P0-4 FIX: getattr() pour ProfileConstraints (dataclass) ✅")
    logger.info("   • P0-7: Double barrière LLM + audit trail + fallback ✅")
    logger.info("   • P0-8: Tilts tactiques DÉSACTIVÉS (GPT non sourcé) ✅")
    logger.info("   • P0-9: Mode optimisation exposé (_optimization) ✅")
    logger.info("   • P1-7: Profile-specific benchmarks (QQQ/URTH/AGG) ✅")
    logger.info("   • 🆕 P1-8: Net/gross returns separated for AMF transparency ✅")
    logger.info("   • USE SYMBOL FOR BONDS: BIV, BSV, BND, AGG (pas KORP) ✅")
    logger.info("   • NO BOND AGGREGATION: chaque bond = ligne séparée ✅")
    logger.info("   • Reproductibilité garantie")
    logger.info(f"   • Filtre Buffett: mode={CONFIG['buffett_mode']}, score_min={CONFIG['buffett_min_score']}")
    logger.info(f"   • Contexte tactique: {'✅ activé' if CONFIG.get('use_tactical_context') else '❌ DÉSACTIVÉ (P0-8)'}")


if __name__ == "__main__":
    main()
