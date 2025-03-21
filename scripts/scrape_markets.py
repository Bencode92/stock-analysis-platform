#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données boursières depuis Boursorama
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
Version améliorée pour extraire correctement le pays et le libellé d'indice
"""

import os
import json
import sys
import requests
from datetime import datetime, timezone
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
        "north-america": [
            "DOW JONES", "Dow Jones", "S&P 500", "NASDAQ", "NASDAQ COMPOSITE", "RUSSELL 2000", 
            "DJIA", "US", "États-Unis", "Canada", "TSX", "S&P/TSX"
        ],
        "latin-america": [
            "MERVAL", "BOVESPA", "Brésil", "Argentine", "Chili", "Mexique", "IPC MEXICO", "IPSA", "COLCAP"
        ],
        "asia": [
            "NIKKEI", "NIKKEI 225", "HANG SENG", "SHANGHAI COMPOSITE", "SHENZHEN COMPONENT", 
            "KOSPI", "Taiwan", "TAIEX", "Japon", "Chine", "Hong Kong", "Corée du Sud"
        ],
        "other": [
            "MSCI WORLD", "MSCI", "ASX", "Australie", "Nouvelle-Zélande", "Israël", 
            "Émirats Arabes Unis", "Qatar", "Afrique du Sud", "Maroc"
        ]
    },
    # Structure des régions pour la classification des indices
    "regions": {
        "europe": [
            "CAC", "DAX", "FTSE", "IBEX", "MIB", "AEX", "BEL", "SMI", "ATX",
            "OMX", "OMXS", "ISEQ", "PSI", "ATHEX", "OSEBX", "STOXX", "EURO", "EURONEXT",
            "FRANCE", "ALLEMAGNE", "ROYAUME-UNI", "ESPAGNE", "ITALIE", "PAYS-BAS", "SUISSE", "BELGIQUE",
            "AUTRICHE", "DANEMARK", "FINLANDE", "IRLANDE", "POLOGNE", "PORTUGAL", "NORVÈGE", "SUÈDE", "UK"
        ],
        "north-america": [
            "DOW", "S&P", "NASDAQ", "RUSSELL", "CBOE", "NYSE", "AMEX", "DJIA", "US", "ÉTATS-UNIS",
            "CANADA", "TSX", "S&P/TSX"
        ],
        "latin-america": [
            "MERVAL", "BOVESPA", "IPC", "IPSA", "COLCAP", "BVLG", "IBC",
            "BRÉSIL", "ARGENTINE", "CHILI", "MEXIQUE", "COLOMBIE", "PÉROU"
        ],
        "asia": [
            "NIKKEI", "HANG SENG", "SHANGHAI", "SHENZHEN", "KOSPI", "SENSEX",
            "BSE", "TAIEX", "STRAITS", "JAKARTA", "KLSE", "KOSDAQ",
            "JAPON", "CHINE", "HONG KONG", "CORÉE DU SUD", "TAIWAN", "INDE", "INDONÉSIE",
            "MALAISIE", "PHILIPPINES", "THAÏLANDE", "SINGAPOUR"
        ],
        "other": [
            "ASX", "NZX", "TA", "QE", "FTSE/JSE", "MOEX", "MSX30", "MSCI",
            "AUSTRALIE", "NOUVELLE-ZÉLANDE", "ISRAËL", "ÉMIRATS ARABES UNIS", "QATAR", 
            "AFRIQUE DU SUD", "MAROC", "INTERNATIONAL"
        ]
    },
    # Mapping des sélecteurs DOM pour les différentes régions
    "region_selectors": {
        "europe": "#europe-tab",
        "north-america": "#etats-unis-tab",
        "latin-america": "#autres-tab",
        "asia": "#asie-tab",
        "other": "#autres-tab"
    },
    # Mapping des pays connus pour extraction
    "country_mapping": {
        "france": "France",
        "allemagne": "Allemagne",
        "royaume-uni": "Royaume-Uni",
        "royaume uni": "Royaume-Uni",
        "uk": "Royaume-Uni",
        "great britain": "Royaume-Uni",
        "espagne": "Espagne",
        "italie": "Italie",
        "belgique": "Belgique",
        "pays-bas": "Pays-Bas",
        "suisse": "Suisse",
        "autriche": "Autriche",
        "danemark": "Danemark",
        "finlande": "Finlande",
        "irlande": "Irlande",
        "pologne": "Pologne",
        "portugal": "Portugal",
        "norvège": "Norvège",
        "suède": "Suède",
        "états-unis": "États-Unis",
        "usa": "États-Unis",
        "canada": "Canada",
        "japon": "Japon",
        "chine": "Chine",
        "hong kong": "Hong Kong",
        "corée du sud": "Corée du Sud",
        "taiwan": "Taiwan",
        "inde": "Inde",
        "indonésie": "Indonésie",
        "malaisie": "Malaisie",
        "philippines": "Philippines",
        "thaïlande": "Thaïlande",
        "singapour": "Singapour",
        "brésil": "Brésil",
        "argentine": "Argentine",
        "chili": "Chili",
        "mexique": "Mexique",
        "colombie": "Colombie",
        "pérou": "Pérou",
        "australie": "Australie",
        "nouvelle-zélande": "Nouvelle-Zélande",
        "israël": "Israël",
        "émirats arabes unis": "Émirats Arabes Unis",
        "qatar": "Qatar",
        "afrique du sud": "Afrique du Sud",
        "maroc": "Maroc",
        "zone euro": "Zone Euro"
    },
    # Indices standards pour chaque pays
    "standard_indices": {
        "France": "CAC 40",
        "Allemagne": "DAX",
        "Royaume-Uni": "FTSE 100",
        "Espagne": "IBEX 35",
        "Italie": "FTSE MIB",
        "Belgique": "BEL 20",
        "Pays-Bas": "AEX",
        "Suisse": "SMI",
        "Zone Euro": "EURO STOXX 50",
        "États-Unis": "S&P 500",
        "Canada": "S&P/TSX",
        "Japon": "NIKKEI 225",
        "Chine": "SHANGHAI COMPOSITE",
        "Hong Kong": "HANG SENG",
        "Corée du Sud": "KOSPI",
        "Brésil": "BOVESPA",
        "Argentine": "MERVAL",
        "Chili": "IPSA",
        "Mexique": "IPC MEXICO",
        "Australie": "ASX 200"
    },
    # Mapping des régions pour chaque pays
    "country_region_mapping": {
        "France": "europe",
        "Allemagne": "europe",
        "Royaume-Uni": "europe",
        "Royaume Uni": "europe",
        "Espagne": "europe",
        "Italie": "europe",
        "Belgique": "europe",
        "Pays-Bas": "europe",
        "Suisse": "europe",
        "Autriche": "europe",
        "Danemark": "europe",
        "Finlande": "europe",
        "Irlande": "europe",
        "Pologne": "europe",
        "Portugal": "europe",
        "Norvège": "europe",
        "Suède": "europe",
        "Zone Euro": "europe",
        
        "États-Unis": "north-america",
        "Canada": "north-america",
        
        "Brésil": "latin-america",
        "Argentine": "latin-america",
        "Chili": "latin-america",
        "Mexique": "latin-america",
        "Colombie": "latin-america",
        "Pérou": "latin-america",
        
        "Japon": "asia",
        "Chine": "asia",
        "Hong Kong": "asia",
        "Corée du Sud": "asia",
        "Taiwan": "asia",
        "Inde": "asia",
        "Indonésie": "asia",
        "Malaisie": "asia",
        "Philippines": "asia",
        "Thaïlande": "asia",
        "Singapour": "asia",
        "Taïwan": "asia",
        
        "Australie": "other",
        "Nouvelle-Zélande": "other",
        "Israël": "other",
        "Émirats Arabes Unis": "other",
        "Qatar": "other",
        "Afrique du Sud": "other",
        "Maroc": "other",
        "International": "other",
        "Égypte": "other",
        "Turquie": "other"
    }
}

# Structure pour les données
MARKET_DATA = {
    "indices": {
        "europe": [],
        "north-america": [],
        "latin-america": [],
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
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "lastUpdated": datetime.now(timezone.utc).isoformat()
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

def normalize_country_name(country):
    """Normalise le nom du pays pour éviter les problèmes d'espace ou de trait d'union"""
    if not country:
        return "International"
    
    # Standardiser le nom des pays qui pourraient avoir plusieurs formes
    normalized = country.replace(" Uni", "-Uni").replace("Royaume ", "Royaume-")
    
    # Pour le cas particulier du Royaume-Uni
    if normalized.lower() in ['uk', 'grande bretagne', 'grande-bretagne', 'royaume uni', 'royaume-uni']:
        return "Royaume-Uni"
    
    return normalized

def separate_country_and_index(name):
    """
    Sépare le nom du pays et le libellé de l'indice à partir du nom complet
    """
    # Essayer de trouver un pays connu dans le nom
    found_country = None
    index_name = name
    
    # Vérifier s'il y a une parenthèse qui pourrait contenir le pays
    if "(" in name and ")" in name:
        parts = name.split("(")
        index_part = parts[0].strip()
        country_part = parts[1].replace(")", "").strip().lower()
        
        if country_part in CONFIG["country_mapping"]:
            found_country = CONFIG["country_mapping"][country_part]
            index_name = index_part
    
    # Si aucun pays n'a été trouvé dans les parenthèses, chercher dans le nom
    if not found_country:
        # Recherche de correspondances directes
        for country_key, country_name in CONFIG["country_mapping"].items():
            if country_key in name.lower():
                found_country = country_name
                # Ne pas modifier l'index_name ici car nous ne savons pas exactement où est le pays dans le nom
                break
    
    # Si toujours pas de pays trouvé, essayer de déterminer à partir des indices connus
    if not found_country:
        for standard_country, standard_index in CONFIG["standard_indices"].items():
            if standard_index.upper() in name.upper():
                found_country = standard_country
                break
    
    # Si nous avons un pays mais pas clairement un indice, essayer de déterminer l'indice standard
    if found_country and (index_name == name or len(index_name.strip()) < 3):
        if found_country in CONFIG["standard_indices"]:
            index_name = CONFIG["standard_indices"][found_country]
    
    # Nettoyage final du nom de l'indice
    if index_name == name and found_country:
        # Essayer de remplacer le nom du pays dans le nom complet si nous avons trouvé un pays
        index_name = name.replace(found_country, "").strip()
        if len(index_name) < 3:  # Si le nom de l'indice est trop court après suppression
            index_name = name
    
    # Si aucun pays n'a été trouvé, utiliser un pays par défaut basé sur la région
    if not found_country:
        if "DAX" in name or "XETRA" in name:
            found_country = "Allemagne"
        elif "CAC" in name or "PARIS" in name:
            found_country = "France"
        elif "FTSE" in name or "LONDON" in name or "UK" in name.upper():
            found_country = "Royaume-Uni"
        elif "NASDAQ" in name or "S&P" in name or "DOW" in name:
            found_country = "États-Unis"
        elif "TSX" in name or "TORONTO" in name:
            found_country = "Canada"
        elif "NIKKEI" in name or "TOKYO" in name:
            found_country = "Japon"
        elif "SHANGHAI" in name or "SHENZHEN" in name:
            found_country = "Chine"
        elif "HANG SENG" in name:
            found_country = "Hong Kong"
        elif "BOVESPA" in name or "BRAZIL" in name:
            found_country = "Brésil"
        elif "MERVAL" in name:
            found_country = "Argentine"
        elif "IPSA" in name:
            found_country = "Chili"
        elif "IPC" in name and "MEXICO" in name:
            found_country = "Mexique"
        else:
            found_country = "International"
    
    # Normaliser le nom du pays
    found_country = normalize_country_name(found_country)
    
    return found_country, index_name

def extract_table_data(table):
    """Extrait les données d'un tableau avec séparation pays/indice"""
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
    name_idx = next((i for i, h in enumerate(headers) if any(keyword in h for keyword in ['nom', 'indice', 'action', 'libellé'])), 0)
    value_idx = next((i for i, h in enumerate(headers) if any(keyword in h for keyword in ['dernier', 'cours', 'clôture'])), 1)
    change_idx = next((i for i, h in enumerate(headers) if any(keyword in h for keyword in ['var.', 'variation', 'abs', 'veille'])), 2)
    pct_idx = next((i for i, h in enumerate(headers) if '%' in h), 3)
    
    # Recherche spécifique pour la variation depuis janvier
    ytd_idx = next((i for i, h in enumerate(headers) if any(keyword in h for keyword in ['1 janv', 'depuis le 1er', 'ytd', 'annuel', 'var/1janv'])), -1)
    
    # Vérifier s'il y a déjà une colonne pays
    country_idx = next((i for i, h in enumerate(headers) if h == 'pays'), -1)
    
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
            
            # Extraire le pays (si disponible directement)
            country = None
            if country_idx >= 0 and country_idx < len(cells):
                country = cells[country_idx].text.strip()
            
            # Si le pays n'est pas disponible directement, l'extraire du nom
            if not country:
                country, index_name = separate_country_and_index(name)
            else:
                # Si le pays est disponible, le nom de l'indice est simplement le nom
                index_name = name
            
            # Normaliser le nom du pays
            country = normalize_country_name(country)
            
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
            
            # Déterminer la tendance
            trend = "down" if (change and '-' in change) or (change_percent and '-' in change_percent) else "up"
            
            # Créer l'objet indice avec la structure correcte
            if name and value:
                index_data = {
                    "country": country,           # Pays
                    "index_name": index_name,     # Libellé de l'indice
                    "value": value,               # Dernier cours
                    "change": change,             # Variation
                    "changePercent": change_percent,  # Variation %
                    "ytdChange": ytd_change,      # Variation depuis janvier
                    "opening": opening,           # Ouverture
                    "high": high,                 # Plus haut
                    "low": low,                   # Plus bas
                    "trend": trend                # Tendance
                }
                indices.append(index_data)
                ALL_INDICES.append(index_data)  # Ajouter à la liste globale pour le top 3
        
        except Exception as e:
            logger.warning(f"Erreur lors du traitement d'une ligne: {str(e)}")
    
    return indices

