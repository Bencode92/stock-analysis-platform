// etf-advanced-filter.js
// Filtre ETF/Bonds sur 3 critères: AUM, liquidité, écart NAV
// Version corrigée pour gérer SEDOL, ISIN, permissions API et volumes manquants

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

// Nettoyer les symboles avec points
function cleanSymbol(symbol) {
    if (symbol.includes('.')) {
        return symbol.split('.')[0]; // "27IT.EUR" → "27IT"
    }
    return symbol;
}

// Fonction de recherche générique
async function search(params, apiKey) {
    try {
        const { data } = await axios.get('https://api.twelvedata.com/symbol_search', {
            params: { ...params, apikey: apiKey }
        });
        return data?.data?.[0];
    } catch (error) {
        console.error(`Erreur symbol_search:`, error.message);
        return null;
    }
}

async function resolveSymbol(raw, isin, apiKey) {
    // Vérifier le cache
    const cacheKey = `${raw}|${isin || ''}`;
    if (symbolCache.has(cacheKey)) {
        return symbolCache.get(cacheKey);
    }
    
    try {
        const cleaned = cleanSymbol(raw);
        
        // 1) Tenter ticker
        let result = await search({ symbol: cleaned }, apiKey);
        
        // 2) Si échec et ISIN disponible, tenter ISIN
        if (!result && isin) {
            result = await search({ isin: isin }, apiKey);
        }
        
        if (result) {
            const resolved = `${result.symbol}:${result.mic_code}`;
            symbolCache.set(cacheKey, resolved);
            console.log(`  → Résolu: ${raw} ${isin ? `(ISIN: ${isin})` : ''} → ${resolved}`);
            return resolved;
        }
        
        // Probablement un SEDOL non reconnu
        console.warn(`  → Impossible de résoudre ${raw} (ISIN: ${isin || 'N/A'})`);
        symbolCache.set(cacheKey, null);
        
    } catch (error) {
        console.error(`  → Échec résolution ${raw}: ${error.message}`);
        symbolCache.set(cacheKey, null);
    }
    
    return null;
}

// Calculer le volume moyen sur 30 jours
async function calculateAverageVolume(symbolParam, apiKey) {
    try {
        const ts = await axios.get('https://api.twelvedata.com/time_series', {
            params: { 
                symbol: symbolParam, 
                interval: '1day', 
                outputsize: 30, 
                apikey: apiKey 
            }
        });
        
        if (ts.data?.values?.length > 0) {
            const avgVol = ts.data.values.reduce((sum, v) => sum + Number(v.volume || 0), 0) / ts.data.values.length;
            console.log(`  → Volume moyen calculé sur 30j: ${(avgVol/1000).toFixed(0)}k`);
            return avgVol;
        }
    } catch (error) {
        console.error(`  → Échec calcul volume moyen: ${error.message}`);
    }
    return 0;
}

