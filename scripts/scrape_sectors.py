#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données d'indices sectoriels depuis:
- https://investir.lesechos.fr/cours/indices/sectoriels-stoxx-europe-600
- https://www.boursorama.com/bourse/indices/internationaux
Spécifiquement ciblé sur les indices NASDAQ US sectoriels
"""

import os
import json
import sys
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup
import logging
import time
import re

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "sources": [
        {
            "name": "Les Echos - STOXX Europe 600",
            "url": "https://investir.lesechos.fr/cours/indices/sectoriels-stoxx-europe-600",
            "type": "europe"
        },
        {
            "name": "Boursorama - Secteurs US",
            "url": "https://www.boursorama.com/bourse/indices/internationaux",
            "type": "us"
        }
    ],
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sectors.json"),
    # Structure des catégories sectorielles
    "categories": {
        "energy": ["énergie", "energy", "oil", "gaz", "pétrole", "oil & gas"],
        "materials": ["matériaux", "materials", "basic", "basic matls", "chimie"],
        "industrials": ["industrials", "industrie", "industrial goods", "aerospace"],
        "consumer-discretionary": ["consommation discrétionnaire", "consumer discretionary", "luxury", "retail", "auto", "auto & parts"],
        "consumer-staples": ["consommation de base", "consumer staples", "food", "beverage"],
        "healthcare": ["santé", "health", "healthcare", "pharma", "medical"],
        "financials": ["finance", "financial", "banks", "insurance", "banques", "assurance", "financial svcs"],
        "information-technology": ["technologie", "technology", "it", "software", "hardware", "tech"],
        "communication-services": ["communication", "telecom", "media"],
        "utilities": ["services publics", "utilities", "électricité", "eau", "gas"],
        "real-estate": ["immobilier", "real estate", "reits"]
    },
    # Indices NASDAQ US spécifiques à scraper
    "target_indices": [
        "NASDAQ US Health Care Large Mid Cap NTR Index",
        "NASDAQ US Financial Svcs Large Mid Cap NTR Index",
        "NASDAQ US Basic Matls Large Mid Cap NTR Index",
        "NASDAQ US Oil & Gas Producers Large Mid Cap Index",
        "NASDAQ US Tech Large Mid Cap Index",
        "NASDAQ US Auto & Parts Large Mid Cap Index",
        "NASDAQ US Telecom Large Mid Cap Index"
    ]
}

# Structure pour les données
SECTOR_DATA = {
    "sectors": {
        "energy": [],
        "materials": [],
        "industrials": [],
        "consumer-discretionary": [],
        "consumer-staples": [],
        "healthcare": [],
        "financials": [],
        "information-technology": [],
        "communication-services": [],
        "utilities": [],
        "real-estate": []
    },
    "top_performers": {
        "daily": {
            "best": [],
            "worst": []
        },
        "ytd": {
            "best": [],
            "worst": []
        }
    },
    "meta": {
        "sources": ["Les Echos", "Boursorama"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "lastUpdated": datetime.now(timezone.utc).isoformat()
    }
}

# Liste pour stocker tous les secteurs avant le filtrage (pour calculer les Top 3)
ALL_SECTORS = []

def get_headers():
    """Crée des en-têtes HTTP aléatoires pour éviter la détection de bot"""
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/"
    }

def determine_category(sector_name):
    """Détermine la catégorie d'un secteur en fonction de son nom"""
    sector_name_lower = sector_name.lower()
    
    # Mappings spécifiques pour les indices NASDAQ US ciblés
    specific_mappings = {
        "health care": "healthcare",
        "financial": "financials",
        "basic matls": "materials",
        "oil & gas": "energy",
        "tech": "information-technology",
        "auto & parts": "consumer-discretionary",
        "telecom": "communication-services"
    }
    
    # Vérifier d'abord les mappings spécifiques
    for keyword, category in specific_mappings.items():
        if keyword.lower() in sector_name_lower:
            return category
    
    # Sinon, vérifier les catégories générales
    for category, keywords in CONFIG["categories"].items():
        for keyword in keywords:
            if keyword.lower() in sector_name_lower:
                return category
    
    # Catégorie par défaut si aucune correspondance n'est trouvée
    return "other"

