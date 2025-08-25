// scripts/crypto-filter-by-volume.js
// Script de filtrage des crypto-monnaies par volume
// Similaire à stock-filter-by-volume.js mais adapté pour les cryptos
// npm i csv-parse axios

const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

// Configuration API
const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) { 
  console.error('❌ TWELVE_DATA_API_KEY manquante'); 
  process.exit(1); 
}

// Répertoires
const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR = process.env.OUTPUT_DIR || 'data/filtered';

// Fichier d'entrée
const INPUT_FILE = 'Crypto.csv';

// Seuils de volume USD - Configurables via environnement
const VOLUME_THRESHOLDS = {
  MIN_USD_DAY: Number(process.env.MIN_USD_DAY || 1_000_000),      // 1M$ volume 24h
  MIN_USD_AVG7D: Number(process.env.MIN_USD_AVG7D || 2_000_000),  // 2M$ moyenne 7j
  MIN_USD_AVG30D: Number(process.env.MIN_USD_AVG30D || 1_500_000) // 1.5M$ moyenne 30j
};

// Exchanges prioritaires (ordre de préférence)
const PREFERRED_EXCHANGES = [
  'Binance',
  'Coinbase Pro',
  'Kraken',
  'BitStamp',
  'Bitfinex',
  'Bybit',
  'OKX',
  'OKEx',
  'Gate.io',
  'KuCoin',
  'Crypto.com Exchange',
  'Huobi',
  'Gemini'
];

// Headers CSV de sortie
const HEADER_ACCEPTED = [
  'Symbol',
  'Currency_Base',
  'Currency_Quote',
  'Exchange_Used',
  'Volume_USD_24h',
  'Volume_USD_Avg7d',
  'Volume_USD_Avg30d',
  'Price_USD',
  'Market_Cap_Est',
  'Last_Update',
  'Quality_Score'
];

const HEADER_REJECTED = [
  'Symbol',
  'Currency_Base', 
  'Currency_Quote',
  'Available_Exchanges',
  'Volume_USD_24h',
  'Volume_USD_Avg7d',
  'Threshold_24h',
  'Threshold_7d',
  'Reason'
];

// Fonctions utilitaires
async function readCSV(file) {
  const txt = await fs.readFile(file, 'utf8');
  return parse(txt, { 
    columns: true, 
    skip_empty_lines: true, 
    bom: true 
  });
}

async function writeCSV(file, rows, header) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const line = obj => header.map(h => escape(obj[h])).join(',');
  const output = [header.join(','), ...rows.map(line)].join('\n');
  
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, output, 'utf8');
}

// Normaliser les noms d'exchanges
function normalizeExchange(name) {
  if (!name) return null;
  const n = String(name).trim();
  if (!n) return null;
  
  // Mappings spécifiques
  const mappings = {
    'okex': 'OKX',
    'coinbase': 'Coinbase Pro',
    'binance us': 'Binance',
    'ftx': 'FTX (Defunct)',
    'crypto.com': 'Crypto.com Exchange'
  };
  
  const lower = n.toLowerCase();
  return mappings[lower] || n;
}

// Parser la liste des exchanges disponibles
function parseExchangeList(str) {
  if (!str) return [];
  const s = String(str).trim();
  
  // Essayer de parser comme JSON
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return arr.map(normalizeExchange).filter(Boolean);
    }
  } catch {}
  
  // Enlever les crochets et split par ; ou ,
  const stripped = s.replace(/^\[|\]$/g, '').replace(/'/g, '"');
  const parts = stripped.split(/[;,]/).map(x => normalizeExchange(x?.trim())).filter(Boolean);
  
  if (parts.length) return parts;
  
  // Valeur unique
  const single = normalizeExchange(s);
  return single ? [single] : [];
}

// Sélectionner l'exchange préféré
function selectPreferredExchange(availableExchanges) {
  if (!Array.isArray(availableExchanges) || !availableExchanges.length) {
    return null;
  }
  
  // Chercher dans l'ordre de préférence
  for (const preferred of PREFERRED_EXCHANGES) {
    if (availableExchanges.includes(preferred)) {
      return preferred;
    }
  }
  
  // Sinon prendre le premier disponible
  return availableExchanges[0];
}

