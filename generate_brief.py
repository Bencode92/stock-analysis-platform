"""
generate_brief.py - Générateur de brief stratégique pour TradePulse
Ce script analyse les données financières via GPT pour produire un résumé stratégique
utilisé ensuite par le générateur de portefeuilles.
"""

import os
import sys
import json
import requests
import datetime
import logging
import locale
import time
import re
from collections import defaultdict
from dotenv import load_dotenv

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Configuration de la locale française pour les dates
try:
    locale.setlocale(locale.LC_TIME, "fr_FR.UTF-8")
except Exception:
    try:
        locale.setlocale(locale.LC_TIME, "fr_FR")
    except Exception:
        logger.warning("⚠️ Impossible de configurer la locale française, utilisation de la locale par défaut")

# Chargement des clés si local
load_dotenv()

# Récupération de la clé API (environnement ou GitHub secrets)
API_KEY = os.environ.get("API_CHAT")
if not API_KEY:
    raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie.")

# Modèle paramétrable via variable d'environnement
MODEL_NAME = os.environ.get("TRADEPULSE_LLM_MODEL", "gpt-4o-mini")

# Paths
DATA_PATH = os.path.join(os.path.dirname(__file__), "data")
THEMES_PATH = os.path.join(DATA_PATH, "themes.json")
NEWS_PATH = os.path.join(DATA_PATH, "news.json")
MARKET_PATH = os.path.join(DATA_PATH, "markets.json")
SECTOR_PATH = os.path.join(DATA_PATH, "sectors.json")
BRIEF_PATH = os.path.join(DATA_PATH, "brief_ia.json")
BRIEF_MD_PATH = os.path.join(DATA_PATH, "brief_ia.md")


# ======================================================================
# Helpers génériques
# ======================================================================

def load_json_data(file_path):
    """Charger des données depuis un fichier JSON avec gestion d'erreurs."""
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)
            if not isinstance(data, (dict, list)):
                logger.warning(f"⚠️ Format de données non valide dans {file_path}, doit être dict ou list")
                return {}
            logger.info(f"✅ Données JSON chargées avec succès depuis {file_path}")
            return data
    except FileNotFoundError:
        logger.error(f"❌ Fichier non trouvé: {file_path}")
        return {}
    except json.JSONDecodeError:
        logger.error(f"❌ Format JSON invalide dans {file_path}")
        return {}
    except Exception as e:
        logger.error(f"❌ Erreur lors du chargement de {file_path}: {str(e)}")
        return {}


def extract_timestamp_from_data(data):
    """Tente d'extraire un timestamp ISO 8601 des métadonnées."""
    if not isinstance(data, dict):
        return None

    candidates = []

    # Top-level clés possibles
    for key in ("updated_at", "generated_at", "last_updated", "lastUpdated"):
        val = data.get(key)
        if isinstance(val, str):
            candidates.append(val)

    # Dans meta / metadata
    for meta_key in ("meta", "metadata"):
        meta = data.get(meta_key)
        if isinstance(meta, dict):
            for key in ("updated_at", "generated_at", "last_updated", "lastUpdated"):
                val = meta.get(key)
                if isinstance(val, str):
                    candidates.append(val)

    for ts in candidates:
        try:
            # Gestion du 'Z' pour UTC
            if ts.endswith("Z"):
                ts = ts.replace("Z", "+00:00")
            return datetime.datetime.fromisoformat(ts)
        except Exception:
            continue

    return None


def validate_data_freshness(data, label, max_age_hours=48):
    """
    Valide la fraîcheur des données si un timestamp est disponible.
    Retourne True si OK ou si aucun timestamp n'est trouvé.
    """
    ts = extract_timestamp_from_data(data)
    if ts is None:
        logger.info(f"ℹ️ Aucun timestamp détecté pour les données '{label}', pas de contrôle de fraîcheur strict.")
        return True

    # Gestion timezone
    now = datetime.datetime.now(ts.tzinfo) if ts.tzinfo else datetime.datetime.now()
    age_hours = (now - ts).total_seconds() / 3600.0
    
    if age_hours > max_age_hours:
        logger.error(
            f"❌ Données '{label}' obsolètes: {age_hours:.1f}h (> {max_age_hours}h) depuis la dernière mise à jour ({ts.isoformat()})"
        )
        return False

    logger.info(f"✅ Données '{label}' fraîches ({age_hours:.1f}h d'ancienneté).")
    return True


