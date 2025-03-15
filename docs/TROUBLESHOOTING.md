# Guide de dépannage pour TradePulse

Ce document fournit des solutions aux problèmes courants que vous pourriez rencontrer avec l'intégration Perplexity AI et GitHub Actions.

## Problèmes avec les GitHub Actions

### Le workflow ne s'exécute pas automatiquement

**Symptôme** : Le workflow "Update Financial Data" ne s'exécute pas selon le planning prévu.

**Solutions possibles** :
1. Vérifiez que votre dépôt n'a pas atteint la limite d'utilisation des GitHub Actions (pour les dépôts publics, c'est généralement 2000 minutes par mois)
2. Assurez-vous que le fichier `.github/workflows/update-data.yml` est correct et valide
3. Vérifiez les logs dans l'onglet Actions du dépôt GitHub
4. Exécutez manuellement le workflow pour voir s'il fonctionne

### Erreurs dans le script Python

**Symptôme** : Le workflow s'exécute mais échoue avec des erreurs Python.

**Solutions possibles** :
1. Vérifiez que le secret `PERPLEXITY_API_KEY` est correctement configuré
2. Examinez les logs d'erreur complets dans l'onglet Actions
3. Si l'erreur est liée à des imports manquants, vérifiez que toutes les dépendances sont installées dans le workflow

## Problèmes avec l'affichage des données

### Les données ne se mettent pas à jour sur le site

**Symptôme** : Le workflow s'exécute avec succès, mais le site continue d'afficher d'anciennes données.

**Solutions possibles** :
1. Vérifiez que les fichiers JSON dans le dossier `data/` ont bien été mis à jour (regardez la date du dernier commit)
2. Effacez le cache de votre navigateur et actualisez la page
3. Assurez-vous que GitHub Pages a bien été redéployé suite aux modifications (vérifiez l'onglet Actions > Pages)
4. Inspectez la console du navigateur pour voir s'il y a des erreurs lors du chargement des fichiers JSON

### Erreurs 404 lors du chargement des fichiers JSON

**Symptôme** : La console du navigateur affiche des erreurs 404 lorsqu'elle tente de charger les fichiers JSON.

**Solutions possibles** :
1. Vérifiez que les fichiers existent bien dans le dépôt (`data/news.json` et `data/portfolios.json`)
2. Assurez-vous que les chemins dans `API_CONFIG.staticData.paths` correspondent aux emplacements réels des fichiers
3. Si vous utilisez des chemins relatifs, vérifiez qu'ils sont corrects par rapport à la racine du site

## Problèmes avec l'API Perplexity

### Erreur 401 (Unauthorized)

**Symptôme** : Le script Python échoue avec une erreur 401 lors de l'appel à l'API Perplexity.

**Solutions possibles** :
1. Vérifiez que votre clé API Perplexity est valide et active
2. Assurez-vous que le secret GitHub est correctement configuré (sans espaces supplémentaires)
3. Vérifiez si vous avez atteint la limite d'utilisation de votre compte Perplexity

### Erreur 429 (Too Many Requests)

**Symptôme** : Le script Python échoue avec une erreur 429 lors de l'appel à l'API Perplexity.

**Solutions possibles** :
1. Réduisez la fréquence d'exécution du workflow GitHub Actions (par exemple, passez de 3 à 2 fois par jour)
2. Implémentez une logique de backoff exponentiel dans le script Python
3. Contactez Perplexity pour augmenter votre limite d'utilisation

## Problèmes de génération de contenu

### Contenu de mauvaise qualité dans les données générées

**Symptôme** : Les fichiers JSON contiennent des données incomplètes, mal formatées ou de mauvaise qualité.

**Solutions possibles** :
1. Améliorez les prompts dans le script Python pour obtenir des réponses plus précises
2. Assurez-vous d'utiliser les options Sonar appropriées
3. Renforcez la validation et le nettoyage des données dans le script

### Erreurs de format JSON

**Symptôme** : Les fichiers JSON générés ne sont pas valides et provoquent des erreurs dans le navigateur.

**Solutions possibles** :
1. Améliorez l'extraction du JSON depuis les réponses de l'API
2. Ajoutez une étape de validation JSON dans le script Python
3. Utilisez les données de secours prédéfinies en cas d'échec de la génération

## Comment utiliser ce guide

1. Identifiez les symptômes que vous rencontrez
2. Suivez les solutions proposées dans l'ordre
3. Si le problème persiste, consultez les logs d'exécution pour plus de détails
4. Pour les problèmes non couverts, ouvrez une issue sur GitHub

Pour toute question ou assistance supplémentaire, n'hésitez pas à ouvrir une issue dans le dépôt GitHub.