def extract_lesechos_data(html):
    """Extraire les données de Les Echos pour les secteurs STOXX Europe 600"""
    sectors = []
    soup = BeautifulSoup(html, 'html.parser')
    
    # Recherche du tableau des indices sectoriels
    tables = soup.find_all('table', class_='c-table')
    
    for table in tables:
        # Vérifier si c'est bien le tableau des secteurs
        header = table.find('thead')
        if not header or not any('Secteur' in th.text for th in header.find_all('th')):
            continue
        
        # Analyser les lignes du tableau
        for row in table.find('tbody').find_all('tr'):
            cells = row.find_all('td')
            if len(cells) < 5:
                continue
            
            try:
                # Extraire le nom du secteur
                name_cell = cells[0]
                name = name_cell.text.strip()
                
                # Extraire la valeur (cours)
                value_cell = cells[1]
                value = value_cell.text.strip()
                
                # Extraire la variation quotidienne
                daily_change_cell = cells[2]
                daily_change = daily_change_cell.text.strip()
                
                # Extraire la variation annuelle (YTD)
                ytd_cell = cells[3]
                ytd_change = ytd_cell.text.strip()
                
                # Déterminer la tendance
                trend = "down" if '-' in daily_change else "up"
                
                # Déterminer la catégorie sectorielle
                category = determine_category(name)
                
                # Créer l'objet secteur
                sector = {
                    "name": name,
                    "value": value,
                    "change": daily_change,
                    "changePercent": daily_change,
                    "ytdChange": ytd_change,
                    "trend": trend,
                    "category": category,
                    "source": "Les Echos",
                    "region": "Europe"
                }
                
                sectors.append(sector)
                ALL_SECTORS.append(sector)
                
            except Exception as e:
                logger.warning(f"Erreur lors du traitement d'une ligne Les Echos: {str(e)}")
                
    logger.info(f"Nombre de secteurs extraits de Les Echos: {len(sectors)}")
    return sectors

def extract_boursorama_data(html):
    """Extraire les données de Boursorama pour les indices NASDAQ US sectoriels spécifiques"""
    sectors = []
    soup = BeautifulSoup(html, 'html.parser')
    
    # Rechercher des tableaux contenant des indices
    tables = soup.find_all('table')
    
    # Liste pour suivre les indices cibles trouvés
    target_indices_found = []
    
    for table in tables:
        # Parcourir toutes les lignes de tous les tableaux
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 4:
                continue
                
            try:
                # Extraire le nom de l'indice
                name_cell = cells[0]
                name_text = name_cell.text.strip()
                
                # Vérifier si c'est l'un des indices NASDAQ US ciblés
                is_target_index = False
                for target in CONFIG["target_indices"]:
                    # Vérifier si l'indice cible est présent dans le nom (en ignorant "Cours" qui peut être ajouté)
                    clean_name = name_text.replace("Cours ", "")
                    if target.lower() in clean_name.lower():
                        is_target_index = True
                        target_indices_found.append(target)
                        logger.info(f"Indice cible trouvé: {clean_name}")
                        break
                
                # Si c'est un indice NASDAQ sectoriel US qui nous intéresse
                if is_target_index or "NASDAQ US" in name_text and any(keyword in name_text.lower() for keyword in ["health", "financial", "matls", "oil", "tech", "auto", "telecom"]):
                    # Nettoyer le nom (supprimer "Cours" s'il est présent)
                    clean_name = name_text.replace("Cours ", "")
                    
                    # Extraire la valeur, variations, etc.
                    value = cells[1].text.strip() if len(cells) > 1 else ""
                    change_percent = cells[2].text.strip() if len(cells) > 2 else ""
                    ytd_change = cells[3].text.strip() if len(cells) > 3 else ""
                    
                    # Déterminer la tendance
                    trend = "down" if '-' in change_percent else "up"
                    
                    # Déterminer la catégorie
                    category = determine_category(clean_name)
                    
                    # Créer l'objet secteur
                    sector = {
                        "name": clean_name,
                        "value": value,
                        "change": change_percent,
                        "changePercent": change_percent,
                        "ytdChange": ytd_change,
                        "trend": trend,
                        "category": category,
                        "source": "Boursorama",
                        "region": "US"
                    }
                    
                    sectors.append(sector)
                    ALL_SECTORS.append(sector)
                    logger.info(f"Indice sectoriel ajouté: {clean_name} (Catégorie: {category})")
            
            except Exception as e:
                logger.warning(f"Erreur lors du traitement d'une ligne Boursorama: {str(e)}")
    
    # Vérifier si tous les indices cibles ont été trouvés
    missing_indices = set(CONFIG["target_indices"]) - set(target_indices_found)
    if missing_indices:
        logger.warning(f"Indices cibles non trouvés: {missing_indices}")
    
    logger.info(f"Nombre d'indices sectoriels extraits de Boursorama: {len(sectors)}")
    return sectors

