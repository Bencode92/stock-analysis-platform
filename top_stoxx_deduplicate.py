#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de déduplication pour le fichier top_stoxx_performers.json

Ce script prend le fichier top_stoxx_performers.json existant, 
déduplique les listes et sauvegarde le résultat.
"""

import json
import os
import logging

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Chemin du fichier
FILE_PATH = "data/top_stoxx_performers.json"

def remove_duplicates(stocks):
    """
    Déduplique une liste d'actions en utilisant un identifiant unique.
    Utilise principalement le lien comme identifiant, ou à défaut le nom.
    
    Args:
        stocks (list): Liste d'actions à dédupliquer
        
    Returns:
        list: Liste d'actions sans doublons
    """
    seen = set()
    unique_stocks = []
    
    for stock in stocks:
        # Utiliser le lien comme identifiant principal, sinon le nom
        identifier = stock.get("link", "") or stock.get("name", "")
        
        if identifier and identifier not in seen:
            seen.add(identifier)
            unique_stocks.append(stock)
    
    logger.info(f"Déduplication: {len(unique_stocks)}/{len(stocks)} actions conservées ({len(stocks) - len(unique_stocks)} doublons supprimés)")
    return unique_stocks

def fill_to_ten(stocks, is_positive=True):
    """
    Complète une liste à 10 éléments si besoin en copiant le dernier élément
    
    Args:
        stocks (list): Liste d'actions possiblement incomplète
        is_positive (bool): Si True, taux de variation positif, sinon négatif
        
    Returns:
        list: Liste d'actions avec 10 éléments
    """
    if len(stocks) >= 10:
        return stocks[:10]
        
    # S'il manque des éléments, on va copier le dernier
    if stocks:
        last_element = stocks[-1]
        template = {k: v for k, v in last_element.items()}
        template["name"] = f"Stock Placeholder {len(stocks) + 1}"
        template["change"] = "+0.00%" if is_positive else "-0.00%"
        template["ytd"] = "+0.00%" if is_positive else "-0.00%"
        
        while len(stocks) < 10:
            new_element = template.copy()
            new_element["name"] = f"Stock Placeholder {len(stocks) + 1}"
            stocks.append(new_element)
    
    return stocks

def main():
    """Fonction principale du script"""
    try:
        # Vérifier si le fichier existe
        if not os.path.exists(FILE_PATH):
            logger.error(f"Fichier non trouvé: {FILE_PATH}")
            return 1
            
        # Charger le fichier JSON
        with open(FILE_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # Vérifier la structure du fichier
        if "daily" not in data or "ytd" not in data:
            logger.error("Structure de données non valide")
            return 1
            
        # Appliquer la déduplication sur chaque liste
        modified = False
        
        if "daily" in data and "best" in data["daily"]:
            original_count = len(data["daily"]["best"])
            data["daily"]["best"] = remove_duplicates(data["daily"]["best"])
            data["daily"]["best"] = fill_to_ten(data["daily"]["best"], True)
            if len(data["daily"]["best"]) != original_count:
                modified = True
                logger.info(f"Déduplication des hausses quotidiennes: {len(data['daily']['best'])}/10")
                
        if "daily" in data and "worst" in data["daily"]:
            original_count = len(data["daily"]["worst"])
            data["daily"]["worst"] = remove_duplicates(data["daily"]["worst"])
            data["daily"]["worst"] = fill_to_ten(data["daily"]["worst"], False)
            if len(data["daily"]["worst"]) != original_count:
                modified = True
                logger.info(f"Déduplication des baisses quotidiennes: {len(data['daily']['worst'])}/10")
                
        if "ytd" in data and "best" in data["ytd"]:
            original_count = len(data["ytd"]["best"])
            data["ytd"]["best"] = remove_duplicates(data["ytd"]["best"])
            data["ytd"]["best"] = fill_to_ten(data["ytd"]["best"], True)
            if len(data["ytd"]["best"]) != original_count:
                modified = True
                logger.info(f"Déduplication des hausses YTD: {len(data['ytd']['best'])}/10")
                
        if "ytd" in data and "worst" in data["ytd"]:
            original_count = len(data["ytd"]["worst"])
            data["ytd"]["worst"] = remove_duplicates(data["ytd"]["worst"])
            data["ytd"]["worst"] = fill_to_ten(data["ytd"]["worst"], False)
            if len(data["ytd"]["worst"]) != original_count:
                modified = True
                logger.info(f"Déduplication des baisses YTD: {len(data['ytd']['worst'])}/10")
        
        # Sauvegarder les modifications si nécessaire
        if modified:
            with open(FILE_PATH, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(f"Fichier mis à jour avec succès: {FILE_PATH}")
        else:
            logger.info("Aucun doublon trouvé, fichier non modifié")
            
        return 0
        
    except Exception as e:
        logger.error(f"Erreur lors de la déduplication: {e}", exc_info=True)
        return 1

if __name__ == "__main__":
    exit_code = main()
    if exit_code == 0:
        logger.info("Déduplication terminée avec succès")
    else:
        logger.error("Échec de la déduplication")
