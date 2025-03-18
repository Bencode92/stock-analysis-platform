import os
import json
import pickle
import numpy as np
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
from functools import lru_cache

# Chemins vers les modèles (peuvent être relatifs ou absolus)
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models/finbert_model")
HIERARCHY_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models/hierarchy_model")
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
        
        # Initialiser le modèle de sentiment
        try:
            # Option 1: Utiliser un modèle déjà téléchargé localement
            if os.path.exists(MODEL_DIR):
                self.tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
                self.model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
                self.classifier = pipeline("sentiment-analysis", model=self.model, tokenizer=self.tokenizer)
                print("Modèle de sentiment chargé depuis le stockage local")
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
                print(f"Modèle de sentiment téléchargé et sauvegardé dans {MODEL_DIR}")
        except Exception as e:
            print(f"Erreur lors du chargement du modèle de sentiment: {e}")
            # Fallback: classification basique basée sur des mots-clés
            self.classifier = self._keyword_classifier
            print("Utilisation du classificateur par mots-clés de secours")
        
        # Initialiser le modèle de hiérarchie s'il existe
        self.hierarchy_classifier = None
        self.use_ml_for_hierarchy = False
        
        try:
            if os.path.exists(HIERARCHY_MODEL_DIR) and os.listdir(HIERARCHY_MODEL_DIR):
                self.hierarchy_tokenizer = AutoTokenizer.from_pretrained(HIERARCHY_MODEL_DIR)
                self.hierarchy_model = AutoModelForSequenceClassification.from_pretrained(HIERARCHY_MODEL_DIR)
                self.hierarchy_classifier = pipeline("text-classification", model=self.hierarchy_model, tokenizer=self.hierarchy_tokenizer)
                self.use_ml_for_hierarchy = True
                print("Modèle de hiérarchie chargé depuis le stockage local")
        except Exception as e:
            print(f"Erreur lors du chargement du modèle de hiérarchie: {e}")
            print("Utilisation de l'approche par mots-clés pour la hiérarchie")
    
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
        cache_key = f"sentiment_{text}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        try:
            result = self.classifier(text)
            if self.use_cache:
                self.cache[cache_key] = result
            return result
        except Exception as e:
            print(f"Erreur de classification: {e}")
            return [{"label": "neutral", "score": 0.5}]
    
    def predict_hierarchy_with_keywords(self, news_item):
        """Prédit la hiérarchie de l'actualité (critique, importante, normale) avec des mots-clés"""
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
        
        return hierarchy
    
    def predict_hierarchy_with_ml(self, text):
        """Prédit la hiérarchie de l'actualité en utilisant le modèle ML"""
        cache_key = f"hierarchy_{text}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        try:
            if self.hierarchy_classifier:
                result = self.hierarchy_classifier(text)
                prediction = {
                    "label": result[0]["label"],
                    "score": float(result[0]["score"])
                }
                
                if self.use_cache:
                    self.cache[cache_key] = prediction
                
                return prediction
            else:
                raise ValueError("Modèle de hiérarchie non disponible")
        except Exception as e:
            print(f"Erreur lors de la prédiction de hiérarchie: {e}")
            return {"label": "normal", "score": 0.5}  # Valeur par défaut
    
    def classify_news_item(self, news_item):
        """Classifie un élément d'actualité et l'enrichit (sentiment et hiérarchie)"""
        # Combiner titre et contenu pour l'analyse
        text = f"{news_item['title']}. {news_item['content']}"
        
        # Classification du sentiment
        result = self._classify_text(text)
        
        # Mapper les labels de FinBERT aux labels attendus
        label_mapping = {
            "positive": "positive",
            "negative": "negative",
            "neutral": "neutral"
        }
        
        # Enrichir l'élément d'actualité avec le sentiment
        sentiment = result[0]["label"]
        confidence = float(result[0]["score"])
        
        # Mise à jour des champs de sentiment
        news_item["sentiment"] = label_mapping.get(sentiment, sentiment)
        news_item["confidence"] = confidence
        
        # AMÉLIORATION: Calcul d'impact amélioré avec analyse de contenu
        # Liste de mots-clés à fort impact
        high_impact_words = [
            "crash", "collapse", "crisis", "emergency", "alert", "catastrophe", 
            "panic", "recession", "bankruptcy", "default", "surge", "plummet", 
            "skyrocket", "nosedive", "breakthrough", "milestone", "record",
            "crise", "effondrement", "chute", "urgence", "alerte", "récession",
            "faillite", "défaut", "dégringolade", "envolée", "percée"
        ]
        
        # Vérifier la présence de mots-clés à fort impact
        has_high_impact_words = any(word in text.lower() for word in high_impact_words)
        
        # Calculer l'impact en fonction du sentiment, de la confiance et des mots-clés
        if news_item["sentiment"] == "positive":
            if confidence > 0.75 or has_high_impact_words:
                news_item["impact"] = "positive"
            elif confidence > 0.6:
                news_item["impact"] = "slightly_positive"
            else:
                news_item["impact"] = "neutral"
        elif news_item["sentiment"] == "negative":
            if confidence > 0.75 or has_high_impact_words:
                news_item["impact"] = "negative"
            elif confidence > 0.6:
                news_item["impact"] = "slightly_negative" 
            else:
                news_item["impact"] = "neutral"
        else:
            news_item["impact"] = "neutral"
        
        # Ajout d'un score d'impact
        impact_score = 0
        if has_high_impact_words:
            impact_score += 10
        
        if news_item["sentiment"] == "negative" and confidence > 0.7:
            impact_score += 8
        elif news_item["sentiment"] == "positive" and confidence > 0.7:
            impact_score += 6
        
        # Stocker le score d'impact
        news_item["impact_score"] = impact_score
        
        # Prédire la hiérarchie avec ML si disponible, sinon utiliser les mots-clés
        if self.use_ml_for_hierarchy:
            hierarchy_result = self.predict_hierarchy_with_ml(text)
            hierarchy_confidence = hierarchy_result["score"]
            
            # Si confiance suffisante, utiliser la prédiction ML
            if hierarchy_confidence > 0.6:
                news_item["hierarchy"] = hierarchy_result["label"]
                news_item["hierarchy_confidence"] = hierarchy_confidence
            else:
                # Sinon, recourir à l'approche par mots-clés
                news_item["hierarchy"] = self.predict_hierarchy_with_keywords(news_item)
                news_item["hierarchy_confidence"] = 0.5  # Confiance moyenne pour les mots-clés
        else:
            # Utiliser uniquement l'approche par mots-clés
            news_item["hierarchy"] = self.predict_hierarchy_with_keywords(news_item)
            news_item["hierarchy_confidence"] = 0.5  # Confiance moyenne pour les mots-clés
        
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
