// etf-advanced-filter.js
// Filtre ETF/Bonds sur 3 critères: AUM, liquidité, écart NAV

const fs = require('fs').promises;
const axios = require('axios');
const csv = require('csv-parse/sync');

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    // Seuils ETF US
    MIN_AUM_ETF_US: 1e9,          // 1 Md$
    MIN_DOLLAR_VOL_ETF_US: 1e7,   // 10M$ par jour
    // Seuils ETF Europe (plus souples)
    MIN_AUM_ETF_EU: 2e8,          // 200M$
    MIN_DOLLAR_VOL_ETF_EU: 2e6,   // 2M$ par jour
    // Seuils Bonds
    MIN_AUM_BOND: 5e8,            // 500M$
    MIN_DOLLAR_VOL_BOND: 5e6,     // 5M$ par jour
    MAX_NAV_DISCOUNT: 0.02,       // 2%
    RATE_LIMIT: 800
};

// Cache pour les symboles résolus
const symbolCache = new Map();

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveSymbol(raw, apiKey) {
    // Vérifier le cache
    if (symbolCache.has(raw)) {
        return symbolCache.get(raw);
    }
    
    try {
        const res = await axios.get('https://api.twelvedata.com/symbol_search', {
            params: { symbol: raw, apikey: apiKey }
        });
        
        const hit = res.data?.data?.[0];
        if (hit) {
            const resolved = `${hit.symbol}:${hit.mic_code}`;
            symbolCache.set(raw, resolved);
            console.log(`  → Résolu: ${raw} → ${resolved}`);
            return resolved;
        }
    } catch (error) {
        console.error(`  → Échec résolution ${raw}: ${error.message}`);
    }
    
    return null;
}

async function getETFData(symbol, exchange, mic_code) {
    try {
        let symbolParam = mic_code ? `${symbol}:${mic_code}` : symbol;
        
        // 1) Tentative directe /quote
        let quote = null;
        try {
            const quoteRes = await axios.get('https://api.twelvedata.com/quote', {
                params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
            });
            quote = quoteRes.data;
            if (quote.status === 'error') quote = null;
        } catch { 
            quote = null; 
        }
        
        // 2) Si échec: résolution du symbole
        if (!quote) {
            const resolved = await resolveSymbol(symbol, CONFIG.API_KEY);
            if (resolved) {
                symbolParam = resolved;
                const quoteRes = await axios.get('https://api.twelvedata.com/quote', {
                    params: { symbol: resolved, apikey: CONFIG.API_KEY }
                });
                quote = quoteRes.data;
            }
        }
        
        if (!quote || quote.status === 'error') {
            console.error(`❌ ${symbol} — introuvable même après résolution`);
            return null;
        }
        
        await wait(CONFIG.RATE_LIMIT / 2);
        
        // 3) Récupérer AUM via /statistics
        const statRes = await axios.get('https://api.twelvedata.com/statistics', {
            params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
        });
        const stats = statRes.data?.statistics || {};
        
        await wait(CONFIG.RATE_LIMIT / 2);
        
        // 4) Récupérer NAV via /etfs/world/summary
        let nav = 0, lastPrice = Number(quote.close) || 0;
        try {
            const sumRes = await axios.get('https://api.twelvedata.com/etfs/world/summary', {
                params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
            });
            const sum = sumRes.data?.etf?.summary || {};
            nav = Number(sum.nav) || 0;
            if (sum.last_price) lastPrice = Number(sum.last_price);
        } catch {
            // Certains ETF n'ont pas de données summary
        }
        
        // 5) Calculs
        const avgVolume = Number(quote.average_volume) || Number(quote.volume) * 0.8 || 0;
        const avgDollarVol = avgVolume * (Number(quote.close) || 0);
        const netAssets = Number(stats.net_assets) || Number(stats.market_capitalization) || 0;
        const premiumDiscount = nav ? (lastPrice - nav) / nav : 0;
        
        return {
            symbol,
            symbolParam,
            price: Number(quote.close) || 0,
            volume: Number(quote.volume) || 0,
            average_volume: avgVolume,
            net_assets: netAssets,
            nav: nav,
            avg_dollar_volume: avgDollarVol,
            premium_discount: premiumDiscount,
            vol_ratio: (Number(quote.volume) || 0) / (avgVolume || 1)
        };
    } catch (error) {
        console.error(`❌ ${symbol} – ${error.response?.status} ${error.response?.data?.message || error.message}`);
        return null;
    }
}

