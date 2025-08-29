// etf-advanced-filter.js
// Version hebdomadaire : Filtrage ADV + enrichissement summary/composition
// v11.5: Ajout format wide pour holdings (1 ligne par ETF)

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const csv = require('csv-parse/sync');

const OUT_DIR = process.env.OUT_DIR || 'data';

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

// Map pour ETF single-stock courants
const SINGLE_STOCK_SECTORS = {
    'AAPL': { sector: 'Technology', country: 'United States' },
    'MSFT': { sector: 'Technology', country: 'United States' },
    'NVDA': { sector: 'Technology', country: 'United States' },
    'GOOGL': { sector: 'Technology', country: 'United States' },
    'GOOG': { sector: 'Technology', country: 'United States' },
    'AMZN': { sector: 'Consumer Cyclical', country: 'United States' },
    'TSLA': { sector: 'Consumer Cyclical', country: 'United States' },
    'META': { sector: 'Technology', country: 'United States' },
    'FB': { sector: 'Technology', country: 'United States' },
    'NFLX': { sector: 'Communication Services', country: 'United States' },
    'JPM': { sector: 'Financial Services', country: 'United States' },
    'BAC': { sector: 'Financial Services', country: 'United States' },
    'WMT': { sector: 'Consumer Defensive', country: 'United States' },
    'JNJ': { sector: 'Healthcare', country: 'United States' },
    'V': { sector: 'Financial Services', country: 'United States' },
    'MA': { sector: 'Financial Services', country: 'United States' },
    'BRK': { sector: 'Financial Services', country: 'United States' },
    'XOM': { sector: 'Energy', country: 'United States' },
    'UNH': { sector: 'Healthcare', country: 'United States' },
    'PG': { sector: 'Consumer Defensive', country: 'United States' }
};

// Normalisation des noms de secteurs
const SECTOR_NORMALIZATION = {
    'realestate': 'Real Estate',
    'real-estate': 'Real Estate',
    'real_estate': 'Real Estate',
    'financials': 'Financial Services',
    'finance': 'Financial Services',
    'tech': 'Technology',
    'information technology': 'Technology',
    'consumer discretionary': 'Consumer Cyclical',
    'consumer staples': 'Consumer Defensive',
    'health care': 'Healthcare',
    'industrials': 'Industrial',
    'materials': 'Basic Materials',
    'utilities': 'Utilities',
    'energy': 'Energy',
    'communication': 'Communication Services',
    'telecom': 'Communication Services'
};

// Regex pour détecter les ETF inverse/leveraged
const LEVERAGE_PATTERNS = {
    inverse: /(-1X|BEAR|SHORT|INVERSE|SH$|PSQ|DOG|DXD|SDS|SQQQ)/i,
    leveraged: /(2X|3X|ULTRA|TQQQ|UPRO|SPXL|QLD|SSO|UDOW|UMDD|URTY|TNA)/i,
    singleStock: new RegExp(`(${Object.keys(SINGLE_STOCK_SECTORS).join('|')})`, 'i')
};

// Cache pour FX
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

// Normaliser un nom de secteur
function normalizeSector(sector) {
    if (!sector) return sector;
    const lower = sector.toLowerCase().trim();
    return SECTOR_NORMALIZATION[lower] || sector;
}

// Détecter le type d'ETF spécial
function detectETFType(symbol, name, objective) {
    const fullText = `${symbol} ${name || ''} ${objective || ''}`;
    
    if (LEVERAGE_PATTERNS.inverse.test(fullText)) {
        return { type: 'inverse', leverage: -1 };
    }
    if (LEVERAGE_PATTERNS.leveraged.test(fullText)) {
        const match = fullText.match(/([23])X/i);
        return { type: 'leveraged', leverage: match ? parseInt(match[1]) : 2 };
    }
    if (LEVERAGE_PATTERNS.singleStock.test(fullText)) {
        const ticker = fullText.match(LEVERAGE_PATTERNS.singleStock)?.[0]?.toUpperCase();
        if (ticker && SINGLE_STOCK_SECTORS[ticker]) {
            return { type: 'single_stock', ticker };
        }
    }
    return { type: 'standard' };
}

