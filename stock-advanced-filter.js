// stock-advanced-filter.js
// Version 3.4 - Add tops_overview.json generation

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
        MARKET_CAP: 1
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

// Parser robuste pour nombres avec formats variés
function parseNumberLoose(val) {
    if (val == null) return null;
    if (typeof val === 'number') return Number.isFinite(val) ? val : null;
    let s = String(val).trim();
    if (!s) return null;
    
    // Multiplicateur suffixe
    let mult = 1;
    const suf = s.match(/([kmbt])\s*$/i);
    if (suf) {
        const x = suf[1].toLowerCase();
        mult = x === 'k' ? 1e3 : x === 'm' ? 1e6 : x === 'b' ? 1e9 : 1e12;
        s = s.slice(0, -1);
    }
    
    // Enlève devises/lettres/espaces fines
    s = s.replace(/[^\d.,\-]/g, '');
    
    // Normalise séparateurs (gère décimale "," européenne)
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {         // décimale = ","
        s = s.replace(/\./g, '');        // retire points des milliers
        s = s.replace(',', '.');         // décimale en point
    } else {
        s = s.replace(/,/g, '');         // retire virgules des milliers
    }
    
    const n = Number(s);
    return Number.isFinite(n) ? n * mult : null;
}

// Fonction de résolution locale avec mapping des exchanges
function resolveSymbol(symbol, stock) {
    if (/:/.test(symbol)) return symbol; // déjà suffixé
    
    const ex = (stock.exchange || '').toLowerCase();
    const country = (stock.country || '').toLowerCase();
    
    // Mapping par nom d'exchange
    const byExchange = {
        'euronext amsterdam': 'XAMS',
        'xetra': 'XETR',
        'six swiss exchange': 'XSWX',
        'london stock exchange': 'XLON',
        'euronext paris': 'XPAR',
        'euronext brussels': 'XBRU',
        'euronext milan': 'XMIL',
        'euronext lisbon': 'XLIS',
        'nasdaq stockholm': 'XSTO',
        'nasdaq copenhagen': 'XCSE',
        'nasdaq helsinki': 'XHEL',
        'madrid stock exchange': 'XMAD'
    };
    
    for (const k in byExchange) {
        if (ex.includes(k)) return `${symbol}:${byExchange[k]}`;
    }
    
    // Mapping par pays
    const byCountry = {
        'pays-bas': 'XAMS', 'netherlands': 'XAMS',
        'allemagne': 'XETR', 'germany': 'XETR',
        'suisse': 'XSWX', 'switzerland': 'XSWX',
        'royaume-uni': 'XLON', 'united kingdom': 'XLON', 'uk': 'XLON',
        'france': 'XPAR',
        'belgique': 'XBRU', 'belgium': 'XBRU',
        'italie': 'XMIL', 'italy': 'XMIL',
        'portugal': 'XLIS',
        'espagne': 'XMAD', 'spain': 'XMAD',
        'suède': 'XSTO', 'sweden': 'XSTO',
        'danemark': 'XCSE', 'denmark': 'XCSE',
        'finlande': 'XHEL', 'finland': 'XHEL',
        'taiwan': 'XTAI', 'taïwan': 'XTAI',
        'hong kong': 'XHKG',
        'singapore': 'XSES',
        'japan': 'XTKS', 'japon': 'XTKS',
        'south korea': 'XKRX', 'corée': 'XKRX',
        'india': 'XBOM', 'inde': 'XBOM'
    };
    
    for (const k in byCountry) {
        if (country.includes(k)) return `${symbol}:${byCountry[k]}`;
    }
    
    return symbol; // fallback sans suffixe
}

