// scripts/crypto-volatility-return.js
// npm i csv-parse axios
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) { 
  console.error('❌ TWELVE_DATA_API_KEY manquante'); 
  process.exit(1); 
}

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR = process.env.OUTPUT_DIR || 'data/metrics';
const INPUT = 'Crypto.csv';

// Configuration
const INTERVAL = (process.env.VOL_INTERVAL || '1day').toLowerCase();
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 120);

// Fenêtres de calcul
const WIN_RET_1D = 1;
const WIN_RET_7D = 7;
const WIN_RET_30D = 30;
const WIN_VOL_7D = 7;
const WIN_VOL_30D = 30;

// --- helpers csv ---
function parseCSV(t) { 
  return parse(t, { columns: true, skip_empty_lines: true, bom: true }); 
}

async function readCSV(f) { 
  return parseCSV(await fs.readFile(f, 'utf8')); 
}

async function writeCSV(file, rows, header) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const out = [header.join(','), ...rows.map(o => header.map(h => esc(o[h])).join(','))].join('\n');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, out, 'utf8');
}

// --- exchanges ---
const EX_PREF = ["Binance", "Coinbase Pro", "Kraken", "BitStamp", "Bitfinex", "Bybit", "OKX", "Gate.io", "KuCoin"];

function normalizeExchange(n) {
  if (!n) return null;
  n = String(n).trim();
  if (/^okex$/i.test(n)) return 'OKX';
  if (/^coinbase$/i.test(n)) return 'Coinbase Pro';
  return n || null;
}

function toExchangeList(str) {
  if (!str) return [];
  const s = String(str).trim();
  try { 
    const a = JSON.parse(s); 
    if (Array.isArray(a)) return a.map(normalizeExchange).filter(Boolean); 
  } catch {}
  const stripped = s.replace(/^\[|\]$/g, '').replace(/'/g, '"');
  const parts = stripped.split(/[;,]/).map(x => normalizeExchange(x)).filter(Boolean);
  return parts.length ? parts : (normalizeExchange(s) ? [normalizeExchange(s)] : []);
}

function pickPreferredExchange(list) { 
  for (const e of EX_PREF) if (list.includes(e)) return e; 
  return list[0] || null; 
}

// --- rate limit ---
let lastReq = 0;
const MIN_DELAY = Number(process.env.MIN_DELAY_MS || 60);

async function throttle() { 
  const d = Date.now() - lastReq; 
  if (d < MIN_DELAY) await new Promise(r => setTimeout(r, MIN_DELAY - d)); 
  lastReq = Date.now(); 
}

// --- fetch time series ---
async function fetchCloses(symbol, exchange, interval, barsNeeded) {
  const params = {
    symbol, 
    interval,
    outputsize: barsNeeded,
    order: 'asc',
    timezone: 'UTC',
    apikey: API_KEY,
    ...(exchange ? { exchange } : {})
  };
  
  await throttle();
  
  try {
    const { data } = await axios.get('https://api.twelvedata.com/time_series', { params });
    let vals = Array.isArray(data?.values) ? data.values : [];
    
    // Si pas de données avec exchange, réessayer sans
    if (!vals.length && exchange) {
      return fetchCloses(symbol, null, interval, barsNeeded);
    }
    
    return vals.map(v => ({ 
      t: v.datetime, 
      c: Number(v.close) || 0, 
      h: Number(v.high) || 0, 
      l: Number(v.low) || 0 
    }));
  } catch (error) {
    // On retourne un tableau vide mais on ne rejette PAS la crypto
    return [];
  }
}

// --- calculs mathématiques ---
function pct(a, b) { 
  return b ? (a / b - 1) : 0; 
}

function logret(a, b) { 
  return (a > 0 && b > 0) ? Math.log(a / b) : 0; 
}

function stdev(arr) {
  const n = arr.length; 
  if (!n) return 0;
  const m = arr.reduce((s, x) => s + x, 0) / n;
  const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1 || 1);
  return Math.sqrt(v);
}

function lastN(arr, n) { 
  return n > 0 ? arr.slice(-n) : []; 
}

function annualizeStd(std, interval) {
  if (interval === '1h') return std * Math.sqrt(24 * 365);
  return std * Math.sqrt(365);
}

