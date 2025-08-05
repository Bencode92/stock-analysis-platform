// etf-advanced-filter.js
// Filtre ETF/Bonds sur 3 critères: AUM, liquidité, écart NAV
// Version corrigée pour gérer SEDOL, ISIN, permissions API et volumes manquants
// v6: Ajout de tous les champs manquants (change, TER, sectors, holdings) via /etfs/world

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
        ETF_WORLD: 200,           // /etfs/world (remplace ETF_SUMMARY)
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
        
        // Extraire les données de quote (incluant change et percent_change)
        const currentVolume = Number(quote.volume) || 0;
        const avgVolumeQuote = Number(quote.average_volume) || 0;
        let price = Number(quote.close) || 0;
        const change = Number(quote.change) || 0;
        const percentChange = Number(quote.percent_change) || 0;
        
        // OPTIMISATION: Vérifier d'abord le volume avant d'appeler les endpoints coûteux
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
        
        // 5) Vérifier si ça vaut le coup d'appeler /etfs/world (200 crédits)
        const isUS = US_MIC_CODES.includes(mic_code);
        const minAUM = isUS ? CONFIG.MIN_AUM_ETF_US : CONFIG.MIN_AUM_ETF_EU;
        const passesBasicFilters = (netAssets >= minAUM || (netAssets === 0 && avgDollarVol >= CONFIG.MIN_DOLLAR_VOL_FALLBACK)) 
                                  && avgDollarVol >= minVolRequired;
        
        // Variables pour les données enrichies
        let nav = 0, navAvailable = false;
        let fundType = '', expenseRatio = 0, yieldTTM = 0, inceptionDate = '';
        let trailingReturns = {}, sectors = [], topHoldings = [], countries = [];
        let risk3Y = {};
        
        if (passesBasicFilters) {
            // Récupérer TOUTES les données via /etfs/world (200 CRÉDITS)
            try {
                await pay(CONFIG.CREDITS.ETF_WORLD);
                const worldRes = await axios.get('https://api.twelvedata.com/etfs/world', {
                    params: { symbol: symbolParam, apikey: CONFIG.API_KEY }
                });
                
                if (worldRes.data?.status !== 'error') {
                    const etf = worldRes.data?.etf || worldRes.data || {};
                    const summary = etf.summary || {};
                    const performance = etf.performance || {};
                    const risk = etf.risk || {};
                    const composition = etf.composition || {};
                    
                    // NAV et mise à jour du prix
                    nav = Number(summary.nav) || 0;
                    navAvailable = nav > 0;
                    if (summary.last_price) price = Number(summary.last_price);
                    
                    // Fallback AUM si /statistics a renvoyé 0
                    if (!netAssets && summary.net_assets) {
                        netAssets = Number(summary.net_assets) || 0;
                        if (CONFIG.DEBUG && netAssets > 0) {
                            console.log(`  → AUM fallback depuis /etfs/world: ${(netAssets/1e6).toFixed(0)}M$`);
                        }
                    }
                    
                    // Extraire les informations du fonds
                    fundType = summary.fund_type || '';
                    expenseRatio = Number(summary.expense_ratio_net) || 0;
                    yieldTTM = Number(summary.yield) || 0;
                    inceptionDate = summary.share_class_inception_date || '';
                    
                    // Performance trailing returns
                    if (performance.trailing_returns) {
                        performance.trailing_returns.forEach(tr => {
                            if (tr.period && tr.return !== undefined) {
                                trailingReturns[tr.period] = Number(tr.return) || 0;
                            }
                        });
                    }
                    
                    // Métriques de risque 3 ans
                    const volatilityMeasures = risk.volatility_measures || [];
                    risk3Y = volatilityMeasures.find(r => r.period === '3_year') || {};
                    
                    // Composition
                    sectors = (composition.major_market_sectors || []).map(s => ({
                        name: s.name || '',
                        weight: Number(s.weight) || 0
                    }));
                    
                    topHoldings = (composition.top_holdings || []).slice(0, 10).map(h => ({
                        symbol: h.symbol || '',
                        name: h.name || '',
                        weight: Number(h.weight) || 0
                    }));
                    
                    countries = (composition.country_allocation || []).map(c => ({
                        name: c.name || '',
                        weight: Number(c.weight) || 0
                    }));
                }
            } catch (error) {
                if (CONFIG.DEBUG) {
                    console.warn(`  → /etfs/world exception: ${error.message}`);
                }
            }
        }
        
        const premiumDiscount = navAvailable && nav ? (price - nav) / nav : 0;
        
        return {
            // Identification
            symbol: symbol,
            isin: isin,
            symbolParam,
            
            // Prix et variations
            price: price,
            change: change,
            percent_change: percentChange,
            volume: currentVolume,
            average_volume: avgVolume,
            
            // Métriques clés
            net_assets: netAssets,
            avg_dollar_volume: avgDollarVol,
            
            // NAV
            nav: nav,
            nav_available: navAvailable,
            premium_discount: premiumDiscount,
            
            // Informations du fonds
            fund_type: fundType,
            expense_ratio: expenseRatio,
            yield_ttm: yieldTTM,
            inception_date: inceptionDate,
            
            // Performance
            trailing_returns: trailingReturns,
            ytd_return: trailingReturns['ytd'] || 0,
            one_year_return: trailingReturns['1_year'] || 0,
            three_year_return: trailingReturns['3_year'] || 0,
            five_year_return: trailingReturns['5_year'] || 0,
            
            // Risque 3 ans
            volatility_3y: risk3Y.volatility || null,
            sharpe_3y: risk3Y.sharpe_ratio || null,
            beta_3y: risk3Y.beta || null,
            
            // Composition
            sectors: sectors,
            top_holdings: topHoldings,
            countries: countries,
            
            // Ratio pour analyse
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
                `  |  ΔNAV: ${navInfo}` +
                `  |  Chg: ${data.percent_change.toFixed(2)}%`
            );
            
            // Si on a récupéré des données enrichies, les logger
            if (data.fund_type) {
                console.log(
                    `    → Type: ${data.fund_type}` +
                    `  |  TER: ${(data.expense_ratio*100).toFixed(2)}%` +
                    `  |  Yield: ${data.yield_ttm.toFixed(2)}%` +
                    `  |  Sectors: ${data.sectors.length}` +
                    `  |  Holdings: ${data.top_holdings.length}`
                );
            }
            
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
    console.log('📊 Filtrage avancé ETF/Bonds (v6 - données complètes)\n');
    console.log(`⚙️  Limite: ${CONFIG.CREDIT_LIMIT} crédits/min, ${CONFIG.CHUNK_SIZE} ETF en parallèle`);
    console.log(`📝  Collecte: Prix, NAV, TER, Yield, Sectors, Holdings, Risk 3Y\n`);
    
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
    
    // Statistiques de qualité des données
    results.stats.data_quality = {
        with_nav: results.etfs.filter(e => e.nav_available).length,
        with_fund_type: results.etfs.filter(e => e.fund_type).length,
        with_expense_ratio: results.etfs.filter(e => e.expense_ratio > 0).length,
        with_sectors: results.etfs.filter(e => e.sectors && e.sectors.length > 0).length,
        with_holdings: results.etfs.filter(e => e.top_holdings && e.top_holdings.length > 0).length,
        with_risk_metrics: results.etfs.filter(e => e.volatility_3y !== null).length
    };
    
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
    
    // Créer aussi un CSV détaillé
    const csvHeader = 'symbol,mic_code,price,change_%,aum_usd,adv_usd,expense_ratio,yield_ttm,nav,premium_discount,sectors,holdings\n';
    const csvRows = results.etfs.map(etf => 
        `${etf.symbol},${etf.mic_code},${etf.price},${etf.percent_change},${etf.net_assets},${etf.avg_dollar_volume},${etf.expense_ratio},${etf.yield_ttm},${etf.nav || ''},${etf.premium_discount || ''},${etf.sectors?.length || 0},${etf.top_holdings?.length || 0}`
    ).join('\n');
    await fs.writeFile('data/filtered_advanced.csv', csvHeader + csvRows);
    
    console.log('\n📊 RÉSUMÉ:');
    console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`);
    console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`);
    console.log(`Rejetés: ${results.rejected.length}`);
    console.log(`Utilisations fallback AUM: ${results.stats.aum_fallback_used}`);
    console.log(`Temps total: ${results.stats.elapsed_seconds}s`);
    
    console.log('\n📈 Qualité des données:');
    console.log(`  - Avec NAV: ${results.stats.data_quality.with_nav}/${results.etfs.length}`);
    console.log(`  - Avec Fund Type: ${results.stats.data_quality.with_fund_type}/${results.etfs.length}`);
    console.log(`  - Avec TER: ${results.stats.data_quality.with_expense_ratio}/${results.etfs.length}`);
    console.log(`  - Avec Sectors: ${results.stats.data_quality.with_sectors}/${results.etfs.length}`);
    console.log(`  - Avec Holdings: ${results.stats.data_quality.with_holdings}/${results.etfs.length}`);
    console.log(`  - Avec Risk 3Y: ${results.stats.data_quality.with_risk_metrics}/${results.etfs.length}`);
    
    console.log('\nRaisons de rejet:');
    Object.entries(rejectionReasons).forEach(([reason, count]) => {
        console.log(`  - ${reason}: ${count}`);
    });
    
    console.log(`\n✅ Résultats: data/filtered_advanced.json`);
    console.log(`📊 CSV: data/filtered_advanced.csv`);
    
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