// Rate limiting
let lastRequestTime = 0;
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS || 60); // ~16 req/s

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// Récupérer les données de volume depuis l'API
async function fetchCryptoData(symbol, exchange = null) {
  await throttle();
  
  try {
    // Récupérer les données sur 30 jours
    const params = {
      symbol,
      interval: '1day',
      outputsize: 30,
      order: 'desc',
      apikey: API_KEY
    };
    
    if (exchange) {
      params.exchange = exchange;
    }
    
    const { data } = await axios.get('https://api.twelvedata.com/time_series', { 
      params,
      timeout: 10000 
    });
    
    const values = data?.values;
    
    if (!Array.isArray(values) || !values.length) {
      // Retry sans exchange si spécifié
      if (exchange) {
        console.log(`    ↻ Retry ${symbol} sans exchange spécifique`);
        return fetchCryptoData(symbol, null);
      }
      return { success: false, reason: 'no_data' };
    }
    
    // Données du dernier jour
    const latest = values[0];
    const priceUSD = Number(latest?.close) || 0;
    const volume24h = Number(latest?.volume) || 0;
    const volumeUSD24h = priceUSD * volume24h;
    const lastDatetime = latest?.datetime;
    
    // Calculer moyennes 7j et 30j
    const last7days = values.slice(0, Math.min(7, values.length));
    const volumeUSDAvg7d = last7days.reduce((sum, v) => {
      const price = Number(v.close) || 0;
      const vol = Number(v.volume) || 0;
      return sum + (price * vol);
    }, 0) / last7days.length;
    
    const volumeUSDAvg30d = values.reduce((sum, v) => {
      const price = Number(v.close) || 0;
      const vol = Number(v.volume) || 0;
      return sum + (price * vol);
    }, 0) / values.length;
    
    // Vérifier si les données sont récentes
    let isStale = false;
    if (lastDatetime) {
      const hoursOld = (Date.now() - new Date(lastDatetime).getTime()) / (1000 * 60 * 60);
      isStale = hoursOld > 48;
    }
    
    // Estimer la market cap (approximatif)
    const marketCapEst = volumeUSD24h * 20; // Estimation basique
    
    return {
      success: true,
      priceUSD,
      volumeUSD24h: Math.round(volumeUSD24h),
      volumeUSDAvg7d: Math.round(volumeUSDAvg7d),
      volumeUSDAvg30d: Math.round(volumeUSDAvg30d),
      marketCapEst: Math.round(marketCapEst),
      lastDatetime,
      isStale
    };
    
  } catch (error) {
    return {
      success: false,
      reason: `api_error: ${error.message}`
    };
  }
}

