// stock-advanced-filter.js
// Version 3.8 - Amélioration de la lecture des champs API et multi-source pour EPS/Payout
// Corrections appliquées : 
// - YTD sans toISOString() pour éviter bug UTC
// - Fallback dividende TTM/price si meta absente
// - Logs DEBUG enrichis pour YTD
// - Formules 52w conventionnelles
// - Métadonnées marché pour tracer source exacte (exchange, devise, MIC)
// - Payout ratio TTM calculé depuis P/E et DPS
// - NOUVEAU v3.8: Helper pickNumDeep pour lecture robuste des champs profonds
// - NOUVEAU v3.8: Lecture améliorée des champs statistics (trailing_pe, eps_ttm, etc.)
// - NOUVEAU v3.8: Normalisation GBX → GBP pour London Stock Exchange
// - NOUVEAU v3.8: Multi-source pour EPS et payout (API direct, DPS/EPS, yield×P/E)

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

// NOUVEAU v3.8: Lecture robuste de nombres dans des chemins profonds
function pickNumDeep(obj, paths) {
    for (const p of paths) {
        const v = p.split('.').reduce((o,k)=>o?.[k], obj);
        const n = parseNumberLoose(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
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
        
        const out = {
            price: parseNumberLoose(data.close) || 0,
            change: parseNumberLoose(data.change) || 0,
            percent_change: parseNumberLoose(data.percent_change) || 0,
            volume: parseNumberLoose(data.volume) || 0,
            fifty_two_week: {
                high: parseNumberLoose(data.fifty_two_week?.high) || null,
                low: parseNumberLoose(data.fifty_two_week?.low) || null,
                range: data.fifty_two_week?.range || null
            },
            _meta: {
                symbol_used: resolved,                 // ex: "ASML:XAMS"
                exchange: data.exchange ?? null,       // ex: "London Stock Exchange"
                mic_code: data.mic_code ?? null,       // ex: "XLON"
                currency: data.currency ?? null        // ex: "USD", "EUR", "GBX"...
            }
        };
        
        if (CONFIG.DEBUG) {
            console.log(`[SOURCE] ${symbol} -> ${out._meta.symbol_used} | ${out._meta.exchange} (${out._meta.mic_code}) | ${out._meta.currency}`);
        }
        
        return out;
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
                adjusted: true,  // Ajout pour éviter les problèmes de split
                apikey: CONFIG.API_KEY
            }
        });
        
        if (CONFIG.DEBUG) console.log('[TIME_SERIES]', resolved, data?.status || 'ok');
        if (!data.values || data.status === 'error') {
            if (CONFIG.DEBUG) console.error('[TIME_SERIES ERR]', resolved, data?.message);
            return {};
        }
        
        const meta = data?.meta || {};
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
        
        // YTD - FIX: éviter toISOString() qui cause des bugs UTC
        const yearStart = `${new Date().getFullYear()}-01-01`;
        const ytdIdx = prices.findIndex(p => p.date >= yearStart);
        const ytdBar = ytdIdx !== -1 ? prices[ytdIdx] : null;
        
        // Logs DEBUG enrichis pour YTD
        if (CONFIG.DEBUG) {
            const prev = ytdIdx > 0 ? prices[ytdIdx - 1] : null;
            console.log(
                `[YTD] ${resolved} | yearStart=${yearStart} | basis=${ytdBar?.date ?? 'N/A'} close=${ytdBar?.close ?? 'N/A'} | ` +
                `prev=${prev?.date ?? 'N/A'} closePrev=${prev?.close ?? 'N/A'} | current=${current}`
            );
            if (ytdBar && ytdBar.date.endsWith('12-31')) {
                console.warn(`[YTD WARN] ${resolved} basis is 12-31 (UTC drift suspected).`);
            }
        }
        
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
            // FIX: formules conventionnelles avec high52/low52 au dénominateur
            distance_52w_high: high52 ? ((current - high52) / high52 * 100).toFixed(2) : null,
            distance_52w_low: low52 ? ((current - low52) / low52 * 100).toFixed(2) : null,
            // Métadonnées YTD pour debugging
            ytd_meta: { 
                year_start: yearStart, 
                basis_date: ytdBar?.date ?? null, 
                basis_close: ytdBar?.close ?? null 
            },
            // Métadonnées de série
            _series_meta: {
                symbol_used: resolved,
                exchange: meta.exchange ?? null,
                currency: meta.currency ?? null,
                timezone: meta.exchange_timezone ?? meta.timezone ?? null
            },
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
        
        // FIX: garder les nombres, pas des strings - on formatera dans enrichStock
        const totalTTM = lastYear.reduce((sum, d) => sum + d.amount, 0);
        const years = new Set(dividends.map(d => new Date(d.ex_date).getFullYear())).size;
        const avgPerYear = years > 0 ? dividends.reduce((sum, d) => sum + d.amount, 0) / years : 0;
        
        // NOUVEAU: Calcul de la croissance des dividendes
        const dividendGrowth = calculateDividendGrowth(dividends);
        
        return {
            dividend_yield_ttm: parseNumberLoose(data.meta?.dividend_yield) ?? null,
            dividends_history: dividends.sort((a,b) => b.ex_date.localeCompare(a.ex_date)).slice(0, 10),
            avg_dividend_per_year: avgPerYear,    // nombre
            total_dividends_ttm: totalTTM,        // nombre
            dividend_growth_3y: dividendGrowth    // NOUVEAU
        };
    } catch (error) {
        if (CONFIG.DEBUG) console.error('[DIVIDENDS EXCEPTION]', symbol, error.message);
        return {};
    }
}

