// etf-advanced-filter.js
// Filtre ETF/Bonds sur 3 critères: AUM, liquidité, écart NAV
// Version corrigée pour gérer SEDOL, ISIN, permissions API et volumes manquants
// v5: Fix symboles US (pas de :MIC) + optimisation ordre des appels

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
    RATE_LIMIT: 800,
    // Seuil fallback pour AUM manquant
    MIN_DOLLAR_VOL_FALLBACK: 1e6,  // 1M$ par jour
    // Gestion des crédits API
    CREDIT_LIMIT: 2500,           // par minute
    CHUNK_SIZE: 12,               // 12 ETF en parallèle max
    CREDITS: {
        ETF_SUMMARY: 200,         // /etfs/world/summary
        QUOTE: 0,                 // gratuit
        TIME_SERIES: 5,           // /time_series (1 bar)
        STATISTICS: 0,            // gratuit sur plan Ultra
        PRICE: 0,                 // gratuit
        SYMBOL_SEARCH: 0          // gratuit
    }
};

// MIC codes US qui n'utilisent PAS de suffixe
const US_MIC_CODES = ['ARCX', 'BATS', 'XNAS', 'XNYS', 'XASE', 'XNGS', 'XNMS'];

// Cache pour les symboles résolus
const symbolCache = new Map();

// Gestion des crédits API
let creditsUsed = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000; // 1 minute

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Système de paiement des crédits
async function pay(cost) {
    while (true) {
        const now = Date.now();
        // Nouvelle minute ?
        if (now - windowStart > WINDOW_MS) {
            creditsUsed = 0;
            windowStart = now;
            if (CONFIG.DEBUG) {
                console.log('💳 Nouvelle fenêtre de crédits (2500 disponibles)');
            }
        }
        
        // Assez de crédits ?
        if (creditsUsed + cost <= CONFIG.CREDIT_LIMIT) {
            creditsUsed += cost;
            if (CONFIG.DEBUG && cost > 0) {
                console.log(`💳 ${cost} crédits utilisés (${creditsUsed}/${CONFIG.CREDIT_LIMIT})`);
            }
            return;
        }
        
        // Sinon attendre
        const remaining = WINDOW_MS - (now - windowStart);
        if (CONFIG.DEBUG) {
            console.log(`⏳ Limite crédit atteinte, attente ${(remaining/1000).toFixed(1)}s...`);
        }
        await wait(250);
    }
}

// Nettoyer les symboles avec points
function cleanSymbol(symbol) {
    if (symbol.includes('.')) {
        return symbol.split('.')[0]; // "27IT.EUR" → "27IT"
    }
    return symbol;
}

// Construire le symbole selon le marché
function buildSymbolParam(symbol, mic_code) {
    const cleaned = cleanSymbol(symbol);
    
    // Les symboles US n'utilisent PAS de suffixe MIC
    if (US_MIC_CODES.includes(mic_code)) {
        return cleaned;
    }
    
    // Autres marchés : ajouter le MIC si disponible
    return mic_code ? `${cleaned}:${mic_code}` : cleaned;
}

// Fonction de recherche générique
async function search(params, apiKey) {
    try {
        // Symbol search est gratuit
        const { data } = await axios.get('https://api.twelvedata.com/symbol_search', {
            params: { ...params, apikey: apiKey }
        });
        return data?.data?.[0];
    } catch (error) {
        console.error(`Erreur symbol_search:`, error.message);
        return null;
    }
}

// Essayer un appel quote
async function tryQuote(symbolParam, apiKey) {
    try {
        const quoteRes = await axios.get('https://api.twelvedata.com/quote', {
            params: { symbol: symbolParam, apikey: apiKey }
        });
        
        if (quoteRes.data?.status === 'error') {
            return null;
        }
        
        return quoteRes.data;
    } catch {
        return null;
    }
}

