// stock-advanced-filter.js
// Filtrage et enrichissement des stocks multi-régions
// Basé sur etf-advanced-filter.js v11.2

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    
    // Seuils par région
    MIN_ADV_USD_US: 1_000_000,      // 1M$ pour US
    MIN_ADV_USD_EUROPE: 500_000,    // 500k$ pour Europe
    MIN_ADV_USD_ASIA: 300_000,      // 300k$ pour Asie
    
    // Config API
    DAYS_HISTORY: 30,
    CHUNK_SIZE: 10,
    CREDIT_LIMIT: 2584,
    CREDITS: {
        TIME_SERIES: 5,
        QUOTE: 1,
        STATISTICS: 25,
        PROFILE: 15
    }
};

// MIC codes par région
const US_MIC_CODES = ['XNAS', 'XNYS', 'ARCX', 'BATS', 'XASE'];
const EU_MIC_CODES = ['XPAR', 'XLON', 'XAMS', 'XETR', 'XMIL', 'XBRU', 'XSWX'];
const ASIA_MIC_CODES = ['XTKS', 'XHKG', 'XSES', 'XKRX', 'XTAI', 'XBOM'];

// Mapping pays -> région
const COUNTRY_TO_REGION = {
    'United States': 'us',
    'USA': 'us',
    'États-Unis': 'us',
    
    'Germany': 'europe',
    'France': 'europe',
    'United Kingdom': 'europe',
    'UK': 'europe',
    'Switzerland': 'europe',
    'Netherlands': 'europe',
    'Spain': 'europe',
    'Italy': 'europe',
    'Belgium': 'europe',
    'Sweden': 'europe',
    'Norway': 'europe',
    'Denmark': 'europe',
    'Finland': 'europe',
    'Austria': 'europe',
    'Ireland': 'europe',
    'Portugal': 'europe',
    'Luxembourg': 'europe',
    
    'Japan': 'asia',
    'China': 'asia',
    'Hong Kong': 'asia',
    'Singapore': 'asia',
    'South Korea': 'asia',
    'Taiwan': 'asia',
    'India': 'asia',
    'Thailand': 'asia',
    'Malaysia': 'asia',
    'Indonesia': 'asia',
    'Philippines': 'asia'
};

// Normalisation des secteurs
const SECTOR_NORMALIZATION = {
    'tech': 'Technology',
    'technologie': 'Technology',
    'information technology': 'Technology',
    'financials': 'Financial Services',
    'finance': 'Financial Services',
    'services financiers': 'Financial Services',
    'consumer discretionary': 'Consumer Cyclical',
    'consumer staples': 'Consumer Defensive',
    'health care': 'Healthcare',
    'santé': 'Healthcare',
    'industrials': 'Industrial',
    'industrie': 'Industrial',
    'materials': 'Basic Materials',
    'matériaux': 'Basic Materials',
    'utilities': 'Utilities',
    'services publics': 'Utilities',
    'energy': 'Energy',
    'énergie': 'Energy',
    'communication': 'Communication Services',
    'telecom': 'Communication Services',
    'real estate': 'Real Estate',
    'immobilier': 'Real Estate'
};

// Cache
const symbolCache = new Map();
const fxCache = new Map();

// Gestion des crédits
let creditsUsed = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function pay(cost) {
    while (true) {
        const now = Date.now();
        if (now - windowStart > WINDOW_MS) {
            creditsUsed = 0;
            windowStart = now;
            if (CONFIG.DEBUG) {
                console.log('💳 Nouvelle fenêtre de crédits');
            }
        }
        
        if (creditsUsed + cost <= CONFIG.CREDIT_LIMIT) {
            creditsUsed += cost;
            return;
        }
        
        const remaining = WINDOW_MS - (now - windowStart);
        if (CONFIG.DEBUG) {
            console.log(`⏳ Attente ${(remaining/1000).toFixed(1)}s...`);
        }
        await wait(250);
    }
}