def truncate_json_data(data, max_chars=15000, label=""):
    """Tronque les données JSON si elles dépassent max_chars pour éviter le dépassement du context window."""
    if data is None:
        return ""
    if isinstance(data, str):
        json_str = data
    else:
        try:
            json_str = json.dumps(data, indent=2, ensure_ascii=False)
        except Exception:
            json_str = str(data)

    length = len(json_str)
    if length > max_chars:
        logger.warning(
            f"⚠️ Données '{label}' tronquées ({length} → {max_chars} caractères) pour respecter la limite de contexte."
        )
        return json_str[:max_chars] + "\n... [TRONQUÉ]"
    return json_str


# ======================================================================
# Extraction de scores et régions depuis les news
# ======================================================================

def get_importance_score(item):
    """Récupère un score d'importance cohérent depuis différentes clés possibles."""
    for key in ("imp", "importance_score", "score"):
        val = item.get(key)
        if val is None:
            continue
        if isinstance(val, (int, float)):
            return float(val)
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    return 0.0


def get_quality_score(item):
    """Récupère un score de qualité s'il existe."""
    for key in ("quality_score", "quality", "score"):
        val = item.get(key)
        if val is None:
            continue
        if isinstance(val, (int, float)):
            return float(val)
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    return None


def get_region_label(item):
    """
    Normalise la région pour limiter le biais US.
    Utilise d'abord 'region', puis 'country' / 'country_code'.
    """
    region = item.get("region") or item.get("zone")
    if isinstance(region, str) and region.strip():
        return region

    country = item.get("country") or item.get("country_code") or item.get("location")
    if not country:
        return "Autres"

    country_upper = str(country).upper()

    if any(tok in country_upper for tok in ("US", "UNITED STATES", "USA", "AMERICA")):
        return "États-Unis"
    if any(tok in country_upper for tok in ("FR", "FRANCE", "DE", "GERMANY", "EU", "EUROPE",
                                            "IT", "ITALY", "ES", "SPAIN", "UK", "UNITED KINGDOM", "GB")):
        return "Europe"
    if any(tok in country_upper for tok in ("CN", "CHINA", "JP", "JAPAN", "HK", "HONG KONG",
                                            "SG", "SINGAPORE", "KR", "KOREA", "INDIA", "IN")):
        return "Asie"
    if any(tok in country_upper for tok in ("BR", "BRAZIL", "MX", "MEXICO", "ZA", "SOUTH AFRICA",
                                            "AFRICA", "LATAM")):
        return "Émergents"

    return "Autres"


def compute_rank_score(item):
    """Score composite importance + qualité pour le tri."""
    imp = get_importance_score(item)
    q = get_quality_score(item)
    if q is None:
        return imp
    return 0.7 * imp + 0.3 * q


# ======================================================================
# Sélection et synthèse des news
# ======================================================================

