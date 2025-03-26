#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données des cryptomonnaies depuis CoinMarketCap
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
Produit un fichier crypto_lists.json avec une structure similaire à lists.json
mais en utilisant CoinMarketCap comme source
"""

import os
import json
import sys
import requests
import logging
from datetime import datetime, timezone, timedelta
import time
import random
from bs4 import BeautifulSoup
import re

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "api_key": os.environ.get("CMC_API_KEY", ""),  # Clé API CoinMarketCap (si disponible)
    "scraping_urls": {
        "all": "https://coinmarketcap.com/fr/?type=coins&tableRankBy=gainer_loser_7d&lang=fr",
        "top100": "https://coinmarketcap.com/fr/?type=coins&tableRankBy=gainer_loser_7d&lang=fr"
    },
    "api_endpoints": {
        "listings": "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest"
    },
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "crypto_lists.json"),
    "user_agents": [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ],
    "sleep_time": 2.0,  # Délai entre les requêtes pour éviter le rate limiting
    "retries": 3        # Nombre de tentatives en cas d'échec
}

def get_random_user_agent():
    """Renvoie un User-Agent aléatoire pour éviter la détection de bot"""
    return random.choice(CONFIG["user_agents"])

def get_headers():
    """Crée des en-têtes HTTP pour les requêtes"""
    headers = {
        "User-Agent": get_random_user_agent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
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
    
    return headers

def get_api_headers():
    """Crée des en-têtes pour l'API CoinMarketCap"""
    headers = {
        "Accepts": "application/json",
        "X-CMC_PRO_API_KEY": CONFIG["api_key"],
    }
    return headers

