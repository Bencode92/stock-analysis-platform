// stock-advanced-filter.js
// Enrichissement simple sans filtrage - génère 3 JSON

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';
const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    CHUNK_SIZE: 10,
    CREDIT_LIMIT: 800,
    CREDITS: {
        QUOTE: 1,
        STATISTICS: 25
    }
};

const symbolCache = new Map();
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

async function loadStockCSV(filepath) {
    try {
        const csvText = await fs.readFile(filepath, 'utf8');
        const records = parseCSV(csvText);
        return records.map(row => ({
            symbol: row['Ticker'] || row['Symbol'] || '',
            name: row['Stock'] || row['Name'] || '',
            sector: row['Secteur'] || row['Sector'] || '',
            country: row['Pays'] || row['Country'] || '',
            exchange: row['Bourse de valeurs'] || row['Exchange'] || '',
            currency: row['Devise de marché'] || row['Currency'] || 'USD'
        })).filter(s => s.symbol);
    } catch (error) {
        console.error(`Erreur ${filepath}: ${error.message}`);
        return [];
    }
}

async function getQuote(symbol) {
    if (symbolCache.has(symbol)) return symbolCache.get(symbol);
    
    try {
        await pay(CONFIG.CREDITS.QUOTE);
        const { data } = await axios.get('https://api.twelvedata.com/quote', {
            params: { symbol: symbol, apikey: CONFIG.API_KEY }
        });
        
        if (data && data.status !== 'error') {
            symbolCache.set(symbol, data);
            return data;
        }
    } catch {}
    return null;
}

async function getStatistics(symbol) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        const { data } = await axios.get('https://api.twelvedata.com/statistics', {
            params: { symbol: symbol, apikey: CONFIG.API_KEY }
        });
        
        if (data && data.status !== 'error') {
            const stats = data.statistics || {};
            return {
                market_cap: stats.financials?.market_capitalization || null,
                pe_ratio: stats.valuations_metrics?.pe_ratio || null,
                dividend_yield: stats.stock_dividends?.dividend_yield || null,
                beta: stats.valuations_metrics?.beta || null
            };
        }
    } catch {}
    return {};
}

async function enrichStock(stock) {
    const quote = await getQuote(stock.symbol);
    if (!quote) {
        return {
            ...stock,
            error: 'SYMBOL_NOT_FOUND'
        };
    }
    
    const stats = await getStatistics(stock.symbol);
    
    return {
        ...stock,
        price: Number(quote.close) || 0,
        change: Number(quote.change) || 0,
        percent_change: Number(quote.percent_change) || 0,
        volume: Number(quote.volume) || 0,
        average_volume: Number(quote.average_volume) || 0,
        fifty_two_week_high: Number(quote.fifty_two_week?.high) || null,
        fifty_two_week_low: Number(quote.fifty_two_week?.low) || null,
        ...stats,
        last_updated: new Date().toISOString()
    };
}

async function main() {
    console.log('📊 Enrichissement des stocks\n');
    await fs.mkdir(OUT_DIR, { recursive: true });
    
    // Charger les 3 CSV
    const [usStocks, europeStocks, asiaStocks] = await Promise.all([
        loadStockCSV('data/Actions_US.csv'),
        loadStockCSV('data/Actions_Europe.csv'),
        loadStockCSV('data/Actions_Asie.csv')
    ]);
    
    console.log(`Chargé: US ${usStocks.length} | Europe ${europeStocks.length} | Asie ${asiaStocks.length}\n`);
    
    // Traiter chaque région
    const regions = [
        { name: 'us', stocks: usStocks },
        { name: 'europe', stocks: europeStocks },
        { name: 'asia', stocks: asiaStocks }
    ];
    
    for (const region of regions) {
        console.log(`\n🔄 Traitement ${region.name.toUpperCase()}...`);
        const enrichedStocks = [];
        
        for (let i = 0; i < region.stocks.length; i += CONFIG.CHUNK_SIZE) {
            const batch = region.stocks.slice(i, i + CONFIG.CHUNK_SIZE);
            console.log(`Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, region.stocks.length)}`);
            
            const enrichedBatch = await Promise.all(batch.map(enrichStock));
            
            enrichedBatch.forEach(stock => {
                enrichedStocks.push(stock);
                if (!stock.error) {
                    console.log(`  ✅ ${stock.symbol}: $${stock.price}`);
                } else {
                    console.log(`  ❌ ${stock.symbol}: ${stock.error}`);
                }
            });
        }
        
        // Sauvegarder le JSON
        const filepath = path.join(OUT_DIR, `stocks_${region.name}.json`);
        await fs.writeFile(filepath, JSON.stringify({
            region: region.name.toUpperCase(),
            timestamp: new Date().toISOString(),
            total_stocks: enrichedStocks.length,
            stocks: enrichedStocks
        }, null, 2));
        
        console.log(`💾 Sauvegardé: ${filepath} (${enrichedStocks.length} stocks)`);
    }
    
    console.log('\n✅ Terminé');
}

if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

main().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
