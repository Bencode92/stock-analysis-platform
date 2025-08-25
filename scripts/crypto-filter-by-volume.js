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

// Seuils (volume notionnel USD)
const MIN_USD_DAY   = Number(process.env.MIN_USD_DAY   || 1_000_000); // 1M$ dernière journée
const MIN_USD_AVG7D = Number(process.env.MIN_USD_AVG7D || 2_000_000); // 2M$ moyenne 7j

// Exchanges préférés (ordre)
const EX_PREF = [
  "Binance","Coinbase Pro","Kraken","BitStamp","Bitfinex",
  "Bybit","OKX","OKEx","Gate.io","KuCoin","Crypto.com Exchange"
];

const HEADER_OUT = [
  'symbol','currency_base','currency_quote','exchange_used',
  'vol_usd_1d','vol_usd_avg7d','last_close','last_datetime'
];

function parseCSV(text){ return parse(text, { columns:true, skip_empty_lines:true, bom:true }); }

async function readCSV(file){
  const txt = await fs.readFile(file, 'utf8');
  return parseCSV(txt);
}

async function writeCSV(file, rows, header){
  const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const line = obj => header.map(h => esc(obj[h])).join(',');
  const out = [header.join(','), ...rows.map(line)].join('\n');
  await fs.mkdir(path.dirname(file), { recursive:true });
  await fs.writeFile(file, out, 'utf8');
}

// normalisation de quelques labels
function normalizeExchange(name){
  if (!name) return null;
  const n = String(name).trim();
  if (!n) return null;
  if (/^okex$/i.test(n)) return 'OKX';
  if (/^coinbase$/i.test(n)) return 'Coinbase Pro';
  return n;
}

// accepte JSON ["Binance","Kraken"], ou "Binance;Kraken", ou "Binance, Kraken"
function toExchangeList(str){
  if (!str) return [];
  const s = String(str).trim();
  // JSON ?
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(normalizeExchange).filter(Boolean);
  } catch {}
  // enlève crochets éventuels puis split ; ou ,
  const stripped = s.replace(/^\[|\]$/g,'').replace(/'/g,'"');
  const parts = stripped.split(/[;,]/).map(x => normalizeExchange(x)).filter(Boolean);
  if (parts.length) return parts;
  // sinon valeur unique
  return normalizeExchange(s) ? [normalizeExchange(s)] : [];
}

function pickPreferredExchange(availEx){
  if (!Array.isArray(availEx) || !availEx.length) return null;
  for (const e of EX_PREF) if (availEx.includes(e)) return e;
  return availEx[0] || null;
}

// Rate limit simple
let lastReq = 0;
const MIN_DELAY = Number(process.env.MIN_DELAY_MS || 60); // ~16 req/s
async function throttle(){
  const now = Date.now();
  const delta = now - lastReq;
  if (delta < MIN_DELAY) await new Promise(r => setTimeout(r, MIN_DELAY - delta));
  lastReq = Date.now();
}

// Séries daily récentes → notionnel USD
async function fetchDailyVolumesUSD(symbol, exchange){
  const params = {
    symbol,
    interval: '1day',
    outputsize: 10,
    order: 'asc',
    timezone: 'Europe/Paris',
    apikey: API_KEY
  };
  if (exchange) params.exchange = exchange;

  await throttle();
  const { data } = await axios.get('https://api.twelvedata.com/time_series', { params });
  const values = data?.values;
  if (!Array.isArray(values) || !values.length) {
    if (exchange) return fetchDailyVolumesUSD(symbol, null); // retry sans exchange
    return { ok:false, reason:'no_data' };
  }

  const last = values[values.length-1];
  const lastClose = Number(last?.close) || 0;
  const lastVol   = Number(last?.volume) || 0;   // unités base
  const lastDt    = last?.datetime || null;

  const usd1d = lastClose * lastVol;
  const tail = values.slice(-7);
  const avg7 = tail.reduce((s,v)=>{
    const c = Number(v.close)||0, vol = Number(v.volume)||0;
    return s + c*vol;
  },0) / (tail.length || 1);

  let stale = true;
  if (lastDt) {
    const h = (Date.now() - new Date(lastDt).getTime())/36e5;
    stale = h > 48;
  }

  return { ok:true, lastClose, usd1d:Math.round(usd1d), avg7:Math.round(avg7), lastDt, stale };
}