async function resolveSymbol(raw, isin, mic_code, apiKey) {
    // Vérifier le cache
    const cacheKey = `${raw}|${isin || ''}|${mic_code || ''}`;
    if (symbolCache.has(cacheKey)) {
        return symbolCache.get(cacheKey);
    }
    
    try {
        const cleaned = cleanSymbol(raw);
        
        // 1) Essayer d'abord le ticker nu
        let quote = await tryQuote(cleaned, apiKey);
        if (quote) {
            symbolCache.set(cacheKey, cleaned);
            console.log(`  → Résolu: ${raw} → ${cleaned} (ticker nu)`);
            return cleaned;
        }
        
        // 2) Si échec et pas US, essayer avec :MIC
        if (!US_MIC_CODES.includes(mic_code) && mic_code) {
            const withMic = `${cleaned}:${mic_code}`;
            quote = await tryQuote(withMic, apiKey);
            if (quote) {
                symbolCache.set(cacheKey, withMic);
                console.log(`  → Résolu: ${raw} → ${withMic} (avec MIC)`);
                return withMic;
            }
        }
        
        // 3) Si toujours échec, utiliser symbol_search
        let result = await search({ symbol: cleaned }, apiKey);
        
        // 4) Si échec et ISIN disponible, tenter ISIN
        if (!result && isin) {
            result = await search({ isin: isin }, apiKey);
        }
        
        if (result) {
            // Construire le symbole selon le marché trouvé
            const resolved = US_MIC_CODES.includes(result.mic_code) 
                ? result.symbol 
                : `${result.symbol}:${result.mic_code}`;
            symbolCache.set(cacheKey, resolved);
            console.log(`  → Résolu via search: ${raw} ${isin ? `(ISIN: ${isin})` : ''} → ${resolved}`);
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
        // Time series coûte des crédits
        await pay(CONFIG.CREDITS.TIME_SERIES);
        
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
        // Construire le symbole initial
        let symbolParam = buildSymbolParam(symbol, mic_code);
        
        // 1) Tentative directe /quote (GRATUIT)
        let quote = await tryQuote(symbolParam, CONFIG.API_KEY);
        
        // 2) Si échec: résolution du symbole
        if (!quote) {
            const resolved = await resolveSymbol(symbol, isin, mic_code, CONFIG.API_KEY);
            if (resolved) {
                symbolParam = resolved;
                quote = await tryQuote(resolved, CONFIG.API_KEY);
                if (!quote) {
                    console.error(`❌ ${symbol} — Quote impossible même après résolution`);
                    return null;
                }
            } else {
                console.error(`❌ ${symbol} — Impossible de résoudre le symbole`);
                return null;
            }
        }
        
        // OPTIMISATION: Vérifier d'abord le volume avant d'appeler les endpoints coûteux
        const currentVolume = Number(quote.volume) || 0;
        const avgVolumeQuote = Number(quote.average_volume) || 0;
        const price = Number(quote.close) || 0;
        
        // Estimation rapide du volume dollar
        const estimatedDollarVol = (avgVolumeQuote || currentVolume * 0.8) * price;
        
        // Si le volume est clairement insuffisant, rejeter tout de suite
        const minVolRequired = mic_code && US_MIC_CODES.includes(mic_code) 
            ? CONFIG.MIN_DOLLAR_VOL_ETF_US 
            : CONFIG.MIN_DOLLAR_VOL_ETF_EU;
            
        if (estimatedDollarVol < minVolRequired * 0.5) { // Marge de 50%
            console.log(`  → Rejet précoce: volume estimé ${(estimatedDollarVol/1e6).toFixed(2)}M$ < ${(minVolRequired*0.5/1e6).toFixed(1)}M$`);
            return null;
        }
        
        // 3) Récupérer AUM via /statistics (GRATUIT sur Ultra)
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
        
        // 4) Calculer le volume moyen définitif
        let avgVolume = avgVolumeQuote;
        
        // Éviter time_series si possible (économie de crédits)
        // Pour US/UK/XETR, le volume moyen est généralement fiable dans quote
        const reliableVolumeMarkets = ['XNAS', 'XNYS', 'ARCX', 'XLON', 'XETR'];
        const hasReliableVolume = reliableVolumeMarkets.includes(mic_code);
        
        // Si pas de volume moyen ET marché peu fiable, calculer sur 30 jours
        if ((!avgVolume || avgVolume === 0) && !hasReliableVolume) {
            avgVolume = await calculateAverageVolume(symbolParam, CONFIG.API_KEY);
        }
        
        // Si toujours pas de volume, utiliser le volume du jour * 0.8
        if (!avgVolume) {
            avgVolume = currentVolume * 0.8 || 0;
        }
        
        const avgDollarVol = avgVolume * price;
        
        // 5) NAV - seulement si l'ETF a passé les filtres volume et AUM
        let nav = 0, navAvailable = false;
        const premiumDiscount = 0;
        
        // Vérifier si ça vaut le coup d'appeler /etfs/world/summary (200 crédits)
        const isUS = US_MIC_CODES.includes(mic_code);
        const minAUM = isUS ? CONFIG.MIN_AUM_ETF_US : CONFIG.MIN_AUM_ETF_EU;
        const passesBasicFilters = (netAssets >= minAUM || (netAssets === 0 && avgDollarVol >= CONFIG.MIN_DOLLAR_VOL_FALLBACK)) 
                                  && avgDollarVol >= minVolRequired;
        
        if (passesBasicFilters) {
            // Récupérer NAV via /etfs/world/summary (200 CRÉDITS)
            try {
                await pay(CONFIG.CREDITS.ETF_SUMMARY);
                const sumRes = await axios.get('https://api.twelvedata.com/etfs/world/summary', {
                    params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
                });
                
                if (sumRes.data?.status !== 'error') {
                    const sum = sumRes.data?.etf?.summary || {};
                    nav = Number(sum.nav) || 0;
                    navAvailable = nav > 0;
                    if (sum.last_price) price = Number(sum.last_price);
                }
            } catch (error) {
                // Pas grave, on continue sans NAV
            }
        }
        
        return {
            symbol: symbol,
            isin: isin,
            symbolParam,
            price: price,
            volume: currentVolume,
            average_volume: avgVolume,
            net_assets: netAssets,
            nav: nav,
            nav_available: navAvailable,
            avg_dollar_volume: avgDollarVol,
            premium_discount: navAvailable && nav ? (price - nav) / nav : 0,
            vol_ratio: currentVolume / (avgVolume || 1)
        };
    } catch (error) {
        console.error(`❌ ${symbol} – ${error.response?.status} ${error.response?.data?.message || error.message}`);
        return null;
    }
}

// Traiter un lot d'ETF en parallèle
async function processBatch(items, type = 'ETF') {
    const results = await Promise.all(
        items.map(async (item) => {
            const data = await getETFData(item.symbol, item.exchange, item.mic_code, item.isin);
            
            if (!data) {
                return { success: false, item: { ...item, reason: 'SYMBOL_NOT_FOUND' } };
            }
            
            // Déterminer les seuils selon le type et la région
            let minAUM, minVolume;
            if (type === 'BOND') {
                minAUM = CONFIG.MIN_AUM_BOND;
                minVolume = CONFIG.MIN_DOLLAR_VOL_BOND;
            } else {
                const isUS = US_MIC_CODES.includes(item.mic_code);
                minAUM = isUS ? CONFIG.MIN_AUM_ETF_US : CONFIG.MIN_AUM_ETF_EU;
                minVolume = isUS ? CONFIG.MIN_DOLLAR_VOL_ETF_US : CONFIG.MIN_DOLLAR_VOL_ETF_EU;
            }
            
            // Logger les valeurs
            const navInfo = data.nav_available ? `${(data.premium_discount*100).toFixed(2)}%` : 'n/a';
            const aumInfo = data.net_assets === 0 ? '0 (fallback)' : `${(data.net_assets/1e6).toFixed(0)} M$`;
            console.log(
                `  ${data.symbolParam}  |  AUM: ${aumInfo}` +
                `  |  $Vol: ${(data.avg_dollar_volume/1e6).toFixed(2)} M$` +
                `  |  ΔNAV: ${navInfo}`
            );
            
            // Appliquer les filtres avec règle fallback pour AUM
            const filters = {
                aum: data.net_assets >= minAUM ||  // règle normale
                     (data.net_assets === 0 && data.avg_dollar_volume >= CONFIG.MIN_DOLLAR_VOL_FALLBACK), // règle fallback
                liquidity: data.avg_dollar_volume >= minVolume,
                nav_discount: !data.nav_available || Math.abs(data.premium_discount) <= CONFIG.MAX_NAV_DISCOUNT
            };
            
            const passAll = Object.values(filters).every(v => v);
            
            if (passAll) {
                console.log(`  ✅ PASS\n`);
                return { success: true, item: { ...item, ...data } };
            } else {
                const failed = Object.entries(filters).filter(([k,v]) => !v).map(([k]) => k);
                console.log(`  ❌ FAIL: ${failed.join(', ')}\n`);
                return { 
                    success: false, 
                    item: { ...item, ...data, failed: failed }
                };
            }
        })
    );
    
    return results;
}

async function filterETFs() {
    console.log('📊 Filtrage avancé ETF/Bonds (v5 - fix symboles US)\n');
    console.log(`⚙️  Limite: ${CONFIG.CREDIT_LIMIT} crédits/min, ${CONFIG.CHUNK_SIZE} ETF en parallèle\n`);
    
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
            timestamp: new Date().toISOString(),
            start_time: Date.now()
        }
    };
    
    // Traiter ETFs par lots
    console.log(`🔍 Analyse des ETFs (${etfs.length} total)...\n`);
    for (let i = 0; i < etfs.length; i += CONFIG.CHUNK_SIZE) {
        const batch = etfs.slice(i, i + CONFIG.CHUNK_SIZE);
        console.log(`📦 Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: ETF ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, etfs.length)}`);
        
        const batchResults = await processBatch(batch, 'ETF');
        
        batchResults.forEach(result => {
            if (result.success) {
                results.etfs.push(result.item);
            } else {
                results.rejected.push(result.item);
            }
        });
    }
    
    // Traiter Bonds par lots
    console.log(`🔍 Analyse des Bonds (${bonds.length} total)...\n`);
    for (let i = 0; i < bonds.length; i += CONFIG.CHUNK_SIZE) {
        const batch = bonds.slice(i, i + CONFIG.CHUNK_SIZE);
        console.log(`📦 Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: BOND ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, bonds.length)}`);
        
        const batchResults = await processBatch(batch, 'BOND');
        
        batchResults.forEach(result => {
            if (result.success) {
                results.bonds.push(result.item);
            } else {
                results.rejected.push(result.item);
            }
        });
    }
    
    // Statistiques finales
    const elapsedTime = Date.now() - results.stats.start_time;
    results.stats.elapsed_seconds = Math.round(elapsedTime / 1000);
    results.stats.etfs_retained = results.etfs.length;
    results.stats.bonds_retained = results.bonds.length;
    results.stats.total_retained = results.etfs.length + results.bonds.length;
    results.stats.rejected_count = results.rejected.length;
    results.stats.aum_fallback_used = results.etfs.filter(e => e.net_assets === 0).length + 
                                      results.bonds.filter(b => b.net_assets === 0).length;
    
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
    console.log(`Utilisations fallback AUM: ${results.stats.aum_fallback_used}`);
    console.log(`Temps total: ${results.stats.elapsed_seconds}s`);
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