// Smart resolver avec fallback
async function resolveSymbolSmart(symbol, stock) {
    // Helper pour tester un symbole
    const trySymbol = async (sym) => {
        try {
            const { data } = await axios.get('https://api.twelvedata.com/quote', {
                params: { symbol: sym, apikey: CONFIG.API_KEY }
            });
            if (data && data.status !== 'error') return sym;
        } catch {}
        return null;
    };
    
    // 1) Essai local: SYM:MIC
    const local = resolveSymbol(symbol, stock);
    let ok = await trySymbol(local);
    if (ok) return ok;
    
    // 2) SYM brut (sans suffixe)
    ok = await trySymbol(symbol);
    if (ok) return ok;
    
    // 3) Recherche via /stocks pour trouver la forme supportée
    try {
        const { data } = await axios.get('https://api.twelvedata.com/stocks', {
            params: {
                symbol,
                exchange: (stock.exchange || '').split(' ')[0]
            }
        });
        const arr = data?.data || data;
        const first = Array.isArray(arr) ? arr.find(s => (s.symbol || '').toUpperCase().startsWith(symbol.toUpperCase())) : null;
        if (first?.symbol && first?.exchange) {
            const guess = `${first.symbol}:${first.exchange}`;
            ok = await trySymbol(guess);
            if (ok) return ok;
        }
    } catch {}
    
    return null; // rien trouvé
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
        const resolved = typeof stock === 'string' ? symbol : resolveSymbol(symbol, stock);
        const { data } = await axios.get('https://api.twelvedata.com/quote', {
            params: { 
                symbol: resolved, 
                apikey: CONFIG.API_KEY 
            }
        });
        
        if (CONFIG.DEBUG) console.log('[QUOTE]', resolved, data?.status || 'ok');
        if (data.status === 'error') {
            if (CONFIG.DEBUG) console.error('[QUOTE ERR]', resolved, data?.message);
            return null;
        }
        
        return {
            price: parseNumberLoose(data.close) || 0,
            change: parseNumberLoose(data.change) || 0,
            percent_change: parseNumberLoose(data.percent_change) || 0,
            volume: parseNumberLoose(data.volume) || 0,
            fifty_two_week: {
                high: parseNumberLoose(data.fifty_two_week?.high) || null,
                low: parseNumberLoose(data.fifty_two_week?.low) || null,
                range: data.fifty_two_week?.range || null
            }
        };
    } catch (error) {
        if (CONFIG.DEBUG) console.error('[QUOTE EXCEPTION]', symbol, error.message);
        return null;
    }
}

async function getPerformanceData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.TIME_SERIES);
        const resolved = typeof stock === 'string' ? symbol : resolveSymbol(symbol, stock);
        
        const { data } = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol: resolved,
                interval: '1day',
                outputsize: 900,
                order: 'ASC',
                apikey: CONFIG.API_KEY
            }
        });
        
        if (CONFIG.DEBUG) console.log('[TIME_SERIES]', resolved, data?.status || 'ok');
        if (!data.values || data.status === 'error') {
            if (CONFIG.DEBUG) console.error('[TIME_SERIES ERR]', resolved, data?.message);
            return {};
        }
        
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
            distance_52w_low: low52 ? ((current - low52) / current * 100).toFixed(2) : null,
            // Expose pour fallback
            __last_close: current,
            __prev_close: prev,
            __hi52: high52,
            __lo52: low52
        };
    } catch (error) {
        if (CONFIG.DEBUG) console.error('[TIME_SERIES EXCEPTION]', symbol, error.message);
        return {};
    }
}