// NOUVELLE FONCTION: Calcul de la croissance des dividendes
function calculateDividendGrowth(history) {
    if (!history || history.length < 2) return null;
    
    // Grouper par année
    const byYear = {};
    history.forEach(d => {
        const year = new Date(d.ex_date).getFullYear();
        byYear[year] = (byYear[year] || 0) + d.amount;
    });
    
    const years = Object.keys(byYear).sort();
    if (years.length < 2) return null;
    
    // CAGR sur la période disponible (max 3 ans)
    const recentYears = years.slice(-4); // Prendre les 4 dernières années max
    if (recentYears.length < 2) return null;
    
    const first = byYear[recentYears[0]];
    const last = byYear[recentYears[recentYears.length - 1]];
    const n = recentYears.length - 1;
    
    if (first <= 0) return null;
    const cagr = (Math.pow(last / first, 1 / n) - 1) * 100;
    
    return Number(cagr.toFixed(2));
}

// NOUVEAU v3.8: Version améliorée qui lit les bons champs de l'API
async function getStatisticsData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        const resolved = typeof stock === 'string' ? symbol : resolveSymbol(symbol, stock);

        const { data } = await axios.get('https://api.twelvedata.com/statistics', {
            params: { 
                symbol: resolved, 
                apikey: CONFIG.API_KEY,
                dp: 6                         // plus de décimales (optionnel)
            }
        });

        if (CONFIG.DEBUG) console.log('[STATISTICS]', resolved, data?.status || 'ok');
        if (data?.status === 'error') {
            if (CONFIG.DEBUG) console.error('[STATISTICS ERR]', resolved, data?.message);
            return {};
        }

        const root = data?.statistics || data || {};

        // Market cap (plusieurs chemins possibles)
        const market_cap = pickNumDeep(root, [
            'valuations_metrics.market_capitalization',
            'market_capitalization',
            'financials.market_capitalization',
            'overview.market_cap'
        ]);

        // P/E trailing (priorité au trailing_pe renvoyé par TwelveData)
        const pe_ratio = pickNumDeep(root, [
            'valuations_metrics.trailing_pe',
            'valuations_metrics.pe_ratio',
            'overview.pe_ratio',
            'pe_ratio',
            'pe'
        ]);

        // EPS TTM
        const eps_ttm = pickNumDeep(root, [
            'financials.income_statement.diluted_eps_ttm',
            'financials.income_statement.eps_ttm',
            'overview.eps',
            'earnings_per_share',
            'eps'
        ]);

        // Payout & Dividend yield renvoyés en fraction (0–1)
        const payout_frac = pickNumDeep(root, [
            'dividends_and_splits.payout_ratio'
        ]);
        const yield_frac = pickNumDeep(root, [
            'dividends_and_splits.trailing_annual_dividend_yield',
            'dividends_and_splits.forward_annual_dividend_yield'
        ]);

        // Beta / Shares outstanding
        const beta = pickNumDeep(root, ['stock_price_summary.beta','beta']);
        const shares_outstanding = pickNumDeep(root, [
            'stock_statistics.shares_outstanding',
            'overview.shares_outstanding',
            'financials.shares_outstanding'
        ]);

        return {
            market_cap: Number.isFinite(market_cap) ? market_cap : null,
            pe_ratio: Number.isFinite(pe_ratio) ? pe_ratio : null,
            eps_ttm: Number.isFinite(eps_ttm) ? eps_ttm : null,
            payout_ratio_api_pct: Number.isFinite(payout_frac) ? payout_frac * 100 : null,   // %
            dividend_yield_api_pct: Number.isFinite(yield_frac) ? yield_frac * 100 : null,  // %
            beta: Number.isFinite(beta) ? beta : null,
            shares_outstanding: Number.isFinite(shares_outstanding) ? shares_outstanding : null
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
    
    // NOUVEAU v3.8: Normalisation LSE (GBX → GBP) pour la cohérence des ratios basés sur le prix
    const usedCurrency = quote?._meta?.currency ?? perf?._series_meta?.currency ?? null;
    if (usedCurrency === 'GBX' && Number.isFinite(price)) {
        price = price / 100; // 7450 GBX -> 74.50 GBP
        if (CONFIG.DEBUG) console.log(`[GBX→GBP] ${stock.symbol}: price converted from GBX to GBP`);
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
    
    // NOUVEAU v3.8: Amélioration du calcul du dividend_yield avec priorité à l'API
    const dividendYield =
        Number.isFinite(stats?.dividend_yield_api_pct) ? Number(stats.dividend_yield_api_pct.toFixed(2)) :
        (dividends?.total_dividends_ttm && price)      ? Number((dividends.total_dividends_ttm / price * 100).toFixed(2)) :
        (dividends?.dividend_yield_ttm ?? null);
    
    // =======================
    // NOUVEAU v3.8: EPS & Payout (multi-source)
    // =======================
    const dps_ttm = (typeof dividends?.total_dividends_ttm === 'number') ? dividends.total_dividends_ttm : null;

    // 1) EPS : prends stats.eps_ttm si dispo, sinon fallback via P/E
    let eps_ttm = Number.isFinite(stats?.eps_ttm) ? stats.eps_ttm : null;
    if (!Number.isFinite(eps_ttm) && Number.isFinite(stats?.pe_ratio) && stats.pe_ratio > 0 && Number.isFinite(price) && price > 0) {
        eps_ttm = price / stats.pe_ratio;
    }

    // 2) Payout ratio : priorité à l'API (déjà en %), sinon DPS/EPS, sinon approx yield% * P/E
    let payout_ratio_ttm = null;
    if (Number.isFinite(stats?.payout_ratio_api_pct)) {
        payout_ratio_ttm = stats.payout_ratio_api_pct;
    } else if (Number.isFinite(dps_ttm) && Number.isFinite(eps_ttm) && dps_ttm > 0 && eps_ttm > 0) {
        payout_ratio_ttm = (dps_ttm / eps_ttm) * 100;
    } else if (Number.isFinite(stats?.dividend_yield_api_pct) && Number.isFinite(stats?.pe_ratio)) {
        // Identité: payout% ≈ dividend_yield% × P/E (si pas d'EPS/DPS)
        payout_ratio_ttm = stats.dividend_yield_api_pct * stats.pe_ratio;
    }

    // Nettoyage & bornage
    if (Number.isFinite(payout_ratio_ttm)) {
        payout_ratio_ttm = Math.min(200, Number(payout_ratio_ttm.toFixed(1)));
    }

    // 3) Statut & couverture
    let payout_status = null;
    let dividend_coverage = null;
    if (Number.isFinite(payout_ratio_ttm)) {
        payout_status =
            payout_ratio_ttm < 30  ? 'conservative' :
            payout_ratio_ttm < 60  ? 'moderate'     :
            payout_ratio_ttm < 80  ? 'high'         :
            payout_ratio_ttm < 100 ? 'very_high'    : 'unsustainable';

        if (Number.isFinite(eps_ttm) && Number.isFinite(dps_ttm) && dps_ttm > 0) {
            dividend_coverage = Number((eps_ttm / dps_ttm).toFixed(2));
        }
    }
    
    // Logs DEBUG pour le payout ratio
    if (CONFIG.DEBUG && (dps_ttm !== null || eps_ttm !== null)) {
        console.log(
            `[PAYOUT] ${stock.symbol}: DPS=${dps_ttm?.toFixed(4) || 'N/A'}, EPS=${eps_ttm?.toFixed(4) || 'N/A'}, ` +
            `P/E=${stats?.pe_ratio || 'N/A'}, Payout=${payout_ratio_ttm || 'N/A'}% (${payout_status || 'N/A'}), ` +
            `Source: ${stats?.payout_ratio_api_pct ? 'API' : eps_ttm ? 'DPS/EPS' : 'yield×P/E'}`
        );
    }
    
    // Métadonnées de marché
    const usedEx =  quote?._meta?.exchange ?? perf?._series_meta?.exchange ?? null;
    const usedMic = quote?._meta?.mic_code ?? null;
    const usedCur = quote?._meta?.currency ?? perf?._series_meta?.currency ?? null;
    const usedTz  = perf?._series_meta?.timezone ?? null;
    const symUsed = quote?._meta?.symbol_used || perf?._series_meta?.symbol_used || (resolved || stock.symbol);
    
    if (CONFIG.DEBUG) {
        console.log(`[DATA CTX] ${stock.symbol} -> ${symUsed} | ${usedEx} (${usedMic}) | ${usedCur} | ${usedTz || 'tz?'}`);
    }
    
    // Logs DEBUG pour métadonnées YTD
    if (CONFIG.DEBUG && perf?.ytd_meta) {
        console.log(
            `[YTD META] ${stock.symbol} → start=${perf.ytd_meta.year_start} ` +
            `basis=${perf.ytd_meta.basis_date} close=${perf.ytd_meta.basis_close}`
        );
    }
    
    return {
        ticker: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        country: stock.country,
        exchange: stock.exchange, // Exchange du CSV (intention)
        
        // Métadonnées source réelle
        resolved_symbol: symUsed,
        data_exchange: usedEx,
        data_mic: usedMic,
        data_currency: usedCur,
        data_timezone: usedTz,
        
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
        
        // Métriques de dividendes enrichies
        dividend_yield: dividendYield,
        dividends_history: dividends?.dividends_history || [],
        avg_dividend_year: Number(dividends?.avg_dividend_per_year?.toFixed?.(2) ?? dividends?.avg_dividend_per_year ?? null),
        total_dividends_ttm: dps_ttm,              
        dividend_growth_3y: dividends?.dividend_growth_3y || null,  
        
        // MÉTRIQUES PAYOUT (v3.8 multi-source)
        payout_ratio_ttm,                          
        payout_status,                             
        dividend_coverage,                         
        
        // Métriques de valorisation
        eps_ttm,                                   
        pe_ratio: stats?.pe_ratio || null,        
        
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
    // FIX: éviter toISOString() ici aussi
    const yearStart = `${new Date().getFullYear()}-01-01`;
    
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
    // NOUVEAU: Ajout des métriques de dividendes dans les tops
    dividend_yield: s.dividend_yield == null ? null : Number(s.dividend_yield),
    payout_ratio_ttm: s.payout_ratio_ttm == null ? null : Number(s.payout_ratio_ttm),
    payout_status: s.payout_status || null,
    pe_ratio: s.pe_ratio == null ? null : Number(s.pe_ratio),
    eps_ttm: s.eps_ttm == null ? null : Number(s.eps_ttm)
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
      },
      // NOUVEAU: Top dividendes
      dividends: {
        highest_yield: getTopN(arr, { field: 'dividend_yield', direction: 'desc', n: 10 }).map(pick),
        best_payout: arr.filter(s => s.payout_ratio_ttm > 0 && s.payout_ratio_ttm < 80)
                       .sort((a,b) => (b.dividend_yield || 0) - (a.dividend_yield || 0))
                       .slice(0, 10)
                       .map(pick)
      }
    };
  }
  return out;
}

