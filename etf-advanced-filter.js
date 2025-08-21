// etf-advanced-filter.js
// Version hebdomadaire : Filtrage ADV + enrichissement summary/composition
// v9: Budget 2584 crédits/min, sort uniquement les données hebdo demandées

const fs = require('fs').promises;
const axios = require('axios');
const csv = require('csv-parse/sync');

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    
    // Seuils différenciés
    MIN_ADV_USD_ETF: 1_000_000,    // 1M$ pour ETF
    MIN_ADV_USD_BOND: 500_000,      // 500k$ pour Bonds (plus souple)
    
    // Config API
    DAYS_HISTORY: 30,
    CHUNK_SIZE: 12,
    CREDIT_LIMIT: 2584,  // Plafond exact par minute
    CREDITS: {
        TIME_SERIES: 5,
        QUOTE: 0,
        PRICE: 0,
        ETFS_SUMMARY: 200,
        ETFS_COMPOSITION: 200
    }
};

// MIC codes US
const US_MIC_CODES = ['ARCX', 'BATS', 'XNAS', 'XNYS', 'XASE', 'XNGS', 'XNMS'];

// Cache pour les symboles et FX
const symbolCache = new Map();
const fxCache = new Map();

// Gestion des crédits API
let creditsUsed = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;

// Calcul automatique de la concurrence pour l'enrichissement
const ENRICH_COST = (CONFIG.CREDITS.ETFS_SUMMARY + CONFIG.CREDITS.ETFS_COMPOSITION); // 400
const ENRICH_CONCURRENCY = Math.max(1, Math.floor(CONFIG.CREDIT_LIMIT / ENRICH_COST)); // 6

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function pay(cost) {
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

// Helpers pour tri et extraction
function sortDescBy(arr, key) {
    return [...(arr || [])].sort((a, b) => (Number(b?.[key]) || 0) - (Number(a?.[key]) || 0));
}

function topN(arr, key, n = 5) {
    return sortDescBy(arr, key).slice(0, n);
}

function sanitizeText(s, max = 240) {
    if (!s || typeof s !== 'string') return '';
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function cleanSymbol(symbol) {
    if (symbol.includes('.')) {
        return symbol.split('.')[0];
    }
    return symbol;
}

// Conversion FX améliorée avec support GBX
async function fxToUSD(currency) {
    if (!currency || currency === 'USD') return 1;
    
    // GBX = pence sterling (GBP/100)
    if (currency === 'GBX') {
        const gbpRate = await fxToUSD('GBP');
        return gbpRate / 100;
    }
    
    const cacheKey = currency;
    if (fxCache.has(cacheKey)) {
        return fxCache.get(cacheKey);
    }
    
    // Essayer CCY/USD
    try {
        const { data } = await axios.get('https://api.twelvedata.com/price', {
            params: { 
                symbol: `${currency}/USD`,
                apikey: CONFIG.API_KEY 
            }
        });
        const rate = Number(data?.price);
        if (rate > 0) {
            fxCache.set(cacheKey, rate);
            return rate;
        }
    } catch {}
    
    // Essayer USD/CCY (puis inverser)
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
            fxCache.set(cacheKey, inverted);
            return inverted;
        }
    } catch {}
    
    // Fallback
    console.warn(`⚠️ Taux FX ${currency}/USD non trouvé, utilise 1`);
    fxCache.set(cacheKey, 1);
    return 1;
}

