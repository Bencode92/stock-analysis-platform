#!/usr/bin/env python3
"""
generate_portfolios_v4.py - Orchestrateur simplifié

Architecture v4 :
- Python décide les poids (déterministe via portfolio_engine)
- LLM génère uniquement les justifications (prompt compact)
- Compliance AMF appliquée systématiquement

Fichier réduit de 4000 → ~300 lignes.
"""

import os
import json
import logging
import datetime
from pathlib import Path
from typing import Dict, Any, Optional

# === Nouveaux modules ===
from portfolio_engine import (
    load_and_build_universe,
    rescore_universe_by_profile,
    PortfolioOptimizer,
    convert_universe_to_assets,
    PROFILES,
    build_commentary_prompt,
    generate_commentary_sync,
    generate_fallback_commentary,
    merge_commentary_into_portfolios,
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
    "use_llm": True,  # False = fallback commentaires sans LLM
    "llm_model": "gpt-4o-mini",
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


# ============= PIPELINE PRINCIPAL =============

def build_portfolios_deterministic() -> Dict[str, Dict]:
    """
    Pipeline déterministe : mêmes données → mêmes poids.
    Utilise les modules portfolio_engine.
    """
    logger.info("🧮 Construction des portefeuilles (déterministe)...")
    
    # 1. Charger les données
    stocks_data = load_stocks_data()
    etf_csv = CONFIG["etf_csv"]
    crypto_csv = CONFIG["crypto_csv"]
    
    # 2. Construire l'univers scoré
    logger.info("📊 Construction de l'univers...")
    universe = load_and_build_universe(
        stocks_paths=[p for p in CONFIG["stocks_paths"] if Path(p).exists()],
        etf_csv=etf_csv if Path(etf_csv).exists() else None,
        crypto_csv=crypto_csv if Path(crypto_csv).exists() else None,
    )
    
    logger.info(f"   Univers: {len(universe)} actifs total")
    
    # 3. Optimiser pour chaque profil
    optimizer = PortfolioOptimizer()
    portfolios = {}
    all_assets = []  # Pour le LLM
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        logger.info(f"⚙️  Optimisation profil {profile}...")
        
        # Re-scorer selon le profil
        scored_universe = rescore_universe_by_profile(universe, profile)
        
        # Convertir en objets Asset
        assets = convert_universe_to_assets(scored_universe)
        if not all_assets:
            all_assets = assets  # Garder pour le LLM
        
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
    
    # Préparer les données pour le prompt
    portfolios_for_prompt = {
        profile: {
            "allocation": data["allocation"],
            "diagnostics": data["diagnostics"],
        }
        for profile, data in portfolios.items()
    }
    
    # Essayer le LLM
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
    
    # Fusionner
    return merge_commentary_into_portfolios(portfolios_for_prompt, commentary)


def apply_compliance(portfolios: Dict[str, Dict]) -> Dict[str, Dict]:
    """
    Applique la compliance AMF et sanitise le langage.
    """
    logger.info("🛡️  Application compliance AMF...")
    
    for profile in portfolios:
        # Sanitiser les textes
        portfolios[profile] = sanitize_portfolio_output(portfolios[profile])
        
        # Générer le bloc compliance adapté
        diag = portfolios[profile].get("diagnostics", {})
        
        # Calculer l'exposition crypto
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


# ============= NORMALISATION POUR LE FRONT =============

def normalize_to_frontend_v1(portfolios: Dict[str, Dict], assets: list) -> Dict:
    """
    Convertit le format interne vers le format v1 attendu par le front.
    {
        "Agressif": {
            "Commentaire": "...",
            "Actions": {"Nom": "X%"},
            "ETF": {...},
            "Obligations": {...},
            "Crypto": {...}
        }
    }
    """
    # Lookup asset_id -> infos
    asset_lookup = {}
    for a in assets:
        aid = a.id if hasattr(a, 'id') else a.get('id')
        name = a.name if hasattr(a, 'name') else a.get('name', aid)
        category = a.category if hasattr(a, 'category') else a.get('category', 'ETF')
        asset_lookup[aid] = {"name": name, "category": category}
    
    def _category_v1(cat: str) -> str:
        """Normalise la catégorie pour le front."""
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
    
    # Ajouter métadonnées
    result["_meta"] = {
        "generated_at": datetime.datetime.now().isoformat(),
        "version": "v4_deterministic_engine",
    }
    
    return result


# ============= SAUVEGARDE =============

def save_portfolios(portfolios: Dict, assets: list):
    """
    Sauvegarde les portefeuilles :
    - portfolios.json (format v1 pour le front)
    - Archive v4 dans l'historique
    """
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
        "portfolios": portfolios,
    }
    
    with open(archive_path, "w", encoding="utf-8") as f:
        json.dump(archive_data, f, ensure_ascii=False, indent=2)
    logger.info(f"✅ Archive: {archive_path}")
    
    # 3. Récap
    for profile in ["Agressif", "Modéré", "Stable"]:
        n_assets = len(portfolios.get(profile, {}).get("allocation", {}))
        logger.info(f"   {profile}: {n_assets} lignes")


# ============= MAIN =============

def main():
    """Point d'entrée principal."""
    logger.info("=" * 60)
    logger.info("🚀 Portfolio Engine v4 - Génération déterministe")
    logger.info("=" * 60)
    
    # 1. Charger le brief (optionnel)
    brief_data = load_brief_data()
    
    # 2. Construire les portefeuilles (déterministe)
    portfolios, assets = build_portfolios_deterministic()
    
    # 3. Ajouter les commentaires (LLM ou fallback)
    portfolios = add_commentary(portfolios, assets, brief_data)
    
    # 4. Appliquer compliance AMF
    portfolios = apply_compliance(portfolios)
    
    # 5. Sauvegarder
    save_portfolios(portfolios, assets)
    
    logger.info("=" * 60)
    logger.info("✨ Génération terminée avec succès!")
    logger.info("=" * 60)
    logger.info("Fonctionnalités v4:")
    logger.info("   • Poids déterministes (Python, pas LLM)")
    logger.info("   • Prompt LLM réduit ~1500 tokens (vs ~8000)")
    logger.info("   • Compliance AMF automatique")
    logger.info("   • Reproductibilité garantie")


if __name__ == "__main__":
    main()
