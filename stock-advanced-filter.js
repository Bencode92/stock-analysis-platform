// stock-advanced-filter.js
// Version 3.27.1 - Fix STATISTICS cost 50, 429 retry, D/E path fix
// Changements v3.27.1:
// - STATISTICS credit cost: 25 → 50 (doc Twelve Data: 50/symbole)
// - fetchTD: retry explicite sur 429 (HTTP + body code) avec backoff 1.2s
// - D/E extraction: ajout chemin total_debt_to_equity_mrq (doc officielle)
// - Log headers api-credits-used/left en DEBUG
// Changements v3.27:
// - REBASE sur v3.23 (tdParamTrials simple, 4 trials max non-US) qui fonctionnait
// - CREDIT_LIMIT 800 → 2584 (limite réelle du plan)
// - Skip resolveSymbolSmart pour non-US avec MIC connu (résolution déterministe)
// - Extraction ROE/D-E/ROIC depuis /statistics API avec fallback CSV→API (v3.26)
// - Score Buffett calculé avec données API quand CSV incomplet
// Changements v3.23:
// - Ajout fcf_ttm dans getStatisticsData() depuis financials.cash_flow
// - Nouvelle fonction getGrowthEstimates() pour EPS Growth 5Y via /growth_estimates
// - Calcul fcf_yield = (fcf_ttm / market_cap) * 100 dans enrichStock()
// - Ajout eps_growth_5y dans l'objet retourné
// - Mise à jour buildOverview() pour inclure fcf_yield et eps_growth_5y
// Changements v3.22:
// - loadStockCSV() lit maintenant les colonnes roe et de_ratio du CSV
// - Ajout calculateBuffettScore() : scoring simplifié (ROE 25pts + D/E 20pts)
// - Ajout getBuffettGrade() : grades A/B/C/D selon score
// - enrichStock() retourne roe, de_ratio, buffett_score, buffett_grade
// - buildOverview() inclut les métriques Buffett dans les tops

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';
const KEEP_ADR = process.env.KEEP_ADR === '1';

const REGIONS_INPUT = (process.env.REGIONS || 'all').toLowerCase().trim();
const parseRegions = (input) => {
    const map = {
        'all':         { us: true, europe: true, asia: true },
        'us':          { us: true, europe: false, asia: false },
        'europe':      { us: false, europe: true, asia: false },
        'asia':        { us: false, europe: false, asia: true },
        'us-europe':   { us: true, europe: true, asia: false },
        'us-asia':     { us: true, europe: false, asia: true },
        'europe-asia': { us: false, europe: true, asia: true },
    };
    return map[input] || map['all'];
};
const SELECTED_REGIONS = parseRegions(REGIONS_INPUT);

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    CHUNK_SIZE: 5,
    CREDIT_LIMIT: 2584,
    CREDITS: {
        QUOTE: 1,
        TIME_SERIES: 5,
        STATISTICS: 50,      // ✅ v3.27.1: doc Twelve Data = 50 crédits/symbole
        DIVIDENDS: 10,
        MARKET_CAP: 1,
        GROWTH_ESTIMATES: 10
    }
};

let creditsUsed = 0;
let windowStart = Date.now();
const successCache = new Map();

const US_MICS = new Set(['XNAS','XNGS','XNYS','BATS','ARCX','IEXG']);
const isUSMic = (mic) => US_MICS.has(mic);

const isUSCountry = (c='') => {
  const s = normalize(c);
  return s === 'united states' || s === 'usa' || s === 'us' ||
         s === 'etats-unis' || s === 'états-unis' || s === 'etats unis';
};

const isADRLike = s => isUS(s.exchange, s.country) && !isUSCountry(s.country);

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

