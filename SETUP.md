# Configuration du système de données TradePulse

Ce document explique comment configurer le système hybride qui alimente TradePulse avec des données financières, en utilisant GitHub Actions et Render avec Perplexity AI.

## Configuration pour utiliser votre serveur Render existant

Puisque vous avez déjà configuré Render comme proxy pour l'API Perplexity, notre solution a été adaptée pour utiliser directement votre service Render au lieu de nécessiter une nouvelle clé API Perplexity.

### 1. Aucun secret GitHub n'est nécessaire

Contrairement à la configuration standard, vous n'avez pas besoin de configurer un secret GitHub pour la clé API Perplexity, car votre script est configuré pour utiliser l'URL Render par défaut :

```
https://stock-analysis-platform-q9tc.onrender.com
```

Si vous souhaitez modifier cette URL, vous pouvez ajouter un secret GitHub :

1. Accédez à votre dépôt GitHub
2. Cliquez sur "Settings" (Paramètres)
3. Dans le menu latéral gauche, sélectionnez "Secrets and variables" puis "Actions"
4. Cliquez sur "New repository secret"
5. Créez un secret avec:
   - Nom: `RENDER_API_URL`
   - Valeur: L'URL de votre service Render

## Comment fonctionne le système

Le système hybride fonctionne en plusieurs étapes:

1. **GitHub Actions** exécute automatiquement le script Python toutes les 8 heures (à 5h, 13h et 21h)
2. Le script Python communique avec votre service Render pour récupérer:
   - Des actualités financières récentes
   - Des événements financiers à venir
   - Des recommandations de portefeuille basées sur le contexte du marché
3. Les données sont enregistrées dans des fichiers JSON statiques dans le dossier `data/`
4. Le front-end de TradePulse charge ces fichiers JSON au lieu d'appeler directement l'API
5. La fonctionnalité de recherche continue d'utiliser l'API Render directement, mais avec une limite de 10 requêtes par jour

## Déclenchement manuel du workflow

Vous pouvez déclencher manuellement la mise à jour des données:

1. Accédez à l'onglet "Actions" dans votre dépôt GitHub
2. Sélectionnez le workflow "Update Financial Data"
3. Cliquez sur "Run workflow"
4. Confirmez l'exécution

## Structure des fichiers

- `.github/workflows/update-data.yml` - Définition du workflow GitHub Actions
- `scripts/update_financial_data.py` - Script Python pour générer les données via Render
- `data/news.json` - Données d'actualités financières
- `data/portfolios.json` - Données de recommandations de portefeuille
- `aiintegration.js` - Module JavaScript adapté pour charger les données statiques

## Mode de secours

Si votre service Render ne répond pas ou renvoie des erreurs, le script Python utilisera des données de secours préfabriquées. Cela garantit que votre site continuera à fonctionner même si Render ou Perplexity rencontrent des problèmes.

## Dépannage

Si vous rencontrez des problèmes:

1. Vérifiez que votre service Render est opérationnel et répond aux requêtes
2. Examinez les logs d'exécution du workflow GitHub Actions (onglet "Actions")
3. Consultez le guide de dépannage complet dans le fichier `docs/TROUBLESHOOTING.md`

## Économie des crédits Perplexity

Cette solution permet d'économiser considérablement les crédits Perplexity:
- 3 mises à jour automatiques par jour au lieu d'appels constants
- Données mises en cache pour tous les utilisateurs
- Limite de 10 recherches personnalisées par jour et par utilisateur

## Maintenance du service Render

Assurez-vous que votre service Render reste opérationnel :
- Si vous utilisez un compte gratuit, accédez régulièrement à votre dashboard pour éviter que le service ne s'arrête par inactivité
- Vérifiez périodiquement vos logs Render pour vous assurer que l'API Perplexity fonctionne correctement
