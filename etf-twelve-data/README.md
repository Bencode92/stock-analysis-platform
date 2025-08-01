# ETF Twelve Data System

## Structure du système

### 1. Collecte mensuelle
- **Script**: `etf-data-collector.js`
- **Fréquence**: 1x/mois
- **Durée**: Plusieurs heures
- **Output**: `data/all_etf_data_latest.json`

### 2. Traitement quotidien
- **Script**: `etf-daily-processor.js`
- **Input**: Vos sélections dans `selected_etfs.json` et `selected_bonds.json`
- **Output**: `output/etf.json`

## Fichiers de configuration

- `etf_reference.json`: Liste complète de vos 3000 ETF
- `bond_reference.json`: Liste complète de vos 400 bonds
- `selected_etfs.json`: ETF sélectionnés manuellement
- `selected_bonds.json`: Bonds sélectionnés manuellement

## Installation

```bash
npm install axios
```

## Utilisation

### Collecte mensuelle
```bash
export TWELVE_DATA_API_KEY="your_key_here"
node etf-data-collector.js
```

### Traitement quotidien
```bash
node etf-daily-processor.js
```
