# Intégration Machine Learning pour TradePulse

Cette documentation explique comment l'intégration du Machine Learning (ML) dans TradePulse permet une analyse avancée des actualités financières.

## Architecture

L'architecture du système de classification des actualités est composée de trois parties principales:

### 1. Module ML (`ml/`)

Le cœur du système de classification qui utilise des modèles de traitement du langage naturel (NLP) pour analyser les actualités financières.

- `news_classifier.py`: Classe principale qui gère la classification des actualités
- Utilise le modèle FinBERT, spécifiquement entraîné pour le domaine financier
- Système de cache pour optimiser les performances

### 2. API REST (`api/`)

Expose les actualités classifiées via une interface REST pour faciliter l'accès depuis différentes applications.

- `news_classifier_api.py`: API Flask qui expose les actualités classifiées
- Endpoints pour récupérer, filtrer et classifier des actualités
- Support CORS pour l'intégration avec des frontends

### 3. Scripts d'automatisation (`scripts/`)

Scripts pour automatiser la classification et l'intégration avec d'autres systèmes.

- `run_classification.py`: Script pour exécuter la classification en ligne de commande
- Intégration avec GitHub Actions pour la classification automatique

## Fonctionnalités de classification

Le système de classification offre plusieurs fonctionnalités:

1. **Analyse du sentiment**: Chaque actualité est classifiée comme positive, négative ou neutre
2. **Score de confiance**: Un score (0-1) indiquant la confiance du modèle dans sa classification
3. **Impact sur le marché**: Détermination de l'impact potentiel de l'actualité sur les marchés
4. **Classification multi-langues**: Support pour l'anglais et le français

## Utilisation locale

### Installation

```bash
# Installer les dépendances ML
pip install -r ml/requirements.txt

# Installer les dépendances API (optionnel)
pip install -r api/requirements.txt
```

### Classification des actualités

```bash
# Classifier un fichier d'actualités
python scripts/run_classification.py --input data/news.json

# Spécifier un fichier de sortie différent
python scripts/run_classification.py --input data/news.json --output data/classified_news.json
```

### Lancement de l'API

```bash
# Lancer l'API Flask
python api/news_classifier_api.py
```

Accédez ensuite à l'API via `http://localhost:5000/api/news`

## Intégration avec GitHub Actions

Le workflow GitHub Actions (`classify-news.yml`) est configuré pour:

1. S'exécuter après chaque mise à jour des actualités
2. S'exécuter à intervalles réguliers (toutes les 6 heures)
3. Permettre une exécution manuelle via l'interface GitHub

## Structure du projet

```
tradepulse/
├── ml/                       # Module Machine Learning
│   ├── __init__.py           # Initialisation du module
│   ├── news_classifier.py    # Classificateur d'actualités
│   ├── models/               # Dossier pour les modèles entraînés (créé automatiquement)
│   └── requirements.txt      # Dépendances Python pour ML
├── api/                      # API REST
│   ├── __init__.py           # Initialisation du module
│   ├── news_classifier_api.py # API Flask
│   └── requirements.txt      # Dépendances pour l'API
├── scripts/                  # Scripts d'automatisation
│   └── run_classification.py # Script pour exécuter la classification
└── .github/
    └── workflows/
        └── classify-news.yml # Workflow pour la classification automatique
```

## Personnalisation

### Ajustement du modèle

Pour ajuster le modèle de classification, modifiez la classe `NewsClassifier` dans `ml/news_classifier.py`:

```python
# Changer le modèle utilisé
model_name = "financial/bert-base-sentiment"  # Exemple alternatif
```

### Configuration de l'API

Pour configurer l'API Flask, modifiez `api/news_classifier_api.py`:

```python
# Changer le port d'écoute
port = int(os.environ.get("PORT", 8080))  # Utiliser le port 8080 par défaut
```

## Monitoring et débogage

Le système de classification enregistre les informations dans la console. Pour un débogage plus avancé, vous pouvez:

1. Ajouter `print()` ou utiliser le module `logging` dans le code ML
2. Consulter les logs des workflows GitHub Actions
3. Vérifier la structure des fichiers d'actualités avant et après la classification

## Troubleshooting

### Problèmes courants

1. **Erreur de mémoire lors de la classification**: Réduisez la taille du batch ou utilisez un modèle plus léger
2. **Erreur d'importation de module**: Vérifiez les chemins d'importation et la structure du projet
3. **Classification incorrecte**: Ajustez les seuils de confiance ou utilisez un modèle alternatif

### Contact

Pour toute question ou assistance, contactez:
- [Bencode92](https://github.com/bencode92)