def classify_sectors(sectors):
    """Classe les secteurs dans les bonnes catégories"""
    # Réinitialiser les catégories
    for category in SECTOR_DATA["sectors"]:
        SECTOR_DATA["sectors"][category] = []
    
    # Classer chaque secteur
    for sector in sectors:
        category = sector["category"]
        if category in SECTOR_DATA["sectors"]:
            SECTOR_DATA["sectors"][category].append(sector)
        else:
            # Créer la catégorie si elle n'existe pas
            SECTOR_DATA["sectors"][category] = [sector]
    
    # Compter le nombre total de secteurs
    SECTOR_DATA["meta"]["count"] = sum(len(sectors) for sectors in SECTOR_DATA["sectors"].values())

def parse_percentage(percent_str):
    """Convertit une chaîne de pourcentage en nombre flottant"""
    if not percent_str:
        return 0.0
    
    # Supprimer les caractères non numériques sauf le point décimal et le signe moins
    clean_str = re.sub(r'[^0-9\.\-]', '', percent_str.replace(',', '.'))
    
    try:
        return float(clean_str)
    except ValueError:
        return 0.0

def calculate_top_performers():
    """Calcule les secteurs avec les meilleures et pires performances"""
    logger.info("Calcul des secteurs avec les meilleures/pires performances...")
    
    # Si pas assez de secteurs, ne rien faire
    if len(ALL_SECTORS) < 3:
        logger.warning("Pas assez de secteurs pour calculer les top performers")
        return
    
    # Préparer les secteurs avec des valeurs numériques pour les classements
    for sector in ALL_SECTORS:
        sector["_change_value"] = parse_percentage(sector.get("changePercent", "0"))
        sector["_ytd_value"] = parse_percentage(sector.get("ytdChange", "0"))
    
    # Filtrer les secteurs avec des valeurs de pourcentage valides
    valid_sectors = [s for s in ALL_SECTORS if s["_change_value"] != 0 or s["_ytd_value"] != 0]
    
    # Trier par variation quotidienne
    if valid_sectors:
        # Trier et sélectionner les 3 meilleurs et les 3 pires
        sorted_daily = sorted(valid_sectors, key=lambda x: x["_change_value"], reverse=True)
        
        # Sélectionner les 3 meilleurs
        best_daily = sorted_daily[:3]
        # Sélectionner les 3 pires (en excluant les valeurs à 0 qui pourraient être des données manquantes)
        worst_daily = [idx for idx in sorted_daily if idx["_change_value"] != 0]
        worst_daily = sorted(worst_daily, key=lambda x: x["_change_value"])[:3]
        
        # Ajouter aux résultats en supprimant le champ temporaire _change_value
        for idx in best_daily:
            idx_copy = {k: v for k, v in idx.items() if not k.startswith('_')}
            SECTOR_DATA["top_performers"]["daily"]["best"].append(idx_copy)
        
        for idx in worst_daily:
            idx_copy = {k: v for k, v in idx.items() if not k.startswith('_')}
            SECTOR_DATA["top_performers"]["daily"]["worst"].append(idx_copy)
    
    # Trier par variation depuis le début de l'année
    if valid_sectors:
        # Trier et sélectionner les 3 meilleurs et les 3 pires
        sorted_ytd = sorted(valid_sectors, key=lambda x: x["_ytd_value"], reverse=True)
        
        # Sélectionner les 3 meilleurs
        best_ytd = sorted_ytd[:3]
        # Sélectionner les 3 pires (en excluant les valeurs à 0 qui pourraient être des données manquantes)
        worst_ytd = [idx for idx in sorted_ytd if idx["_ytd_value"] != 0]
        worst_ytd = sorted(worst_ytd, key=lambda x: x["_ytd_value"])[:3]
        
        # Ajouter aux résultats en supprimant le champ temporaire _ytd_value
        for idx in best_ytd:
            idx_copy = {k: v for k, v in idx.items() if not k.startswith('_')}
            SECTOR_DATA["top_performers"]["ytd"]["best"].append(idx_copy)
        
        for idx in worst_ytd:
            idx_copy = {k: v for k, v in idx.items() if not k.startswith('_')}
            SECTOR_DATA["top_performers"]["ytd"]["worst"].append(idx_copy)
    
    logger.info(f"Top performers calculés. Daily: {len(SECTOR_DATA['top_performers']['daily']['best'])} best, {len(SECTOR_DATA['top_performers']['daily']['worst'])} worst. YTD: {len(SECTOR_DATA['top_performers']['ytd']['best'])} best, {len(SECTOR_DATA['top_performers']['ytd']['worst'])} worst.")