// Résolution améliorée des symboles
async function resolveSymbol(item) {
    const { symbol, mic_code, isin } = item;
    const cleaned = cleanSymbol(symbol);
    
    // 1) Essayer ticker nu
    try {
        const quote = await axios.get('https://api.twelvedata.com/quote', {
            params: { symbol: cleaned, apikey: CONFIG.API_KEY }
        }).then(r => r.data);
        
        if (quote && quote.status !== 'error') {
            return { symbolParam: cleaned, quote };
        }
    } catch {}
    
    // 2) Essayer ticker:MIC
    if (mic_code && !US_MIC_CODES.includes(mic_code)) {
        try {
            const symbolWithMic = `${cleaned}:${mic_code}`;
            const quote = await axios.get('https://api.twelvedata.com/quote', {
                params: { symbol: symbolWithMic, apikey: CONFIG.API_KEY }
            }).then(r => r.data);
            
            if (quote && quote.status !== 'error') {
                return { symbolParam: symbolWithMic, quote };
            }
        } catch {}
    }
    
    // 3) Symbol search par ticker
    try {
        const search = await axios.get('https://api.twelvedata.com/symbol_search', {
            params: { symbol: cleaned, apikey: CONFIG.API_KEY }
        }).then(r => r.data);
        
        if (search?.data?.[0]) {
            const result = search.data[0];
            const resolvedSymbol = US_MIC_CODES.includes(result.mic_code) 
                ? result.symbol 
                : `${result.symbol}:${result.mic_code}`;
            
            const quote = await axios.get('https://api.twelvedata.com/quote', {
                params: { symbol: resolvedSymbol, apikey: CONFIG.API_KEY }
            }).then(r => r.data);
            
            if (quote && quote.status !== 'error') {
                return { symbolParam: resolvedSymbol, quote };
            }
        }
    } catch {}
    
    // 4) Symbol search par ISIN
    if (isin) {
        try {
            const search = await axios.get('https://api.twelvedata.com/symbol_search', {
                params: { isin: isin, apikey: CONFIG.API_KEY }
            }).then(r => r.data);
            
            if (search?.data?.[0]) {
                const result = search.data[0];
                const resolvedSymbol = US_MIC_CODES.includes(result.mic_code) 
                    ? result.symbol 
                    : `${result.symbol}:${result.mic_code}`;
                
                const quote = await axios.get('https://api.twelvedata.com/quote', {
                    params: { symbol: resolvedSymbol, apikey: CONFIG.API_KEY }
                }).then(r => r.data);
                
                if (quote && quote.status !== 'error') {
                    return { symbolParam: resolvedSymbol, quote };
                }
            }
        } catch {}
    }
    
    return null;
}

// Calculer ADV médiane sur 30 jours (retourne en monnaie locale)
async function calculate30DayADV(symbolParam) {
    try {
        await pay(CONFIG.CREDITS.TIME_SERIES);
        
        const { data } = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol: symbolParam,
                interval: '1day',
                outputsize: CONFIG.DAYS_HISTORY,
                apikey: CONFIG.API_KEY
            }
        });
        
        if (!data.values || data.status === 'error') {
            return null;
        }
        
        // Extraire les volumes en monnaie locale
        const advValues = data.values.map(day => {
            const volume = Number(day.volume) || 0;
            const close = Number(day.close) || 0;
            return volume * close;
        }).filter(v => v > 0);
        
        if (advValues.length === 0) return null;
        
        // Calculer la médiane
        advValues.sort((a, b) => a - b);
        const mid = Math.floor(advValues.length / 2);
        const medianLocal = advValues.length % 2 
            ? advValues[mid] 
            : (advValues[mid - 1] + advValues[mid]) / 2;
        
        return {
            adv_median_local: medianLocal,
            days_with_data: advValues.length
        };
        
    } catch (error) {
        if (CONFIG.DEBUG) {
            console.error(`Erreur ADV: ${error.message}`);
        }
        return null;
    }
}