def determine_region(country):
    """Détermine la région basée sur le pays"""
    # Normaliser le nom du pays pour la recherche
    normalized_country = normalize_country_name(country)
    
    if normalized_country in CONFIG["country_region_mapping"]:
        return CONFIG["country_region_mapping"][normalized_country]
    
    # Si le pays n'est pas trouvé dans le mapping, chercher par correspondance partielle
    country_upper = country.upper()
    for region, keywords in CONFIG["regions"].items():
        if any(keyword.upper() in country_upper for keyword in keywords):
            return region
    
    # Par défaut, classer comme "other"
    return "other"

def is_priority_index(index_data, region):
    """Détermine si un indice fait partie des indices prioritaires"""
    # Convertir en majuscules pour la comparaison
    country_upper = index_data["country"].upper()
    index_name_upper = index_data["index_name"].upper()
    
    # Vérifier si le pays ou l'indice est dans la liste des prioritaires pour sa région
    for priority_name in CONFIG["priority_indices"][region]:
        if (priority_name.upper() in country_upper or 
            country_upper in priority_name.upper() or
            priority_name.upper() in index_name_upper or 
            index_name_upper in priority_name.upper()):
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
        if pattern.upper() in index_name_upper:
            return False
    
    # Pour les grands indices généraux, les inclure même s'ils ne sont pas explicitement listés
    general_indices = ["DOW JONES", "S&P", "FTSE", "CAC", "DAX", "NIKKEI", "HANG SENG", "BOVESPA", "IPC", "MERVAL", "IPSA", "TSX"]
    for idx in general_indices:
        if idx.upper() in index_name_upper and len(index_name_upper) < 30:  # Éviter les sous-indices trop longs
            return True
    
    # Par défaut, ne pas inclure
    return False

