"""
Module de réentraînement du modèle de classification d'actualités financières

Ce module permet d'améliorer le modèle FinBERT en le réentraînant
sur les données corrigées par les utilisateurs.
"""

import os
import json
import pickle
import numpy as np
import pandas as pd
from datetime import datetime
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from sklearn.model_selection import train_test_split

from performance_metrics import PerformanceTracker
from hierarchy_model import create_or_retrain_hierarchy_model

# Chemins des répertoires
BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, "models")
FINBERT_MODEL_DIR = os.path.join(MODELS_DIR, "finbert_model")
FINBERT_FINETUNED_DIR = os.path.join(MODELS_DIR, "finbert_finetuned")
HIERARCHY_MODEL_DIR = os.path.join(MODELS_DIR, "hierarchy_model")
FEEDBACK_DIR = os.path.join(BASE_DIR, "feedback")
FEEDBACK_FILE = os.path.join(FEEDBACK_DIR, "feedback_data.json")
TRAINING_LOGS_DIR = os.path.join(BASE_DIR, "logs")

# S'assurer que les répertoires existent
for directory in [MODELS_DIR, FINBERT_MODEL_DIR, FINBERT_FINETUNED_DIR, HIERARCHY_MODEL_DIR, FEEDBACK_DIR, TRAINING_LOGS_DIR]:
    os.makedirs(directory, exist_ok=True)

# Configuration de l'entraînement
DEFAULT_TRAINING_CONFIG = {
    "batch_size": 8,
    "learning_rate": 5e-5,
    "epochs": 3,
    "warmup_steps": 500,
    "weight_decay": 0.01,
    "evaluation_strategy": "epoch",
    "save_steps": 500,
    "min_feedback_entries": 50,  # Nombre minimum d'entrées de feedback pour réentraîner
}

class FinancialNewsDataset(Dataset):
    """Dataset pour les actualités financières"""
    
    def __init__(self, texts, labels, tokenizer, max_length=512):
        """
        Initialise le dataset
        
        Args:
            texts (list): Liste des textes d'actualités
            labels (list): Liste des étiquettes (0: négatif, 1: neutre, 2: positif)
            tokenizer: Tokenizer pour prétraiter les textes
            max_length (int): Longueur maximale des séquences
        """
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.texts)
    
    def __getitem__(self, idx):
        text = self.texts[idx]
        label = self.labels[idx]
        
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt"
        )
        
        return {
            "input_ids": encoding["input_ids"].flatten(),
            "attention_mask": encoding["attention_mask"].flatten(),
            "labels": torch.tensor(label, dtype=torch.long)
        }