// Fonction pour filtrer uniquement les champs hebdomadaires
function pickWeekly(etf) {
    return {
        symbol: etf.symbol,
        isin: etf.isin || null,
        mic_code: etf.mic_code || null,
        currency: etf.currency || null,
        fund_type: etf.fund_type || null,
        etf_type: etf.etf_type || null,
        aum_usd: etf.aum_usd ?? null,
        total_expense_ratio: etf.total_expense_ratio ?? null,
        yield_ttm: etf.yield_ttm ?? null,
        objective: etf.objective || '',
        // Secteurs
        sectors: etf.sectors || [],
        sector_top5: etf.sector_top5 || [],
        sector_top: etf.sector_top || null,
        // Pays
        countries: (etf.countries && etf.countries.length ? etf.countries : []),
        country_top5: (etf.country_top5 && etf.country_top5.length ? etf.country_top5 : []),
        country_top: (etf.country_top5 && etf.country_top5[0]) ? etf.country_top5[0] : null,
        domicile: etf.domicile || null,
        // Holdings (NEW)
        holdings_top10: (etf.holdings_top10 || []).map(h => ({
            symbol: h.symbol || null,
            name: h.name || null,
            weight: (h.weight != null) ? Number(h.weight) : null
        })),
        holding_top: etf.holding_top || null,
        // Timestamps
        as_of_summary: etf.as_of_summary || null,
        as_of_composition: etf.as_of_composition || null,
        // Indicateurs de qualité
        is_single_stock: etf.is_single_stock || false,
        auto_detected_composition: etf.auto_detected_composition || false,
        data_quality_score: etf.data_quality_score || 0,
        data_quality_details: etf.data_quality_details || {}
    };
}