def select_top_news(all_news, max_items=60, min_items=30):
    """
    Sélectionne les actualités les plus importantes avec :
    - seuil dynamique sur le score d'importance (≈ percentile 75)
    - rééquilibrage par région pour limiter le biais US
    """
    if not all_news:
        return []

    # Calcul du seuil dynamique (percentile 75)
    imp_values = [get_importance_score(n) for n in all_news if get_importance_score(n) > 0]
    if imp_values:
        values_sorted = sorted(imp_values)
        idx = int(0.75 * (len(values_sorted) - 1))
        imp_threshold = values_sorted[idx]
        imp_threshold = max(imp_threshold, 40.0)  # seuil plancher
    else:
        imp_threshold = 60.0

    logger.info(f"📊 Seuil dynamique d'importance des news fixé à {imp_threshold:.1f}")

    # Filtrage initial
    filtered = [n for n in all_news if get_importance_score(n) >= imp_threshold]

    if len(filtered) > max_items * 3:
        filtered = sorted(filtered, key=compute_rank_score, reverse=True)[: max_items * 3]

    # Fallback si trop peu de news passent le filtre
    if len(filtered) < min_items:
        logger.warning(
            f"⚠️ Seulement {len(filtered)} actualités au-dessus du seuil, fallback sur tri global."
        )
        filtered = sorted(all_news, key=compute_rank_score, reverse=True)[: max(max_items, min_items)]
    else:
        filtered = sorted(filtered, key=compute_rank_score, reverse=True)

    # Regroupement par région
    news_by_region = defaultdict(list)
    for n in filtered:
        reg = get_region_label(n)
        news_by_region[reg].append(n)

    logger.info("📌 Répartition par région avant filtrage:")
    for reg, items in news_by_region.items():
        logger.info(f"   - {reg}: {len(items)} actualités")

    region_count = len(news_by_region)
    if region_count == 0:
        return filtered[:max_items]

    base_per_region = max_items // region_count if region_count > 0 else max_items
    selected = []
    used_ids = set()

    # Limites par région (anti-biais US: max 30%)
    for reg, items in news_by_region.items():
        items_sorted = sorted(items, key=compute_rank_score, reverse=True)
        if reg in ("États-Unis", "US", "USA"):
            limit = max(base_per_region, int(max_items * 0.3))
        else:
            limit = max(base_per_region, int(max_items * 0.15))
        for n in items_sorted[:limit]:
            if len(selected) >= max_items:
                break
            selected.append(n)
            used_ids.add(id(n))

    # Compléter si pas assez d'items
    if len(selected) < max_items:
        remaining = [
            n for n in sorted(filtered, key=compute_rank_score, reverse=True) if id(n) not in used_ids
        ]
        for n in remaining:
            if len(selected) >= max_items:
                break
            selected.append(n)

    logger.info(f"🔝 {len(selected)} actualités sélectionnées après filtrage dynamique et rééquilibrage régional")
    return selected[:max_items]


def synthesize_news(news_list):
    """
    Synthétise les actualités pour optimiser l'utilisation des tokens.
    Adapté à la structure actuelle de news.json (imp, impact, quality_score, snippet, country, t).
    """
    logger.info("🔄 Synthétisation des actualités pour optimisation des tokens...")

    simplified_news = []
    
    for item in news_list:
        titre = item.get("title") or item.get("headline") or ""
        titre = titre[:150]

        date = item.get("date") or item.get("published_at") or item.get("time") or ""
        category = item.get("category") or item.get("topic") or ""
        region = get_region_label(item)
        importance = get_importance_score(item)
        quality = get_quality_score(item)
        composite = compute_rank_score(item)

        news_item = {
            "titre": titre,
            "date": date,
            "catégorie": category,
            "région": region,
            "importance": round(importance, 1),
            "score_composite": round(composite, 1),
        }

        if quality is not None:
            news_item["qualité"] = round(quality, 1)

        # Sentiment / impact
        sentiment = item.get("impact") or item.get("sentiment")
        if sentiment:
            news_item["sentiment"] = sentiment

        # Source
        source = item.get("source") or item.get("provider")
        if source:
            news_item["source"] = source

        # Tags thématiques
        tags = item.get("t", [])
        if tags:
            news_item["tags"] = tags[:5]

        # Snippet / résumé
        snippet = (
            item.get("snippet")
            or item.get("summary")
            or item.get("content")
            or item.get("text")
        )
        if snippet:
            s = str(snippet).strip().replace("\n", " ")
            if len(s) > 220:
                s = s[:220] + "..."
            news_item["résumé"] = s

        simplified_news.append(news_item)

    logger.info(f"✅ {len(simplified_news)} actualités synthétisées pour optimisation des tokens")
    return simplified_news


# ======================================================================
# Validation du brief généré
# ======================================================================

