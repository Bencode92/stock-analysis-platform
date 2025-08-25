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

// 1) Essaie /quote (volume 24h + close). 2) Fallback /time_series pour avg7d.
async function fetchVolumes(symbol, exchange, quoteCcyCode){
  // --- Quote 24h ---
  let volUnits = 0, lastClose = 0, lastDt = '', stale = false, usedExchange = exchange || '';
  try {
    await throttle();
    const { data } = await axios.get('https://api.twelvedata.com/quote', { params: { symbol, apikey: API_KEY, ...(exchange ? {exchange} : {}) }});
    if (data && data.status !== 'error') {
      volUnits  = Number(data.volume) || 0;       // unités base (généralement)
      lastClose = Number(data.close)  || 0;
      lastDt    = data.datetime || data.timestamp || '';
      if (lastDt) stale = ((Date.now() - new Date(lastDt).getTime())/36e5) > 48;
    } else if (exchange) {
      // retry sans exchange
      usedExchange = ''; 
      await throttle();
      const { data: d2 } = await axios.get('https://api.twelvedata.com/quote', { params: { symbol, apikey: API_KEY }});
      volUnits  = Number(d2?.volume) || 0;
      lastClose = Number(d2?.close)  || 0;
      lastDt    = d2?.datetime || '';
      if (lastDt) stale = ((Date.now() - new Date(lastDt).getTime())/36e5) > 48;
    }
  } catch {}

  // --- Fallback avg7d via time_series ---
  let avg7 = 0;
  try {
    await throttle();
    const params = { symbol, interval:'1day', outputsize:10, order:'asc', timezone:'UTC', apikey:API_KEY, ...(usedExchange?{exchange:usedExchange}:{}) };
    const { data } = await axios.get('https://api.twelvedata.com/time_series', { params });
    const vals = Array.isArray(data?.values) ? data.values : [];
    const tail = vals.slice(-7);
    if (tail.length) {
      avg7 = tail.reduce((s,v)=> (s + (Number(v.close)||0) * (Number(v.volume)||0)), 0) / tail.length;
      // si le quote ne nous a pas donné de prix/heure corrects, récupère depuis TS
      if (!lastClose && vals.length) lastClose = Number(vals[vals.length-1].close)||0;
      if (!lastDt    && vals.length) lastDt    = vals[vals.length-1].datetime||'';
    }
  } catch {}

  // notionnels en USD (convertit si EUR)
  const fx = await fxToUSD(quoteCcyCode); // 1 si USD/USDT
  const usd1d = Math.round(volUnits * lastClose * fx);
  const usd7  = Math.round(avg7 * fx);

  return { usd1d, avg7: usd7, lastClose, lastDt, stale, usedExchange: usedExchange || exchange || '' };
}

(async ()=>{
  console.log('🚀 Démarrage du filtrage des crypto-monnaies');
  console.log('📊 Configuration:');
  console.log(`  - Volume 24h min: ${MIN_USD_DAY.toLocaleString()} USD`);
  console.log(`  - Volume 7j moy min: ${MIN_USD_AVG7D.toLocaleString()} USD\n`);

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