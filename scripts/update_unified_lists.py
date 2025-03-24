#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script unifié d'extraction des données des actions du NASDAQ Composite et du DJ STOXX 600
Combine les fonctionnalités de scrape_lists.py et scrape_stoxx.py
Utilisé par GitHub Actions pour mettre à jour régulièrement les données

IMPORTANT: Ce script met à jour UNIQUEMENT les fichiers suivants:
- data/lists.json (données NASDAQ)
- data/stoxx_page_*.json (données STOXX)
- data/update_summary.json (résumé de la mise à jour)

Il ne modifie PAS le fichier markets.json qui est géré par le script scrape_markets.py
et le workflow 'Update Markets Data Only'.
"""

import os
import json
import sys
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup
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
    "nasdaq": {
        "country": "1",  # États-Unis
        "market": "$COMPX",  # NASDAQ Composite
        "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "lists.json"),
    },
    "stoxx": {
        "country": "EU",  # Europe
        "market": "2cSXXP",  # DJ STOXX 600
        "output_dir": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
    },
    "alphabet": list("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    "sleep_time": 1.5  # Délai entre les requêtes pour éviter la détection de bot
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

#
# Fonctions communes
#
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

#
# Fonctions pour NASDAQ
#
def get_nasdaq_url(letter, page=1):
    """Génère l'URL pour obtenir la liste des actions NASDAQ pour une lettre donnée"""
    params = {
        "international_quotation_az_filter[country]": CONFIG["nasdaq"]["country"],
        "international_quotation_az_filter[market]": CONFIG["nasdaq"]["market"],
        "international_quotation_az_filter[letter]": letter,
        "international_quotation_az_filter[filter]": "",
        "page": page
    }
    query_params = "&".join([f"{k}={v}" for k, v in params.items()])
    return f"{CONFIG['base_url']}?{query_params}"

def scrape_nasdaq_page(letter, page=1):
    """Scrape une page de la liste des actions NASDAQ"""
    url = get_nasdaq_url(letter, page)
    logger.info(f"Récupération des données NASDAQ pour la lettre {letter}, page {page}: {url}")
    
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
                
        logger.info(f"Trouvé {len(stocks)} actions NASDAQ pour la lettre {letter}, page {page}")
        
        # Vérifier s'il y a une pagination
        has_next_page = False
        pagination = soup.find('ul', class_='c-pagination')
        if pagination:
            next_button = pagination.find('li', class_='c-pagination__item--next')
            has_next_page = next_button and not next_button.has_attr('disabled')
            
        return stocks, has_next_page
        
    except Exception as e:
        logger.error(f"Erreur lors du scraping NASDAQ pour lettre {letter}, page {page}: {str(e)}")
        return [], False

def scrape_all_nasdaq_stocks():
    """Scrape toutes les actions du NASDAQ Composite"""
    all_stocks = []
    
    for letter in CONFIG["alphabet"]:
        page = 1
        has_next_page = True
        
        while has_next_page:
            stocks, has_next_page = scrape_nasdaq_page(letter, page)
            all_stocks.extend(stocks)
            
            # Si pas de page suivante, sortir de la boucle
            if not has_next_page:
                break
                
            # Passer à la page suivante
            page += 1
            
            # Attente pour éviter de surcharger le serveur
            time.sleep(CONFIG["sleep_time"])
    
    return all_stocks

