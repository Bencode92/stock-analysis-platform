#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données d'indices sectoriels depuis:
- https://investir.lesechos.fr/cours/indices/sectoriels-stoxx-europe-600 (TOUS les indices STOXX Europe 600)
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
    ],
    # Indices STOXX Europe 600 à scraper
    "target_stoxx_indices": [
        "Stoxx Europe 600 Automobiles",
        "Stoxx Europe 600 Basic Resources",
        "Stoxx Europe 600 Chemicals",
        "Stoxx Europe 600 Construction & Materials",
        "Stoxx Europe 600 Financial Services",
        "Stoxx Europe 600 Food & Beverage",
        "Stoxx Europe 600 Health Care",
        "Stoxx Europe 600 Industrial Goods & Services",
        "Stoxx Europe 600 Insurance",
        "Stoxx Europe 600 Media",
        "Stoxx Europe 600 Oil & Gas",
        "Stoxx Europe 600 Technology",
        "Stoxx Europe 600 Telecommunications",
        "Stoxx Europe 600 Utilities"
    ],
    # Configuration pour Playwright
    "use_playwright": True,  # Activer ou désactiver l'utilisation de Playwright
    "playwright": {
        "headless": True,      # Mode sans interface graphique
        "timeout": 60000,      # Timeout en millisecondes
        "wait_for": 5000       # Temps d'attente supplémentaire en millisecondes
    }
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

def extract_lesechos_data_with_playwright():
    """Extrait les données Les Echos avec Playwright pour gérer le JavaScript"""
    try:
        logger.info("🚀 Utilisation de Playwright pour le scraping Les Echos (avec support JavaScript)")
        
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            logger.error("❌ Playwright n'est pas installé. Veuillez l'installer avec 'pip install playwright' et 'playwright install'")
            raise ImportError("Playwright est requis pour cette fonctionnalité")
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=CONFIG["playwright"]["headless"])
            
            try:
                page = browser.new_page()
                url = CONFIG["sources"][0]["url"]
                
                logger.info(f"🌐 Chargement de la page {url} avec Playwright...")
                page.goto(url, timeout=CONFIG["playwright"]["timeout"])
                
                # Attendre que le tableau soit chargé
                logger.info("⏳ Attente que le contenu JavaScript soit chargé...")
                page.wait_for_selector('table', timeout=30000)
                
                # Attendre un peu plus pour s'assurer que tout est chargé
                page.wait_for_timeout(CONFIG["playwright"]["wait_for"])
                
                # Capturer le HTML complet
                html = page.content()
                
                # Générer un fichier HTML de débogage
                debug_dir = os.path.dirname(CONFIG["output_path"])
                if not os.path.exists(debug_dir):
                    os.makedirs(debug_dir, exist_ok=True)
                debug_file_path = os.path.join(debug_dir, "debug_lesechos_playwright.html")
                with open(debug_file_path, 'w', encoding='utf-8') as f:
                    f.write(html)
                logger.info(f"📄 HTML Playwright sauvegardé pour débogage dans {debug_file_path}")
                
                # Extraire les données du HTML
                sectors = extract_lesechos_data(html)
                
                return sectors
                
            finally:
                browser.close()
                
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'extraction Playwright: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        # Fallback vers l'extraction classique
        logger.warning("⚠️ Échec de l'extraction Playwright - utilisation des données statiques")
        return []

