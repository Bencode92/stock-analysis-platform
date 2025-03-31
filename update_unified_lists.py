#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import sys
import time
from datetime import datetime
import requests
from bs4 import BeautifulSoup
import logging

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# URLs des sources de données
NASDAQ_URL = "https://www.boursorama.com/bourse/actions/cotations/international/?international_quotation_az_filter%5Bcountry%5D=1&international_quotation_az_filter%5Bmarket%5D=%24COMPX"
STOXX_URL = "https://www.boursorama.com/bourse/actions/cotations/international/?international_quotation_az_filter%5Bcountry%5D=EU&international_quotation_az_filter%5Bmarket%5D=2cSXXP"

# Répertoire cible pour les fichiers JSON
OUTPUT_DIR = "data"

def ensure_output_dir():
    """Vérifie et crée le répertoire de sortie si nécessaire."""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        logger.info(f"Répertoire {OUTPUT_DIR} créé")

def get_page_content(url):
    """Télécharge le contenu d'une page web avec gestion des erreurs et retry."""
    max_retries = 3
    retry_delay = 5  # secondes
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'fr,fr-FR;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    }
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Téléchargement de {url} (tentative {attempt+1}/{max_retries})")
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.text
        except requests.exceptions.RequestException as e:
            logger.warning(f"Erreur lors du téléchargement: {e}")
            if attempt < max_retries - 1:
                logger.info(f"Nouvelle tentative dans {retry_delay} secondes...")
                time.sleep(retry_delay)
            else:
                logger.error("Nombre maximum de tentatives atteint. Abandon.")
                raise

def remove_duplicates(stocks):
    """
    Déduplique une liste d'actions en utilisant un identifiant unique.
    Utilise principalement le lien comme identifiant, ou à défaut le nom.
    
    Args:
        stocks (list): Liste d'actions à dédupliquer
        
    Returns:
        list: Liste d'actions sans doublons
    """
    seen = set()
    unique_stocks = []
    
    for stock in stocks:
        # Utiliser le lien comme identifiant principal, sinon le nom
        identifier = stock.get("link", "") or stock.get("name", "")
        
        if identifier and identifier not in seen:
            seen.add(identifier)
            unique_stocks.append(stock)
    
    logger.info(f"Déduplication: {len(unique_stocks)}/{len(stocks)} actions conservées ({len(stocks) - len(unique_stocks)} doublons supprimés)")
    return unique_stocks

def parse_stock_data(html_content, market_type):
    """Extrait les données des actions depuis le HTML."""
    logger.info(f"Analyse du HTML pour le marché {market_type}")
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Dictionnaire pour organiser les actions par première lettre
    indices = {letter: [] for letter in 'abcdefghijklmnopqrstuvwxyz'}
    
    # Recherche du tableau des actions
    table = soup.select_one('table.c-table')
    if not table:
        logger.error("Tableau des actions non trouvé dans le HTML")
        return None, []
    
    # Liste pour stocker toutes les actions pour le top performers
    all_stocks = []
    
    # Parcourir les lignes du tableau (ignorer l'en-tête)
    rows = table.select('tbody tr')
    logger.info(f"Nombre de lignes trouvées: {len(rows)}")
    
    # Ensemble pour suivre les noms d'actions uniques
    seen_names = set()
    
    for row in rows:
        try:
            # Extraire les cellules
            cells = row.select('td')
            if len(cells) < 8:
                logger.warning(f"Ligne ignorée (nombre de cellules insuffisant): {len(cells)}")
                continue
            
            # Extraire le nom de l'action
            name_cell = cells[0]
            name = name_cell.get_text(strip=True)
            
            # Vérifier pour les doublons
            if name in seen_names:
                logger.warning(f"Action dupliquée ignorée: {name}")
                continue
            
            seen_names.add(name)
            
            # Autres données
            last = cells[1].get_text(strip=True) if len(cells) > 1 else "-"
            change = cells[2].get_text(strip=True) if len(cells) > 2 else "-"
            
            # Données supplémentaires si disponibles
            open_price = cells[3].get_text(strip=True) if len(cells) > 3 else "-"
            high = cells[4].get_text(strip=True) if len(cells) > 4 else "-"
            low = cells[5].get_text(strip=True) if len(cells) > 5 else "-"
            ytd = cells[6].get_text(strip=True) if len(cells) > 6 else "-"
            volume = cells[7].get_text(strip=True) if len(cells) > 7 else "-"
            
            # Extraire le symbole si disponible
            symbol = ""
            symbol_elem = name_cell.select_one('span.c-instrument--name')
            if symbol_elem:
                symbol = symbol_elem.get_text(strip=True)
            
            # Extraire le lien si disponible
            link = ""
            a_elem = name_cell.select_one('a')
            if a_elem and a_elem.has_attr('href'):
                link = "https://www.boursorama.com" + a_elem['href']
            
            # Déterminer la tendance (up, down, neutral)
            trend = "neutral"
            if change and "+" in change:
                trend = "up"
            elif change and "-" in change:
                trend = "down"
            
            # Créer l'objet stock
            stock = {
                "name": name,
                "symbol": symbol,
                "last": last,
                "change": change,
                "open": open_price,
                "high": high,
                "low": low,
                "ytd": ytd,
                "volume": volume,
                "trend": trend,
                "link": link,
                "market": market_type
            }
            
            # Ajouter à la liste par lettre
            first_letter = name[0].lower() if name else ""
            if first_letter.isalpha():
                indices[first_letter].append(stock)
            
            # Ajouter à la liste complète
            all_stocks.append(stock)
            
        except Exception as e:
            logger.error(f"Erreur lors du traitement d'une ligne: {e}")
    
    logger.info(f"Nombre total d'actions traitées: {len(all_stocks)}")
    return indices, all_stocks

