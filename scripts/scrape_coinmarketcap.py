#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données de cryptomonnaies depuis CoinMarketCap
URL cible: https://coinmarketcap.com/?type=coins&tableRankBy=gainer_loser_7d
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
import traceback
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "url": "https://coinmarketcap.com/?type=coins&tableRankBy=gainer_loser_7d",
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "crypto_lists.json"),
    "chrome_driver_path": "/usr/bin/chromedriver",  # Ajustez selon votre installation
    "timeout": 30,  # Timeout en secondes
    "categories": {
        "top_gainers_24h": [],
        "top_losers_24h": [],
        "top_gainers_7d": [],
        "top_losers_7d": [],
        "trending": []
    },
    "max_coins_per_category": 20
}

# Structure pour les données
CRYPTO_DATA = {
    "categories": {
        "top_gainers_24h": [],
        "top_losers_24h": [],
        "top_gainers_7d": [],
        "top_losers_7d": [],
        "trending": []
    },
    "most_visited": [],
    "meta": {
        "sources": ["CoinMarketCap"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": 0,
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

def setup_selenium_driver():
    """Configure et retourne un driver Selenium pour Chrome"""
    try:
        chrome_options = Options()
        chrome_options.add_argument("--headless")  # Exécution sans interface graphique
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        
        # Ajouter un user agent aléatoire
        user_agent = get_headers()["User-Agent"]
        chrome_options.add_argument(f"user-agent={user_agent}")
        
        # Initialiser le driver
        driver = webdriver.Chrome(options=chrome_options)
        return driver
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation du driver Selenium: {str(e)}")
        return None

def extract_coin_data_selenium():
    """Extrait les données des cryptomonnaies en utilisant Selenium"""
    driver = None
    try:
        logger.info("Initialisation du driver Selenium...")
        driver = setup_selenium_driver()
        if not driver:
            logger.error("Impossible d'initialiser le driver Selenium")
            return []
        
        logger.info(f"Accès à l'URL: {CONFIG['url']}")
        driver.get(CONFIG['url'])
        
        # Attendre que le tableau soit chargé
        logger.info("Attente du chargement du tableau...")
        wait = WebDriverWait(driver, CONFIG['timeout'])
        table = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "table.cmc-table")))
        
        # Attendre un peu plus pour laisser le JS se charger complètement
        time.sleep(5)
        
        # Extraire les données du tableau
        coins = []
        
        # Trouver les lignes du tableau
        rows = driver.find_elements(By.CSS_SELECTOR, "table.cmc-table tbody tr")
        logger.info(f"Nombre de lignes trouvées: {len(rows)}")
        
        for row in rows:
            try:
                # Récupérer les cellules
                cells = row.find_elements(By.TAG_NAME, "td")
                
                if len(cells) < 8:  # Vérifier qu'il y a assez de cellules
                    continue
                
                # Extraire le rang
                rank_cell = cells[0]
                rank_text = rank_cell.text.strip()
                
                # Extraire le nom et le symbole
                name_cell = cells[1]
                name_element = name_cell.find_element(By.CSS_SELECTOR, "p")
                symbol_element = name_cell.find_element(By.CSS_SELECTOR, "p.coin-item-symbol")
                
                name = name_element.text.strip()
                symbol = symbol_element.text.strip()
                
                # Logo (si disponible)
                logo_url = ""
                try:
                    logo_element = name_cell.find_element(By.TAG_NAME, "img")
                    logo_url = logo_element.get_attribute("src")
                except:
                    pass
                
                # Prix actuel
                price_cell = cells[2]
                price = price_cell.text.strip()
                
                # Variations de prix
                h1_change_cell = cells[3]
                h24_change_cell = cells[4]
                d7_change_cell = cells[5]
                
                h1_change = h1_change_cell.text.strip()
                h24_change = h24_change_cell.text.strip()
                d7_change = d7_change_cell.text.strip()
                
                # Market Cap
                market_cap_cell = cells[6]
                market_cap = market_cap_cell.text.strip()
                
                # Volume (24h)
                volume_cell = cells[7]
                volume = volume_cell.text.strip()
                
                # Déterminer la tendance
                trend_24h = "up" if "+" in h24_change else "down"
                trend_7d = "up" if "+" in d7_change else "down"
                
                # Créer l'objet crypto
                coin = {
                    "rank": rank_text,
                    "name": name,
                    "symbol": symbol,
                    "logo": logo_url,
                    "price": price,
                    "change_1h": h1_change,
                    "change_24h": h24_change,
                    "change_7d": d7_change,
                    "market_cap": market_cap,
                    "volume_24h": volume,
                    "trend_24h": trend_24h,
                    "trend_7d": trend_7d
                }
                
                coins.append(coin)
                logger.info(f"Crypto extraite: {name} ({symbol})")
                
            except Exception as e:
                logger.error(f"Erreur lors de l'extraction des données d'une crypto: {str(e)}")
                continue
        
        # Extraire les cryptos les plus visitées (si disponible)
        try:
            # Identifier la section "Most Visited"
            most_visited_elements = driver.find_elements(By.XPATH, "//h2[contains(text(), 'Most Visited')]")
            
            if most_visited_elements:
                most_visited_section = most_visited_elements[0].find_element(By.XPATH, "./ancestor::div[contains(@class, 'section')]")
                most_visited_rows = most_visited_section.find_elements(By.CSS_SELECTOR, "tr")
                
                for row in most_visited_rows:
                    try:
                        cells = row.find_elements(By.TAG_NAME, "td")
                        
                        if len(cells) < 3:  # Vérifier qu'il y a assez de cellules
                            continue
                        
                        # Extraire le nom et le symbole
                        name_cell = cells[0]
                        name_element = name_cell.find_element(By.CSS_SELECTOR, "p")
                        symbol_element = name_cell.find_element(By.CSS_SELECTOR, "p.coin-item-symbol")
                        
                        name = name_element.text.strip()
                        symbol = symbol_element.text.strip()
                        
                        # Prix actuel
                        price_cell = cells[1]
                        price = price_cell.text.strip()
                        
                        # Variation de prix
                        change_cell = cells[2]
                        change = change_cell.text.strip()
                        
                        # Déterminer la tendance
                        trend = "up" if "+" in change else "down"
                        
                        # Créer l'objet crypto
                        coin = {
                            "name": name,
                            "symbol": symbol,
                            "price": price,
                            "change_24h": change,
                            "trend": trend
                        }
                        
                        CRYPTO_DATA["most_visited"].append(coin)
                        logger.info(f"Crypto 'most visited' extraite: {name} ({symbol})")
                        
                    except Exception as e:
                        logger.error(f"Erreur lors de l'extraction d'une crypto 'most visited': {str(e)}")
                        continue
        except Exception as e:
            logger.warning(f"Erreur lors de l'extraction des cryptos les plus visitées: {str(e)}")
        
        return coins
    
    except TimeoutException:
        logger.error("Timeout lors du chargement de la page")
        return []
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des données: {str(e)}")
        logger.error(traceback.format_exc())
        return []
    finally:
        if driver:
            driver.quit()
            logger.info("Driver Selenium fermé")

