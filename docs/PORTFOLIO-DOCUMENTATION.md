# Documentation du Module de Portefeuille TradePulse

Cette documentation technique détaille le fonctionnement du système de génération et d'affichage de portefeuilles de TradePulse, un composant central de la plateforme.

## Architecture Générale

Le système de portefeuille fonctionne selon le flux suivant:

1. **Collecte des données** - Les données financières sont récupérées de diverses sources
2. **Analyse et filtrage** - Les données sont préparées pour l'IA
3. **Génération IA** - GPT-4o génère des allocations d'actifs optimisées
4. **Validation et ajustement** - Les portefeuilles sont vérifiés pour respecter les contraintes
5. **Stockage** - Les résultats sont enregistrés au format JSON
6. **Affichage** - L'interface web charge et présente les portefeuilles

## Composants Principaux

### 1. Génération des Portefeuilles (Backend)

Le processus de génération est géré par le script Python `generate_portfolios.py` qui:

- Extrait les données des actualités, marchés, secteurs, listes d'actifs et ETF
- Filtre ces données pour ne conserver que les informations pertinentes
- Prépare un prompt détaillé pour l'API OpenAI
- Gère les communications avec l'API, y compris les retries en cas d'échec
- Valide et ajuste les portefeuilles générés
- Sauvegarde les résultats dans `portefeuilles.json`

**Contraintes de portefeuille:**
- Chaque portefeuille (Agressif, Modéré, Stable) doit contenir entre 12 et 15 actifs
- La somme des allocations doit être exactement 100%
- Chaque portefeuille doit contenir au moins 2 classes d'actifs
- Portefeuille Agressif: Minimum 1 ETF
- Portefeuille Modéré: Minimum 1 ETF + 1 Obligation
- Portefeuille Stable: Minimum 1 ETF + 1 Obligation

### 2. Affichage des Portefeuilles (Frontend)

La visualisation est gérée par `portefeuille.html` et `portfolio-loader.js`:

- Chargement des données depuis `portefeuilles.json`
- Affichage des trois types de portefeuille (Agressif, Modéré, Stable)
- Visualisation graphique des allocations avec Chart.js
- Possibilité d'exporter les portefeuilles en PDF
- Système de partage des allocations
- Navigation entre les différents types de portefeuille

## Détails Techniques

### Structure des Portefeuilles

Le fichier JSON généré suit cette structure:

```json
{
  "Agressif": {
    "Commentaire": "Analyse du marché et justification des allocations...",
    "Actions": {
      "Nom Action 1": "15%",
      "Nom Action 2": "10%"
    },
    "ETF": {
      "Nom ETF 1": "20%",
      "Nom ETF 2": "15%"
    },
    "Crypto": {
      "Bitcoin": "15%",
      "Ethereum": "10%"
    }
  },
  "Modéré": {
    "Commentaire": "...",
    "Actions": { "..." },
    "ETF": { "..." },
    "Obligations": { "..." }
  },
  "Stable": {
    "Commentaire": "...",
    "Actions": { "..." },
    "ETF": { "..." },
    "Obligations": { "..." }
  }
}
```

### Workflow de Génération IA

1. **Préparation des données**
   - Filtrage des actualités, marchés et secteurs
   - Extraction des ETF et obligations valides
   - Construction d'un contexte de marché

2. **Construction du prompt**
   - Format structuré avec contraintes claires
   - Listes explicites d'ETF et obligations autorisés
   - Instructions pour la construction des portefeuilles
   - Spécification du format de sortie attendu

3. **Validation et corrections**
   - Vérification du nombre d'actifs
   - Validation des pourcentages d'allocation
   - Ajout d'ETF/obligations si manquants
   - Redistribution des allocations si nécessaire

4. **Sauvegarde et historique**
   - Enregistrement du portefeuille actuel
   - Archivage dans l'historique avec horodatage
   - Mise à jour de l'index des portefeuilles

### Visualisation Dynamique

L'interface utilisateur adapte dynamiquement:
- Les couleurs selon le type de portefeuille (orange/vert/bleu)
- La présentation des graphiques et tableaux
- La mise en évidence des informations importantes
- L'exportation PDF avec formatage adapté

## Bonnes Pratiques et Optimisations

### Robustesse
- Système de retry avec backoff exponentiel pour les appels API
- Sauvegarde des prompts et réponses pour débogage
- Cache local pour l'accès hors-ligne

### Performance
- Filtrage des données pour réduire la taille des prompts
- Stockage des résultats en JSON pour un accès rapide
- Chargement asynchrone des données côté client

### Sécurité
- Validation stricte des entrées et sorties
- Protection contre les actifs invalides ou non autorisés
- Utilisation sécurisée des API externes

## Personnalisation

Pour modifier le comportement du générateur de portefeuille:

1. **Ajustement des contraintes** - Modifiez `portfolio_adjuster.py` pour changer les règles d'allocation
2. **Modification du prompt** - Ajustez la structure du prompt dans `generate_portfolios.py`
3. **Apparence visuelle** - Personnalisez les couleurs et styles dans `portefeuille.html` et `portfolio-styles.css`

## Dépendances

- **Python 3.10+** - Pour le backend et la génération
- **OpenAI API** - Pour l'IA générative (GPT-4o)
- **BeautifulSoup** - Pour l'extraction de données
- **Chart.js** - Pour les visualisations côté client
- **jsPDF** - Pour l'export en PDF

## Workflow de développement

1. Modifiez les sources de données dans `data/`
2. Exécutez `generate_portfolios.py` pour générer de nouveaux portefeuilles
3. Inspectez le résultat dans `portefeuilles.json`
4. Testez l'affichage dans le navigateur avec `portefeuille.html`

## Conseils de débogage

- Pour les problèmes de génération, consultez les fichiers de debug dans `debug/prompts/`
- Pour les problèmes d'affichage, utilisez la console du navigateur
- Des messages de log détaillent le processus de validation dans la console Python

## Évolutions futures

- Personnalisation des portefeuilles par l'utilisateur
- Backtesting des performances historiques
- Suggestions d'ajustements basées sur des événements récents
- Analyse comparative avec des portefeuilles de référence
