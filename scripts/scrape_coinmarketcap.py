#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données de cryptomonnaies depuis CoinMarketCap
URL cible: 
- https://coinmarketcap.com/ (page principale)
Avec pagination jusqu'à 40 pages
Filtre: Volume 24h > 50 millions de dollars
"""

import os
import json
import sys
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup
import logging
import time
import re
import random

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "main_url": "https://coinmarketcap.com/",
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "crypto_lists.json"),
    "timeout": 30,  # Timeout en secondes
    "max_pages": 40,  # Maximum de pages à scraper (couvre les 32 pages)
    "delay_between_pages": 2,  # Délai entre les pages (secondes)
    "categories": {
        "main": [],          # Page principale de CoinMarketCap
        "top_gainers_24h": [],
        "top_losers_24h": []
    },
    "min_volume_24h": 50000000,  # Volume minimum en dollars (50 millions)
    "max_coins_per_category": 5000  # Valeur élevée pour récupérer toutes les cryptos
}

# Structure pour les données
CRYPTO_DATA = {
    "categories": {
        "main": [],          # Page principale de CoinMarketCap
        "top_gainers_24h": [],
        "top_losers_24h": []
    },
    "most_visited": [],
    "all_coins": [],  # Pour stocker toutes les cryptos récupérées
    "meta": {
        "sources": ["CoinMarketCap"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "pages_scraped": 0,
        "volume_filter": f"${CONFIG['min_volume_24h']/1000000}M+",
        "lastUpdated": datetime.now(timezone.utc).isoformat()
    }
}

def get_headers():
    """Crée des en-têtes HTTP aléatoires pour éviter la détection de bot"""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
    ]
    
    return {
        "User-Agent": random.choice(user_agents),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
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

def extract_coin_data_api():
    """Extrait les données en utilisant l'API CoinMarketCap (version gratuite) avec pagination"""
    try:
        logger.info("Tentative d'extraction via l'API CoinMarketCap avec pagination...")
        
        all_coins = []
        total_pages_scraped = 0
        
        # Explorer jusqu'à max_pages
        for page in range(1, CONFIG["max_pages"] + 1):
            try:
                # URL de l'API CoinMarketCap (endpoint gratuit avec limite)
                api_url = "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing"
                params = {
                    "start": (page - 1) * 100 + 1,  # Offset pour la pagination
                    "limit": 100,
                    "sortBy": "market_cap",
                    "sortType": "desc",
                    "convert": "USD",
                    "cryptoType": "all",
                    "tagType": "all"
                }
                
                logger.info(f"Extraction de la page {page}...")
                headers = get_headers()
                response = requests.get(api_url, params=params, headers=headers, timeout=CONFIG["timeout"])
                
                if response.status_code != 200:
                    logger.warning(f"Erreur API page {page}: {response.status_code} - {response.reason}")
                    continue
                
                try:
                    data = response.json()
                    if "data" not in data or "cryptoCurrencyList" not in data["data"]:
                        logger.warning(f"Format de réponse API inattendu pour la page {page}")
                        continue
                    
                    crypto_list = data["data"]["cryptoCurrencyList"]
                    
                    # Si aucune crypto n'est retournée, on a atteint la fin des résultats
                    if not crypto_list:
                        logger.info(f"Fin des résultats atteinte à la page {page}")
                        break
                    
                    for crypto in crypto_list:
                        try:
                            # Extraire les données de base
                            name = crypto.get("name", "")
                            symbol = crypto.get("symbol", "")
                            rank = crypto.get("rank", 0)
                            
                            # Extraire les données de prix (USD)
                            quotes = crypto.get("quotes", [])
                            usd_data = next((q for q in quotes if q.get("name") == "USD"), None)
                            
                            if not usd_data:
                                continue
                            
                            price = usd_data.get("price", 0)
                            percent_change_1h = usd_data.get("percentChange1h", 0)
                            percent_change_24h = usd_data.get("percentChange24h", 0)
                            percent_change_7d = usd_data.get("percentChange7d", 0)
                            market_cap = usd_data.get("marketCap", 0)
                            volume_24h = usd_data.get("volume24h", 0)
                            
                            # Filtrer par volume (minimum 50 millions $)
                            if volume_24h < CONFIG["min_volume_24h"]:
                                continue
                            
                            # Préparer l'affichage
                            price_str = f"${price:.6f}" if price < 1 else f"${price:.2f}"
                            market_cap_str = f"${market_cap:,.0f}"
                            volume_str = f"${volume_24h:,.0f}"
                            
                            change_1h_str = f"{'+' if percent_change_1h > 0 else ''}{percent_change_1h:.2f}%"
                            change_24h_str = f"{'+' if percent_change_24h > 0 else ''}{percent_change_24h:.2f}%"
                            change_7d_str = f"{'+' if percent_change_7d > 0 else ''}{percent_change_7d:.2f}%"
                            
                            # Déterminer les tendances
                            trend_24h = "up" if percent_change_24h > 0 else "down"
                            trend_7d = "up" if percent_change_7d > 0 else "down"
                            
                            # Logo URL
                            logo_url = crypto.get("logo", "")
                            
                            # Créer l'objet crypto
                            coin = {
                                "rank": str(rank),
                                "name": name,
                                "symbol": symbol,
                                "logo": logo_url,
                                "price": price_str,
                                "change_1h": change_1h_str,
                                "change_24h": change_24h_str,
                                "change_7d": change_7d_str,
                                "market_cap": market_cap_str,
                                "volume_24h": volume_str,
                                "volume_24h_raw": volume_24h,  # Valeur brute pour le tri
                                "trend_24h": trend_24h,
                                "trend_7d": trend_7d,
                                # Ajouter les valeurs numériques pour le tri
                                "_change_24h_value": percent_change_24h,
                                "_change_7d_value": percent_change_7d
                            }
                            
                            all_coins.append(coin)
                            
                        except Exception as e:
                            logger.error(f"Erreur lors du traitement d'une crypto: {str(e)}")
                            continue
                    
                    total_pages_scraped += 1
                    logger.info(f"Page {page} extraite avec succès: {len(crypto_list)} cryptos")
                    
                    # Attendre entre les requêtes pour éviter de surcharger l'API
                    time.sleep(CONFIG["delay_between_pages"])
                    
                except ValueError as e:
                    logger.error(f"Erreur JSON page {page}: {str(e)}")
                    continue
                
            except Exception as e:
                logger.error(f"Erreur lors de l'extraction de la page {page}: {str(e)}")
                continue
        
        # Filtrer les cryptos avec volume > 50M$ (seconde vérification)
        filtered_coins = [
            coin for coin in all_coins 
            if coin.get("volume_24h_raw", 0) >= CONFIG["min_volume_24h"]
        ]
        
        logger.info(f"Extraction API terminée. {total_pages_scraped} pages extraites.")
        logger.info(f"Coins avec volume > {CONFIG['min_volume_24h']/1000000}M$: {len(filtered_coins)}/{len(all_coins)}")
        
        CRYPTO_DATA["meta"]["pages_scraped"] = total_pages_scraped
        return filtered_coins
    
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction via API: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return []

