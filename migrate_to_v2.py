#!/usr/bin/env python3
"""
Script de migration et comparaison V1 vs V2
Usage: python migrate_to_v2.py [--test|--migrate|--compare]
"""

import os
import sys
import json
import argparse
from datetime import datetime

def test_v2():
    """Test de la version V2 sans toucher à V1"""
    print("🧪 Test de la version V2...")
    
    try:
        # Import dynamique pour éviter les erreurs si V2 n'existe pas
        sys.path.insert(0, '.')
        from generate_portfolios_v2 import generate_portfolios_v2, main as main_v2
        
        print("✅ Import V2 réussi")
        
        # Test avec données simulées si les vraies ne sont pas disponibles
        test_data = {
            'news': 'Test actualités',
            'markets': 'Test marchés', 
            'sectors': 'Test secteurs',
            'lists': '• Microsoft Corporation: YTD 12.5%, Daily 1.2% | Secteur: Technology',
            'etfs': '• Vanguard S&P 500 ETF : 8.5%',
            'crypto': '• Bitcoin (BTC): 24h: +2.5%, 7j: +8.3%',
            'themes': 'Test thèmes',
            'brief': 'Scénario économique actuel...',
            'bond_etf_names': ['iShares Euro Government Bond ETF']
        }
        
        print("🚀 Génération de portefeuilles de test...")
        portfolios = generate_portfolios_v2(test_data)
        
        # Validation basique
        if isinstance(portfolios, dict):
            print(f"✅ V2 opérationnelle - {len(portfolios)} portefeuilles générés")
            for name, portfolio in portfolios.items():
                asset_count = sum(len(assets) for cat, assets in portfolio.items() 
                                if cat not in ["Commentaire", "ActifsExclus"] and isinstance(assets, dict))
                print(f"  📊 {name}: {asset_count} actifs")
            return True
        else:
            print("❌ Format de réponse inattendu")
            return False
            
    except ImportError as e:
        print(f"❌ Erreur d'import V2: {e}")
        return False
    except Exception as e:
        print(f"❌ Erreur lors du test V2: {e}")
        return False

def compare_versions():
    """Compare V1 vs V2 sur les mêmes données"""
    print("🔍 Comparaison V1 vs V2...")
    
    try:
        # Importer les deux versions
        from generate_portfolios import generate_portfolios as gen_v1
        from generate_portfolios_v2 import generate_portfolios_v2 as gen_v2
        
        # Charger les données réelles si disponibles
        try:
            with open('brief_ia.json', 'r', encoding='utf-8') as f:
                brief_data = json.load(f)
            print("✅ Brief stratégique chargé")
        except:
            brief_data = None
            print("⚠️ Brief stratégique non trouvé, utilisation de données de test")
        
        # Préparer les données de test
        test_data = {
            'news': 'Actualités de test pour comparaison',
            'markets': 'Données de marché de test', 
            'sectors': 'Données sectorielles de test',
            'lists': '• Apple Inc: YTD 15.2%, Daily 0.8% | Secteur: Technology\n• Microsoft Corporation: YTD 12.5%, Daily 1.2% | Secteur: Technology',
            'etfs': '• Vanguard S&P 500 ETF : 8.5%\n• iShares MSCI World UCITS ETF : 6.2%',
            'crypto': '• Bitcoin (BTC): 24h: +2.5%, 7j: +8.3%\n• Ethereum (ETH): 24h: +1.8%, 7j: +5.2%',
            'themes': 'Intelligence artificielle en forte croissance',
            'brief': brief_data if brief_data else 'Brief de test',
            'bond_etf_names': ['iShares Euro Government Bond ETF', 'Vanguard Total Bond Market ETF']
        }
        
        print("\n📊 Génération V1...")
        start_time = datetime.now()
        try:
            portfolios_v1 = gen_v1(test_data)
            time_v1 = (datetime.now() - start_time).total_seconds()
            print(f"✅ V1 terminée en {time_v1:.1f}s")
        except Exception as e:
            print(f"❌ Erreur V1: {e}")
            portfolios_v1 = None
            time_v1 = 0
        
        print("\n📊 Génération V2...")
        start_time = datetime.now()
        try:
            portfolios_v2 = gen_v2(test_data)
            time_v2 = (datetime.now() - start_time).total_seconds()
            print(f"✅ V2 terminée en {time_v2:.1f}s")
        except Exception as e:
            print(f"❌ Erreur V2: {e}")
            portfolios_v2 = None
            time_v2 = 0
        
        # Comparaison des résultats
        print("\n🔍 COMPARAISON DES RÉSULTATS:")
        print(f"⏱️  Temps d'exécution: V1={time_v1:.1f}s, V2={time_v2:.1f}s")
        
        if portfolios_v1 and portfolios_v2:
            print(f"📊 Portefeuilles générés: V1={len(portfolios_v1)}, V2={len(portfolios_v2)}")
            
            # Analyser la structure
            for portfolio_type in ['Agressif', 'Modéré', 'Stable']:
                if portfolio_type in portfolios_v1 and portfolio_type in portfolios_v2:
                    p1 = portfolios_v1[portfolio_type]
                    p2 = portfolios_v2[portfolio_type]
                    
                    # Compter les actifs V1
                    count_v1 = sum(len(assets) for cat, assets in p1.items() 
                                 if cat not in ["Commentaire", "ActifsExclus"] and isinstance(assets, dict))
                    
                    # Compter les actifs V2  
                    count_v2 = sum(len(assets) for cat, assets in p2.items()
                                 if cat not in ["Commentaire", "ActifsExclus"] and isinstance(assets, dict))
                    
                    print(f"  📈 {portfolio_type}: V1={count_v1} actifs, V2={count_v2} actifs")
            
            # Sauvegarder pour analyse
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            with open(f'comparison_v1_v2_{timestamp}.json', 'w', encoding='utf-8') as f:
                json.dump({
                    'v1': portfolios_v1,
                    'v2': portfolios_v2,
                    'metadata': {
                        'timestamp': timestamp,
                        'time_v1': time_v1,
                        'time_v2': time_v2
                    }
                }, f, indent=2, ensure_ascii=False)
            
            print(f"💾 Comparaison sauvegardée: comparison_v1_v2_{timestamp}.json")
        
        return True
        
    except Exception as e:
        print(f"❌ Erreur lors de la comparaison: {e}")
        return False

