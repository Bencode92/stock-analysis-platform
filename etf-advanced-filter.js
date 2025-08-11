// etf-advanced-filter.js
// Version ultra-simplifiée : 1 seul critère ADV médiane 30j
// Optionnel : trade count et spread

const fs = require('fs').promises;
const axios = require('axios');
const csv = require('csv-parse/sync');

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    
    // Seuils simples
    MIN_ADV_USD: 1_000_000,        // 1M$ pour tout (equity + bonds)
    MIN_TRADE_COUNT: 30,           // Optionnel : min 30 trades/jour
    MAX_SPREAD_PCT: 0.01,          // Optionnel : max 1% spread
    
    // Ou mode "coverage" (garde top X%)
    USE_COVERAGE_MODE: false,
    COVERAGE: 0.7,                 // Garde top 70%
    
    // Config API
    DAYS_HISTORY: 30,
    CHUNK_SIZE: 8,
    RATE_LIMIT_MS: 150,
    CREDITS_LIMIT: 2500,
    CREDITS: {
        TIME_SERIES: 5,
        QUOTE: 0
    }
};

// MIC codes US
const US_MIC_CODES = ['ARCX', 'BATS', 'XNAS', 'XNYS', 'XASE', 'XNGS', 'XNMS'];

// Cache des taux de change
const fxCache = new Map();

// Gestion des crédits API
let creditsUsed = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000; // 1 minute

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Système de paiement des crédits
async function pay(cost) {
    while (true) {
        const now = Date.now();
        // Nouvelle minute ?
        if (now - windowStart > WINDOW_MS) {
            creditsUsed = 0;
            windowStart = now;
            if (CONFIG.DEBUG) {
                console.log('💳 Nouvelle fenêtre de crédits (2500 disponibles)');
            }
        }
        
        // Assez de crédits ?
        if (creditsUsed + cost <= CONFIG.CREDITS_LIMIT) {
            creditsUsed += cost;
            if (CONFIG.DEBUG && cost > 0) {
                console.log(`💳 ${cost} crédits utilisés (${creditsUsed}/${CONFIG.CREDITS_LIMIT})`);
            }
            return;
        }
        
        // Sinon attendre
        const remaining = WINDOW_MS - (now - windowStart);
        if (CONFIG.DEBUG) {
            console.log(`⏳ Limite crédit atteinte, attente ${(remaining/1000).toFixed(1)}s...`);
        }
        await wait(250);
    }
}

// Obtenir le taux de change
async function getFxRate(currency, apiKey) {
    if (!currency || currency === 'USD' || currency === 'N/A') return 1;
    
    const cacheKey = `${currency}/USD`;
    if (fxCache.has(cacheKey)) {
        return fxCache.get(cacheKey);
    }
    
    try {
        const { data } = await axios.get('https://api.twelvedata.com/quote', {
            params: { 
                symbol: cacheKey,
                apikey: apiKey 
            }
        });
        
        const rate = Number(data.close) || 0;
        if (rate > 0) {
            fxCache.set(cacheKey, rate);
            return rate;
        }
    } catch (error) {
        if (CONFIG.DEBUG) {
            console.warn(`⚠️  Taux FX ${cacheKey} non trouvé`);
        }
    }
    
    // Fallback rates pour les devises communes
    const fallbackRates = {
        'EUR': 1.1,
        'GBP': 1.3,
        'CHF': 1.1,
        'JPY': 0.007,
        'CAD': 0.75,
        'AUD': 0.65
    };
    
    const rate = fallbackRates[currency] || 1;
    fxCache.set(cacheKey, rate);
    return rate;
}

// Nettoyer les symboles
function cleanSymbol(symbol) {
    if (symbol.includes('.')) {
        return symbol.split('.')[0];
    }
    return symbol;
}

// Construire le symbole pour l'API
function buildSymbolParam(symbol, mic_code) {
    const cleaned = cleanSymbol(symbol);
    
    // Les symboles US n'ont pas de suffixe
    if (US_MIC_CODES.includes(mic_code)) {
        return cleaned;
    }
    
    return mic_code ? `${cleaned}:${mic_code}` : cleaned;
}

