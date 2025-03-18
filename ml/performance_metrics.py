"""
Module d'évaluation des performances pour le classificateur d'actualités

Ce module fournit des fonctions pour évaluer les performances du modèle
de classification de sentiment des actualités financières.
"""

import os
import json
import pickle
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, precision_recall_fscore_support

# Chemin pour sauvegarder les métriques de performance
METRICS_DIR = os.path.join(os.path.dirname(__file__), "metrics")
HISTORY_FILE = os.path.join(METRICS_DIR, "performance_history.pkl")
FEEDBACK_FILE = os.path.join(METRICS_DIR, "feedback_data.json")

class PerformanceTracker:
    """
    Classe pour suivre et enregistrer les performances du modèle de classification
    """
    
    def __init__(self):
        """
        Initialise le tracker de performance
        """
        os.makedirs(METRICS_DIR, exist_ok=True)
        self.metrics_history = self._load_history()
        self.current_metrics = {}
        
    def _load_history(self):
        """
        Charge l'historique des performances depuis le fichier
        """
        if os.path.exists(HISTORY_FILE):
            try:
                with open(HISTORY_FILE, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                print(f"Erreur lors du chargement de l'historique des performances: {e}")
                return []
        return []
    
    def _save_history(self):
        """
        Sauvegarde l'historique des performances dans le fichier
        """
        try:
            with open(HISTORY_FILE, 'wb') as f:
                pickle.dump(self.metrics_history, f)
        except Exception as e:
            print(f"Erreur lors de la sauvegarde de l'historique des performances: {e}")
    
    def load_feedback_data(self):
        """
        Charge les données de feedback pour évaluation
        """
        if os.path.exists(FEEDBACK_FILE):
            try:
                with open(FEEDBACK_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Erreur lors du chargement des données de feedback: {e}")
                return []
        return []
    
    def save_feedback_data(self, feedback_data):
        """
        Sauvegarde les données de feedback
        """
        try:
            with open(FEEDBACK_FILE, 'w', encoding='utf-8') as f:
                json.dump(feedback_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"Erreur lors de la sauvegarde des données de feedback: {e}")
            return False
    
    def add_feedback(self, feedback_item):
        """
        Ajoute une nouvelle entrée de feedback
        
        Args:
            feedback_item (dict): Données de feedback
        """
        feedback_data = self.load_feedback_data()
        feedback_data.append(feedback_item)
        self.save_feedback_data(feedback_data)
    
    def evaluate_from_feedback(self):
        """
        Évalue les performances du modèle basé sur les feedbacks utilisateurs
        
        Returns:
            dict: Métriques de performance
        """
        feedback_data = self.load_feedback_data()
        
        if not feedback_data:
            print("Aucune donnée de feedback disponible pour l'évaluation")
            return None
        
        # Préparer les données pour l'évaluation
        y_true = []
        y_pred = []
        
        for item in feedback_data:
            # Ignorer les entrées sans classification correcte
            if 'correctClassification' not in item:
                continue
                
            y_true.append(item['correctClassification'])
            y_pred.append(item['currentClassification'])
        
        # Vérifier si nous avons suffisamment de données
        if len(y_true) < 5:
            print(f"Données insuffisantes pour l'évaluation ({len(y_true)} entrées)")
            return None
        
        # Calculer les métriques
        accuracy = accuracy_score(y_true, y_pred)
        precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, average='weighted')
        
        # Matrice de confusion
        cm = confusion_matrix(y_true, y_pred, labels=['positive', 'negative', 'neutral'])
        
        # Rapport de classification détaillé
        report = classification_report(y_true, y_pred, output_dict=True)
        
        # Créer le dictionnaire de métriques
        metrics = {
            'accuracy': float(accuracy),
            'precision': float(precision),
            'recall': float(recall),
            'f1': float(f1),
            'confusion_matrix': cm.tolist(),
            'classification_report': report,
            'sample_count': len(y_true),
            'timestamp': datetime.now().isoformat(),
            'source': 'user_feedback'
        }
        
        # Mettre à jour les métriques actuelles
        self.current_metrics = metrics
        
        # Ajouter à l'historique
        self.metrics_history.append(metrics)
        self._save_history()
        
        return metrics
    
    def evaluate_from_test_set(self, y_true, y_pred, source='test_set'):
        """
        Évalue les performances du modèle sur un ensemble de test
        
        Args:
            y_true (list): Classifications correctes
            y_pred (list): Classifications prédites
            source (str): Source des données d'évaluation
            
        Returns:
            dict: Métriques de performance
        """
        if len(y_true) == 0 or len(y_pred) == 0:
            print("Données vides pour l'évaluation")
            return None
        
        # Calculer les métriques
        accuracy = accuracy_score(y_true, y_pred)
        precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, average='weighted')
        
        # Matrice de confusion
        labels = sorted(list(set(y_true) | set(y_pred)))
        cm = confusion_matrix(y_true, y_pred, labels=labels)
        
        # Rapport de classification détaillé
        report = classification_report(y_true, y_pred, output_dict=True)
        
        # Créer le dictionnaire de métriques
        metrics = {
            'accuracy': float(accuracy),
            'precision': float(precision),
            'recall': float(recall),
            'f1': float(f1),
            'confusion_matrix': cm.tolist(),
            'confusion_matrix_labels': labels,
            'classification_report': report,
            'sample_count': len(y_true),
            'timestamp': datetime.now().isoformat(),
            'source': source
        }
        
        # Mettre à jour les métriques actuelles
        self.current_metrics = metrics
        
        # Ajouter à l'historique
        self.metrics_history.append(metrics)
        self._save_history()
        
        return metrics
    
    def get_current_metrics(self):
        """
        Retourne les métriques actuelles
        
        Returns:
            dict: Métriques actuelles
        """
        return self.current_metrics
    
    def get_metrics_history(self):
        """
        Retourne l'historique des métriques
        
        Returns:
            list: Historique des métriques
        """
        return self.metrics_history
    
    def export_metrics_to_json(self, output_path=None):
        """
        Exporte les métriques actuelles au format JSON
        
        Args:
            output_path (str): Chemin du fichier de sortie
            
        Returns:
            bool: Succès de l'opération
        """
        if not self.current_metrics:
            print("Aucune métrique à exporter")
            return False
        
        if output_path is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = os.path.join(METRICS_DIR, f"metrics_{timestamp}.json")
        
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(self.current_metrics, f, ensure_ascii=False, indent=2)
            print(f"Métriques exportées vers {output_path}")
            return True
        except Exception as e:
            print(f"Erreur lors de l'exportation des métriques: {e}")
            return False
    
    def get_performance_trend(self, metric='f1', last_n=5):
        """
        Analyse la tendance des performances sur les dernières évaluations
        
        Args:
            metric (str): Métrique à analyser ('accuracy', 'precision', 'recall', 'f1')
            last_n (int): Nombre d'évaluations à considérer
            
        Returns:
            dict: Informations sur la tendance
        """
        if not self.metrics_history:
            return None
        
        # Limiter l'historique aux dernières n évaluations
        history = self.metrics_history[-last_n:] if len(self.metrics_history) > last_n else self.metrics_history
        
        # Extraire les valeurs de la métrique
        values = [entry.get(metric, 0) for entry in history]
        timestamps = [entry.get('timestamp') for entry in history]
        
        if len(values) < 2:
            return {
                'metric': metric,
                'current': values[-1] if values else None,
                'trend': 'stable',
                'change': 0,
                'values': values,
                'timestamps': timestamps
            }
        
        # Calculer la tendance
        current = values[-1]
        previous = values[-2]
        change = current - previous
        change_percent = (change / previous) * 100 if previous > 0 else 0
        
        # Déterminer la direction de la tendance
        if change_percent > 2:
            trend = 'improving'
        elif change_percent < -2:
            trend = 'declining'
        else:
            trend = 'stable'
        
        return {
            'metric': metric,
            'current': current,
            'previous': previous,
            'trend': trend,
            'change': change,
            'change_percent': change_percent,
            'values': values,
            'timestamps': timestamps
        }

