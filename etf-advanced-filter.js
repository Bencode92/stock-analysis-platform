// etf-advanced-filter.js
// Version simplifiée : Filtrage par ADV médiane 30j uniquement
// Garde la même structure de sortie pour compatibilité

const fs = require('fs').promises;
const axios = require('axios');
const csv = require('csv-parse/sync');

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    
    // Critère unique simplifié
    MIN_ADV_USD: 1_000_000,       // 1M$ pour tous (ETF + Bonds)
    
    // Config API
    DAYS_HISTORY: 30,
    CHUNK_SIZE: 12,
    RATE_LIMIT: 800,
    CREDIT_LIMIT: 2500,
    CREDITS: {
        TIME_SERIES: 5,
        QUOTE: 0
    }
};

// MIC codes US
const US_MIC_CODES = ['ARCX', 'BATS', 'XNAS', 'XNYS', 'XASE', 'XNGS', 'XNMS'];

// Cache pour les symboles et FX
const symbolCache = new Map();
const fxCache = new Map();

// Gestion des crédits API
let creditsUsed = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function pay(cost) {
    while (true) {
        const now = Date.now();
        if (now - windowStart > WINDOW_MS) {
            creditsUsed = 0;
            windowStart = now;
            if (CONFIG.DEBUG) {
                console.log('💳 Nouvelle fenêtre de crédits');
            }
        }
        
        if (creditsUsed + cost <= CONFIG.CREDIT_LIMIT) {
            creditsUsed += cost;
            return;
        }
        
        const remaining = WINDOW_MS - (now - windowStart);
        if (CONFIG.DEBUG) {
            console.log(`⏳ Attente ${(remaining/1000).toFixed(1)}s...`);
        }
        await wait(250);
    }
}

function cleanSymbol(symbol) {
    if (symbol.includes('.')) {
        return symbol.split('.')[0];
    }
    return symbol;
}

function buildSymbolParam(symbol, mic_code) {
    const cleaned = cleanSymbol(symbol);
    if (US_MIC_CODES.includes(mic_code)) {
        return cleaned;
    }
    return mic_code ? `${cleaned}:${mic_code}` : cleaned;
}

// Obtenir le taux de change
async function getFxRate(currency, apiKey) {
    if (currency === 'USD') return 1;
    
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
        
        const rate = Number(data.close) || 1;
        fxCache.set(cacheKey, rate);
        return rate;
    } catch {
        fxCache.set(cacheKey, 1);
        return 1;
    }
}

// Calculer ADV médiane sur 30 jours
async function calculate30DayADV(symbol, mic_code, currency = 'USD') {
    try {
        const symbolParam = buildSymbolParam(symbol, mic_code);
        
        await pay(CONFIG.CREDITS.TIME_SERIES);
        
        const { data } = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol: symbolParam,
                interval: '1day',
                outputsize: CONFIG.DAYS_HISTORY,
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data.values || data.status === 'error') {
            return null;
        }
        
        // Extraire les volumes en dollars
        const advValues = data.values.map(day => {
            const volume = Number(day.volume) || 0;
            const close = Number(day.close) || 0;
            return volume * close;
        }).filter(v => v > 0);
        
        if (advValues.length === 0) return null;
        
        // Calculer la médiane
        advValues.sort((a, b) => a - b);
        const mid = Math.floor(advValues.length / 2);
        const medianLocal = advValues.length % 2 
            ? advValues[mid] 
            : (advValues[mid - 1] + advValues[mid]) / 2;
        
        // Convertir en USD si nécessaire
        const fxRate = await getFxRate(currency, CONFIG.API_KEY);
        const medianUSD = medianLocal * fxRate;
        
        // Calculer aussi le spread moyen (pour info seulement)
        const spreads = data.values.map(day => {
            const high = Number(day.high) || 0;
            const low = Number(day.low) || 0;
            const close = Number(day.close) || 0;
            return close > 0 ? (high - low) / close : null;
        }).filter(s => s !== null);
        
        const avgSpread = spreads.length > 0 
            ? spreads.reduce((a, b) => a + b) / spreads.length 
            : null;
        
        return {
            adv_median_usd: medianUSD,
            spread_avg: avgSpread,
            days_with_data: advValues.length,
            fx_rate: fxRate
        };
        
    } catch (error) {
        if (CONFIG.DEBUG) {
            console.error(`Erreur ADV ${symbol}: ${error.message}`);
        }
        return null;
    }
}

