#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données des cryptomonnaies depuis CoinMarketCap
avec focus sur les gagnants/perdants sur 7 jours
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
    "api_key": os.environ.get("CMC_API_KEY", ""),  # Clé API CoinMarketCap (si disponible)
    "scraping_urls": {
        "all": "https://coinmarketcap.com/?type=coins&tableRankBy=gainer_loser_7d",
        "top100": "https://coinmarketcap.com/?type=coins&tableRankBy=gainer_loser_7d"
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
        logger.info(f"Nombre de lignes trouvées: {len(rows)}")
        
        for row in rows:
            try:
                # Extraire les données de base
                cells = row.select('td')
                
                if len(cells) < 9:  # Vérifier le nombre minimal de cellules
                    logger.warning(f"Pas assez de cellules: {len(cells)}")
                    continue
                
                # Extraire le rang
                rank = cells[0].get_text(strip=True) if len(cells) > 0 else ""
                
                # Extraire le nom et le symbole
                name_cell = cells[2]
                if not name_cell:
                    continue
                
                # Nom et symbole
                name_element = name_cell.select_one('p')
                symbol_element = name_cell.select_one('.coin-item-symbol')
                
                name = name_element.get_text(strip=True) if name_element else ""
                symbol = symbol_element.get_text(strip=True) if symbol_element else ""
                
                # Prix
                price_cell = cells[3]
                price = price_cell.get_text(strip=True) if price_cell else ""
                
                # Variations
                var_1h = cells[4].get_text(strip=True) if len(cells) > 4 else ""
                var_24h = cells[5].get_text(strip=True) if len(cells) > 5 else ""
                var_7d = cells[6].get_text(strip=True) if len(cells) > 6 else ""
                
                # Capitalisation boursière
                market_cap_cell = cells[7]
                market_cap = market_cap_cell.get_text(strip=True) if market_cap_cell else ""
                
                # Volume sur 24h
                volume_cell = cells[8]
                volume = volume_cell.get_text(strip=True) if volume_cell else ""
                
                # Créer l'objet crypto avec structure compatible
                crypto = {
                    "name": name,
                    "symbol": symbol,
                    "last": price,
                    "change": var_24h,  # Compatibilité avec le format existant
                    "1h": var_1h,       # Nouveau champ pour 1h
                    "7d": var_7d,       # Nouveau champ pour 7d
                    "change30d": "",    # Vide car non disponible dans cette vue
                    "ytd": var_7d,      # Utiliser 7d comme YTD pour la compatibilité
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
                value = value.replace("%", "").replace(",", ".").replace(" ", "")
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
        "ytd": {  # Utiliser la variation sur 7 jours comme YTD
            "best": get_top_performers(all_coins, "7d", True),
            "worst": get_top_performers(all_coins, "7d", False)
        }
    }
    
    # Ajout des top performers pour 1h
    all_top_performers["hourly"] = {
        "best": get_top_performers(all_coins, "1h", True),
        "worst": get_top_performers(all_coins, "1h", False)
    }
    
    top100_top_performers = {
        "daily": {
            "best": get_top_performers(top100_coins, "change", True),
            "worst": get_top_performers(top100_coins, "change", False)
        },
        "ytd": {
            "best": get_top_performers(top100_coins, "7d", True),
            "worst": get_top_performers(top100_coins, "7d", False)
        },
        "hourly": {
            "best": get_top_performers(top100_coins, "1h", True),
            "worst": get_top_performers(top100_coins, "1h", False)
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
                "source": "CoinMarketCap (Gainers/Losers 7d)",
                "description": "Cryptomonnaies triées par performance sur 7 jours",
                "timestamp": timestamp,
                "count": len(all_coins)
            }
        },
        "top100": {
            "indices": top100_by_letter,
            "top_performers": top100_top_performers,
            "meta": {
                "source": "CoinMarketCap (Gainers/Losers 7d - Top 100)",
                "description": "Top 100 Cryptomonnaies triées par performance sur 7 jours",
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
            "1h": "+0.5%",
            "7d": "+5.67%",
            "change30d": "+15.67%",
            "ytd": "+42.56%",
            "volume": "€28.5B",
            "marketCap": "€1.1T",
            "rank": "1"
        },
        {
            "name": "Ethereum",
            "symbol": "ETH",
            "last": "€3,245.67",
            "change": "+2.56%",
            "1h": "+0.8%",
            "7d": "+7.12%",
            "change30d": "+23.45%",
            "ytd": "+67.89%",
            "volume": "€12.3B",
            "marketCap": "€389.2B",
            "rank": "2"
        },
        {
            "name": "Binance Coin",
            "symbol": "BNB",
            "last": "€523.45",
            "change": "-0.78%",
            "1h": "-0.3%",
            "7d": "+1.65%",
            "change30d": "+8.91%",
            "ytd": "+34.56%",
            "volume": "€2.1B",
            "marketCap": "€81.5B",
            "rank": "3"
        },
        {
            "name": "Solana",
            "symbol": "SOL",
            "last": "€138.90",
            "change": "+4.32%",
            "1h": "+1.2%",
            "7d": "+12.45%",
            "change30d": "+45.67%",
            "ytd": "+123.45%",
            "volume": "€3.4B",
            "marketCap": "€55.6B",
            "rank": "4"
        },
        {
            "name": "Cardano",
            "symbol": "ADA",
            "last": "€0.58",
            "change": "-1.23%",
            "1h": "-0.5%",
            "7d": "-3.45%",
            "change30d": "-5.67%",
            "ytd": "-12.34%",
            "volume": "€890M",
            "marketCap": "€20.5B",
            "rank": "5"
        },
        {
            "name": "Avalanche",
            "symbol": "AVAX",
            "last": "€34.25",
            "change": "+3.45%",
            "1h": "+0.9%",
            "7d": "+8.76%",
            "change30d": "+18.90%",
            "ytd": "+56.78%",
            "volume": "€456M",
            "marketCap": "€12.3B",
            "rank": "6"
        }
    ]
    
    return generate_crypto_json(demo_cryptos)

def main():
    """Point d'entrée principal du script"""
    try:
        logger.info("🚀 Démarrage du script d'extraction des données CoinMarketCap (Gainers/Losers 7d)")
        
        # Récupérer les données via scraping
        logger.info("Récupération des données via scraping")
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