async function getDividendData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.DIVIDENDS);
        const resolved = typeof stock === 'string' ? symbol : resolveSymbol(symbol, stock);
        
        const todayISO = new Date().toISOString().slice(0, 10);
        const threeY = new Date();
        threeY.setFullYear(threeY.getFullYear() - 3);
        
        const { data } = await axios.get('https://api.twelvedata.com/dividends', {
            params: {
                symbol: resolved,
                start_date: threeY.toISOString().slice(0, 10),
                end_date: todayISO,
                apikey: CONFIG.API_KEY
            }
        });
        
        if (CONFIG.DEBUG) console.log('[DIVIDENDS]', resolved, data?.status || 'ok');
        if (data?.status === 'error') {
            if (CONFIG.DEBUG) console.error('[DIVIDENDS ERR]', resolved, data?.message);
            return {};
        }
        
        const arr = Array.isArray(data) ? data : (data.values || data.data || data.dividends || []);
        const dividends = arr.map(d => ({
            ex_date: d.ex_date || d.date,
            amount: parseNumberLoose(d.amount) || 0,
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
            dividend_yield_ttm: parseNumberLoose(data.meta?.dividend_yield) || null,
            dividends_history: dividends.slice(0, 10),
            avg_dividend_per_year: avgPerYear.toFixed(2),
            total_dividends_ttm: total.toFixed(2)
        };
    } catch (error) {
        if (CONFIG.DEBUG) console.error('[DIVIDENDS EXCEPTION]', symbol, error.message);
        return {};
    }
}

async function getStatisticsData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        const resolved = typeof stock === 'string' ? symbol : resolveSymbol(symbol, stock);
        
        const { data } = await axios.get('https://api.twelvedata.com/statistics', {
            params: { 
                symbol: resolved, 
                apikey: CONFIG.API_KEY 
            }
        });
        
        if (CONFIG.DEBUG) console.log('[STATISTICS]', resolved, data?.status || 'ok');
        if (data.status === 'error') {
            if (CONFIG.DEBUG) console.error('[STATISTICS ERR]', resolved, data?.message);
            return {};
        }
        
        const root = data?.statistics || data || {};
        const mc = parseNumberLoose(
            root.market_cap ??
            root.market_capitalization ??
            root?.financials?.market_capitalization ??
            root?.overview?.market_cap
        );
        const pe = parseNumberLoose(root.pe_ratio ?? root?.valuations_metrics?.pe_ratio);
        const so = parseNumberLoose(
            root.shares_outstanding ??
            root?.overview?.shares_outstanding ??
            root?.financials?.shares_outstanding
        );
        
        return {
            market_cap: Number.isFinite(mc) ? mc : null,
            pe_ratio: Number.isFinite(pe) ? pe : null,
            beta: parseNumberLoose(root.beta ?? root?.risk_metrics?.beta) || null,
            shares_outstanding: Number.isFinite(so) ? so : null
        };
    } catch (error) {
        if (CONFIG.DEBUG) console.error('[STATISTICS EXCEPTION]', symbol, error.message);
        return {};
    }
}

// Nouveau endpoint dédié pour market_cap - FIX pour gérer format série
async function getMarketCapDirect(symbolOrResolved, stock) {
    try {
        await pay(CONFIG.CREDITS.MARKET_CAP);
        const sym = /:/.test(symbolOrResolved) ? symbolOrResolved : resolveSymbol(symbolOrResolved, stock);
        const { data } = await axios.get('https://api.twelvedata.com/market_cap', {
            params: { symbol: sym, apikey: CONFIG.API_KEY }
        });
        
        if (CONFIG.DEBUG) console.log('[MARKET_CAP]', sym, data?.status || 'ok');
        if (data?.status === 'error') {
            if (CONFIG.DEBUG) console.error('[MARKET_CAP ERR]', sym, data?.message);
            return null;
        }
        
        // Debug pour voir le format exact
        if (CONFIG.DEBUG && data) {
            console.log('[MARKET_CAP RAW]', JSON.stringify(data).slice(0, 300) + '...');
        }
        
        // 1) Format "série": { market_cap: [{date, value}, ...] }
        const series = Array.isArray(data?.market_cap) ? data.market_cap
                     : Array.isArray(data?.values)     ? data.values
                     : Array.isArray(data?.data)       ? data.data
                     : null;
        
        if (series && series.length) {
            // On choisit la plus récente par date
            const sorted = series.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
            const last = sorted.at(-1);
            const mc = parseNumberLoose(last?.value ?? last?.market_cap ?? last?.close);
            return Number.isFinite(mc) ? mc : null;
        }
        
        // 2) Format "valeur simple": { market_cap: "..." } ou { value: "..." }
        const raw = data?.market_cap ?? data?.value;
        const mc = parseNumberLoose(raw);
        return Number.isFinite(mc) ? mc : null;
    } catch (e) {
        if (CONFIG.DEBUG) console.error('[MARKET_CAP EXC]', symbolOrResolved, e.message);
        return null;
    }
}

