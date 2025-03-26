#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données des cryptomonnaies depuis CoinMarketCap
avec fallback sur CoinGecko en cas d'échec
Produit un fichier crypto_lists.json avec une structure de données optimisée
"""

import os
import json
import sys
import requests
import logging
from datetime import datetime, timezone
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
    "scraping_urls": {
        "all": "https://coinmarketcap.com/",
        "top100": "https://coinmarketcap.com/"
    },
    "coingecko_urls": {
        "all": "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d",
        "top100": "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d"
    },
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "crypto_lists.json"),
    "user_agents": [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
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
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    }
    
    return headers

def fetch_crypto_data_via_coingecko(market="all"):
    """Récupère les données via l'API CoinGecko"""
    logger.info(f"Récupération des données via API CoinGecko ({market})...")
    
    url = CONFIG["coingecko_urls"][market]
    all_cryptos = []
    
    try:
        for attempt in range(CONFIG["retries"]):
            try:
                response = requests.get(
                    url,
                    headers=get_headers(),
                    timeout=30
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Transformer les données au format attendu
                    for coin in data:
                        crypto = {
                            "name": coin.get("name", ""),
                            "symbol": coin.get("symbol", "").upper(),
                            "last": f"${coin.get('current_price', 0)}",
                            "change": f"{coin.get('price_change_percentage_24h', 0)}%",
                            "1h": f"{coin.get('price_change_percentage_1h_in_currency', 0)}%",
                            "7d": f"{coin.get('price_change_percentage_7d_in_currency', 0)}%",
                            "change30d": "",  # Non disponible
                            "ytd": f"{coin.get('price_change_percentage_7d_in_currency', 0)}%",
                            "volume": f"${coin.get('total_volume', 0)}",
                            "marketCap": f"${coin.get('market_cap', 0)}",
                            "rank": str(coin.get("market_cap_rank", ""))
                        }
                        all_cryptos.append(crypto)
                    
                    logger.info(f"✅ Récupéré {len(all_cryptos)} cryptomonnaies de CoinGecko")
                    break
                    
                elif response.status_code == 429:
                    logger.warning("Rate limiting détecté sur CoinGecko, attente avant nouvelle tentative...")
                    time.sleep(60)  # Attendre 1 minute
                else:
                    logger.error(f"Erreur HTTP {response.status_code} depuis CoinGecko")
                    time.sleep(CONFIG["sleep_time"])
                    
            except Exception as e:
                logger.error(f"Erreur lors de la requête à CoinGecko: {str(e)}")
                if attempt < CONFIG["retries"] - 1:
                    time.sleep(CONFIG["sleep_time"] * 2)
                    
        return all_cryptos
        
    except Exception as e:
        logger.error(f"Erreur générale avec CoinGecko: {str(e)}")
        return []

def parse_coinmarketcap_page(html_content):
    """Analyse le contenu HTML de CoinMarketCap pour extraire les données des cryptomonnaies"""
    cryptos = []
    
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Trouver la table des cryptomonnaies - recherche plus générique
        table = soup.select_one('table')
        if not table:
            logger.error("Aucune table trouvée dans la page")
            return []
        
        # Parcourir chaque ligne du tableau
        rows = table.select('tbody tr')
        logger.info(f"Nombre de lignes trouvées: {len(rows)}")
        
        for row in rows:
            try:
                # Extraire les données de base
                cells = row.select('td')
                
                # Adaptation à la nouvelle structure avec moins de cellules
                if len(cells) < 5:  # Nouveau minimum requis
                    logger.warning(f"Pas assez de cellules: {len(cells)}")
                    continue
                
                # Extraire le rang (première cellule)
                rank = cells[0].get_text(strip=True) if len(cells) > 0 else ""
                
                # Extraire le nom et le symbole
                # Nouvelle structure: la 2ème cellule (index 1) contient le nom et symbole
                name_cell = cells[1] if len(cells) > 1 else None
                if not name_cell:
                    continue
                
                # Trouver les bons sélecteurs pour la nouvelle structure
                # Vérifier tous les éléments pour trouver celui avec le nom et symbole
                name = ""
                symbol = ""
                
                # Chercher n'importe quel élément contenant le nom
                name_elements = name_cell.select('p, span, div')
                
                # Logique pour déterminer lequel est le nom et lequel est le symbole
                if len(name_elements) >= 2:
                    name = name_elements[0].get_text(strip=True)
                    symbol = name_elements[1].get_text(strip=True)
                elif len(name_elements) == 1:
                    # Si un seul élément, essayer de séparer le texte
                    text = name_elements[0].get_text(strip=True)
                    parts = text.split()
                    if len(parts) > 1:
                        name = parts[0]
                        symbol = parts[-1]
                    else:
                        name = text
                else:
                    # Fallback: prendre tout le texte
                    full_text = name_cell.get_text(strip=True)
                    parts = full_text.split()
                    if len(parts) > 1:
                        name = parts[0]
                        symbol = parts[-1]
                    else:
                        name = full_text
                
                # Prix (généralement 3ème cellule)
                price_cell = cells[2] if len(cells) > 2 else None
                price = price_cell.get_text(strip=True) if price_cell else ""
                
                # Variations (adaptation à la nouvelle structure)
                # Les positions peuvent varier, alors cherchons les % dans les cellules
                var_1h = ""
                var_24h = ""
                var_7d = ""
                
                # Parcourir les cellules restantes pour trouver les variations
                for i in range(3, len(cells)):
                    cell_text = cells[i].get_text(strip=True)
                    if "%" in cell_text:
                        if not var_24h:
                            var_24h = cell_text
                        elif not var_7d:
                            var_7d = cell_text
                        elif not var_1h:
                            var_1h = cell_text
                
                # Dernières cellules pour market cap et volume
                market_cap = ""
                volume = ""
                
                # Les deux dernières cellules sont probablement le volume et la market cap
                if len(cells) >= 6:
                    market_cap = cells[-2].get_text(strip=True)
                    volume = cells[-1].get_text(strip=True)
                elif len(cells) >= 5:
                    market_cap = cells[-1].get_text(strip=True)
                
                # Créer l'objet crypto avec structure compatible
                crypto = {
                    "name": name,
                    "symbol": symbol,
                    "last": price,
                    "change": var_24h,
                    "1h": var_1h,
                    "7d": var_7d,
                    "change30d": "",  # Non disponible
                    "ytd": var_7d,    # Utiliser 7d comme YTD
                    "volume": volume,
                    "marketCap": market_cap,
                    "rank": rank
                }
                
                cryptos.append(crypto)
                logger.debug(f"Crypto ajoutée: {name} ({symbol})")
                
            except Exception as e:
                logger.error(f"Erreur lors de l'analyse d'une ligne: {str(e)}")
                import traceback
                logger.debug(traceback.format_exc())
                continue
        
        return cryptos
        
    except Exception as e:
        logger.error(f"Erreur lors de l'analyse HTML: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return []

def fetch_crypto_data_via_scraping(market="all"):
    """Récupère les données en faisant du scraping sur CoinMarketCap"""
    logger.info(f"Récupération des données via web scraping ({market})...")
    
    url = CONFIG["scraping_urls"][market]
    all_cryptos = []
    
    try:
        # Pour le scraping, nous utilisons une seule page pour éviter la détection
        for attempt in range(CONFIG["retries"]):
            try:
                logger.info(f"Scraping de CoinMarketCap...")
                response = requests.get(
                    url,
                    headers=get_headers(),
                    timeout=30
                )
                
                if response.status_code == 200:
                    # Vérifier si nous avons été bloqués
                    if "Sorry, en ce moment vous ne pouvez pas accéder à ce site." in response.text or "cf-captcha-form" in response.text:
                        logger.warning("⚠️ Détection de bot possible sur CoinMarketCap, passer à CoinGecko")
                        return []
                        
                    cryptos = parse_coinmarketcap_page(response.text)
                    if not cryptos:
                        logger.warning(f"Aucune crypto trouvée sur CoinMarketCap")
                        break
                            
                    all_cryptos.extend(cryptos)
                    logger.info(f"✅ Récupérées: {len(cryptos)} cryptomonnaies")
                    
                    # Si c'est le top100, limiter aux 100 premiers
                    if market == "top100" and len(all_cryptos) > 100:
                        all_cryptos = all_cryptos[:100]
                        
                    break
                else:
                    logger.error(f"Erreur HTTP {response.status_code} pour CoinMarketCap")
                    time.sleep(CONFIG["sleep_time"])
            except Exception as e:
                logger.error(f"Erreur lors du scraping: {str(e)}")
                if attempt < CONFIG["retries"] - 1:
                    time.sleep(CONFIG["sleep_time"] * 2)
        
        logger.info(f"✅ Total: {len(all_cryptos)} cryptomonnaies récupérées par scraping")
        return all_cryptos
        
    except Exception as e:
        logger.error(f"Erreur générale lors du scraping: {str(e)}")
        return []

def main():
    """Point d'entrée principal du script"""
    try:
        logger.info("🚀 Démarrage du script d'extraction des données crypto")
        
        # Essayer d'abord avec scraping
        logger.info("Tentative avec CoinMarketCap")
        all_coins = fetch_crypto_data_via_scraping("all")
        
        # Si le scraping échoue, utiliser CoinGecko
        if not all_coins:
            logger.info("⚠️ Échec de CoinMarketCap, passage à CoinGecko")
            all_coins = fetch_crypto_data_via_coingecko("all")
            top100_coins = fetch_crypto_data_via_coingecko("top100") if len(all_coins) > 100 else all_coins[:100]
            
            # Mettre à jour les sources dans les métadonnées
            source_name = "CoinGecko API"
        else:
            # CoinMarketCap a fonctionné
            top100_coins = fetch_crypto_data_via_scraping("top100") if len(all_coins) > 100 else all_coins[:100]
            if not top100_coins:
                top100_coins = all_coins[:100] if len(all_coins) >= 100 else all_coins
            
            source_name = "CoinMarketCap"
        
        # Si aucune source n'a fonctionné, utiliser les données de démo
        if not all_coins:
            logger.warning("❌ Toutes les sources ont échoué, utilisation de données de démo")
            crypto_data = create_demo_data()
        else:
            # Générer les données JSON
            crypto_data = generate_crypto_json(all_coins, top100_coins)
            
            # Mettre à jour les sources
            crypto_data["all"]["meta"]["source"] = f"{source_name}"
            crypto_data["top100"]["meta"]["source"] = f"{source_name} (Top 100)"
        
        # Sauvegarder les données
        if save_data(crypto_data):
            logger.info(f"✅ Script terminé avec succès (source: {source_name})")
            sys.exit(0)
        else:
            logger.error("❌ Échec lors de la sauvegarde des données")
            sys.exit(1)
    
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