def extract_coin_data_html():
    """Tentative d'extraction via le HTML (fallback) avec pagination"""
    try:
        logger.info("Tentative d'extraction via le HTML avec pagination...")
        
        all_coins = []
        total_pages_scraped = 0
        
        # Explorer jusqu'à max_pages
        for page in range(1, CONFIG["max_pages"] + 1):
            try:
                # URL avec pagination
                url = f"{CONFIG['main_url']}?page={page}"
                logger.info(f"Extraction de la page {page}: {url}")
                
                headers = get_headers()
                response = requests.get(url, headers=headers, timeout=CONFIG["timeout"])
                
                if response.status_code != 200:
                    logger.warning(f"Erreur HTTP page {page}: {response.status_code}")
                    continue
                
                html = response.text
                
                # Générer un fichier HTML de débogage pour la première page
                if page == 1:
                    debug_dir = os.path.dirname(CONFIG["output_path"])
                    if not os.path.exists(debug_dir):
                        os.makedirs(debug_dir, exist_ok=True)
                    debug_file_path = os.path.join(debug_dir, "debug_coinmarketcap.html")
                    with open(debug_file_path, 'w', encoding='utf-8') as f:
                        f.write(html)
                    logger.info(f"HTML de la page 1 sauvegardé pour débogage dans {debug_file_path}")
                
                # Tenter de trouver des données dans le HTML
                soup = BeautifulSoup(html, 'html.parser')
                
                # Rechercher les balises script qui contiennent potentiellement les données JSON
                scripts = soup.find_all('script')
                page_coins = []
                
                for script in scripts:
                    script_text = script.string
                    if not script_text:
                        continue
                    
                    # Rechercher des données JSON qui ressemblent à des données de cryptocurrencies
                    if 'cryptoCurrencyList' in script_text:
                        try:
                            # Extraire le JSON à partir du script
                            start_index = script_text.find('{')
                            end_index = script_text.rfind('}') + 1
                            
                            if start_index < 0 or end_index <= 0:
                                continue
                            
                            json_str = script_text[start_index:end_index]
                            data = json.loads(json_str)
                            
                            # Trouver les données de crypto dans l'objet JSON
                            if 'data' in data and 'cryptoCurrencyList' in data['data']:
                                crypto_list = data['data']['cryptoCurrencyList']
                                
                                # Si la liste est vide, c'est probablement la fin des résultats
                                if not crypto_list:
                                    logger.info(f"Fin des résultats atteinte à la page {page} (liste vide)")
                                    break
                                
                                for crypto in crypto_list:
                                    try:
                                        name = crypto.get('name', '')
                                        symbol = crypto.get('symbol', '')
                                        rank = crypto.get('rank', 0)
                                        
                                        # Extraire les données de prix
                                        quotes = crypto.get('quotes', [])
                                        usd_data = next((q for q in quotes if q.get('name') == 'USD'), None)
                                        
                                        if not usd_data:
                                            continue
                                        
                                        price = usd_data.get('price', 0)
                                        percent_change_1h = usd_data.get('percentChange1h', 0)
                                        percent_change_24h = usd_data.get('percentChange24h', 0)
                                        percent_change_7d = usd_data.get('percentChange7d', 0)
                                        market_cap = usd_data.get('marketCap', 0)
                                        volume_24h = usd_data.get('volume24h', 0)
                                        
                                        # Filtrer par volume (minimum 50 millions $)
                                        if volume_24h < CONFIG["min_volume_24h"]:
                                            continue
                                        
                                        # Préparer l'affichage
                                        price_str = f"${price:.6f}" if price < 1 else f"${price:.2f}"
                                        market_cap_str = f"${market_cap:,.0f}"
                                        volume_str = f"${volume_24h:,.0f}"
                                        
                                        change_1h_str = f"{'+' if percent_change_1h > 0 else ''}{percent_change_1h:.2f}%"
                                        change_24h_str = f"{'+' if percent_change_24h > 0 else ''}{percent_change_24h:.2f}%"
                                        change_7d_str = f"{'+' if percent_change_7d > 0 else ''}{percent_change_7d:.2f}%"
                                        
                                        # Déterminer les tendances
                                        trend_24h = "up" if percent_change_24h > 0 else "down"
                                        trend_7d = "up" if percent_change_7d > 0 else "down"
                                        
                                        # Logo URL
                                        logo_url = crypto.get('logo', '')
                                        
                                        # Créer l'objet crypto
                                        coin = {
                                            "rank": str(rank),
                                            "name": name,
                                            "symbol": symbol,
                                            "logo": logo_url,
                                            "price": price_str,
                                            "change_1h": change_1h_str,
                                            "change_24h": change_24h_str,
                                            "change_7d": change_7d_str,
                                            "market_cap": market_cap_str,
                                            "volume_24h": volume_str,
                                            "volume_24h_raw": volume_24h,  # Valeur brute pour le tri
                                            "trend_24h": trend_24h,
                                            "trend_7d": trend_7d,
                                            # Ajouter les valeurs numériques pour le tri
                                            "_change_24h_value": percent_change_24h,
                                            "_change_7d_value": percent_change_7d
                                        }
                                        
                                        page_coins.append(coin)
                                        
                                    except Exception as e:
                                        logger.error(f"Erreur lors du traitement d'une crypto: {str(e)}")
                                        continue
                                
                                # Si on a trouvé des données, sortir de la boucle des scripts
                                if page_coins:
                                    break
                        except Exception as e:
                            logger.warning(f"Erreur lors du parsing JSON: {str(e)}")
                            continue
                
                # Si on n'a pas trouvé de cryptos dans cette page, c'est peut-être la fin des résultats
                if not page_coins:
                    logger.info(f"Aucune crypto trouvée à la page {page}, arrêt du scraping")
                    break
                
                # Ajouter les cryptos de cette page au total
                all_coins.extend(page_coins)
                total_pages_scraped += 1
                logger.info(f"Page {page} extraite avec succès: {len(page_coins)} cryptos")
                
                # Attendre entre les requêtes pour éviter de surcharger le serveur
                time.sleep(CONFIG["delay_between_pages"])
                
            except Exception as e:
                logger.error(f"Erreur lors de l'extraction de la page {page}: {str(e)}")
                continue
        
        # Filtrer les cryptos avec volume > 50M$ (seconde vérification)
        filtered_coins = [
            coin for coin in all_coins 
            if coin.get("volume_24h_raw", 0) >= CONFIG["min_volume_24h"]
        ]
        
        logger.info(f"Extraction HTML terminée. {total_pages_scraped} pages extraites.")
        logger.info(f"Coins avec volume > {CONFIG['min_volume_24h']/1000000}M$: {len(filtered_coins)}/{len(all_coins)}")
        
        CRYPTO_DATA["meta"]["pages_scraped"] = total_pages_scraped
        return filtered_coins
    
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction via HTML: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return []

