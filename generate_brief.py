"""
generate_brief.py - Générateur de brief stratégique pour TradePulse
Ce script analyse les données financières via GPT pour produire un résumé stratégique
utilisé ensuite par le générateur de portefeuilles.
"""

import os
import json
import requests
import datetime
import logging
from dotenv import load_dotenv

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Chargement des clés si local
load_dotenv()

# Récupération de la clé API (environnement ou GitHub secrets)
API_KEY = os.environ.get("API_CHAT")
if not API_KEY:
    raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie.")

# Paths
DATA_PATH = os.path.join(os.path.dirname(__file__), "data")
THEMES_PATH = os.path.join(DATA_PATH, "themes.json")
NEWS_PATH = os.path.join(DATA_PATH, "news.json")
BRIEF_PATH = os.path.join(DATA_PATH, "brief_ia.json")
BRIEF_MD_PATH = os.path.join(DATA_PATH, "brief_ia.md")

def load_json_data(file_path):
    """Charger des données depuis un fichier JSON avec gestion d'erreurs."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
            logger.info(f"✅ Données JSON chargées avec succès depuis {file_path}")
            return data
    except Exception as e:
        logger.error(f"❌ Erreur lors du chargement de {file_path}: {str(e)}")
        return {}

def call_openai_api(prompt):
    """Appel à l'API OpenAI avec gestion d'erreurs et retry."""
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
        
        data = {
            "model": "gpt-4o", # Utilisation de gpt-4o ou autre modèle disponible
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4
        }
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data
        )
        
        if response.status_code != 200:
            logger.error(f"❌ Erreur API OpenAI: {response.status_code} - {response.text}")
            raise Exception(f"Erreur API OpenAI: {response.status_code}")
            
        result = response.json()
        return result["choices"][0]["message"]["content"]
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'appel à l'API OpenAI: {str(e)}")
        raise

def main():
    """Fonction principale pour générer le brief stratégique."""
    try:
        logger.info("🔍 Chargement des données financières...")
        
        # Chargement des fichiers JSON
        themes_data = load_json_data(THEMES_PATH)
        news_data = load_json_data(NEWS_PATH)
        
        # Validation des données
        if not themes_data or not news_data:
            logger.error("❌ Données incomplètes pour générer le brief")
            return
            
        # Regrouper toutes les actualités (globales)
        all_news = []
        for category, articles in news_data.items():
            if isinstance(articles, list):
                all_news.extend(articles)
                logger.info(f"📰 {len(articles)} actualités trouvées dans la catégorie {category}")
        
        # Vérification du nombre d'actualités
        if not all_news:
            logger.error("❌ Aucune actualité trouvée. Vérifiez le format de news.json")
            return
            
        logger.info(f"📊 Total: {len(all_news)} actualités à analyser")
        
        # Trier les news par importance_score décroissant
        # Utiliser le score si disponible, sinon utiliser un score par défaut
        top_news = sorted(
            all_news, 
            key=lambda x: x.get("importance_score", 0) if "importance_score" in x 
                else x.get("score", 0),
            reverse=True
        )[:25]  # Limiter aux 25 plus importantes
        
        logger.info(f"🔝 Sélection des {len(top_news)} actualités les plus importantes")
        
        # Extraction des thèmes dominants
        themes_weekly = themes_data.get("themes", {}).get("weekly", [])
        if not themes_weekly:
            logger.warning("⚠️ Aucun thème hebdomadaire trouvé. Vérifiez le format de themes.json")
            themes_section = "[]"
        else:
            themes_section = json.dumps(themes_weekly, indent=2, ensure_ascii=False)
            logger.info(f"🔍 {len(themes_weekly)} thèmes dominants identifiés")

        # Construction du prompt expert
        prompt = f"""
Tu es un analyste macroéconomique senior travaillant pour une société de gestion d'actifs. Ta mission est de générer un brief stratégique synthétique à partir de données économiques, sectorielles et géopolitiques. Tu vas recevoir deux types de données :

1. **Thèmes dominants** (structurés) extraits de plus de 100 articles financiers récents
2. **Actualités importantes** (résumés de haute importance avec impact et score)

Ton objectif est de produire un **brief stratégique clair et synthétique**, à destination d'un comité d'investissement.

### Instructions clés :

- **Analyse en profondeur** : ne te contente pas de résumer les faits, **interprète les implications stratégiques** à moyen terme.  
  > Ex. Si Trump annonce des droits de douane, demande-toi : quel impact sur l'inflation ? la Fed réagira-t-elle ? la croissance sera-t-elle affectée ?

- **Structure du brief :**
  1. **Macroéconomie** → tendances globales, inflation, taux, croissance, géopolitique
  2. **Marchés** → tendances observées (volatilité, tech, matières premières)
  3. **Secteurs** → secteurs en surperformance ou en stress
  4. **Régions clés** → focus USA, Europe, Chine, Emergents
  5. **Risques & opportunités** → synthèse claire des points d'attention et de potentiel

- **Priorise la qualité analytique sur le volume**. Tu dois faire preuve de **jugement** : filtre le bruit, isole les dynamiques importantes.

- **Format final** : 
  - Titres clairs par section
  - Bullet points ou paragraphes courts par idée
  - Maximum ~600 tokens

---
📂 **Thèmes dominants (30 derniers jours)** :
{themes_section}

📂 **Actualités importantes (Top 25 globales)** :
{json.dumps(top_news, indent=2, ensure_ascii=False)}
---

Fournis-moi un **brief stratégique maintenant**, selon les consignes ci-dessus.
"""
        
        logger.info("🧠 Génération du brief stratégique via OpenAI...")
        
        # Appel à l'API OpenAI
        brief = call_openai_api(prompt)
        
        # Préparation des données à sauvegarder
        brief_data = {
            "brief": brief,
            "generated_at": datetime.datetime.now().isoformat(),
            "source": {
                "themes_count": len(themes_weekly),
                "news_count": len(top_news)
            }
        }
        
        # Assurez-vous que le répertoire data existe
        os.makedirs(DATA_PATH, exist_ok=True)
        
        # Sauvegarde dans brief_ia.json
        with open(BRIEF_PATH, "w", encoding="utf-8") as f:
            json.dump(brief_data, f, ensure_ascii=False, indent=2)
        
        # Sauvegarde en format Markdown pour lisibilité humaine
        with open(BRIEF_MD_PATH, "w", encoding="utf-8") as f:
            f.write("# Brief Stratégique TradePulse\n\n")
            f.write(f"*Généré le {datetime.datetime.now().strftime('%d/%m/%Y à %H:%M')}*\n\n")
            f.write(brief)
        
        logger.info(f"✅ Brief stratégique généré et sauvegardé: {BRIEF_PATH} et {BRIEF_MD_PATH}")
        
        # Créer un exemple de sortie pour le debug
        debug_dir = os.path.join(os.path.dirname(__file__), "debug")
        os.makedirs(debug_dir, exist_ok=True)
        debug_path = os.path.join(debug_dir, f"brief_ia_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.md")
        
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write("# Brief Stratégique TradePulse - DEBUG\n\n")
            f.write(f"*Généré le {datetime.datetime.now().strftime('%d/%m/%Y à %H:%M')}*\n\n")
            f.write("## Prompt envoyé\n```\n")
            f.write(prompt)
            f.write("\n```\n\n## Résultat\n\n")
            f.write(brief)
        
        logger.info(f"🔍 Version debug sauvegardée: {debug_path}")
        
    except Exception as e:
        logger.error(f"❌ Erreur générale: {str(e)}")
        raise

if __name__ == "__main__":
    main()