// Calculer les métriques sur 30 jours
async function calculate30DayMetrics(item) {
    try {
        const symbolParam = buildSymbolParam(item.symbol, item.mic_code);
        
        // Payer les crédits pour time_series
        await pay(CONFIG.CREDITS.TIME_SERIES);
        
        // Récupérer 30 jours de données
        const { data } = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol: symbolParam,
                interval: '1day',
                outputsize: CONFIG.DAYS_HISTORY,
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data.values || data.status === 'error') {
            console.log(`  ⚠️  ${symbolParam}: Pas de données`);
            return null;
        }
        
        // Extraire les métriques quotidiennes
        const dailyMetrics = data.values.map(day => ({
            volume: Number(day.volume) || 0,
            high: Number(day.high) || 0,
            low: Number(day.low) || 0,
            close: Number(day.close) || 0,
            // Estimation du spread basée sur high/low
            spread_pct: day.high && day.low && day.close ? 
                (day.high - day.low) / day.close : null
        }));
        
        // Calculer ADV en monnaie locale
        const advLocal = dailyMetrics.map(d => d.volume * d.close).filter(v => v > 0);
        
        if (advLocal.length === 0) {
            console.log(`  ⚠️  ${symbolParam}: Aucun volume`);
            return null;
        }
        
        // Obtenir le taux de change
        const fxRate = await getFxRate(item.currency, CONFIG.API_KEY);
        
        // Convertir en USD
        const advUSD = advLocal.map(v => v * fxRate);
        
        // Fonction pour calculer la médiane
        const median = arr => {
            const sorted = arr.sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };
        
        // Calculer les spreads valides
        const validSpreads = dailyMetrics
            .map(d => d.spread_pct)
            .filter(v => v !== null && v > 0 && v < 0.1); // Filtre les valeurs aberrantes
        
        // Métriques finales
        const metrics = {
            symbol: item.symbol,
            mic_code: item.mic_code,
            adv_median_usd: median(advUSD),
            adv_mean_usd: advUSD.reduce((a, b) => a + b, 0) / advUSD.length,
            spread_pct_median: validSpreads.length > 0 ? median(validSpreads) : null,
            days_traded: dailyMetrics.filter(d => d.volume > 0).length,
            fx_rate: fxRate,
            currency: item.currency || 'USD'
        };
        
        if (CONFIG.DEBUG) {
            console.log(`  ✓ ${symbolParam}: ADV ${(metrics.adv_median_usd/1e6).toFixed(2)}M$, Spread ${metrics.spread_pct_median ? (metrics.spread_pct_median*100).toFixed(2) : 'N/A'}%`);
        }
        
        return metrics;
        
    } catch (error) {
        console.error(`  ❌ ${item.symbol}: ${error.message}`);
        return null;
    }
}

// Agréger par ISIN
async function processISINGroup(isin, items) {
    console.log(`\n🔍 ISIN: ${isin} (${items.length} listing${items.length > 1 ? 's' : ''})`);
    
    // Calculer les métriques pour chaque listing
    const metricsPromises = items.map(item => calculate30DayMetrics(item));
    const allMetrics = await Promise.all(metricsPromises);
    const validMetrics = allMetrics.filter(m => m !== null);
    
    if (validMetrics.length === 0) {
        console.log(`  ⚠️  Aucune donnée valide pour cet ISIN`);
        return null;
    }
    
    // Agréger les volumes USD de tous les listings
    const totalAdvMedianUSD = validMetrics.reduce((sum, m) => sum + m.adv_median_usd, 0);
    const totalAdvMeanUSD = validMetrics.reduce((sum, m) => sum + m.adv_mean_usd, 0);
    
    // Moyenne pondérée des spreads
    const spreadsWithVolume = validMetrics
        .filter(m => m.spread_pct_median !== null)
        .map(m => ({ spread: m.spread_pct_median, weight: m.adv_median_usd }));
    
    const totalWeight = spreadsWithVolume.reduce((sum, s) => sum + s.weight, 0);
    const weightedSpread = totalWeight > 0 
        ? spreadsWithVolume.reduce((sum, s) => sum + s.spread * s.weight, 0) / totalWeight 
        : null;
    
    // Info du listing principal (celui avec le plus gros volume)
    const mainMetrics = validMetrics.reduce((max, m) => 
        m.adv_median_usd > (max?.adv_median_usd || 0) ? m : max
    );
    const mainItem = items.find(i => i.symbol === mainMetrics.symbol && i.mic_code === mainMetrics.mic_code) || items[0];
    
    console.log(`  💰 ADV médiane totale: ${(totalAdvMedianUSD / 1e6).toFixed(2)}M$`);
    if (weightedSpread !== null) {
        console.log(`  📊 Spread pondéré: ${(weightedSpread * 100).toFixed(2)}%`);
    }
    console.log(`  📍 Listing principal: ${mainMetrics.symbol}:${mainMetrics.mic_code}`);
    
    // Appliquer les filtres
    const passLiquidity = totalAdvMedianUSD >= CONFIG.MIN_ADV_USD;
    const passSpread = !CONFIG.MAX_SPREAD_PCT || weightedSpread === null || weightedSpread <= CONFIG.MAX_SPREAD_PCT;
    const passAll = passLiquidity && passSpread;
    
    console.log(`  ${passAll ? '✅ PASS' : '❌ FAIL'} ${!passLiquidity ? '(liquidité)' : ''} ${!passSpread ? '(spread)' : ''}`);
    
    return {
        // Données principales
        ...mainItem,
        isin: isin || `NO_ISIN_${mainItem.symbol}`,
        
        // Métriques agrégées
        adv_median_usd_total: totalAdvMedianUSD,
        adv_mean_usd_total: totalAdvMeanUSD,
        spread_pct_weighted: weightedSpread,
        avg_dollar_volume: totalAdvMedianUSD, // Pour compatibilité avec l'ancien format
        
        // Détails des listings
        listings: validMetrics.map(m => ({
            symbol: m.symbol,
            mic_code: m.mic_code,
            adv_median_usd: m.adv_median_usd,
            currency: m.currency,
            fx_rate: m.fx_rate
        })),
        
        // Résultats du filtre
        passed: passAll,
        failed_criteria: [
            !passLiquidity && 'liquidity',
            !passSpread && 'spread'
        ].filter(Boolean)
    };
}

