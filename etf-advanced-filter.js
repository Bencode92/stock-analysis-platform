// etf-advanced-filter.js
// Version hebdomadaire : Filtrage ADV + enrichissement summary/composition + TOP 10 HOLDINGS
// v14.3: Sector Guard - fix faux positifs (Low Vol, XLE/XOP/XME, ARKF)

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');
const crypto = require('crypto');

const OUT_DIR = process.env.OUT_DIR || 'data';

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    LIMIT_ETF: Number(process.env.LIMIT_ETF || 0),
    LIMIT_BONDS: Number(process.env.LIMIT_BONDS || 0),
    TRANSLATE_OBJECTIVE: process.env.TRANSLATE_OBJECTIVE === '1',
    TRANSLATE_TAXONOMY: process.env.TRANSLATE_TAXONOMY === '1',
    TRANSLATOR: process.env.TRANSLATOR || 'deepl',
    DEEPL_API_KEY: process.env.DEEPL_API_KEY || null,
    DEEPL_API_ENDPOINT: process.env.DEEPL_API_ENDPOINT || 'https://api-free.deepl.com',
    AZURE_TRANSLATOR_KEY: process.env.AZURE_TRANSLATOR_KEY || null,
    AZURE_TRANSLATOR_ENDPOINT: process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com',
    AZURE_TRANSLATOR_REGION: process.env.AZURE_TRANSLATOR_REGION || process.env.AZURE_REGION || null,
    OPENAI_API_KEY: process.env.API_CHAT || process.env.OPENAI_API_KEY || null,
    OPENAI_BASE_URL: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/,''),
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    TRANSLATION_CONCURRENCY: Number(process.env.TRANSLATION_CONCURRENCY || 2),
    OBJECTIVE_MAXLEN: Number(process.env.OBJECTIVE_MAXLEN || 500),
    MIN_ADV_USD_ETF: 1_000_000,
    MIN_ADV_USD_BOND: 500_000,
    DAYS_HISTORY: 30,
    CHUNK_SIZE: 12,
    CREDIT_LIMIT: 2584,
    CREDITS: { TIME_SERIES: 5, QUOTE: 0, PRICE: 0, ETFS_SUMMARY: 200, ETFS_COMPOSITION: 200 }
};

const SECTOR_FR_MAP = {
    'Technology': 'Technologie',
    'Financial Services': 'Services financiers',
    'Consumer Cyclical': 'Consommation discrétionnaire',
    'Consumer Defensive': 'Consommation de base',
    'Healthcare': 'Santé',
    'Industrial': 'Industrie',
    'Basic Materials': 'Matériaux de base',
    'Utilities': 'Services publics',
    'Energy': 'Énergie',
    'Communication Services': 'Services de communication',
    'Real Estate': 'Immobilier'
};

const FUND_TYPE_FR_MAP = {
    'Intermediate Core Bond': 'Obligations core intermédiaires',
    'Intermediate Core-Plus Bond': 'Obligations core-plus intermédiaires',
    'Short Government': "Obligations d'État court terme",
    'High Yield Bond': 'Obligations à haut rendement',
    'Target Maturity': 'Échéance cible',
    'Muni National Interm': 'Obligations municipales nationales intermédiaires',
    'Large Blend': 'Grandes capitalisations mixtes',
    'Small Cap': 'Petites capitalisations',
    'Emerging Markets': 'Marchés émergents',
    'Global Bond': 'Obligations mondiales',
    'Corporate Bond': "Obligations d'entreprise",
    'Treasury Bond': 'Obligations du Trésor'
};

const RATING_SCORES = {
    "U.S. Government": 100, "Government": 100, "Sovereign": 100,
    "AAA": 95, "Aaa": 95,
    "AA+": 90, "Aa1": 90, "AA": 85, "Aa2": 85, "AA-": 80, "Aa3": 80,
    "A+": 77, "A1": 77, "A": 75, "A2": 75, "A-": 72, "A3": 72,
    "BBB+": 65, "Baa1": 65, "BBB": 60, "Baa2": 60, "BBB-": 55, "Baa3": 55,
    "BB+": 50, "Ba1": 50, "BB": 45, "Ba2": 45, "BB-": 40, "Ba3": 40,
    "B+": 35, "B1": 35, "B": 30, "B2": 30, "B-": 25, "B3": 25,
    "CCC": 15, "Caa": 15, "Below B": 15, "CC": 10, "Ca": 10,
    "C": 5, "D": 0,
    "Not Rated": 40, "NR": 40, "N/A": 40
};

const TRANSLATION_CACHE_PATH = path.join(OUT_DIR, 'objective_translations.cache.json');
let translationCache = {};
let translationActive = 0;

async function loadTranslationCache() {
  try { translationCache = JSON.parse(await fs.readFile(TRANSLATION_CACHE_PATH, 'utf8')); }
  catch { translationCache = {}; }
}
async function saveTranslationCache() {
  try { await fs.writeFile(TRANSLATION_CACHE_PATH, JSON.stringify(translationCache, null, 2)); }
  catch {}
}
function tKey(text, to='fr') {
  return crypto.createHash('sha1').update(`${to}|${text || ''}`).digest('hex');
}
function looksFrench(s='') {
  return /[àâäçéèêëîïôöùûüÿœ]/i.test(s) || /\b(le|la|les|des|un|une|du|de|au|aux|pour|sur|dans|afin)\b/i.test(s);
}
async function withTranslationSlot(fn) {
  while (translationActive >= CONFIG.TRANSLATION_CONCURRENCY) { await wait(100); }
  translationActive++;
  try { return await fn(); } finally { translationActive--; }
}

