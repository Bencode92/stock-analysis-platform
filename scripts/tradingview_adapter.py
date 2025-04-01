#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Adaptateur TradingView pour extraire les données des indices sectoriels STOXX Europe 600
"""

import requests
import json
import random
import time
import logging
import re
from datetime import datetime

# Configuration du logger
logger = logging.getLogger(__name__)

# Mappings des noms de secteurs STOXX Europe 600 vers les symboles TradingView
# Symboles corrects "FES" fournis par le client
STOXX_SYMBOL_MAPPING = {
    "Stoxx Europe 600 Automobiles": "FESA",
    "Stoxx Europe 600 Banks": "FESB",
    "Stoxx Europe 600 Basic Resources": "FESS",
    "Stoxx Europe 600 Chemicals": "FESC",
    "Stoxx Europe 600 Construction & Materials": "FESN",
    "Stoxx Europe 600 Financial Services": "FESF",
    "Stoxx Europe 600 Food & Beverage": "FESO",
    "Stoxx Europe 600 Health Care": "FESH",
    "Stoxx Europe 600 Industrial Goods & Services": "FESG",
    "Stoxx Europe 600 Insurance": "FESI",
    "Stoxx Europe 600 Media": "FESM",
    "Stoxx Europe 600 Oil & Gas": "FESE",
    "Stoxx Europe 600 Technology": "FESY",
    "Stoxx Europe 600 Telecommunications": "FEST",
    "Stoxx Europe 600 Utilities": "FESU"
}

def get_tradingview_headers():
    """Retourne des en-têtes pour les requêtes TradingView"""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0"
    ]
    
    return {
        "User-Agent": random.choice(user_agents),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.tradingview.com/chart/",
        "Origin": "https://www.tradingview.com",
        "DNT": "1",
        "Connection": "keep-alive",
    }

def fetch_quote(symbol):
    """Récupère les données pour un symbole TradingView"""
    # Format complet pour la recherche
    search_symbol = f"STOXX:{symbol}"
    url = f"https://scanner.tradingview.com/symbol-search/resolve?text={search_symbol}"
    
    try:
        headers = get_tradingview_headers()
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            logger.warning(f"Erreur {response.status_code} pour {symbol}")
            return None
        
        # Tentative de récupération des données de base
        data = response.json()
        if not data or not isinstance(data, list) or len(data) == 0:
            logger.warning(f"Aucune donnée trouvée pour {symbol}")
            
            # Essai alternatif sans le préfixe STOXX:
            alt_url = f"https://scanner.tradingview.com/symbol-search/resolve?text={symbol}"
            alt_response = requests.get(alt_url, headers=headers, timeout=30)
            
            if alt_response.status_code != 200:
                logger.warning(f"Tentative alternative échouée pour {symbol}")
                return None
            
            data = alt_response.json()
            if not data or not isinstance(data, list) or len(data) == 0:
                logger.warning(f"Aucune donnée trouvée pour {symbol} même avec tentative alternative")
                return None
        
        # Trouver l'élément qui correspond au symbole (avec ou sans préfixe)
        matching_item = None
        for item in data:
            item_symbol = item.get("symbol", "")
            if item_symbol == search_symbol or item_symbol == symbol or item_symbol.endswith(f":{symbol}"):
                matching_item = item
                break
        
        # Si pas de correspondance exacte, prendre le premier résultat
        if not matching_item and data:
            matching_item = data[0]
            logger.info(f"Utilisation du premier résultat pour {symbol}: {matching_item.get('symbol')}")
                
        if not matching_item:
            logger.warning(f"Aucun élément correspondant pour {symbol}")
            return None
        
        # Récupérer les données de prix actuelles
        item_symbol = matching_item.get("symbol", "")
        quote_url = f"https://www.tradingview.com/symbols/{item_symbol}/"
        quote_headers = get_tradingview_headers()
        quote_response = requests.get(quote_url, headers=quote_headers, timeout=30)
        
        if quote_response.status_code != 200:
            logger.warning(f"Impossible de récupérer les données de prix pour {symbol} ({item_symbol})")
            return matching_item
        
        # Extraction du prix actuel et des variations avec regex
        html = quote_response.text
        
        # Extraire le prix actuel
        price_match = re.search(r'"last_price":\s*"([^"]+)"', html)
        current_price = price_match.group(1) if price_match else "0"
        
        # Extraire la variation quotidienne
        change_match = re.search(r'"change_percent":\s*"([^"]+)"', html)
        daily_change = change_match.group(1) if change_match else "0,00 %"
        
        # Extraire la variation YTD (depuis le début de l'année)
        ytd_match = re.search(r'"change_ytd":\s*"([^"]+)"', html)
        ytd_change = ytd_match.group(1) if ytd_match else "0,00 %"
        
        # Mettre à jour l'élément avec ces informations
        matching_item["current_price"] = current_price
        matching_item["daily_change"] = daily_change
        matching_item["ytd_change"] = ytd_change
        
        return matching_item
        
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des données pour {symbol}: {str(e)}")
        return None

def fetch_stoxx_sectors():
    """Récupère les données pour tous les secteurs STOXX Europe 600"""
    sectors = []
    
    # Pour chaque secteur STOXX Europe 600
    for name, symbol in STOXX_SYMBOL_MAPPING.items():
        try:
            logger.info(f"Récupération des données pour {name} ({symbol})...")
            
            # Ajouter un délai aléatoire pour éviter la détection
            time.sleep(random.uniform(1, 3))
            
            # Récupérer les données
            data = fetch_quote(symbol)
            
            if not data:
                logger.warning(f"Aucune donnée récupérée pour {name}")
                continue
            
            # Extraire les valeurs
            price = data.get("current_price", "0")
            daily_change = data.get("daily_change", "0,00 %")
            ytd_change = data.get("ytd_change", "0,00 %")
            
            # Si on n'a pas les données de variation, essayer d'extraire à partir des données brutes
            if daily_change == "0,00 %" and "change" in data:
                change_val = data.get("change", 0)
                if isinstance(change_val, (int, float)):
                    daily_change = f"{change_val:.2f} %"
            
            # Nettoyer et formatter les données
            if not daily_change.endswith("%"):
                daily_change = f"{daily_change} %"
            if not ytd_change.endswith("%"):
                ytd_change = f"{ytd_change} %"
            
            # Formatage français: transformer les points en virgules
            price = price.replace(".", ",") if isinstance(price, str) else price
            daily_change = daily_change.replace(".", ",") if isinstance(daily_change, str) else daily_change
            ytd_change = ytd_change.replace(".", ",") if isinstance(ytd_change, str) else ytd_change
            
            # Déterminer la tendance
            trend = "down" if "-" in str(daily_change) else "up"
            
            # Créer l'objet secteur
            sector = {
                "name": name,
                "value": price,
                "change": daily_change,
                "changePercent": daily_change,
                "ytdChange": ytd_change,
                "trend": trend,
                "category": "unknown",  # Sera déterminé par le classificateur principal
                "source": "TradingView",
                "region": "Europe"
            }
            
            sectors.append(sector)
            logger.info(f"✅ Données récupérées pour {name}: Cours={price}, Var={daily_change}, YTD={ytd_change}")
            
        except Exception as e:
            logger.error(f"Erreur lors du traitement de {name}: {str(e)}")
    
    return sectors

def fetch_alternative_stoxx_data():
    """Point d'entrée principal pour récupérer les données STOXX Europe 600 depuis TradingView"""
    try:
        logger.info("🔄 Récupération des données STOXX Europe 600 depuis TradingView...")
        sectors = fetch_stoxx_sectors()
        logger.info(f"✅ {len(sectors)} secteurs STOXX Europe 600 récupérés depuis TradingView")
        return sectors
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération des données depuis TradingView: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return []

if __name__ == "__main__":
    # Configuration du logger pour les tests
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # Test de récupération des données
    sectors = fetch_alternative_stoxx_data()
    print(f"Nombre de secteurs récupérés: {len(sectors)}")
    for sector in sectors:
        print(f"{sector['name']}: {sector['value']} ({sector['changePercent']})")
