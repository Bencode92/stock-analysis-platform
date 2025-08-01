# ETF Twelve Data System

## Workflow en 2 étapes

### 1. Filtrer par volume/market cap (1x/mois)
```bash
export TWELVE_DATA_API_KEY="your_key"
node etf-filter.js
```
Génère `filtered_etfs.json` avec ETF/bonds filtrés

### 2. Récupérer performances (quotidien)
```bash
node etf-performance.js
```
Génère `etf_performance.json` avec YTD et variations

## Format des données

Vos fichiers JSON doivent avoir cette structure:
```json
{
  "symbol": "SPY",
  "name": "SPDR S&P 500 ETF Trust",
  "name2": "SPDR",
  "currency": "USD",
  "exchange": "NYSE",
  "mic_code": "XNYS",
  "country": "United States"
}
```

## Configuration des seuils

Dans `etf-filter.js`:
```javascript
MIN_VOLUME_ETF: 500000,
MIN_MARKET_CAP_ETF: 100000000,
MIN_VOLUME_BOND: 100000,
MIN_MARKET_CAP_BOND: 50000000
```

## Fichiers générés

- `filtered_etfs.json`: ETF/bonds filtrés (volume/mcap)
- `etf_performance.json`: Données complètes avec performances
