#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données des actions du NASDAQ Composite depuis Boursorama
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
Version dédiée pour la page liste.html
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
    "base_url": "https://www.boursorama.com/bourse/actions/cotations/international/",
    "params": {
        "country": "1",  # États-Unis
        "market": "$COMPX",  # NASDAQ Composite
    },
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "lists.json"),
    "alphabet": list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
}

# Structure pour les données
LIST_DATA = {
    "stocks": [],
    "meta": {
        "source": "Boursorama",
        "url": CONFIG["base_url"],
        "description": "Actions du NASDAQ Composite (États-Unis)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": 0
    }
}

def get_headers():
    """Crée des en-têtes HTTP pour éviter la détection de bot"""
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/"
    }

def get_stock_list_url(letter, page=1):
    """Génère l'URL pour obtenir la liste des actions pour une lettre donnée"""
    params = {
        "international_quotation_az_filter[country]": CONFIG["params"]["country"],
        "international_quotation_az_filter[market]": CONFIG["params"]["market"],
        "international_quotation_az_filter[letter]": letter,
        "international_quotation_az_filter[filter]": "",
        "page": page
    }
    query_params = "&".join([f"{k}={v}" for k, v in params.items()])
    return f"{CONFIG['base_url']}?{query_params}"

def extract_stock_data(row):
    """Extrait les données d'une action à partir d'une ligne de tableau"""
    try:
        cells = row.find_all('td')
        if not cells or len(cells) < 8:
            return None
            
        # Récupérer le libellé et le lien
        libelle_cell = cells[0]
        libelle_link = libelle_cell.find('a')
        libelle = libelle_link.text.strip() if libelle_link else ""
        link = libelle_link.get('href') if libelle_link else ""
        
        # Récupérer le cours et les autres valeurs
        dernier = cells[1].text.strip()
        variation = cells[2].text.strip()
        ouverture = cells[3].text.strip()
        plus_haut = cells[4].text.strip()
        plus_bas = cells[5].text.strip()
        var_ytd = cells[6].text.strip()
        volume = cells[7].text.strip()
        
        # Déterminer la tendance en fonction de la variation
        trend = "up" if variation and not variation.startswith('-') and variation != "0,00%" else "down"
        if variation == "0,00%":
            trend = "neutral"
            
        # Créer l'objet stock
        stock_data = {
            "symbol": link.split('/')[-1] if link else "",
            "name": libelle,
            "last": dernier,
            "change": variation,
            "open": ouverture,
            "high": plus_haut,
            "low": plus_bas,
            "ytd": var_ytd,
            "volume": volume,
            "trend": trend,
            "link": f"https://www.boursorama.com{link}" if link else ""
        }
        
        return stock_data
        
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des données d'une action: {str(e)}")
        return None

def scrape_stock_page(letter, page=1):
    """Scrape une page de la liste des actions"""
    url = get_stock_list_url(letter, page)
    logger.info(f"Récupération des données pour la lettre {letter}, page {page}: {url}")
    
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Trouver le tableau des actions
        table = soup.find('table', class_='c-table')
        if not table:
            logger.warning(f"Aucun tableau trouvé pour la lettre {letter}, page {page}")
            return []
            
        # Trouver toutes les lignes de données (ignorer l'en-tête)
        rows = table.find('tbody').find_all('tr') if table.find('tbody') else []
        
        stocks = []
        for row in rows:
            stock_data = extract_stock_data(row)
            if stock_data:
                stocks.append(stock_data)
                
        logger.info(f"Trouvé {len(stocks)} actions pour la lettre {letter}, page {page}")
        
        # Vérifier s'il y a une pagination
        has_next_page = False
        pagination = soup.find('ul', class_='c-pagination')
        if pagination:
            next_button = pagination.find('li', class_='c-pagination__item--next')
            has_next_page = next_button and not next_button.has_attr('disabled')
            
        return stocks, has_next_page
        
    except Exception as e:
        logger.error(f"Erreur lors du scraping de la lettre {letter}, page {page}: {str(e)}")
        return [], False

def scrape_all_stocks():
    """Scrape toutes les actions du NASDAQ Composite"""
    all_stocks = []
    
    for letter in CONFIG["alphabet"]:
        page = 1
        has_next_page = True
        
        while has_next_page:
            stocks, has_next_page = scrape_stock_page(letter, page)
            all_stocks.extend(stocks)
            
            # Si pas de page suivante, sortir de la boucle
            if not has_next_page:
                break
                
            # Passer à la page suivante
            page += 1
            
            # Attente pour éviter de surcharger le serveur
            time.sleep(1)
    
    return all_stocks

