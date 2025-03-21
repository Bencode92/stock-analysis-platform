#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données des actions du DJ STOXX 600 depuis Boursorama
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
Version avec pagination pour la page liste.html
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
    "params": {
        "country": "EU",  # Europe
        "market": "2cSXXP",  # DJ STOXX 600
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

def get_stock_list_url(page=1, letter=""):
    """Génère l'URL pour obtenir la liste des actions pour une page donnée"""
    params = {
        "international_quotation_az_filter[country]": CONFIG["params"]["country"],
        "international_quotation_az_filter[market]": CONFIG["params"]["market"],
        "international_quotation_az_filter[letter]": letter,
        "international_quotation_az_filter[filter]": "",
        "pagination_1231311441": page
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

def scrape_stock_page(page=1):
    """Scrape une page de la liste des actions du STOXX 600"""
    url = get_stock_list_url(page)
    logger.info(f"Récupération des données pour la page {page}: {url}")
    
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Trouver le tableau des actions
        table = soup.find('table', class_='c-table')
        if not table:
            logger.warning(f"Aucun tableau trouvé pour la page {page}")
            return [], 0, 1
            
        # Trouver toutes les lignes de données (ignorer l'en-tête)
        rows = table.find('tbody').find_all('tr') if table.find('tbody') else []
        
        stocks = []
        for row in rows:
            stock_data = extract_stock_data(row)
            if stock_data:
                stocks.append(stock_data)
                
        logger.info(f"Trouvé {len(stocks)} actions pour la page {page}")
        
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
        logger.error(f"Erreur lors du scraping de la page {page}: {str(e)}")
        return [], page, 1

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

def save_data_for_page(stocks, page, total_pages):
    """Enregistre les données pour une page spécifique"""
    try:
        # Créer le dossier data s'il n'existe pas
        if not os.path.exists(CONFIG["output_dir"]):
            os.makedirs(CONFIG["output_dir"], exist_ok=True)
        
        # Organiser les actions par lettre
        stocks_by_letter = {}
        for letter in CONFIG["alphabet"]:
            letter_lower = letter.lower()
            stocks_by_letter[letter_lower] = []
            
        # Répartir les actions par lettre
        for stock in stocks:
            if not stock.get("name"):
                continue
                
            first_letter = stock["name"][0].upper()
            if first_letter in CONFIG["alphabet"]:
                letter_lower = first_letter.lower()
                stocks_by_letter[letter_lower].append(stock)
        
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
        output_path = os.path.join(CONFIG["output_dir"], f"stoxx_page_{page}.json")
        
        # Écrire le fichier JSON
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données pour la page {page} enregistrées dans {output_path}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données pour la page {page}: {str(e)}")
        return False

def main():
    """Point d'entrée principal"""
    try:
        logger.info("🚀 Démarrage du script de collecte des actions du DJ STOXX 600")
        
        # Récupérer les données de la première page pour obtenir le nombre total de pages
        first_page_stocks, current_page, total_pages = scrape_stock_page(1)
        
        if first_page_stocks:
            # Enregistrer les données de la première page
            save_data_for_page(first_page_stocks, 1, total_pages)
            
            # Récupérer les données des autres pages
            for page in range(2, total_pages + 1):
                # Attente pour éviter de surcharger le serveur
                time.sleep(2)
                
                # Récupérer les données de la page
                stocks, _, _ = scrape_stock_page(page)
                
                if stocks:
                    # Enregistrer les données de la page
                    save_data_for_page(stocks, page, total_pages)
            
            logger.info(f"✅ Scraping terminé avec succès: {total_pages} pages récupérées")
            sys.exit(0)
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
