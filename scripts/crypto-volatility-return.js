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

const INTERVAL = (process.env.VOL_INTERVAL || '1day').toLowerCase(); // '1day' | '1h'
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 120);      // nb jours d'historique

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

// --- rate limit simple ---
let lastReq = 0; const MIN_DELAY = Number(process.env.MIN_DELAY_MS || 60);
async function throttle(){ const d = Date.now() - lastReq; if (d < MIN_DELAY) await new Promise(r=>setTimeout(r, MIN_DELAY-d)); lastReq = Date.now(); }

// --- fetch time series closes (avec retry sans exchange) ---
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
  const { data } = await axios.get('https://api.twelvedata.com/time_series', { params });
  let vals = Array.isArray(data?.values) ? data.values : [];
  if (!vals.length && exchange) {
    // retry sans exchange
    return fetchCloses(symbol, null, interval, barsNeeded);
  }
  // { datetime, close, high, low, ... }
  return vals.map(v => ({ t: v.datetime, c: Number(v.close)||0, h: Number(v.high)||0, l: Number(v.low)||0 }));
}

// --- maths ---
function pct(a,b){ return b ? (a/b - 1) : 0; }                      // (last/prev-1)
function logret(a,b){ return (a>0&&b>0) ? Math.log(a/b) : 0; }      // ln
function stdev(arr){
  const n = arr.length; if (!n) return 0;
  const m = arr.reduce((s,x)=>s+x,0)/n;
  const v = arr.reduce((s,x)=>s+(x-m)*(x-m),0)/(n-1 || 1);
  return Math.sqrt(v);
}
function lastN(arr, n){ return n>0 ? arr.slice(-n) : []; }

function annualizeStd(std, interval){
  if (interval === '1h') return std * Math.sqrt(24*365);
  // 1day
  return std * Math.sqrt(365);
}

// ATR14 (en % du dernier close) si high/low dispo
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

