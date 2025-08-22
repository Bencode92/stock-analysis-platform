// stock-filter-by-continent.js
// Filtrage avancé par volume et génération de JSON séparés par continent

const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');

// Configuration des seuils de volume par région et par bourse
const CONFIG = {
    // Seuils par défaut par région
    VOLUME_MIN: {
        US: 500_000,      // US: 500k minimum
        EUROPE: 50_000,   // Europe: 50k par défaut
        ASIA: 100_000,    // Asie: 100k par défaut
        LATAM: 30_000,    // Amérique Latine: 30k
        AFRICA: 20_000,   // Afrique: 20k
        OCEANIA: 40_000   // Océanie: 40k
    },
    
    // Seuils spécifiques par bourse (override)
    VOLUME_MIN_BY_EXCHANGE: {
        // US
        NYSE: 500_000,
        NASDAQ: 500_000,
        AMEX: 300_000,
        
        // Europe
        XETR: 100_000,  // Allemagne
        XPAR: 80_000,   // France
        XLON: 120_000,  // UK
        XMIL: 80_000,   // Italie
        XMAD: 80_000,   // Espagne
        XAMS: 50_000,   // Pays-Bas
        XSTO: 60_000,   // Suède
        XCSE: 40_000,   // Danemark
        XHEL: 40_000,   // Finlande
        XBRU: 30_000,   // Belgique
        XLIS: 20_000,   // Portugal
        XSWX: 20_000,   // Suisse
        
        // Asie
        TSE: 150_000,   // Tokyo
        HKEX: 100_000,  // Hong Kong
        SSE: 80_000,    // Shanghai
        SZSE: 80_000,   // Shenzhen
        KRX: 100_000,   // Corée
        NSE: 50_000,    // Inde
        BSE: 50_000,    // Bombay
        SGX: 60_000,    // Singapour
        
        // Autres
        ASX: 50_000,    // Australie
        TSX: 100_000,   // Canada
        BOVESPA: 40_000 // Brésil
    },
    
    // Mapping des pays vers les continents
    CONTINENT_MAPPING: {
        // Amérique du Nord
        'United States': 'US',
        'USA': 'US',
        'Canada': 'US',
        
        // Europe
        'Germany': 'EUROPE',
        'France': 'EUROPE',
        'United Kingdom': 'EUROPE',
        'UK': 'EUROPE',
        'Italy': 'EUROPE',
        'Spain': 'EUROPE',
        'Netherlands': 'EUROPE',
        'Sweden': 'EUROPE',
        'Denmark': 'EUROPE',
        'Finland': 'EUROPE',
        'Belgium': 'EUROPE',
        'Portugal': 'EUROPE',
        'Switzerland': 'EUROPE',
        'Norway': 'EUROPE',
        'Austria': 'EUROPE',
        'Poland': 'EUROPE',
        
        // Asie
        'Japan': 'ASIA',
        'China': 'ASIA',
        'Hong Kong': 'ASIA',
        'South Korea': 'ASIA',
        'India': 'ASIA',
        'Singapore': 'ASIA',
        'Taiwan': 'ASIA',
        'Thailand': 'ASIA',
        'Indonesia': 'ASIA',
        'Malaysia': 'ASIA',
        
        // Océanie
        'Australia': 'OCEANIA',
        'New Zealand': 'OCEANIA',
        
        // Amérique Latine
        'Brazil': 'LATAM',
        'Mexico': 'LATAM',
        'Argentina': 'LATAM',
        'Chile': 'LATAM',
        
        // Afrique
        'South Africa': 'AFRICA'
    }
};

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'data/filtered';

// Fichiers d'entrée
const INPUT_FILES = {
    jsons: ['stocks_us.json', 'stocks_europe.json', 'stocks_asia.json'],
    csvs: ['Actions_US.csv', 'Actions_Europe.csv', 'Actions_Asie.csv']
};