async function translateWithOpenAI(text, to = 'fr') {
  const base = CONFIG.OPENAI_BASE_URL;
  const headers = { 'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`, 'Content-Type': 'application/json' };
  const messages = [
    { role: 'system', content: "Tu es un traducteur financier professionnel. Traduis en français (France), style neutre et précis, garde les tickers, acronymes et chiffres. Ne rajoute rien, ne supprime rien. Renvoie uniquement le texte traduit." },
    { role: 'user', content: String(text) }
  ];
  const body = { model: CONFIG.OPENAI_MODEL, temperature: 0.2, messages };
  const resp = await withTranslationSlot(() => axios.post(`${base}/chat/completions`, body, { headers }));
  return resp?.data?.choices?.[0]?.message?.content?.trim() || null;
}

async function translateText(text, to='fr') {
  if (!text || (!CONFIG.TRANSLATE_OBJECTIVE && !CONFIG.TRANSLATE_TAXONOMY)) return null;
  const useDeepL = CONFIG.TRANSLATOR === 'deepl' && CONFIG.DEEPL_API_KEY;
  const useAzure = CONFIG.TRANSLATOR === 'azure' && CONFIG.AZURE_TRANSLATOR_KEY;
  const useOpenAI = CONFIG.TRANSLATOR === 'openai' && CONFIG.OPENAI_API_KEY;
  if (!useDeepL && !useAzure && !useOpenAI) return null;
  const key = tKey(text, to);
  if (translationCache[key]) return translationCache[key];
  try {
    let translated = null;
    if (useDeepL) {
      const params = new URLSearchParams({ text, target_lang: to.toUpperCase(), source_lang: 'EN' });
      const base = CONFIG.DEEPL_API_ENDPOINT || 'https://api-free.deepl.com';
      const resp = await withTranslationSlot(() => axios.post(`${base.replace(/\/$/,'')}/v2/translate`, params, { headers: { 'Authorization': `DeepL-Auth-Key ${CONFIG.DEEPL_API_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }));
      translated = resp?.data?.translations?.[0]?.text || null;
    } else if (useAzure) {
      const url = `${CONFIG.AZURE_TRANSLATOR_ENDPOINT.replace(/\/$/,'')}/translate?api-version=3.0&from=en&to=${to}`;
      const resp = await withTranslationSlot(() => axios.post(url, [{ Text: text }], { headers: { 'Ocp-Apim-Subscription-Key': CONFIG.AZURE_TRANSLATOR_KEY, ...(CONFIG.AZURE_TRANSLATOR_REGION ? { 'Ocp-Apim-Subscription-Region': CONFIG.AZURE_TRANSLATOR_REGION } : {}), 'Content-Type': 'application/json' } }));
      translated = resp?.data?.[0]?.translations?.[0]?.text || null;
    } else if (useOpenAI) {
      translated = await translateWithOpenAI(text, to);
    }
    if (translated) { translationCache[key] = translated; return translated; }
  } catch (e) { if (CONFIG.DEBUG) console.log('⚠️ Traduction objective KO:', e.message); }
  return null;
}

async function translateLabel(label, domain = 'generic', to = 'fr') {
  if (!label) return label;
  if (looksFrench(label)) return label;
  const fixed = domain === 'sector' ? SECTOR_FR_MAP[label] : domain === 'fund_type' ? FUND_TYPE_FR_MAP[label] : null;
  if (fixed) return fixed;
  const translated = await translateText(label, to);
  if (translated && translated !== label && !fixed && CONFIG.DEBUG) console.log(`💡 Suggestion dict ${domain}: '${label}': '${translated}'`);
  return translated || label;
}

const US_MIC_CODES = ['ARCX', 'BATS', 'XNAS', 'XNYS', 'XASE', 'XNGS', 'XNMS'];

// === SINGLE STOCK SECTORS (extended) ===
const SINGLE_STOCK_SECTORS = {
    'AAPL': { sector: 'Technology', country: 'United States' },
    'MSFT': { sector: 'Technology', country: 'United States' },
    'NVDA': { sector: 'Technology', country: 'United States' },
    'GOOGL': { sector: 'Technology', country: 'United States' },
    'GOOG': { sector: 'Technology', country: 'United States' },
    'AMZN': { sector: 'Consumer Cyclical', country: 'United States' },
    'TSLA': { sector: 'Consumer Cyclical', country: 'United States' },
    'META': { sector: 'Technology', country: 'United States' },
    'FB': { sector: 'Technology', country: 'United States' },
    'NFLX': { sector: 'Communication Services', country: 'United States' },
    'JPM': { sector: 'Financial Services', country: 'United States' },
    'BAC': { sector: 'Financial Services', country: 'United States' },
    'WMT': { sector: 'Consumer Defensive', country: 'United States' },
    'JNJ': { sector: 'Healthcare', country: 'United States' },
    'V': { sector: 'Financial Services', country: 'United States' },
    'MA': { sector: 'Financial Services', country: 'United States' },
    'BRK': { sector: 'Financial Services', country: 'United States' },
    'XOM': { sector: 'Energy', country: 'United States' },
    'UNH': { sector: 'Healthcare', country: 'United States' },
    'PG': { sector: 'Consumer Defensive', country: 'United States' },
    'AMD': { sector: 'Technology', country: 'United States' },
    'AVGO': { sector: 'Technology', country: 'United States' },
    'COIN': { sector: 'Financial Services', country: 'United States' },
    'LLY': { sector: 'Healthcare', country: 'United States' },
    'MU': { sector: 'Technology', country: 'United States' },
    'RIOT': { sector: 'Financial Services', country: 'United States' },
    'BABA': { sector: 'Consumer Cyclical', country: 'China' },
};

const SECTOR_NORMALIZATION = {
    'realestate': 'Real Estate', 'real-estate': 'Real Estate', 'real_estate': 'Real Estate',
    'financials': 'Financial Services', 'finance': 'Financial Services',
    'tech': 'Technology', 'information technology': 'Technology',
    'consumer discretionary': 'Consumer Cyclical', 'consumer staples': 'Consumer Defensive',
    'health care': 'Healthcare', 'industrials': 'Industrial', 'materials': 'Basic Materials',
    'utilities': 'Utilities', 'energy': 'Energy',
    'communication': 'Communication Services', 'telecom': 'Communication Services'
};

// === DETECT ETF TYPE v2 (fix faux positifs leveraged) ===
const ETF_TYPE_RX = {
  inverse: /\b(-?1x|inverse|short(?!\s*term)|bear|ultra\s*short|ultrashort)\b/i,
  leveraged: /\b([23])\s*x\b|\b(2x|3x)\b|\bleveraged\b|\bultra\s*pro\b|\bultrapro\b/i,
  ultraAlone: /\bultra\b/i,
  ultraIssuer: /\b(proshares|direxion|graniteshares|t-?rex|tradr|microsectors)\b/i,
  vehicle: /\b(etn|etc|notes?\b|grantor\s*trust|commodity\s*pool)\b/i,
  indexDerivative: /\b(s&p\s*500|spx|spy|qqq|nasdaq|dow|russell|r2k|iwm|dia)\b/i,
};

const SINGLE_STOCK_RX = new RegExp(`\\b(${Object.keys(SINGLE_STOCK_SECTORS).join('|')})\\b`, 'i');

function detectETFType(symbol, name, objective) {
  const fullText = `${symbol} ${name || ''} ${objective || ''}`;
  const textLower = fullText.toLowerCase();

  // Detect underlying ticker
  let underlying_ticker = null;
  const m = fullText.match(SINGLE_STOCK_RX);
  if (m?.[0]) {
    const t = m[0].toUpperCase();
    if (SINGLE_STOCK_SECTORS[t]) underlying_ticker = t;
  }

  // Structured vehicle (ETN/ETC/NOTE) - priority over leveraged
  if (ETF_TYPE_RX.vehicle.test(textLower)) {
    return { type: 'structured', underlying_ticker };
  }

  const isInverse = ETF_TYPE_RX.inverse.test(textLower);
  // "Ultra" seul => leveraged seulement si issuer typique et pas ultrashort
  const isLeveraged = ETF_TYPE_RX.leveraged.test(textLower) ||
    (ETF_TYPE_RX.ultraAlone.test(textLower) && ETF_TYPE_RX.ultraIssuer.test(textLower) && !isInverse);

  // Check if index derivative (no single stock)
  const isIndexDeriv = !underlying_ticker && ETF_TYPE_RX.indexDerivative.test(textLower);

  if (isInverse) {
    return { type: 'inverse', leverage: -1, underlying_ticker, is_index_derivative: isIndexDeriv };
  }
  if (isLeveraged) {
    const mm = textLower.match(/\b([23])\s*x\b|\b(2x|3x)\b/i);
    const lev = mm ? parseInt((mm[1] || mm[2] || '2')[0], 10) : 2;
    return { type: 'leveraged', leverage: lev, underlying_ticker, is_index_derivative: isIndexDeriv };
  }
  if (underlying_ticker) {
    return { type: 'single_stock', ticker: underlying_ticker, underlying_ticker };
  }

  return { type: 'standard' };
}

// === EQUITY FILTER (actions dans all_etfs.csv) - v14.3 improved ===
const ETF_NAME_TOKENS = /\b(etf|exchange\s*traded|fund|trust|shares|etn|etc|ucits)\b/i;
const COMPANY_SUFFIX = /\b(inc\.?|corp\.?|corporation|ltd\.?|plc|company|co\.|holdings|group)\s*$/i;
const ADR_PATTERN = /\b(inc\.?|corp\.?|ltd\.?|tbk\.?)\b.*\b(american\s+depositary|adr|ads|subordinate|voting)\b/i;
const STOCK_PATTERN = /\b(common\s+stock|ordinary\s+shares|class\s+[a-z]\s+shares?)\b/i;

function nameLooksLikeEquityNotETF(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  if (ETF_NAME_TOKENS.test(n)) return false;
  if (ADR_PATTERN.test(n)) return true;
  if (STOCK_PATTERN.test(n)) return true;
  return COMPANY_SUFFIX.test(n);
}

// === SECTOR GUARD v14.3 : Fix faux positifs ===

// VIX STRICT - exclure "Low Volatility", "Min Volatility" (fix SPLV, ACWV, etc.)
const VIX_PRODUCT_KEYWORDS = /\b(vix|cboe\s+volatility|volatility\s+(index|futures)\s+(etf|etn|fund))\b/i;
const LOW_VOL_EXCLUSION = /\b(low|min(imum)?|managed|reduce[d]?)\s+volatil/i;

function isVixProduct(text) {
  if (LOW_VOL_EXCLUSION.test(text)) return false;
  return VIX_PRODUCT_KEYWORDS.test(text);
}

// COMMODITY PHYSICAL vs EQUITY SECTOR (fix XLE, XOP, XME)
// Physical = trusts, futures, LP, physical
const PHYSICAL_COMMODITY_KEYWORDS = /\b(physical|bullion|gold\s+trust|silver\s+trust|gold\s+shares|silver\s+shares|oil\s+fund|gas\s+fund|commodity\s+(index|strategy|pool|trust)|futures\s+fund|,?\s*l\.?p\.?\s*$)\b/i;
// Equity sector = miners, producers, exploration, sector, select
const EQUITY_SECTOR_KEYWORDS = /\b(miners?|mining|producers?|exploration|production|sector|select|index)\s*(etf|fund|shares?)?\b/i;
// Commodity keywords that need context
const COMMODITY_WORDS = /\b(gold|silver|platinum|palladium|bullion|precious\s*metals?|crude\s*oil|natural\s*gas|uranium|copper|wheat|corn|soybean|agriculture|commodit)/i;

function isCommodityProduct(text, fundType = '') {
  const t = String(text || '').toLowerCase();
  const ft = String(fundType || '').toLowerCase();
  
  // fund_type explicitly says commodity
  if (/commodity|precious.*metal/i.test(ft)) {
    // But check if it's miners/sector (equity)
    if (EQUITY_SECTOR_KEYWORDS.test(t)) return false;
    return true;
  }
  
  // If it has equity sector keywords (miners, sector, select, exploration) → NOT commodity
  if (EQUITY_SECTOR_KEYWORDS.test(t)) return false;
  
  // If it has physical commodity keywords → commodity
  if (PHYSICAL_COMMODITY_KEYWORDS.test(t)) return true;
  
  // If text has commodity words but also "sector" or "select" → NOT commodity
  if (COMMODITY_WORDS.test(t)) {
    if (/\b(sector|select)\b/i.test(t)) return false;
    // Check for trust/fund/LP structure
    if (/\b(trust|fund,?\s*l\.?p\.?|physical|bullion)\b/i.test(t)) return true;
  }
  
  return false;
}

// CRYPTO - more strict (fix ARKF which is fintech, not pure crypto)
const CRYPTO_PURE_KEYWORDS = /\b(bitcoin|btc|ethereum|eth|ether\b|crypto(?:currency)?|digital\s*asset)\b/i;
const CRYPTO_FUND_NAMES = /\b(bitcoin\s+(trust|fund|etf)|ethereum\s+(trust|fund|etf)|crypto\s+(trust|fund|etf)|grayscale.*trust)\b/i;
// Exclude fintech/innovation that may mention blockchain
const FINTECH_EXCLUSION = /\b(fintech|innovation|transformational|disrupt)/i;

function isCryptoProduct(text, fundType = '') {
  const t = String(text || '').toLowerCase();
  const ft = String(fundType || '').toLowerCase();
  
  // fund_type explicitly crypto
  if (/crypto|bitcoin|digital.*asset/i.test(ft)) return true;
  
  // Exclude fintech/innovation ETFs (ARKF, etc.)
  if (FINTECH_EXCLUSION.test(t)) return false;
  
  // Pure crypto keywords or fund names
  if (CRYPTO_FUND_NAMES.test(t)) return true;
  if (CRYPTO_PURE_KEYWORDS.test(t) && !/\b(industry|innovator|blockchain\s+(?:and|&)\s+tech)/i.test(t)) return true;
  
  return false;
}

// FX keywords
const FX_KEYWORDS = /\b(us\s*dollar|dollar\s*index|currencyshares|euro\s*trust|yen\s*trust|franc\s*trust|sterling\s*trust)\b/i;

function inferAltAsset(text, fundType = '') {
  const t = String(text || '').toLowerCase();
  
  // VIX first (with exclusion for Low Vol)
  if (isVixProduct(t)) return { alt: true, kind: 'volatility' };
  
  // Crypto (with exclusion for fintech)
  if (isCryptoProduct(t, fundType)) return { alt: true, kind: 'crypto' };
  
  // Commodity (with exclusion for sector/miners)
  if (isCommodityProduct(t, fundType)) return { alt: true, kind: 'commodity' };
  
  // FX
  if (FX_KEYWORDS.test(t) || String(fundType || '').toLowerCase().includes('currency')) return { alt: true, kind: 'fx' };
  
  return { alt: false, kind: null };
}

// Options overlay (informatif)
const OPTIONS_OVERLAY_PATTERNS = [
  /\bcovered\s*call(s)?\b/i,
  /\bbuy[- ]?write\b/i,
  /\bcall\s*writing\b/i,
  /\bcollar(ed)?\b/i,
  /\b0dte\b/i,
  /\boption\s+income\b/i,
  /\bdefined\s+outcome\b/i,
  /\bbuffer\b/i,
  /\byieldmax\b/i,
];

// Vrais ETF financiers (shortcircuit)
const TRUE_FINANCIAL_PATTERNS = [
  /\b(bank|banks|banking|regional\s*bank)\b/i,
  /\bfinancial(s)?\s*(select|sector|index|alphadex)\b/i,
  /\b(insurance|broker|capital\s*markets)\b/i,
  /\bbdc\s+income\b/i,
  /\bprivate\s+equity\b/i,
  /\bpreferred\s+securities\b/i,
];

function testAny(patterns, text) {
  return patterns.some(rx => rx.test(text));
}

function computeSectorGuard(etf) {
  const reasons = [];
  let trust = 1.0;
  let bucket = 'STANDARD';

  const text = [etf.symbol, etf.name, etf.fund_type, etf.objective_en].filter(Boolean).join(' ');
  const textLower = text.toLowerCase();
  const ftLower = String(etf.fund_type || '').toLowerCase();

  const sectors = etf.sectors || [];
  const sectorTop = etf.sector_top || null;
  const sectorName = (sectorTop?.sector || '').trim();
  const sectorWeight = Number(sectorTop?.weight ?? 0);

  const holdings = etf.holdings_top10 || [];
  const holdingsCount = holdings.length;

  // Infer alt asset (v14.3 improved)
  const altAsset = inferAltAsset(text, etf.fund_type);

  // Options overlay (tag info)
  if (testAny(OPTIONS_OVERLAY_PATTERNS, text)) {
    reasons.push('OPTIONS_OVERLAY');
  }

  // === BUCKET ASSIGNMENT ===

  // 1. Alt assets (commodity/crypto/fx/vix)
  if (altAsset.alt) {
    bucket = `ALT_ASSET_${altAsset.kind.toUpperCase()}`;
    trust = Math.min(trust, 0.35);
    reasons.push(`ALT_ASSET_${altAsset.kind.toUpperCase()}`);

    // Financial Services mislabel
    if (sectorName === 'Financial Services' && sectorWeight >= 0.60) {
      trust = Math.min(trust, 0.20);
      if (altAsset.kind === 'commodity') reasons.push('FS_BUT_COMMODITY');
      if (altAsset.kind === 'crypto') reasons.push('FS_BUT_CRYPTO');
      if (altAsset.kind === 'fx') reasons.push('FS_BUT_FX');
      if (altAsset.kind === 'volatility') reasons.push('FS_BUT_VIX');
    }
  }

  // 2. Structured vehicle (ETN/ETC/NOTE)
  else if (etf.etf_type === 'structured') {
    bucket = 'STRUCTURED_VEHICLE';
    trust = Math.min(trust, 0.40);
    reasons.push('STRUCTURED_VEHICLE');
  }

  // 3. Index derivative (inverse/leveraged on index, no single stock)
  else if ((etf.etf_type === 'inverse' || etf.etf_type === 'leveraged') && etf.is_index_derivative) {
    bucket = 'INDEX_DERIVATIVE';
    trust = Math.min(trust, 0.45);
    reasons.push('INDEX_DERIVATIVE');
    if (etf.etf_type === 'inverse') reasons.push('NON_STANDARD_INVERSE');
    if (etf.etf_type === 'leveraged') reasons.push('NON_STANDARD_LEVERAGED');
  }

  // 4. Single stock derivative (inverse/leveraged on single stock)
  else if ((etf.etf_type === 'inverse' || etf.etf_type === 'leveraged') && etf.underlying_ticker) {
    bucket = 'SINGLE_STOCK_DERIVATIVE';
    trust = Math.min(trust, 0.55);
    reasons.push('SINGLE_STOCK_DERIVATIVE');
    if (etf.etf_type === 'inverse') reasons.push('NON_STANDARD_INVERSE');
    if (etf.etf_type === 'leveraged') reasons.push('NON_STANDARD_LEVERAGED');
  }

  // 5. Leveraged/inverse without underlying (data missing)
  else if (etf.etf_type === 'inverse' || etf.etf_type === 'leveraged') {
    bucket = 'NON_STANDARD';
    trust = Math.min(trust, 0.40);
    if (etf.etf_type === 'inverse') reasons.push('NON_STANDARD_INVERSE');
    if (etf.etf_type === 'leveraged') reasons.push('NON_STANDARD_LEVERAGED');
    if (!sectors.length) reasons.push('NO_SECTOR_DATA');
  }

  // 6. Single stock ETF
  else if (etf.etf_type === 'single_stock') {
    bucket = 'SINGLE_STOCK';
    trust = Math.min(trust, 0.70);
    reasons.push('SINGLE_STOCK');
  }

  // 7. Standard ETF
  else {
    // Check if verified financial
    if (sectorName === 'Financial Services' && sectorWeight >= 0.60 && testAny(TRUE_FINANCIAL_PATTERNS, text)) {
      bucket = 'VERIFIED_FINANCIAL';
      trust = 1.0;
      reasons.push('VERIFIED_FINANCIAL_ETF');
    }
    // No sector data
    else if (!sectors.length) {
      bucket = 'DATA_MISSING';
      trust = Math.min(trust, 0.30);
      reasons.push('NO_SECTOR_DATA');
    }
    // Standard with data
    else {
      bucket = 'STANDARD';
    }
  }

  // Final clamp
  trust = Math.max(0, Math.min(1, trust));
  
  return {
    sector_trust: Number(trust.toFixed(2)),
    sector_signal_ok: trust >= 0.50,
    sector_suspect: trust < 0.50,
    sector_bucket: bucket,
    sector_guard_reasons: reasons.length ? reasons : ['STANDARD_ETF']
  };
}

const symbolCache = new Map();
const fxCache = new Map();
let creditsUsed = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;
const ENRICH_COST = (CONFIG.CREDITS.ETFS_SUMMARY + CONFIG.CREDITS.ETFS_COMPOSITION);
const ENRICH_CONCURRENCY = Math.max(1, Math.floor(CONFIG.CREDIT_LIMIT / ENRICH_COST));

async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function pay(cost) {
    while (true) {
        const now = Date.now();
        if (now - windowStart > WINDOW_MS) { creditsUsed = 0; windowStart = now; if (CONFIG.DEBUG) console.log('💳 Nouvelle fenêtre de crédits'); }
        if (creditsUsed + cost <= CONFIG.CREDIT_LIMIT) { creditsUsed += cost; return; }
        const remaining = WINDOW_MS - (now - windowStart);
        if (CONFIG.DEBUG) console.log(`⏳ Attente ${(remaining/1000).toFixed(1)}s...`);
        await wait(250);
    }
}

function sortDescBy(arr, key) { return [...(arr || [])].sort((a, b) => (Number(b?.[key]) || 0) - (Number(a?.[key]) || 0)); }
function topN(arr, key, n = 5) { return sortDescBy(arr, key).slice(0, n); }
function sanitizeText(s, max = 240) { if (!s || typeof s !== 'string') return ''; const t = s.replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; }
function clampAbs(v, maxAbs) { if (v == null) return null; const n = Number(v); if (!Number.isFinite(n)) return null; if (Math.abs(n) > maxAbs) return null; return n; }
function cleanSymbol(symbol) { if (symbol.includes('.')) return symbol.split('.')[0]; return symbol; }
function normalizeSector(sector) { if (!sector) return sector; const lower = sector.toLowerCase().trim(); return SECTOR_NORMALIZATION[lower] || sector; }

async function lookupNameViaSearch(sym) {
  try { const r = await axios.get('https://api.twelvedata.com/symbol_search', { params: { symbol: sym, apikey: CONFIG.API_KEY } }); const hit = r.data?.data?.[0]; return hit?.instrument_name || hit?.name || null; } catch { return null; }
}

function pickWeekly(etf) {
    return {
        symbol: etf.symbol, name: etf.name || null, isin: etf.isin || null, mic_code: etf.mic_code || null, currency: etf.currency || null,
        fund_type: etf.fund_type || null, fund_type_fr: etf.fund_type_fr || null, etf_type: etf.etf_type || null,
        underlying_ticker: etf.underlying_ticker || null, is_index_derivative: etf.is_index_derivative || false,
        aum_usd: etf.aum_usd ?? null, total_expense_ratio: etf.total_expense_ratio ?? null, yield_ttm: etf.yield_ttm ?? null,
        objective: etf.objective || '', objective_en: etf.objective_en || '',
        bond_avg_duration: etf.bond_avg_duration ?? null, bond_avg_maturity: etf.bond_avg_maturity ?? null,
        bond_credit_score: etf.bond_credit_score ?? null, bond_credit_rating: etf.bond_credit_rating ?? null,
        bond_credit_quality: etf.bond_credit_quality || [],
        sectors: etf.sectors || [], sector_top5: etf.sector_top5 || [], sector_top: etf.sector_top || null,
        sector_top5_fr: etf.sector_top5_fr || [], sector_top_fr: etf.sector_top_fr || null,
        sector_trust: etf.sector_trust ?? null, sector_signal_ok: etf.sector_signal_ok ?? null,
        sector_suspect: etf.sector_suspect ?? null, sector_bucket: etf.sector_bucket || null,
        sector_guard_reasons: etf.sector_guard_reasons || [],
        countries: (etf.countries && etf.countries.length ? etf.countries : []),
        country_top5: (etf.country_top5 && etf.country_top5.length ? etf.country_top5 : []),
        country_top: (etf.country_top5 && etf.country_top5[0]) ? etf.country_top5[0] : null,
        domicile: etf.domicile || etf.Country || null,
        holdings_top10: (etf.holdings_top10 || []).map(h => ({ symbol: h.symbol || null, name: h.name || null, weight: (h.weight != null) ? Number(h.weight) : null })),
        holding_top: etf.holding_top || null, as_of_summary: etf.as_of_summary || null, as_of_composition: etf.as_of_composition || null,
        is_single_stock: etf.is_single_stock || false, auto_detected_composition: etf.auto_detected_composition || false,
        data_quality_score: etf.data_quality_score || 0, data_quality_details: etf.data_quality_details || {}
    };
}

function calculateDataQualityScore(etf) {
    const details = { has_aum: etf.aum_usd != null, has_ter: etf.total_expense_ratio != null, has_yield: etf.yield_ttm != null, has_objective: etf.objective && etf.objective.length > 20, has_sectors: etf.sectors && etf.sectors.length > 0, has_countries: etf.countries && etf.countries.length > 0, has_holdings_top10: etf.holdings_top10 && etf.holdings_top10.length > 0, has_bond_metrics: etf.bond_avg_duration != null || etf.bond_credit_score != null };
    const weights = { has_aum: 20, has_ter: 15, has_yield: 10, has_objective: 15, has_sectors: 18, has_countries: 17, has_holdings_top10: 15, has_bond_metrics: 5 };
    let score = 0; Object.keys(details).forEach(key => { if (details[key]) score += weights[key]; });
    etf.data_quality_details = details; return score;
}

async function fxToUSD(currency) {
    if (!currency || currency === 'USD') return 1;
    if (currency === 'GBX') { const gbpRate = await fxToUSD('GBP'); return gbpRate / 100; }
    const cacheKey = currency;
    if (fxCache.has(cacheKey)) return fxCache.get(cacheKey);
    try { const { data } = await axios.get('https://api.twelvedata.com/price', { params: { symbol: `${currency}/USD`, apikey: CONFIG.API_KEY } }); const rate = Number(data?.price); if (rate > 0) { fxCache.set(cacheKey, rate); return rate; } } catch {}
    try { const { data } = await axios.get('https://api.twelvedata.com/price', { params: { symbol: `USD/${currency}`, apikey: CONFIG.API_KEY } }); const rate = Number(data?.price); if (rate > 0) { const inverted = 1 / rate; fxCache.set(cacheKey, inverted); return inverted; } } catch {}
    console.warn(`⚠️ Taux FX ${currency}/USD non trouvé, utilise 1`); fxCache.set(cacheKey, 1); return 1;
}

async function resolveSymbol(item) {
    const { symbol, mic_code, isin } = item;
    const cleaned = cleanSymbol(symbol);
    try { const quote = await axios.get('https://api.twelvedata.com/quote', { params: { symbol: cleaned, apikey: CONFIG.API_KEY } }).then(r => r.data); if (quote && quote.status !== 'error') return { symbolParam: cleaned, quote }; } catch {}
    if (mic_code && !US_MIC_CODES.includes(mic_code)) { try { const symbolWithMic = `${cleaned}:${mic_code}`; const quote = await axios.get('https://api.twelvedata.com/quote', { params: { symbol: symbolWithMic, apikey: CONFIG.API_KEY } }).then(r => r.data); if (quote && quote.status !== 'error') return { symbolParam: symbolWithMic, quote }; } catch {} }
    try { const search = await axios.get('https://api.twelvedata.com/symbol_search', { params: { symbol: cleaned, apikey: CONFIG.API_KEY } }).then(r => r.data); if (search?.data?.[0]) { const result = search.data[0]; const resolvedSymbol = US_MIC_CODES.includes(result.mic_code) ? result.symbol : `${result.symbol}:${result.mic_code}`; const quote = await axios.get('https://api.twelvedata.com/quote', { params: { symbol: resolvedSymbol, apikey: CONFIG.API_KEY } }).then(r => r.data); if (quote && quote.status !== 'error') return { symbolParam: resolvedSymbol, quote }; } } catch {}
    if (isin) { try { const search = await axios.get('https://api.twelvedata.com/symbol_search', { params: { isin: isin, apikey: CONFIG.API_KEY } }).then(r => r.data); if (search?.data?.[0]) { const result = search.data[0]; const resolvedSymbol = US_MIC_CODES.includes(result.mic_code) ? result.symbol : `${result.symbol}:${result.mic_code}`; const quote = await axios.get('https://api.twelvedata.com/quote', { params: { symbol: resolvedSymbol, apikey: CONFIG.API_KEY } }).then(r => r.data); if (quote && quote.status !== 'error') return { symbolParam: resolvedSymbol, quote }; } } catch {} }
    return null;
}

async function calculate30DayADV(symbolParam) {
    try {
        await pay(CONFIG.CREDITS.TIME_SERIES);
        const { data } = await axios.get('https://api.twelvedata.com/time_series', { params: { symbol: symbolParam, interval: '1day', outputsize: CONFIG.DAYS_HISTORY, apikey: CONFIG.API_KEY } });
        if (!data.values || data.status === 'error') return null;
        const advValues = data.values.map(day => { const volume = Number(day.volume) || 0; const close = Number(day.close) || 0; return volume * close; }).filter(v => v > 0);
        if (advValues.length === 0) return null;
        advValues.sort((a, b) => a - b);
        const mid = Math.floor(advValues.length / 2);
        const medianLocal = advValues.length % 2 ? advValues[mid] : (advValues[mid - 1] + advValues[mid]) / 2;
        return { adv_median_local: medianLocal, days_with_data: advValues.length };
    } catch (error) { if (CONFIG.DEBUG) console.error(`Erreur ADV: ${error.message}`); return null; }
}

async function fetchWeeklyPack(symbolParam, item) {
    await pay(ENRICH_COST);
    const now = new Date().toISOString();
    const [sumRes, compRes] = await Promise.all([
        axios.get('https://api.twelvedata.com/etfs/world/summary', { params: { symbol: symbolParam, apikey: CONFIG.API_KEY, dp: 5 } }),
        axios.get('https://api.twelvedata.com/etfs/world/composition', { params: { symbol: symbolParam, apikey: CONFIG.API_KEY, dp: 5 } })
    ]);
    const s = sumRes?.data?.etf?.summary || {};
    const c = compRes?.data?.etf?.composition || {};
    const fundName = sumRes?.data?.etf?.name || s?.fund_name || s?.name || item?.name || null;
    const bondBreakdown = c.bond_breakdown || {};
    const avgDuration = bondBreakdown.average_duration?.fund != null ? clampAbs(bondBreakdown.average_duration.fund, 50) : null;
    const avgMaturity = bondBreakdown.average_maturity?.fund != null ? clampAbs(bondBreakdown.average_maturity.fund, 100) : null;
    const creditQualityRaw = Array.isArray(bondBreakdown.credit_quality) ? bondBreakdown.credit_quality : [];
    const creditQuality = creditQualityRaw.map(row => ({ grade: row?.grade || null, weight: row?.weight != null ? Number(row.weight) : null }));
    let creditScoreNum = null;
    if (creditQuality.length) {
        let creditScoreSum = 0, weightSum = 0;
        for (const row of creditQuality) {
            if (!row || row.weight == null) continue;
            const gradeKey = String(row.grade || '').trim();
            const score = RATING_SCORES[gradeKey] ?? RATING_SCORES[gradeKey.toUpperCase()] ?? 50;
            creditScoreSum += score * row.weight; weightSum += row.weight;
        }
        if (weightSum > 0) creditScoreNum = Math.round(creditScoreSum / weightSum);
    }
    let creditRatingDominant = null;
    if (creditQuality.length) {
        const sorted = [...creditQuality].filter(r => r && r.weight != null && r.grade).sort((a, b) => (b.weight || 0) - (a.weight || 0));
        if (sorted.length > 0) creditRatingDominant = sorted[0].grade;
    }
    if (CONFIG.DEBUG && (avgDuration != null || avgMaturity != null || creditScoreNum != null)) console.log(`  📈 Bond metrics ${item.symbol}: duration=${avgDuration ?? 'NA'}y, maturity=${avgMaturity ?? 'NA'}y, credit_score=${creditScoreNum ?? 'NA'}, rating=${creditRatingDominant ?? 'NA'}`);
    const overviewRaw = s.overview || '';
    let objectiveFr = null;
    if (CONFIG.TRANSLATE_OBJECTIVE && !looksFrench(overviewRaw)) objectiveFr = await translateText(overviewRaw, 'fr');
    const pack = {
        name: fundName, aum_usd: (s.net_assets != null) ? Number(s.net_assets) : null,
        total_expense_ratio: (s.expense_ratio_net != null) ? Math.abs(Number(s.expense_ratio_net)) : null,
        yield_ttm: (s.yield != null) ? Number(s.yield) : null, currency: s.currency || null, fund_type: s.fund_type || null,
        objective: sanitizeText(objectiveFr || overviewRaw, CONFIG.OBJECTIVE_MAXLEN),
        objective_en: sanitizeText(overviewRaw, CONFIG.OBJECTIVE_MAXLEN),
        domicile: s.domicile || item.Country || null, as_of_summary: now, as_of_composition: now,
        bond_avg_duration: avgDuration, bond_avg_maturity: avgMaturity, bond_credit_quality: creditQuality,
        bond_credit_score: creditScoreNum, bond_credit_rating: creditRatingDominant
    };
    
    // Detect ETF type with new v2 logic
    const etfTypeInfo = detectETFType(item.symbol, fundName, pack.objective);
    pack.etf_type = etfTypeInfo.type;
    pack.underlying_ticker = etfTypeInfo.underlying_ticker || null;
    pack.is_index_derivative = etfTypeInfo.is_index_derivative || false;
    if (etfTypeInfo.leverage) pack.leverage = etfTypeInfo.leverage;
    
    let fundTypeFr = null;
    if (CONFIG.TRANSLATE_TAXONOMY && pack.fund_type && !looksFrench(pack.fund_type)) fundTypeFr = await translateLabel(pack.fund_type, 'fund_type');
    let sectors = (c.major_market_sectors || []).map(x => ({ sector: normalizeSector(x.sector), weight: (x.weight != null) ? Number(x.weight) : null }));
    if (CONFIG.TRANSLATE_TAXONOMY && sectors.length) sectors = await Promise.all(sectors.map(async (x) => ({ ...x, sector_fr: await translateLabel(x.sector, 'sector') })));
    let countries = (c.country_allocation || []).map(x => ({ country: x.country, weight: (x.allocation != null) ? Number(x.allocation) : null }));
    const holdingsRaw = (c.top_holdings || c.holdings || c.constituents || []).filter(Boolean);
    const holdings = holdingsRaw.map(h => ({ symbol: cleanSymbol(h.symbol || h.ticker || h.code || ''), name: h.name || h.security || h.company || h.title || '', weight: (h.weight != null) ? Number(h.weight) : (h.allocation != null) ? Number(h.allocation) : (h.percent != null) ? Number(h.percent) : null })).filter(h => (h.symbol || h.name));
    let autoDetected = false;
    
    // Imputation for single_stock ETF
    if (!sectors.length && etfTypeInfo.type === 'single_stock' && etfTypeInfo.ticker) {
        const stockInfo = SINGLE_STOCK_SECTORS[etfTypeInfo.ticker];
        if (stockInfo) {
            sectors = [{ sector: stockInfo.sector, weight: 1.0 }];
            if (CONFIG.TRANSLATE_TAXONOMY) sectors[0].sector_fr = await translateLabel(stockInfo.sector, 'sector');
            countries = [{ country: stockInfo.country, weight: 1.0 }];
            if (!holdings.length) holdings.push({ symbol: etfTypeInfo.ticker, name: etfTypeInfo.ticker, weight: 1.0 });
            autoDetected = true; pack.is_single_stock = true;
        }
    }
    
    // Imputation for leveraged/inverse single-stock derivative
    if (!sectors.length && (etfTypeInfo.type === 'leveraged' || etfTypeInfo.type === 'inverse') && etfTypeInfo.underlying_ticker) {
        const stockInfo = SINGLE_STOCK_SECTORS[etfTypeInfo.underlying_ticker];
        if (stockInfo) {
            sectors = [{ sector: stockInfo.sector, weight: 1.0 }];
            if (CONFIG.TRANSLATE_TAXONOMY) sectors[0].sector_fr = await translateLabel(stockInfo.sector, 'sector');
            countries = [{ country: stockInfo.country, weight: 1.0 }];
            if (!holdings.length) holdings.push({ symbol: etfTypeInfo.underlying_ticker, name: etfTypeInfo.underlying_ticker, weight: 1.0 });
            autoDetected = true;
            pack.is_single_stock = true;
        }
    }
    
    if (!countries.length && pack.domicile) countries = [{ country: pack.domicile, weight: autoDetected ? 1.0 : null, is_domicile: !autoDetected }];
    const sector_top5 = topN(sectors, 'weight', 5);
    const country_top5 = topN(countries, 'weight', 5);
    const holdings_top10 = topN(holdings, 'weight', 10);
    const holding_top = holdings_top10[0] || null;
    const sector_top5_fr = sector_top5.map(x => ({ s_fr: x.sector_fr || null, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null }));
    const sector_top = sector_top5[0] || null;
    const sector_top_fr = sector_top ? (sector_top.sector_fr || '') : '';

    // === SECTOR GUARD ===
    const guard = computeSectorGuard({ 
      symbol: item.symbol, name: fundName, fund_type: pack.fund_type, objective_en: pack.objective_en, 
      sectors, sector_top, holdings_top10, etf_type: pack.etf_type,
      underlying_ticker: pack.underlying_ticker, is_index_derivative: pack.is_index_derivative
    });

    return { ...pack, fund_type_fr: fundTypeFr, sectors, sector_top5, sector_top, sector_top5_fr, sector_top_fr, countries, country_top5, country_top: country_top5[0] || null, holdings, holdings_top10, holding_top, auto_detected_composition: autoDetected, sector_trust: guard.sector_trust, sector_signal_ok: guard.sector_signal_ok, sector_suspect: guard.sector_suspect, sector_bucket: guard.sector_bucket, sector_guard_reasons: guard.sector_guard_reasons };
}

async function processListing(item) {
    try {
        const resolved = await resolveSymbol(item); if (!resolved) return { ...item, reason: 'UNSUPPORTED_BY_PROVIDER' };
        const { symbolParam, quote } = resolved;
        const nameFromQuote = quote.name || quote.instrument_name || quote.fund_name || null;
        let finalName = nameFromQuote; if (!finalName && CONFIG.DEBUG) finalName = await lookupNameViaSearch(cleanSymbol(item.symbol));

        // Guard: action glissée dans la liste ETF
        if (item.type === 'ETF' && nameLooksLikeEquityNotETF(finalName)) {
          return { ...item, name: finalName, reason: 'NOT_ETF_NAME_LOOKS_EQUITY' };
        }

        const currency = quote.currency || 'USD'; const fx = await fxToUSD(currency);
        const advData = await calculate30DayADV(symbolParam);
        let adv_median_usd;
        if (advData) { adv_median_usd = advData.adv_median_local * fx; }
        else { const avgVolume = Number(quote.average_volume) || Number(quote.volume) || 0; const price = Number(quote.close) || Number(quote.previous_close) || 0; adv_median_usd = avgVolume * price * fx; }
        return { ...item, name: finalName, symbolParam, currency, fx_rate: fx, price: Number(quote.close) || 0, change: Number(quote.change) || 0, percent_change: Number(quote.percent_change) || 0, volume: Number(quote.volume) || 0, average_volume: Number(quote.average_volume) || 0, net_assets: Number(quote.market_capitalization) || 0, adv_median_usd, days_traded: advData?.days_with_data || 0 };
    } catch (error) { return { ...item, reason: 'API_ERROR' }; }
}

async function filterETFs() {
    console.log('📊 Filtrage hebdomadaire : ADV + enrichissement + SECTOR GUARD v14.3\n');
    console.log(`⚙️  Seuils: ETF ${(CONFIG.MIN_ADV_USD_ETF/1e6).toFixed(1)}M$ | Bonds ${(CONFIG.MIN_ADV_USD_BOND/1e6).toFixed(1)}M$`);
    console.log(`💳  Budget: ${CONFIG.CREDIT_LIMIT} crédits/min | Enrichissement: ${ENRICH_CONCURRENCY} ETF/min max`);
    console.log(`📏  Longueur max objectifs: ${CONFIG.OBJECTIVE_MAXLEN} caractères`);
    console.log(`📂  Dossier de sortie: ${OUT_DIR}\n`);
    if (CONFIG.LIMIT_ETF > 0 || CONFIG.LIMIT_BONDS > 0) { console.log('⚠️  MODE LIMITÉ ACTIVÉ:'); if (CONFIG.LIMIT_ETF > 0) console.log(`   - ETFs: ${CONFIG.LIMIT_ETF} premiers`); if (CONFIG.LIMIT_BONDS > 0) console.log(`   - Bonds: ${CONFIG.LIMIT_BONDS} premiers`); console.log(''); }
    if (CONFIG.TRANSLATE_OBJECTIVE || CONFIG.TRANSLATE_TAXONOMY) { let translatorInfo = CONFIG.TRANSLATOR; if (CONFIG.TRANSLATOR === 'deepl') translatorInfo += ` (${CONFIG.DEEPL_API_ENDPOINT})`; else if (CONFIG.TRANSLATOR === 'openai') translatorInfo += ` (${CONFIG.OPENAI_MODEL})`; const features = []; if (CONFIG.TRANSLATE_OBJECTIVE) features.push('objectifs'); if (CONFIG.TRANSLATE_TAXONOMY) features.push('taxonomies'); console.log(`🌐  Traduction: ACTIVÉE pour ${features.join(' + ')} (${translatorInfo})\n`); }
    await fs.mkdir(OUT_DIR, { recursive: true }); await loadTranslationCache();
    const etfData = await fs.readFile('data/all_etfs.csv', 'utf8'); const bondData = await fs.readFile('data/all_bonds.csv', 'utf8');
    let etfs = csv.parse(etfData, { columns: true }); let bonds = csv.parse(bondData, { columns: true });
    const totalEtfsOriginal = etfs.length; const totalBondsOriginal = bonds.length;
    if (CONFIG.LIMIT_ETF > 0 && CONFIG.LIMIT_ETF < etfs.length) { etfs = etfs.slice(0, CONFIG.LIMIT_ETF); console.log(`🔹 ETFs limités: ${etfs.length}/${totalEtfsOriginal}`); }
    if (CONFIG.LIMIT_BONDS > 0 && CONFIG.LIMIT_BONDS < bonds.length) { bonds = bonds.slice(0, CONFIG.LIMIT_BONDS); console.log(`🔹 Bonds limités: ${bonds.length}/${totalBondsOriginal}`); }
    const results = { etfs: [], bonds: [], rejected: [], stats: { total_etfs: totalEtfsOriginal, total_bonds: totalBondsOriginal, processed_etfs: etfs.length, processed_bonds: bonds.length, limited_run: CONFIG.LIMIT_ETF > 0 || CONFIG.LIMIT_BONDS > 0, timestamp: new Date().toISOString(), start_time: Date.now() } };
    const allItems = [...etfs.map(e => ({ ...e, type: 'ETF' })), ...bonds.map(b => ({ ...b, type: 'BOND' }))];
    console.log(`\n🔍 Analyse de ${allItems.length} instruments...`); if (CONFIG.LIMIT_ETF > 0 || CONFIG.LIMIT_BONDS > 0) console.log(`   (originaux: ${totalEtfsOriginal} ETFs + ${totalBondsOriginal} Bonds = ${totalEtfsOriginal + totalBondsOriginal})`); console.log('');
    const allListings = [];
    for (let i = 0; i < allItems.length; i += CONFIG.CHUNK_SIZE) {
        const batch = allItems.slice(i, i + CONFIG.CHUNK_SIZE); console.log(`📦 Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, allItems.length)}`);
        const batchPromises = batch.map(item => processListing(item)); const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(result => { if (result.symbolParam && result.adv_median_usd !== undefined) { const advInfo = `${(result.adv_median_usd/1e6).toFixed(2)}M$`; console.log(`  ${result.symbolParam} | ADV: ${advInfo} | FX: ${result.fx_rate.toFixed(4)}`); allListings.push(result); } else if (result.reason) { console.log(`  ${result.symbol} | ❌ ${result.reason}`); results.rejected.push(result); } });
    }
    console.log('\n📊 Agrégation par ISIN...');
    const isinGroups = {}; allListings.forEach(listing => { const isin = listing.isin || `NO_ISIN_${listing.symbol}`; if (!isinGroups[isin]) isinGroups[isin] = []; isinGroups[isin].push(listing); });
    Object.entries(isinGroups).forEach(([isin, listings]) => {
        const totalADV = listings.reduce((sum, l) => sum + (l.adv_median_usd || 0), 0);
        const main = listings.reduce((best, current) => (current.adv_median_usd || 0) > (best.adv_median_usd || 0) ? current : best);
        const threshold = main.type === 'BOND' ? CONFIG.MIN_ADV_USD_BOND : CONFIG.MIN_ADV_USD_ETF; const passed = totalADV >= threshold;
        const finalItem = { ...main, avg_dollar_volume: totalADV, listings: listings.map(l => ({ symbol: l.symbol, mic_code: l.mic_code, adv: l.adv_median_usd })) };
        console.log(`  ${isin} (${listings.length} listing${listings.length > 1 ? 's' : ''}) | Total ADV: ${(totalADV/1e6).toFixed(2)}M$ | ${passed ? '✅ PASS' : '❌ FAIL'}`);
        if (passed) { if (main.type === 'ETF') results.etfs.push(finalItem); else results.bonds.push(finalItem); } else results.rejected.push({ ...finalItem, failed: ['liquidity'] });
    });
    console.log('\n🧩 Enrichissement HEBDO ETFs (summary + composition + SECTOR GUARD v14.3) sous budget 2584/min…');
    results.etfs.sort((a, b) => (b.net_assets || 0) - (a.net_assets || 0));
    for (let i = 0; i < results.etfs.length; i += ENRICH_CONCURRENCY) { const batch = results.etfs.slice(i, i + ENRICH_CONCURRENCY); const batchNum = Math.floor(i/ENRICH_CONCURRENCY) + 1; const totalBatches = Math.ceil(results.etfs.length/ENRICH_CONCURRENCY); console.log(`📦 Enrichissement ETF lot ${batchNum}/${totalBatches}`); await Promise.all(batch.map(async (it) => { const symbolForApi = it.symbolParam || it.symbol; try { const weekly = await fetchWeeklyPack(symbolForApi, it); Object.assign(it, weekly); it.data_quality_score = calculateDataQualityScore(it); if (CONFIG.DEBUG) console.log(`  ${symbolForApi} | Type: ${it.etf_type} | Bucket: ${it.sector_bucket} | Trust: ${it.sector_trust}`); } catch (e) { console.log(`  ${symbolForApi} | ⚠️ Enrichissement hebdo KO: ${e.message}`); } })); }
    console.log('\n🧩 Enrichissement HEBDO BONDS (summary + composition + SECTOR GUARD) sous budget 2584/min…');
    results.bonds.sort((a, b) => (b.net_assets || 0) - (a.net_assets || 0));
    for (let i = 0; i < results.bonds.length; i += ENRICH_CONCURRENCY) { const batch = results.bonds.slice(i, i + ENRICH_CONCURRENCY); const batchNum = Math.floor(i / ENRICH_CONCURRENCY) + 1; const totalBatches = Math.ceil(results.bonds.length / ENRICH_CONCURRENCY); console.log(`📦 Enrichissement BONDS lot ${batchNum}/${totalBatches}`); await Promise.all(batch.map(async (it) => { const symbolForApi = it.symbolParam || it.symbol; try { const weekly = await fetchWeeklyPack(symbolForApi, it); Object.assign(it, weekly); it.data_quality_score = calculateDataQualityScore(it); if (CONFIG.DEBUG) console.log(`  ${symbolForApi} | Bucket: ${it.sector_bucket} | Trust: ${it.sector_trust}`); } catch (e) { console.log(`  ${symbolForApi} | ⚠️ Enrichissement bonds KO: ${e.message}`); } })); }
    const elapsedTime = Date.now() - results.stats.start_time; results.stats.elapsed_seconds = Math.round(elapsedTime / 1000); results.stats.etfs_retained = results.etfs.length; results.stats.bonds_retained = results.bonds.length; results.stats.total_retained = results.etfs.length + results.bonds.length; results.stats.rejected_count = results.rejected.length;
    const etfPositionsCount = results.etfs.reduce((acc,e)=> acc + ((e.holdings_top10 || []).length), 0); const bondsPositionsCount = results.bonds.reduce((acc,e)=> acc + ((e.holdings_top10 || []).length), 0);
    const translatedCount = results.etfs.filter(e => e.objective !== e.objective_en).length + results.bonds.filter(e => e.objective !== e.objective_en).length;
    const taxonomyTranslatedCount = results.etfs.filter(e => e.fund_type_fr || e.sector_top_fr).length + results.bonds.filter(e => e.fund_type_fr || e.sector_top_fr).length;
    const bondsWithDuration = results.bonds.filter(e => e.bond_avg_duration != null).length; const bondsWithCredit = results.bonds.filter(e => e.bond_credit_score != null).length; const bondsWithRating = results.bonds.filter(e => e.bond_credit_rating != null).length;
    const sectorSuspectsCount = results.etfs.filter(e => e.sector_suspect).length;
    const equityRejectedCount = results.rejected.filter(r => r.reason === 'NOT_ETF_NAME_LOOKS_EQUITY').length;
    
    // Bucket stats
    const bucketCounts = {};
    results.etfs.forEach(e => { const b = e.sector_bucket || 'UNKNOWN'; bucketCounts[b] = (bucketCounts[b] || 0) + 1; });
    
    results.stats.data_quality = { with_aum: results.etfs.filter(e => e.aum_usd != null).length, with_ter: results.etfs.filter(e => e.total_expense_ratio != null).length, with_yield: results.etfs.filter(e => e.yield_ttm != null).length, with_sectors: results.etfs.filter(e => e.sectors && e.sectors.length > 0).length, with_countries: results.etfs.filter(e => e.countries && e.countries.length > 0).length, with_objective: results.etfs.filter(e => e.objective && e.objective.length > 0).length, with_holdings: results.etfs.filter(e => e.holdings_top10 && e.holdings_top10.length > 0).length, with_auto_detection: results.etfs.filter(e => e.auto_detected_composition).length, avg_quality_score: results.etfs.length > 0 ? Math.round(results.etfs.reduce((acc, e) => acc + (e.data_quality_score || 0), 0) / results.etfs.length) : 0, by_etf_type: { standard: results.etfs.filter(e => e.etf_type === 'standard').length, inverse: results.etfs.filter(e => e.etf_type === 'inverse').length, leveraged: results.etfs.filter(e => e.etf_type === 'leveraged').length, single_stock: results.etfs.filter(e => e.etf_type === 'single_stock').length, structured: results.etfs.filter(e => e.etf_type === 'structured').length } };
    results.stats.sector_guard = { suspects_count: sectorSuspectsCount, reliable_count: results.etfs.length - sectorSuspectsCount, equity_filtered: equityRejectedCount, by_bucket: bucketCounts };
    results.stats.bond_metrics = { with_duration: bondsWithDuration, with_credit_score: bondsWithCredit, with_credit_rating: bondsWithRating, coverage_pct: results.bonds.length > 0 ? Math.round(bondsWithDuration / results.bonds.length * 100) : 0 };
    if (CONFIG.TRANSLATE_OBJECTIVE || CONFIG.TRANSLATE_TAXONOMY) results.stats.translation = { objectives_translated: translatedCount, taxonomies_translated: taxonomyTranslatedCount, cache_size: Object.keys(translationCache).length };
    const rejectionReasons = {}; results.rejected.forEach(item => { if (item.reason) rejectionReasons[item.reason] = (rejectionReasons[item.reason] || 0) + 1; else if (item.failed) item.failed.forEach(f => { rejectionReasons[f] = (rejectionReasons[f] || 0) + 1; }); }); results.stats.rejection_reasons = rejectionReasons;
    const filteredPath = path.join(OUT_DIR, 'filtered_advanced.json'); await fs.writeFile(filteredPath, JSON.stringify(results, null, 2));
    const weekly = { timestamp: new Date().toISOString(), limited_run: results.stats.limited_run, etfs: results.etfs.map(pickWeekly), bonds: results.bonds.map(pickWeekly), stats: { total_etfs: results.stats.etfs_retained, total_bonds: results.stats.bonds_retained, data_quality: results.stats.data_quality, sector_guard: results.stats.sector_guard, bond_metrics: results.stats.bond_metrics, translation: results.stats.translation } };
    const weeklyPath = path.join(OUT_DIR, 'weekly_snapshot.json'); await fs.writeFile(weeklyPath, JSON.stringify(weekly, null, 2));

    // === SECTOR SUSPECTS CSV (audit) ===
    const suspects = results.etfs.filter(e => e.sector_suspect).map(e => ({ symbol: e.symbol, name: e.name, sector_top: e.sector_top?.sector || '', sector_top_w: e.sector_top?.weight != null ? (e.sector_top.weight*100).toFixed(2) : '', trust: e.sector_trust, bucket: e.sector_bucket || '', reasons: (e.sector_guard_reasons || []).join('|') }));
    const suspectsHeader = 'symbol,name,sector_top,sector_top_weight_pct,sector_trust,bucket,reasons\n';
    const suspectsRows = suspects.map(x => { const esc = (s) => `"${String(s ?? '').replace(/"/g,'""')}"`; return [x.symbol, esc(x.name), esc(x.sector_top), x.sector_top_w, x.trust, x.bucket, esc(x.reasons)].join(','); }).join('\n');
    const suspectsPath = path.join(OUT_DIR, 'sector_suspects.csv'); await fs.writeFile(suspectsPath, suspectsHeader + (suspectsRows ? suspectsRows + '\n' : '')); console.log(`🧪 Audit sector guard: ${suspects.length} suspect(s) → ${suspectsPath}`);

    const csvHeaderEtf = ['symbol','name','isin','mic_code','currency','fund_type','fund_type_fr','etf_type','underlying_ticker','aum_usd','total_expense_ratio','yield_ttm','objective','sector_top','sector_top_fr','sector_top_weight','sector_trust','sector_signal_ok','sector_bucket','country_top','country_top_weight','sector_top5','sector_top5_fr','country_top5','holding_top','holdings_top10','data_quality_score'].join(',') + '\n';
    const csvRowsEtf = results.etfs.map(e => { const nameCell = `"${(e.name || '').replace(/"/g,'""')}"`; const sectorTop = e.sector_top ? e.sector_top.sector : ''; const sectorTopFr = e.sector_top_fr || e.sector_top?.sector_fr || ''; const sectorTopW = e.sector_top?.weight != null ? (e.sector_top.weight*100).toFixed(2) : ''; const countryTop = e.country_top ? e.country_top.country : (e.domicile || ''); const countryTopW = e.country_top?.weight != null ? (e.country_top.weight*100).toFixed(2) : ''; const sectorTop5 = JSON.stringify((e.sector_top5 || []).map(x => ({ s: x.sector, w: Number((x.weight*100).toFixed(2)) }))).replace(/"/g,'""'); const sectorTop5Fr = JSON.stringify(e.sector_top5_fr || []).replace(/"/g,'""'); const countryTop5 = JSON.stringify((e.country_top5 || []).map(x => ({ c: x.country, w: x.weight ? Number((x.weight*100).toFixed(2)) : null }))).replace(/"/g,'""'); const holdingTop = e.holding_top ? `${e.holding_top.symbol || ''} ${e.holding_top.name ? '('+e.holding_top.name+')' : ''}`.trim() : ''; const holdingsTop10 = JSON.stringify((e.holdings_top10 || []).map(h => ({ t: h.symbol || null, n: h.name || null, w: h.weight != null ? Number((h.weight*100).toFixed(2)) : null }))).replace(/"/g,'""'); const objective = `"${(e.objective || '').replace(/"/g, '""')}"`; return [e.symbol, nameCell, e.isin || '', e.mic_code || '', e.currency || '', e.fund_type || '', e.fund_type_fr || '', e.etf_type || '', e.underlying_ticker || '', e.aum_usd ?? '', e.total_expense_ratio ?? '', e.yield_ttm ?? '', objective, `"${sectorTop}"`, `"${sectorTopFr}"`, sectorTopW, e.sector_trust ?? '', e.sector_signal_ok ? '1' : '0', e.sector_bucket || '', `"${countryTop}"`, countryTopW, `"${sectorTop5}"`, `"${sectorTop5Fr}"`, `"${countryTop5}"`, `"${holdingTop}"`, `"${holdingsTop10}"`, e.data_quality_score || 0].join(','); }).join('\n');
    const etfCsvPath = path.join(OUT_DIR, 'weekly_snapshot_etfs.csv'); await fs.writeFile(etfCsvPath, csvHeaderEtf + (csvRowsEtf ? csvRowsEtf + '\n' : '')); console.log(`📝 CSV ETFs: ${results.etfs.length} ligne(s) → ${etfCsvPath}`);
    const csvHeaderBonds = ['symbol','name','isin','mic_code','currency','fund_type','fund_type_fr','etf_type','aum_usd','total_expense_ratio','yield_ttm','bond_avg_duration','bond_avg_maturity','bond_credit_score','bond_credit_rating','objective','sector_top','sector_top_fr','sector_top_weight','sector_trust','sector_signal_ok','sector_bucket','country_top','country_top_weight','sector_top5','sector_top5_fr','country_top5','holding_top','holdings_top10','data_quality_score'].join(',') + '\n';
    const csvRowsBonds = results.bonds.map(e => { const nameCell = `"${(e.name || '').replace(/"/g,'""')}"`; const sectorTop = e.sector_top ? e.sector_top.sector : ''; const sectorTopFr = e.sector_top_fr || e.sector_top?.sector_fr || ''; const sectorTopW = e.sector_top?.weight != null ? (e.sector_top.weight*100).toFixed(2) : ''; const countryTop = e.country_top ? e.country_top.country : (e.domicile || ''); const countryTopW = e.country_top?.weight != null ? (e.country_top.weight*100).toFixed(2) : ''; const sectorTop5 = JSON.stringify((e.sector_top5 || []).map(x => ({ s:x.sector, w:Number((x.weight*100).toFixed(2)) }))).replace(/"/g,'""'); const sectorTop5Fr = JSON.stringify(e.sector_top5_fr || []).replace(/"/g,'""'); const countryTop5 = JSON.stringify((e.country_top5 || []).map(x => ({ c:x.country, w:x.weight!=null?Number((x.weight*100).toFixed(2)):null }))).replace(/"/g,'""'); const holdingTop = e.holding_top ? `${e.holding_top.symbol || ''} ${e.holding_top.name ? '('+e.holding_top.name+')' : ''}`.trim() : ''; const holdingsTop10 = JSON.stringify((e.holdings_top10 || []).map(h => ({ t:h.symbol || null, n:h.name || null, w:h.weight!=null?Number((h.weight*100).toFixed(2)):null }))).replace(/"/g,'""'); const objective = `"${(e.objective || '').replace(/"/g,'""')}"`; return [e.symbol, nameCell, e.isin || '', e.mic_code || '', e.currency || '', e.fund_type || '', e.fund_type_fr || '', e.etf_type || '', e.aum_usd ?? '', e.total_expense_ratio ?? '', e.yield_ttm ?? '', e.bond_avg_duration ?? '', e.bond_avg_maturity ?? '', e.bond_credit_score ?? '', e.bond_credit_rating ?? '', objective, `"${sectorTop}"`, `"${sectorTopFr}"`, sectorTopW, e.sector_trust ?? '', e.sector_signal_ok ? '1' : '0', e.sector_bucket || '', `"${countryTop}"`, countryTopW, `"${sectorTop5}"`, `"${sectorTop5Fr}"`, `"${countryTop5}"`, `"${holdingTop}"`, `"${holdingsTop10}"`, e.data_quality_score || 0].join(','); }).join('\n');
    const bondsCsvPath = path.join(OUT_DIR, 'weekly_snapshot_bonds.csv'); await fs.writeFile(bondsCsvPath, csvHeaderBonds + (csvRowsBonds ? csvRowsBonds + '\n' : '')); console.log(`📝 CSV Bonds (enriched): ${results.bonds.length} ligne(s) → ${bondsCsvPath}`);
    const narrowHeader = 'etf_symbol,rank,holding_symbol,holding_name,weight_pct\n'; const narrowRows = results.etfs.flatMap(etf => { const hs = (etf.holdings_top10 && etf.holdings_top10.length) ? etf.holdings_top10 : topN(etf.holdings || [], 'weight', 10); return hs.map((h, idx) => { const etfSym = etf.symbol || ''; const rank = idx + 1; const hSym = h.symbol || ''; const hName = (h.name || '').replace(/"/g, '""'); const wPct = (h.weight != null) ? (h.weight * 100).toFixed(2) : ''; const cells = [etfSym, rank, hSym, hName, wPct].map(v => { const s = String(v); return /[",\n]/.test(s) ? `"${s}"` : s; }); return cells.join(','); }); }); const holdingsCsvPath = path.join(OUT_DIR, 'combined_etfs_holdings.csv'); await fs.writeFile(holdingsCsvPath, narrowHeader + (narrowRows.length ? narrowRows.join('\n') + '\n' : '')); console.log(`📝 CSV Holdings ETFs (Top10 only): ${narrowRows.length} lignes → ${holdingsCsvPath}`);
    const bondsNarrowHeader = 'etf_symbol,rank,holding_symbol,holding_name,weight_pct\n'; const bondsNarrowRows = results.bonds.flatMap(fund => { const hs = (fund.holdings_top10 && fund.holdings_top10.length) ? fund.holdings_top10 : topN(fund.holdings || [], 'weight', 10); return hs.map((h, idx) => { const etfSym = fund.symbol || ''; const rank = idx + 1; const hSym = h.symbol || ''; const hName = (h.name || '').replace(/"/g,'""'); const wPct = (h.weight != null) ? (h.weight * 100).toFixed(2) : ''; const cells = [etfSym, rank, hSym, hName, wPct].map(v => { const s = String(v); return /[",\n]/.test(s) ? `"${s}"` : s; }); return cells.join(','); }); }); const combinedBondsHoldingsPath = path.join(OUT_DIR, 'combined_bonds_holdings.csv'); await fs.writeFile(combinedBondsHoldingsPath, bondsNarrowHeader + (bondsNarrowRows.length ? bondsNarrowRows.join('\n') + '\n' : '')); console.log(`📝 Combined BONDS holdings (Top10): ${bondsNarrowRows.length} lignes → ${combinedBondsHoldingsPath}`);
    await saveTranslationCache();
    console.log('\n📊 RÉSUMÉ:'); if (results.stats.limited_run) console.log(`⚠️  RUN LIMITÉ: ETFs ${etfs.length}/${totalEtfsOriginal} | Bonds ${bonds.length}/${totalBondsOriginal}`); console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`); console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`); console.log(`Rejetés: ${results.rejected.length}`); console.log(`Holdings ETFs: ${etfPositionsCount} positions (Top10)`); console.log(`Holdings Bonds: ${bondsPositionsCount} positions (Top10)`); if (CONFIG.TRANSLATE_OBJECTIVE || CONFIG.TRANSLATE_TAXONOMY) { console.log(`Traductions objectifs: ${translatedCount} traduits`); console.log(`Traductions taxonomies: ${taxonomyTranslatedCount} traduits`); console.log(`Cache: ${Object.keys(translationCache).length} entrées`); } console.log(`Temps total: ${results.stats.elapsed_seconds}s`);
    console.log('\n🛡️ Sector Guard v14.3:'); console.log(`  - ETFs suspects (trust<0.50): ${sectorSuspectsCount}/${results.etfs.length}`); console.log(`  - ETFs fiables (trust>=0.50): ${results.etfs.length - sectorSuspectsCount}/${results.etfs.length}`); console.log(`  - Actions filtrées (NOT_ETF): ${equityRejectedCount}`);
    console.log('  - Par bucket:'); Object.entries(bucketCounts).sort((a,b) => b[1] - a[1]).forEach(([bucket, count]) => { console.log(`    • ${bucket}: ${count}`); });
    console.log('\n📈 Métriques obligataires:'); console.log(`  - Bonds avec duration: ${bondsWithDuration}/${results.bonds.length}`); console.log(`  - Bonds avec credit_score: ${bondsWithCredit}/${results.bonds.length}`); console.log(`  - Bonds avec credit_rating: ${bondsWithRating}/${results.bonds.length}`);
    console.log('\n📊 Qualité des données:'); Object.entries(results.stats.data_quality).forEach(([key, count]) => { if (typeof count === 'object') { console.log(`  - ${key}:`); Object.entries(count).forEach(([subkey, subcount]) => { console.log(`    • ${subkey}: ${subcount}`); }); } else console.log(`  - ${key}: ${count}/${results.etfs.length}`); });
    console.log('\n📊 Raisons de rejet:'); Object.entries(rejectionReasons).forEach(([reason, count]) => { console.log(`  - ${reason}: ${count}`); });
    console.log(`\n✅ Résultats complets: ${filteredPath}`); console.log(`✅ Weekly snapshot JSON: ${weeklyPath}`); console.log(`✅ CSV ETFs: ${etfCsvPath}`); console.log(`✅ CSV Bonds: ${bondsCsvPath}`); console.log(`✅ CSV Holdings ETFs: ${holdingsCsvPath}`); console.log(`✅ CSV Holdings Bonds: ${combinedBondsHoldingsPath}`); console.log(`✅ Sector suspects: ${suspectsPath}`); if (CONFIG.TRANSLATE_OBJECTIVE || CONFIG.TRANSLATE_TAXONOMY) console.log(`✅ Cache traductions: ${TRANSLATION_CACHE_PATH}`);
    if (process.env.GITHUB_OUTPUT) { const fsSync = require('fs'); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `etfs_count=${results.etfs.length}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `bonds_count=${results.bonds.length}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `etf_holdings_rows=${narrowRows.length}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `bonds_holdings_rows=${bondsNarrowRows.length}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `total_holdings_positions=${etfPositionsCount + bondsPositionsCount}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `bonds_with_duration=${bondsWithDuration}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `bonds_with_credit=${bondsWithCredit}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `bonds_with_rating=${bondsWithRating}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `sector_suspects=${sectorSuspectsCount}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `equity_filtered=${equityRejectedCount}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `limited_run=${results.stats.limited_run}\n`); if (CONFIG.TRANSLATE_OBJECTIVE || CONFIG.TRANSLATE_TAXONOMY) { fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `objectives_translated=${translatedCount}\n`); fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `taxonomies_translated=${taxonomyTranslatedCount}\n`); } }
}

if (!CONFIG.API_KEY) { console.error('❌ TWELVE_DATA_API_KEY manquante'); process.exit(1); }
filterETFs().catch(error => { console.error('❌ Erreur:', error); process.exit(1); });
