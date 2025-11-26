// stock-advanced-filter.js
// Version 3.21 - Support sélection de régions via REGIONS env variable
// Changements v3.21:
// - Ajout support REGIONS env (all, us, europe, asia, us-europe, us-asia, europe-asia)
// - Chargement conditionnel des CSV selon régions sélectionnées
// - tops_overview.json généré uniquement avec les régions traitées
// Corrections v3.20:
// - Blocage de l'override API après split récent (évite l'écrasement du calcul correct)
// - Run-rate robuste même sans dividendes post-split dans le feed
// - Utilisation du dernier dividende connu (déjà ajusté) × fréquence
// - ETR: yield corrigé à ~2.71% au lieu de 5.19% (API incorrecte après split)
// - Amélioration du logging pour debug des splits
// Corrections v3.19:
// - Ajout du run-rate post-split quand TTM incomplet après split
// - ETR: utilise dernier dividende post-split (0.60) × fréquence (4) = 2.40$ 
// - Yield corrigé à ~2.71% au lieu de 0.68%
// - Amélioration calcul médiane sur montants post-split uniquement si disponibles
// Corrections v3.18:
// - Resserre la détection "déjà ajusté" à r≈1 (±15%) au lieu de 0.5-2.0
// - Corrige ETR: rendement ~2.76% au lieu de ~5.3%
// - Passe le facteur à splitSeriesAlreadyAdjusted pour détection précise
// - Priorise calc sur API après split récent
// - Logging amélioré pour debug des ajustements de splits
// Corrections v3.17.4:
// - Désactivation du réordonnancement cache pour endpoints sensibles (dividends, time_series)
// - Clé de cache précise incluant exchange et mic_code
// - Correction des étiquettes de source pour refléter la vraie origine (API vs calc)
// - Ajout de logs debug pour la fenêtre TTM
// Corrections v3.17.3:
// - Fix regex cassée avec parenthèses non fermées dans resolveSymbolSmart
// - Utilisation directe du Set US_MICS pour éviter les erreurs de regex
// Corrections v3.17.2:
// - Fix parseSplitFactor pour accepter "2:1", "2/1", "2-1", "2 for 1", etc.
// - Résolution du bug ETR (split 2:1 non reconnu → dividendes mal ajustés)
// Corrections v3.17.1:
// - Ajout garde-fou pour conflits de rendements (écart >40% sans split ni spéciaux)
// - Résolution conservatrice privilégiant REG ou valeur minimale
// - Objet debug_dividends pour traçabilité complète
// Corrections v3.17:
// - Détection intelligente des splits déjà ajustés par l'API
// - Estimation dynamique de la fréquence des dividendes (annuel/semestriel/trimestriel)
// - Harmonisation REG/TTM pour éviter les incohérences visuelles
// - Fix HDFCBANK/ICICIBANK (cadence annuelle, pas ×4)
// - Fix AVGO (évite double ajustement de split)
// Améliorations v3.16:
// - Garde le contexte complet (exchange/country) dans tous les appels
// - Amélioration détection pays US avec fonction dédiée
// - Correction ADR pour Euronext Paris sans casser US
// - Sécurisation fallback prix depuis time_series
// Améliorations v3.15:
// - Détection et ajustement automatique des splits d'actions
// - Identification des dividendes spéciaux via médiane
// - Yield régulier vs TTM avec sélection intelligente
// - Support ETR (split 2-for-1) et AFG (spéciaux fréquents)

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';
const KEEP_ADR = process.env.KEEP_ADR === '1'; // v3.13: toggle pour garder ou non les ADR

// ✅ v3.21: Parsing de la variable REGIONS
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

// Cache des succès pour optimiser les appels
const successCache = new Map();

// Constantes ADR
const US_MICS = new Set(['XNAS','XNGS','XNYS','BATS','ARCX','IEXG']);
const isUSMic = (mic) => US_MICS.has(mic);

// ✅ v3.16: Helper dédié pour détecter pays US
const isUSCountry = (c='') => {
  const s = normalize(c);
  return s === 'united states' || s === 'usa' || s === 'us' ||
         s === 'etats-unis' || s === 'états-unis' || s === 'etats unis';
};

// ✅ v3.16: Utilise isUSCountry au lieu de normalize(...) !== 'united states'
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

