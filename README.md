# TradePulse - Plateforme d'Analyse Financière en Temps Réel

TradePulse est une application web moderne d'analyse financière qui utilise l'intelligence artificielle pour fournir des insights en temps réel sur les marchés financiers.

## Fonctionnalités principales

- **Actualités financières en temps réel** : Obtient les dernières actualités financières d'aujourd'hui via l'API Perplexity
- **Analyse sectorielle** : Identifie les secteurs haussiers et baissiers basés sur l'actualité récente
- **Recommandations d'instruments financiers** : Suggère des actions, ETF et cryptomonnaies pertinentes
- **Portefeuille optimisé** : Génère un portefeuille équilibré adapté au contexte actuel avec Claude AI
- **Visualisation intuitive** : Présente les données de manière claire et interactive

## Améliorations techniques

### 1. Intégration API

- Intégration directe avec l'API Perplexity via MCP
- Utilisation du modèle `sonar-medium-online` pour obtenir des actualités en temps réel
- API Claude pour l'analyse de portefeuille avancée

### 2. Architecture React moderne

- Structure modulaire avec composants réutilisables
- Utilisation de Context API pour la gestion d'état global
- Hooks personnalisés pour séparer la logique et la présentation

### 3. Optimisation des performances

- Système de cache intelligent pour réduire les appels API
- Chargement conditionnel des données
- Mise à jour automatique des données périmées

### 4. Tests automatisés

- Tests unitaires pour les composants UI
- Tests d'intégration pour les services API
- Mocks et stubs pour simulations de données

## Utilisation du cache

Le système de cache permet d'optimiser les performances :

- Les actualités sont toujours récupérées en temps réel pour garantir la fraîcheur
- L'analyse sectorielle est mise en cache pendant 15 minutes
- Les recommandations d'instruments sont mises en cache pendant 10 minutes
- Le cache est automatiquement nettoyé pour éviter les problèmes de stockage

## Configuration de développement

1. Installer les dépendances :
   ```
   npm install
   ```

2. Configuration des variables d'environnement :
   - Créer un fichier `.env` à la racine du projet
   - Ajouter les clés API nécessaires :
     ```
     PERPLEXITY_API_KEY=votre-clé-api-perplexity
     CLAUDE_API_KEY=votre-clé-api-claude
     ```

3. Démarrer le serveur de développement :
   ```
   npm start
   ```

4. Exécuter les tests :
   ```
   npm test
   ```

## Structure du projet

```
tradepulse/
├── public/              # Ressources statiques
├── services/            # Services API et utilitaires
│   ├── api.js           # Service d'intégration API
│   └── cacheService.js  # Service de cache
├── src/
│   ├── components/      # Composants React
│   ├── contexts/        # Contextes React (gestion d'état)
│   ├── hooks/           # Hooks personnalisés
│   ├── styles/          # Styles CSS
│   ├── __tests__/       # Tests unitaires et d'intégration
│   └── App.jsx          # Composant principal
├── package.json         # Dépendances et scripts
└── README.md            # Documentation
```

## Contributeurs

- [Bencode92](https://github.com/bencode92)

## Licence

MIT
