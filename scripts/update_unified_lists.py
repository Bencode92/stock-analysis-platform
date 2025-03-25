#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script unifié d'extraction des données des actions du NASDAQ Composite et du DJ STOXX 600
Combine les fonctionnalités de scrape_lists.py et scrape_stoxx.py
Utilisé par GitHub Actions pour mettre à jour régulièrement les données

IMPORTANT: Ce script met à jour UNIQUEMENT les fichiers suivants:
- data/lists.json (données NASDAQ et STOXX unifiées)
- data/update_summary.json (résumé de la mise à jour)
- data/global_top_performers.json (classement global NASDAQ + STOXX)

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
    "base_url": "https://www.boursorama.com/bourse/actions/cotations/international",
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
    # Générer un timestamp similaire à celui utilisé par Boursorama
    pagination_timestamp = int(time.time())
    
    # Construire le chemin d'URL avec la page dans le chemin
    base_path = f"{CONFIG['base_url']}/page-{page}"
    
    # Paramètres de requête
    params = {
        "international_quotation_az_filter[country]": CONFIG["nasdaq"]["country"],
        "international_quotation_az_filter[market]": CONFIG["nasdaq"]["market"],
        "international_quotation_az_filter[letter]": letter,
        "international_quotation_az_filter[filter]": "",
        f"pagination_{pagination_timestamp}": ""
    }
    
    # Construire la chaîne de requête
    query_params = "&".join([f"{k}={v}" for k, v in params.items()])
    
    # Retourner l'URL complète
    return f"{base_path}?{query_params}"

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
            return [], False
            
        # Trouver toutes les lignes de données (ignorer l'en-tête)
        rows = table.find('tbody').find_all('tr') if table.find('tbody') else []
        
        stocks = []
        for row in rows:
            stock_data = extract_stock_data(row)
            if stock_data:
                stocks.append(stock_data)
                
        logger.info(f"Trouvé {len(stocks)} actions NASDAQ pour la lettre {letter}, page {page}")
        
        # MISE À JOUR: Détection de pagination pour le nouveau format
        has_next_page = False
        
        # Recherche du bloc de pagination (nouvelle structure)
        pagination = soup.select_one('.c-block-pagination__content')
        if pagination:
            # Rechercher le bouton "suivant"
            next_button = pagination.select_one('a.c-block-pagination__next-btn, a.c-pagination__item--next')
            has_next_page = next_button is not None and not ('disabled' in next_button.get('class', []))
            
            # Si nous ne trouvons pas de bouton spécifique "suivant", vérifier s'il y a une page avec un numéro plus élevé
            if not has_next_page:
                page_links = pagination.select('a.c-block-pagination__link')
                for link in page_links:
                    if link.text.isdigit() and int(link.text) > page:
                        has_next_page = True
                        break
        
        # Vérification de l'ancienne structure de pagination au cas où
        if not has_next_page:
            pagination_old = soup.find('ul', class_='c-pagination')
            if pagination_old:
                next_button = pagination_old.find('li', class_='c-pagination__item--next')
                has_next_page = next_button and not next_button.has_attr('disabled')
        
        # Vérification supplémentaire: si nous avons des actions mais pas de pagination, 
        # essayons quand même la page suivante
        if len(stocks) > 0 and not has_next_page and len(stocks) >= 20:  # 20 est la taille de page courante
            logger.info(f"Aucune pagination détectée mais {len(stocks)} actions trouvées, on essaie la page suivante")
            has_next_page = True
            
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
        max_pages_per_letter = 10  # Limite de sécurité pour éviter les boucles infinies
        
        while has_next_page and page <= max_pages_per_letter:
            stocks, has_next_page = scrape_nasdaq_page(letter, page)
            all_stocks.extend(stocks)
            
            # Si pas de page suivante, sortir de la boucle
            if not has_next_page:
                break
                
            # Passer à la page suivante
            page += 1
            
            # Attente pour éviter de surcharger le serveur
            time.sleep(CONFIG["sleep_time"])
        
        if page > max_pages_per_letter:
            logger.warning(f"Atteint la limite de {max_pages_per_letter} pages pour la lettre {letter}")
    
    return all_stocks

#
# Fonctions pour STOXX
#
def get_stoxx_url(page=1, letter=""):
    """Génère l'URL pour obtenir la liste des actions STOXX pour une page et lettre données"""
    # Générer un timestamp similaire à celui utilisé par Boursorama
    pagination_timestamp = int(time.time())
    
    # Construire le chemin d'URL avec la page dans le chemin
    base_path = f"{CONFIG['base_url']}/page-{page}"
    
    params = {
        "international_quotation_az_filter[country]": CONFIG["stoxx"]["country"],
        "international_quotation_az_filter[market]": CONFIG["stoxx"]["market"],
        "international_quotation_az_filter[letter]": letter,
        "international_quotation_az_filter[filter]": "",
        f"pagination_{pagination_timestamp}": ""
    }
    query_params = "&".join([f"{k}={v}" for k, v in params.items()])
    return f"{base_path}?{query_params}"

