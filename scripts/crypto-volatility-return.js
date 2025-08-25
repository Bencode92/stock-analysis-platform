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
const OUT_DIR  = process.env.OUTPUT_DIR || 'data/metrics';
const INPUT    = 'Crypto.csv';

// =====================
// Configuration
// =====================
const INTERVAL       = (process.env.VOL_INTERVAL || '1day').toLowerCase(); // '1day' ou '1h'
const LOOKBACK_DAYS  = Number(process.env.LOOKBACK_DAYS || 120);
const STALE_HOURS    = Number(process.env.STALE_HOURS || 48); // seuil d'obsolescence

// Fenêtres de calcul
const WIN_RET_1D   = 1;
const WIN_RET_7D   = 7;
const WIN_RET_30D  = 30;
const WIN_VOL_7D   = 7;
const WIN_VOL_30D  = 30;

// Exchanges préférés pour choisir la source
const EX_PREF = ["Binance","Coinbase Pro","Kraken","BitStamp","Bitfinex","Bybit","OKX","Gate.io","KuCoin"];

// Exchanges "Tier-1" (pour tier1_listed)
const TIER1_EXCHANGES = new Set([
  "Binance","Coinbase Pro","Kraken","OKX","Bybit","BitStamp","Bitfinex","Gate.io","KuCoin","Crypto.com Exchange"
]);

// =====================
// Helpers CSV
// =====================
function parseCSV(t) {
  return parse(t, { columns: true, skip_empty_lines: true, bom: true });
}
async function readCSV(f) { return parseCSV(await fs.readFile(f, 'utf8')); }
async function writeCSV(file, rows, header) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const out = [header.join(','), ...rows.map(o => header.map(h => esc(o[h])).join(','))].join('\n');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, out, 'utf8');
}

// =====================
// Exchanges utils
// =====================
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

function hasTier1(list) {
  if (!Array.isArray(list)) return false;
  return list.some(ex => TIER1_EXCHANGES.has(ex));
}

// =====================
// Rate limit
// =====================
let lastReq = 0;
const MIN_DELAY = Number(process.env.MIN_DELAY_MS || 60);
async function throttle() {
  const d = Date.now() - lastReq;
  if (d < MIN_DELAY) await new Promise(r => setTimeout(r, MIN_DELAY - d));
  lastReq = Date.now();
}

// =====================
// Fetch time series
// =====================
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
    if (!vals.length && exchange) {
      // retry sans exchange si vide
      return fetchCloses(symbol, null, interval, barsNeeded);
    }
    return vals.map(v => ({
      t: v.datetime,
      c: Number(v.close) || 0,
      h: Number(v.high)  || 0,
      l: Number(v.low)   || 0
    }));
  } catch {
    return [];
  }
}

// =====================
// Math utils
// =====================
function pct(a, b) { return b ? (a / b - 1) : 0; }
function logret(a, b) { return (a > 0 && b > 0) ? Math.log(a / b) : 0; }

function stdev(arr) {
  const n = arr.length;
  if (!n) return 0;
  const m = arr.reduce((s, x) => s + x, 0) / n;
  const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1 || 1);
  return Math.sqrt(v);
}

function annualizeStd(std, interval) {
  // 365 jours, ou 24*365 barres horaires
  if (interval === '1h') return std * Math.sqrt(24 * 365);
  return std * Math.sqrt(365);
}

// ATR14 (en % du dernier close)
function atrPct(candles, n = 14) {
  const N = Math.min(n, candles.length - 1);
  if (N <= 0) return 0;
  const trs = [];
  for (let i = candles.length - N; i < candles.length; i++) {
    const cur = candles[i], prev = candles[i - 1];
    const hl = cur.h - cur.l;
    const hc = Math.abs(cur.h - prev.c);
    const lc = Math.abs(cur.l - prev.c);
    trs.push(Math.max(hl, hc, lc));
  }
  const atr = trs.reduce((s, x) => s + x, 0) / trs.length;
  const lastClose = candles[candles.length - 1].c || 1;
  return (atr / lastClose) * 100;
}