// Calcul du score de qualité des données
function calculateDataQualityScore(stock) {
    const details = {
        has_price: stock.price > 0,
        has_volume: stock.volume > 0,
        has_change: stock.change !== undefined,
        has_market_cap: stock.market_cap > 0,
        has_pe_ratio: stock.pe_ratio !== null && stock.pe_ratio !== undefined,
        has_sector: stock.sector && stock.sector !== '',
        has_country: stock.country && stock.country !== '',
        has_exchange: stock.exchange && stock.exchange !== ''
    };
    
    const weights = {
        has_price: 15,
        has_volume: 15,
        has_change: 10,
        has_market_cap: 15,
        has_pe_ratio: 10,
        has_sector: 15,
        has_country: 10,
        has_exchange: 10
    };
    
    let score = 0;
    Object.keys(details).forEach(key => {
        if (details[key]) score += weights[key];
    });
    
    return { score, details };
}

// Déterminer le continent d'un stock
function getContinent(stock) {
    // Priorité : région définie > pays > exchange
    if (stock.__region) return stock.__region.toUpperCase();
    
    const country = stock.country || stock.Pays || '';
    if (country && CONFIG.CONTINENT_MAPPING[country]) {
        return CONFIG.CONTINENT_MAPPING[country];
    }
    
    // Fallback sur l'exchange
    const exchange = (stock.exchange || stock['Bourse de valeurs'] || '').toUpperCase();
    if (exchange.includes('NYSE') || exchange.includes('NASDAQ')) return 'US';
    if (exchange.startsWith('X')) return 'EUROPE'; // Codes MIC européens
    if (['TSE', 'HKEX', 'SSE', 'SZSE', 'KRX', 'NSE', 'BSE', 'SGX'].includes(exchange)) return 'ASIA';
    if (exchange === 'ASX') return 'OCEANIA';
    if (exchange === 'TSX') return 'US'; // Canada avec US
    if (exchange === 'BOVESPA') return 'LATAM';
    
    return 'UNKNOWN';
}

// Obtenir le seuil de volume pour un stock
function getVolumeThreshold(stock) {
    const exchange = (stock.exchange || stock['Bourse de valeurs'] || '').toUpperCase();
    
    // Priorité aux seuils par exchange
    if (CONFIG.VOLUME_MIN_BY_EXCHANGE[exchange]) {
        return CONFIG.VOLUME_MIN_BY_EXCHANGE[exchange];
    }
    
    // Sinon utiliser le seuil par continent
    const continent = getContinent(stock);
    return CONFIG.VOLUME_MIN[continent] || 0;
}

// Charger les métadonnées CSV
async function loadCSVMetadata(filepath) {
    try {
        const content = await fs.readFile(filepath, 'utf8');
        const rows = parse(content, { columns: true, skip_empty_lines: true });
        const metaMap = new Map();
        
        for (const row of rows) {
            const symbol = (row['Ticker'] || row['Symbol'] || '').trim();
            if (!symbol) continue;
            
            metaMap.set(symbol, {
                ticker: symbol,
                name: row['Stock'] || row['Name'] || '',
                sector: row['Secteur'] || row['Sector'] || '',
                country: row['Pays'] || row['Country'] || '',
                exchange: row['Bourse de valeurs'] || row['Exchange'] || '',
                currency: row['Devise de marché'] || row['Currency'] || ''
            });
        }
        
        return metaMap;
    } catch (error) {
        console.warn(`⚠️ Impossible de charger ${filepath}: ${error.message}`);
        return new Map();
    }
}

// Charger les données JSON enrichies
async function loadJSONData(filepath) {
    try {
        const content = await fs.readFile(filepath, 'utf8');
        const data = JSON.parse(content);
        
        // Déterminer la région depuis le nom du fichier
        let region = 'UNKNOWN';
        if (filepath.includes('us')) region = 'US';
        else if (filepath.includes('europe')) region = 'EUROPE';
        else if (filepath.includes('asia')) region = 'ASIA';
        
        // Ajouter la région à chaque stock
        const stocks = (data.stocks || data || []).map(stock => ({
            ...stock,
            __region: region,
            __source_file: path.basename(filepath)
        }));
        
        return stocks;
    } catch (error) {
        console.warn(`⚠️ Impossible de charger ${filepath}: ${error.message}`);
        return [];
    }
}

