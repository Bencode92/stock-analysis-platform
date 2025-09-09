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

// Seuils par région - Ajustés pour volumes consolidés
const VOL_MIN = { 
  US: 1_000_000,    // 1M (plus réaliste avec volumes complets)
  EUROPE: 100_000,  // 100k
  ASIA: 200_000     // 200k
};

// Seuils plus fins par MIC (prioritaires sur la région)
const VOL_MIN_BY_MIC = {
  // US - seuils relevés pour volumes consolidés
  XNAS: 1_000_000, XNYS: 1_000_000, BATS: 750_000,
  // Europe
  XETR: 200_000, XPAR: 150_000, XLON: 250_000, XMIL: 100_000, XMAD: 100_000,
  XAMS: 80_000, XSTO: 80_000, XCSE: 50_000, XHEL: 50_000, XBRU: 40_000,
  XLIS: 30_000, XSWX: 30_000, XWBO: 30_000, XDUB: 30_000, XOSL: 40_000,
  // Asie
  XHKG: 500_000, XKRX: 200_000, XNSE: 100_000, XBOM: 100_000, XTAI: 100_000,
  XKOS: 200_000, XBKK: 100_000, XPHS: 50_000, XKLS: 50_000, XSHE: 200_000, ROCO: 50_000
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

// ───────── Cache pour économiser les crédits API ─────────
const volumeCache = new Map();
const CACHE_TTL = 3600000; // 1 heure

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

// ───────── NOUVELLES FONCTIONS POUR VOLUMES CONSOLIDÉS ─────────
async function getLastDailyVolume(sym, mic) {
  // Check cache
  const cacheKey = `daily:${sym}:${mic || 'default'}`;
  const cached = volumeCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.volume;
  }

  try {
    const params = mic ? { symbol: `${sym}:${mic}` } : { symbol: sym };
    const { data } = await axios.get('https://api.twelvedata.com/time_series', {
      params: { 
        ...params, 
        interval: '1day', 
        outputsize: 5,  // 5 jours pour plus de robustesse
        order: 'DESC', 
        apikey: API_KEY 
      },
      timeout: 15000
    });
    
    const arr = Array.isArray(data?.values) ? data.values : [];
    if (!arr.length) return 0;

    // Détection intelligente du dernier jour complet
    const now = new Date();
    const marketClose = new Date(now);
    marketClose.setHours(16, 0, 0, 0); // 16h ET close
    
    // Si on est après la clôture, on peut prendre aujourd'hui
    const useToday = now >= marketClose;
    const today = now.toISOString().slice(0,10);
    
    // Trouve la dernière barre complète
    const bar = useToday 
      ? arr[0] 
      : arr.find(b => (b.datetime||'').slice(0,10) < today) || arr[0];
    
    const volume = Number(bar?.volume) || 0;
    
    // Cache le résultat
    volumeCache.set(cacheKey, { volume, timestamp: Date.now() });
    
    return volume;
  } catch (err) {
    console.error(`  ⚠️ Erreur daily volume pour ${sym}: ${err.message}`);
    return 0;
  }
}

async function getAverageVolume(sym, mic) {
  // Check cache
  const cacheKey = `avg:${sym}:${mic || 'default'}`;
  const cached = volumeCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.volume;
  }

  try {
    const params = mic ? { symbol: `${sym}:${mic}` } : { symbol: sym };
    const { data } = await axios.get('https://api.twelvedata.com/statistics', {
      params: { ...params, apikey: API_KEY },
      timeout: 15000
    });
    
    // Twelve Data statistics donne le volume moyen sur 3 mois
    const volume = Number(data?.statistics?.average_volume) || 0;
    
    // Cache le résultat
    volumeCache.set(cacheKey, { volume, timestamp: Date.now() });
    
    return volume;
  } catch {
    return 0;
  }
}

async function bestVolume(sym, mic, quote, thr, region) {
  // Volumes depuis différentes sources
  const volQuote = quote ? (Number(quote.volume) || 0) : 0;
  const volAvg = quote ? (Number(quote.average_volume) || 0) : 0;
  
  // Pour les US, on privilégie toujours la daily ou average (quote.volume est trompeur)
  const isUS = region === 'US' || ['XNAS', 'XNYS', 'BATS'].includes(mic);
  
  if (isUS) {
    // US : on prend direct la moyenne ou daily (quote.volume est souvent IEX partiel)
    const volDaily = await getLastDailyVolume(sym, mic);
    const volStats = volAvg || await getAverageVolume(sym, mic);
    
    return {
      vol: Math.max(volDaily, volStats),
      source: volDaily > volStats ? 'daily' : 'avg3m',
      details: { quote: volQuote, daily: volDaily, avg: volStats }
    };
  } else {
    // Non-US : on fait confiance au quote.volume d'abord
    if (volQuote >= thr || volAvg >= thr) {
      return {
        vol: Math.max(volQuote, volAvg),
        source: volQuote > volAvg ? 'quote' : 'avg',
        details: { quote: volQuote, avg: volAvg, daily: 0 }
      };
    }
    
    // Fallback sur daily si nécessaire
    const volDaily = await getLastDailyVolume(sym, mic);
    return {
      vol: Math.max(volQuote, volAvg, volDaily),
      source: volDaily > Math.max(volQuote, volAvg) ? 'daily' : (volQuote > volAvg ? 'quote' : 'avg'),
      details: { quote: volQuote, avg: volAvg, daily: volDaily }
    };
  }
}

const HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché'];
const REJ_HEADER = ['Ticker','Stock','Secteur','Pays','Bourse de valeurs','Devise de marché','Volume','Volume_Source','Volume_Quote','Volume_Daily','Volume_Avg','Seuil','MIC','Symbole','Source','Raison'];

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
  console.log('🚀 Démarrage du filtrage par volume (v2 - volumes consolidés)\n');
  const allOutputs = [];
  const allRejected = [];
  const stats = { total: 0, passed: 0, failed: 0 };
  
  // Méga-caps US pour détection d'anomalies
  const US_MEGA_CAPS = ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','BRK.A','BRK.B','JNJ','V','JPM'];

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
      
      // Résolution du symbole avec validation
      const { sym, quote } = await resolveSymbol(
        ticker,
        exch,
        r['Stock'] || '',   // nom attendu (validation)
        r['Pays']  || ''    // pays (évite ADR US & fallback MIC)
      );
      
      const thr = VOL_MIN_BY_MIC[mic || ''] ?? VOL_MIN[region] ?? 0;
      const sourceThreshold = VOL_MIN_BY_MIC[mic || ''] ? `MIC:${mic}` : `REGION:${region}`;
      
      // NOUVELLE LOGIQUE : Utilisation de bestVolume avec sources multiples
      const { vol, source, details } = await bestVolume(sym, mic, quote, thr, region);
      
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
        console.log(`  ✅ ${ticker}: ${vol.toLocaleString()} >= ${thr.toLocaleString()} [${source}] (${sourceThreshold})`);
        
        // Warning pour méga-caps US avec volume suspect
        if (region === 'US' && US_MEGA_CAPS.includes(ticker) && vol < 5_000_000) {
          console.warn(`  ⚠️  Volume suspicieusement bas pour ${ticker}: ${vol.toLocaleString()} - vérifier manuellement`);
        }
      } else {
        stats.failed++;
        console.log(`  ❌ ${ticker}: ${vol.toLocaleString()} < ${thr.toLocaleString()} [${source}] (${sourceThreshold})`);
        
        // Log détaillé pour debug des rejets US suspects
        if (region === 'US' && details) {
          console.log(`     └─ Details: quote=${(details.quote||0).toLocaleString()}, daily=${(details.daily||0).toLocaleString()}, avg=${(details.avg||0).toLocaleString()}`);
        }
        
        rejected.push({
          'Ticker': ticker,
          'Stock': r['Stock']||'',
          'Secteur': r['Secteur']||'',
          'Pays': r['Pays']||'',
          'Bourse de valeurs': r['Bourse de valeurs']||'',
          'Devise de marché': r['Devise de marché']||'',
          'Volume': vol,
          'Volume_Source': source,
          'Volume_Quote': details?.quote || 0,
          'Volume_Daily': details?.daily || 0,
          'Volume_Avg': details?.avg || 0,
          'Seuil': thr,
          'MIC': mic || '',
          'Symbole': sym,
          'Source': sourceThreshold,
          'Raison': `Volume ${vol} < Seuil ${thr} (source: ${source})`
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
  const byVolumeSource = { quote: 0, daily: 0, avg: 0, avg3m: 0 };
  
  allRejected.forEach(r => {
    const micKey = r.MIC || 'N/A';
    byMic[micKey] = (byMic[micKey] || 0) + 1;
    
    if (r.Source && r.Source.startsWith('MIC:')) {
      bySource.MIC++;
    } else {
      bySource.REGION++;
    }
    
    // Comptage par source de volume
    if (r.Volume_Source) {
      byVolumeSource[r.Volume_Source] = (byVolumeSource[r.Volume_Source] || 0) + 1;
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
  
  console.log('\nPar source de volume:');
  Object.entries(byVolumeSource).forEach(([source, count]) => {
    if (count > 0) {
      console.log(`  Volume ${source.padEnd(6)} : ${count} rejets (${(count/stats.failed*100).toFixed(1)}%)`);
    }
  });
  
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
  
  // Cache stats
  console.log('\n📊 STATISTIQUES CACHE:');
  console.log(`  Entrées en cache: ${volumeCache.size}`);
  
  console.log('\n' + '='.repeat(50));
  console.log(`Fichiers acceptés dans: ${OUT_DIR}/`);
  console.log(`Fichiers rejetés dans: ${OUT_DIR}/`);
  console.log('\n✨ Version 2.0 - Utilisation des volumes consolidés pour US');
  
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
