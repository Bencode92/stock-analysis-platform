#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de nettoyage pour supprimer les anciens fichiers stoxx_page_*.json
qui ne sont plus nécessaires avec la nouvelle structure unifiée.
"""

import os
import glob
import json
import logging
import sys

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def cleanup_old_stoxx_files():
    """
    Supprime les anciens fichiers stoxx_page_*.json qui ne sont plus nécessaires
    maintenant que toutes les données sont stockées dans lists.json
    """
    # Chemin vers le répertoire de données
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    
    if not os.path.exists(data_dir):
        logger.warning(f"Le répertoire de données {data_dir} n'existe pas!")
        return
    
    # Vérifier que lists.json existe et contient les données STOXX
    lists_path = os.path.join(data_dir, "lists.json")
    if not os.path.exists(lists_path):
        logger.warning(f"Le fichier lists.json n'existe pas! Abandon du nettoyage pour éviter de perdre des données.")
        return
    
    try:
        with open(lists_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Vérifier que la structure est correcte et contient les données STOXX
        if 'stoxx' not in data or 'indices' not in data['stoxx']:
            logger.warning("Le fichier lists.json ne contient pas de données STOXX! Abandon du nettoyage.")
            return
            
        # Trouver tous les fichiers stoxx_page_*.json
        stoxx_files = glob.glob(os.path.join(data_dir, "stoxx_page_*.json"))
        
        if not stoxx_files:
            logger.info("Aucun fichier stoxx_page_*.json trouvé. Rien à nettoyer.")
            return
            
        logger.info(f"Trouvé {len(stoxx_files)} fichier(s) stoxx_page_*.json à supprimer.")
        
        # Supprimer chaque fichier
        for file_path in stoxx_files:
            try:
                os.remove(file_path)
                logger.info(f"Supprimé: {os.path.basename(file_path)}")
            except Exception as e:
                logger.error(f"Erreur lors de la suppression de {file_path}: {str(e)}")
        
        logger.info("Nettoyage terminé avec succès!")
        
    except Exception as e:
        logger.error(f"Erreur lors du nettoyage: {str(e)}")
        return

if __name__ == "__main__":
    cleanup_old_stoxx_files()
    sys.exit(0)
