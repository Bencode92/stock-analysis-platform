// stock-data-enricher.js
// Enrichissement des stocks multi-régions avec Twelve Data API
// Basé sur la logique etf-advanced-filter.js
// v2.0 - Intégration ROE/D/E depuis fundamentals_cache.json

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
    },
    
    // Cache fondamentaux
    FUNDAMENTALS_CACHE_FILE: 'data/fundamentals_cache.json'
};

// ═══════════════════════════════════════════════════════════════════════════
// CACHE FONDAMENTAUX (ROE, D/E)
// ═══════════════════════════════════════════════════════════════════════════

let fundamentalsCache = { data: {} };

async function loadFundamentalsCache() {
    try {
        const txt = await fs.readFile(CONFIG.FUNDAMENTALS_CACHE_FILE, 'utf8');
        fundamentalsCache = JSON.parse(txt);
        const count = Object.keys(fundamentalsCache.data || {}).length;
        console.log(`📦 Cache fondamentaux chargé: ${count} stocks avec ROE/D/E`);
        return fundamentalsCache;
    } catch (error) {
        console.warn(`⚠️ Cache fondamentaux non trouvé: ${error.message}`);
        fundamentalsCache = { data: {} };
        return fundamentalsCache;
    }
}

/**
 * Calcul simplifié du score Buffett (0-45 points sur ROE + D/E)
 * Score normalisé ensuite sur 100
 */
function calculateBuffettScore(roe, de_ratio) {
    if (roe == null && de_ratio == null) return null;
    
    let score = 0;
    let maxPossible = 0;
    
    // ROE (max 25 pts)
    if (roe !== null) {
        maxPossible += 25;
        if (roe >= 20) score += 25;
        else if (roe >= 15) score += 20;
        else if (roe >= 10) score += 12;
        else if (roe > 0) score += 5;
        // ROE négatif = 0 points
    }
    
    // D/E (max 20 pts)
    if (de_ratio !== null) {
        maxPossible += 20;
        if (de_ratio < 0) {
            // Equity négative = problème
            score += 0;
        } else if (de_ratio <= 0.5) {
            score += 20;
        } else if (de_ratio <= 1.0) {
            score += 15;
        } else if (de_ratio <= 2.0) {
            score += 8;
        } else if (de_ratio <= 3.0) {
            score += 3;
        }
        // D/E > 3 = 0 points
    }
    
    // Normaliser sur 100
    if (maxPossible === 0) return null;
    return Math.round((score / maxPossible) * 100);
}

function getBuffettGrade(score) {
    if (score == null) return null;
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    return 'D';
}

// ═══════════════════════════════════════════════════════════════════════════

