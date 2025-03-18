import os
import json
import pickle
import numpy as np
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
from functools import lru_cache

# Chemin vers le modèle (peut être relatif ou absolu)
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models/finbert_model")
CACHE_FILE = os.path.join(os.path.dirname(__file__), "models/classification_cache.pkl")

class NewsClassifier:
    def __init__(self, use_cache=True):
        self.use_cache = use_cache
        self.cache = {}
        
        # Charger le cache existant s'il existe
        if use_cache and os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'rb') as f:
                    self.cache = pickle.load(f)
                print(f"Cache chargé avec {len(self.cache)} entrées")
            except Exception as e:
                print(f"Erreur lors du chargement du cache: {e}")
        
        # Initialiser le modèle
        try:
            # Option 1: Utiliser un modèle déjà téléchargé localement
            if os.path.exists(MODEL_DIR):
                self.tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
                self.model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
                self.classifier = pipeline("sentiment-analysis", model=self.model, tokenizer=self.tokenizer)
                print("Modèle chargé depuis le stockage local")
            # Option 2: Télécharger le modèle depuis HuggingFace
            else:
                model_name = "ProsusAI/finbert"  # Modèle spécifique à la finance
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
                self.classifier = pipeline("sentiment-analysis", model=self.model, tokenizer=self.tokenizer)
                
                # Sauvegarder le modèle localement pour une utilisation future
                os.makedirs(MODEL_DIR, exist_ok=True)
                self.tokenizer.save_pretrained(MODEL_DIR)
                self.model.save_pretrained(MODEL_DIR)
                print(f"Modèle téléchargé et sauvegardé dans {MODEL_DIR}")
        except Exception as e:
            print(f"Erreur lors du chargement du modèle: {e}")
            # Fallback: classification basique basée sur des mots-clés
            self.classifier = self._keyword_classifier
            print("Utilisation du classificateur par mots-clés de secours")
    
    def _keyword_classifier(self, text):
        """Classificateur de secours basé sur des mots-clés simple"""
        pos_words = ["hausse", "augmentation", "croissance", "positif", "succès", "profit"]
        neg_words = ["baisse", "chute", "déclin", "négatif", "échec", "perte"]
        
        text = text.lower()
        pos_count = sum(1 for word in pos_words if word in text)
        neg_count = sum(1 for word in neg_words if word in text)
        
        if pos_count > neg_count:
            return [{"label": "positive", "score": 0.7}]
        elif neg_count > pos_count:
            return [{"label": "negative", "score": 0.7}]
        else:
            return [{"label": "neutral", "score": 0.8}]
    
    @lru_cache(maxsize=500)
    def _classify_text(self, text):
        """Classifie un texte avec mise en cache"""
        if text in self.cache:
            return self.cache[text]
        
        try:
            result = self.classifier(text)
            return result
        except Exception as e:
            print(f"Erreur de classification: {e}")
            return [{"label": "neutral", "score": 0.5}]
    
    def classify_news_item(self, news_item):
        """Classifie un élément d'actualité et l'enrichit"""
        # Combiner titre et contenu pour l'analyse
        text = f"{news_item['title']}. {news_item['content']}"
        
        # Classification
        result = self._classify_text(text)
        
        # Mapper les labels de FinBERT aux labels attendus
        label_mapping = {
            "positive": "positive",
            "negative": "negative",
            "neutral": "neutral"
        }
        
        # Enrichir l'élément d'actualité
        sentiment = result[0]["label"]
        confidence = float(result[0]["score"])
        
        # Mise à jour des champs
        news_item["sentiment"] = label_mapping.get(sentiment, sentiment)
        news_item["confidence"] = confidence
        
        # Déterminer l'impact basé sur le sentiment et la confiance
        if news_item["sentiment"] == "positive" and confidence > 0.7:
            news_item["impact"] = "positive"
        elif news_item["sentiment"] == "negative" and confidence > 0.7:
            news_item["impact"] = "negative"
        else:
            news_item["impact"] = "neutral"
        
        # Ajouter au cache
        if self.use_cache:
            self.cache[text] = result
        
        return news_item
        def predict_hierarchy(self, news_item):
    """Prédit la hiérarchie de l'actualité (critique, importante, normale)"""
    # Combiner titre et contenu pour l'analyse
    text = f"{news_item['title']}. {news_item['content']}".lower()
    
    # Liste de mots-clés pour chaque catégorie
    critical_keywords = ["crash", "effondrement", "crise", "urgent", "alerte", "catastrophe", 
                        "panique", "récession", "faillite", "collapse", "urgence", "critique"]
    
    important_keywords = ["hausse significative", "baisse importante", "croissance", 
                          "résultats", "bénéfices", "pertes", "acquisition", "fusion", 
                          "restructuration", "earnings", "quarterly", "forecast"]
    
    # Compter les occurrences de mots-clés
    critical_count = sum(1 for word in critical_keywords if word in text)
    important_count = sum(1 for word in important_keywords if word in text)
    
    # Déterminer la hiérarchie
    if critical_count > 0:
        hierarchy = "critical"
    elif important_count > 0:
        hierarchy = "important"
    else:
        hierarchy = "normal"
    
    # Ajouter au cache si nécessaire
    cache_key = f"hierarchy_{news_item['title']}"
    if self.use_cache:
        self.cache[cache_key] = hierarchy
    
    return hierarchy

