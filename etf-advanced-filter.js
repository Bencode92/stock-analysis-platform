// etf-advanced-filter.js
// Filtre ETF/Bonds sur 3 critères: AUM, liquidité, écart NAV

const fs = require('fs').promises;
const axios = require('axios');
const csv = require('csv-parse/sync');

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    // Seuils ETF
    MIN_AUM_ETF: 1e9,          // 1 Md$
    MIN_DOLLAR_VOL_ETF: 1e7,   // 10M$ par jour
    MAX_NAV_DISCOUNT: 0.02,     // 2%
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
        
        // 1) Appel /quote pour volume et prix
        const quoteRes = await axios.get('https://api.twelvedata.com/quote', {
            params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
        });
        const quote = quoteRes.data;
        
        await wait(CONFIG.RATE_LIMIT / 2);
        
        // 2) Appel /etfs/world/summary pour AUM et NAV
        const sumRes = await axios.get('https://api.twelvedata.com/etfs/world/summary', {
            params: { symbol: symbol, apikey: CONFIG.API_KEY }
        });
        const sum = sumRes.data?.etf?.summary || {};
        
        // Debug: afficher les données brutes
        if (CONFIG.DEBUG) {
            console.log(`\n=== DEBUG ${symbol} ===`);
            console.log('Quote:', JSON.stringify(quote, null, 2));
            console.log('Summary:', JSON.stringify(sum, null, 2));
        }
        
        // 3) Calculs
        const avgDollarVol = (Number(quote.average_volume) || 0) * (Number(quote.close) || 0);
        const premiumDiscount = sum.nav ? 
            (Number(sum.last_price || quote.close) - Number(sum.nav)) / Number(sum.nav) : 0;
        
        return {
            symbol,
            price: Number(quote.close) || 0,
            volume: Number(quote.volume) || 0,
            average_volume: Number(quote.average_volume) || 0,
            net_assets: Number(sum.net_assets) || 0,
            nav: Number(sum.nav) || 0,
            avg_dollar_volume: avgDollarVol,
            premium_discount: premiumDiscount,
            vol_ratio: (Number(quote.volume) || 0) / (Number(quote.average_volume) || 1)
        };
    } catch (error) {
        console.error(`❌ ${symbol} – API error:`, error.response?.data || error.message);
        return null;
    }
}

async function filterETFs() {
    console.log('📊 Filtrage avancé ETF/Bonds\n');
    console.log('Critères:');
    console.log(`- AUM >= ${(CONFIG.MIN_AUM_ETF/1e9).toFixed(1)} Md$`);
    console.log(`- Dollar-volume >= ${(CONFIG.MIN_DOLLAR_VOL_ETF/1e6).toFixed(0)}M$/jour`);
    console.log(`- Écart NAV <= ${(CONFIG.MAX_NAV_DISCOUNT*100).toFixed(0)}%\n`);
    
    if (CONFIG.DEBUG) {
        console.log('🐛 MODE DEBUG ACTIVÉ\n');
    }
    
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
        
        if (!data) {
            results.rejected.push({ ...etf, reason: 'API_ERROR' });
            continue;
        }
        
        // Logger les valeurs avant filtrage
        console.log(
            `\n${data.symbol}  |  AUM: ${(data.net_assets/1e6).toFixed(0)} M$` +
            `  |  $Vol: ${(data.avg_dollar_volume/1e6).toFixed(2)} M$` +
            `  |  ΔNAV: ${(data.premium_discount*100).toFixed(2)}%`
        );
        
        // Appliquer les 3 filtres
        const filters = {
            aum: data.net_assets >= CONFIG.MIN_AUM_ETF,
            liquidity: data.avg_dollar_volume >= CONFIG.MIN_DOLLAR_VOL_ETF,
            nav_discount: Math.abs(data.premium_discount) <= CONFIG.MAX_NAV_DISCOUNT
        };
        
        const passAll = Object.values(filters).every(v => v);
        
        if (passAll) {
            results.etfs.push({ ...etf, ...data });
            console.log(` ✅ PASS`);
        } else {
            const failed = Object.entries(filters).filter(([k,v]) => !v).map(([k]) => k);
            results.rejected.push({ 
                ...etf, 
                ...data,  // Inclure toutes les valeurs numériques
                failed: failed
            });
            console.log(` ❌ FAIL: ${failed.join(', ')}`);
        }
    }
    
    // Traiter Bonds
    console.log('\n\n🔍 Analyse des Bonds...');
    for (let i = 0; i < bonds.length; i++) {
        const bond = bonds[i];
        process.stdout.write(`\r${i+1}/${bonds.length}: ${bond.symbol.padEnd(10)}`);
        
        const data = await getETFData(bond.symbol, bond.exchange, bond.mic_code);
        await wait(CONFIG.RATE_LIMIT);
        
        if (!data) {
            results.rejected.push({ ...bond, reason: 'API_ERROR' });
            continue;
        }
        
        // Logger les valeurs
        console.log(
            `\n${data.symbol}  |  AUM: ${(data.net_assets/1e6).toFixed(0)} M$` +
            `  |  $Vol: ${(data.avg_dollar_volume/1e6).toFixed(2)} M$` +
            `  |  ΔNAV: ${(data.premium_discount*100).toFixed(2)}%`
        );
        
        const filters = {
            aum: data.net_assets >= CONFIG.MIN_AUM_BOND,
            liquidity: data.avg_dollar_volume >= CONFIG.MIN_DOLLAR_VOL_BOND,
            nav_discount: Math.abs(data.premium_discount) <= CONFIG.MAX_NAV_DISCOUNT
        };
        
        const passAll = Object.values(filters).every(v => v);
        
        if (passAll) {
            results.bonds.push({ ...bond, ...data });
            console.log(` ✅ PASS`);
        } else {
            const failed = Object.entries(filters).filter(([k,v]) => !v).map(([k]) => k);
            results.rejected.push({ 
                ...bond, 
                ...data,
                failed: failed
            });
            console.log(` ❌ FAIL: ${failed.join(', ')}`);
        }
    }
    
    // Statistiques finales
    results.stats.etfs_retained = results.etfs.length;
    results.stats.bonds_retained = results.bonds.length;
    results.stats.total_retained = results.etfs.length + results.bonds.length;
    results.stats.rejected_count = results.rejected.length;
    
    // Sauvegarder
    await fs.writeFile('data/filtered_advanced.json', JSON.stringify(results, null, 2));
    
    console.log('\n\n📊 RÉSUMÉ:');
    console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`);
    console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`);
    console.log(`Rejetés: ${results.rejected.length}`);
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