(async ()=>{
  console.log('🚀 Filtrage crypto par volume (Twelve Data)\n');
  const inputPath = path.join(DATA_DIR, INPUT);
  const rows = await readCSV(inputPath);
  console.log(`📄 Source: ${inputPath} (${rows.length} lignes)`);
  console.log(`📊 Seuils: Volume 24h ≥ $${MIN_USD_DAY.toLocaleString()} OU Moyenne 7j ≥ $${MIN_USD_AVG7D.toLocaleString()}\n`);

  const accepted = [];
  const rejected = [];
  const stats = { total: rows.length, passed: 0, failed: 0, errors: 0, stale: 0 };

  let i = 0;
  for (const r of rows){
    i++;
    const symbol = (r.symbol||'').trim();
    const base   = (r.currency_base||'').trim();
    const quote  = (r.currency_quote||'').trim();
    const exList = toExchangeList(r.available_exchanges);
    const useEx  = pickPreferredExchange(exList);

    try{
      const res = await fetchDailyVolumesUSD(symbol, useEx);
      if (!res.ok){
        stats.failed++;
        console.log(`  ❌ ${symbol.padEnd(16)} - ${res.reason || 'no_data'}`);
        continue;
      }

      if (res.stale) {
        stats.stale++;
      }

      const pass = (!res.stale) && (res.usd1d >= MIN_USD_DAY || res.avg7 >= MIN_USD_AVG7D);
      
      if (pass){
        accepted.push({
          symbol, 
          currency_base: base, 
          currency_quote: quote, 
          exchange_used: useEx || '',
          vol_usd_1d: res.usd1d, 
          vol_usd_avg7d: res.avg7, 
          last_close: res.lastClose,
          last_datetime: res.lastDt || ''
        });
        stats.passed++;
        console.log(`  ✅ ${symbol.padEnd(16)} ${useEx?('('+useEx+') ').padEnd(14):''}` +
                    `1d=$${res.usd1d.toLocaleString().padEnd(15)} avg7=$${res.avg7.toLocaleString()}`);
      } else {
        stats.failed++;
        const why = res.stale ? 'stale>48h' : 
          `volume faible (1d=$${res.usd1d.toLocaleString()} < $${MIN_USD_DAY.toLocaleString()} ET avg7=$${res.avg7.toLocaleString()} < $${MIN_USD_AVG7D.toLocaleString()})`;
        console.log(`  ❌ ${symbol.padEnd(16)} ${useEx?('('+useEx+') ').padEnd(14):''}${why}`);
      }
    } catch(e){
      stats.errors++;
      console.log(`  ⚠️  ${symbol}: ${e?.message||e}`);
    }

    if (i % 10 === 0) console.log(`  Progression: ${i}/${rows.length}`);
  }

  const outFile = path.join(OUT_DIR, 'Crypto_filtered_by_volume.csv');
  await writeCSV(outFile, accepted, HEADER_OUT);

  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(60));
  console.log(`Total analysés: ${stats.total}`);
  console.log(`✅ Acceptées: ${stats.passed} (${(stats.passed/stats.total*100).toFixed(1)}%)`);
  console.log(`❌ Rejetées: ${stats.failed} (${(stats.failed/stats.total*100).toFixed(1)}%)`);
  if (stats.errors > 0) console.log(`⚠️  Erreurs: ${stats.errors}`);
  if (stats.stale > 0) console.log(`🕐 Données obsolètes: ${stats.stale}`);
  console.log('='.repeat(60));
  console.log(`\n📁 Fichier généré: ${outFile}\n`);
  
  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_filtered=${stats.passed}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_total=${stats.total}\n`);
  }
})();