// Pack hebdo : summary + composition (paye 400 crédits d'un coup)
async function fetchWeeklyPack(symbolParam) {
    // Réserve 400 crédits d'un coup (respecte 2584/min via pay)
    await pay(ENRICH_COST);

    // Appels parallèles (pas de pay() à l'intérieur !)
    const [sumRes, compRes] = await Promise.all([
        axios.get('https://api.twelvedata.com/etfs/world/summary', {
            params: { symbol: symbolParam, apikey: CONFIG.API_KEY, dp: 5 }
        }),
        axios.get('https://api.twelvedata.com/etfs/world/composition', {
            params: { symbol: symbolParam, apikey: CONFIG.API_KEY, dp: 5 }
        })
    ]);

    const s = sumRes?.data?.etf?.summary || {};
    const c = compRes?.data?.etf?.composition || {};

    // summary
    const pack = {
        aum_usd: (s.net_assets != null) ? Number(s.net_assets) : null,
        total_expense_ratio: (s.expense_ratio_net != null) ? Math.abs(Number(s.expense_ratio_net)) : null,
        yield_ttm: (s.yield != null) ? Number(s.yield) : null,
        currency: s.currency || null,
        fund_type: s.fund_type || null,
        objective: sanitizeText(s.overview || '')
    };

    // composition (secteurs/pays + top5 & top1)
    const sectors = (c.major_market_sectors || []).map(x => ({
        sector: x.sector, 
        weight: (x.weight != null) ? Number(x.weight) : null
    }));
    const countries = (c.country_allocation || []).map(x => ({
        country: x.country, 
        weight: (x.allocation != null) ? Number(x.allocation) : null
    }));
    const sector_top5 = topN(sectors, 'weight', 5);
    const country_top5 = topN(countries, 'weight', 5);

    return {
        ...pack,
        sectors,
        sector_top5,
        sector_top: sector_top5[0] || null,
        countries,
        country_top5,
        country_top: country_top5[0] || null
    };
}

// Traiter un ETF/Bond individuellement
async function processListing(item) {
    try {
        // Résolution du symbole
        const resolved = await resolveSymbol(item);
        if (!resolved) {
            return { ...item, reason: 'UNSUPPORTED_BY_PROVIDER' };
        }
        
        const { symbolParam, quote } = resolved;
        
        // Obtenir la devise depuis quote
        const currency = quote.currency || 'USD';
        const fx = await fxToUSD(currency);
        
        // Calculer ADV médiane 30j
        const advData = await calculate30DayADV(symbolParam);
        
        let adv_median_usd;
        
        if (advData) {
            // Convertir en USD
            adv_median_usd = advData.adv_median_local * fx;
        } else {
            // Fallback: utiliser average_volume de quote
            const avgVolume = Number(quote.average_volume) || Number(quote.volume) || 0;
            const price = Number(quote.close) || Number(quote.previous_close) || 0;
            adv_median_usd = avgVolume * price * fx;
        }
        
        // Retourner toutes les infos sans décider pass/fail
        return {
            ...item,
            symbolParam,
            currency,
            fx_rate: fx,
            price: Number(quote.close) || 0,
            change: Number(quote.change) || 0,
            percent_change: Number(quote.percent_change) || 0,
            volume: Number(quote.volume) || 0,
            average_volume: Number(quote.average_volume) || 0,
            net_assets: Number(quote.market_capitalization) || 0,
            adv_median_usd,
            days_traded: advData?.days_with_data || 0
        };
        
    } catch (error) {
        return { ...item, reason: 'API_ERROR' };
    }
}