def get_top_performers(stocks, field='change', reverse=True):
    """Extrait les meilleures/pires performances des actions en fonction d'un champ."""
    try:
        # Fonction pour convertir la valeur en nombre (gère les formats européens et US)
        def parse_percentage(value):
            if not value or value == "-":
                return 0
            # Remplacer les virgules par des points pour les décimales
            clean_value = value.replace(',', '.')
            # Supprimer les symboles +, %, etc.
            clean_value = ''.join(c for c in clean_value if c.isdigit() or c in '.-')
            try:
                return float(clean_value)
            except ValueError:
                return 0
        
        # Trier les actions en fonction du champ spécifié
        sorted_stocks = sorted(
            [s for s in stocks if field in s and s[field] != "-"],
            key=lambda x: parse_percentage(x[field]),
            reverse=reverse
        )
        
        # SOLUTION: Utiliser un set pour garantir l'unicité des actions dans le top 10
        unique_stocks = []
        seen = set()
        
        for stock in sorted_stocks:
            name = stock.get("name", "")
            if name and name not in seen:
                seen.add(name)
                unique_stocks.append(stock)
                # S'arrêter à 10 actions uniques
                if len(unique_stocks) == 10:
                    break
        
        logger.info(f"Top performances ({field}, {'hausse' if reverse else 'baisse'}): {len(unique_stocks)} actions sélectionnées")
        
        return unique_stocks
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des top performers: {e}")
        return []

def create_top_performers(stocks):
    """Crée la structure de données pour les top performers."""
    try:
        # Meilleurs/pires performances quotidiennes
        best_daily = get_top_performers(stocks, 'change', True)
        worst_daily = get_top_performers(stocks, 'change', False)
        
        # Meilleurs/pires performances YTD
        best_ytd = get_top_performers(stocks, 'ytd', True)
        worst_ytd = get_top_performers(stocks, 'ytd', False)
        
        return {
            "daily": {
                "best": best_daily,
                "worst": worst_daily
            },
            "ytd": {
                "best": best_ytd,
                "worst": worst_ytd
            }
        }
    except Exception as e:
        logger.error(f"Erreur lors de la création des top performers: {e}")
        return {}

