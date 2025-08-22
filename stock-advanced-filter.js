// stock-advanced-filter.js
// Génère 3 JSON : stocks_us.json, stocks_europe.json, stocks_asia.json

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';
const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    MIN_ADV_USD_US: 1_000_000,
    MIN_ADV_USD_EUROPE: 500_000,
    MIN_ADV_USD_ASIA: 300_000,
    DAYS_HISTORY: 30,
    CHUNK_SIZE: 10,
    CREDIT_LIMIT: 2584,
    CREDITS: {
        TIME_SERIES: 5,
        QUOTE: 1,
        STATISTICS: 25
    }
};

const COUNTRY_TO_REGION = {
    'United States': 'us', 'USA': 'us', 'États-Unis': 'us',
    'Germany': 'europe', 'France': 'europe', 'United Kingdom': 'europe', 'Switzerland': 'europe',
    'Netherlands': 'europe', 'Spain': 'europe', 'Italy': 'europe', 'Belgium': 'europe',
    'Sweden': 'europe', 'Norway': 'europe', 'Denmark': 'europe', 'Finland': 'europe',
    'Japan': 'asia', 'China': 'asia', 'Hong Kong': 'asia', 'Singapore': 'asia',
    'South Korea': 'asia', 'Taiwan': 'asia', 'India': 'asia'
};

const symbolCache = new Map();
const fxCache = new Map();
let creditsUsed = 0;
let windowStart = Date.now();

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function pay(cost) {
    while (true) {
        const now = Date.now();
        if (now - windowStart > 60000) {
            creditsUsed = 0;
            windowStart = now;
        }
        if (creditsUsed + cost <= CONFIG.CREDIT_LIMIT) {
            creditsUsed += cost;
            return;
        }
        await wait(250);
    }
}

async function fxToUSD(currency) {
    if (!currency || currency === 'USD') return 1;
    if (currency === 'GBX') {
        const gbpRate = await fxToUSD('GBP');
        return gbpRate / 100;
    }
    if (fxCache.has(currency)) return fxCache.get(currency);
    
    try {
        await pay(1);
        const { data } = await axios.get('https://api.twelvedata.com/price', {
            params: { symbol: `${currency}/USD`, apikey: CONFIG.API_KEY }
        });
        const rate = Number(data?.price);
        if (rate > 0) {
            fxCache.set(currency, rate);
            return rate;
        }
    } catch {}
    
    fxCache.set(currency, 1);
    return 1;
}

function parseCSV(csvText) {
    const firstLine = csvText.split('\n')[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    return csv.parse(csvText, {
        columns: true,
        delimiter: delimiter,
        skip_empty_lines: true,
        relax_quotes: true
    });
}

async function loadStockCSV(filepath, defaultRegion) {
    try {
        const csvText = await fs.readFile(filepath, 'utf8');
        const records = parseCSV(csvText);
        return records.map(row => ({
            symbol: row['Ticker'] || row['Symbol'] || '',
            name: row['Stock'] || row['Name'] || '',
            sector: row['Secteur'] || row['Sector'] || '',
            country: row['Pays'] || row['Country'] || '',
            exchange: row['Bourse de valeurs'] || row['Exchange'] || '',
            currency: row['Devise de marché'] || row['Currency'] || 'USD',
            region: COUNTRY_TO_REGION[row['Pays'] || row['Country']] || defaultRegion
        })).filter(s => s.symbol);
    } catch (error) {
        console.error(`Erreur ${filepath}: ${error.message}`);
        return [];
    }
}

async function resolveSymbol(stock) {
    if (symbolCache.has(stock.symbol)) return symbolCache.get(stock.symbol);
    
    try {
        await pay(CONFIG.CREDITS.QUOTE);
        const { data } = await axios.get('https://api.twelvedata.com/quote', {
            params: { symbol: stock.symbol, apikey: CONFIG.API_KEY }
        });
        
        if (data && data.status !== 'error') {
            const result = { symbolParam: stock.symbol, quote: data };
            symbolCache.set(stock.symbol, result);
            return result;
        }
    } catch {}
    return null;
}

async function calculate30DayADV(symbolParam) {
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
        
        if (!data.values || data.status === 'error') return null;
        
        const advValues = data.values.map(day => {
            const volume = Number(day.volume) || 0;
            const close = Number(day.close) || 0;
            return volume * close;
        }).filter(v => v > 0);
        
        if (advValues.length === 0) return null;
        
        advValues.sort((a, b) => a - b);
        const mid = Math.floor(advValues.length / 2);
        return {
            adv_median_local: advValues.length % 2 ? advValues[mid] : (advValues[mid - 1] + advValues[mid]) / 2,
            days_with_data: advValues.length
        };
    } catch {
        return null;
    }
}