// --- main ---
(async ()=>{
  console.log(`🚀 Calcul retours + volatilité (${INTERVAL})`);
  console.log('📊 Configuration:');
  console.log(`  - Intervalle: ${INTERVAL}`);
  console.log(`  - Lookback: ${LOOKBACK_DAYS} jours`);
  console.log(`  - Fenêtres de calcul: 1j, 7j, 30j`);
  console.log('');
  
  const rows = await readCSV(path.join(DATA_DIR, INPUT));
  console.log(`📄 Source: ${path.join(DATA_DIR, INPUT)} (${rows.length} paires)\n`);

  // combien de barres intraday vs daily
  const barsNeeded = INTERVAL === '1h'
    ? Math.max(24*WIN_VOL_30D + 24, 24*LOOKBACK_DAYS)  // ~30j d'1h
    : Math.max(WIN_VOL_30D + 10, LOOKBACK_DAYS);       // ~120j de daily

  const out = [];
  let i=0;
  let errors = 0;
  let insufficient = 0;

  for (const r of rows){
    i++;
    const symbol = (r.symbol||'').trim();
    const exList = toExchangeList(r.available_exchanges);
    const useEx  = pickPreferredExchange(exList);

    try{
      const candles = await fetchCloses(symbol, useEx, INTERVAL, barsNeeded);
      if (candles.length < (INTERVAL==='1h'? 24*7 : 14)) {
        // pas assez d'historique
        insufficient++;
        out.push({
          symbol, 
          currency_base: (r.currency_base||'').trim(),
          currency_quote: (r.currency_quote||'').trim(),
          exchange_used: useEx||'', 
          last_close: '', 
          last_datetime: '',
          ret_1d_pct: '', 
          ret_7d_pct: '', 
          ret_30d_pct: '',
          vol_7d_annual_pct: '', 
          vol_30d_annual_pct: '', 
          atr14_pct: '',
          note: 'insufficient_history'
        });
        console.log(`  ⚠️  ${symbol.padEnd(16)} Historique insuffisant`);
        continue;
      }

      const closes = candles.map(x=>x.c);
      const last = closes[closes.length-1];
      const prev1 = closes[closes.length-2];
      const prev7 = closes[closes.length-(INTERVAL==='1h'? 24*7+1 : 7+1)];
      const prev30= closes[closes.length-(INTERVAL==='1h'? 24*30+1: 30+1)];

      // Rendements simples
      const ret1d  = pct(last, prev1);
      const ret7d  = prev7 ? pct(last, prev7) : 0;
      const ret30d = prev30? pct(last, prev30): 0;

      // Log-returns pour vol
      let rets = [];
      if (INTERVAL === '1h') {
        for (let k=1; k<closes.length; k++) rets.push(logret(closes[k], closes[k-1]));
      } else {
        for (let k=1; k<closes.length; k++) rets.push(logret(closes[k], closes[k-1]));
      }
      const vol7  = stdev(lastN(rets, INTERVAL==='1h'? 24*WIN_VOL_7D  : WIN_VOL_7D ));
      const vol30 = stdev(lastN(rets, INTERVAL==='1h'? 24*WIN_VOL_30D : WIN_VOL_30D));

      const vol7Ann  = annualizeStd(vol7,  INTERVAL);
      const vol30Ann = annualizeStd(vol30, INTERVAL);

      const atr = atrPct(candles, 14);

      out.push({
        symbol,
        currency_base: (r.currency_base||'').trim(),
        currency_quote: (r.currency_quote||'').trim(),
        exchange_used: useEx || '',
        last_close: last.toFixed(6),
        last_datetime: candles[candles.length-1].t || '',
        ret_1d_pct: (ret1d*100).toFixed(2),
        ret_7d_pct: (ret7d*100).toFixed(2),
        ret_30d_pct: (ret30d*100).toFixed(2),
        vol_7d_annual_pct: (vol7Ann*100).toFixed(2),
        vol_30d_annual_pct: (vol30Ann*100).toFixed(2),
        atr14_pct: atr.toFixed(2),
        note: ''
      });

      console.log(`  ✅ ${symbol.padEnd(16)} ${useEx?('('+useEx+') ').padEnd(14):''}`+
                  `R30d=${(ret30d*100).toFixed(1)}% Vol30d=${(vol30Ann*100).toFixed(0)}%`);

      if (i % 10 === 0) console.log(`  📊 Progression: ${i}/${rows.length}`);
    } catch(e){
      errors++;
      console.log(`  ❌ ${symbol}: ${e?.message||e}`);
      out.push({
        symbol,
        currency_base: (r.currency_base||'').trim(),
        currency_quote: (r.currency_quote||'').trim(),
        exchange_used: useEx||'', 
        last_close: '', 
        last_datetime: '',
        ret_1d_pct: '', 
        ret_7d_pct: '', 
        ret_30d_pct: '',
        vol_7d_annual_pct: '', 
        vol_30d_annual_pct: '', 
        atr14_pct: '',
        note: 'error:'+ (e?.message||e)
      });
    }
  }

  // Exports
  const header = [
    'symbol','currency_base','currency_quote','exchange_used',
    'last_close','last_datetime',
    'ret_1d_pct','ret_7d_pct','ret_30d_pct',
    'vol_7d_annual_pct','vol_30d_annual_pct','atr14_pct','note'
  ];
  const outFile = path.join(OUT_DIR, `Crypto_returns_vol_${INTERVAL}.csv`);
  await writeCSV(outFile, out, header);

  // Tops (volatilité & momentum)
  const toNum = x => (x===''||x==null) ? NaN : Number(x);
  const clean = out.filter(r => !isNaN(toNum(r.vol_30d_annual_pct)) && !isNaN(toNum(r.ret_30d_pct)));
  const topVol = [...clean].sort((a,b)=>toNum(b.vol_30d_annual_pct)-toNum(a.vol_30d_annual_pct)).slice(0,25);
  const topMom = [...clean].sort((a,b)=>toNum(b.ret_30d_pct)-toNum(a.ret_30d_pct)).slice(0,25);
  
  await writeCSV(path.join(OUT_DIR, `TopVol_${INTERVAL}.csv`), topVol, header);
  await writeCSV(path.join(OUT_DIR, `TopRet30d_${INTERVAL}.csv`), topMom, header);

  // Statistiques
  console.log('\n' + '='.repeat(60));
  console.log('📈 RÉSUMÉ DES MÉTRIQUES');
  console.log('='.repeat(60));
  
  // Stats globales
  const validMetrics = clean.map(r => ({
    ret30: toNum(r.ret_30d_pct),
    vol30: toNum(r.vol_30d_annual_pct)
  }));
  
  if (validMetrics.length > 0) {
    const avgRet30 = validMetrics.reduce((s,x)=>s+x.ret30,0)/validMetrics.length;
    const avgVol30 = validMetrics.reduce((s,x)=>s+x.vol30,0)/validMetrics.length;
    
    console.log(`📊 Moyennes du marché:`);
    console.log(`  - Rendement 30j moyen: ${avgRet30.toFixed(2)}%`);
    console.log(`  - Volatilité 30j moyenne: ${avgVol30.toFixed(2)}%`);
    console.log('');
  }
  
  console.log(`✅ Analysées avec succès: ${clean.length}`);
  console.log(`⚠️  Historique insuffisant: ${insufficient}`);
  console.log(`❌ Erreurs: ${errors}`);
  console.log('='.repeat(60));
  
  console.log('\n📁 Fichiers générés:');
  console.log(`  - ${outFile}`);
  console.log(`  - ${path.join(OUT_DIR, `TopVol_${INTERVAL}.csv`)}`);
  console.log(`  - ${path.join(OUT_DIR, `TopRet30d_${INTERVAL}.csv`)}`);
  
  console.log('\n🎯 Top 5 Momentum (30j):');
  topMom.slice(0,5).forEach((r,i) => {
    console.log(`  ${i+1}. ${r.symbol.padEnd(12)} +${r.ret_30d_pct}%`);
  });
  
  console.log('\n⚡ Top 5 Volatilité (30j annualisée):');
  topVol.slice(0,5).forEach((r,i) => {
    console.log(`  ${i+1}. ${r.symbol.padEnd(12)} ${r.vol_30d_annual_pct}% vol`);
  });
  
  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_analyzed=${clean.length}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_total=${rows.length}\n`);
  }
})();