function parseNumberLoose(val) {
    if (val == null) return null;
    if (typeof val === 'number') return Number.isFinite(val) ? val : null;
    let s = String(val).trim();
    if (!s) return null;
    let mult = 1;
    const suf = s.match(/([kmbt])\s*$/i);
    if (suf) {
        const x = suf[1].toLowerCase();
        mult = x === 'k' ? 1e3 : x === 'm' ? 1e6 : x === 'b' ? 1e9 : 1e12;
        s = s.slice(0, -1);
    }
    s = s.replace(/[^\d.,\-]/g, '');
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
        s = s.replace(/\./g, '');
        s = s.replace(',', '.');
    } else {
        s = s.replace(/,/g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n * mult : null;
}

function pickNumDeep(obj, paths) {
    for (const p of paths) {
        const v = p.split('.').reduce((o,k)=>o?.[k], obj);
        const n = parseNumberLoose(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

// ───────── Helpers centralisés pour stratégie d'essais ─────────

const isUS = (ex = '', country = '') => {
  const mic = toMIC(ex, country);
  if (mic) return isUSMic(mic);
  return /\b(NASDAQ|New York Stock Exchange|NYSE(?!\s*Euronext)|NYSE\s*Arca|NYSE\s*American|CBOE|BATS)\b/i
    .test(ex || '');
};

function usExchangeName(ex='') {
    if (/nasdaq/i.test(ex)) return 'NASDAQ';
    if (/new york stock exchange|nyse(?!\s*euronext)/i.test(ex)) return 'NYSE';
    if (/bats|cboe/i.test(ex)) return 'BATS';
    return null;
}

const normalize = s => (s||'').toLowerCase().trim();

function micForRegion(stock) {
    const mic = toMIC(stock.exchange, stock.country);
    if (!isUSCountry(stock.country) && isUSMic(mic)) return null;
    return mic;
}

// ✅ v3.27: REBASE sur tdParamTrials v3.23 (4 trials max pour non-US, pas 8-10)
function tdParamTrials(symbol, stock, resolvedSym=null) {
    let base = symbol, micFromResolved = null;
    if (resolvedSym && resolvedSym.includes(':')) {
        const [b, m] = resolvedSym.split(':');
        base = b; 
        micFromResolved = m;
    }
    const mic = micFromResolved || micForRegion(stock);
    const trials = [];

    if (isUS(stock.exchange, stock.country)) {
        const ex = usExchangeName(stock.exchange);
        if (ex) trials.push({ symbol: base, exchange: ex });
        trials.push({ symbol: base });
        if (mic) trials.push({ symbol: `${base}:${mic}` });
    } else {
        // ✅ v3.23 ORIGINAL: Simple et efficace - 4 trials max
        if (mic) {
            trials.push({ symbol: `${base}:${mic}` });        // PRIORITÉ 1: SYM:MIC
            trials.push({ symbol: base, mic_code: mic });     // PRIORITÉ 2: mic_code=
        }
        trials.push({ symbol: base });                        // fallback
        
        // Variantes exchange= (sans surcharge country/mic combinée)
        const exLabel = normalize(stock.exchange);
        const exVar = [];
        if (/six swiss|^six$/.test(exLabel))                exVar.push('SIX','SIX Swiss Exchange');
        if (/bolsa.*madrid|bme/.test(exLabel) || /espagn/.test(normalize(stock.country)))
                                                            exVar.push('BME','BME Spanish Exchanges','Bolsa De Madrid');
        if (/xetra|deutsche boerse/.test(exLabel))          exVar.push('XETRA','Xetra');
        if (/euronext.*paris/.test(exLabel))                exVar.push('Euronext Paris');
        if (/euronext.*amsterdam/.test(exLabel))            exVar.push('Euronext Amsterdam');
        if (/euronext.*brussels/.test(exLabel))             exVar.push('Euronext Brussels');
        if (/euronext.*milan/.test(exLabel))                exVar.push('Euronext Milan');
        if (/london stock exchange/.test(exLabel))          exVar.push('London Stock Exchange','LSE');
        if (/nasdaq stockholm/.test(exLabel))               exVar.push('NASDAQ Stockholm');
        if (/nasdaq copenhagen/.test(exLabel))              exVar.push('NASDAQ Copenhagen');
        if (/nasdaq helsinki/.test(exLabel))                 exVar.push('NASDAQ Helsinki');
        if (/taiwan/.test(exLabel))                         exVar.push('Taiwan Stock Exchange');
        
        for (const ex of exVar) trials.push({ symbol: base, exchange: ex });
    }
    
    return trials;
}

// ✅ v3.27.1: fetchTD avec retry 429 explicite + log headers crédits
async function fetchTD(endpoint, trials, extraParams = {}) {
    const makeKey = (t) => `${endpoint}:${t.symbol || ''}:${t.exchange || ''}:${t.mic_code || ''}`;
    const CACHE_REORDER_UNSAFE = ['dividends', 'time_series', 'splits'];
    const cacheReorderUnsafe = CACHE_REORDER_UNSAFE.includes(endpoint);

    let cachedParams = successCache.get(makeKey(trials[0]));
    if (cachedParams && !cacheReorderUnsafe) {
        trials = [cachedParams, ...trials.filter(t => makeKey(t) !== makeKey(cachedParams))];
    }

    for (const p of trials) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await axios.get(`https://api.twelvedata.com/${endpoint}`, {
                    params: { ...p, ...extraParams, apikey: CONFIG.API_KEY },
                    timeout: 15000
                });

                const data = res.data;

                // ✅ v3.27.1: Log headers crédits en DEBUG
                const used = res.headers?.['api-credits-used'];
                const left = res.headers?.['api-credits-left'];
                if (CONFIG.DEBUG && (used || left)) {
                    console.log(`[CREDITS] ${endpoint} used=${used ?? '?'} left=${left ?? '?'}`);
                }

                if (data && data.status !== 'error') {
                    successCache.set(makeKey(p), p);
                    if (CONFIG.DEBUG) console.log(`[TD OK ${endpoint}]`, p);
                    return data;
                }

                // ✅ v3.27.1: Détection 429 dans le body (erreur "soft")
                const code = data?.code;
                if (code === 429) {
                    if (CONFIG.DEBUG) console.warn(`[TD 429 BODY ${endpoint}] wait 1200ms`, p, data?.message);
                    await wait(1200);
                    continue;   // retry même trial
                }

                if (CONFIG.DEBUG) console.warn(`[TD FAIL ${endpoint}]`, p, data?.message || data?.status);
                break;  // pas la peine de retry si ce n'est pas 429
            } catch (e) {
                // ✅ v3.27.1: Détection HTTP 429
                const http = e.response?.status;
                if (http === 429) {
                    if (CONFIG.DEBUG) console.warn(`[HTTP 429 ${endpoint}] wait 1200ms`, p);
                    await wait(1200);
                    continue;   // retry même trial
                }
                if (CONFIG.DEBUG && http !== 404) {
                    console.warn(`[TD EXC ${endpoint}]`, p, e.message);
                }
                break;
            }
        }
    }
    return null;
}

// ───────── Exchange → MIC ─────────
const EX2MIC_PATTERNS = [
    ['taiwan stock exchange',           'XTAI'],
    ['gretai securities market',        'ROCO'],
    ['hong kong exchanges and clearing','XHKG'],
    ['shenzhen stock exchange',         'XSHE'],
    ['korea exchange (stock market)',   'XKRX'],
    ['korea exchange (kosdaq)',         'XKOS'],
    ['national stock exchange of india','XNSE'],
    ['stock exchange of thailand',      'XBKK'],
    ['bursa malaysia',                  'XKLS'],
    ['philippine stock exchange',       'XPHS'],
    ['bme spanish exchanges',           'XMAD'],
    ['six',                              'XSWX'],
    ['euronext amsterdam',              'XAMS'],
    ['nyse euronext - euronext paris',  'XPAR'],
    ['nyse euronext - euronext brussels','XBRU'],
    ['nyse euronext - euronext lisbon', 'XLIS'],
    ['xetra',                           'XETR'],
    ['deutsche boerse xetra',           'XETR'],
    ['six swiss exchange',              'XSWX'],
    ['london stock exchange',           'XLON'],
    ['bolsa de madrid',                 'XMAD'],
    ['borsa italiana',                  'XMIL'],
    ['wiener boerse ag',                'XWBO'],
    ['irish stock exchange - all market','XDUB'],
    ['oslo bors asa',                   'XOSL'],
    ['madrid stock exchange',           'XMAD'],
    ['euronext milan',                  'XMIL'],
    ['nasdaq stockholm',                'XSTO'],
    ['nasdaq copenhagen',               'XCSE'],
    ['nasdaq helsinki',                  'XHEL'],
    ['nasdaq',                          'XNAS'],
    ['new york stock exchange inc.',    'XNYS'],
    ['cboe bzx',                        'BATS'],
    ['cboe bzx exchange',               'BATS'],
];

const COUNTRY2MIC = {
    'switzerland':'XSWX', 'suisse':'XSWX',
    'france':'XPAR', 
    'belgium':'XBRU', 'belgique':'XBRU',
    'netherlands':'XAMS', 'pays-bas':'XAMS',
    'portugal':'XLIS',
    'united kingdom':'XLON', 'uk':'XLON', 'royaume-uni':'XLON',
    'germany':'XETR', 'allemagne':'XETR',
    'spain':'XMAD', 'espagne':'XMAD',
    'italy':'XMIL', 'italie':'XMIL',
    'austria':'XWBO', 'norway':'XOSL', 'ireland':'XDUB',
    'sweden':'XSTO', 'suède':'XSTO',
    'denmark':'XCSE', 'danemark':'XCSE',
    'finland':'XHEL', 'finlande':'XHEL',
    'japan':'XTKS', 'japon':'XTKS',
    'hong kong':'XHKG', 'singapore':'XSES',
    'taiwan':'XTAI', 'taïwan':'XTAI',
    'south korea':'XKRX', 'corée':'XKRX',
    'india':'XNSE', 'inde':'XNSE',
    'thailand':'XBKK', 'philippines':'XPHS', 'malaysia':'XKLS',
    'china':'XSHG'
};

function toMIC(exchange, country=''){
    const ex = normalize(exchange);
    if (ex) {
        for (const [pat, mic] of EX2MIC_PATTERNS) {
            if (ex.includes(pat)) return mic;
        }
    }
    const c = normalize(country);
    return COUNTRY2MIC[c] || null;
}

const US_EXCH = /nasdaq|nyse|arca|amex|bats/i;
const LSE_IOB = /^[0][A-Z0-9]{3}$/;

function tokens(s){
    return normalize(s).normalize("NFKD").replace(/[^a-z0-9\s]/g," ")
        .split(/\s+/).filter(w => w.length>=3);
}
function nameLooksRight(metaName, expected){
    if (!expected) return true;
    const a = new Set(tokens(metaName));
    const b = tokens(expected);
    return b.some(t => a.has(t));
}

async function tdStocksLookup({ symbol, country, exchange }) {
    try {
        const { data } = await axios.get('https://api.twelvedata.com/stocks', {
            params: { symbol, country, exchange, apikey: CONFIG.API_KEY }, timeout: 15000
        });
        const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data)?data:[]);
        return arr;
    } catch { return []; }
}

function rankCandidate(c, wanted){
    let s = 0;
    const micWanted = toMIC(wanted.exchange, wanted.country);
    if (micWanted && c.mic_code === micWanted) s += 3;
    if (normalize(c.exchange).includes(normalize(wanted.exchange))) s += 2;
    if (LSE_IOB.test(c.symbol)) s += 1;
    if (US_EXCH.test(c.exchange||"") && !isUSCountry(wanted.country)) s -= 3;
    return s;
}

async function tryQuote(sym, mic){
    const attempt = async (params) => {
        try {
            const { data } = await axios.get('https://api.twelvedata.com/quote', { params, timeout: 15000 });
            if (data && data.status !== 'error') return data;
        } catch {}
        return null;
    };
    if (mic) {
        const q1 = await attempt({ symbol: `${sym}:${mic}`, apikey: CONFIG.API_KEY });
        if (q1) return q1;
        const q2 = await attempt({ symbol: sym, mic_code: mic, apikey: CONFIG.API_KEY });
        if (q2) return q2;
    }
    return await attempt({ symbol: sym, apikey: CONFIG.API_KEY });
}

function resolveSymbol(symbol, stock) {
    if (/:/.test(symbol)) return symbol;
    const mic = micForRegion(stock);
    return mic ? `${symbol}:${mic}` : symbol;
}

