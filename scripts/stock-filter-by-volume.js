// stock-filter-by-volume.js
// Filtrage par volume avec API Twelve Data et gestion des crédits
// Compatible GitHub Actions

const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

// Configuration
const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    
    // Seuils de volume
    VOLUME_MIN: {
        US: 500_000,
        EUROPE: 50_000,
        ASIA: 100_000
    },
    
    VOLUME_MIN_BY_EXCHANGE: {
        // US
        'NYSE': 500_000,
        'NASDAQ': 500_000,
        
        // Europe
        'XETR': 100_000,
        'Euronext Paris': 80_000,
        'London Stock Exchange': 120_000,
        'Borsa Italiana': 80_000,
        'BME Spanish Exchanges': 80_000,
        'Euronext Amsterdam': 50_000,
        
        // Asie
        'Hong Kong Exchanges And Clearing Ltd': 100_000,
        'Korea Exchange (Stock Market)': 100_000,
        'National Stock Exchange Of India': 50_000,
        'Taiwan Stock Exchange': 60_000
    },
    
    // Config API
    DAYS_HISTORY: 30,
    CHUNK_SIZE: 12,
    CREDIT_LIMIT: 2584,
    CREDITS: {
        TIME_SERIES: 5,
        QUOTE: 0,
        PRICE: 0
    }
};

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'data/filtered';

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

// Cache FX
const fxCache = new Map();

async function fxToUSD(currency) {
    if (!currency || currency === 'USD') return 1;
    
    if (currency === 'GBX') {
        const gbpRate = await fxToUSD('GBP');
        return gbpRate / 100;
    }
    
    if (fxCache.has(currency)) {
        return fxCache.get(currency);
    }
    
    try {
        const { data } = await axios.get('https://api.twelvedata.com/price', {
            params: { 
                symbol: `${currency}/USD`,
                apikey: CONFIG.API_KEY 
            }
        });
        const rate = Number(data?.price);
        if (rate > 0) {
            fxCache.set(currency, rate);
            return rate;
        }
    } catch {}
    
    try {
        const { data } = await axios.get('https://api.twelvedata.com/price', {
            params: { 
                symbol: `USD/${currency}`,
                apikey: CONFIG.API_KEY 
            }
        });
        const rate = Number(data?.price);
        if (rate > 0) {
            const inverted = 1 / rate;
            fxCache.set(currency, inverted);
            return inverted;
        }
    } catch {}
    
    console.warn(`⚠️ Taux FX ${currency}/USD non trouvé`);
    fxCache.set(currency, 1);
    return 1;
}

// Mapper les exchanges pour l'API
function mapExchangeToMIC(exchange) {
    const mapping = {
        'NYSE': 'XNYS',
        'New York Stock Exchange': 'XNYS',
        'NASDAQ': 'XNAS',
        'Hong Kong Exchanges And Clearing Ltd': 'HKEX',
        'Korea Exchange (Stock Market)': 'XKRX',
        'National Stock Exchange Of India': 'XNSE',
        'Taiwan Stock Exchange': 'XTAI',
        'London Stock Exchange': 'XLON',
        'Euronext Paris': 'XPAR',
        'Borsa Italiana': 'XMIL',
        'BME Spanish Exchanges': 'XMAD',
        'Euronext Amsterdam': 'XAMS'
    };
    return mapping[exchange] || null;
}

// Résoudre le symbole pour l'API
async function resolveSymbol(ticker, exchange, currency) {
    const mic = mapExchangeToMIC(exchange);
    
    // Essayer ticker simple
    try {
        const { data } = await axios.get('https://api.twelvedata.com/quote', {
            params: { symbol: ticker, apikey: CONFIG.API_KEY }
        });
        
        if (data && data.status !== 'error') {
            return { symbolParam: ticker, quote: data };
        }
    } catch {}
    
    // Essayer avec MIC
    if (mic) {
        try {
            const symbolWithMic = `${ticker}:${mic}`;
            const { data } = await axios.get('https://api.twelvedata.com/quote', {
                params: { symbol: symbolWithMic, apikey: CONFIG.API_KEY }
            });
            
            if (data && data.status !== 'error') {
                return { symbolParam: symbolWithMic, quote: data };
            }
        } catch {}
    }
    
    return null;
}

