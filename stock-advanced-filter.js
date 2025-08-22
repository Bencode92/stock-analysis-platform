// stock-advanced-filter.js
// Version corrigée avec patchs v2

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

// Mapping des exchanges par pays
const EXCHANGE_MAPPING = {
    'taiwan': 'XTAI',
    'taïwan': 'XTAI',
    'hong kong': 'XHKG',
    'singapore': 'XSES',
    'japan': 'XTKS',
    'japon': 'XTKS',
    'germany': 'XETR',
    'allemagne': 'XETR',
    'france': 'XPAR',
    'united kingdom': 'XLON',
    'uk': 'XLON',
    'royaume-uni': 'XLON',
    'switzerland': 'XSWX',
    'suisse': 'XSWX',
    'netherlands': 'XAMS',
    'pays-bas': 'XAMS',
    'south korea': 'XKRX',
    'corée': 'XKRX',
    'india': 'XBOM',
    'inde': 'XBOM',
    'spain': 'XMAD',
    'espagne': 'XMAD',
    'italy': 'XMIL',
    'italie': 'XMIL'
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

// Ajouter l'exchange au symbole si nécessaire
function withXchg(symbol, stock) {
    if (/:/.test(symbol)) return symbol;
    
    const country = (stock.country || '').toLowerCase();
    const exchange = stock.exchange || '';
    
    // Si on a déjà un code exchange valide
    if (exchange && exchange.length === 4 && exchange.startsWith('X')) {
        return `${symbol}:${exchange}`;
    }
    
    // Mapping par pays
    for (const [key, xchg] of Object.entries(EXCHANGE_MAPPING)) {
        if (country.includes(key)) {
            return `${symbol}:${xchg}`;
        }
    }
    
    return symbol;
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

async function getQuoteData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.QUOTE);
        const { data } = await axios.get('https://api.twelvedata.com/quote', {
            params: { 
                symbol: withXchg(symbol, stock), 
                apikey: CONFIG.API_KEY 
            }
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

async function getPerformanceData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.TIME_SERIES);
        
        const { data } = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol: withXchg(symbol, stock),
                interval: '1day',
                outputsize: 900, // Marge de sécurité
                order: 'ASC',
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data.values || data.status === 'error') return {};
        
        const prices = (data.values || []).map(v => ({
            date: v.datetime.slice(0, 10),
            close: Number(v.close)
        }));
        
        if (prices.length === 0) return {};
        
        const current = prices.at(-1)?.close || 0;
        const prev = prices.at(-2)?.close || null;
        const perf = {};
        
        // Performance 1 jour
        if (prev) perf.day_1 = ((current - prev) / prev * 100).toFixed(2);
        
        // Helper pour récupérer n jours en arrière
        const atFromEnd = (n) => prices.at(-1 - n)?.close ?? null;
        
        // Performances sur différentes périodes
        const p21 = atFromEnd(21), p63 = atFromEnd(63), p252 = atFromEnd(252);
        if (p21) perf.month_1 = ((current - p21) / p21 * 100).toFixed(2);
        if (p63) perf.month_3 = ((current - p63) / p63 * 100).toFixed(2);
        if (p252) perf.year_1 = ((current - p252) / p252 * 100).toFixed(2);
        
        // Performance 3 ans avec ancrage calendaire
        const now = new Date();
        const y3ISO = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
        const y3Bar = prices.find(p => p.date >= y3ISO);
        if (y3Bar && y3Bar.close !== current) {
            perf.year_3 = ((current - y3Bar.close) / y3Bar.close * 100).toFixed(2);
        }
        
        // YTD
        const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
        const ytdBar = prices.find(p => p.date >= yearStart);
        if (ytdBar && ytdBar.close !== current) {
            perf.ytd = ((current - ytdBar.close) / ytdBar.close * 100).toFixed(2);
        }
        
        // Volatilité avec log-returns
        const tail = prices.slice(-Math.min(252 * 3, prices.length)).map(p => p.close);
        const rets = [];
        for (let i = 1; i < tail.length; i++) {
            rets.push(Math.log(tail[i] / tail[i - 1]));
        }
        const vol = Math.sqrt(252) * standardDeviation(rets) * 100;
        
        // Distance 52 semaines
        const last252 = prices.slice(-252);
        const high52 = last252.length ? Math.max(...last252.map(p => p.close)) : null;
        const low52 = last252.length ? Math.min(...last252.map(p => p.close)) : null;
        
        // Drawdowns
        const drawdowns = calculateDrawdowns(prices);
        
        return {
            performances: perf,
            volatility_3y: vol.toFixed(2),
            max_drawdown_ytd: drawdowns.ytd,
            max_drawdown_3y: drawdowns.year3,
            distance_52w_high: high52 ? ((current - high52) / current * 100).toFixed(2) : null,
            distance_52w_low: low52 ? ((current - low52) / current * 100).toFixed(2) : null
        };
    } catch {
        return {};
    }
}

async function getDividendData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.DIVIDENDS);
        
        const todayISO = new Date().toISOString().slice(0, 10);
        const threeY = new Date();
        threeY.setFullYear(threeY.getFullYear() - 3);
        
        const { data } = await axios.get('https://api.twelvedata.com/dividends', {
            params: {
                symbol: withXchg(symbol, stock),
                start_date: threeY.toISOString().slice(0, 10),
                end_date: todayISO,
                apikey: CONFIG.API_KEY
            }
        });
        
        if (data?.status === 'error') return {};
        
        const arr = Array.isArray(data) ? data : (data.values || data.data || data.dividends || []);
        const dividends = arr.map(d => ({
            ex_date: d.ex_date || d.date,
            amount: Number(d.amount) || 0,
            payment_date: d.payment_date
        })).filter(d => d.ex_date);
        
        const lastYear = dividends.filter(d => {
            const date = new Date(d.ex_date);
            const yearAgo = new Date();
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            return date > yearAgo;
        });
        
        const total = lastYear.reduce((sum, d) => sum + d.amount, 0);
        const years = new Set(dividends.map(d => new Date(d.ex_date).getFullYear())).size;
        const avgPerYear = years > 0 ? dividends.reduce((sum, d) => sum + d.amount, 0) / years : 0;
        
        return {
            dividend_yield_ttm: data.meta?.dividend_yield || null,
            dividends_history: dividends.slice(0, 10),
            avg_dividend_per_year: avgPerYear.toFixed(2),
            total_dividends_ttm: total.toFixed(2)
        };
    } catch {
        return {};
    }
}

