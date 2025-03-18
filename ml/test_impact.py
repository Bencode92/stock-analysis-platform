"""
Script de test pour la classification d'impact

Ce script permet de tester la classification d'impact des actualités
financières avec le nouveau système hybride.
"""

import os
import json
from news_classifier import NewsClassifier

# Actualités de test avec différents niveaux d'impact
TEST_NEWS = [
    {
        "title": "Le CAC 40 termine la séance en légère hausse de 0.2%",
        "content": "La Bourse de Paris a terminé en hausse modérée de 0.2% aujourd'hui, portée par les valeurs du luxe.",
        "expected_impact": "neutral"
    },
    {
        "title": "ALERTE: Krach boursier, le Dow Jones s'effondre de 12% en une séance",
        "content": "Les marchés américains connaissent leur pire journée depuis 1987 avec une chute vertigineuse de 12% sur le Dow Jones suite aux inquiétudes concernant la récession.",
        "expected_impact": "high"  # Devrait maintenant être reconnu comme 'high' même si le sentiment est neutre
    },
    {
        "title": "La Réserve Fédérale maintient ses taux directeurs",
        "content": "La Fed a décidé de maintenir ses taux d'intérêt inchangés, conformément aux attentes des analystes.",
        "expected_impact": "neutral"
    },
    {
        "title": "URGENT: Tesla annonce des profits record au 3ème trimestre",
        "content": "Le constructeur automobile électrique a annoncé des résultats largement supérieurs aux attentes avec un bénéfice net en hausse de 58%.",
        "expected_impact": "positive"
    },
    {
        "title": "Récession économique au Royaume-Uni, le PIB recule de 0.8%",
        "content": "L'économie britannique entre officiellement en récession technique après deux trimestres consécutifs de contraction du PIB.",
        "expected_impact": "high"  # Devrait maintenant être reconnu comme 'high' même si le sentiment est neutre
    },
    {
        "title": "Apple dévoile son nouveau produit révolutionnaire",
        "content": "La firme à la pomme a surpris les analystes avec l'annonce d'un nouveau produit qui pourrait transformer le marché des technologies portables.",
        "expected_impact": "positive"
    },
    {
        "title": "Faillite de la Silicon Valley Bank, panique dans le secteur bancaire",
        "content": "La faillite de la Silicon Valley Bank provoque une onde de choc dans le secteur bancaire avec des craintes de contagion.",
        "expected_impact": "high"  # Devrait maintenant être reconnu comme 'high' même si le sentiment est neutre
    }
]

def main():
    """Fonction principale pour tester la classification d'impact"""
    print("🔍 Test de classification d'impact des actualités financières")
    print("=" * 80)
    
    # Instancier le classificateur
    classifier = NewsClassifier(use_cache=False)
    
    results = {
        "correct": 0,
        "total": len(TEST_NEWS),
        "details": []
    }
    
    # Tester chaque actualité
    for i, news in enumerate(TEST_NEWS):
        print(f"\n📰 Actualité #{i+1}:")
        print(f"Titre: {news['title']}")
        print(f"Contenu: {news['content']}")
        print(f"Impact attendu: {news['expected_impact']}")
        
        # Créer un objet complet pour le classificateur
        news_item = {
            "title": news["title"],
            "content": news["content"]
        }
        
        # Classifier l'actualité
        result = classifier.classify_news_item(news_item)
        
        print(f"Sentiment détecté: {result['sentiment']} (confiance: {result['confidence']:.2f})")
        print(f"Impact calculé: {result['impact']}")
        print(f"Score d'impact: {result['impact_score']}")
        
        # Vérifier si l'impact correspond à l'attendu
        is_correct = (
            (result["impact"] == news["expected_impact"]) or 
            (result["impact"] == "negative" and news["expected_impact"] == "high") or
            (result["impact"] == "positive" and news["expected_impact"] == "high")
        )
        
        if is_correct:
            print("✅ CORRECT")
            results["correct"] += 1
        else:
            print("❌ INCORRECT")
        
        # Ajouter les détails au résultat
        results["details"].append({
            "title": news["title"],
            "expected_impact": news["expected_impact"],
            "actual_impact": result["impact"],
            "sentiment": result["sentiment"],
            "confidence": result["confidence"],
            "impact_score": result["impact_score"],
            "correct": is_correct
        })
    
    # Afficher le résumé
    print("\n" + "=" * 80)
    print(f"📊 Résultats du test: {results['correct']}/{results['total']} corrects ({results['correct']/results['total']*100:.1f}%)")
    
    # Sauvegarder les résultats
    results_dir = os.path.join(os.path.dirname(__file__), "test_results")
    os.makedirs(results_dir, exist_ok=True)
    
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results_file = os.path.join(results_dir, f"impact_test_results_{timestamp}.json")
    
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"📝 Résultats sauvegardés dans: {results_file}")

if __name__ == "__main__":
    main()
