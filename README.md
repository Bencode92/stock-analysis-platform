# TradePulse - Plateforme d'Analyse Financière en Temps Réel

TradePulse est une application web moderne d'analyse financière qui utilise l'intelligence artificielle pour fournir des insights en temps réel sur les marchés financiers.

## 🆕 Mise à jour importante : Système hybride avec GitHub Actions

Nous avons implémenté un nouveau système hybride qui utilise GitHub Actions pour générer périodiquement des données financières via Perplexity AI, puis les stocke dans des fichiers JSON statiques. Cette approche offre plusieurs avantages :

- **Économie de crédits API** - Génération périodique plutôt qu'à chaque visite utilisateur
- **Performances améliorées** - Chargement rapide de fichiers JSON au lieu d'appels API
- **Fiabilité accrue** - Fonctionnement même lorsque l'API est indisponible
- **Limites contrôlées** - Recherches personnalisées limitées à 10 par jour par utilisateur

Pour configurer ce système, consultez le fichier [SETUP.md](SETUP.md).

## Fonctionnalités principales

- **Actualités financières en temps réel** : Obtient les dernières actualités financières d'aujourd'hui via l'API Perplexity
- **Analyse sectorielle** : Identifie les secteurs haussiers et baissiers basés sur l'actualité récente
- **Recommandations d'instruments financiers** : Suggère des actions, ETF et cryptomonnaies pertinentes
- **Portefeuille optimisé** : Génère un portefeuille équilibré adapté au contexte actuel avec Perplexity AI
- **Visualisation intuitive** : Présente les données de manière claire et interactive

## Améliorations techniques

### 1. Intégration API et Génération Statique

- Intégration directe avec l'API Perplexity via proxy
- **NOUVEAU** : Génération périodique des données via GitHub Actions
- Utilisation du modèle `sonar-medium-online` pour obtenir des actualités en temps réel

### 2. Architecture modulaire

- Structure modulaire avec composants réutilisables
- Séparation claire des préoccupations (données, présentation, logique)
- Interface réactive avec thème sombre/clair

### 3. Optimisation des performances

- **NOUVEAU** : Système de chargement des données statiques
- Mécanisme de fallback robuste
- Mise à jour périodique des données en arrière-plan

### 4. Expérience utilisateur

- Interface utilisateur moderne et intuitive
- Visualisations interactives des données financières
- Filtres et recherche avancée

## Structure du projet

```
tradepulse/
├── .github/            # Configuration GitHub Actions
│   └── workflows/      # Workflows automatisés
├── data/               # Données financières statiques générées
│   ├── news.json       # Actualités financières
│   └── portfolios.json # Recommandations de portefeuille
├── scripts/            # Scripts pour la génération de données
│   └── update_financial_data.py   # Script principal
├── public/             # Ressources statiques
├── aiintegration.js    # Intégration Perplexity adaptée
├── index.html          # Page d'accueil
├── actualites.html     # Page des actualités
├── portefeuille.html   # Page des portefeuilles
└── README.md           # Documentation
```

## Contributeurs

- [Bencode92](https://github.com/bencode92)

## Licence

MIT
