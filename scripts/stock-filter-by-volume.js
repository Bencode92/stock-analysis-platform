// stock-filter-by-volume.js
// npm i csv-parse axios
// Version 2.6 - Migration automatique ROIC
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
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const FUNDAMENTALS_RATE_LIMIT_MS = parseInt(process.env.FUNDAMENTALS_RATE_LIMIT || '2500', 10);
// Par défaut: traite TOUTES les actions (99999 = illimité en pratique)
const MAX_NEW_FETCHES_PER_RUN = parseInt(process.env.MAX_FUNDAMENTALS_FETCH || '99999', 10);
const RATE_LIMIT_PAUSE_MS = 70000;

// Seuils par région
const VOL_MIN = { US: 500_000, EUROPE: 50_000, ASIA: 100_000 };

const VOL_MIN_BY_MIC = {
  XNAS: 500_000, XNYS: 350_000, BATS: 500_000,
  XETR: 100_000, XPAR: 40_000, XLON: 120_000, XMIL: 80_000, XMAD: 80_000,
  XAMS: 50_000, XSTO: 60_000, XCSE: 40_000, XHEL: 40_000, XBRU: 30_000,
  XLIS: 20_000, XSWX: 20_000, XWBO: 20_000, XDUB: 20_000, XOSL: 30_000,
  XHKG: 100_000, XKRX: 100_000, XNSE: 50_000, XBOM: 50_000, XTAI: 60_000,
  XKOS: 100_000, XBKK: 50_000, XPHS: 20_000, XKLS: 30_000, XSHE: 100_000, ROCO: 20_000
};

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
  return COUNTRY2MIC[normalize(country)] || null;
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
    return Array.isArray(data?.data) ? data.data : (Array.isArray(data)?data:[]);
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
// FONDAMENTAUX BUFFETT - PARSING STRUCTURE IMBRIQUÉE
// ═══════════════════════════════════════════════════════════════════════════