def save_data():
    """Enregistre les données dans un fichier JSON"""
    try:
        # Créer le dossier data s'il n'existe pas
        data_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)
        
        # Mettre à jour le compteur
        LIST_DATA["meta"]["count"] = len(LIST_DATA["stocks"])
        
        # Mettre à jour l'horodatage
        now = datetime.now(timezone.utc)
        LIST_DATA["meta"]["timestamp"] = now.isoformat()
        
        # Convertir en format compatible avec la structure attendue par liste-script.js
        compatible_data = convert_to_compatible_format(LIST_DATA)
        
        # Écrire le fichier JSON
        with open(CONFIG["output_path"], 'w', encoding='utf-8') as f:
            json.dump(compatible_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données enregistrées dans {CONFIG['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données: {str(e)}")
        return False

def convert_to_compatible_format(data):
    """Convertit les données au format compatible avec liste-script.js"""
    # Organiser les actions par première lettre
    stocks_by_letter = {}
    for letter in CONFIG["alphabet"]:
        stocks_by_letter[letter] = []
    
    # Trier les actions par première lettre
    for stock in data["stocks"]:
        first_letter = stock["name"][0].upper() if stock["name"] else "A"
        if first_letter in stocks_by_letter:
            stocks_by_letter[first_letter].append(stock)
    
    # Créer la structure compatible
    compatible_data = {
        "indices": {
            "a": stocks_by_letter["A"],
            "b": stocks_by_letter["B"],
            "c": stocks_by_letter["C"],
            "d": stocks_by_letter["D"],
            "e": stocks_by_letter["E"],
            "f": stocks_by_letter["F"],
            "g": stocks_by_letter["G"],
            "h": stocks_by_letter["H"],
            "i": stocks_by_letter["I"],
            "j": stocks_by_letter["J"],
            "k": stocks_by_letter["K"],
            "l": stocks_by_letter["L"],
            "m": stocks_by_letter["M"],
            "n": stocks_by_letter["N"],
            "o": stocks_by_letter["O"],
            "p": stocks_by_letter["P"],
            "q": stocks_by_letter["Q"],
            "r": stocks_by_letter["R"],
            "s": stocks_by_letter["S"],
            "t": stocks_by_letter["T"],
            "u": stocks_by_letter["U"],
            "v": stocks_by_letter["V"],
            "w": stocks_by_letter["W"],
            "x": stocks_by_letter["X"],
            "y": stocks_by_letter["Y"],
            "z": stocks_by_letter["Z"]
        },
        "top_performers": {
            "daily": {
                "best": get_top_performers(data["stocks"], "change", reverse=True),
                "worst": get_top_performers(data["stocks"], "change", reverse=False)
            },
            "ytd": {
                "best": get_top_performers(data["stocks"], "ytd", reverse=True),
                "worst": get_top_performers(data["stocks"], "ytd", reverse=False)
            }
        },
        "meta": data["meta"]
    }
    
    return compatible_data

def get_top_performers(stocks, sort_field, reverse=True, limit=10):
    """Récupère les top/bottom performers basés sur un champ donné"""
    def extract_value(value_str):
        if not value_str:
            return 0
        # Nettoyer la chaîne pour extraire le nombre
        cleaned = value_str.replace('%', '').replace(',', '.').replace(' ', '')
        try:
            return float(cleaned)
        except:
            return 0
    
    # Trier les actions en fonction du champ
    sorted_stocks = sorted(
        [s for s in stocks if s.get(sort_field)], 
        key=lambda x: extract_value(x.get(sort_field, "0")), 
        reverse=reverse
    )
    
    # Prendre les premiers éléments
    return sorted_stocks[:limit]

def main():
    """Point d'entrée principal"""
    try:
        logger.info("🚀 Démarrage du script de collecte des actions du NASDAQ Composite")
        
        # Scraper toutes les actions
        stocks = scrape_all_stocks()
        
        if stocks:
            # Mettre à jour les données
            LIST_DATA["stocks"] = stocks
            
            # Enregistrer les données
            if save_data():
                logger.info(f"✅ Scraping terminé avec succès: {len(stocks)} actions récupérées")
                sys.exit(0)
            else:
                logger.error("❌ Échec lors de l'enregistrement des données")
                sys.exit(1)
        else:
            logger.error("❌ Aucune action récupérée")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()
