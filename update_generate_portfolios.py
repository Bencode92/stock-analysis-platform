#!/usr/bin/env python3
"""
update_generate_portfolios.py

Script pour mettre à jour generate_portfolios_v4.py avec:
- Import du module asset_rationale_generator
- Configuration generate_asset_rationales
- Appel de génération des justifications LLM dans main()

Usage:
    python update_generate_portfolios.py
"""

import re

def update_file():
    # Lire le fichier
    with open("generate_portfolios_v4.py", "r", encoding="utf-8") as f:
        content = f.read()
    
    # === MODIFICATION 1: Ajouter l'import ===
    import_marker = '''except ImportError:
    RADAR_AVAILABLE = False
    logger.warning("⚠️ Module RADAR non disponible, fallback GPT si activé")'''
    
    import_addition = '''except ImportError:
    RADAR_AVAILABLE = False
    logger.warning("⚠️ Module RADAR non disponible, fallback GPT si activé")

# v4.11.0: Import du générateur de justifications LLM par actif
try:
    from portfolio_engine.asset_rationale_generator import (
        generate_asset_rationales_sync,
        load_market_context_radar,
        merge_rationales_into_portfolio,
    )
    ASSET_RATIONALE_AVAILABLE = True
    logger.info("✅ Module asset_rationale_generator disponible")
except ImportError:
    ASSET_RATIONALE_AVAILABLE = False
    logger.warning("⚠️ Module asset_rationale_generator non disponible")'''
    
    if "ASSET_RATIONALE_AVAILABLE" not in content:
        content = content.replace(import_marker, import_addition)
        print("✅ Import ajouté")
    else:
        print("⏭️  Import déjà présent")
    
    # === MODIFICATION 2: Ajouter config ===
    config_marker = '''    "euus_output_path": "data/portfolios_euus.json",
}'''
    
    config_addition = '''    "euus_output_path": "data/portfolios_euus.json",
    # === v4.11.0: Asset Rationale LLM Generation ===
    "generate_asset_rationales": True,
}'''
    
    if "generate_asset_rationales" not in content:
        content = content.replace(config_marker, config_addition)
        print("✅ Config ajoutée")
    else:
        print("⏭️  Config déjà présente")
    
    # === MODIFICATION 3: Ajouter appel dans main() ===
    main_marker = '''    portfolios = apply_compliance(portfolios)
    save_portfolios(portfolios, assets)'''
    
    main_addition = '''    portfolios = apply_compliance(portfolios)
    
    # === v4.11.0: Génération des justifications LLM par actif ===
    if CONFIG.get("generate_asset_rationales", False) and ASSET_RATIONALE_AVAILABLE:
        logger.info("\\n" + "=" * 60)
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
    
    save_portfolios(portfolios, assets)'''
    
    if "GÉNÉRATION JUSTIFICATIONS LLM PAR ACTIF" not in content:
        content = content.replace(main_marker, main_addition)
        print("✅ Appel main() ajouté")
    else:
        print("⏭️  Appel main() déjà présent")
    
    # === Mettre à jour la version ===
    content = content.replace(
        'logger.info("🚀 Portfolio Engine v4.10.0 - Global + EU/US Focus")',
        'logger.info("🚀 Portfolio Engine v4.11.0 - Global + EU/US Focus + Asset Rationales")'
    )
    
    content = content.replace(
        '"version": "v4.9.0"',
        '"version": "v4.11.0"'
    )
    
    # Écrire le fichier mis à jour
    with open("generate_portfolios_v4.py", "w", encoding="utf-8") as f:
        f.write(content)
    
    print("\n✅ Fichier generate_portfolios_v4.py mis à jour!")
    print("   Nouvelles fonctionnalités:")
    print("   • Import asset_rationale_generator")
    print("   • Config generate_asset_rationales=True")
    print("   • Génération des justifications LLM par actif avec contexte RADAR")


if __name__ == "__main__":
    update_file()
