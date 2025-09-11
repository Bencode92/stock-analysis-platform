// stock-filter-by-volume.js
// npm i csv-parse axios
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) { console.error('❌ TWELVE_DATA_API_KEY manquante'); process.exit(1); }

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR = process.env.OUTPUT_DIR || 'data/filtered';
const INPUTS = [
  { file: 'Actions_US.csv',     region: 'US' },
  { file: 'Actions_Europe.csv', region: 'EUROPE' },
  { file: 'Actions_Asie.csv',   region: 'ASIA' },
];

// Seuils par région
const VOL_MIN = { US: 500_000, EUROPE: 50_000, ASIA: 100_000 };

// Seuils plus fins par MIC (prioritaires sur la région)
const VOL_MIN_BY_MIC = {
  // US
  XNAS: 500_000, XNYS: 350_000, BATS: 500_000,
  // Europe
  XETR: 100_000, XPAR: 40_000, XLON: 120_000, XMIL: 80_000, XMAD: 80_000,
  XAMS: 50_000, XSTO: 60_000, XCSE: 40_000, XHEL: 40_000, XBRU: 30_000,
  XLIS: 20_000, XSWX: 20_000, XWBO: 20_000, XDUB: 20_000, XOSL: 30_000,
  // Asie
  XHKG: 100_000, XKRX: 100_000, XNSE: 50_000, XBOM: 50_000, XTAI: 60_000,
  XKOS: 100_000, XBKK: 50_000, XPHS: 20_000, XKLS: 30_000, XSHE: 100_000, ROCO: 20_000
};

// ───────── Exchange → MIC (multi-synonymes) + fallback par pays ─────────
const EX2MIC_PATTERNS = [
  // Asie
  ['taiwan stock exchange',           'XTAI'],
  ['gretai securities market',        'ROCO'],   // Taipei Exchange (ex-GTSM)
  ['hong kong exchanges and clearing','XHKG'],
  ['shenzhen stock exchange',         'XSHE'],
  ['korea exchange (stock market)',   'XKRX'],
  ['korea exchange (kosdaq)',         'XKOS'],
  ['national stock exchange of india','XNSE'],
  ['stock exchange of thailand',      'XBKK'],
  ['bursa malaysia',                  'XKLS'],
  ['philippine stock exchange',       'XPHS'],

  // Europe
  ['euronext amsterdam',              'XAMS'],
  ['nyse euronext - euronext paris',  'XPAR'],
  ['nyse euronext - euronext brussels','XBRU'],
  ['nyse euronext - euronext lisbon', 'XLIS'],
  ['xetra',                           'XETR'],
  ['deutsche boerse xetra',           'XETR'],
  ['six swiss exchange',              'XSWX'],
  ['london stock exchange',           'XLON'],
  ['bolsa de madrid',                 'XMAD'],
  ['borsa italiana',                  'XMIL'],
  ['wiener boerse ag',                'XWBO'],
  ['irish stock exchange - all market','XDUB'],
  ['oslo bors asa',                   'XOSL'],

  // USA
  ['nasdaq',                          'XNAS'],
  ['new york stock exchange inc.',    'XNYS'],
  ['cboe bzx',                        'BATS'],
  ['cboe bzx exchange',               'BATS'],
];

const COUNTRY2MIC = {
  'switzerland':'XSWX', 'france':'XPAR', 'belgium':'XBRU', 'netherlands':'XAMS', 'portugal':'XLIS',
  'united kingdom':'XLON', 'uk':'XLON',
  'germany':'XETR', 'spain':'XMAD', 'italy':'XMIL',
  'austria':'XWBO', 'norway':'XOSL', 'ireland':'XDUB',
  'japan':'XTKS', 'hong kong':'XHKG', 'singapore':'XSES',
  'taiwan':'XTAI', 'south korea':'XKRX', 'india':'XNSE',
  'thailand':'XBKK', 'philippines':'XPHS', 'malaysia':'XKLS',
  'china':'XSHG' // si "Shenzhen", ton exchange texte donnera XSHE via le pattern ci-dessus
};

const normalize = s => (s||'').toLowerCase().trim();

