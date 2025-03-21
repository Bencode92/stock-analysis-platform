#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'extraction des données boursières depuis Boursorama
Utilisé par GitHub Actions pour mettre à jour régulièrement les données
Version dédiée pour la page liste.html
"""

import os
import json
import sys
import requests
from datetime import datetime, timezone
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
    "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "lists.json"),
}

# Structure pour les données
LIST_DATA = {
    "indices": {
        "europe": [],
        "north-america": [],
        "latin-america": [],
        "asia": [],
        "other": []
    },
    "top_performers": {
        "daily": {
            "best": [],
            "worst": []
        },
        "ytd": {
            "best": [],
            "worst": []
        }
    },
    "meta": {
        "source": "Boursorama",
        "url": CONFIG["source_url"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "lastUpdated": datetime.now(timezone.utc).isoformat()
    }
}

# Liste pour stocker tous les indices avant le filtrage (pour calculer les Top 3)
ALL_INDICES = []

def get_headers():
    """Crée des en-têtes HTTP aléatoires pour éviter la détection de bot"""
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/"
    }

def get_countries_by_region():
    """Mapping des pays par région"""
    return {
        "europe": ["France", "Allemagne", "Royaume-Uni", "Italie", "Espagne", "Suisse", "Pays-Bas", 
                  "Belgique", "Autriche", "Portugal", "Irlande", "Danemark", "Finlande", 
                  "Norvège", "Suède", "Pologne", "Zone Euro"],
        "north-america": ["États-Unis", "Canada"],
        "latin-america": ["Brésil", "Mexique", "Argentine", "Chili", "Colombie", "Pérou"],
        "asia": ["Japon", "Chine", "Hong Kong", "Taïwan", "Corée du Sud", "Singapour", 
                "Inde", "Indonésie", "Malaisie", "Philippines", "Thaïlande"],
        "other": ["Australie", "Nouvelle-Zélande", "Israël", "Émirats Arabes Unis", 
                 "Qatar", "Afrique du Sud", "Maroc", "International"]
    }

def save_data():
    """Enregistre les données dans un fichier JSON"""
    try:
        # Créer le dossier data s'il n'existe pas
        data_dir = os.path.dirname(CONFIG["output_path"])
        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)
        
        # Mettre à jour le compteur
        LIST_DATA["meta"]["count"] = sum(len(indices) for indices in LIST_DATA["indices"].values())
        
        # Mettre à jour l'horodatage
        now = datetime.now(timezone.utc)
        LIST_DATA["meta"]["timestamp"] = now.isoformat()
        LIST_DATA["meta"]["lastUpdated"] = now.isoformat()
        
        # Écrire le fichier JSON
        with open(CONFIG["output_path"], 'w', encoding='utf-8') as f:
            json.dump(LIST_DATA, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Données enregistrées dans {CONFIG['output_path']}")
        return True
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement des données: {str(e)}")
        return False

def check_existing_data():
    """Vérifier si un fichier de données existe déjà et le charger"""
    try:
        if os.path.exists(CONFIG["output_path"]):
            logger.info("📂 Fichier de données existant trouvé, chargement...")
            with open(CONFIG["output_path"], 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data
        return None
    except Exception as e:
        logger.error(f"❌ Erreur lors de la vérification du fichier existant: {str(e)}")
        return None

def try_get_markets_data():
    """Essayer de récupérer les données du fichier markets.json comme fallback"""
    markets_path = os.path.join(os.path.dirname(CONFIG["output_path"]), "markets.json")
    try:
        if os.path.exists(markets_path):
            logger.info("📂 Fichier markets.json trouvé, utilisation comme base...")
            with open(markets_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data
        return None
    except Exception as e:
        logger.error(f"❌ Erreur lors de la lecture de markets.json: {str(e)}")
        return None

def process_indices_data():
    """Traitement spécifique pour la page liste.html"""
    # Ceci est un exemple - vous pouvez personnaliser le traitement selon vos besoins
    for region in LIST_DATA["indices"]:
        for index in LIST_DATA["indices"][region]:
            # Exemple: ajouter un champ spécifique à liste.html
            index["liste_specific"] = True
            
            # Exemple: modifier la présentation des valeurs
            if "changePercent" in index and index["changePercent"]:
                # Vous pourriez par exemple ajouter des flèches ou modifier le format
                value = index["changePercent"].replace(' %', '').replace(',', '.')
                try:
                    value_float = float(value)
                    if value_float > 0:
                        index["changePercent"] = f"↑ {index['changePercent']}"
                    elif value_float < 0:
                        index["changePercent"] = f"↓ {index['changePercent']}"
                except:
                    pass

def main():
    """Point d'entrée principal"""
    try:
        logger.info("🚀 Démarrage du script de collecte des données pour liste.html")
        
        # Vérifier si les données existent déjà
        existing_data = check_existing_data()
        
        # Si des données existent, les utiliser comme base
        if existing_data:
            global LIST_DATA
            LIST_DATA = existing_data
            logger.info(f"✅ Données existantes chargées: {LIST_DATA['meta']['count']} indices")
        else:
            # Sinon, essayer d'utiliser markets.json comme base
            markets_data = try_get_markets_data()
            if markets_data:
                global LIST_DATA
                LIST_DATA = markets_data
                logger.info(f"✅ Données de markets.json chargées: {LIST_DATA['meta']['count']} indices")
        
        # Appliquer des modifications spécifiques pour liste.html
        process_indices_data()
        
        # Enregistrer les données
        if save_data():
            logger.info("✅ Traitement terminé avec succès")
            sys.exit(0)
        else:
            logger.error("❌ Échec lors de l'enregistrement des données")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()
