// stock-filter-by-volume.js
// npm i csv-parse axios
// Version 2.1 - Avec enrichissement fondamentaux Buffett (ROE, D/E) - FIXED
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) { console.error('❌ TWELVE_DATA_API_KEY manquante'); process.exit(1); }

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR = process.env.OUTPUT_DIR || 'data/filtered';
const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
const INPUTS = [
  { file: 'Actions_US.csv',     region: 'US' },
  { file: 'Actions_Europe.csv', region: 'EUROPE' },
  { file: 'Actions_Asie.csv',   region: 'ASIA' },
];

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION FONDAMENTAUX BUFFETT
// ═══════════════════════════════════════════════════════════════════════════
const FUNDAMENTALS_CACHE_FILE = path.join(DATA_DIR, 'fundamentals_cache.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours (données trimestrielles)

// Rate limit: avec plan Ultra (2584 credits/min), on peut faire ~12 stocks/min
// car chaque stock = 200 credits (100 balance_sheet + 100 income_statement)
// Délai entre requêtes = 250ms (permet burst, l'API nous throttle si besoin)
const FUNDAMENTALS_RATE_LIMIT_MS = parseInt(process.env.FUNDAMENTALS_RATE_LIMIT || '250', 10);
const MAX_NEW_FETCHES_PER_RUN = parseInt(process.env.MAX_FUNDAMENTALS_FETCH || '200', 10);

// Seuils par région
const VOL_MIN = { US: 500_000, EUROPE: 50_000, ASIA: 100_000 };

// Seuils plus fins par MIC (prioritaires sur la région)
const VOL_MIN_BY_MIC = {
  // US
  XNAS: 500_000, XNYS: 350_000, BATS: 500_000,
  // Europe
  XETR: 100_000, XPAR: 40_000, XLON: 120_000, XMIL: 80_000, XMAD: 80_000,
  XAMS: 50_000, XSTO: 60_000, XCSE: 40_000, XHEL: 40_000, XBRU: 30_000,
  XLIS: 20_000, XSWX: 20_000, XWBO: 20_000, XDUB: 20_000, XOSL: 30_000,
  // Asie
  XHKG: 100_000, XKRX: 100_000, XNSE: 50_000, XBOM: 50_000, XTAI: 60_000,
  XKOS: 100_000, XBKK: 50_000, XPHS: 20_000, XKLS: 30_000, XSHE: 100_000, ROCO: 20_000
};

// ───────── Exchange → MIC (multi-synonymes) + fallback par pays ─────────
const EX2MIC_PATTERNS = [
  // Asie
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
  // Europe
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
  // USA
  ['nasdaq',                          'XNAS'],
  ['new york stock exchange inc.',    'XNYS'],
  ['cboe bzx',                        'BATS'],
  ['cboe bzx exchange',               'BATS'],
];

const COUNTRY2MIC = {
  'switzerland':'XSWX', 'france':'XPAR', 'belgium':'XBRU', 'netherlands':'XAMS', 'portugal':'XLIS',
  'united kingdom':'XLON', 'uk':'XLON',
  'germany':'XETR', 'spain':'XMAD', 'italy':'XMIL',
  'austria':'XWBO', 'norway':'XOSL', 'ireland':'XDUB',
  'japan':'XTKS', 'hong kong':'XHKG', 'singapore':'XSES',
  'taiwan':'XTAI', 'south korea':'XKRX', 'india':'XNSE',
  'thailand':'XBKK', 'philippines':'XPHS', 'malaysia':'XKLS',
  'china':'XSHG'
};

const normalize = s => (s||'').toLowerCase().trim();

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
      params: { symbol, country, exchange, apikey: API_KEY }, timeout: 15000
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
  if (US_EXCH.test(c.exchange||"") && normalize(wanted.country) !== 'united states') s -= 3;
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
    const q1 = await attempt({ symbol: `${sym}:${mic}`, apikey: API_KEY });
    if (q1) return q1;
    const q2 = await attempt({ symbol: sym, mic_code: mic, apikey: API_KEY });
    if (q2) return q2;
  }
  return await attempt({ symbol: sym, apikey: API_KEY });
}