// Helper: Lecture robuste de nombres dans des chemins profonds
function pickNumDeep(obj, paths) {
    for (const p of paths) {
        const v = p.split('.').reduce((o,k)=>o?.[k], obj);
        const n = parseNumberLoose(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

// ───────── Helpers centralisés pour stratégie d'essais ─────────

// ✅ CORRECTION v3.14: Détection US robuste (évite faux positif "Nyse Euronext")
const isUS = (ex = '', country = '') => {
  const mic = toMIC(ex, country);
  if (mic) return isUSMic(mic);
  // Regex plus stricte avec word boundary et exclusion Euronext
  return /\b(NASDAQ|New York Stock Exchange|NYSE(?!\s*Euronext)|NYSE\s*Arca|NYSE\s*American|CBOE|BATS)\b/i
    .test(ex || '');
};

// Mappe échange → nom attendu TD pour US
function usExchangeName(ex='') {
    if (/nasdaq/i.test(ex)) return 'NASDAQ';
    if (/new york stock exchange|nyse(?!\s*euronext)/i.test(ex)) return 'NYSE';
    if (/bats|cboe/i.test(ex)) return 'BATS';
    return null;
}

const normalize = s => (s||'').toLowerCase().trim();

// MIC safe pour éviter ADR - v3.16: utilise isUSCountry
function micForRegion(stock) {
    const mic = toMIC(stock.exchange, stock.country);
    // si l'exchange est US mais le pays n'est pas US → ne pas forcer MIC US (évite ADR)
    if (!isUSCountry(stock.country) && isUSMic(mic)) return null;
    return mic;
}

// ✅ CORRECTION v3.14: Priorisation MIC pour Europe
// Construit la liste d'essais de paramètres selon la région
function tdParamTrials(symbol, stock, resolvedSym=null) {
    // si resolvedSym = "SYM:MIC", on récupère aussi le MIC
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
        if (ex) trials.push({ symbol: base, exchange: ex }); // US: utiliser exchange=
        trials.push({ symbol: base });                        // ticker pur
        if (mic) trials.push({ symbol: `${base}:${mic}` });  // dernier recours
    } else {
        // 🚀 PRIORITÉ MIC pour Europe/Asie (v3.14)
        if (mic) {
            trials.push({ symbol: `${base}:${mic}` });         // PRIORITÉ 1: suffixe SYM:MIC
            trials.push({ symbol: base, mic_code: mic });      // PRIORITÉ 2: mic_code=
        }
        trials.push({ symbol: base });                        // fallback final
        
        // variantes exchange= pour Europe/Asie (utiles sur /quote et /statistics)
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
        if (/nasdaq helsinki/.test(exLabel))                exVar.push('NASDAQ Helsinki');
        if (/taiwan/.test(exLabel))                         exVar.push('Taiwan Stock Exchange');
        
        for (const ex of exVar) trials.push({ symbol: base, exchange: ex });
    }
    
    return trials;
}

// ✅ v3.17.4: FIX cache avec clé précise et désactivation du réordonnancement pour endpoints sensibles
async function fetchTD(endpoint, trials, extraParams = {}) {
    // Clé de cache précise incluant tous les paramètres importants
    const makeKey = (t) => `${endpoint}:${t.symbol || ''}:${t.exchange || ''}:${t.mic_code || ''}`;

    // ⚠️ Pour les endpoints sensibles, on ne réordonne PAS par cache
    const CACHE_REORDER_UNSAFE = ['dividends', 'time_series', 'splits'];
    const cacheReorderUnsafe = CACHE_REORDER_UNSAFE.includes(endpoint);

    let cachedParams = successCache.get(makeKey(trials[0]));
    if (cachedParams && !cacheReorderUnsafe) {
        trials = [cachedParams, ...trials.filter(t => makeKey(t) !== makeKey(cachedParams))];
    }

    for (const p of trials) {
        try {
            const { data } = await axios.get(`https://api.twelvedata.com/${endpoint}`, {
                params: { ...p, ...extraParams, apikey: CONFIG.API_KEY },
                timeout: 15000
            });
            if (data && data.status !== 'error') {
                successCache.set(makeKey(p), p);   // ✅ on mémorise par paramètres exacts
                if (CONFIG.DEBUG) console.log(`[TD OK ${endpoint}]`, p);
                return data;
            }
            if (CONFIG.DEBUG) console.warn(`[TD FAIL ${endpoint}]`, p, data?.message || data?.status);
        } catch (e) {
            if (CONFIG.DEBUG && e.response?.status !== 404) {
                console.warn(`[TD EXC ${endpoint}]`, p, e.message);
            }
        }
    }
    return null;
}

// ───────── Exchange → MIC (multi-synonymes) + fallback par pays ─────────
const EX2MIC_PATTERNS = [
    // Asie
    ['taiwan stock exchange',           'XTAI'],
    ['gretai securities market',        'ROCO'],   // Taipei Exchange (ex-GTSM)
    ['hong kong exchanges and clearing','XHKG'],
    ['shenzhen stock exchange',         'XSHE'],
    ['korea exchange (stock market)',   'XKRX'],
    ['korea exchange (kosdaq)',         'XKOS'],
    ['national stock exchange of india','XNSE'],
    ['stock exchange of thailand',      'XBKK'],
    ['bursa malaysia',                  'XKLS'],
    ['philippine stock exchange',       'XPHS'],

    // Europe
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
    ['nasdaq helsinki',                 'XHEL'],

    // USA
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
    'china':'XSHG' // si "Shenzhen", l'intitulé d'exchange donne XSHE via le pattern
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

// ───────── Helpers de désambiguïsation ─────────
const US_EXCH = /nasdaq|nyse|arca|amex|bats/i;
const LSE_IOB = /^[0][A-Z0-9]{3}$/; // codes LSE "0XXX" (IOB)

// Valide que le nom ressemble (≥1 mot de ≥3 lettres en commun)
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

// Annuaire Twelve Data
async function tdStocksLookup({ symbol, country, exchange }) {
    try {
        const { data } = await axios.get('https://api.twelvedata.com/stocks', {
            params: { symbol, country, exchange, apikey: CONFIG.API_KEY }, timeout: 15000
        });
        const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data)?data:[]);
        return arr;
    } catch { return []; }
}

// Score des candidats /stocks - v3.16: utilise isUSCountry
function rankCandidate(c, wanted){
    let s = 0;
    const micWanted = toMIC(wanted.exchange, wanted.country);
    if (micWanted && c.mic_code === micWanted) s += 3;                             // MIC exact
    if (normalize(c.exchange).includes(normalize(wanted.exchange))) s += 2;        // libellé d'exchange
    if (LSE_IOB.test(c.symbol)) s += 1;                                            // LSE "0XXX"
    if (US_EXCH.test(c.exchange||"") && !isUSCountry(wanted.country)) s -= 3;     // évite ADR US
    return s;
}

// Quote robuste (essaye SYM:MIC, puis mic_code, puis SYM brut)
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

// Résolution locale "simple" → renvoie SYM:MIC si on connaît le MIC
function resolveSymbol(symbol, stock) {
    if (/:/.test(symbol)) return symbol;
    const mic = micForRegion(stock);
    return mic ? `${symbol}:${mic}` : symbol;
}

// ✅ CORRECTION v3.14: Court-circuit pour Europe/Asie
// ✅ CORRECTION v3.17.3: Fix regex cassée avec variante robuste sans regex
// Résolution "smart": test direct, sinon /stocks → meilleur candidat - v3.16: utilise isUSCountry
async function resolveSymbolSmart(symbol, stock) {
    const mic = toMIC(stock.exchange, stock.country);

    // 🚀 FAST PATH v3.14: Priorité absolue pour Europe/Asie avec MIC connu
    if (mic && !isUSMic(mic)) {
        const qEU = await tryQuote(symbol, mic);
        if (qEU && nameLooksRight(qEU.name, stock.name)) {
            if (CONFIG.DEBUG) console.log(`[FAST PATH] ${symbol} → ${symbol}:${mic} (${stock.country})`);
            return `${symbol}:${mic}`;
        }
    }

    // 1) essai direct sur le ticker (avec MIC si dispo)
    const q = await tryQuote(symbol, mic);
    const looksUS  = q?.exchange && US_EXCH.test(q.exchange);
    const okMarket = !(looksUS && !isUSCountry(stock.country));
    const okName   = q?.name ? nameLooksRight(q.name, stock.name) : true;

    if (q && okMarket && okName) {
        return mic ? `${symbol}:${mic}` : symbol;         // symbole final (suffixé si on sait le MIC)
    }

    // 2) lookup /stocks pour symbole TD non ambigu (priorité MIC voulu, LSE 0XXX)
    const cand = await tdStocksLookup({ symbol, country: stock.country, exchange: stock.exchange });
    if (cand.length) {
        cand.sort((a,b)=>rankCandidate(b,stock) - rankCandidate(a,stock));
        const best = cand[0]; // ex: 0QOK (Roche)

        // Si best.symbol est déjà "0XXX", inutile de suffixer
        const bestSym = LSE_IOB.test(best.symbol) ? best.symbol
                       : (best.mic_code ? `${best.symbol}:${best.mic_code}` : best.symbol);

        // On valide que le quote obtenu colle au nom/marché
        const qBest = await tryQuote(best.symbol, best.mic_code);
        if (qBest) {
            const okM = !(US_EXCH.test(qBest.exchange||"") && !isUSCountry(stock.country));
            const okN = nameLooksRight(qBest.name || '', stock.name);
            if (okM && okN) return bestSym;
        }
    }

    // 3) dernier recours : mapping simple
    const fallback = resolveSymbol(symbol, stock);
    
    // ✅ v3.17.3: Variante robuste sans regex pour éviter les erreurs de syntaxe
    // Si le fallback atterrit sur un MIC US alors que le country n'est pas US → refuse (évite ADR)
    // extrait le MIC s'il y en a un : "SYM:MIC"
    const micInFallback = fallback && fallback.includes(':') ? fallback.split(':')[1] : null;
    
    if (!isUSCountry(stock.country) && micInFallback && US_MICS.has(micInFallback)) {
        return null; // évite ADR US quand le pays n'est pas US
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
            exchange: row['Bourse de valeurs'] || row['Exchange'] || ''
        })).filter(s => s.symbol);
    } catch (error) {
        console.error(`Erreur ${filepath}: ${error.message}`);
        return [];
    }
}

