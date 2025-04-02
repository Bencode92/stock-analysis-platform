#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données d'indices sectoriels depuis:
- https://stoxx.com/ (directement depuis les pages officielles STOXX)
- https://www.boursorama.com/bourse/indices/internationaux (indices NASDAQ US sectoriels spécifiques)
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
import random

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
            "name": "Boursorama - Secteurs US",
            "url": "https://www.boursorama.com/bourse/indices/internationaux",
            "type": "us"
        }
    ],
    # Liste des indices STOXX Europe 600 avec leurs URLs
    "stoxx_indices": [
        {"name": "Stoxx Europe 600 Automobiles", "url": "https://stoxx.com/index/sxap/", "category": "consumer-discretionary"},
        {"name": "Stoxx Europe 600 Basic Resources", "url": "https://stoxx.com/index/sxpp/", "category": "materials"},
        {"name": "Stoxx Europe 600 Chemicals", "url": "https://stoxx.com/index/sx4p/", "category": "materials"},
        {"name": "Stoxx Europe 600 Construction & Materials", "url": "https://stoxx.com/index/sxop/", "category": "materials"},
        {"name": "Stoxx Europe 600 Financial Services", "url": "https://stoxx.com/index/sxfp/", "category": "financials"},
        {"name": "Stoxx Europe 600 Food & Beverage", "url": "https://stoxx.com/index/sx3p/", "category": "consumer-staples"},
        {"name": "Stoxx Europe 600 Health Care", "url": "https://stoxx.com/index/sxxnhp/", "category": "healthcare"},
        {"name": "Stoxx Europe 600 Industrial Goods & Services", "url": "https://stoxx.com/index/sxnp/", "category": "industrials"},
        {"name": "Stoxx Europe 600 Insurance", "url": "https://stoxx.com/index/sxnf/", "category": "financials"},
        {"name": "Stoxx Europe 600 Media", "url": "https://stoxx.com/index/sxmp/", "category": "communication-services"},
        {"name": "Stoxx Europe 600 Oil & Gas", "url": "https://stoxx.com/index/sx9l/", "category": "energy"},
        {"name": "Stoxx Europe 600 Technology", "url": "https://stoxx.com/index/sx8l/", "category": "information-technology"},
        {"name": "Stoxx Europe 600 Telecommunications", "url": "https://stoxx.com/index/sxkp/", "category": "communication-services"},
        {"name": "Stoxx Europe 600 Utilities", "url": "https://stoxx.com/index/sx6p/", "category": "utilities"}
    ],
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sectors.json"),
    # Structure des catégories sectorielles
    "categories": {
        "energy": ["énergie", "energy", "oil", "gaz", "pétrole", "oil & gas"],
        "materials": ["matériaux", "materials", "basic", "basic resources", "basic matls", "chimie", "chemicals", "construction & materials"],
        "industrials": ["industrials", "industrie", "industrial goods", "industrial goods & services", "aerospace"],
        "consumer-discretionary": ["consommation discrétionnaire", "consumer discretionary", "luxury", "retail", "auto", "automobiles", "auto & parts"],
        "consumer-staples": ["consommation de base", "consumer staples", "food", "beverage", "food & beverage"],
        "healthcare": ["santé", "health", "health care", "healthcare", "pharma", "medical"],
        "financials": ["finance", "financial", "banks", "insurance", "banques", "assurance", "financial services", "financial svcs"],
        "information-technology": ["technologie", "technology", "it", "software", "hardware", "tech"],
        "communication-services": ["communication", "telecom", "telecommunications", "media"],
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
        "sources": ["STOXX.com", "Boursorama"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "lastUpdated": datetime.now(timezone.utc).isoformat()
    }
}

# Liste pour stocker tous les secteurs avant le filtrage (pour calculer les Top 3)
ALL_SECTORS = []

def get_headers():
    """Crée des en-têtes HTTP aléatoires pour éviter la détection de bot"""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
    ]
    
    return {
        "User-Agent": random.choice(user_agents),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "DNT": "1"
    }