function toMIC(exchange, country=''){
  const ex = normalize(exchange);
  if (ex) {
    for (const [pat, mic] of EX2MIC_PATTERNS) {
      if (ex.includes(pat)) return mic;
    }
  }
  const c = normalize(country);
  return COUNTRY2MIC[c] || null;
}

// ───────── Helpers de désambiguïsation ─────────
const US_EXCH = /nasdaq|nyse|arca|amex|bats/i;
const LSE_IOB = /^[0][A-Z0-9]{3}$/; // codes LSE "0XXX" (IOB)

// Valide que le nom ressemble (≥1 mot de ≥3 lettres en commun)
function tokens(s){
  return normalize(s).normalize("NFKD").replace(/[^a-z0-9\s]/g," ")
    .split(/\s+/).filter(w => w.length>=3);
}
function nameLooksRight(metaName, expected){
  if (!expected) return true;
  const a = new Set(tokens(metaName));
  const b = tokens(expected);
  return b.some(t => a.has(t));
}

// Annuaire Twelve Data
async function tdStocksLookup({ symbol, country, exchange }) {
  try {
    const { data } = await axios.get('https://api.twelvedata.com/stocks', {
      params: { symbol, country, exchange, apikey: API_KEY }, timeout: 15000
    });
    const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data)?data:[]);
    return arr;
  } catch { return []; }
}

// Score des candidats /stocks
function rankCandidate(c, wanted){
  let s = 0;
  const micWanted = toMIC(wanted.exchange, wanted.country);
  if (micWanted && c.mic_code === micWanted) s += 3;
  if (normalize(c.exchange).includes(normalize(wanted.exchange))) s += 2;
  if (LSE_IOB.test(c.symbol)) s += 1;
  if (US_EXCH.test(c.exchange||"") && normalize(wanted.country) !== 'united states') s -= 3;
  return s;
}

// Quote robuste (essaye SYM:MIC, puis mic_code, puis SYM brut)
async function tryQuote(sym, mic){
  const attempt = async (params) => {
    try {
      const { data } = await axios.get('https://api.twelvedata.com/quote', { params, timeout: 15000 });
      if (data && data.status !== 'error') return data;
    } catch {}
    return null;
  };
  if (mic) {
    const q1 = await attempt({ symbol: `${sym}:${mic}`, apikey: API_KEY });
    if (q1) return q1;
    const q2 = await attempt({ symbol: sym, mic_code: mic, apikey: API_KEY });
    if (q2) return q2;
  }
  return await attempt({ symbol: sym, apikey: API_KEY });
}

const HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché'];
const REJ_HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché','Volume','Seuil','MIC','Symbole','Source','Raison'];

const csvLine = obj => HEADER.map(h => `"${String(obj[h] ?? '').replace(/"/g,'""')}"`).join(',');

async function readCSV(file) {
  const txt = await fs.readFile(file,'utf8');
  return parse(txt, { columns:true, skip_empty_lines:true, bom:true });
}

async function writeCSV(file, rows) {
  const out = [HEADER.join(','), ...rows.map(csvLine)].join('\n');
  await fs.mkdir(path.dirname(file), { recursive:true });
  await fs.writeFile(file, out, 'utf8');
}

async function writeCSVGeneric(file, rows, header) {
  const line = obj => header.map(h => `"${String(obj[h] ?? '').replace(/"/g,'""')}"`).join(',');
  const out = [header.join(','), ...rows.map(line)].join('\n');
  await fs.mkdir(path.dirname(file), { recursive:true });
  await fs.writeFile(file, out, 'utf8');
}