// ───────── Fonctions refactorisées avec fetchTD - v3.16: contexte complet ─────────

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
            console.log(
                `[YTD] ${resolved} | yearStart=${yearStart} | basis=${ytdBar?.date ?? 'N/A'} close=${ytdBar?.close ?? 'N/A'} | ` +
                `prev=${prev?.date ?? 'N/A'} closePrev=${prev?.close ?? 'N/A'} | current=${current}`
            );
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
            ytd_meta: { 
                year_start: yearStart, 
                basis_date: ytdBar?.date ?? null, 
                basis_close: ytdBar?.close ?? null 
            },
            _series_meta: {
                symbol_used: data.symbol || trials[0]?.symbol || resolved,
                exchange: meta.exchange ?? null,
                currency: meta.currency ?? null,
                timezone: meta.exchange_timezone ?? meta.timezone ?? null
            },
            __last_close: current,
            __prev_close: prev,
            __hi52: high52,
            __lo52: low52
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
        
        // v3.13: Moyenne sur années complètes uniquement
        const byYear = {};
        for (const d of dividends) {
            const y = new Date(d.ex_date).getFullYear();
            byYear[y] = (byYear[y] || 0) + d.amount;
        }
        
        // Prendre 1 à 3 années PLEINES (exclure l'année courante)
        const nowYear = new Date().getFullYear();
        const fullYears = Object.keys(byYear).map(Number).filter(y => y < nowYear).sort();
        const lastYears = fullYears.slice(-3);
        const avgPerYear = lastYears.length ? lastYears.reduce((s,y)=>s+byYear[y],0) / lastYears.length : 0;

        const dividendGrowth = calculateDividendGrowth(dividends);

        return {
            dividend_yield_ttm: parseNumberLoose(data.meta?.dividend_yield) ?? null,
            dividends_history: dividends.sort((a,b)=>b.ex_date.localeCompare(a.ex_date)).slice(0,10),
            dividends_full: dividends,  // v3.15: AJOUT série complète
            avg_dividend_per_year: avgPerYear,
            total_dividends_ttm: totalTTM,
            dividend_growth_3y: dividendGrowth
        };
    } catch (e) {
        if (CONFIG.DEBUG) console.error('[DIVIDENDS EXC]', symbol, e.message);
        return {};
    }
}