def extract_coin_data_requests():
    """Tentative d'extraction via requests (fallback si Selenium échoue)"""
    try:
        logger.info("Tentative d'extraction via requests...")
        headers = get_headers()
        response = requests.get(CONFIG["url"], headers=headers, timeout=CONFIG["timeout"])
        
        if response.status_code != 200:
            logger.warning(f"Erreur HTTP {response.status_code}")
            return []
        
        html = response.text
        soup = BeautifulSoup(html, 'html.parser')
        
        # Générer un fichier HTML de débogage
        debug_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(debug_dir):
            os.makedirs(debug_dir, exist_ok=True)
        debug_file_path = os.path.join(debug_dir, "debug_coinmarketcap.html")
        with open(debug_file_path, 'w', encoding='utf-8') as f:
            f.write(html)
        logger.info(f"HTML sauvegardé pour débogage dans {debug_file_path}")
        
        # Rechercher le tableau principal
        table = soup.find('table', class_='cmc-table')
        if not table:
            logger.warning("Tableau principal non trouvé")
            return []
        
        coins = []
        rows = table.find('tbody').find_all('tr')
        
        for row in rows:
            try:
                cells = row.find_all('td')
                
                if len(cells) < 8:
                    continue
                
                # Extraire le rang
                rank_text = cells[0].text.strip()
                
                # Extraire le nom et le symbole
                name_cell = cells[1]
                name = name_cell.find('p', class_='coin-item-name').text.strip()
                symbol = name_cell.find('p', class_='coin-item-symbol').text.strip()
                
                # Logo (si disponible)
                logo_url = ""
                logo_element = name_cell.find('img')
                if logo_element:
                    logo_url = logo_element.get('src', '')
                
                # Prix actuel
                price = cells[2].text.strip()
                
                # Variations de prix
                h1_change = cells[3].text.strip()
                h24_change = cells[4].text.strip()
                d7_change = cells[5].text.strip()
                
                # Market Cap
                market_cap = cells[6].text.strip()
                
                # Volume (24h)
                volume = cells[7].text.strip()
                
                # Déterminer la tendance
                trend_24h = "up" if "+" in h24_change else "down"
                trend_7d = "up" if "+" in d7_change else "down"
                
                # Créer l'objet crypto
                coin = {
                    "rank": rank_text,
                    "name": name,
                    "symbol": symbol,
                    "logo": logo_url,
                    "price": price,
                    "change_1h": h1_change,
                    "change_24h": h24_change,
                    "change_7d": d7_change,
                    "market_cap": market_cap,
                    "volume_24h": volume,
                    "trend_24h": trend_24h,
                    "trend_7d": trend_7d
                }
                
                coins.append(coin)
                logger.info(f"Crypto extraite (requests): {name} ({symbol})")
                
            except Exception as e:
                logger.error(f"Erreur lors de l'extraction des données d'une crypto (requests): {str(e)}")
                continue
        
        return coins
    
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction via requests: {str(e)}")
        logger.error(traceback.format_exc())
        return []