def migrate_to_v2():
    """Migration complète vers V2"""
    print("🚀 Migration vers la version V2...")
    
    # Backup de la V1
    if os.path.exists('generate_portfolios.py'):
        backup_name = f"generate_portfolios_v1_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.py"
        os.rename('generate_portfolios.py', backup_name)
        print(f"📦 Backup V1 créé: {backup_name}")
    
    # Renommer V2 vers le nom principal
    if os.path.exists('generate_portfolios_v2.py'):
        # Créer un symlink ou copie
        import shutil
        shutil.copy2('generate_portfolios_v2.py', 'generate_portfolios.py')
        print("✅ V2 activée comme version principale")
        
        # Mettre à jour les imports dans d'autres fichiers si nécessaire
        update_imports()
        
        print("🎉 Migration terminée !")
        print("ℹ️  Pour revenir en arrière, restaurez le fichier backup")
        return True
    else:
        print("❌ Fichier V2 non trouvé")
        return False

def update_imports():
    """Met à jour les imports dans les autres fichiers"""
    files_to_update = ['main.py', '__init__.py', 'app.py']
    
    for filename in files_to_update:
        if os.path.exists(filename):
            try:
                with open(filename, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Remplacer les imports
                if 'from generate_portfolios import' in content:
                    new_content = content.replace(
                        'from generate_portfolios import',
                        '# Updated to V2\nfrom generate_portfolios import'
                    )
                    
                    with open(filename, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    
                    print(f"✅ Imports mis à jour dans {filename}")
            except Exception as e:
                print(f"⚠️  Erreur mise à jour {filename}: {e}")

def main():
    parser = argparse.ArgumentParser(description='Migration vers TradePulse V2')
    parser.add_argument('--test', action='store_true', help='Tester la V2 sans migration')
    parser.add_argument('--compare', action='store_true', help='Comparer V1 vs V2')
    parser.add_argument('--migrate', action='store_true', help='Migrer vers V2')
    
    args = parser.parse_args()
    
    if not any([args.test, args.compare, args.migrate]):
        print("🤖 TradePulse - Migration V1 → V2")
        print("Usage: python migrate_to_v2.py [--test|--compare|--migrate]")
        print("\n📋 Options:")
        print("  --test     : Tester V2 sans modifier V1")
        print("  --compare  : Comparer performances V1 vs V2") 
        print("  --migrate  : Migration complète (avec backup V1)")
        return
    
    if args.test:
        success = test_v2()
        if success:
            print("✅ Test V2 réussi - prêt pour migration")
        else:
            print("❌ Test V2 échoué - ne pas migrer")
    
    if args.compare:
        compare_versions()
    
    if args.migrate:
        if input("⚠️  Confirmer la migration ? (y/N): ").lower() == 'y':
            migrate_to_v2()
        else:
            print("Migration annulée")

if __name__ == "__main__":
    main()