// Enrichir un stock avec les métadonnées
function enrichStock(stock, metadata) {
    const meta = metadata.get(stock.ticker || stock.symbol) || {};
    
    // Calculer l'ADV (Average Dollar Volume)
    const volume = Number(stock.volume || 0);
    const price = Number(stock.price || stock.last || 0);
    const adv = volume * price;
    
    // Calculer le score de qualité
    const qualityData = calculateDataQualityScore(stock);
    
    // Déterminer la capitalisation
    const marketCap = stock.market_cap || (price * (stock.shares_outstanding || 0));
    let capCategory = 'unknown';
    if (marketCap >= 10e9) capCategory = 'large';
    else if (marketCap >= 2e9) capCategory = 'mid';
    else if (marketCap > 0) capCategory = 'small';
    
    return {
        // Identifiants
        ticker: stock.ticker || stock.symbol,
        name: stock.name || meta.name || '',
        
        // Données de marché
        price: price,
        volume: volume,
        adv_usd: adv,
        change: stock.change || 0,
        change_percent: stock.change_percent || stock.percent || 0,
        
        // Métadonnées
        sector: stock.sector || meta.sector || '',
        country: stock.country || meta.country || '',
        exchange: stock.exchange || meta.exchange || '',
        currency: stock.currency || meta.currency || 'USD',
        
        // Indicateurs
        market_cap: marketCap,
        cap_category: capCategory,
        pe_ratio: stock.pe_ratio || null,
        
        // Qualité
        data_quality_score: qualityData.score,
        data_quality_details: qualityData.details,
        
        // Métadonnées système
        continent: getContinent(stock),
        volume_threshold: getVolumeThreshold(stock),
        source_file: stock.__source_file,
        timestamp: new Date().toISOString()
    };
}

