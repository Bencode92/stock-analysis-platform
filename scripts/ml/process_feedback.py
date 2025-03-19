#!/usr/bin/env python3
"""
process_feedback.py - Traite les feedbacks ML pour améliorer le modèle

Ce script collecte les feedbacks des utilisateurs sur les classifications d'actualités,
les intègre dans le jeu de données d'entraînement, et prépare les données
pour un réentraînement du modèle FinBERT.
"""

import os
import json
import glob
import datetime
import logging
from typing import Dict, List, Any, Optional

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("ml-feedback-processor")

# Chemins des fichiers
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FEEDBACK_FILE = os.path.join(REPO_ROOT, 'data', 'ml_feedback.json')
FEEDBACK_DIR = os.path.join(REPO_ROOT, 'data')
FEEDBACK_ARCHIVE_DIR = os.path.join(REPO_ROOT, 'data', 'ml_feedback_archive')
TRAINING_DATA_FILE = os.path.join(REPO_ROOT, 'ml', 'training_data', 'finbert_training_data.json')


def ensure_directories():
    """S'assure que les répertoires nécessaires existent."""
    os.makedirs(FEEDBACK_ARCHIVE_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(TRAINING_DATA_FILE), exist_ok=True)


def load_feedback_data() -> Dict[str, Any]:
    """Charge les données de feedback depuis le fichier principal."""
    try:
        with open(FEEDBACK_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            logger.info(f"Chargement de {len(data[0]['feedbacks'])} feedbacks depuis le fichier principal")
            return data[0]
    except (FileNotFoundError, json.JSONDecodeError, IndexError) as e:
        logger.warning(f"Erreur lors du chargement des feedbacks: {e}")
        # Créer une structure par défaut
        return {"meta": {"version": "1.0.0", "lastUpdated": datetime.datetime.now().isoformat(), 
                         "feedbackCount": 0, "model": "finbert-v1"}, "feedbacks": []}


def find_additional_feedback_files() -> List[str]:
    """Trouve d'autres fichiers de feedback dans le répertoire des données."""
    return glob.glob(os.path.join(FEEDBACK_DIR, 'ml_feedback_*.json'))


def load_additional_feedback(file_path: str) -> List[Dict[str, Any]]:
    """Charge les données de feedback depuis un fichier supplémentaire."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            logger.info(f"Chargement de {len(data)} feedbacks depuis {file_path}")
            return data
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning(f"Erreur lors du chargement de {file_path}: {e}")
        return []


def save_feedback_data(data: Dict[str, Any]):
    """Enregistre les données de feedback dans le fichier principal."""
    # Mettre à jour les métadonnées
    data["meta"]["lastUpdated"] = datetime.datetime.now().isoformat()
    data["meta"]["feedbackCount"] = len(data["feedbacks"])
    
    # Enregistrer dans le fichier
    with open(FEEDBACK_FILE, 'w', encoding='utf-8') as f:
        json.dump([data], f, indent=2, ensure_ascii=False)
    
    logger.info(f"Enregistrement de {len(data['feedbacks'])} feedbacks dans le fichier principal")


def archive_processed_file(file_path: str):
    """Archive un fichier de feedback après traitement."""
    try:
        filename = os.path.basename(file_path)
        archive_path = os.path.join(FEEDBACK_ARCHIVE_DIR, f"{filename}.processed")
        
        # Lire le contenu du fichier
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Écrire dans le fichier d'archive
        with open(archive_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        # Supprimer le fichier original
        os.remove(file_path)
        
        logger.info(f"Fichier archivé: {file_path} -> {archive_path}")
    except Exception as e:
        logger.error(f"Erreur lors de l'archivage de {file_path}: {e}")


def merge_feedbacks(main_data: Dict[str, Any], additional_files: List[str]) -> Dict[str, Any]:
    """Fusionne les feedbacks des fichiers supplémentaires avec les données principales."""
    # Ensemble pour éviter les doublons (basé sur l'ID)
    existing_ids = {feedback.get('id') for feedback in main_data["feedbacks"]}
    
    # Parcourir les fichiers supplémentaires
    for file_path in additional_files:
        feedbacks = load_additional_feedback(file_path)
        
        # Ajouter chaque feedback s'il n'existe pas déjà
        for feedback in feedbacks:
            if feedback.get('id') and feedback.get('id') not in existing_ids:
                main_data["feedbacks"].append(feedback)
                existing_ids.add(feedback.get('id'))
        
        # Archiver le fichier traité
        archive_processed_file(file_path)
    
    logger.info(f"Fusion terminée. Total des feedbacks: {len(main_data['feedbacks'])}")
    return main_data


def prepare_training_data(feedbacks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Prépare les données d'entraînement à partir des feedbacks."""
    training_data = []
    
    for feedback in feedbacks:
        # Vérifier que nous avons les données nécessaires
        if not (feedback.get('title') and feedback.get('content') and 
                feedback.get('corrected') and feedback.get('corrected').get('sentiment')):
            continue
        
        # Créer un exemple d'entraînement
        example = {
            "text": f"{feedback['title']} {feedback['content']}",
            "label": feedback['corrected']['sentiment'],
            "source": "user_feedback",
            "timestamp": feedback.get('timestamp', datetime.datetime.now().isoformat())
        }
        
        training_data.append(example)
    
    logger.info(f"Préparation de {len(training_data)} exemples d'entraînement")
    return training_data


def save_training_data(training_data: List[Dict[str, Any]]):
    """Enregistre les données d'entraînement."""
    # Charger les données existantes si présentes
    existing_data = []
    try:
        with open(TRAINING_DATA_FILE, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
        logger.info(f"Chargement de {len(existing_data)} exemples d'entraînement existants")
    except (FileNotFoundError, json.JSONDecodeError):
        logger.warning("Aucune donnée d'entraînement existante trouvée")
    
    # Fusionner avec les nouvelles données
    # Ensemble pour éviter les doublons (basé sur le texte)
    existing_texts = {example.get('text') for example in existing_data}
    
    for example in training_data:
        if example.get('text') and example.get('text') not in existing_texts:
            existing_data.append(example)
            existing_texts.add(example.get('text'))
    
    # Enregistrer les données fusionnées
    with open(TRAINING_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)
    
    logger.info(f"Enregistrement de {len(existing_data)} exemples d'entraînement")


def main():
    """Fonction principale du script."""
    logger.info("Démarrage du traitement des feedbacks ML")
    
    # S'assurer que les répertoires existent
    ensure_directories()
    
    # Charger les données de feedback principales
    main_data = load_feedback_data()
    
    # Trouver et fusionner les fichiers supplémentaires
    additional_files = find_additional_feedback_files()
    if additional_files:
        logger.info(f"Trouvé {len(additional_files)} fichiers de feedback supplémentaires")
        main_data = merge_feedbacks(main_data, additional_files)
    
    # Enregistrer les données fusionnées
    save_feedback_data(main_data)
    
    # Préparer les données d'entraînement
    training_data = prepare_training_data(main_data["feedbacks"])
    
    # Enregistrer les données d'entraînement
    if training_data:
        save_training_data(training_data)
    
    logger.info("Traitement des feedbacks ML terminé")


if __name__ == "__main__":
    main()