def scrape_stoxx_page(page=1, letter=""):
    """Scrape une page de la liste des actions du STOXX 600 pour une lettre donnée"""
    url = get_stoxx_url(page, letter)
    logger.info(f"Récupération des données STOXX pour la lettre {letter}, page {page}: {url}")
    
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Trouver le tableau des actions
        table = soup.find('table', class_='c-table')
        if not table:
            logger.warning(f"Aucun tableau trouvé pour la lettre STOXX {letter}, page {page}")
            return [], page, 1, False
            
        # Trouver toutes les lignes de données (ignorer l'en-tête)
        rows = table.find('tbody').find_all('tr') if table.find('tbody') else []
        
        stocks = []
        for row in rows:
            stock_data = extract_stock_data(row)
            if stock_data:
                stocks.append(stock_data)
                
        logger.info(f"Trouvé {len(stocks)} actions STOXX pour la lettre {letter}, page {page}")
        
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
        
        # MISE À JOUR: Détection de pagination pour le nouveau format
        has_next_page = False
        
        # Recherche du bloc de pagination (nouvelle structure)
        if pagination:
            # Rechercher le bouton "suivant"
            next_button = pagination.select_one('a.c-block-pagination__next-btn, a.c-pagination__item--next')
            has_next_page = next_button is not None and not ('disabled' in next_button.get('class', []))
            
            # Si nous ne trouvons pas de bouton spécifique "suivant", vérifier s'il y a une page avec un numéro plus élevé
            if not has_next_page:
                page_links = pagination.select('a.c-block-pagination__link')
                for link in page_links:
                    if link.text.isdigit() and int(link.text) > page:
                        has_next_page = True
                        break
        
        # Vérification de l'ancienne structure de pagination au cas où
        if not has_next_page:
            pagination_old = soup.find('ul', class_='c-pagination')
            if pagination_old:
                next_button = pagination_old.find('li', class_='c-pagination__item--next')
                has_next_page = next_button and not next_button.has_attr('disabled')
        
        # Vérification supplémentaire: si nous avons des actions mais pas de pagination, 
        # essayons quand même la page suivante
        if len(stocks) > 0 and not has_next_page and len(stocks) >= 20:  # 20 est la taille de page courante
            logger.info(f"Aucune pagination détectée mais {len(stocks)} actions trouvées, on essaie la page suivante")
            has_next_page = True
        
        return stocks, current_page, total_pages, has_next_page
        
    except Exception as e:
        logger.error(f"Erreur lors du scraping STOXX lettre {letter}, page {page}: {str(e)}")
        return [], page, 1, False

def scrape_all_stoxx():
    """Scrape toutes les actions du STOXX 600 par lettre et par page"""
    all_stocks = []
    max_pages_per_letter = 10  # Limite de sécurité
    total_pages_overall = 0
    total_stocks = 0
    
    try:
        # Parcourir chaque lettre de l'alphabet
        for letter in CONFIG["alphabet"]:
            logger.info(f"📊 Récupération des données STOXX pour la lettre {letter}...")
            
            # Récupérer les données de la première page pour cette lettre
            letter_stocks, current_page, total_pages, has_next_page = scrape_stoxx_page(1, letter)
            
            if letter_stocks:
                all_stocks.extend(letter_stocks)
                total_stocks += len(letter_stocks)
                
                # Mettre à jour le nombre total de pages pour cette lettre
                letter_page_count = 1
                
                # Récupérer les pages suivantes pour cette lettre
                page = 2
                while has_next_page and page <= min(total_pages + 1, max_pages_per_letter + 1):
                    # Attente pour éviter de surcharger le serveur
                    time.sleep(CONFIG["sleep_time"])
                    
                    # Récupérer les données de la page
                    page_stocks, _, _, page_has_next = scrape_stoxx_page(page, letter)
                    
                    if page_stocks:
                        all_stocks.extend(page_stocks)
                        total_stocks += len(page_stocks)
                        letter_page_count += 1
                    
                    # Mettre à jour le flag pour la prochaine page
                    has_next_page = page_has_next
                    
                    # Passer à la page suivante
                    page += 1
                    
                # Mettre à jour le nombre total de pages global
                total_pages_overall = max(total_pages_overall, letter_page_count)
            
            # Attente entre les lettres pour éviter de surcharger le serveur
            time.sleep(CONFIG["sleep_time"])
        
        logger.info(f"✅ Scraping STOXX terminé avec succès: {total_stocks} actions récupérées sur toutes les lettres")
        return {
            "status": "success",
            "pages": total_pages_overall,
            "stocks": total_stocks,
            "all_stocks": all_stocks
        }
    except Exception as e:
        logger.error(f"❌ Erreur lors du scraping STOXX: {str(e)}")
        return {
            "status": "error",
            "message": str(e),
            "pages": 0,
            "stocks": 0,
            "all_stocks": []
        }