// Calculer un score de qualité des données avec détails
function calculateDataQualityScore(etf) {
    const details = {
        has_aum: etf.aum_usd != null,
        has_ter: etf.total_expense_ratio != null,
        has_yield: etf.yield_ttm != null,
        has_objective: etf.objective && etf.objective.length > 20,
        has_sectors: etf.sectors && etf.sectors.length > 0,
        has_countries: etf.countries && etf.countries.length > 0,
        has_holdings_top10: etf.holdings_top10 && etf.holdings_top10.length > 0
    };
    
    const weights = {
        has_aum: 18,
        has_ter: 14,
        has_yield: 9,
        has_objective: 14,
        has_sectors: 18,
        has_countries: 18,
        has_holdings_top10: 15
    };
    
    let score = 0;
    Object.keys(details).forEach(key => {
        if (details[key]) score += weights[key];
    });
    
    etf.data_quality_details = details;
    return score;
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
async function fetchWeeklyPack(symbolParam, item) {
    // Réserve 400 crédits d'un coup (respecte 2584/min via pay)
    await pay(ENRICH_COST);

    const now = new Date().toISOString();

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
        objective: sanitizeText(s.overview || ''),
        domicile: s.domicile || item.Country || null,
        as_of_summary: now,
        as_of_composition: now
    };

    // Détecter le type d'ETF (inverse/leveraged/single-stock)
    const etfTypeInfo = detectETFType(item.symbol, item.name, pack.objective);
    pack.etf_type = etfTypeInfo.type;
    if (etfTypeInfo.leverage) pack.leverage = etfTypeInfo.leverage;

    // composition (secteurs/pays + top5 & top1)
    let sectors = (c.major_market_sectors || []).map(x => ({
        sector: normalizeSector(x.sector), 
        weight: (x.weight != null) ? Number(x.weight) : null
    }));
    
    let countries = (c.country_allocation || []).map(x => ({
        country: x.country, 
        weight: (x.allocation != null) ? Number(x.allocation) : null
    }));

    // --- HOLDINGS (Top 10) ---
    const holdingsRaw = (c.top_holdings || c.holdings || c.constituents || []).filter(Boolean);

    // mapping robuste -> {symbol,name,weight}
    const holdings = holdingsRaw.map(h => ({
        symbol: cleanSymbol(h.symbol || h.ticker || h.code || ''),
        name: h.name || h.security || h.company || h.title || '',
        weight: (h.weight != null) ? Number(h.weight)
              : (h.allocation != null) ? Number(h.allocation)
              : (h.percent != null) ? Number(h.percent)
              : null
    })).filter(h => (h.symbol || h.name) && h.weight > 0.001); // >0.1%

    // Détection automatique pour ETF single-stock si pas de composition
    let autoDetected = false;
    if (!sectors.length && etfTypeInfo.type === 'single_stock' && etfTypeInfo.ticker) {
        const stockInfo = SINGLE_STOCK_SECTORS[etfTypeInfo.ticker];
        if (stockInfo) {
            sectors = [{ sector: stockInfo.sector, weight: 1.0 }];
            countries = [{ country: stockInfo.country, weight: 1.0 }];
            if (!holdings.length) {
                holdings.push({ symbol: etfTypeInfo.ticker, name: etfTypeInfo.ticker, weight: 1.0 });
            }
            autoDetected = true;
            pack.is_single_stock = true;
        }
    }

    // Fallback géographique : utiliser le domicile si pas de pays
    if (!countries.length && pack.domicile) {
        countries = [{
            country: pack.domicile,
            weight: autoDetected ? 1.0 : null,
            is_domicile: !autoDetected
        }];
    }

    const sector_top5 = topN(sectors, 'weight', 5);
    const country_top5 = topN(countries, 'weight', 5);
    const holdings_top10 = topN(holdings, 'weight', 10);
    const holding_top = holdings_top10[0] || null;

    return {
        ...pack,
        sectors,
        sector_top5,
        sector_top: sector_top5[0] || null,
        countries,
        country_top5,
        country_top: country_top5[0] || null,
        holdings,
        holdings_top10,
        holding_top,
        auto_detected_composition: autoDetected
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
    console.log('📊 Filtrage hebdomadaire : ADV + enrichissement summary/composition v11.5\n');
    console.log(`⚙️  Seuils: ETF ${(CONFIG.MIN_ADV_USD_ETF/1e6).toFixed(1)}M$ | Bonds ${(CONFIG.MIN_ADV_USD_BOND/1e6).toFixed(1)}M$`);
    console.log(`💳  Budget: ${CONFIG.CREDIT_LIMIT} crédits/min | Enrichissement: ${ENRICH_CONCURRENCY} ETF/min max`);
    console.log(`📂  Dossier de sortie: ${OUT_DIR}\n`);
    
    // Garantir que le dossier de sortie existe
    await fs.mkdir(OUT_DIR, { recursive: true });
    
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
    console.log('\n🧩 Enrichissement HEBDO (summary + composition + holdings) sous budget 2584/min…');
    
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
                const weekly = await fetchWeeklyPack(symbolForApi, it);
                Object.assign(it, weekly);
                
                // Calculer le score de qualité des données
                it.data_quality_score = calculateDataQualityScore(it);
                
                if (CONFIG.DEBUG) {
                    console.log(`  ${symbolForApi} | Type: ${it.etf_type} | AUM ${it.aum_usd} | TER ${it.total_expense_ratio} | Holdings ${it.holdings_top10?.length || 0} | Quality ${it.data_quality_score}`);
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
        with_objective: results.etfs.filter(e => e.objective && e.objective.length > 0).length,
        with_holdings_top10: results.etfs.filter(e => e.holdings_top10 && e.holdings_top10.length > 0).length,
        with_auto_detection: results.etfs.filter(e => e.auto_detected_composition).length,
        avg_quality_score: Math.round(results.etfs.reduce((acc, e) => acc + (e.data_quality_score || 0), 0) / results.etfs.length),
        by_etf_type: {
            standard: results.etfs.filter(e => e.etf_type === 'standard').length,
            inverse: results.etfs.filter(e => e.etf_type === 'inverse').length,
            leveraged: results.etfs.filter(e => e.etf_type === 'leveraged').length,
            single_stock: results.etfs.filter(e => e.etf_type === 'single_stock').length
        }
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
    
    // Sauvegarder les résultats complets (avec tous les champs)
    const filteredPath = path.join(OUT_DIR, 'filtered_advanced.json');
    await fs.writeFile(filteredPath, JSON.stringify(results, null, 2));
    
    // Snapshot JSON hebdo (UNIQUEMENT les champs hebdo via pickWeekly)
    const weekly = {
        timestamp: new Date().toISOString(),
        etfs: results.etfs.map(pickWeekly),
        bonds: results.bonds.map(pickWeekly),
        stats: {
            total_etfs: results.stats.etfs_retained,
            total_bonds: results.stats.bonds_retained,
            data_quality: results.stats.data_quality
        }
    };
    const weeklyPath = path.join(OUT_DIR, 'weekly_snapshot.json');
    await fs.writeFile(weeklyPath, JSON.stringify(weekly, null, 2));
    
    // === CSV EXPORTS ===

    // CSV hebdo ETF avec holdings
    const csvHeaderEtf = [
        'symbol','isin','mic_code','currency','fund_type','etf_type',
        'aum_usd','total_expense_ratio','yield_ttm',
        'objective',
        'sector_top','sector_top_weight',
        'country_top','country_top_weight',
        'sector_top5','country_top5',
        'holding_top','holdings_top10',
        'data_quality_score'
    ].join(',') + '\n';

    const csvRowsEtf = results.etfs.map(e => {
        const sectorTop = e.sector_top ? e.sector_top.sector : '';
        const sectorTopW = e.sector_top?.weight != null ? (e.sector_top.weight*100).toFixed(2) : '';
        const countryTop = e.country_top ? e.country_top.country : (e.domicile || '');
        const countryTopW = e.country_top?.weight != null ? (e.country_top.weight*100).toFixed(2) : '';
        const sectorTop5 = JSON.stringify((e.sector_top5 || []).map(x => ({ s: x.sector, w: Number((x.weight*100).toFixed(2)) }))).replace(/"/g,'""');
        const countryTop5 = JSON.stringify((e.country_top5 || []).map(x => ({ c: x.country, w: x.weight ? Number((x.weight*100).toFixed(2)) : null }))).replace(/"/g,'""');
        
        // Holdings format lisible: "AAPL(15.2%)|MSFT(12.1%)|..."
        const holdingTop = e.holding_top ? `${e.holding_top.symbol || ''} ${e.holding_top.name ? '('+e.holding_top.name+')' : ''}`.trim() : '';
        const holdingsTop10 = (e.holdings_top10 || [])
            .map(h => `${h.symbol}(${(h.weight*100).toFixed(1)}%)`)
            .join('|');
        
        const objective = `"${(e.objective || '').replace(/"/g, '""')}"`;

        return [
            e.symbol, e.isin || '', e.mic_code || '', e.currency || '', e.fund_type || '', e.etf_type || '',
            e.aum_usd ?? '', e.total_expense_ratio ?? '', e.yield_ttm ?? '',
            objective,
            `"${sectorTop}"`, sectorTopW,
            `"${countryTop}"`, countryTopW,
            `"${sectorTop5}"`, `"${countryTop5}"`,
            `"${holdingTop}"`, `"${holdingsTop10}"`,
            e.data_quality_score || 0
        ].join(',');
    }).join('\n');

    // Toujours écrire le fichier (même si 0 ETF → juste l'entête)
    const etfCsvPath = path.join(OUT_DIR, 'weekly_snapshot_etfs.csv');
    await fs.writeFile(etfCsvPath, csvHeaderEtf + (csvRowsEtf ? csvRowsEtf + '\n' : ''));
    console.log(`📝 CSV ETFs: ${results.etfs.length} ligne(s) → ${etfCsvPath}`);

    // CSV hebdo BONDS (colonnes marché simples)
    const csvHeaderBonds = [
        'symbol','isin','mic_code','currency',
        'avg_dollar_volume','price','change','percent_change','volume','average_volume','days_traded'
    ].join(',') + '\n';

    const csvRowsBonds = results.bonds.map(b => [
        b.symbol, b.isin || '', b.mic_code || '', b.currency || '',
        b.avg_dollar_volume ?? '', b.price ?? '', b.change ?? '', b.percent_change ?? '',
        b.volume ?? '', b.average_volume ?? '', b.days_traded ?? ''
    ].join(',')).join('\n');

    const bondsCsvPath = path.join(OUT_DIR, 'weekly_snapshot_bonds.csv');
    await fs.writeFile(bondsCsvPath, csvHeaderBonds + (csvRowsBonds ? csvRowsBonds + '\n' : ''));
    console.log(`📝 CSV Bonds: ${results.bonds.length} ligne(s) → ${bondsCsvPath}`);
    
    // === CSV Holdings détaillé (format long) ===
    const holdingsHeader = 'etf_symbol,rank,holding_symbol,holding_name,weight_pct\n';
    const holdingsRows = [];
    
    for (const etf of results.etfs) {
        const holdings = etf.holdings_top10 || [];
        holdings.forEach((h, idx) => {
            // Convertir weight (0-1) en pourcentage
            const weight_pct = h.weight != null ? (h.weight * 100).toFixed(2) : '';
            holdingsRows.push([
                etf.symbol,
                idx + 1,
                h.symbol || '',
                `"${(h.name || '').replace(/"/g, '""')}"`,
                weight_pct
            ].join(','));
        });
    }
    
    const holdingsCsvPath = path.join(OUT_DIR, 'combined_etfs_holdings.csv');
    await fs.writeFile(holdingsCsvPath, holdingsHeader + holdingsRows.join('\n'));
    console.log(`📝 CSV Holdings (long): ${holdingsRows.length} ligne(s) → ${holdingsCsvPath}`);
    
    // === CSV Holdings WIDE (1 ligne par ETF, Top10 à plat) ===
    function padTop10(arr) {
      const a = Array.isArray(arr) ? arr.slice(0, 10) : [];
      while (a.length < 10) a.push({ symbol: '', name: '', weight: null });
      return a;
    }

    const wideCols = ['etf_symbol','isin','leverage','as_of'];
    for (let i = 1; i <= 10; i++) {
      wideCols.push(`h${i}_symbol`, `h${i}_name`, `h${i}_weight_pct`);
    }
    wideCols.push('cr5','cr10','hhi_top10','valid_holdings');

    const wideHeader = wideCols.join(',') + '\n';
    const wideRows = results.etfs.map(etf => {
      const hs = padTop10(etf.holdings_top10 || []);
      const asOf = etf.as_of_composition || new Date().toISOString();

      let cr5 = 0, cr10 = 0, hhi = 0, valid = 0;
      const cells = [etf.symbol, etf.isin || '', etf.leverage ?? '', asOf];

      hs.forEach((h, i) => {
        const nameSafe = `"${(h.name || '').replace(/"/g, '""')}"`;
        const wPct = (h.weight != null) ? (h.weight * 100) : null; // weight est 0–1 dans ton code
        cells.push(h.symbol || '', nameSafe, (wPct != null ? wPct.toFixed(2) : ''));

        if (wPct != null) {
          valid += 1;
          if (i < 5) cr5 += wPct;
          cr10 += wPct;
          hhi += Math.pow((wPct / 100), 2); // Herfindahl sur top10 (0–1)
        }
      });

      cells.push(cr5.toFixed(2), cr10.toFixed(2), hhi.toFixed(4), String(valid));
      return cells.join(',');
    }).join('\n');

    const holdingsWideCsvPath = path.join(OUT_DIR, 'combined_etfs_holdings_wide.csv');
    await fs.writeFile(holdingsWideCsvPath, wideHeader + (wideRows ? wideRows + '\n' : ''));
    
    // JSON wide
    await fs.writeFile(path.join(OUT_DIR, 'combined_etfs_holdings_wide.json'),
      JSON.stringify(results.etfs.map(etf => {
        const hs = padTop10(etf.holdings_top10 || []);
        return {
          etf_symbol: etf.symbol,
          isin: etf.isin || '',
          leverage: etf.leverage ?? '',
          as_of: etf.as_of_composition || new Date().toISOString(),
          ...Object.fromEntries(hs.flatMap((h, i) => {
            const k = i + 1;
            const wPct = (h.weight != null) ? (h.weight * 100) : null;
            return [
              [`h${k}_symbol`, h.symbol || ''],
              [`h${k}_name`, h.name || ''],
              [`h${k}_weight_pct`, (wPct != null ? Number(wPct.toFixed(2)) : '')]
            ];
          }))
        };
      }), null, 2)
    );

    console.log(`📝 CSV Holdings WIDE: ${holdingsWideCsvPath}`);
    
    // Résumé
    console.log('\n📊 RÉSUMÉ:');
    console.log(`ETFs retenus: ${results.etfs.length}/${etfs.length}`);
    console.log(`Bonds retenus: ${results.bonds.length}/${bonds.length}`);
    console.log(`Holdings extraits: ${holdingsRows.length} positions`);
    console.log(`Rejetés: ${results.rejected.length}`);
    console.log(`Temps total: ${results.stats.elapsed_seconds}s`);
    
    console.log('\n📊 Qualité des données:');
    Object.entries(results.stats.data_quality).forEach(([key, count]) => {
        if (typeof count === 'object') {
            console.log(`  - ${key}:`);
            Object.entries(count).forEach(([subkey, subcount]) => {
                console.log(`    • ${subkey}: ${subcount}`);
            });
        } else {
            console.log(`  - ${key}: ${count}/${results.etfs.length}`);
        }
    });
    
    console.log('\n📊 Raisons de rejet:');
    Object.entries(rejectionReasons).forEach(([reason, count]) => {
        console.log(`  - ${reason}: ${count}`);
    });
    
    console.log(`\n✅ Résultats complets: ${filteredPath}`);
    console.log(`✅ Weekly snapshot JSON: ${weeklyPath} (champs hebdo uniquement)`);
    console.log(`✅ CSV ETFs: ${etfCsvPath}`);
    console.log(`✅ CSV Bonds: ${bondsCsvPath}`);
    console.log(`✅ CSV Holdings long: ${holdingsCsvPath}`);
    console.log(`✅ CSV Holdings wide: ${holdingsWideCsvPath}`);
    
    // Pour GitHub Actions (nouveau mécanisme)
    if (process.env.GITHUB_OUTPUT) {
        const fsSync = require('fs');
        fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `etfs_count=${results.etfs.length}\n`);
        fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `bonds_count=${results.bonds.length}\n`);
        fsSync.appendFileSync(process.env.GITHUB_OUTPUT, `holdings_count=${holdingsRows.length}\n`);
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