def categorize_coins(coins):
    """Catégorise les cryptos en fonction des données de la page principale"""
    # Réinitialiser les catégories
    for category in CRYPTO_DATA["categories"]:
        CRYPTO_DATA["categories"][category] = []
    
    # Si pas de coins, sortir
    if not coins:
        logger.warning("Aucune crypto à catégoriser")
        return
    
    # Enregistrer toutes les cryptos pour la catégorie principale
    CRYPTO_DATA["categories"]["main"] = [
        {k: v for k, v in coin.items() if not k.startswith('_') and not k == "volume_24h_raw"}
        for coin in coins
    ]
    logger.info(f"Ajouté {len(coins)} cryptos à la catégorie 'main'")
    
    # Enregistrer toutes les cryptos (sans les propriétés internes _)
    CRYPTO_DATA["all_coins"] = [
        {k: v for k, v in coin.items() if not k.startswith('_') and not k == "volume_24h_raw"} 
        for coin in coins
    ]
    
    # === CATÉGORIES 24H (SECONDAIRES) ===
    
    # Top gainers 24h (premiers éléments)
    sorted_24h_gainers = sorted(coins, key=lambda x: x.get("_change_24h_value", 0), reverse=True)
    top_gainers_24h = [
        {k: v for k, v in coin.items() if not k.startswith('_') and not k == "volume_24h_raw"} 
        for coin in sorted_24h_gainers
        if coin.get("_change_24h_value", 0) > 0
    ]
    CRYPTO_DATA["categories"]["top_gainers_24h"] = top_gainers_24h
    
    # Top losers 24h (derniers éléments)
    sorted_24h_losers = sorted(coins, key=lambda x: x.get("_change_24h_value", 0))
    top_losers_24h = [
        {k: v for k, v in coin.items() if not k.startswith('_') and not k == "volume_24h_raw"} 
        for coin in sorted_24h_losers
        if coin.get("_change_24h_value", 0) < 0
    ]
    CRYPTO_DATA["categories"]["top_losers_24h"] = top_losers_24h
    
    # Ajouter les 10 premières cryptos aux most_visited
    CRYPTO_DATA["most_visited"] = [
        {k: v for k, v in coin.items() if not k.startswith('_') and not k == "volume_24h_raw"}
        for coin in coins[:10]
    ]
    
    # Mettre à jour le compteur
    CRYPTO_DATA["meta"]["count"] = len(CRYPTO_DATA["all_coins"])
    
    logger.info(f"Catégorisation terminée: "
                f"{len(CRYPTO_DATA['categories']['main'])} main, "
                f"{len(top_gainers_24h)} gainers 24h, "
                f"{len(top_losers_24h)} losers 24h, "
                f"{len(CRYPTO_DATA['all_coins'])} total")

