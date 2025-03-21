# Processus Unifié de Mise à Jour des Données

Cette documentation explique le nouveau processus unifié de mise à jour des données NASDAQ et STOXX 600.

## Objectif

L'objectif de cette modification est de simplifier et d'optimiser le processus de mise à jour des données de marché en combinant deux workflows séparés en un seul.

## Modifications apportées

1. **Création d'un script Python unifié** : `scripts/update_unified_lists.py`
   - Combine les fonctionnalités de `scrape_lists.py` et `scrape_stoxx.py`
   - Maintient la structure des fichiers JSON existante pour assurer la compatibilité avec le frontend

2. **Création d'un workflow GitHub Actions unifié** : `.github/workflows/update-unified-lists.yml`
   - Remplace les deux workflows précédents
   - Exécution planifiée toutes les 30 minutes
   - Gestion améliorée des erreurs et fallbacks

3. **Désactivation des anciens workflows** :
   - `.github/workflows/update-lists-data.yml` → `.github/workflows/update-lists-data.yml.disabled`
   - `.github/workflows/update-stoxx-data.yml` → `.github/workflows/update-stoxx-data.yml.disabled`

## Important : Distinction avec update-market-data

Le nouveau workflow **update-unified-lists** est **distinct** du workflow existant **update-market-data** :
- **update-unified-lists** met à jour les données pour `liste.html` (NASDAQ) et les pages STOXX
- **update-market-data** met à jour les données pour `marches.html`

Nous avons spécifiquement nommé le job dans notre workflow "update-unified-lists" (et non "update-market-data") pour éviter toute confusion. Les deux workflows peuvent fonctionner indépendamment sans conflit.

## Avantages

- **Simplicité de maintenance** : Un seul workflow et script à gérer
- **Cohérence des données** : Les données NASDAQ et STOXX sont mises à jour simultanément
- **Réduction des exécutions** : Une seule exécution au lieu de deux
- **Meilleure gestion des erreurs** : Système de fallback unifié et journal d'exécution consolidé
- **Résumé de mise à jour** : Génération d'un fichier `update_summary.json` avec un récapitulatif des résultats

## Format des fichiers de données

Cette modification maintient les formats existants des fichiers :

1. **Données NASDAQ** : `data/lists.json`
   ```json
   {
     "indices": {
       "a": [...],
       "b": [...],
       // etc.
     },
     "top_performers": {
       "daily": {
         "best": [...],
         "worst": [...]
       },
       "ytd": {
         "best": [...],
         "worst": [...]
       }
     },
     "meta": {
       "source": "Boursorama",
       "description": "Actions du NASDAQ Composite (États-Unis)",
       "timestamp": "...",
       "count": 123
     }
   }
   ```

2. **Données STOXX 600** : `data/stoxx_page_1.json`, `data/stoxx_page_2.json`, etc.
   ```json
   {
     "indices": {
       "a": [...],
       "b": [...],
       // etc.
     },
     "top_performers": {...},
     "meta": {
       "source": "Boursorama",
       "description": "Actions du DJ STOXX 600 (Europe)",
       "timestamp": "...",
       "count": 100,
       "pagination": {
         "currentPage": 1,
         "totalPages": 6
       }
     }
   }
   ```

3. **Nouveau résumé de mise à jour** : `data/update_summary.json`
   ```json
   {
     "timestamp": "2025-03-21T10:40:25Z",
     "nasdaq": {
       "count": 2500,
       "status": "success"
     },
     "stoxx": {
       "status": "success",
       "pages": 6,
       "stocks": 600
     }
   }
   ```

## Compatibilité avec le front-end

Cette modification ne nécessite aucun changement côté front-end, car :
- Les noms de fichiers restent identiques
- La structure des données JSON reste inchangée
- Les formats sont entièrement compatibles avec les fichiers JavaScript existants

## Exécution manuelle

Pour lancer manuellement le processus de mise à jour :
1. Allez dans l'onglet Actions de votre dépôt GitHub
2. Sélectionnez le workflow "Mise à jour unifiée des données NASDAQ et STOXX"
3. Cliquez sur "Run workflow" et confirmez

## Dépannage

En cas de problème :
1. Vérifiez les logs d'exécution dans GitHub Actions
2. Consultez le fichier `update_summary.json` pour le statut de la dernière mise à jour
3. Si nécessaire, vous pouvez réactiver les anciens workflows en supprimant l'extension `.disabled`