// Conversion FX améliorée
async function fxToUSD(currency) {
    if (!currency || currency === 'USD') return 1;
    
    // GBX = pence sterling (GBP/100)
    if (currency === 'GBX') {
        const gbpRate = await fxToUSD('GBP');
        return gbpRate / 100;
    }
    
    if (fxCache.has(currency)) {
        return fxCache.get(currency);
    }
    
    try {
        await pay(1);
        const { data } = await axios.get('https://api.twelvedata.com/price', {
            params: { 
                symbol: `${currency}/USD`,
                apikey: CONFIG.API_KEY 
            }
        });
        const rate = Number(data?.price);
        if (rate > 0) {
            fxCache.set(currency, rate);
            return rate;
        }
    } catch {}
    
    // Essayer l'inverse
    try {
        const { data } = await axios.get('https://api.twelvedata.com/price', {
            params: { 
                symbol: `USD/${currency}`,
                apikey: CONFIG.API_KEY 
            }
        });
        const rate = Number(data?.price);
        if (rate > 0) {
            const inverted = 1 / rate;
            fxCache.set(currency, inverted);
            return inverted;
        }
    } catch {}
    
    console.warn(`⚠️ Taux FX ${currency}/USD non trouvé, utilise 1`);
    fxCache.set(currency, 1);
    return 1;
}

// Normaliser un secteur
function normalizeSector(sector) {
    if (!sector) return 'Unknown';
    const lower = sector.toLowerCase().trim();
    return SECTOR_NORMALIZATION[lower] || sector;
}

// Parser un CSV avec détection automatique du délimiteur
function parseCSV(csvText) {
    // Détection du délimiteur
    const firstLine = csvText.split('\n')[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    
    return csv.parse(csvText, {
        columns: true,
        delimiter: delimiter,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true
    });
}

// Charger et normaliser un CSV de stocks
async function loadStockCSV(filepath, defaultRegion) {
    try {
        const csvText = await fs.readFile(filepath, 'utf8');
        const records = parseCSV(csvText);
        
        return records.map(row => ({
            // Colonnes possibles dans différents formats
            symbol: row['Ticker'] || row['Symbol'] || row['Symbole'] || '',
            name: row['Stock'] || row['Name'] || row['Nom'] || '',
            sector: normalizeSector(row['Secteur'] || row['Sector'] || ''),
            country: row['Pays'] || row['Country'] || '',
            exchange: row['Bourse de valeurs'] || row['Exchange'] || '',
            currency: row['Devise de marché'] || row['Currency'] || row['Devise'] || 'USD',
            
            // Région déduite
            region: COUNTRY_TO_REGION[row['Pays'] || row['Country']] || defaultRegion,
            source_file: path.basename(filepath)
        })).filter(s => s.symbol); // Filtrer les lignes vides
        
    } catch (error) {
        console.error(`❌ Erreur lecture ${filepath}: ${error.message}`);
        return [];
    }
}

// Résoudre le symbole avec Twelve Data
async function resolveSymbol(stock) {
    const cacheKey = stock.symbol;
    if (symbolCache.has(cacheKey)) {
        return symbolCache.get(cacheKey);
    }
    
    try {
        // Essayer le symbole direct
        await pay(CONFIG.CREDITS.QUOTE);
        const { data } = await axios.get('https://api.twelvedata.com/quote', {
            params: { 
                symbol: stock.symbol,
                apikey: CONFIG.API_KEY 
            }
        });
        
        if (data && data.status !== 'error') {
            const result = { symbolParam: stock.symbol, quote: data };
            symbolCache.set(cacheKey, result);
            return result;
        }
        
        // Si échec, essayer avec le MIC code
        if (stock.exchange) {
            const symbolWithMic = `${stock.symbol}:${stock.exchange}`;
            const { data: data2 } = await axios.get('https://api.twelvedata.com/quote', {
                params: { 
                    symbol: symbolWithMic,
                    apikey: CONFIG.API_KEY 
                }
            });
            
            if (data2 && data2.status !== 'error') {
                const result = { symbolParam: symbolWithMic, quote: data2 };
                symbolCache.set(cacheKey, result);
                return result;
            }
        }
        
    } catch (error) {
        if (CONFIG.DEBUG) {
            console.error(`Erreur résolution ${stock.symbol}: ${error.message}`);
        }
    }
    
    return null;
}

// Calculer ADV médiane sur 30 jours
async function calculate30DayADV(symbolParam) {
    try {
        await pay(CONFIG.CREDITS.TIME_SERIES);
        
        const { data } = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol: symbolParam,
                interval: '1day',
                outputsize: CONFIG.DAYS_HISTORY,
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data.values || data.status === 'error') {
            return null;
        }
        
        const advValues = data.values.map(day => {
            const volume = Number(day.volume) || 0;
            const close = Number(day.close) || 0;
            return volume * close;
        }).filter(v => v > 0);
        
        if (advValues.length === 0) return null;
        
        // Médiane
        advValues.sort((a, b) => a - b);
        const mid = Math.floor(advValues.length / 2);
        const medianLocal = advValues.length % 2 
            ? advValues[mid] 
            : (advValues[mid - 1] + advValues[mid]) / 2;
        
        return {
            adv_median_local: medianLocal,
            days_with_data: advValues.length
        };
        
    } catch (error) {
        if (CONFIG.DEBUG) {
            console.error(`Erreur ADV: ${error.message}`);
        }
        return null;
    }
}