def validate_brief_structure(brief_text):
    """
    Valide grossièrement la structure du brief via des titres Markdown.
    Ne bloque pas, mais log un warning si des sections manquent.
    """
    if not brief_text:
        logger.error("❌ Brief vide, impossible de valider la structure.")
        return {"ok": False, "missing": ["TOUT"]}

    section_patterns = {
        "Macroéconomie": r"(?:^|\n)#{1,3}\s+.*macro",
        "Marchés": r"(?:^|\n)#{1,3}\s+.*march",
        "Secteurs": r"(?:^|\n)#{1,3}\s+.*secteur",
        "Régions": r"(?:^|\n)#{1,3}\s+.*région",
        "Implications pour l'investisseur": r"(?:^|\n)#{1,3}\s+.*implication",
        "Anticipations vs Réalité": r"(?:^|\n)#{1,3}\s+.*anticipation",
        "Risques clés": r"(?:^|\n)#{1,3}\s+.*risque",
        "Facteurs déterminants": r"(?:^|\n)#{1,3}\s+.*facteur",
    }

    missing = []
    for name, pattern in section_patterns.items():
        if not re.search(pattern, brief_text, flags=re.IGNORECASE):
            missing.append(name)

    if missing:
        logger.warning(
            f"⚠️ Structure du brief incomplète, sections potentielles manquantes: {', '.join(missing)}"
        )
    else:
        logger.info("✅ Structure globale du brief conforme (sections Markdown détectées).")

    return {"ok": len(missing) == 0, "missing": missing}


# ======================================================================
# Appel API OpenAI avec retry robuste
# ======================================================================

def call_openai_api(prompt, model=None, temperature=0.2, max_retries=5, timeout=90):
    """
    Appel à l'API OpenAI avec gestion robuste des erreurs:
    - Retry avec backoff exponentiel jusqu'à 120s
    - Gestion spécifique du 429 (rate limit) avec Retry-After header
    - Timeout configurable
    """
    if model is None:
        model = MODEL_NAME

    attempt = 1
    while attempt <= max_retries:
        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {API_KEY}",
            }

            data = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
            }

            logger.info(f"🧠 Appel OpenAI (tentative {attempt}/{max_retries}, modèle={model})...")
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=data,
                timeout=timeout,
            )

            # Succès
            if response.status_code == 200:
                result = response.json()
                content = result["choices"][0]["message"]["content"]
                logger.info(f"✅ Réponse OpenAI reçue (tentative {attempt}).")
                return content

            # Rate limit spécifique (429)
            if response.status_code == 429:
                retry_after_header = response.headers.get("Retry-After")
                if retry_after_header:
                    try:
                        retry_after = int(retry_after_header)
                    except ValueError:
                        retry_after = 60
                else:
                    retry_after = min(4 * (2 ** (attempt - 1)), 120)

                logger.warning(
                    f"⏳ Rate limit OpenAI (429) à la tentative {attempt}. Pause de {retry_after} secondes..."
                )
                time.sleep(retry_after)

            else:
                # Autres erreurs HTTP
                logger.error(
                    f"❌ Erreur API OpenAI (tentative {attempt}): {response.status_code} - {response.text}"
                )
                if attempt == max_retries:
                    raise Exception(
                        f"Erreur API OpenAI après {max_retries} tentatives: {response.status_code}"
                    )
                backoff = min(4 * (2 ** (attempt - 1)), 120)
                logger.info(
                    f"⏱️ Backoff exponentiel: attente de {backoff} secondes avant nouvelle tentative..."
                )
                time.sleep(backoff)

        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Exception réseau OpenAI (tentative {attempt}): {str(e)}")
            if attempt == max_retries:
                raise
            backoff = min(4 * (2 ** (attempt - 1)), 120)
            logger.info(
                f"⏱️ Backoff réseau: attente de {backoff} secondes avant nouvelle tentative..."
            )
            time.sleep(backoff)

        except Exception as e:
            logger.error(
                f"❌ Exception inattendue lors de l'appel à l'API OpenAI (tentative {attempt}): {str(e)}"
            )
            if attempt == max_retries:
                raise
            backoff = min(4 * (2 ** (attempt - 1)), 120)
            logger.info(
                f"⏱️ Backoff général: attente de {backoff} secondes avant nouvelle tentative..."
            )
            time.sleep(backoff)

        finally:
            attempt += 1

    raise RuntimeError("Échec de l'appel OpenAI après tous les retries.")