def main():
    """Fonction principale du script."""
    try:
        # S'assurer que le répertoire de sortie existe
        ensure_output_dir()
        
        # Timestamp pour les métadonnées
        timestamp = datetime.now().isoformat()
        
        # Structure de données pour le NASDAQ Composite
        logger.info("Traitement des données NASDAQ Composite")
        nasdaq_html = get_page_content(NASDAQ_URL)
        nasdaq_indices, nasdaq_stocks = parse_stock_data(nasdaq_html, "NASDAQ")
        
        # Structure de données pour le STOXX 600
        logger.info("Traitement des données STOXX 600")
        stoxx_html = get_page_content(STOXX_URL)
        stoxx_indices, stoxx_stocks = parse_stock_data(stoxx_html, "STOXX")
        
        # IMPORTANT: Déduplication des données avant traitement
        logger.info("Déduplication des données NASDAQ")
        nasdaq_stocks = remove_duplicates(nasdaq_stocks)
        
        logger.info("Déduplication des données STOXX")
        stoxx_stocks = remove_duplicates(stoxx_stocks)
        
        # Créer un fichier structuré pour les listes.json
        logger.info("Création des structures de données pour les fichiers JSON")
        
        # Données NASDAQ
        nasdaq_data = {
            "indices": nasdaq_indices,
            "top_performers": create_top_performers(nasdaq_stocks),
            "meta": {
                "timestamp": timestamp,
                "count": len(nasdaq_stocks),
                "source": "Boursorama"
            }
        }
        
        # Données STOXX avec pagination
        stoxx_data = {
            "indices": stoxx_indices,
            "top_performers": create_top_performers(stoxx_stocks),
            "meta": {
                "timestamp": timestamp,
                "count": len(stoxx_stocks),
                "source": "Boursorama",
                "pagination": {
                    "currentPage": 1,
                    "totalPages": max(1, len(stoxx_stocks) // 100)  # 100 éléments par page par exemple
                }
            }
        }
        
        # Combinaison des données pour le marché global
        logger.info("Combinaison des données NASDAQ et STOXX")
        
        # Fusionner les indices par lettre
        merged_indices = {letter: [] for letter in 'abcdefghijklmnopqrstuvwxyz'}
        for letter in merged_indices:
            if nasdaq_indices and letter in nasdaq_indices:
                merged_indices[letter].extend(nasdaq_indices[letter])
            if stoxx_indices and letter in stoxx_indices:
                merged_indices[letter].extend(stoxx_indices[letter])
        
        # Créer les top performers pour le marché combiné
        all_stocks = []
        if nasdaq_stocks:
            all_stocks.extend(nasdaq_stocks)
        if stoxx_stocks:
            all_stocks.extend(stoxx_stocks)
        
        # Déduplication des données combinées avant création des tops globaux
        logger.info("Déduplication des données combinées NASDAQ + STOXX")
        all_stocks = remove_duplicates(all_stocks)
        
        combined_top_performers = create_top_performers(all_stocks)
        
        # Structure finale pour le fichier lists.json
        lists_data = {
            "nasdaq": nasdaq_data,
            "stoxx": stoxx_data,
            "combined": {
                "indices": merged_indices,
                "top_performers": combined_top_performers,
                "meta": {
                    "timestamp": timestamp,
                    "count": len(all_stocks),
                    "source": "Boursorama",
                    "markets": ["NASDAQ", "STOXX"]
                }
            }
        }
        
        # Écrire le fichier lists.json
        lists_path = os.path.join(OUTPUT_DIR, "lists.json")
        with open(lists_path, 'w', encoding='utf-8') as f:
            json.dump(lists_data, f, ensure_ascii=False, indent=2)
        
        # Créer également un fichier séparé pour les top performers globaux
        global_top_performers = {
            "daily": combined_top_performers["daily"],
            "ytd": combined_top_performers["ytd"],
            "meta": {
                "timestamp": timestamp,
                "count": len(all_stocks),
                "description": "Classement global combiné (NASDAQ + STOXX)"
            }
        }
        
        global_top_path = os.path.join(OUTPUT_DIR, "global_top_performers.json")
        with open(global_top_path, 'w', encoding='utf-8') as f:
            json.dump(global_top_performers, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Fichiers JSON générés avec succès")
        
        return 0  # Code de sortie réussi
        
    except Exception as e:
        logger.error(f"Erreur dans la fonction principale: {e}", exc_info=True)
        return 1  # Code de sortie en cas d'erreur

if __name__ == "__main__":
    sys.exit(main())