async function resolveSymbolSmart(symbol, stock) {
    const mic = toMIC(stock.exchange, stock.country);

    if (mic && !isUSMic(mic)) {
        const qEU = await tryQuote(symbol, mic);
        if (qEU && nameLooksRight(qEU.name, stock.name)) {
            if (CONFIG.DEBUG) console.log(`[FAST PATH] ${symbol} → ${symbol}:${mic} (${stock.country})`);
            return `${symbol}:${mic}`;
        }
    }

    const q = await tryQuote(symbol, mic);
    const looksUS  = q?.exchange && US_EXCH.test(q.exchange);
    const okMarket = !(looksUS && !isUSCountry(stock.country));
    const okName   = q?.name ? nameLooksRight(q.name, stock.name) : true;

    if (q && okMarket && okName) {
        return mic ? `${symbol}:${mic}` : symbol;
    }

    const cand = await tdStocksLookup({ symbol, country: stock.country, exchange: stock.exchange });
    if (cand.length) {
        cand.sort((a,b)=>rankCandidate(b,stock) - rankCandidate(a,stock));
        const best = cand[0];
        const bestSym = LSE_IOB.test(best.symbol) ? best.symbol
                       : (best.mic_code ? `${best.symbol}:${best.mic_code}` : best.symbol);
        const qBest = await tryQuote(best.symbol, best.mic_code);
        if (qBest) {
            const okM = !(US_EXCH.test(qBest.exchange||"") && !isUSCountry(stock.country));
            const okN = nameLooksRight(qBest.name || '', stock.name);
            if (okM && okN) return bestSym;
        }
    }

    const fallback = resolveSymbol(symbol, stock);
    const micInFallback = fallback && fallback.includes(':') ? fallback.split(':')[1] : null;
    
    if (!isUSCountry(stock.country) && micInFallback && US_MICS.has(micInFallback)) {
        return null;
    }
    
    return fallback;
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
            roe: parseNumberLoose(row['roe']) ?? null,
            de_ratio: parseNumberLoose(row['de_ratio']) ?? null,
            roic: parseNumberLoose(row['roic']) ?? null
        })).filter(s => s.symbol);
    } catch (error) {
        console.error(`Erreur ${filepath}: ${error.message}`);
        return [];
    }
}

// ───────── Data fetchers (identiques v3.23) ─────────

async function getQuoteData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.QUOTE);
        const resolved = resolveSymbol(symbol, stock);
        const trials = tdParamTrials(symbol, stock, resolved);
        const data = await fetchTD('quote', trials);
        if (!data) return null;
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
                symbol_used: data.symbol || trials[0]?.symbol || resolved,
                exchange: data.exchange ?? null,
                mic_code: data.mic_code ?? null,
                currency: data.currency ?? null
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
        const resolved = resolveSymbol(symbol, stock);
        const trials = tdParamTrials(symbol, stock, resolved);
        const data = await fetchTD('time_series', trials, {
            interval: '1day', outputsize: 900, order: 'ASC', adjusted: true
        });
        if (!data || data.status === 'error' || !data.values) return {};
        const meta = data.meta || {};
        const prices = (data.values || []).map(v => ({ date: v.datetime.slice(0,10), close: Number(v.close) }));
        if (!prices.length) return {};
        const current = prices.at(-1)?.close || 0;
        const prev = prices.at(-2)?.close || null;
        const perf = {};
        if (prev) perf.day_1 = ((current - prev)/prev*100).toFixed(2);
        const atFromEnd = n => prices.at(-1 - n)?.close ?? null;
        const p21 = atFromEnd(21), p63 = atFromEnd(63), p252 = atFromEnd(252);
        if (p21) perf.month_1 = ((current - p21)/p21*100).toFixed(2);
        if (p63) perf.month_3 = ((current - p63)/p63*100).toFixed(2);
        if (p252) perf.year_1 = ((current - p252)/p252*100).toFixed(2);
        const now = new Date();
        const y3ISO = new Date(now.getFullYear()-3, now.getMonth(), now.getDate()).toISOString().slice(0,10);
        const y3Bar = prices.find(p => p.date >= y3ISO);
        if (y3Bar && y3Bar.close !== current) perf.year_3 = ((current - y3Bar.close)/y3Bar.close*100).toFixed(2);
        const yearStart = `${new Date().getFullYear()}-01-01`;
        const ytdIdx = prices.findIndex(p => p.date >= yearStart);
        const ytdBar = ytdIdx !== -1 ? prices[ytdIdx] : null;
        if (CONFIG.DEBUG && ytdBar) {
            const prev = ytdIdx > 0 ? prices[ytdIdx - 1] : null;
            console.log(`[YTD] ${resolved} | yearStart=${yearStart} | basis=${ytdBar?.date ?? 'N/A'} close=${ytdBar?.close ?? 'N/A'} | prev=${prev?.date ?? 'N/A'} closePrev=${prev?.close ?? 'N/A'} | current=${current}`);
        }
        if (ytdBar && ytdBar.close !== current) {
            perf.ytd = ((current - ytdBar.close)/ytdBar.close*100).toFixed(2);
        }
        const tail = prices.slice(-Math.min(252*3, prices.length)).map(p => p.close);
        const rets = []; 
        for (let i=1; i<tail.length; i++) rets.push(Math.log(tail[i]/tail[i-1]));
        const vol = Math.sqrt(252) * standardDeviation(rets) * 100;
        const last252 = prices.slice(-252);
        const high52 = last252.length ? Math.max(...last252.map(p=>p.close)) : null;
        const low52 = last252.length ? Math.min(...last252.map(p=>p.close)) : null;
        const drawdowns = calculateDrawdowns(prices);
        return {
            performances: perf,
            volatility_3y: vol.toFixed(2),
            max_drawdown_ytd: drawdowns.ytd,
            max_drawdown_3y: drawdowns.year3,
            distance_52w_high: high52 ? ((current - high52)/high52*100).toFixed(2) : null,
            distance_52w_low: low52 ? ((current - low52)/low52*100).toFixed(2) : null,
            ytd_meta: { year_start: yearStart, basis_date: ytdBar?.date ?? null, basis_close: ytdBar?.close ?? null },
            _series_meta: {
                symbol_used: data.symbol || trials[0]?.symbol || resolved,
                exchange: meta.exchange ?? null,
                currency: meta.currency ?? null,
                timezone: meta.exchange_timezone ?? meta.timezone ?? null
            },
            __last_close: current, __prev_close: prev, __hi52: high52, __lo52: low52
        };
    } catch (e) {
        if (CONFIG.DEBUG) console.error('[TIME_SERIES EXC]', symbol, e.message);
        return {};
    }
}

async function getDividendData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.DIVIDENDS);
        const resolved = resolveSymbol(symbol, stock);
        const trials = tdParamTrials(symbol, stock, resolved);
        const todayISO = new Date().toISOString().slice(0,10);
        const threeY = new Date(); 
        threeY.setFullYear(threeY.getFullYear()-3);
        const data = await fetchTD('dividends', trials, {
            start_date: threeY.toISOString().slice(0,10),
            end_date: todayISO
        });
        if (!data || data.status === 'error') return {};
        const arr = Array.isArray(data) ? data : (data.values || data.data || data.dividends || []);
        const dividends = arr.map(d => ({
            ex_date: d.ex_date || d.date, 
            amount: parseNumberLoose(d.amount) || 0, 
            payment_date: d.payment_date
        })).filter(d => d.ex_date);
        const lastYear = dividends.filter(d => {
            const date = new Date(d.ex_date); 
            const yearAgo = new Date(); 
            yearAgo.setFullYear(yearAgo.getFullYear()-1);
            return date > yearAgo;
        });
        const totalTTM = lastYear.reduce((s,d)=>s+d.amount,0);
        const byYear = {};
        for (const d of dividends) {
            const y = new Date(d.ex_date).getFullYear();
            byYear[y] = (byYear[y] || 0) + d.amount;
        }
        const nowYear = new Date().getFullYear();
        const fullYears = Object.keys(byYear).map(Number).filter(y => y < nowYear).sort();
        const lastYears = fullYears.slice(-3);
        const avgPerYear = lastYears.length ? lastYears.reduce((s,y)=>s+byYear[y],0) / lastYears.length : 0;
        const dividendGrowth = calculateDividendGrowth(dividends);
        return {
            dividend_yield_ttm: parseNumberLoose(data.meta?.dividend_yield) ?? null,
            dividends_history: dividends.sort((a,b)=>b.ex_date.localeCompare(a.ex_date)).slice(0,10),
            dividends_full: dividends,
            avg_dividend_per_year: avgPerYear,
            total_dividends_ttm: totalTTM,
            dividend_growth_3y: dividendGrowth
        };
    } catch (e) {
        if (CONFIG.DEBUG) console.error('[DIVIDENDS EXC]', symbol, e.message);
        return {};
    }
}

