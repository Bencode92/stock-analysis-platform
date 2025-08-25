// scripts/crypto-filter-by-volume.js
// npm i csv-parse axios
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) { console.error('❌ TWELVE_DATA_API_KEY manquante'); process.exit(1); }

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR  = process.env.OUTPUT_DIR || 'data/filtered';
const INPUT    = 'Crypto.csv';

// Seuils (notionnel USD)
const MIN_USD_DAY   = Number(process.env.MIN_USD_DAY   || 1_000_000);
const MIN_USD_AVG7D = Number(process.env.MIN_USD_AVG7D || 2_000_000);

const EX_PREF = ["Binance","Coinbase Pro","Kraken","BitStamp","Bitfinex","Bybit","OKX","OKEx","Gate.io","KuCoin","Crypto.com Exchange"];
const HEADER_OUT = ['symbol','currency_base','currency_quote','exchange_used','vol_usd_1d','vol_usd_avg7d','last_close','last_datetime','stale'];
const HEADER_REJ = [...HEADER_OUT,'reason'];

function parseCSV(t){ return parse(t, { columns:true, skip_empty_lines:true, bom:true }); }
async function readCSV(f){ return parseCSV(await fs.readFile(f,'utf8')); }
async function writeCSV(file, rows, header){
  const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const out = [header.join(','), ...rows.map(o => header.map(h => esc(o[h])).join(','))].join('\n');
  await fs.mkdir(path.dirname(file), { recursive:true });
  await fs.writeFile(file, out, 'utf8');
}

function normalizeExchange(n){
  if (!n) return null; n = String(n).trim();
  if (/^okex$/i.test(n)) return 'OKX';
  if (/^coinbase$/i.test(n)) return 'Coinbase Pro';
  return n || null;
}
function toExchangeList(str){
  if (!str) return [];
  const s = String(str).trim();
  try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(normalizeExchange).filter(Boolean); } catch {}
  const stripped = s.replace(/^\[|\]$/g,'').replace(/'/g,'"');
  const parts = stripped.split(/[;,]/).map(x => normalizeExchange(x)).filter(Boolean);
  return parts.length ? parts : (normalizeExchange(s) ? [normalizeExchange(s)] : []);
}
function pickPreferredExchange(list){ for (const e of EX_PREF) if (list.includes(e)) return e; return list[0] || null; }

// FX cache pour convertir les quotes non-USD (on n'a que EUR dans ton flux)
const fxCache = {};
async function fxToUSD(code){ // code ex: 'USD','USDT','EUR'
  if (!code || code === 'USD' || code === 'USDT') return 1;
  if (fxCache[code]) return fxCache[code];
  const pair = `${code}/USD`;
  try {
    const { data } = await axios.get('https://api.twelvedata.com/price', { params:{ symbol: pair, apikey: API_KEY }});
    const rate = Number(data?.price) || 0;
    fxCache[code] = rate || 1; // fallback 1 si indispo
    return fxCache[code];
  } catch {
    fxCache[code] = 1;
    return 1;
  }
}

// map libellés → codes
function quoteCode(label){
  const x = (label||'').toLowerCase();
  if (x.includes('usdt')) return 'USDT';
  if (x.includes('us dollar') || x === 'usd') return 'USD';
  if (x.includes('euro') || x === 'eur') return 'EUR';
  return 'USD'; // par sécurité
}

// Rate limit
let lastReq = 0; const MIN_DELAY = Number(process.env.MIN_DELAY_MS || 60);
async function throttle(){ const d = Date.now() - lastReq; if (d < MIN_DELAY) await new Promise(r=>setTimeout(r, MIN_DELAY-d)); lastReq = Date.now(); }

// Helper pour lire des séries intraday
async function fetchIntradaySeries(symbol, exchange, interval, outputsize) {
  const params = {
    symbol,
    interval,                 // '1h'
    outputsize,               // ex. 24*7 + 2
    order: 'asc',
    timezone: 'UTC',
    apikey: API_KEY,
    ...(exchange ? { exchange } : {})
  };
  await throttle();
  const { data } = await axios.get('https://api.twelvedata.com/time_series', { params });
  const vals = Array.isArray(data?.values) ? data.values : [];
  if (!vals.length && exchange) {
    // retry sans exchange si vide
    return fetchIntradaySeries(symbol, null, interval, outputsize);
  }
  return vals;
}

