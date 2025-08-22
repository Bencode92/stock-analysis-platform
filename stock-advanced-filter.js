// stock-advanced-filter.js
// Récupération complète des données financières

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';
const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    CHUNK_SIZE: 5,
    CREDIT_LIMIT: 800,
    CREDITS: {
        QUOTE: 1,
        TIME_SERIES: 5,
        STATISTICS: 25,
        DIVIDENDS: 10,
        OPTIONS: 50
    }
};

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
            exchange: row['Bourse de valeurs'] || row['Exchange'] || ''
        })).filter(s => s.symbol);
    } catch (error) {
        console.error(`Erreur ${filepath}: ${error.message}`);
        return [];
    }
}

// Récupérer les données de base
async function getQuoteData(symbol) {
    try {
        await pay(CONFIG.CREDITS.QUOTE);
        const { data } = await axios.get('https://api.twelvedata.com/quote', {
            params: { symbol, apikey: CONFIG.API_KEY }
        });
        
        if (data.status === 'error') return null;
        
        return {
            price: Number(data.close) || 0,
            change: Number(data.change) || 0,
            percent_change: Number(data.percent_change) || 0,
            volume: Number(data.volume) || 0,
            fifty_two_week: {
                high: Number(data.fifty_two_week?.high) || null,
                low: Number(data.fifty_two_week?.low) || null,
                range: data.fifty_two_week?.range || null
            }
        };
    } catch {
        return null;
    }
}

// Récupérer les performances historiques
async function getPerformanceData(symbol) {
    try {
        await pay(CONFIG.CREDITS.TIME_SERIES);
        
        // Récupérer 3 ans de données
        const { data } = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol,
                interval: '1day',
                outputsize: 756, // ~3 ans de trading days
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data.values || data.status === 'error') return {};
        
        const prices = data.values.map(v => ({
            date: v.datetime,
            close: Number(v.close)
        }));
        
        const current = prices[0]?.close || 0;
        const perf = {};
        
        // Calculer les performances
        if (prices[1]) perf.day_1 = ((current - prices[1].close) / prices[1].close * 100).toFixed(2);
        if (prices[21]) perf.month_1 = ((current - prices[21].close) / prices[21].close * 100).toFixed(2);
        if (prices[63]) perf.month_3 = ((current - prices[63].close) / prices[63].close * 100).toFixed(2);
        if (prices[252]) perf.year_1 = ((current - prices[252].close) / prices[252].close * 100).toFixed(2);
        if (prices[756]) perf.year_3 = ((current - prices[756].close) / prices[756].close * 100).toFixed(2);
        
        // YTD
        const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
        const ytdPrice = prices.find(p => p.date >= yearStart);
        if (ytdPrice) perf.ytd = ((current - ytdPrice.close) / ytdPrice.close * 100).toFixed(2);
        
        // Volatilité (écart-type annualisé des rendements)
        const returns = [];
        for (let i = 1; i < Math.min(252 * 3, prices.length); i++) {
            returns.push((prices[i-1].close - prices[i].close) / prices[i].close);
        }
        const vol = Math.sqrt(252) * standardDeviation(returns) * 100;
        
        // Max drawdown
        const drawdowns = calculateDrawdowns(prices);
        
        return {
            performances: perf,
            volatility_3y: vol.toFixed(2),
            max_drawdown_ytd: drawdowns.ytd,
            max_drawdown_3y: drawdowns.year3,
            distance_52w_high: current && prices[0] ? 
                ((current - Math.max(...prices.slice(0, 252).map(p => p.close))) / current * 100).toFixed(2) : null,
            distance_52w_low: current && prices[0] ? 
                ((current - Math.min(...prices.slice(0, 252).map(p => p.close))) / current * 100).toFixed(2) : null
        };
    } catch {
        return {};
    }
}

// Récupérer les dividendes
async function getDividendData(symbol) {
    try {
        await pay(CONFIG.CREDITS.DIVIDENDS);
        const { data } = await axios.get('https://api.twelvedata.com/dividends', {
            params: {
                symbol,
                range: 'last',
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data.dividends || data.status === 'error') return {};
        
        const dividends = data.dividends || [];
        const lastYear = dividends.filter(d => {
            const date = new Date(d.ex_date);
            const yearAgo = new Date();
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            return date > yearAgo;
        });
        
        const total = lastYear.reduce((sum, d) => sum + Number(d.amount), 0);
        const avgPerYear = dividends.length > 0 ? 
            dividends.reduce((sum, d) => sum + Number(d.amount), 0) / 
            (new Set(dividends.map(d => new Date(d.ex_date).getFullYear())).size || 1) : 0;
        
        return {
            dividend_yield_ttm: data.meta?.dividend_yield || null,
            dividends_history: dividends.slice(0, 10).map(d => ({
                ex_date: d.ex_date,
                amount: Number(d.amount),
                payment_date: d.payment_date
            })),
            avg_dividend_per_year: avgPerYear.toFixed(2),
            total_dividends_ttm: total.toFixed(2)
        };
    } catch {
        return {};
    }
}

// Récupérer les statistiques
async function getStatisticsData(symbol) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        const { data } = await axios.get('https://api.twelvedata.com/statistics', {
            params: { symbol, apikey: CONFIG.API_KEY }
        });
        
        if (data.status === 'error') return {};
        
        const stats = data.statistics || {};
        return {
            market_cap: stats.financials?.market_capitalization || null,
            pe_ratio: stats.valuations_metrics?.pe_ratio || null,
            beta: stats.valuations_metrics?.beta || null,
            shares_outstanding: stats.financials?.shares_outstanding || null
        };
    } catch {
        return {};
    }
}

