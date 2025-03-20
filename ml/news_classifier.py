#!/usr/bin/env python3
"""
news_classifier.py - Système de classification des actualités financières
Ce module utilise un modèle FinBERT pour analyser le sentiment des actualités
et intègre les feedbacks utilisateurs pour améliorer les prédictions.
"""

import os
import json
import logging
from typing import Dict, List, Any

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constantes
FEEDBACK_FILE = "data/ml_feedback.json"  # MODIFICATION: Normalisé pour utiliser ml_feedback.json
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")

# Assurez-vous que les répertoires nécessaires existent
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

class NewsClassifier:
    """Classe pour la classification des actualités financières"""
    
    def __init__(self, use_cache: bool = True) -> None:
        """
        Initialise le classificateur d'actualités
        
        Args:
            use_cache (bool): Indique si le cache doit être utilisé
        """
        self.use_cache = use_cache
        self.model = None
        self.tokenizer = None
        self.cache = {}
        
        # En mode production, on chargerait ici un vrai modèle FinBERT
        # from transformers import AutoModelForSequenceClassification, AutoTokenizer
        # self.tokenizer = AutoTokenizer.from_pretrained("yiyanghkust/finbert-tone")
        # self.model = AutoModelForSequenceClassification.from_pretrained("yiyanghkust/finbert-tone")
        
        logger.info("Classificateur d'actualités initialisé")
        
        # Charger le cache si nécessaire
        if self.use_cache:
            self._load_cache()
    
    def _load_cache(self) -> None:
        """Charge le cache des classifications précédentes"""
        cache_file = os.path.join(CACHE_DIR, "classification_cache.json")
        try:
            if os.path.exists(cache_file):
                with open(cache_file, 'r', encoding='utf-8') as f:
                    self.cache = json.load(f)
                logger.info(f"Cache chargé avec {len(self.cache)} entrées")
            else:
                logger.info("Aucun cache trouvé, création d'un nouveau cache")
                self.cache = {}
        except Exception as e:
            logger.error(f"Erreur lors du chargement du cache: {e}")
            self.cache = {}
    
    def _save_cache(self) -> None:
        """Enregistre le cache des classifications"""
        cache_file = os.path.join(CACHE_DIR, "classification_cache.json")
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2)
            logger.info(f"Cache enregistré avec {len(self.cache)} entrées")
        except Exception as e:
            logger.error(f"Erreur lors de l'enregistrement du cache: {e}")
    
    def classify_news(self, news_item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classifie une actualité financière
        
        Args:
            news_item (Dict[str, Any]): L'élément d'actualité à classifier
            
        Returns:
            Dict[str, Any]: L'élément d'actualité avec les classifications ajoutées
        """
        # Copier l'élément pour éviter de modifier l'original
        classified_item = news_item.copy()
        
        # Extraire le titre et le contenu
        title = news_item.get('title', '')
        content = news_item.get('content', '')
        source = news_item.get('source', '')
        
        # Créer une clé unique pour le cache
        cache_key = f"{title}_{source}".lower().strip()
        
        # Vérifier si l'élément est dans le cache
        if self.use_cache and cache_key in self.cache:
            logger.info(f"Utilisation du cache pour: {title[:50]}...")
            classified_item.update(self.cache[cache_key])
            return classified_item
        
        # Simuler l'analyse (en production, utiliser le modèle FinBERT)
        classified_item = self._simulate_classification(classified_item, title, content)
        
        # Intégrer les feedbacks utilisateurs pour améliorer la classification
        classified_item = self.adjust_impact_with_feedback(classified_item)
        
        # Ajouter au cache si nécessaire
        if self.use_cache:
            self.cache[cache_key] = {
                'ml_sentiment': classified_item.get('ml_sentiment'),
                'ml_impact': classified_item.get('ml_impact'),
                'ml_confidence': classified_item.get('ml_confidence'),
                'ml_category': classified_item.get('ml_category')
            }
        
        return classified_item
    
    def _simulate_classification(self, item: Dict[str, Any], title: str, content: str) -> Dict[str, Any]:
        """
        Simule une classification d'actualité (à remplacer par l'utilisation réelle du modèle)
        
        Args:
            item (Dict[str, Any]): L'élément d'actualité
            title (str): Le titre de l'actualité
            content (str): Le contenu de l'actualité
            
        Returns:
            Dict[str, Any]: L'élément d'actualité avec les classifications ajoutées
        """
        # Analyse du sentiment simplifiée par mots-clés
        text = (title + " " + content).lower()
        
        # Simulation du sentiment
        positive_words = ['hausse', 'croissance', 'augmentation', 'optimiste', 'positif', 'profit', 'gain']
        negative_words = ['baisse', 'chute', 'diminution', 'pessimiste', 'négatif', 'perte', 'crise']
        
        positive_count = sum(1 for word in positive_words if word in text)
        negative_count = sum(1 for word in negative_words if word in text)
        
        if positive_count > negative_count:
            sentiment = "positive"
            confidence = 0.7 + (0.2 * (positive_count - negative_count) / (positive_count + negative_count + 1))
        elif negative_count > positive_count:
            sentiment = "negative"
            confidence = 0.7 + (0.2 * (negative_count - positive_count) / (positive_count + negative_count + 1))
        else:
            sentiment = "neutral"
            confidence = 0.6
        
        # Simulation de la catégorie
        categories = {
            'economie': ['pib', 'inflation', 'taux', 'banque centrale', 'fed', 'bce'],
            'marches': ['bourse', 'action', 'indice', 'cac', 'nasdaq', 'dow jones'],
            'entreprises': ['résultat', 'bénéfice', 'chiffre d\'affaires', 'acquisition', 'fusion'],
            'tech': ['technologie', 'intelligence artificielle', 'ia', 'numérique'],
            'crypto': ['bitcoin', 'ethereum', 'crypto', 'blockchain']
        }
        
        category_scores = {cat: sum(1 for kw in keywords if kw in text) for cat, keywords in categories.items()}
        category = max(category_scores.items(), key=lambda x: x[1])[0] if any(category_scores.values()) else "general"
        
        # Simulation de l'impact
        if "important" in text or "significatif" in text or "majeur" in text:
            impact = "high"
        elif "modéré" in text or "notable" in text:
            impact = "medium"
        else:
            impact = "low"
        
        # Ajouter les classifications à l'élément
        item['ml_sentiment'] = sentiment
        item['ml_impact'] = impact
        item['ml_confidence'] = round(confidence, 2)
        item['ml_category'] = category
        
        return item
    
    def adjust_impact_with_feedback(self, news_item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ajuste la classification en fonction des feedbacks utilisateurs
        
        Args:
            news_item (Dict[str, Any]): L'élément d'actualité à ajuster
            
        Returns:
            Dict[str, Any]: L'élément d'actualité avec les classifications ajustées
        """
        if not os.path.exists(FEEDBACK_FILE):
            return news_item
        
        try:
            with open(FEEDBACK_FILE, 'r', encoding='utf-8') as f:
                feedback_data = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            logger.warning(f"⚠️ Impossible de charger les feedbacks depuis {FEEDBACK_FILE}")
            return news_item
        
        # S'assurer que le fichier de feedback a la structure attendue
        if not isinstance(feedback_data, list) or not feedback_data or 'feedbacks' not in feedback_data[0]:
            logger.warning(f"⚠️ Structure de feedback invalide dans {FEEDBACK_FILE}")
            return news_item
        
        # Récupérer la liste des feedbacks
        feedbacks = feedback_data[0].get('feedbacks', [])
        
        # Trouver les feedbacks pertinents pour cette actualité (basé sur le titre)
        title = news_item.get('title', '').lower()
        relevant_feedbacks = []
        
        for feedback in feedbacks:
            feedback_title = feedback.get('title', '').lower()
            if title and feedback_title and (title in feedback_title or feedback_title in title):
                relevant_feedbacks.append(feedback)
        
        if not relevant_feedbacks:
            return news_item
        
        logger.info(f"Trouvé {len(relevant_feedbacks)} feedbacks pertinents pour: {title[:50]}...")
        
        # Analyse des feedbacks
        # Conversion des clés importance/impact vers sentiment/impact pour la compatibilité
        sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}
        impact_counts = {"high": 0, "medium": 0, "low": 0}
        
        for feedback in relevant_feedbacks:
            # Récupérer les valeurs corrigées en tenant compte des différentes structures possibles
            corrected = feedback.get('corrected', {})
            
            # Traiter le sentiment/importance
            if 'sentiment' in corrected:
                sentiment = corrected['sentiment']
                if sentiment in sentiment_counts:
                    sentiment_counts[sentiment] += 1
            elif 'importance' in corrected:
                # Conversion importance -> sentiment
                importance = corrected['importance']
                if importance == 'critical':
                    sentiment_counts['negative'] += 1
                elif importance == 'important':
                    sentiment_counts['positive'] += 1
                else:
                    sentiment_counts['neutral'] += 1
            
            # Traiter l'impact
            if 'impact' in corrected:
                impact = corrected['impact']
                # Conversion pour normaliser
                if impact == 'positive':
                    impact_counts['high'] += 1
                elif impact == 'negative':
                    impact_counts['medium'] += 1
                elif impact == 'neutral':
                    impact_counts['low'] += 1
                elif impact in impact_counts:
                    impact_counts[impact] += 1
        
        # Appliquer les ajustements si suffisamment de feedbacks
        if sum(sentiment_counts.values()) > 0:
            # Sélectionner le sentiment le plus fréquent
            majority_sentiment = max(sentiment_counts.items(), key=lambda x: x[1])[0]
            news_item['ml_sentiment'] = majority_sentiment
            news_item['ml_sentiment_source'] = 'feedback'
        
        if sum(impact_counts.values()) > 0:
            # Sélectionner l'impact le plus fréquent
            majority_impact = max(impact_counts.items(), key=lambda x: x[1])[0]
            news_item['ml_impact'] = majority_impact
            news_item['ml_impact_source'] = 'feedback'
        
        return news_item
    
    def classify_batch(self, news_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Classifie un lot d'actualités
        
        Args:
            news_items (List[Dict[str, Any]]): Liste d'actualités à classifier
            
        Returns:
            List[Dict[str, Any]]: Liste d'actualités classifiées
        """
        classified_items = []
        
        for item in news_items:
            classified_item = self.classify_news(item)
            classified_items.append(classified_item)
        
        # Enregistrer le cache après le traitement du lot
        if self.use_cache:
            self._save_cache()
        
        return classified_items


def run_classification(input_file: str, output_file: str) -> bool:
    """
    Exécute la classification sur un fichier d'actualités
    
    Args:
        input_file (str): Chemin vers le fichier JSON d'entrée
        output_file (str): Chemin vers le fichier JSON de sortie
        
    Returns:
        bool: True si la classification a réussi, False sinon
    """
    try:
        # Vérifier que le fichier d'entrée existe
        if not os.path.exists(input_file):
            logger.error(f"Le fichier d'entrée {input_file} n'existe pas")
            return False
        
        # Charger les données
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Créer le classificateur
        classifier = NewsClassifier()
        
        # Classifier les actualités pour chaque section
        for section in data.keys():
            if isinstance(data[section], list):
                data[section] = classifier.classify_batch(data[section])
        
        # Enregistrer les résultats
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Classification terminée et enregistrée dans {output_file}")
        return True
    
    except Exception as e:
        logger.error(f"Erreur lors de la classification: {e}")
        return False


if __name__ == "__main__":
    # Test simple
    print("Test du classificateur d'actualités")
    classifier = NewsClassifier(use_cache=False)
    
    test_news = {
        "title": "La Bourse de Paris en hausse de 1,2% portée par les résultats d'entreprises",
        "content": "La Bourse de Paris a terminé en hausse jeudi, portée par de bons résultats d'entreprises et l'espoir d'une baisse des taux d'intérêt de la BCE en septembre.",
        "source": "Test Source"
    }
    
    classified = classifier.classify_news(test_news)
    print(json.dumps(classified, indent=2, ensure_ascii=False))
