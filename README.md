# TradePulse - Plateforme d'Analyse Financière en Temps Réel

TradePulse est une application web moderne d'analyse financière qui fournit des insights en temps réel sur les marchés financiers.

## 🆕 Nouvelles fonctionnalités

### Intégration Machine Learning pour les Actualités

Notre dernière mise à jour intègre des capacités avancées de Machine Learning pour analyser les actualités financières :

- **Classification automatique** - Analyse du sentiment des actualités (positif, négatif, neutre)
- **Évaluation d'impact** - Évaluation automatique de l'impact potentiel sur les marchés
- **Score de confiance** - Indice de fiabilité des classifications générées
- **API dédiée** - Interface REST pour accéder aux actualités classifiées

Pour en savoir plus sur cette intégration, consultez le fichier [docs/ML-INTEGRATION.md](docs/ML-INTEGRATION.md).

### Intégration avec Financial Modeling Prep (FMP)

Nous avons remplacé l'intégration avec Perplexity AI par Financial Modeling Prep (FMP), une API spécialisée dans les données financières. Cette nouvelle intégration offre plusieurs avantages :

- **Données financières spécialisées** - Informations précises sur les actions, ETF et cryptomonnaies
- **Sources vérifiables** - Actualités provenant de sources financières reconnues
- **Événements économiques** - Calendrier des résultats d'entreprises et annonces économiques
- **Classification optimisée** - Meilleure détection des pays, impacts et catégories
- **Performance améliorée** - Utilisation de GitHub Actions et fichiers JSON statiques

Pour en savoir plus sur cette intégration, consultez le fichier [docs/FMP-INTEGRATION.md](docs/FMP-INTEGRATION.md).

## Fonctionnalités principales

- **Actualités financières en temps réel** : Obtient les dernières actualités financières via l'API FMP
- **Suivi des événements économiques** : Affiche les événements à venir (résultats, annonces, etc.)
- **Analyse sectorielle** : Identifie les secteurs haussiers et baissiers basés sur l'actualité récente
- **Recommandations d'instruments financiers** : Suggère des actions, ETF et cryptomonnaies pertinentes
- **Portefeuille optimisé** : Présente des portefeuilles équilibrés adaptés à différents profils de risque
- **Visualisation intuitive** : Présente les données de manière claire et interactive

## Améliorations techniques

### 1. Classification ML des Actualités

- Classification automatique des actualités via un modèle NLP spécifique à la finance (FinBERT)
- API REST dédiée pour accéder aux données classifiées
- Intégration avec GitHub Actions pour une classification automatique
- Système de cache pour optimiser les performances

### 2. Intégration FMP et Génération Statique

- Intégration avec Financial Modeling Prep pour des données financières spécialisées
- Génération périodique des données via GitHub Actions (toutes les 4 heures)
- Classification automatique des actualités par pays, catégorie et impact

### 3. Architecture modulaire

- Structure modulaire avec composants réutilisables
- Séparation claire des préoccupations (données, présentation, logique)
- Interface réactive avec thème sombre/clair

### 4. Optimisation des performances

- Système de chargement des données statiques depuis JSON
- Mécanisme de fallback robuste en cas d'indisponibilité de l'API
- Mise à jour périodique des données en arrière-plan

### 5. Expérience utilisateur

- Interface utilisateur moderne et intuitive
- Visualisations interactives des données financières
- Filtres et recherche avancée

## Structure du projet

```
tradepulse/
├── .github/            # Configuration GitHub Actions
│   └── workflows/      # Workflows automatisés
├── api/                # API REST
│   ├── __init__.py     # Initialisation du module
│   └── news_classifier_api.py # API Flask pour les actualités
├── data/               # Données financières statiques générées
│   ├── news.json       # Actualités et événements financiers
│   └── portfolios.json # Recommandations de portefeuille
├── docs/               # Documentation
│   ├── FMP-INTEGRATION.md # Documentation sur l'intégration FMP
│   └── ML-INTEGRATION.md # Documentation sur l'intégration ML
├── ml/                 # Module Machine Learning
│   ├── __init__.py     # Initialisation du module
│   └── news_classifier.py # Classificateur d'actualités
├── scripts/            # Scripts pour la génération de données
│   ├── fmp_news_updater.py # Script d'extraction des données FMP
│   └── run_classification.py # Script pour la classification ML
├── public/             # Ressources statiques
├── aiintegration.js    # Module d'intégration des données
├── index.html          # Page d'accueil
├── actualites.html     # Page des actualités
├── portefeuille.html   # Page des portefeuilles
└── README.md           # Documentation
```

## Configuration requise

### Pour l'intégration ML

1. Installer les dépendances Python requises : `pip install -r ml/requirements.txt`
2. Facultatif: Installer Flask pour l'API : `pip install -r api/requirements.txt`

### Pour l'intégration FMP

1. Créer un compte sur [Financial Modeling Prep](https://financialmodelingprep.com/)
2. Souscrire au plan STARTER (recommandé, 29$/mois)
3. Ajouter votre clé API comme secret GitHub (`FMP_API_KEY`)

Consultez [docs/ML-INTEGRATION.md](docs/ML-INTEGRATION.md) et [docs/FMP-INTEGRATION.md](docs/FMP-INTEGRATION.md) pour plus de détails.

## Contributeurs

- [Bencode92](https://github.com/bencode92)

## Licence

MIT