// ═══════════════════════════════════════════════════════════════════════════
// FONDAMENTAUX BUFFETT - CACHE & FETCH (FIXED)
// ═══════════════════════════════════════════════════════════════════════════

async function loadFundamentalsCache() {
  try {
    const txt = await fs.readFile(FUNDAMENTALS_CACHE_FILE, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.log('📁 Cache fondamentaux non trouvé, création nouveau cache');
    return { updated: null, data: {} };
  }
}

async function saveFundamentalsCache(cache) {
  cache.updated = new Date().toISOString();
  await fs.mkdir(path.dirname(FUNDAMENTALS_CACHE_FILE), { recursive: true });
  await fs.writeFile(FUNDAMENTALS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function parseFloatSafe(value) {
  if (value === null || value === undefined || value === '' || value === 'null') return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) || !Number.isFinite(parsed) ? null : parsed;
}

/**
 * Récupère le bilan (Total Debt, Total Equity) - 100 credits
 * Structure Twelve Data: { balance_sheet: [ { fiscal_date, total_debt, ... } ] }
 */
async function fetchBalanceSheet(symbol) {
  try {
    const { data, headers } = await axios.get('https://api.twelvedata.com/balance_sheet', {
      params: { symbol, apikey: API_KEY },
      timeout: 30000
    });
    
    if (DEBUG) {
      console.log(`  [DEBUG] balance_sheet ${symbol}:`, JSON.stringify(data).slice(0, 500));
      console.log(`  [DEBUG] credits used: ${headers['api-credits-used']}, left: ${headers['api-credits-left']}`);
    }
    
    // Gestion erreurs Twelve Data (code ou status)
    if (!data || data.status === 'error' || data.code) {
      console.warn(`  ⚠️ Balance sheet erreur pour ${symbol}: ${data?.message || data?.code || 'unknown'}`);
      return null;
    }
    
    // Twelve Data retourne: { balance_sheet: [...] } ou directement un array
    let balanceSheet = data.balance_sheet || data;
    if (!Array.isArray(balanceSheet)) {
      // Peut-être un objet avec les données directement
      if (data.total_debt !== undefined || data.total_shareholder_equity !== undefined) {
        balanceSheet = [data];
      } else {
        console.warn(`  ⚠️ Format inattendu balance_sheet pour ${symbol}`);
        if (DEBUG) console.log(`  [DEBUG] data keys:`, Object.keys(data));
        return null;
      }
    }
    
    if (balanceSheet.length === 0) {
      console.warn(`  ⚠️ Pas de données balance_sheet pour ${symbol}`);
      return null;
    }
    
    const latest = balanceSheet[0];
    
    // Essayer plusieurs noms de champs possibles
    const totalDebt = parseFloatSafe(latest.total_debt) 
      || parseFloatSafe(latest.long_term_debt) 
      || parseFloatSafe(latest.total_liabilities)
      || 0;
      
    const totalEquity = parseFloatSafe(latest.total_shareholder_equity) 
      || parseFloatSafe(latest.stockholders_equity)
      || parseFloatSafe(latest.total_equity)
      || parseFloatSafe(latest.shareholders_equity)
      || 0;
    
    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} parsed: debt=${totalDebt}, equity=${totalEquity}`);
    }
    
    return {
      total_debt: totalDebt,
      total_equity: totalEquity,
      total_assets: parseFloatSafe(latest.total_assets) || 0,
      fiscal_date: latest.fiscal_date || latest.date || null
    };
  } catch (error) {
    console.error(`  ❌ Erreur balance_sheet pour ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Récupère le compte de résultat (Net Income) - 100 credits
 */
async function fetchIncomeStatement(symbol) {
  try {
    const { data, headers } = await axios.get('https://api.twelvedata.com/income_statement', {
      params: { symbol, apikey: API_KEY },
      timeout: 30000
    });
    
    if (DEBUG) {
      console.log(`  [DEBUG] income_statement ${symbol}:`, JSON.stringify(data).slice(0, 500));
      console.log(`  [DEBUG] credits used: ${headers['api-credits-used']}, left: ${headers['api-credits-left']}`);
    }
    
    if (!data || data.status === 'error' || data.code) {
      console.warn(`  ⚠️ Income statement erreur pour ${symbol}: ${data?.message || data?.code || 'unknown'}`);
      return null;
    }
    
    let incomeStatement = data.income_statement || data;
    if (!Array.isArray(incomeStatement)) {
      if (data.net_income !== undefined || data.revenue !== undefined) {
        incomeStatement = [data];
      } else {
        console.warn(`  ⚠️ Format inattendu income_statement pour ${symbol}`);
        if (DEBUG) console.log(`  [DEBUG] data keys:`, Object.keys(data));
        return null;
      }
    }
    
    if (incomeStatement.length === 0) {
      console.warn(`  ⚠️ Pas de données income_statement pour ${symbol}`);
      return null;
    }
    
    const latest = incomeStatement[0];
    
    const netIncome = parseFloatSafe(latest.net_income) 
      || parseFloatSafe(latest.net_income_from_continuing_operations)
      || parseFloatSafe(latest.net_income_common_stockholders)
      || 0;
    
    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} parsed: net_income=${netIncome}`);
    }
    
    return {
      net_income: netIncome,
      revenue: parseFloatSafe(latest.revenue || latest.total_revenue) || 0,
      ebitda: parseFloatSafe(latest.ebitda) || 0,
      fiscal_date: latest.fiscal_date || latest.date || null
    };
  } catch (error) {
    console.error(`  ❌ Erreur income_statement pour ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Calcule ROE et D/E
 */
function computeFundamentalRatios(balanceSheet, incomeStatement) {
  if (!balanceSheet) {
    return { roe: null, de_ratio: null, error: 'no_balance_sheet' };
  }
  
  const { total_debt, total_equity } = balanceSheet;
  const net_income = incomeStatement?.net_income || 0;
  
  let roe = null;
  if (total_equity > 0 && incomeStatement) {
    roe = (net_income / total_equity) * 100;
    roe = Math.round(roe * 100) / 100;
  }
  
  let de_ratio = null;
  if (total_equity > 0) {
    de_ratio = total_debt / total_equity;
    de_ratio = Math.round(de_ratio * 100) / 100;
  }
  
  return {
    roe,
    de_ratio,
    net_income,
    total_debt,
    total_equity,
    balance_sheet_date: balanceSheet.fiscal_date,
    income_statement_date: incomeStatement?.fiscal_date
  };
}

/**
 * Récupère les fondamentaux pour un symbole
 */
async function fetchFundamentalsForSymbol(symbol) {
  // Balance sheet (100 credits)
  const balanceSheet = await fetchBalanceSheet(symbol);
  await new Promise(r => setTimeout(r, FUNDAMENTALS_RATE_LIMIT_MS));
  
  // Income statement (100 credits)
  const incomeStatement = await fetchIncomeStatement(symbol);
  await new Promise(r => setTimeout(r, FUNDAMENTALS_RATE_LIMIT_MS));
  
  const ratios = computeFundamentalRatios(balanceSheet, incomeStatement);
  
  return {
    symbol,
    ...ratios,
    fetched_at: new Date().toISOString()
  };
}

/**
 * Enrichit les stocks avec les fondamentaux (cache intelligent)
 */
async function enrichWithFundamentals(stocks, maxNewFetches = MAX_NEW_FETCHES_PER_RUN) {
  console.log('\n' + '═'.repeat(50));
  console.log('📈 ENRICHISSEMENT FONDAMENTAUX BUFFETT');
  console.log('═'.repeat(50));
  console.log(`⚡ Rate limit: ${FUNDAMENTALS_RATE_LIMIT_MS}ms entre requêtes`);
  console.log(`📦 Max fetches: ${maxNewFetches} par run`);
  if (DEBUG) console.log('🐛 DEBUG mode activé');
  
  const cache = await loadFundamentalsCache();
  const now = Date.now();
  
  const needsUpdate = [];
  const fromCache = [];
  
  for (const stock of stocks) {
    const ticker = stock['Ticker'];
    const cached = cache.data[ticker];
    
    if (cached && cached.fetched_at) {
      const cachedTime = new Date(cached.fetched_at).getTime();
      if (now - cachedTime < CACHE_TTL_MS) {
        stock.roe = cached.roe;
        stock.de_ratio = cached.de_ratio;
        fromCache.push(ticker);
        continue;
      }
    }
    needsUpdate.push(stock);
  }
  
  console.log(`📁 ${fromCache.length} stocks avec cache valide`);
  console.log(`🔄 ${needsUpdate.length} stocks nécessitent mise à jour`);
  
  const toProcess = needsUpdate.slice(0, maxNewFetches);
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  
  const startTime = Date.now();
  
  for (const stock of toProcess) {
    const ticker = stock['Ticker'];
    
    try {
      console.log(`  📊 [${processed + 1}/${toProcess.length}] ${ticker}...`);
      const fundamentals = await fetchFundamentalsForSymbol(ticker);
      
      cache.data[ticker] = fundamentals;
      stock.roe = fundamentals.roe;
      stock.de_ratio = fundamentals.de_ratio;
      
      if (fundamentals.roe !== null || fundamentals.de_ratio !== null) {
        console.log(`  ✅ ${ticker}: ROE=${fundamentals.roe?.toFixed(1) ?? 'N/A'}%, D/E=${fundamentals.de_ratio?.toFixed(2) ?? 'N/A'}`);
        succeeded++;
      } else {
        console.log(`  ⚠️ ${ticker}: Données incomplètes (equity=${fundamentals.total_equity}, income=${fundamentals.net_income})`);
        failed++;
      }
      
    } catch (error) {
      console.error(`  ❌ ${ticker}: Erreur -`, error.message);
      cache.data[ticker] = {
        symbol: ticker,
        roe: null,
        de_ratio: null,
        error: error.message,
        fetched_at: new Date().toISOString()
      };
      stock.roe = null;
      stock.de_ratio = null;
      failed++;
    }
    
    processed++;
    
    // Sauvegarde intermédiaire tous les 20 stocks
    if (processed % 20 === 0) {
      await saveFundamentalsCache(cache);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      console.log(`  💾 Cache sauvegardé (${processed}/${toProcess.length}) - ${rate.toFixed(1)} stocks/s`);
    }
  }
  
  // Stocks non traités (limite atteinte)
  const notProcessed = needsUpdate.slice(maxNewFetches);
  for (const stock of notProcessed) {
    const ticker = stock['Ticker'];
    const cached = cache.data[ticker];
    stock.roe = cached?.roe ?? null;
    stock.de_ratio = cached?.de_ratio ?? null;
  }
  
  await saveFundamentalsCache(cache);
  
  const totalTime = (Date.now() - startTime) / 1000;
  
  console.log('\n' + '─'.repeat(50));
  console.log('📊 RÉSUMÉ ENRICHISSEMENT:');
  console.log(`  ✅ Depuis cache: ${fromCache.length}`);
  console.log(`  🔄 Nouveaux appels: ${processed}`);
  console.log(`    - Réussis: ${succeeded}`);
  console.log(`    - Échoués/Incomplets: ${failed}`);
  console.log(`  ⏳ En attente (prochain run): ${notProcessed.length}`);
  console.log(`  ⏱️ Temps total: ${totalTime.toFixed(1)}s (${(processed/totalTime).toFixed(1)} stocks/s)`);
  console.log('─'.repeat(50));
  
  return stocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV HEADERS & HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché','roe','de_ratio'];
const REJ_HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché','Volume','Seuil','MIC','Symbole','Source','Raison'];

const csvLine = obj => HEADER.map(h => {
  const val = obj[h];
  if ((h === 'roe' || h === 'de_ratio') && val !== null && val !== undefined) {
    return `"${parseFloat(val).toFixed(2)}"`;
  }
  return `"${String(val ?? '').replace(/"/g,'""')}"`;
}).join(',');

async function readCSV(file) {
  const txt = await fs.readFile(file,'utf8');
  return parse(txt, { columns:true, skip_empty_lines:true, bom:true });
}

async function writeCSV(file, rows) {
  const out = [HEADER.join(','), ...rows.map(csvLine)].join('\n');
  await fs.mkdir(path.dirname(file), { recursive:true });
  await fs.writeFile(file, out, 'utf8');
}

async function writeCSVGeneric(file, rows, header) {
  const line = obj => header.map(h => `"${String(obj[h] ?? '').replace(/"/g,'""')}"`).join(',');
  const out = [header.join(','), ...rows.map(line)].join('\n');
  await fs.mkdir(path.dirname(file), { recursive:true });
  await fs.writeFile(file, out, 'utf8');
}

async function resolveSymbol(ticker, exchange, expectedName = '', country = '') {
  const mic = toMIC(exchange, country);
  let quote = await tryQuote(ticker, mic);
  const looksUS   = quote?.exchange && US_EXCH.test(quote.exchange);
  const okMarket  = !(looksUS && normalize(country) !== 'united states');
  const okName    = quote?.name ? nameLooksRight(quote.name, expectedName) : true;

  if (quote && okMarket && okName) {
    return { sym: ticker, quote, reason: 'direct_ok' };
  }

  const cand = await tdStocksLookup({ symbol: ticker, country, exchange });
  if (cand.length) {
    cand.sort((a,b)=>rankCandidate(b,{country,exchange}) - rankCandidate(a,{country,exchange}));
    const best = cand[0];
    const qBest = await tryQuote(best.symbol, best.mic_code);
    if (qBest) {
      const okM = !(US_EXCH.test(qBest.exchange||"") && normalize(country) !== 'united states');
      const okN = nameLooksRight(qBest.name || '', expectedName);
      if (okM && okN) {
        return { sym: best.symbol, quote: qBest, reason: 'stocks_ok' };
      }
    }
  }

  return { sym: ticker, quote: null, reason: 'fallback' };
}

async function fetchVolume(symbol) {
  try {
    const { data } = await axios.get('https://api.twelvedata.com/quote', { params:{ symbol, apikey:API_KEY }});
    const v = Number(data?.volume) || Number(data?.average_volume) || 0;
    return v;
  } catch { return 0; }
}

let lastRequest = 0;
const MIN_DELAY = 25;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < MIN_DELAY) {
    await new Promise(r => setTimeout(r, MIN_DELAY - elapsed));
  }
  lastRequest = Date.now();
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

(async ()=>{
  console.log('🚀 Démarrage du filtrage par volume + enrichissement fondamentaux v2.1\n');
  console.log(`📊 Config:`);
  console.log(`   MAX_FUNDAMENTALS_FETCH=${MAX_NEW_FETCHES_PER_RUN}`);
  console.log(`   FUNDAMENTALS_RATE_LIMIT=${FUNDAMENTALS_RATE_LIMIT_MS}ms`);
  console.log(`   DEBUG=${DEBUG}`);
  
  const allOutputs = [];
  const allRejected = [];
  const stats = { total: 0, passed: 0, failed: 0 };

  for (const {file, region} of INPUTS) {
    const src = path.join(DATA_DIR, file);
    const rows = await readCSV(src);
    console.log(`\n📊 ${region}: ${rows.length} stocks à analyser`);

    const filtered = [];
    const rejected = [];
    let processed = 0;
    
    for (const r of rows) {
      await throttle();
      
      const ticker = (r['Ticker']||'').trim();
      const exch   = r['Bourse de valeurs'] || '';
      const mic    = toMIC(exch, r['Pays'] || '');
      const { sym, quote } = await resolveSymbol(
        ticker,
        exch,
        r['Stock'] || '',
        r['Pays']  || ''
      );
      const vol = quote ? (Number(quote.volume)||Number(quote.average_volume)||0) : await fetchVolume(sym);

      const thr = VOL_MIN_BY_MIC[mic || ''] ?? VOL_MIN[region] ?? 0;
      const source = VOL_MIN_BY_MIC[mic || ''] ? `MIC:${mic}` : `REGION:${region}`;
      stats.total++;
      
      if (vol >= thr) {
        filtered.push({
          'Ticker': ticker,
          'Stock': r['Stock']||'',
          'Secteur': r['Secteur']||'',
          'Pays': r['Pays']||'',
          'Bourse de valeurs': r['Bourse de valeurs']||'',
          'Devise de marché': r['Devise de marché']||'',
          'roe': null,
          'de_ratio': null
        });
        stats.passed++;
        console.log(`  ✅ ${ticker}: ${vol.toLocaleString()} >= ${thr.toLocaleString()} (${source})`);
      } else {
        stats.failed++;
        console.log(`  ❌ ${ticker}: ${vol.toLocaleString()} < ${thr.toLocaleString()} (${source})`);
        rejected.push({
          'Ticker': ticker,
          'Stock': r['Stock']||'',
          'Secteur': r['Secteur']||'',
          'Pays': r['Pays']||'',
          'Bourse de valeurs': r['Bourse de valeurs']||'',
          'Devise de marché': r['Devise de marché']||'',
          'Volume': vol,
          'Seuil': thr,
          'MIC': mic || '',
          'Symbole': sym,
          'Source': source,
          'Raison': `Volume ${vol} < Seuil ${thr}`
        });
      }
      
      processed++;
      if (processed % 10 === 0) {
        console.log(`  Progression: ${processed}/${rows.length}`);
      }
    }

    allOutputs.push({ title: `${region}`, file: path.join(OUT_DIR, file.replace('.csv','_filtered.csv')), rows: filtered });
    allRejected.push(...rejected);

    const rejFile = path.join(OUT_DIR, file.replace('.csv','_rejected.csv'));
    await writeCSVGeneric(rejFile, rejected, REJ_HEADER);

    console.log(`✅ ${region}: ${filtered.length}/${rows.length} stocks retenus`);
    console.log(`❌ ${region}: ${rejected.length} stocks rejetés → ${rejFile}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENRICHISSEMENT FONDAMENTAUX BUFFETT
  // ═══════════════════════════════════════════════════════════════════════════
  
  let combined = allOutputs.flatMap(o => o.rows);
  combined = await enrichWithFundamentals(combined, MAX_NEW_FETCHES_PER_RUN);
  
  for (const output of allOutputs) {
    const regionTickers = new Set(output.rows.map(r => r['Ticker']));
    const enrichedRows = combined.filter(r => regionTickers.has(r['Ticker']));
    await writeCSV(output.file, enrichedRows);
    console.log(`📁 ${output.title}: ${enrichedRows.length} stocks → ${output.file}`);
  }

  await writeCSV(path.join(OUT_DIR,'Actions_filtrees_par_volume.csv'), combined);
  await writeCSVGeneric(path.join(OUT_DIR,'Actions_rejetes_par_volume.csv'), allRejected, REJ_HEADER);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RÉSUMÉ FINAL
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(50));
  console.log(`Total analysés: ${stats.total}`);
  console.log(`✅ Retenus: ${stats.passed} (${(stats.passed/stats.total*100).toFixed(1)}%)`);
  console.log(`❌ Rejetés: ${stats.failed} (${(stats.failed/stats.total*100).toFixed(1)}%)`);
  
  const withROE = combined.filter(s => s.roe !== null).length;
  const withDE = combined.filter(s => s.de_ratio !== null).length;
  console.log(`\n📈 Fondamentaux Buffett:`);
  console.log(`  ROE disponible: ${withROE}/${combined.length} (${(withROE/combined.length*100).toFixed(1)}%)`);
  console.log(`  D/E disponible: ${withDE}/${combined.length} (${(withDE/combined.length*100).toFixed(1)}%)`);
  
  console.log('='.repeat(50));
  
  // Stats par bourse
  console.log('\n📈 ANALYSE DES REJETS PAR BOURSE:');
  const byMic = {};
  const bySource = { MIC: 0, REGION: 0 };
  
  allRejected.forEach(r => {
    const micKey = r.MIC || 'N/A';
    byMic[micKey] = (byMic[micKey] || 0) + 1;
    if (r.Source && r.Source.startsWith('MIC:')) {
      bySource.MIC++;
    } else {
      bySource.REGION++;
    }
  });
  
  const sortedMics = Object.entries(byMic).sort((a, b) => b[1] - a[1]);
  console.log('\nPar code MIC:');
  sortedMics.forEach(([mic, count]) => {
    const pct = ((count / stats.failed) * 100).toFixed(1);
    console.log(`  ${mic.padEnd(8)} : ${count.toString().padStart(4)} rejets (${pct}%)`);
  });
  
  console.log('\nPar source de seuil:');
  console.log(`  Seuil MIC    : ${bySource.MIC} rejets (${(bySource.MIC/stats.failed*100).toFixed(1)}%)`);
  console.log(`  Seuil REGION : ${bySource.REGION} rejets (${(bySource.REGION/stats.failed*100).toFixed(1)}%)`);
  
  console.log('\n📊 ANALYSE DES ACCEPTÉS PAR BOURSE:');
  const acceptedByExchange = {};
  combined.forEach(s => {
    const exchange = s['Bourse de valeurs'] || 'N/A';
    acceptedByExchange[exchange] = (acceptedByExchange[exchange] || 0) + 1;
  });
  
  const sortedExchanges = Object.entries(acceptedByExchange).sort((a, b) => b[1] - a[1]);
  sortedExchanges.slice(0, 10).forEach(([exchange, count]) => {
    const pct = ((count / stats.passed) * 100).toFixed(1);
    console.log(`  ${exchange.padEnd(40)} : ${count.toString().padStart(4)} acceptés (${pct}%)`);
  });
  
  // Top ROE
  console.log('\n🏆 TOP 10 STOCKS PAR ROE:');
  const sortedByROE = combined
    .filter(s => s.roe !== null && s.roe > 0)
    .sort((a, b) => b.roe - a.roe)
    .slice(0, 10);
  
  sortedByROE.forEach((s, i) => {
    console.log(`  ${(i+1).toString().padStart(2)}. ${s['Ticker'].padEnd(8)} ROE=${s.roe.toFixed(1)}% D/E=${s.de_ratio?.toFixed(2) ?? 'N/A'} (${s['Secteur'] || 'N/A'})`);
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`Fichiers acceptés dans: ${OUT_DIR}/`);
  console.log(`Fichiers rejetés dans: ${OUT_DIR}/`);
  console.log(`Cache fondamentaux: ${FUNDAMENTALS_CACHE_FILE}`);
  
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    allOutputs.forEach(o => {
      fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `stocks_${o.title.toLowerCase()}=${o.rows.length}\n`);
    });
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `total_filtered=${combined.length}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `total_rejected=${allRejected.length}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_roe=${withROE}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_de=${withDE}\n`);
  }
})();