async function getStatisticsData(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        const resolved = resolveSymbol(symbol, stock);
        const trials = tdParamTrials(symbol, stock, resolved);
        
        const data = await fetchTD('statistics', trials, { dp: 6 });
        if (!data) return {};

        const root = data.statistics || data || {};
        
        const market_cap = pickNumDeep(root, [
            'valuations_metrics.market_capitalization',
            'market_capitalization',
            'financials.market_capitalization',
            'overview.market_cap'
        ]);
        
        const pe_ratio = pickNumDeep(root, [
            'valuations_metrics.trailing_pe',
            'valuations_metrics.pe_ratio',
            'overview.pe_ratio',
            'pe_ratio',
            'pe'
        ]);
        
        const eps_ttm = pickNumDeep(root, [
            'financials.income_statement.diluted_eps_ttm',
            'financials.income_statement.eps_ttm',
            'overview.eps',
            'earnings_per_share',
            'eps'
        ]);
        
        const payout_frac = pickNumDeep(root, ['dividends_and_splits.payout_ratio']);
        
        // v3.13: Séparer trailing et forward yield
        const trailing_yield = pickNumDeep(root, [
            'dividends_and_splits.trailing_annual_dividend_yield'
        ]);
        const forward_yield = pickNumDeep(root, [
            'dividends_and_splits.forward_annual_dividend_yield'
        ]);
        
        const beta = pickNumDeep(root, ['stock_price_summary.beta','beta']);
        const shares_outstanding = pickNumDeep(root, [
            'stock_statistics.shares_outstanding',
            'overview.shares_outstanding',
            'financials.shares_outstanding'
        ]);
        
        // v3.15: AJOUT split info
        const last_split_factor = root?.dividends_and_splits?.last_split_factor ?? null;
        const last_split_date   = root?.dividends_and_splits?.last_split_date   ?? null;

        return {
            market_cap: Number.isFinite(market_cap) ? market_cap : null,
            pe_ratio: Number.isFinite(pe_ratio) ? pe_ratio : null,
            eps_ttm: Number.isFinite(eps_ttm) ? eps_ttm : null,
            payout_ratio_api_pct: Number.isFinite(payout_frac) ? payout_frac * 100 : null,
            dividend_yield_trailing_pct: Number.isFinite(trailing_yield) ? trailing_yield * 100 : null,
            dividend_yield_forward_pct: Number.isFinite(forward_yield) ? forward_yield * 100 : null,
            beta: Number.isFinite(beta) ? beta : null,
            shares_outstanding: Number.isFinite(shares_outstanding) ? shares_outstanding : null,
            last_split_factor,
            last_split_date
        };
    } catch (error) {
        if (CONFIG.DEBUG) console.error('[STATISTICS EXCEPTION]', symbol, error.message);
        return {};
    }
}

