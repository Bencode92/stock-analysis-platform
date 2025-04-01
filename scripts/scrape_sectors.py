#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données d'indices sectoriels depuis:
- TradingView (indices STOXX Europe 600) - source principale
- Les Echos (indices STOXX Europe 600) - source secondaire
- Boursorama (indices NASDAQ US sectoriels spécifiques)
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

# Importer l'adaptateur TradingView
try:
    from tradingview_adapter import fetch_alternative_stoxx_data
    TRADINGVIEW_AVAILABLE = True
except ImportError:
    TRADINGVIEW_AVAILABLE = False
    print("⚠️ Adaptateur TradingView non disponible. Utilisation des sources alternatives.")

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
        "sources": ["TradingView", "Les Echos", "Boursorama"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "lastUpdated": datetime.now(timezone.utc).isoformat()
    }
}

# Liste pour stocker tous les secteurs avant le filtrage (pour calculer les Top 3)
ALL_SECTORS = []

def get_cookies():
    """Retourne des cookies aléatoires pour simuler un navigateur réel"""
    # Générer un ID de session aléatoire
    session_id = ''.join(random.choices('0123456789abcdef', k=32))
    device_id = ''.join(random.choices('0123456789abcdef', k=32))
    
    # Créer des cookies communs
    cookies = {
        'sessionid': session_id,
        'device_id': device_id,
        'visited': 'true',
        'consent': 'true',
        'euconsent': 'BOv_yYiOv_yYiAKAyBFRDP-AAAAwJrv7_77__9_-_f__9uj3Gr_v_f__32ccL59v_h_7v-_7fi_-0nV4u_1vft9yfk1-5ctDztp507iakivXmqdeb9v_nz3_5pxP78k89r7337Ew_v8_v-b7JCON_IA',
        'tracking_preferences': '{"v":"1.0","p":1}',
        'locale': 'fr',
        '_ga': 'GA1.2.1234567890.1643739600',
        '_gid': 'GA1.2.987654321.1643739600',
    }
    
    return cookies