async function enrichStock(symbolParam) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        const { data } = await axios.get('https://api.twelvedata.com/statistics', {
            params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
        });
        
        if (!data || data.status === 'error') return {};
        
        const stats = data.statistics || {};
        const valuations = stats.valuations_metrics || {};
        const dividends = stats.stock_dividends || {};
        const financials = stats.financials || {};
        
        return {
            market_cap: financials.market_capitalization || null,
            pe_ratio: valuations.pe_ratio || null,
            peg_ratio: valuations.peg_ratio || null,
            dividend_yield: dividends.dividend_yield || null,
            year_change: financials.yearly_change || null,
            beta: valuations.beta || null
        };
    } catch {
        return {};
    }
}

async function processStock(stock) {
    try {
        const resolved = await resolveSymbol(stock);
        if (!resolved) return { ...stock, error: 'SYMBOL_NOT_FOUND' };
        
        const { symbolParam, quote } = resolved;
        const currency = quote.currency || stock.currency || 'USD';
        const fx = await fxToUSD(currency);
        const advData = await calculate30DayADV(symbolParam);
        
        let adv_median_usd;
        if (advData) {
            adv_median_usd = advData.adv_median_local * fx;
        } else {
            const avgVolume = Number(quote.average_volume) || 0;
            const price = Number(quote.close) || 0;
            adv_median_usd = avgVolume * price * fx;
        }
        
        const enrichment = await enrichStock(symbolParam);
        
        return {
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            country: stock.country,
            exchange: stock.exchange,
            currency,
            price: Number(quote.close) || 0,
            change: Number(quote.change) || 0,
            percent_change: Number(quote.percent_change) || 0,
            volume: Number(quote.volume) || 0,
            average_volume: Number(quote.average_volume) || 0,
            adv_median_usd,
            days_traded: advData?.days_with_data || 0,
            ...enrichment,
            last_updated: new Date().toISOString()
        };
    } catch (error) {
        return { ...stock, error: error.message };
    }
}

async function filterStocks() {
    console.log('📊 Filtrage stocks multi-régions\n');
    await fs.mkdir(OUT_DIR, { recursive: true });
    
    const [usStocks, europeStocks, asiaStocks] = await Promise.all([
        loadStockCSV('data/Actions_US.csv', 'us'),
        loadStockCSV('data/Actions_Europe.csv', 'europe'),
        loadStockCSV('data/Actions_Asie.csv', 'asia')
    ]);
    
    console.log(`US: ${usStocks.length} | Europe: ${europeStocks.length} | Asie: ${asiaStocks.length}\n`);
    
    const results = {
        us: { stocks: [] },
        europe: { stocks: [] },
        asia: { stocks: [] }
    };
    
    const allStocks = [
        ...usStocks.map(s => ({ ...s, source_region: 'us' })),
        ...europeStocks.map(s => ({ ...s, source_region: 'europe' })),
        ...asiaStocks.map(s => ({ ...s, source_region: 'asia' }))
    ];
    
    for (let i = 0; i < allStocks.length; i += CONFIG.CHUNK_SIZE) {
        const batch = allStocks.slice(i, i + CONFIG.CHUNK_SIZE);
        console.log(`Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, allStocks.length)}`);
        
        const batchResults = await Promise.all(batch.map(processStock));
        
        batchResults.forEach(result => {
            const region = result.source_region;
            if (!result.error && result.adv_median_usd !== undefined) {
                const threshold = region === 'us' ? CONFIG.MIN_ADV_USD_US :
                                region === 'europe' ? CONFIG.MIN_ADV_USD_EUROPE :
                                CONFIG.MIN_ADV_USD_ASIA;
                
                if (result.adv_median_usd >= threshold) {
                    results[region].stocks.push(result);
                    console.log(`  ✅ ${result.symbol}: ${(result.adv_median_usd/1e6).toFixed(2)}M$`);
                }
            }
        });
    }
    
    // Sauvegarder 3 JSON
    for (const region of ['us', 'europe', 'asia']) {
        const filepath = path.join(OUT_DIR, `stocks_${region}.json`);
        await fs.writeFile(filepath, JSON.stringify({
            region: region.toUpperCase(),
            timestamp: new Date().toISOString(),
            total_stocks: results[region].stocks.length,
            stocks: results[region].stocks
        }, null, 2));
        console.log(`\n✅ stocks_${region}.json: ${results[region].stocks.length} stocks`);
    }
}

if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

filterStocks().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
