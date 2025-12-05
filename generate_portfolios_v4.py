#!/usr/bin/env python3
"""
generate_portfolios_v4.py - Orchestrateur complet

Architecture v4 :
- Python décide les poids (déterministe via portfolio_engine)
- LLM génère uniquement les justifications (prompt compact)
- Compliance AMF appliquée systématiquement
- Backtest 90j intégré avec comparaison des 3 profils
- Filtre Buffett sectoriel intégré

"""

import os
import json
import logging
import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import timedelta
import yaml

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
)

from compliance import (
    generate_compliance_block,
    sanitize_portfolio_output,
    AMF_DISCLAIMER,
)

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
}


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


# ============= BUFFETT DIAGNOSTIC =============

def print_buffett_diagnostic(assets: List[dict], title: str = "DIAGNOSTIC FILTRE BUFFETT"):
    """
    Affiche un diagnostic du filtre Buffett sur l'univers.
    
    Args:
        assets: Liste des actifs avec métriques Buffett (_buffett_score, etc.)
        title: Titre du diagnostic
    """
    print("\n" + "=" * 80)
    print(f"🎯 {title}")
    print("=" * 80)
    
    # Récupérer les stats sectorielles
    summary = get_sector_summary(assets)
    
    if not summary:
        print("⚠️  Pas de données sectorielles disponibles")
        return
    
    # Compter les actifs avec données
    total_with_roe = sum(1 for a in assets if a.get("roe") and float(a.get("roe", 0)) > 0)
    total_with_de = sum(1 for a in assets if a.get("de_ratio") is not None)
    
    print(f"\n📈 Couverture données: ROE={total_with_roe}/{len(assets)} ({100*total_with_roe//len(assets)}%), "
          f"D/E={total_with_de}/{len(assets)} ({100*total_with_de//len(assets)}%)")
    
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
    
    # Top 5 et Bottom 5
    scored_assets = [a for a in assets if a.get("_buffett_score")]
    if len(scored_assets) >= 10:
        sorted_by_score = sorted(scored_assets, key=lambda x: x.get("_buffett_score", 0), reverse=True)
        
        print("\n🏆 TOP 5 Buffett:")
        for a in sorted_by_score[:5]:
            name = a.get("name") or a.get("ticker") or "?"
            score = a.get("_buffett_score", 0)
            roe = a.get("roe", "N/A")
            sector = a.get("_sector_key") or a.get("sector") or "?"
            roe_str = f"{roe:.1f}%" if isinstance(roe, (int, float)) else roe
            print(f"   • {name[:25]:<25} | Score: {score:>5.0f} | ROE: {roe_str:>8} | {sector}")
        
        print("\n⚠️  BOTTOM 5 Buffett:")
        for a in sorted_by_score[-5:]:
            name = a.get("name") or a.get("ticker") or "?"
            score = a.get("_buffett_score", 0)
            reason = a.get("_buffett_reject_reason") or "score faible"
            sector = a.get("_sector_key") or a.get("sector") or "?"
            print(f"   • {name[:25]:<25} | Score: {score:>5.0f} | Raison: {reason} | {sector}")
    
    print("=" * 80 + "\n")


# ============= PIPELINE PRINCIPAL =============

def build_portfolios_deterministic() -> Dict[str, Dict]:
    """
    Pipeline déterministe : mêmes données → mêmes poids.
    Utilise les modules portfolio_engine.
    """
    logger.info("🧮 Construction des portefeuilles (déterministe)...")
    
    # 1. Charger les données brutes
    stocks_data = load_stocks_data()
    etf_csv = CONFIG["etf_csv"]
    crypto_csv = CONFIG["crypto_csv"]
    
    # 2. Charger ETF et Crypto
    import pandas as pd
    etf_data = []
    if Path(etf_csv).exists():
        try:
            df = pd.read_csv(etf_csv)
            etf_data = df.to_dict('records')
        except Exception as e:
            logger.warning(f"Impossible de charger ETF: {e}")
    
    crypto_data = []
    crypto_csv_path = CONFIG["crypto_csv"]
    if Path(crypto_csv_path).exists():
        try:
            df = pd.read_csv(crypto_csv_path)
            crypto_data = df.to_dict('records')
        except Exception as e:
            logger.warning(f"Impossible de charger crypto: {e}")
    
    # 3. Construire l'univers SANS filtre Buffett d'abord (pour diagnostic)
    logger.info("📊 Construction de l'univers...")
    logger.info(f"   Mode Buffett: {CONFIG['buffett_mode']}, Score min: {CONFIG['buffett_min_score']}")
    
    # Construire avec mode="none" pour avoir l'univers complet
    from portfolio_engine.universe import build_scored_universe as _build_universe
    
    universe_raw = _build_universe(
        stocks_data=stocks_data,
        etf_data=etf_data,
        crypto_data=crypto_data,
        returns_series=None,
        buffett_mode="none",  # Pas de filtre pour diagnostic
        buffett_min_score=0,
    )
    
    # 4. Appliquer filtre Buffett et afficher diagnostic AVANT optimisation
    if CONFIG["buffett_mode"] != "none":
        # Filtrer uniquement les equities
        equities_raw = [a for a in universe_raw if a.get("category") == "equity"]
        others = [a for a in universe_raw if a.get("category") != "equity"]
        
        logger.info(f"   Equities avant filtre: {len(equities_raw)}")
        
        # Appliquer le filtre Buffett
        equities_filtered = apply_buffett_filter(
            equities_raw,
            mode=CONFIG["buffett_mode"],
            strict=False,
            min_score=CONFIG["buffett_min_score"],
        )
        
        # === DIAGNOSTIC ICI (AVANT OPTIMISATION) ===
        print_buffett_diagnostic(
            equities_filtered, 
            f"QUALITÉ SECTORIELLE - {len(equities_filtered)} actions après filtre Buffett"
        )
        
        logger.info(f"   Equities après filtre: {len(equities_filtered)}")
        
        # Reconstruire l'univers avec equities filtrées
        universe = equities_filtered + others
    else:
        universe = universe_raw
    
    logger.info(f"   Univers final: {len(universe)} actifs total")
    
    # 5. Optimiser pour chaque profil
    optimizer = PortfolioOptimizer()
    portfolios = {}
    all_assets = []
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        logger.info(f"⚙️  Optimisation profil {profile}...")
        
        # Re-scorer selon le profil
        scored_universe = rescore_universe_by_profile(universe, profile)
        
        # Convertir en objets Asset
        assets = convert_universe_to_assets(scored_universe)
        if not all_assets:
            all_assets = assets
        
        # Optimiser
        allocation, diagnostics = optimizer.build_portfolio(assets, profile)
        
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
    
    return merge_commentary_into_portfolios(portfolios_for_prompt, commentary)