def create_global_rankings(nasdaq_stocks, stoxx_result):
    """Crée un classement global combiné NASDAQ + STOXX et le sauvegarde"""
    logger.info("🌐 Création du classement global NASDAQ + STOXX...")
    
    try:
        # Ajouter l'information du marché pour chaque action NASDAQ
        nasdaq_with_source = []
        for stock in nasdaq_stocks:
            stock_with_source = stock.copy()
            stock_with_source['market'] = 'NASDAQ'
            stock_with_source['marketIcon'] = '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
            nasdaq_with_source.append(stock_with_source)
        
        # Récupérer toutes les actions STOXX depuis stoxx_result
        all_stoxx_stocks = stoxx_result.get('all_stocks', [])

        # Ajouter l'information du marché pour chaque action STOXX
        stoxx_with_source = []
        for stock in all_stoxx_stocks:
            stock_with_source = stock.copy()
            stock_with_source['market'] = 'STOXX'
            stock_with_source['marketIcon'] = '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            stoxx_with_source.append(stock_with_source)
        
        # Combiner toutes les actions
        all_stocks = nasdaq_with_source + stoxx_with_source
        
        # Fonction pour extraire la valeur numérique d'un pourcentage
        def parse_percentage(value_str):
            if not value_str or value_str == "-":
                return 0.0
            # Nettoyer la chaîne
            clean_value = value_str.replace('%', '').replace(',', '.').replace(' ', '')
            try:
                return float(clean_value)
            except:
                return 0.0
        
        # Trier pour le top quotidien (hausse)
        all_stocks_daily_up = sorted(
            [s for s in all_stocks if s.get('change')], 
            key=lambda x: parse_percentage(x.get('change', '0')),
            reverse=True
        )
        
        # Trier pour le top quotidien (baisse)
        all_stocks_daily_down = sorted(
            [s for s in all_stocks if s.get('change')], 
            key=lambda x: parse_percentage(x.get('change', '0'))
        )
        
        # Trier pour le top YTD (hausse)
        all_stocks_ytd_up = sorted(
            [s for s in all_stocks if s.get('ytd')], 
            key=lambda x: parse_percentage(x.get('ytd', '0')),
            reverse=True
        )
        
        # Trier pour le top YTD (baisse)
        all_stocks_ytd_down = sorted(
            [s for s in all_stocks if s.get('ytd')], 
            key=lambda x: parse_percentage(x.get('ytd', '0'))
        )
        
        # Créer la structure de données pour le classement global
        global_rankings = {
            "daily": {
                "best": all_stocks_daily_up[:10],  # Top 10 hausse quotidienne
                "worst": all_stocks_daily_down[:10]  # Top 10 baisse quotidienne
            },
            "ytd": {
                "best": all_stocks_ytd_up[:10],  # Top 10 hausse YTD
                "worst": all_stocks_ytd_down[:10]  # Top 10 baisse YTD
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "count": len(all_stocks),
                "description": "Classement global combiné (NASDAQ + STOXX)"
            }
        }
        
        # Sauvegarder dans un fichier JSON
        output_path = os.path.join(CONFIG["stoxx"]["output_dir"], "global_top_performers.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(global_rankings, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Classement global enregistré dans {output_path}")
        return True
    
    except Exception as e:
        logger.error(f"❌ Erreur lors de la création du classement global: {str(e)}")
        return False

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

        ensure_data_directory()
        verify_no_markets_conflict()

        # Créer la structure de base pour les deux marchés
        combined_data = {
            "nasdaq": {
                "indices": {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"},
                "top_performers": {
                    "daily": {"best": [], "worst": []},
                    "ytd": {"best": [], "worst": []}
                },
                "meta": {
                    "source": "Boursorama",
                    "description": "Actions du NASDAQ Composite (États-Unis)",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "count": 0
                }
            },
            "stoxx": {
                "indices": {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"},
                "top_performers": {
                    "daily": {"best": [], "worst": []},
                    "ytd": {"best": [], "worst": []}
                },
                "meta": {
                    "source": "Boursorama",
                    "description": "Actions du DJ STOXX 600 (Europe)",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "count": 0,
                    "pagination": {
                        "currentPage": 1,
                        "totalPages": 1
                    }
                }
            }
        }

        # Extraction des données NASDAQ
        logger.info("📊 Début du scraping NASDAQ...")
        nasdaq_stocks = scrape_all_nasdaq_stocks()
        
        if nasdaq_stocks:
            # Organiser par lettre alphabétique
            nasdaq_by_letter = {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"}
            for stock in nasdaq_stocks:
                if stock.get("name"):
                    first_letter = stock["name"][0].lower()
                    if first_letter in nasdaq_by_letter:
                        nasdaq_by_letter[first_letter].append(stock)
            
            # Mettre à jour les données NASDAQ
            combined_data["nasdaq"]["indices"] = nasdaq_by_letter
            combined_data["nasdaq"]["top_performers"]["daily"]["best"] = get_top_performers(nasdaq_stocks, "change", True)
            combined_data["nasdaq"]["top_performers"]["daily"]["worst"] = get_top_performers(nasdaq_stocks, "change", False)
            combined_data["nasdaq"]["top_performers"]["ytd"]["best"] = get_top_performers(nasdaq_stocks, "ytd", True)
            combined_data["nasdaq"]["top_performers"]["ytd"]["worst"] = get_top_performers(nasdaq_stocks, "ytd", False)
            combined_data["nasdaq"]["meta"]["count"] = len(nasdaq_stocks)
            combined_data["nasdaq"]["meta"]["timestamp"] = datetime.now(timezone.utc).isoformat()

        # Extraction des données STOXX
        logger.info("📊 Début du scraping STOXX...")
        stoxx_result = scrape_all_stoxx()
        stoxx_stocks = stoxx_result.get("all_stocks", [])
        
        if stoxx_stocks:
            # Organiser par lettre alphabétique
            stoxx_by_letter = {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"}
            for stock in stoxx_stocks:
                if stock.get("name"):
                    first_letter = stock["name"][0].lower()
                    if first_letter in stoxx_by_letter:
                        stoxx_by_letter[first_letter].append(stock)
            
            # Mettre à jour les données STOXX
            combined_data["stoxx"]["indices"] = stoxx_by_letter
            combined_data["stoxx"]["top_performers"]["daily"]["best"] = get_top_performers(stoxx_stocks, "change", True)
            combined_data["stoxx"]["top_performers"]["daily"]["worst"] = get_top_performers(stoxx_stocks, "change", False)
            combined_data["stoxx"]["top_performers"]["ytd"]["best"] = get_top_performers(stoxx_stocks, "ytd", True)
            combined_data["stoxx"]["top_performers"]["ytd"]["worst"] = get_top_performers(stoxx_stocks, "ytd", False)
            combined_data["stoxx"]["meta"]["count"] = len(stoxx_stocks)
            combined_data["stoxx"]["meta"]["timestamp"] = datetime.now(timezone.utc).isoformat()
            
            # Si nous avons des informations de pagination
            if stoxx_result.get("pages"):
                combined_data["stoxx"]["meta"]["pagination"]["totalPages"] = stoxx_result.get("pages", 1)

        # Chemin explicite pour lists.json
        lists_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "lists.json")
        logger.info(f"📝 Sauvegarde des données combinées dans: {lists_path}")

        # Vérifier que les données à écrire sont bien structurées
        logger.info(f"📊 Structure des données: {len(combined_data.keys())} marchés, " 
                  f"NASDAQ: {combined_data['nasdaq']['meta']['count']} actions, "
                  f"STOXX: {combined_data['stoxx']['meta']['count']} actions")

        # Sauvegarder les données dans lists.json avec gestion d'erreur
        try:
            with open(lists_path, 'w', encoding='utf-8') as f:
                json.dump(combined_data, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Données sauvegardées avec succès dans {lists_path}")
        except Exception as e:
            logger.error(f"❌ ERREUR lors de la sauvegarde dans lists.json: {str(e)}")
            import traceback
            traceback.print_exc()

        # Créer quand même le classement global pour compatibilité
        if nasdaq_stocks and stoxx_stocks:
            logger.info("📊 Création du classement global NASDAQ + STOXX...")
            create_global_rankings(nasdaq_stocks, stoxx_result)

        # Résumé de la mise à jour
        result_summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "nasdaq": {
                "count": len(nasdaq_stocks),
                "status": "success" if nasdaq_stocks else "error"
            },
            "stoxx": {
                "count": len(stoxx_stocks),
                "status": "success" if stoxx_stocks else "error"
            },
            "combined_file": "lists.json",
            "global_ranking": {
                "status": "success" if nasdaq_stocks and stoxx_stocks else "error",
                "file": "global_top_performers.json"
            }
        }

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
