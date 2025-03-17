# Intégration de Financial Modeling Prep (FMP) dans TradePulse

Ce document explique comment TradePulse utilise l'API Financial Modeling Prep pour récupérer des actualités financières et des événements économiques.

## Vue d'ensemble

Financial Modeling Prep (FMP) est une API de données financières qui fournit:
- Des actualités sur les actions, ETF, et cryptomonnaies
- Des calendriers d'événements (résultats d'entreprises, annonces économiques)
- Des données de marché (cours, indicateurs, etc.)

Cette intégration remplace l'ancienne méthode utilisant Perplexity AI pour offrir des données plus précises et spécialisées.

## Fonctionnement

1. **Actualités financières** - Le système collecte des actualités de trois types:
   - Stock News API: Actualités sur les actions et ETF
   - Crypto News API: Actualités sur les cryptomonnaies
   - General News API: Actualités économiques générales

2. **Événements à venir** - Deux types d'événements sont collectés:
   - Earnings Calendar: Calendrier des résultats d'entreprises
   - Economic Calendar: Événements économiques majeurs (publications statistiques, etc.)

3. **Classification automatique** - Les actualités sont classées par:
   - Pays (us/france)
   - Catégorie (entreprises/economie/marches/crypto)
   - Impact (positive/negative/neutral)

## Configuration requise

1. **Clé API FMP** - Un compte FMP avec un abonnement (recommandé: plan STARTER à $29/mois)
2. **Secret GitHub** - La clé API est stockée comme secret GitHub `FMP_API_KEY`

## Workflow d'actualisation

Les données sont actualisées de trois façons:

1. **Automatiquement** - Toutes les 4 heures via GitHub Actions
2. **Manuellement** - Via le bouton "Run workflow" dans l'onglet Actions
3. **Fallback** - Si l'API est indisponible, le système conserve les données existantes

## Structure des données

Le script génère un fichier `data/news.json` avec la structure suivante:

```json
{
  "us": [
    {
      "title": "Titre de l'actualité",
      "content": "Contenu de l'actualité",
      "source": "Source (site)",
      "date": "17/03/2025",
      "time": "09:30",
      "category": "entreprises",
      "impact": "positive",
      "country": "us"
    }
  ],
  "france": [
    // Structure identique pour les actualités françaises
  ],
  "events": [
    {
      "title": "Titre de l'événement",
      "date": "20/03/2025",
      "time": "16:30",
      "type": "earnings",
      "importance": "high"
    }
  ],
  "lastUpdated": "2025-03-17T08:00:00.000Z"
}
```

## Avantages par rapport à Perplexity

1. **Données structurées** - Information précise et formatée (vs. texte généré)
2. **Meilleure couverture** - Données spécifiques aux marchés financiers
3. **Classification optimisée** - Meilleure détection du pays, de l'impact et de la catégorie
4. **Économie d'API** - Moins d'appels et plus efficace
5. **Sources vérifiables** - Actualités provenant de sources financières réelles

## Dépannage

Si les actualités ne s'affichent pas:

1. Vérifiez que le secret `FMP_API_KEY` est correctement configuré dans GitHub
2. Examinez les logs d'exécution du workflow dans l'onglet Actions
3. Vérifiez le fichier `data/news.json` pour voir s'il est correctement formaté
4. Assurez-vous que votre abonnement FMP est actif

## Évolutions futures

L'intégration avec FMP pourrait être étendue pour inclure:

1. Recommandations de portefeuille basées sur des critères fondamentaux
2. Tableaux de bord de performance des actifs
3. Alertes sur des mouvements significatifs du marché
