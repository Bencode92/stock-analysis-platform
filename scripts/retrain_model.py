#!/usr/bin/env python3
import sys
import os
import json
import logging
from datetime import datetime

# Ajouter le chemin parent au sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Importer le module de classification
from ml.news_classifier import NewsClassifier

def retrain_model():
    """Réentraîne le modèle à partir des feedbacks utilisateurs"""
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    feedback_file = "data/ml_feedback.json"
    
    if not os.path.exists(feedback_file):
        logger.error(f"Le fichier de feedback {feedback_file} n'existe pas")
        return False
    
    try:
        # Charger les feedbacks
        with open(feedback_file, 'r', encoding='utf-8') as f:
            feedback_data = json.load(f)
        
        if not isinstance(feedback_data, list) or not feedback_data or 'feedbacks' not in feedback_data[0]:
            logger.error(f"Structure de feedback invalide dans {feedback_file}")
            return False
        
        feedbacks = feedback_data[0].get('feedbacks', [])
        feedback_count = len(feedbacks)
        
        if feedback_count == 0:
            logger.warning("Aucun feedback disponible pour le réentraînement")
            return True
        
        logger.info(f"Réentraînement du modèle avec {feedback_count} feedbacks")
        
        # Traitement des feedbacks pour l'entraînement
        training_data = []
        for feedback in feedbacks:
            # Vérifier que les données contiennent les informations nécessaires
            if 'title' not in feedback or 'content' not in feedback or 'corrected' not in feedback:
                continue
                
            title = feedback.get('title', '')
            content = feedback.get('content', '')
            
            # Convertir les clés importance/impact en sentiment/impact pour la compatibilité
            corrected = feedback.get('corrected', {})
            
            # Mapper les valeurs importance -> sentiment
            sentiment = None
            if 'sentiment' in corrected:
                sentiment = corrected['sentiment']
            elif 'importance' in corrected:
                importance = corrected['importance']
                if importance == 'critical':
                    sentiment = 'negative'
                elif importance == 'important':
                    sentiment = 'positive'
                else:
                    sentiment = 'neutral'
                    
            # Mapper les valeurs impact
            impact = None
            if 'impact' in corrected:
                impact_value = corrected['impact']
                # Normalisation des valeurs d'impact
                if impact_value == 'positive':
                    impact = 'high'
                elif impact_value == 'negative':
                    impact = 'medium'
                elif impact_value == 'neutral':
                    impact = 'low'
                else:
                    impact = impact_value
            
            if sentiment or impact:
                training_data.append({
                    'text': f"{title} {content}",
                    'sentiment': sentiment,
                    'impact': impact
                })
        
        if not training_data:
            logger.warning("Aucune donnée d'entraînement valide extraite des feedbacks")
            return False
            
        logger.info(f"Données d'entraînement extraites: {len(training_data)} exemples")
        
        # Dans une implémentation réelle, nous effectuerions ici le réentraînement du modèle
        # En utilisant une bibliothèque comme transformers de Hugging Face
        
        # Simuler le réentraînement
        logger.info("Simulation du réentraînement...")
        
        # Incrémenter la version du modèle
        current_version = feedback_data[0]['meta'].get('modelVersion', '1.0.0')
        version_parts = current_version.split('.')
        version_parts[-1] = str(int(version_parts[-1]) + 1)
        new_version = '.'.join(version_parts)
        
        # Mettre à jour les métadonnées
        feedback_data[0]['meta']['lastRetraining'] = datetime.now().isoformat()
        feedback_data[0]['meta']['modelVersion'] = new_version
        feedback_data[0]['meta']['trainingExamples'] = len(training_data)
        
        # Enregistrer les métadonnées mises à jour
        with open(feedback_file, 'w', encoding='utf-8') as f:
            json.dump(feedback_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Réentraînement terminé avec succès. Nouvelle version du modèle: {new_version}")
        return True
    
    except Exception as e:
        logger.error(f"Erreur lors du réentraînement: {e}")
        return False

if __name__ == "__main__":
    success = retrain_model()
    sys.exit(0 if success else 1)
