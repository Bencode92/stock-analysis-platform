// etf-bond-daily-metrics.js
// Daily scrape: perfs & risque, et fusion avec le weekly snapshot
// Calcule: daily % (quote), YTD %, 1Y %, Vol 3Y % (annualisée) depuis /time_series
// Sorties: data/daily_metrics.json, data/daily_metrics_*.csv, data/combined_*.{json,csv}
// v2.0: Enrichissement des bonds avec sectors/countries/holdings comme les ETFs

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

function parseMaybeJSON(v) {
  if (!v) return null;
  if (Array.isArray(v) || typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function buildSymbolParam({ symbol, mic_code }) {
  const base = (symbol || '').split('.')[0]; // clean like ABCD.L -> ABCD
  if (mic_code && !US_MIC_CODES.includes(mic_code)) return `${base}:${mic_code}`;
  return base;
}

function firstTradingDayOfYear(values) {
  // values: sorted DESC by API, so we re-sort ASC by datetime
  const arr = [...values].sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
  if (arr.length === 0) return null;
  const year = new Date().getFullYear();
  const first = arr.find(v => v.datetime.startsWith(`${year}-`));
  return first || arr[0]; // fallback si pas d'observation en YTD
}

function findCloseOnOrAfter(values, targetDate) {
  const arr = [...values].sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
  for (const v of arr) {
    if (new Date(v.datetime) >= targetDate) return v;
  }
  return null;
}

function computeDailyLogReturns(values) {
  // values triés DESC par TD → repasser en ASC
  const arr = [...values].sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
  const rets = [];
  for (let i=1; i<arr.length; i++){
    const p0 = Number(arr[i-1].close);
    const p1 = Number(arr[i].close);
    if (p0>0 && p1>0) rets.push(Math.log(p1/p0));
  }
  return rets;
}

function stdDev(xs){
  if (!xs || xs.length<2) return null;
  const m = xs.reduce((a,b)=>a+b,0)/xs.length;
  const v = xs.reduce((a,b)=>a+(b-m)*(b-m),0)/(xs.length-1);
  return Math.sqrt(v);
}

async function fetchQuote(symbolParam){
  // gratuit (selon plan TD)
  try{
    await pay(CREDITS.QUOTE);
    const { data } = await axios.get('https://api.twelvedata.com/quote', {
      params: { symbol: symbolParam, apikey: API_KEY }
    });
    if (data && data.status !== 'error') return data;
  }catch(e){}
  return null;
}

async function fetchTimeSeriesFrom(dateStartISO, symbolParam){
  await pay(CREDITS.TIME_SERIES);
  const params = {
    symbol: symbolParam,
    interval: '1day',
    start_date: dateStartISO, // on charge tout d'un coup (YTD, 1Y, 3Y)
    apikey: API_KEY
  };
  const { data } = await axios.get('https://api.twelvedata.com/time_series', { params });
  if (!data || data.status === 'error' || !Array.isArray(data.values)) return null;
  // TD renvoie ASC ou DESC selon, on conserve brut et on gérera
  return data.values;
}

async function computeMetricsFor(symbolParam){
  const now = new Date();
  const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(now.getFullYear()-3);
  const threeYearsAgoISO = threeYearsAgo.toISOString().slice(0,10);

  // 1) QUOTE pour daily %
  let daily_change_pct = null;
  let last_close = null;

  const q = await fetchQuote(symbolParam);
  if (q){
    // percent_change est déjà en pourcentage
    daily_change_pct = toNum(q.percent_change);
    last_close = toNum(q.close) ?? toNum(q.previous_close) ?? null;
  }

  // 2) TIME_SERIES depuis 3 ans (sert pour YTD, 1Y, Vol3Y, et fallback daily)
  const ts = await fetchTimeSeriesFrom(threeYearsAgoISO, symbolParam);
  if (!ts || ts.length===0) {
    return {
      as_of: todayISO(),
      daily_change_pct, ytd_return_pct: null, one_year_return_pct: null, vol_3y_pct: null,
      last_close
    };
  }

  // close "last"
  const tsDesc = [...ts].sort((a,b)=> new Date(b.datetime) - new Date(a.datetime));
  const last = tsDesc[0];
  const prev = tsDesc[1];
  const lastClose = Number(last.close);
  if (last_close == null) last_close = lastClose;

  // Fallback daily % si quote non dispo
  if (daily_change_pct == null && prev && Number(prev.close)>0) {
    daily_change_pct = ((lastClose / Number(prev.close) - 1) * 100);
  }

  // YTD %
  const firstYtd = firstTradingDayOfYear(ts);
  let ytd_return_pct = null;
  if (firstYtd && Number(firstYtd.close)>0) {
    ytd_return_pct = (lastClose / Number(firstYtd.close) - 1) * 100;
  }

  // 1Y % (252 sessions)
  let one_year_return_pct = null;
  if (tsDesc.length > 252){
    const close252 = Number(tsDesc[252].close);
    if (close252>0) one_year_return_pct = (lastClose/close252 - 1) * 100;
  } else {
    // fallback: date-1year calendaire
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear()-1);
    const ref = findCloseOnOrAfter(ts, oneYearAgo);
    if (ref && Number(ref.close)>0) one_year_return_pct = (lastClose/Number(ref.close) - 1) * 100;
  }

  // Vol 3Y % (annualisée)
  let vol_3y_pct = null;
  const rets = computeDailyLogReturns(ts);
  // on accepte si au moins ~1.5 an d'historique pour donner quelque chose (sinon null)
  if (rets.length >= 252 * 1.5) {
    const sd = stdDev(rets);
    vol_3y_pct = sd ? sd * Math.sqrt(252) * 100 : null;
  }

  return {
    as_of: todayISO(),
    daily_change_pct: round(daily_change_pct, 3),
    ytd_return_pct: round(ytd_return_pct, 2),
    one_year_return_pct: round(one_year_return_pct, 2),
    vol_3y_pct: round(vol_3y_pct, 2),
    last_close: round(last_close, 4)
  };
}

async function readCSV(filePath){
  const raw = await fs.readFile(filePath, 'utf8');
  return csvParse.parse(raw, { columns: true, skip_empty_lines: true });
}

function rowsToItems(rows, type){
  return rows.map(r => ({
    type,
    symbol: r.symbol,
    isin: r.isin || null,
    mic_code: r.mic_code || null,
    currency: r.currency || null
  }));
}

function mergeWeeklyDaily(weeklyArr, dailyMapBySymbol){
  // merge complet: tous les champs weekly + métriques daily
  return weeklyArr.map(w => {
    const d = dailyMapBySymbol.get(w.symbol) || {};
    return { ...w, ...d };
  });
}

async function writeCSV(filePath, rows, columns) {
  const header = columns.join(',') + '\n';

  const safe = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  if (!rows || rows.length === 0) {
    await fs.writeFile(filePath, header);     // ✅ fichier vide mais présent
    return;
  }

  const body = rows.map(r => columns.map(c => safe(r[c])).join(',')).join('\n');
  await fs.writeFile(filePath, header + body);
}

async function main(){
  console.log('⚡ Daily ETF/Bond metrics: perfs & risque (time_series + quote)');

  // 1) Charger les listes weekly
  const etfCsv = path.join(OUT_DIR, 'weekly_snapshot_etfs.csv');
  const bondCsv = path.join(OUT_DIR, 'weekly_snapshot_bonds.csv');
  const hasEtf = await fs.access(etfCsv).then(()=>true).catch(()=>false);
  const hasBond = await fs.access(bondCsv).then(()=>true).catch(()=>false);

  const etfRows = hasEtf ? await readCSV(etfCsv) : [];
  const bondRows = hasBond ? await readCSV(bondCsv) : [];

  const etfs = rowsToItems(etfRows, 'ETF');
  const bonds = rowsToItems(bondRows, 'BOND');
  const all = [...etfs, ...bonds];

  // -- Inject leverage depuis filtered_advanced.json (si présent)
  const filteredPath = path.join(OUT_DIR, 'filtered_advanced.json');

  let leverageByKey = new Map();
  try {
    const filtered = JSON.parse(await fs.readFile(filteredPath, 'utf8'));
    // index par symbol ET par isin pour éviter les collisions
    (filtered.etfs || []).forEach(e => {
      const lev = (typeof e.leverage === 'number' ? e.leverage : '');
      if (e.symbol) leverageByKey.set(`SYM:${e.symbol}`, lev);
      if (e.isin)   leverageByKey.set(`ISIN:${e.isin}`, lev);
    });
  } catch (e) {
    console.log('ℹ️  filtered_advanced.json absent ou illisible — leverage non injecté.');
  }

  const findLeverage = (row) =>
    leverageByKey.get(`SYM:${row.symbol}`) ??
    (row.isin ? leverageByKey.get(`ISIN:${row.isin}`) : '') ?? '';

  if (all.length === 0) {
    console.log('ℹ️  Aucune ligne dans les CSV weekly — je crée des fichiers daily vides.');
    // Fichiers vides (entêtes)
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(path.join(OUT_DIR, 'daily_metrics.json'), JSON.stringify({ timestamp: todayISO(), etfs: [], bonds: [] }, null, 2));
    await writeCSV(path.join(OUT_DIR, 'daily_metrics_etfs.csv'),
                   [], ['symbol','daily_change_pct','ytd_return_pct','one_year_return_pct','vol_3y_pct','last_close','as_of']);
    await writeCSV(path.join(OUT_DIR, 'daily_metrics_bonds.csv'),
                   [], ['symbol','daily_change_pct','ytd_return_pct','one_year_return_pct','vol_3y_pct','last_close','as_of']);
    await fs.writeFile(path.join(OUT_DIR, 'combined_snapshot.json'), JSON.stringify({ timestamp: todayISO(), etfs: [], bonds: [] }, null, 2));
    await writeCSV(path.join(OUT_DIR, 'combined_etfs.csv'),
                   [], ['symbol','isin','mic_code','currency','fund_type','etf_type','leverage','aum_usd','total_expense_ratio','yield_ttm',
                        'objective','daily_change_pct','ytd_return_pct','one_year_return_pct','vol_3y_pct','last_close','as_of',
                        'sector_top','sector_top_weight','country_top','country_top_weight','sector_top5','country_top5',
                        'holding_top','holdings_top10','data_quality_score']);
    await writeCSV(path.join(OUT_DIR, 'combined_bonds.csv'),
                   [], ['symbol','isin','mic_code','currency','fund_type','etf_type','aum_usd','total_expense_ratio','yield_ttm',
                        'objective','daily_change_pct','ytd_return_pct','one_year_return_pct','vol_3y_pct','last_close','as_of',
                        'sector_top','sector_top_weight','country_top','country_top_weight','sector_top5','country_top5',
                        'holding_top','holdings_top10','data_quality_score']);
    await writeCSV(path.join(OUT_DIR, 'combined_etfs_exposure.csv'),
                   [], ['symbol','isin','mic_code','currency','fund_type','etf_type','leverage','aum_usd','total_expense_ratio','yield_ttm',
                        'objective','sector_top','sector_top_weight','country_top','country_top_weight','sector_top5','country_top5',
                        'holding_top','holdings_top10','data_quality_score']);
    await fs.writeFile(path.join(OUT_DIR, 'combined_bonds_holdings.csv'), 'etf_symbol,rank,holding_symbol,holding_name,weight_pct\n');
    return;
  }

  console.log(`🧾 Weekly chargés: ${etfs.length} ETF, ${bonds.length} Bonds`);

  // 2) Préparer symbolParam
  const allWithSymbolParam = uniqBy(all.map(x => ({
    ...x,
    symbolParam: buildSymbolParam(x)
  })), i => `${i.type}:${i.symbolParam}`);

  console.log(`🔗 Résolution symbolParam: ${allWithSymbolParam.length} instruments`);

  // 3) Boucle de métriques (respect crédits)
  const metricsMap = new Map(); // key = symbol, value = metrics
  for (const it of allWithSymbolParam){
    try {
      const m = await computeMetricsFor(it.symbolParam);
      metricsMap.set(it.symbol, { symbol: it.symbol, ...m });
      console.log(`  · ${it.symbolParam}  ⇒  D:${m.daily_change_pct}%  YTD:${m.ytd_return_pct}%  1Y:${m.one_year_return_pct}%  VOL3Y:${m.vol_3y_pct}%`);
    } catch (e) {
      console.log(`  ! ${it.symbolParam} métriques KO: ${e.message}`);
      metricsMap.set(it.symbol, { symbol: it.symbol, as_of: todayISO(),
        daily_change_pct: null, ytd_return_pct: null, one_year_return_pct: null, vol_3y_pct: null, last_close: null
      });
    }
  }

  // 4) Ecriture des daily CSV/JSON
  await fs.mkdir(OUT_DIR, { recursive: true });

  const etfDaily = etfs.map(e => ({ ...metricsMap.get(e.symbol) }));
  const bondDaily = bonds.map(b => ({ ...metricsMap.get(b.symbol) }));

  await fs.writeFile(path.join(OUT_DIR, 'daily_metrics.json'),
    JSON.stringify({ timestamp: todayISO(), etfs: etfDaily, bonds: bondDaily }, null, 2));

  await writeCSV(path.join(OUT_DIR, 'daily_metrics_etfs.csv'),
    etfDaily, ['symbol','daily_change_pct','ytd_return_pct','one_year_return_pct','vol_3y_pct','last_close','as_of']);

  await writeCSV(path.join(OUT_DIR, 'daily_metrics_bonds.csv'),
    bondDaily, ['symbol','daily_change_pct','ytd_return_pct','one_year_return_pct','vol_3y_pct','last_close','as_of']);

  console.log('💾 Daily JSON/CSV écrits.');

  // 5) Fusion weekly + daily (pour affichage site)
  
  // ✅ Source de vérité = CSVs weekly
  // Normalisation pour ETFs
  const weeklyEtfs = etfRows.map(r => ({
    ...r,
    leverage: findLeverage(r),
    // normalisation des champs d'expo
    sector_top5: parseMaybeJSON(r.sector_top5) || [],
    country_top5: parseMaybeJSON(r.country_top5) || [],
    sector_top_weight: r.sector_top_weight !== '' && r.sector_top_weight != null
      ? Number(r.sector_top_weight) : '',
    country_top_weight: r.country_top_weight !== '' && r.country_top_weight != null
      ? Number(r.country_top_weight) : '',
    holdings_top10: parseMaybeJSON(r.holdings_top10) || [],
    holding_top: r.holding_top || '',
    data_quality_score: r.data_quality_score != null ? Number(r.data_quality_score) : ''
  }));
  
  // Normalisation pour Bonds (même logique que ETFs)
  const weeklyBonds = bondRows.map(r => ({
    ...r,
    // expos secteurs/pays (au weekly c'est du JSON string → on parse)
    sector_top5: parseMaybeJSON(r.sector_top5) || [],
    country_top5: parseMaybeJSON(r.country_top5) || [],
    sector_top_weight: r.sector_top_weight !== '' && r.sector_top_weight != null ? Number(r.sector_top_weight) : '',
    country_top_weight: r.country_top_weight !== '' && r.country_top_weight != null ? Number(r.country_top_weight) : '',
    // holdings (Top10 au weekly → JSON string)
    holdings_top10: parseMaybeJSON(r.holdings_top10) || [],
    holding_top: r.holding_top || '',
    data_quality_score: r.data_quality_score != null ? Number(r.data_quality_score) : ''
  }));

  const etfMerged = mergeWeeklyDaily(weeklyEtfs, new Map(etfDaily.map(x=>[x.symbol,x])));
  const bondMerged = mergeWeeklyDaily(weeklyBonds, new Map(bondDaily.map(x=>[x.symbol,x])));

  await fs.writeFile(path.join(OUT_DIR, 'combined_snapshot.json'),
    JSON.stringify({ timestamp: todayISO(), etfs: etfMerged, bonds: bondMerged }, null, 2));

  // --- CSV combinés ---

  // Normalisation "exposure" pour bonds (comme pour ETFs)
  const bondExposure = weeklyBonds.map(e => ({
    symbol: e.symbol,
    isin: e.isin || '',
    mic_code: e.mic_code || '',
    currency: e.currency || '',
    fund_type: e.fund_type || '',
    etf_type: e.etf_type || '',
    aum_usd: e.aum_usd ?? '',
    total_expense_ratio: e.total_expense_ratio ?? '',
    yield_ttm: e.yield_ttm ?? '',
    objective: e.objective || '',
    sector_top: e.sector_top || '',
    sector_top_weight: e.sector_top_weight || '',
    country_top: e.country_top || (e.domicile || ''),
    country_top_weight: e.country_top_weight || '',
    sector_top5: JSON.stringify(
      (e.sector_top5 || []).map(x => ('sector' in x)
        ? { s: x.sector, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null }
        : { s: x.s, w: x.w != null ? Number(x.w) : null }
      )
    ),
    country_top5: JSON.stringify(
      (e.country_top5 || []).map(x => ('country' in x)
        ? { c: x.country, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null }
        : { c: x.c, w: x.w != null ? Number(x.w) : null }
      )
    ),
    holding_top: e.holding_top || '',
    holdings_top10: JSON.stringify(
      (e.holdings_top10 || []).map(h =>
        ('t' in h)
          ? { t: h.t, n: h.n ?? null, w: h.w }
          : { t: h.symbol || null, n: h.name || null, w: h.weight != null ? Number((h.weight*100).toFixed(2)) : null }
      )
    ),
    data_quality_score: e.data_quality_score ?? ''
  }));

  const exposureByBond = new Map(bondExposure.map(x => [x.symbol, x]));
  const bondMergedWithExposure = bondMerged.map(row => {
    const ex = exposureByBond.get(row.symbol) || {};
    return {
      ...row,
      sector_top: ex.sector_top ?? '',
      sector_top_weight: ex.sector_top_weight ?? '',
      country_top: ex.country_top ?? (row.domicile || ''),
      country_top_weight: ex.country_top_weight ?? '',
      sector_top5: ex.sector_top5 ?? '[]',
      country_top5: ex.country_top5 ?? '[]',
      holding_top: ex.holding_top ?? '',
      holdings_top10: ex.holdings_top10 ?? '[]',
      data_quality_score: row.data_quality_score ?? ex.data_quality_score ?? ''
    };
  });

  await writeCSV(path.join(OUT_DIR, 'combined_bonds.csv'),
    bondMergedWithExposure, [
      'symbol','isin','mic_code','currency','fund_type','etf_type',
      'aum_usd','total_expense_ratio','yield_ttm','objective',
      'daily_change_pct','ytd_return_pct','one_year_return_pct','vol_3y_pct','last_close','as_of',
      'sector_top','sector_top_weight','country_top','country_top_weight',
      'sector_top5','country_top5',
      'holding_top','holdings_top10',
      'data_quality_score'
    ]
  );

  // --- ETFs EXPOSURE (à partir des CSV normalisés) ---
  const etfExposure = weeklyEtfs.map(e => ({
    symbol: e.symbol,
    isin: e.isin || '',
    mic_code: e.mic_code || '',
    currency: e.currency || '',
    fund_type: e.fund_type || '',
    etf_type: e.etf_type || '',
    leverage: e.leverage ?? '',   // <-- ajouté
    aum_usd: e.aum_usd ?? '',
    total_expense_ratio: e.total_expense_ratio ?? '',
    yield_ttm: e.yield_ttm ?? '',
    objective: e.objective || '',
    sector_top: e.sector_top || '',
    sector_top_weight: e.sector_top_weight || '',
    country_top: e.country_top || (e.domicile || ''),
    country_top_weight: e.country_top_weight || '',
    sector_top5: JSON.stringify(
      (e.sector_top5 || []).map(x => ('sector' in x)
        ? { s: x.sector, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null }
        : { s: x.s, w: x.w != null ? Number(x.w) : null }
      )
    ),
    country_top5: JSON.stringify(
      (e.country_top5 || []).map(x => ('country' in x)
        ? { c: x.country, w: x.weight != null ? Number((x.weight*100).toFixed(2)) : null }
        : { c: x.c, w: x.w != null ? Number(x.w) : null }
      )
    ),
    holding_top: e.holding_top || '',
    holdings_top10: JSON.stringify(
      (e.holdings_top10 || []).map(h =>
        ('t' in h)
          ? { t: h.t, n: h.n ?? null, w: h.w }
          : { t: h.symbol || null, n: h.name || null, w: h.weight != null ? Number((h.weight*100).toFixed(2)) : null }
      )
    ),
    data_quality_score: e.data_quality_score ?? ''
  }));

  await writeCSV(path.join(OUT_DIR, 'combined_etfs_exposure.csv'),
    etfExposure, [
      'symbol','isin','mic_code','currency','fund_type','etf_type','leverage',
      'aum_usd','total_expense_ratio','yield_ttm','objective',
      'sector_top','sector_top_weight','country_top','country_top_weight',
      'sector_top5','country_top5',
      'holding_top','holdings_top10',
      'data_quality_score'
    ]
  );

  // --- Injecter l'expo aussi dans le combined_etfs.csv principal ---
  const exposureBySymbol = new Map(etfExposure.map(x => [x.symbol, x]));
  const etfMergedWithExposure = etfMerged.map(row => {
    const ex = exposureBySymbol.get(row.symbol) || {};
    return {
      ...row,
      sector_top: ex.sector_top ?? '',
      sector_top_weight: ex.sector_top_weight ?? '',
      country_top: ex.country_top ?? (row.domicile || ''),
      country_top_weight: ex.country_top_weight ?? '',
      sector_top5: ex.sector_top5 ?? '[]',
      country_top5: ex.country_top5 ?? '[]',
      holding_top: ex.holding_top ?? '',
      holdings_top10: ex.holdings_top10 ?? '[]',
      data_quality_score: row.data_quality_score ?? ex.data_quality_score ?? ''
    };
  });

  await writeCSV(path.join(OUT_DIR, 'combined_etfs.csv'),
    etfMergedWithExposure, [
      'symbol','isin','mic_code','currency','fund_type','etf_type','leverage',
      'aum_usd','total_expense_ratio','yield_ttm','objective',
      'daily_change_pct','ytd_return_pct','one_year_return_pct','vol_3y_pct','last_close','as_of',
      'sector_top','sector_top_weight','country_top','country_top_weight','sector_top5','country_top5',
      'holding_top','holdings_top10',
      'data_quality_score'
    ]
  );

  // === NEW: combined_bonds_holdings.csv (Top10 only, narrow) ===
  const bondsHoldingsHeader = 'etf_symbol,rank,holding_symbol,holding_name,weight_pct\n';
  const bondsHoldingsRows = weeklyBonds.flatMap(fund => {
    const hs = Array.isArray(fund.holdings_top10) ? fund.holdings_top10 : [];
    // normaliser
    const norm = hs.map(h => ('t' in h)
      ? { sym: h.t || '', name: h.n || '', w: h.w != null ? Number(h.w) : null }
      : { sym: h.symbol || '', name: h.name || '', w: h.weight != null ? Number((h.weight*100).toFixed(2)) : null }
    );
    return norm.map((h, idx) => {
      const cells = [
        fund.symbol || '', idx + 1,
        h.sym, (h.name || '').replace(/"/g,'""'),
        h.w != null ? Number(h.w).toFixed(2) : ''
      ];
      return cells.map(v => {
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(',');
    });
  });
  await fs.writeFile(
    path.join(OUT_DIR, 'combined_bonds_holdings.csv'),
    bondsHoldingsHeader + (bondsHoldingsRows.length ? bondsHoldingsRows.join('\n') + '\n' : '')
  );
  console.log(`📝 Combined BONDS holdings (Top10): ${bondsHoldingsRows.length} lignes → data/combined_bonds_holdings.csv`);

  console.log('🔗 Fusions weekly+daily écrites (JSON & CSV).');
  console.log(`✅ Total: ${etfMergedWithExposure.length} ETFs, ${bondMerged.length} Bonds traités`);
  console.log(`📊 CSV Exposure créé avec ${etfExposure.length} ETFs`);
  if (leverageByKey.size > 0) {
    console.log(`💪 Leverage injecté pour ${leverageByKey.size/2} ETFs`);
  }
}

main().catch(err => {
  console.error('❌ Erreur daily:', err);
  process.exit(1);
});
