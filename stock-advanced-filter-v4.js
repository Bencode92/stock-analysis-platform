// stock-advanced-filter.js
// Version 4.0 - Ajout du payout ratio TTM et métriques financières avancées
// Nouvelles fonctionnalités:
// - Payout ratio TTM calculé depuis DPS/EPS
// - EPS TTM dérivé du P/E ratio
// - Dividend coverage ratio
// - Validation améliorée des données financières
// - Logs enrichis pour debug du payout ratio

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
        
        if (