async function main() { 
    console.log('📊 Enrichissement complet des stocks (v3.8 avec multi-source EPS/Payout)\n');
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
    
    // NOUVEAU: Statistiques sur les payout ratios
    const allStocks = [...byRegion.US, ...byRegion.EUROPE, ...byRegion.ASIA];
    const withPayout = allStocks.filter(s => s.payout_ratio_ttm !== null);
    const withEPS = allStocks.filter(s => s.eps_ttm !== null);
    const withPE = allStocks.filter(s => s.pe_ratio !== null);
    
    console.log('\n📊 Statistiques des métriques:');
    console.log(`  - Actions avec P/E ratio: ${withPE.length}/${allStocks.length}`);
    console.log(`  - Actions avec EPS TTM: ${withEPS.length}/${allStocks.length}`);
    console.log(`  - Actions avec payout ratio: ${withPayout.length}/${allStocks.length}`);
    
    if (withPayout.length > 0) {
        console.log('\n📊 Distribution Payout Ratio:');
        console.log(`  - Conservative (<30%): ${withPayout.filter(s => s.payout_status === 'conservative').length}`);
        console.log(`  - Modéré (30-60%): ${withPayout.filter(s => s.payout_status === 'moderate').length}`);
        console.log(`  - Élevé (60-80%): ${withPayout.filter(s => s.payout_status === 'high').length}`);
        console.log(`  - Très élevé (80-100%): ${withPayout.filter(s => s.payout_status === 'very_high').length}`);
        console.log(`  - Non soutenable (>100%): ${withPayout.filter(s => s.payout_status === 'unsustainable').length}`);
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
