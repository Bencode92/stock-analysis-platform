#!/usr/bin/env node

/**
 * test-stock-filter.js
 * Script de test pour vérifier la correction du bug ETR et les filtres avancés
 */

const StockAdvancedFilter = require('./stock-advanced-filter.js');

console.log('🧪 Test du module Stock Advanced Filter\n');
console.log('=' .repeat(50));

// ========================================
// TEST 1: Correction parseSplitFactor
// ========================================
console.log('\n📊 TEST 1: Correction parseSplitFactor');
console.log('-'.repeat(40));

const testCases = [
    { input: '2:1', expected: 2 },
    { input: '2/1', expected: 2 },
    { input: '2-1', expected: 2 },
    { input: '2 for 1', expected: 2 },
    { input: '1:2', expected: 0.5 },
    { input: '3:2', expected: 1.5 },
    { input: '', expected: 1 },
    { input: null, expected: 1 }
];

let passedTests = 0;
testCases.forEach(test => {
    const result = StockAdvancedFilter.parseSplitFactor(test.input);
    const passed = result === test.expected;
    passedTests += passed ? 1 : 0;
    
    console.log(`  "${test.input}" => ${result} ${passed ? '✅' : '❌'} (attendu: ${test.expected})`);
});

console.log(`\nRésultat: ${passedTests}/${testCases.length} tests passés`);

// ========================================
// TEST 2: Calcul TTM avec split ETR
// ========================================
console.log('\n📊 TEST 2: Calcul dividendes TTM avec split (cas ETR)');
console.log('-'.repeat(40));

// Données simulées ETR
const etrData = {
    ticker: 'ETR',
    price: 87.50,
    dividends: [
        { payment_date: '2024-11-15', amount: 1.20 }, // Pré-split
        { payment_date: '2024-08-15', amount: 1.20 }, // Pré-split
        { payment_date: '2024-05-15', amount: 1.20 }, // Pré-split
        { payment_date: '2024-02-15', amount: 1.20 }, // Pré-split
    ],
    splits: [
        { split_date: '2024-12-13', split_factor: '2:1' }
    ]
};

const ttmResult = StockAdvancedFilter.calculateDividendTTM(
    etrData.dividends,
    etrData.splits
);

console.log('  Dividendes originaux: 4 × 1.20€ = 4.80€');
console.log('  Split détecté:', ttmResult.recent_split ? `OUI (${ttmResult.split_date})` : 'NON');
console.log('  Factor de split:', ttmResult.split_factor);
console.log('  TTM ajusté:', ttmResult.ttm_sum.toFixed(2) + '€');
console.log('  Rendement calculé:', ((ttmResult.ttm_sum / etrData.price) * 100).toFixed(2) + '%');
console.log('  Source:', ttmResult.source);

const expectedYield = 2.74; // Environ 2.4/87.5
const actualYield = (ttmResult.ttm_sum / etrData.price) * 100;
const yieldCorrect = Math.abs(actualYield - expectedYield) < 0.1;

console.log(`\n  Vérification: ${yieldCorrect ? '✅' : '❌'} Rendement ~2.7% (vs ~5.3% sans correction)`);

// ========================================
// TEST 3: Filtres et Scoring
// ========================================
console.log('\n📊 TEST 3: Moteur de filtrage et scoring');
console.log('-'.repeat(40));

// Données de test
const testStocks = [
    {
        ticker: 'ETR',
        name: 'E.ON SE',
        region: 'EUROPE',
        sector: 'Utilities',
        price: 87.50,
        market_cap: 57_000_000_000,
        dividend_yield_ttm: 2.74,
        payout_ratio_ttm: 45,
        perf_ytd: 12.5,
        perf_1y: 18.3,
        volatility_3y: 22.5,
        adv_median_usd: 45_000_000
    },
    {
        ticker: 'SAP',
        name: 'SAP SE',
        region: 'EUROPE',
        sector: 'Technology',
        price: 195.20,
        market_cap: 228_000_000_000,
        dividend_yield_ttm: 1.2,
        payout_ratio_ttm: 35,
        perf_ytd: 45.2,
        perf_1y: 52.1,
        volatility_3y: 28.3,
        adv_median_usd: 120_000_000
    },
    {
        ticker: 'TTE',
        name: 'TotalEnergies',
        region: 'EUROPE',
        sector: 'Energy',
        price: 58.90,
        market_cap: 142_000_000_000,
        dividend_yield_ttm: 4.8,
        payout_ratio_ttm: 52,
        perf_ytd: -2.3,
        perf_1y: 8.5,
        volatility_3y: 35.2,
        adv_median_usd: 95_000_000
    }
];

// Test filtrage avec preset
const engine = new StockAdvancedFilter.FilterEngine(testStocks);
engine.applyPreset('dividend_aristocrats')
      .addFilter('region', ['EUROPE']);

const filtered = engine.execute();
engine.scoreResults();

console.log(`  Actions testées: ${testStocks.length}`);
console.log(`  Actions filtrées: ${filtered.length}`);
console.log('\n  Résultats avec scores:');

filtered.forEach(stock => {
    console.log(`    ${stock.ticker}: Score total ${stock.composite_score.total}/100`);
    console.log(`      - Liquidité: ${stock.composite_score.liquidity}`);
    console.log(`      - Fondamentaux: ${stock.composite_score.fundamentals}`);
    console.log(`      - Performance: ${stock.composite_score.performance}`);
    console.log(`      - Stabilité: ${stock.composite_score.stability}`);
});

// ========================================
// TEST 4: Export CSV
// ========================================
console.log('\n📊 TEST 4: Export des données');
console.log('-'.repeat(40));

const csvExport = StockAdvancedFilter.exportResults(filtered, 'csv');
const lines = csvExport.split('\n');

console.log(`  Format CSV généré: ${lines.length} lignes`);
console.log(`  En-têtes: ${lines[0]}`);
console.log(`  Première ligne de données:`);
console.log(`    ${lines[1]?.substring(0, 80)}...`);

// ========================================
// RÉSUMÉ
// ========================================
console.log('\n' + '='.repeat(50));
console.log('📈 RÉSUMÉ DES TESTS');
console.log('='.repeat(50));

const allTestsPassed = passedTests === testCases.length && yieldCorrect && filtered.length > 0;

if (allTestsPassed) {
    console.log('\n✅ TOUS LES TESTS SONT PASSÉS !');
    console.log('   La correction du bug ETR fonctionne correctement.');
    console.log('   Les filtres et le scoring sont opérationnels.');
} else {
    console.log('\n⚠️  CERTAINS TESTS ONT ÉCHOUÉ');
    console.log('   Vérifiez les résultats ci-dessus.');
}

console.log('\n💡 Prochaines étapes:');
console.log('   1. Relancer vos scripts d\'enrichissement');
console.log('   2. Vérifier les rendements dans les JSON générés');
console.log('   3. Intégrer les filtres dans votre UI');

// ========================================
// TEST BONUS: Debug ETR direct
// ========================================
if (process.argv.includes('--debug-etr')) {
    console.log('\n' + '='.repeat(50));
    console.log('🔍 DEBUG ETR DÉTAILLÉ');
    console.log('='.repeat(50));
    
    StockAdvancedFilter.debugETR({
        ...etrData,
        last_split_factor: '2:1'
    });
}

console.log('\n✨ Test terminé.\n');

// Exit code
process.exit(allTestsPassed ? 0 : 1);
