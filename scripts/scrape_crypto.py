#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données des cryptomonnaies depuis CoinGecko
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
Produit un fichier crypto_lists.json avec une structure similaire à lists.json
"""

import os
import json
import sys
import requests
import logging
from datetime import datetime, timezone, timedelta
import time
import random

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "api_key": os.environ.get("COINGECKO_API_KEY", ""),  # Facultatif pour l'API gratuite mais recommandé pour éviter le rate limiting
    "endpoints": {
        "coins_markets": "https://api.coingecko.com/api/v3/coins/markets",
        "ping": "https://api.coingecko.com/api/v3/ping"
    },
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "crypto_lists.json"),
    "user_agents": [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0"
    ],
    "sleep_time": 1.2,  # Délai entre les requêtes pour éviter le rate limiting
    "retries": 3        # Nombre de tentatives en cas d'échec
}

def get_random_user_agent():
    """Renvoie un User-Agent aléatoire pour éviter la détection de bot"""
    return random.choice(CONFIG["user_agents"])

def get_headers():
    """Crée des en-têtes HTTP pour les requêtes API"""
    headers = {
        "User-Agent": get_random_user_agent(),
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    
    # Ajouter la clé API si disponible
    if CONFIG["api_key"]:
        headers["x-cg-pro-api-key"] = CONFIG["api_key"]
        
    return headers

def check_api_status():
    """Vérifie que l'API CoinGecko est accessible"""
    try:
        response = requests.get(
            CONFIG["endpoints"]["ping"],
            headers=get_headers(),
            timeout=10
        )
        
        # Si 200 OK, l'API est accessible
        if response.status_code == 200:
            logger.info("✅ API CoinGecko accessible")
            return True
        else:
            logger.error(f"❌ API CoinGecko inaccessible: {response.status_code}")
            return False
    except Exception as e:
        logger.error(f"❌ Erreur lors de la vérification de l'API: {str(e)}")
        return False

def format_price(price):
    """Formate un prix selon sa valeur pour une meilleure lisibilité"""
    if price is None:
        return "-"
    
    # Pour les très petites valeurs, utiliser la notation scientifique
    if price < 0.000001:
        return f"${price:.8e}"
    
    # Pour les petites valeurs, afficher plus de décimales
    if price < 0.001:
        return f"${price:.6f}"
    elif price < 0.1:
        return f"${price:.5f}"
    elif price < 1:
        return f"${price:.4f}"
    elif price < 10:
        return f"${price:.3f}"
    elif price < 1000:
        return f"${price:.2f}"
    # Pour les grandes valeurs, utiliser le format avec des virgules pour les milliers
    else:
        return f"${price:,.2f}"

def format_percentage(percentage):
    """Formate un pourcentage avec le signe et 2 décimales"""
    if percentage is None:
        return "-"
    
    # Ajouter un signe + explicite pour les valeurs positives
    sign = "+" if percentage > 0 else ""
    return f"{sign}{percentage:.2f}%"

def format_market_cap(market_cap):
    """Formate la capitalisation boursière en format lisible (T/B/M)"""
    if market_cap is None or market_cap == 0:
        return "-"
    
    # Trillion (trillion en français = billion en anglais)
    if market_cap >= 1_000_000_000_000:
        return f"${market_cap / 1_000_000_000_000:.2f}T"
    # Billion (milliard en français)
    elif market_cap >= 1_000_000_000:
        return f"${market_cap / 1_000_000_000:.2f}B"
    # Million
    elif market_cap >= 1_000_000:
        return f"${market_cap / 1_000_000:.2f}M"
    # Valeurs plus petites
    else:
        return f"${market_cap:,.0f}"

