# Script de Filtrage des Crypto-monnaies par Volume

## Description
Ce script filtre les crypto-monnaies du fichier `data/Crypto.csv` en fonction de leur volume de trading USD, similaire au script `stock-filter-by-volume.js` pour les actions.

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
export MIN_USD_DAY=500000      # 500k$ volume 24h
export MIN_USD_AVG7D=1500000   # 1.5M$ moyenne 7j
node scripts/crypto-filter-by-volume.js
```

## Fichier généré

Le script génère un seul fichier : **`data/filtered/Crypto_filtered_by_volume.csv`**

Format du CSV :
- `symbol` : Symbole de la crypto (ex: BTC/USD)
- `currency_base` : Devise de base (ex: BTC)
- `currency_quote` : Devise de cotation (ex: USD)
- `exchange_used` : Exchange utilisé pour les données
- `vol_usd_1d` : Volume en USD sur 24h
- `vol_usd_avg7d` : Volume moyen en USD sur 7 jours
- `last_close` : Dernier prix de clôture
- `last_datetime` : Date/heure de la dernière mise à jour

## Critères de filtrage

Une crypto est acceptée si :
1. Les données sont récentes (< 48h)
2. ET au moins UN de ces critères est satisfait :
   - Volume 24h ≥ MIN_USD_DAY (défaut: 1M$)
   - OU Volume moyen 7j ≥ MIN_USD_AVG7D (défaut: 2M$)

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

Si l'exchange préféré n'a pas de données, le script essaie sans spécifier d'exchange.

## Exemple de sortie console

```
🚀 Filtrage crypto par volume (Twelve Data)

📄 Source: data/Crypto.csv (5 lignes)
📊 Seuils: Volume 24h ≥ $1,000,000 OU Moyenne 7j ≥ $2,000,000

  ✅ 1000SATS/USD   (Binance)      1d=$5,234,567       avg7=$4,987,654
  ✅ 1INCH/USD      (Binance)      1d=$3,456,789       avg7=$3,210,987
  ❌ ACA/USD        (Binance)      volume faible (1d=$234,567 < $1,000,000 ET avg7=$345,678 < $2,000,000)
  Progression: 5/5

============================================================
📊 RÉSUMÉ FINAL
============================================================
Total analysés: 5
✅ Acceptées: 3 (60.0%)
❌ Rejetées: 2 (40.0%)
============================================================

📁 Fichier généré: data/filtered/Crypto_filtered_by_volume.csv
```

## Intégration GitHub Actions

Le script exporte les variables suivantes pour GitHub Actions :
- `cryptos_filtered` : Nombre de cryptos acceptées
- `cryptos_total` : Nombre total de cryptos analysées

## Comparaison avec stock-filter-by-volume.js

| Aspect | Stocks | Cryptos |
|--------|--------|---------|
| Fichier source | Actions_{region}.csv | Crypto.csv |
| Seuils | Par région/MIC | Global (USD) |
| Exchanges | Bourses traditionnelles | Exchanges crypto |
| Sortie | Multiple CSV (acceptés/rejetés) | Un seul CSV (acceptés) |
| Format exchange | Code MIC | Nom complet |

## Troubleshooting

### Erreur "no_data"
- Vérifier que le symbole existe sur l'exchange
- Le script réessaie automatiquement sans exchange spécifique

### Données obsolètes (stale>48h)
- Les données de plus de 48h sont automatiquement rejetées
- Vérifier la disponibilité de l'API Twelve Data

### Rate limiting
- Le script limite automatiquement à ~16 requêtes/seconde
- Ajuster MIN_DELAY_MS si nécessaire (défaut: 60ms)