// Mapping régions
const REGION_MAPPING = {
    // US
    'United States': 'us',
    'USA': 'us',
    'États-Unis': 'us',
    'Etats-Unis': 'us',
    
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
            currency: row['Devise de marché'] || row['Currency'] || 'USD',
            // Récupérer ROE/D/E si déjà dans le CSV
            roe_csv: parseFloat(row['roe']) || null,
            de_ratio_csv: parseFloat(row['de_ratio']) || null
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

// Enrichir un stock avec données Twelve Data + fondamentaux cache
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
        
        // 4. Récupérer ROE/D/E depuis le cache fondamentaux
        const cached = fundamentalsCache.data[stock.ticker] || {};
        const roe = cached.roe ?? stock.roe_csv ?? null;
        const de_ratio = cached.de_ratio ?? stock.de_ratio_csv ?? null;
        
        // 5. Calculer score Buffett
        const buffett_score = calculateBuffettScore(roe, de_ratio);
        const buffett_grade = getBuffettGrade(buffett_score);
        
        // Compiler les données enrichies
        return {
            ...stock,
            // Prix et performance
            price: Number(quote.close) || 0,
            change: Number(quote.change) || 0,
            changePercent: Number(quote.percent_change) || 0,
            volume: Number(quote.volume) || 0,
            averageVolume: Number(quote.average_volume) || 0,
            
            // Métriques valuation
            marketCap: Number(quote.market_capitalization) || 0,
            pe_ratio: Number(stats?.statistics?.valuations_metrics?.pe_ratio) || null,
            peg_ratio: Number(stats?.statistics?.valuations_metrics?.peg_ratio) || null,
            dividend_yield: Number(stats?.statistics?.stock_dividends?.dividend_yield) || null,
            
            // ═══════════════════════════════════════════════════════════════
            // FONDAMENTAUX BUFFETT (depuis cache)
            // ═══════════════════════════════════════════════════════════════
            roe: roe,
            de_ratio: de_ratio,
            buffett_score: buffett_score,
            buffett_grade: buffett_grade,
            
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
        
        // Même en cas d'erreur, essayer de récupérer ROE/D/E du cache
        const cached = fundamentalsCache.data[stock.ticker] || {};
        const roe = cached.roe ?? stock.roe_csv ?? null;
        const de_ratio = cached.de_ratio ?? stock.de_ratio_csv ?? null;
        
        return {
            ...stock,
            roe: roe,
            de_ratio: de_ratio,
            buffett_score: calculateBuffettScore(roe, de_ratio),
            buffett_grade: getBuffettGrade(calculateBuffettScore(roe, de_ratio)),
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // CHARGER LE CACHE FONDAMENTAUX
    // ═══════════════════════════════════════════════════════════════════════
    await loadFundamentalsCache();
    
    // Charger les 3 fichiers CSV
    console.log('\n📁 Chargement des fichiers CSV...');
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
                    const roeStr = stock.roe !== null ? `ROE=${stock.roe.toFixed(1)}%` : 'ROE=N/A';
                    const deStr = stock.de_ratio !== null ? `D/E=${stock.de_ratio.toFixed(2)}` : 'D/E=N/A';
                    const gradeStr = stock.buffett_grade || '-';
                    console.log(`  ✅ ${stock.ticker}: ADV ${(stock.adv_median_usd/1e6).toFixed(2)}M$ | ${roeStr} | ${deStr} | Grade ${gradeStr}`);
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
        
        // CSV filtré par région (avec ROE/D/E)
        const csvPath = path.join(OUT_DIR, `stocks_${region}_filtered.csv`);
        const csvHeader = [
            'Ticker', 'Name', 'Sector', 'Country', 'Exchange',
            'Price', 'Change%', 'Volume', 'MarketCap', 'ADV_USD',
            'PE_Ratio', 'Dividend_Yield',
            'ROE', 'DE_Ratio', 'Buffett_Score', 'Buffett_Grade'
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
            s.dividend_yield ? s.dividend_yield.toFixed(2) : '',
            s.roe !== null ? s.roe.toFixed(2) : '',
            s.de_ratio !== null ? s.de_ratio.toFixed(2) : '',
            s.buffett_score !== null ? s.buffett_score : '',
            s.buffett_grade || ''
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
                rejected: results.us.rejected.length,
                with_roe: results.us.filtered.filter(s => s.roe !== null).length,
                with_de: results.us.filtered.filter(s => s.de_ratio !== null).length
            },
            europe: {
                total: results.europe.stocks.length,
                filtered: results.europe.filtered.length,
                rejected: results.europe.rejected.length,
                with_roe: results.europe.filtered.filter(s => s.roe !== null).length,
                with_de: results.europe.filtered.filter(s => s.de_ratio !== null).length
            },
            asia: {
                total: results.asia.stocks.length,
                filtered: results.asia.filtered.length,
                rejected: results.asia.rejected.length,
                with_roe: results.asia.filtered.filter(s => s.roe !== null).length,
                with_de: results.asia.filtered.filter(s => s.de_ratio !== null).length
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
                    change: s.changePercent,
                    roe: s.roe,
                    de_ratio: s.de_ratio,
                    buffett_grade: s.buffett_grade
                })),
            losers: [...results.us.filtered, ...results.europe.filtered, ...results.asia.filtered]
                .filter(s => s.changePercent < 0)
                .sort((a, b) => a.changePercent - b.changePercent)
                .slice(0, 10)
                .map(s => ({
                    ticker: s.ticker,
                    name: s.name,
                    region: s.sourceRegion,
                    change: s.changePercent,
                    roe: s.roe,
                    de_ratio: s.de_ratio,
                    buffett_grade: s.buffett_grade
                })),
            // TOP 10 par score Buffett
            buffett_quality: [...results.us.filtered, ...results.europe.filtered, ...results.asia.filtered]
                .filter(s => s.buffett_score !== null)
                .sort((a, b) => b.buffett_score - a.buffett_score)
                .slice(0, 10)
                .map(s => ({
                    ticker: s.ticker,
                    name: s.name,
                    region: s.sourceRegion,
                    buffett_score: s.buffett_score,
                    buffett_grade: s.buffett_grade,
                    roe: s.roe,
                    de_ratio: s.de_ratio
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
    
    // Stats Buffett
    const allFiltered = [...results.us.filtered, ...results.europe.filtered, ...results.asia.filtered];
    const withROE = allFiltered.filter(s => s.roe !== null).length;
    const withDE = allFiltered.filter(s => s.de_ratio !== null).length;
    const withScore = allFiltered.filter(s => s.buffett_score !== null).length;
    
    console.log('\n📈 FONDAMENTAUX BUFFETT:');
    console.log(`  Avec ROE: ${withROE}/${allFiltered.length} (${(100*withROE/allFiltered.length).toFixed(1)}%)`);
    console.log(`  Avec D/E: ${withDE}/${allFiltered.length} (${(100*withDE/allFiltered.length).toFixed(1)}%)`);
    console.log(`  Avec Score: ${withScore}/${allFiltered.length} (${(100*withScore/allFiltered.length).toFixed(1)}%)`);
    
    // Distribution des grades
    const gradeA = allFiltered.filter(s => s.buffett_grade === 'A').length;
    const gradeB = allFiltered.filter(s => s.buffett_grade === 'B').length;
    const gradeC = allFiltered.filter(s => s.buffett_grade === 'C').length;
    const gradeD = allFiltered.filter(s => s.buffett_grade === 'D').length;
    
    console.log('\n🏆 DISTRIBUTION GRADES BUFFETT:');
    console.log(`  Grade A (≥80): ${gradeA} stocks`);
    console.log(`  Grade B (≥60): ${gradeB} stocks`);
    console.log(`  Grade C (≥40): ${gradeC} stocks`);
    console.log(`  Grade D (<40): ${gradeD} stocks`);
    
    const totalFiltered = results.us.filtered.length + results.europe.filtered.length + results.asia.filtered.length;
    const totalStocks = allStocks.length;
    console.log(`\n  Total: ${totalFiltered}/${totalStocks} stocks retenus`);
    
    // Pour GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::set-output name=stocks_us::${results.us.filtered.length}`);
        console.log(`::set-output name=stocks_europe::${results.europe.filtered.length}`);
        console.log(`::set-output name=stocks_asia::${results.asia.filtered.length}`);
        console.log(`::set-output name=buffett_with_score::${withScore}`);
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
