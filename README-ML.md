# Documentation du Système de Machine Learning pour TradePulse

Ce document décrit l'architecture et les fonctionnalités du système de machine learning intégré à la plateforme TradePulse pour l'analyse des actualités financières.

## 🆕 Nouvelles fonctionnalités (Mars 2025)

### 1. Stockage et gestion des modèles avec Git LFS

- Configuration de Git LFS pour le stockage efficace des modèles de ML
- Téléchargement automatique du modèle FinBERT si non présent
- Chemins de stockage dédiés pour les modèles de base et affinés

### 2. Système de feedback utilisateur

- Interface permettant aux utilisateurs de signaler des classifications incorrectes
- Stockage local des feedbacks avec synchronisation en arrière-plan
- Modal de feedback intuitif intégré aux cartes d'actualités
- Styles CSS modernes et adaptés au thème de la plateforme

### 3. Métriques de performance avancées

- Calcul de précision, rappel, F1-score pour évaluer le modèle
- Matrices de confusion pour visualiser les erreurs de classification
- Historique des performances pour suivre l'évolution du modèle
- Export des métriques au format JSON pour analyse externe

### 4. Pipeline de réentraînement automatique

- Réentraînement du modèle FinBERT à partir des données corrigées par les utilisateurs
- Workflow GitHub Actions pour déclencher le réentraînement périodique
- Conservation de l'historique des versions du modèle
- Évaluation comparative des performances avant/après réentraînement

## Architecture du système ML

```
ml/
├── models/                      # Répertoire des modèles (Git LFS)
│   ├── finbert_model/           # Modèle FinBERT de base
│   └── finbert_finetuned/       # Modèle FinBERT affiné
├── metrics/                     # Métriques de performance
│   ├── performance_history.pkl  # Historique des métriques
│   └── feedback_metadata.json   # Métadonnées des retours utilisateurs
├── feedback/                    # Données de feedback utilisateur
│   └── feedback_data.json       # Données consolidées pour réentraînement
├── logs/                        # Journaux d'entraînement et d'évaluation
├── news_classifier.py           # Classificateur principal
├── performance_metrics.py       # Module d'évaluation des performances
└── model_retraining.py          # Module de réentraînement

.github/workflows/
├── classify-news.yml            # Workflow de classification automatique
├── process-feedback.yml         # Workflow de traitement des retours utilisateurs
└── retrain-model.yml            # Workflow de réentraînement du modèle

js/
└── ml-feedback.js               # Interface JavaScript pour les retours utilisateurs

css/
└── ml-feedback.css              # Styles pour les composants de feedback
```

## Flux de données

1. **Acquisition des données**
   - Les actualités sont extraites via Financial Modeling Prep API
   - Stockage initial dans `data/news.json`

2. **Classification**
   - Le classificateur ML traite les actualités
   - Chaque actualité reçoit un sentiment (positif/négatif/neutre) et un score de confiance

3. **Feedback utilisateur**
   - Les utilisateurs peuvent signaler des classifications incorrectes
   - Les retours sont stockés localement puis synchronisés avec le serveur

4. **Traitement des retours**
   - Le workflow `process-feedback.yml` consolide les retours
   - Les données sont formatées pour l'entraînement

5. **Réentraînement**
   - Le workflow `retrain-model.yml` réentraîne périodiquement le modèle
   - Les performances sont évaluées et comparées
   - Le modèle amélioré est stocké avec Git LFS

6. **Déploiement**
   - Le modèle affiné est utilisé pour les classifications futures

## Guide d'utilisation

### Configuration du système

1. **Installation de Git LFS**
   ```bash
   git lfs install
   git lfs track "ml/models/**/*"
   git add .gitattributes
   ```

2. **Dépendances Python**
   ```bash
   pip install -r ml/requirements.txt
   ```

### Utilisation du système de feedback

Pour intégrer le système de feedback dans les pages d'actualités, ajoutez les lignes suivantes à votre HTML :

```html
<!-- Ajouter les styles -->
<link rel="stylesheet" href="css/ml-feedback.css">

<!-- Ajouter le script de feedback -->
<script src="js/ml-feedback.js"></script>

<!-- Initialiser le système de feedback -->
<script>
  document.addEventListener('DOMContentLoaded', function() {
    const mlFeedback = new MLFeedbackSystem();
  });
</script>
```

### Réentraînement manuel du modèle

Le réentraînement peut être déclenché manuellement via GitHub Actions en spécifiant les paramètres souhaités :

1. Accédez à l'onglet "Actions" du dépôt
2. Sélectionnez le workflow "Retrain ML Model"
3. Cliquez sur "Run workflow"
4. Personnalisez les paramètres (époques, taille de batch, taux d'apprentissage)
5. Cliquez sur "Run workflow"

## Métriques et évaluation

Les performances du modèle sont évaluées selon plusieurs métriques :

- **Précision** : Proportion des classifications correctes parmi toutes les classifications
- **Rappel** : Proportion des éléments réellement positifs qui sont correctement classifiés
- **F1-score** : Moyenne harmonique de la précision et du rappel
- **Matrice de confusion** : Visualisation des classifications correctes et incorrectes

Les métriques sont stockées dans `ml/metrics/` et peuvent être explorées pour suivre l'évolution des performances au fil du temps.

## Prochaines améliorations prévues

- Optimisation des hyperparamètres automatique
- Visualisation des performances en temps réel
- Ajout de classificateurs spécialisés par secteur d'activité
- Interface d'administration dédiée pour la gestion des modèles
- Extension du modèle pour prédire l'impact sur les prix des actifs

## Contributeurs

- [Bencode92](https://github.com/bencode92)

## Licence

MIT