// Mode coverage : garde top X%
function applyCoverageFilter(results, coverage) {
    // Grouper par catégorie
    const categories = {
        equity_us: [],
        equity_eu: [],
        bonds: []
    };
    
    results.forEach(item => {
        if (item.type === 'bond' || item.name?.toLowerCase().includes('bond')) {
            categories.bonds.push(item);
        } else if (US_MIC_CODES.includes(item.mic_code)) {
            categories.equity_us.push(item);
        } else {
            categories.equity_eu.push(item);
        }
    });
    
    console.log('\n📊 Application du mode coverage:');
    
    // Pour chaque catégorie, garde top X%
    Object.entries(categories).forEach(([cat, items]) => {
        if (items.length === 0) return;
        
        // Trier par ADV décroissant
        items.sort((a, b) => b.adv_median_usd_total - a.adv_median_usd_total);
        
        // Calculer le seuil
        const keepCount = Math.ceil(items.length * coverage);
        const threshold = items[Math.min(keepCount - 1, items.length - 1)]?.adv_median_usd_total || 0;
        
        console.log(`  ${cat}: garde top ${(coverage * 100).toFixed(0)}% (${keepCount}/${items.length}), seuil: ${(threshold / 1e6).toFixed(2)}M$`);
        
        // Marquer les items qui passent
        items.forEach((item, index) => {
            if (index < keepCount) {
                item.passed = true;
                item.failed_criteria = [];
            } else {
                item.passed = false;
                item.failed_criteria = ['coverage'];
            }
        });
    });
    
    return results;
}

