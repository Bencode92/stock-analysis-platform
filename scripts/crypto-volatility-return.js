// scripts/crypto-volatility-return.js
// npm i csv-parse axios
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) { console.error('❌ TWELVE_DATA_API_KEY manquante'); process.exit(1); }

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR  = process.env.OUTPUT_DIR || 'data/metrics';
const INPUT    = 'Crypto.csv';

// Configuration
const INTERVAL = (process.env.VOL_INTERVAL || '1day').toLowerCase(); // '1day' | '1h'
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 120);

// Fenêtres de calcul
const WIN_RET_1D  = 1;
const WIN_RET_7D  = 7;
const WIN_RET_30D = 30;
const WIN_VOL_7D  = 7;
const WIN_VOL_30D = 30;

// --- helpers csv ---
function parseCSV(t){ return parse(t, { columns:true, skip_empty_lines:true, bom:true }); }
async function readCSV(f){ return parseCSV(await fs.readFile(f,'utf8')); }
async function writeCSV(file, rows, header){
  const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const out = [header.join(','), ...rows.map(o => header.map(h => esc(o[h])).join(','))].join('\n');
  await fs.mkdir(path.dirname(file), { recursive:true });
  await fs.writeFile(file, out, 'utf8');
}

// --- exchanges ---
const EX_PREF = ["Binance","Coinbase Pro","Kraken","BitStamp","Bitfinex","Bybit","OKX","OKEx","Gate.io","KuCoin","Crypto.com Exchange"];
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

// --- rate limit ---
let lastReq = 0; const MIN_DELAY = Number(process.env.MIN_DELAY_MS || 60);
async function throttle(){ const d = Date.now() - lastReq; if (d < MIN_DELAY) await new Promise(r=>setTimeout(r, MIN_DELAY-d)); lastReq = Date.now(); }

// --- fetch time series ---
async function fetchCloses(symbol, exchange, interval, barsNeeded) {
  const params = {
    symbol, interval,
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
      // retry sans exchange
      return fetchCloses(symbol, null, interval, barsNeeded);
    }
    
    return vals.map(v => ({ 
      t: v.datetime, 
      c: Number(v.close)||0, 
      h: Number(v.high)||0, 
      l: Number(v.low)||0 
    }));
  } catch (error) {
    console.log(`    ⚠️ Erreur API pour ${symbol}: ${error.message}`);
    return [];
  }
}

// --- calculs mathématiques ---
function pct(a,b){ return b ? (a/b - 1) : 0; }
function logret(a,b){ return (a>0&&b>0) ? Math.log(a/b) : 0; }
function stdev(arr){
  const n = arr.length; if (!n) return 0;
  const m = arr.reduce((s,x)=>s+x,0)/n;
  const v = arr.reduce((s,x)=>s+(x-m)*(x-m),0)/(n-1 || 1);
  return Math.sqrt(v);
}
function lastN(arr, n){ return n>0 ? arr.slice(-n) : []; }

function annualizeStd(std, interval){
  if (interval === '1h') return std * Math.sqrt(24*365);
  return std * Math.sqrt(365);
}

// ATR14 (en % du dernier close)
function atrPct(candles, n=14){
  const N = Math.min(n, candles.length-1);
  if (N<=0) return 0;
  let trs = [];
  for (let i=candles.length-N; i<candles.length; i++){
    const cur = candles[i], prev = candles[i-1];
    const hl = cur.h - cur.l;
    const hc = Math.abs(cur.h - prev.c);
    const lc = Math.abs(cur.l - prev.c);
    const tr = Math.max(hl, hc, lc);
    trs.push(tr);
  }
  const atr = trs.reduce((s,x)=>s+x,0)/trs.length;
  const lastClose = candles[candles.length-1].c || 1;
  return (atr / lastClose) * 100;
}