// Récupérer les options (optionnel)
async function getOptionsData(symbol) {
    if (!process.env.INCLUDE_OPTIONS) return {};
    
    try {
        await pay(CONFIG.CREDITS.OPTIONS);
        const { data } = await axios.get('https://api.twelvedata.com/options/chain', {
            params: {
                symbol,
                expiration_date: 'latest',
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data.calls || data.status === 'error') return {};
        
        const totalOI = (data.calls || []).reduce((sum, c) => sum + (c.open_interest || 0), 0) +
                       (data.puts || []).reduce((sum, p) => sum + (p.open_interest || 0), 0);
        const totalVolume = (data.calls || []).reduce((sum, c) => sum + (c.volume || 0), 0) +
                           (data.puts || []).reduce((sum, p) => sum + (p.volume || 0), 0);
        
        return {
            options_total_oi: totalOI,
            options_total_volume: totalVolume,
            put_call_ratio: data.meta?.put_call_ratio || null
        };
    } catch {
        return {};
    }
}

// Enrichir un stock avec toutes les données
async function enrichStock(stock) {
    console.log(`  📊 ${stock.symbol}...`);
    
    const [quote, perf, dividends, stats, options] = await Promise.all([
        getQuoteData(stock.symbol),
        getPerformanceData(stock.symbol),
        getDividendData(stock.symbol),
        getStatisticsData(stock.symbol),
        getOptionsData(stock.symbol)
    ]);
    
    if (!quote) {
        return { ...stock, error: 'NO_DATA' };
    }
    
    return {
        // En-tête
        ticker: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        country: stock.country,
        
        // Cours & volume
        price: quote.price,
        change_percent: quote.percent_change,
        volume: quote.volume,
        market_cap: stats.market_cap,
        range_52w: quote.fifty_two_week.range,
        
        // Performances
        perf_1d: perf.performances?.day_1 || null,
        perf_1m: perf.performances?.month_1 || null,
        perf_3m: perf.performances?.month_3 || null,
        perf_ytd: perf.performances?.ytd || null,
        perf_1y: perf.performances?.year_1 || null,
        perf_3y: perf.performances?.year_3 || null,
        
        // Dividendes
        dividend_yield: dividends.dividend_yield_ttm,
        dividends_history: dividends.dividends_history || [],
        avg_dividend_year: dividends.avg_dividend_per_year,
        
        // Risque
        volatility_3y: perf.volatility_3y,
        distance_52w_high: perf.distance_52w_high,
        distance_52w_low: perf.distance_52w_low,
        max_drawdown_ytd: perf.max_drawdown_ytd,
        max_drawdown_3y: perf.max_drawdown_3y,
        
        // Options
        ...options,
        
        // Meta
        last_updated: new Date().toISOString()
    };
}

// Helpers
function standardDeviation(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function calculateDrawdowns(prices) {
    let peak = prices[0]?.close || 0;
    let maxDD_ytd = 0, maxDD_3y = 0;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    
    prices.forEach((p, i) => {
        if (p.close > peak) peak = p.close;
        const dd = (peak - p.close) / peak * 100;
        
        if (p.date >= yearStart) maxDD_ytd = Math.max(maxDD_ytd, dd);
        if (i < 756) maxDD_3y = Math.max(maxDD_3y, dd);
    });
    
    return { ytd: maxDD_ytd.toFixed(2), year3: maxDD_3y.toFixed(2) };
}

async function main() {
    console.log('📊 Enrichissement complet des stocks\n');
    await fs.mkdir(OUT_DIR, { recursive: true });
    
    const [usStocks, europeStocks, asiaStocks] = await Promise.all([
        loadStockCSV('data/Actions_US.csv'),
        loadStockCSV('data/Actions_Europe.csv'),
        loadStockCSV('data/Actions_Asie.csv')
    ]);
    
    console.log(`Stocks: US ${usStocks.length} | Europe ${europeStocks.length} | Asie ${asiaStocks.length}\n`);
    
    const regions = [
        { name: 'us', stocks: usStocks },
        { name: 'europe', stocks: europeStocks },
        { name: 'asia', stocks: asiaStocks }
    ];
    
    for (const region of regions) {
        console.log(`\n🌍 ${region.name.toUpperCase()}`);
        const enrichedStocks = [];
        
        for (let i = 0; i < region.stocks.length; i += CONFIG.CHUNK_SIZE) {
            const batch = region.stocks.slice(i, i + CONFIG.CHUNK_SIZE);
            const enrichedBatch = await Promise.all(batch.map(enrichStock));
            enrichedStocks.push(...enrichedBatch);
        }
        
        const filepath = path.join(OUT_DIR, `stocks_${region.name}.json`);
        await fs.writeFile(filepath, JSON.stringify({
            region: region.name.toUpperCase(),
            timestamp: new Date().toISOString(),
            stocks: enrichedStocks
        }, null, 2));
        
        console.log(`✅ ${filepath}`);
    }
}

if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

main().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
