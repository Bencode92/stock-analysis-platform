# Intégration Machine Learning pour TradePulse

Ce document explique comment l'intégration du Machine Learning dans TradePulse permet une analyse avancée des actualités financières.

## 📊 Fonctionnalités d'analyse ML intégrées

1. **Classification du sentiment** (positif, négatif, neutre)
2. **Score de confiance** pour chaque classification
3. **Filtrage par sentiment** des actualités
4. **Indicateurs visuels** de sentiment et confiance
5. **Mise à jour automatique** via GitHub Actions

## 🧩 Architecture technique

### Composants principaux

- **Backend ML**: Module Python `ml/news_classifier.py` utilisant FinBERT
- **Frontend**: Intégration JavaScript via `js/ml-news-integration.js`
- **Styles**: Indicateurs visuels définis dans `css/ml-sentiment-indicators.css`
- **Automatisation**: Workflow GitHub Actions `classify-news.yml`

### Fonctionnement du système

1. Les actualités sont récupérées et stockées dans `data/news.json`
2. Le module ML analyse chaque actualité et enrichit les données
3. L'interface utilisateur affiche les informations ML comme:
   - Badges de sentiment avec score de confiance
   - Indicateurs visuels de fiabilité
   - Filtres de sentiment dans l'interface

## 🚀 Comment utiliser les fonctionnalités ML

### Filtrage par sentiment

Utilisez le sélecteur "Tous sentiments" pour filtrer les actualités:
- **Positif**: Actualités à tendance haussière/optimiste
- **Négatif**: Actualités à tendance baissière/pessimiste
- **Neutre**: Actualités factuelles sans orientation claire

### Interprétation des badges de sentiment

- **Badge vert** ⬆️: Sentiment positif - impact haussier probable
- **Badge rouge** ⬇️: Sentiment négatif - impact baissier probable
- **Badge gris** ➖: Sentiment neutre - impact limité ou mixte

### Score de confiance

- Le pourcentage à côté du badge indique la confiance de la classification
- Les actualités avec une confiance > 85% sont marquées d'une étoile ★
- La barre de confiance sous chaque actualité visualise la fiabilité

## 🛠️ Personnalisation du système ML

### Ajustement des seuils

Vous pouvez modifier les seuils de classification dans `ml/news_classifier.py`:

```python
# Exemple de personnalisation des seuils
def classify_news_item(self, news_item):
    # Classification...
    
    # Modifier ces seuils pour ajuster la sensibilité
    if news_item["sentiment"] == "positive" and confidence > 0.7:  # ← Modifier ce seuil
        news_item["impact"] = "positive"
    elif news_item["sentiment"] == "negative" and confidence > 0.7:  # ← Modifier ce seuil
        news_item["impact"] = "negative"
    else:
        news_item["impact"] = "neutral"
```

### Choix du modèle

Pour utiliser un modèle ML différent, modifiez cette ligne dans `ml/news_classifier.py`:

```python
# Modèle par défaut (spécifique à la finance)
model_name = "ProsusAI/finbert"  

# Exemples d'alternatives:
# model_name = "distilbert-base-uncased-finetuned-sst-2-english"  # Modèle plus léger
# model_name = "nlptown/bert-base-multilingual-uncased-sentiment"  # Support multilingue
```

## 📈 Prochaines améliorations

1. **Classification multi-étiquettes** pour détecter plusieurs thèmes dans une actualité
2. **Analyse de l'horizon temporel** (impact à court/moyen/long terme)
3. **Détection des entités** (entreprises, secteurs, pays) mentionnées
4. **Classification par secteur d'activité** (tech, finance, énergie...)
5. **Système d'apprentissage continu** basé sur le feedback utilisateur

## 📚 Ressources techniques

- [Documentation FinBERT](https://huggingface.co/ProsusAI/finbert)
- [Transformers par Hugging Face](https://huggingface.co/docs/transformers/index)
- [Guide de filtrage JavaScript](https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Global_Objects/Array/filter)

## 🤝 Contributions

Les contributions sont les bienvenues! Si vous souhaitez améliorer le système ML:

1. Vérifiez les issues ouvertes ou créez-en une nouvelle
2. Forkez le dépôt et créez une branche pour votre fonctionnalité
3. Testez vos changements avec des données réelles
4. Soumettez une pull request

## 📝 Notes techniques

- La classification est exécutée toutes les 6 heures via GitHub Actions
- Un mécanisme de cache est utilisé pour optimiser les performances
- Le système a un fallback de classification par mots-clés si le modèle ML n'est pas disponible
- L'interface est conçue pour être réactive (desktop et mobile)
