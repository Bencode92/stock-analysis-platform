#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des noms des actions du NASDAQ et du STOXX
Ce script génère un fichier JSON simple contenant uniquement les noms des actions
"""

import os
import json
import logging
from datetime import datetime, timezone

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Chemin vers les données
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
LISTS_JSON_PATH = os.path.join(DATA_DIR, "lists.json")
OUTPUT_PATH = os.path.join(DATA_DIR, "stock_names.json")

def extract_stock_names():
    """
    Extrait uniquement les noms des actions du NASDAQ et du STOXX à partir du fichier lists.json
    """
    logger.info("🔍 Extraction des noms des actions NASDAQ et STOXX...")
    
    try:
        # Vérifier que le fichier lists.json existe
        if not os.path.exists(LISTS_JSON_PATH):
            logger.error(f"❌ Le fichier {LISTS_JSON_PATH} n'existe pas")
            return False
        
        # Charger les données
        with open(LISTS_JSON_PATH, 'r', encoding='utf-8') as f:
            lists_data = json.load(f)
        
        # Initialiser les listes pour stocker les noms
        nasdaq_names = []
        stoxx_names = []
        
        # Extraire les noms des actions NASDAQ
        if "nasdaq" in lists_data and "indices" in lists_data["nasdaq"]:
            for letter, stocks in lists_data["nasdaq"]["indices"].items():
                for stock in stocks:
                    if "name" in stock and stock["name"]:
                        nasdaq_names.append(stock["name"])
        
        # Extraire les noms des actions STOXX
        if "stoxx" in lists_data and "indices" in lists_data["stoxx"]:
            for letter, stocks in lists_data["stoxx"]["indices"].items():
                for stock in stocks:
                    if "name" in stock and stock["name"]:
                        stoxx_names.append(stock["name"])
        
        # Trier les noms par ordre alphabétique
        nasdaq_names.sort()
        stoxx_names.sort()
        
        # Créer la structure de données pour le fichier JSON
        stock_names = {
            "nasdaq": nasdaq_names,
            "stoxx": stoxx_names,
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "nasdaq_count": len(nasdaq_names),
                "stoxx_count": len(stoxx_names),
                "total_count": len(nasdaq_names) + len(stoxx_names)
            }
        }
        
        # Enregistrer les données dans un fichier JSON
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(stock_names, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Extraction terminée: {len(nasdaq_names)} actions NASDAQ, {len(stoxx_names)} actions STOXX")
        logger.info(f"✅ Données enregistrées dans {OUTPUT_PATH}")
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'extraction des noms: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def main():
    """Point d'entrée principal"""
    logger.info("🚀 Démarrage de l'extraction des noms d'actions...")
    
    # S'assurer que le répertoire de données existe
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # Extraire les noms
    success = extract_stock_names()
    
    if success:
        logger.info("✅ Script terminé avec succès")
        return 0
    else:
        logger.error("❌ Échec du script")
        return 1

if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)