def save_nasdaq_data(stocks):
    """Enregistre les données NASDAQ dans un fichier JSON"""
    try:
        # Organiser les actions par première lettre
        stocks_by_letter = {}
        for letter in "abcdefghijklmnopqrstuvwxyz":
            stocks_by_letter[letter] = []
        
        # Trier les actions par première lettre
        for stock in stocks:
            first_letter = stock["name"][0].lower() if stock["name"] else "a"
            if first_letter.isalpha() and first_letter in stocks_by_letter:
                stocks_by_letter[first_letter].append(stock)
        
        # Créer la structure compatible
        compatible_data = {
            "indices": stocks_by_letter,
            "top_performers": {
                "daily": {
                    "best": get_top_performers(stocks, "change", reverse=True),
                    "worst": get_top_performers(stocks, "change", reverse=False)
                },
                "ytd": {
                    "best": get_top_performers(stocks, "ytd", reverse=True),
                    "worst": get_top_performers(stocks, "ytd", reverse=False)
                }
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "count": len(stocks),
                "source": "Boursorama",
                "description": "Actions du NASDAQ Composite (États-Unis)"
            }
        }
        
        # Écrire le fichier JSON
        with open(CONFIG["nasdaq"]["output_path"], 'w', encoding='utf-8') as f:
            json.dump(compatible_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données NASDAQ enregistrées dans {CONFIG['nasdaq']['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données NASDAQ: {str(e)}")
        return False

#
# Fonctions pour STOXX
#
def get_stoxx_url(page=1, letter=""):
    """Génère l'URL pour obtenir la liste des actions STOXX pour une page donnée"""
    params = {
        "international_quotation_az_filter[country]": CONFIG["stoxx"]["country"],
        "international_quotation_az_filter[market]": CONFIG["stoxx"]["market"],
        "international_quotation_az_filter[letter]": letter,
        "international_quotation_az_filter[filter]": "",
        "pagination_1231311441": page
    }
    query_params = "&".join([f"{k}={v}" for k, v in params.items()])
    return f"{CONFIG['base_url']}?{query_params}"

def scrape_stoxx_page(page=1):
    """Scrape une page de la liste des actions du STOXX 600"""
    url = get_stoxx_url(page)
    logger.info(f"Récupération des données STOXX pour la page {page}: {url}")
    
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Trouver le tableau des actions
        table = soup.find('table', class_='c-table')
        if not table:
            logger.warning(f"Aucun tableau trouvé pour la page STOXX {page}")
            return [], 0, 1
            
        # Trouver toutes les lignes de données (ignorer l'en-tête)
        rows = table.find('tbody').find_all('tr') if table.find('tbody') else []
        
        stocks = []
        for row in rows:
            stock_data = extract_stock_data(row)
            if stock_data:
                stocks.append(stock_data)
                
        logger.info(f"Trouvé {len(stocks)} actions STOXX pour la page {page}")
        
        # Déterminer le nombre total de pages
        total_pages = 1
        current_page = page
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
        
        return stocks, current_page, total_pages
        
    except Exception as e:
        logger.error(f"Erreur lors du scraping STOXX de la page {page}: {str(e)}")
        return [], page, 1

def save_stoxx_data_for_page(stocks, page, total_pages):
    """Enregistre les données STOXX pour une page spécifique"""
    try:
        # Organiser les actions par lettre
        stocks_by_letter = {}
        for letter in "abcdefghijklmnopqrstuvwxyz":
            stocks_by_letter[letter] = []
            
        # Répartir les actions par lettre
        for stock in stocks:
            if not stock.get("name"):
                continue
                
            first_letter = stock["name"][0].lower()
            if first_letter.isalpha() and first_letter in stocks_by_letter:
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
                "description": "Actions du DJ STOXX 600 (Europe)",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "count": len(stocks),
                "pagination": {
                    "currentPage": page,
                    "totalPages": total_pages
                }
            }
        }
        
        # Chemin du fichier de sortie
        output_path = os.path.join(CONFIG["stoxx"]["output_dir"], f"stoxx_page_{page}.json")
        
        # Écrire le fichier JSON
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données STOXX pour la page {page} enregistrées dans {output_path}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données STOXX pour la page {page}: {str(e)}")
        return False

def scrape_all_stoxx():
    """Scrape toutes les pages du STOXX 600"""
    try:
        # Récupérer les données de la première page pour obtenir le nombre total de pages
        first_page_stocks, current_page, total_pages = scrape_stoxx_page(1)
        
        if not first_page_stocks:
            logger.error("❌ Aucune action STOXX récupérée sur la première page")
            return {
                "status": "error",
                "message": "Aucune donnée récupérée",
                "pages": 0,
                "stocks": 0
            }
            
        # Enregistrer les données de la première page
        save_stoxx_data_for_page(first_page_stocks, 1, total_pages)
        
        # Nombre total d'actions
        total_stocks = len(first_page_stocks)
        
        # Récupérer les données des autres pages
        for page in range(2, total_pages + 1):
            # Attente pour éviter de surcharger le serveur
            time.sleep(CONFIG["sleep_time"])
            
            # Récupérer les données de la page
            stocks, _, _ = scrape_stoxx_page(page)
            
            if stocks:
                # Ajouter au compteur total
                total_stocks += len(stocks)
                
                # Enregistrer les données de la page
                save_stoxx_data_for_page(stocks, page, total_pages)
        
        logger.info(f"✅ Scraping STOXX terminé avec succès: {total_pages} pages, {total_stocks} actions récupérées")
        return {
            "status": "success",
            "pages": total_pages,
            "stocks": total_stocks
        }
    except Exception as e:
        logger.error(f"❌ Erreur lors du scraping STOXX: {str(e)}")
        return {
            "status": "error",
            "message": str(e),
            "pages": 0,
            "stocks": 0
        }

def ensure_data_directory():
    """S'assure que le répertoire de données existe"""
    data_dir = os.path.dirname(CONFIG["nasdaq"]["output_path"])
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)
        logger.info(f"✅ Répertoire de données créé: {data_dir}")

def verify_no_markets_conflict():
    """Vérifie que ce script ne modifie pas le fichier markets.json"""
    markets_file = os.path.join(os.path.dirname(CONFIG["nasdaq"]["output_path"]), "markets.json")
    if os.path.exists(markets_file):
        logger.info(f"✅ Vérification: Le fichier markets.json ne sera pas modifié par ce script")
    return True

def main():
    """Point d'entrée principal"""
    try:
        logger.info("🚀 Démarrage du script unifié d'extraction des données NASDAQ et STOXX")
        
        # S'assurer que le répertoire de données existe
        ensure_data_directory()
        
        # Vérifier qu'il n'y a pas de conflit avec markets.json
        verify_no_markets_conflict()
        
        # 1. Scraper les données NASDAQ
        logger.info("📊 Début du scraping NASDAQ...")
        nasdaq_stocks = scrape_all_nasdaq_stocks()
        
        if nasdaq_stocks:
            # Enregistrer les données NASDAQ
            save_nasdaq_data(nasdaq_stocks)
            logger.info(f"✅ Scraping NASDAQ terminé: {len(nasdaq_stocks)} actions récupérées")
        else:
            logger.error("❌ Aucune action NASDAQ récupérée")
        
        # 2. Scraper les données STOXX
        logger.info("📊 Début du scraping STOXX...")
        stoxx_result = scrape_all_stoxx()
        
        # 3. Enregistrer un résumé global
        result_summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "nasdaq": {
                "count": len(nasdaq_stocks),
                "status": "success" if nasdaq_stocks else "error"
            },
            "stoxx": stoxx_result
        }
        
        # Sauvegarder le résumé
        summary_path = os.path.join(CONFIG["stoxx"]["output_dir"], "update_summary.json")
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(result_summary, f, ensure_ascii=False, indent=2)
        
        logger.info(f"📊 Résumé: {json.dumps(result_summary, indent=2)}")
        logger.info("✅ Script unifié terminé avec succès")
        
        sys.exit(0)
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()