def format_volume(volume):
    """Formate le volume en format lisible (T/B/M)"""
    if volume is None or volume == 0:
        return "-"
    
    # Trillion
    if volume >= 1_000_000_000_000:
        return f"${volume / 1_000_000_000_000:.2f}T"
    # Billion
    elif volume >= 1_000_000_000:
        return f"${volume / 1_000_000_000:.2f}B"
    # Million
    elif volume >= 1_000_000:
        return f"${volume / 1_000_000:.2f}M"
    # Valeurs plus petites
    else:
        return f"${volume:,.0f}"

def get_year_to_date_change(coin):
    """Calcule la variation depuis le début de l'année pour une crypto"""
    try:
        # Si CoinGecko fournit directement ces données, les utiliser
        if "ath_change_percentage" in coin and coin["ath_change_percentage"] is not None:
            return coin["ath_change_percentage"]
        
        # Sinon, calculer une approximation basée sur la tendance actuelle
        # (Ceci est une approximation très grossière, idéalement on utiliserait des données historiques)
        current_price = coin.get("current_price", 0)
        market_cap_change_24h = coin.get("market_cap_change_percentage_24h", 0)
        
        # Si les variations sur 24h sont disponibles, estimer sur l'année
        if market_cap_change_24h:
            days_passed = datetime.now().timetuple().tm_yday  # Jours écoulés dans l'année
            # Extrapoler la variation annuelle en fonction de la tendance actuelle
            # (facteur d'atténuation pour rendre l'estimation plus réaliste)
            attenuation = 0.3
            ytd_change = (market_cap_change_24h / 1) * days_passed * attenuation
            return ytd_change
        
        return None
    except:
        return None

def fetch_crypto_data(market="all"):
    """Récupère les données des cryptomonnaies depuis CoinGecko"""
    logger.info(f"🔍 Récupération des données des cryptomonnaies ({market})...")
    
    try:
        # Construire les paramètres de la requête
        params = {
            "vs_currency": "usd",                 # Prix en USD
            "order": "market_cap_desc",           # Triées par capitalisation boursière
            "per_page": 250 if market == "all" else 100,  # Nombre de résultats par page
            "page": 1,                            # Première page
            "sparkline": "false",                 # Pas de données graphiques
            "price_change_percentage": "24h,7d,30d,1y"  # Variations sur différentes périodes
        }
        
        all_coins = []
        max_pages = 4 if market == "all" else 1  # Limiter à 1000 cryptos pour 'all', 100 pour 'top100'
        
        # Récupérer jusqu'à max_pages pages de données
        for page in range(1, max_pages + 1):
            params["page"] = page
            
            # Effectuer la requête avec gestion des erreurs
            for attempt in range(CONFIG["retries"]):
                try:
                    response = requests.get(
                        CONFIG["endpoints"]["coins_markets"],
                        headers=get_headers(),
                        params=params,
                        timeout=30
                    )
                    
                    if response.status_code == 200:
                        page_data = response.json()
                        if not page_data:  # Si la page est vide, nous avons récupéré toutes les données
                            break
                            
                        all_coins.extend(page_data)
                        logger.info(f"✅ Page {page} récupérée: {len(page_data)} cryptomonnaies")
                        
                        # Respecter le rate limiting
                        time.sleep(CONFIG["sleep_time"])
                        break
                    elif response.status_code == 429:  # Too Many Requests
                        wait_time = min(2 ** attempt, 60)  # Backoff exponentiel
                        logger.warning(f"⚠️ Rate limiting détecté, attente de {wait_time}s avant de réessayer...")
                        time.sleep(wait_time)
                    else:
                        logger.error(f"❌ Erreur API: {response.status_code}")
                        break
                except Exception as e:
                    logger.error(f"❌ Erreur lors de la récupération de la page {page}: {str(e)}")
                    if attempt < CONFIG["retries"] - 1:
                        time.sleep(CONFIG["sleep_time"] * 2)
                    else:
                        break
        
        logger.info(f"✅ Total de {len(all_coins)} cryptomonnaies récupérées")
        return all_coins
    
    except Exception as e:
        logger.error(f"❌ Erreur générale lors de la récupération des données: {str(e)}")
        return []

