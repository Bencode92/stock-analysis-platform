#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données boursières depuis Boursorama
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
Version améliorée pour extraire le pays et la variation depuis janvier
"""

import os
import json
import sys
import requests
from datetime import datetime
from bs4 import BeautifulSoup
import re
import logging
import time

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "source_url": "https://www.boursorama.com/bourse/indices/internationaux",
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "markets.json"),
    # Indices prioritaires à afficher (les autres seront filtrés)
    "priority_indices": {
        "europe": [
            "CAC 40", "DAX", "FTSE 100", "EURO STOXX 50", "Euro Stoxx 50", "BEL 20", "IBEX", "FTSE MIB", "AEX", "SMI",
            "Zone Euro", "Belgique", "France", "Allemagne", "Royaume-Uni", "Espagne", "Italie", "Pays-Bas", "Suisse"
        ],
        "us": [
            "DOW JONES", "Dow Jones", "S&P 500", "NASDAQ", "NASDAQ COMPOSITE", "RUSSELL 2000", 
            "DJIA", "US", "États-Unis"
        ],
        "asia": [
            "NIKKEI", "NIKKEI 225", "HANG SENG", "SHANGHAI COMPOSITE", "SHENZHEN COMPONENT", 
            "KOSPI", "Taiwan", "TAIEX", "Japon", "Chine", "Hong Kong", "Corée du Sud"
        ],
        "other": [
            "MSCI WORLD", "MSCI", "MERVAL", "BOVESPA", "Brésil", "Argentine", "Chili", "Mexique", "IPC MEXICO"
        ]
    },
    # Structure des régions pour la classification des indices
    "regions": {
        "europe": [
            "CAC", "DAX", "FTSE", "IBEX", "MIB", "AEX", "BEL", "SMI", "ATX",
            "OMX", "OMXS", "ISEQ", "PSI", "ATHEX", "OSEBX", "STOXX", "EURO", "EURONEXT",
            "FRANCE", "ALLEMAGNE", "ROYAUME-UNI", "ESPAGNE", "ITALIE", "PAYS-BAS", "SUISSE", "BELGIQUE"
        ],
        "us": [
            "DOW", "S&P", "NASDAQ", "RUSSELL", "CBOE", "NYSE", "AMEX", "DJIA", "US", "ÉTATS-UNIS"
        ],
        "asia": [
            "NIKKEI", "HANG SENG", "SHANGHAI", "SHENZHEN", "KOSPI", "SENSEX",
            "BSE", "TAIEX", "STRAITS", "JAKARTA", "KLSE", "KOSDAQ", "ASX",
            "JAPON", "CHINE", "HONG KONG", "CORÉE DU SUD", "TAIWAN"
        ],
        "other": [
            "MERVAL", "BOVESPA", "IPC", "IPSA", "COLCAP", "BVLG", "IBC", "CASE",
            "ISE", "TA", "QE", "FTSE/JSE", "MOEX", "MSX30", "MSCI",
            "BRÉSIL", "ARGENTINE", "CHILI", "MEXIQUE"
        ]
    },
    # Mapping des sélecteurs DOM pour les différentes régions
    "region_selectors": {
        "europe": "#europe-tab",
        "us": "#etats-unis-tab",
        "asia": "#asie-tab",
        "other": "#autres-tab"
    },
    # Mapping des pays connus pour extraction
    "country_mapping": {
        "france": "France",
        "allemagne": "Allemagne",
        "royaume-uni": "Royaume-Uni",
        "espagne": "Espagne",
        "italie": "Italie",
        "belgique": "Belgique",
        "pays-bas": "Pays-Bas",
        "suisse": "Suisse",
        "états-unis": "États-Unis",
        "usa": "États-Unis",
        "japon": "Japon",
        "chine": "Chine",
        "hong kong": "Hong Kong",
        "corée du sud": "Corée du Sud",
        "taiwan": "Taiwan",
        "brésil": "Brésil",
        "argentine": "Argentine",
        "chili": "Chili",
        "mexique": "Mexique",
        "australie": "Australie"
    }
}

# Structure pour les données
MARKET_DATA = {
    "indices": {
        "europe": [],
        "us": [],
        "asia": [],
        "other": []
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
        "source": "Boursorama",
        "url": CONFIG["source_url"],
        "timestamp": datetime.now().isoformat(),
        "count": 0,
        "lastUpdated": datetime.now().isoformat()
    }
}

# Liste pour stocker tous les indices avant le filtrage (pour calculer les Top 3)
ALL_INDICES = []

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

def extract_country_from_name(name):
    """Extrait le pays à partir du nom de l'indice"""
    # Si le pays est entre parenthèses
    if "(" in name and ")" in name:
        country_match = re.search(r'\((.*?)\)', name)
        if country_match:
            country = country_match.group(1).strip().lower()
            return CONFIG["country_mapping"].get(country, country.capitalize())
    
    # Chercher des correspondances directes de pays dans le nom
    name_lower = name.lower()
    for key, value in CONFIG["country_mapping"].items():
        if key in name_lower:
            return value
    
    # Si aucun pays n'a été trouvé
    return ""