// ATR14 (en % du dernier close)
function atrPct(candles, n = 14) {
  const N = Math.min(n, candles.length - 1);
  if (N <= 0) return 0;
  let trs = [];
  for (let i = candles.length - N; i < candles.length; i++) {
    const cur = candles[i], prev = candles[i - 1];
    const hl = cur.h - cur.l;
    const hc = Math.abs(cur.h - prev.c);
    const lc = Math.abs(cur.l - prev.c);
    const tr = Math.max(hl, hc, lc);
    trs.push(tr);
  }
  const atr = trs.reduce((s, x) => s + x, 0) / trs.length;
  const lastClose = candles[candles.length - 1].c || 1;
  return (atr / lastClose) * 100;
}

// --- MAIN ---
(async () => {
  console.log('🚀 Analyse Crypto - TOUTES les cryptos sans filtrage');
  console.log('=' .repeat(60));
  console.log('📊 Configuration:');
  console.log(`  - Intervalle: ${INTERVAL}`);
  console.log(`  - Lookback: ${LOOKBACK_DAYS} jours`);
  console.log(`  - Mode: INCLUSIF (toutes les cryptos gardées)`);
  console.log(`  - Sortie: UN SEUL fichier CSV`);
  console.log('=' .repeat(60) + '\n');
  
  const rows = await readCSV(path.join(DATA_DIR, INPUT));
  console.log(`📄 Source: ${INPUT} (${rows.length} cryptos)\n`);

  const barsNeeded = INTERVAL === '1h'
    ? Math.max(24 * WIN_VOL_30D + 24, 24 * LOOKBACK_DAYS)
    : Math.max(WIN_VOL_30D + 10, LOOKBACK_DAYS);

  const results = [];
  let i = 0;
  let stats = {
    total: rows.length,
    with_data: 0,
    no_data: 0
  };

  console.log('🔄 Traitement de TOUTES les cryptos...\n');

  for (const r of rows) {
    i++;
    const symbol = (r.symbol || '').trim();
    const base = (r.currency_base || '').trim();
    const quote = (r.currency_quote || '').trim();
    const exList = toExchangeList(r.available_exchanges);
    const useEx = pickPreferredExchange(exList);

    // On va TOUJOURS créer une ligne pour cette crypto
    const result = {
      symbol,
      currency_base: base,
      currency_quote: quote,
      exchange_used: useEx || '',
      last_close: '',
      last_datetime: '',
      ret_1d_pct: '',
      ret_7d_pct: '',
      ret_30d_pct: '',
      vol_7d_annual_pct: '',
      vol_30d_annual_pct: '',
      atr14_pct: '',
      data_points: '0'
    };

    try {
      const candles = await fetchCloses(symbol, useEx, INTERVAL, barsNeeded);
      
      if (candles.length > 0) {
        const closes = candles.map(x => x.c);
        const last = closes[closes.length - 1];
        const lastDt = candles[candles.length - 1].t;
        
        result.last_close = last.toFixed(6);
        result.last_datetime = lastDt;
        result.data_points = String(candles.length);
        
        // Calculs si on a assez de données
        if (closes.length >= 2) {
          const prev1 = closes[closes.length - 2];
          result.ret_1d_pct = (pct(last, prev1) * 100).toFixed(2);
        }
        
        if (closes.length >= (INTERVAL === '1h' ? 24 * 7 + 1 : 7 + 1)) {
          const prev7 = closes[closes.length - (INTERVAL === '1h' ? 24 * 7 + 1 : 7 + 1)];
          result.ret_7d_pct = (pct(last, prev7) * 100).toFixed(2);
          
          // Volatilité 7j
          let rets = [];
          const start7 = Math.max(1, closes.length - (INTERVAL === '1h' ? 24 * 7 : 7));
          for (let k = start7; k < closes.length; k++) {
            rets.push(logret(closes[k], closes[k - 1]));
          }
          const vol7 = stdev(rets);
          result.vol_7d_annual_pct = (annualizeStd(vol7, INTERVAL) * 100).toFixed(2);
        }
        
        if (closes.length >= (INTERVAL === '1h' ? 24 * 30 + 1 : 30 + 1)) {
          const prev30 = closes[closes.length - (INTERVAL === '1h' ? 24 * 30 + 1 : 30 + 1)];
          result.ret_30d_pct = (pct(last, prev30) * 100).toFixed(2);
          
          // Volatilité 30j
          let rets = [];
          const start30 = Math.max(1, closes.length - (INTERVAL === '1h' ? 24 * 30 : 30));
          for (let k = start30; k < closes.length; k++) {
            rets.push(logret(closes[k], closes[k - 1]));
          }
          const vol30 = stdev(rets);
          result.vol_30d_annual_pct = (annualizeStd(vol30, INTERVAL) * 100).toFixed(2);
        }
        
        // ATR si on a au moins 14 bougies
        if (candles.length >= 14) {
          const atr = atrPct(candles, 14);
          result.atr14_pct = atr.toFixed(2);
        }
        
        stats.with_data++;
        console.log(`  ✅ ${symbol.padEnd(16)} ${useEx ? ('(' + useEx + ')').padEnd(14) : ''} ${candles.length} points`);
      } else {
        stats.no_data++;
        console.log(`  ⚪ ${symbol.padEnd(16)} Pas de données`);
      }
    } catch (e) {
      // Même en cas d'erreur, on garde la ligne avec des valeurs vides
      stats.no_data++;
      console.log(`  ⚠️  ${symbol.padEnd(16)} Erreur mais ligne conservée`);
    }
    
    // On ajoute TOUJOURS le résultat
    results.push(result);
    
    if (i % 20 === 0) {
      console.log(`\n  📊 Progression: ${i}/${rows.length}\n`);
    }
  }

  // Headers
  const header = [
    'symbol', 'currency_base', 'currency_quote', 'exchange_used',
    'last_close', 'last_datetime',
    'ret_1d_pct', 'ret_7d_pct', 'ret_30d_pct',
    'vol_7d_annual_pct', 'vol_30d_annual_pct', 'atr14_pct',
    'data_points'
  ];

  // UN SEUL fichier avec TOUTES les cryptos
  const outputFile = path.join(OUT_DIR, 'crypto_all_metrics.csv');
  await writeCSV(outputFile, results, header);

  // Statistiques finales
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(60));
  console.log(`✅ Total cryptos traitées: ${stats.total}`);
  console.log(`📈 Avec données: ${stats.with_data}`);
  console.log(`⚪ Sans données: ${stats.no_data}`);
  console.log('='.repeat(60));
  
  // Quelques stats sur les cryptos avec données
  const withMetrics = results.filter(r => r.ret_30d_pct !== '' && r.vol_30d_annual_pct !== '');
  if (withMetrics.length > 0) {
    const avgRet30 = withMetrics.reduce((s, x) => s + Number(x.ret_30d_pct), 0) / withMetrics.length;
    const avgVol30 = withMetrics.reduce((s, x) => s + Number(x.vol_30d_annual_pct), 0) / withMetrics.length;
    
    console.log('\n📈 Stats moyennes (cryptos avec données 30j):');
    console.log(`  - Rendement 30j moyen: ${avgRet30.toFixed(2)}%`);
    console.log(`  - Volatilité 30j moyenne: ${avgVol30.toFixed(2)}%`);
    console.log(`  - Nombre de cryptos avec métriques 30j: ${withMetrics.length}`);
    
    // Top 5 pour info (mais pas de fichiers séparés)
    const topMomentum = [...withMetrics]
      .sort((a,b) => Number(b.ret_30d_pct) - Number(a.ret_30d_pct))
      .slice(0,5);
    
    const topVolatility = [...withMetrics]
      .sort((a,b) => Number(b.vol_30d_annual_pct) - Number(a.vol_30d_annual_pct))
      .slice(0,5);
    
    console.log('\n🎯 Top 5 Momentum (30j):');
    topMomentum.forEach((r,i) => {
      console.log(`  ${i+1}. ${r.symbol.padEnd(12)} +${r.ret_30d_pct}% (Vol: ${r.vol_30d_annual_pct}%)`);
    });
    
    console.log('\n⚡ Top 5 Volatilité (30j):');
    topVolatility.forEach((r,i) => {
      console.log(`  ${i+1}. ${r.symbol.padEnd(12)} ${r.vol_30d_annual_pct}% (R30d: ${r.ret_30d_pct}%)`);
    });
  }
  
  console.log('\n✅ UN SEUL fichier généré:');
  console.log(`  📁 ${outputFile}`);
  console.log(`  📊 ${results.length} lignes (TOUTES les cryptos)`);
  
  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_total=${stats.total}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_with_data=${stats.with_data}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `output_file=${outputFile}\n`);
  }
  
  console.log('\n✨ Terminé! Toutes les cryptos ont été conservées dans le fichier.');
})();