// Calculer un score de qualité
function calculateQualityScore(data) {
  let score = 0;
  const { volumeUSD24h, volumeUSDAvg7d, volumeUSDAvg30d, isStale } = data;
  
  // Score basé sur le volume 24h
  if (volumeUSD24h > 10_000_000) score += 30;
  else if (volumeUSD24h > 5_000_000) score += 20;
  else if (volumeUSD24h > 1_000_000) score += 10;
  
  // Score basé sur la moyenne 7j
  if (volumeUSDAvg7d > 10_000_000) score += 25;
  else if (volumeUSDAvg7d > 5_000_000) score += 15;
  else if (volumeUSDAvg7d > 2_000_000) score += 10;
  
  // Score basé sur la moyenne 30j (stabilité)
  if (volumeUSDAvg30d > 5_000_000) score += 20;
  else if (volumeUSDAvg30d > 2_000_000) score += 10;
  else if (volumeUSDAvg30d > 1_000_000) score += 5;
  
  // Ratio de stabilité (volume récent vs moyenne)
  if (volumeUSDAvg7d > 0) {
    const ratio = volumeUSD24h / volumeUSDAvg7d;
    if (ratio > 0.8 && ratio < 1.5) score += 15; // Volume stable
    else if (ratio > 0.5 && ratio < 2) score += 10;
  }
  
  // Pénalité pour données obsolètes
  if (isStale) score -= 20;
  
  // Bonus pour liquidité élevée
  if (volumeUSD24h > 50_000_000) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

// Fonction principale
(async () => {
  console.log('🚀 Démarrage du filtrage des crypto-monnaies par volume\n');
  console.log('Configuration:');
  console.log(`  Volume 24h min: $${VOLUME_THRESHOLDS.MIN_USD_DAY.toLocaleString()}`);
  console.log(`  Volume 7j moy min: $${VOLUME_THRESHOLDS.MIN_USD_AVG7D.toLocaleString()}`);
  console.log(`  Volume 30j moy min: $${VOLUME_THRESHOLDS.MIN_USD_AVG30D.toLocaleString()}\n`);
  
  // Lire le fichier CSV
  const inputPath = path.join(DATA_DIR, INPUT_FILE);
  const cryptos = await readCSV(inputPath);
  console.log(`📊 ${cryptos.length} crypto-monnaies à analyser depuis ${INPUT_FILE}\n`);
  
  const accepted = [];
  const rejected = [];
  const stats = {
    total: cryptos.length,
    passed: 0,
    failed: 0,
    errors: 0,
    stale: 0
  };
  
  let processed = 0;
  
  for (const crypto of cryptos) {
    processed++;
    
    const symbol = (crypto.symbol || '').trim();
    const currencyBase = (crypto.currency_base || '').trim();
    const currencyQuote = (crypto.currency_quote || '').trim();
    const availableExchanges = parseExchangeList(crypto.available_exchanges);
    const selectedExchange = selectPreferredExchange(availableExchanges);
    
    if (!symbol) {
      console.log(`  ⚠️  Ligne ${processed}: Symbol manquant`);
      stats.errors++;
      continue;
    }
    
    try {
      // Récupérer les données de volume
      const data = await fetchCryptoData(symbol, selectedExchange);
      
      if (!data.success) {
        rejected.push({
          Symbol: symbol,
          Currency_Base: currencyBase,
          Currency_Quote: currencyQuote,
          Available_Exchanges: availableExchanges.join(';'),
          Volume_USD_24h: 0,
          Volume_USD_Avg7d: 0,
          Threshold_24h: VOLUME_THRESHOLDS.MIN_USD_DAY,
          Threshold_7d: VOLUME_THRESHOLDS.MIN_USD_AVG7D,
          Reason: data.reason
        });
        stats.failed++;
        console.log(`  ❌ ${symbol.padEnd(12)} - ${data.reason}`);
        continue;
      }
      
      // Vérifier les seuils
      const passes24h = data.volumeUSD24h >= VOLUME_THRESHOLDS.MIN_USD_DAY;
      const passes7d = data.volumeUSDAvg7d >= VOLUME_THRESHOLDS.MIN_USD_AVG7D;
      const passes30d = data.volumeUSDAvg30d >= VOLUME_THRESHOLDS.MIN_USD_AVG30D;
      const notStale = !data.isStale;
      
      // Au moins un des critères de volume doit être satisfait ET données récentes
      const passed = notStale && (passes24h || passes7d || passes30d);
      
      if (data.isStale) stats.stale++;
      
      if (passed) {
        const qualityScore = calculateQualityScore(data);
        
        accepted.push({
          Symbol: symbol,
          Currency_Base: currencyBase,
          Currency_Quote: currencyQuote,
          Exchange_Used: selectedExchange || 'Multiple',
          Volume_USD_24h: data.volumeUSD24h,
          Volume_USD_Avg7d: data.volumeUSDAvg7d,
          Volume_USD_Avg30d: data.volumeUSDAvg30d,
          Price_USD: data.priceUSD.toFixed(6),
          Market_Cap_Est: data.marketCapEst,
          Last_Update: data.lastDatetime,
          Quality_Score: qualityScore
        });
        
        stats.passed++;
        console.log(`  ✅ ${symbol.padEnd(12)} ${selectedExchange ? `(${selectedExchange})`.padEnd(20) : ''.padEnd(20)} ` +
                   `24h: $${data.volumeUSD24h.toLocaleString().padEnd(15)} ` +
                   `7d: $${data.volumeUSDAvg7d.toLocaleString().padEnd(15)} ` +
                   `Score: ${qualityScore}`);
                   
      } else {
        let reason = '';
        if (data.isStale) {
          reason = 'Données obsolètes (>48h)';
        } else {
          const reasons = [];
          if (!passes24h) reasons.push(`24h<${VOLUME_THRESHOLDS.MIN_USD_DAY.toLocaleString()}`);
          if (!passes7d) reasons.push(`7d<${VOLUME_THRESHOLDS.MIN_USD_AVG7D.toLocaleString()}`);
          if (!passes30d) reasons.push(`30d<${VOLUME_THRESHOLDS.MIN_USD_AVG30D.toLocaleString()}`);
          reason = `Volume insuffisant: ${reasons.join(', ')}`;
        }
        
        rejected.push({
          Symbol: symbol,
          Currency_Base: currencyBase,
          Currency_Quote: currencyQuote,
          Available_Exchanges: availableExchanges.join(';'),
          Volume_USD_24h: data.volumeUSD24h,
          Volume_USD_Avg7d: data.volumeUSDAvg7d,
          Threshold_24h: VOLUME_THRESHOLDS.MIN_USD_DAY,
          Threshold_7d: VOLUME_THRESHOLDS.MIN_USD_AVG7D,
          Reason: reason
        });
        
        stats.failed++;
        console.log(`  ❌ ${symbol.padEnd(12)} - ${reason}`);
      }
      
    } catch (error) {
      rejected.push({
        Symbol: symbol,
        Currency_Base: currencyBase,
        Currency_Quote: currencyQuote,
        Available_Exchanges: availableExchanges.join(';'),
        Volume_USD_24h: 0,
        Volume_USD_Avg7d: 0,
        Threshold_24h: VOLUME_THRESHOLDS.MIN_USD_DAY,
        Threshold_7d: VOLUME_THRESHOLDS.MIN_USD_AVG7D,
        Reason: `Erreur: ${error.message}`
      });
      
      stats.errors++;
      console.log(`  ⚠️  ${symbol.padEnd(12)} - Erreur: ${error.message}`);
    }
    
    // Afficher la progression
    if (processed % 10 === 0) {
      console.log(`  📈 Progression: ${processed}/${cryptos.length} (${Math.round(processed/cryptos.length*100)}%)`);
    }
  }
  
  // Trier les cryptos acceptées par score de qualité
  accepted.sort((a, b) => b.Quality_Score - a.Quality_Score);
  
  // Sauvegarder les résultats
  const acceptedFile = path.join(OUT_DIR, 'Crypto_filtered_by_volume.csv');
  const rejectedFile = path.join(OUT_DIR, 'Crypto_rejected_by_volume.csv');
  
  await writeCSV(acceptedFile, accepted, HEADER_ACCEPTED);
  await writeCSV(rejectedFile, rejected, HEADER_REJECTED);
  
  // Créer aussi un fichier JSON avec les top cryptos
  const topCryptos = accepted.slice(0, 50).map(c => ({
    symbol: c.Symbol,
    base: c.Currency_Base,
    quote: c.Currency_Quote,
    exchange: c.Exchange_Used,
    volume24h: c.Volume_USD_24h,
    volumeAvg7d: c.Volume_USD_Avg7d,
    price: parseFloat(c.Price_USD),
    score: c.Quality_Score
  }));
  
  await fs.writeFile(
    path.join(OUT_DIR, 'Crypto_top50_by_volume.json'),
    JSON.stringify(topCryptos, null, 2),
    'utf8'
  );
  
  // Résumé final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(60));
  console.log(`Total analysés: ${stats.total}`);
  console.log(`✅ Acceptés: ${stats.passed} (${(stats.passed/stats.total*100).toFixed(1)}%)`);
  console.log(`❌ Rejetés: ${stats.failed} (${(stats.failed/stats.total*100).toFixed(1)}%)`);
  console.log(`⚠️  Erreurs: ${stats.errors}`);
  console.log(`🕐 Données obsolètes: ${stats.stale}`);
  console.log('='.repeat(60));
  
  // Top 10 des meilleures cryptos
  if (accepted.length > 0) {
    console.log('\n🏆 TOP 10 CRYPTOS PAR SCORE DE QUALITÉ:');
    accepted.slice(0, 10).forEach((crypto, i) => {
      console.log(`  ${(i+1).toString().padStart(2)}. ${crypto.Symbol.padEnd(10)} ` +
                 `Score: ${crypto.Quality_Score.toString().padStart(3)} ` +
                 `Vol 24h: $${Number(crypto.Volume_USD_24h).toLocaleString()}`);
    });
  }
  
  // Statistiques par exchange
  const exchangeStats = {};
  accepted.forEach(c => {
    const ex = c.Exchange_Used || 'Unknown';
    exchangeStats[ex] = (exchangeStats[ex] || 0) + 1;
  });
  
  console.log('\n📈 RÉPARTITION PAR EXCHANGE:');
  Object.entries(exchangeStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([exchange, count]) => {
      const pct = ((count / accepted.length) * 100).toFixed(1);
      console.log(`  ${exchange.padEnd(20)} : ${count.toString().padStart(4)} cryptos (${pct}%)`);
    });
  
  console.log('\n📁 Fichiers générés:');
  console.log(`  ✅ Acceptées: ${acceptedFile}`);
  console.log(`  ❌ Rejetées: ${rejectedFile}`);
  console.log(`  🏆 Top 50 JSON: ${path.join(OUT_DIR, 'Crypto_top50_by_volume.json')}`);
  
  // Pour GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const fsSync = require('fs');
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_accepted=${stats.passed}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_rejected=${stats.failed}\n`);
    fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `cryptos_total=${stats.total}\n`);
  }
})();