def categorize_coins(coins):
    """Catégorise les cryptos en fonction de leurs performances"""
    # Réinitialiser les catégories
    for category in CRYPTO_DATA["categories"]:
        CRYPTO_DATA["categories"][category] = []
    
    # Trier par performance sur 24h (pour top gainers/losers 24h)
    sorted_24h = sorted(coins, key=lambda x: float(x["change_24h"].replace("%", "").replace("+", "").replace(",", "").strip()), reverse=True)
    
    # Top gainers 24h (premiers éléments)
    top_gainers_24h = [coin for coin in sorted_24h if "+" in coin["change_24h"]][:CONFIG["max_coins_per_category"]]
    CRYPTO_DATA["categories"]["top_gainers_24h"] = top_gainers_24h
    
    # Top losers 24h (derniers éléments)
    sorted_losers_24h = sorted(sorted_24h, key=lambda x: float(x["change_24h"].replace("%", "").replace("+", "").replace("-", "").replace(",", "").strip()))
    top_losers_24h = [coin for coin in sorted_losers_24h if "-" in coin["change_24h"]][:CONFIG["max_coins_per_category"]]
    CRYPTO_DATA["categories"]["top_losers_24h"] = top_losers_24h
    
    # Trier par performance sur 7d (pour top gainers/losers 7d)
    sorted_7d = sorted(coins, key=lambda x: float(x["change_7d"].replace("%", "").replace("+", "").replace(",", "").strip()), reverse=True)
    
    # Top gainers 7d (premiers éléments)
    top_gainers_7d = [coin for coin in sorted_7d if "+" in coin["change_7d"]][:CONFIG["max_coins_per_category"]]
    CRYPTO_DATA["categories"]["top_gainers_7d"] = top_gainers_7d
    
    # Top losers 7d (derniers éléments)
    sorted_losers_7d = sorted(sorted_7d, key=lambda x: float(x["change_7d"].replace("%", "").replace("+", "").replace("-", "").replace(",", "").strip()))
    top_losers_7d = [coin for coin in sorted_losers_7d if "-" in coin["change_7d"]][:CONFIG["max_coins_per_category"]]
    CRYPTO_DATA["categories"]["top_losers_7d"] = top_losers_7d
    
    # Les 20 premières pour "trending"
    CRYPTO_DATA["categories"]["trending"] = coins[:CONFIG["max_coins_per_category"]]
    
    # Mettre à jour le compteur
    total_count = sum(len(category) for category in CRYPTO_DATA["categories"].values())
    CRYPTO_DATA["meta"]["count"] = total_count
    
    logger.info(f"Catégorisation terminée: {len(top_gainers_24h)} gainers 24h, {len(top_losers_24h)} losers 24h, "
                f"{len(top_gainers_7d)} gainers 7d, {len(top_losers_7d)} losers 7d, "
                f"{len(CRYPTO_DATA['categories']['trending'])} trending")

def scrape_crypto_data():
    """Récupère et traite les données des cryptomonnaies"""
    try:
        logger.info("Démarrage de l'extraction des données...")
        
        # Essayer d'abord avec Selenium
        coins = extract_coin_data_selenium()
        
        # Si Selenium échoue, essayer avec requests (attention: peut ne pas fonctionner à cause du JavaScript)
        if not coins:
            logger.info("L'extraction avec Selenium a échoué, tentative avec requests...")
            coins = extract_coin_data_requests()
        
        if not coins:
            logger.error("Aucune donnée extraite.")
            return False
        
        logger.info(f"{len(coins)} cryptomonnaies extraites avec succès.")
        
        # Catégoriser les coins
        categorize_coins(coins)
        
        # Mettre à jour l'horodatage
        CRYPTO_DATA["meta"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
        
        return True
    
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des données: {str(e)}")
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
