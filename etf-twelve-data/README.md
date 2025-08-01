# ETF Twelve Data System

## Système simplifié en 2 étapes

### Étape 1: Filtrage (1x/mois)
```bash
node etf-filter.js
```
- Lit `all_etfs.json` (vos 3000 ETF) et `all_bonds.json` (vos 400 bonds)
- Filtre selon volume et market cap via API
- Génère `filtered_etfs.json` avec seulement les ETF/bonds retenus

### Étape 2: Performances (quotidien)
```bash
node etf-performance.js
```
- Lit `filtered_etfs.json`
- Récupère YTD et variation journalière
- Génère `etf_performance.json` avec toutes les données

## Configuration

1. Ajouter votre clé API:
```bash
export TWELVE_DATA_API_KEY="your_key_here"
```

2. Compléter vos fichiers:
- `all_etfs.json`: Tous vos ETF (3000)
- `all_bonds.json`: Tous vos bonds (400)

3. Ajuster les seuils dans `etf-filter.js`:
```javascript
MIN_VOLUME_ETF: 500000,
MIN_MARKET_CAP_ETF: 100000000,
MIN_VOLUME_BOND: 100000,
MIN_MARKET_CAP_BOND: 50000000
```

## Workflow

1. **1x/mois**: Lancer le filtrage
2. **Quotidien**: Lancer la récupération des performances

## Fichiers générés

- `filtered_etfs.json`: Liste des ETF/bonds filtrés
- `etf_performance.json`: Données complètes avec performances
