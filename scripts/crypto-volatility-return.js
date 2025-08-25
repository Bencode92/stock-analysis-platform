// scripts/crypto-volatility-return.js
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

// Configuration
const INTERVAL = (process.env.VOL_INTERVAL || '1day').toLowerCase(); // '1day' | '1h'
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 120);

// Seuils de filtrage
const MIN_VOL_30D = Number(process.env.MIN_VOL_30D || 30);    // Volatilité min 30% annualisée
const MAX_VOL_30D = Number(process.env.MAX_VOL_30D || 500);   // Volatilité max 500% annualisée
const MIN_RET_7D = Number(process.env.MIN_RET_7D || -50);     // Rendement 7j min -50%
const MAX_STALE_HOURS = Number(process.env.MAX_STALE_HOURS || 48); // Max 48h de données périmées

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

// Vérifier si les données sont périmées
function isStale(lastDt) {
  if (!lastDt) return true;
  const hoursOld = (Date.now() - new Date(lastDt).getTime()) / 36e5;
  return hoursOld > MAX_STALE_HOURS;
}

// --- MAIN ---
(async ()=>{
  console.log('🚀 Analyse Crypto - Rendements & Volatilité');
  console.log('=' .repeat(60));
  console.log('📊 Configuration:');
  console.log(`  - Intervalle: ${INTERVAL}`);
  console.log(`  - Lookback: ${LOOKBACK_DAYS} jours`);
  console.log(`  - Volatilité 30j requise: ${MIN_VOL_30D}% - ${MAX_VOL_30D}%`);
  console.log(`  - Rendement 7j minimum: ${MIN_RET_7D}%`);
  console.log(`  - Données max âge: ${MAX_STALE_HOURS}h`);
  console.log('=' .repeat(60) + '\n');
  
  const rows = await readCSV(path.join(DATA_DIR, INPUT));
  console.log(`📄 Source: ${path.join(DATA_DIR, INPUT)} (${rows.length} cryptos)\n`);

  const barsNeeded = INTERVAL === '1h'
    ? Math.max(24*WIN_VOL_30D + 24, 24*LOOKBACK_DAYS)
    : Math.max(WIN_VOL_30D + 10, LOOKBACK_DAYS);

  const accepted = [];
  const rejected = [];
  let i = 0;
  let stats = {
    total: rows.length,
    accepted: 0,
    rejected_stale: 0,
    rejected_history: 0,
    rejected_volatility: 0,
    rejected_return: 0,
    errors: 0
  };

  console.log('🔄 Traitement en cours...\n');

  for (const r of rows){
    i++;
    const symbol = (r.symbol||'').trim();
    const base = (r.currency_base||'').trim();
    const quote = (r.currency_quote||'').trim();
    const exList = toExchangeList(r.available_exchanges);
    const useEx = pickPreferredExchange(exList);

    try {
      const candles = await fetchCloses(symbol, useEx, INTERVAL, barsNeeded);
      
      // Vérification historique suffisant
      if (candles.length < (INTERVAL==='1h'? 24*7 : 14)) {
        stats.rejected_history++;
        rejected.push({
          symbol, base, quote,
          exchange_used: useEx||'',
          reason: 'insufficient_history',
          last_close: '', last_datetime: '',
          ret_1d_pct: '', ret_7d_pct: '', ret_30d_pct: '',
          vol_7d_annual_pct: '', vol_30d_annual_pct: '', atr14_pct: ''
        });
        console.log(`  ❌ ${symbol.padEnd(16)} Historique insuffisant`);
        continue;
      }

      const closes = candles.map(x=>x.c);
      const last = closes[closes.length-1];
      const lastDt = candles[candles.length-1].t;
      
      // Vérification données périmées
      if (isStale(lastDt)) {
        stats.rejected_stale++;
        rejected.push({
          symbol, base, quote,
          exchange_used: useEx||'',
          reason: 'stale_data',
          last_close: last.toFixed(6),
          last_datetime: lastDt,
          ret_1d_pct: '', ret_7d_pct: '', ret_30d_pct: '',
          vol_7d_annual_pct: '', vol_30d_annual_pct: '', atr14_pct: ''
        });
        console.log(`  ❌ ${symbol.padEnd(16)} Données périmées (${lastDt})`);
        continue;
      }

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

      // Objet de données complet
      const cryptoData = {
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
        atr14_pct: atr.toFixed(2)
      };

      // Application des filtres
      let rejectReason = null;
      
      if (vol30Ann < MIN_VOL_30D) {
        rejectReason = `low_volatility (${vol30Ann.toFixed(1)}% < ${MIN_VOL_30D}%)`;
        stats.rejected_volatility++;
      } else if (vol30Ann > MAX_VOL_30D) {
        rejectReason = `extreme_volatility (${vol30Ann.toFixed(1)}% > ${MAX_VOL_30D}%)`;
        stats.rejected_volatility++;
      } else if (ret7d < MIN_RET_7D) {
        rejectReason = `poor_performance (R7d=${ret7d.toFixed(1)}% < ${MIN_RET_7D}%)`;
        stats.rejected_return++;
      }

      if (rejectReason) {
        rejected.push({ ...cryptoData, reason: rejectReason });
        console.log(`  ❌ ${symbol.padEnd(16)} ${rejectReason}`);
      } else {
        accepted.push(cryptoData);
        stats.accepted++;
        console.log(`  ✅ ${symbol.padEnd(16)} ${useEx?('('+useEx+') ').padEnd(14):''}`+
                    `R7d=${ret7d.toFixed(1)}% R30d=${ret30d.toFixed(1)}% Vol30d=${vol30Ann.toFixed(0)}%`);
      }

    } catch(e) {
      stats.errors++;
      rejected.push({
        symbol, 
        currency_base: base,
        currency_quote: quote,
        exchange_used: useEx||'',
        reason: `error: ${e?.message||e}`,
        last_close: '', last_datetime: '',
        ret_1d_pct: '', ret_7d_pct: '', ret_30d_pct: '',
        vol_7d_annual_pct: '', vol_30d_annual_pct: '', atr14_pct: ''
      });
      console.log(`  ⚠️  ${symbol}: ${e?.message||e}`);
    }

    if (i % 10 === 0) {
      console.log(`  📊 Progression: ${i}/${rows.length} (${stats.accepted} acceptées)`);
    }
  }

  // Tri des résultats acceptés
  accepted.sort((a, b) => {
    // Tri par volatilité 30j décroissante puis par rendement 30j
    const volDiff = Number(b.vol_30d_annual_pct) - Number(a.vol_30d_annual_pct);
    if (Math.abs(volDiff) > 1) return volDiff;
    return Number(b.ret_30d_pct) - Number(a.ret_30d_pct);
  });

  // Headers
  const header = [
    'symbol','currency_base','currency_quote','exchange_used',
    'last_close','last_datetime',
    'ret_1d_pct','ret_7d_pct','ret_30d_pct',
    'vol_7d_annual_pct','vol_30d_annual_pct','atr14_pct'
  ];
  const headerRej = [...header, 'reason'];

  // Sauvegarde des fichiers
  const acceptedFile = path.join(OUT_DIR, `Crypto_filtered_volatility.csv`);
  const rejectedFile = path.join(OUT_DIR, `Crypto_rejected_volatility.csv`);
  
  await writeCSV(acceptedFile, accepted, header);
  await writeCSV(rejectedFile, rejected, headerRej);

  // Top performers
  const topMomentum = [...accepted].sort((a,b) => Number(b.ret_30d_pct) - Number(a.ret_30d_pct)).slice(0,10);
  const topVolatility = [...accepted].sort((a,b) => Number(b.vol_30d_annual_pct) - Number(a.vol_30d_annual_pct)).slice(0,10);
  
  await writeCSV(path.join(OUT_DIR, 'Top10_momentum.csv'), topMomentum, header);
  await writeCSV(path.join(OUT_DIR, 'Top10_volatility.csv'), topVolatility, header);

  // Statistiques finales
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(60));
  console.log(`Total analysés: ${stats.total}`);
  console.log(`✅ Acceptées: ${stats.accepted} (${(stats.accepted/stats.total*100).toFixed(1)}%)`);
  console.log(`❌ Rejetées total: ${stats.total - stats.accepted}`);
  console.log(`   - Données périmées: ${stats.rejected_stale}`);
  console.log(`   - Historique insuffisant: ${stats.rejected_history}`);
  console.log(`   - Volatilité hors limites: ${stats.rejected_volatility}`);
  console.log(`   - Performance faible: ${stats.rejected_return}`);
  console.log(`   - Erreurs API: ${stats.errors}`);
  console.log('='.repeat(60));
  
  if (accepted.length > 0) {
    const avgRet30 = accepted.reduce((s,x) => s + Number(x.ret_30d_pct), 0) / accepted.length;
    const avgVol30 = accepted.reduce((s,x) => s + Number(x.vol_30d_annual_pct), 0) / accepted.length;
    
    console.log('\n📈 Moyennes des cryptos acceptées:');
    console.log(`  - Rendement 30j moyen: ${avgRet30.toFixed(2)}%`);
    console.log(`  - Volatilité 30j moyenne: ${avgVol30.toFixed(2)}%`);
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
  console.log(`  ✅ ${acceptedFile}`);
  console.log(`  ❌ ${rejectedFile}`);
  console.log(`  🎯 ${path.join(OUT_DIR, 'Top10_momentum.csv')}`);
  console.log(`  ⚡ ${path.join(OUT_DIR, 'Top10_volatility.csv')}`);
  
  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_accepted=${stats.accepted}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_rejected=${stats.total - stats.accepted}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_total=${stats.total}\n`);
  }
})();