def extract_table_data(table):
    """Extrait les données d'un tableau avec améliorations pour le pays et la variation depuis janvier"""
    indices = []
    if not table:
        return indices
    
    # Trouver les en-têtes pour comprendre la structure des colonnes
    headers = []
    header_row = table.find('thead')
    if header_row:
        headers = [th.text.strip().lower() for th in header_row.find_all('th')]
        logger.info(f"En-têtes du tableau: {headers}")
    
    # Déterminer les indices des colonnes importantes
    name_idx = next((i for i, h in enumerate(headers) if any(keyword in h for keyword in ['nom', 'indice', 'action'])), 0)
    value_idx = next((i for i, h in enumerate(headers) if any(keyword in h for keyword in ['dernier', 'cours', 'clôture'])), 1)
    change_idx = next((i for i, h in enumerate(headers) if any(keyword in h for keyword in ['var.', 'variation', 'abs', 'veille'])), 2)
    pct_idx = next((i for i, h in enumerate(headers) if '%' in h), 3)
    
    # Recherche spécifique pour la variation depuis janvier
    ytd_idx = next((i for i, h in enumerate(headers) if any(keyword in h for keyword in ['1 janv', 'depuis le 1er', 'ytd', 'annuel'])), -1)
    
    # Trouver toutes les lignes de données
    rows = table.select('tbody tr')
    logger.info(f"Nombre de lignes trouvées: {len(rows)}")
    
    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 3:
            continue
        
        try:
            # Extraire le nom
            name_cell = cells[name_idx] if name_idx < len(cells) else cells[0]
            name_el = name_cell.find('a') or name_cell
            name = name_el.text.strip()
            
            # Extraire le pays à partir du nom
            country = extract_country_from_name(name)
            
            # Extraire la valeur (dernier cours)
            value_cell = cells[value_idx] if value_idx < len(cells) else cells[1]
            value = value_cell.text.strip()
            
            # Extraire la variation (par rapport à la veille)
            change_cell = cells[change_idx] if change_idx < len(cells) else None
            change = change_cell.text.strip() if change_cell else ""
            
            # Extraire le pourcentage de variation
            pct_cell = cells[pct_idx] if pct_idx < len(cells) and pct_idx < len(cells) else None
            change_percent = pct_cell.text.strip() if pct_cell else ""
            
            # Extraire la variation depuis le 1er janvier (si disponible)
            ytd_change = ""
            if ytd_idx >= 0 and ytd_idx < len(cells):
                ytd_change = cells[ytd_idx].text.strip()
            
            # Extraire des données supplémentaires si disponibles
            opening = cells[4].text.strip() if len(cells) > 4 else ""
            high = cells[5].text.strip() if len(cells) > 5 else ""
            low = cells[6].text.strip() if len(cells) > 6 else ""
            
            # Tenter de nettoyer les données pour high et low
            if high and "%" in high:
                # Si high contient un pourcentage, c'est probablement une autre donnée
                # Essayons de trouver la vraie valeur high dans une autre colonne
                for i in range(4, min(len(cells), 10)):
                    cell_text = cells[i].text.strip()
                    if cell_text and "%" not in cell_text and not cell_text.lower() == "voir":
                        high = cell_text
                        break
            
            # Déterminer la tendance
            trend = "down" if (change and '-' in change) or (change_percent and '-' in change_percent) else "up"
            
            # Créer l'objet indice
            if name and value:
                index_data = {
                    "name": name,
                    "country": country,
                    "value": value,
                    "change": change,
                    "changePercent": change_percent,
                    "ytdChange": ytd_change,
                    "opening": opening,
                    "high": high,
                    "low": low,
                    "trend": trend
                }
                indices.append(index_data)
                ALL_INDICES.append(index_data)  # Ajouter à la liste globale pour le top 3
        
        except Exception as e:
            logger.warning(f"Erreur lors du traitement d'une ligne: {str(e)}")
    
    return indices