// Market cap avec handling spécial pour symboles déjà résolus - v3.16: contexte complet
async function getMarketCapDirect(symbol, stock) {
    try {
        await pay(CONFIG.CREDITS.MARKET_CAP);
        
        // Si déjà résolu avec :MIC, ne pas re-résoudre
        const isResolved = /:/.test(symbol);
        const trials = isResolved 
            ? [{ symbol }]
            : tdParamTrials(symbol, stock);
        
        const data = await fetchTD('market_cap', trials);
        if (!data) return null;
        
        // Format "série": { market_cap: [{date, value}, ...] }
        const series = Array.isArray(data?.market_cap) ? data.market_cap
                     : Array.isArray(data?.values)     ? data.values
                     : Array.isArray(data?.data)       ? data.data
                     : null;
        
        if (series && series.length) {
            const sorted = series.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
            const last = sorted.at(-1);
            const mc = parseNumberLoose(last?.value ?? last?.market_cap ?? last?.close);
            return Number.isFinite(mc) ? mc : null;
        }
        
        // Format "valeur simple": { market_cap: "..." } ou { value: "..." }
        const raw = data?.market_cap ?? data?.value;
        const mc = parseNumberLoose(raw);
        return Number.isFinite(mc) ? mc : null;
    } catch (e) {
        if (CONFIG.DEBUG) console.error('[MARKET_CAP EXC]', symbol, e.message);
        return null;
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

// ---------- DIVIDENDS HELPERS (v3.15) ----------
// ✅ FIX v3.17.2: parseSplitFactor corrigé pour reconnaître "2:1" de Twelve Data
function parseSplitFactor(s){
  if (!s) return 1;
  const str = String(s).trim();

  // Accepte: "2:1", "2/1", "2-1", "2 for 1", "2-for-1", "2 / 1", etc.
  const m = str.match(/(\d+(?:\.\d+)?)\s*(?:[:\/-]|\s*for\s*)\s*(\d+(?:\.\d+)?)/i);
  if (!m) return 1;

  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 1;

  return a / b; // "2:1" => 2 ; "1:2" => 0.5
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

// ✅ FIX v3.18: Détection précise avec tolérance serrée
function splitSeriesAlreadyAdjusted(divs, splitDate, factor = 1){
  if (!splitDate || !factor || factor === 1) return false;
  
  const sd = new Date(splitDate);
  const pre  = divs.filter(d => new Date(d.ex_date) < sd).map(d => d.amount).filter(a => a > 0);
  const post = divs.filter(d => new Date(d.ex_date) >= sd).map(d => d.amount).filter(a => a > 0);
  
  // Besoin d'au moins 2 dividendes de chaque côté
  if (pre.length < 2 || post.length < 2) return false;
  
  const medianPre = median(pre);
  const medianPost = median(post);
  
  if (!medianPre || !medianPost) return false;
  
  const r = medianPre / medianPost;
  
  if (!Number.isFinite(r) || r <= 0) return false;
  
  // ✅ CORRECTION v3.18: Tolérance serrée autour de 1 (±15%)
  const TOLERANCE = 0.15;
  const isAdjusted = Math.abs(r - 1) <= TOLERANCE;
  
  // Détection alternative: si r ≈ factor, la série n'est PAS ajustée
  const needsAdjustment = Math.abs(r - factor) <= (TOLERANCE * factor);
  
  // Logging détaillé
  if (CONFIG.DEBUG) {
    console.log(`[SPLIT CHECK] ratio=${r.toFixed(2)}, factor=${factor}, ` +
                `adjusted=${isAdjusted}, needsAdj=${needsAdjustment}, ` +
                `decision=${isAdjusted && !needsAdjustment ? 'SKIP' : 'APPLY'}`);
  }
  
  // La série est déjà ajustée si r≈1 ET non si r≈factor
  return isAdjusted && !needsAdjustment;
}

// ✅ FIX v3.18: Passer le facteur à la fonction de détection
function maybeAdjustForSplit(divs, splitDate, factor){
  if (!splitDate || !factor || factor === 1) return divs;
  return splitSeriesAlreadyAdjusted(divs, splitDate, factor) ? divs
       : adjustDividendsForSplit(divs, splitDate, factor);
}

// Estime la cadence (1,2,4,12) à partir des 24 derniers mois (hors spéciaux)
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

// Aligne REG sur TTM si pas de spéciaux et écart trop grand
function clampRegToTTM(reg, ttm, hasSpecial){
  if (!Number.isFinite(reg) || !Number.isFinite(ttm) || hasSpecial) return reg;
  const ratio = reg / Math.max(ttm, 1e-6);
  return (ratio < 0.5 || ratio > 2.0) ? ttm : reg;
}

async function enrichStock(stock) {
    console.log(`  📊 ${stock.symbol}...`);
    
    // Résolution robuste une fois pour toutes
    const resolved = await resolveSymbolSmart(stock.symbol, stock);
    if (CONFIG.DEBUG) console.log('[RESOLVED]', stock.symbol, '→', resolved || '(none)');
    
    // 📊 LOGGING v3.14: Détection ADR améliorée
    const wasADR = isADRLike(stock);
    if (CONFIG.DEBUG && resolved) {
        console.log(`[RESOLVE] ${stock.symbol} | Exchange: "${stock.exchange}" | Country: ${stock.country}`);
        console.log(`  → Resolved: ${resolved} | ADR? ${wasADR}`);
        if (wasADR && stock.country === 'France') {
            console.warn(`  ⚠️ French stock marked as ADR - CHECK THIS!`);
        }
    }
    
    // Si on n'a rien résolu et que l'exchange du CSV est US alors que le pays n'est pas US → ADR
    if (!resolved && isUS(stock.exchange, stock.country) && !isUSCountry(stock.country)) {
        if (CONFIG.DEBUG) console.log(`[ADR] ${stock.symbol} détecté comme ADR`);
        stock.is_adr = true; // Tag pour traçabilité
        // On continue avec le symbole brut pour récupérer les données US
    }
    
    // ✅ v3.16: On calcule tout en parallèle avec contexte complet
    const sym = resolved || stock.symbol;  // symbole final (évent. suffixé :MIC)
    const ctx = stock;                     // garde exchange + country d'origine
    const [perf, quote, dividends, stats, mcDirect] = await Promise.all([
        getPerformanceData(sym, ctx),
        getQuoteData(sym, ctx),
        getDividendData(sym, ctx),
        getStatisticsData(sym, ctx),
        getMarketCapDirect(sym, ctx)
    ]);
    
    // Fallback prix & range depuis la série si quote indisponible
    let price = quote?.price ?? null;
    let change_percent = quote?.percent_change ?? null;
    let range_52w = quote?.fifty_two_week?.range ?? null;
    
    // ✅ v3.16: sécurisation du fallback prix depuis time_series
    if (!quote && perf && Number.isFinite(perf.__last_close)) {
        const p = perf.__last_close;
        const prev = perf.__prev_close;
        price = p ?? null;
        change_percent = (p && prev) ? ((p - prev) / prev * 100) : null;
        if (!range_52w && perf.__hi52 && perf.__lo52) {
            range_52w = `${Number(perf.__lo52).toFixed(6)} - ${Number(perf.__hi52).toFixed(6)}`;
        }
    }
    
    // Normalisation LSE (GBX → GBP) pour la cohérence des ratios basés sur le prix
    const usedCurrency = quote?._meta?.currency ?? perf?._series_meta?.currency ?? null;
    if (usedCurrency === 'GBX' && Number.isFinite(price)) {
        price = price / 100; // 7450 GBX -> 74.50 GBP
        if (CONFIG.DEBUG) console.log(`[GBX→GBP] ${stock.symbol}: price converted from GBX to GBP`);
    }
    
    // Fallback prix via market_cap / shares_outstanding
    if (!price) {
        // Essai de reconstitution du prix via statistics (market_cap / shares)
        if (Number.isFinite(stats?.market_cap) && Number.isFinite(stats?.shares_outstanding) && stats.shares_outstanding > 0) {
            price = stats.market_cap / stats.shares_outstanding;
            if (CONFIG.DEBUG) console.log(`[FALLBACK PRICE] ${stock.symbol}: price = ${price} from market_cap/shares`);
            // on n'a pas de variation jour fiable sans quote/série
            change_percent = null;
            // range 52w restera null si on n'a pas la série
        }
    }
    
    if (!price) {
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
    
    // ---- Dividend yields (split-aware + specials) v3.20 ----
    const splitF = parseSplitFactor(stats?.last_split_factor);
    const splitD = stats?.last_split_date ? new Date(stats.last_split_date) : null;
    const recentSplit = !!(splitD && ((Date.now() - splitD.getTime())/86400000) < 450);

    // Série complète avec ajustement intelligent v3.18
    const fullDivsRaw = dividends?.dividends_full || [];
    const fullDivs = maybeAdjustForSplit(fullDivsRaw, splitD, splitF)
      .sort((a,b)=>b.ex_date.localeCompare(a.ex_date));

    // Fenêtre TTM
    const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const last12m = fullDivs.filter(d => new Date(d.ex_date) > oneYearAgo);

    // ✅ v3.17.4: Log de debug pour la fenêtre TTM
    if (CONFIG.DEBUG && last12m.length > 0) {
        const windowDbg = last12m.map(d => `${d.ex_date}:${d.amount.toFixed(4)}`).join(', ');
        console.log(`[TTM WINDOW ${stock.symbol}]`, windowDbg, '| sum =', last12m.reduce((s, d) => s + d.amount, 0).toFixed(3));
    }

    // ✅ v3.20: Amélioration - médiane post-split si disponible, sinon récents
    const postSplitDivs = splitD ? fullDivs.filter(d => new Date(d.ex_date) >= splitD) : [];
    const recentAmtsAll = fullDivs.slice(0, 8).map(d => d.amount).filter(a => a > 0);
    const recentAmtsPost = postSplitDivs.slice(0, 8).map(d => d.amount).filter(a => a > 0);
    
    // Utiliser les montants post-split si disponibles, sinon tous les montants récents
    const baseAmts = recentAmtsPost.length >= 2 ? recentAmtsPost : recentAmtsAll;
    const m = median(baseAmts);
    const isSpecial = (a) => (m != null) && a > m * 1.6;

    // ✅ v3.20: TTM initial (potentiellement incomplet après split)
    let ttmSumCalc = last12m.reduce((s, d) => s + (d.amount || 0), 0);
    const ttmSpecial = last12m.filter(d => isSpecial(d.amount))
                              .reduce((s, d) => s + (d.amount || 0), 0);
    const specialShare = ttmSumCalc > 0 ? (ttmSpecial / ttmSumCalc * 100) : 0;

    // Estime la fréquence réelle (annuel/semestriel/trimestriel/mensuel)
    const freq = estimateFrequency(fullDivs, isSpecial); // ← clé pour Inde/HK
    
    if (CONFIG.DEBUG && freq !== 4) {
        console.log(`[FREQ] ${stock.symbol}: Fréquence détectée = ${freq} (pas 4)`);
    }

    // Si le calc TTM est visiblement incomplet (trop peu de versements vs cadence)
    const nonSpecCount12m = last12m.filter(d => !isSpecial(d.amount)).length;
    const expectedMin = Math.max(1, Math.floor(freq * 0.6));

    // ✅ v3.20: NEW - Run-rate robuste même sans dividendes post-split
    // Priorité : 1) premier post-split, 2) dernier dans TTM, 3) médiane régulière
    const lastKnownAmt = 
        (postSplitDivs.length > 0 ? postSplitDivs[0].amount : null) ??
        (last12m.length > 0 ? last12m[0].amount : null) ??
        median(baseAmts.filter(a => !isSpecial(a)));
    
    let usedRunRate = false;
    if (recentSplit && nonSpecCount12m < expectedMin && Number.isFinite(lastKnownAmt) && freq) {
        // Utiliser le run-rate basé sur le dernier dividende connu
        ttmSumCalc = lastKnownAmt * freq;  // ex: 0.60 × 4 = 2.40 pour ETR
        usedRunRate = true;
        
        if (CONFIG.DEBUG) {
            console.log(`[RUN-RATE ${stock.symbol}] TTM incomplet (${nonSpecCount12m}/${expectedMin}), ` +
                       `using ${lastKnownAmt.toFixed(4)} × ${freq} = ${ttmSumCalc.toFixed(2)}`);
        }
    }

    // "Régulier" = médiane des montants non spéciaux × fréquence estimée
    const regularQ = median(baseAmts.filter(a => !isSpecial(a)));
    const annualRegular = regularQ ? regularQ * freq : null;

    // Yields candidats (on privilégie le calc si plausible)
    const yield_ttm_api  = Number.isFinite(stats?.dividend_yield_trailing_pct)
      ? +stats.dividend_yield_trailing_pct.toFixed(2) : null;
    const yield_ttm_calc = (price > 0 && ttmSumCalc)
      ? +((ttmSumCalc / price) * 100).toFixed(2) : null;
    let   yield_regular  = (price > 0 && annualRegular)
      ? +((annualRegular / price) * 100).toFixed(2) : null;
    const yield_fwd      = Number.isFinite(stats?.dividend_yield_forward_pct)
      ? +stats.dividend_yield_forward_pct.toFixed(2) : null;

    let dividend_yield_ttm = yield_ttm_calc;

    // ✅ v3.20: Tracker de source TTM amélioré
    let usedTtmSource = usedRunRate ? 'calc-runrate' : 'calc';

    // ✅ v3.20: BLOCAGE de l'override API si split récent
    // Ne jamais faire confiance à l'API juste après un split (souvent incorrecte)
    if (!usedRunRate && !recentSplit && yield_ttm_api != null && (
        dividend_yield_ttm == null ||
        nonSpecCount12m < expectedMin ||
        dividend_yield_ttm <= 0 || 
        dividend_yield_ttm > 20
    )) {
        dividend_yield_ttm = yield_ttm_api;
        usedTtmSource = 'api';
    }

    // ✅ v3.20: Ne pas aligner REG sur un TTM venant de l'API après split
    const refForClamp = (usedTtmSource === 'api' && recentSplit) ? null : dividend_yield_ttm;
    yield_regular = clampRegToTTM(yield_regular, refForClamp ?? yield_regular, specialShare >= 20);

    // ✅ v3.20: Logging amélioré pour debug
    if (CONFIG.DEBUG) {
        console.log(`[DIVY GUARD] ${stock.symbol}: recentSplit=${recentSplit}, ` +
                   `nonSpecCount12m=${nonSpecCount12m}, expectedMin=${expectedMin}, ` +
                   `usedRunRate=${usedRunRate}, usedTtmSource=${usedTtmSource}, ` +
                   `api=${yield_ttm_api}%`);
        
        if (usedRunRate) {
            console.log(`[RUN-RATE DETAIL] base=${lastKnownAmt?.toFixed(4)} × freq=${freq} ` +
                       `=> TTM=${ttmSumCalc.toFixed(2)} => yield=${yield_ttm_calc}%`);
        }
        
        if (recentSplit && yield_ttm_api && Math.abs(yield_ttm_api - (yield_ttm_calc || 0)) > 1) {
            console.warn(`[SPLIT WARNING] ${stock.symbol}: API yield (${yield_ttm_api}%) ` +
                        `diverge from calc (${yield_ttm_calc}%) after recent split`);
        }
    }

    // ✅ v3.20: Choix du yield avec traçabilité de source
    let dividendYield, dividend_yield_src;
    let debug_dividends = null;
    
    // Choix final du yield
    dividendYield = dividend_yield_ttm ?? yield_regular ?? yield_fwd ?? null;
    dividend_yield_src =
      usedTtmSource === 'calc-runrate' ? 'TTM (run-rate post-split)' :
      usedTtmSource === 'api'          ? 'TTM (API)' :
      dividend_yield_ttm != null        ? 'TTM' :
      yield_regular != null             ? 'REG' :
      yield_fwd != null                 ? 'FWD' : null;

    // --- v3.17.1: GARDE-FOU ETR - Détection conflits de rendements ---
    {
      const vals = [yield_ttm_api, yield_ttm_calc, yield_regular, yield_fwd]
        .filter(v => Number.isFinite(v) && v > 0);
      let dividend_consistency = 'ok';

      if (Number.isFinite(yield_fwd) && Number.isFinite(yield_ttm_calc) && !recentSplit && specialShare < 15) {
        const maxv = Math.max(yield_fwd, yield_ttm_calc);
        const minv = Math.min(yield_fwd, yield_ttm_calc);
        const conflict = (maxv / minv) > 1.4; // > +40%

        if (conflict) {
          dividend_consistency = 'conflict';
          
          // Log en mode DEBUG
          if (CONFIG.DEBUG) {
            console.log(`[YIELD CONFLICT] ${stock.symbol}: FWD=${yield_fwd}% vs TTM_CALC=${yield_ttm_calc}% (ratio=${(maxv/minv).toFixed(2)}) → Using ${dividend_yield_src}`);
          }

          // ⚖️ Choisir le plus "sain" :
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

      // ✅ v3.20: Expose pour debug/affichage avec source correcte
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
        dividend_yield_src: dividend_yield_src,
        ttm_source: usedTtmSource,
        ttm_window_count: last12m.length,
        used_run_rate: usedRunRate, // ✅ v3.20: flag important
        last_known_amt: lastKnownAmt, // ✅ v3.20: pour debug
        conflict_ratio: dividend_consistency === 'conflict' ? (Math.max(yield_fwd, yield_ttm_calc) / Math.min(yield_fwd, yield_ttm_calc)).toFixed(2) : null
      };
    }

    // EPS & Payout (multi-source)
    // 1) EPS : prends stats.eps_ttm si dispo, sinon fallback via P/E
    let eps_ttm = Number.isFinite(stats?.eps_ttm) ? stats.eps_ttm : null;
    if (!Number.isFinite(eps_ttm) && Number.isFinite(stats?.pe_ratio) && stats.pe_ratio > 0 && Number.isFinite(price) && price > 0) {
        eps_ttm = price / stats.pe_ratio;
    }

    // DPS utilisés pour payout
    const dps_ttm_used = Number.isFinite(ttmSumCalc) && ttmSumCalc > 0
      ? ttmSumCalc
      : (Number.isFinite(dividend_yield_ttm) && price > 0 ? (dividend_yield_ttm/100)*price : null);

    const dps_reg_used = Number.isFinite(annualRegular) && annualRegular > 0
      ? annualRegular
      : (Number.isFinite(yield_regular) && price > 0 ? (yield_regular/100)*price : null);

    // Payout TTM (priorité API déjà gérée dans stats.payout_ratio_api_pct)
    let payout_ratio_ttm = null;
    if (Number.isFinite(stats?.payout_ratio_api_pct)) {
      payout_ratio_ttm = Math.min(200, +stats.payout_ratio_api_pct.toFixed(1));
    } else if (Number.isFinite(dps_ttm_used) && Number.isFinite(eps_ttm) && eps_ttm > 0) {
      payout_ratio_ttm = Math.min(200, +((dps_ttm_used/eps_ttm)*100).toFixed(1));
    } else if (Number.isFinite(dividend_yield_ttm) && Number.isFinite(stats?.pe_ratio)) {
      payout_ratio_ttm = Math.min(200, +((dividend_yield_ttm * stats.pe_ratio)).toFixed(1));
    }

    // Payout régulier (cohérent avec REG recalé)
    const payout_ratio_regular = (Number.isFinite(dps_reg_used) && Number.isFinite(eps_ttm) && eps_ttm > 0)
      ? Math.min(200, +((dps_reg_used/eps_ttm)*100).toFixed(1))
      : null;

    // Statut & couverture
    let payout_status = null, dividend_coverage = null;
    if (Number.isFinite(payout_ratio_ttm)) {
      payout_status =
        payout_ratio_ttm < 30 ? 'conservative' :
        payout_ratio_ttm < 60 ? 'moderate'     :
        payout_ratio_ttm < 80 ? 'high'         :
        payout_ratio_ttm < 100? 'very_high'    : 'unsustainable';
      if (Number.isFinite(eps_ttm) && Number.isFinite(dps_ttm_used) && dps_ttm_used > 0) {
        dividend_coverage = Number((eps_ttm / dps_ttm_used).toFixed(2));
      }
    }
    
    // Logs DEBUG pour le payout ratio
    if (CONFIG.DEBUG && (ttmSumCalc !== null || eps_ttm !== null)) {
        console.log(
            `[PAYOUT] ${stock.symbol}: DPS=${ttmSumCalc?.toFixed(4) || 'N/A'}, EPS=${eps_ttm?.toFixed(4) || 'N/A'}, ` +
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
    
    return {
        ticker: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        country: stock.country,
        exchange: stock.exchange, // Exchange du CSV (intention)
        
        // Tag ADR
        is_adr: stock.is_adr || false,
        
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
        
        // Métriques de dividendes enrichies v3.20
        dividend_yield: dividendYield,
        dividend_yield_src,
        dividend_yield_ttm: dividend_yield_ttm,
        dividend_yield_regular: yield_regular,
        dividend_yield_forward: yield_fwd,
        dividend_special_share_ttm: Number(specialShare.toFixed(1)),  // % du TTM venant de spéciaux
        dividends_history: dividends?.dividends_history || [],
        avg_dividend_year: Number(dividends?.avg_dividend_per_year?.toFixed?.(2) ?? dividends?.avg_dividend_per_year ?? null),
        total_dividends_ttm: ttmSumCalc,              
        dividend_growth_3y: dividends?.dividend_growth_3y || null,  
        
        // MÉTRIQUES PAYOUT
        payout_ratio_ttm,
        payout_ratio_regular,
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
        
        // v3.20: Ajout de l'objet de debug amélioré
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

// Top N générique (direction: 'desc' = hausses, 'asc' = baisses)
function getTopN(stocks, { field, direction='desc', n=10, excludeADR=false }={}){
  return (stocks||[])
    .filter(s => !s.error && (!excludeADR || !s.is_adr)) // option pour exclure ADR
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
    is_adr: s.is_adr || false // inclure flag ADR
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
    // Pour les régions non-US, exclure les ADR des tops
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
                       .slice(0, 10)
                       .map(pick)
      }
    };
  }
  return out;
}

async function main() { 
    // ✅ v3.21: Affichage des régions sélectionnées
    const activeRegions = Object.entries(SELECTED_REGIONS)
        .filter(([_, v]) => v)
        .map(([k]) => k.toUpperCase())
        .join(', ');
    
    console.log(`📊 Enrichissement complet des stocks (v3.21 - Support sélection de régions)`);
    console.log(`🌍 Régions sélectionnées: ${activeRegions} (input: "${REGIONS_INPUT}")\n`);
    
    await fs.mkdir(OUT_DIR, { recursive: true });
    
    // ✅ v3.21: Chargement conditionnel des CSV
    const [usStocks, europeStocks, asiaStocks] = await Promise.all([
        SELECTED_REGIONS.us     ? loadStockCSV('data/filtered/Actions_US_filtered.csv')     : Promise.resolve([]),
        SELECTED_REGIONS.europe ? loadStockCSV('data/filtered/Actions_Europe_filtered.csv') : Promise.resolve([]),
        SELECTED_REGIONS.asia   ? loadStockCSV('data/filtered/Actions_Asie_filtered.csv')   : Promise.resolve([])
    ]);
    
    console.log(`Stocks chargés: US ${usStocks.length} | Europe ${europeStocks.length} | Asie ${asiaStocks.length}\n`);
    
    // Détection et rebasculement des ADR
    const adrFromEurope = [];
    const adrFromAsia = [];
    
    const europeFiltered = europeStocks.filter(s => {
        if (isADRLike(s)) {
            adrFromEurope.push(s);
            return false;
        }
        return true;
    });
    
    const asiaFiltered = asiaStocks.filter(s => {
        if (isADRLike(s)) {
            adrFromAsia.push(s);
            return false;
        }
        return true;
    });
    
    // v3.13: Si KEEP_ADR=1, ajouter les ADR à la région US, sinon les ignorer
    const usStocksFinal = KEEP_ADR ? [...usStocks, ...adrFromEurope, ...adrFromAsia] : usStocks;
    
    if (adrFromEurope.length || adrFromAsia.length) {
        console.log(`📋 ADR détectés:`);
        console.log(`  - Depuis Europe: ${adrFromEurope.length} (${adrFromEurope.map(s => s.symbol).join(', ')})`);
        console.log(`  - Depuis Asie: ${adrFromAsia.length} (${adrFromAsia.map(s => s.symbol).join(', ')})`);
        console.log(`  - Action: ${KEEP_ADR ? 'rebasculés vers US' : 'exclus'}`);
        console.log('');
    }
    
    // ✅ v3.21: Ne traiter que les régions sélectionnées
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
            // Métadonnées ADR
            adr_info: region.name === 'us' && KEEP_ADR ? {
                from_europe: adrFromEurope.map(s => s.symbol),
                from_asia: adrFromAsia.map(s => s.symbol)
            } : null
        }, null, 2));
        
        console.log(`✅ ${filepath}`);
    }
    
    // --------- TOPS OVERVIEW ----------
    const overview = buildOverview(byRegion);
    overview.regions_processed = activeRegions;  // ✅ v3.21: Ajoute les régions traitées
    const topsPath = path.join(OUT_DIR, 'tops_overview.json');
    await fs.writeFile(topsPath, JSON.stringify(overview, null, 2));
    console.log(`🏁 ${topsPath}`);
    
    // Statistiques sur les payout ratios
    const allStocks = [...byRegion.US, ...byRegion.EUROPE, ...byRegion.ASIA].filter(s => !KEEP_ADR || !s.is_adr);
    const withPayout = allStocks.filter(s => s.payout_ratio_ttm !== null);
    const withEPS = allStocks.filter(s => s.eps_ttm !== null);
    const withPE = allStocks.filter(s => s.pe_ratio !== null);
    const adrCount = allStocks.filter(s => s.is_adr).length;
    const withConflict = allStocks.filter(s => s.debug_dividends?.consistency === 'conflict').length;
    const withSplits = allStocks.filter(s => s.debug_dividends?.recent_split).length;
    const withRunRate = allStocks.filter(s => s.debug_dividends?.used_run_rate).length;
    
    console.log('\n📊 Statistiques des métriques:');
    console.log(`  - Actions avec P/E ratio: ${withPE.length}/${allStocks.length}`);
    console.log(`  - Actions avec EPS TTM: ${withEPS.length}/${allStocks.length}`);
    console.log(`  - Actions avec payout ratio: ${withPayout.length}/${allStocks.length}`);
    console.log(`  - Actions avec splits récents: ${withSplits}/${allStocks.length}`);
    console.log(`  - Actions avec run-rate post-split: ${withRunRate}/${allStocks.length}`);
    console.log(`  - Actions avec conflits de rendements: ${withConflict}/${allStocks.length}`);
    if (KEEP_ADR) console.log(`  - ADR dans US: ${adrCount}`);
    
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
