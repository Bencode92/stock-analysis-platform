// stock-data-enricher.js
// Enrichissement des stocks multi-régions avec Twelve Data API
// Basé sur la logique etf-advanced-filter.js

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    MIN_ADV_USD: parseInt(process.env.MIN_ADV_USD) || 500000, // 500k$ par défaut
    DEBUG: process.env.DEBUG === '1',
    
    // Config API
    DAYS_HISTORY: 30,
    CHUNK_SIZE: 8,
    CREDIT_LIMIT: 800, // Plus conservateur pour les stocks
    CREDITS: {
        TIME_SERIES: 5,
        QUOTE: 1,
        PROFILE: 15,
        STATISTICS: 25
    }
};

// Mapping régions
const REGION_MAPPING = {
    // US
    'United States': 'us',
    'USA': 'us',
    'États-Unis': 'us',
    
    // Europe
    'Germany': 'europe',
    'France': 'europe',
    'United Kingdom': 'europe',
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
    'Luxembourg': 'europe',
    
    // Asie
    'Japan': 'asia',
    'China': 'asia',
    'Hong Kong': 'asia',
    'Singapore': 'asia',
    'South Korea': 'asia',
    'Taiwan': 'asia',
    'India': 'asia',
    'Thailand': 'asia',
    'Malaysia': 'asia',
    'Indonesia': 'asia'
};

// Cache pour les taux de change
const fxCache = new Map();