// ✅ v3.27.1: getStatisticsData avec D/E path fix (total_debt_to_equity_mrq)
async function getStatisticsData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        const resolved = resolveSymbol(symbol, stock);
        const trials = tdParamTrials(symbol, stock, resolved);
        const data = await fetchTD('statistics', trials, { dp: 6 });
        if (!data) return {};
        const root = data.statistics || data || {};
        
        const market_cap = pickNumDeep(root, [
            'valuations_metrics.market_capitalization', 'market_capitalization',
            'financials.market_capitalization', 'overview.market_cap'
        ]);
        const pe_ratio = pickNumDeep(root, [
            'valuations_metrics.trailing_pe', 'valuations_metrics.pe_ratio',
            'overview.pe_ratio', 'pe_ratio', 'pe'
        ]);
        const eps_ttm = pickNumDeep(root, [
            'financials.income_statement.diluted_eps_ttm', 'financials.income_statement.eps_ttm',
            'overview.eps', 'earnings_per_share', 'eps'
        ]);
        const payout_frac = pickNumDeep(root, ['dividends_and_splits.payout_ratio']);
        const trailing_yield = pickNumDeep(root, ['dividends_and_splits.trailing_annual_dividend_yield']);
        const forward_yield = pickNumDeep(root, ['dividends_and_splits.forward_annual_dividend_yield']);
        const beta = pickNumDeep(root, ['stock_price_summary.beta','beta']);
        const shares_outstanding = pickNumDeep(root, [
            'stock_statistics.shares_outstanding', 'overview.shares_outstanding', 'financials.shares_outstanding'
        ]);
        const last_split_factor = root?.dividends_and_splits?.last_split_factor ?? null;
        const last_split_date   = root?.dividends_and_splits?.last_split_date   ?? null;
        const fcf_ttm = pickNumDeep(root, [
            'financials.cash_flow.levered_free_cash_flow_ttm', 'financials.cash_flow.free_cash_flow_ttm',
            'financials.cash_flow.levered_free_cash_flow', 'financials.cash_flow.free_cash_flow',
            'cash_flow.free_cash_flow_ttm', 'free_cash_flow_ttm', 'fcf_ttm'
        ]);

        // ✅ v3.27.1: ROE, D/E, ROIC depuis /statistics API (paths corrigés)
        const roe_api_raw = pickNumDeep(root, [
            'financials.return_on_equity_ttm',
            'financials.income_statement.return_on_equity',
            'return_on_equity_ttm', 'return_on_equity'
        ]);
        // ✅ v3.27.1: ajout total_debt_to_equity_mrq (champ exact de la doc)
        const de_ratio_api_raw = pickNumDeep(root, [
            'financials.balance_sheet.total_debt_to_equity_mrq',
            'financials.balance_sheet.total_debt_to_equity_ratio',
            'financials.balance_sheet.debt_to_equity',
            'total_debt_to_equity_mrq', 'total_debt_to_equity_ratio', 'debt_to_equity'
        ]);
        const roic_api_raw = pickNumDeep(root, [
            'financials.return_on_invested_capital_ttm',
            'financials.income_statement.return_on_invested_capital',
            'return_on_invested_capital_ttm', 'return_on_invested_capital'
        ]);

        return {
            market_cap: Number.isFinite(market_cap) ? market_cap : null,
            pe_ratio: Number.isFinite(pe_ratio) ? pe_ratio : null,
            eps_ttm: Number.isFinite(eps_ttm) ? eps_ttm : null,
            payout_ratio_api_pct: Number.isFinite(payout_frac) ? payout_frac * 100 : null,
            dividend_yield_trailing_pct: Number.isFinite(trailing_yield) ? trailing_yield * 100 : null,
            dividend_yield_forward_pct: Number.isFinite(forward_yield) ? forward_yield * 100 : null,
            beta: Number.isFinite(beta) ? beta : null,
            shares_outstanding: Number.isFinite(shares_outstanding) ? shares_outstanding : null,
            last_split_factor, last_split_date,
            fcf_ttm: Number.isFinite(fcf_ttm) ? fcf_ttm : null,
            roe_api: Number.isFinite(roe_api_raw) ? +(roe_api_raw * 100).toFixed(2) : null,
            de_ratio_api: Number.isFinite(de_ratio_api_raw) ? +(de_ratio_api_raw / 100).toFixed(4) : null,
            roic_api: Number.isFinite(roic_api_raw) ? +(roic_api_raw * 100).toFixed(2) : null
        };
    } catch (error) {
        if (CONFIG.DEBUG) console.error('[STATISTICS EXCEPTION]', symbol, error.message);
        return {};
    }
}

async function getGrowthEstimates(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.GROWTH_ESTIMATES);
        const resolved = resolveSymbol(symbol, stock);
        const trials = tdParamTrials(symbol, stock, resolved);
        const data = await fetchTD('growth_estimates', trials);
        if (!data || data.status === 'error') {
            if (CONFIG.DEBUG) console.log(`[GROWTH_ESTIMATES] ${symbol}: no data`);
            return {};
        }
        const g = data.growth_estimates || data || {};
        const past5y = pickNumDeep(g, ['past_5_years_pa', 'earnings_growth_5y', 'eps_growth_5y', 'growth_5y']);
        const next5y = pickNumDeep(g, ['next_5_years_pa', 'earnings_growth_next_5y', 'eps_growth_forecast_5y']);
        const peg = pickNumDeep(g, ['peg_ratio', 'peg']);
        if (CONFIG.DEBUG && (past5y || next5y)) {
            console.log(`[GROWTH] ${symbol}: past5y=${past5y ? (past5y*100).toFixed(1)+'%' : 'N/A'}, next5y=${next5y ? (next5y*100).toFixed(1)+'%' : 'N/A'}`);
        }
        return {
            eps_growth_5y: Number.isFinite(past5y) ? +(past5y * 100).toFixed(2) : null,
            eps_growth_forecast_5y: Number.isFinite(next5y) ? +(next5y * 100).toFixed(2) : null,
            peg_ratio: Number.isFinite(peg) ? +peg.toFixed(2) : null
        };
    } catch (e) {
        if (CONFIG.DEBUG) console.error('[GROWTH_ESTIMATES EXC]', symbol, e.message);
        return {};
    }
}

async function getMarketCapDirect(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.MARKET_CAP);
        const isResolved = /:/.test(symbol);
        const trials = isResolved ? [{ symbol }] : tdParamTrials(symbol, stock);
        const data = await fetchTD('market_cap', trials);
        if (!data) return null;
        const series = Array.isArray(data?.market_cap) ? data.market_cap
                     : Array.isArray(data?.values) ? data.values
                     : Array.isArray(data?.data) ? data.data : null;
        if (series && series.length) {
            const sorted = series.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
            const last = sorted.at(-1);
            const mc = parseNumberLoose(last?.value ?? last?.market_cap ?? last?.close);
            return Number.isFinite(mc) ? mc : null;
        }
        const raw = data?.market_cap ?? data?.value;
        const mc = parseNumberLoose(raw);
        return Number.isFinite(mc) ? mc : null;
    } catch (e) {
        if (CONFIG.DEBUG) console.error('[MARKET_CAP EXC]', symbol, e.message);
        return null;
    }
}

function calculateDividendGrowth(history) {
    if (!history || history.length < 2) return null;
    const byYear = {};
    history.forEach(d => {
        const year = new Date(d.ex_date).getFullYear();
        byYear[year] = (byYear[year] || 0) + d.amount;
    });
    const years = Object.keys(byYear).sort();
    if (years.length < 2) return null;
    const recentYears = years.slice(-4);
    if (recentYears.length < 2) return null;
    const first = byYear[recentYears[0]];
    const last = byYear[recentYears[recentYears.length - 1]];
    const n = recentYears.length - 1;
    if (first <= 0) return null;
    const cagr = (Math.pow(last / first, 1 / n) - 1) * 100;
    return Number(cagr.toFixed(2));
}