def scrape_crypto_data():
    """Récupère et traite les données des cryptomonnaies"""
    try:
        logger.info("Démarrage de l'extraction des données de CoinMarketCap...")
        
        # Extraction des données de la page principale
        main_coins = extract_coin_data_api()
        
        # Si l'API échoue, essayer l'extraction HTML
        if not main_coins:
            logger.info("L'extraction via API a échoué, tentative via HTML...")
            main_coins = extract_coin_data_html()
        
        if not main_coins:
            logger.error("Aucune donnée extraite.")
            return False
        
        logger.info(f"{len(main_coins)} cryptomonnaies extraites avec succès.")
        
        # Catégoriser les coins
        categorize_coins(main_coins)
        
        # Mettre à jour l'horodatage
        CRYPTO_DATA["meta"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
        
        return True
    
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des données: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def save_crypto_data():
    """Enregistre les données des cryptomonnaies dans un fichier JSON"""
    try:
        # Créer le dossier data s'il n'existe pas
        data_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)
        
        # Écrire le fichier JSON
        with open(CONFIG["output_path"], 'w', encoding='utf-8') as f:
            json.dump(CRYPTO_DATA, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données des cryptomonnaies enregistrées dans {CONFIG['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
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
    """Point d'entrée principal du script"""
    try:
        logger.info("🚀 Démarrage du script de scraping de CoinMarketCap")
        logger.info(f"Configuration: {CONFIG['max_pages']} pages max, {CONFIG['delay_between_pages']}s entre les pages")
        logger.info(f"URL cible: {CONFIG['main_url']}")
        logger.info(f"Filtre: Volume 24h > ${CONFIG['min_volume_24h']/1000000}M")
        
        # Vérifier si les données existent déjà
        has_existing_data = check_existing_data()
        
        # Récupérer les données
        success = scrape_crypto_data()
        
        # Si l'extraction échoue mais qu'on a des données existantes, conserver le fichier
        if not success and has_existing_data:
            logger.info("⚠️ Utilisation des données existantes car le scraping a échoué")
            sys.exit(0)  # Sortie sans erreur pour ne pas faire échouer le workflow
        elif not success and not has_existing_data:
            logger.error("❌ Aucune donnée existante et échec du scraping")
            sys.exit(1)  # Sortie avec erreur car on n'a pas de données
        else:
            # Enregistrer les données
            if save_crypto_data():
                logger.info("✅ Traitement des données terminé avec succès")
                sys.exit(0)
            else:
                logger.error("❌ Échec lors de l'enregistrement des données")
                sys.exit(1)
            
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