# Fonction d'utilité pour générer un rapport de performance
def generate_performance_report(output_file=None):
    """
    Génère un rapport complet sur les performances du modèle
    
    Args:
        output_file (str): Chemin du fichier de sortie
        
    Returns:
        dict: Rapport de performance
    """
    tracker = PerformanceTracker()
    
    # Évaluer à partir du feedback
    feedback_metrics = tracker.evaluate_from_feedback()
    
    # Obtenir les tendances
    accuracy_trend = tracker.get_performance_trend('accuracy')
    f1_trend = tracker.get_performance_trend('f1')
    
    # Compiler le rapport
    report = {
        'timestamp': datetime.now().isoformat(),
        'current_metrics': feedback_metrics,
        'trends': {
            'accuracy': accuracy_trend,
            'f1': f1_trend
        },
        'metrics_history_length': len(tracker.get_metrics_history())
    }
    
    # Exporter le rapport si un chemin de sortie est fourni
    if output_file:
        try:
            os.makedirs(os.path.dirname(output_file), exist_ok=True)
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
            print(f"Rapport exporté vers {output_file}")
        except Exception as e:
            print(f"Erreur lors de l'exportation du rapport: {e}")
    
    return report

# Pour un test rapide
if __name__ == "__main__":
    # Créer un tracker
    tracker = PerformanceTracker()
    
    # Simuler quelques données de test
    y_true = ['positive', 'negative', 'neutral', 'positive', 'negative', 
              'positive', 'positive', 'neutral', 'negative', 'positive']
    y_pred = ['positive', 'negative', 'positive', 'positive', 'neutral', 
              'positive', 'neutral', 'neutral', 'negative', 'positive']
    
    # Évaluer et afficher les métriques
    metrics = tracker.evaluate_from_test_set(y_true, y_pred, source='test')
    print(json.dumps(metrics, indent=2))
    
    # Générer un rapport complet
    report = generate_performance_report()
    print(json.dumps(report, indent=2))