// ---------- DIVIDENDS HELPERS ----------
function parseSplitFactor(s){
  if (!s) return 1;
  const str = String(s).trim();
  const m = str.match(/(\d+(?:\.\d+)?)\s*(?:[:\/-]|\s*for\s*)\s*(\d+(?:\.\d+)?)/i);
  if (!m) return 1;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 1;
  return a / b;
}

function adjustDividendsForSplit(divs, splitDate, factor){
  if (!splitDate || factor === 1) return divs;
  const sd = new Date(splitDate);
  return divs.map(d => (new Date(d.ex_date) < sd ? { ...d, amount: (d.amount || 0) / factor } : d));
}

function median(arr){
  const a = (arr||[]).filter(Number.isFinite).slice().sort((x,y)=>x-y);
  const n = a.length; if (!n) return null;
  return n%2 ? a[(n-1)/2] : (a[n/2-1] + a[n/2]) / 2;
}

function splitSeriesAlreadyAdjusted(divs, splitDate, factor = 1){
  if (!splitDate || !factor || factor === 1) return false;
  const sd = new Date(splitDate);
  const pre  = divs.filter(d => new Date(d.ex_date) < sd).map(d => d.amount).filter(a => a > 0);
  const post = divs.filter(d => new Date(d.ex_date) >= sd).map(d => d.amount).filter(a => a > 0);
  if (pre.length < 2 || post.length < 2) return false;
  const medianPre = median(pre);
  const medianPost = median(post);
  if (!medianPre || !medianPost) return false;
  const r = medianPre / medianPost;
  if (!Number.isFinite(r) || r <= 0) return false;
  const TOLERANCE = 0.15;
  const isAdjusted = Math.abs(r - 1) <= TOLERANCE;
  const needsAdjustment = Math.abs(r - factor) <= (TOLERANCE * factor);
  if (CONFIG.DEBUG) {
    console.log(`[SPLIT CHECK] ratio=${r.toFixed(2)}, factor=${factor}, adjusted=${isAdjusted}, needsAdj=${needsAdjustment}, decision=${isAdjusted && !needsAdjustment ? 'SKIP' : 'APPLY'}`);
  }
  return isAdjusted && !needsAdjustment;
}

function maybeAdjustForSplit(divs, splitDate, factor){
  if (!splitDate || !factor || factor === 1) return divs;
  return splitSeriesAlreadyAdjusted(divs, splitDate, factor) ? divs
       : adjustDividendsForSplit(divs, splitDate, factor);
}

function estimateFrequency(divs, isSpecialFn){
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 24);
  const ns = divs
    .filter(d => (d.amount || 0) > 0 && new Date(d.ex_date) >= cutoff)
    .filter(d => !isSpecialFn?.(d.amount));
  const dates = ns.map(d => new Date(d.ex_date)).sort((a,b)=>a-b);
  if (dates.length < 2) return 1;
  const gaps = [];
  for (let i=1;i<dates.length;i++) gaps.push((dates[i]-dates[i-1])/86400000);
  const md = median(gaps) || 365;
  const approx = Math.max(1, Math.min(12, Math.round(365/md)));
  if (approx >= 10) return 12;
  if (approx >= 3 && approx <= 5) return 4;
  if (approx >= 2) return 2;
  return 1;
}

function clampRegToTTM(reg, ttm, hasSpecial){
  if (!Number.isFinite(reg) || !Number.isFinite(ttm) || hasSpecial) return reg;
  const ratio = reg / Math.max(ttm, 1e-6);
  return (ratio < 0.5 || ratio > 2.0) ? ttm : reg;
}

function calculateBuffettScore(roe, de_ratio, roic) {
    let score = 0;
    let maxScore = 0;
    if (roe !== null && roe !== undefined && Number.isFinite(roe)) {
        maxScore += 25;
        if (roe >= 20) score += 25;
        else if (roe >= 15) score += 20;
        else if (roe >= 10) score += 12;
        else if (roe > 0) score += 5;
    }
    if (de_ratio !== null && de_ratio !== undefined && Number.isFinite(de_ratio)) {
        maxScore += 20;
        if (de_ratio < 0.5) score += 20;
        else if (de_ratio < 1.0) score += 15;
        else if (de_ratio < 2.0) score += 8;
        else if (de_ratio < 3.0) score += 3;
    }
    if (roic !== null && roic !== undefined && Number.isFinite(roic)) {
        maxScore += 25;
        if (roic >= 20) score += 25;
        else if (roic >= 15) score += 20;
        else if (roic >= 10) score += 12;
        else if (roic >= 5) score += 5;
        else if (roic > 0) score += 2;
    }
    if (maxScore === 0) return null;
    return Math.round((score / maxScore) * 100);
}

function getBuffettGrade(score) {
    if (score === null || score === undefined) return null;
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    return 'D';
}

