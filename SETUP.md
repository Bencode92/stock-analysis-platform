# Configuration du système de données TradePulse

Ce document explique comment configurer le système hybride qui alimente TradePulse avec des données financières, en utilisant GitHub Actions et Perplexity AI.

## Configuration des secrets GitHub

Pour que le workflow GitHub Actions puisse utiliser l'API Perplexity, vous devez configurer un secret GitHub:

1. Accédez à votre dépôt GitHub
2. Cliquez sur "Settings" (Paramètres)
3. Dans le menu latéral gauche, sélectionnez "Secrets and variables" puis "Actions"
4. Cliquez sur "New repository secret"
5. Créez un secret avec:
   - Nom: `PERPLEXITY_API_KEY`
   - Valeur: Votre clé API Perplexity

## Comment fonctionne le système

Le système hybride fonctionne en plusieurs étapes:

1. **GitHub Actions** exécute automatiquement le script Python toutes les 8 heures (à 5h, 13h et 21h)
2. Le script Python utilise l'API Perplexity pour générer:
   - Des actualités financières récentes
   - Des événements financiers à venir
   - Des recommandations de portefeuille basées sur le contexte du marché
3. Les données sont enregistrées dans des fichiers JSON statiques dans le dossier `data/`
4. Le front-end de TradePulse charge ces fichiers JSON au lieu d'appeler directement l'API
5. La fonctionnalité de recherche continue d'utiliser l'API Perplexity directement, mais avec une limite de 10 requêtes par jour

## Déclenchement manuel du workflow

Vous pouvez déclencher manuellement la mise à jour des données:

1. Accédez à l'onglet "Actions" dans votre dépôt GitHub
2. Sélectionnez le workflow "Update Financial Data"
3. Cliquez sur "Run workflow"
4. Confirmez l'exécution

## Structure des fichiers

- `.github/workflows/update-data.yml` - Définition du workflow GitHub Actions
- `scripts/update_financial_data.py` - Script Python pour générer les données
- `data/news.json` - Données d'actualités financières
- `data/portfolios.json` - Données de recommandations de portefeuille
- `aiintegration.js` - Module JavaScript adapté pour charger les données statiques

## Dépannage

Si vous rencontrez des problèmes:

1. Vérifiez que le secret GitHub `PERPLEXITY_API_KEY` est correctement configuré
2. Examinez les logs d'exécution du workflow GitHub Actions (onglet "Actions")
3. Si l'API est hors service, le système continuera à utiliser les données statiques existantes

## Économie des crédits Perplexity

Cette solution permet d'économiser considérablement les crédits Perplexity:
- 3 mises à jour automatiques par jour au lieu d'appels constants
- Données mises en cache pour tous les utilisateurs
- Limite de 10 recherches personnalisées par jour et par utilisateur