async function enrichStock(stock) {
    console.log(`  📊 ${stock.symbol}...`);
    
    // Résolution robuste une fois pour toutes
    const resolved = await resolveSymbolSmart(stock.symbol, stock);
    if (CONFIG.DEBUG) console.log('[RESOLVED]', stock.symbol, '→', resolved || '(none)');
    
    // On calcule tout en parallèle
    const [perf, quote, dividends, stats, mcDirect] = await Promise.all([
        getPerformanceData(resolved || stock.symbol, resolved ? 'resolved' : stock),
        resolved ? getQuoteData(resolved, 'resolved') : getQuoteData(stock.symbol, stock),
        getDividendData(resolved || stock.symbol, resolved ? 'resolved' : stock),
        getStatisticsData(resolved || stock.symbol, resolved ? 'resolved' : stock),
        getMarketCapDirect(resolved || stock.symbol, resolved ? 'resolved' : stock)
    ]);
    
    // Fallback prix & range depuis la série si quote indisponible
    let price = quote?.price ?? null;
    let change_percent = quote?.percent_change ?? null;
    let range_52w = quote?.fifty_two_week?.range ?? null;
    
    // Si pas de quote, mais time_series OK
    if (!quote && perf && perf.volatility_3y) {
        const p = perf.__last_close;
        const prev = perf.__prev_close;
        price = p ?? null;
        change_percent = (p && prev) ? ((p - prev) / prev * 100) : null;
        if (!range_52w && perf.__hi52 && perf.__lo52) {
            range_52w = `${Number(perf.__lo52).toFixed(6)} - ${Number(perf.__hi52).toFixed(6)}`;
        }
    }
    
    if (!price) {
        // Vraiment rien → on retourne l'erreur
        return { ...stock, error: 'NO_DATA' };
    }
    
    // Market cap avec priorités
    const market_cap = 
        (typeof mcDirect === 'number' ? mcDirect : null) ??
        (typeof stats.market_cap === 'number' ? stats.market_cap : null) ??
        // Dernier recours : SO * prix
        ((typeof stats.shares_outstanding === 'number' && typeof price === 'number')
            ? stats.shares_outstanding * price
            : null);
    
    return {
        ticker: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        country: stock.country,
        exchange: stock.exchange, // Ajout de l'exchange
        
        price,
        change_percent: (typeof change_percent === 'number') ? Number(change_percent.toFixed(2)) : null,
        volume: quote?.volume ?? null,
        market_cap,
        range_52w,
        
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

// ---------- TOPS HELPERS ----------
function cmpCore(a, b, field, dir){
  const s = dir === 'asc' ? 1 : -1;
  const av = a[field], bv = b[field];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  const d = (av - bv) * s;
  if (d) return d;

  const d52a = a.distance_52w_high == null ? Infinity : Math.abs(a.distance_52w_high);
  const d52b = b.distance_52w_high == null ? Infinity : Math.abs(b.distance_52w_high);
  if (d52a !== d52b) return d52a - d52b;

  const mca = a.market_cap == null ? -Infinity : a.market_cap;
  const mcb = b.market_cap == null ? -Infinity : b.market_cap;
  return mcb - mca;
}

// Top N générique (direction: 'desc' = hausses, 'asc' = baisses)
function getTopN(stocks, { field, direction='desc', n=10 }={}){
  return (stocks||[])
    .filter(s => !s.error)
    .sort((a,b) => cmpCore(a,b,field,direction))
    .slice(0, n);
}

function buildOverview(byRegion){
  const pick = s => ({
    ticker: s.ticker, name: s.name, sector: s.sector, country: s.country,
    price: s.price, market_cap: s.market_cap,
    change_percent: s.change_percent == null ? null : Number(s.change_percent),
    perf_ytd: s.perf_ytd == null ? null : Number(s.perf_ytd),
  });

  const sets = {
    US: byRegion.US || [],
    EUROPE: byRegion.EUROPE || [],
    ASIA: byRegion.ASIA || [],
  };
  sets.GLOBAL       = [...sets.US, ...sets.EUROPE, ...sets.ASIA];
  sets.US_EUROPE    = [...sets.US, ...sets.EUROPE];
  sets.US_ASIA      = [...sets.US, ...sets.ASIA];
  sets.EUROPE_ASIA  = [...sets.EUROPE, ...sets.ASIA];

  const out = { generated_at: new Date().toISOString(), sets: {} };

  for (const key of Object.keys(sets)) {
    const arr = sets[key];
    out.sets[key] = {
      day: {
        up:   getTopN(arr, { field: 'change_percent', direction: 'desc', n: 10 }).map(pick),
        down: getTopN(arr, { field: 'change_percent', direction: 'asc',  n: 10 }).map(pick),
      },
      ytd: {
        up:   getTopN(arr, { field: 'perf_ytd',      direction: 'desc', n: 10 }).map(pick),
        down: getTopN(arr, { field: 'perf_ytd',      direction: 'asc',  n: 10 }).map(pick),
      }
    };
  }
  return out;
}

async function main() { 
    console.log('📊 Enrichissement complet des stocks\n');
    await fs.mkdir(OUT_DIR, { recursive: true });
    
    const [usStocks, europeStocks, asiaStocks] = await Promise.all([
        loadStockCSV('data/filtered/Actions_US_filtered.csv'),
        loadStockCSV('data/filtered/Actions_Europe_filtered.csv'),
        loadStockCSV('data/filtered/Actions_Asie_filtered.csv')
    ]);
    
    console.log(`Stocks: US ${usStocks.length} | Europe ${europeStocks.length} | Asie ${asiaStocks.length}\n`);
    
    const regions = [
        { name: 'us', stocks: usStocks },
        { name: 'europe', stocks: europeStocks },
        { name: 'asia', stocks: asiaStocks }
    ];
    
    const byRegion = {}; // Ajout pour stocker les données par région
    
    for (const region of regions) {
        console.log(`\n🌍 ${region.name.toUpperCase()}`);
        const enrichedStocks = [];
        
        for (let i = 0; i < region.stocks.length; i += CONFIG.CHUNK_SIZE) {
            const batch = region.stocks.slice(i, i + CONFIG.CHUNK_SIZE);
            const enrichedBatch = await Promise.all(batch.map(enrichStock));
            enrichedStocks.push(...enrichedBatch);
        }
        
        byRegion[region.name.toUpperCase()] = enrichedStocks; // Enregistrement dans la map
        
        const filepath = path.join(OUT_DIR, `stocks_${region.name}.json`);
        await fs.writeFile(filepath, JSON.stringify({
            region: region.name.toUpperCase(),
            timestamp: new Date().toISOString(),
            stocks: enrichedStocks
        }, null, 2));
        
        console.log(`✅ ${filepath}`);
    }
    
    // --------- TOPS OVERVIEW ----------
    const overview = buildOverview(byRegion);
    const topsPath = path.join(OUT_DIR, 'tops_overview.json');
    await fs.writeFile(topsPath, JSON.stringify(overview, null, 2));
    console.log(`🏁 ${topsPath}`);
}

if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

main().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
