# Système de Filtrage des Stocks par Volume

## 📊 Seuils de Volume Configurés

### Par Région (seuils par défaut)
| Région | Volume Minimum | Description |
|--------|---------------|-------------|
| **US** | 500,000 | Marchés américains (NYSE, NASDAQ) |
| **EUROPE** | 50,000 | Marchés européens (seuil par défaut) |
| **ASIA** | 100,000 | Marchés asiatiques (seuil par défaut) |

### Par Bourse (seuils spécifiques - prioritaires)

#### 🇺🇸 États-Unis
| Bourse | Code MIC | Volume Min |
|--------|----------|------------|
| NYSE | XNYS | 500,000 |
| NASDAQ | XNAS | 500,000 |

#### 🇪🇺 Europe
| Bourse | Code MIC | Volume Min |
|--------|----------|------------|
| London Stock Exchange | XLON | 120,000 |
| Xetra (Allemagne) | XETR | 100,000 |
| Euronext Paris | XPAR | 80,000 |
| Borsa Italiana | XMIL | 80,000 |
| BME Spanish Exchanges | XMAD | 80,000 |
| NASDAQ Stockholm | XSTO | 60,000 |
| Euronext Amsterdam | XAMS | 50,000 |
| NASDAQ Copenhagen | XCSE | 40,000 |
| NASDAQ Helsinki | XHEL | 40,000 |
| Euronext Brussels | XBRU | 30,000 |
| SIX Swiss Exchange | XSWX | 20,000 |
| Euronext Lisbon | XLIS | 20,000 |

#### 🌏 Asie
| Bourse | Code MIC | Volume Min |
|--------|----------|------------|
| Hong Kong Exchanges | XHKG | 100,000 |
| Korea Exchange | XKRX | 100,000 |
| Taiwan Stock Exchange | XTAI | 60,000 |
| National Stock Exchange India | XNSE | 50,000 |
| Bombay Stock Exchange | XBOM | 50,000 |

## 🚀 Utilisation

### Exécution Locale
```bash
# Installation des dépendances
npm install

# Exécution avec votre clé API
TWELVE_DATA_API_KEY=votre_clé npm run filter-stocks
```

### GitHub Actions
Le workflow s'exécute automatiquement tous les jours à 2h UTC ou manuellement :
- Aller dans Actions → Filter Stocks by Volume → Run workflow

## 📁 Fichiers Générés

### Stocks Acceptés
- `data/filtered/Actions_US_filtered.csv` - Stocks US avec volume suffisant
- `data/filtered/Actions_Europe_filtered.csv` - Stocks Europe avec volume suffisant
- `data/filtered/Actions_Asie_filtered.csv` - Stocks Asie avec volume suffisant
- `data/filtered/Actions_filtrees_par_volume.csv` - Tous les stocks acceptés (combiné)

### Stocks Rejetés
- `data/filtered/Actions_US_rejected.csv` - Stocks US rejetés (volume insuffisant)
- `data/filtered/Actions_Europe_rejected.csv` - Stocks Europe rejetés
- `data/filtered/Actions_Asie_rejected.csv` - Stocks Asie rejetés
- `data/filtered/Actions_rejetes_par_volume.csv` - Tous les stocks rejetés (combiné)

Les fichiers rejetés incluent les colonnes supplémentaires :
- **Volume** : Volume actuel du stock
- **Seuil** : Seuil minimum requis
- **MIC** : Code MIC de la bourse
- **Symbole** : Symbole utilisé pour l'API
- **Raison** : Explication du rejet

## 🔍 Logique de Filtrage

1. **Identification de la bourse** → Recherche du code MIC correspondant
2. **Sélection du seuil** :
   - Si bourse identifiée → utilise le seuil spécifique
   - Sinon → utilise le seuil de la région
3. **Décision** : Volume ≥ Seuil → ✅ Accepté | Volume < Seuil → ❌ Rejeté

## 📈 Logs

Le script affiche toujours :
- ✅ Stocks acceptés avec volume et seuil
- ❌ Stocks rejetés avec volume et seuil
- Progression du traitement
- Résumé final avec statistiques

## 🔧 Configuration

Pour modifier les seuils, éditez `scripts/stock-filter-by-volume.js` :

```javascript
// Seuils par région
const VOL_MIN = { US: 500_000, EUROPE: 50_000, ASIA: 100_000 };

// Seuils par bourse
const VOL_MIN_BY_MIC = {
  XNAS: 500_000, // NASDAQ
  XPAR: 80_000,  // Paris
  // etc...
};
```

## 📊 Exemple de Sortie

```
📊 US: 500 stocks à analyser
  ✅ AAPL: 75,234,567 >= 500,000
  ❌ XYZ: 45,234 < 500,000
  Progression: 10/500
  ...
✅ US: 350/500 stocks retenus
❌ US: 150 stocks rejetés

==================================================
📊 RÉSUMÉ FINAL
==================================================
Total analysés: 1500
✅ Retenus: 800 (53.3%)
❌ Rejetés: 700 (46.7%)
==================================================
```
