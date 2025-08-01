// etf-advanced-filter.js
// Filtre ETF/Bonds sur 5 critères: AUM, liquidité, spread, frais, écart NAV

const fs = require('fs').promises;
const axios = require('axios');
const csv = require('csv-parse/sync');

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    // Seuils ETF
    MIN_AUM_ETF: 1e9,          // 1 Md$
    MIN_DOLLAR_VOL_ETF: 1e7,   // 10M$ par jour
    MAX_EXPENSE_RATIO: 0.002,   // 0.20%
    MAX_NAV_DISCOUNT: 0.02,     // 2%
    MIN_VOL_RATIO: 1,          // volume du jour >= moyenne
    // Seuils Bonds (plus souples)
    MIN_AUM_BOND: 5e8,         // 500M$
    MIN_DOLLAR_VOL_BOND: 5e6,  // 5M$ par jour
    RATE_LIMIT: 800
};

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getETFData(symbol, exchange, mic_code) {
    try {
        const symbolParam = mic_code ? `${symbol}:${mic_code}` : symbol;
        
        // Récupérer quote et statistics en parallèle
        const [quoteRes, statsRes] = await Promise.all([
            axios.get('https://api.twelvedata.com/quote', {
                params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
            }),
            axios.get('https://api.twelvedata.com/statistics', {
                params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
            })
        ]);
        
        const quote = quoteRes.data;
        const stats = statsRes.data.statistics || {};
        
        return {
            symbol,
            price: parseFloat(quote.close) || 0,
            volume: parseInt(quote.volume) || 0,
            average_volume: parseInt(quote.average_volume) || 0,
            net_assets: parseFloat(stats.net_assets) || 0,
            expense_ratio: parseFloat(stats.expense_ratio) || null,
            nav: parseFloat(stats.nav) || parseFloat(quote.close),
            // Calculer les métriques dérivées
            dollar_volume: (parseInt(quote.volume) || 0) * (parseFloat(quote.close) || 0),
            avg_dollar_volume: (parseInt(quote.average_volume) || 0) * (parseFloat(quote.close) || 0),
            vol_ratio: (parseInt(quote.volume) || 0) / (parseInt(quote.average_volume) || 1),
            premium_discount: quote.close && stats.nav ? 
                (parseFloat(quote.close) - parseFloat(stats.nav)) / parseFloat(stats.nav) : 0
        };
    } catch (error) {
        console.error(`❌ ${symbol}: ${error.message}`);
        return null;
    }
}

async function filterETFs() {
    console.log('📊 Filtrage avancé ETF/Bonds\n');
    console.log('Critères ETF:');
    console.log(`- AUM >= ${(CONFIG.MIN_AUM_ETF/1e9).toFixed(1)} Md$`);
    console.log(`- Dollar-volume >= ${(CONFIG.MIN_DOLLAR_VOL_ETF/1e6).toFixed(0)}M$/jour`);
    console.log(`- Expense ratio <= ${(CONFIG.MAX_EXPENSE_RATIO*100).toFixed(2)}%`);
    console.log(`- Écart NAV <= ${(CONFIG.MAX_NAV_DISCOUNT*100).toFixed(0)}%`);
    console.log(`- Volume ratio >= ${CONFIG.MIN_VOL_RATIO}\n`);
    
    // Lire les CSV
    const etfData = await fs.readFile('data/all_etfs.csv', 'utf8');
    const bondData = await fs.readFile('data/all_bonds.csv', 'utf8');
    
    const etfs = csv.parse(etfData, { columns: true });
    const bonds = csv.parse(bondData, { columns: true });
    
    const results = {
        etfs: [],
        bonds: [],
        rejected: [],
        stats: {
            total_etfs: etfs.length,
            total_bonds: bonds.length,
            timestamp: new Date().toISOString()
        }
    };
    
    // Traiter ETFs
    console.log('🔍 Analyse des ETFs...');
    for (let i = 0; i < etfs.length; i++) {
        const etf = etfs[i];
        process.stdout.write(`\r${i+1}/${etfs.length}: ${etf.symbol.padEnd(10)}`);
        
        const data = await getETFData(etf.symbol, etf.exchange, etf.mic_code);
        await wait(CONFIG.RATE_LIMIT);
        
        if (!data) continue;
        
        // Appliquer les 5 filtres
        const filters = {
            aum: data.net_assets >= CONFIG.MIN_AUM_ETF,
            liquidity: data.avg_dollar_volume >= CONFIG.MIN_DOLLAR_VOL_ETF,
            expense: !data.expense_ratio || data.expense_ratio <= CONFIG.MAX_EXPENSE_RATIO,
            nav_discount: Math.abs(data.premium_discount) <= CONFIG.MAX_NAV_DISCOUNT,
            vol_ratio: data.vol_ratio >= CONFIG.MIN_VOL_RATIO
        };
        
        const passAll = Object.values(filters).every(v => v);
        
        if (passAll) {
            results.etfs.push({ ...etf, ...data });
            console.log(` ✅ AUM: ${(data.net_assets/1e9).toFixed(1)}B, Vol: ${(data.avg_dollar_volume/1e6).toFixed(1)}M`);
        } else {
            const failed = Object.entries(filters).filter(([k,v]) => !v).map(([k]) => k);
            results.rejected.push({ ...etf, reason: `Failed: ${failed.join(', ')}` });
        }
    }
    
    // Traiter Bonds (seuils plus souples)
    console.log('\n\n🔍 Analyse des Bonds...');
    for (let i = 0; i < bonds.length; i++) {
        const bond = bonds[i];
        process.stdout.write(`\r${i+1}/${bonds.length}: ${bond.symbol.padEnd(10)}`);
        
        const data = await getETFData(bond.symbol, bond.exchange, bond.mic_code);
        await wait(CONFIG.RATE_LIMIT);
        
        if (!data) continue;
        
        // Filtres adaptés pour bonds
        const filters = {
            aum: data.net_assets >= CONFIG.MIN_AUM_BOND,
            liquidity: data.avg_dollar_volume >= CONFIG.MIN_DOLLAR_VOL_BOND,
            expense: !data.expense_ratio || data.expense_ratio <= CONFIG.MAX_EXPENSE_RATIO,
            nav_discount: Math.abs(data.premium_discount) <= CONFIG.MAX_NAV_DISCOUNT
        };
        
        const passAll = Object.values(filters).every(v => v);
        
        if (passAll) {
            results.bonds.push({ ...bond, ...data });
            console.log(` ✅ AUM: ${(data.net_assets/1e9).toFixed(1)}B, Vol: ${(data.avg_dollar_volume/1e6).toFixed(1)}M`);
        }
    }
    
    // Statistiques finales
    results.stats.etfs_retained = results.etfs.length;
    results.stats.bonds_retained = results.bonds.length;
    results.stats.total_retained = results.etfs.length + results.bonds.length;
    
    // Sauvegarder
    await fs.writeFile('data/filtered_advanced.json', JSON.stringify(results, null, 2));
    
    console.log('\n\n📊 RÉSUMÉ:');
    console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`);
    console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`);
    console.log(`\n✅ Résultats: data/filtered_advanced.json`);
    
    // Pour GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::set-output name=etfs_count::${results.etfs.length}`);
        console.log(`::set-output name=bonds_count::${results.bonds.length}`);
    }
}

// Lancer
if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

filterETFs().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
