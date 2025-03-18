"""
Module d'entraînement du modèle d'impact d'actualités financières

Ce module permet de créer et d'entraîner un modèle spécifique pour
prédire l'impact des actualités financières, en utilisant les
corrections des utilisateurs.
"""

import os
import json
import torch
import numpy as np
from datetime import datetime
from sklearn.model_selection import train_test_split
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from transformers import TrainingArguments, Trainer, DataCollatorWithPadding
from datasets import Dataset

# Import du gestionnaire de base de données pour les corrections
from db_manager import export_training_data

# Chemins des répertoires
BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, "models")
IMPACT_MODEL_DIR = os.path.join(MODELS_DIR, "impact_model")
TRAINING_LOGS_DIR = os.path.join(BASE_DIR, "logs")

# S'assurer que les répertoires existent
for directory in [MODELS_DIR, IMPACT_MODEL_DIR, TRAINING_LOGS_DIR]:
    os.makedirs(directory, exist_ok=True)

# Configuration de l'entraînement
DEFAULT_TRAINING_CONFIG = {
    "batch_size": 8,
    "learning_rate": 5e-5,
    "epochs": 3,
    "warmup_steps": 100,
    "weight_decay": 0.01,
    "evaluation_strategy": "epoch",
    "save_steps": 500,
    "min_correction_entries": 20,  # Nombre minimum de corrections pour réentraîner
}

