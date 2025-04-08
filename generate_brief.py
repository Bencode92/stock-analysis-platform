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
import locale
from dotenv import load_dotenv

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration de la locale française pour les dates
try:
    locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')
except:
    try:
        locale.setlocale(locale.LC_TIME, 'fr_FR')
    except:
        logger.warning("⚠️ Impossible de configurer la locale française, utilisation de la locale par défaut")

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
        
        # AMÉLIORATION: Trier et filtrer les actualités avec un seuil dynamique
        sorted_news = sorted(
            all_news, 
            key=lambda x: x.get("importance_score", 0) if "importance_score" in x 
                else x.get("score", 0),
            reverse=True
        )
        
        # Ne garder que les articles au-dessus d'un seuil raisonnable (ou au moins 15)
        news_cutoff = [n for n in sorted_news if n.get("importance_score", 0) >= 5 or n.get("score", 0) >= 5]
        top_news = news_cutoff[:50] if len(news_cutoff) >= 15 else sorted_news[:30]
        
        logger.info(f"🔝 Sélection de {len(top_news)} actualités pertinentes")
        
        # Extraction des thèmes dominants
        themes_weekly = themes_data.get("themes", {}).get("weekly", [])
        if not themes_weekly:
            logger.warning("⚠️ Aucun thème hebdomadaire trouvé. Vérifiez le format de themes.json")
            themes_section = "[]"
        else:
            themes_section = json.dumps(themes_weekly, indent=2, ensure_ascii=False)
            logger.info(f"🔍 {len(themes_weekly)} thèmes dominants identifiés")

        # Formatage de la date actuelle
        current_date = datetime.datetime.now()
        try:
            date_formatted = current_date.strftime('%d %B %Y')
        except:
            # Fallback si la locale française ne fonctionne pas
            month_names = {
                1: "janvier", 2: "février", 3: "mars", 4: "avril", 5: "mai", 6: "juin",
                7: "juillet", 8: "août", 9: "septembre", 10: "octobre", 11: "novembre", 12: "décembre"
            }
            date_formatted = f"{current_date.day} {month_names[current_date.month]} {current_date.year}"

        # Construction du prompt expert AMÉLIORÉ avec analyse comportementale et perception + contexte temporel
        prompt = f"""
Tu es un stratège senior en allocation d'actifs au sein d'une société de gestion de renom.

Tu reçois deux types de données financières :
1. **Thèmes dominants** extraits de plus de 100 articles économiques (structurés par thème, région, secteur)
2. **Actualités à fort impact** (Top {len(top_news)} globales, scorées par importance)

🎯 **Objectif** : Produire un **brief stratégique à destination d'un comité d'investissement**, clair, synthétique et orienté allocation.

---

🗓️ Nous sommes la semaine du {date_formatted}. Tu peux utiliser cette information temporelle pour contextualiser tes scénarios (FOMC, échéances, saison des résultats...).

---

🎓 **Tes missions** :

- Identifier les grandes **dynamiques macro, géopolitiques et sectorielles**
- Détailler **2 à 3 scénarios macro probables** à 3-12 mois, avec **leurs implications concrètes sur les classes d'actifs**
- Anticiper les **réactions probables des marchés** (prixant déjà certaines hypothèses)
- Détecter des **décalages perception / réalité** : où les marchés ou médias se trompent-ils ?
- Générer **des recommandations actionnables** sur l'allocation (secteurs, zones, classes d'actifs)

---

📐 **Structure du brief attendue** :

1. **Macroéconomie** – Tendances globales, scénarios, causalité économique (ex : "Si X ⇒ alors Y ⇒ impact Z")
2. **Marchés** – Où en est-on dans le cycle ? Que price le marché ? Quelles rotations sectorielles probables ?
3. **Secteurs** – Surperformance / sous-performance attendue
4. **Régions clés** – États-Unis, Europe, Asie, Emergents : quelles zones sur / sous-performent ?
5. **Implications pour l'investisseur** – Synthèse claire avec recommandations (actions value ? matières premières ? obligations longues ?)
6. 🧠 **Anticipations vs Réalité** – Mets en évidence 2 ou 3 endroits où la perception du marché semble erronée, et ce que cela implique.

---

⚠️ **Niveau d'exigence** :

- Sois **stratégique et synthétique** (max ~800 tokens)
- Utilise des **chaînes de raisonnement** (pas seulement des constats)
- Distingue **court terme (1-3 mois)** vs **moyen terme (6-12 mois)**
- Intègre la **composante comportementale** : que price déjà le marché ? quelles attentes sont risquées ?
- N'oublie pas d'inclure une **conclusion avec 3 convictions majeures pour les 3 prochains mois**

---

📂 **Thèmes dominants (30 derniers jours)** :
{themes_section}

📂 **Actualités importantes (Top {len(top_news)} globales)** :
{json.dumps(top_news, indent=2, ensure_ascii=False)}

---

🧠 Fournis maintenant le **brief stratégique complet**, directement exploitable par une équipe d'asset allocation.
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
        
        # Sauvegarde en format Markdown pour lisibilité humaine avec signature/disclaimer
        with open(BRIEF_MD_PATH, "w", encoding="utf-8") as f:
            f.write("# Brief Stratégique TradePulse\n\n")
            f.write(f"*Généré le {datetime.datetime.now().strftime('%d/%m/%Y à %H:%M')}*\n\n")
            f.write(brief)
            f.write("\n\n---\n\n*Cette note est générée automatiquement par TradePulse AI, sur la base des actualités et thèmes détectés dans les 7 derniers jours.*\n")
        
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
            f.write("\n\n---\n\n*Cette note est générée automatiquement par TradePulse AI, sur la base des actualités et thèmes détectés dans les 7 derniers jours.*\n")
        
        logger.info(f"🔍 Version debug sauvegardée: {debug_path}")
        
    except Exception as e:
        logger.error(f"❌ Erreur générale: {str(e)}")
        raise

if __name__ == "__main__":
    main()
