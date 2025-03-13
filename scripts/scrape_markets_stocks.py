#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script pour ajouter manuellement les indices boursiers majeurs du Canada et de l'Inde
qui pourraient être manquants dans les données collectées de Boursorama
"""

import os
import json
import sys
from datetime import datetime

# Chemin du fichier de données
DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "markets.json")

# Indices additionnels à ajouter (si non présents)
ADDITIONAL_INDICES = {
    # Indices Canadiens
    "north-america": [
        {
            "country": "Canada",
            "index_name": "S&P/TSX Composite",
            "value": "24 777,91",
            "change": "0,78 %",
            "changePercent": "0,78 %",
            "ytdChange": "5,21 %",
            "opening": "24 584,04",
            "high": "",
            "low": "",
            "trend": "up"
        },
        {
            "country": "Canada",
            "index_name": "S&P/TSX 60",
            "value": "1 491,78",
            "change": "0,82 %",
            "changePercent": "0,82 %",
            "ytdChange": "4,95 %",
            "opening": "1 479,66",
            "high": "",
            "low": "",
            "trend": "up"
        }
    ],
    # Indices Indiens
    "asia": [
        {
            "country": "Inde",
            "index_name": "BSE SENSEX",
            "value": "74 339,44",
            "change": "0,14 %",
            "changePercent": "0,14 %",
            "ytdChange": "2,86 %",
            "opening": "74 235,26",
            "high": "",
            "low": "",
            "trend": "up"
        },
        {
            "country": "Inde",
            "index_name": "NIFTY 50",
            "value": "22 624,80",
            "change": "0,17 %",
            "changePercent": "0,17 %",
            "ytdChange": "3,09 %",
            "opening": "22 587,95",
            "high": "",
            "low": "",
            "trend": "up"
        }
    ]
}

def load_market_data():
    """Charge les données de marché existantes"""
    try:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    except Exception as e:
        print(f"Erreur lors du chargement des données: {str(e)}")
        return None

def save_market_data(data):
    """Enregistre les données mises à jour"""
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"✅ Données enregistrées dans {DATA_FILE}")
        return True
    except Exception as e:
        print(f"❌ Erreur lors de l'enregistrement des données: {str(e)}")
        return False

def add_missing_indices(data):
    """Ajoute les indices manquants aux données existantes"""
    if not data:
        print("❌ Aucune donnée existante pour ajouter des indices")
        return False
    
    changes_made = False
    
    # Pour chaque région et ses indices à ajouter
    for region, indices in ADDITIONAL_INDICES.items():
        # Vérifier si la région existe
        if region not in data["indices"]:
            data["indices"][region] = []
        
        # Pour chaque indice à ajouter
        for index_to_add in indices:
            # Vérifier si l'indice est déjà présent
            already_present = False
            for existing_index in data["indices"][region]:
                if (existing_index["country"] == index_to_add["country"] and 
                    existing_index["index_name"] == index_to_add["index_name"]):
                    already_present = True
                    break
            
            # Ajouter l'indice s'il n'est pas déjà présent
            if not already_present:
                data["indices"][region].append(index_to_add)
                print(f"✅ Ajout de {index_to_add['country']} - {index_to_add['index_name']} à la région {region}")
                changes_made = True
            else:
                print(f"ℹ️ L'indice {index_to_add['country']} - {index_to_add['index_name']} est déjà présent")
    
    # Mettre à jour le compteur
    if changes_made:
        data["meta"]["count"] = sum(len(indices) for indices in data["indices"].values())
        data["meta"]["lastUpdated"] = datetime.now().isoformat()
    
    return changes_made

def main():
    """Point d'entrée principal"""
    try:
        print("🚀 Vérification et ajout des indices manquants...")
        
        # Charger les données existantes
        data = load_market_data()
        if not data:
            print("❌ Impossible de charger les données existantes")
            sys.exit(1)
        
        # Ajouter les indices manquants
        if add_missing_indices(data):
            # Enregistrer les données mises à jour
            if save_market_data(data):
                print("✅ Indices manquants ajoutés avec succès")
            else:
                print("❌ Échec lors de l'enregistrement des données mises à jour")
                sys.exit(1)
        else:
            print("ℹ️ Aucun nouvel indice à ajouter")
        
        sys.exit(0)
        
    except Exception as e:
        print(f"❌ Erreur fatale: {str(e)}")
        import traceback
        print(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()
