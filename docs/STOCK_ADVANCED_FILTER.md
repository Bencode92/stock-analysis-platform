# Stock Advanced Filter Module

## 🔧 Correction du Bug ETR - Split Factor

Ce module corrige le bug critique qui affectait le calcul des dividendes pour les actions ayant subi un split récent (comme ETR avec son split 2:1 du 13/12/2024).

### Le Problème
- L'ancienne fonction `parseSplitFactor` ne reconnaissait pas le format `"2:1"` renvoyé par Twelve Data
- Les dividendes pré-split n'étaient pas ajustés
- ETR affichait ~5.3% de rendement au lieu de ~2.7%

### La Solution
```javascript
// Nouvelle fonction qui reconnaît tous les formats
function parseSplitFactor(s) {
    // Accepte: "2:1", "2/1", "2-1", "2 for 1", etc.
    const m = str.match(/(\d+(?:\.\d+)?)\s*(?:[:\/-]|\s*for\s*)\s*(\d+(?:\.\d+)?)/i);
    return a / b; // "2:1" => 2
}
```

## 📊 Fonctionnalités de Filtrage Avancé

### 1. Presets de Filtrage

Le module inclut 8 stratégies prédéfinies :

| Preset | Description | Critères principaux |
|--------|-------------|-------------------|
| `dividend_aristocrats` | Actions à dividendes croissants | Yield 2.5-8%, Payout 20-70%, 10+ ans |
| `growth_stocks` | Entreprises en forte croissance | Revenue +15%/an, PE < 40 |
| `value_stocks` | Actions sous-évaluées | PE < 15, PB < 1.5, Yield > 3% |
| `garp` | Growth at Reasonable Price | PEG < 1.5, ROE > 15% |
| `low_volatility` | Actions défensives | Volatilité < 20%, Beta < 0.8 |
| `momentum` | Tendance haussière forte | Perf 3M > 10%, RSI 50-70 |
| `quality` | Haute qualité financière | ROE > 20%, Debt/Equity < 0.3 |
| `etr_profile` | Debug ETR | Market Cap > 50B€, Europe |

### 2. Utilisation Simple

```javascript
// Charger le module
const SAF = StockAdvancedFilter;

// Charger vos données
const stocks = await fetch('data/stocks_europe.json').then(r => r.json());

// Filtrage rapide avec preset
const aristocrats = SAF.quickFilter(stocks.stocks, 'dividend_aristocrats');
console.log(`Trouvé: ${aristocrats.length} aristocrates du dividende`);

// Voir le top 5
aristocrats.slice(0, 5).forEach(s => {
    console.log(`${s.ticker}: Score ${s.composite_score.total}/100`);
});
```

### 3. Filtrage Personnalisé

```javascript
// Créer un moteur de filtrage
const engine = new SAF.FilterEngine(stocks.stocks);

// Combiner preset + filtres custom
engine.applyPreset('value_stocks')
      .addFilter('region', ['EUROPE'])
      .addFilter('market_cap', { min: 50_000_000_000 }) // > 50B€
      .addFilter('sector', ['Industrial', 'Technology']);

// Exécuter et scorer
const results = engine.execute();
engine.scoreResults();

// Export des résultats
const csv = SAF.exportResults(results, 'csv');
```

### 4. Debug ETR Spécifique

```javascript
// Trouver ETR dans vos données
const etr = stocks.stocks.find(s => s.ticker === 'ETR');

// Debugger avec le module
SAF.debugETR({
    ...etr,
    dividends: etr.dividends_history,
    splits: etr.splits_history,
    last_split_factor: "2:1",
    price: 87.50
});

// Output attendu:
// Split factor: 2
// TTM calculé: { ttm_sum: 2.40, source: 'TTM (calc, split-adj)' }
// Rendement corrigé: 2.74%
```

## 🎯 Système de Scoring

Chaque action filtrée reçoit un score composite sur 100 points :

