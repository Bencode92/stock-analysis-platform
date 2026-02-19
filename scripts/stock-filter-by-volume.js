// stock-filter-by-volume.js
// npm i csv-parse axios
// Version 2.13 - Fix ticker collision: cache key ticker:country (SAN, ADM, NEM, ADP)
//   - buildCacheKey(ticker, country) → "SAN:espagne" vs "SAN:france"
//   - FORMULA_VERSION=4 → force re-fetch des entrées collisionnées v3
//   - Migration auto des anciennes clés ticker → ticker:country
//   - Résout: Sanofi/Santander, Admiral/ADM, Newmont/Nemetschek, ADP/Aéroports
// Version 2.12 - Sync overrides: _banned/_alias depuis industry_overrides.json (cohérent avec advanced filter v3.31f)
//   - Charge data/industry_overrides.json au démarrage
//   - Exclut les tickers _banned AVANT resolveSymbol (évite volume/fondamentaux du mauvais stock)
//   - Remplace les tickers _alias AVANT resolveSymbol (ex: HEIA→HEI.A en US)
//   - Supporte _region pour limiter l'override à une région (US/EUROPE/ASIA)
//   - Purge le fundamentals_cache pour les tickers banned (évite pollution cache)
// Version 2.11 - Multi-year fundamentals: séries 3-5 ans, stabilité, marge nette, croissance CA
//   - fetchBalanceSheet: retourne TOUTES les périodes (3-5 ans, pas juste N/N-1)
//   - fetchIncomeStatement: retourne TOUTES les périodes (pas juste la première)
//   - Nouvelles métriques: roe_avg_3y, roe_std_3y, roic_avg_3y, roic_std_3y
//   - Nouvelles métriques: net_margin (NI/Revenue), revenue_growth_3y (CAGR)
//   - 0 appel API supplémentaire (TD retourne déjà 3-5 périodes)
//   - FORMULA_VERSION=3 → force re-fetch des anciennes entrées v1/v2
//   - CSV enrichi: 6 nouvelles colonnes pour stock-advanced-filter.js
// Version 2.10c - Fix fondamentaux IT: country=Italy d'abord, retry DE cross-listing si échec
// Version 2.10b - ITALY_FALLBACK: force whitelist volume (vol DE aussi faible)
// Version 2.10 - ITALY_FALLBACK: whitelist volume + fondamentaux via cross-listings DE
// Version 2.9 - Fix ROIC (NOPAT/Avg IC), ROE (Avg Equity), cache versioning
// Version 2.8 - Ajout sélection de région via REGIONS env var
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) { console.error('❌ TWELVE_DATA_API_KEY manquante'); process.exit(1); }

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR = process.env.OUTPUT_DIR || 'data/filtered';
const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

// ✅ v2.13: Version 4 — force re-fetch pour corriger collisions ticker (SAN, ADM, NEM, ADP)
const FORMULA_VERSION = 4;

// ✅ v2.8: Toutes les régions disponibles
const ALL_INPUTS = [
  { file: 'Actions_US.csv',     region: 'US' },
  { file: 'Actions_Europe.csv', region: 'EUROPE' },
  { file: 'Actions_Asie.csv',   region: 'ASIA' },
];

const REGIONS_ENV = (process.env.REGIONS || 'all').toLowerCase().split(',').map(s => s.trim());
const REGION_MAP = { us: 'US', europe: 'EUROPE', asia: 'ASIA' };

const INPUTS = REGIONS_ENV.includes('all')
  ? ALL_INPUTS
  : ALL_INPUTS.filter(i => REGIONS_ENV.some(r => REGION_MAP[r] === i.region));