def classify_index(index_data):
    """Classe un indice dans la bonne région et ne garde que les indices prioritaires"""
    # Déterminer la région en fonction du pays
    country = index_data["country"]
    region = determine_region(country)
    
    # Ne l'ajouter que s'il s'agit d'un indice prioritaire
    if is_priority_index(index_data, region):
        MARKET_DATA["indices"][region].append(index_data)
    
    return region

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
            if is_priority_index(index, region):
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
    clean_str = re.sub(r'[^0-9\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\.\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\-]/g', '', percent_str.replace(',', '.'))
    
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
            # Déterminer la région
            country = index["country"]
            region = determine_region(country)
            
            # Créer une copie avec la région déterminée
            index_copy = index.copy()
            index_copy["region"] = region
            indices_with_region.append(index_copy)
    
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
        
        # Réinitialiser les données d'indice
        for region in MARKET_DATA["indices"]:
            MARKET_DATA["indices"][region] = []
        
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
            
            # Traiter chaque onglet (ancien format)
            for region_key in CONFIG["region_selectors"].keys():
                region_indices = scrape_tab_data(soup, region_key)
                # Pas besoin d'ajouter ici car scrape_tab_data filtre déjà
                logger.info(f"Indices trouvés pour {region_key}: {len(region_indices)}")
        else:
            logger.info("Structure sans onglets détectée, approche directe")
            if not direct_scrape_approach(html):
                logger.warning("L'approche directe n'a trouvé aucun indice")
                return False
        
        # Traiter tous les indices non classés
        for index in ALL_INDICES:
            # Vérifier s'il est déjà dans une région
            is_already_added = False
            for region_indices in MARKET_DATA["indices"].values():
                if any(i["country"] == index["country"] and i["index_name"] == index["index_name"] for i in region_indices):
                    is_already_added = True
                    break
            
            # S'il n'est pas déjà ajouté, le classifier dans la bonne région
            if not is_already_added:
                classify_index(index)
        
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
            MARKET_DATA["indices"][region] = sorted(MARKET_DATA["indices"][region], key=lambda x: x["country"])
        
        # Mise à jour de l'horodatage
        now = datetime.now(timezone.utc)
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