def fetch_crypto_data_via_api(limit=1000):
    """Récupère les données via l'API CoinMarketCap"""
    if not CONFIG["api_key"]:
        logger.warning("Pas de clé API CoinMarketCap configurée, utilisation du web scraping à la place")
        return []

    logger.info(f"Récupération des données via l'API CoinMarketCap (limite: {limit})...")
    
    try:
        parameters = {
            "start": 1,
            "limit": limit,
            "convert": "EUR",
            "sort": "market_cap",
            "sort_dir": "desc",
            "cryptocurrency_type": "coins"
        }
        
        response = requests.get(
            CONFIG["api_endpoints"]["listings"], 
            headers=get_api_headers(), 
            params=parameters
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("status", {}).get("error_code") == 0:
                logger.info(f"✅ Données API récupérées: {len(data.get('data', []))} cryptomonnaies")
                return data.get("data", [])
            else:
                logger.error(f"Erreur API: {data.get('status', {}).get('error_message')}")
        else:
            logger.error(f"Erreur lors de la requête API: {response.status_code}")
            
        return []
    except Exception as e:
        logger.error(f"Exception lors de la requête API: {str(e)}")
        return []

def fetch_crypto_data_via_scraping(market="all"):
    """Récupère les données en faisant du scraping sur CoinMarketCap"""
    logger.info(f"Récupération des données via web scraping ({market})...")
    
    url = CONFIG["scraping_urls"][market]
    all_cryptos = []
    
    try:
        # Pour toutes
        if market == "all":
            # Récupérer la page principale (pas besoin de pagination, tout est chargé par JavaScript)
            logger.info(f"Scraping de la page principale...")
            response = requests.get(
                url,
                headers=get_headers(),
                timeout=30
            )
            
            if response.status_code == 200:
                cryptos = parse_coinmarketcap_page(response.text)
                if cryptos:
                    all_cryptos.extend(cryptos)
                    logger.info(f"✅ Page principale récupérée: {len(cryptos)} cryptomonnaies")
                else:
                    logger.warning(f"Aucune crypto trouvée sur la page principale")
            else:
                logger.error(f"Erreur HTTP {response.status_code} pour la page principale")
        
        # Pour top 100 (même page, mais limité à 100)
        else:
            # Utiliser la même page que 'all' mais prendre seulement les 100 premiers
            logger.info(f"Scraping pour le top 100...")
            response = requests.get(
                url,
                headers=get_headers(),
                timeout=30
            )
            
            if response.status_code == 200:
                cryptos = parse_coinmarketcap_page(response.text)
                if cryptos:
                    all_cryptos = cryptos[:100]  # Limiter aux 100 premiers
                    logger.info(f"✅ Top 100 récupéré: {len(all_cryptos)} cryptomonnaies")
                else:
                    logger.warning(f"Aucune crypto trouvée pour le top 100")
            else:
                logger.error(f"Erreur HTTP {response.status_code} pour le top 100")
        
        logger.info(f"✅ Total: {len(all_cryptos)} cryptomonnaies récupérées par scraping")
        return all_cryptos
        
    except Exception as e:
        logger.error(f"Erreur générale lors du scraping: {str(e)}")
        return []

def parse_coinmarketcap_page(html_content):
    """Analyse le contenu HTML de CoinMarketCap pour extraire les données des cryptomonnaies"""
    cryptos = []
    
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Générer fichier de debug
        debug_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(debug_dir):
            os.makedirs(debug_dir, exist_ok=True)
        debug_file_path = os.path.join(debug_dir, "debug_coinmarketcap.html")
        with open(debug_file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        logger.info(f"HTML sauvegardé pour débogage dans {debug_file_path}")
        
        # MÉTHODE 1: Chercher toutes les tables présentes
        tables = soup.find_all('table')
        logger.info(f"Nombre de tableaux trouvés: {len(tables)}")
        
        if tables:
            for i, table in enumerate(tables):
                logger.info(f"Analyse du tableau #{i+1}")
                
                # Trouver toutes les lignes
                rows = table.find_all('tr')
                logger.info(f"Nombre de lignes dans le tableau #{i+1}: {len(rows)}")
                
                # Essayons de comprendre les en-têtes pour repérer les colonnes importantes
                headers = []
                header_row = rows[0] if rows else None
                if header_row:
                    headers = [th.get_text(strip=True) for th in header_row.find_all(['th', 'td'])]
                    logger.info(f"En-têtes trouvés: {headers}")
                
                # Chercher spécifiquement les colonnes qui nous intéressent
                name_idx = price_idx = change_24h_idx = change_30d_idx = ytd_idx = -1
                
                # Identifier les colonnes à partir des en-têtes
                for j, header in enumerate(headers):
                    header_lower = header.lower()
                    if any(term in header_lower for term in ['nom', 'name']):
                        name_idx = j
                    elif any(term in header_lower for term in ['prix', 'price']):
                        price_idx = j
                    elif '24h' in header_lower or '24 h' in header_lower:
                        change_24h_idx = j
                    elif '30j' in header_lower or '30 j' in header_lower:
                        change_30d_idx = j
                    elif 'ytd' in header_lower or 'year' in header_lower or 'début' in header_lower:
                        ytd_idx = j
                
                # Si on n'a pas d'en-têtes clairs, essayer de les déterminer par position
                if name_idx < 0 and len(headers) >= 2:
                    name_idx = 1  # Souvent la 2ème colonne
                if price_idx < 0 and len(headers) >= 4:
                    price_idx = 3  # Souvent la 4ème colonne
                if change_24h_idx < 0 and len(headers) >= 8:
                    change_24h_idx = 7  # Souvent vers la fin
                if change_30d_idx < 0 and len(headers) >= 9:
                    change_30d_idx = 8  # Souvent vers la fin
                if ytd_idx < 0 and len(headers) >= 10:
                    ytd_idx = 9  # Souvent la dernière colonne
                
                logger.info(f"Indices des colonnes: Nom={name_idx}, Prix={price_idx}, 24h={change_24h_idx}, 30j={change_30d_idx}, YTD={ytd_idx}")
                
                # Parcourir les lignes de données (ignorer l'en-tête)
                for row_idx, row in enumerate(rows[1:], 1):
                    try:
                        cells = row.find_all(['td', 'th'])
                        
                        # Vérifier qu'il y a assez de cellules
                        if len(cells) < max(3, name_idx+1, price_idx+1):
                            continue
                        
                        # Extraire le nom et le symbole
                        name = ""
                        symbol = ""
                        if name_idx >= 0 and name_idx < len(cells):
                            name_cell = cells[name_idx]
                            
                            # Essayer d'extraire le nom et le symbole
                            # 1. Chercher des éléments spécifiques pour le nom/symbole
                            name_elements = name_cell.find_all(['p', 'div', 'span', 'a'])
                            
                            for elem in name_elements:
                                elem_text = elem.get_text(strip=True)
                                if not elem_text:
                                    continue
                                    
                                # Si on trouve un texte court en majuscules, c'est probablement le symbole
                                if re.match(r'^[A-Z0-9]{2,6}$', elem_text):
                                    symbol = elem_text
                                # Sinon, c'est probablement le nom
                                elif not name and len(elem_text) < 30:
                                    name = elem_text
                            
                            # Si on n'a pas trouvé de nom, utiliser le texte complet
                            if not name:
                                name = name_cell.get_text(strip=True)
                                
                                # Essayer d'extraire le symbole s'il est dans le nom
                                symbol_match = re.search(r'\b[A-Z0-9]{2,6}\b', name)
                                if symbol_match:
                                    symbol = symbol_match.group(0)
                        
                        # Si on n'a pas de nom valide, passer à la ligne suivante
                        if not name:
                            continue
                        
                        # Extraire les valeurs qui nous intéressent le plus: prix, var 24h, var 30j, var YTD
                        price = ""
                        change_24h = ""
                        change_30d = ""
                        ytd = ""
                        
                        # Extraire le prix
                        if price_idx >= 0 and price_idx < len(cells):
                            price_cell = cells[price_idx]
                            price = price_cell.get_text(strip=True)
                        
                        # Extraire la variation sur 24h
                        if change_24h_idx >= 0 and change_24h_idx < len(cells):
                            change_24h_cell = cells[change_24h_idx]
                            change_24h = change_24h_cell.get_text(strip=True)
                            # Nettoyer: s'assurer que le format est correct
                            if "%" not in change_24h and re.match(r'^[+\-]?\d+(\.\d+)?$', change_24h):
                                change_24h = f"{change_24h}%"
                        
                        # Extraire la variation sur 30j
                        if change_30d_idx >= 0 and change_30d_idx < len(cells):
                            change_30d_cell = cells[change_30d_idx]
                            change_30d = change_30d_cell.get_text(strip=True)
                            # Nettoyer: s'assurer que le format est correct
                            if "%" not in change_30d and re.match(r'^[+\-]?\d+(\.\d+)?$', change_30d):
                                change_30d = f"{change_30d}%"
                        
                        # Extraire la variation YTD
                        if ytd_idx >= 0 and ytd_idx < len(cells):
                            ytd_cell = cells[ytd_idx]
                            ytd = ytd_cell.get_text(strip=True)
                            # Nettoyer: s'assurer que le format est correct
                            if "%" not in ytd and re.match(r'^[+\-]?\d+(\.\d+)?$', ytd):
                                ytd = f"{ytd}%"
                        
                        # Si on n'a pu extraire ni le prix ni la variation, cette ligne est probablement invalide
                        if not price and not change_24h and not change_30d and not ytd:
                            continue
                        
                        # Créer l'objet crypto avec les données extraites
                        crypto = {
                            "name": name,
                            "symbol": symbol,
                            "last": price,
                            "change": change_24h,
                            "change30d": change_30d,
                            "ytd": ytd,
                            "volume": "",  # Pas prioritaire
                            "marketCap": ""  # Pas prioritaire
                        }
                        
                        # Ajouter cette crypto à la liste
                        cryptos.append(crypto)
                        if len(cryptos) <= 5:  # Juste pour déboguer les 5 premières
                            logger.info(f"Crypto extraite: {name} ({symbol}) - Prix: {price}, 24h: {change_24h}, 30j: {change_30d}, YTD: {ytd}")
                        
                    except Exception as e:
                        logger.warning(f"Erreur lors de l'analyse de la ligne {row_idx}: {str(e)}")
                        continue
                
                # Si on a trouvé des cryptos, stopper l'analyse des tableaux
                if cryptos:
                    logger.info(f"✅ {len(cryptos)} cryptomonnaies trouvées dans le tableau #{i+1}")
                    break
        
        # MÉTHODE 2: Analyse visuelle du contenu de la page
        if not cryptos:
            logger.info("Aucune crypto trouvée par la méthode des tableaux, essai d'une méthode alternative...")
            
            # Chercher des éléments qui pourraient contenir des lignes de crypto
            potential_rows = soup.find_all(['tr', 'div'], class_=lambda x: x and ('row' in x or 'item' in x or 'tr' in x))
            logger.info(f"Trouvé {len(potential_rows)} éléments potentiels pour des crypto")
            
            for i, row in enumerate(potential_rows):
                try:
                    # Chercher tous les textes dans cette ligne
                    texts = [t.strip() for t in row.get_text(separator="|").split("|") if t.strip()]
                    
                    # Si ligne trop courte, ignorer
                    if len(texts) < 3:
                        continue
                    
                    # Chercher un symbole de crypto typique (lettres majuscules)
                    symbol = ""
                    for text in texts:
                        if re.match(r'^[A-Z0-9]{2,6}$', text):
                            symbol = text
                            break
                    
                    # Si pas de symbole trouvé, chercher un motif de symbole dans les textes
                    if not symbol:
                        for text in texts:
                            symbol_match = re.search(r'\b[A-Z0-9]{2,6}\b', text)
                            if symbol_match:
                                symbol = symbol_match.group(0)
                                break
                    
                    # Si toujours pas de symbole, cette ligne n'est probablement pas une crypto
                    if not symbol:
                        continue
                    
                    # Chercher un nom (généralement près du symbole)
                    name = ""
                    symbol_index = next((i for i, text in enumerate(texts) if symbol in text), -1)
                    
                    if symbol_index != -1:
                        # Essayer d'obtenir le nom à partir du texte contenant le symbole
                        if texts[symbol_index] != symbol:
                            name = texts[symbol_index].replace(symbol, "").strip()
                        # Sinon chercher dans les éléments adjacents
                        elif symbol_index > 0:
                            name = texts[symbol_index - 1]
                        elif len(texts) > symbol_index + 1:
                            name = texts[symbol_index + 1]
                    
                    # Chercher les valeurs numériques (prix et variations)
                    price = ""
                    change_24h = ""
                    change_30d = ""
                    ytd = ""
                    
                    # Parcourir les textes pour trouver les motifs correspondants
                    for text in texts:
                        # Prix (format monétaire)
                        if (re.search(r'[$€]\s*[\d,.]+', text) or re.search(r'[\d,.]+\s*[$€]', text)) and not price:
                            price = text
                        # Variations (pourcentage avec signe + ou -)
                        elif '%' in text and ('+' in text or '-' in text):
                            if not change_24h:
                                change_24h = text
                            elif not change_30d:
                                change_30d = text
                            elif not ytd:
                                ytd = text
                    
                    # Si on a au moins un nom/symbole et un prix/variation, ajouter cette crypto
                    if (name or symbol) and (price or change_24h or change_30d or ytd):
                        crypto = {
                            "name": name or symbol,  # Utiliser le symbole comme nom si pas de nom
                            "symbol": symbol,
                            "last": price,
                            "change": change_24h,
                            "change30d": change_30d,
                            "ytd": ytd,
                            "volume": "",
                            "marketCap": ""
                        }
                        
                        # Vérifier si cette crypto n'est pas déjà dans la liste
                        if not any(c["symbol"] == symbol for c in cryptos):
                            cryptos.append(crypto)
                            if len(cryptos) <= 10:  # Déboguer les 10 premières
                                logger.info(f"Crypto trouvée par analyse visuelle: {name or symbol} ({symbol}) - Prix: {price}, 24h: {change_24h}, 30j: {change_30d}, YTD: {ytd}")
                
                except Exception as e:
                    logger.warning(f"Erreur lors de l'analyse visuelle d'un élément: {str(e)}")
                    continue
        
        logger.info(f"Nombre total de cryptomonnaies extraites: {len(cryptos)}")
        return cryptos
    
    except Exception as e:
        logger.error(f"Erreur lors de l'analyse HTML: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return []

def process_api_data(api_data):
    """Traite les données de l'API pour les adapter au format attendu"""
    processed_coins = []
    
    for coin in api_data:
        # Extraire le prix en EUR
        price = coin.get("quote", {}).get("EUR", {}).get("price")
        price_str = f"€{price:.2f}" if price else "-"
        
        # Extraire les variations
        var_24h = coin.get("quote", {}).get("EUR", {}).get("percent_change_24h")
        var_24h_str = f"{var_24h:+.2f}%" if var_24h is not None else "-"
        
        var_30d = coin.get("quote", {}).get("EUR", {}).get("percent_change_30d")
        var_30d_str = f"{var_30d:+.2f}%" if var_30d is not None else "-"
        
        # Calculer YTD (depuis le début de l'année)
        # L'API ne fournit pas directement cette valeur, nous utilisons les données sur 90 jours comme approximation
        var_ytd = coin.get("quote", {}).get("EUR", {}).get("percent_change_90d")
        var_ytd_str = f"{var_ytd:+.2f}%" if var_ytd is not None else "-"
        
        # Volume et Market Cap
        volume = coin.get("quote", {}).get("EUR", {}).get("volume_24h")
        volume_str = f"€{volume:,.0f}" if volume else "-"
        
        market_cap = coin.get("quote", {}).get("EUR", {}).get("market_cap")
        market_cap_str = f"€{market_cap:,.0f}" if market_cap else "-"
        
        # Créer l'objet cryptomonnaie
        processed_coin = {
            "name": coin.get("name", ""),
            "symbol": coin.get("symbol", ""),
            "last": price_str,
            "change": var_24h_str,
            "change30d": var_30d_str,
            "ytd": var_ytd_str,
            "volume": volume_str,
            "marketCap": market_cap_str
        }
        
        processed_coins.append(processed_coin)
    
    return processed_coins

def organize_by_letter(coins):
    """Organise les cryptomonnaies par lettre initiale"""
    by_letter = {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"}
    
    for coin in coins:
        # Déterminer la première lettre (en minuscule)
        first_letter = coin["name"][0].lower() if coin["name"] else "a"
        
        # Vérifier si la lettre est dans l'alphabet
        if first_letter in by_letter:
            by_letter[first_letter].append(coin)
        else:
            # Pour les caractères non alphabétiques, les mettre sous 'a'
            by_letter["a"].append(coin)
    
    return by_letter

def get_top_performers(coins, sort_field, reverse=True, limit=10):
    """Identifie les meilleures ou pires performances des cryptomonnaies"""
    def extract_value(coin):
        value = coin.get(sort_field, "0%")
        # Extraire la valeur numérique du pourcentage formaté
        if isinstance(value, str) and "%" in value:
            try:
                # Supprimer le symbole % et convertir en float
                value = value.replace("%", "").replace(",", ".")
                # Gestion du signe + explicite
                if "+" in value:
                    value = value.replace("+", "")
                return float(value)
            except:
                return 0
        return 0
    
    # Trier les cryptos selon le champ spécifié
    sorted_coins = sorted(coins, key=extract_value, reverse=reverse)
    
    # Prendre les premières selon la limite
    return sorted_coins[:limit]

def generate_crypto_json(all_coins, top100_coins=None):
    """Génère le fichier JSON final avec la structure attendue par l'interface"""
    # Si top100_coins n'est pas fourni, utiliser les 100 premières de all_coins
    if top100_coins is None:
        top100_coins = all_coins[:100] if len(all_coins) >= 100 else all_coins
    
    # Organiser par lettre
    all_by_letter = organize_by_letter(all_coins)
    top100_by_letter = organize_by_letter(top100_coins)
    
    # Créer la structure pour les top performers
    all_top_performers = {
        "daily": {
            "best": get_top_performers(all_coins, "change", True),
            "worst": get_top_performers(all_coins, "change", False)
        },
        "ytd": {
            "best": get_top_performers(all_coins, "ytd", True),
            "worst": get_top_performers(all_coins, "ytd", False)
        }
    }
    
    top100_top_performers = {
        "daily": {
            "best": get_top_performers(top100_coins, "change", True),
            "worst": get_top_performers(top100_coins, "change", False)
        },
        "ytd": {
            "best": get_top_performers(top100_coins, "ytd", True),
            "worst": get_top_performers(top100_coins, "ytd", False)
        }
    }
    
    # Horodatage actuel
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Créer la structure finale
    crypto_data = {
        "all": {
            "indices": all_by_letter,
            "top_performers": all_top_performers,
            "meta": {
                "source": "CoinMarketCap",
                "description": "Cryptomonnaies (données complètes)",
                "timestamp": timestamp,
                "count": len(all_coins)
            }
        },
        "top100": {
            "indices": top100_by_letter,
            "top_performers": top100_top_performers,
            "meta": {
                "source": "CoinMarketCap",
                "description": "Top 100 Cryptomonnaies par capitalisation",
                "timestamp": timestamp,
                "count": len(top100_coins)
            }
        }
    }
    
    return crypto_data

def save_data(data):
    """Sauvegarde les données dans le fichier JSON"""
    try:
        # Créer le dossier data s'il n'existe pas
        data_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)
        
        # Écrire le fichier JSON
        with open(CONFIG["output_path"], 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données sauvegardées dans {CONFIG['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de la sauvegarde des données: {str(e)}")
        return False

def create_demo_data():
    """Crée des données de démo en cas d'erreur avec l'API et le scraping"""
    logger.info("Création de données de démo pour les cryptomonnaies...")
    
    # Liste des cryptos de démo
    demo_cryptos = [
        {
            "name": "Bitcoin",
            "symbol": "BTC",
            "last": "€57,123.45",
            "change": "+1.23%",
            "change30d": "+15.67%",
            "ytd": "+42.56%",
            "volume": "€28.5B",
            "marketCap": "€1.1T"
        },
        {
            "name": "Ethereum",
            "symbol": "ETH",
            "last": "€3,245.67",
            "change": "+2.56%",
            "change30d": "+23.45%",
            "ytd": "+67.89%",
            "volume": "€12.3B",
            "marketCap": "€389.2B"
        },
        {
            "name": "Binance Coin",
            "symbol": "BNB",
            "last": "€523.45",
            "change": "-0.78%",
            "change30d": "+8.91%",
            "ytd": "+34.56%",
            "volume": "€2.1B",
            "marketCap": "€81.5B"
        },
        {
            "name": "Solana",
            "symbol": "SOL",
            "last": "€138.90",
            "change": "+4.32%",
            "change30d": "+45.67%",
            "ytd": "+123.45%",
            "volume": "€3.4B",
            "marketCap": "€55.6B"
        },
        {
            "name": "Cardano",
            "symbol": "ADA",
            "last": "€0.58",
            "change": "-1.23%",
            "change30d": "-5.67%",
            "ytd": "-12.34%",
            "volume": "€890M",
            "marketCap": "€20.5B"
        },
        {
            "name": "Avalanche",
            "symbol": "AVAX",
            "last": "€34.25",
            "change": "+3.45%",
            "change30d": "+18.90%",
            "ytd": "+56.78%",
            "volume": "€456M",
            "marketCap": "€12.3B"
        }
    ]
    
    return generate_crypto_json(demo_cryptos)

def main():
    """Point d'entrée principal du script"""
    try:
        logger.info("🚀 Démarrage du script d'extraction des données CoinMarketCap")
        
        # Tenter de récupérer les données via l'API si une clé est disponible
        api_data = []
        if CONFIG["api_key"]:
            api_data = fetch_crypto_data_via_api()
        
        # Si les données API sont disponibles, les traiter
        if api_data:
            logger.info("Utilisation des données de l'API CoinMarketCap")
            processed_api_data = process_api_data(api_data)
            crypto_data = generate_crypto_json(processed_api_data)
        else:
            # Sinon, tenter de récupérer les données via scraping
            logger.info("Tentative de récupération des données via scraping")
            all_coins = fetch_crypto_data_via_scraping("all")
            top100_coins = fetch_crypto_data_via_scraping("top100") if len(all_coins) < 100 else all_coins[:100]
            
            # Si le scraping réussit, générer les données
            if all_coins:
                crypto_data = generate_crypto_json(all_coins, top100_coins)
            else:
                # En dernier recours, utiliser des données de démo
                logger.warning("❌ Échec de récupération des données, utilisation de données de démo")
                crypto_data = create_demo_data()
        
        # Sauvegarder les données
        if save_data(crypto_data):
            logger.info("✅ Script terminé avec succès")
            sys.exit(0)
        else:
            logger.error("❌ Échec lors de la sauvegarde des données")
            sys.exit(1)
    
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()
