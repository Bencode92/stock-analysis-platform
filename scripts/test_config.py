#!/usr/bin/env python3
"""
Script de test pour vérifier le bon fonctionnement des scripts de mise à jour
"""

import os
import sys
import json
from datetime import datetime

def test_sectors_file():
    """Teste l'existence et la validité du fichier sectors.json"""
    print("📊 Test du fichier sectors.json...")
    
    filepath = "data/sectors.json"
    if not os.path.exists(filepath):
        print("❌ Fichier sectors.json introuvable")
        return False
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Vérifier la structure
        if "sectors" not in data or "meta" not in data:
            print("❌ Structure invalide dans sectors.json")
            return False
        
        # Compter les ETFs
        total_etfs = sum(len(etfs) for etfs in data["sectors"].values())
        
        print(f"✅ Fichier sectors.json valide")
        print(f"   - Catégories: {len(data['sectors'])}")
        print(f"   - ETFs totaux: {total_etfs}")
        print(f"   - Dernière mise à jour: {data['meta'].get('timestamp', 'N/A')}")
        
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ Erreur de parsing JSON: {e}")
        return False
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False

def test_holdings_file():
    """Teste l'existence et la validité du fichier etf_holdings.json"""
    print("\n📈 Test du fichier etf_holdings.json...")
    
    filepath = "data/etf_holdings.json"
    if not os.path.exists(filepath):
        print("⚠️ Fichier etf_holdings.json introuvable (normal si pas encore généré)")
        return None  # Pas critique
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Vérifier la structure
        if "etfs" not in data or "meta" not in data:
            print("❌ Structure invalide dans etf_holdings.json")
            return False
        
        # Statistiques
        etf_count = len(data["etfs"])
        total_holdings = sum(
            len(etf.get("holdings", [])) 
            for etf in data["etfs"].values()
        )
        
        print(f"✅ Fichier etf_holdings.json valide")
        print(f"   - ETFs avec holdings: {etf_count}")
        print(f"   - Holdings totaux: {total_holdings}")
        print(f"   - Dernière génération: {data['meta'].get('generated_at', 'N/A')}")
        
        # Vérifier l'âge du fichier
        file_time = os.path.getmtime(filepath)
        age_days = (datetime.now().timestamp() - file_time) / 86400
        
        if age_days > 7:
            print(f"   ⚠️ Fichier ancien ({age_days:.0f} jours)")
        
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ Erreur de parsing JSON: {e}")
        return False
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False

def test_api_key():
    """Vérifie la présence de la clé API"""
    print("\n🔑 Test de la clé API...")
    
    api_key = os.getenv("TWELVE_DATA_API")
    if api_key:
        print(f"✅ Clé API configurée (longueur: {len(api_key)} caractères)")
        return True
    else:
        print("❌ Clé API non configurée (variable TWELVE_DATA_API)")
        print("   Définissez-la avec: export TWELVE_DATA_API=votre_clé")
        return False

def main():
    print("=" * 60)
    print("🧪 TEST DE LA CONFIGURATION")
    print("=" * 60)
    
    all_ok = True
    
    # Test 1: Fichier sectors
    if not test_sectors_file():
        all_ok = False
    
    # Test 2: Fichier holdings (optionnel)
    holdings_result = test_holdings_file()
    if holdings_result is False:  # Seulement si erreur, pas si absent
        all_ok = False
    
    # Test 3: Clé API
    if not test_api_key():
        all_ok = False
    
    # Résumé
    print("\n" + "=" * 60)
    if all_ok:
        print("✅ TOUS LES TESTS PASSÉS")
        print("\n💡 Commandes utiles:")
        print("   - Mise à jour secteurs: python scripts/update_sectors_data_etf.py")
        print("   - Mise à jour holdings: python scripts/update_holdings.py")
    else:
        print("⚠️ CERTAINS TESTS ONT ÉCHOUÉ")
        print("\nVérifiez les erreurs ci-dessus et corrigez-les.")
    print("=" * 60)
    
    return 0 if all_ok else 1

if __name__ == "__main__":
    sys.exit(main())
