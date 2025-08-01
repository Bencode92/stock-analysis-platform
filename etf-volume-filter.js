// etf-volume-filter.js
// Filtre les ETF/Bonds par volume uniquement

const fs = require('fs').promises;
const axios = require('axios');
const csv = require('csv-parse/sync');

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY || 'YOUR_KEY',
    MIN_VOLUME_ETF: 500000,
    MIN_VOLUME_BOND: 100000,
    RATE_LIMIT: 800 // ms entre chaque appel
};

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getVolume(symbol, exchange, mic_code) {
    try {
        const response = await axios.get('https://api.twelvedata.com/quote', {
            params: {
                symbol: `${symbol}:${mic_code}`,
                apikey: CONFIG.API_KEY
            }
        });
        
        return {
            symbol,
            volume: parseInt(response.data.volume) || 0,
            average_volume: parseInt(response.data.average_volume) || 0
        };
    } catch (error) {
        console.error(`❌ ${symbol}: ${error.message}`);
        return null;
    }
}

async function filterByVolume() {
    // Lire les fichiers CSV
    const etfData = await fs.readFile('data/all_etfs.csv', 'utf8');
    const bondData = await fs.readFile('data/all_bonds.csv', 'utf8');
    
    const etfs = csv.parse(etfData, { columns: true });
    const bonds = csv.parse(bondData, { columns: true });
    
    console.log(`📊 Analyse de ${etfs.length} ETFs et ${bonds.length} Bonds\n`);
    
    const results = {
        etfs: [],
        bonds: [],
        timestamp: new Date().toISOString()
    };
    
    // Filtrer ETFs
    console.log('🔍 ETFs:');
    for (let i = 0; i < etfs.length; i++) {
        const etf = etfs[i];
        console.log(`${i+1}/${etfs.length}: ${etf.symbol}`);
        
        const data = await getVolume(etf.symbol, etf.exchange, etf.mic_code);
        await wait(CONFIG.RATE_LIMIT);
        
        if (data && data.volume >= CONFIG.MIN_VOLUME_ETF) {
            results.etfs.push({ ...etf, ...data });
            console.log(`✅ Volume: ${data.volume.toLocaleString()}`);
        }
    }
    
    // Filtrer Bonds
    console.log('\n🔍 Bonds:');
    for (let i = 0; i < bonds.length; i++) {
        const bond = bonds[i];
        console.log(`${i+1}/${bonds.length}: ${bond.symbol}`);
        
        const data = await getVolume(bond.symbol, bond.exchange, bond.mic_code);
        await wait(CONFIG.RATE_LIMIT);
        
        if (data && data.volume >= CONFIG.MIN_VOLUME_BOND) {
            results.bonds.push({ ...bond, ...data });
            console.log(`✅ Volume: ${data.volume.toLocaleString()}`);
        }
    }
    
    // Sauvegarder
    await fs.writeFile('data/filtered_by_volume.json', JSON.stringify(results, null, 2));
    
    console.log(`\n✅ Terminé!`);
    console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`);
    console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`);
}

// Lancer
filterByVolume().catch(console.error);