// ───────── Fonction resolveSymbol améliorée ─────────
async function resolveSymbol(ticker, exchange, expectedName = '', country = '') {
  const mic = toMIC(exchange, country);

  // 1) Essai direct
  let quote = await tryQuote(ticker, mic);
  const looksUS   = quote?.exchange && US_EXCH.test(quote.exchange);
  const okMarket  = !(looksUS && normalize(country) !== 'united states');
  const okName    = quote?.name ? nameLooksRight(quote.name, expectedName) : true;

  if (quote && okMarket && okName) {
    return { sym: ticker, quote, reason: 'direct_ok' };
  }

  // 2) Désambiguïsation via /stocks
  const cand = await tdStocksLookup({ symbol: ticker, country, exchange });
  if (cand.length) {
    cand.sort((a,b)=>rankCandidate(b,{country,exchange}) - rankCandidate(a,{country,exchange}));
    const best = cand[0]; // ex. 0QOK (Roche), 0H70 (Bankinter), etc.

    const qBest = await tryQuote(best.symbol, best.mic_code);
    if (qBest) {
      const okM = !(US_EXCH.test(qBest.exchange||"") && normalize(country) !== 'united states');
      const okN = nameLooksRight(qBest.name || '', expectedName);
      if (okM && okN) {
        return { sym: best.symbol, quote: qBest, reason: 'stocks_ok' };
      }
    }
  }

  // 3) Fallback : renvoie SYM brut (volume sera 0 si pas de quote)
  return { sym: ticker, quote: null, reason: 'fallback' };
}

async function fetchVolume(symbol) {
  try {
    const { data } = await axios.get('https://api.twelvedata.com/quote', { params:{ symbol, apikey:API_KEY }});
    const v = Number(data?.volume) || Number(data?.average_volume) || 0;
    return v;
  } catch { return 0; }
}

// Gestion des crédits API (simple rate limiting)
let lastRequest = 0;
const MIN_DELAY = 25; // ms entre requêtes

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < MIN_DELAY) {
    await new Promise(r => setTimeout(r, MIN_DELAY - elapsed));
  }
  lastRequest = Date.now();
}