def scrape_sectors_data():
    """Récupère et traite les données de tous les secteurs"""
    all_sectors = []
    
    # Pour chaque source configurée
    for source in CONFIG["sources"]:
        try:
            logger.info(f"Récupération des données depuis {source['name']} ({source['url']})...")
            
            # Récupérer le contenu de la page
            response = requests.get(source["url"], headers=get_headers(), timeout=30)
            if response.status_code != 200:
                logger.warning(f"Erreur {response.status_code} pour {source['name']}")
                continue
                
            html = response.text
            
            # Traiter selon la source
            if "lesechos.fr" in source["url"]:
                sectors = extract_lesechos_data(html)
            elif "boursorama.com" in source["url"]:
                sectors = extract_boursorama_data(html)
            else:
                logger.warning(f"Source non reconnue: {source['name']}")
                continue
                
            all_sectors.extend(sectors)
            
        except Exception as e:
            logger.error(f"Erreur lors du traitement de {source['name']}: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
    
    # Classer les secteurs récupérés
    classify_sectors(all_sectors)
    
    # Calculer les top performers
    calculate_top_performers()
    
    # Mettre à jour l'horodatage
    SECTOR_DATA["meta"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    
    return len(all_sectors) > 0

def save_sector_data():
    """Enregistre les données sectorielles dans un fichier JSON"""
    try:
        # Créer le dossier data s'il n'existe pas
        data_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)
        
        # Écrire le fichier JSON
        with open(CONFIG["output_path"], 'w', encoding='utf-8') as f:
            json.dump(SECTOR_DATA, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données sectorielles enregistrées dans {CONFIG['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données: {str(e)}")
        return False

def check_existing_data():
    """Vérifier si un fichier de données existe déjà"""
    try:
        if os.path.exists(CONFIG["output_path"]):
            logger.info("📂 Fichier de données sectorielles existant trouvé")
            return True
        return False
    except Exception as e:
        logger.error(f"❌ Erreur lors de la vérification du fichier existant: {str(e)}")
        return False

def main():
    """Point d'entrée principal du script"""
    try:
        logger.info("🚀 Démarrage du script de scraping des données sectorielles")
        logger.info(f"Ciblant spécifiquement les indices NASDAQ US sectoriels suivants:")
        for idx in CONFIG["target_indices"]:
            logger.info(f"  - {idx}")
        
        # Vérifier si les données existent déjà
        has_existing_data = check_existing_data()
        
        # Récupérer les données sectorielles
        success = scrape_sectors_data()
        
        # Si l'extraction échoue mais qu'on a des données existantes, conserver le fichier
        if not success and has_existing_data:
            logger.info("⚠️ Utilisation des données existantes car le scraping a échoué")
            sys.exit(0) # Sortie sans erreur pour ne pas faire échouer le workflow
        elif not success and not has_existing_data:
            logger.error("❌ Aucune donnée existante et échec du scraping")
            sys.exit(1) # Sortie avec erreur car on n'a pas de données
        else:
            # Enregistrer les données
            if save_sector_data():
                logger.info("✅ Traitement des données sectorielles terminé avec succès")
                sys.exit(0)
            else:
                logger.error("❌ Échec lors de l'enregistrement des données")
                sys.exit(1)
            
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        # Si une erreur se produit mais que le fichier existe déjà, ne pas faire échouer le workflow
        if check_existing_data():
            logger.info("⚠️ Une erreur s'est produite mais les données existantes seront conservées")
            sys.exit(0)
        else:
            sys.exit(1)

if __name__ == "__main__":
    # Désactiver l'avertissement sur les vérifications SSL désactivées
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    # Lancer le programme
    main()