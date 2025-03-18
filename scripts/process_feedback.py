#!/usr/bin/env python3
import os
import json
import sys
import argparse
from datetime import datetime

# Ajouter le chemin parent pour pouvoir importer le module ml
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.news_classifier import NewsClassifier

# Dossier pour stocker les feedbacks
FEEDBACK_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/feedback')
FEEDBACK_FILE = os.path.join(FEEDBACK_DIR, 'feedback_data.json')

def ensure_feedback_directory():
    """S'assure que le dossier de feedback existe"""
    os.makedirs(FEEDBACK_DIR, exist_ok=True)

def load_feedback_data():
    """Charge les données de feedback existantes"""
    if os.path.exists(FEEDBACK_FILE):
        try:
            with open(FEEDBACK_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Erreur lors du chargement des données de feedback: {e}")
            return {"items": [], "last_updated": None}
    else:
        return {"items": [], "last_updated": None}

def process_new_feedback(input_file):
    """Traite un nouveau fichier de feedback et le fusionne avec les données existantes"""
    # Charger les données existantes
    feedback_data = load_feedback_data()
    
    # Charger les nouvelles données
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            new_feedback = json.load(f)
    except Exception as e:
        print(f"Erreur lors du chargement du fichier de feedback: {e}")
        return False
    
    # Vérifier le format du nouveau feedback
    if not isinstance(new_feedback, list):
        if "items" in new_feedback:
            new_feedback = new_feedback["items"]
        else:
            print("Format de feedback invalide")
            return False
    
    # Ajouter les nouveaux éléments de feedback
    item_count = 0
    for item in new_feedback:
        # Vérifier si l'élément existe déjà (basé sur l'ID)
        item_id = item.get("id")
        if not item_id:
            continue
        
        # Vérifier si l'élément existe déjà
        existing_item = next((i for i in feedback_data["items"] if i.get("id") == item_id), None)
        
        if existing_item:
            # Mettre à jour l'élément existant
            existing_item.update(item)
            existing_item["updated_at"] = datetime.now().isoformat()
        else:
            # Ajouter le nouvel élément
            item["created_at"] = datetime.now().isoformat()
            item["updated_at"] = datetime.now().isoformat()
            feedback_data["items"].append(item)
        
        item_count += 1
    
    # Mettre à jour la date de dernière mise à jour
    feedback_data["last_updated"] = datetime.now().isoformat()
    
    # Sauvegarder les données fusionnées
    ensure_feedback_directory()
    with open(FEEDBACK_FILE, 'w', encoding='utf-8') as f:
        json.dump(feedback_data, f, ensure_ascii=False, indent=2)
    
    print(f"Traitement terminé: {item_count} éléments de feedback ajoutés/mis à jour")
    return True

def generate_training_data():
    """Génère des données d'entraînement à partir des feedbacks"""
    feedback_data = load_feedback_data()
    
    training_data = []
    
    for item in feedback_data["items"]:
        # Vérifier si nous avons les données nécessaires
        if "title" not in item or "content" not in item or "corrected_sentiment" not in item:
            continue
        
        # Créer un exemple d'entraînement
        training_example = {
            "text": f"{item['title']}. {item['content']}",
            "label": item["corrected_sentiment"]
        }
        
        training_data.append(training_example)
    
    # Sauvegarder les données d'entraînement
    if training_data:
        training_file = os.path.join(FEEDBACK_DIR, 'training_data.json')
        with open(training_file, 'w', encoding='utf-8') as f:
            json.dump(training_data, f, ensure_ascii=False, indent=2)
        
        print(f"Données d'entraînement générées: {len(training_data)} exemples")
        return training_file
    else:
        print("Aucune donnée d'entraînement générée")
        return None

def main():
    parser = argparse.ArgumentParser(description='Traite les feedbacks ML pour améliorer le modèle')
    parser.add_argument('--input', '-i', help='Fichier JSON contenant les nouveaux feedbacks')
    parser.add_argument('--generate', '-g', action='store_true', help='Générer des données d\'entraînement')
    
    args = parser.parse_args()
    
    if args.input:
        if process_new_feedback(args.input):
            print("Traitement des feedbacks terminé avec succès")
        else:
            print("Erreur lors du traitement des feedbacks")
            sys.exit(1)
    
    if args.generate:
        training_file = generate_training_data()
        if training_file:
            print(f"Données d'entraînement générées dans {training_file}")
        else:
            print("Aucune donnée d'entraînement générée")
    
    if not args.input and not args.generate:
        parser.print_help()

if __name__ == "__main__":
    main()