(async ()=>{
  console.log('🚀 Démarrage du filtrage par volume\n');
  const allOutputs = [];
  const allRejected = [];
  const stats = { total: 0, passed: 0, failed: 0 };

  for (const {file, region} of INPUTS) {
    const src = path.join(DATA_DIR, file);
    const rows = await readCSV(src);
    console.log(`\n📊 ${region}: ${rows.length} stocks à analyser`);

    const filtered = [];
    const rejected = [];
    let processed = 0;
    
    for (const r of rows) {
      await throttle(); // Rate limiting simple
      
      const ticker = (r['Ticker']||'').trim();
      const exch   = r['Bourse de valeurs'] || '';
      const mic    = toMIC(exch, r['Pays'] || '');
      // Modification: passer le nom et le pays pour validation
      const { sym, quote } = await resolveSymbol(
        ticker,
        exch,
        r['Stock'] || '',   // nom attendu (validation)
        r['Pays']  || ''    // pays (évite ADR US & fallback MIC)
      );
      const vol = quote ? (Number(quote.volume)||Number(quote.average_volume)||0) : await fetchVolume(sym);

      const thr = VOL_MIN_BY_MIC[mic || ''] ?? VOL_MIN[region] ?? 0;
      const source = VOL_MIN_BY_MIC[mic || ''] ? `MIC:${mic}` : `REGION:${region}`;
      stats.total++;
      
      if (vol >= thr) {
        filtered.push({
          'Ticker': ticker,
          'Stock': r['Stock']||'',
          'Secteur': r['Secteur']||'',
          'Pays': r['Pays']||'',
          'Bourse de valeurs': r['Bourse de valeurs']||'',
          'Devise de marché': r['Devise de marché']||'',
        });
        stats.passed++;
        console.log(`  ✅ ${ticker}: ${vol.toLocaleString()} >= ${thr.toLocaleString()} (${source})`);
      } else {
        stats.failed++;
        console.log(`  ❌ ${ticker}: ${vol.toLocaleString()} < ${thr.toLocaleString()} (${source})`);
        rejected.push({
          'Ticker': ticker,
          'Stock': r['Stock']||'',
          'Secteur': r['Secteur']||'',
          'Pays': r['Pays']||'',
          'Bourse de valeurs': r['Bourse de valeurs']||'',
          'Devise de marché': r['Devise de marché']||'',
          'Volume': vol,
          'Seuil': thr,
          'MIC': mic || '',
          'Symbole': sym,
          'Source': source,
          'Raison': `Volume ${vol} < Seuil ${thr}`
        });
      }
      
      processed++;
      if (processed % 10 === 0) {
        console.log(`  Progression: ${processed}/${rows.length}`);
      }
    }

    // Sauvegarder les stocks acceptés
    const outFile = path.join(OUT_DIR, file.replace('.csv','_filtered.csv'));
    await writeCSV(outFile, filtered);
    allOutputs.push({ title: `${region}`, file: outFile, rows: filtered });

    // Sauvegarder les stocks rejetés
    const rejFile = path.join(OUT_DIR, file.replace('.csv','_rejected.csv'));
    await writeCSVGeneric(rejFile, rejected, REJ_HEADER);
    allRejected.push(...rejected);

    console.log(`✅ ${region}: ${filtered.length}/${rows.length} stocks retenus → ${outFile}`);
    console.log(`❌ ${region}: ${rejected.length} stocks rejetés → ${rejFile}`);
  }

  // CSV combiné des acceptés
  const combined = allOutputs.flatMap(o => o.rows);
  await writeCSV(path.join(OUT_DIR,'Actions_filtrees_par_volume.csv'), combined);
  
  // CSV combiné des rejetés
  await writeCSVGeneric(path.join(OUT_DIR,'Actions_rejetes_par_volume.csv'), allRejected, REJ_HEADER);
  
  // Résumé final
  console.log('\n' + '='.repeat(50));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(50));
  console.log(`Total analysés: ${stats.total}`);
  console.log(`✅ Retenus: ${stats.passed} (${(stats.passed/stats.total*100).toFixed(1)}%)`);
  console.log(`❌ Rejetés: ${stats.failed} (${(stats.failed/stats.total*100).toFixed(1)}%)`);
  console.log('='.repeat(50));
  
  // Résumé par bourse (MIC) pour les rejets
  console.log('\n📈 ANALYSE DES REJETS PAR BOURSE:');
  const byMic = {};
  const bySource = { MIC: 0, REGION: 0 };
  
  allRejected.forEach(r => {
    const micKey = r.MIC || 'N/A';
    byMic[micKey] = (byMic[micKey] || 0) + 1;
    
    if (r.Source && r.Source.startsWith('MIC:')) {
      bySource.MIC++;
    } else {
      bySource.REGION++;
    }
  });
  
  // Trier par nombre de rejets décroissant
  const sortedMics = Object.entries(byMic).sort((a, b) => b[1] - a[1]);
  
  console.log('\nPar code MIC:');
  sortedMics.forEach(([mic, count]) => {
    const pct = ((count / stats.failed) * 100).toFixed(1);
    console.log(`  ${mic.padEnd(8)} : ${count.toString().padStart(4)} rejets (${pct}%)`);
  });
  
  console.log('\nPar source de seuil:');
  console.log(`  Seuil MIC    : ${bySource.MIC} rejets (${(bySource.MIC/stats.failed*100).toFixed(1)}%)`);
  console.log(`  Seuil REGION : ${bySource.REGION} rejets (${(bySource.REGION/stats.failed*100).toFixed(1)}%)`);
  
  // Statistiques acceptés par bourse
  console.log('\n📊 ANALYSE DES ACCEPTÉS PAR BOURSE:');
  const acceptedByExchange = {};
  combined.forEach(s => {
    const exchange = s['Bourse de valeurs'] || 'N/A';
    acceptedByExchange[exchange] = (acceptedByExchange[exchange] || 0) + 1;
  });
  
  const sortedExchanges = Object.entries(acceptedByExchange).sort((a, b) => b[1] - a[1]);
  sortedExchanges.slice(0, 10).forEach(([exchange, count]) => {
    const pct = ((count / stats.passed) * 100).toFixed(1);
    console.log(`  ${exchange.padEnd(40)} : ${count.toString().padStart(4)} acceptés (${pct}%)`);
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`Fichiers acceptés dans: ${OUT_DIR}/`);
  console.log(`Fichiers rejetés dans: ${OUT_DIR}/`);
  
  // Pour GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    allOutputs.forEach(o => {
      fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `stocks_${o.title.toLowerCase()}=${o.rows.length}\n`);
    });
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `total_filtered=${combined.length}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `total_rejected=${allRejected.length}\n`);
  }
})();