class ModelRetrainer:
    """Classe pour réentraîner le modèle FinBERT sur les données de feedback"""
    
    def __init__(self, config=None):
        """
        Initialise le réentraîneur
        
        Args:
            config (dict): Configuration d'entraînement
        """
        self.config = config or DEFAULT_TRAINING_CONFIG
        self.tracker = PerformanceTracker()
        self.label_map = {"negative": 0, "neutral": 1, "positive": 2}
        self.reverse_label_map = {0: "negative", 1: "neutral", 2: "positive"}
        
        # Vérifier et charger le tokenizer et le modèle
        self._load_model_and_tokenizer()
    
    def _load_model_and_tokenizer(self):
        """Charge le tokenizer et le modèle FinBERT"""
        try:
            # Essayer de charger depuis le répertoire local
            if os.path.exists(FINBERT_FINETUNED_DIR) and os.listdir(FINBERT_FINETUNED_DIR):
                print(f"Chargement du modèle affiné depuis {FINBERT_FINETUNED_DIR}")
                self.tokenizer = AutoTokenizer.from_pretrained(FINBERT_FINETUNED_DIR)
                self.model = AutoModelForSequenceClassification.from_pretrained(FINBERT_FINETUNED_DIR)
            elif os.path.exists(FINBERT_MODEL_DIR) and os.listdir(FINBERT_MODEL_DIR):
                print(f"Chargement du modèle de base depuis {FINBERT_MODEL_DIR}")
                self.tokenizer = AutoTokenizer.from_pretrained(FINBERT_MODEL_DIR)
                self.model = AutoModelForSequenceClassification.from_pretrained(FINBERT_MODEL_DIR)
            else:
                # Télécharger le modèle depuis HuggingFace
                print("Téléchargement du modèle depuis HuggingFace")
                model_name = "ProsusAI/finbert"
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
                
                # Sauvegarder le modèle de base
                self.tokenizer.save_pretrained(FINBERT_MODEL_DIR)
                self.model.save_pretrained(FINBERT_MODEL_DIR)
        except Exception as e:
            print(f"Erreur lors du chargement du modèle: {e}")
            raise
    
    def _prepare_feedback_data(self, type="sentiment"):
        """
        Prépare les données de feedback pour l'entraînement
        
        Args:
            type (str): Type de données à préparer ('sentiment' ou 'hierarchy')
        
        Returns:
            tuple: (textes, étiquettes) ou (None, None) en cas d'échec
        """
        try:
            # Charger les données de feedback
            feedback_data = self.tracker.load_feedback_data()
            
            if not feedback_data:
                print("Aucune donnée de feedback disponible")
                return None, None
            
            if len(feedback_data) < self.config["min_feedback_entries"]:
                print(f"Données de feedback insuffisantes. {len(feedback_data)} entrées disponibles, "
                      f"{self.config['min_feedback_entries']} requises.")
                return None, None
            
            # Extraire les textes et les étiquettes
            texts = []
            labels = []
            
            for item in feedback_data:
                # Vérifier la présence des champs requis selon le type
                if type == "sentiment" and ("correctClassification" not in item or "title" not in item):
                    continue
                elif type == "hierarchy" and ("correctHierarchy" not in item or "title" not in item):
                    continue
                
                # Combiner titre et contenu si disponible
                text = item.get("title", "")
                if "content" in item and item["content"]:
                    text += ". " + item["content"]
                
                # Obtenir l'étiquette numérique selon le type
                if type == "sentiment":
                    label_text = item["correctClassification"]
                    if label_text not in self.label_map:
                        continue
                    label = self.label_map[label_text]
                else:  # type == "hierarchy"
                    label_text = item["correctHierarchy"]
                    hierarchy_map = {"critical": 0, "important": 1, "normal": 2}
                    if label_text not in hierarchy_map:
                        continue
                    label = hierarchy_map[label_text]
                
                texts.append(text)
                labels.append(label)
            
            if not texts:
                print(f"Aucune donnée valide extraite du feedback pour {type}")
                return None, None
            
            print(f"Données préparées pour {type}: {len(texts)} exemples")
            return texts, labels
        
        except Exception as e:
            print(f"Erreur lors de la préparation des données de {type}: {e}")
            return None, None
    
    def retrain_model(self):
        """
        Réentraîne le modèle sur les données de feedback
        
        Returns:
            bool: Succès de l'opération
        """
        # Préparer les données pour le sentiment
        texts, labels = self._prepare_feedback_data(type="sentiment")
        if texts is None or not texts:
            print("Pas assez de données pour réentraîner le modèle de sentiment")
            return False
        
        # Diviser en ensembles d'entraînement et de validation
        train_texts, val_texts, train_labels, val_labels = train_test_split(
            texts, labels, test_size=0.2, random_state=42, stratify=labels
        )
        
        # Créer les datasets
        train_dataset = FinancialNewsDataset(train_texts, train_labels, self.tokenizer)
        val_dataset = FinancialNewsDataset(val_texts, val_labels, self.tokenizer)
        
        # Timestamp pour cette version du modèle
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = os.path.join(TRAINING_LOGS_DIR, f"finbert_finetuned_{timestamp}")
        
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
        
        # Initialiser le Trainer
        trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=val_dataset,
        )
        
        # Entraînement
        try:
            print("Début de l'entraînement du modèle de sentiment...")
            trainer.train()
            
            # Évaluer le modèle
            eval_results = trainer.evaluate()
            print(f"Résultats de l'évaluation du modèle de sentiment: {eval_results}")
            
            # Sauvegarder le modèle affiné
            self.model.save_pretrained(FINBERT_FINETUNED_DIR)
            self.tokenizer.save_pretrained(FINBERT_FINETUNED_DIR)
            
            # Enregistrer les métadonnées
            metadata = {
                "timestamp": timestamp,
                "eval_results": eval_results,
                "config": self.config,
                "num_examples": len(texts),
                "train_test_split": {"train": len(train_texts), "val": len(val_texts)}
            }
            
            with open(os.path.join(FINBERT_FINETUNED_DIR, "metadata.json"), 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            
            print(f"Modèle de sentiment réentraîné et sauvegardé dans {FINBERT_FINETUNED_DIR}")
            return True
            
        except Exception as e:
            print(f"Erreur lors de l'entraînement du modèle de sentiment: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def evaluate_model(self):
        """
        Évalue le modèle réentraîné sur les données de validation
        
        Returns:
            dict: Résultats de l'évaluation
        """
        # Charger les données de feedback
        texts, labels = self._prepare_feedback_data(type="sentiment")
        if texts is None or not texts:
            return None
        
        # Diviser en ensembles d'entraînement et de validation
        _, val_texts, _, val_labels = train_test_split(
            texts, labels, test_size=0.2, random_state=42, stratify=labels
        )
        
        # Prédictions
        predictions = []
        for text in val_texts:
            inputs = self.tokenizer(text, return_tensors="pt", max_length=512, truncation=True, padding=True)
            with torch.no_grad():
                outputs = self.model(**inputs)
                predicted_class = torch.argmax(outputs.logits, dim=1).item()
                predictions.append(self.reverse_label_map[predicted_class])
        
        # Convertir les étiquettes numériques en texte
        val_labels_text = [self.reverse_label_map[label] for label in val_labels]
        
        # Évaluer avec le tracker de performance
        results = self.tracker.evaluate_from_test_set(val_labels_text, predictions, source='validation')
        
        return results

# Fonction d'utilité pour exécuter le réentraînement complet (sentiment + hiérarchie)
def run_retraining(config=None):
    """
    Exécute le processus de réentraînement complet pour les deux modèles
    
    Args:
        config (dict): Configuration d'entraînement
        
    Returns:
        dict: Résultats des opérations pour les deux modèles
    """
    results = {
        "sentiment": {"success": False, "eval_results": None},
        "hierarchy": {"success": False, "eval_results": None}
    }
    
    try:
        # 1. Réentraîner le modèle de sentiment
        print("=== RÉENTRAÎNEMENT DU MODÈLE DE SENTIMENT ===")
        retrainer = ModelRetrainer(config)
        sentiment_success = retrainer.retrain_model()
        
        if sentiment_success:
            # Évaluer le modèle réentraîné
            eval_results = retrainer.evaluate_model()
            print(f"Évaluation du modèle de sentiment réentraîné: {eval_results}")
            
            # Mettre à jour les résultats
            results["sentiment"]["success"] = True
            results["sentiment"]["eval_results"] = eval_results
        
        # 2. Réentraîner le modèle de hiérarchie
        print("\n=== RÉENTRAÎNEMENT DU MODÈLE DE HIÉRARCHIE ===")
        hierarchy_success = create_or_retrain_hierarchy_model(
            feedback_file=FEEDBACK_FILE,
            epochs=config["epochs"] if config else DEFAULT_TRAINING_CONFIG["epochs"],
            batch_size=config["batch_size"] if config else DEFAULT_TRAINING_CONFIG["batch_size"],
            learning_rate=config["learning_rate"] if config else DEFAULT_TRAINING_CONFIG["learning_rate"]
        )
        
        # Mettre à jour les résultats
        results["hierarchy"]["success"] = hierarchy_success
        
        # Sauvegarder les résultats dans un fichier
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_file = os.path.join(TRAINING_LOGS_DIR, f"retraining_results_{timestamp}.json")
        
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print(f"Résultats sauvegardés dans {results_file}")
        
        return results
    except Exception as e:
        print(f"Erreur lors du réentraînement: {e}")
        import traceback
        traceback.print_exc()
        return results

# Pour un test rapide
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Réentraîne les modèles sur les données de feedback")
    parser.add_argument("--epochs", type=int, default=3, help="Nombre d'époques d'entraînement")
    parser.add_argument("--batch-size", type=int, default=8, help="Taille du batch")
    parser.add_argument("--learning-rate", type=float, default=5e-5, help="Taux d'apprentissage")
    parser.add_argument("--sentiment-only", action="store_true", help="Réentraîner uniquement le modèle de sentiment")
    parser.add_argument("--hierarchy-only", action="store_true", help="Réentraîner uniquement le modèle de hiérarchie")
    
    args = parser.parse_args()
    
    config = DEFAULT_TRAINING_CONFIG.copy()
    config["epochs"] = args.epochs
    config["batch_size"] = args.batch_size
    config["learning_rate"] = args.learning_rate
    
    # Réentraîner les modèles selon les options
    if args.sentiment_only:
        print("Réentraînement du modèle de sentiment uniquement")
        retrainer = ModelRetrainer(config)
        success = retrainer.retrain_model()
    elif args.hierarchy_only:
        print("Réentraînement du modèle de hiérarchie uniquement")
        success = create_or_retrain_hierarchy_model(
            epochs=config["epochs"],
            batch_size=config["batch_size"],
            learning_rate=config["learning_rate"]
        )
    else:
        print("Réentraînement des deux modèles")
        results = run_retraining(config)
        success = results["sentiment"]["success"] or results["hierarchy"]["success"]
    
    if success:
        print("Réentraînement terminé avec succès")
    else:
        print("Échec du réentraînement")