async function filterETFs() {
    console.log('📊 Filtrage avancé ETF/Bonds\n');
    
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
    console.log('🔍 Analyse des ETFs...\n');
    for (let i = 0; i < etfs.length; i++) {
        const etf = etfs[i];
        console.log(`${i+1}/${etfs.length}: ${etf.symbol}`);
        
        const data = await getETFData(etf.symbol, etf.exchange, etf.mic_code);
        await wait(CONFIG.RATE_LIMIT);
        
        if (!data) {
            results.rejected.push({ ...etf, reason: 'SYMBOL_NOT_FOUND' });
            continue;
        }
        
        // Déterminer les seuils selon la région
        const isUS = ['XNAS', 'XNYS', 'ARCX'].includes(etf.mic_code);
        const minAUM = isUS ? CONFIG.MIN_AUM_ETF_US : CONFIG.MIN_AUM_ETF_EU;
        const minVolume = isUS ? CONFIG.MIN_DOLLAR_VOL_ETF_US : CONFIG.MIN_DOLLAR_VOL_ETF_EU;
        
        // Logger les valeurs
        console.log(
            `  ${data.symbolParam}  |  AUM: ${(data.net_assets/1e6).toFixed(0)} M$` +
            `  |  $Vol: ${(data.avg_dollar_volume/1e6).toFixed(2)} M$` +
            `  |  ΔNAV: ${(data.premium_discount*100).toFixed(2)}%`
        );
        
        // Appliquer les filtres
        const filters = {
            aum: data.net_assets >= minAUM,
            liquidity: data.avg_dollar_volume >= minVolume,
            nav_discount: Math.abs(data.premium_discount) <= CONFIG.MAX_NAV_DISCOUNT
        };
        
        const passAll = Object.values(filters).every(v => v);
        
        if (passAll) {
            results.etfs.push({ ...etf, ...data });
            console.log(`  ✅ PASS\n`);
        } else {
            const failed = Object.entries(filters).filter(([k,v]) => !v).map(([k]) => k);
            results.rejected.push({ 
                ...etf, 
                ...data,
                failed: failed
            });
            console.log(`  ❌ FAIL: ${failed.join(', ')}\n`);
        }
    }
    
    // Traiter Bonds
    console.log('🔍 Analyse des Bonds...\n');
    for (let i = 0; i < bonds.length; i++) {
        const bond = bonds[i];
        console.log(`${i+1}/${bonds.length}: ${bond.symbol}`);
        
        const data = await getETFData(bond.symbol, bond.exchange, bond.mic_code);
        await wait(CONFIG.RATE_LIMIT);
        
        if (!data) {
            results.rejected.push({ ...bond, reason: 'SYMBOL_NOT_FOUND' });
            continue;
        }
        
        console.log(
            `  ${data.symbolParam}  |  AUM: ${(data.net_assets/1e6).toFixed(0)} M$` +
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
            console.log(`  ✅ PASS\n`);
        } else {
            const failed = Object.entries(filters).filter(([k,v]) => !v).map(([k]) => k);
            results.rejected.push({ 
                ...bond, 
                ...data,
                failed: failed
            });
            console.log(`  ❌ FAIL: ${failed.join(', ')}\n`);
        }
    }
    
    // Statistiques finales
    results.stats.etfs_retained = results.etfs.length;
    results.stats.bonds_retained = results.bonds.length;
    results.stats.total_retained = results.etfs.length + results.bonds.length;
    results.stats.rejected_count = results.rejected.length;
    
    // Sauvegarder
    await fs.writeFile('data/filtered_advanced.json', JSON.stringify(results, null, 2));
    
    console.log('\n📊 RÉSUMÉ:');
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