async function getStatisticsData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        const { data } = await axios.get('https://api.twelvedata.com/statistics', {
            params: { 
                symbol: withXchg(symbol, stock), 
                apikey: CONFIG.API_KEY 
            }
        });
        
        if (data.status === 'error') return {};
        
        const root = data?.statistics || data || {};
        const mc = Number(root.market_cap ?? root.market_capitalization ?? root?.financials?.market_capitalization);
        const pe = Number(root.pe_ratio ?? root?.valuations_metrics?.pe_ratio);
        const so = Number(root.shares_outstanding ?? root?.overview?.shares_outstanding ?? root?.financials?.shares_outstanding);
        
        return {
            market_cap: Number.isFinite(mc) ? mc : null,
            pe_ratio: Number.isFinite(pe) ? pe : null,
            beta: Number(root.beta ?? root?.risk_metrics?.beta) || null,
            shares_outstanding: Number.isFinite(so) ? so : null
        };
    } catch {
        return {};
    }
}

async function getOptionsData(symbol, stock) {
    if (process.env.INCLUDE_OPTIONS !== '1') return {};
    
    try {
        await pay(CONFIG.CREDITS.OPTIONS);
        
        // 1) Expirations sur le symbole local
        const exp = await axios.get('https://api.twelvedata.com/options_expiration', {
            params: { 
                symbol: withXchg(symbol, stock), 
                apikey: CONFIG.API_KEY 
            }
        });
        
        let dates = exp.data?.dates || exp.data?.expirations || [];
        let optSymbol = withXchg(symbol, stock);
        
        // 1bis) Aucun résultat ? On tente de trouver un listing US (XNYS/XNAS)
        if (!dates.length) {
            const srch = await axios.get('https://api.twelvedata.com/symbol_search', {
                params: { symbol, outputsize: 50, apikey: CONFIG.API_KEY }
            });
            const candidates = (srch.data?.data || srch.data || []).filter(
                s => ['XNYS','XNAS','XASE','ARCX','BATS'].includes(s.exchange) && 
                     /stock/i.test(s.instrument_type || '')
            );
            
            if (candidates.length) {
                optSymbol = `${candidates[0].symbol}:${candidates[0].exchange}`;
                const expUS = await axios.get('https://api.twelvedata.com/options_expiration', {
                    params: { symbol: optSymbol, apikey: CONFIG.API_KEY }
                });
                dates = expUS.data?.dates || expUS.data?.expirations || [];
            }
            
            if (!dates.length) return {}; // pas de couverture options
        }
        
        // 2) On prend la plus proche et récupère la chaîne
        const ed = dates[0];
        const { data } = await axios.get('https://api.twelvedata.com/options_chain', {
            params: { 
                symbol: optSymbol, 
                expiration_date: ed, 
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

async function enrichStock(stock) {
    console.log(`  📊 ${stock.symbol}...`);
    
    const [quote, perf, dividends, stats, options] = await Promise.all([
        getQuoteData(stock.symbol, stock),
        getPerformanceData(stock.symbol, stock),
        getDividendData(stock.symbol, stock),
        getStatisticsData(stock.symbol, stock),
        getOptionsData(stock.symbol, stock)
    ]);
    
    if (!quote) {
        return { ...stock, error: 'NO_DATA' };
    }
    
    return {
        ticker: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        country: stock.country,
        
        price: quote.price,
        change_percent: quote.percent_change,
        volume: quote.volume,
        market_cap: stats.market_cap,
        range_52w: quote.fifty_two_week.range,
        
        perf_1d: perf.performances?.day_1 || null,
        perf_1m: perf.performances?.month_1 || null,
        perf_3m: perf.performances?.month_3 || null,
        perf_ytd: perf.performances?.ytd || null,
        perf_1y: perf.performances?.year_1 || null,
        perf_3y: perf.performances?.year_3 || null,
        
        dividend_yield: dividends.dividend_yield_ttm,
        dividends_history: dividends.dividends_history || [],
        avg_dividend_year: dividends.avg_dividend_per_year,
        
        volatility_3y: perf.volatility_3y,
        distance_52w_high: perf.distance_52w_high,
        distance_52w_low: perf.distance_52w_low,
        max_drawdown_ytd: perf.max_drawdown_ytd,
        max_drawdown_3y: perf.max_drawdown_3y,
        
        ...options,
        
        last_updated: new Date().toISOString()
    };
}

function standardDeviation(values) {
    if (!values.length) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function calculateDrawdowns(prices) {
    let peak = prices[prices.length - 1]?.close || 0;
    let maxDD_ytd = 0, maxDD_3y = 0;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    
    for (let i = prices.length - 1; i >= 0; i--) {
        const p = prices[i];
        if (p.close > peak) peak = p.close;
        const dd = (peak - p.close) / peak * 100;
        
        if (p.date >= yearStart) maxDD_ytd = Math.max(maxDD_ytd, dd);
        if (prices.length - i <= 756) maxDD_3y = Math.max(maxDD_3y, dd);
    }
    
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
