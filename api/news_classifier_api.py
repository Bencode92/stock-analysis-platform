from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import sys

# Ajouter le chemin parent pour pouvoir importer le module ml
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.news_classifier import NewsClassifier

app = Flask(__name__)
CORS(app)  # Permettre les requêtes CORS

# Initialiser le classificateur
classifier = NewsClassifier()

# Chemin vers le fichier d'actualités
NEWS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/news.json')

@app.route('/api/news', methods=['GET'])
def get_news():
    """Renvoie toutes les actualités avec classification"""
    try:
        with open(NEWS_FILE, 'r', encoding='utf-8') as f:
            news_data = json.load(f)
        
        # Ajouter les filtres (pays, catégorie, etc.)
        country = request.args.get('country')
        category = request.args.get('category')
        impact = request.args.get('impact')
        
        result = {}
        
        # Copier les événements et lastUpdated tels quels
        if "events" in news_data:
            result["events"] = news_data["events"]
        if "lastUpdated" in news_data:
            result["lastUpdated"] = news_data["lastUpdated"]
        
        # Filtrer les actualités par pays
        for section in news_data:
            if section != "events" and section != "lastUpdated":
                if country and section != country:
                    continue
                
                # Appliquer les filtres de catégorie et impact
                filtered_news = news_data[section]
                
                if category:
                    filtered_news = [item for item in filtered_news if item.get('category') == category]
                if impact:
                    filtered_news = [item for item in filtered_news if item.get('impact') == impact]
                
                result[section] = filtered_news
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/news/classify', methods=['POST'])
def classify_news():
    """Classifie un texte d'actualité soumis"""
    try:
        data = request.json
        if not data or 'text' not in data:
            return jsonify({"error": "Le champ 'text' est requis"}), 400
        
        # Créer un faux élément d'actualité pour la classification
        news_item = {
            "title": data.get('title', ''),
            "content": data.get('text', '')
        }
        
        # Classifier l'élément
        classified_item = classifier.classify_news_item(news_item)
        
        return jsonify(classified_item)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/news/update', methods=['POST'])
def update_classifications():
    """Met à jour les classifications dans le fichier d'actualités"""
    try:
        success = classifier.classify_news_file(NEWS_FILE)
        if success:
            return jsonify({"status": "success", "message": "Classifications mises à jour"})
        else:
            return jsonify({"status": "error", "message": "Échec de la mise à jour des classifications"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Port par défaut 5000, ou spécifié par une variable d'environnement
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)