// Fonction principale
async function filterETFs() {
    console.log('🚀 Filtrage simplifié par liquidité (ADV médiane 30j)\n');
    console.log(`📏 Seuil: ${(CONFIG.MIN_ADV_USD / 1e6).toFixed(1)}M$ ADV`);
    if (CONFIG.MAX_SPREAD_PCT) {
        console.log(`📊 Spread max: ${(CONFIG.MAX_SPREAD_PCT * 100).toFixed(1)}%`);
    }
    if (CONFIG.USE_COVERAGE_MODE) {
        console.log(`📈 Mode coverage: garde top ${(CONFIG.COVERAGE * 100).toFixed(0)}%`);
    }
    console.log('');
    
    const startTime = Date.now();
    
    // Lire les CSV
    const etfData = await fs.readFile('data/all_etfs.csv', 'utf8');
    const bondData = await fs.readFile('data/all_bonds.csv', 'utf8');
    
    const etfs = csv.parse(etfData, { columns: true });
    const bonds = csv.parse(bondData, { columns: true });
    
    // Marquer le type
    etfs.forEach(e => e.type = 'equity');
    bonds.forEach(b => b.type = 'bond');
    
    const allItems = [...etfs, ...bonds];
    
    // Grouper par ISIN
    const isinGroups = {};
    allItems.forEach(item => {
        const isin = item.isin || `NO_ISIN_${item.symbol}`;
        if (!isinGroups[isin]) {
            isinGroups[isin] = [];
        }
        isinGroups[isin].push(item);
    });
    
    console.log(`📋 Total: ${allItems.length} instruments`);
    console.log(`   - ${etfs.length} ETFs`);
    console.log(`   - ${bonds.length} Bonds`);
    console.log(`   - ${Object.keys(isinGroups).length} ISINs uniques\n`);
    
    // Traiter chaque groupe ISIN
    const results = [];
    let processed = 0;
    
    for (const [isin, items] of Object.entries(isinGroups)) {
        const result = await processISINGroup(isin, items);
        if (result) {
            results.push(result);
        }
        
        processed++;
        // Rate limiting entre les groupes
        if (processed % CONFIG.CHUNK_SIZE === 0 && processed < Object.keys(isinGroups).length) {
            console.log(`\n⏸️  Pause rate limiting...`);
            await wait(CONFIG.RATE_LIMIT_MS);
        }
    }
    
    // Appliquer le mode coverage si activé
    if (CONFIG.USE_COVERAGE_MODE) {
        applyCoverageFilter(results, CONFIG.COVERAGE);
    }
    
    // Séparer passed/failed
    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);
    
    // Analyser les raisons d'échec
    const failureReasons = {};
    failed.forEach(item => {
        item.failed_criteria.forEach(reason => {
            failureReasons[reason] = (failureReasons[reason] || 0) + 1;
        });
    });
    
    // Préparer les données de sortie (format compatible avec l'ancien)
    const output = {
        etfs: passed.filter(i => i.type === 'equity'),
        bonds: passed.filter(i => i.type === 'bond'),
        rejected: failed,
        stats: {
            total_etfs: etfs.length,
            total_bonds: bonds.length,
            timestamp: new Date().toISOString(),
            start_time: startTime,
            elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
            etfs_retained: passed.filter(i => i.type === 'equity').length,
            bonds_retained: passed.filter(i => i.type === 'bond').length,
            total_retained: passed.length,
            rejected_count: failed.length,
            rejection_reasons: failureReasons,
            criteria: {
                min_adv_usd: CONFIG.MIN_ADV_USD,
                max_spread_pct: CONFIG.MAX_SPREAD_PCT,
                use_coverage: CONFIG.USE_COVERAGE_MODE,
                coverage: CONFIG.COVERAGE
            }
        }
    };
    
    // Sauvegarder les résultats avec les anciens noms de fichiers
    await fs.writeFile('data/filtered_advanced.json', JSON.stringify(output, null, 2));
    
    // Créer un CSV compatible avec l'ancien format
    const csvHeader = 'symbol,mic_code,price,change_%,aum_usd,adv_usd,expense_ratio,yield_ttm,nav,premium_discount,sectors,holdings\n';
    const csvRows = passed.map(item => 
        `${item.symbol},${item.mic_code},0,0,0,${Math.round(item.adv_median_usd_total)},0,0,0,0,0,0`
    ).join('\n');
    
    await fs.writeFile('data/filtered_advanced.csv', csvHeader + csvRows);
    
    // Afficher le résumé
    console.log('\n\n📊 RÉSUMÉ FINAL:');
    console.log(`✅ ETFs retenus: ${output.etfs.length}/${etfs.length}`);
    console.log(`✅ Bonds retenus: ${output.bonds.length}/${bonds.length}`);
    console.log(`❌ Rejetés: ${failed.length}`);
    console.log(`⏱️  Temps total: ${output.stats.elapsed_seconds}s`);
    
    if (Object.keys(failureReasons).length > 0) {
        console.log('\n📉 Raisons d\'échec:');
        Object.entries(failureReasons).forEach(([reason, count]) => {
            console.log(`   - ${reason}: ${count}`);
        });
    }
    
    // Top 10 par liquidité
    console.log('\n🏆 Top 10 par liquidité:');
    passed
        .sort((a, b) => b.adv_median_usd_total - a.adv_median_usd_total)
        .slice(0, 10)
        .forEach((item, i) => {
            console.log(`   ${i + 1}. ${item.symbol} (${item.name}): ${(item.adv_median_usd_total / 1e6).toFixed(1)}M$/jour`);
        });
    
    console.log(`\n✅ Résultats sauvegardés:`);
    console.log(`   - data/filtered_advanced.json`);
    console.log(`   - data/filtered_advanced.csv`);
    
    // Pour GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::set-output name=etfs_count::${output.etfs.length}`);
        console.log(`::set-output name=bonds_count::${output.bonds.length}`);
    }
}

// Lancer le script
if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

filterETFs().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
});
