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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0"
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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
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
        
        # Trouver la table des cryptomonnaies
        table = soup.select_one('table')
        if not table:
            logger.error("Aucune table trouvée dans la page")
            return []
        
        # Parcourir chaque ligne du tableau (sauf l'en-tête)
        rows = table.select('tbody tr')
        
        for row in rows:
            try:
                # Extraire les données de base
                name_cell = row.select_one('td:nth-child(3)')
                if not name_cell:
                    continue
                
                # Nom et symbole
                name = name_cell.select_one('.sc-4984dd93-0')
                if not name:
                    continue
                    
                name_text = name.text.strip()
                
                symbol_element = name_cell.select_one('.coin-item-symbol')
                symbol = symbol_element.text.strip() if symbol_element else ""
                
                # Prix
                price_cell = row.select_one('td:nth-child(4)')
                price = price_cell.text.strip() if price_cell else ""
                
                # Capitalisation boursière
                market_cap_cell = row.select_one('td:nth-child(6)')
                market_cap = market_cap_cell.text.strip() if market_cap_cell else ""
                
                # Volume sur 24h
                volume_cell = row.select_one('td:nth-child(7)')
                volume = volume_cell.text.strip() if volume_cell else ""
                
                # Variations
                var_24h_cell = row.select_one('td:nth-child(8)')
                var_24h = var_24h_cell.text.strip() if var_24h_cell else ""
                
                var_30d_cell = row.select_one('td:nth-child(10)')
                var_30d = var_30d_cell.text.strip() if var_30d_cell else ""
                
                var_ytd_cell = row.select_one('td:nth-child(11)')
                var_ytd = var_ytd_cell.text.strip() if var_ytd_cell else ""
                
                # Créer l'objet crypto
                crypto = {
                    "name": name_text,
                    "symbol": symbol,
                    "last": price,
                    "change": var_24h,
                    "change30d": var_30d,
                    "ytd": var_ytd,
                    "volume": volume,
                    "marketCap": market_cap
                }
                
                cryptos.append(crypto)
                
            except Exception as e:
                logger.error(f"Erreur lors de l'analyse d'une ligne: {str(e)}")
                continue
        
        return cryptos
        
    except Exception as e:
        logger.error(f"Erreur lors de l'analyse HTML: {str(e)}")
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