def get_headers(url):
    """Crée des en-têtes HTTP réalistes pour éviter la détection de bot"""
    chrome_versions = ["110.0.0.0", "111.0.0.0", "112.0.0.0", "113.0.0.0", "114.0.0.0", "115.0.0.0", 
                      "116.0.0.0", "117.0.0.0", "118.0.0.0", "119.0.0.0", "120.0.0.0", "121.0.0.0"]
    firefox_versions = ["110.0", "111.0", "112.0", "113.0", "114.0", "115.0", 
                        "116.0", "117.0", "118.0", "119.0", "120.0", "121.0", "122.0"]
    
    os_list = ["Windows NT 10.0; Win64; x64", "Macintosh; Intel Mac OS X 10_15_7", 
               "X11; Linux x86_64", "Windows NT 11.0; Win64; x64"]
    
    # Création de User-Agents plus détaillés
    chrome_ua = f"Mozilla/5.0 ({random.choice(os_list)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{random.choice(chrome_versions)} Safari/537.36"
    firefox_ua = f"Mozilla/5.0 ({random.choice(os_list)}; rv:{random.choice(firefox_versions)}) Gecko/20100101 Firefox/{random.choice(firefox_versions)}"
    safari_ua = f"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
    
    user_agents = [chrome_ua, firefox_ua, safari_ua]
    selected_ua = random.choice(user_agents)
    
    # Déterminer le referer approprié
    if "lesechos.fr" in url:
        referer = "https://investir.lesechos.fr/"
    elif "boursorama.com" in url:
        referer = "https://www.boursorama.com/bourse/"
    else:
        referer = "https://www.google.com/"
    
    # En-têtes communs à tous les navigateurs
    headers = {
        "User-Agent": selected_ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-User": "?1",
        "Sec-Fetch-Site": "same-origin",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "Referer": referer,
        "DNT": "1",
        "Sec-CH-UA": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"100\", \"Google Chrome\";v=\"100\"",
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": "\"Windows\"",
    }
    
    # Ajouter des en-têtes spécifiques au site
    if "lesechos.fr" in url:
        headers.update({
            "Origin": "https://investir.lesechos.fr",
            "Host": "investir.lesechos.fr",
        })
    elif "boursorama.com" in url:
        headers.update({
            "Origin": "https://www.boursorama.com",
            "Host": "www.boursorama.com",
        })
    
    return headers

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
    
    # Analyser le contenu de la page
    content_type = analyze_response_content(html)
    if content_type != "normal":
        logger.warning(f"⚠️ La page Les Echos semble être de type: {content_type}. Cela peut affecter l'extraction.")
    
    # NOUVELLE MÉTHODE: Chercher les éléments avec rôle ARIA
    logger.info("🔍 Tentative d'extraction par structure ARIA table...")
    
    # 1. Trouver les divs avec role="table"
    table_divs = soup.find_all('div', attrs={'role': 'table'})
    
    if table_divs:
        logger.info(f"Tables ARIA trouvées: {len(table_divs)}")
        
        for table_div in table_divs:
            # 2. Trouver toutes les lignes (role="row")
            rows = table_div.find_all('div', attrs={'role': 'row'})
            logger.info(f"Nombre de lignes ARIA trouvées: {len(rows)}")
            
            for row in rows:
                try:
                    # Ignorer les lignes d'en-tête
                    if row.find('div', attrs={'role': 'rowheader'}):
                        continue
                    
                    # 3. Extraire les cellules
                    cells = row.find_all('div', attrs={'role': 'cell'})
                    
                    if not cells or len(cells) < 4:  # On attend au moins 4 cellules
                        continue
                    
                    # 4. Extraire les données des cellules
                    # Première cellule = nom du secteur
                    name_cell = cells[0]
                    name = name_cell.get_text(strip=True)
                    
                    # Vérifier si c'est un indice STOXX Europe 600
                    if not "stoxx europe 600" in name.lower():
                        continue
                    
                    # Extraction des autres valeurs
                    value = cells[1].get_text(strip=True) if len(cells) > 1 else "0"
                    var = cells[2].get_text(strip=True) if len(cells) > 2 else "0 %"
                    
                    # La variation depuis janvier est souvent dans l'une des dernières cellules
                    # Tester différentes positions
                    var_janv = ""
                    for i in range(3, min(len(cells), 10)):
                        cell_text = cells[i].get_text(strip=True)
                        if "%" in cell_text and cell_text != var:
                            var_janv = cell_text
                            break
                    
                    # Si on n'a pas trouvé, prendre la dernière cellule qui contient un %
                    if not var_janv:
                        for cell in reversed(cells):
                            cell_text = cell.get_text(strip=True)
                            if "%" in cell_text and cell_text != var:
                                var_janv = cell_text
                                break
                    
                    logger.info(f"📊 Données extraites via ARIA: {name} - Cours={value}, Var={var}, YTD={var_janv}")
                    
                    # Déterminer la tendance
                    trend = "down" if '-' in var else "up"
                    
                    # Déterminer la catégorie sectorielle
                    category = determine_category(name)
                    
                    # Créer l'objet secteur
                    sector = {
                        "name": name,
                        "value": value,
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
                    logger.info(f"✅ Indice STOXX Europe 600 ajouté via ARIA: {name} (Catégorie: {category})")
                    
                except Exception as e:
                    logger.error(f"Erreur lors du traitement d'une ligne ARIA: {str(e)}")
                    import traceback
                    logger.error(traceback.format_exc())
    else:
        logger.warning("⚠️ Aucune table ARIA trouvée")
        
    # SI TOUJOURS AUCUN RÉSULTAT, ESSAYER LES ANCIENNES MÉTHODES
    if not sectors:
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
                    logger.error(f"Erreur lors du traitement d'un élément STOXX: {str(e)})")
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
                {"name": "Stoxx Europe 600 Automobiles", "value": "530,27", "var": "+0,58 %", "var_janv": "-4,40 %"},
                {"name": "Stoxx Europe 600 Basic Resources", "value": "499,92", "var": "+0,77 %", "var_janv": "-4,56 %"},
                {"name": "Stoxx Europe 600 Chemicals", "value": "1223,24", "var": "+0,57 %", "var_janv": "+3,09 %"},
                {"name": "Stoxx Europe 600 Construction & Materials", "value": "750,72", "var": "+0,50 %", "var_janv": "+1,03 %"},
                {"name": "Stoxx Europe 600 Financial Services", "value": "858,47", "var": "+0,68 %", "var_janv": "+3,43 %"},
                {"name": "Stoxx Europe 600 Food & Beverage", "value": "670,23", "var": "+0,23 %", "var_janv": "+5,47 %"},
                {"name": "Stoxx Europe 600 Health Care", "value": "1091,35", "var": "+0,33 %", "var_janv": "-0,35 %"},
                {"name": "Stoxx Europe 600 Industrial Goods & Services", "value": "942,89", "var": "+0,79 %", "var_janv": "+6,21 %"},
                {"name": "Stoxx Europe 600 Insurance", "value": "477,01", "var": "+0,57 %", "var_janv": "+15,71 %"},
                {"name": "Stoxx Europe 600 Media", "value": "444,78", "var": "-0,51 %", "var_janv": "-4,85 %"},
                {"name": "Stoxx Europe 600 Oil & Gas", "value": "366,16", "var": "-0,48 %", "var_janv": "+9,95 %"},
                {"name": "Stoxx Europe 600 Technology", "value": "790,42", "var": "+0,63 %", "var_janv": "-3,15 %"},
                {"name": "Stoxx Europe 600 Telecommunications", "value": "259,66", "var": "+0,85 %", "var_janv": "+12,65 %"},
                {"name": "Stoxx Europe 600 Utilities", "value": "420,06", "var": "+0,30 %", "var_janv": "+9,46 %"}
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
        logger.info(f"✅ {len(sectors)} indices STOXX Europe 600 trouvés depuis Les Echos")
    else:
        logger.warning("⚠️ Aucun indice STOXX Europe 600 trouvé depuis Les Echos!")
    
    return sectors

def analyze_response_content(html):
    """Analyser le contenu de la réponse pour détecter ce que nous recevons"""
    soup = BeautifulSoup(html, 'html.parser')
    
    # Vérifier si c'est une page de captcha
    captcha_elements = soup.find_all(string=re.compile('captcha|robot|verification', re.IGNORECASE))
    if captcha_elements:
        logger.warning("⚠️ Page de CAPTCHA détectée!")
        return "captcha"
        
    # Vérifier si c'est une page de connexion
    login_elements = soup.find_all(string=re.compile('connexion|login|identifier', re.IGNORECASE))
    login_form = soup.find('form', id=re.compile('login|signin', re.IGNORECASE))
    if login_elements or login_form:
        logger.warning("⚠️ Page de connexion détectée!")
        return "login"
    
    # Vérifier si c'est une page vide ou d'erreur
    if len(html) < 5000:
        logger.warning(f"⚠️ Page suspecte (trop courte): {len(html)} caractères")
        return "empty"
    
    # Vérifier si la page est celle que nous attendons
    expected_elements = soup.find_all(string=re.compile('stoxx europe 600|sectoriels', re.IGNORECASE))
    if not expected_elements:
        logger.warning("⚠️ La page ne semble pas contenir de données STOXX Europe 600!")
        return "wrong_page"
    
    return "normal"

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
                if is_target_index or ((("NASDAQ US" in name_text or "Nasdaq US" in name_text) and any(keyword in name_text.lower() for keyword in ["health", "financial", "matls", "oil", "tech", "auto", "telecom"]))):
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
        # Si la catégorie est "unknown", essayer de la déterminer
        if category == "unknown":
            category = determine_category(sector["name"])
            sector["category"] = category
            
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
    
    # NOUVELLE MÉTHODE: Essayer d'abord TradingView si disponible
    if TRADINGVIEW_AVAILABLE:
        try:
            logger.info("🔍 Tentative de récupération des données STOXX Europe 600 depuis TradingView...")
            tradingview_sectors = fetch_alternative_stoxx_data()
            
            if tradingview_sectors and len(tradingview_sectors) > 0:
                logger.info(f"✅ {len(tradingview_sectors)} secteurs STOXX récupérés depuis TradingView!")
                
                # Ajouter à la liste principale
                all_sectors.extend(tradingview_sectors)
                ALL_SECTORS.extend(tradingview_sectors)
                
                # Si TradingView est disponible et a renvoyé des données, ne pas récupérer Les Echos
                logger.info("⚠️ Données obtenues depuis TradingView, skipping Les Echos...")
                
                # Passer directement à Boursorama pour les données US
                for source in CONFIG["sources"]:
                    if "boursorama.com" in source["url"]:
                        try:
                            logger.info(f"Récupération des données depuis {source['name']} ({source['url']})...")
                            
                            # Récupérer le contenu de la page avec délai pour éviter la détection
                            time.sleep(random.uniform(2, 5))
                            
                            # Utiliser des en-têtes et cookies réalistes
                            headers = get_headers(source["url"])
                            cookies = get_cookies()
                            
                            # Log les informations importantes
                            logger.info(f"Utilisation du User-Agent: {headers['User-Agent']}")
                            
                            # Faire la requête principale
                            response = requests.get(source["url"], headers=headers, cookies=cookies, timeout=30, verify=False)
                            
                            if response.status_code != 200:
                                logger.warning(f"Erreur {response.status_code} pour {source['name']} - {response.reason}")
                                continue
                            
                            logger.info(f"Réponse HTTP {response.status_code} reçue pour {source['name']}")
                            
                            # Vérifier le contenu de base
                            html = response.text
                            if len(html) < 1000:
                                logger.warning(f"Contenu suspect (trop court): {len(html)} caractères")
                            
                            # Extraire les données Boursorama
                            sectors = extract_boursorama_data(html)
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
            
            else:
                logger.warning("⚠️ Aucune donnée obtenue depuis TradingView, repli sur Les Echos et Boursorama...")
        
        except Exception as e:
            logger.error(f"❌ Erreur lors de la récupération depuis TradingView: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
    
    # MÉTHODE TRADITIONNELLE: Récupérer Les Echos & Boursorama si TradingView n'est pas disponible ou a échoué
    # Pour chaque source configurée
    for source in CONFIG["sources"]:
        try:
            logger.info(f"Récupération des données depuis {source['name']} ({source['url']})...")
            
            # Récupérer le contenu de la page avec délai pour éviter la détection
            time.sleep(random.uniform(2, 5))
            
            # Utiliser des en-têtes et cookies réalistes
            headers = get_headers(source["url"])
            cookies = get_cookies()
            
            # Log les informations importantes
            logger.info(f"Utilisation du User-Agent: {headers['User-Agent']}")
            
            # Première tentative avec session standard
            session = requests.Session()
            for key, value in cookies.items():
                session.cookies.set(key, value)
            
            # Visiter la page d'accueil d'abord
            if "lesechos.fr" in source["url"]:
                try:
                    # Visiter d'abord la page d'accueil pour obtenir des cookies
                    logger.info("Visite préalable de la page d'accueil de Les Echos...")
                    home_url = "https://investir.lesechos.fr/"
                    home_response = session.get(home_url, headers=headers, timeout=30, verify=False)
                    time.sleep(random.uniform(1, 3))
                except Exception as e:
                    logger.warning(f"Erreur lors de la visite préalable: {e}")
            
            # Maintenant faire la requête principale
            response = session.get(source["url"], headers=headers, timeout=30, verify=False)
            
            if response.status_code != 200:
                logger.warning(f"Erreur {response.status_code} pour {source['name']} - {response.reason}")
                
                # Si c'est un problème avec Les Echos, essayer une deuxième méthode
                if "lesechos.fr" in source["url"] and response.status_code in [403, 404, 500, 502, 503]:
                    logger.info("⚠️ Tentative alternative avec un autre User-Agent pour Les Echos...")
                    
                    # Deuxième tentative avec un autre User-Agent
                    alt_headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
                        "Referer": "https://www.google.com/",
                        "DNT": "1",
                        "Connection": "keep-alive",
                        "Upgrade-Insecure-Requests": "1"
                    }
                    
                    try:
                        # Attendre un peu avant de réessayer
                        time.sleep(random.uniform(3, 7))
                        response = requests.get(source["url"], headers=alt_headers, timeout=30, verify=False)
                        logger.info(f"Tentative alternative: Code {response.status_code}")
                    except Exception as retry_error:
                        logger.error(f"Échec de la tentative alternative: {retry_error}")
                
                # Si toujours pas de succès, passer à la source suivante
                if response.status_code != 200:
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