// Fonction principale
async function filterStocksByContinent() {
    console.log('🌍 Filtrage des stocks par continent et volume\n');
    console.log('📊 Configuration:');
    console.log('  - Seuils par défaut:', CONFIG.VOLUME_MIN);
    console.log('  - Fichiers source:', DATA_DIR);
    console.log('  - Dossier de sortie:', OUTPUT_DIR);
    console.log('');
    
    // Créer le dossier de sortie
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Charger toutes les métadonnées CSV
    console.log('📚 Chargement des métadonnées CSV...');
    const metadataMaps = await Promise.all(
        INPUT_FILES.csvs.map(file => loadCSVMetadata(path.join(DATA_DIR, file)))
    );
    
    // Fusionner toutes les métadonnées
    const allMetadata = new Map();
    metadataMaps.forEach(map => {
        map.forEach((value, key) => allMetadata.set(key, value));
    });
    console.log(`  ✅ ${allMetadata.size} stocks avec métadonnées\n`);
    
    // Charger toutes les données JSON
    console.log('📈 Chargement des données JSON enrichies...');
    const allStocksArrays = await Promise.all(
        INPUT_FILES.jsons.map(file => loadJSONData(path.join(DATA_DIR, file)))
    );
    
    // Fusionner et enrichir tous les stocks
    const allStocks = allStocksArrays.flat().map(stock => enrichStock(stock, allMetadata));
    console.log(`  ✅ ${allStocks.length} stocks chargés au total\n`);
    
    // Grouper par continent
    const stocksByContinent = {};
    allStocks.forEach(stock => {
        const continent = stock.continent;
        if (!stocksByContinent[continent]) {
            stocksByContinent[continent] = [];
        }
        stocksByContinent[continent].push(stock);
    });
    
    // Filtrer et sauvegarder par continent
    console.log('🔍 Application des filtres par continent:\n');
    const results = {};
    
    for (const [continent, stocks] of Object.entries(stocksByContinent)) {
        console.log(`📍 ${continent}:`);
        console.log(`  - Stocks totaux: ${stocks.length}`);
        
        // Appliquer le filtre de volume
        const filtered = stocks.filter(stock => {
            const volume = Number(stock.volume || 0);
            const threshold = stock.volume_threshold;
            return volume >= threshold;
        });
        
        console.log(`  - Après filtre volume: ${filtered.length}`);
        
        // Trier par ADV décroissant
        filtered.sort((a, b) => (b.adv_usd || 0) - (a.adv_usd || 0));
        
        // Calculer les statistiques
        const stats = {
            total_stocks: filtered.length,
            avg_volume: filtered.reduce((sum, s) => sum + s.volume, 0) / filtered.length || 0,
            avg_adv_usd: filtered.reduce((sum, s) => sum + s.adv_usd, 0) / filtered.length || 0,
            avg_quality_score: filtered.reduce((sum, s) => sum + s.data_quality_score, 0) / filtered.length || 0,
            by_cap: {
                large: filtered.filter(s => s.cap_category === 'large').length,
                mid: filtered.filter(s => s.cap_category === 'mid').length,
                small: filtered.filter(s => s.cap_category === 'small').length,
                unknown: filtered.filter(s => s.cap_category === 'unknown').length
            },
            by_exchange: {},
            top_sectors: {}
        };
        
        // Compter par exchange
        filtered.forEach(stock => {
            const exchange = stock.exchange || 'unknown';
            stats.by_exchange[exchange] = (stats.by_exchange[exchange] || 0) + 1;
            
            const sector = stock.sector || 'unknown';
            stats.top_sectors[sector] = (stats.top_sectors[sector] || 0) + 1;
        });
        
        // Garder seulement le top 5 des secteurs
        stats.top_sectors = Object.entries(stats.top_sectors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});
        
        // Créer l'objet de sortie
        results[continent] = {
            continent: continent,
            timestamp: new Date().toISOString(),
            stats: stats,
            stocks: filtered.map(stock => ({
                ticker: stock.ticker,
                name: stock.name,
                price: stock.price,
                volume: stock.volume,
                adv_usd: stock.adv_usd,
                change_percent: stock.change_percent,
                sector: stock.sector,
                country: stock.country,
                exchange: stock.exchange,
                market_cap: stock.market_cap,
                cap_category: stock.cap_category,
                pe_ratio: stock.pe_ratio,
                data_quality_score: stock.data_quality_score
            }))
        };
        
        // Sauvegarder le fichier JSON
        const outputFile = path.join(OUTPUT_DIR, `stocks_${continent.toLowerCase()}_filtered.json`);
        await fs.writeFile(outputFile, JSON.stringify(results[continent], null, 2));
        console.log(`  ✅ Sauvegardé: ${outputFile}`);
        console.log('');
    }
    
    // Créer un fichier de résumé global
    const summary = {
        timestamp: new Date().toISOString(),
        total_stocks_processed: allStocks.length,
        total_stocks_retained: Object.values(results).reduce((sum, r) => sum + r.stats.total_stocks, 0),
        by_continent: Object.entries(results).map(([continent, data]) => ({
            continent,
            stocks_count: data.stats.total_stocks,
            avg_volume: Math.round(data.stats.avg_volume),
            avg_adv_usd: Math.round(data.stats.avg_adv_usd),
            avg_quality: Math.round(data.stats.avg_quality_score)
        }))
    };
    
    const summaryFile = path.join(OUTPUT_DIR, 'filtering_summary.json');
    await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
    
    console.log('📊 Résumé global:');
    console.log(`  - Stocks traités: ${summary.total_stocks_processed}`);
    console.log(`  - Stocks retenus: ${summary.total_stocks_retained}`);
    console.log(`  - Fichiers générés: ${Object.keys(results).length + 1}`);
    console.log(`\n✅ Filtrage terminé! Résultats dans: ${OUTPUT_DIR}`);
}

// Exécution
if (require.main === module) {
    filterStocksByContinent().catch(error => {
        console.error('❌ Erreur:', error);
        process.exit(1);
    });
}

module.exports = { filterStocksByContinent, CONFIG };