async function getETFData(symbol, exchange, mic_code, isin) {
    try {
        // D'abord résoudre le symbole si nécessaire
        let symbolParam = mic_code ? `${cleanSymbol(symbol)}:${mic_code}` : cleanSymbol(symbol);
        
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
        
        // 2) Si échec: résolution du symbole avec ISIN
        if (!quote) {
            const resolved = await resolveSymbol(symbol, isin, CONFIG.API_KEY);
            if (resolved) {
                symbolParam = resolved;
                const quoteRes = await axios.get('https://api.twelvedata.com/quote', {
                    params: { symbol: resolved, apikey: CONFIG.API_KEY }
                });
                quote = quoteRes.data;
                if (quote.status === 'error') {
                    console.error(`❌ ${symbol} — Erreur après résolution: ${quote.message}`);
                    return null;
                }
            } else {
                console.error(`❌ ${symbol} — Impossible de résoudre le symbole`);
                return null;
            }
        }
        
        if (!quote || quote.status === 'error') {
            return null;
        }
        
        await wait(CONFIG.RATE_LIMIT / 2);
        
        // 3) Récupérer AUM via /statistics
        let netAssets = 0;
        try {
            const statRes = await axios.get('https://api.twelvedata.com/statistics', {
                params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
            });
            
            if (statRes.data?.status === 'error') {
                if (CONFIG.DEBUG) {
                    console.warn(`  → /statistics erreur: ${statRes.data.message}`);
                }
                // Si permission denied, utiliser market cap de /quote
                netAssets = Number(quote.market_capitalization) || 0;
            } else {
                const stats = statRes.data?.statistics || {};
                netAssets = Number(stats.net_assets) || Number(stats.market_capitalization) || 0;
            }
        } catch (error) {
            // Fallback sur market cap de quote
            netAssets = Number(quote.market_capitalization) || 0;
        }
        
        await wait(CONFIG.RATE_LIMIT / 2);
        
        // 4) Récupérer NAV - essayer d'abord /etfs/world/summary
        let nav = 0, lastPrice = Number(quote.close) || 0;
        let navAvailable = false;
        
        try {
            const sumRes = await axios.get('https://api.twelvedata.com/etfs/world/summary', {
                params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
            });
            
            if (sumRes.data?.status === 'error') {
                if (CONFIG.DEBUG) {
                    console.warn(`  → /etfs/world/summary erreur: ${sumRes.data.message}`);
                }
            } else {
                const sum = sumRes.data?.etf?.summary || {};
                nav = Number(sum.nav) || 0;
                navAvailable = nav > 0;
                if (sum.last_price) lastPrice = Number(sum.last_price);
            }
        } catch (error) {
            // Endpoint non disponible
        }
        
        // Si pas de NAV via /etfs, essayer /price comme fallback
        if (!navAvailable) {
            try {
                const priceRes = await axios.get('https://api.twelvedata.com/price', {
                    params: { symbol: symbolParam, apikey: CONFIG.API_KEY, format: 'JSON' }
                });
                if (priceRes.data?.price) {
                    // Approximation: NAV ≈ price (pas idéal mais mieux que rien)
                    nav = Number(priceRes.data.price);
                    navAvailable = nav > 0;
                }
            } catch (error) {
                // Pas grave, on continue sans NAV
            }
        }
        
        // 5) Calculer le volume moyen
        let avgVolume = Number(quote.average_volume) || 0;
        
        // Si pas de volume moyen, le calculer sur 30 jours
        if (!avgVolume || avgVolume === 0) {
            await wait(CONFIG.RATE_LIMIT / 2);
            avgVolume = await calculateAverageVolume(symbolParam, CONFIG.API_KEY);
        }
        
        // Si toujours pas de volume, utiliser le volume du jour * 0.8
        if (!avgVolume) {
            avgVolume = Number(quote.volume) * 0.8 || 0;
        }
        
        const avgDollarVol = avgVolume * (Number(quote.close) || 0);
        const premiumDiscount = nav && navAvailable ? (lastPrice - nav) / nav : 0;
        
        return {
            symbol: symbol,
            isin: isin,
            symbolParam,
            price: Number(quote.close) || 0,
            volume: Number(quote.volume) || 0,
            average_volume: avgVolume,
            net_assets: netAssets,
            nav: nav,
            nav_available: navAvailable,
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
    console.log('📊 Filtrage avancé ETF/Bonds (v2 - gestion permissions)\n');
    
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
        console.log(`${i+1}/${etfs.length}: ${etf.symbol} (ISIN: ${etf.isin || 'N/A'})`);
        
        const data = await getETFData(etf.symbol, etf.exchange, etf.mic_code, etf.isin);
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
        const navInfo = data.nav_available ? `${(data.premium_discount*100).toFixed(2)}%` : 'n/a';
        console.log(
            `  ${data.symbolParam}  |  AUM: ${(data.net_assets/1e6).toFixed(0)} M$` +
            `  |  $Vol: ${(data.avg_dollar_volume/1e6).toFixed(2)} M$` +
            `  |  ΔNAV: ${navInfo}`
        );
        
        // Appliquer les filtres
        const filters = {
            aum: data.net_assets >= minAUM,
            liquidity: data.avg_dollar_volume >= minVolume,
            // Skip NAV test si pas disponible
            nav_discount: !data.nav_available || Math.abs(data.premium_discount) <= CONFIG.MAX_NAV_DISCOUNT
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
        console.log(`${i+1}/${bonds.length}: ${bond.symbol} (ISIN: ${bond.isin || 'N/A'})`);
        
        const data = await getETFData(bond.symbol, bond.exchange, bond.mic_code, bond.isin);
        await wait(CONFIG.RATE_LIMIT);
        
        if (!data) {
            results.rejected.push({ ...bond, reason: 'SYMBOL_NOT_FOUND' });
            continue;
        }
        
        const navInfo = data.nav_available ? `${(data.premium_discount*100).toFixed(2)}%` : 'n/a';
        console.log(
            `  ${data.symbolParam}  |  AUM: ${(data.net_assets/1e6).toFixed(0)} M$` +
            `  |  $Vol: ${(data.avg_dollar_volume/1e6).toFixed(2)} M$` +
            `  |  ΔNAV: ${navInfo}`
        );
        
        const filters = {
            aum: data.net_assets >= CONFIG.MIN_AUM_BOND,
            liquidity: data.avg_dollar_volume >= CONFIG.MIN_DOLLAR_VOL_BOND,
            nav_discount: !data.nav_available || Math.abs(data.premium_discount) <= CONFIG.MAX_NAV_DISCOUNT
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
    
    // Analyser les raisons de rejet
    const rejectionReasons = {};
    results.rejected.forEach(item => {
        if (item.reason) {
            rejectionReasons[item.reason] = (rejectionReasons[item.reason] || 0) + 1;
        } else if (item.failed) {
            item.failed.forEach(f => {
                rejectionReasons[f] = (rejectionReasons[f] || 0) + 1;
            });
        }
    });
    
    results.stats.rejection_reasons = rejectionReasons;
    
    // Sauvegarder
    await fs.writeFile('data/filtered_advanced.json', JSON.stringify(results, null, 2));
    
    console.log('\n📊 RÉSUMÉ:');
    console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`);
    console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`);
    console.log(`Rejetés: ${results.rejected.length}`);
    console.log('\nRaisons de rejet:');
    Object.entries(rejectionReasons).forEach(([reason, count]) => {
        console.log(`  - ${reason}: ${count}`);
    });
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