# ======================================================================
# Fonction principale
# ======================================================================

def main():
    """Fonction principale pour générer le brief stratégique."""
    try:
        logger.info("🔍 Chargement des données financières...")

        # Chargement des fichiers JSON
        themes_data = load_json_data(THEMES_PATH)
        news_data = load_json_data(NEWS_PATH)
        markets_data = load_json_data(MARKET_PATH)
        sectors_data = load_json_data(SECTOR_PATH)

        # Validation fraîcheur (si timestamps disponibles)
        freshness_ok = True
        if themes_data:
            freshness_ok &= validate_data_freshness(themes_data, "thèmes", max_age_hours=72)
        if news_data:
            freshness_ok &= validate_data_freshness(news_data, "actualités", max_age_hours=48)
        if markets_data:
            freshness_ok &= validate_data_freshness(markets_data, "marchés", max_age_hours=24)
        if sectors_data:
            freshness_ok &= validate_data_freshness(sectors_data, "secteurs", max_age_hours=72)

        if not freshness_ok:
            logger.error("❌ Données obsolètes détectées, arrêt de la génération du brief.")
            sys.exit(1)

        # Validation des données minimales
        if not themes_data or not news_data:
            logger.error("❌ Données incomplètes pour générer le brief (thèmes ou actualités manquants).")
            sys.exit(1)

        # Regrouper toutes les actualités (globales)
        all_news = []
        if isinstance(news_data, dict):
            for category, articles in news_data.items():
                # On ne prend que les listes (us, france, asia, etc.), pas lastUpdated/metadata
                if isinstance(articles, list):
                    all_news.extend(articles)
                    logger.info(f"📰 {len(articles)} actualités trouvées dans la catégorie {category}")
        elif isinstance(news_data, list):
            all_news = news_data
            logger.info(f"📰 {len(all_news)} actualités trouvées (format liste).")

        if not all_news:
            logger.error("❌ Aucune actualité trouvée. Vérifiez le format de news.json")
            sys.exit(1)

        logger.info(f"📊 Total: {len(all_news)} actualités brutes à analyser")

        # Sélection dynamique des actualités les plus importantes
        top_news = select_top_news(all_news, max_items=60, min_items=30)

        # Synthèse des actualités sélectionnées
        synthesized_news = synthesize_news(top_news)

        # Extraction des thèmes dominants
        if isinstance(themes_data, dict):
            themes_weekly = themes_data.get("themes", {}).get("weekly", [])
        else:
            themes_weekly = []

        if not themes_weekly:
            logger.warning("⚠️ Aucun thème hebdomadaire trouvé. Vérifiez le format de themes.json")
            themes_section = "[]"
        else:
            themes_section = json.dumps(themes_weekly, indent=2, ensure_ascii=False)
            logger.info(f"🔍 {len(themes_weekly)} thèmes dominants identifiés")

        # Formatage de la date actuelle
        current_date = datetime.datetime.now()
        try:
            date_formatted = current_date.strftime("%d %B %Y")
        except Exception:
            month_names = {
                1: "janvier", 2: "février", 3: "mars", 4: "avril", 5: "mai", 6: "juin",
                7: "juillet", 8: "août", 9: "septembre", 10: "octobre", 11: "novembre", 12: "décembre",
            }
            date_formatted = f"{current_date.day} {month_names[current_date.month]} {current_date.year}"

        # Préparation des blocs JSON tronqués pour le prompt
        news_block = truncate_json_data(
            synthesized_news, max_chars=20000, label="actualités importantes"
        )
        markets_block = truncate_json_data(
            markets_data, max_chars=15000, label="marchés"
        )
        sectors_block = truncate_json_data(
            sectors_data, max_chars=12000, label="secteurs"
        )

        # Construction du prompt expert
        prompt = f"""
Tu es un stratège senior en allocation d'actifs au sein d'une société de gestion de renom.

Tu reçois plusieurs types de données financières :
1. **Thèmes dominants** extraits de plus de 100 articles économiques (structurés par thème, région, secteur)
2. **Actualités à fort impact** (Top {len(synthesized_news)} globales, scorées par importance/qualité, en format synthétisé)
3. **Données marché actuelles** (indices, taux, spreads, etc.)
4. **Performances sectorielles récentes**

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
- Utiliser les données de marché et sectorielles comme points de repère factuels dans tes anticipations
- Identifier les risques clés qui pourraient modifier les scénarios présentés
- Lister les métriques et événements importants à surveiller dans les semaines à venir
- Intégrer des chiffres clés des données de marché et sectorielles pour renforcer l'analyse
- Formuler une recommandation explicite sur la position en liquidité/cash à maintenir
- Ne pas inventer de chiffres précis si l'information n'est pas présente dans les données. Dans ce cas, reste générique (ex: "les taux longs restent élevés") plutôt que faux-précis.

---

📐 **Structure du brief attendue** (utilise des **titres Markdown de niveau 2 (`## ...`)** pour chaque grande partie) :

1. **Macroéconomie** – Tendances globales, scénarios, causalité économique (ex : "Si X ⇒ alors Y ⇒ impact Z")
   - Pour chaque scénario, AJOUTE UN TITRE EXPLICITE, par exemple : 
     * Scénario 1 : "Récession modérée" (probabilité élevée)
     * Scénario 2 : "Stabilisation progressive" (probabilité moyenne)
     * Scénario 3 : "Rebond optimiste" (probabilité faible)

2. **Marchés** – Où en est-on dans le cycle ? Que price le marché ? Quelles rotations sectorielles probables ?
   - INTÈGRE DES CHIFFRES CLÉS, comme "Les indices boursiers ont perdu en moyenne -3% cette semaine" ou "le taux 10 ans US est descendu à 3,25%"

3. **Secteurs** – Surperformance / sous-performance attendue
   - CITE DES DONNÉES CONCRÈTES, par exemple "Le secteur technologique a surperformé de +5,2% le mois dernier"

4. **Régions clés** – États-Unis, Europe, Asie, Emergents : quelles zones sur / sous-performent ?

5. **Implications pour l'investisseur** – Synthèse claire avec recommandations (actions value ? matières premières ? obligations longues ?)
   - INCLURE UNE POSITION SUR LA LIQUIDITÉ/CASH, par exemple "Maintenir 15% de liquidités pour saisir les opportunités en cas de correction"

6. 🧠 **Anticipations vs Réalité** – Mets en évidence 2 ou 3 endroits où la perception du marché semble erronée, et ce que cela implique.

7. 🔺 **Risques clés** – Quels sont les 3 à 5 principaux risques à surveiller ?

8. 📊 **Facteurs déterminants du marché** – Quelles seront les métriques ou annonces à suivre dans les semaines à venir ?

---

⚠️ **Niveau d'exigence** :

- Sois **stratégique et synthétique** (max ~800 tokens)
- Utilise des **chaînes de raisonnement** (pas seulement des constats)
- Distingue **court terme (1-3 mois)** vs **moyen terme (6-12 mois)**
- Intègre la **composante comportementale** : que price déjà le marché ? quelles attentes sont risquées ?
- IMPORTANT: En conclusion, inclure **3 convictions majeures avec une nuance temporelle précise**:
  - Utiliser des mois précis plutôt que "3 prochains mois" (ex: "Entre mai et juillet 2025")
  - Ajouter une raison d'action immédiate et lier à des événements spécifiques
  - Exemple amélioré: "Entre avril et juin, les obligations longues offrent un couple rendement/risque attractif en anticipation d'une détente monétaire début été."

---

📂 **Thèmes dominants (30 derniers jours)** :
{themes_section}

📂 **Actualités importantes (Top {len(synthesized_news)} globales, format synthétisé)** :
{news_block}

📈 **Données marché actuelles** (indices, taux, spreads, etc.) :
{markets_block}

🏭 **Performances sectorielles récentes** :
{sectors_block}

---

🧠 Fournis maintenant le **brief stratégique complet**, directement exploitable par une équipe d'asset allocation.
"""

        logger.info("🧠 Génération du brief stratégique via OpenAI...")

        # Appel à l'API OpenAI
        brief = call_openai_api(prompt, temperature=0.2)

        # Validation basique de la longueur du brief
        brief_len = len(brief.strip()) if brief else 0
        if brief_len < 500:
            raise ValueError(
                f"Brief généré anormalement court ({brief_len} caractères). Probable erreur de génération."
            )

        # Validation de la structure (non bloquant mais loggue)
        validation = validate_brief_structure(brief)

        # Préparation des données à sauvegarder
        brief_data = {
            "brief": brief,
            "generated_at": datetime.datetime.now().isoformat(),
            "source": {
                "themes_count": len(themes_weekly),
                "news_count": len(synthesized_news),
                "original_news_count": len(all_news),
                "selected_news_count": len(top_news),
                "markets_data": bool(markets_data),
                "sectors_data": bool(sectors_data),
            },
            "validation": validation,
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
            f.write("> **Sources de données:**\n")
            f.write(f"> - **Marchés:** {'✅ Chargés' if markets_data else '❌ Non disponibles'}\n")
            f.write(f"> - **Secteurs:** {'✅ Chargés' if sectors_data else '❌ Non disponibles'}\n")
            f.write(f"> - **Actualités:** {len(synthesized_news)} sources analysées (sur {len(all_news)} brutes)\n")
            f.write(f"> - **Thèmes:** {len(themes_weekly)} thèmes dominants identifiés\n")
            if validation["ok"]:
                f.write("> - **Validation:** ✅ Structure complète\n\n")
            else:
                missing = ", ".join(validation["missing"])
                f.write(f"> - **Validation:** ⚠️ Sections manquantes: {missing}\n\n")
            f.write(brief)
            f.write(
                "\n\n---\n\n*Cette note est générée automatiquement par TradePulse AI, "
                "sur la base des actualités et thèmes détectés dans les 7 à 30 derniers jours.*\n"
            )

        logger.info(f"✅ Brief stratégique généré et sauvegardé: {BRIEF_PATH} et {BRIEF_MD_PATH}")

        # Version debug
        debug_dir = os.path.join(os.path.dirname(__file__), "debug")
        os.makedirs(debug_dir, exist_ok=True)
        debug_path = os.path.join(
            debug_dir, f"brief_ia_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        )

        with open(debug_path, "w", encoding="utf-8") as f:
            f.write("# Brief Stratégique TradePulse - DEBUG\n\n")
            f.write(f"*Généré le {datetime.datetime.now().strftime('%d/%m/%Y à %H:%M')}*\n\n")
            f.write("> **Sources de données:**\n")
            f.write(f"> - **Marchés:** {'✅ Chargés' if markets_data else '❌ Non disponibles'}\n")
            f.write(f"> - **Secteurs:** {'✅ Chargés' if sectors_data else '❌ Non disponibles'}\n")
            f.write(f"> - **Actualités:** {len(synthesized_news)} sources analysées (sur {len(all_news)} brutes)\n")
            f.write(f"> - **Thèmes:** {len(themes_weekly)} thèmes dominants identifiés\n")
            if validation["ok"]:
                f.write("> - **Validation:** ✅ Structure complète\n\n")
            else:
                missing = ", ".join(validation["missing"])
                f.write(f"> - **Validation:** ⚠️ Sections manquantes: {missing}\n\n")
            f.write("## Prompt envoyé\n```\n")
            f.write(prompt)
            f.write("\n```\n\n## Résultat\n\n")
            f.write(brief)
            f.write(
                "\n\n---\n\n*Cette note est générée automatiquement par TradePulse AI, "
                "sur la base des actualités et thèmes détectés dans les 7 à 30 derniers jours.*\n"
            )

        logger.info(f"🔍 Version debug sauvegardée: {debug_path}")

    except Exception as e:
        logger.error(f"❌ Erreur générale: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