def is_priority_index(name, region):
    """Détermine si un indice fait partie des indices prioritaires"""
    # Convertir en majuscules pour la comparaison
    name_upper = name.upper()
    
    # Vérifier si l'indice est dans la liste des prioritaires pour sa région
    for priority_name in CONFIG["priority_indices"][region]:
        if priority_name.upper() in name_upper or name_upper in priority_name.upper():
            return True
    
    # Filtrer les indices spécifiques à exclure
    exclude_patterns = [
        "NASDAQ EUROZONE", 
        "NASDAQ EUROPE", 
        "NASDAQ NORDIC",
        "STOXX EUROPE SELECT"
    ]
    
    # Exclure certains indices qui correspondent aux patterns d'exclusion
    for pattern in exclude_patterns:
        if pattern.upper() in name_upper:
            return False
    
    # Pour les grands indices généraux, les inclure même s'ils ne sont pas explicitement listés
    general_indices = ["DOW JONES", "S&P", "FTSE", "CAC", "DAX", "NIKKEI", "HANG SENG"]
    for idx in general_indices:
        if idx.upper() in name_upper and len(name) < 30:  # Éviter les sous-indices trop longs
            return True
    
    # Par défaut, ne pas inclure
    return False

def classify_index(index_data):
    """Classe un indice dans la bonne région et ne garde que les indices prioritaires"""
    name = index_data["name"].upper()
    
    # Vérifier chaque région
    for region, keywords in CONFIG["regions"].items():
        if any(keyword.upper() in name for keyword in keywords):
            # Ne l'ajouter que s'il s'agit d'un indice prioritaire
            if is_priority_index(index_data["name"], region):
                MARKET_DATA["indices"][region].append(index_data)
            return region
    
    # Par défaut, tenter d'ajouter à "other" si prioritaire
    if is_priority_index(index_data["name"], "other"):
        MARKET_DATA["indices"]["other"].append(index_data)
    return "other"

def scrape_tab_data(soup, region):
    """Récupère les données d'un onglet spécifique (Europe, US, Asie, Autres)"""
    logger.info(f"Traitement de l'onglet: {region}")
    
    # Trouver les tableaux dans cet onglet
    tab_content = soup.select(f"{CONFIG['region_selectors'][region]}-content")
    if tab_content:
        # Si on a trouvé le contenu de l'onglet, chercher les tableaux dedans
        tables = tab_content[0].find_all('table')
    else:
        # Sinon, chercher tous les tableaux et filtrer par région
        tables = soup.find_all('table')
    
    logger.info(f"Nombre de tableaux trouvés pour {region}: {len(tables)}")
    
    # Traiter chaque tableau
    indices = []
    for i, table in enumerate(tables):
        logger.info(f"Traitement du tableau {i+1}/{len(tables)} pour {region}")
        table_indices = extract_table_data(table)
        
        # Filtrer pour ne garder que les indices prioritaires
        filtered_indices = []
        for index in table_indices:
            if is_priority_index(index["name"], region):
                filtered_indices.append(index)
        
        indices.extend(filtered_indices)
        logger.info(f"Indices prioritaires trouvés: {len(filtered_indices)}/{len(table_indices)}")
    
    return indices

def direct_scrape_approach(html):
    """Approche alternative qui recherche directement tous les tableaux"""
    logger.info("Utilisation de l'approche de scraping directe")
    
    soup = BeautifulSoup(html, 'html.parser')
    all_tables = soup.find_all('table')
    
    logger.info(f"Nombre total de tableaux trouvés: {len(all_tables)}")
    
    # Extraire les données de tous les tableaux
    all_indices = []
    for i, table in enumerate(all_tables):
        logger.info(f"Traitement du tableau {i+1}/{len(all_tables)}")
        indices = extract_table_data(table)
        all_indices.extend(indices)
    
    # Filtrer et classer les indices
    for index in all_indices:
        classify_index(index)
    
    return sum(len(indices) for indices in MARKET_DATA["indices"].values()) > 0

