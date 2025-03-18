"""
Module pour la classification de hiérarchie d'actualités financières

Ce module fournit les fonctionnalités pour entraîner et utiliser un modèle 
spécifique à la classification de hiérarchie (critique, importante, normale).
"""

import os
import json
import pickle
import numpy as np
from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
from transformers import DataCollatorWithPadding
from datasets import Dataset
from sklearn.model_selection import train_test_split

# Chemins
BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, "models")
HIERARCHY_MODEL_DIR = os.path.join(MODELS_DIR, "hierarchy_model")
FEEDBACK_DIR = os.path.join(BASE_DIR, "feedback")
FEEDBACK_FILE = os.path.join(FEEDBACK_DIR, "feedback_data.json")

# S'assurer que les répertoires existent
for directory in [MODELS_DIR, HIERARCHY_MODEL_DIR, FEEDBACK_DIR]:
    os.makedirs(directory, exist_ok=True)

class HierarchyClassifier:
    def __init__(self):
        self.tokenizer = None
        self.model = None
        self.classifier = None
        self.hierarchy_mapping = {
            "critical": 0,
            "important": 1,
            "normal": 2
        }
        self.reverse_mapping = {
            0: "critical",
            1: "important",
            2: "normal"
        }
        
        # Essayer de charger le modèle existant
        try:
            self._load_model()
        except Exception as e:
            print(f"Erreur lors du chargement du modèle de hiérarchie: {e}")
            print("Le modèle devra être créé avec des données de feedback.")
    
    def _load_model(self):
        """Charge un modèle de hiérarchie existant"""
        if os.path.exists(HIERARCHY_MODEL_DIR) and os.listdir(HIERARCHY_MODEL_DIR):
            print("Chargement du modèle de hiérarchie existant...")
            self.tokenizer = AutoTokenizer.from_pretrained(HIERARCHY_MODEL_DIR)
            self.model = AutoModelForSequenceClassification.from_pretrained(HIERARCHY_MODEL_DIR)
            self.classifier = pipeline("text-classification", model=self.model, tokenizer=self.tokenizer)
            print("Modèle de hiérarchie chargé avec succès.")
            return True
        else:
            print("Aucun modèle de hiérarchie existant trouvé.")
            return False
    
    def _prepare_data(self, feedback_data=None):
        """Prépare les données pour l'entraînement"""
        # Si aucune donnée n'est fournie, charger depuis le fichier de feedback
        if feedback_data is None:
            if os.path.exists(FEEDBACK_FILE):
                try:
                    with open(FEEDBACK_FILE, 'r', encoding='utf-8') as f:
                        feedback_data = json.load(f)
                except Exception as e:
                    print(f"Erreur lors du chargement des données de feedback: {e}")
                    return None, None
            else:
                print(f"Fichier de feedback non trouvé: {FEEDBACK_FILE}")
                return None, None
        
        if not feedback_data:
            print("Aucune donnée de feedback disponible.")
            return None, None
        
        # Extraire les textes et les étiquettes de hiérarchie
        texts = []
        labels = []
        
        for item in feedback_data:
            if "correctHierarchy" not in item or "title" not in item:
                continue
            
            # Combiner titre et contenu si disponible
            text = item.get("title", "")
            if "content" in item and item["content"]:
                text += ". " + item["content"]
            
            # Obtenir l'étiquette numérique pour la hiérarchie
            label_text = item["correctHierarchy"]
            if label_text not in self.hierarchy_mapping:
                continue
            
            label = self.hierarchy_mapping[label_text]
            
            texts.append(text)
            labels.append(label)
        
        if not texts:
            print("Aucune donnée valide extraite du feedback.")
            return None, None
        
        print(f"Données préparées: {len(texts)} exemples")
        return texts, labels
    
    def _initialize_base_model(self):
        """Initialise un modèle de base pour la classification de hiérarchie"""
        # Utiliser BERT français ou multilingue
        model_name = "camembert-base"  # ou "bert-base-multilingual-cased"
        
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(
                model_name, 
                num_labels=len(self.hierarchy_mapping)
            )
            return True
        except Exception as e:
            print(f"Erreur lors de l'initialisation du modèle de base: {e}")
            return False
    
    def create_or_retrain_model(self, feedback_data=None, validation_split=0.2, epochs=3, batch_size=8, learning_rate=5e-5):
        """Crée ou réentraîne un modèle pour la classification de hiérarchie"""
        # Préparer les données
        texts, labels = self._prepare_data(feedback_data)
        if texts is None or not texts:
            print("Impossible de créer un modèle sans données d'entraînement.")
            return False
        
        # Diviser en ensembles d'entraînement et de validation
        train_texts, val_texts, train_labels, val_labels = train_test_split(
            texts, labels, test_size=validation_split, random_state=42, stratify=labels
        )
        
        # Utiliser le modèle existant ou initialiser un nouveau
        if self.model is None or self.tokenizer is None:
            success = self._initialize_base_model()
            if not success:
                print("Échec de l'initialisation du modèle de base.")
                return False
        
        # Préparer les données d'entraînement
        def tokenize_function(examples):
            return self.tokenizer(examples["text"], truncation=True, padding="max_length", max_length=512)
        
        # Créer les datasets
        train_dataset = Dataset.from_dict({
            "text": train_texts,
            "label": train_labels
        })
        val_dataset = Dataset.from_dict({
            "text": val_texts,
            "label": val_labels
        })
        
        # Tokeniser
        train_dataset = train_dataset.map(tokenize_function, batched=True)
        val_dataset = val_dataset.map(tokenize_function, batched=True)
        
        # Collateur de données
        data_collator = DataCollatorWithPadding(tokenizer=self.tokenizer)
        
        # Configurer l'entraînement
        from transformers import TrainingArguments, Trainer
        
        training_args = TrainingArguments(
            output_dir=os.path.join(MODELS_DIR, "hierarchy_training"),
            learning_rate=learning_rate,
            per_device_train_batch_size=batch_size,
            per_device_eval_batch_size=batch_size,
            num_train_epochs=epochs,
            weight_decay=0.01,
            evaluation_strategy="epoch",
            save_strategy="epoch",
            load_best_model_at_end=True,
        )
        
        # Créer le trainer
        trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=val_dataset,
            tokenizer=self.tokenizer,
            data_collator=data_collator,
        )
        
        # Entraîner le modèle
        try:
            print("Début de l'entraînement du modèle de hiérarchie...")
            trainer.train()
            
            # Évaluer
            eval_results = trainer.evaluate()
            print(f"Résultats de l'évaluation: {eval_results}")
            
            # Sauvegarder le modèle
            self.model.save_pretrained(HIERARCHY_MODEL_DIR)
            self.tokenizer.save_pretrained(HIERARCHY_MODEL_DIR)
            
            # Initialiser le pipeline
            self.classifier = pipeline("text-classification", model=self.model, tokenizer=self.tokenizer)
            
            print(f"Modèle de hiérarchie entraîné et sauvegardé dans {HIERARCHY_MODEL_DIR}")
            return True
        except Exception as e:
            print(f"Erreur lors de l'entraînement du modèle: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def predict(self, text):
        """Prédit la hiérarchie d'un texte"""
        if self.classifier is None:
            success = self._load_model()
            if not success:
                print("Aucun modèle disponible pour la prédiction.")
                return {"label": "normal", "score": 0.5}  # Valeur par défaut
        
        try:
            prediction = self.classifier(text)
            return {
                "label": prediction[0]["label"],
                "score": float(prediction[0]["score"])
            }
        except Exception as e:
            print(f"Erreur lors de la prédiction: {e}")
            return {"label": "normal", "score": 0.5}  # Valeur par défaut

# Fonction utilitaire pour créer ou réentraîner le modèle
def create_or_retrain_hierarchy_model(feedback_file=FEEDBACK_FILE, epochs=3, batch_size=8, learning_rate=5e-5):
    """Crée ou réentraîne le modèle de hiérarchie à partir du fichier de feedback"""
    try:
        # Charger les données de feedback
        if os.path.exists(feedback_file):
            with open(feedback_file, 'r', encoding='utf-8') as f:
                feedback_data = json.load(f)
        else:
            print(f"Fichier de feedback non trouvé: {feedback_file}")
            return False
        
        # Créer le classificateur et entraîner
        classifier = HierarchyClassifier()
        success = classifier.create_or_retrain_model(
            feedback_data, 
            epochs=epochs, 
            batch_size=batch_size, 
            learning_rate=learning_rate
        )
        
        return success
    except Exception as e:
        print(f"Erreur lors de la création/réentraînement du modèle: {e}")
        import traceback
        traceback.print_exc()
        return False

# Pour un test rapide
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Crée ou réentraîne un modèle de classification de hiérarchie")
    parser.add_argument("--feedback-file", default=FEEDBACK_FILE, help="Fichier de feedback JSON")
    parser.add_argument("--epochs", type=int, default=3, help="Nombre d'époques")
    parser.add_argument("--batch-size", type=int, default=8, help="Taille du batch")
    parser.add_argument("--learning-rate", type=float, default=5e-5, help="Taux d'apprentissage")
    
    args = parser.parse_args()
    
    success = create_or_retrain_hierarchy_model(
        args.feedback_file,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate
    )
    
    if success:
        print("Modèle de hiérarchie créé/réentraîné avec succès.")
    else:
        print("Échec de la création/du réentraînement du modèle de hiérarchie.")