class ImpactModel:
    """Classe pour créer et entraîner le modèle d'impact des actualités"""
    
    def __init__(self, config=None):
        """
        Initialise le modèle d'impact
        
        Args:
            config (dict, optional): Configuration d'entraînement
        """
        self.config = config or DEFAULT_TRAINING_CONFIG
        self.tokenizer = None
        self.model = None
        self.impact_mapping = {
            "high": 0,
            "positive": 1,
            "slightly_positive": 2,
            "neutral": 3,
            "slightly_negative": 4,
            "negative": 5
        }
        self.reverse_mapping = {v: k for k, v in self.impact_mapping.items()}
        
        # Essayer de charger un modèle existant
        self._load_model()
    
    def _load_model(self):
        """Charge un modèle d'impact existant"""
        try:
            if os.path.exists(IMPACT_MODEL_DIR) and os.listdir(IMPACT_MODEL_DIR):
                self.tokenizer = AutoTokenizer.from_pretrained(IMPACT_MODEL_DIR)
                self.model = AutoModelForSequenceClassification.from_pretrained(IMPACT_MODEL_DIR)
                print(f"✅ Modèle d'impact chargé depuis {IMPACT_MODEL_DIR}")
                return True
            else:
                print("⚠️ Aucun modèle d'impact existant trouvé.")
                return False
        except Exception as e:
            print(f"❌ Erreur lors du chargement du modèle d'impact: {e}")
            return False
    
    def _prepare_data(self):
        """
        Prépare les données pour l'entraînement en utilisant les corrections utilisateur
        
        Returns:
            tuple: (textes, étiquettes) ou (None, None) en cas d'échec
        """
        try:
            # Exporter les données d'entraînement
            success, file_path = export_training_data()
            
            if not success:
                print("⚠️ Impossible d'exporter les données d'entraînement")
                return None, None
            
            # Charger les données d'entraînement
            with open(file_path, 'r', encoding='utf-8') as f:
                training_data = json.load(f)
            
            # Vérifier si nous avons suffisamment de données pour l'impact
            if len(training_data["impact"]) < self.config["min_correction_entries"]:
                print(f"⚠️ Pas assez de données pour entraîner le modèle d'impact ({len(training_data['impact'])} < {self.config['min_correction_entries']})")
                return None, None
            
            # Extraire les textes et les étiquettes
            texts = [item["text"] for item in training_data["impact"]]
            labels = [self.impact_mapping.get(item["label"], self.impact_mapping["neutral"]) for item in training_data["impact"]]
            
            print(f"✅ Données préparées: {len(texts)} exemples")
            return texts, labels
        except Exception as e:
            print(f"❌ Erreur lors de la préparation des données: {e}")
            return None, None
    
    def _initialize_base_model(self):
        """Initialise un modèle de base pour la classification d'impact"""
        try:
            # Utiliser BERT français ou CamemBERT
            model_name = "camembert-base"  # Vous pouvez aussi utiliser "bert-base-multilingual-cased"
            
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(
                model_name,
                num_labels=len(self.impact_mapping)
            )
            
            print(f"✅ Modèle de base initialisé avec {model_name}")
            return True
        except Exception as e:
            print(f"❌ Erreur lors de l'initialisation du modèle de base: {e}")
            return False
    
    def train(self):
        """
        Entraîne le modèle sur les données de correction
        
        Returns:
            bool: Succès de l'opération
        """
        # Préparer les données
        texts, labels = self._prepare_data()
        if texts is None or not texts:
            print("❌ Impossible de créer un modèle sans données d'entraînement.")
            return False
        
        # Diviser en ensembles d'entraînement et de validation
        train_texts, val_texts, train_labels, val_labels = train_test_split(
            texts, labels, test_size=0.2, random_state=42, stratify=labels
        )
        
        # Utiliser le modèle existant ou initialiser un nouveau
        if self.model is None or self.tokenizer is None:
            success = self._initialize_base_model()
            if not success:
                print("❌ Échec de l'initialisation du modèle de base.")
                return False
        
        # Fonction de tokenisation
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
        
        # Timestamp pour cette version du modèle
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = os.path.join(TRAINING_LOGS_DIR, f"impact_model_{timestamp}")
        
        # Configuration de l'entraînement
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=self.config["epochs"],
            per_device_train_batch_size=self.config["batch_size"],
            per_device_eval_batch_size=self.config["batch_size"],
            warmup_steps=self.config["warmup_steps"],
            weight_decay=self.config["weight_decay"],
            learning_rate=self.config["learning_rate"],
            evaluation_strategy=self.config["evaluation_strategy"],
            save_steps=self.config["save_steps"],
            load_best_model_at_end=True,
            logging_dir=os.path.join(TRAINING_LOGS_DIR, "logs"),
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
            print("🚀 Début de l'entraînement du modèle d'impact...")
            trainer.train()
            
            # Évaluer
            eval_results = trainer.evaluate()
            print(f"📊 Résultats de l'évaluation: {eval_results}")
            
            # Sauvegarder le modèle
            self.model.save_pretrained(IMPACT_MODEL_DIR)
            self.tokenizer.save_pretrained(IMPACT_MODEL_DIR)
            
            # Sauvegarder les métadonnées
            metadata = {
                "timestamp": timestamp,
                "eval_results": eval_results,
                "config": self.config,
                "num_examples": len(texts),
                "train_test_split": {
                    "train": len(train_texts),
                    "val": len(val_texts)
                },
                "impact_mapping": self.impact_mapping
            }
            
            with open(os.path.join(IMPACT_MODEL_DIR, "metadata.json"), 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            
            print(f"✅ Modèle d'impact entraîné et sauvegardé dans {IMPACT_MODEL_DIR}")
            return True
        except Exception as e:
            print(f"❌ Erreur lors de l'entraînement du modèle: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def predict(self, text):
        """
        Prédit l'impact d'un texte
        
        Args:
            text (str): Texte à classifier
            
        Returns:
            dict: Résultat de la prédiction avec label et score
        """
        if not self.model or not self.tokenizer:
            print("⚠️ Modèle non initialisé. Impossible de faire une prédiction.")
            return {"label": "neutral", "score": 0.5}
        
        try:
            # Tokeniser le texte
            inputs = self.tokenizer(text, return_tensors="pt", truncation=True, padding=True)
            
            # Prédire
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
            
            # Obtenir la classe prédite et le score
            probabilities = torch.nn.functional.softmax(logits, dim=1)[0]
            predicted_class = torch.argmax(probabilities).item()
            confidence = probabilities[predicted_class].item()
            
            # Convertir en label
            label = self.reverse_mapping.get(predicted_class, "neutral")
            
            return {
                "label": label,
                "score": confidence
            }
        except Exception as e:
            print(f"❌ Erreur lors de la prédiction: {e}")
            return {"label": "neutral", "score": 0.5}

def train_impact_model():
    """
    Fonction d'utilité pour entraîner le modèle d'impact
    
    Returns:
        bool: Succès de l'opération
    """
    model = ImpactModel()
    return model.train()

# Pour un test rapide
if __name__ == "__main__":
    success = train_impact_model()
    
    if success:
        # Tester le modèle
        model = ImpactModel()
        
        test_texts = [
            "Le marché boursier s'effondre suite à la hausse des taux d'intérêt",
            "Les résultats trimestriels d'Apple dépassent les attentes",
            "La Fed maintient ses taux directeurs",
            "Crash économique en vue selon les analystes"
        ]
        
        print("\nTests de prédiction:")
        for text in test_texts:
            prediction = model.predict(text)
            print(f"Texte: {text}")
            print(f"Prédiction: {prediction['label']} (score: {prediction['score']:.4f})")
            print("")
    else:
        print("❌ Échec de l'entraînement du modèle d'impact.")