// Calculer ADV médiane sur 30 jours
async function calculate30DayADV(symbolParam, fxRate) {
    try {
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
        
        const advValues = data.values.map(day => {
            const volume = Number(day.volume) || 0;
            const close = Number(day.close) || 0;
            return volume * close * fxRate; // Convertir en USD
        }).filter(v => v > 0);
        
        if (advValues.length === 0) return null;
        
        // Médiane
        advValues.sort((a, b) => a - b);
        const mid = Math.floor(advValues.length / 2);
        const medianUSD = advValues.length % 2 
            ? advValues[mid] 
            : (advValues[mid - 1] + advValues[mid]) / 2;
        
        return {
            adv_median_usd: medianUSD,
            days_with_data: advValues.length,
            latest_price: Number(data.values[0]?.close) || 0,
            latest_volume: Number(data.values[0]?.volume) || 0
        };
        
    } catch (error) {
        if (CONFIG.DEBUG) {
            console.error(`Erreur ADV: ${error.message}`);
        }
        return null;
    }
}

// Traiter un stock
async function processStock(stock) {
    const ticker = stock.Ticker;
    const exchange = stock['Bourse de valeurs'];
    const currency = stock['Devise de marché'] || 'USD';
    
    try {
        // Résoudre le symbole
        const resolved = await resolveSymbol(ticker, exchange, currency);
        if (!resolved) {
            return { ...stock, reason: 'SYMBOL_NOT_FOUND', volume: 0 };
        }
        
        const { symbolParam, quote } = resolved;
        
        // Obtenir le taux de change
        const fx = await fxToUSD(currency);
        
        // Calculer ADV
        const advData = await calculate30DayADV(symbolParam, fx);
        
        let adv_median_usd = 0;
        let volume = 0;
        let price = 0;
        
        if (advData) {
            adv_median_usd = advData.adv_median_usd;
            volume = advData.latest_volume;
            price = advData.latest_price;
        } else {
            // Fallback sur quote
            volume = Number(quote.volume) || Number(quote.average_volume) || 0;
            price = Number(quote.close) || Number(quote.previous_close) || 0;
            adv_median_usd = volume * price * fx;
        }
        
        return {
            ...stock,
            symbolParam,
            price,
            volume,
            adv_median_usd,
            change: Number(quote.change) || 0,
            percent_change: Number(quote.percent_change) || 0,
            market_cap: Number(quote.market_capitalization) || 0,
            currency,
            fx_rate: fx,
            days_traded: advData?.days_with_data || 0
        };
        
    } catch (error) {
        return { ...stock, reason: 'API_ERROR', volume: 0 };
    }
}

