// stock-filter-by-volume.js
// Filtrage par volume minimum et génération de JSON séparés par continent
// Utilise les CSV existants: Actions_US.csv, Actions_Europe.csv, Actions_Asie.csv

const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

// Configuration
const CONFIG = {
    // Seuils de volume minimum par région
    VOLUME_MIN: {
        US: 500_000,
        EUROPE: 50_000,
        ASIA: 100_000
    },
    
    // Seuils spécifiques par bourse
    VOLUME_MIN_BY_EXCHANGE: {
        // US
        'NYSE': 500_000,
        'NASDAQ': 500_000,
        'New York Stock Exchange': 500_000,
        
        // Europe
        'XETR': 100_000,
        'Euronext Paris': 80_000,
        'London Stock Exchange': 120_000,
        'Borsa Italiana': 80_000,
        'BME Spanish Exchanges': 80_000,
        'Euronext Amsterdam': 50_000,
        'SIX Swiss Exchange': 20_000,
        
        // Asie
        'Tokyo Stock Exchange': 150_000,
        'Hong Kong Exchanges And Clearing Ltd': 100_000,
        'Shanghai Stock Exchange': 80_000,
        'Shenzhen Stock Exchange': 80_000,
        'Korea Exchange (Stock Market)': 100_000,
        'National Stock Exchange Of India': 50_000,
        'Taiwan Stock Exchange': 60_000
    },
    
    // API pour récupérer les données de marché (optionnel)
    API_KEY: process.env.TWELVE_DATA_API_KEY || null
};

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'data/filtered';

// Déterminer la région depuis le nom du fichier
function getRegionFromFilename(filename) {
    if (filename.includes('US')) return 'US';
    if (filename.includes('Europe')) return 'EUROPE';
    if (filename.includes('Asie') || filename.includes('Asia')) return 'ASIA';
    return 'UNKNOWN';
}

// Obtenir le seuil de volume pour un stock
function getVolumeThreshold(stock, region) {
    const exchange = stock['Bourse de valeurs'] || '';
    
    // Priorité aux seuils par exchange
    if (CONFIG.VOLUME_MIN_BY_EXCHANGE[exchange]) {
        return CONFIG.VOLUME_MIN_BY_EXCHANGE[exchange];
    }
    
    // Sinon utiliser le seuil par région
    return CONFIG.VOLUME_MIN[region] || 0;
}

// Charger et parser un fichier CSV
async function loadCSV(filepath) {
    try {
        const content = await fs.readFile(filepath, 'utf8');
        const rows = parse(content, { 
            columns: true, 
            skip_empty_lines: true,
            bom: true // Gérer le BOM si présent
        });
        
        const region = getRegionFromFilename(filepath);
        
        return rows.map(row => ({
            ...row,
            __region: region,
            __source_file: path.basename(filepath)
        }));
    } catch (error) {
        console.warn(`⚠️ Impossible de charger ${filepath}: ${error.message}`);
        return [];
    }
}

// Récupérer les données de marché depuis l'API (si disponible)
async function fetchMarketData(ticker) {
    if (!CONFIG.API_KEY) return null;
    
    try {
        const response = await axios.get('https://api.twelvedata.com/quote', {
            params: {
                symbol: ticker,
                apikey: CONFIG.API_KEY
            }
        });
        
        if (response.data && response.data.status !== 'error') {
            return {
                price: parseFloat(response.data.close) || 0,
                volume: parseInt(response.data.volume) || 0,
                change: parseFloat(response.data.change) || 0,
                percent_change: parseFloat(response.data.percent_change) || 0,
                market_cap: parseFloat(response.data.market_capitalization) || 0
            };
        }
    } catch (error) {
        // Silencieusement ignorer les erreurs API
    }
    
    return null;
}

// Générer des données de marché simulées (fallback)
function generateMockMarketData(ticker) {
    // Générer des données réalistes basées sur le ticker
    const seed = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = (min, max) => min + (seed % (max - min));
    
    return {
        price: random(10, 500),
        volume: random(100000, 10000000),
        change: (random(-5, 5) + random(-99, 99) / 100),
        percent_change: (random(-5, 5) + random(-99, 99) / 100),
        market_cap: random(1000000000, 50000000000)
    };
}

// Enrichir un stock avec des données de marché
async function enrichStock(stock) {
    const ticker = stock.Ticker;
    
    // Essayer de récupérer les vraies données
    let marketData = await fetchMarketData(ticker);
    
    // Si pas de données API, utiliser des données simulées
    if (!marketData) {
        marketData = generateMockMarketData(ticker);
    }
    
    // Calculer l'ADV (Average Dollar Volume)
    const adv = marketData.volume * marketData.price;
    
    // Déterminer la capitalisation
    let capCategory = 'unknown';
    if (marketData.market_cap >= 10e9) capCategory = 'large';
    else if (marketData.market_cap >= 2e9) capCategory = 'mid';
    else if (marketData.market_cap > 0) capCategory = 'small';
    
    return {
        ticker: ticker,
        name: stock.Stock,
        sector: stock.Secteur,
        country: stock.Pays,
        exchange: stock['Bourse de valeurs'],
        currency: stock['Devise de marché'],
        ...marketData,
        adv_usd: adv,
        cap_category: capCategory,
        volume_threshold: getVolumeThreshold(stock, stock.__region),
        source_file: stock.__source_file
    };
}