// ✅ v3.27: enrichStock = v3.23 base + résolution déterministe non-US + ROE/DE/ROIC API fallback
async function enrichStock(stock) {
    console.log(`  📊 ${stock.symbol}...`);
    
    // ✅ v3.27: Résolution déterministe pour non-US (0 appel API), smart pour US uniquement
    const mic = toMIC(stock.exchange, stock.country);
    const isNonUSWithMIC = !isUS(stock.exchange, stock.country) && mic && !isUSMic(mic);
    
    let resolved;
    if (isNonUSWithMIC) {
        resolved = `${stock.symbol}:${mic}`;
        if (CONFIG.DEBUG) console.log(`[DETERMINISTIC] ${stock.symbol} → ${resolved} (${stock.country})`);
    } else {
        resolved = await resolveSymbolSmart(stock.symbol, stock);
        if (CONFIG.DEBUG) console.log('[RESOLVED]', stock.symbol, '→', resolved || '(none)');
    }
    
    const wasADR = isADRLike(stock);
    if (CONFIG.DEBUG && resolved) {
        console.log(`[RESOLVE] ${stock.symbol} | Exchange: "${stock.exchange}" | Country: ${stock.country}`);
        console.log(`  → Resolved: ${resolved} | ADR? ${wasADR}`);
    }
    
    if (!resolved && isUS(stock.exchange, stock.country) && !isUSCountry(stock.country)) {
        if (CONFIG.DEBUG) console.log(`[ADR] ${stock.symbol} détecté comme ADR`);
        stock.is_adr = true;
    }
    
    const sym = resolved || stock.symbol;
    const ctx = stock;
    const [perf, quote, dividends, stats, mcDirect, growth] = await Promise.all([
        getPerformanceData(sym, ctx),
        getQuoteData(sym, ctx),
        getDividendData(sym, ctx),
        getStatisticsData(sym, ctx),
        getMarketCapDirect(sym, ctx),
        getGrowthEstimates(sym, ctx)
    ]);
    
    let price = quote?.price ?? null;
    let change_percent = quote?.percent_change ?? null;
    let range_52w = quote?.fifty_two_week?.range ?? null;
    
    if (!quote && perf && Number.isFinite(perf.__last_close)) {
        const p = perf.__last_close;
        const prev = perf.__prev_close;
        price = p ?? null;
        change_percent = (p && prev) ? ((p - prev) / prev * 100) : null;
        if (!range_52w && perf.__hi52 && perf.__lo52) {
            range_52w = `${Number(perf.__lo52).toFixed(6)} - ${Number(perf.__hi52).toFixed(6)}`;
        }
    }
    
    const usedCurrency = quote?._meta?.currency ?? perf?._series_meta?.currency ?? null;
    if (usedCurrency === 'GBX' && Number.isFinite(price)) {
        price = price / 100;
        if (CONFIG.DEBUG) console.log(`[GBX→GBP] ${stock.symbol}: price converted from GBX to GBP`);
    }
    
    if (!price) {
        if (Number.isFinite(stats?.market_cap) && Number.isFinite(stats?.shares_outstanding) && stats.shares_outstanding > 0) {
            price = stats.market_cap / stats.shares_outstanding;
            if (CONFIG.DEBUG) console.log(`[FALLBACK PRICE] ${stock.symbol}: price = ${price} from market_cap/shares`);
            change_percent = null;
        }
    }
    
    if (!price) {
        return { ...stock, error: 'NO_DATA' };
    }
    
    const market_cap = 
        (typeof mcDirect === 'number' ? mcDirect : null) ??
        (typeof stats.market_cap === 'number' ? stats.market_cap : null) ??
        ((typeof stats.shares_outstanding === 'number' && typeof price === 'number')
            ? stats.shares_outstanding * price : null);
    
    let fcf_yield = null;
    if (Number.isFinite(stats?.fcf_ttm) && Number.isFinite(market_cap) && market_cap > 0) {
        fcf_yield = +((stats.fcf_ttm / market_cap) * 100).toFixed(2);
    }
    
    // ---- Dividend yields (split-aware + specials) ----
    const splitF = parseSplitFactor(stats?.last_split_factor);
    const splitD = stats?.last_split_date ? new Date(stats.last_split_date) : null;
    const recentSplit = !!(splitD && ((Date.now() - splitD.getTime())/86400000) < 450);
    const fullDivsRaw = dividends?.dividends_full || [];
    const fullDivs = maybeAdjustForSplit(fullDivsRaw, splitD, splitF)
      .sort((a,b)=>b.ex_date.localeCompare(a.ex_date));
    const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const last12m = fullDivs.filter(d => new Date(d.ex_date) > oneYearAgo);
    const postSplitDivs = splitD ? fullDivs.filter(d => new Date(d.ex_date) >= splitD) : [];
    const recentAmtsAll = fullDivs.slice(0, 8).map(d => d.amount).filter(a => a > 0);
    const recentAmtsPost = postSplitDivs.slice(0, 8).map(d => d.amount).filter(a => a > 0);
    const baseAmts = recentAmtsPost.length >= 2 ? recentAmtsPost : recentAmtsAll;
    const m = median(baseAmts);
    const isSpecial = (a) => (m != null) && a > m * 1.6;
    let ttmSumCalc = last12m.reduce((s, d) => s + (d.amount || 0), 0);
    const ttmSpecial = last12m.filter(d => isSpecial(d.amount)).reduce((s, d) => s + (d.amount || 0), 0);
    const specialShare = ttmSumCalc > 0 ? (ttmSpecial / ttmSumCalc * 100) : 0;
    const freq = estimateFrequency(fullDivs, isSpecial);
    const nonSpecCount12m = last12m.filter(d => !isSpecial(d.amount)).length;
    const expectedMin = Math.max(1, Math.floor(freq * 0.6));
    const lastKnownAmt = 
        (postSplitDivs.length > 0 ? postSplitDivs[0].amount : null) ??
        (last12m.length > 0 ? last12m[0].amount : null) ??
        median(baseAmts.filter(a => !isSpecial(a)));
    let usedRunRate = false;
    if (recentSplit && nonSpecCount12m < expectedMin && Number.isFinite(lastKnownAmt) && freq) {
        ttmSumCalc = lastKnownAmt * freq;
        usedRunRate = true;
    }
    const regularQ = median(baseAmts.filter(a => !isSpecial(a)));
    const annualRegular = regularQ ? regularQ * freq : null;
    const yield_ttm_api  = Number.isFinite(stats?.dividend_yield_trailing_pct) ? +stats.dividend_yield_trailing_pct.toFixed(2) : null;
    const yield_ttm_calc = (price > 0 && ttmSumCalc) ? +((ttmSumCalc / price) * 100).toFixed(2) : null;
    let   yield_regular  = (price > 0 && annualRegular) ? +((annualRegular / price) * 100).toFixed(2) : null;
    const yield_fwd      = Number.isFinite(stats?.dividend_yield_forward_pct) ? +stats.dividend_yield_forward_pct.toFixed(2) : null;
    let dividend_yield_ttm = yield_ttm_calc;
    let usedTtmSource = usedRunRate ? 'calc-runrate' : 'calc';
    if (!usedRunRate && !recentSplit && yield_ttm_api != null && (
        dividend_yield_ttm == null || nonSpecCount12m < expectedMin ||
        dividend_yield_ttm <= 0 || dividend_yield_ttm > 20
    )) {
        dividend_yield_ttm = yield_ttm_api;
        usedTtmSource = 'api';
    }
    const refForClamp = (usedTtmSource === 'api' && recentSplit) ? null : dividend_yield_ttm;
    yield_regular = clampRegToTTM(yield_regular, refForClamp ?? yield_regular, specialShare >= 20);

    let dividendYield, dividend_yield_src;
    let debug_dividends = null;
    dividendYield = dividend_yield_ttm ?? yield_regular ?? yield_fwd ?? null;
    dividend_yield_src =
      usedTtmSource === 'calc-runrate' ? 'TTM (run-rate post-split)' :
      usedTtmSource === 'api'          ? 'TTM (API)' :
      dividend_yield_ttm != null        ? 'TTM' :
      yield_regular != null             ? 'REG' :
      yield_fwd != null                 ? 'FWD' : null;

    {
      let dividend_consistency = 'ok';
      if (Number.isFinite(yield_fwd) && Number.isFinite(yield_ttm_calc) && !recentSplit && specialShare < 15) {
        const maxv = Math.max(yield_fwd, yield_ttm_calc);
        const minv = Math.min(yield_fwd, yield_ttm_calc);
        const conflict = (maxv / minv) > 1.4;
        if (conflict) {
          dividend_consistency = 'conflict';
          if (Number.isFinite(yield_regular)) {
            dividendYield = yield_regular;
            dividend_yield_src = 'REG';
          } else {
            const chosen = Math.min(yield_fwd, yield_ttm_calc);
            dividendYield = chosen;
            dividend_yield_src = (chosen === yield_fwd ? 'FWD' : 'TTM (calc)');
          }
        }
      }
      debug_dividends = {
        price_used: price ?? null,
        ttm_sum_calc: Number.isFinite(ttmSumCalc) ? +ttmSumCalc.toFixed(6) : null,
        quarterly_median: regularQ ?? null,
        special_share_ttm_pct: +specialShare.toFixed(1),
        api_trailing_pct: Number.isFinite(yield_ttm_api) ? +yield_ttm_api.toFixed(2) : null,
        api_forward_pct: Number.isFinite(yield_fwd) ? +yield_fwd.toFixed(2) : null,
        consistency: dividend_consistency,
        frequency_detected: freq,
        recent_split: recentSplit,
        split_date: stats?.last_split_date || null,
        split_factor: splitF !== 1 ? splitF : null,
        dividend_yield_src,
        ttm_source: usedTtmSource,
        ttm_window_count: last12m.length,
        used_run_rate: usedRunRate,
        last_known_amt: lastKnownAmt,
        conflict_ratio: dividend_consistency === 'conflict' ? (Math.max(yield_fwd, yield_ttm_calc) / Math.min(yield_fwd, yield_ttm_calc)).toFixed(2) : null
      };
    }

    let eps_ttm = Number.isFinite(stats?.eps_ttm) ? stats.eps_ttm : null;
    if (!Number.isFinite(eps_ttm) && Number.isFinite(stats?.pe_ratio) && stats.pe_ratio > 0 && Number.isFinite(price) && price > 0) {
        eps_ttm = price / stats.pe_ratio;
    }
    const dps_ttm_used = Number.isFinite(ttmSumCalc) && ttmSumCalc > 0
      ? ttmSumCalc : (Number.isFinite(dividend_yield_ttm) && price > 0 ? (dividend_yield_ttm/100)*price : null);
    const dps_reg_used = Number.isFinite(annualRegular) && annualRegular > 0
      ? annualRegular : (Number.isFinite(yield_regular) && price > 0 ? (yield_regular/100)*price : null);
    let payout_ratio_ttm = null;
    if (Number.isFinite(stats?.payout_ratio_api_pct)) {
      payout_ratio_ttm = Math.min(200, +stats.payout_ratio_api_pct.toFixed(1));
    } else if (Number.isFinite(dps_ttm_used) && Number.isFinite(eps_ttm) && eps_ttm > 0) {
      payout_ratio_ttm = Math.min(200, +((dps_ttm_used/eps_ttm)*100).toFixed(1));
    } else if (Number.isFinite(dividend_yield_ttm) && Number.isFinite(stats?.pe_ratio)) {
      payout_ratio_ttm = Math.min(200, +((dividend_yield_ttm * stats.pe_ratio)).toFixed(1));
    }
    const payout_ratio_regular = (Number.isFinite(dps_reg_used) && Number.isFinite(eps_ttm) && eps_ttm > 0)
      ? Math.min(200, +((dps_reg_used/eps_ttm)*100).toFixed(1)) : null;
    let payout_status = null, dividend_coverage = null;
    if (Number.isFinite(payout_ratio_ttm)) {
      payout_status =
        payout_ratio_ttm < 30 ? 'conservative' :
        payout_ratio_ttm < 60 ? 'moderate' :
        payout_ratio_ttm < 80 ? 'high' :
        payout_ratio_ttm < 100? 'very_high' : 'unsustainable';
      if (Number.isFinite(eps_ttm) && Number.isFinite(dps_ttm_used) && dps_ttm_used > 0) {
        dividend_coverage = Number((eps_ttm / dps_ttm_used).toFixed(2));
      }
    }
    
    const usedEx =  quote?._meta?.exchange ?? perf?._series_meta?.exchange ?? null;
    const usedMic = quote?._meta?.mic_code ?? null;
    const usedCur = quote?._meta?.currency ?? perf?._series_meta?.currency ?? null;
    const usedTz  = perf?._series_meta?.timezone ?? null;
    const symUsed = quote?._meta?.symbol_used || perf?._series_meta?.symbol_used || (resolved || stock.symbol);
    
    // ✅ v3.27: ROE/D-E/ROIC: CSV prioritaire, fallback API /statistics
    const finalROE = stock.roe ?? stats?.roe_api ?? null;
    const finalDE = stock.de_ratio ?? stats?.de_ratio_api ?? null;
    const finalROIC = stock.roic ?? stats?.roic_api ?? null;
    
    if (CONFIG.DEBUG) {
        if (stock.roe == null && stats?.roe_api != null) {
            console.log(`[FALLBACK] ${stock.symbol}: ROE CSV=null → API=${stats.roe_api}%`);
        }
        if (stock.de_ratio == null && stats?.de_ratio_api != null) {
            console.log(`[FALLBACK] ${stock.symbol}: D/E CSV=null → API=${stats.de_ratio_api}`);
        }
    }
    
    const buffett_score = calculateBuffettScore(finalROE, finalDE, finalROIC);
    const buffett_grade = getBuffettGrade(buffett_score);

    return {
        ticker: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        country: stock.country,
        exchange: stock.exchange,
        is_adr: stock.is_adr || false,
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
        roe: finalROE,
        de_ratio: finalDE,
        roic: finalROIC,
        buffett_score,
        buffett_grade,
        fcf_yield,
        fcf_ttm: stats?.fcf_ttm ?? null,
        eps_growth_5y: growth?.eps_growth_5y ?? null,
        eps_growth_forecast_5y: growth?.eps_growth_forecast_5y ?? null,
        peg_ratio: growth?.peg_ratio ?? null,
        dividend_yield: dividendYield,
        dividend_yield_src,
        dividend_yield_ttm: dividend_yield_ttm,
        dividend_yield_regular: yield_regular,
        dividend_yield_forward: yield_fwd,
        dividend_special_share_ttm: Number(specialShare.toFixed(1)),
        dividends_history: dividends?.dividends_history || [],
        avg_dividend_year: Number(dividends?.avg_dividend_per_year?.toFixed?.(2) ?? dividends?.avg_dividend_per_year ?? null),
        total_dividends_ttm: ttmSumCalc,
        dividend_growth_3y: dividends?.dividend_growth_3y || null,
        payout_ratio_ttm,
        payout_ratio_regular,
        payout_status,
        dividend_coverage,
        eps_ttm,
        pe_ratio: stats?.pe_ratio || null,
        volatility_3y: perf.volatility_3y,
        distance_52w_high: perf.distance_52w_high,
        distance_52w_low: perf.distance_52w_low,
        max_drawdown_ytd: perf.max_drawdown_ytd,
        max_drawdown_3y: perf.max_drawdown_3y,
        debug_dividends,
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

function getTopN(stocks, { field, direction='desc', n=10, excludeADR=false }={}){
  return (stocks||[])
    .filter(s => !s.error && (!excludeADR || !s.is_adr))
    .sort((a,b) => cmpCore(a,b,field,direction))
    .slice(0, n);
}

function buildOverview(byRegion){
  const pick = s => ({
    ticker: s.ticker, name: s.name, sector: s.sector, country: s.country,
    price: s.price, market_cap: s.market_cap,
    change_percent: s.change_percent == null ? null : Number(s.change_percent),
    perf_ytd: s.perf_ytd == null ? null : Number(s.perf_ytd),
    dividend_yield: s.dividend_yield == null ? null : Number(s.dividend_yield),
    payout_ratio_ttm: s.payout_ratio_ttm == null ? null : Number(s.payout_ratio_ttm),
    payout_status: s.payout_status || null,
    pe_ratio: s.pe_ratio == null ? null : Number(s.pe_ratio),
    eps_ttm: s.eps_ttm == null ? null : Number(s.eps_ttm),
    is_adr: s.is_adr || false,
    roe: s.roe == null ? null : Number(s.roe),
    de_ratio: s.de_ratio == null ? null : Number(s.de_ratio),
    roic: s.roic == null ? null : Number(s.roic),
    buffett_score: s.buffett_score == null ? null : Number(s.buffett_score),
    buffett_grade: s.buffett_grade || null
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
    const excludeADR = /^(EUROPE|ASIA|EUROPE_ASIA)$/.test(key);
    out.sets[key] = {
      day: {
        up:   getTopN(arr, { field: 'change_percent', direction: 'desc', n: 10, excludeADR }).map(pick),
        down: getTopN(arr, { field: 'change_percent', direction: 'asc',  n: 10, excludeADR }).map(pick),
      },
      ytd: {
        up:   getTopN(arr, { field: 'perf_ytd',      direction: 'desc', n: 10, excludeADR }).map(pick),
        down: getTopN(arr, { field: 'perf_ytd',      direction: 'asc',  n: 10, excludeADR }).map(pick),
      },
      dividends: {
        highest_yield: getTopN(arr, { field: 'dividend_yield', direction: 'desc', n: 10, excludeADR }).map(pick),
        best_payout: arr.filter(s => s.payout_ratio_ttm > 0 && s.payout_ratio_ttm < 80 && (!excludeADR || !s.is_adr))
                       .sort((a,b) => (b.dividend_yield || 0) - (a.dividend_yield || 0))
                       .slice(0, 10).map(pick)
      },
      buffett: {
        best_quality: getTopN(arr, { field: 'buffett_score', direction: 'desc', n: 10, excludeADR }).map(pick),
        highest_roe: getTopN(arr, { field: 'roe', direction: 'desc', n: 10, excludeADR }).map(pick),
        lowest_debt: arr.filter(s => s.de_ratio != null && s.de_ratio >= 0 && (!excludeADR || !s.is_adr))
                       .sort((a,b) => (a.de_ratio || 999) - (b.de_ratio || 999))
                       .slice(0, 10).map(pick)
      },
      value: {
        highest_fcf_yield: getTopN(arr, { field: 'fcf_yield', direction: 'desc', n: 10, excludeADR }).map(pick),
        best_growth: arr.filter(s => s.eps_growth_5y != null && s.eps_growth_5y > 0 && (!excludeADR || !s.is_adr))
                       .sort((a,b) => (b.eps_growth_5y || 0) - (a.eps_growth_5y || 0))
                       .slice(0, 10).map(pick),
        lowest_peg: arr.filter(s => s.peg_ratio != null && s.peg_ratio > 0 && s.peg_ratio < 3 && (!excludeADR || !s.is_adr))
                      .sort((a,b) => (a.peg_ratio || 999) - (b.peg_ratio || 999))
                      .slice(0, 10).map(pick)
      }
    };
  }
  return out;
}

async function main() { 
    const activeRegions = Object.entries(SELECTED_REGIONS)
        .filter(([_, v]) => v)
        .map(([k]) => k.toUpperCase())
        .join(', ');
    
    console.log(`📊 Enrichissement complet des stocks (v3.27.1 - Fix STATISTICS=50, 429 retry, D/E path)`);
    console.log(`🌍 Régions sélectionnées: ${activeRegions} (input: "${REGIONS_INPUT}")\n`);
    
    await fs.mkdir(OUT_DIR, { recursive: true });
    
    const [usStocks, europeStocks, asiaStocks] = await Promise.all([
        SELECTED_REGIONS.us     ? loadStockCSV('data/filtered/Actions_US_filtered.csv')     : Promise.resolve([]),
        SELECTED_REGIONS.europe ? loadStockCSV('data/filtered/Actions_Europe_filtered.csv') : Promise.resolve([]),
        SELECTED_REGIONS.asia   ? loadStockCSV('data/filtered/Actions_Asie_filtered.csv')   : Promise.resolve([])
    ]);
    
    console.log(`Stocks chargés: US ${usStocks.length} | Europe ${europeStocks.length} | Asie ${asiaStocks.length}\n`);
    
    const allLoaded = [...usStocks, ...europeStocks, ...asiaStocks];
    const withROE = allLoaded.filter(s => s.roe !== null).length;
    const withDE = allLoaded.filter(s => s.de_ratio !== null).length;
    const withROIC = allLoaded.filter(s => s.roic !== null).length;
    console.log(`📈 Fondamentaux CSV: ${withROE}/${allLoaded.length} ROE | ${withDE}/${allLoaded.length} D/E | ${withROIC}/${allLoaded.length} ROIC\n`);
    
    const adrFromEurope = [];
    const adrFromAsia = [];
    
    const europeFiltered = europeStocks.filter(s => {
        if (isADRLike(s)) { adrFromEurope.push(s); return false; }
        return true;
    });
    const asiaFiltered = asiaStocks.filter(s => {
        if (isADRLike(s)) { adrFromAsia.push(s); return false; }
        return true;
    });
    
    const usStocksFinal = KEEP_ADR ? [...usStocks, ...adrFromEurope, ...adrFromAsia] : usStocks;
    
    if (adrFromEurope.length || adrFromAsia.length) {
        console.log(`📋 ADR détectés:`);
        console.log(`  - Depuis Europe: ${adrFromEurope.length} (${adrFromEurope.map(s => s.symbol).join(', ')})`);
        console.log(`  - Depuis Asie: ${adrFromAsia.length} (${adrFromAsia.map(s => s.symbol).join(', ')})`);
        console.log(`  - Action: ${KEEP_ADR ? 'rebasculés vers US' : 'exclus'}\n`);
    }
    
    const regions = [];
    if (SELECTED_REGIONS.us)     regions.push({ name: 'us', stocks: usStocksFinal });
    if (SELECTED_REGIONS.europe) regions.push({ name: 'europe', stocks: europeFiltered });
    if (SELECTED_REGIONS.asia)   regions.push({ name: 'asia', stocks: asiaFiltered });
    
    const byRegion = { US: [], EUROPE: [], ASIA: [] };
    
    for (const region of regions) {
        console.log(`\n🌍 ${region.name.toUpperCase()}`);
        const enrichedStocks = [];
        for (let i = 0; i < region.stocks.length; i += CONFIG.CHUNK_SIZE) {
            const batch = region.stocks.slice(i, i + CONFIG.CHUNK_SIZE);
            const enrichedBatch = await Promise.all(batch.map(enrichStock));
            enrichedStocks.push(...enrichedBatch);
        }
        byRegion[region.name.toUpperCase()] = enrichedStocks;
        const filepath = path.join(OUT_DIR, `stocks_${region.name}.json`);
        await fs.writeFile(filepath, JSON.stringify({
            region: region.name.toUpperCase(),
            timestamp: new Date().toISOString(),
            stocks: enrichedStocks,
            adr_info: region.name === 'us' && KEEP_ADR ? {
                from_europe: adrFromEurope.map(s => s.symbol),
                from_asia: adrFromAsia.map(s => s.symbol)
            } : null
        }, null, 2));
        console.log(`✅ ${filepath}`);
    }
    
    const overview = buildOverview(byRegion);
    overview.regions_processed = activeRegions;
    const topsPath = path.join(OUT_DIR, 'tops_overview.json');
    await fs.writeFile(topsPath, JSON.stringify(overview, null, 2));
    console.log(`🏁 ${topsPath}`);
    
    const allStocks = [...byRegion.US, ...byRegion.EUROPE, ...byRegion.ASIA].filter(s => !KEEP_ADR || !s.is_adr);
    const withPayout = allStocks.filter(s => s.payout_ratio_ttm !== null);
    const withEPS = allStocks.filter(s => s.eps_ttm !== null);
    const withPE = allStocks.filter(s => s.pe_ratio !== null);
    const adrCount = allStocks.filter(s => s.is_adr).length;
    const withConflict = allStocks.filter(s => s.debug_dividends?.consistency === 'conflict').length;
    const withSplits = allStocks.filter(s => s.debug_dividends?.recent_split).length;
    const withRunRate = allStocks.filter(s => s.debug_dividends?.used_run_rate).length;
    const withBuffettScore = allStocks.filter(s => s.buffett_score !== null);
    const gradeA = allStocks.filter(s => s.buffett_grade === 'A').length;
    const gradeB = allStocks.filter(s => s.buffett_grade === 'B').length;
    const gradeC = allStocks.filter(s => s.buffett_grade === 'C').length;
    const gradeD = allStocks.filter(s => s.buffett_grade === 'D').length;
    const withFCFYield = allStocks.filter(s => s.fcf_yield !== null).length;
    const withEPSGrowth = allStocks.filter(s => s.eps_growth_5y !== null).length;
    const withPEG = allStocks.filter(s => s.peg_ratio !== null).length;
    
    console.log('\n📊 Statistiques des métriques:');
    console.log(`  - Actions avec P/E ratio: ${withPE.length}/${allStocks.length}`);
    console.log(`  - Actions avec EPS TTM: ${withEPS.length}/${allStocks.length}`);
    console.log(`  - Actions avec payout ratio: ${withPayout.length}/${allStocks.length}`);
    console.log(`  - Actions avec splits récents: ${withSplits}/${allStocks.length}`);
    console.log(`  - Actions avec run-rate post-split: ${withRunRate}/${allStocks.length}`);
    console.log(`  - Actions avec conflits de rendements: ${withConflict}/${allStocks.length}`);
    if (KEEP_ADR) console.log(`  - ADR dans US: ${adrCount}`);
    
    console.log('\n📈 Statistiques Buffett:');
    console.log(`  - Actions avec ROE: ${allStocks.filter(s => s.roe !== null).length}/${allStocks.length}`);
    console.log(`  - Actions avec D/E: ${allStocks.filter(s => s.de_ratio !== null).length}/${allStocks.length}`);
    console.log(`  - Actions avec ROIC: ${allStocks.filter(s => s.roic !== null).length}/${allStocks.length}`);
    console.log(`  - Actions avec score Buffett: ${withBuffettScore.length}/${allStocks.length}`);
    
    console.log('\n🏆 Distribution Grades Buffett:');
    console.log(`  - Grade A (≥80): ${gradeA} actions`);
    console.log(`  - Grade B (≥60): ${gradeB} actions`);
    console.log(`  - Grade C (≥40): ${gradeC} actions`);
    console.log(`  - Grade D (<40): ${gradeD} actions`);
    
    console.log('\n💰 Statistiques Value/Growth:');
    console.log(`  - Actions avec FCF Yield: ${withFCFYield}/${allStocks.length}`);
    console.log(`  - Actions avec EPS Growth 5Y: ${withEPSGrowth}/${allStocks.length}`);
    console.log(`  - Actions avec PEG Ratio: ${withPEG}/${allStocks.length}`);
    
    if (withPayout.length > 0) {
        console.log('\n📊 Distribution Payout Ratio:');
        console.log(`  - Conservative (<30%): ${withPayout.filter(s => s.payout_status === 'conservative').length}`);
        console.log(`  - Modéré (30-60%): ${withPayout.filter(s => s.payout_status === 'moderate').length}`);
        console.log(`  - Élevé (60-80%): ${withPayout.filter(s => s.payout_status === 'high').length}`);
        console.log(`  - Très élevé (80-100%): ${withPayout.filter(s => s.payout_status === 'very_high').length}`);
        console.log(`  - Non soutenable (>100%): ${withPayout.filter(s => s.payout_status === 'unsustainable').length}`);
    }
    
    console.log(`\n📊 Cache hits: ${successCache.size} symboles optimisés`);
}

if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

main().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