def get_page_content():
    """Récupère le contenu de la page avec retries"""
    headers = get_headers()
    max_retries = 3
    retry_delay = 2
    
    for retry in range(max_retries):
        try:
            logger.info(f"Tentative {retry+1}/{max_retries} de récupération de la page")
            response = requests.get(CONFIG["source_url"], headers=headers, timeout=30)
            response.raise_for_status()
            return response.text
        except Exception as e:
            logger.warning(f"Erreur lors de la récupération: {str(e)}")
            if retry < max_retries - 1:
                time.sleep(retry_delay)
    
    return None

def parse_percentage(percent_str):
    """Convertit une chaîne de pourcentage en nombre flottant"""
    if not percent_str:
        return 0.0
    
    # Supprimer les caractères non numériques sauf le point décimal et le signe moins
    clean_str = re.sub(r'[^0-9\\.\\-]', '', percent_str.replace(',', '.'))
    
    try:
        return float(clean_str)
    except ValueError:
        return 0.0

def calculate_top_performers():
    """Calcule les indices avec les meilleures et pires performances"""
    logger.info("Calcul des indices avec les meilleures/pires performances...")
    
    # Liste pour stocker tous les indices avec leur région
    indices_with_region = []
    
    # Ajouter la région à chaque indice
    for index in ALL_INDICES:
        # S'assurer que l'indice a des données de variation
        if "changePercent" in index and index["changePercent"]:
            # Créer une copie avec la région déterminée
            for region, indices_list in MARKET_DATA["indices"].items():
                if any(i["name"] == index["name"] for i in indices_list):
                    index_copy = index.copy()
                    index_copy["region"] = region
                    indices_with_region.append(index_copy)
                    break
    
    # Filtrer les indices avec des valeurs de pourcentage valides
    daily_indices = [idx for idx in indices_with_region if idx.get("changePercent")]
    ytd_indices = [idx for idx in indices_with_region if idx.get("ytdChange")]
    
    # Trier par variation quotidienne
    if daily_indices:
        # Convertir les pourcentages en valeurs numériques pour le tri
        for idx in daily_indices:
            idx["_change_value"] = parse_percentage(idx["changePercent"])
        
        # Trier et sélectionner les 3 meilleurs et les 3 pires
        sorted_daily = sorted(daily_indices, key=lambda x: x["_change_value"], reverse=True)
        
        # Sélectionner les 3 meilleurs
        best_daily = sorted_daily[:3]
        # Sélectionner les 3 pires (en excluant les valeurs à 0 qui pourraient être des données manquantes)
        worst_daily = [idx for idx in sorted_daily if idx["_change_value"] != 0]
        worst_daily = sorted(worst_daily, key=lambda x: x["_change_value"])[:3]
        
        # Ajouter aux résultats en supprimant le champ temporaire _change_value
        for idx in best_daily:
            idx_copy = {k: v for k, v in idx.items() if k != "_change_value"}
            MARKET_DATA["top_performers"]["daily"]["best"].append(idx_copy)
        
        for idx in worst_daily:
            idx_copy = {k: v for k, v in idx.items() if k != "_change_value"}
            MARKET_DATA["top_performers"]["daily"]["worst"].append(idx_copy)
    
    # Trier par variation depuis le début de l'année
    if ytd_indices:
        # Convertir les pourcentages en valeurs numériques pour le tri
        for idx in ytd_indices:
            idx["_ytd_value"] = parse_percentage(idx["ytdChange"])
        
        # Trier et sélectionner les 3 meilleurs et les 3 pires
        sorted_ytd = sorted(ytd_indices, key=lambda x: x["_ytd_value"], reverse=True)
        
        # Sélectionner les 3 meilleurs
        best_ytd = sorted_ytd[:3]
        # Sélectionner les 3 pires (en excluant les valeurs à 0 qui pourraient être des données manquantes)
        worst_ytd = [idx for idx in sorted_ytd if idx["_ytd_value"] != 0]
        worst_ytd = sorted(worst_ytd, key=lambda x: x["_ytd_value"])[:3]
        
        # Ajouter aux résultats en supprimant le champ temporaire _ytd_value
        for idx in best_ytd:
            idx_copy = {k: v for k, v in idx.items() if k != "_ytd_value"}
            MARKET_DATA["top_performers"]["ytd"]["best"].append(idx_copy)
        
        for idx in worst_ytd:
            idx_copy = {k: v for k, v in idx.items() if k != "_ytd_value"}
            MARKET_DATA["top_performers"]["ytd"]["worst"].append(idx_copy)
    
    logger.info(f"Top performers calculés. Daily: {len(MARKET_DATA['top_performers']['daily']['best'])} best, {len(MARKET_DATA['top_performers']['daily']['worst'])} worst. YTD: {len(MARKET_DATA['top_performers']['ytd']['best'])} best, {len(MARKET_DATA['top_performers']['ytd']['worst'])} worst.")

