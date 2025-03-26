#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données des cryptomonnaies depuis CoinGecko
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
Produit un fichier crypto_lists.json avec une structure pour l'interface
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
import re

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "scraping_urls": {
        "all": "https://www.coingecko.com/",
        "top100": "https://www.coingecko.com/"
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

def fetch_crypto_data_via_scraping(market="all"):
    """Récupère les données en faisant du scraping sur CoinGecko"""
    logger.info(f"Récupération des données via web scraping ({market})...")
    
    url = CONFIG["scraping_urls"][market]
    all_cryptos = []
    
    try:
        # Pour toutes les cryptomonnaies
        logger.info(f"Scraping de la page principale...")
        response = requests.get(
            url,
            headers=get_headers(),
            timeout=30
        )
        
        if response.status_code == 200:
            cryptos = parse_coingecko_page(response.text)
            if cryptos:
                all_cryptos.extend(cryptos)
                logger.info(f"✅ Page principale récupérée: {len(cryptos)} cryptomonnaies")
            else:
                logger.warning(f"Aucune crypto trouvée sur la page principale")
        else:
            logger.error(f"Erreur HTTP {response.status_code} pour la page principale")
        
        # Pour top 100 (même page, mais limité à 100)
        if market == "top100" and len(all_cryptos) > 100:
            all_cryptos = all_cryptos[:100]
            logger.info(f"✅ Top 100 limité à: {len(all_cryptos)} cryptomonnaies")
        
        logger.info(f"✅ Total: {len(all_cryptos)} cryptomonnaies récupérées par scraping")
        return all_cryptos
        
    except Exception as e:
        logger.error(f"Erreur générale lors du scraping: {str(e)}")
        return []

def parse_coingecko_page(html_content):
    """Analyse le contenu HTML de CoinGecko pour extraire les données"""
    cryptos = []
    
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Générer fichier de debug
        debug_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(debug_dir):
            os.makedirs(debug_dir, exist_ok=True)
        debug_file_path = os.path.join(debug_dir, "debug_coingecko.html")
        with open(debug_file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        logger.info(f"HTML sauvegardé pour débogage dans {debug_file_path}")
        
        # Trouver la table des cryptomonnaies (basé sur l'image fournie)
        crypto_table = soup.find('table')
        if not crypto_table:
            logger.error("Tableau des cryptomonnaies non trouvé")
            return []
        
        # Extraire les lignes du tableau (chaque ligne = une cryptomonnaie)
        rows = crypto_table.find_all('tr')[1:]  # Ignorer la ligne d'en-tête
        
        for row in rows:
            try:
                cells = row.find_all('td')
                
                # Ignorer les lignes sans assez de cellules
                if len(cells) < 7:
                    continue
                
                # Extraire le rang
                rank = cells[0].get_text(strip=True)
                
                # Extraire le nom et symbole de la crypto
                coin_cell = cells[1]
                coin_name = ""
                coin_symbol = ""
                
                # Essayer différentes méthodes pour extraire le nom et le symbole
                try:
                    # Méthode 1: Chercher dans des classes spécifiques
                    name_span = coin_cell.find('span', class_='lg:tw-flex')
                    symbol_span = coin_cell.find('span', class_='d-lg-inline')
                    
                    if name_span:
                        coin_name = name_span.get_text(strip=True)
                    if symbol_span:
                        coin_symbol = symbol_span.get_text(strip=True)
                    
                    # Méthode 2: Si les classes spécifiques ne sont pas trouvées
                    if not coin_name or not coin_symbol:
                        # Chercher toutes les spans et essayer de les identifier
                        spans = coin_cell.find_all('span')
                        for span in spans:
                            text = span.get_text(strip=True)
                            # Si c'est en majuscules, c'est probablement le symbole
                            if text.isupper() and len(text) < 10:
                                coin_symbol = text
                            # Sinon, c'est probablement le nom
                            elif text and not coin_name:
                                coin_name = text
                    
                    # Méthode 3: Dernier recours, extraire du texte de la cellule
                    if not coin_name or not coin_symbol:
                        full_text = coin_cell.get_text(strip=True)
                        # Essayer de séparer le nom et le symbole
                        matches = re.search(r'(.+)\s+([A-Z0-9]{2,5})$', full_text)
                        if matches:
                            coin_name = matches.group(1).strip()
                            coin_symbol = matches.group(2).strip()
                        else:
                            parts = full_text.split()
                            if len(parts) > 1:
                                # Supposer que le dernier mot est le symbole
                                coin_symbol = parts[-1]
                                coin_name = ' '.join(parts[:-1])
                            else:
                                coin_name = full_text
                except Exception as e:
                    logger.warning(f"Erreur lors de l'extraction du nom/symbole: {e}")
                    # Utiliser le contenu texte complet comme solution de secours
                    coin_name = coin_cell.get_text(strip=True)
                
                # Extraire le prix
                price = cells[2].get_text(strip=True)
                
                # Extraire les variations
                var_1h = cells[3].get_text(strip=True) if len(cells) > 3 else "0.0%"
                var_24h = cells[4].get_text(strip=True) if len(cells) > 4 else "0.0%"
                var_7d = cells[5].get_text(strip=True) if len(cells) > 5 else "0.0%"
                
                # Extraire le volume 24h
                volume_24h = cells[6].get_text(strip=True) if len(cells) > 6 else "N/A"
                
                # Extraire la capitalisation boursière
                market_cap = cells[7].get_text(strip=True) if len(cells) > 7 else "N/A"
                
                # Créer l'objet crypto
                crypto = {
                    "name": coin_name,
                    "symbol": coin_symbol,
                    "last": price,
                    "change_1h": var_1h,
                    "change": var_24h,  # Pour compatibilité avec le script existant
                    "change_7d": var_7d,
                    "volume": volume_24h,
                    "marketCap": market_cap
                }
                
                # S'assurer qu'on a au moins le nom/symbole
                if coin_name or coin_symbol:
                    cryptos.append(crypto)
                    if len(cryptos) <= 5:  # Log des 5 premières pour débogage
                        logger.info(f"Crypto extraite: {coin_name} ({coin_symbol}) - Prix: {price}, "
                                   f"1h: {var_1h}, 24h: {var_24h}, 7d: {var_7d}, "
                                   f"Vol 24h: {volume_24h}, Cap: {market_cap}")
            
            except Exception as e:
                logger.warning(f"Erreur lors de l'extraction d'une ligne: {str(e)}")
                import traceback
                logger.warning(traceback.format_exc())
                continue
        
        logger.info(f"Nombre total de cryptomonnaies extraites: {len(cryptos)}")
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
            "best": get_top_performers(all_coins, "change_7d", True),  # Utiliser 7d comme approximation de YTD
            "worst": get_top_performers(all_coins, "change_7d", False)
        }
    }
    
    top100_top_performers = {
        "daily": {
            "best": get_top_performers(top100_coins, "change", True),
            "worst": get_top_performers(top100_coins, "change", False)
        },
        "ytd": {
            "best": get_top_performers(top100_coins, "change_7d", True),
            "worst": get_top_performers(top100_coins, "change_7d", False)
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
                "source": "CoinGecko",
                "description": "Cryptomonnaies (données complètes)",
                "timestamp": timestamp,
                "count": len(all_coins)
            }
        },
        "top100": {
            "indices": top100_by_letter,
            "top_performers": top100_top_performers,
            "meta": {
                "source": "CoinGecko",
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
        
        # Créer le dossier debug si nécessaire
        debug_dir = os.path.join(data_dir, "debug")
        if not os.path.exists(debug_dir):
            os.makedirs(debug_dir, exist_ok=True)
        
        # Écrire le fichier JSON
        with open(CONFIG["output_path"], 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données sauvegardées dans {CONFIG['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de la sauvegarde des données: {str(e)}")
        return False

def create_demo_data():
    """Crée des données de démo en cas d'erreur avec le scraping"""
    logger.info("Création de données de démo pour les cryptomonnaies...")
    
    # Liste des cryptos de démo
    demo_cryptos = [
        {
            "name": "Bitcoin",
            "symbol": "BTC",
            "last": "$86,834.03",
            "change_1h": "0.2%",
            "change": "-1.2%",
            "change_7d": "2.7%",
            "volume": "$27,385,394,054",
            "marketCap": "$1,722,986,565,817"
        },
        {
            "name": "Ethereum",
            "symbol": "ETH",
            "last": "$2,017.79",
            "change_1h": "0.2%",
            "change": "-2.7%",
            "change_7d": "-1.4%",
            "volume": "$12,413,694,992",
            "marketCap": "$243,364,337,148"
        },
        {
            "name": "Tether",
            "symbol": "USDT",
            "last": "$1.00",
            "change_1h": "0.0%",
            "change": "0.0%",
            "change_7d": "0.0%",
            "volume": "$46,372,275,493",
            "marketCap": "$144,029,175,952"
        }
    ]
    
    return generate_crypto_json(demo_cryptos)

def main():
    """Point d'entrée principal du script"""
    try:
        logger.info("🚀 Démarrage du script d'extraction des données CoinGecko")
        
        # Tenter de récupérer les données via scraping
        all_coins = fetch_crypto_data_via_scraping("all")
        top100_coins = all_coins[:100] if len(all_coins) >= 100 else all_coins
        
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