// Fonction principale
async function filterStocks() {
    console.log('📊 Filtrage des stocks par volume avec API Twelve Data\n');
    console.log(`⚙️  API Key: ${CONFIG.API_KEY ? '✓' : '✗ MANQUANTE'}`);
    
    if (!CONFIG.API_KEY) {
        console.error('❌ TWELVE_DATA_API_KEY manquante');
        process.exit(1);
    }
    
    console.log(`💳  Budget: ${CONFIG.CREDIT_LIMIT} crédits/min`);
    console.log(`📂  Dossier source: ${DATA_DIR}`);
    console.log(`📂  Dossier sortie: ${OUTPUT_DIR}\n`);
    
    // Créer le dossier de sortie
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Charger les CSV
    const csvFiles = ['Actions_US.csv', 'Actions_Europe.csv', 'Actions_Asie.csv'];
    const allStocks = [];
    
    for (const file of csvFiles) {
        try {
            const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
            const rows = parse(content, { 
                columns: true, 
                skip_empty_lines: true,
                bom: true
            });
            
            const region = file.includes('US') ? 'US' :
                          file.includes('Europe') ? 'EUROPE' : 'ASIA';
            
            rows.forEach(row => {
                allStocks.push({
                    ...row,
                    __region: region,
                    __source_file: file
                });
            });
            
            console.log(`📚 ${file}: ${rows.length} stocks`);
        } catch (error) {
            console.warn(`⚠️ Impossible de charger ${file}: ${error.message}`);
        }
    }
    
    console.log(`\n🔍 Analyse de ${allStocks.length} stocks...\n`);
    
    // Traiter par lots
    const results = {
        US: [],
        EUROPE: [],
        ASIA: [],
        rejected: []
    };
    
    for (let i = 0; i < allStocks.length; i += CONFIG.CHUNK_SIZE) {
        const batch = allStocks.slice(i, i + CONFIG.CHUNK_SIZE);
        console.log(`📦 Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, allStocks.length)}`);
        
        const batchPromises = batch.map(stock => processStock(stock));
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(result => {
            const region = result.__region;
            const threshold = CONFIG.VOLUME_MIN_BY_EXCHANGE[result['Bourse de valeurs']] || 
                            CONFIG.VOLUME_MIN[region] || 0;
            
            if (result.reason) {
                console.log(`  ${result.Ticker} | ❌ ${result.reason}`);
                results.rejected.push(result);
            } else if (result.volume >= threshold) {
                console.log(`  ${result.symbolParam} | Volume: ${result.volume.toLocaleString()} | ADV: ${(result.adv_median_usd/1e6).toFixed(2)}M$ | ✅ PASS`);
                results[region].push(result);
            } else {
                console.log(`  ${result.symbolParam} | Volume: ${result.volume.toLocaleString()} | ❌ < ${threshold.toLocaleString()}`);
                results.rejected.push({...result, failed: 'LOW_VOLUME'});
            }
        });
    }
    
    // Sauvegarder les résultats par région
    console.log('\n📊 Sauvegarde des résultats...\n');
    
    for (const region of ['US', 'EUROPE', 'ASIA']) {
        const stocks = results[region];
        
        // Trier par ADV
        stocks.sort((a, b) => (b.adv_median_usd || 0) - (a.adv_median_usd || 0));
        
        const output = {
            region,
            timestamp: new Date().toISOString(),
            stats: {
                total_stocks: stocks.length,
                avg_volume: Math.round(stocks.reduce((sum, s) => sum + s.volume, 0) / stocks.length || 0),
                avg_adv_usd: Math.round(stocks.reduce((sum, s) => sum + s.adv_median_usd, 0) / stocks.length || 0)
            },
            stocks: stocks.map(s => ({
                ticker: s.Ticker,
                name: s.Stock,
                sector: s.Secteur,
                country: s.Pays,
                exchange: s['Bourse de valeurs'],
                currency: s.currency,
                price: s.price,
                volume: s.volume,
                adv_median_usd: s.adv_median_usd,
                change_percent: s.percent_change,
                market_cap: s.market_cap
            }))
        };
        
        const outputFile = path.join(OUTPUT_DIR, `stocks_${region.toLowerCase()}_filtered.json`);
        await fs.writeFile(outputFile, JSON.stringify(output, null, 2));
        console.log(`✅ ${region}: ${stocks.length} stocks → ${outputFile}`);
    }
    
    // CSV combiné
    const allFiltered = [...results.US, ...results.EUROPE, ...results.ASIA];
    const csvHeader = 'Ticker,Stock,Secteur,Pays,Bourse de valeurs,Devise de marché,Volume,ADV USD\n';
    const csvRows = allFiltered.map(s => 
        `"${s.Ticker}","${s.Stock}","${s.Secteur}","${s.Pays}","${s['Bourse de valeurs']}","${s['Devise de marché']}",${s.volume},${Math.round(s.adv_median_usd)}`
    ).join('\n');
    
    await fs.writeFile(
        path.join(OUTPUT_DIR, 'Actions_filtrees_par_volume.csv'), 
        csvHeader + csvRows
    );
    
    // Résumé
    console.log('\n📊 RÉSUMÉ:');
    console.log(`  - Stocks traités: ${allStocks.length}`);
    console.log(`  - US retenus: ${results.US.length}`);
    console.log(`  - Europe retenus: ${results.EUROPE.length}`);
    console.log(`  - Asie retenus: ${results.ASIA.length}`);
    console.log(`  - Rejetés: ${results.rejected.length}`);
    console.log(`\n✅ Terminé! Résultats dans: ${OUTPUT_DIR}`);
    
    // Pour GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::set-output name=stocks_us::${results.US.length}`);
        console.log(`::set-output name=stocks_europe::${results.EUROPE.length}`);
        console.log(`::set-output name=stocks_asia::${results.ASIA.length}`);
    }
}

// Exécution
if (require.main === module) {
    filterStocks().catch(error => {
        console.error('❌ Erreur:', error);
        process.exit(1);
    });
}

module.exports = { filterStocks };