- **Liquidité (25%)** : Volume quotidien en $
- **Fondamentaux (25%)** : PE, Yield, Payout Ratio
- **Performance (25%)** : YTD, 1Y, Momentum 3M
- **Stabilité (25%)** : Volatilité, Beta, Drawdown

## 🚀 Intégration avec votre Pipeline

### Dans vos scripts Node.js

```javascript
// enrichment-script.js
const SAF = require('./stock-advanced-filter.js');

// Dans votre fonction d'enrichissement
async function enrichStockWithDividends(stock) {
    const apiData = await fetchFromTwelveData(stock.ticker);
    
    // Utiliser le module pour calculer le TTM ajusté
    const ttmData = SAF.calculateDividendTTM(
        apiData.dividends,
        apiData.splits
    );
    
    stock.dividend_yield_ttm = (ttmData.ttm_sum / stock.price) * 100;
    stock.dividend_ttm_source = ttmData.source;
    
    return stock;
}
```

### Dans votre interface web

```html
<!-- liste.html -->
<script src="stock-advanced-filter.js"></script>
<script>
// Ajouter un bouton de filtre dans l'UI
function applyDividendFilter() {
    const filtered = StockAdvancedFilter.quickFilter(
        currentStocks, 
        'dividend_aristocrats'
    );
    renderFilteredStocks(filtered);
}
</script>
```

## 📈 Métriques Requises

Pour un fonctionnement optimal, vos données doivent contenir :

### Métriques Essentielles
- `ticker`, `name`, `price`
- `region`, `sector`, `country`
- `market_cap` ou (`shares_outstanding` * `price`)
- `volume`, `average_volume`

### Métriques de Dividendes (corrigées par le module)
- `dividends_history` : Array des dividendes
- `splits_history` : Array des splits
- Le module calcule automatiquement : `dividend_yield_ttm`, `payout_ratio_ttm`

### Métriques de Performance
- `perf_ytd`, `perf_1y`, `perf_3m`
- `volatility_3y`, `beta`
- `max_drawdown_3y`

### Métriques Fondamentales (optionnelles)
- `pe_ratio`, `pb_ratio`, `peg_ratio`
- `roe`, `roce`, `gross_margin`
- `debt_to_equity`, `interest_coverage`

## 🔄 Workflow Recommandé

1. **Scraping** : Boursorama → données de base
2. **Enrichissement API** : Twelve Data → dividendes, splits, métriques
3. **Correction Split** : Module SAF → ajustement TTM
4. **Filtrage** : Module SAF → sélection selon stratégie
5. **Scoring** : Module SAF → ranking des résultats
6. **Export** : JSON/CSV pour analyse

## 📝 Tests

Pour vérifier que la correction fonctionne :

```bash
# Test sur ETR
node -e "
const SAF = require('./stock-advanced-filter.js');
const factor = SAF.parseSplitFactor('2:1');
console.log('2:1 =>', factor); // Doit afficher: 2
"

# Test complet
node test-stock-filter.js
```

## 🐛 Troubleshooting

### Problème : Rendements toujours incorrects
- Vérifier que les données de splits sont présentes
- S'assurer que `split_date` est au bon format
- Regarder `debug_dividends` dans le JSON généré

### Problème : Filtres ne trouvent rien
- Baisser les seuils (ex: `market_cap` minimum)
- Vérifier que les champs requis existent
- Utiliser `CONFIG.DEBUG = true` pour voir les détails

## 📚 Ressources

- [Documentation Twelve Data API](https://twelvedata.com/docs)
- [Liste des splits récents](https://www.marketwatch.com/tools/stockresearch/splits)
- [Stratégies de filtrage](https://www.investopedia.com/terms/s/stock-screen.asp)

## 🤝 Contribution

Pour ajouter de nouveaux presets de filtrage :

```javascript
// Dans FILTER_PRESETS
my_strategy: {
    name: "Ma Stratégie",
    description: "Description",
    filters: {
        metric1: { min: X, max: Y },
        metric2: ['value1', 'value2']
    }
}
```

---

*Module créé pour corriger le bug ETR et améliorer le filtrage des actions dans TradePulse*