def extract_lesechos_data(html):
    """Extraire tous les indices sectoriels STOXX Europe 600 de Les Echos"""
    sectors = []
    soup = BeautifulSoup(html, 'html.parser')
    
    # Vérification de base pour s'assurer qu'on a la bonne page
    page_title = soup.find('title')
    if page_title and 'stoxx' not in page_title.text.lower() and 'sectoriels' not in page_title.text.lower():
        logger.warning("❌ La page Les Echos ne semble pas être celle des indices sectoriels!")
        
    # Générer un fichier HTML de débogage
    debug_dir = os.path.dirname(CONFIG["output_path"])
    if not os.path.exists(debug_dir):
        os.makedirs(debug_dir, exist_ok=True)
    debug_file_path = os.path.join(debug_dir, "debug_lesechos.html")
    with open(debug_file_path, 'w', encoding='utf-8') as f:
        f.write(html)
    logger.info(f"HTML sauvegardé pour débogage dans {debug_file_path}")
    
    # MÉTHODE 1: Recherche directe par le contenu - plus fiable
    logger.info("🔍 Tentative d'extraction par recherche directe des indices STOXX...")
    
    # Rechercher tous les éléments qui pourraient contenir des indices STOXX
    stoxx_elements = []
    
    # 1. Chercher par texte contenant "Stoxx Europe 600"
    for element in soup.find_all(string=re.compile('Stoxx Europe 600', re.IGNORECASE)):
        parent = element.parent
        if parent and parent.name != 'title' and parent.name != 'script':
            stoxx_elements.append(parent)
            row = parent.find_parent('tr')
            if row:
                stoxx_elements.append(row)
    
    logger.info(f"Trouvé {len(stoxx_elements)} éléments contenant 'Stoxx Europe 600'")
    
    # Extraire directement des lignes de tableau contenant des secteurs STOXX
    for i, element in enumerate(stoxx_elements):
        if element.name == 'tr':
            try:
                # C'est une ligne de tableau, extraire les données
                cells = element.find_all(['td', 'th'])
                if len(cells) < 3:  # Au minimum, on s'attend à voir libellé, cours, var
                    continue
                
                # Supposer un ordre de colonnes courant
                name_cell = cells[0]  # Première colonne = Libellé/Nom
                name = name_cell.get_text(strip=True)
                
                if not "stoxx europe 600" in name.lower():
                    continue
                
                # Log pour déboguer
                logger.info(f"🎯 Ligne de tableau STOXX trouvée: {name}")
                
                # Extraire les données des autres colonnes
                cours = "0"
                var = "0"
                var_janv = "0"
                
                # Pour chaque cellule, déterminer ce qu'elle contient
                for i, cell in enumerate(cells):
                    cell_text = cell.get_text(strip=True)
                    
                    # Colonne 1 normalement = cours/valeur
                    if i == 1 and re.match(r'^[\d\s.,]+$', cell_text):
                        cours = cell_text
                    
                    # Var% a généralement un % et parfois un - (négatif)
                    elif '%' in cell_text and i > 0 and i < 4:
                        # Si c'est la première colonne pourcentage qu'on rencontre, c'est var quotidien
                        if var == "0":
                            var = cell_text
                        # Sinon, c'est probablement var depuis janvier
                        else:
                            var_janv = cell_text
                
                logger.info(f"📊 Données extraites pour {name}: Cours={cours}, Var={var}, Var1erJanv={var_janv}")
                
                # Déterminer la tendance
                trend = "down" if '-' in var else "up"
                
                # Déterminer la catégorie sectorielle
                category = determine_category(name)
                
                # Créer l'objet secteur
                sector = {
                    "name": name,
                    "value": cours,
                    "change": var,
                    "changePercent": var,
                    "ytdChange": var_janv,
                    "trend": trend,
                    "category": category,
                    "source": "Les Echos",
                    "region": "Europe"
                }
                
                sectors.append(sector)
                ALL_SECTORS.append(sector)
                logger.info(f"✅ Indice STOXX Europe 600 ajouté: {name} (Catégorie: {category})")
                
            except Exception as e:
                logger.error(f"Erreur lors du traitement d'un élément STOXX: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
    
    # MÉTHODE 2: Recherche classique par structure de tableau (si la méthode 1 n'a pas fonctionné)
    if not sectors:
        logger.info("⚠️ Aucun secteur trouvé par recherche directe, tentative par structure de tableau...")
        # Recherche du tableau des indices sectoriels
        tables = soup.find_all('table')
        
        logger.info(f"Nombre de tableaux trouvés: {len(tables)}")
        
        for i, table in enumerate(tables):
            logger.info(f"Analyse du tableau #{i+1}")
            
            # Regarder toutes les lignes pour chercher des indices STOXX Europe 600
            rows = table.find_all('tr')
            
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) < 3:  # Au minimum, on s'attend à voir libellé, cours, var
                    continue
                
                try:
                    # Récupérer le texte de la première cellule
                    first_cell = cells[0].get_text(strip=True)
                    
                    # Si ce n'est pas un indice STOXX Europe 600, passer à la suivante
                    if not first_cell.lower().startswith('stoxx europe 600'):
                        continue
                    
                    logger.info(f"🎯 Indice trouvé dans le tableau #{i+1}: {first_cell}")
                    
                    # C'est un indice STOXX Europe 600 - extraire les données
                    name = first_cell
                    
                    # Pour le reste, essayer de détecter intelligemment
                    cours = "0"
                    var = "0"
                    var_janv = "0"
                    
                    # Pour chaque cellule, déterminer ce qu'elle contient
                    for i, cell in enumerate(cells):
                        if i == 0:  # Déjà traité (nom)
                            continue
                            
                        cell_text = cell.get_text(strip=True)
                        
                        # Détecter un cours (chiffres avec éventuellement un séparateur)
                        if re.match(r'^[\d\s.,]+$', cell_text) and i == 1:
                            cours = cell_text
                        
                        # Détecter un pourcentage
                        elif '%' in cell_text:
                            # Si c'est la première colonne pourcentage qu'on rencontre, c'est var quotidien
                            if var == "0":
                                var = cell_text
                            # Sinon, c'est probablement var depuis janvier
                            elif var_janv == "0":
                                var_janv = cell_text
                    
                    logger.info(f"📊 Données extraites pour {name}: Cours={cours}, Var={var}, Var1erJanv={var_janv}")
                    
                    # Déterminer la tendance
                    trend = "down" if '-' in var else "up"
                    
                    # Déterminer la catégorie sectorielle
                    category = determine_category(name)
                    
                    # Créer l'objet secteur
                    sector = {
                        "name": name,
                        "value": cours,
                        "change": var,
                        "changePercent": var,
                        "ytdChange": var_janv,
                        "trend": trend,
                        "category": category,
                        "source": "Les Echos",
                        "region": "Europe"
                    }
                    
                    sectors.append(sector)
                    ALL_SECTORS.append(sector)
                    logger.info(f"✅ Indice STOXX Europe 600 ajouté par méthode 2: {name} (Catégorie: {category})")
                
                except Exception as e:
                    logger.error(f"Erreur lors du traitement d'une ligne: {str(e)}")
                    import traceback
                    logger.error(traceback.format_exc())
    
    # MÉTHODE 3: Extraction manuelle des indices à partir du fichier de la capture d'écran fournie
    if not sectors:
        logger.info("⚠️ Méthodes 1 & 2 ont échoué - utilisation des données STOXX Europe 600 statiques")
        
        # Données extraites de la capture d'écran
        static_data = [
            {"name": "Stoxx Europe 600 Automobiles", "value": "565,07", "var": "-2,25 %", "var_janv": "+4,83 %"},
            {"name": "Stoxx Europe 600 Basic Resources", "value": "540,16", "var": "-0,96 %", "var_janv": "+4,92 %"},
            {"name": "Stoxx Europe 600 Chemicals", "value": "1287,87", "var": "-0,99 %", "var_janv": "+9,45 %"},
            {"name": "Stoxx Europe 600 Construction & Materials", "value": "791,68", "var": "-0,58 %", "var_janv": "+14,10 %"},
            {"name": "Stoxx Europe 600 Financial Services", "value": "879,38", "var": "+0,10 %", "var_janv": "+6,56 %"},
            {"name": "Stoxx Europe 600 Food & Beverage", "value": "681,10", "var": "+0,80 %", "var_janv": "+6,58 %"},
            {"name": "Stoxx Europe 600 Health Care", "value": "1141,97", "var": "-0,05 %", "var_janv": "+4,68 %"},
            {"name": "Stoxx Europe 600 Industrial Goods & Services", "value": "999,89", "var": "-0,99 %", "var_janv": "+14,65 %"},
            {"name": "Stoxx Europe 600 Insurance", "value": "471,54", "var": "-0,42 %", "var_janv": "+15,53 %"},
            {"name": "Stoxx Europe 600 Media", "value": "455,94", "var": "+0,26 %", "var_janv": "-3,21 %"},
            {"name": "Stoxx Europe 600 Oil & Gas", "value": "370,31", "var": "+0,09 %", "var_janv": "+10,56 %"},
            {"name": "Stoxx Europe 600 Technology", "value": "837,31", "var": "-0,55 %", "var_janv": "+3,81 %"},
            {"name": "Stoxx Europe 600 Telecommunications", "value": "255,24", "var": "-0,12 %", "var_janv": "+11,81 %"},
            {"name": "Stoxx Europe 600 Utilities", "value": "406,12", "var": "+0,64 %", "var_janv": "+5,46 %"}
        ]
        
        for item in static_data:
            # Déterminer la tendance
            trend = "down" if '-' in item["var"] else "up"
            
            # Déterminer la catégorie
            category = determine_category(item["name"])
            
            # Créer l'objet secteur
            sector = {
                "name": item["name"],
                "value": item["value"],
                "change": item["var"],
                "changePercent": item["var"],
                "ytdChange": item["var_janv"],
                "trend": trend,
                "category": category,
                "source": "Les Echos (statique)",
                "region": "Europe"
            }
            
            sectors.append(sector)
            ALL_SECTORS.append(sector)
            logger.info(f"⚠️ Ajout d'indice STOXX statique: {item['name']}")
        
        logger.warning("⚠️ Données STOXX Europe 600 statiques utilisées - regardez le fichier HTML de débogage pour comprendre l'échec")
    
    # Vérification du nombre de secteurs trouvés
    if sectors:
        logger.info(f"✅ {len(sectors)} indices STOXX Europe 600 trouvés")
    else:
        logger.warning("⚠️ Aucun indice STOXX Europe 600 trouvé!")
    
    return sectors

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
                if is_target_index or (("NASDAQ US" in name_text or "Nasdaq US" in name_text) and any(keyword in name_text.lower() for keyword in ["health", "financial", "matls", "oil", "tech", "auto", "telecom"])):
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
    if not percent_str:
        return 0.0
    
    # Supprimer les caractères non numériques sauf le point décimal et le signe moins
    # Pour le format français: remplacer la virgule par un point et supprimer l'espace avant %
    clean_str = percent_str.replace(',', '.').replace(' %', '%').replace('%', '')
    clean_str = re.sub(r'[^0-9\.\-]', '', clean_str)
    
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
            
            # Si c'est Les Echos et que Playwright est activé, utiliser Playwright
            if "lesechos.fr" in source["url"] and CONFIG["use_playwright"]:
                sectors = extract_lesechos_data_with_playwright()
                if sectors:
                    all_sectors.extend(sectors)
                    continue  # Passer à la source suivante
            
            # Sinon, continuer avec la méthode standard
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
        logger.info(f"Ciblant les indices sectoriels STOXX Europe 600 et ces indices NASDAQ US spécifiques:")
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
