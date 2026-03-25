// etf-bond-daily-metrics.js
// Daily scrape: perfs & risque, et fusion avec le weekly snapshot
// Calcule: daily % (quote), YTD %, 1Y %, 1M %, 3M %, Vol 3Y % (annualisée) depuis /time_series
// + Beta CAPM 252j vs SPY (aligned with stock pipeline v3.39)
// Sorties: data/daily_metrics.json, data/daily_metrics_*.csv, data/combined_*.{json,csv}
// v3.0: Beta CAPM 252j (was 126j) — aligns with stock pipeline expert review recommendation
// v2.9: Beta CAPM 126j — Cov(Ri,Rm)/Var(Rm) vs SPY, 1 seul appel API supplémentaire
// v2.8: Préserver colonnes Sector Guard (sector_bucket, sector_trust, sector_signal_ok, underlying_ticker)
// v2.7: Anchor all date calculations on last.datetime (robustness fix for weekends/holidays)
// v2.6: Add perf_1m_pct and perf_3m_pct for momentum scoring
// v2.5: Support bond_credit_rating (notation dominante) dans combined_bonds.csv

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csvParse = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';
const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) {
  console.error('❌ TWELVE_DATA_API_KEY manquante');
  process.exit(1);
}

// --- Crédit/rate limit (identique à l'hebdo) ---
const CREDIT_LIMIT = 2584; // /min
const CREDITS = { TIME_SERIES: 5, QUOTE: 0 };
let creditsUsed = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;
async function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
async function pay(cost){
  while(true){
    const now = Date.now();
    if (now - windowStart > WINDOW_MS) { creditsUsed = 0; windowStart = now; }
    if (creditsUsed + cost <= CREDIT_LIMIT) { creditsUsed += cost; return; }
    await wait(250);
  }
}

// MIC US (si mic_code non-US, on utilise symbol:MIC)
const US_MIC_CODES = ['ARCX','BATS','XNAS','XNYS','XASE','XNGS','XNMS'];

// Helpers
const toNum = v => (v==null || v==='') ? null : Number(v);
const round = (x, dp=2) => (x==null) ? null : Number(x.toFixed(dp));
const uniqBy = (arr, keyFn) => Array.from(new Map(arr.map(x=>[keyFn(x), x])).values());
const todayISO = () => new Date().toISOString();

// v2.7: Parser de date robuste (évite les problèmes de timezone JS)
const parseISODate = (d) => new Date(`${d}T00:00:00Z`);

// --- Utilitaires qualité ---
function hasObjective(x) {
  const s = (x?.objective ?? '').toString().trim().toLowerCase();
  return s.length > 0 && s !== 'n/a' && s !== 'na' && s !== 'none';
}
function clampAbs(v, maxAbs){ return v==null ? null : (Math.abs(v) > maxAbs ? null : v); }

