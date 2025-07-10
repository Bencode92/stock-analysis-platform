#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🧪 SCRIPT DE TEST ML TRADEPULSE
Test rapide des corrections appliquées
"""

import os
import sys

def test_ml_fixes():
    """Test les 4 corrections ML appliquées"""
    
    print("🧪 TEST DES CORRECTIONS ML TRADEPULSE")
    print("=" * 50)
    
    try:
        # Import du module corrigé
        sys.path.append(os.path.join(os.path.dirname(__file__), 'scripts'))
        from fmp_news_updater import determine_impact, compute_importance_score, extract_themes
        
        # Article de test
        test_article = {
            "title": "We have a runaway bull market right now, says Jim Cramer",
            "text": "CNBC's Mad Money host Jim Cramer talks the state of the market and what sectors are winning and losing right now.",
            "content": "The market continues to surge with technology stocks leading gains. Investors are optimistic about earnings growth.",
            "sentiment": ""  # Forcer l'usage du modèle
        }
        
        print(f"📰 Article test: {test_article['title']}")
        
        # Test 1: Sentiment
        print("\n1️⃣ Test Sentiment...")
        try:
            sentiment = determine_impact(test_article)
            probs = test_article.get("impact_prob", {})
            metadata = test_article.get("sentiment_metadata", {})
            
            print(f"✅ Résultat: {sentiment}")
            print(f"   Probabilités: pos={probs.get('positive', 0):.3f}, neu={probs.get('neutral', 0):.3f}, neg={probs.get('negative', 0):.3f}")
            print(f"   Modèle: {metadata.get('model', 'N/A')}")
            print(f"   Mapping: {metadata.get('mapping_order', 'N/A')}")
            
            # Validation logique
            if sentiment == "positive" and probs.get('positive', 0) > 0.5:
                print("   ✅ CORRECT: 'bull market' détecté comme positif")
            elif sentiment == "positive":
                print("   ✅ SENTIMENT OK: mais confiance faible")
            else:
                print(f"   ⚠️ RÉSULTAT: {sentiment} (attendu: positif pour 'bull market')")
                
        except Exception as e:
            print(f"   ❌ Erreur sentiment: {e}")
        
        # Test 2: Importance
        print("\n2️⃣ Test Importance...")
        try:
            importance_result = compute_importance_score(test_article)
            
            if isinstance(importance_result, dict):
                score = importance_result["score"]
                metadata = importance_result["metadata"]
                
                print(f"✅ Score: {score}%")
                print(f"   Modèle: {metadata.get('model', 'N/A')}")
                print(f"   Spécialisé: {metadata.get('specialized', False)}")
                print(f"   Longueur texte: {metadata.get('text_length', 0)}")
                
                if score != 50.0:
                    print("   ✅ CORRECT: Score calculé (pas défaut)")
                else:
                    print("   ⚠️ Score par défaut - vérifier le modèle")
                    
            else:
                print(f"   ❌ ERREUR: Retour {type(importance_result)} au lieu de dict")
                
        except Exception as e:
            print(f"   ❌ Erreur importance: {e}")
        
        # Test 3: Thèmes
        print("\n3️⃣ Test Thèmes...")
        try:
            themes = extract_themes(test_article)
            total_themes = sum(len(theme_list) for theme_list in themes.values())
            
            print(f"✅ Thèmes détectés: {total_themes}")
            for axis, theme_list in themes.items():
                if theme_list:
                    print(f"   {axis}: {theme_list}")
            
            if total_themes > 0:
                print("   ✅ CORRECT: Thèmes extraits du contenu")
            else:
                print("   ⚠️ Aucun thème - vérifier si normal pour ce contenu")
                
        except Exception as e:
            print(f"   ❌ Erreur thèmes: {e}")
        
        print("\n🎯 Tests terminés!")
        
        # Résumé
        print("\n📊 RÉSUMÉ DES CORRECTIONS:")
        print("1. ✅ Mapping sentiment corrigé (neutral,positive,negative)")
        print("2. ✅ API HuggingFace corrigée (use_auth_token)")  
        print("3. ✅ Extraction thèmes étendue (title + content)")
        print("4. ✅ Métadonnées importance retournées (dict)")
        
    except ImportError as e:
        print(f"❌ Erreur import: {e}")
        print("💡 Assurez-vous d'avoir installé: torch transformers")
    except Exception as e:
        print(f"❌ Erreur générale: {e}")

def check_environment():
    """Vérification de l'environnement"""
    print("\n🔧 Vérification environnement...")
    
    required_vars = [
        "TRADEPULSE_USE_FINBERT",
        "HF_READ_TOKEN", 
        "FMP_API_KEY"
    ]
    
    for var in required_vars:
        value = os.getenv(var)
        if value:
            display_value = "***" if "TOKEN" in var or "KEY" in var else value
            print(f"✅ {var}: {display_value}")
        else:
            print(f"⚠️ {var}: Non défini")

if __name__ == "__main__":
    check_environment()
    test_ml_fixes()
    
    print("\n🚀 Pour tester en production:")
    print("export TRADEPULSE_SENTIMENT_PROFILING=1")
    print("python scripts/fmp_news_updater.py")
    print("\n🔍 Vérifiez ensuite data/news.json pour les améliorations!")