def determine_category(sector_name):
    """Détermine la catégorie d'un secteur en fonction de son nom"""
    sector_name_lower = sector_name.lower()
    
    # Mappings directs pour les secteurs STOXX Europe 600
    stoxx_mappings = {
        "automobiles": "consumer-discretionary",
        "basic resources": "materials",
        "chemicals": "materials",
        "construction & materials": "materials",
        "financial services": "financials",
        "food & beverage": "consumer-staples",
        "health care": "healthcare",
        "industrial goods & services": "industrials",
        "insurance": "financials",
        "media": "communication-services",
        "oil & gas": "energy",
        "technology": "information-technology",
        "telecommunications": "communication-services",
        "utilities": "utilities"
    }
    
    # Si c'est un indice STOXX Europe 600, extraire le secteur et vérifier le mapping direct
    if "stoxx europe 600" in sector_name_lower:
        for sector, category in stoxx_mappings.items():
            if sector.lower() in sector_name_lower:
                return category
    
    # Mappings spécifiques pour les indices NASDAQ US ciblés
    nasdaq_mappings = {
        "health care": "healthcare",
        "financial": "financials",
        "basic matls": "materials",
        "oil & gas": "energy",
        "tech": "information-technology",
        "auto & parts": "consumer-discretionary",
        "telecom": "communication-services"
    }
    
    # Vérifier les mappings NASDAQ
    for keyword, category in nasdaq_mappings.items():
        if keyword.lower() in sector_name_lower:
            return category
    
    # Sinon, vérifier les catégories générales
    for category, keywords in CONFIG["categories"].items():
        for keyword in keywords:
            if keyword.lower() in sector_name_lower:
                return category
    
    # Catégorie par défaut si aucune correspondance n'est trouvée
    return "other"