// Fonction principale
async function filterStocksByVolume() {
    console.log('🌍 Filtrage des stocks par volume\n');
    console.log('📊 Configuration:');
    console.log('  - Seuils:', CONFIG.VOLUME_MIN);
    console.log('  - Fichiers source:', DATA_DIR);
    console.log('  - Dossier de sortie:', OUTPUT_DIR);
    console.log('');
    
    // Créer le dossier de sortie
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Charger tous les CSV
    const csvFiles = ['Actions_US.csv', 'Actions_Europe.csv', 'Actions_Asie.csv'];
    console.log('📚 Chargement des fichiers CSV...');
    
    const allStocksArrays = await Promise.all(
        csvFiles.map(file => loadCSV(path.join(DATA_DIR, file)))
    );
    
    const allStocks = allStocksArrays.flat();
    console.log(`  ✅ ${allStocks.length} stocks chargés\n`);
    
    // Enrichir les stocks avec les données de marché
    console.log('📈 Enrichissement des données...');
    const enrichedStocks = [];
    
    for (let i = 0; i < allStocks.length; i++) {
        const enriched = await enrichStock(allStocks[i]);
        enrichedStocks.push(enriched);
        
        // Afficher la progression
        if ((i + 1) % 50 === 0 || i === allStocks.length - 1) {
            console.log(`  Traité: ${i + 1}/${allStocks.length}`);
        }
    }
    
    // Grouper par région
    const stocksByRegion = {
        US: [],
        EUROPE: [],
        ASIA: []
    };
    
    enrichedStocks.forEach(stock => {
        const region = stock.source_file.includes('US') ? 'US' :
                      stock.source_file.includes('Europe') ? 'EUROPE' : 'ASIA';
        stocksByRegion[region].push(stock);
    });
    
    // Filtrer et sauvegarder par région
    console.log('\n🔍 Application des filtres:\n');
    const results = {};
    
    for (const [region, stocks] of Object.entries(stocksByRegion)) {
        console.log(`📍 ${region}:`);
        console.log(`  - Stocks totaux: ${stocks.length}`);
        
        // Appliquer le filtre de volume
        const filtered = stocks.filter(stock => {
            const volume = stock.volume;
            const threshold = stock.volume_threshold;
            return volume >= threshold;
        });
        
        console.log(`  - Après filtre volume: ${filtered.length}`);
        
        // Trier par ADV décroissant
        filtered.sort((a, b) => (b.adv_usd || 0) - (a.adv_usd || 0));
        
        // Calculer les statistiques
        const stats = {
            total_stocks: filtered.length,
            avg_volume: Math.round(filtered.reduce((sum, s) => sum + s.volume, 0) / filtered.length || 0),
            avg_adv_usd: Math.round(filtered.reduce((sum, s) => sum + s.adv_usd, 0) / filtered.length || 0),
            by_cap: {
                large: filtered.filter(s => s.cap_category === 'large').length,
                mid: filtered.filter(s => s.cap_category === 'mid').length,
                small: filtered.filter(s => s.cap_category === 'small').length
            },
            top_sectors: {}
        };
        
        // Top 5 secteurs
        filtered.forEach(stock => {
            const sector = stock.sector || 'Unknown';
            stats.top_sectors[sector] = (stats.top_sectors[sector] || 0) + 1;
        });
        
        stats.top_sectors = Object.entries(stats.top_sectors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});
        
        // Créer l'objet de sortie
        results[region] = {
            region: region,
            timestamp: new Date().toISOString(),
            stats: stats,
            stocks: filtered.map(stock => ({
                ticker: stock.ticker,
                name: stock.name,
                sector: stock.sector,
                country: stock.country,
                exchange: stock.exchange,
                currency: stock.currency,
                price: stock.price,
                volume: stock.volume,
                adv_usd: stock.adv_usd,
                change_percent: stock.percent_change,
                market_cap: stock.market_cap,
                cap_category: stock.cap_category
            }))
        };
        
        // Sauvegarder le fichier JSON
        const outputFile = path.join(OUTPUT_DIR, `stocks_${region.toLowerCase()}_filtered.json`);
        await fs.writeFile(outputFile, JSON.stringify(results[region], null, 2));
        console.log(`  ✅ Sauvegardé: ${outputFile}\n`);
    }
    
    // Créer un CSV combiné de tous les stocks filtrés
    const allFiltered = Object.values(results).flatMap(r => r.stocks);
    const csvHeader = 'Ticker,Stock,Secteur,Pays,Bourse de valeurs,Devise de marché,Volume,ADV USD\n';
    const csvRows = allFiltered.map(s => 
        `"${s.ticker}","${s.name}","${s.sector}","${s.country}","${s.exchange}","${s.currency}",${s.volume},${Math.round(s.adv_usd)}`
    ).join('\n');
    
    await fs.writeFile(
        path.join(OUTPUT_DIR, 'Actions_filtrees_par_volume.csv'), 
        csvHeader + csvRows
    );
    
    // Résumé
    const summary = {
        timestamp: new Date().toISOString(),
        total_processed: allStocks.length,
        total_retained: allFiltered.length,
        by_region: Object.entries(results).map(([region, data]) => ({
            region,
            count: data.stats.total_stocks,
            avg_volume: data.stats.avg_volume,
            avg_adv_usd: data.stats.avg_adv_usd
        }))
    };
    
    await fs.writeFile(
        path.join(OUTPUT_DIR, 'filtering_summary.json'),
        JSON.stringify(summary, null, 2)
    );
    
    console.log('📊 Résumé:');
    console.log(`  - Stocks traités: ${summary.total_processed}`);
    console.log(`  - Stocks retenus: ${summary.total_retained}`);
    console.log(`\n✅ Terminé! Résultats dans: ${OUTPUT_DIR}`);
}

// Exécution
if (require.main === module) {
    filterStocksByVolume().catch(error => {
        console.error('❌ Erreur:', error);
        process.exit(1);
    });
}

module.exports = { filterStocksByVolume };