// Gestion des crédits API
let creditsUsed = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function payCredits(cost) {
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

// Conversion des devises en USD
async function fxToUSD(currency) {
    if (!currency || currency === 'USD') return 1;
    
    // Handle pence (GBX = GBP/100)
    if (currency === 'GBX') {
        const gbpRate = await fxToUSD('GBP');
        return gbpRate / 100;
    }
    
    if (fxCache.has(currency)) {
        return fxCache.get(currency);
    }
    
    try {
        await payCredits(1);
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

// Charger un fichier CSV
async function loadCSV(filepath) {
    try {
        const csvData = await fs.readFile(filepath, 'utf8');
        const records = csv.parse(csvData, { 
            columns: true,
            delimiter: '\t', // Tab-separated
            skip_empty_lines: true
        });
        
        return records.map(row => ({
            ticker: row['Ticker'] || row['Symbol'],
            name: row['Stock'] || row['Name'],
            sector: row['Secteur'] || row['Sector'],
            country: row['Pays'] || row['Country'],
            exchange: row['Bourse de valeurs'] || row['Exchange'],
            currency: row['Devise de marché'] || row['Currency'] || 'USD'
        }));
    } catch (error) {
        console.error(`Erreur lecture ${filepath}:`, error);
        return [];
    }
}

// Calculer ADV médiane sur 30 jours
async function calculate30DayADV(symbol) {
    try {
        await payCredits(CONFIG.CREDITS.TIME_SERIES);
        
        const { data } = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol: symbol,
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
        
        // Calculer médiane
        advValues.sort((a, b) => a - b);
        const mid = Math.floor(advValues.length / 2);
        const median = advValues.length % 2 
            ? advValues[mid] 
            : (advValues[mid - 1] + advValues[mid]) / 2;
        
        return {
            adv_median_local: median,
            days_with_data: advValues.length
        };
        
    } catch (error) {
        if (CONFIG.DEBUG) {
            console.error(`Erreur ADV ${symbol}: ${error.message}`);
        }
        return null;
    }
}

// Enrichir un stock avec données Twelve Data
async function enrichStock(stock) {
    try {
        // 1. Quote pour prix actuel
        await payCredits(CONFIG.CREDITS.QUOTE);
        const quoteRes = await axios.get('https://api.twelvedata.com/quote', {
            params: { 
                symbol: stock.ticker,
                apikey: CONFIG.API_KEY 
            }
        });
        
        const quote = quoteRes.data;
        if (quote.status === 'error') {
            throw new Error(quote.message || 'Quote error');
        }
        
        // 2. Statistiques financières
        await payCredits(CONFIG.CREDITS.STATISTICS);
        const statsRes = await axios.get('https://api.twelvedata.com/statistics', {
            params: { 
                symbol: stock.ticker,
                apikey: CONFIG.API_KEY 
            }
        });
        
        const stats = statsRes.data;
        
        // 3. ADV
        const advData = await calculate30DayADV(stock.ticker);
        const fx = await fxToUSD(stock.currency);
        
        let adv_median_usd = 0;
        if (advData) {
            adv_median_usd = advData.adv_median_local * fx;
        } else {
            // Fallback avec average_volume
            const avgVolume = Number(quote.average_volume) || 0;
            const price = Number(quote.close) || 0;
            adv_median_usd = avgVolume * price * fx;
        }
        
        // Compiler les données enrichies
        return {
            ...stock,
            // Prix et performance
            price: Number(quote.close) || 0,
            change: Number(quote.change) || 0,
            changePercent: Number(quote.percent_change) || 0,
            volume: Number(quote.volume) || 0,
            averageVolume: Number(quote.average_volume) || 0,
            
            // Métriques
            marketCap: Number(quote.market_capitalization) || 0,
            pe_ratio: Number(stats?.statistics?.valuations_metrics?.pe_ratio) || null,
            peg_ratio: Number(stats?.statistics?.valuations_metrics?.peg_ratio) || null,
            dividend_yield: Number(stats?.statistics?.stock_dividends?.dividend_yield) || null,
            
            // ADV
            adv_median_usd: adv_median_usd,
            days_traded: advData?.days_with_data || 0,
            fx_rate: fx,
            
            // Région déduite
            region: REGION_MAPPING[stock.country] || 'other',
            
            // Timestamp
            enriched_at: new Date().toISOString()
        };
        
    } catch (error) {
        console.error(`❌ Erreur enrichissement ${stock.ticker}: ${error.message}`);
        return {
            ...stock,
            error: error.message,
            enriched_at: new Date().toISOString()
        };
    }
}

// Fonction principale
async function enrichStocks() {
    console.log('📊 Enrichissement des stocks multi-régions avec Twelve Data\n');
    console.log(`⚙️  Seuil ADV: ${(CONFIG.MIN_ADV_USD/1e6).toFixed(1)}M$`);
    console.log(`💳  Budget: ${CONFIG.CREDIT_LIMIT} crédits/min`);
    console.log(`📂  Dossier de sortie: ${OUT_DIR}\n`);
    
    // S'assurer que le dossier existe
    await fs.mkdir(OUT_DIR, { recursive: true });
    
    // Charger les 3 fichiers CSV
    console.log('📁 Chargement des fichiers CSV...');
    const [usStocks, europeStocks, asiaStocks] = await Promise.all([
        loadCSV('data/Actions_US.csv'),
        loadCSV('data/Actions_Europe.csv'),
        loadCSV('data/Actions_Asie.csv')
    ]);
    
    console.log(`  US: ${usStocks.length} stocks`);
    console.log(`  Europe: ${europeStocks.length} stocks`);
    console.log(`  Asie: ${asiaStocks.length} stocks\n`);
    
    // Résultats par région
    const results = {
        us: { stocks: [], filtered: [], rejected: [] },
        europe: { stocks: [], filtered: [], rejected: [] },
        asia: { stocks: [], filtered: [], rejected: [] }
    };
    
    // Traiter chaque région
    const allStocks = [
        ...usStocks.map(s => ({...s, sourceRegion: 'us'})),
        ...europeStocks.map(s => ({...s, sourceRegion: 'europe'})),
        ...asiaStocks.map(s => ({...s, sourceRegion: 'asia'}))
    ];
    
    console.log('🔄 Enrichissement des stocks...\n');
    
    // Traiter par batch
    for (let i = 0; i < allStocks.length; i += CONFIG.CHUNK_SIZE) {
        const batch = allStocks.slice(i, i + CONFIG.CHUNK_SIZE);
        const batchNum = Math.floor(i/CONFIG.CHUNK_SIZE) + 1;
        const totalBatches = Math.ceil(allStocks.length/CONFIG.CHUNK_SIZE);
        
        console.log(`📦 Batch ${batchNum}/${totalBatches}: ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, allStocks.length)}`);
        
        const enrichedBatch = await Promise.all(
            batch.map(stock => enrichStock(stock))
        );
        
        // Classer les résultats
        enrichedBatch.forEach(stock => {
            const region = stock.sourceRegion;
            
            if (!stock.error) {
                results[region].stocks.push(stock);
                
                // Filtrer par ADV
                if (stock.adv_median_usd >= CONFIG.MIN_ADV_USD) {
                    results[region].filtered.push(stock);
                    console.log(`  ✅ ${stock.ticker}: ADV ${(stock.adv_median_usd/1e6).toFixed(2)}M$`);
                } else {
                    results[region].rejected.push({...stock, reason: 'LOW_LIQUIDITY'});
                    console.log(`  ❌ ${stock.ticker}: ADV ${(stock.adv_median_usd/1e6).toFixed(2)}M$ < seuil`);
                }
            } else {
                results[region].rejected.push(stock);
                console.log(`  ⚠️ ${stock.ticker}: ${stock.error}`);
            }
        });
    }
    
    // Sauvegarder les résultats
    console.log('\n💾 Sauvegarde des résultats...');
    
    // JSON enrichis par région
    for (const region of ['us', 'europe', 'asia']) {
        const jsonPath = path.join(OUT_DIR, `stocks_${region}_enriched.json`);
        await fs.writeFile(jsonPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            region: region,
            total: results[region].stocks.length,
            filtered: results[region].filtered.length,
            rejected: results[region].rejected.length,
            stocks: results[region].filtered
        }, null, 2));
        console.log(`  📝 ${jsonPath}: ${results[region].filtered.length} stocks`);
        
        // CSV filtré par région
        const csvPath = path.join(OUT_DIR, `stocks_${region}_filtered.csv`);
        const csvHeader = [
            'Ticker', 'Name', 'Sector', 'Country', 'Exchange',
            'Price', 'Change%', 'Volume', 'MarketCap', 'ADV_USD',
            'PE_Ratio', 'Dividend_Yield'
        ].join('\t') + '\n';
        
        const csvRows = results[region].filtered.map(s => [
            s.ticker,
            s.name,
            s.sector,
            s.country,
            s.exchange,
            s.price.toFixed(2),
            s.changePercent.toFixed(2),
            s.volume,
            s.marketCap,
            Math.round(s.adv_median_usd),
            s.pe_ratio || '',
            s.dividend_yield ? s.dividend_yield.toFixed(2) : ''
        ].join('\t')).join('\n');
        
        await fs.writeFile(csvPath, csvHeader + csvRows);
        console.log(`  📝 ${csvPath}`);
    }
    
    // Snapshot global
    const globalSnapshot = {
        timestamp: new Date().toISOString(),
        stats: {
            us: {
                total: results.us.stocks.length,
                filtered: results.us.filtered.length,
                rejected: results.us.rejected.length
            },
            europe: {
                total: results.europe.stocks.length,
                filtered: results.europe.filtered.length,
                rejected: results.europe.rejected.length
            },
            asia: {
                total: results.asia.stocks.length,
                filtered: results.asia.filtered.length,
                rejected: results.asia.rejected.length
            }
        },
        top_performers: {
            gainers: [...results.us.filtered, ...results.europe.filtered, ...results.asia.filtered]
                .filter(s => s.changePercent > 0)
                .sort((a, b) => b.changePercent - a.changePercent)
                .slice(0, 10)
                .map(s => ({
                    ticker: s.ticker,
                    name: s.name,
                    region: s.sourceRegion,
                    change: s.changePercent
                })),
            losers: [...results.us.filtered, ...results.europe.filtered, ...results.asia.filtered]
                .filter(s => s.changePercent < 0)
                .sort((a, b) => a.changePercent - b.changePercent)
                .slice(0, 10)
                .map(s => ({
                    ticker: s.ticker,
                    name: s.name,
                    region: s.sourceRegion,
                    change: s.changePercent
                }))
        }
    };
    
    const snapshotPath = path.join(OUT_DIR, 'stocks_global_snapshot.json');
    await fs.writeFile(snapshotPath, JSON.stringify(globalSnapshot, null, 2));
    console.log(`  📝 ${snapshotPath}`);
    
    // Résumé
    console.log('\n📊 RÉSUMÉ:');
    console.log(`  US: ${results.us.filtered.length}/${results.us.stocks.length} retenus`);
    console.log(`  Europe: ${results.europe.filtered.length}/${results.europe.stocks.length} retenus`);
    console.log(`  Asie: ${results.asia.filtered.length}/${results.asia.stocks.length} retenus`);
    
    const totalFiltered = results.us.filtered.length + results.europe.filtered.length + results.asia.filtered.length;
    const totalStocks = allStocks.length;
    console.log(`\n  Total: ${totalFiltered}/${totalStocks} stocks retenus`);
    
    // Pour GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::set-output name=stocks_us::${results.us.filtered.length}`);
        console.log(`::set-output name=stocks_europe::${results.europe.filtered.length}`);
        console.log(`::set-output name=stocks_asia::${results.asia.filtered.length}`);
    }
    
    console.log('\n✅ Enrichissement terminé avec succès!');
}

// Vérifier la clé API
if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

// Lancer
enrichStocks().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