def extract_stoxx_com_data(html, index_name, category):
    """Extrait les données de performance depuis une page individuelle STOXX.com"""
    soup = BeautifulSoup(html, 'html.parser')

    try:
        # 🔹 Valeur actuelle (cours)
        value_span = soup.find("span", class_="current-price")
        value = value_span.text.strip() if value_span else "0"
        
        # Fallback si current-price est manquant
        if value == "0":
            alt_price_elem = soup.find("div", class_="price-value") or soup.find("div", class_="details-value")
            value = alt_price_elem.text.strip() if alt_price_elem else "0"

        # 🔹 Variation journalière en %
        change_percent_span = soup.find("span", class_="data-daily-change-percent")
        change_percent = change_percent_span.text.strip() if change_percent_span else "0"

        # 🔹 YTD
        ytdChange = "0"
        ytd_label = soup.find(string=re.compile(r"Year to Date Change", re.I))
        if ytd_label:
            ytd_parent_row = ytd_label.find_parent("div").find_parent("div")
            ytd_value_div = ytd_parent_row.find_all("div")[-1]
            ytdChange = ytd_value_div.text.strip()

        # 🔹 Fallback : 52 Week Change si YTD introuvable
        if ytdChange == "0":
            week52_label = soup.find(string=re.compile(r"52 Week Change", re.I))
            if week52_label:
                week52_parent_row = week52_label.find_parent("div").find_parent("div")
                week52_value_div = week52_parent_row.find_all("div")[-1]
                ytdChange = week52_value_div.text.strip()

        trend = "down" if "-" in change_percent else "up"

        logger.info(f"📊 Données extraites pour {index_name}: Valeur={value}, %={change_percent}, YTD={ytdChange}")

        return {
            "name": index_name,
            "value": value,
            "change": change_percent,  # utilisé comme change aussi
            "changePercent": change_percent,
            "ytdChange": ytdChange,
            "trend": trend,
            "category": category,
            "source": "stoxx.com",
            "region": "Europe"
        }

    except Exception as e:
        logger.error(f"Erreur extraction stoxx.com pour {index_name}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def extract_boursorama_data(html):
    """Extraire les données de Boursorama pour les indices NASDAQ US sectoriels spécifiques"""
    sectors = []
    soup = BeautifulSoup(html, 'html.parser')
    
    # Rechercher des tableaux contenant des indices
    tables = soup.find_all('table')
    
    # Liste pour suivre les indices cibles trouvés
    target_indices_found = []
    
    # Trouver les onglets de catégories
    sector_tab = None
    tabs = soup.find_all('a', class_='c-tab')
    for tab in tabs:
        if tab.text.strip().lower() == 'secteurs':
            sector_tab = tab
            break
    
    logger.info(f"Tab secteur trouvé: {sector_tab is not None}")
    
    # Si l'onglet Secteurs est trouvé, chercher son contenu
    if sector_tab and sector_tab.get('id'):
        tab_id = sector_tab.get('id')
        tab_content_id = tab_id.replace('-tab', '-content')
        sector_content = soup.find('div', id=tab_content_id)
        
        if sector_content:
            tables = sector_content.find_all('table')
            logger.info(f"Nombre de tableaux trouvés dans l'onglet Secteurs: {len(tables)}")
    
    # Parcourir tous les tableaux pour trouver les indices NASDAQ
    for table in tables:
        # Analyser les en-têtes pour comprendre la structure du tableau
        header = table.find('thead')
        if not header:
            continue
            
        # Trouver les index des colonnes importantes
        header_cells = header.find_all('th')
        header_texts = [cell.text.strip().lower() for cell in header_cells]
        
        logger.info(f"En-têtes trouvés: {header_texts}")
        
        # Trouver les indices des colonnes
        libelle_idx = -1
        dernier_idx = -1
        var_idx = -1
        veille_idx = -1
        var_janv_idx = -1
        
        for i, text in enumerate(header_texts):
            if 'libellé' in text or 'nom' in text:
                libelle_idx = i
            elif 'dernier' in text or 'cours' in text:
                dernier_idx = i
            elif 'var.' in text and not 'janv' in text and not 'veille' in text:
                var_idx = i
            elif 'veille' in text:
                veille_idx = i
            elif 'var/1janv' in text or '1er' in text or 'janv' in text:
                var_janv_idx = i
        
        logger.info(f"Indices de colonnes: libellé={libelle_idx}, dernier={dernier_idx}, var={var_idx}, veille={veille_idx}, var_janv={var_janv_idx}")
        
        # Si on ne trouve pas les colonnes essentielles, passer au tableau suivant
        if libelle_idx == -1 or dernier_idx == -1 or var_idx == -1:
            continue
            
        # Parcourir les lignes du tableau
        rows = table.find('tbody').find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < max(libelle_idx, dernier_idx, var_idx, var_janv_idx) + 1:
                continue
                
            try:
                # Extraire le nom de l'indice
                name_cell = cells[libelle_idx]
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
                if is_target_index or (((("NASDAQ US" in name_text or "Nasdaq US" in name_text) and any(keyword in name_text.lower() for keyword in ["health", "financial", "matls", "oil", "tech", "auto", "telecom"]))))):
                    # Nettoyer le nom (supprimer "Cours" s'il est présent)
                    clean_name = name_text.replace("Cours ", "")
                    
                    # Extraire les valeurs des différentes colonnes
                    value = cells[dernier_idx].text.strip() if dernier_idx >= 0 and dernier_idx < len(cells) else ""
                    change_percent = cells[var_idx].text.strip() if var_idx >= 0 and var_idx < len(cells) else ""
                    
                    # Extraire la variation depuis le 1er janvier (si disponible)
                    ytd_change = ""
                    if var_janv_idx >= 0 and var_janv_idx < len(cells):
                        ytd_change = cells[var_janv_idx].text.strip()
                    else:
                        logger.warning(f"Colonne VAR/1JANV introuvable pour {clean_name}. Utilisation d'une valeur vide.")
                    
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
                    logger.info(f"Indice sectoriel US ajouté: {clean_name} - Cours: {value}, VAR: {change_percent}, YTD: {ytd_change} (Catégorie: {category})")
            
            except Exception as e:
                logger.warning(f"Erreur lors du traitement d'une ligne Boursorama: {str(e)}")
    
    # Vérifier si tous les indices cibles ont été trouvés
    missing_indices = set(CONFIG["target_indices"]) - set(target_indices_found)
    if missing_indices:
        logger.warning(f"Indices cibles non trouvés: {missing_indices}")
    
    logger.info(f"Nombre d'indices sectoriels US extraits de Boursorama: {len(sectors)}")
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
    if not percent_str or percent_str == "N/A":
        return 0.0
    
    # Supprimer les caractères non numériques sauf le point décimal et le signe moins
    # Pour le format français: remplacer la virgule par un point et supprimer l'espace avant %
    clean_str = percent_str.replace(',', '.').replace(' %', '%').replace('%', '')
    clean_str = re.sub(r'[^0-9\\\\.\\\\-]', '', clean_str)
    
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

