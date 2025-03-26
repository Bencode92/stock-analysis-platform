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
        "all": "https://coinmarketcap.com/fr/?type=coins&tableRankBy=gainer_loser_7d&lang=fr&page=1",
        "top100": "https://coinmarketcap.com/fr/?type=coins&tableRankBy=gainer_loser_7d&lang=fr&page=1"
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
            # Récupérer plusieurs pages
            max_pages = 5  # Limiter à 500 cryptos (100 par page)
            for page in range(1, max_pages + 1):
                page_url = url.replace("page=1", f"page={page}")
                
                for attempt in range(CONFIG["retries"]):
                    try:
                        logger.info(f"Scraping de la page {page}...")
                        response = requests.get(
                            page_url,
                            headers=get_headers(),
                            timeout=30
                        )
                        
                        if response.status_code == 200:
                            cryptos = parse_coinmarketcap_page(response.text)
                            if not cryptos:
                                logger.warning(f"Aucune crypto trouvée sur la page {page}")
                                break
                                
                            all_cryptos.extend(cryptos)
                            logger.info(f"✅ Page {page} récupérée: {len(cryptos)} cryptomonnaies")
                            
                            # Respecter le rate limiting
                            time.sleep(CONFIG["sleep_time"])
                            break
                        else:
                            logger.error(f"Erreur HTTP {response.status_code} pour la page {page}")
                            time.sleep(CONFIG["sleep_time"])
                    except Exception as e:
                        logger.error(f"Erreur lors du scraping de la page {page}: {str(e)}")
                        if attempt < CONFIG["retries"] - 1:
                            time.sleep(CONFIG["sleep_time"] * 2)
        
        # Pour top 100 (juste la première page)
        else:
            for attempt in range(CONFIG["retries"]):
                try:
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
                        break
                    else:
                        logger.error(f"Erreur HTTP {response.status_code} pour le top 100")
                        time.sleep(CONFIG["sleep_time"])
                except Exception as e:
                    logger.error(f"Erreur lors du scraping du top 100: {str(e)}")
                    if attempt < CONFIG["retries"] - 1:
                        time.sleep(CONFIG["sleep_time"] * 2)
        
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
                
                # Extraire les en-têtes
                headers = []
                header_row = rows[0] if rows else None
                if header_row:
                    headers = [th.get_text(strip=True) for th in header_row.find_all(['th', 'td'])]
                    logger.info(f"En-têtes trouvés: {headers}")
                
                # Déterminer les indices des colonnes importantes
                name_idx = -1
                symbol_idx = -1
                price_idx = -1
                change_24h_idx = -1
                change_30d_idx = -1
                ytd_idx = -1
                volume_idx = -1
                market_cap_idx = -1
                
                # Trouver les positions des colonnes d'après leurs titres
                for j, header in enumerate(headers):
                    header_lower = header.lower()
                    if 'name' in header_lower or 'nom' in header_lower:
                        name_idx = j
                    elif 'symbol' in header_lower or 'symbole' in header_lower:
                        symbol_idx = j
                    elif 'price' in header_lower or 'prix' in header_lower:
                        price_idx = j
                    elif '24h' in header_lower and ('%' in header_lower or 'var' in header_lower or 'change' in header_lower):
                        change_24h_idx = j
                    elif '30' in header_lower and ('%' in header_lower or 'var' in header_lower or 'change' in header_lower):
                        change_30d_idx = j
                    elif 'ytd' in header_lower or 'jan' in header_lower or 'année' in header_lower:
                        ytd_idx = j
                    elif 'volume' in header_lower:
                        volume_idx = j
                    elif 'market' in header_lower or 'cap' in header_lower or 'capitalisation' in header_lower:
                        market_cap_idx = j
                
                # Si nom et symbole sont dans la même colonne
                if name_idx >= 0 and symbol_idx < 0:
                    symbol_idx = name_idx
                
                # Parcourir les lignes de données (sauter l'en-tête)
                for row in rows[1:]:
                    cells = row.find_all(['td', 'th'])
                    
                    # Vérifier qu'il y a assez de cellules
                    if len(cells) < 3:
                        continue
                    
                    try:
                        # Extraire les données de base
                        name = ""
                        symbol = ""
                        
                        # Obtenir nom et symbole
                        if name_idx >= 0 and name_idx < len(cells):
                            name_cell = cells[name_idx]
                            
                            # Essayer différentes approches pour extraire le nom
                            name_elements = name_cell.find_all(['p', 'div', 'span', 'a'])
                            
                            if name_elements:
                                # Si la cellule contient des éléments imbriqués
                                for element in name_elements:
                                    element_text = element.get_text(strip=True)
                                    if element_text and len(element_text) < 30:  # Ignorer textes trop longs
                                        if not name:
                                            name = element_text
                                        elif not symbol and len(element_text) <= 5:  # Symboles courts
                                            symbol = element_text
                            else:
                                # Sinon utiliser le texte complet de la cellule
                                name = name_cell.get_text(strip=True)
                        
                        # Si le nom et symbole sont dans des colonnes séparées
                        if symbol_idx >= 0 and symbol_idx != name_idx and symbol_idx < len(cells):
                            symbol = cells[symbol_idx].get_text(strip=True)
                        
                        # Si on n'a toujours pas de symbole mais qu'on a un nom
                        if not symbol and name:
                            # Chercher un format typique de symbole dans le nom (3-5 lettres majuscules)
                            matches = re.findall(r'\b[A-Z]{2,5}\b', name)
                            if matches:
                                symbol = matches[0]
                                # Retirer le symbole du nom
                                name = name.replace(symbol, "").strip()
                        
                        # Si le nom est vide, passer à la ligne suivante
                        if not name:
                            continue
                        
                        # Récupérer les autres valeurs en fonction des indices trouvés
                        price = cells[price_idx].get_text(strip=True) if price_idx >= 0 and price_idx < len(cells) else ""
                        change_24h = cells[change_24h_idx].get_text(strip=True) if change_24h_idx >= 0 and change_24h_idx < len(cells) else ""
                        change_30d = cells[change_30d_idx].get_text(strip=True) if change_30d_idx >= 0 and change_30d_idx < len(cells) else ""
                        ytd = cells[ytd_idx].get_text(strip=True) if ytd_idx >= 0 and ytd_idx < len(cells) else ""
                        volume = cells[volume_idx].get_text(strip=True) if volume_idx >= 0 and volume_idx < len(cells) else ""
                        market_cap = cells[market_cap_idx].get_text(strip=True) if market_cap_idx >= 0 and market_cap_idx < len(cells) else ""
                        
                        # Si les données semblent valides
                        if name and (price or change_24h):
                            crypto = {
                                "name": name,
                                "symbol": symbol,
                                "last": price,
                                "change": change_24h,
                                "change30d": change_30d,
                                "ytd": ytd,
                                "volume": volume,
                                "marketCap": market_cap,
                                "ath": ""  # Pas toujours disponible
                            }
                            
                            cryptos.append(crypto)
                    except Exception as e:
                        logger.warning(f"Erreur lors de l'analyse d'une ligne: {str(e)}")
                        continue
                
                # Si on a trouvé des cryptos, pas besoin de continuer
                if cryptos:
                    logger.info(f"✅ {len(cryptos)} cryptomonnaies trouvées dans le tableau #{i+1}")
                    break
            
        # MÉTHODE 2: Recherche de données via des sélecteurs spécifiques
        if not cryptos:
            logger.info("Tentative d'extraction avec sélecteurs spécifiques...")
            
            # Rechercher les éléments qui contiennent des crypto par classes ou attributs spécifiques
            # Ces sélecteurs changent souvent, mais essayons quelques possibilités
            crypto_rows = soup.select('tbody tr')
            
            for row in crypto_rows:
                try:
                    # Extraction des cellules
                    cells = row.find_all(['td'])
                    
                    if len(cells) < 3:  # Minimum de cellules nécessaires
                        continue
                    
                    # Tenter d'extraire nom et symbole des premières cellules
                    name = ""
                    symbol = ""
                    
                    # Explorer les 2-3 premières cellules pour nom/symbole
                    for i in range(min(3, len(cells))):
                        cell_text = cells[i].get_text(strip=True)
                        
                        # Rechercher un symbole typique (lettres majuscules)
                        symbol_matches = re.findall(r'\b[A-Z]{2,5}\b', cell_text)
                        if symbol_matches and not symbol:
                            symbol = symbol_matches[0]
                            
                        # Si la cellule contient peu de texte, c'est probablement un nom/symbole
                        if len(cell_text) < 30 and not name:
                            name = cell_text.replace(symbol, "").strip()
                    
                    # Extraire les données financières des autres cellules
                    price = ""
                    change_24h = ""
                    volume = ""
                    market_cap = ""
                    
                    for i, cell in enumerate(cells):
                        text = cell.get_text(strip=True)
                        
                        # Détecter prix (habituellement chiffres avec $ ou €)
                        if (re.search(r'[$€]\s*[\d,.]+', text) or re.search(r'[\d,.]+\s*[$€]', text)) and not price:
                            price = text
                        
                        # Détecter variation (pourcentage avec + ou -)
                        elif '%' in text and ('+' in text or '-' in text) and not change_24h:
                            change_24h = text
                        
                        # Détecter volume (chiffres avec B, M, K)
                        elif any(x in text for x in ['B', 'M', 'K', 'G']) and ('+' not in text and '-' not in text) and not volume:
                            volume = text
                        
                        # Détecter cap. marché (chiffres avec B, T)
                        elif any(x in text for x in ['B', 'T']) and not market_cap and i > 3:
                            market_cap = text
                    
                    # Si on a trouvé des données minimales
                    if name and (price or change_24h):
                        crypto = {
                            "name": name,
                            "symbol": symbol,
                            "last": price,
                            "change": change_24h,
                            "change30d": "",
                            "ytd": "",
                            "volume": volume,
                            "marketCap": market_cap,
                            "ath": ""
                        }
                        
                        cryptos.append(crypto)
                except Exception as e:
                    logger.warning(f"Erreur lors de l'extraction par sélecteurs: {str(e)}")
                    continue
                    
        # MÉTHODE 3: Recherche par analyse visuelle du HTML
        if not cryptos:
            logger.info("Tentative d'extraction par recherche visuelle...")
            
            # Rechercher les divs qui pourraient contenir une liste de cryptos
            potential_containers = soup.find_all(['div', 'section', 'table'], class_=lambda c: c and ('table' in c.lower() or 'list' in c.lower() or 'grid' in c.lower()))
            
            for container in potential_containers:
                # Rechercher tous les éléments avec des textes ressemblant à des symboles crypto
                crypto_elements = container.find_all(string=re.compile(r'\b[A-Z]{2,5}\b'))
                
                if len(crypto_elements) > 5:  # Si on trouve au moins 5 potentiels symboles
                    logger.info(f"Trouvé un conteneur avec {len(crypto_elements)} symboles potentiels")
                    
                    # Pour chaque élément de texte trouvé, essayer d'extraire des infos
                    for element in crypto_elements:
                        try:
                            parent = element.parent
                            if not parent:
                                continue
                                
                            # Trouver le "bloc" parent (tr, div, etc)
                            block = parent
                            for _ in range(3):  # Remonter jusqu'à 3 niveaux
                                if block and block.name in ['tr', 'div', 'li', 'article']:
                                    break
                                block = block.parent if block.parent else None
                            
                            if not block:
                                continue
                                
                            # Extraire le texte de tous les éléments enfants
                            all_text = [t.get_text(strip=True) for t in block.find_all(['div', 'span', 'td', 'p']) if t.get_text(strip=True)]
                            
                            # Chercher des motifs dans le texte
                            name = ""
                            symbol = ""
                            price = ""
                            change = ""
                            
                            # Trouver le symbole (3-5 lettres majuscules)
                            for text in all_text:
                                matches = re.findall(r'\b[A-Z]{2,5}\b', text)
                                if matches:
                                    symbol = matches[0]
                                    # Si le texte contient juste le symbole ou presque, c'est probablement le nom aussi
                                    if len(text) < 10:
                                        name = text
                                    break
                            
                            # Trouver le prix (format monétaire)
                            for text in all_text:
                                if re.search(r'[$€]\s*[\d,.]+', text) or re.search(r'[\d,.]+\s*[$€]', text):
                                    price = text
                                    break
                            
                            # Trouver la variation (pourcentage)
                            for text in all_text:
                                if '%' in text and ('+' in text or '-' in text):
                                    change = text
                                    break
                            
                            # Si on a trouvé des données cohérentes
                            if symbol and (price or change):
                                # Chercher un nom si on n'en a pas
                                if not name:
                                    for text in all_text:
                                        if symbol not in text and len(text) < 30:
                                            name = text
                                            break
                                
                                crypto = {
                                    "name": name or "Unknown",
                                    "symbol": symbol,
                                    "last": price,
                                    "change": change,
                                    "change30d": "",
                                    "ytd": "",
                                    "volume": "",
                                    "marketCap": "",
                                    "ath": ""
                                }
                                
                                # Vérifier si cette crypto n'est pas déjà dans la liste
                                if not any(c["symbol"] == symbol for c in cryptos):
                                    cryptos.append(crypto)
                        except Exception as e:
                            logger.warning(f"Erreur lors de l'analyse visuelle: {str(e)}")
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
