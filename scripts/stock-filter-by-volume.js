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
  XNAS: 500_000, XNYS: 500_000,
  // Europe
  XETR: 100_000, XPAR: 80_000, XLON: 120_000, XMIL: 80_000, XMAD: 80_000,
  XAMS: 50_000, XSTO: 60_000, XCSE: 40_000, XHEL: 40_000, XBRU: 30_000,
  XLIS: 20_000, XSWX: 20_000,
  // Asie
  XHKG: 100_000, XKRX: 100_000, XNSE: 50_000, XBOM: 50_000, XTAI: 60_000
};

// Mapping Exchange → MIC (insensible à la casse)
const EX2MIC = Object.entries({
  'nyse':'XNYS','new york stock exchange':'XNYS',
  'nasdaq':'XNAS',
  'xetra':'XETR','six swiss exchange':'XSWX',
  'london stock exchange':'XLON',
  'euronext paris':'XPAR','euronext amsterdam':'XAMS',
  'borsa italiana':'XMIL','bme spanish exchanges':'XMAD',
  'nasdaq stockholm':'XSTO','nasdaq copenhagen':'XCSE','nasdaq helsinki':'XHEL',
  'euronext brussels':'XBRU','euronext lisbon':'XLIS',
  'hong kong exchanges and clearing ltd':'XHKG',
  'korea exchange (stock market)':'XKRX',
  'national stock exchange of india':'XNSE','bombay stock exchange':'XBOM',
  'taiwan stock exchange':'XTAI'
}).reduce((m,[k,v]) => (m[k]=v,m), {});

const toMIC = ex => EX2MIC[(ex||'').toLowerCase().trim()] || null;

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

async function resolveSymbol(ticker, exchange) {
  // 1) essai brut
  const trySymbol = async (sym) => {
    try {
      const { data } = await axios.get('https://api.twelvedata.com/quote', { params:{ symbol:sym, apikey:API_KEY }});
      if (data && data.status !== 'error') return { sym, quote:data };
    } catch {}
    return null;
  };
  let r = await trySymbol(ticker);
  if (r) return r;

  // 2) essai avec MIC
  const mic = toMIC(exchange);
  if (mic) {
    r = await trySymbol(`${ticker}:${mic}`);
    if (r) return r;
  }
  // 3) dernier recours : rien trouvé
  return { sym: ticker, quote: null };
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
      const mic    = toMIC(exch);
      const { sym, quote } = await resolveSymbol(ticker, exch);
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