async function loadFundamentalsCache() {
  try {
    const txt = await fs.readFile(FUNDAMENTALS_CACHE_FILE, 'utf8');
    return JSON.parse(txt);
  } catch {
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
  return Number.isFinite(parsed) ? parsed : null;
}

function isRateLimitError(data) {
  if (!data) return false;
  const msg = data.message || '';
  return /run out of API credits/i.test(msg) || /rate limit/i.test(msg);
}

// ✅ v2.5: Mise à jour pour extraire le cash (pour calcul ROIC)
async function fetchBalanceSheet(symbol) {
  try {
    const { data, headers } = await axios.get('https://api.twelvedata.com/balance_sheet', {
      params: { symbol, period: 'annual', apikey: API_KEY },
      timeout: 30000
    });
    
    if (DEBUG) {
      console.log(`  [DEBUG] balance_sheet ${symbol} response keys:`, data ? Object.keys(data) : 'null');
      console.log(`  [DEBUG] credits: used=${headers['api-credits-used']}, left=${headers['api-credits-left']}`);
    }
    
    if (isRateLimitError(data)) {
      return { _rateLimited: true };
    }
    
    if (!data || data.status === 'error' || data.code) {
      console.warn(`  ⚠️ Balance sheet erreur ${symbol}: ${data?.message || data?.code || 'unknown'}`);
      return null;
    }
    
    let sheet = data.balance_sheet || data;
    if (Array.isArray(sheet)) {
      sheet = sheet[0];
    }
    
    if (!sheet || typeof sheet !== 'object') {
      console.warn(`  ⚠️ Format inattendu balance_sheet ${symbol}`);
      return null;
    }
    
    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} sheet keys:`, Object.keys(sheet));
    }
    
    const assets = sheet.assets || {};
    const liabilities = sheet.liabilities || {};
    const equityBlock = sheet.shareholders_equity || {};
    const currentLiab = liabilities.current_liabilities || {};
    const nonCurrentLiab = liabilities.non_current_liabilities || {};
    
    // ✅ v2.5: NOUVEAU - Extraction du cash pour ROIC
    const currentAssets = assets.current_assets || {};
    
    const cashCandidates = [
      currentAssets.cash_and_cash_equivalents,
      currentAssets.cash,
      currentAssets.cash_equivalents,
      currentAssets.other_short_term_investments,
      assets.cash_and_cash_equivalents,
      sheet.cash_and_cash_equivalents,
      sheet.cash,
    ];
    
    const cash_and_st_investments = cashCandidates
      .map(parseFloatSafe)
      .filter(v => v != null)
      .reduce((sum, v) => sum + v, 0);
    
    const hasCash = cashCandidates.some(v => parseFloatSafe(v) != null);
    const cash_total = hasCash ? cash_and_st_investments : null;
    
    if (DEBUG && cash_total !== null) {
      console.log(`  [DEBUG] ${symbol} cash_and_st_investments: ${cash_total?.toLocaleString()}`);
    }
    
    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} equityBlock keys:`, Object.keys(equityBlock));
      console.log(`  [DEBUG] ${symbol} liabilities keys:`, Object.keys(liabilities));
    }
    
    const totalAssets = 
      parseFloatSafe(assets.total_assets) ??
      parseFloatSafe(sheet.total_assets) ?? 
      null;
    
    const totalLiabilities = 
      parseFloatSafe(liabilities.total_liabilities) ??
      parseFloatSafe(sheet.total_liabilities) ?? 
      null;
    
    const shortTermDebt = parseFloatSafe(currentLiab.short_term_debt) ?? 
                          parseFloatSafe(currentLiab.current_debt) ?? 0;
    const longTermDebt = parseFloatSafe(nonCurrentLiab.long_term_debt) ?? 
                         parseFloatSafe(nonCurrentLiab.long_term_debt_and_capital_lease_obligation) ?? 0;
    const totalDebt = shortTermDebt + longTermDebt;
    
    let totalEquity = 
      parseFloatSafe(equityBlock.total_shareholders_equity) ??
      parseFloatSafe(equityBlock.total_stockholders_equity) ??
      parseFloatSafe(equityBlock.stockholders_equity) ??
      parseFloatSafe(equityBlock.total_equity) ??
      parseFloatSafe(equityBlock.common_stock_equity) ??
      parseFloatSafe(sheet.total_shareholders_equity) ??
      parseFloatSafe(sheet.total_stockholders_equity) ??
      parseFloatSafe(sheet.stockholders_equity) ??
      parseFloatSafe(sheet.total_equity) ??
      null;
    
    if (totalEquity === null && totalAssets !== null && totalLiabilities !== null) {
      totalEquity = totalAssets - totalLiabilities;
      if (DEBUG) {
        console.log(`  [DEBUG] ${symbol} equity dérivée = ${totalAssets} - ${totalLiabilities} = ${totalEquity}`);
      }
    }
    
    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} FINAL: debt=${totalDebt}, equity=${totalEquity}, assets=${totalAssets}, cash=${cash_total}`);
    }
    
    return {
      total_debt: totalDebt,
      total_equity: totalEquity,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      cash_and_st_investments: cash_total,  // ✅ v2.5: NOUVEAU
      fiscal_date: sheet.fiscal_date || sheet.date || null
    };
  } catch (error) {
    console.error(`  ❌ Erreur balance_sheet ${symbol}:`, error.message);
    return null;
  }
}

async function fetchIncomeStatement(symbol) {
  try {
    const { data, headers } = await axios.get('https://api.twelvedata.com/income_statement', {
      params: { symbol, period: 'annual', apikey: API_KEY },
      timeout: 30000
    });
    
    if (DEBUG) {
      console.log(`  [DEBUG] income_statement ${symbol} response keys:`, data ? Object.keys(data) : 'null');
    }
    
    if (isRateLimitError(data)) {
      return { _rateLimited: true };
    }
    
    if (!data || data.status === 'error' || data.code) {
      console.warn(`  ⚠️ Income statement erreur ${symbol}: ${data?.message || data?.code || 'unknown'}`);
      return null;
    }
    
    let statement = data.income_statement || data;
    if (Array.isArray(statement)) {
      statement = statement[0];
    }
    
    if (!statement || typeof statement !== 'object') {
      console.warn(`  ⚠️ Format inattendu income_statement ${symbol}`);
      return null;
    }
    
    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} income keys:`, Object.keys(statement));
    }
    
    const netIncomeBlock = statement.net_income || {};
    
    const netIncome = 
      parseFloatSafe(typeof netIncomeBlock === 'object' ? netIncomeBlock.net_income : netIncomeBlock) ??
      parseFloatSafe(statement.net_income) ??
      parseFloatSafe(statement.net_income_common_stockholders) ??
      parseFloatSafe(statement.net_income_from_continuing_operations) ??
      null;
    
    const revenue = 
      parseFloatSafe(statement.revenue) ??
      parseFloatSafe(statement.total_revenue) ??
      parseFloatSafe(statement.operating_revenue) ??
      null;
    
    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} FINAL: net_income=${netIncome}, revenue=${revenue}`);
    }
    
    return {
      net_income: netIncome,
      revenue: revenue,
      ebitda: parseFloatSafe(statement.ebitda) ?? parseFloatSafe(statement.normalized_ebitda) ?? null,
      fiscal_date: statement.fiscal_date || statement.date || null
    };
  } catch (error) {
    console.error(`  ❌ Erreur income_statement ${symbol}:`, error.message);
    return null;
  }
}

// ✅ v2.5: Mise à jour pour calculer ROIC
function computeFundamentalRatios(balanceSheet, incomeStatement) {
  if (!balanceSheet) {
    return { roe: null, de_ratio: null, roic: null, error: 'no_balance_sheet' };
  }
  
  const equity     = balanceSheet.total_equity;
  const debt       = balanceSheet.total_debt ?? null;
  const cash       = balanceSheet.cash_and_st_investments ?? 0;  // ✅ v2.5: NOUVEAU
  const net_income = incomeStatement?.net_income ?? null;

  let roe = null;
  let de_ratio = null;
  let roic = null;

  // ROE = Net Income / Equity (en %)
  if (equity != null && equity !== 0 && net_income != null) {
    roe = Math.round((net_income / equity) * 10000) / 100;
  }

  // D/E = Debt / Equity (ratio)
  if (equity != null && equity !== 0 && debt != null) {
    de_ratio = Math.round((debt / equity) * 100) / 100;
  }

  // ✅ v2.5: ROIC simplifié = Net Income / Invested Capital (en %)
  // Invested Capital = Equity + Debt - Cash
  const invested_capital = 
    (equity != null ? equity : 0) + 
    (debt   != null ? debt   : 0) - 
    (cash   != null ? cash   : 0);

  // Protection contre les entreprises "cash-rich" (IC trop faible ou négatif)
  if (net_income != null && invested_capital > 1000) {
    roic = Math.round((net_income / invested_capital) * 10000) / 100;
  }

  if (DEBUG && roic !== null) {
    console.log(`  [DEBUG] ROIC: NI=${net_income?.toLocaleString()}, IC=${invested_capital?.toLocaleString()} (E=${equity?.toLocaleString()}+D=${debt?.toLocaleString()}-C=${cash?.toLocaleString()}) => ROIC=${roic}%`);
  }

  return {
    roe,
    de_ratio,
    roic,                                    // ✅ v2.5: NOUVEAU
    net_income,
    total_debt: debt,
    total_equity: equity,
    invested_capital,                        // ✅ v2.5: NOUVEAU
    cash_and_st_investments: cash,           // ✅ v2.5: NOUVEAU
    balance_sheet_date: balanceSheet.fiscal_date,
    income_statement_date: incomeStatement?.fiscal_date
  };
}

async function fetchFundamentalsForSymbol(symbol) {
  const balanceSheet = await fetchBalanceSheet(symbol);
  
  if (balanceSheet?._rateLimited) {
    console.log(`  ⏱️ Rate limit atteint, pause ${RATE_LIMIT_PAUSE_MS/1000}s...`);
    await new Promise(r => setTimeout(r, RATE_LIMIT_PAUSE_MS));
    return fetchFundamentalsForSymbol(symbol);
  }
  
  await new Promise(r => setTimeout(r, FUNDAMENTALS_RATE_LIMIT_MS));
  
  const incomeStatement = await fetchIncomeStatement(symbol);
  
  if (incomeStatement?._rateLimited) {
    console.log(`  ⏱️ Rate limit atteint, pause ${RATE_LIMIT_PAUSE_MS/1000}s...`);
    await new Promise(r => setTimeout(r, RATE_LIMIT_PAUSE_MS));
    const incomeRetry = await fetchIncomeStatement(symbol);
    const ratios = computeFundamentalRatios(balanceSheet, incomeRetry?._rateLimited ? null : incomeRetry);
    return { symbol, ...ratios, fetched_at: new Date().toISOString() };
  }
  
  await new Promise(r => setTimeout(r, FUNDAMENTALS_RATE_LIMIT_MS));
  
  const ratios = computeFundamentalRatios(balanceSheet, incomeStatement);
  
  return {
    symbol,
    ...ratios,
    fetched_at: new Date().toISOString()
  };
}

async function enrichWithFundamentals(stocks, maxNewFetches = MAX_NEW_FETCHES_PER_RUN) {
  console.log('\n' + '═'.repeat(50));
  console.log('📈 ENRICHISSEMENT FONDAMENTAUX BUFFETT v2.6 (+ROIC)');
  console.log('═'.repeat(50));
  console.log(`⚡ Rate limit: ${FUNDAMENTALS_RATE_LIMIT_MS}ms entre requêtes`);
  console.log(`📦 Max fetches: ${maxNewFetches >= 99999 ? 'ILLIMITÉ (toutes les actions)' : maxNewFetches}`);
  if (DEBUG) console.log('🐛 DEBUG mode activé');
  
  const cache = await loadFundamentalsCache();
  const now = Date.now();
  
  const needsUpdate = [];
  const fromCache = [];
  let needsRoicMigration = 0;
  
  // ✅ v2.6: Migration automatique - re-fetch si cache valide MAIS roic manquant
  for (const stock of stocks) {
    const ticker = stock['Ticker'];
    const cached = cache.data[ticker];
    
    if (cached && cached.fetched_at) {
      const cachedTime = new Date(cached.fetched_at).getTime();
      const cacheNotExpired = now - cachedTime < CACHE_TTL_MS;
      
      // Vérifier si ROIC est présent dans le cache (migration v2.4 → v2.6)
      const hasRoic = cached.roic !== undefined;
      
      if (cacheNotExpired && hasRoic) {
        // Cache complet et valide → utiliser
        stock.roe = cached.roe;
        stock.de_ratio = cached.de_ratio;
        stock.roic = cached.roic;
        fromCache.push(ticker);
        continue;
      } else if (cacheNotExpired && !hasRoic) {
        // Cache valide mais sans ROIC → migration nécessaire
        needsRoicMigration++;
      }
      // Si cache expiré ou sans ROIC → needsUpdate
    }
    needsUpdate.push(stock);
  }
  
  console.log(`📁 ${fromCache.length} stocks avec cache valide (incluant ROIC)`);
  console.log(`🔄 ${needsUpdate.length} stocks nécessitent mise à jour`);
  if (needsRoicMigration > 0) {
    console.log(`🔄 Dont ${needsRoicMigration} stocks en migration ROIC (cache v2.4 → v2.6)`);
  }
  
  // Estimation du temps
  if (needsUpdate.length > 0) {
    const estimatedMinutes = Math.ceil(needsUpdate.length / 12); // ~12 stocks/min avec Ultra plan
    console.log(`⏱️ Temps estimé: ~${estimatedMinutes} minutes pour ${needsUpdate.length} stocks`);
  }
  
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
      stock.roic = fundamentals.roic;
      
      if (fundamentals.roe !== null || fundamentals.de_ratio !== null || fundamentals.roic !== null) {
        console.log(`  ✅ ${ticker}: ROE=${fundamentals.roe?.toFixed(1) ?? 'N/A'}%, D/E=${fundamentals.de_ratio?.toFixed(2) ?? 'N/A'}, ROIC=${fundamentals.roic?.toFixed(1) ?? 'N/A'}%`);
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
        roic: null,
        error: error.message,
        fetched_at: new Date().toISOString()
      };
      stock.roe = null;
      stock.de_ratio = null;
      stock.roic = null;
      failed++;
    }
    
    processed++;
    
    // Sauvegarde intermédiaire tous les 10 stocks
    if (processed % 10 === 0) {
      await saveFundamentalsCache(cache);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed * 60;
      const remaining = toProcess.length - processed;
      const etaMinutes = Math.ceil(remaining / rate);
      console.log(`  💾 Cache sauvegardé (${processed}/${toProcess.length}) - ${rate.toFixed(0)} stocks/min - ETA: ${etaMinutes}min`);
    }
  }
  
  const notProcessed = needsUpdate.slice(maxNewFetches);
  for (const stock of notProcessed) {
    const ticker = stock['Ticker'];
    const cached = cache.data[ticker];
    stock.roe = cached?.roe ?? null;
    stock.de_ratio = cached?.de_ratio ?? null;
    stock.roic = cached?.roic ?? null;
  }
  
  await saveFundamentalsCache(cache);
  
  const totalTime = (Date.now() - startTime) / 1000;
  
  console.log('\n' + '─'.repeat(50));
  console.log('📊 RÉSUMÉ ENRICHISSEMENT:');
  console.log(`  ✅ Depuis cache: ${fromCache.length}`);
  console.log(`  🔄 Nouveaux appels: ${processed}`);
  console.log(`    - Avec ROE/D/E/ROIC: ${succeeded}`);
  console.log(`    - Sans données: ${failed}`);
  console.log(`  ⏳ En attente: ${notProcessed.length}`);
  if (totalTime > 0) {
    console.log(`  ⏱️ Temps: ${(totalTime/60).toFixed(1)}min (${(processed/totalTime*60).toFixed(0)} stocks/min)`);
  }
  console.log('─'.repeat(50));
  
  return stocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// ✅ v2.5: Ajout de 'roic' dans le header
const HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché','roe','de_ratio','roic'];
const REJ_HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché','Volume','Seuil','MIC','Symbole','Source','Raison'];

const csvLine = obj => HEADER.map(h => {
  const val = obj[h];
  if ((h === 'roe' || h === 'de_ratio' || h === 'roic') && val !== null && val !== undefined) {
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
    return Number(data?.volume) || Number(data?.average_volume) || 0;
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
  console.log('🚀 Démarrage du filtrage par volume + enrichissement fondamentaux v2.6 (+ROIC)\n');
  console.log(`📊 Config:`);
  console.log(`   MAX_FUNDAMENTALS_FETCH=${MAX_NEW_FETCHES_PER_RUN >= 99999 ? 'ILLIMITÉ' : MAX_NEW_FETCHES_PER_RUN}`);
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
      const { sym, quote } = await resolveSymbol(ticker, exch, r['Stock'] || '', r['Pays'] || '');
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
          'de_ratio': null,
          'roic': null
        });
        stats.passed++;
        console.log(`  ✅ ${ticker}: ${vol.toLocaleString()} >= ${thr.toLocaleString()} (${source})`);
      } else {
        stats.failed++;
        console.log(`  ❌ ${ticker}: ${vol.toLocaleString()} < ${thr.toLocaleString()} (${source})`);
        rejected.push({
          'Ticker': ticker, 'Stock': r['Stock']||'', 'Secteur': r['Secteur']||'',
          'Pays': r['Pays']||'', 'Bourse de valeurs': r['Bourse de valeurs']||'',
          'Devise de marché': r['Devise de marché']||'', 'Volume': vol, 'Seuil': thr,
          'MIC': mic || '', 'Symbole': sym, 'Source': source,
          'Raison': `Volume ${vol} < Seuil ${thr}`
        });
      }
      
      processed++;
      if (processed % 10 === 0) console.log(`  Progression: ${processed}/${rows.length}`);
    }

    allOutputs.push({ title: region, file: path.join(OUT_DIR, file.replace('.csv','_filtered.csv')), rows: filtered });
    allRejected.push(...rejected);

    await writeCSVGeneric(path.join(OUT_DIR, file.replace('.csv','_rejected.csv')), rejected, REJ_HEADER);
    console.log(`✅ ${region}: ${filtered.length}/${rows.length} retenus`);
  }

// Enrichissement fondamentaux - TOUTES les actions
let combined = allOutputs.flatMap(o => o.rows);
combined = await enrichWithFundamentals(combined, MAX_NEW_FETCHES_PER_RUN);

// Sauvegarde par région (objets déjà enrichis par référence)
for (const output of allOutputs) {
  await writeCSV(output.file, output.rows);
  console.log(`📁 ${output.title}: ${output.rows.length} stocks → ${output.file}`);
}

await writeCSV(path.join(OUT_DIR, 'Actions_filtrees_par_volume.csv'), combined);
await writeCSVGeneric(path.join(OUT_DIR, 'Actions_rejetes_par_volume.csv'), allRejected, REJ_HEADER);
  
  // Résumé final
  console.log('\n' + '='.repeat(50));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(50));
  console.log(`Total: ${stats.total} | ✅ ${stats.passed} (${(stats.passed/stats.total*100).toFixed(1)}%) | ❌ ${stats.failed}`);
  
  const withROE = combined.filter(s => s.roe !== null).length;
  const withDE = combined.filter(s => s.de_ratio !== null).length;
  const withROIC = combined.filter(s => s.roic !== null).length;
  
  console.log(`\n📈 Fondamentaux Buffett:`);
  console.log(`  ROE:  ${withROE}/${combined.length} (${(withROE/combined.length*100).toFixed(1)}%)`);
  console.log(`  D/E:  ${withDE}/${combined.length} (${(withDE/combined.length*100).toFixed(1)}%)`);
  console.log(`  ROIC: ${withROIC}/${combined.length} (${(withROIC/combined.length*100).toFixed(1)}%)`);
  
  // Top ROE
  if (withROE > 0) {
    console.log('\n🏆 TOP 10 ROE:');
    combined.filter(s => s.roe !== null && s.roe > 0)
      .sort((a, b) => b.roe - a.roe)
      .slice(0, 10)
      .forEach((s, i) => {
        console.log(`  ${(i+1).toString().padStart(2)}. ${s['Ticker'].padEnd(8)} ROE=${s.roe.toFixed(1)}% D/E=${s.de_ratio?.toFixed(2) ?? 'N/A'} ROIC=${s.roic?.toFixed(1) ?? 'N/A'}%`);
      });
  }
  
  // Top ROIC
  if (withROIC > 0) {
    console.log('\n🏆 TOP 10 ROIC:');
    combined.filter(s => s.roic !== null && s.roic > 0 && s.roic < 200)  // Exclure outliers
      .sort((a, b) => b.roic - a.roic)
      .slice(0, 10)
      .forEach((s, i) => {
        console.log(`  ${(i+1).toString().padStart(2)}. ${s['Ticker'].padEnd(8)} ROIC=${s.roic.toFixed(1)}% ROE=${s.roe?.toFixed(1) ?? 'N/A'}% D/E=${s.de_ratio?.toFixed(2) ?? 'N/A'}`);
      });
  }
  
  console.log('\n' + '='.repeat(50));
  
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `total_filtered=${combined.length}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_roe=${withROE}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_de=${withDE}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_roic=${withROIC}\n`);
  }
})();