// =====================
// MAIN
// =====================
(async () => {
  console.log('🚀 Analyse Crypto - TOUTES les cryptos (retour & volatilité)');
  console.log('============================================================');
  console.log('📊 Configuration:');
  console.log(`  - Intervalle: ${INTERVAL}`);
  console.log(`  - Lookback: ${LOOKBACK_DAYS} jours`);
  console.log(`  - STALE_HOURS: ${STALE_HOURS}h`);
  console.log('  - Sortie: UN SEUL fichier CSV');
  console.log('============================================================\n');

  const rows = await readCSV(path.join(DATA_DIR, INPUT));
  console.log(`📄 Source: ${INPUT} (${rows.length} cryptos)\n`);

  const barsNeeded = INTERVAL === '1h'
    ? Math.max(24 * WIN_VOL_30D + 24, 24 * LOOKBACK_DAYS)
    : Math.max(WIN_VOL_30D + 10, LOOKBACK_DAYS);

  const results = [];
  let i = 0;
  const stats = { total: rows.length, with_data: 0, no_data: 0 };

  console.log('🔄 Traitement inclusif (aucun filtrage sur le volume)…\n');

  for (const r of rows) {
    i++;
    const symbol = (r.symbol || '').trim();
    const base   = (r.currency_base || '').trim();
    const quote  = (r.currency_quote || '').trim();
    const exList = toExchangeList(r.available_exchanges);
    const useEx  = pickPreferredExchange(exList);

    // ligne résultat (on la garde même sans données)
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
      tier1_listed: hasTier1(exList) ? 'true' : 'false',
      stale: '',
      data_points: '0'
    };

    try {
      const candles = await fetchCloses(symbol, useEx, INTERVAL, barsNeeded);

      if (candles.length > 0) {
        const closes = candles.map(x => x.c);
        const last   = closes[closes.length - 1];
        const lastDt = candles[candles.length - 1].t;

        // fraîcheur
        let isStale = true;
        if (lastDt) {
          const ageH = (Date.now() - new Date(lastDt).getTime()) / 36e5;
          isStale = ageH > STALE_HOURS;
        }

        result.last_close   = last.toFixed(6);
        result.last_datetime= lastDt || '';
        result.stale        = isStale ? 'true' : 'false';
        result.data_points  = String(candles.length);

        // ret 1d = dernier vs barre précédente
        if (closes.length >= (INTERVAL === '1h' ? 2 : 2)) {
          const prev1 = closes[closes.length - 2];
          result.ret_1d_pct = (pct(last, prev1) * 100).toFixed(2);
        }

        // ret 7d = dernier vs N barres plus tôt (N = 7 jours ou 24*7 heures) — index corrigé
        const N7 = (INTERVAL === '1h') ? 24 * WIN_RET_7D : WIN_RET_7D;
        if (closes.length >= N7 + 1) {
          const prev7 = closes[closes.length - N7 - 0]; // <- pas de -1
          result.ret_7d_pct = (pct(last, prev7) * 100).toFixed(2);

          // Volatilité 7j (log-returns)
          const start7 = Math.max(1, closes.length - N7);
          const rets7 = [];
          for (let k = start7; k < closes.length; k++) rets7.push(logret(closes[k], closes[k - 1]));
          const vol7 = stdev(rets7);
          result.vol_7d_annual_pct = (annualizeStd(vol7, INTERVAL) * 100).toFixed(2);
        }

        // ret 30d
        const N30 = (INTERVAL === '1h') ? 24 * WIN_RET_30D : WIN_RET_30D;
        if (closes.length >= N30 + 1) {
          const prev30 = closes[closes.length - N30 - 0];
          result.ret_30d_pct = (pct(last, prev30) * 100).toFixed(2);

          // Volatilité 30j
          const start30 = Math.max(1, closes.length - N30);
          const rets30 = [];
          for (let k = start30; k < closes.length; k++) rets30.push(logret(closes[k], closes[k - 1]));
          const vol30 = stdev(rets30);
          result.vol_30d_annual_pct = (annualizeStd(vol30, INTERVAL) * 100).toFixed(2);
        }

        // ATR14%
        if (candles.length >= 14) {
          result.atr14_pct = atrPct(candles, 14).toFixed(2);
        }

        stats.with_data++;
        console.log(`  ✅ ${symbol.padEnd(16)} ${useEx ? ('(' + useEx + ')').padEnd(14) : ''} ${candles.length} points`);
      } else {
        stats.no_data++;
        result.stale = 'true'; // rien reçu => considère "stale"
        console.log(`  ⚪ ${symbol.padEnd(16)} Pas de données`);
      }
    } catch {
      stats.no_data++;
      result.stale = 'true';
      console.log(`  ⚠️  ${symbol.padEnd(16)} Erreur mais ligne conservée`);
    }

    results.push(result);

    if (i % 20 === 0) console.log(`\n  📊 Progression: ${i}/${rows.length}\n`);
  }

  // =====================
  // Sortie
  // =====================
  const header = [
    'symbol','currency_base','currency_quote','exchange_used',
    'last_close','last_datetime',
    'ret_1d_pct','ret_7d_pct','ret_30d_pct',
    'vol_7d_annual_pct','vol_30d_annual_pct','atr14_pct',
    'tier1_listed','stale','data_points'
  ];

  const outputFile = path.join(OUT_DIR, 'crypto_all_metrics.csv');
  await writeCSV(outputFile, results, header);

  // =====================
  // Stats console
  // =====================
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(60));
  console.log(`✅ Total cryptos traitées: ${stats.total}`);
  console.log(`📈 Avec données: ${stats.with_data}`);
  console.log(`⚪ Sans données: ${stats.no_data}`);
  console.log('='.repeat(60));
  console.log('\n✅ UN SEUL fichier généré:');
  console.log(`  📁 ${outputFile}`);
  console.log(`  📊 ${results.length} lignes (TOUTES les cryptos)`);

  // GitHub Actions outputs
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_total=${stats.total}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_with_data=${stats.with_data}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `metrics_file=${outputFile}\n`);
  }

  console.log('\n✨ Terminé !');
})();