def classify_news_item(self, news_item):
    """Classifie un élément d'actualité et l'enrichit"""
    # Méthode existante pour le sentiment
    text = f"{news_item['title']}. {news_item['content']}"
    
    # Classification
    result = self._classify_text(text)
    
    # Mapper les labels de FinBERT aux labels attendus
    label_mapping = {
        "positive": "positive",
        "negative": "negative",
        "neutral": "neutral"
    }
    
    # Enrichir l'élément d'actualité
    sentiment = result[0]["label"]
    confidence = float(result[0]["score"])
    
    # Mise à jour des champs
    news_item["sentiment"] = label_mapping.get(sentiment, sentiment)
    news_item["confidence"] = confidence
    
    # Déterminer l'impact basé sur le sentiment et la confiance
    if news_item["sentiment"] == "positive" and confidence > 0.7:
        news_item["impact"] = "positive"
    elif news_item["sentiment"] == "negative" and confidence > 0.7:
        news_item["impact"] = "negative"
    else:
        news_item["impact"] = "neutral"
    
    # Ajouter au cache
    if self.use_cache:
        self.cache[text] = result
    
    # Prédire la hiérarchie
    news_item["hierarchy"] = self.predict_hierarchy(news_item)
    
    return news_item
    
    def classify_news_file(self, input_path, output_path=None):
        """Classifie tous les éléments d'actualité dans un fichier JSON"""
        if output_path is None:
            output_path = input_path
            
        try:
            # Charger les actualités
            with open(input_path, 'r', encoding='utf-8') as f:
                news_data = json.load(f)
            
            # Traiter chaque section (us, france, etc.)
            for section in news_data:
                if section != "events" and section != "lastUpdated":
                    # Classifier chaque élément d'actualité dans la section
                    news_data[section] = [
                        self.classify_news_item(item) 
                        for item in news_data[section]
                    ]
            
            # Mettre à jour lastUpdated
            from datetime import datetime
            news_data["lastUpdated"] = datetime.now().isoformat()
            
            # Sauvegarder les résultats
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(news_data, f, ensure_ascii=False, indent=2)
                
            print(f"Classification terminée, résultats sauvegardés dans {output_path}")
            return True
        except Exception as e:
            print(f"Erreur lors de la classification du fichier: {e}")
            return False
    
    def save_cache(self):
        """Sauvegarde le cache de classification"""
        if self.use_cache and self.cache:
            try:
                os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
                with open(CACHE_FILE, 'wb') as f:
                    pickle.dump(self.cache, f)
                print(f"Cache sauvegardé avec {len(self.cache)} entrées")
                return True
            except Exception as e:
                print(f"Erreur lors de la sauvegarde du cache: {e}")
        return False

# Fonction d'utilité pour exécuter la classification
def run_classification(input_file, output_file=None):
    classifier = NewsClassifier()
    success = classifier.classify_news_file(input_file, output_file)
    classifier.save_cache()
    return success

# Pour un test rapide
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        run_classification(input_file, output_file)
    else:
        print("Usage: python news_classifier.py input_file.json [output_file.json]")