if (INPUTS.length === 0) {
  console.error(`❌ Aucune région valide pour REGIONS="${process.env.REGIONS}". Valeurs: us, europe, asia, all`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION FONDAMENTAUX
// ═══════════════════════════════════════════════════════════════════════════
const FUNDAMENTALS_CACHE_FILE = path.join(DATA_DIR, 'fundamentals_cache.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const FUNDAMENTALS_RATE_LIMIT_MS = parseInt(process.env.FUNDAMENTALS_RATE_LIMIT || '2500', 10);
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

const COUNTRY_EN = {
    'france':'France', 'belgique':'Belgium', 'pays-bas':'Netherlands',
    'portugal':'Portugal', 'italie':'Italy', 'italy':'Italy',
    'espagne':'Spain', 'allemagne':'Germany', 'germany':'Germany',
    'suisse':'Switzerland', 'switzerland':'Switzerland',
    'royaume-uni':'United Kingdom', 'uk':'United Kingdom',
    'united kingdom':'United Kingdom',
    'irlande':'Ireland', 'ireland':'Ireland',
    'autriche':'Austria', 'norvège':'Norway', 'norway':'Norway',
    'suède':'Sweden', 'danemark':'Denmark', 'finlande':'Finland',
    'japon':'Japan', 'japan':'Japan',
    'hong kong':'Hong Kong', 'singapore':'Singapore',
    'taiwan':'Taiwan', 'taïwan':'Taiwan',
    'south korea':'South Korea', 'corée':'South Korea',
    'inde':'India', 'india':'India',
    'china':'China', 'chine':'China',
};

// ✅ v2.10c: XMIL → country=Italy (pas XETR)
const MIC_HINTS = {
    'XLON': { exchange: 'LSE',      country: 'United Kingdom' },
    'XDUB': { exchange: 'ISE',      country: 'Ireland' },
    'XSWX': { exchange: 'SIX',      country: 'Switzerland' },
    'XMAD': { exchange: 'BME',      country: 'Spain' },
    'XPAR': { exchange: 'Euronext', country: 'France' },
    'XAMS': { exchange: 'Euronext', country: 'Netherlands' },
    'XBRU': { exchange: 'Euronext', country: 'Belgium' },
    'XLIS': { exchange: 'Euronext', country: 'Portugal' },
    'XETR': { exchange: 'XETR',    country: 'Germany' },
    'XMIL': { country: 'Italy' },
    'XWBO': { exchange: 'Vienna',   country: 'Austria' },
    'XOSL': { exchange: 'OSE',      country: 'Norway' },
    'XSTO': { exchange: 'NASDAQ Stockholm', country: 'Sweden' },
    'XCSE': { exchange: 'NASDAQ Copenhagen', country: 'Denmark' },
    'XHEL': { exchange: 'NASDAQ Helsinki', country: 'Finland' },
};

const ITALY_FALLBACK = {
    'ISP':   { sym: 'IES',  exchange: 'XETR', country: 'Germany' },
    'UCG':   { sym: 'CRIN', exchange: 'XETR', country: 'Germany' },
    'ENI':   { sym: 'ENI',  exchange: 'FSX',  country: 'Germany' },
    'ENEL':  { sym: 'ENL',  exchange: 'XETR', country: 'Germany' },
    'PRY':   { sym: 'AEU',  exchange: 'XETR', country: 'Germany' },
    'BAMI':  { sym: 'BPM',  exchange: 'XETR', country: 'Germany' },
    'STLAM': { sym: '8TI',  exchange: 'XETR', country: 'Germany' },
    'MONC':  { sym: 'MOV',  exchange: 'XETR', country: 'Germany' },
    'LDO':   { sym: 'FMNB', exchange: 'XETR', country: 'Germany' },
    'BMPS':  { sym: 'MPI0', exchange: 'XETR', country: 'Germany' },
    'CPR':   { sym: '58H',  exchange: 'XETR', country: 'Germany' },
};

const US_MICS = new Set(['XNAS', 'XNYS', 'BATS', 'ARCX', 'XASE']);
const normalize = s => (s||'').toLowerCase().trim();

// ✅ v2.13: Clé de cache ticker:country pour éviter les collisions
// SAN:espagne ≠ SAN:france, ADM:etats-unis ≠ ADM:royaume-uni
function buildCacheKey(ticker, country) {
  const c = normalize(country);
  return c ? `${ticker}:${c}` : ticker;
}

function toMIC(exchange, country=''){
  const ex = normalize(exchange);
  if (ex) {
    for (const [pat, mic] of EX2MIC_PATTERNS) {
      if (ex.includes(pat)) return mic;
    }
  }
  return COUNTRY2MIC[normalize(country)] || null;
}

function buildFundamentalsParams(symbol, context = {}) {
  const mic = toMIC(context.exchange || '', context.country || '');
  const params = { symbol, period: 'annual', apikey: API_KEY };

  if (mic && US_MICS.has(mic)) {
    if (DEBUG) console.log(`  [DEBUG] Fundamentals params for ${symbol}: US stock, no context needed`);
    return params;
  }

  const hint = mic ? MIC_HINTS[mic] : null;

  if (hint) {
    if (/euronext/i.test(hint.exchange || '')) {
      params.exchange = 'Euronext';
      params.mic_code = mic;
      params.country = hint.country;
    } else {
      if (hint.exchange) params.exchange = hint.exchange;
      if (hint.country) params.country = hint.country;
    }
  } else if (mic) {
    const countryEN = COUNTRY_EN[normalize(context.country || '')];
    if (countryEN) params.country = countryEN;
  }

  if (DEBUG) console.log(`  [DEBUG] Fundamentals params for ${symbol}:`, JSON.stringify(params));
  return params;
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
// FONDAMENTAUX v2.11 — Multi-années (3-5 ans)
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

// ── Helpers stats ──
function arrAvg(arr) {
  const v = arr.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function arrStd(arr) {
  const v = arr.filter(Number.isFinite);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1);
  return Math.sqrt(variance);
}

// ── Parse une seule période de balance sheet ──
function parseOneBalanceSheet(sheet) {
  if (!sheet || typeof sheet !== 'object') return null;

  const assets = sheet.assets || {};
  const liabilities = sheet.liabilities || {};
  const equityBlock = sheet.shareholders_equity || {};
  const currentLiab = liabilities.current_liabilities || {};
  const nonCurrentLiab = liabilities.non_current_liabilities || {};
  const currentAssets = assets.current_assets || {};

  // Cash
  const cashCandidates = [
    currentAssets.cash_and_cash_equivalents,
    currentAssets.cash,
    currentAssets.cash_equivalents,
    currentAssets.other_short_term_investments,
    assets.cash_and_cash_equivalents,
    sheet.cash_and_cash_equivalents,
    sheet.cash,
  ];
  const cashSum = cashCandidates.map(parseFloatSafe).filter(v => v != null).reduce((s, v) => s + v, 0);
  const hasCash = cashCandidates.some(v => parseFloatSafe(v) != null);
  const cash_total = hasCash ? cashSum : null;

  const totalAssets =
    parseFloatSafe(assets.total_assets) ??
    parseFloatSafe(sheet.total_assets) ??
    null;

  const totalLiabilities =
    parseFloatSafe(liabilities.total_liabilities) ??
    parseFloatSafe(sheet.total_liabilities) ??
    null;

  const totalCurrentAssets =
    parseFloatSafe(currentAssets.total_current_assets) ??
    parseFloatSafe(assets.total_current_assets) ??
    null;

  const totalCurrentLiabilities =
    parseFloatSafe(currentLiab.total_current_liabilities) ??
    parseFloatSafe(liabilities.total_current_liabilities) ??
    null;

  const accountsPayable = parseFloatSafe(currentLiab.accounts_payable) ?? 0;
  const accruedExpenses = parseFloatSafe(currentLiab.accrued_expenses) ?? 0;

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
  }

  return {
    total_debt: totalDebt,
    total_equity: totalEquity,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_current_assets: totalCurrentAssets,
    total_current_liabilities: totalCurrentLiabilities,
    accounts_payable: accountsPayable,
    accrued_expenses: accruedExpenses,
    cash_and_st_investments: cash_total,
    fiscal_date: sheet.fiscal_date || sheet.date || null
  };
}

// ✅ v2.11: Retourne TOUTES les périodes (tableau), pas juste { current, previous }
async function fetchBalanceSheet(symbol, context = {}) {
  try {
    const params = buildFundamentalsParams(symbol, context);

    const { data, headers } = await axios.get('https://api.twelvedata.com/balance_sheet', {
      params,
      timeout: 30000
    });

    if (DEBUG) {
      console.log(`  [DEBUG] balance_sheet ${symbol} response keys:`, data ? Object.keys(data) : 'null');
      console.log(`  [DEBUG] credits: used=${headers['api-credits-used']}, left=${headers['api-credits-left']}`);
    }

    if (isRateLimitError(data)) return { _rateLimited: true };

    if (!data || data.status === 'error' || data.code) {
      console.warn(`  ⚠️ Balance sheet erreur ${symbol}: ${data?.message || data?.code || 'unknown'}`);
      return null;
    }

    let sheets = data.balance_sheet || data;
    if (!Array.isArray(sheets)) sheets = [sheets];

    // ✅ v2.11: Parse TOUTES les périodes disponibles
    const allPeriods = sheets.map(parseOneBalanceSheet).filter(p => p !== null);

    if (!allPeriods.length) {
      console.warn(`  ⚠️ Format inattendu balance_sheet ${symbol}`);
      return null;
    }

    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} BS: ${allPeriods.length} périodes (${allPeriods.map(p => p.fiscal_date).join(', ')})`);
    }

    return { periods: allPeriods };
  } catch (error) {
    console.error(`  ❌ Erreur balance_sheet ${symbol}:`, error.message);
    return null;
  }
}

// ── Parse une seule période d'income statement ──
function parseOneIncomeStatement(statement) {
  if (!statement || typeof statement !== 'object') return null;

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
    parseFloatSafe(statement.sales) ??
    parseFloatSafe(statement.operating_revenue) ??
    null;

  const operatingIncome =
    parseFloatSafe(statement.operating_income) ??
    parseFloatSafe(statement.ebit) ??
    null;

  const pretaxIncome = parseFloatSafe(statement.pretax_income) ?? null;
  const incomeTax    = parseFloatSafe(statement.income_tax) ?? null;

  return {
    net_income: netIncome,
    revenue: revenue,
    operating_income: operatingIncome,
    pretax_income: pretaxIncome,
    income_tax: incomeTax,
    ebitda: parseFloatSafe(statement.ebitda) ?? parseFloatSafe(statement.normalized_ebitda) ?? null,
    fiscal_date: statement.fiscal_date || statement.date || null
  };
}

// ✅ v2.11: Retourne TOUTES les périodes (tableau)
async function fetchIncomeStatement(symbol, context = {}) {
  try {
    const params = buildFundamentalsParams(symbol, context);

    const { data, headers } = await axios.get('https://api.twelvedata.com/income_statement', {
      params,
      timeout: 30000
    });

    if (DEBUG) {
      console.log(`  [DEBUG] income_statement ${symbol} response keys:`, data ? Object.keys(data) : 'null');
    }

    if (isRateLimitError(data)) return { _rateLimited: true };

    if (!data || data.status === 'error' || data.code) {
      console.warn(`  ⚠️ Income statement erreur ${symbol}: ${data?.message || data?.code || 'unknown'}`);
      return null;
    }

    let statements = data.income_statement || data;
    if (!Array.isArray(statements)) statements = [statements];

    // ✅ v2.11: Parse TOUTES les périodes disponibles
    const allPeriods = statements.map(parseOneIncomeStatement).filter(p => p !== null);

    if (!allPeriods.length) {
      console.warn(`  ⚠️ Format inattendu income_statement ${symbol}`);
      return null;
    }

    if (DEBUG) {
      console.log(`  [DEBUG] ${symbol} IS: ${allPeriods.length} périodes (${allPeriods.map(p => p.fiscal_date).join(', ')})`);
    }

    return { periods: allPeriods };
  } catch (error) {
    console.error(`  ❌ Erreur income_statement ${symbol}:`, error.message);
    return null;
  }
}

// Invested Capital (méthode GuruFocus)
function computeInvestedCapital(bs) {
  if (!bs || bs.total_assets == null) return null;

  const totalAssets = bs.total_assets;
  const cash = bs.cash_and_st_investments ?? 0;
  const curLiab = bs.total_current_liabilities ?? 0;
  const curAssets = bs.total_current_assets ?? 0;
  const ap = bs.accounts_payable ?? 0;
  const accrued = bs.accrued_expenses ?? 0;

  const excessCash = cash - Math.max(0, curLiab - curAssets + cash);
  const ic = totalAssets - ap - accrued - excessCash;

  if (DEBUG) {
    console.log(`    [IC] assets=${totalAssets}, ap+accrued=${ap + accrued}, excessCash=${excessCash} → IC=${ic}`);
  }

  return ic;
}

// ✅ v2.11: Calcule les ratios pour UNE année (BS[N] + BS[N-1] + IS[N])
function computeOneYearRatios(bsCurrent, bsPrevious, incomeStatement) {
  if (!bsCurrent) return null;

  const equity     = bsCurrent.total_equity;
  const equityPrev = bsPrevious?.total_equity ?? equity;
  const debt       = bsCurrent.total_debt ?? null;
  const net_income = incomeStatement?.net_income ?? null;
  const revenue    = incomeStatement?.revenue ?? null;
  const opIncome   = incomeStatement?.operating_income ?? null;
  const pretax     = incomeStatement?.pretax_income ?? null;
  const taxAmount  = incomeStatement?.income_tax ?? null;

  // ROE = Net Income / Average Equity (en %)
  const avgEquity = (equity != null && equityPrev != null) ? (equity + equityPrev) / 2 : equity;
  let roe = null;
  if (avgEquity != null && avgEquity !== 0 && net_income != null) {
    roe = Math.round((net_income / avgEquity) * 10000) / 100;
  }

  // D/E = Debt / Equity instantanée (ratio)
  let de_ratio = null;
  if (equity != null && equity !== 0 && debt != null) {
    de_ratio = Math.round((debt / equity) * 100) / 100;
  }

  // ROIC = NOPAT / Average IC (en %)
  let taxRate = 0.25;
  if (pretax != null && pretax > 0 && taxAmount != null && taxAmount >= 0) {
    taxRate = Math.min(Math.max(taxAmount / pretax, 0), 0.50);
  }
  const nopat = opIncome != null ? opIncome * (1 - taxRate) : null;
  const icCurrent  = computeInvestedCapital(bsCurrent);
  const icPrevious = bsPrevious ? computeInvestedCapital(bsPrevious) : icCurrent;
  const avgIC = (icCurrent != null && icPrevious != null) ? (icCurrent + icPrevious) / 2 : icCurrent;

  let roic = null;
  if (nopat != null && avgIC != null && avgIC > 1000) {
    roic = Math.round((nopat / avgIC) * 10000) / 100;
  }

  // ✅ v2.11: Marge nette
  let net_margin = null;
  if (net_income != null && revenue != null && revenue > 0) {
    net_margin = Math.round((net_income / revenue) * 10000) / 100;
  }

  return {
    fiscal_date: bsCurrent.fiscal_date || incomeStatement?.fiscal_date || null,
    roe, de_ratio, roic, net_margin,
    net_income, revenue, operating_income: opIncome,
    nopat, tax_rate: Math.round(taxRate * 10000) / 100,
    total_debt: debt, total_equity: equity, avg_equity: avgEquity,
    invested_capital: icCurrent, avg_invested_capital: avgIC,
    cash_and_st_investments: bsCurrent.cash_and_st_investments ?? 0,
  };
}

// ✅ v2.11: Calcule les ratios pour TOUTES les années disponibles
// bsPeriods: [N, N-1, N-2, ...] (plus récent en premier)
// isPeriods: [N, N-1, N-2, ...] (plus récent en premier)
function computeMultiYearRatios(bsPeriods, isPeriods) {
  if (!bsPeriods || !bsPeriods.length) {
    return { roe: null, de_ratio: null, roic: null, error: 'no_balance_sheet' };
  }

  // Calcul par année : BS[i] + BS[i+1] (previous) + IS[i]
  const yearlyRatios = [];
  for (let i = 0; i < bsPeriods.length; i++) {
    const bsCurrent  = bsPeriods[i];
    const bsPrevious = (i + 1 < bsPeriods.length) ? bsPeriods[i + 1] : null;
    const isMatch = isPeriods?.[i] ?? null;
    const ratios = computeOneYearRatios(bsCurrent, bsPrevious, isMatch);
    if (ratios) yearlyRatios.push(ratios);
  }

  if (!yearlyRatios.length) {
    return { roe: null, de_ratio: null, roic: null, error: 'no_valid_periods' };
  }

  // Valeurs les plus récentes (année N)
  const latest = yearlyRatios[0];

  // ✅ v2.11: Séries pour calcul de stabilité (max 3 dernières années)
  const recent3 = yearlyRatios.slice(0, 3);
  const roeArr  = recent3.map(r => r.roe).filter(Number.isFinite);
  const roicArr = recent3.map(r => r.roic).filter(Number.isFinite);

  const roe_avg_3y  = arrAvg(roeArr);
  const roe_std_3y  = arrStd(roeArr);
  const roic_avg_3y = arrAvg(roicArr);
  const roic_std_3y = arrStd(roicArr);

  // ✅ v2.11: Marge nette (année N)
  const net_margin = latest.net_margin;

  // ✅ v2.11: Revenue Growth CAGR
  // On prend les revenues dans recent3 (ancien → récent pour le CAGR)
  let revenue_growth_3y = null;
  const revenueArr = recent3.map(r => r.revenue).reverse(); // ancien → récent
  const validRevenue = revenueArr.filter(Number.isFinite);
  if (validRevenue.length >= 2) {
    const first = validRevenue[0];
    const last  = validRevenue[validRevenue.length - 1];
    const n = validRevenue.length - 1;
    if (first > 0 && last > 0) {
      revenue_growth_3y = Math.round((Math.pow(last / first, 1 / n) - 1) * 10000) / 100;
    }
  }

  if (DEBUG) {
    const dates = yearlyRatios.map(r => r.fiscal_date).join(', ');
    console.log(`  [MULTI-YEAR] ${yearlyRatios.length} années (${dates})`);
    console.log(`    ROE: latest=${latest.roe}%, avg3y=${roe_avg_3y?.toFixed(1)}%, std=${roe_std_3y?.toFixed(1)}`);
    console.log(`    ROIC: latest=${latest.roic}%, avg3y=${roic_avg_3y?.toFixed(1)}%, std=${roic_std_3y?.toFixed(1)}`);
    console.log(`    Net margin: ${net_margin?.toFixed(1)}% | Rev growth 3y: ${revenue_growth_3y?.toFixed(1)}%`);
  }

  return {
    // Valeurs année N (rétrocompatibles v2.10c)
    roe: latest.roe,
    de_ratio: latest.de_ratio,
    roic: latest.roic,

    // ✅ v2.11: Nouvelles métriques multi-années
    roe_avg_3y:  roe_avg_3y != null ? Math.round(roe_avg_3y * 100) / 100 : null,
    roe_std_3y:  roe_std_3y != null ? Math.round(roe_std_3y * 100) / 100 : null,
    roic_avg_3y: roic_avg_3y != null ? Math.round(roic_avg_3y * 100) / 100 : null,
    roic_std_3y: roic_std_3y != null ? Math.round(roic_std_3y * 100) / 100 : null,
    net_margin:  net_margin != null ? Math.round(net_margin * 100) / 100 : null,
    revenue_growth_3y: revenue_growth_3y != null ? Math.round(revenue_growth_3y * 100) / 100 : null,

    // Détails année N (pour debug/cache)
    net_income: latest.net_income,
    operating_income: latest.operating_income,
    nopat: latest.nopat,
    tax_rate: latest.tax_rate,
    total_debt: latest.total_debt,
    total_equity: latest.total_equity,
    avg_equity: latest.avg_equity,
    invested_capital: latest.invested_capital,
    avg_invested_capital: latest.avg_invested_capital,
    cash_and_st_investments: latest.cash_and_st_investments,
    balance_sheet_date: latest.fiscal_date,
    income_statement_date: latest.fiscal_date,

    // ✅ v2.11: Metadata multi-années (stocké dans le cache pour debug)
    years_available: yearlyRatios.length,
    yearly_dates: yearlyRatios.map(r => r.fiscal_date),
    yearly_roe: yearlyRatios.map(r => r.roe),
    yearly_roic: yearlyRatios.map(r => r.roic),
    yearly_revenue: yearlyRatios.map(r => r.revenue),
    yearly_net_margin: yearlyRatios.map(r => r.net_margin),

    _formulaVersion: FORMULA_VERSION
  };
}

// ✅ v2.11: Refactored — utilise les tableaux multi-périodes
async function fetchFundamentalsForSymbol(symbol, context = {}) {
  const bsResult = await fetchBalanceSheet(symbol, context);

  if (bsResult?._rateLimited) {
    console.log(`  ⏱️ Rate limit atteint, pause ${RATE_LIMIT_PAUSE_MS/1000}s...`);
    await new Promise(r => setTimeout(r, RATE_LIMIT_PAUSE_MS));
    return fetchFundamentalsForSymbol(symbol, context);
  }

  await new Promise(r => setTimeout(r, FUNDAMENTALS_RATE_LIMIT_MS));

  const isResult = await fetchIncomeStatement(symbol, context);

  if (isResult?._rateLimited) {
    console.log(`  ⏱️ Rate limit atteint, pause ${RATE_LIMIT_PAUSE_MS/1000}s...`);
    await new Promise(r => setTimeout(r, RATE_LIMIT_PAUSE_MS));
    const isRetry = await fetchIncomeStatement(symbol, context);
    const bsPeriods = bsResult?.periods ?? [];
    const isPeriods = isRetry?._rateLimited ? [] : (isRetry?.periods ?? []);
    const ratios = computeMultiYearRatios(bsPeriods, isPeriods);
    return { symbol, ...ratios, fetched_at: new Date().toISOString() };
  }

  await new Promise(r => setTimeout(r, FUNDAMENTALS_RATE_LIMIT_MS));

  const bsPeriods = bsResult?.periods ?? [];
  const isPeriods = isResult?.periods ?? [];

  // ✅ v2.10c: Retry cross-listing DE pour stocks italiens
  const mic = toMIC(context.exchange || '', context.country || '');
  if (!bsPeriods.length && !isPeriods.length && mic === 'XMIL' && ITALY_FALLBACK[symbol]) {
    const fb = ITALY_FALLBACK[symbol];
    console.log(`  🔄 [ITALY RETRY] ${symbol} → ${fb.sym}:${fb.exchange} (country=Italy échoué)`);

    const deContext = { exchange: fb.exchange, country: 'Germany' };
    const bsDE = await fetchBalanceSheet(fb.sym, deContext);
    await new Promise(r => setTimeout(r, FUNDAMENTALS_RATE_LIMIT_MS));
    const isDE = await fetchIncomeStatement(fb.sym, deContext);
    await new Promise(r => setTimeout(r, FUNDAMENTALS_RATE_LIMIT_MS));

    const bsPeriodsDE = bsDE?.periods ?? [];
    const isPeriodsDE = isDE?.periods ?? [];
    const ratiosDE = computeMultiYearRatios(bsPeriodsDE, isPeriodsDE);

    if (ratiosDE.roe !== null || ratiosDE.de_ratio !== null) {
      console.log(`  ✅ [ITALY RETRY] ${symbol} via ${fb.sym}:${fb.exchange} → ROE=${ratiosDE.roe}, ${ratiosDE.years_available} années`);
    }

    return { symbol, ...ratiosDE, fetched_at: new Date().toISOString() };
  }

  const ratios = computeMultiYearRatios(bsPeriods, isPeriods);

  return {
    symbol,
    ...ratios,
    fetched_at: new Date().toISOString()
  };
}

async function enrichWithFundamentals(stocks, maxNewFetches = MAX_NEW_FETCHES_PER_RUN) {
  console.log('\n' + '═'.repeat(60));
  console.log('📈 ENRICHISSEMENT FONDAMENTAUX v2.13 (Cache key ticker:country)');
  console.log('═'.repeat(60));
  console.log(`⚡ Rate limit: ${FUNDAMENTALS_RATE_LIMIT_MS}ms entre requêtes`);
  console.log(`📦 Max fetches: ${maxNewFetches >= 99999 ? 'ILLIMITÉ' : maxNewFetches}`);
  console.log(`🔢 Formula version: ${FORMULA_VERSION} (force re-fetch collisions v3)`);
  if (DEBUG) console.log('🐛 DEBUG mode activé');

  const cache = await loadFundamentalsCache();
  const now = Date.now();

  // ✅ v2.13: Migration anciennes clés "TICKER" → "TICKER:pays"
  // Copie les entrées non-ambiguës vers les nouvelles clés.
  // Les tickers collisionnés (SAN, ADM, NEM, ADP) sont exclus → re-fetch forcé.
  const COLLISION_TICKERS = new Set(['SAN', 'ADM', 'NEM', 'ADP']);
  let migrated = 0, skippedCollisions = 0;
  for (const stock of stocks) {
    const ticker = stock['Ticker'];
    const newKey = buildCacheKey(ticker, stock['Pays'] || '');
    if (newKey === ticker) continue; // pas de pays → même clé
    if (cache.data[newKey]) continue; // déjà migré
    if (!cache.data[ticker]) continue; // rien à migrer
    if (COLLISION_TICKERS.has(ticker)) {
      // Clé ambiguë — on ne sait pas à quel pays correspondent les données
      skippedCollisions++;
      continue;
    }
    // Copier l'ancienne entrée vers la nouvelle clé
    cache.data[newKey] = cache.data[ticker];
    migrated++;
  }
  if (migrated || skippedCollisions) {
    console.log(`🔄 Migration cache: ${migrated} clés migrées, ${skippedCollisions} collisions forcées au re-fetch`);
  }

  const needsUpdate = [];
  const fromCache = [];
  let needsFormulaMigration = 0;

  for (const stock of stocks) {
    const ticker = stock['Ticker'];
    const cacheKey = buildCacheKey(ticker, stock['Pays'] || '');
    const cached = cache.data[cacheKey];

    if (cached && cached.fetched_at) {
      const cachedTime = new Date(cached.fetched_at).getTime();
      const cacheNotExpired = now - cachedTime < CACHE_TTL_MS;

      const formulaOk = (cached._formulaVersion || 0) >= FORMULA_VERSION;
      const needsContextMigration = cached.roe === null && cached.de_ratio === null && !cached._hasContext;

      if (cacheNotExpired && formulaOk && !needsContextMigration) {
        stock.roe = cached.roe;
        stock.de_ratio = cached.de_ratio;
        stock.roic = cached.roic;
        // ✅ v2.11: Charger aussi les nouvelles métriques depuis le cache
        stock.roe_avg_3y = cached.roe_avg_3y ?? null;
        stock.roe_std_3y = cached.roe_std_3y ?? null;
        stock.roic_avg_3y = cached.roic_avg_3y ?? null;
        stock.roic_std_3y = cached.roic_std_3y ?? null;
        stock.net_margin = cached.net_margin ?? null;
        stock.revenue_growth_3y = cached.revenue_growth_3y ?? null;
        fromCache.push(ticker);
        continue;
      }
      if (!formulaOk) needsFormulaMigration++;
    }
    needsUpdate.push(stock);
  }

  console.log(`📁 ${fromCache.length} stocks avec cache valide (v${FORMULA_VERSION})`);
  console.log(`🔄 ${needsUpdate.length} stocks nécessitent mise à jour`);
  if (needsFormulaMigration > 0) {
    console.log(`🔄 Dont ${needsFormulaMigration} stocks en migration formule (v1/v2 → v${FORMULA_VERSION})`);
  }

  if (needsUpdate.length > 0) {
    const estimatedMinutes = Math.ceil(needsUpdate.length / 12);
    console.log(`⏱️ Temps estimé: ~${estimatedMinutes} minutes pour ${needsUpdate.length} stocks`);
  }

  const toProcess = needsUpdate.slice(0, maxNewFetches);
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const startTime = Date.now();

  for (const stock of toProcess) {
    const ticker = stock['Ticker'];
    const cacheKey = buildCacheKey(ticker, stock['Pays'] || '');

    try {
      console.log(`  📊 [${processed + 1}/${toProcess.length}] ${ticker} [${cacheKey}]...`);

      const fundamentals = await fetchFundamentalsForSymbol(ticker, {
        exchange: stock['Bourse de valeurs'] || '',
        country: stock['Pays'] || ''
      });

      fundamentals._hasContext = true;

      cache.data[cacheKey] = fundamentals;
      stock.roe = fundamentals.roe;
      stock.de_ratio = fundamentals.de_ratio;
      stock.roic = fundamentals.roic;
      // ✅ v2.11: Nouvelles métriques
      stock.roe_avg_3y = fundamentals.roe_avg_3y ?? null;
      stock.roe_std_3y = fundamentals.roe_std_3y ?? null;
      stock.roic_avg_3y = fundamentals.roic_avg_3y ?? null;
      stock.roic_std_3y = fundamentals.roic_std_3y ?? null;
      stock.net_margin = fundamentals.net_margin ?? null;
      stock.revenue_growth_3y = fundamentals.revenue_growth_3y ?? null;

      if (fundamentals.roe !== null || fundamentals.de_ratio !== null || fundamentals.roic !== null) {
        const yrs = fundamentals.years_available || 1;
        console.log(`  ✅ ${ticker}: ROE=${fundamentals.roe?.toFixed(1) ?? 'N/A'}% D/E=${fundamentals.de_ratio?.toFixed(2) ?? 'N/A'} ROIC=${fundamentals.roic?.toFixed(1) ?? 'N/A'}% | ${yrs}Y avg_ROE=${fundamentals.roe_avg_3y?.toFixed(1) ?? '-'}% margin=${fundamentals.net_margin?.toFixed(1) ?? '-'}%`);
        succeeded++;
      } else {
        console.log(`  ⚠️ ${ticker}: Données incomplètes`);
        failed++;
      }

    } catch (error) {
      console.error(`  ❌ ${ticker}: Erreur -`, error.message);
      cache.data[cacheKey] = {
        symbol: ticker,
        roe: null, de_ratio: null, roic: null,
        roe_avg_3y: null, roe_std_3y: null,
        roic_avg_3y: null, roic_std_3y: null,
        net_margin: null, revenue_growth_3y: null,
        _hasContext: true,
        _formulaVersion: FORMULA_VERSION,
        error: error.message,
        fetched_at: new Date().toISOString()
      };
      stock.roe = null; stock.de_ratio = null; stock.roic = null;
      stock.roe_avg_3y = null; stock.roe_std_3y = null;
      stock.roic_avg_3y = null; stock.roic_std_3y = null;
      stock.net_margin = null; stock.revenue_growth_3y = null;
      failed++;
    }

    processed++;

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
    const cacheKey = buildCacheKey(ticker, stock['Pays'] || '');
    const cached = cache.data[cacheKey];
    stock.roe = cached?.roe ?? null;
    stock.de_ratio = cached?.de_ratio ?? null;
    stock.roic = cached?.roic ?? null;
    stock.roe_avg_3y = cached?.roe_avg_3y ?? null;
    stock.roe_std_3y = cached?.roe_std_3y ?? null;
    stock.roic_avg_3y = cached?.roic_avg_3y ?? null;
    stock.roic_std_3y = cached?.roic_std_3y ?? null;
    stock.net_margin = cached?.net_margin ?? null;
    stock.revenue_growth_3y = cached?.revenue_growth_3y ?? null;
  }

  await saveFundamentalsCache(cache);

  const totalTime = (Date.now() - startTime) / 1000;

  console.log('\n' + '─'.repeat(60));
  console.log('📊 RÉSUMÉ ENRICHISSEMENT v2.11:');
  console.log(`  ✅ Depuis cache: ${fromCache.length}`);
  console.log(`  🔄 Nouveaux appels: ${processed}`);
  console.log(`    - Avec données: ${succeeded}`);
  console.log(`    - Sans données: ${failed}`);
  console.log(`  ⏳ En attente: ${notProcessed.length}`);
  if (totalTime > 0) {
    console.log(`  ⏱️ Temps: ${(totalTime/60).toFixed(1)}min (${(processed/totalTime*60).toFixed(0)} stocks/min)`);
  }

  // ✅ v2.11: Stats multi-années
  const withMultiYear = stocks.filter(s => s.roe_avg_3y !== null).length;
  const withMargin = stocks.filter(s => s.net_margin !== null).length;
  const withRevGrowth = stocks.filter(s => s.revenue_growth_3y !== null).length;
  console.log(`\n  📈 Multi-années (v2.11):`);
  console.log(`    - ROE avg 3Y: ${withMultiYear}/${stocks.length}`);
  console.log(`    - Net margin: ${withMargin}/${stocks.length}`);
  console.log(`    - Revenue growth 3Y: ${withRevGrowth}/${stocks.length}`);
  console.log('─'.repeat(60));

  return stocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// ✅ v2.11: Header étendu avec nouvelles colonnes
const HEADER = [
  'Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché',
  'roe','de_ratio','roic',
  'roe_avg_3y','roe_std_3y','roic_avg_3y','roic_std_3y',
  'net_margin','revenue_growth_3y'
];
const REJ_HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché','Volume','Seuil','MIC','Symbole','Source','Raison'];

const FLOAT_COLS = new Set(['roe','de_ratio','roic','roe_avg_3y','roe_std_3y','roic_avg_3y','roic_std_3y','net_margin','revenue_growth_3y']);

const csvLine = obj => HEADER.map(h => {
  const val = obj[h];
  if (FLOAT_COLS.has(h) && val !== null && val !== undefined) {
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
  console.log('🚀 Démarrage du filtrage par volume + enrichissement fondamentaux v2.13\n');
  console.log(`📊 Config:`);
  console.log(`   REGIONS=${INPUTS.map(i => i.region).join(', ')}`);
  console.log(`   FORMULA_VERSION=${FORMULA_VERSION} (multi-années)`);
  console.log(`   MAX_FUNDAMENTALS_FETCH=${MAX_NEW_FETCHES_PER_RUN >= 99999 ? 'ILLIMITÉ' : MAX_NEW_FETCHES_PER_RUN}`);
  console.log(`   FUNDAMENTALS_RATE_LIMIT=${FUNDAMENTALS_RATE_LIMIT_MS}ms`);
  console.log(`   DEBUG=${DEBUG}`);

  // ✅ v2.12: Charger les overrides (_banned, _alias) depuis industry_overrides.json
  // Identique à stock-advanced-filter.js v3.31f — cohérence pipeline
  let tickerBans = {};    // ticker → { reason, region? }
  let tickerAliases = {}; // ticker → { target, region? }
  try {
    const ovText = await fs.readFile(path.join(DATA_DIR, 'industry_overrides.json'), 'utf8');
    const overrides = JSON.parse(ovText);
    for (const [tk, val] of Object.entries(overrides)) {
      if (tk.startsWith('_')) continue;
      if (val && val._banned) tickerBans[tk] = { reason: val._reason || '', region: (val._region || '').toUpperCase() };
      if (val && val._alias)  tickerAliases[tk] = { target: val._alias, region: (val._region || '').toUpperCase() };
    }
    const banCount = Object.keys(tickerBans).length;
    const aliasCount = Object.keys(tickerAliases).length;
    if (banCount || aliasCount) {
      console.log(`📝 Overrides chargés: ${banCount} banned, ${aliasCount} aliases`);
    }
  } catch {
    // Fichier absent → pas d'overrides, c'est normal
  }

  const allOutputs = [];
  const allRejected = [];
  const stats = { total: 0, passed: 0, failed: 0 };

  for (const {file, region} of INPUTS) {
    const src = path.join(DATA_DIR, file);
    const rows = await readCSV(src);
    console.log(`\n📊 ${region}: ${rows.length} stocks à analyser`);

    // ✅ v2.12: Appliquer _banned et _alias AVANT resolveSymbol
    // Sinon on fetch volume/fondamentaux du mauvais stock
    let bannedInRegion = 0, aliasedInRegion = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const tk = (rows[i]['Ticker'] || '').trim();
      const ban = tickerBans[tk];
      const alias = tickerAliases[tk];
      if (ban && (!ban.region || ban.region === region)) {
        console.log(`  🚫 [BANNED] ${tk}: ${rows[i]['Stock'] || ''} → exclu (${ban.reason})`);
        rows.splice(i, 1);
        bannedInRegion++;
      } else if (alias && (!alias.region || alias.region === region)) {
        console.log(`  🔄 [ALIAS]  ${tk} → ${alias.target}: ${rows[i]['Stock'] || ''}`);
        rows[i]['Ticker'] = alias.target;
        aliasedInRegion++;
      }
    }
    if (bannedInRegion || aliasedInRegion) {
      console.log(`  📝 Region ${region}: ${bannedInRegion} banned, ${aliasedInRegion} aliased → ${rows.length} restants`);
    }

    const filtered = [];
    const rejected = [];
    let processed = 0;

    for (const r of rows) {
      await throttle();

      const ticker = (r['Ticker']||'').trim();
      const exch   = r['Bourse de valeurs'] || '';
      const mic    = toMIC(exch, r['Pays'] || '');
      let { sym, quote } = await resolveSymbol(ticker, exch, r['Stock'] || '', r['Pays'] || '');
      let vol = quote ? (Number(quote.volume)||Number(quote.average_volume)||0) : await fetchVolume(sym);

      // ITALY_FALLBACK whitelist
      if (mic === 'XMIL' && ITALY_FALLBACK[ticker]) {
        vol = 999_999;
        console.log(`  [ITALY WHITELIST] ${ticker} → forced pass (blue chip)`);
      }

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
          'roe': null, 'de_ratio': null, 'roic': null,
          // ✅ v2.11: Nouvelles colonnes initialisées
          'roe_avg_3y': null, 'roe_std_3y': null,
          'roic_avg_3y': null, 'roic_std_3y': null,
          'net_margin': null, 'revenue_growth_3y': null
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

  // Enrichissement fondamentaux multi-années
  let combined = allOutputs.flatMap(o => o.rows);
  combined = await enrichWithFundamentals(combined, MAX_NEW_FETCHES_PER_RUN);

  // Sauvegarde par région
  for (const output of allOutputs) {
    await writeCSV(output.file, output.rows);
    console.log(`📁 ${output.title}: ${output.rows.length} stocks → ${output.file}`);
  }

  await writeCSV(path.join(OUT_DIR, 'Actions_filtrees_par_volume.csv'), combined);
  await writeCSVGeneric(path.join(OUT_DIR, 'Actions_rejetes_par_volume.csv'), allRejected, REJ_HEADER);

  // Résumé final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ FINAL v2.11');
  console.log('='.repeat(60));
  console.log(`Total: ${stats.total} | ✅ ${stats.passed} (${(stats.passed/stats.total*100).toFixed(1)}%) | ❌ ${stats.failed}`);

  const withROE = combined.filter(s => s.roe !== null).length;
  const withDE = combined.filter(s => s.de_ratio !== null).length;
  const withROIC = combined.filter(s => s.roic !== null).length;
  const withROEAvg = combined.filter(s => s.roe_avg_3y !== null).length;
  const withMargin = combined.filter(s => s.net_margin !== null).length;
  const withRevGrowth = combined.filter(s => s.revenue_growth_3y !== null).length;

  console.log(`\n📈 Fondamentaux (année N):`);
  console.log(`  ROE:  ${withROE}/${combined.length} (${(withROE/combined.length*100).toFixed(1)}%)`);
  console.log(`  D/E:  ${withDE}/${combined.length} (${(withDE/combined.length*100).toFixed(1)}%)`);
  console.log(`  ROIC: ${withROIC}/${combined.length} (${(withROIC/combined.length*100).toFixed(1)}%)`);

  console.log(`\n📈 Multi-années (v2.11):`);
  console.log(`  ROE avg 3Y:        ${withROEAvg}/${combined.length} (${(withROEAvg/combined.length*100).toFixed(1)}%)`);
  console.log(`  Net margin:        ${withMargin}/${combined.length} (${(withMargin/combined.length*100).toFixed(1)}%)`);
  console.log(`  Revenue growth 3Y: ${withRevGrowth}/${combined.length} (${(withRevGrowth/combined.length*100).toFixed(1)}%)`);

  // Top ROE
  if (withROE > 0) {
    console.log('\n🏆 TOP 10 ROE:');
    combined.filter(s => s.roe !== null && s.roe > 0)
      .sort((a, b) => b.roe - a.roe)
      .slice(0, 10)
      .forEach((s, i) => {
        console.log(`  ${(i+1).toString().padStart(2)}. ${s['Ticker'].padEnd(8)} ROE=${s.roe.toFixed(1)}% avg3y=${s.roe_avg_3y?.toFixed(1) ?? '-'}% D/E=${s.de_ratio?.toFixed(2) ?? 'N/A'} ROIC=${s.roic?.toFixed(1) ?? 'N/A'}%`);
      });
  }

  // Top ROIC
  if (withROIC > 0) {
    console.log('\n🏆 TOP 10 ROIC:');
    combined.filter(s => s.roic !== null && s.roic > 0 && s.roic < 200)
      .sort((a, b) => b.roic - a.roic)
      .slice(0, 10)
      .forEach((s, i) => {
        console.log(`  ${(i+1).toString().padStart(2)}. ${s['Ticker'].padEnd(8)} ROIC=${s.roic.toFixed(1)}% avg3y=${s.roic_avg_3y?.toFixed(1) ?? '-'}% margin=${s.net_margin?.toFixed(1) ?? '-'}%`);
      });
  }

  // ✅ v2.11: Top stabilité ROE (faible std = moat durable)
  if (withROEAvg > 0) {
    console.log('\n🏆 TOP 10 ROE STABLE (avg élevé + faible volatilité):');
    combined.filter(s => s.roe_avg_3y !== null && s.roe_avg_3y > 10 && s.roe_std_3y !== null)
      .sort((a, b) => {
        // Score = avg / (1 + std) — favorise haut avg ET faible volatilité
        const sa = a.roe_avg_3y / (1 + (a.roe_std_3y || 0));
        const sb = b.roe_avg_3y / (1 + (b.roe_std_3y || 0));
        return sb - sa;
      })
      .slice(0, 10)
      .forEach((s, i) => {
        console.log(`  ${(i+1).toString().padStart(2)}. ${s['Ticker'].padEnd(8)} ROE_avg=${s.roe_avg_3y.toFixed(1)}% std=${s.roe_std_3y.toFixed(1)} revGrowth=${s.revenue_growth_3y?.toFixed(1) ?? '-'}%`);
      });
  }

  console.log('\n' + '='.repeat(60));

  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `total_filtered=${combined.length}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_roe=${withROE}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_de=${withDE}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_roic=${withROIC}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `fundamentals_with_multiyear=${withROEAvg}\n`);
  }
})();