def apply_compliance(portfolios: Dict[str, Dict]) -> Dict[str, Dict]:
    """
    Applique la compliance AMF et sanitise le langage.
    """
    logger.info("🛡️  Application compliance AMF...")
    
    for profile in portfolios:
        portfolios[profile] = sanitize_portfolio_output(portfolios[profile])
        
        diag = portfolios[profile].get("diagnostics", {})
        allocation = portfolios[profile].get("allocation", {})
        crypto_exposure = sum(
            w for aid, w in allocation.items()
            if any(c in aid.upper() for c in ["CR_", "BTC", "ETH", "CRYPTO"])
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
    Exécute le backtest pour les 3 profils.
    """
    logger.info("\n" + "="*60)
    logger.info("📈 BACKTEST - Validation historique")
    logger.info("="*60)
    
    # Vérifier la clé API Twelve Data
    api_key = os.environ.get("TWELVE_DATA_API")
    if not api_key:
        logger.warning("⚠️ TWELVE_DATA_API non définie, backtest ignoré")
        return {"error": "TWELVE_DATA_API not set", "skipped": True}
    
    try:
        from backtest import BacktestConfig, run_backtest, load_prices_for_backtest
        from backtest.engine import print_backtest_report, compute_backtest_stats
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
    
    # Charger les prix UNE SEULE FOIS
    logger.info(f"📥 Chargement des prix ({CONFIG['backtest_days']}j)...")
    try:
        prices = load_prices_for_backtest(
            yaml_config,
            start_date=start_date,
            end_date=end_date,
            api_key=api_key,
            plan="ultra"  # Plan ultra = pas de rate limit
        )
        logger.info(f"✅ {len(prices.columns)} symboles, {len(prices)} jours")
    except Exception as e:
        logger.error(f"❌ Échec chargement prix: {e}")
        return {"error": str(e), "skipped": True}
    
    # Exécuter les 3 profils
    results = []
    profiles = ["Agressif", "Modéré", "Stable"]
    
    for profile in profiles:
        logger.info(f"\n⚙️  Backtest {profile}...")
        
        backtest_config = BacktestConfig(
            profile=profile,
            start_date=backtest_start,
            end_date=end_date,
            rebalance_freq=CONFIG["backtest_freq"],
            transaction_cost_bp=yaml_config.get("backtest", {}).get("transaction_cost_bp", 10),
            turnover_penalty=yaml_config.get("backtest", {}).get("turnover_penalty", 0.001),
        )
        
        profile_config = yaml_config.get("profiles", {}).get(profile, {})
        
        try:
            result = run_backtest(prices, backtest_config, profile_config)
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
        "results": results,
        "comparison": {
            r["profile"]: r.get("stats", {})
            for r in results if r.get("success")
        }
    }


def print_comparison_table(results: List[dict]):
    """Affiche un tableau comparatif des 3 profils."""
    print("\n" + "="*80)
    print("📊 COMPARAISON DES 3 PROFILS")
    print("="*80)
    
    print(f"\n{'Métrique':<25} | {'Agressif':>15} | {'Modéré':>15} | {'Stable':>15}")
    print("-"*80)
    
    metrics = [
        ("Total Return", "total_return_pct", "%"),
        ("CAGR", "cagr_pct", "%"),
        ("Volatility", "volatility_pct", "%"),
        ("Sharpe Ratio", "sharpe_ratio", ""),
        ("Max Drawdown", "max_drawdown_pct", "%"),
        ("Turnover (annuel)", "turnover_annualized_pct", "%"),
        ("Win Rate", "win_rate_pct", "%"),
    ]
    
    by_profile = {r["profile"]: r.get("stats", {}) for r in results if r.get("success")}
    
    for label, key, suffix in metrics:
        agg = by_profile.get("Agressif", {}).get(key, "N/A")
        mod = by_profile.get("Modéré", {}).get(key, "N/A")
        stb = by_profile.get("Stable", {}).get(key, "N/A")
        
        agg_str = f"{agg}{suffix}" if isinstance(agg, (int, float)) else str(agg)
        mod_str = f"{mod}{suffix}" if isinstance(mod, (int, float)) else str(mod)
        stb_str = f"{stb}{suffix}" if isinstance(stb, (int, float)) else str(stb)
        
        print(f"{label:<25} | {agg_str:>15} | {mod_str:>15} | {stb_str:>15}")
    
    print("="*80)
    
    # Verdict
    print("\n🏆 VERDICT:")
    
    sharpes = [(r["profile"], r["stats"].get("sharpe_ratio", -999)) 
               for r in results if r.get("success")]
    if sharpes:
        best = max(sharpes, key=lambda x: x[1])
        print(f"   Meilleur Sharpe: {best[0]} ({best[1]:.2f})")
    
    returns = [(r["profile"], r["stats"].get("total_return_pct", -999)) 
               for r in results if r.get("success")]
    if returns:
        best = max(returns, key=lambda x: x[1])
        print(f"   Meilleur Return: {best[0]} ({best[1]:.2f}%)")
    
    dds = [(r["profile"], r["stats"].get("max_drawdown_pct", -999)) 
           for r in results if r.get("success")]
    if dds:
        best = max(dds, key=lambda x: x[1])
        print(f"   Meilleur Drawdown: {best[0]} ({best[1]:.2f}%)")
    
    print()


# ============= NORMALISATION POUR LE FRONT =============

def normalize_to_frontend_v1(portfolios: Dict[str, Dict], assets: list) -> Dict:
    """
    Convertit le format interne vers le format v1 attendu par le front.
    """
    asset_lookup = {}
    for a in assets:
        aid = a.id if hasattr(a, 'id') else a.get('id')
        name = a.name if hasattr(a, 'name') else a.get('name', aid)
        category = a.category if hasattr(a, 'category') else a.get('category', 'ETF')
        asset_lookup[aid] = {"name": name, "category": category}
    
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
        
        result[profile] = {
            "Commentaire": comment,
            "Actions": {},
            "ETF": {},
            "Obligations": {},
            "Crypto": {},
        }
        
        for asset_id, weight in allocation.items():
            info = asset_lookup.get(asset_id, {"name": asset_id, "category": "ETF"})
            name = info["name"]
            cat_v1 = _category_v1(info["category"])
            result[profile][cat_v1][name] = f"{int(round(weight))}%"
    
    result["_meta"] = {
        "generated_at": datetime.datetime.now().isoformat(),
        "version": "v4_deterministic_engine",
        "buffett_mode": CONFIG["buffett_mode"],
        "buffett_min_score": CONFIG["buffett_min_score"],
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
        "version": "v4_deterministic_engine",
        "timestamp": ts,
        "date": datetime.datetime.now().isoformat(),
        "buffett_config": {
            "mode": CONFIG["buffett_mode"],
            "min_score": CONFIG["buffett_min_score"],
        },
        "portfolios": portfolios,
    }
    
    with open(archive_path, "w", encoding="utf-8") as f:
        json.dump(archive_data, f, ensure_ascii=False, indent=2)
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
    logger.info("🚀 Portfolio Engine v4 - Génération + Backtest")
    logger.info("=" * 60)
    
    # 1. Charger le brief (optionnel)
    brief_data = load_brief_data()
    
    # 2. Construire les portefeuilles (déterministe + Buffett)
    #    Le diagnostic Buffett s'affiche ICI, avant l'optimisation
    portfolios, assets = build_portfolios_deterministic()
    
    # 3. Ajouter les commentaires (LLM ou fallback)
    portfolios = add_commentary(portfolios, assets, brief_data)
    
    # 4. Appliquer compliance AMF
    portfolios = apply_compliance(portfolios)
    
    # 5. Sauvegarder les portfolios
    save_portfolios(portfolios, assets)
    
    # 6. Backtest (si activé)
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
    logger.info("Fonctionnalités v4:")
    logger.info("   • Poids déterministes (Python, pas LLM)")
    logger.info("   • Prompt LLM réduit ~1500 tokens")
    logger.info("   • Compliance AMF automatique")
    logger.info("   • Backtest 90j intégré")
    logger.info("   • Reproductibilité garantie")
    logger.info(f"   • Filtre Buffett: mode={CONFIG['buffett_mode']}, score_min={CONFIG['buffett_min_score']}")


if __name__ == "__main__":
    main()
