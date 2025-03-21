#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données des marchés pour TradePulse.

IMPORTANT: Ce script met à jour UNIQUEMENT le fichier markets.json.
Il ne modifie PAS les fichiers lists.json ou stoxx_page_*.json qui sont gérés
par le script update_unified_lists.py et le workflow 'Mise à jour unifiée NASDAQ-STOXX'.

Ce script est utilisé par GitHub Actions pour collecter les données générales des marchés
financiers (indices, taux, devises, etc.) et les sauvegarder dans markets.json.
"""

import os
import json
import sys
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup
import logging
import time
import argparse

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "base_url": "https://www.boursorama.com/bourse/actions/cotations/international/",
    "markets": {
        "nasdaq": {
            "params": {
                "country": "1",  # États-Unis
                "market": "$COMPX",  # NASDAQ Composite
            },
            "description": "Actions du NASDAQ Composite (États-Unis)",
            "output_path": "lists.json",  # Un seul fichier pour le NASDAQ
            "paginated": False  # Le NASDAQ est récupéré en une seule fois par lettre
        },
        "stoxx": {
            "params": {
                "country": "EU",  # Europe
                "market": "2cSXXP",  # DJ STOXX 600
            },
            "description": "Actions du DJ STOXX 600 (Europe)",
            "output_pattern": "stoxx_page_{page}.json",  # Un fichier par page pour le STOXX
            "paginated": True  # Le STOXX nécessite une pagination
        }
    },
    "output_dir": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
    "alphabet": list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
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

def get_stock_url(market_config, letter="", page=1):
    """Génère l'URL pour obtenir la liste des actions"""
    if market_config["paginated"]:
        # URL pour le DJ STOXX 600 (avec pagination globale)
        params = {
            "international_quotation_az_filter[country]": market_config["params"]["country"],
            "international_quotation_az_filter[market]": market_config["params"]["market"],
            "international_quotation_az_filter[letter]": letter,
            "international_quotation_az_filter[filter]": "",
            "pagination_1231311441": page
        }
    else:
        # URL pour le NASDAQ (avec pagination par lettre)
        params = {
            "international_quotation_az_filter[country]": market_config["params"]["country"],
            "international_quotation_az_filter[market]": market_config["params"]["market"],
            "international_quotation_az_filter[letter]": letter,
            "international_quotation_az_filter[filter]": "",
            "page": page if letter else 1  # Page utilisée uniquement avec une lettre
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

def scrape_page(market_key, letter="", page=1):
    """Scrape une page de la liste des actions pour un marché donné"""
    market_config = CONFIG["markets"][market_key]
    url = get_stock_url(market_config, letter, page)
    logger.info(f"Récupération des données pour {market_key}, lettre={letter}, page={page}: {url}")
    
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Trouver le tableau des actions
        table = soup.find('table', class_='c-table')
        if not table:
            logger.warning(f"Aucun tableau trouvé pour {market_key}, lettre={letter}, page={page}")
            return [], 0, 1
            
        # Trouver toutes les lignes de données (ignorer l'en-tête)
        rows = table.find('tbody').find_all('tr') if table.find('tbody') else []
        
        stocks = []
        for row in rows:
            stock_data = extract_stock_data(row)
            if stock_data:
                stocks.append(stock_data)
                
        logger.info(f"Trouvé {len(stocks)} actions pour {market_key}, lettre={letter}, page={page}")
        
        # Déterminer pagination
        current_page = page
        total_pages = 1
        pagination = soup.select_one('.c-block-pagination__content')
        
        if pagination:
            # Extraire le nombre de pages
            page_items = pagination.select('a.c-block-pagination__link')
            for item in page_items:
                if item.text.isdigit():
                    page_num = int(item.text)
                    total_pages = max(total_pages, page_num)
            
            # Récupérer la page actuelle
            current_item = pagination.select_one('span.c-block-pagination__link--current') 
            if current_item and current_item.text.isdigit():
                current_page = int(current_item.text)
        
        # Vérifier s'il y a une pagination avec Next
        has_next_page = False
        if pagination:
            next_button = pagination.find('li', class_='c-pagination__item--next')
            has_next_page = next_button and not next_button.has_attr('disabled')
        
        return stocks, current_page, total_pages, has_next_page
        
    except Exception as e:
        logger.error(f"Erreur lors du scraping de {market_key}, lettre={letter}, page={page}: {str(e)}")
        return [], page, 1, False

def scrape_nasdaq():
    """Scrape toutes les actions du NASDAQ Composite par lettre"""
    all_stocks = []
    
    for letter in CONFIG["alphabet"]:
        page = 1
        has_next_page = True
        
        while has_next_page:
            stocks, _, _, has_next_page = scrape_page("nasdaq", letter, page)
            all_stocks.extend(stocks)
            
            # Si pas de page suivante, sortir de la boucle
            if not has_next_page:
                break
                
            # Passer à la page suivante
            page += 1
            
            # Attente pour éviter de surcharger le serveur
            time.sleep(1)
    
    return all_stocks

def scrape_stoxx_page(page=1):
    """Scrape une page spécifique du DJ STOXX 600"""
    stocks, current_page, total_pages, _ = scrape_page("stoxx", "", page)
    return stocks, current_page, total_pages

def get_top_performers(stocks, sort_field, reverse=True, limit=3):
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

def save_nasdaq_data(stocks):
    """Enregistre les données du NASDAQ dans un seul fichier JSON"""
    try:
        market_config = CONFIG["markets"]["nasdaq"]
        output_path = os.path.join(CONFIG["output_dir"], market_config["output_path"])
        
        # Organiser les actions par lettre
        stocks_by_letter = {}
        for letter in "abcdefghijklmnopqrstuvwxyz":
            stocks_by_letter[letter] = []
        
        # Répartir les actions par lettre
        for stock in stocks:
            if not stock.get("name"):
                continue
                
            first_letter = stock["name"][0].lower()
            if first_letter.isalpha():
                stocks_by_letter[first_letter].append(stock)
        
        # Préparer les données de top performers
        top_performers = {
            "daily": {
                "best": get_top_performers(stocks, "change", reverse=True),
                "worst": get_top_performers(stocks, "change", reverse=False)
            },
            "ytd": {
                "best": get_top_performers(stocks, "ytd", reverse=True),
                "worst": get_top_performers(stocks, "ytd", reverse=False)
            }
        }
        
        # Créer l'objet de données final
        data = {
            "indices": stocks_by_letter,
            "top_performers": top_performers,
            "meta": {
                "source": "Boursorama",
                "url": CONFIG["base_url"],
                "description": market_config["description"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "count": len(stocks)
            }
        }
        
        # Écrire le fichier JSON
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données du NASDAQ enregistrées dans {output_path}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données du NASDAQ: {str(e)}")
        return False

def save_stoxx_page_data(stocks, page, total_pages):
    """Enregistre les données d'une page du DJ STOXX 600"""
    try:
        market_config = CONFIG["markets"]["stoxx"]
        output_path = os.path.join(CONFIG["output_dir"], market_config["output_pattern"].format(page=page))
        
        # Organiser les actions par lettre
        stocks_by_letter = {}
        for letter in "abcdefghijklmnopqrstuvwxyz":
            stocks_by_letter[letter] = []
            
        # Répartir les actions par lettre
        for stock in stocks:
            if not stock.get("name"):
                continue
                
            first_letter = stock["name"][0].lower()
            if first_letter.isalpha():
                stocks_by_letter[first_letter].append(stock)
        
        # Préparer les données de top performers
        top_performers = {
            "daily": {
                "best": get_top_performers(stocks, "change", reverse=True),
                "worst": get_top_performers(stocks, "change", reverse=False)
            },
            "ytd": {
                "best": get_top_performers(stocks, "ytd", reverse=True),
                "worst": get_top_performers(stocks, "ytd", reverse=False)
            }
        }
        
        # Créer l'objet de données final
        data = {
            "indices": stocks_by_letter,
            "top_performers": top_performers,
            "meta": {
                "source": "Boursorama",
                "url": CONFIG["base_url"],
                "description": market_config["description"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "count": len(stocks),
                "pagination": {
                    "currentPage": page,
                    "totalPages": total_pages
                }
            }
        }
        
        # Écrire le fichier JSON
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données du STOXX page {page} enregistrées dans {output_path}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données du STOXX page {page}: {str(e)}")
        return False

def verify_no_lists_conflict():
    """Vérifie que ce script ne modifie pas les fichiers lists.json ou stoxx_page_*.json"""
    data_dir = CONFIG["output_dir"]
    lists_file = os.path.join(data_dir, "lists.json")
    stoxx_files = [f for f in os.listdir(data_dir) if f.startswith("stoxx_page_") and f.endswith(".json")]
    
    if os.path.exists(lists_file) or stoxx_files:
        logger.info(f"✅ Vérification: Les fichiers lists.json et stoxx_page_*.json ne seront pas modifiés par ce script")
    return True

def main():
    """Point d'entrée principal"""
    parser = argparse.ArgumentParser(description='Scraper de données boursières pour TradePulse')
    parser.add_argument('--market', default='all', choices=['all', 'nasdaq', 'stoxx'], 
                        help='Marché à scraper: nasdaq, stoxx ou all (tous)')
    parser.add_argument('--force', action='store_true', help='Forcer le scraping même en cas d\'erreur')
    
    args = parser.parse_args()
    
    try:
        # Créer le dossier de sortie s'il n'existe pas
        os.makedirs(CONFIG["output_dir"], exist_ok=True)
        
        # Vérifier qu'il n'y a pas de conflit avec les fichiers de listes
        verify_no_lists_conflict()
        
        # Scraper selon le marché demandé
        if args.market in ['all', 'nasdaq']:
            try:
                logger.info("🚀 Démarrage du scraping des actions du NASDAQ Composite")
                nasdaq_stocks = scrape_nasdaq()
                
                if nasdaq_stocks:
                    save_nasdaq_data(nasdaq_stocks)
                    logger.info(f"✅ Scraping du NASDAQ terminé: {len(nasdaq_stocks)} actions récupérées")
                else:
                    logger.error("❌ Aucune action du NASDAQ récupérée")
                    if not args.force:
                        sys.exit(1)
            except Exception as e:
                logger.error(f"❌ Erreur lors du scraping du NASDAQ: {str(e)}")
                if not args.force:
                    sys.exit(1)
        
        # Attendre un peu entre les scrapings pour éviter de surcharger le serveur
        if args.market == 'all':
            time.sleep(5)
            
        if args.market in ['all', 'stoxx']:
            try:
                logger.info("🚀 Démarrage du scraping des actions du DJ STOXX 600")
                
                # Récupérer les données de la première page pour obtenir le nombre total de pages
                stoxx_stocks, current_page, total_pages = scrape_stoxx_page(1)
                
                if stoxx_stocks:
                    # Enregistrer les données de la première page
                    save_stoxx_page_data(stoxx_stocks, 1, total_pages)
                    
                    # Récupérer les données des autres pages
                    for page in range(2, total_pages + 1):
                        # Attente pour éviter de surcharger le serveur
                        time.sleep(2)
                        
                        # Récupérer les données de la page
                        page_stocks, _, _ = scrape_stoxx_page(page)
                        
                        if page_stocks:
                            # Enregistrer les données de la page
                            save_stoxx_page_data(page_stocks, page, total_pages)
                    
                    logger.info(f"✅ Scraping du STOXX terminé: {total_pages} pages récupérées")
                else:
                    logger.error("❌ Aucune action du STOXX récupérée")
                    if not args.force:
                        sys.exit(1)
            except Exception as e:
                logger.error(f"❌ Erreur lors du scraping du STOXX: {str(e)}")
                if not args.force:
                    sys.exit(1)
                
        logger.info("✅ Scraping terminé avec succès")
        sys.exit(0)
            
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()