// Enrichir un stock avec les statistiques
async function enrichStock(symbolParam, stock) {
    try {
        await pay(CONFIG.CREDITS.STATISTICS);
        
        const { data } = await axios.get('https://api.twelvedata.com/statistics', {
            params: {
                symbol: symbolParam,
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data || data.status === 'error') {
            return {};
        }
        
        const stats = data.statistics || {};
        const valuations = stats.valuations_metrics || {};
        const dividends = stats.stock_dividends || {};
        const financials = stats.financials || {};
        
        return {
            // Métriques de valorisation
            market_cap: financials.market_capitalization || null,
            pe_ratio: valuations.pe_ratio || null,
            peg_ratio: valuations.peg_ratio || null,
            ps_ratio: valuations.ps_ratio || null,
            pb_ratio: valuations.pb_ratio || null,
            
            // Dividendes
            dividend_yield: dividends.dividend_yield || null,
            payout_ratio: dividends.payout_ratio || null,
            
            // Performance
            year_change: financials.yearly_change || null,
            ytd_change: financials.ytd_change || null,
            
            // Volatilité
            beta: valuations.beta || null,
            
            // Timestamp
            enriched_at: new Date().toISOString()
        };
        
    } catch (error) {
        if (CONFIG.DEBUG) {
            console.error(`Erreur enrichissement ${symbolParam}: ${error.message}`);
        }
        return {};
    }
}

// Traiter un stock individuellement
async function processStock(stock) {
    try {
        // Résolution du symbole
        const resolved = await resolveSymbol(stock);
        if (!resolved) {
            return { ...stock, reason: 'SYMBOL_NOT_FOUND' };
        }
        
        const { symbolParam, quote } = resolved;
        
        // Devise et FX
        const currency = quote.currency || stock.currency || 'USD';
        const fx = await fxToUSD(currency);
        
        // ADV
        const advData = await calculate30DayADV(symbolParam);
        
        let adv_median_usd;
        if (advData) {
            adv_median_usd = advData.adv_median_local * fx;
        } else {
            // Fallback avec average_volume
            const avgVolume = Number(quote.average_volume) || Number(quote.volume) || 0;
            const price = Number(quote.close) || Number(quote.previous_close) || 0;
            adv_median_usd = avgVolume * price * fx;
        }
        
        // Enrichissement avec statistiques
        const enrichment = await enrichStock(symbolParam, stock);
        
        return {
            ...stock,
            symbolParam,
            currency,
            fx_rate: fx,
            
            // Données de marché
            price: Number(quote.close) || 0,
            change: Number(quote.change) || 0,
            percent_change: Number(quote.percent_change) || 0,
            volume: Number(quote.volume) || 0,
            average_volume: Number(quote.average_volume) || 0,
            fifty_two_week_high: Number(quote.fifty_two_week.high) || null,
            fifty_two_week_low: Number(quote.fifty_two_week.low) || null,
            
            // ADV
            adv_median_usd,
            days_traded: advData?.days_with_data || 0,
            
            // Enrichissement
            ...enrichment,
            
            // Score de qualité
            data_quality_score: calculateDataQualityScore(stock, enrichment)
        };
        
    } catch (error) {
        return { ...stock, reason: 'API_ERROR', error: error.message };
    }
}

// Calculer un score de qualité des données
function calculateDataQualityScore(stock, enrichment) {
    let score = 0;
    
    // Critères et poids
    const criteria = {
        has_price: stock.price > 0 ? 20 : 0,
        has_volume: stock.volume > 0 ? 15 : 0,
        has_adv: stock.adv_median_usd > 0 ? 20 : 0,
        has_market_cap: enrichment.market_cap > 0 ? 15 : 0,
        has_pe_ratio: enrichment.pe_ratio != null ? 10 : 0,
        has_dividend: enrichment.dividend_yield != null ? 10 : 0,
        has_beta: enrichment.beta != null ? 10 : 0
    };
    
    Object.values(criteria).forEach(points => score += points);
    
    return score;
}

// Fonction principale
async function filterStocks() {
    console.log('📊 Filtrage et enrichissement des stocks multi-régions v1.0\n');
    console.log(`⚙️  Seuils ADV: US ${(CONFIG.MIN_ADV_USD_US/1e6).toFixed(1)}M$ | Europe ${(CONFIG.MIN_ADV_USD_EUROPE/1e6).toFixed(1)}M$ | Asie ${(CONFIG.MIN_ADV_USD_ASIA/1e6).toFixed(1)}M$`);
    console.log(`💳  Budget: ${CONFIG.CREDIT_LIMIT} crédits/min`);
    console.log(`📂  Dossier de sortie: ${OUT_DIR}\n`);
    
    // Créer le dossier de sortie
    await fs.mkdir(OUT_DIR, { recursive: true });
    
    // Charger les 3 CSV
    console.log('📁 Chargement des fichiers CSV...');
    const [usStocks, europeStocks, asiaStocks] = await Promise.all([
        loadStockCSV('data/Actions_US.csv', 'us'),
        loadStockCSV('data/Actions_Europe.csv', 'europe'),
        loadStockCSV('data/Actions_Asie.csv', 'asia')
    ]);
    
    console.log(`  US: ${usStocks.length} stocks`);
    console.log(`  Europe: ${europeStocks.length} stocks`);
    console.log(`  Asie: ${asiaStocks.length} stocks\n`);
    
    // Résultats
    const results = {
        us: [],
        europe: [],
        asia: [],
        rejected: [],
        stats: {
            total_us: usStocks.length,
            total_europe: europeStocks.length,
            total_asia: asiaStocks.length,
            timestamp: new Date().toISOString(),
            start_time: Date.now()
        }
    };
    
    // Combiner tous les stocks
    const allStocks = [
        ...usStocks.map(s => ({ ...s, source_region: 'us' })),
        ...europeStocks.map(s => ({ ...s, source_region: 'europe' })),
        ...asiaStocks.map(s => ({ ...s, source_region: 'asia' }))
    ];
    
    console.log(`🔍 Analyse de ${allStocks.length} stocks...\n`);
    
    // Traiter par batch
    for (let i = 0; i < allStocks.length; i += CONFIG.CHUNK_SIZE) {
        const batch = allStocks.slice(i, i + CONFIG.CHUNK_SIZE);
        console.log(`📦 Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, allStocks.length)}`);
        
        const batchPromises = batch.map(stock => processStock(stock));
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(result => {
            if (result.symbolParam && result.adv_median_usd !== undefined) {
                // Déterminer le seuil selon la région
                let threshold;
                switch (result.source_region) {
                    case 'us': threshold = CONFIG.MIN_ADV_USD_US; break;
                    case 'europe': threshold = CONFIG.MIN_ADV_USD_EUROPE; break;
                    case 'asia': threshold = CONFIG.MIN_ADV_USD_ASIA; break;
                    default: threshold = CONFIG.MIN_ADV_USD_EUROPE;
                }
                
                const passed = result.adv_median_usd >= threshold;
                const advInfo = `${(result.adv_median_usd/1e6).toFixed(2)}M$`;
                
                console.log(`  ${result.symbolParam} | ADV: ${advInfo} | ${passed ? '✅ PASS' : '❌ FAIL'}`);
                
                if (passed) {
                    results[result.source_region].push(result);
                } else {
                    results.rejected.push({ ...result, failed: ['liquidity'] });
                }
            } else if (result.reason) {
                console.log(`  ${result.symbol} | ❌ ${result.reason}`);
                results.rejected.push(result);
            }
        });
    }
    
    // Statistiques finales
    const elapsedTime = Date.now() - results.stats.start_time;
    results.stats.elapsed_seconds = Math.round(elapsedTime / 1000);
    results.stats.us_retained = results.us.length;
    results.stats.europe_retained = results.europe.length;
    results.stats.asia_retained = results.asia.length;
    results.stats.total_retained = results.us.length + results.europe.length + results.asia.length;
    results.stats.rejected_count = results.rejected.length;
    
    // Statistiques de qualité
    results.stats.data_quality = {
        avg_score_us: Math.round(results.us.reduce((acc, s) => acc + (s.data_quality_score || 0), 0) / (results.us.length || 1)),
        avg_score_europe: Math.round(results.europe.reduce((acc, s) => acc + (s.data_quality_score || 0), 0) / (results.europe.length || 1)),
        avg_score_asia: Math.round(results.asia.reduce((acc, s) => acc + (s.data_quality_score || 0), 0) / (results.asia.length || 1)),
        with_pe_ratio: [...results.us, ...results.europe, ...results.asia].filter(s => s.pe_ratio != null).length,
        with_dividend: [...results.us, ...results.europe, ...results.asia].filter(s => s.dividend_yield != null).length
    };
    
    // Sauvegarder les résultats complets
    const filteredPath = path.join(OUT_DIR, 'stocks_filtered_advanced.json');
    await fs.writeFile(filteredPath, JSON.stringify(results, null, 2));
    
    // CSV par région
    for (const region of ['us', 'europe', 'asia']) {
        const csvHeader = [
            'symbol','name','sector','country','exchange','currency',
            'price','change','percent_change','volume','average_volume',
            'adv_median_usd','market_cap','pe_ratio','dividend_yield',
            'beta','year_change','data_quality_score'
        ].join(',') + '\n';
        
        const csvRows = results[region].map(s => [
            s.symbol, `"${s.name}"`, s.sector, s.country, s.exchange, s.currency,
            s.price || '', s.change || '', s.percent_change || '',
            s.volume || '', s.average_volume || '',
            Math.round(s.adv_median_usd) || '',
            s.market_cap || '', s.pe_ratio || '', s.dividend_yield || '',
            s.beta || '', s.year_change || '', s.data_quality_score || ''
        ].join(',')).join('\n');
        
        const csvPath = path.join(OUT_DIR, `stocks_${region}_filtered.csv`);
        await fs.writeFile(csvPath, csvHeader + csvRows);
        console.log(`📝 CSV ${region}: ${results[region].length} stocks → ${csvPath}`);
    }
    
    // Weekly snapshot JSON
    const weekly = {
        timestamp: new Date().toISOString(),
        us: results.us.map(s => ({
            symbol: s.symbol,
            name: s.name,
            sector: s.sector,
            price: s.price,
            percent_change: s.percent_change,
            adv_usd: s.adv_median_usd,
            market_cap: s.market_cap,
            pe_ratio: s.pe_ratio
        })),
        europe: results.europe.map(s => ({
            symbol: s.symbol,
            name: s.name,
            sector: s.sector,
            price: s.price,
            percent_change: s.percent_change,
            adv_usd: s.adv_median_usd,
            market_cap: s.market_cap,
            pe_ratio: s.pe_ratio
        })),
        asia: results.asia.map(s => ({
            symbol: s.symbol,
            name: s.name,
            sector: s.sector,
            price: s.price,
            percent_change: s.percent_change,
            adv_usd: s.adv_median_usd,
            market_cap: s.market_cap,
            pe_ratio: s.pe_ratio
        })),
        stats: results.stats
    };
    
    const weeklyPath = path.join(OUT_DIR, 'stocks_weekly_snapshot.json');
    await fs.writeFile(weeklyPath, JSON.stringify(weekly, null, 2));
    
    // Top performers global
    const allFiltered = [...results.us, ...results.europe, ...results.asia];
    const topPerformers = {
        gainers: allFiltered
            .filter(s => s.percent_change > 0)
            .sort((a, b) => b.percent_change - a.percent_change)
            .slice(0, 10),
        losers: allFiltered
            .filter(s => s.percent_change < 0)
            .sort((a, b) => a.percent_change - b.percent_change)
            .slice(0, 10),
        most_active: allFiltered
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 10)
    };
    
    const performersPath = path.join(OUT_DIR, 'stocks_top_performers.json');
    await fs.writeFile(performersPath, JSON.stringify(topPerformers, null, 2));
    
    // Résumé
    console.log('\n📊 RÉSUMÉ:');
    console.log(`US: ${results.us.length}/${usStocks.length} retenus`);
    console.log(`Europe: ${results.europe.length}/${europeStocks.length} retenus`);
    console.log(`Asie: ${results.asia.length}/${asiaStocks.length} retenus`);
    console.log(`Total: ${results.stats.total_retained}/${allStocks.length}`);
    console.log(`Rejetés: ${results.rejected.length}`);
    console.log(`Temps total: ${results.stats.elapsed_seconds}s`);
    
    console.log('\n📊 Qualité des données:');
    console.log(`Score moyen US: ${results.stats.data_quality.avg_score_us}/100`);
    console.log(`Score moyen Europe: ${results.stats.data_quality.avg_score_europe}/100`);
    console.log(`Score moyen Asie: ${results.stats.data_quality.avg_score_asia}/100`);
    
    console.log(`\n✅ Résultats: ${filteredPath}`);
    console.log(`✅ Snapshot: ${weeklyPath}`);
    console.log(`✅ Top performers: ${performersPath}`);
    
    // Pour GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::set-output name=stocks_us::${results.us.length}`);
        console.log(`::set-output name=stocks_europe::${results.europe.length}`);
        console.log(`::set-output name=stocks_asia::${results.asia.length}`);
    }
}

// Vérifier la clé API
if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

// Lancer
filterStocks().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