function parseMaybeJSON(v) {
  if (!v) return null;
  if (Array.isArray(v) || typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function buildSymbolParam({ symbol, mic_code }) {
  const base = (symbol || '').split('.')[0];
  if (mic_code && !US_MIC_CODES.includes(mic_code)) return `${base}:${mic_code}`;
  return base;
}

// v2.7: Accepte asOfDate pour ancrer sur la dernière donnée
function firstTradingDayOfYear(values, asOfDate) {
  const arr = [...values].sort((a,b)=> parseISODate(a.datetime) - parseISODate(b.datetime));
  if (arr.length === 0) return null;
  const year = asOfDate.getUTCFullYear();
  const first = arr.find(v => v.datetime.startsWith(`${year}-`));
  return first || arr[0];
}

// v2.7: Utilise parseISODate pour cohérence
function findCloseOnOrAfter(values, targetDate) {
  const arr = [...values].sort((a,b)=> parseISODate(a.datetime) - parseISODate(b.datetime));
  for (const v of arr) {
    if (parseISODate(v.datetime) >= targetDate) return v;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// v3.0: BETA CAPM — Cov(Ri,Rm) / Var(Rm)
// Fenêtre par défaut: 252 jours de trading (~1 an) — aligned with stock pipeline v3.39
// Benchmark: SPY (passé en paramètre)
// Alignement par date (inner join) pour gérer les jours fériés
// ═══════════════════════════════════════════════════════════════
function computeBeta(assetValues, benchValues, window = 252) {
  if (!assetValues || !benchValues || assetValues.length < 22 || benchValues.length < 22) return null;

  // Trier du + ancien au + récent
  const sortAsc = arr => [...arr].sort((a,b) => parseISODate(a.datetime) - parseISODate(b.datetime));
  const assetSorted = sortAsc(assetValues);
  const benchSorted = sortAsc(benchValues);

  // Aligner par date (inner join sur datetime)
  const benchMap = new Map(benchSorted.map(v => [v.datetime, Number(v.close)]));
  const aligned = assetSorted
    .filter(v => benchMap.has(v.datetime))
    .map(v => ({ asset: Number(v.close), bench: benchMap.get(v.datetime) }))
    .filter(v => Number.isFinite(v.asset) && v.asset > 0 && Number.isFinite(v.bench) && v.bench > 0);

  // Prendre les N+1 derniers points (pour N rendements)
  const slice = aligned.slice(-(window + 1));
  if (slice.length < 22) return null; // min ~1 mois de données

  // Rendements quotidiens
  const assetRet = [], benchRet = [];
  for (let i = 1; i < slice.length; i++) {
    assetRet.push(slice[i].asset / slice[i-1].asset - 1);
    benchRet.push(slice[i].bench / slice[i-1].bench - 1);
  }

  const m = assetRet.length;
  const meanA = assetRet.reduce((a,b) => a+b, 0) / m;
  const meanB = benchRet.reduce((a,b) => a+b, 0) / m;

  let cov = 0, varB = 0;
  for (let i = 0; i < m; i++) {
    cov  += (assetRet[i] - meanA) * (benchRet[i] - meanB);
    varB += (benchRet[i] - meanB) ** 2;
  }

  if (varB === 0) return null;
  const beta = cov / varB;

  // Sanity check: beta aberrant (>10 ou <-10) → null
  if (!Number.isFinite(beta) || Math.abs(beta) > 10) return null;

  return beta;
}

function computeVolPreferredFromSeries(values, opts = {}) {
  const cfg = { windows: [252*3, 252], minCoverage: 0.8, minSinceInception: 60, ...opts };
  const prices = [...values].sort((a,b)=> parseISODate(a.datetime) - parseISODate(b.datetime)).map(v => Number(v.close)).filter(v => Number.isFinite(v) && v > 0);
  if (prices.length < 2) return { value: null, label: null, reason: 'insufficient_points' };

  const volFromLastN = (n) => {
    const need = Math.floor(n * cfg.minCoverage) + 1;
    if (prices.length < need) return null;
    const slice = prices.slice(- (n + 1));
    const uniq = new Set(slice.map(x => x.toFixed(4))).size;
    if (uniq <= 2) return { value: null, reason: 'flat_series' };
    const rets = [];
    for (let i=1;i<slice.length;i++){ const r = Math.log(slice[i]/slice[i-1]); if (Number.isFinite(r)) rets.push(r); }
    if (rets.length < 2) return { value: null, reason: 'no_returns' };
    const m = rets.reduce((a,b)=>a+b,0)/rets.length;
    const v = rets.reduce((s,x)=> s + (x-m)*(x-m), 0)/(rets.length-1);
    const ann = Math.sqrt(v) * Math.sqrt(252);
    if (!Number.isFinite(ann) || ann < 1e-6) return { value: null, reason: 'near_zero' };
    return { value: ann, n: rets.length, reason: 'ok' };
  };

  const t3 = volFromLastN(252*3);
  if (t3 && t3.value != null) return { value: t3.value, label: '3y' };
  const t1 = volFromLastN(252);
  if (t1 && t1.value != null) return { value: t1.value, label: '1y' };
  if (prices.length >= (cfg.minSinceInception + 1)) {
    const all = volFromLastN(prices.length - 1);
    if (all && all.value != null) return { value: all.value, label: 'SI' };
  }
  return { value: null, label: null };
}

async function fetchQuote(symbolParam){
  try{ await pay(CREDITS.QUOTE); const { data } = await axios.get('https://api.twelvedata.com/quote', { params: { symbol: symbolParam, apikey: API_KEY } }); if (data && data.status !== 'error') return data; }catch(e){} return null;
}

async function fetchTimeSeriesFrom(dateStartISO, symbolParam){
  await pay(CREDITS.TIME_SERIES);
  const params = { symbol: symbolParam, interval: '1day', start_date: dateStartISO, adjusted: true, apikey: API_KEY };
  const { data } = await axios.get('https://api.twelvedata.com/time_series', { params });
  if (!data || data.status === 'error' || !Array.isArray(data.values)) return null;
  return data.values;
}

async function computeMetricsFor(symbolParam){
  // v2.7: Calcul de start_date basé sur now (pour la requête API uniquement)
  const nowForApi = new Date();
  const threeYearsAgo = new Date(nowForApi); 
  threeYearsAgo.setFullYear(nowForApi.getFullYear()-3);
  const threeYearsAgoISO = threeYearsAgo.toISOString().slice(0,10);

  let daily_change_pct = null; let last_close = null;
  const q = await fetchQuote(symbolParam);
  if (q){ daily_change_pct = toNum(q.percent_change); last_close = toNum(q.close) ?? toNum(q.previous_close) ?? null; }

  const ts = await fetchTimeSeriesFrom(threeYearsAgoISO, symbolParam);
  if (!ts || ts.length===0) return { 
    _rawTs: null,  // v2.9: expose pour beta
    as_of: todayISO(), 
    daily_change_pct, 
    ytd_return_pct: null, 
    one_year_return_pct: null, 
    perf_1m_pct: null,
    perf_3m_pct: null,
    vol_pct: null, 
    vol_window: '', 
    vol_3y_pct: null, 
    beta: null,  // v2.9
    last_close 
  };

  // v2.7: Tri avec parseISODate pour cohérence
  const tsDesc = [...ts].sort((a,b)=> parseISODate(b.datetime) - parseISODate(a.datetime));
  const last = tsDesc[0]; 
  const prev = tsDesc[1]; 
  const lastClose = Number(last.close);
  
  // v2.7: ✅ ANCRAGE SUR LA DERNIÈRE DONNÉE (pas sur new Date())
  // Évite les décalages week-end/jours fériés
  const asOfDate = parseISODate(last.datetime);
  
  if (last_close == null) last_close = lastClose;
  if (daily_change_pct == null && prev && Number(prev.close)>0) daily_change_pct = ((lastClose / Number(prev.close) - 1) * 100);

  // v2.7: YTD basé sur asOfDate (année de la dernière donnée)
  const firstYtd = firstTradingDayOfYear(ts, asOfDate);
  let ytd_return_pct = null;
  if (firstYtd && Number(firstYtd.close)>0) ytd_return_pct = (lastClose / Number(firstYtd.close) - 1) * 100;

  // v2.7: 1Y basé sur asOfDate
  let one_year_return_pct = null;
  if (tsDesc.length > 252){ 
    const close252 = Number(tsDesc[252].close); 
    if (close252>0) one_year_return_pct = (lastClose/close252 - 1) * 100; 
  } else { 
    // Fallback: date calendaire basée sur asOfDate
    const oneYearAgo = new Date(asOfDate); 
    oneYearAgo.setUTCFullYear(asOfDate.getUTCFullYear()-1); 
    const ref = findCloseOnOrAfter(ts, oneYearAgo); 
    if (ref && Number(ref.close)>0) one_year_return_pct = (lastClose/Number(ref.close) - 1) * 100; 
  }

  // v2.6: Calcul perf_1m (21 trading days) et perf_3m (63 trading days)
  let perf_1m_pct = null;
  let perf_3m_pct = null;

  if (tsDesc.length > 21) {
    const close21 = Number(tsDesc[21].close);
    if (close21 > 0) perf_1m_pct = (lastClose / close21 - 1) * 100;
  }

  if (tsDesc.length > 63) {
    const close63 = Number(tsDesc[63].close);
    if (close63 > 0) perf_3m_pct = (lastClose / close63 - 1) * 100;
  }

  const volPref = computeVolPreferredFromSeries(ts, { minCoverage: 0.8, minSinceInception: 60 });
  const vol_pct = volPref.value != null ? (volPref.value * 100) : null;
  const vol_window = volPref.label || '';
  let vol_3y_pct = (vol_window === '3y' && vol_pct != null) ? vol_pct : null;

  return { 
    _rawTs: ts,  // v2.9: expose time_series brut pour calcul beta dans main()
    as_of: asOfDate.toISOString(),
    daily_change_pct: round(clampAbs(daily_change_pct, 100), 3), 
    ytd_return_pct: round(clampAbs(ytd_return_pct, 1000), 2), 
    one_year_return_pct: round(clampAbs(one_year_return_pct, 1000), 2), 
    perf_1m_pct: round(clampAbs(perf_1m_pct, 500), 2),
    perf_3m_pct: round(clampAbs(perf_3m_pct, 500), 2),
    vol_pct: round(vol_pct, 2), 
    vol_window: vol_window || '', 
    vol_3y_pct: round(vol_3y_pct, 2), 
    beta: null,  // v2.9: placeholder, sera rempli dans main()
    last_close: round(last_close, 4) 
  };
}

async function readCSV(filePath){ const raw = await fs.readFile(filePath, 'utf8'); return csvParse.parse(raw, { columns: true, skip_empty_lines: true }); }
function rowsToItems(rows, type){ return rows.map(r => ({ type, symbol: r.symbol, name: r.name || null, isin: r.isin || null, mic_code: r.mic_code || null, currency: r.currency || null })); }
function mergeWeeklyDaily(weeklyArr, dailyMapBySymbol){ return weeklyArr.map(w => { const d = dailyMapBySymbol.get(w.symbol) || {}; return { ...w, ...d }; }); }

async function writeCSV(filePath, rows, columns) {
  const header = columns.join(',') + '\n';
  const safe = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  if (!rows || rows.length === 0) { await fs.writeFile(filePath, header); return; }
  const body = rows.map(r => columns.map(c => safe(r[c])).join(',')).join('\n');
  await fs.writeFile(filePath, header + body);
}

// v2.8: Fonction pour lire les colonnes Sector Guard existantes
async function loadSectorGuardData(csvPath) {
  const sectorGuardBySymbol = new Map();
  try {
    const exists = await fs.access(csvPath).then(() => true).catch(() => false);
    if (!exists) return sectorGuardBySymbol;
    
    const rows = await readCSV(csvPath);
    rows.forEach(row => {
      if (row.symbol && (row.sector_bucket || row.sector_trust || row.sector_signal_ok)) {
        sectorGuardBySymbol.set(row.symbol, {
          sector_bucket: row.sector_bucket || '',
          sector_trust: row.sector_trust || '',
          sector_signal_ok: row.sector_signal_ok || '',
          underlying_ticker: row.underlying_ticker || ''
        });
      }
    });
  } catch (e) {
    // Silently ignore if file doesn't exist or can't be read
  }
  return sectorGuardBySymbol;
}

async function main(){
  console.log('⚡ Daily ETF/Bond metrics: perfs & risque (time_series + quote) v2.9 + Beta CAPM');

  const etfCsv = path.join(OUT_DIR, 'weekly_snapshot_etfs.csv');
  const bondCsv = path.join(OUT_DIR, 'weekly_snapshot_bonds.csv');
  const hasEtf = await fs.access(etfCsv).then(()=>true).catch(()=>false);
  const hasBond = await fs.access(bondCsv).then(()=>true).catch(()=>false);

  const etfRows = hasEtf ? await readCSV(etfCsv) : [];
  const bondRows = hasBond ? await readCSV(bondCsv) : [];

  const etfs = rowsToItems(etfRows, 'ETF');
  const bonds = rowsToItems(bondRows, 'BOND');
  const all = [...etfs, ...bonds];

  const filteredPath = path.join(OUT_DIR, 'filtered_advanced.json');
  let leverageByKey = new Map();
  try {
    const filtered = JSON.parse(await fs.readFile(filteredPath, 'utf8'));
    (filtered.etfs || []).forEach(e => { const lev = (typeof e.leverage === 'number' ? e.leverage : ''); if (e.symbol) leverageByKey.set(`SYM:${e.symbol}`, lev); if (e.isin) leverageByKey.set(`ISIN:${e.isin}`, lev); });
  } catch (e) { console.log('ℹ️  filtered_advanced.json absent ou illisible — leverage non injecté.'); }
  const findLeverage = (row) => leverageByKey.get(`SYM:${row.symbol}`) ?? (row.isin ? leverageByKey.get(`ISIN:${row.isin}`) : '') ?? '';

  // v2.8: Charger les données Sector Guard existantes AVANT le traitement
  const etfSectorGuard = await loadSectorGuardData(path.join(OUT_DIR, 'combined_etfs.csv'));
  const bondSectorGuard = await loadSectorGuardData(path.join(OUT_DIR, 'combined_bonds.csv'));
  console.log(`🛡️ Sector Guard préservé: ${etfSectorGuard.size} ETFs, ${bondSectorGuard.size} Bonds`);

  // v2.9: Colonnes daily metrics avec beta
  const DAILY_METRICS_COLS = ['symbol','name','daily_change_pct','ytd_return_pct','one_year_return_pct','perf_1m_pct','perf_3m_pct','vol_pct','vol_window','vol_3y_pct','beta','last_close','as_of'];

  if (all.length === 0) {
    console.log('ℹ️  Aucune ligne dans les CSV weekly — je crée des fichiers daily vides.');
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(path.join(OUT_DIR, 'daily_metrics.json'), JSON.stringify({ timestamp: todayISO(), etfs: [], bonds: [] }, null, 2));
    await writeCSV(path.join(OUT_DIR, 'daily_metrics_etfs.csv'), [], DAILY_METRICS_COLS);
    await writeCSV(path.join(OUT_DIR, 'daily_metrics_bonds.csv'), [], DAILY_METRICS_COLS);
    await fs.writeFile(path.join(OUT_DIR, 'combined_snapshot.json'), JSON.stringify({ timestamp: todayISO(), etfs: [], bonds: [] }, null, 2));
    // v2.9: Colonnes avec beta + Sector Guard
    await writeCSV(path.join(OUT_DIR, 'combined_etfs.csv'), [], ['symbol','name','isin','mic_code','currency','fund_type','etf_type','leverage','aum_usd','total_expense_ratio','yield_ttm','objective','daily_change_pct','ytd_return_pct','one_year_return_pct','perf_1m_pct','perf_3m_pct','vol_pct','vol_window','vol_3y_pct','beta','last_close','as_of','sector_top','sector_top_weight','country_top','country_top_weight','sector_top5','country_top5','holding_top','holdings_top10','data_quality_score','sector_bucket','sector_trust','sector_signal_ok','underlying_ticker']);
    await writeCSV(path.join(OUT_DIR, 'combined_bonds.csv'), [], ['symbol','name','isin','mic_code','currency','fund_type','etf_type','aum_usd','total_expense_ratio','yield_ttm','bond_avg_duration','bond_avg_maturity','bond_credit_score','bond_credit_rating','objective','daily_change_pct','ytd_return_pct','one_year_return_pct','perf_1m_pct','perf_3m_pct','vol_pct','vol_window','vol_3y_pct','beta','last_close','as_of','sector_top','sector_top_weight','country_top','country_top_weight','sector_top5','country_top5','holding_top','holdings_top10','data_quality_score','sector_bucket','sector_trust','sector_signal_ok','underlying_ticker']);
    await writeCSV(path.join(OUT_DIR, 'combined_etfs_exposure.csv'), [], ['symbol','name','isin','mic_code','currency','fund_type','etf_type','leverage','aum_usd','total_expense_ratio','yield_ttm','objective','sector_top','sector_top_weight','country_top','country_top_weight','sector_top5','country_top5','holding_top','holdings_top10','data_quality_score']);
    await fs.writeFile(path.join(OUT_DIR, 'combined_bonds_holdings.csv'), 'etf_symbol,rank,holding_symbol,holding_name,weight_pct\n');
    return;
  }

  console.log(`🧾 Weekly chargés: ${etfs.length} ETF, ${bonds.length} Bonds`);

  const allWithSymbolParam = uniqBy(all.map(x => ({ ...x, symbolParam: buildSymbolParam(x) })), i => `${i.type}:${i.symbolParam}`);
  console.log(`🔗 Résolution symbolParam: ${allWithSymbolParam.length} instruments`);

  // ═══════════════════════════════════════════════════════════════
  // v2.9: Fetch benchmark SPY une seule fois (1 appel API = 5 crédits)
  // ═══════════════════════════════════════════════════════════════
  console.log('📈 Fetch benchmark SPY pour calcul beta (252j)...');
  const nowForBench = new Date();
  const threeYAgoBench = new Date(nowForBench);
  threeYAgoBench.setFullYear(nowForBench.getFullYear() - 3);
  let benchTs = null;
  try {
    benchTs = await fetchTimeSeriesFrom(threeYAgoBench.toISOString().slice(0,10), 'SPY');
    if (benchTs && benchTs.length > 0) {
      console.log(`  ✅ SPY: ${benchTs.length} points chargés (${benchTs[benchTs.length-1]?.datetime} → ${benchTs[0]?.datetime})`);
    } else {
      console.log('  ⚠️ SPY: aucune donnée retournée — beta sera null pour tous');
      benchTs = null;
    }
  } catch (e) {
    console.log(`  ⚠️ SPY fetch échoué: ${e.message} — beta sera null pour tous`);
    benchTs = null;
  }

  const metricsMap = new Map();
  let betaCount = 0;
  for (const it of allWithSymbolParam){
    try {
      const m = await computeMetricsFor(it.symbolParam);

      // v2.9: Calcul beta à partir du time_series brut + benchmark SPY
      if (benchTs && m._rawTs) {
        const betaRaw = computeBeta(m._rawTs, benchTs, 252);
        m.beta = betaRaw != null ? round(betaRaw, 2) : null;
        if (m.beta != null) betaCount++;
      }
      delete m._rawTs; // cleanup — ne pas sérialiser dans le JSON

      metricsMap.set(it.symbol, { symbol: it.symbol, ...m });
      console.log(`  · ${it.symbolParam} ⇒ D:${m.daily_change_pct}%  YTD:${m.ytd_return_pct}%  1Y:${m.one_year_return_pct}%  1M:${m.perf_1m_pct ?? '—'}%  3M:${m.perf_3m_pct ?? '—'}%  VOL:${m.vol_pct}% (${m.vol_window||'—'})  BETA:${m.beta ?? '—'}  [VOL3Y:${m.vol_3y_pct ?? '—'}]`);
    } catch (e) {
      console.log(`  ! ${it.symbolParam} métriques KO: ${e.message}`);
      metricsMap.set(it.symbol, { symbol: it.symbol, as_of: todayISO(), daily_change_pct: null, ytd_return_pct: null, one_year_return_pct: null, perf_1m_pct: null, perf_3m_pct: null, vol_pct: null, vol_window: '', vol_3y_pct: null, beta: null, last_close: null });
    }
  }
  console.log(`📊 Beta calculé pour ${betaCount}/${allWithSymbolParam.length} instruments`);

  await fs.mkdir(OUT_DIR, { recursive: true });

  const etfDaily = etfs.map(e => ({ name: e.name || '', ...metricsMap.get(e.symbol) }));
  const bondDaily = bonds.map(b => ({ name: b.name || '', ...metricsMap.get(b.symbol) }));

  await fs.writeFile(path.join(OUT_DIR, 'daily_metrics.json'), JSON.stringify({ timestamp: todayISO(), etfs: etfDaily, bonds: bondDaily }, null, 2));
  await writeCSV(path.join(OUT_DIR, 'daily_metrics_etfs.csv'), etfDaily, DAILY_METRICS_COLS);
  await writeCSV(path.join(OUT_DIR, 'daily_metrics_bonds.csv'), bondDaily, DAILY_METRICS_COLS);
  console.log('💾 Daily JSON/CSV écrits (trace brute).');

  const weeklyEtfs = etfRows.map(r => ({
    ...r, leverage: findLeverage(r),
    sector_top5: parseMaybeJSON(r.sector_top5) || [], country_top5: parseMaybeJSON(r.country_top5) || [],
    sector_top_weight: r.sector_top_weight !== '' && r.sector_top_weight != null ? Number(r.sector_top_weight) : '',
    country_top_weight: r.country_top_weight !== '' && r.country_top_weight != null ? Number(r.country_top_weight) : '',
    holdings_top10: parseMaybeJSON(r.holdings_top10) || [], holding_top: r.holding_top || '',
    data_quality_score: r.data_quality_score != null ? Number(r.data_quality_score) : ''
  }));
  
  // v2.5: métriques obligataires avec rating
  const weeklyBonds = bondRows.map(r => ({
    ...r,
    bond_avg_duration: r.bond_avg_duration !== '' && r.bond_avg_duration != null ? Number(r.bond_avg_duration) : null,
    bond_avg_maturity: r.bond_avg_maturity !== '' && r.bond_avg_maturity != null ? Number(r.bond_avg_maturity) : null,
    bond_credit_score: r.bond_credit_score !== '' && r.bond_credit_score != null ? Number(r.bond_credit_score) : null,
    bond_credit_rating: r.bond_credit_rating !== '' && r.bond_credit_rating != null ? r.bond_credit_rating : null,
    sector_top5: parseMaybeJSON(r.sector_top5) || [], country_top5: parseMaybeJSON(r.country_top5) || [],
    sector_top_weight: r.sector_top_weight !== '' && r.sector_top_weight != null ? Number(r.sector_top_weight) : '',
    country_top_weight: r.country_top_weight !== '' && r.country_top_weight != null ? Number(r.country_top_weight) : '',
    holdings_top10: parseMaybeJSON(r.holdings_top10) || [], holding_top: r.holding_top || '',
    data_quality_score: r.data_quality_score != null ? Number(r.data_quality_score) : ''
  }));

  const etfMerged = mergeWeeklyDaily(weeklyEtfs, new Map(etfDaily.map(x=>[x.symbol,x])));
  const bondMerged = mergeWeeklyDaily(weeklyBonds, new Map(bondDaily.map(x=>[x.symbol,x])));

  const etfMergedFiltered = etfMerged.filter(hasObjective);
  const bondMergedFiltered = bondMerged.filter(hasObjective);
  console.log(`🚯 Filtre "sans objectif": -${etfMerged.length-etfMergedFiltered.length} ETFs, -${bondMerged.length-bondMergedFiltered.length} Bonds`);
  
  await fs.writeFile(path.join(OUT_DIR, 'combined_snapshot.json'), JSON.stringify({ timestamp: todayISO(), etfs: etfMergedFiltered, bonds: bondMergedFiltered }, null, 2));

  // v2.5: bondExposure avec rating
  const bondExposure = weeklyBonds.map(e => ({
    symbol: e.symbol, name: e.name || '', isin: e.isin || '', mic_code: e.mic_code || '', currency: e.currency || '',
    fund_type: e.fund_type || '', etf_type: e.etf_type || '', aum_usd: e.aum_usd ?? '', total_expense_ratio: e.total_expense_ratio ?? '', yield_ttm: e.yield_ttm ?? '',
    bond_avg_duration: e.bond_avg_duration ?? '', bond_avg_maturity: e.bond_avg_maturity ?? '', bond_credit_score: e.bond_credit_score ?? '', bond_credit_rating: e.bond_credit_rating ?? '',
    objective: e.objective || '', sector_top: e.sector_top || '', sector_top_weight: e.sector_top_weight || '',
    country_top: e.country_top || (e.domicile || ''), country_top_weight: e.country_top_weight || '',
    sector_top5: JSON.stringify((e.sector_top5 || []).map(x => ('sector' in x) ? { s: x.sector, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null } : { s: x.s, w: x.w != null ? Number(x.w) : null })),
    country_top5: JSON.stringify((e.country_top5 || []).map(x => ('country' in x) ? { c: x.country, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null } : { c: x.c, w: x.w != null ? Number(x.w) : null })),
    holding_top: e.holding_top || '',
    holdings_top10: JSON.stringify((e.holdings_top10 || []).map(h => ('t' in h) ? { t: h.t, n: h.n ?? null, w: h.w } : { t: h.symbol || null, n: h.name || null, w: h.weight != null ? Number((h.weight*100).toFixed(2)) : null })),
    data_quality_score: e.data_quality_score ?? ''
  }));

  const exposureByBond = new Map(bondExposure.map(x => [x.symbol, x]));
  const bondMergedWithExposure = bondMergedFiltered.map(row => {
    const ex = exposureByBond.get(row.symbol) || {};
    return { ...row,
      bond_avg_duration: ex.bond_avg_duration ?? row.bond_avg_duration ?? '',
      bond_avg_maturity: ex.bond_avg_maturity ?? row.bond_avg_maturity ?? '',
      bond_credit_score: ex.bond_credit_score ?? row.bond_credit_score ?? '',
      bond_credit_rating: ex.bond_credit_rating ?? row.bond_credit_rating ?? '',
      sector_top: ex.sector_top ?? '', sector_top_weight: ex.sector_top_weight ?? '',
      country_top: ex.country_top ?? (row.domicile || ''), country_top_weight: ex.country_top_weight ?? '',
      sector_top5: ex.sector_top5 ?? '[]', country_top5: ex.country_top5 ?? '[]',
      holding_top: ex.holding_top ?? '', holdings_top10: ex.holdings_top10 ?? '[]',
      data_quality_score: row.data_quality_score ?? ex.data_quality_score ?? ''
    };
  });

  // v2.8: Merger Sector Guard dans bonds
  const bondFinal = bondMergedWithExposure.filter(hasObjective).map(row => {
    const sg = bondSectorGuard.get(row.symbol) || {};
    return { ...row, ...sg };
  });

  // v2.9: colonnes avec beta + Sector Guard
  await writeCSV(path.join(OUT_DIR, 'combined_bonds.csv'), bondFinal, [
    'symbol','name','isin','mic_code','currency','fund_type','etf_type',
    'aum_usd','total_expense_ratio','yield_ttm',
    'bond_avg_duration','bond_avg_maturity','bond_credit_score','bond_credit_rating',
    'objective',
    'daily_change_pct','ytd_return_pct','one_year_return_pct','perf_1m_pct','perf_3m_pct','vol_pct','vol_window','vol_3y_pct','beta','last_close','as_of',
    'sector_top','sector_top_weight','country_top','country_top_weight',
    'sector_top5','country_top5',
    'holding_top','holdings_top10',
    'data_quality_score',
    'sector_bucket','sector_trust','sector_signal_ok','underlying_ticker'
  ]);

  const etfExposure = weeklyEtfs.map(e => ({
    symbol: e.symbol, name: e.name || '', isin: e.isin || '', mic_code: e.mic_code || '', currency: e.currency || '',
    fund_type: e.fund_type || '', etf_type: e.etf_type || '', leverage: e.leverage ?? '',
    aum_usd: e.aum_usd ?? '', total_expense_ratio: e.total_expense_ratio ?? '', yield_ttm: e.yield_ttm ?? '', objective: e.objective || '',
    sector_top: e.sector_top || '', sector_top_weight: e.sector_top_weight || '',
    country_top: e.country_top || (e.domicile || ''), country_top_weight: e.country_top_weight || '',
    sector_top5: JSON.stringify((e.sector_top5 || []).map(x => ('sector' in x) ? { s: x.sector, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null } : { s: x.s, w: x.w != null ? Number(x.w) : null })),
    country_top5: JSON.stringify((e.country_top5 || []).map(x => ('country' in x) ? { c: x.country, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null } : { c: x.c, w: x.w != null ? Number(x.w) : null })),
    holding_top: e.holding_top || '',
    holdings_top10: JSON.stringify((e.holdings_top10 || []).map(h => ('t' in h) ? { t: h.t, n: h.n ?? null, w: h.w } : { t: h.symbol || null, n: h.name || null, w: h.weight != null ? Number((h.weight*100).toFixed(2)) : null })),
    data_quality_score: e.data_quality_score ?? ''
  }));

  const etfExposureFiltered = etfExposure.filter(hasObjective);
  await writeCSV(path.join(OUT_DIR, 'combined_etfs_exposure.csv'), etfExposureFiltered, [
    'symbol','name','isin','mic_code','currency','fund_type','etf_type','leverage',
    'aum_usd','total_expense_ratio','yield_ttm','objective',
    'sector_top','sector_top_weight','country_top','country_top_weight',
    'sector_top5','country_top5',
    'holding_top','holdings_top10',
    'data_quality_score'
  ]);

  const exposureBySymbol = new Map(etfExposureFiltered.map(x => [x.symbol, x]));
  const etfMergedWithExposure = etfMergedFiltered.map(row => {
    const ex = exposureBySymbol.get(row.symbol) || {};
    return { ...row,
      sector_top: ex.sector_top ?? '', sector_top_weight: ex.sector_top_weight ?? '',
      country_top: ex.country_top ?? (row.domicile || ''), country_top_weight: ex.country_top_weight ?? '',
      sector_top5: ex.sector_top5 ?? '[]', country_top5: ex.country_top5 ?? '[]',
      holding_top: ex.holding_top ?? '', holdings_top10: ex.holdings_top10 ?? '[]',
      data_quality_score: row.data_quality_score ?? ex.data_quality_score ?? ''
    };
  });

  // v2.8: Merger Sector Guard dans ETFs
  const etfFinal = etfMergedWithExposure.filter(hasObjective).map(row => {
    const sg = etfSectorGuard.get(row.symbol) || {};
    return { ...row, ...sg };
  });

  // v2.9: colonnes avec beta + Sector Guard
  await writeCSV(path.join(OUT_DIR, 'combined_etfs.csv'), etfFinal, [
    'symbol','name','isin','mic_code','currency','fund_type','etf_type','leverage',
    'aum_usd','total_expense_ratio','yield_ttm','objective',
    'daily_change_pct','ytd_return_pct','one_year_return_pct','perf_1m_pct','perf_3m_pct','vol_pct','vol_window','vol_3y_pct','beta','last_close','as_of',
    'sector_top','sector_top_weight','country_top','country_top_weight','sector_top5','country_top5',
    'holding_top','holdings_top10',
    'data_quality_score',
    'sector_bucket','sector_trust','sector_signal_ok','underlying_ticker'
  ]);

  const bondsHoldingsHeader = 'etf_symbol,rank,holding_symbol,holding_name,weight_pct\n';
  const bondsHoldingsRows = weeklyBonds.filter(hasObjective).flatMap(fund => {
    const hs = Array.isArray(fund.holdings_top10) ? fund.holdings_top10 : [];
    const norm = hs.map(h => ('t' in h) ? { sym: h.t || '', name: h.n || '', w: h.w != null ? Number(h.w) : null } : { sym: h.symbol || '', name: h.name || '', w: h.weight != null ? Number((h.weight*100).toFixed(2)) : null });
    return norm.map((h, idx) => {
      const cells = [fund.symbol || '', idx + 1, h.sym, (h.name || '').replace(/"/g,'""'), h.w != null ? Number(h.w).toFixed(2) : ''];
      return cells.map(v => { const s = String(v); return /[",\n]/.test(s) ? `"${s}"` : s; }).join(',');
    });
  });
  await fs.writeFile(path.join(OUT_DIR, 'combined_bonds_holdings.csv'), bondsHoldingsHeader + (bondsHoldingsRows.length ? bondsHoldingsRows.join('\n') + '\n' : ''));
  console.log(`📝 Combined BONDS holdings (Top10): ${bondsHoldingsRows.length} lignes → data/combined_bonds_holdings.csv`);

  const bondsWithDuration = bondFinal.filter(e => e.bond_avg_duration != null && e.bond_avg_duration !== '').length;
  const bondsWithCredit = bondFinal.filter(e => e.bond_credit_score != null && e.bond_credit_score !== '').length;
  const bondsWithRating = bondFinal.filter(e => e.bond_credit_rating != null && e.bond_credit_rating !== '').length;

  // v2.6: Stats perf_1m et perf_3m
  const etfsWith1m = etfFinal.filter(e => e.perf_1m_pct != null && e.perf_1m_pct !== '').length;
  const etfsWith3m = etfFinal.filter(e => e.perf_3m_pct != null && e.perf_3m_pct !== '').length;

  // v2.9: Stats beta
  const etfsWithBeta = etfFinal.filter(e => e.beta != null && e.beta !== '').length;
  const bondsWithBeta = bondFinal.filter(e => e.beta != null && e.beta !== '').length;

  // v2.8: Stats Sector Guard
  const etfsWithSectorGuard = etfFinal.filter(e => e.sector_bucket && e.sector_bucket !== '').length;
  const bondsWithSectorGuard = bondFinal.filter(e => e.sector_bucket && e.sector_bucket !== '').length;

  console.log('🔗 Fusions weekly+daily écrites (JSON & CSV).');
  console.log(`✅ Total: ${etfFinal.length} ETFs, ${bondFinal.length} Bonds traités (après filtrage qualité)`);
  console.log(`📊 CSV Exposure créé avec ${etfExposureFiltered.length} ETFs`);
  console.log(`📈 ETFs avec perf_1m: ${etfsWith1m}/${etfFinal.length}`);
  console.log(`📈 ETFs avec perf_3m: ${etfsWith3m}/${etfFinal.length}`);
  console.log(`📈 ETFs avec beta: ${etfsWithBeta}/${etfFinal.length}`);
  console.log(`📈 Bonds avec beta: ${bondsWithBeta}/${bondFinal.length}`);
  console.log(`🛡️ ETFs avec Sector Guard: ${etfsWithSectorGuard}/${etfFinal.length}`);
  console.log(`🛡️ Bonds avec Sector Guard: ${bondsWithSectorGuard}/${bondFinal.length}`);
  console.log(`📈 Bonds avec duration: ${bondsWithDuration}/${bondFinal.length}`);
  console.log(`📈 Bonds avec credit_score: ${bondsWithCredit}/${bondFinal.length}`);
  console.log(`📈 Bonds avec credit_rating: ${bondsWithRating}/${bondFinal.length}`);
  if (leverageByKey.size > 0) console.log(`💪 Leverage injecté pour ${leverageByKey.size/2} ETFs`);
}

main().catch(err => { console.error('❌ Erreur daily:', err); process.exit(1); });