// Traiter un ETF avec structure de sortie identique à l'ancienne version
async function processETF(item) {
    try {
        const symbolParam = buildSymbolParam(item.symbol, item.mic_code);
        
        // 1) Quote basique pour prix actuel
        const quote = await axios.get('https://api.twelvedata.com/quote', {
            params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
        }).then(r => r.data).catch(() => null);
        
        if (!quote || quote.status === 'error') {
            return { ...item, reason: 'UNSUPPORTED_BY_PROVIDER' };
        }
        
        // 2) Calculer ADV médiane 30j
        const advData = await calculate30DayADV(
            item.symbol, 
            item.mic_code, 
            item.currency || 'USD'
        );
        
        if (!advData) {
            return { ...item, reason: 'NO_VOLUME_DATA' };
        }
        
        // 3) Construire l'objet de sortie (garde tous les champs pour compatibilité)
        const result = {
            // Identification
            symbol: item.symbol,
            name: item.name,
            isin: item.isin,
            mic_code: item.mic_code,
            symbolParam,
            
            // Prix et variations (depuis quote)
            price: Number(quote.close) || 0,
            change: Number(quote.change) || 0,
            percent_change: Number(quote.percent_change) || 0,
            volume: Number(quote.volume) || 0,
            average_volume: Number(quote.average_volume) || 0,
            
            // Métriques clés
            net_assets: Number(quote.market_capitalization) || 0, // Fallback
            avg_dollar_volume: advData.adv_median_usd,
            
            // Champs vides pour compatibilité
            nav: 0,
            nav_available: false,
            premium_discount: 0,
            fund_type: '',
            expense_ratio: 0,
            yield_ttm: 0,
            inception_date: '',
            
            // Performance (vide pour simplifier)
            trailing_returns: {},
            ytd_return: null,
            one_month_return: null,
            three_month_return: null,
            one_year_return: null,
            three_year_return: null,
            five_year_return: null,
            ten_year_return: null,
            
            // Risque (vide)
            volatility_3y: null,
            sharpe_3y: null,
            beta_3y: null,
            
            // Composition (vide)
            sectors: [],
            top_holdings: [],
            countries: [],
            
            // Métriques custom
            vol_ratio: 1,
            spread_avg: advData.spread_avg,
            days_traded: advData.days_with_data
        };
        
        // 4) Appliquer le filtre simple - ADV UNIQUEMENT
        const passLiquidity = advData.adv_median_usd >= CONFIG.MIN_ADV_USD;
        
        // MODIFICATION: Ignorer complètement le spread
        if (passLiquidity) {
            return { ...result, passed: true };
        } else {
            return { ...result, failed: ['liquidity'] };
        }
        
    } catch (error) {
        return { ...item, reason: 'API_ERROR' };
    }
}

// Agréger par ISIN si plusieurs listings
function aggregateByISIN(results) {
    const isinGroups = {};
    
    results.forEach(item => {
        const isin = item.isin || `NO_ISIN_${item.symbol}`;
        if (!isinGroups[isin]) {
            isinGroups[isin] = [];
        }
        isinGroups[isin].push(item);
    });
    
    const aggregated = [];
    
    Object.entries(isinGroups).forEach(([isin, group]) => {
        if (group.length === 1) {
            aggregated.push(group[0]);
        } else {
            // Agréger les volumes
            const totalADV = group.reduce((sum, item) => {
                return sum + (item.avg_dollar_volume || 0);
            }, 0);
            
            // Prendre le listing principal (plus gros volume)
            const main = group.reduce((best, item) => {
                return (item.avg_dollar_volume || 0) > (best.avg_dollar_volume || 0) ? item : best;
            });
            
            aggregated.push({
                ...main,
                avg_dollar_volume: totalADV,
                listings: group.map(g => ({
                    symbol: g.symbol,
                    mic_code: g.mic_code,
                    adv: g.avg_dollar_volume
                }))
            });
        }
    });
    
    return aggregated;
}

