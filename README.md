# TradePulse - Plateforme d'Analyse Financière en Temps Réel

TradePulse est une application web moderne d'analyse financière qui fournit des insights en temps réel sur les marchés financiers.

## 🆕 Mise à jour importante : Intégration avec Financial Modeling Prep (FMP)

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

### 1. Intégration FMP et Génération Statique

- Intégration avec Financial Modeling Prep pour des données financières spécialisées
- Génération périodique des données via GitHub Actions (toutes les 4 heures)
- Classification automatique des actualités par pays, catégorie et impact

### 2. Architecture modulaire

- Structure modulaire avec composants réutilisables
- Séparation claire des préoccupations (données, présentation, logique)
- Interface réactive avec thème sombre/clair

### 3. Optimisation des performances

- Système de chargement des données statiques depuis JSON
- Mécanisme de fallback robuste en cas d'indisponibilité de l'API
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
│   ├── news.json       # Actualités et événements financiers
│   └── portfolios.json # Recommandations de portefeuille
├── docs/               # Documentation
│   └── FMP-INTEGRATION.md # Documentation sur l'intégration FMP
├── scripts/            # Scripts pour la génération de données
│   └── fmp_news_updater.py # Script d'extraction des données FMP
├── public/             # Ressources statiques
├── aiintegration.js    # Module d'intégration des données
├── index.html          # Page d'accueil
├── actualites.html     # Page des actualités
├── portefeuille.html   # Page des portefeuilles
└── README.md           # Documentation
```

## Configuration requise

Pour utiliser l'intégration FMP, vous devez:

1. Créer un compte sur [Financial Modeling Prep](https://financialmodelingprep.com/)
2. Souscrire au plan STARTER (recommandé, 29$/mois)
3. Ajouter votre clé API comme secret GitHub (`FMP_API_KEY`)

Consultez [docs/FMP-INTEGRATION.md](docs/FMP-INTEGRATION.md) pour plus de détails.

## Contributeurs

- [Bencode92](https://github.com/bencode92)

## Licence

MIT
