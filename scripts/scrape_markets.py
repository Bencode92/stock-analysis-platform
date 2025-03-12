#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données boursières depuis Boursorama
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
"""

import os
import json
import sys
import requests
from datetime import datetime
from bs4 import BeautifulSoup
import re
import logging
import time

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "source_url": "https://www.boursorama.com/bourse/indices/internationaux",
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "markets.json"),
    # Structure des régions pour la classification des indices
    "regions": {
        "europe": [
            "CAC", "DAX", "FTSE", "IBEX", "MIB", "AEX", "BEL", "SMI", "ATX",
            "OMX", "OMXS", "ISEQ", "PSI", "ATHEX", "OSEBX", "STOXX", "EURO"
        ],
        "us": [
            "DOW", "S&P", "NASDAQ", "RUSSELL", "CBOE", "NYSE", "AMEX"
        ],
        "asia": [
            "NIKKEI", "HANG SENG", "SHANGHAI", "SHENZHEN", "KOSPI", "SENSEX",
            "BSE", "TAIEX", "STRAITS", "JAKARTA", "KLSE", "KOSDAQ", "ASX"
        ],
        "other": [
            "MERVAL", "BOVESPA", "IPC", "IPSA", "COLCAP", "BVLG", "IBC", "CASE",
            "ISE", "TA", "QE", "FTSE/JSE", "MOEX", "MSX30"
        ]
    }
}

# Structure pour les données
MARKET_DATA = {
    "indices": {
        "europe": [],
        "us": [],
        "asia": [],
        "other": []
    },
    "meta": {
        "source": "Boursorama",
        "url": CONFIG["source_url"],
        "timestamp": datetime.now().isoformat(),
        "count": 0,
        "lastUpdated": datetime.now().isoformat()
    }
}

def classify_index(index_data):
    """Classe un indice dans la bonne région"""
    name = index_data["name"].upper()
    
    # Vérifier chaque région
    for region, keywords in CONFIG["regions"].items():
        if any(keyword in name for keyword in keywords):
            MARKET_DATA["indices"][region].append(index_data)
            return
    
    # Par défaut, ajouter à "other"
    MARKET_DATA["indices"]["other"].append(index_data)

def scrape_market_data():
    """Récupère et parse la page de Boursorama"""
    logger.info(f"🔍 Récupération des données depuis {CONFIG['source_url']}...")
    
    try:
        # En-têtes pour simuler un navigateur
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": "https://www.google.com/"
        }
        
        # Faire la requête avec retry
        max_retries = 3
        retry_delay = 2
        
        for retry in range(max_retries):
            try:
                response = requests.get(CONFIG["source_url"], headers=headers, timeout=30, verify=False)
                response.raise_for_status()
                break
            except (requests.RequestException, Exception) as e:
                logger.warning(f"Tentative {retry+1}/{max_retries} échouée: {str(e)}")
                if retry == max_retries - 1:
                    raise
                time.sleep(retry_delay)
        
        if response.status_code != 200:
            raise Exception(f"Erreur HTTP: {response.status_code}")
        
        html = response.text
        
        # Vérifier qu'on a bien récupéré du HTML
        if not html or len(html) < 1000 or "<!DOCTYPE html>" not in html:
            raise Exception("Réponse HTML invalide")
        
        logger.info("✅ Page récupérée avec succès")
        
        # Parser le HTML
        soup = BeautifulSoup(html, 'html.parser')
        
        # Trouver tous les tableaux
        tables = soup.find_all('table')
        logger.info(f"Nombre de tableaux trouvés: {len(tables)}")
        
        # Trouver le tableau des indices
        indices_table = None
        for table in tables:
            headers = [th.text.strip().lower() for th in table.find_all('th')]
            if any(keyword in "".join(headers) for keyword in ['indice', 'dernier', 'var', 'variation']):
                indices_table = table
                logger.info(f"Table des indices trouvée")
                break
        
        if not indices_table:
            logger.warning("⚠️ Tableau des indices non trouvé")
            return False
        
        # Extraire les données des lignes
        rows = indices_table.find('tbody').find_all('tr') if indices_table.find('tbody') else indices_table.find_all('tr')
        logger.info(f"Nombre de lignes trouvées: {len(rows)}")
        
        # Parcourir les lignes
        for row in rows:
            try:
                cells = row.find_all('td')
                
                if len(cells) >= 3:
                    # Extraire le nom de l'indice
                    name_el = row.find('a')
                    name = name_el.text.strip() if name_el else ""
                    
                    # Si pas de lien, essayer la première ou deuxième cellule
                    if not name and len(cells) > 0:
                        name = cells[0].text.strip()
                    if not name and len(cells) > 1:
                        name = cells[1].text.strip()
                    
                    # Vérifier que c'est un nom d'indice valide
                    if name and len(name) > 1 and not re.match(r'^\d+', name):
                        # Extraire les valeurs
                        value = ""
                        change = ""
                        change_percent = ""
                        opening = ""
                        high = ""
                        low = ""
                        
                        # Parcourir les cellules pour extraire les données
                        for i in range(1, len(cells)):
                            text = cells[i].text.strip()
                            
                            # Si c'est un pourcentage, c'est probablement la variation en %
                            if "%" in text and not change_percent:
                                change_percent = text
                                continue
                            
                            # Si c'est un nombre avec +/-, c'est probablement la variation absolue
                            if ('+' in text or '-' in text) and re.search(r'[0-9]', text) and not change:
                                change = text
                                continue
                            
                            # Si c'est un nombre et qu'on n'a pas encore de valeur
                            if re.search(r'[0-9]', text) and not value:
                                value = text
                                continue
                            
                            # Si c'est un nombre et qu'on a déjà une valeur mais pas d'ouverture
                            if re.search(r'[0-9]', text) and value and not opening:
                                opening = text
                                continue
                            
                            # Si c'est un nombre et qu'on a déjà une valeur et une ouverture mais pas de plus haut
                            if re.search(r'[0-9]', text) and value and opening and not high:
                                high = text
                                continue
                            
                            # Si c'est un nombre et qu'on a déjà une valeur, une ouverture et un plus haut mais pas de plus bas
                            if re.search(r'[0-9]', text) and value and opening and high and not low:
                                low = text
                                continue
                        
                        # Créer l'indice uniquement si on a au moins une valeur
                        if value:
                            # Déterminer la tendance (hausse/baisse)
                            trend = "down" if (change and '-' in change) or (change_percent and '-' in change_percent) else "up"
                            
                            # Créer l'objet indice
                            index_data = {
                                "name": name,
                                "value": value,
                                "change": change or "",
                                "changePercent": change_percent or "",
                                "opening": opening or "",
                                "high": high or "",
                                "low": low or "",
                                "trend": trend
                            }
                            
                            # Classer l'indice
                            classify_index(index_data)
            except Exception as e:
                logger.warning(f"Erreur lors du traitement d'une ligne: {str(e)}")
        
        # Mettre à jour le compteur
        MARKET_DATA["meta"]["count"] = sum(len(indices) for indices in MARKET_DATA["indices"].values())
        
        logger.info(f"✅ Données extraites avec succès: {MARKET_DATA['meta']['count']} indices")
        
        # Vérifier qu'on a assez de données
        if MARKET_DATA["meta"]["count"] < 5:
            logger.warning(f"⚠️ Trop peu d'indices trouvés: {MARKET_DATA['meta']['count']}")
            return False
        
        # Mise à jour de l'horodatage
        now = datetime.now()
        MARKET_DATA["meta"]["timestamp"] = now.isoformat()
        MARKET_DATA["meta"]["lastUpdated"] = now.isoformat()
        
        # Enregistrer les données
        save_market_data()
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'extraction des données: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def save_market_data():
    """Enregistre les données dans un fichier JSON"""
    try:
        # Créer le dossier data s'il n'existe pas
        data_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)
        
        # Écrire le fichier JSON
        with open(CONFIG["output_path"], 'w', encoding='utf-8') as f:
            json.dump(MARKET_DATA, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données enregistrées dans {CONFIG['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données: {str(e)}")
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
    """Point d'entrée principal avec gestion d'erreur robuste"""
    try:
        logger.info("🚀 Démarrage du script de scraping des données de marché")
        
        # Vérifier si les données existent déjà
        has_existing_data = check_existing_data()
        
        # Tenter d'extraire les nouvelles données
        scraping_success = scrape_market_data()
        
        # Si l'extraction échoue mais qu'on a des données existantes, conserver le fichier
        if not scraping_success and has_existing_data:
            logger.info("⚠️ Utilisation des données existantes car le scraping a échoué")
            sys.exit(0) # Sortie sans erreur pour ne pas faire échouer le workflow
        elif not scraping_success and not has_existing_data:
            logger.error("❌ Aucune donnée existante et échec du scraping")
            sys.exit(1) # Sortie avec erreur car on n'a pas de données
        else:
            logger.info("✅ Scraping terminé avec succès")
            sys.exit(0)
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
