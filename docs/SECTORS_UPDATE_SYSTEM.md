# Système de mise à jour automatique des données sectorielles

Ce système permet de récupérer automatiquement les données de performance des secteurs boursiers via l'API Twelve Data en utilisant des ETFs sectoriels comme proxy.

## 📁 Fichiers créés

1. **`data/sectors_etf_mapping.csv`** - Mapping de 36 ETFs sectoriels (18 Europe, 18 US)
2. **`scripts/update_sectors_data_etf.py`** - Script Python de mise à jour
3. **`.github/workflows/update-sectors-data-twelve.yml`** - Workflow d'automatisation

## 🚀 Pour démarrer

### 1. Vérifier votre clé API

Assurez-vous que votre secret `TWELVE_DATA_API` est bien configuré dans GitHub :
- Settings → Secrets and variables → Actions
- Le secret `TWELVE_DATA_API` doit contenir votre clé API Twelve Data

### 2. Lancer la première mise à jour

1. Allez dans l'onglet **Actions** de votre repository
2. Sélectionnez "📊 Update Sectors via Twelve Data API"
3. Cliquez sur "Run workflow" → "Run workflow"

### 3. Vérifier les résultats

Une fois l'exécution terminée, vérifiez que le fichier `data/sectors.json` a été créé et contient les données des secteurs.

## 📊 Structure des données générées

Le fichier `data/sectors.json` contient :

```json
{
  "sectors": {
    "energy": [...],
    "materials": [...],
    "industrials": [...],
    "consumer-discretionary": [...],
    "consumer-staples": [...],
    "healthcare": [...],
    "financials": [...],
    "information-technology": [...],
    "communication-services": [...],
    "utilities": [...],
    "real-estate": [...]
  },
  "top_performers": {
    "daily": {"best": [...], "worst": [...]},
    "ytd": {"best": [...], "worst": [...]}
  },
  "meta": {
    "sources": ["STOXX Europe 600", "NASDAQ", "S&P Select Sectors"],
    "timestamp": "2025-07-31T14:30:00Z",
    "count": 36
  }
}
```

## ⏰ Automatisation

Le système se met à jour automatiquement :
- **Toutes les 4 heures** (30 minutes après la mise à jour des marchés)
- Via GitHub Actions avec le workflow configuré

## 🔧 Personnalisation

Pour ajouter/modifier des ETFs sectoriels :
1. Éditez `data/sectors_etf_mapping.csv`
2. Ajoutez les lignes avec : symbol, name, currency, exchange, mic_code, country, category, region
3. Les catégories valides sont : energy, materials, industrials, consumer-discretionary, consumer-staples, healthcare, financials, information-technology, communication-services, utilities, real-estate
4. Les régions valides sont : europe, us

## 📝 Notes

- La page `secteurs.html` est déjà configurée pour lire automatiquement `data/sectors.json`
- Les données sont organisées par région (Europe/US) dans l'interface
- Les top performers sont calculés automatiquement