// Fonction principale
async function filterETFs() {
    console.log('📊 Filtrage hebdomadaire : ADV + enrichissement summary/composition\n');
    console.log(`⚙️  Seuils: ETF ${(CONFIG.MIN_ADV_USD_ETF/1e6).toFixed(1)}M$ | Bonds ${(CONFIG.MIN_ADV_USD_BOND/1e6).toFixed(1)}M$`);
    console.log(`💳  Budget: ${CONFIG.CREDIT_LIMIT} crédits/min | Enrichissement: ${ENRICH_CONCURRENCY} ETF/min max\n`);
    
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
    
    // Traiter tous les instruments
    const allItems = [
        ...etfs.map(e => ({ ...e, type: 'ETF' })),
        ...bonds.map(b => ({ ...b, type: 'BOND' }))
    ];
    
    console.log(`🔍 Analyse de ${allItems.length} instruments...\n`);
    
    // ÉTAPE 1: Calculer ADV pour chaque listing
    const allListings = [];
    
    for (let i = 0; i < allItems.length; i += CONFIG.CHUNK_SIZE) {
        const batch = allItems.slice(i, i + CONFIG.CHUNK_SIZE);
        console.log(`📦 Lot ${Math.floor(i/CONFIG.CHUNK_SIZE) + 1}: ${i+1}-${Math.min(i+CONFIG.CHUNK_SIZE, allItems.length)}`);
        
        const batchPromises = batch.map(item => processListing(item));
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(result => {
            if (result.symbolParam && result.adv_median_usd !== undefined) {
                const advInfo = `${(result.adv_median_usd/1e6).toFixed(2)}M$`;
                console.log(`  ${result.symbolParam} | ADV: ${advInfo} | FX: ${result.fx_rate.toFixed(4)}`);
                allListings.push(result);
            } else if (result.reason) {
                console.log(`  ${result.symbol} | ❌ ${result.reason}`);
                results.rejected.push(result);
            }
        });
    }
    
    // ÉTAPE 2: Agréger par ISIN
    console.log('\n📊 Agrégation par ISIN...');
    
    const isinGroups = {};
    allListings.forEach(listing => {
        const isin = listing.isin || `NO_ISIN_${listing.symbol}`;
        if (!isinGroups[isin]) {
            isinGroups[isin] = [];
        }
        isinGroups[isin].push(listing);
    });
    
    // ÉTAPE 3: Décider pass/fail au niveau groupe
    Object.entries(isinGroups).forEach(([isin, listings]) => {
        // Sommer les ADV de tous les listings
        const totalADV = listings.reduce((sum, l) => sum + (l.adv_median_usd || 0), 0);
        
        // Prendre le listing principal (plus gros volume)
        const main = listings.reduce((best, current) => 
            (current.adv_median_usd || 0) > (best.adv_median_usd || 0) ? current : best
        );
        
        // Déterminer le seuil selon le type
        const threshold = main.type === 'BOND' ? CONFIG.MIN_ADV_USD_BOND : CONFIG.MIN_ADV_USD_ETF;
        const passed = totalADV >= threshold;
        
        // Construire l'objet final
        const finalItem = {
            ...main,
            avg_dollar_volume: totalADV,
            listings: listings.map(l => ({
                symbol: l.symbol,
                mic_code: l.mic_code,
                adv: l.adv_median_usd
            }))
        };
        
        // Logger la décision
        console.log(`  ${isin} (${listings.length} listing${listings.length > 1 ? 's' : ''}) | Total ADV: ${(totalADV/1e6).toFixed(2)}M$ | ${passed ? '✅ PASS' : '❌ FAIL'}`);
        
        // Classer
        if (passed) {
            if (main.type === 'ETF') {
                results.etfs.push(finalItem);
            } else {
                results.bonds.push(finalItem);
            }
        } else {
            results.rejected.push({ ...finalItem, failed: ['liquidity'] });
        }
    });
    
    // ÉTAPE 4: Enrichissement hebdo (summary + composition) pour les ETF PASS
    console.log('\n🧩 Enrichissement HEBDO (summary + composition) sous budget 2584/min…');
    
    // Trier par AUM décroissant pour prioriser les plus gros ETFs
    results.etfs.sort((a, b) => (b.net_assets || 0) - (a.net_assets || 0));
    
    for (let i = 0; i < results.etfs.length; i += ENRICH_CONCURRENCY) {
        const batch = results.etfs.slice(i, i + ENRICH_CONCURRENCY);
        const batchNum = Math.floor(i/ENRICH_CONCURRENCY) + 1;
        const totalBatches = Math.ceil(results.etfs.length/ENRICH_CONCURRENCY);
        
        console.log(`📦 Enrichissement lot ${batchNum}/${totalBatches}`);
        
        await Promise.all(batch.map(async (it) => {
            const symbolForApi = it.symbolParam || it.symbol;
            try {
                const weekly = await fetchWeeklyPack(symbolForApi);
                Object.assign(it, weekly);
                
                if (CONFIG.DEBUG) {
                    console.log(`  ${symbolForApi} | AUM ${it.aum_usd} | TER ${it.total_expense_ratio} | Yield ${it.yield_ttm} | SectorTop ${it.sector_top?.sector} | CountryTop ${it.country_top?.country}`);
                }
            } catch (e) {
                console.log(`  ${symbolForApi} | ⚠️ Enrichissement hebdo KO: ${e.message}`);
            }
        }));
    }
    
    // Statistiques finales
    const elapsedTime = Date.now() - results.stats.start_time;
    results.stats.elapsed_seconds = Math.round(elapsedTime / 1000);
    results.stats.etfs_retained = results.etfs.length;
    results.stats.bonds_retained = results.bonds.length;
    results.stats.total_retained = results.etfs.length + results.bonds.length;
    results.stats.rejected_count = results.rejected.length;
    
    // Pour compatibilité, ajouter les stats data_quality
    results.stats.data_quality = {
        with_aum: results.etfs.filter(e => e.aum_usd != null).length,
        with_ter: results.etfs.filter(e => e.total_expense_ratio != null).length,
        with_yield: results.etfs.filter(e => e.yield_ttm != null).length,
        with_sectors: results.etfs.filter(e => e.sectors && e.sectors.length > 0).length,
        with_countries: results.etfs.filter(e => e.countries && e.countries.length > 0).length,
        with_objective: results.etfs.filter(e => e.objective && e.objective.length > 0).length
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
    
    // Sauvegarder les résultats complets
    await fs.writeFile('data/filtered_advanced.json', JSON.stringify(results, null, 2));
    
    // Snapshot JSON hebdo (sans prix/var)
    const weekly = {
        timestamp: new Date().toISOString(),
        etfs: results.etfs,
        bonds: results.bonds
    };
    await fs.writeFile('data/weekly_snapshot.json', JSON.stringify(weekly, null, 2));
    
    // CSV hebdo avec les champs demandés
    const csvHeader = [
        'symbol','mic_code','currency','fund_type',
        'aum_usd','total_expense_ratio','yield_ttm',
        'objective',
        'sector_top','sector_top_weight',
        'country_top','country_top_weight',
        'sector_top5','country_top5'
    ].join(',') + '\n';
    
    const csvRows = results.etfs.map(e => {
        const sectorTop = e.sector_top ? e.sector_top.sector : '';
        const sectorTopW = e.sector_top?.weight != null ? (e.sector_top.weight*100).toFixed(2) : '';
        const countryTop = e.country_top ? e.country_top.country : '';
        const countryTopW = e.country_top?.weight != null ? (e.country_top.weight*100).toFixed(2) : '';
        const sectorTop5 = JSON.stringify((e.sector_top5 || []).map(x => ({ s: x.sector, w: Number((x.weight*100).toFixed(2)) }))).replace(/"/g,'""');
        const countryTop5 = JSON.stringify((e.country_top5 || []).map(x => ({ c: x.country, w: Number((x.weight*100).toFixed(2)) }))).replace(/"/g,'""');
        const objective = `"${(e.objective || '').replace(/"/g, '""')}"`;
        
        return [
            e.symbol, e.mic_code || '', e.currency || '', e.fund_type || '',
            e.aum_usd ?? '', e.total_expense_ratio ?? '', e.yield_ttm ?? '',
            objective,
            `"${sectorTop}"`, sectorTopW,
            `"${countryTop}"`, countryTopW,
            `"${sectorTop5}"`, `"${countryTop5}"`
        ].join(',');
    }).join('\n');
    
    await fs.writeFile('data/weekly_snapshot.csv', csvHeader + csvRows);
    
    // Résumé
    console.log('\n📊 RÉSUMÉ:');
    console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`);
    console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`);
    console.log(`Rejetés: ${results.rejected.length}`);
    console.log(`Temps total: ${results.stats.elapsed_seconds}s`);
    
    console.log('\n📊 Qualité des données:');
    Object.entries(results.stats.data_quality).forEach(([key, count]) => {
        console.log(`  - ${key}: ${count}/${results.etfs.length}`);
    });
    
    console.log('\n📊 Raisons de rejet:');
    Object.entries(rejectionReasons).forEach(([reason, count]) => {
        console.log(`  - ${reason}: ${count}`);
    });
    
    console.log('\n✅ Résultats complets: data/filtered_advanced.json');
    console.log('✅ Weekly snapshot JSON: data/weekly_snapshot.json');
    console.log('✅ Weekly snapshot CSV: data/weekly_snapshot.csv');
    
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
