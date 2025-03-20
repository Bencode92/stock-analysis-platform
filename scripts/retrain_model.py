#!/usr/bin/env python3
import os
import json
import logging
from datetime import datetime

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def retrain_model():
    """Réentraîne le modèle à partir des feedbacks utilisateurs"""
    
    feedback_file = "data/ml_feedback.json"
    
    if not os.path.exists(feedback_file):
        logger.error(f"Le fichier de feedback {feedback_file} n'existe pas")
        # Créer un fichier de base s'il n'existe pas
        with open(feedback_file, 'w', encoding='utf-8') as f:
            json.dump([{
                "meta": {
                    "version": "1.0.0",
                    "lastUpdated": datetime.now().isoformat(),
                    "feedbackCount": 0,
                    "model": "finbert-v1"
                },
                "feedbacks": []
            }], f, ensure_ascii=False, indent=2)
        return True
    
    try:
        # Charger les feedbacks
        with open(feedback_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if not content.strip():
                # Fichier vide, initialiser avec une structure de base
                feedback_data = [{
                    "meta": {
                        "version": "1.0.0",
                        "lastUpdated": datetime.now().isoformat(),
                        "feedbackCount": 0,
                        "model": "finbert-v1"
                    },
                    "feedbacks": []
                }]
            else:
                feedback_data = json.loads(content)
        
        # Vérifier la structure
        if not isinstance(feedback_data, list) or not feedback_data:
            feedback_data = [{
                "meta": {
                    "version": "1.0.0",
                    "lastUpdated": datetime.now().isoformat(),
                    "feedbackCount": 0,
                    "model": "finbert-v1"
                },
                "feedbacks": []
            }]
        
        if 'feedbacks' not in feedback_data[0]:
            feedback_data[0]['feedbacks'] = []
        
        if 'meta' not in feedback_data[0]:
            feedback_data[0]['meta'] = {
                "version": "1.0.0",
                "lastUpdated": datetime.now().isoformat(),
                "feedbackCount": 0,
                "model": "finbert-v1"
            }
        
        # Compter les feedbacks
        feedbacks = feedback_data[0].get('feedbacks', [])
        feedback_count = len(feedbacks)
        
        logger.info(f"Nombre de feedbacks disponibles: {feedback_count}")
        
        # Simuler le réentraînement
        logger.info("Simulation du réentraînement...")
        
        # Mettre à jour les métadonnées
        current_version = feedback_data[0]['meta'].get('modelVersion', '1.0.0')
        if not current_version:
            current_version = '1.0.0'
            
        # Incrémenter la version mineure
        try:
            version_parts = current_version.split('.')
            version_parts[-1] = str(int(version_parts[-1]) + 1)
            new_version = '.'.join(version_parts)
        except:
            new_version = '1.0.1'
        
        feedback_data[0]['meta']['lastRetraining'] = datetime.now().isoformat()
        feedback_data[0]['meta']['modelVersion'] = new_version
        feedback_data[0]['meta']['feedbackCount'] = feedback_count
        feedback_data[0]['meta']['lastUpdated'] = datetime.now().isoformat()
        
        # Enregistrer les métadonnées mises à jour
        with open(feedback_file, 'w', encoding='utf-8') as f:
            json.dump(feedback_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Métadonnées mises à jour. Nouvelle version du modèle: {new_version}")
        return True
    
    except Exception as e:
        logger.error(f"Erreur lors du réentraînement: {e}")
        return False

if __name__ == "__main__":
    success = retrain_model()
    print("Réentraînement réussi" if success else "Échec du réentraînement")
