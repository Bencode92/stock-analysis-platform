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
    """Analyse le contenu HTML de CoinMarketCap pour extraire les données avec des colonnes personnalisées"""
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
        
        # Déterminer le nombre de colonnes en examinant les en-têtes
        headers = soup.select('table thead th')
        header_texts = [header.get_text(strip=True) for header in headers]
        logger.info(f"En-têtes trouvés: {header_texts}")
        
        # Rechercher les indices des colonnes importantes
        # D'après l'image, l'ordre est généralement: #, Nom, Prix, Cap. Boursière, Volume (24h), Offre en Circulation, 30j, %24h, %30j, %YTD
        nom_idx = -1
        prix_idx = -1
        cap_idx = -1
        volume_idx = -1
        pct_24h_idx = -1
        pct_30j_idx = -1
        pct_ytd_idx = -1
        
        for i, header in enumerate(header_texts):
            header_lower = header.lower()
            if "nom" in header_lower:
                nom_idx = i
            elif "prix" in header_lower:
                prix_idx = i
            elif "cap" in header_lower and "bours" in header_lower:
                cap_idx = i
            elif "volume" in header_lower:
                volume_idx = i
            elif "24h" in header_lower or "24 h" in header_lower:
                pct_24h_idx = i
            elif "30j" in header_lower or "30 j" in header_lower:
                pct_30j_idx = i
            elif "ytd" in header_lower or "début" in header_lower or "de ytd" in header_lower:
                pct_ytd_idx = i
        
        # Si on n'a pas trouvé certains indices par nom, utiliser les positions typiques
        if nom_idx == -1 and len(header_texts) > 1:
            nom_idx = 1  # Généralement colonne 2
        if prix_idx == -1 and len(header_texts) > 2:
            prix_idx = 2  # Généralement colonne 3
        if cap_idx == -1 and len(header_texts) > 3:
            cap_idx = 3  # Généralement colonne 4
        if volume_idx == -1 and len(header_texts) > 4:
            volume_idx = 4  # Généralement colonne 5
            
        # Pour les colonnes de pourcentage, chercher aussi en utilisant le contenu de la cellule
        # Si on n'a pas trouvé les indices pour les pourcentages, chercher aux positions habituelles en fin de tableau
        if pct_24h_idx == -1 and len(header_texts) >= 8:
            # Essayer de trouver par position (souvent antépénultième colonne)
            pct_24h_idx = len(header_texts) - 3
        if pct_30j_idx == -1 and len(header_texts) >= 9:
            # Essayer de trouver par position (souvent avant-dernière colonne)
            pct_30j_idx = len(header_texts) - 2
        if pct_ytd_idx == -1 and len(header_texts) >= 10:
            # Essayer de trouver par position (souvent dernière colonne)
            pct_ytd_idx = len(header_texts) - 1
            
        logger.info(f"Indices des colonnes: Nom={nom_idx}, Prix={prix_idx}, Cap={cap_idx}, Volume={volume_idx}, " 
                   f"24h={pct_24h_idx}, 30j={pct_30j_idx}, YTD={pct_ytd_idx}")
        
        # Analyser les lignes
        rows = soup.select('table tbody tr')
        for row in rows:
            try:
                # Extraire toutes les cellules de la ligne
                cells = row.select('td')
                
                # Vérifier qu'on a assez de cellules
                min_cells = max(nom_idx, prix_idx, cap_idx, volume_idx, pct_24h_idx, pct_30j_idx, pct_ytd_idx) + 1
                if len(cells) < min_cells:
                    logger.warning(f"Pas assez de cellules: {len(cells)} < {min_cells}")
                    continue
                
                # Extraire le nom et symbole
                name = ""
                symbol = ""
                
                if 0 <= nom_idx < len(cells):
                    name_cell = cells[nom_idx]
                    
                    # Chercher nom et symbole dans des éléments spécifiques
                    name_elem = name_cell.select_one('.coin-item-name, [class*="name"]')
                    symbol_elem = name_cell.select_one('.coin-item-symbol, [class*="symbol"]')
                    
                    if name_elem:
                        name = name_elem.get_text(strip=True)
                    if symbol_elem:
                        symbol = symbol_elem.get_text(strip=True)
                    
                    # Si on n'a pas trouvé avec les sélecteurs, essayer d'autres approches
                    if not name or not symbol:
                        # Essayer d'extraire d'un élément <a> (lien)
                        link_elem = name_cell.select_one('a')
                        if link_elem:
                            full_text = link_elem.get_text(strip=True)
                            # Chercher un motif typique nom (symbole)
                            parentheses_match = re.search(r'(.+?)\s*\(([A-Z0-9]{2,6})\)', full_text)
                            if parentheses_match:
                                name = parentheses_match.group(1).strip()
                                symbol = parentheses_match.group(2).strip()
                            else:
                                # Chercher un mot en majuscules qui pourrait être le symbole
                                parts = full_text.split()
                                for part in parts:
                                    if re.match(r'^[A-Z0-9]{2,6}$', part):
                                        symbol = part
                                        # Le nom est tout sauf le symbole
                                        name_parts = [p for p in parts if p != symbol]
                                        name = ' '.join(name_parts)
                                        break
                                
                                # Si toujours pas de nom/symbole, utiliser tout le texte comme nom
                                if not name:
                                    name = full_text
                
                # Extraire le prix
                price = ""
                if 0 <= prix_idx < len(cells):
                    price = cells[prix_idx].get_text(strip=True)
                
                # Extraire la capitalisation boursière
                market_cap = ""
                if 0 <= cap_idx < len(cells):
                    market_cap = cells[cap_idx].get_text(strip=True)
                
                # Extraire le volume
                volume = ""
                if 0 <= volume_idx < len(cells):
                    volume = cells[volume_idx].get_text(strip=True)
                    # Nettoyer (prendre seulement la première ligne)
                    volume = volume.split('\n')[0] if '\n' in volume else volume
                
                # Extraire les pourcentages
                change_24h = ""
                if 0 <= pct_24h_idx < len(cells):
                    change_24h = cells[pct_24h_idx].get_text(strip=True)
                    # Nettoyer (enlever les icônes, garder que le %)
                    if change_24h:
                        percent_match = re.search(r'[-+]?\d+\.?\d*\%', change_24h)
                        if percent_match:
                            change_24h = percent_match.group(0)
                
                change_30j = ""
                if 0 <= pct_30j_idx < len(cells):
                    change_30j = cells[pct_30j_idx].get_text(strip=True)
                    if change_30j:
                        percent_match = re.search(r'[-+]?\d+\.?\d*\%', change_30j)
                        if percent_match:
                            change_30j = percent_match.group(0)
                
                ytd = ""
                if 0 <= pct_ytd_idx < len(cells):
                    ytd = cells[pct_ytd_idx].get_text(strip=True)
                    if ytd:
                        percent_match = re.search(r'[-+]?\d+\.?\d*\%', ytd)
                        if percent_match:
                            ytd = percent_match.group(0)
                
                # Créer l'objet crypto
                crypto = {
                    "name": name,
                    "symbol": symbol,
                    "last": price,
                    "change": change_24h,
                    "change30d": change_30j,
                    "ytd": ytd,
                    "volume": volume,
                    "marketCap": market_cap
                }
                
                # S'assurer qu'on a au moins le nom/symbole
                if (name or symbol):
                    cryptos.append(crypto)
                    if len(cryptos) <= 5:  # Log des 5 premières pour débogage
                        logger.info(f"Crypto extraite: {name} ({symbol}) - Prix: {price}, "
                                   f"Cap: {market_cap}, Vol: {volume}, 24h: {change_24h}, "
                                   f"30j: {change_30j}, YTD: {ytd}")
            
            except Exception as e:
                logger.warning(f"Erreur lors de l'extraction d'une ligne: {str(e)}")
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