// --- MAIN ---
(async ()=>{
  console.log('🚀 Analyse Crypto - Calcul des Rendements & Volatilité');
  console.log('=' .repeat(60));
  console.log('📊 Configuration:');
  console.log(`  - Intervalle: ${INTERVAL}`);
  console.log(`  - Lookback: ${LOOKBACK_DAYS} jours`);
  console.log(`  - Pas de filtrage - Analyse de TOUTES les cryptos`);
  console.log('=' .repeat(60) + '\n');
  
  const rows = await readCSV(path.join(DATA_DIR, INPUT));
  console.log(`📄 Source: ${path.join(DATA_DIR, INPUT)} (${rows.length} cryptos)\n`);

  const barsNeeded = INTERVAL === '1h'
    ? Math.max(24*WIN_VOL_30D + 24, 24*LOOKBACK_DAYS)
    : Math.max(WIN_VOL_30D + 10, LOOKBACK_DAYS);

  const results = [];
  let i = 0;
  let stats = {
    total: rows.length,
    success: 0,
    insufficient_data: 0,
    errors: 0
  };

  console.log('🔄 Analyse en cours...\n');

  for (const r of rows){
    i++;
    const symbol = (r.symbol||'').trim();
    const base = (r.currency_base||'').trim();
    const quote = (r.currency_quote||'').trim();
    const exList = toExchangeList(r.available_exchanges);
    const useEx = pickPreferredExchange(exList);

    try {
      const candles = await fetchCloses(symbol, useEx, INTERVAL, barsNeeded);
      
      // Si pas assez de données, on met des valeurs vides mais on garde la ligne
      if (candles.length < (INTERVAL==='1h'? 24*7 : 14)) {
        stats.insufficient_data++;
        results.push({
          symbol, 
          currency_base: base,
          currency_quote: quote,
          exchange_used: useEx||'',
          last_close: '',
          last_datetime: '',
          ret_1d_pct: '',
          ret_7d_pct: '',
          ret_30d_pct: '',
          vol_7d_annual_pct: '',
          vol_30d_annual_pct: '',
          atr14_pct: '',
          data_status: 'insufficient_history'
        });
        console.log(`  ⚠️  ${symbol.padEnd(16)} Données insuffisantes`);
        continue;
      }

      const closes = candles.map(x=>x.c);
      const last = closes[closes.length-1];
      const lastDt = candles[candles.length-1].t;
      
      // Vérification si données périmées
      const hoursOld = lastDt ? (Date.now() - new Date(lastDt).getTime()) / 36e5 : 999;
      const isStale = hoursOld > 48;

      // Calcul des métriques
      const prev1 = closes[closes.length-2];
      const prev7 = closes[closes.length-(INTERVAL==='1h'? 24*7+1 : 7+1)];
      const prev30 = closes[closes.length-(INTERVAL==='1h'? 24*30+1: 30+1)];

      const ret1d = pct(last, prev1) * 100;
      const ret7d = prev7 ? pct(last, prev7) * 100 : 0;
      const ret30d = prev30 ? pct(last, prev30) * 100 : 0;

      // Log-returns pour volatilité
      let rets = [];
      for (let k=1; k<closes.length; k++) {
        rets.push(logret(closes[k], closes[k-1]));
      }
      
      const vol7 = stdev(lastN(rets, INTERVAL==='1h'? 24*WIN_VOL_7D : WIN_VOL_7D));
      const vol30 = stdev(lastN(rets, INTERVAL==='1h'? 24*WIN_VOL_30D : WIN_VOL_30D));
      
      const vol7Ann = annualizeStd(vol7, INTERVAL) * 100;
      const vol30Ann = annualizeStd(vol30, INTERVAL) * 100;
      
      const atr = atrPct(candles, 14);

      results.push({
        symbol,
        currency_base: base,
        currency_quote: quote,
        exchange_used: useEx || '',
        last_close: last.toFixed(6),
        last_datetime: lastDt,
        ret_1d_pct: ret1d.toFixed(2),
        ret_7d_pct: ret7d.toFixed(2),
        ret_30d_pct: ret30d.toFixed(2),
        vol_7d_annual_pct: vol7Ann.toFixed(2),
        vol_30d_annual_pct: vol30Ann.toFixed(2),
        atr14_pct: atr.toFixed(2),
        data_status: isStale ? 'stale' : 'ok'
      });

      stats.success++;
      
      const statusIcon = isStale ? '🕐' : '✅';
      console.log(`  ${statusIcon} ${symbol.padEnd(16)} ${useEx?('('+useEx+') ').padEnd(14):''}`+
                  `R7d=${ret7d.toFixed(1)}% R30d=${ret30d.toFixed(1)}% Vol30d=${vol30Ann.toFixed(0)}%`);

    } catch(e) {
      stats.errors++;
      results.push({
        symbol, 
        currency_base: base,
        currency_quote: quote,
        exchange_used: useEx||'',
        last_close: '',
        last_datetime: '',
        ret_1d_pct: '',
        ret_7d_pct: '',
        ret_30d_pct: '',
        vol_7d_annual_pct: '',
        vol_30d_annual_pct: '',
        atr14_pct: '',
        data_status: 'error'
      });
      console.log(`  ❌ ${symbol}: ${e?.message||e}`);
    }

    if (i % 10 === 0) {
      console.log(`  📊 Progression: ${i}/${rows.length}`);
    }
  }

  // Headers
  const header = [
    'symbol','currency_base','currency_quote','exchange_used',
    'last_close','last_datetime',
    'ret_1d_pct','ret_7d_pct','ret_30d_pct',
    'vol_7d_annual_pct','vol_30d_annual_pct','atr14_pct',
    'data_status'
  ];

  // Fichier principal avec TOUTES les cryptos
  const mainFile = path.join(OUT_DIR, `Crypto_volatility_metrics.csv`);
  await writeCSV(mainFile, results, header);

  // Filtrer les résultats valides pour les tops
  const validResults = results.filter(r => 
    r.ret_30d_pct !== '' && 
    r.vol_30d_annual_pct !== '' &&
    !isNaN(Number(r.ret_30d_pct)) &&
    !isNaN(Number(r.vol_30d_annual_pct))
  );

  // Top 10 momentum (meilleurs rendements 30j)
  const topMomentum = [...validResults]
    .sort((a,b) => Number(b.ret_30d_pct) - Number(a.ret_30d_pct))
    .slice(0,10);
  
  // Top 10 volatilité
  const topVolatility = [...validResults]
    .sort((a,b) => Number(b.vol_30d_annual_pct) - Number(a.vol_30d_annual_pct))
    .slice(0,10);
  
  await writeCSV(path.join(OUT_DIR, 'Top10_momentum.csv'), topMomentum, header);
  await writeCSV(path.join(OUT_DIR, 'Top10_volatility.csv'), topVolatility, header);

  // Statistiques finales
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(60));
  console.log(`Total analysés: ${stats.total}`);
  console.log(`✅ Analyse réussie: ${stats.success}`);
  console.log(`⚠️  Données insuffisantes: ${stats.insufficient_data}`);
  console.log(`❌ Erreurs: ${stats.errors}`);
  console.log('='.repeat(60));
  
  if (validResults.length > 0) {
    const avgRet30 = validResults.reduce((s,x) => s + Number(x.ret_30d_pct), 0) / validResults.length;
    const avgVol30 = validResults.reduce((s,x) => s + Number(x.vol_30d_annual_pct), 0) / validResults.length;
    
    console.log('\n📈 Statistiques du marché:');
    console.log(`  - Rendement 30j moyen: ${avgRet30.toFixed(2)}%`);
    console.log(`  - Volatilité 30j moyenne: ${avgVol30.toFixed(2)}%`);
    console.log(`  - Cryptos avec données valides: ${validResults.length}`);
  }
  
  console.log('\n🎯 Top 5 Momentum (30j):');
  topMomentum.slice(0,5).forEach((r,i) => {
    console.log(`  ${i+1}. ${r.symbol.padEnd(12)} +${r.ret_30d_pct}% (Vol: ${r.vol_30d_annual_pct}%)`);
  });
  
  console.log('\n⚡ Top 5 Volatilité (30j):');
  topVolatility.slice(0,5).forEach((r,i) => {
    console.log(`  ${i+1}. ${r.symbol.padEnd(12)} ${r.vol_30d_annual_pct}% (R30d: ${r.ret_30d_pct}%)`);
  });
  
  console.log('\n📁 Fichiers générés:');
  console.log(`  📊 ${mainFile} (${results.length} cryptos)`);
  console.log(`  🎯 ${path.join(OUT_DIR, 'Top10_momentum.csv')}`);
  console.log(`  ⚡ ${path.join(OUT_DIR, 'Top10_volatility.csv')}`);
  
  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_analyzed=${stats.success}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_total=${stats.total}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_valid=${validResults.length}\n`);
  }
})();