def scrape_stoxx_indices():
    """Scrape les données depuis les pages STOXX.com"""
    all_sectors = []
    
    # Utiliser des données statiques comme solution de secours en cas d'échec
    static_data = [
        {"name": "Stoxx Europe 600 Automobiles", "value": "565.07", "change": "+1.25%", "ytd": "+4.83%", "category": "consumer-discretionary"},
        {"name": "Stoxx Europe 600 Basic Resources", "value": "540.16", "change": "-0.96%", "ytd": "+4.92%", "category": "materials"},
        {"name": "Stoxx Europe 600 Chemicals", "value": "1287.87", "change": "-0.99%", "ytd": "+9.45%", "category": "materials"},
        {"name": "Stoxx Europe 600 Construction & Materials", "value": "791.68", "change": "-0.58%", "ytd": "+14.10%", "category": "materials"},
        {"name": "Stoxx Europe 600 Financial Services", "value": "879.38", "change": "+0.10%", "ytd": "+6.56%", "category": "financials"},
        {"name": "Stoxx Europe 600 Food & Beverage", "value": "681.10", "change": "+0.80%", "ytd": "+6.58%", "category": "consumer-staples"},
        {"name": "Stoxx Europe 600 Health Care", "value": "1141.97", "change": "-0.05%", "ytd": "+4.68%", "category": "healthcare"},
        {"name": "Stoxx Europe 600 Industrial Goods & Services", "value": "999.89", "change": "-0.99%", "ytd": "+14.65%", "category": "industrials"},
        {"name": "Stoxx Europe 600 Insurance", "value": "471.54", "change": "-0.42%", "ytd": "+15.53%", "category": "financials"},
        {"name": "Stoxx Europe 600 Media", "value": "455.94", "change": "+0.26%", "ytd": "-3.21%", "category": "communication-services"},
        {"name": "Stoxx Europe 600 Oil & Gas", "value": "370.31", "change": "+0.09%", "ytd": "+10.56%", "category": "energy"},
        {"name": "Stoxx Europe 600 Technology", "value": "837.31", "change": "-0.55%", "ytd": "+3.81%", "category": "information-technology"},
        {"name": "Stoxx Europe 600 Telecommunications", "value": "255.24", "change": "-0.12%", "ytd": "+11.81%", "category": "communication-services"},
        {"name": "Stoxx Europe 600 Utilities", "value": "406.12", "change": "+0.64%", "ytd": "+5.46%", "category": "utilities"}
    ]
    
    # Essayer de récupérer les données de chaque indice STOXX
    successful_scrapes = 0
    
    for index in CONFIG["stoxx_indices"]:
        try:
            logger.info(f"Récupération des données depuis STOXX.com pour {index['name']}...")
            
            # Faire une pause aléatoire pour éviter d'être détecté comme bot
            time.sleep(random.uniform(1, 3))
            
            # Récupérer la page STOXX
            headers = get_headers()
            response = requests.get(index["url"], headers=headers, timeout=30)
            
            if response.status_code != 200:
                logger.warning(f"Erreur {response.status_code} pour {index['name']} - {response.reason}")
                continue
            
            # Sauvegarder le HTML pour débogage
            debug_dir = os.path.dirname(CONFIG["output_path"])
            if not os.path.exists(debug_dir):
                os.makedirs(debug_dir, exist_ok=True)
                
            clean_name = index["name"].replace(" ", "_").lower()
            debug_file_path = os.path.join(debug_dir, f"debug_stoxx_{clean_name}.html")
            with open(debug_file_path, 'w', encoding='utf-8') as f:
                f.write(response.text)
            
            # Extraire les données avec la nouvelle fonction spécialisée
            sector = extract_stoxx_com_data(response.text, index["name"], index["category"])
            
            if sector and sector["value"] != "0" and sector["value"] != "N/A":
                all_sectors.append(sector)
                ALL_SECTORS.append(sector)
                logger.info(f"✅ Indice STOXX ajouté: {index['name']}")
                successful_scrapes += 1
            else:
                logger.warning(f"❌ Échec de l'extraction pour {index['name']} ou données incomplètes")
                
        except Exception as e:
            logger.error(f"Erreur lors du traitement de {index['name']}: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
    
    # Si trop peu d'indices ont été extraits avec succès, utiliser les données statiques
    if successful_scrapes < len(CONFIG["stoxx_indices"]) / 2:
        logger.warning(f"⚠️ Seulement {successful_scrapes} indices sur {len(CONFIG['stoxx_indices'])} ont été scrapés avec succès. Utilisation des données statiques.")
        
        # Vider les secteurs déjà collectés
        all_sectors = []
        
        # Ajouter les données statiques
        for item in static_data:
            # Déterminer la tendance
            trend = "down" if "-" in item["change"] else "up"
            
            # Créer l'objet secteur
            sector = {
                "name": item["name"],
                "value": item["value"],
                "change": item["change"],
                "changePercent": item["change"],
                "ytdChange": item["ytd"],
                "trend": trend,
                "category": item["category"],
                "source": "STOXX.com (données statiques)",
                "region": "Europe"
            }
            
            all_sectors.append(sector)
            ALL_SECTORS.append(sector)
            logger.info(f"⚠️ Indice STOXX ajouté (statique): {item['name']}")
    
    return all_sectors

def scrape_sectors_data():
    """Récupère et traite les données de tous les secteurs"""
    all_sectors = []
    
    # 1. Scraper les indices STOXX directement depuis STOXX.com
    logger.info("🚀 Récupération des données depuis STOXX.com...")
    stoxx_sectors = scrape_stoxx_indices()
    all_sectors.extend(stoxx_sectors)
    logger.info(f"✅ {len(stoxx_sectors)} indices STOXX récupérés")
    
    # 2. Pour chaque source Boursorama (pour les indices US)
    for source in CONFIG["sources"]:
        try:
            logger.info(f"Récupération des données depuis {source['name']} ({source['url']})...")
            
            # Récupérer le contenu de la page avec délai pour éviter la détection
            time.sleep(random.uniform(1, 3))
            headers = get_headers()
            logger.info(f"Utilisation du User-Agent: {headers['User-Agent']}")
            
            response = requests.get(source["url"], headers=headers, timeout=30)
            
            if response.status_code != 200:
                logger.warning(f"Erreur {response.status_code} pour {source['name']} - {response.reason}")
                # Vérifier s'il y a une redirection
                if response.history:
                    logger.warning(f"Redirection détectée: {response.url}")
                continue
            
            logger.info(f"Réponse HTTP {response.status_code} reçue pour {source['name']}")
            
            # Vérifier le contenu de base
            html = response.text
            if len(html) < 1000:
                logger.warning(f"Contenu suspect (trop court): {len(html)} caractères")
            
            # Traiter selon la source
            if "boursorama.com" in source["url"]:
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
        logger.info("Récupération des indices STOXX directement depuis STOXX.com et des indices NASDAQ US depuis Boursorama")
        
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