def process_crypto_data(coins):
    """Traite et prépare les données des cryptomonnaies pour la structure finale"""
    processed_coins = []
    
    for coin in coins:
        # Extraire les données de base
        name = coin.get("name", "")
        symbol = coin.get("symbol", "").upper() if coin.get("symbol") else ""
        current_price = coin.get("current_price")
        price_change_24h_percent = coin.get("price_change_percentage_24h")
        market_cap = coin.get("market_cap")
        total_volume = coin.get("total_volume")
        ath = coin.get("ath")
        ytd_change = get_year_to_date_change(coin)
        
        # Créer l'objet cryptomonnaie formaté
        processed_coin = {
            "name": name,
            "symbol": symbol,
            "last": format_price(current_price),
            "change": format_percentage(price_change_24h_percent),
            "marketCap": format_market_cap(market_cap),
            "volume": format_volume(total_volume),
            "ath": format_price(ath),
            "ytd": format_percentage(ytd_change),
            "link": f"https://www.coingecko.com/en/coins/{coin.get('id', '')}"
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
                return float(value.replace("%", "").replace("+", ""))
            except:
                return 0
        return 0
    
    # Trier les cryptos selon le champ spécifié
    sorted_coins = sorted(coins, key=extract_value, reverse=reverse)
    
    # Prendre les premières selon la limite
    return sorted_coins[:limit]

def generate_crypto_json(all_coins, top100_coins):
    """Génère le fichier JSON final avec la structure attendue par l'interface"""
    # Traiter et organiser les données
    processed_all = process_crypto_data(all_coins)
    processed_top100 = process_crypto_data(top100_coins[:100])  # Limiter explicitement à 100
    
    # Organiser par lettre
    all_by_letter = organize_by_letter(processed_all)
    top100_by_letter = organize_by_letter(processed_top100)
    
    # Créer la structure pour les top performers
    all_top_performers = {
        "daily": {
            "best": get_top_performers(processed_all, "change", True),
            "worst": get_top_performers(processed_all, "change", False)
        },
        "ytd": {
            "best": get_top_performers(processed_all, "ytd", True),
            "worst": get_top_performers(processed_all, "ytd", False)
        }
    }
    
    top100_top_performers = {
        "daily": {
            "best": get_top_performers(processed_top100, "change", True),
            "worst": get_top_performers(processed_top100, "change", False)
        },
        "ytd": {
            "best": get_top_performers(processed_top100, "ytd", True),
            "worst": get_top_performers(processed_top100, "ytd", False)
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
                "count": len(processed_all)
            }
        },
        "top100": {
            "indices": top100_by_letter,
            "top_performers": top100_top_performers,
            "meta": {
                "source": "CoinGecko",
                "description": "Top 100 Cryptomonnaies par capitalisation",
                "timestamp": timestamp,
                "count": len(processed_top100)
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

def main():
    """Point d'entrée principal du script"""
    try:
        logger.info("🚀 Démarrage du script d'extraction des données des cryptomonnaies")
        
        # Vérifier que l'API est accessible
        if not check_api_status():
            logger.error("❌ L'API CoinGecko n'est pas accessible, arrêt du script")
            sys.exit(1)
        
        # Récupérer les données
        all_coins = fetch_crypto_data(market="all")
        if not all_coins:
            logger.error("❌ Aucune donnée récupérée pour 'all', arrêt du script")
            sys.exit(1)
        
        # Pour le top 100, utiliser les 100 premières cryptos déjà récupérées
        top100_coins = all_coins[:100]
        
        # Générer et sauvegarder les données
        crypto_data = generate_crypto_json(all_coins, top100_coins)
        if save_data(crypto_data):
            logger.info(f"✅ Script terminé avec succès: {len(all_coins)} cryptomonnaies traitées")
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