def scrape_market_data():
    """Récupère et parse la page de Boursorama"""
    logger.info(f"🔍 Récupération des données depuis {CONFIG['source_url']}...")
    
    try:
        # Vider la liste globale des indices
        ALL_INDICES.clear()
        
        # Récupérer le contenu de la page
        html = get_page_content()
        if not html:
            logger.error("Impossible de récupérer la page")
            return False
        
        if len(html) < 1000:
            logger.warning(f"Page trop courte ({len(html)} caractères), possible erreur")
        
        # Parser le HTML
        soup = BeautifulSoup(html, 'html.parser')
        
        # Vérifier la structure pour voir si on a des onglets
        has_tabs = any(soup.select(selector) for selector in CONFIG["region_selectors"].values())
        
        if has_tabs:
            logger.info("Structure avec onglets détectée, traitement par onglet")
            
            # Traiter chaque onglet
            for region in CONFIG["regions"].keys():
                region_indices = scrape_tab_data(soup, region)
                # Pas besoin d'ajouter ici car scrape_tab_data filtre déjà
                logger.info(f"Indices trouvés pour {region}: {len(region_indices)}")
        else:
            logger.info("Structure sans onglets détectée, approche directe")
            if not direct_scrape_approach(html):
                logger.warning("L'approche directe n'a trouvé aucun indice")
                return False
        
        # Calculer les indices avec les meilleures et pires performances
        calculate_top_performers()
        
        # Mettre à jour le compteur
        MARKET_DATA["meta"]["count"] = sum(len(indices) for indices in MARKET_DATA["indices"].values())
        
        logger.info(f"✅ Données extraites avec succès: {MARKET_DATA['meta']['count']} indices")
        
        # Vérifier qu'on a assez de données
        if MARKET_DATA["meta"]["count"] < 3:
            logger.warning(f"⚠️ Trop peu d'indices trouvés: {MARKET_DATA['meta']['count']}")
            return False
        
        # Trier les indices par nom dans chaque région
        for region in MARKET_DATA["indices"]:
            MARKET_DATA["indices"][region] = sorted(MARKET_DATA["indices"][region], key=lambda x: x["name"])
        
        # Mise à jour de l'horodatage
        now = datetime.now()
        MARKET_DATA["meta"]["timestamp"] = now.isoformat()
        MARKET_DATA["meta"]["lastUpdated"] = now.isoformat()
        
        # Enregistrer les données
        save_market_data()
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'extraction des données: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def save_market_data():
    """Enregistre les données dans un fichier JSON"""
    try:
        # Créer le dossier data s'il n'existe pas
        data_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)
        
        # Écrire le fichier JSON
        with open(CONFIG["output_path"], 'w', encoding='utf-8') as f:
            json.dump(MARKET_DATA, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données enregistrées dans {CONFIG['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données: {str(e)}")
        return False

def check_existing_data():
    """Vérifier si un fichier de données existe déjà"""
    try:
        if os.path.exists(CONFIG["output_path"]):
            logger.info("📂 Fichier de données existant trouvé")
            return True
        return False
    except Exception as e:
        logger.error(f"❌ Erreur lors de la vérification du fichier existant: {str(e)}")
        return False

def main():
    """Point d'entrée principal avec gestion d'erreur robuste"""
    try:
        logger.info("🚀 Démarrage du script de scraping des données de marché")
        
        # Vérifier si les données existent déjà
        has_existing_data = check_existing_data()
        
        # Tenter d'extraire les nouvelles données
        scraping_success = scrape_market_data()
        
        # Si l'extraction échoue mais qu'on a des données existantes, conserver le fichier
        if not scraping_success and has_existing_data:
            logger.info("⚠️ Utilisation des données existantes car le scraping a échoué")
            sys.exit(0) # Sortie sans erreur pour ne pas faire échouer le workflow
        elif not scraping_success and not has_existing_data:
            logger.error("❌ Aucune donnée existante et échec du scraping")
            sys.exit(1) # Sortie avec erreur car on n'a pas de données
        else:
            logger.info("✅ Scraping terminé avec succès")
            sys.exit(0)
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