// Fonction principale
async function filterETFs() {
    console.log('📊 Filtrage simplifié par ADV médiane 30j\n');
    console.log(`⚙️  Seuil unique: ${(CONFIG.MIN_ADV_USD/1e6).toFixed(1)}M$ ADV`);
    console.log(`📝  Critère: ADV médiane UNIQUEMENT (spread ignoré)\n`);
    
    // Lire les CSV
    const etfData = await fs.readFile('data/all_etfs.csv', 'utf8');
    const bondData = await fs.readFile('data/all_bonds.csv', 'utf8');
    
    const etfs = csv.parse(etfData, { columns: true });
    const bonds = csv.parse(bondData, { columns: true });
    
    const results = {
        etfs: [],
        bonds: [],
        rejected: [],
        stats: {
            total_etfs: etfs.length,
            total_bonds: bonds.length,
            timestamp: new Date().toISOString(),
            start_time: Date.now()
        }
    };
    
    // Traiter tous les instruments
    const allItems = [
        ...etfs.map(e => ({ ...e, type: 'ETF' })),
        ...bonds.map(b => ({ ...b, type: 'BOND' })
    ];
    
    console.log(`🔍 Analyse de ${allItems.length} instruments...\n`);
    
    // Traiter par lots
    for (let i = 0; i < allItems.length; i += CONFIG.CHUNK_SIZE) {
        const batch = allItems.slice(i, i + CONFIG.CHUNK_SIZE);
        console.log(`📦 Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, allItems.length)}`);
        
        const batchPromises = batch.map(item => processETF(item));
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(result => {
            const isETF = result.type === 'ETF';
            
            // Logger
            if (result.symbolParam) {
                const advInfo = result.avg_dollar_volume 
                    ? `${(result.avg_dollar_volume/1e6).toFixed(2)}M$`
                    : 'N/A';
                console.log(`  ${result.symbolParam} | ADV: ${advInfo} | ${result.passed ? '✅ PASS' : '❌ FAIL'}`));
            }
            
            // Classer
            if (result.passed) {
                if (isETF) results.etfs.push(result);
                else results.bonds.push(result);
            } else {
                results.rejected.push(result);
            }
        });
    }
    
    // Optionnel : agréger par ISIN
    console.log('\n📊 Agrégation par ISIN...');
    results.etfs = aggregateByISIN(results.etfs);
    results.bonds = aggregateByISIN(results.bonds);
    
    // Statistiques finales
    const elapsedTime = Date.now() - results.stats.start_time;
    results.stats.elapsed_seconds = Math.round(elapsedTime / 1000);
    results.stats.etfs_retained = results.etfs.length;
    results.stats.bonds_retained = results.bonds.length;
    results.stats.total_retained = results.etfs.length + results.bonds.length;
    results.stats.rejected_count = results.rejected.length;
    
    // Pour compatibilité, ajouter les stats data_quality (vides)
    results.stats.data_quality = {
        with_nav: 0,
        with_fund_type: 0,
        with_expense_ratio: 0,
        with_sectors: 0,
        with_holdings: 0,
        with_risk_metrics: 0
    };
    
    // Analyser les raisons de rejet
    const rejectionReasons = {};
    results.rejected.forEach(item => {
        if (item.reason) {
            rejectionReasons[item.reason] = (rejectionReasons[item.reason] || 0) + 1;
        } else if (item.failed) {
            item.failed.forEach(f => {
                rejectionReasons[f] = (rejectionReasons[f] || 0) + 1;
            });
        }
    });
    
    results.stats.rejection_reasons = rejectionReasons;
    
    // Sauvegarder (même nom de fichier pour compatibilité)
    await fs.writeFile('data/filtered_advanced.json', JSON.stringify(results, null, 2));
    
    // CSV simplifié
    const csvHeader = 'symbol,mic_code,price,change_%,aum_usd,adv_usd,expense_ratio,yield_ttm,nav,premium_discount,sectors,holdings\n';
    const csvRows = results.etfs.map(etf => 
        `${etf.symbol},${etf.mic_code || ''},${etf.price},${etf.percent_change || 0},${etf.net_assets},${etf.avg_dollar_volume},0,0,0,0,0,0`
    ).join('\n');
    await fs.writeFile('data/filtered_advanced.csv', csvHeader + csvRows);
    
    // Résumé
    console.log('\n📊 RÉSUMÉ:');
    console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`);
    console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`);
    console.log(`Rejetés: ${results.rejected.length}`);
    console.log(`Temps total: ${results.stats.elapsed_seconds}s`);
    
    console.log('\n📊 Raisons de rejet:');
    Object.entries(rejectionReasons).forEach(([reason, count]) => {
        console.log(`  - ${reason}: ${count}`);
    });
    
    console.log(`\n✅ Résultats: data/filtered_advanced.json`);
    console.log(`📊 CSV: data/filtered_advanced.csv`);
    
    // Pour GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::set-output name=etfs_count::${results.etfs.length}`);
        console.log(`::set-output name=bonds_count::${results.bonds.length}`);
    }
}

// Lancer
if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

filterETFs().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