// Nouvelle fonction fetchVolumes utilisant les données intraday (1h)
async function fetchVolumes(symbol, exchange, quoteCcyCode) {
  // 1) séries 1h sur 7 jours (168 bougies + marge)
  const HOURS_1D = 24;
  const DAYS_7D  = 7;
  const vals = await fetchIntradaySeries(symbol, exchange, '1h', HOURS_1D * DAYS_7D + 4);

  if (!vals.length) {
    // aucune data exploitable → tout à 0
    return { usd1d: 0, avg7: 0, lastClose: 0, lastDt: '', stale: true, usedExchange: exchange || '' };
  }

  // Mode verbose pour debug (optionnel)
  if (process.env.TD_VERBOSE === '1' && vals.length > 0) {
    console.log(`    📊 ${symbol}: ${vals.length} bougies 1h récupérées`);
    const sample = vals.slice(-3);
    sample.forEach(v => {
      console.log(`       ${v.datetime}: close=${v.close} volume=${v.volume}`);
    });
  }

  // close/volume → notionnel par bougie
  const notional = vals.map(v => (Number(v.close) || 0) * (Number(v.volume) || 0));

  const lastIdx = vals.length - 1;
  const lastClose = Number(vals[lastIdx]?.close) || 0;
  const lastDt    = vals[lastIdx]?.datetime || '';
  const stale     = lastDt ? ((Date.now() - new Date(lastDt).getTime())/36e5) > 48 : true;

  const last24  = notional.slice(-HOURS_1D);
  const last168 = notional.slice(-HOURS_1D * DAYS_7D);

  const sum = arr => arr.reduce((s,x)=>s + x, 0);
  let usd1d = Math.round(sum(last24));
  let avg7  = Math.round(sum(last168) / DAYS_7D);

  // conversion si quote ≠ USD/USDT (ex. EUR)
  const fx = await fxToUSD(quoteCcyCode);
  usd1d = Math.round(usd1d * fx);
  avg7  = Math.round(avg7  * fx);

  // si on a dû retomber sans exchange, signale-le
  return { usd1d, avg7, lastClose, lastDt, stale, usedExchange: exchange || '' };
}

(async ()=>{
  console.log('🚀 Démarrage du filtrage des crypto-monnaies (données intraday 1h)');
  console.log('📊 Configuration:');
  console.log(`  - Volume 24h min: ${MIN_USD_DAY.toLocaleString()} USD`);
  console.log(`  - Volume 7j moy min: ${MIN_USD_AVG7D.toLocaleString()} USD`);
  if (process.env.TD_VERBOSE === '1') {
    console.log(`  - Mode verbose activé (TD_VERBOSE=1)`);
  }
  console.log('');

  const rows = await readCSV(path.join(DATA_DIR, INPUT));
  console.log(`📄 Source: ${path.join(DATA_DIR, INPUT)} (${rows.length} lignes)\n`);
  console.log(`🔎 Seuils: Volume 24h ≥ $${MIN_USD_DAY.toLocaleString()} OU Moyenne 7j ≥ $${MIN_USD_AVG7D.toLocaleString()}\n`);

  const accepted = [], rejected = [];
  let i = 0;

  for (const r of rows){
    i++;
    const symbol = (r.symbol||'').trim();
    const quoteLabel = (r.currency_quote||'').trim();
    const exList = toExchangeList(r.available_exchanges);
    const useEx  = pickPreferredExchange(exList);
    const qCode  = quoteCode(quoteLabel);

    try{
      const res = await fetchVolumes(symbol, useEx, qCode);
      const rowOut = {
        symbol,
        currency_base: (r.currency_base||'').trim(),
        currency_quote: quoteLabel,
        exchange_used: res.usedExchange || '',
        vol_usd_1d: res.usd1d,
        vol_usd_avg7d: res.avg7,
        last_close: res.lastClose,
        last_datetime: res.lastDt || '',
        stale: res.stale ? 'yes' : 'no'
      };

      const pass = (!res.stale) && (res.usd1d >= MIN_USD_DAY || res.avg7 >= MIN_USD_AVG7D);

      if (pass){
        accepted.push(rowOut);
        console.log(`  ✅ ${symbol.padEnd(16)} ${res.usedExchange?('('+res.usedExchange+') ').padEnd(14):''}`+
                    `1d≈$${res.usd1d.toLocaleString()} avg7≈$${res.avg7.toLocaleString()}`);
      } else {
        const why = res.stale ? 'stale>48h'
          : `volume faible (1d=$${res.usd1d.toLocaleString()} ET avg7=$${res.avg7.toLocaleString()})`;
        rejected.push({ ...rowOut, reason: why });
        console.log(`  ❌ ${symbol.padEnd(16)} ${res.usedExchange?('('+res.usedExchange+') ').padEnd(14):''}${why}`);
      }
    } catch(e){
      rejected.push({
        symbol,
        currency_base: (r.currency_base||'').trim(),
        currency_quote: quoteLabel,
        exchange_used: useEx || '',
        vol_usd_1d: 0, vol_usd_avg7d: 0, last_close: '', last_datetime: '', stale: '',
        reason: `error:${e?.message||e}`
      });
      console.log(`  ⚠️  ${symbol}: ${e?.message||e}`);
    }

    if (i % 10 === 0) console.log(`  Progression: ${i}/${rows.length}`);
  }

  const ok  = path.join(OUT_DIR, 'Crypto_filtered_by_volume.csv');
  const rej = path.join(OUT_DIR, 'Crypto_rejected_by_volume.csv');
  await writeCSV(ok,  accepted, HEADER_OUT);
  await writeCSV(rej, rejected, HEADER_REJ);

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Acceptées : ${accepted.length}`);
  console.log(`❌ Rejetées  : ${rejected.length}`);
  console.log('='.repeat(60));
  console.log(`Fichiers: ${ok}\n          ${rej}\n`);
  
  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_filtered=${accepted.length}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_total=${rows.length}\n`);
  }
})();