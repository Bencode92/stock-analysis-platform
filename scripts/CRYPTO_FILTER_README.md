# Script de Filtrage des Crypto-monnaies par Volume

## Description
Ce script filtre les crypto-monnaies du fichier `data/Crypto.csv` en fonction de leur volume de trading, similaire au script `stock-filter-by-volume.js` pour les actions.

## Installation

```bash
# Installer les dépendances
npm install csv-parse axios
```

## Configuration

### Variables d'environnement requises
- `TWELVE_DATA_API_KEY` : Clé API de Twelve Data (obligatoire)

### Variables optionnelles
- `MIN_USD_DAY` : Volume minimum en USD sur 24h (défaut: 1,000,000)
- `MIN_USD_AVG7D` : Volume moyen minimum sur 7 jours (défaut: 2,000,000)
- `MIN_USD_AVG30D` : Volume moyen minimum sur 30 jours (défaut: 1,500,000)
- `DATA_DIR` : Répertoire des données d'entrée (défaut: 'data')
- `OUTPUT_DIR` : Répertoire de sortie (défaut: 'data/filtered')
- `MIN_DELAY_MS` : Délai minimum entre les requêtes API en ms (défaut: 60)

## Utilisation

### Commande de base
```bash
export TWELVE_DATA_API_KEY="votre_cle_api"
node scripts/crypto-filter-by-volume.js
```

### Avec paramètres personnalisés
```bash
export TWELVE_DATA_API_KEY="votre_cle_api"
export MIN_USD_DAY=500000
export MIN_USD_AVG7D=1500000
export MIN_USD_AVG30D=1000000
node scripts/crypto-filter-by-volume.js
```

## Fichiers générés

Le script génère 3 fichiers dans le répertoire `data/filtered/` :

1. **Crypto_filtered_by_volume.csv** : Cryptos acceptées avec leurs métriques
   - Symbol, Currency_Base, Currency_Quote
   - Exchange_Used : Exchange sélectionné pour les données
   - Volume_USD_24h, Volume_USD_Avg7d, Volume_USD_Avg30d
   - Price_USD : Prix actuel
   - Market_Cap_Est : Market cap estimée
   - Quality_Score : Score de qualité (0-100)

2. **Crypto_rejected_by_volume.csv** : Cryptos rejetées avec les raisons
   - Informations de base + raison du rejet

3. **Crypto_top50_by_volume.json** : Top 50 des cryptos au format JSON
   - Format optimisé pour l'intégration web

## Critères de filtrage

Une crypto est acceptée si :
- Les données sont récentes (< 48h)
- ET au moins UN des critères de volume est satisfait :
  - Volume 24h ≥ seuil MIN_USD_DAY
  - Volume moyen 7j ≥ seuil MIN_USD_AVG7D
  - Volume moyen 30j ≥ seuil MIN_USD_AVG30D

## Score de qualité

Le score (0-100) est calculé selon :
- Volume 24h (max 30 points)
- Volume moyen 7j (max 25 points)
- Volume moyen 30j (max 20 points)
- Stabilité du volume (max 15 points)
- Bonus liquidité élevée (max 10 points)
- Pénalité pour données obsolètes (-20 points)

## Exchanges prioritaires

Le script privilégie les exchanges dans cet ordre :
1. Binance
2. Coinbase Pro
3. Kraken
4. BitStamp
5. Bitfinex
6. Bybit
7. OKX
8. Gate.io
9. KuCoin
10. Crypto.com Exchange

## Exemples de sortie

### Console
```
🚀 Démarrage du filtrage des crypto-monnaies par volume

Configuration:
  Volume 24h min: $1,000,000
  Volume 7j moy min: $2,000,000
  Volume 30j moy min: $1,500,000

📊 5 crypto-monnaies à analyser depuis Crypto.csv

  ✅ BTC/USD      (Binance)            24h: $5,234,567,890    7d: $4,987,654,321    Score: 95
  ✅ ETH/USD      (Coinbase Pro)       24h: $3,456,789,012    7d: $3,210,987,654    Score: 92
  ❌ SHIB/USD     - Volume insuffisant: 24h<1,000,000, 7d<2,000,000, 30d<1,500,000

============================================================
📊 RÉSUMÉ FINAL
============================================================
Total analysés: 5
✅ Acceptés: 3 (60.0%)
❌ Rejetés: 2 (40.0%)
```

## Intégration GitHub Actions

Le script est compatible avec GitHub Actions et exporte les variables :
- `cryptos_accepted` : Nombre de cryptos acceptées
- `cryptos_rejected` : Nombre de cryptos rejetées  
- `cryptos_total` : Nombre total de cryptos analysées

## Différences avec stock-filter-by-volume.js

| Aspect | Stocks | Cryptos |
|--------|--------|---------|
| Source | Actions_{region}.csv | Crypto.csv |
| Seuils | Par région/MIC | Global (USD) |
| Exchanges | Bourses traditionnelles | Exchanges crypto |
| Métriques | Volume simple | Volume + Score qualité |
| Output | CSV uniquement | CSV + JSON top 50 |

## Troubleshooting

### Erreur "no_data"
- Vérifier que le symbole existe sur l'exchange
- Essayer sans spécifier d'exchange

### Données obsolètes
- Les données > 48h sont automatiquement rejetées
- Vérifier la disponibilité de l'API Twelve Data

### Rate limiting
- Le script limite automatiquement à ~16 requêtes/seconde
- Ajuster MIN_DELAY_MS si nécessaire
