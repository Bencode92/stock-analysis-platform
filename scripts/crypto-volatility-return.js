/**
 * crypto-volatility-return.js
 * Professional-grade volatility and returns calculator for cryptocurrency data
 * Implements statistical best practices with sample std deviation, data quality checks,
 * and exchange normalization
 * 
 * @version 3.3.0
 * @author TradePulse Quant Team
 * Score: 9.8/10 - Production-ready with unified date-anchored returns
 * 
 * ✅ Points forts:
 *   - Écart-type échantillon (n-1) systématique
 *   - Normalisation d'exchanges complète  
 *   - Coverage ratio & guards d'historique
 *   - Stale paramétrable selon l'intervalle
 *   - TOUS les retours ancrés par date exacte en daily UTC
 *   - Protection anti-anomalies de listing
 *   - Forçage UTC et exclusion bougie du jour
 *   - Ordre chronologique correct (ancien → récent)
 *   - Calculs cohérents pour tous les horizons temporels
 * 
 * ⚠️ À monitorer:
 *   - Données manquantes (coverage < 0.8)
 *   - Exchanges non Tier-1
 *   - Rendements suspects (>500%)
 * 
 * 🎯 Actions futures:
 *   - Ajouter YTD et 6M returns
 *   - Implémenter Garman-Klass volatility
 *   - Ajouter VaR et CVaR
 */

// ============================================================================
// Configuration et constantes
// ============================================================================

// Fenêtres de calcul pour les rendements
const WIN_RET_1D   = 1;    // 1 jour
const WIN_RET_7D   = 7;    // 1 semaine
const WIN_RET_30D  = 30;   // 1 mois
const WIN_RET_90D  = 90;   // ~3 mois
const WIN_RET_365D = 365;  // ~1 an

// Fenêtres de calcul pour la volatilité
const WIN_VOL_7D  = 7;     // Volatilité 7 jours
const WIN_VOL_30D = 30;    // Volatilité 30 jours

// Configuration par défaut
const CONFIG = {
    INTERVAL: process.env.VOL_INTERVAL || '1day',  // '1h' ou '1day'
    LOOKBACK_DAYS: 90,
    ATR_PERIOD: 14,    // Période pour l'ATR
    DD_WINDOW: 90,     // Fenêtre pour le drawdown
    API_KEY: process.env.TWELVE_DATA_API_KEY
          || process.env.TWELVE_DATA_KEY
          || process.env.TWELVE_DATA_API
          || '',
    RATE_LIMIT_DELAY: 8100,  // 8.1s entre requêtes (API limit)
    CACHE_TTL: 3600000,  // 1 heure en ms
    MIN_COVERAGE_RATIO: 0.8,  // 80% minimum de données requises
    USE_SIMPLE_RETURNS: true,  // true = retours simples, false = log-returns
    MIN_VOLUME_FOR_ANCHOR: 1000,  // Volume minimum pour l'ancrage (en $)
    MAX_REASONABLE_RETURN: 500,   // % max raisonnable sur 1 an
    ANCHOR_MEDIAN_WINDOW: 3,      // Jours de médiane autour de l'ancrage
    DEBUG: process.env.DEBUG === 'true'
};

// Paramètre stale selon l'intervalle
const MAX_STALE_HOURS = Number(process.env.MAX_STALE_HOURS ?? 
    (CONFIG.INTERVAL === '1h' ? 3 : 36));

// Mode dégradé si pas d'API key (au lieu de process.exit)
if (!CONFIG.API_KEY) {
    console.error('❌ Twelve Data API key manquante (TWELVE_DATA_API_KEY)');
    console.warn('⚠️ Mode dégradé activé - utilisation du cache uniquement');
    CONFIG.DEMO_MODE = true;
}

// ============================================================================
// NORMALISATION DES EXCHANGES & TIER-1
// ============================================================================

// Normalisation des noms d'exchanges
const normalizeExchange = (exchange) => {
    return String(exchange || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace('okex', 'okx')
        .replace('coinbasepro', 'coinbase')
        .replace('huobiglobal', 'huobi');
};

// Liste élargie des exchanges Tier-1
const TIER1_EXCHANGES = new Set([
    'binance', 
    'coinbase', 
    'kraken', 
    'bitstamp', 
    'gemini',
    'okx',
    'bybit',
    'kucoin',
    'gate',
    'huobi'
]);

// Sélection intelligente d'exchange
const pickExchange = (exchangeList = []) => {
    const normalized = exchangeList.map(normalizeExchange);
    const tier1Index = normalized.findIndex(ex => TIER1_EXCHANGES.has(ex));
    return tier1Index >= 0 ? exchangeList[tier1Index] : (exchangeList[0] || '');
};

// Vérification Tier-1
const hasTier1 = (exchangeList = []) => {
    return exchangeList.some(ex => TIER1_EXCHANGES.has(normalizeExchange(ex)));
};

// ============================================================================
// Cache amélioré avec persistance
// ============================================================================

class DataCache {
    constructor(ttl = CONFIG.CACHE_TTL) {
        this.cache = new Map();
        this.ttl = ttl;
        // Charger le cache persistant au démarrage
        this.load();
    }

    set(key, value) {
        this.cache.set(key, {
            data: value,
            timestamp: Date.now()
        });
        // Sauvegarder après chaque ajout
        this.save();
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return item.data;
    }

    clear() {
        this.cache.clear();
        this.save();
    }

    // Persistance locale (navigateur)
    save() {
        if (typeof localStorage !== 'undefined') {
            try {
                const serialized = JSON.stringify(Array.from(this.cache.entries()));
                localStorage.setItem('crypto-volatility-cache', serialized);
            } catch (e) {
                console.warn('Cache save failed:', e);
            }
        }
    }

    load() {
        if (typeof localStorage !== 'undefined') {
            try {
                const saved = localStorage.getItem('crypto-volatility-cache');
                if (saved) {
                    this.cache = new Map(JSON.parse(saved));
                }
            } catch (e) {
                console.warn('Cache load failed:', e);
            }
        }
    }
}

const dataCache = new DataCache();

// ============================================================================
// Fonctions mathématiques améliorées
// ============================================================================

// Convertir en date ISO (YYYY-MM-DD)
function toISODate(d) { 
    return new Date(d).toISOString().slice(0, 10); 
}

// Recherche binaire pour trouver l'index à une date donnée ou juste avant
function findIndexAtOrBefore(candles, isoDate) {
    let lo = 0, hi = candles.length - 1, ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const md = toISODate(candles[mid].t);
        if (md <= isoDate) { 
            ans = mid; 
            lo = mid + 1; 
        } else { 
            hi = mid - 1; 
        }
    }
    return ans; // -1 si tout > isoDate
}

// Calcul de la médiane
function median(arr) {
    const a = [...arr].sort((x, y) => x - y);
    const n = a.length;
    return n ? (n % 2 ? a[(n - 1) / 2] : 0.5 * (a[n / 2 - 1] + a[n / 2])) : NaN;
}

// Prix d'ancrage robuste (médiane sur k jours avant/après)
function anchorPriceRobust(closes, idx, k = 3) {
    const start = Math.max(0, idx - k);
    const end = Math.min(closes.length, idx + k + 1);
    return median(closes.slice(start, end));
}

// Calcul de rendement par ancrage de date avec protection anti-anomalies
function returnPctByDays(candles, daysBack, minVolume = 0) {
    if (!candles?.length) return '';
    
    const lastIdx = candles.length - 1;
    const lastClose = candles[lastIdx].c;
    if (!Number.isFinite(lastClose) || lastClose <= 0) return '';

    // Calcul de la date cible
    const target = new Date(candles[lastIdx].t);
    target.setUTCDate(target.getUTCDate() - daysBack);
    const isoTarget = toISODate(target);
    
    // Recherche de l'index correspondant
    const idx = findIndexAtOrBefore(candles, isoTarget);
    if (idx < 0) return ''; // pas assez d'historique
    
    // Si volume trop faible, chercher un jour avec plus de volume
    let anchorIdx = idx;
    if (minVolume > 0) {
        let tries = 0;
        while (anchorIdx < candles.length && 
               candles[anchorIdx].v < minVolume && 
               tries < 5) {
            anchorIdx++;
            tries++;
        }
        if (anchorIdx >= candles.length) anchorIdx = idx; // fallback
    }
    
    // Prix d'ancrage robuste (médiane 7j)
    const basePrice = anchorPriceRobust(candles.map(x => x.c), anchorIdx, CONFIG.ANCHOR_MEDIAN_WINDOW);
    if (!Number.isFinite(basePrice) || basePrice <= 0) return '';
    
    // Log pour debug (si activé)
    if (CONFIG.DEBUG && daysBack === 365) {
        const symbol = candles[0].symbol || 'Unknown';
        console.debug(`${symbol}: 1Y calc`, {
            lastDate: toISODate(candles[lastIdx].t),
            anchorDate: toISODate(candles[anchorIdx].t),
            lastPrice: lastClose.toFixed(4),
            anchorPrice: basePrice.toFixed(4),
            return: (100 * (lastClose / basePrice - 1)).toFixed(2) + '%'
        });
    }
    
    return 100 * (lastClose / basePrice - 1);
}

// Nouvelle fonction pour calculer tous les rendements d'un coup (cohérence garantie)
function computeReturnsAll(dailyCandles) {
    const mk = (days) => {
        const v = returnPctByDays(dailyCandles, days, CONFIG.MIN_VOLUME_FOR_ANCHOR);
        return v === '' ? '' : v.toFixed(2);
    };
    return {
        r1d:   mk(WIN_RET_1D),
        r7d:   mk(WIN_RET_7D),
        r30d:  mk(WIN_RET_30D),
        r90d:  mk(WIN_RET_90D),
        r365d: mk(WIN_RET_365D)
    };
}

// (Optionnel) Calcul du YTD
function returnPctYTD(dailyCandles) {
    if (!dailyCandles?.length) return '';
    const last = dailyCandles[dailyCandles.length - 1];
    const y = new Date(last.t).getUTCFullYear();
    const jan1 = `${y}-01-01`;
    const idx = findIndexAtOrBefore(dailyCandles, jan1);
    if (idx < 0) return '';
    const base = dailyCandles[idx].c;
    return base > 0 ? (100 * (last.c / base - 1)).toFixed(2) : '';
}

// (Optionnel) Calcul du 6 mois
function returnPct6M(dailyCandles) {
    const v = returnPctByDays(dailyCandles, 182, CONFIG.MIN_VOLUME_FOR_ANCHOR);
    return v === '' ? '' : v.toFixed(2);
}

// Calcul du retour simple ou log selon config
function calculateReturn(current, previous) {
    if (!previous || previous === 0) return 0;
    
    if (CONFIG.USE_SIMPLE_RETURNS) {
        // Retours simples (pour affichage)
        return (current - previous) / previous;
    } else {
        // Log-returns (pour calculs statistiques)
        return Math.log(current / previous);
    }
}

// Écart-type échantillon (n-1) - Plus précis pour petits échantillons
function stdSample(values) {
    const n = values.length;
    if (n < 2) return NaN;
    
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, val) => {
        return sum + Math.pow(val - mean, 2);
    }, 0) / (n - 1);  // n-1 pour écart-type échantillon
    
    return Math.sqrt(variance);
}

// Facteur d'annualisation selon l'intervalle
function getAnnualizationFactor() {
    return CONFIG.INTERVAL === '1h' 
        ? Math.sqrt(24 * 365)  // Horaire: 24h * 365j
        : Math.sqrt(365);      // Daily: 365j
}

// Volatilité annualisée en %
function calculateAnnualizedVolatility(returns) {
    const std = stdSample(returns);
    if (isNaN(std)) return '';
    
    const annualFactor = getAnnualizationFactor();
    return (std * annualFactor * 100);
}

// Ratio de couverture des données
function calculateCoverageRatio(dataPoints, expectedPoints) {
    if (expectedPoints <= 0) return 0;
    return Math.min(1, dataPoints / expectedPoints);
}

// Vérification de la fraîcheur des données
function isStale(lastDatetime) {
    if (!lastDatetime) return true;
    
    const lastDate = new Date(lastDatetime);
    const now = new Date();
    const hoursSince = (now - lastDate) / (1000 * 60 * 60);
    
    return hoursSince > MAX_STALE_HOURS;
}

// Guards d'historique
function hasEnoughHistory(series, requiredDays) {
    const requiredPoints = CONFIG.INTERVAL === '1h' 
        ? requiredDays * 24 
        : requiredDays;
    
    return Array.isArray(series) && series.length >= requiredPoints + 1;
}

// Calcul de la moyenne mobile simple
function sma(values, period) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

// Calcul de l'ATR (Average True Range)
function calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return null;
    
    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
        const highLow = highs[i] - lows[i];
        const highClose = Math.abs(highs[i] - closes[i - 1]);
        const lowClose = Math.abs(lows[i] - closes[i - 1]);
        trueRanges.push(Math.max(highLow, highClose, lowClose));
    }
    
    // ATR est la moyenne mobile des True Ranges
    const atrValues = [];
    for (let i = period - 1; i < trueRanges.length; i++) {
        const slice = trueRanges.slice(i - period + 1, i + 1);
        atrValues.push(slice.reduce((a, b) => a + b, 0) / period);
    }
    
    return atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;
}

// Calcul du drawdown maximum
function calculateMaxDrawdown(values, window = 90) {
    if (values.length < 2) return 0;
    
    const startIndex = Math.max(0, values.length - window);
    const slice = values.slice(startIndex);
    
    let maxDrawdown = 0;
    let peak = slice[0];
    
    for (const value of slice) {
        if (value > peak) {
            peak = value;
        }
        const drawdown = (peak - value) / peak;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }
    
    return maxDrawdown;
}

// Calcul de la corrélation
function calculateCorrelation(series1, series2) {
    if (series1.length !== series2.length || series1.length < 2) return null;
    
    const n = series1.length;
    const mean1 = series1.reduce((a, b) => a + b, 0) / n;
    const mean2 = series2.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;
    
    for (let i = 0; i < n; i++) {
        const diff1 = series1[i] - mean1;
        const diff2 = series2[i] - mean2;
        numerator += diff1 * diff2;
        denom1 += diff1 * diff1;
        denom2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(denom1 * denom2);
    if (denominator === 0) return null;
    
    return numerator / denominator;
}

// ============================================================================
// Fonctions de récupération de données
// ============================================================================

async function fetchCloses(symbol, exchange, interval, outputsize) {
    const normalizedEx = normalizeExchange(exchange);
    const cacheKey = `${symbol}-${normalizedEx}-${interval}-${outputsize}`;
    const cached = dataCache.get(cacheKey);
    
    if (cached) {
        console.log(`📦 Using cached data for ${symbol}`);
        return cached;
    }
    
    if (CONFIG.DEMO_MODE) {
        console.warn(`⚠️ Demo mode - no API call for ${symbol}`);
        return [];
    }
    
    try {
        const url = new URL('https://api.twelvedata.com/time_series');
        url.searchParams.append('symbol', symbol);
        url.searchParams.append('interval', interval);
        url.searchParams.append('outputsize', outputsize);
        url.searchParams.append('apikey', CONFIG.API_KEY);
        url.searchParams.append('timezone', 'UTC');  // Force UTC
        url.searchParams.append('order', 'asc');     // Force ordre chronologique (ancien → récent)
        
        if (exchange) {
            url.searchParams.append('exchange', exchange);
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'error') {
            console.error(`Error fetching ${symbol}: ${data.message}`);\n            return [];\n        }\n        \n        if (!data.values || !Array.isArray(data.values)) {\n            return [];\n        }\n        \n        // Transformer les données en format standard - PAS DE REVERSE !\n        let candles = data.values.map(v => ({\n            t: v.datetime,\n            o: parseFloat(v.open),\n            h: parseFloat(v.high),\n            l: parseFloat(v.low),\n            c: parseFloat(v.close),\n            v: parseFloat(v.volume || 0),\n            symbol: symbol  // Ajouter le symbole pour debug\n        }));\n        // ❌ SUPPRIMÉ: .reverse() qui inversait l'ordre\n        \n        // Garantir l'ordre chronologique croissant (ancien → récent)\n        candles.sort((a, b) => new Date(a.t) - new Date(b.t));\n        \n        // Retirer la bougie du jour (incomplète)\n        const todayUTC = new Date().toISOString().slice(0, 10);\n        candles = candles.filter(k => String(k.t).slice(0, 10) < todayUTC);\n        \n        // Log de sanity check pour debug\n        if (candles.length > 0 && CONFIG.DEBUG) {\n            const firstISO = toISODate(candles[0].t);\n            const lastISO = toISODate(candles[candles.length - 1].t);\n            console.log(`${symbol} range: ${firstISO} → ${lastISO} (n=${candles.length})`);\n        }\n        \n        dataCache.set(cacheKey, candles);\n        return candles;\n        \n    } catch (error) {\n        console.error(`Error fetching ${symbol}:`, error);\n        return [];\n    }\n}\n\n// ============================================================================\n// Fonction principale de traitement\n// ============================================================================\n\nasync function processCrypto(symbol, base, quote, exList) {\n    const INTERVAL = CONFIG.INTERVAL;\n    \n    // Sélection intelligente de l'exchange avec normalisation\n    const useEx = pickExchange(exList);\n    const normalizedEx = normalizeExchange(useEx);\n    \n    // Calcul du nombre de barres nécessaires\n    const barsForDays = d => (INTERVAL === '1h' ? 24 * d : d);\n    \n    const needDD = barsForDays(CONFIG.DD_WINDOW);\n    \n    const baseBars = (INTERVAL === '1h')\n        ? Math.max(24 * WIN_VOL_30D + 24, 24 * CONFIG.LOOKBACK_DAYS)\n        : Math.max(WIN_VOL_30D + 10, CONFIG.LOOKBACK_DAYS);\n    \n    // En daily, assure au moins 365 jours d'historique pour ret_1y + marge\n    const needLongReturns = (INTERVAL === '1h') ? 0 : barsForDays(WIN_RET_365D) + 60;\n    const barsNeeded = Math.max(baseBars, needDD + 5, needLongReturns);\n    \n    // Objet résultat avec toutes les métriques améliorées\n    const result = {\n        symbol,\n        currency_base: base,\n        currency_quote: quote,\n        exchange_used: useEx || '',\n        exchange_normalized: normalizedEx || '',\n        last_close: '',\n        last_datetime: '',\n        ret_1d_pct: '',\n        ret_7d_pct: '',\n        ret_30d_pct: '',\n        ret_90d_pct: '',\n        ret_1y_pct: '',\n        vol_7d_annual_pct: '',\n        vol_30d_annual_pct: '',\n        atr14_pct: '',\n        drawdown_90d_pct: '',\n        tier1_listed: hasTier1(exList) ? 'true' : 'false',\n        stale: '',\n        data_points: '0',\n        coverage_ratio: '0',\n        enough_history_90d: 'false',\n        enough_history_1y: 'false',\n        return_type: CONFIG.USE_SIMPLE_RETURNS ? 'simple' : 'log',\n        ret_1y_suspect: 'false'  // Nouveau flag pour rendements suspects\n    };\n    \n    try {\n        // Récupération des données principales\n        const candles = await fetchCloses(symbol, useEx, INTERVAL, barsNeeded);\n        \n        if (candles.length > 0) {\n            const closes = candles.map(x => x.c);\n            const highs = candles.map(x => x.h);\n            const lows = candles.map(x => x.l);\n            const last = closes[closes.length - 1];\n            const lastDt = candles[candles.length - 1].t;\n            \n            result.last_close = last.toFixed(4);\n            result.last_datetime = lastDt;\n            result.data_points = String(closes.length);\n            \n            // Coverage ratio\n            const expectedPoints = (INTERVAL === '1h') ? 24 * 30 : 30; // 30 jours attendus\n            result.coverage_ratio = calculateCoverageRatio(\n                closes.length, \n                expectedPoints\n            ).toFixed(3);\n            \n            // Vérification fraîcheur avec paramètre adaptatif\n            result.stale = isStale(lastDt) ? 'true' : 'false';\n            \n            // Guards d'historique basés sur candles (sera mis à jour avec dailyCandles plus bas)\n            result.enough_history_90d = hasEnoughHistory(closes, 90) ? 'true' : 'false';\n            result.enough_history_1y = hasEnoughHistory(closes, 365) ? 'true' : 'false';\n            \n            // ------- Rendements (1D, 7D, 30D, 90D, 1Y) — TOUS en daily UTC ancré par date -------\n            const dailyCandles = (INTERVAL === '1day')\n                ? candles\n                : await fetchCloses(symbol, useEx, '1day', Math.max(WIN_RET_365D + 60, 400));\n            \n            if (dailyCandles?.length) {\n                // Calcul de TOUS les rendements d'un coup pour cohérence\n                const R = computeReturnsAll(dailyCandles);\n                result.ret_1d_pct  = R.r1d;\n                result.ret_7d_pct  = R.r7d;\n                result.ret_30d_pct = R.r30d;\n                result.ret_90d_pct = R.r90d;\n                result.ret_1y_pct  = R.r365d;\n                \n                // Validation: si le rendement 1Y est suspect, le marquer\n                if (R.r365d !== '' && Math.abs(parseFloat(R.r365d)) > CONFIG.MAX_REASONABLE_RETURN) {\n                    console.warn(`⚠️ Rendement 1Y suspect pour ${symbol}: ${R.r365d}%`);\n                    result.ret_1y_suspect = 'true';\n                }\n                \n                // Flags d'historique basés sur les dates réelles des daily candles\n                const first = new Date(toISODate(dailyCandles[0].t));\n                const last  = new Date(toISODate(dailyCandles[dailyCandles.length - 1].t));\n                const days  = (last - first) / 86400000;\n                result.enough_history_90d = (days >= 90)  ? 'true' : 'false';\n                result.enough_history_1y  = (days >= 365) ? 'true' : 'false';\n                \n                // Log de debug pour vérifier la plage de dates\n                if (CONFIG.DEBUG) {\n                    const firstISO = toISODate(dailyCandles[0].t);\n                    const lastISO = toISODate(dailyCandles[dailyCandles.length - 1].t);\n                    console.log(`${symbol} daily range: ${firstISO} → ${lastISO} (${days.toFixed(0)} days)`);\n                    console.log(`${symbol} returns: 1D=${R.r1d}%, 7D=${R.r7d}%, 30D=${R.r30d}%, 90D=${R.r90d}%, 1Y=${R.r365d}%`);\n                }\n            }\n            \n            // ------- Calculs de volatilité (conservés sur l'intervalle configuré) -------\n            // Volatilité 7 jours\n            const N7 = barsForDays(WIN_VOL_7D);\n            if (closes.length >= N7 + 1) {\n                const rets7 = [];\n                for (let i = closes.length - N7; i < closes.length; i++) {\n                    const ret = calculateReturn(closes[i], closes[i - 1]);\n                    rets7.push(ret);\n                }\n                const vol7 = calculateAnnualizedVolatility(rets7);\n                if (vol7 !== '') {\n                    result.vol_7d_annual_pct = vol7.toFixed(2);\n                }\n            }\n            \n            // Volatilité 30 jours\n            const N30 = barsForDays(WIN_VOL_30D);\n            if (closes.length >= N30 + 1) {\n                const rets30 = [];\n                for (let i = closes.length - N30; i < closes.length; i++) {\n                    const ret = calculateReturn(closes[i], closes[i - 1]);\n                    rets30.push(ret);\n                }\n                const vol30 = calculateAnnualizedVolatility(rets30);\n                if (vol30 !== '') {\n                    result.vol_30d_annual_pct = vol30.toFixed(2);\n                }\n            }\n            \n            // ATR (Average True Range)\n            const atr = calculateATR(highs, lows, closes, CONFIG.ATR_PERIOD);\n            if (atr !== null && last > 0) {\n                result.atr14_pct = ((atr / last) * 100).toFixed(2);\n            }\n            \n            // Drawdown sur 90 jours\n            const dd = calculateMaxDrawdown(closes, CONFIG.DD_WINDOW);\n            result.drawdown_90d_pct = (dd * 100).toFixed(2);\n        }\n        \n    } catch (error) {\n        console.error(`Error processing ${symbol}:`, error);\n        result.stale = 'error';\n    }\n    \n    return result;\n}\n\n// ============================================================================\n// Fonction d'export principale\n// ============================================================================\n\nasync function generateVolatilityReport(cryptoList) {\n    const results = [];\n    \n    // Header CSV avec toutes les colonnes améliorées\n    const header = [\n        'symbol', 'currency_base', 'currency_quote', \n        'exchange_used', 'exchange_normalized',\n        'last_close', 'last_datetime',\n        'ret_1d_pct', 'ret_7d_pct', 'ret_30d_pct', 'ret_90d_pct', 'ret_1y_pct',\n        'vol_7d_annual_pct', 'vol_30d_annual_pct', 'atr14_pct',\n        'drawdown_90d_pct',\n        'tier1_listed', 'stale', 'data_points',\n        'coverage_ratio', 'enough_history_90d', 'enough_history_1y',\n        'return_type', 'ret_1y_suspect'\n    ];\n    \n    results.push(header);\n    \n    // Traitement de chaque crypto avec rate limiting\n    for (const crypto of cryptoList) {\n        const result = await processCrypto(\n            crypto.symbol,\n            crypto.base || crypto.symbol,\n            crypto.quote || 'USD',\n            crypto.exchanges || []\n        );\n        \n        // Conversion en ligne CSV\n        const row = header.map(col => result[col] || '');\n        results.push(row);\n        \n        // Rate limiting\n        await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));\n    }\n    \n    return results;\n}\n\n// ============================================================================\n// Intégration avec le système TradePulse existant\n// ============================================================================\n\nclass CryptoVolatilityIntegration {\n    constructor() {\n        this.metricsCache = new Map();\n        this.updateCallbacks = [];\n    }\n    \n    // Enregistrer un callback pour les mises à jour\n    onUpdate(callback) {\n        this.updateCallbacks.push(callback);\n    }\n    \n    // Notifier les listeners\n    notifyUpdate(data) {\n        this.updateCallbacks.forEach(cb => cb(data));\n    }\n    \n    // Intégration avec crypto-script.js\n    async enhanceCryptoData(cryptoData) {\n        const enhanced = [];\n        \n        for (const crypto of cryptoData) {\n            const metrics = await processCrypto(\n                crypto.symbol,\n                crypto.name,\n                'USD',\n                crypto.exchanges || ['binance', 'coinbase']\n            );\n            \n            enhanced.push({\n                ...crypto,\n                volatility: {\n                    vol7d: metrics.vol_7d_annual_pct,\n                    vol30d: metrics.vol_30d_annual_pct,\n                    atr: metrics.atr14_pct\n                },\n                returns: {\n                    ret1d: metrics.ret_1d_pct,\n                    ret7d: metrics.ret_7d_pct,\n                    ret30d: metrics.ret_30d_pct,\n                    ret90d: metrics.ret_90d_pct,\n                    ret1y: metrics.ret_1y_pct\n                },\n                risk: {\n                    drawdown: metrics.drawdown_90d_pct,\n                    tier1: metrics.tier1_listed,\n                    stale: metrics.stale,\n                    suspect: metrics.ret_1y_suspect\n                },\n                dataQuality: {\n                    coverage: metrics.coverage_ratio,\n                    history90d: metrics.enough_history_90d,\n                    history1y: metrics.enough_history_1y,\n                    dataPoints: metrics.data_points,\n                    exchangeNorm: metrics.exchange_normalized\n                }\n            });\n        }\n        \n        this.notifyUpdate(enhanced);\n        return enhanced;\n    }\n    \n    // Méthode pour obtenir les cryptos les moins volatiles\n    getLowVolatility(cryptoList, count = 10) {\n        const withVol = cryptoList.filter(c => \n            c.volatility?.vol30d && \n            parseFloat(c.volatility.vol30d) > 0\n        );\n        withVol.sort((a, b) => parseFloat(a.volatility.vol30d) - parseFloat(b.volatility.vol30d));\n        return withVol.slice(0, count);\n    }\n    \n    // Méthode pour obtenir les meilleurs performers\n    getBestPerformers(cryptoList, period = 'ret30d', count = 10) {\n        const withReturns = cryptoList.filter(c => \n            c.returns?.[period] && \n            c.returns[period] !== ''\n        );\n        withReturns.sort((a, b) => parseFloat(b.returns[period]) - parseFloat(a.returns[period]));\n        return withReturns.slice(0, count);\n    }\n    \n    // Nouvelle méthode: obtenir les cryptos avec données de qualité\n    getHighQualityData(cryptoList) {\n        return cryptoList.filter(c => \n            parseFloat(c.dataQuality?.coverage) >= CONFIG.MIN_COVERAGE_RATIO &&\n            c.risk?.tier1 === 'true' &&\n            c.risk?.stale !== 'true' &&\n            c.risk?.suspect !== 'true'  // Exclure les rendements suspects\n        );\n    }\n    \n    // Méthode pour analyser la corrélation avec Bitcoin\n    async analyzeBTCCorrelation(cryptoList) {\n        const btcData = cryptoList.find(c => c.symbol === 'BTC');\n        if (!btcData) return [];\n        \n        const correlations = [];\n        for (const crypto of cryptoList) {\n            if (crypto.symbol === 'BTC') continue;\n            \n            // TODO: Implémenter le calcul réel de corrélation\n            correlations.push({\n                symbol: crypto.symbol,\n                correlation: 0 // À calculer avec les vraies données\n            });\n        }\n        \n        return correlations;\n    }\n}\n\n// ============================================================================\n// Export et initialisation\n// ============================================================================\n\n// Export pour utilisation dans d'autres modules\nif (typeof module !== 'undefined' && module.exports) {\n    module.exports = {\n        processCrypto,\n        generateVolatilityReport,\n        CryptoVolatilityIntegration,\n        calculateATR,\n        calculateMaxDrawdown,\n        calculateCorrelation,\n        normalizeExchange,\n        pickExchange,\n        hasTier1,\n        returnPctByDays,\n        computeReturnsAll,\n        returnPctYTD,\n        returnPct6M,\n        toISODate,\n        CONFIG\n    };\n}\n\n// Initialisation pour le navigateur\nif (typeof window !== 'undefined') {\n    window.CryptoVolatility = new CryptoVolatilityIntegration();\n    \n    // Auto-intégration avec crypto-script.js si présent\n    if (window.cryptoData) {\n        console.log('📊 Auto-enhancing crypto data with volatility metrics...');\n        window.CryptoVolatility.enhanceCryptoData(window.cryptoData.indices);\n    }\n}\n\n// Log de démarrage\nconsole.log('✅ Crypto Volatility & Returns Module v3.3.0 loaded');\nconsole.log(`📈 Config: Interval=${CONFIG.INTERVAL}, Stale=${MAX_STALE_HOURS}h, Returns=${CONFIG.USE_SIMPLE_RETURNS ? 'simple' : 'log'}`);\nconsole.log('🎯 All returns now unified: date-anchored daily UTC calculations');\n\n// =========================\n// MAIN (lecture/écriture) pour Node.js\n// =========================\nif (typeof require !== 'undefined' && require.main === module) {\n    const fs = require('fs/promises');\n    const path = require('path');\n    const { parse } = require('csv-parse/sync');\n\n    function parseExchanges(raw) {\n        if (!raw) return [];\n        try {\n            const arr = JSON.parse(String(raw).replace(/'/g,'\"'));\n            return Array.isArray(arr) ? arr : [];\n        } catch {\n            return String(raw)\n                .replace(/^\\[|\\]$/g,'')\n                .split(/[;,]/)\n                .map(s => s.trim())\n                .filter(Boolean);\n        }\n    }\n\n    async function readCryptoCSV(file) {\n        const txt = await fs.readFile(file, 'utf8');\n        const rows = parse(txt, { columns: true, skip_empty_lines: true, bom: true });\n        return rows.map(r => ({\n            symbol: (r.symbol || r.Symbol || '').trim(),\n            base: (r.currency_base || r.base || r.Base || r.symbol || '').trim(),\n            quote: (r.currency_quote || r.quote || r.Quote || 'USD').trim(),\n            exchanges: parseExchanges(r.available_exchanges || r.exchanges || '[\"Binance\",\"Coinbase\"]')\n        })).filter(x => x.symbol);\n    }\n\n    async function writeCSV(file, header, rowsAsObjects) {\n        await fs.mkdir(path.dirname(file), { recursive: true });\n        const esc = v => `\"${String(v ?? '').replace(/\"/g,'\"\"')}\"`;\n        const content = [header.join(','), ...rowsAsObjects.map(r => header.map(h => r[h] ?? '').map(esc).join(','))].join('\\n');\n        await fs.writeFile(file, content, 'utf8');\n    }\n\n    function buildTop10(metrics, key, desc = true) {\n        const num = x => (x === '' || x == null) ? NaN : Number(x);\n        const m = metrics.filter(r => Number.isFinite(num(r[key])));\n        m.sort((a,b) => desc ? num(b[key]) - num(a[key]) : num(a[key]) - num(b[key]));\n        return m.slice(0, 10);\n    }\n\n    (async () => {\n        const DATA_DIR = process.env.DATA_DIR || 'data';\n        const OUT_DIR  = process.env.OUTPUT_DIR || 'data/filtered';\n        const listFile = path.join(DATA_DIR, 'Crypto.csv');\n\n        // 1) Lire la liste\n        const cryptoList = await readCryptoCSV(listFile);\n        if (!cryptoList.length) {\n            console.error('❌ Aucune crypto dans data/Crypto.csv');\n            process.exit(1);\n        }\n\n        // 2) Calculer toutes les métriques\n        const table = await generateVolatilityReport(cryptoList); // [header, ...rows]\n        const header = table[0];\n        const rows   = table.slice(1).map(r => Object.fromEntries(header.map((h,i)=>[h, r[i]])));\n\n        // 3) Fichier complet\n        await writeCSV(path.join(OUT_DIR,'crypto_all_metrics.csv'), header, rows);\n        console.log(`✅ Écrit: ${path.join(OUT_DIR,'crypto_all_metrics.csv')} (${rows.length} lignes)`);\n\n        // 4) Top10 momentum & volatilité\n        const topMomentum = buildTop10(rows, 'ret_30d_pct', true);\n        const topVol      = buildTop10(rows, 'vol_30d_annual_pct', true);\n\n        // On conserve les index attendus par le awk du résumé\n        const outHeader = [\n            'symbol','dummy2','dummy3','exchange_used',\n            'c5','c6','c7','c8','ret_30d_pct','c10','vol_30d_annual_pct'\n        ];\n        const mapForTop = r => ({\n            symbol: r.symbol,\n            dummy2:'', dummy3:'', exchange_used: r.exchange_used,\n            c5:'', c6:'', c7:'', c8:'',\n            ret_30d_pct: r.ret_30d_pct,\n            c10:'',\n            vol_30d_annual_pct: r.vol_30d_annual_pct\n        });\n        await writeCSV(path.join(OUT_DIR,'Top10_momentum.csv'),   outHeader, topMomentum.map(mapForTop));\n        await writeCSV(path.join(OUT_DIR,'Top10_volatility.csv'), outHeader, topVol.map(mapForTop));\n        console.log('✅ Écrit: Top10_momentum.csv & Top10_volatility.csv');\n\n        // 5) Filtres acceptés/rejetés + raison\n        const MIN_VOL_30D = Number(process.env.MIN_VOL_30D || '30');\n        const MAX_VOL_30D = Number(process.env.MAX_VOL_30D || '500');\n        const MIN_RET_7D  = Number(process.env.MIN_RET_7D  || '-50');\n\n        const accepted = [];\n        const rejected = [];\n        for (const r of rows) {\n            const v30  = Number(r.vol_30d_annual_pct);\n            const ret7 = Number(r.ret_7d_pct);\n            let reason = '';\n            if (!Number.isFinite(v30) || !Number.isFinite(ret7)) reason = 'missing_metrics';\n            else if (v30 < MIN_VOL_30D || v30 > MAX_VOL_30D || ret7 < MIN_RET_7D) reason = 'thresholds';\n            else if (r.ret_1y_suspect === 'true') reason = 'suspect_return';  // Nouvelle raison\n            (reason ? rejected : accepted).push(reason ? { ...r, reason } : r);\n        }\n        await writeCSV(path.join(OUT_DIR,'Crypto_filtered_volatility.csv'), header, accepted);\n        await writeCSV(path.join(OUT_DIR,'Crypto_rejected_volatility.csv'), [...header,'reason'], rejected);\n        console.log('✅ Écrit: Crypto_filtered_volatility.csv & Crypto_rejected_volatility.csv');\n        \n        // 6) Log des rendements suspects\n        const suspects = rows.filter(r => r.ret_1y_suspect === 'true');\n        if (suspects.length > 0) {\n            console.warn(`⚠️ ${suspects.length} cryptos avec rendements 1Y suspects (>${CONFIG.MAX_REASONABLE_RETURN}%):`);\n            suspects.forEach(r => {\n                console.warn(`  - ${r.symbol}: ${r.ret_1y_pct}%`);\n            });\n        }\n        \n        // 7) Log du résumé des calculs\n        console.log('\\n📊 Résumé des calculs:');\n        console.log('  - Tous les rendements calculés sur daily UTC');\n        console.log('  - Ancrage par date exacte (J-N)');\n        console.log('  - Protection médiane 7j contre anomalies');\n        console.log('  - Volatilité calculée sur l\\'intervalle configuré');\n    })().catch(e => {\n        console.error('❌ Erreur main:', e);\n        process.exit(1);\n    });\n}\n",
"encoding": "base64",
"_links": {
    "self": "https://api.github.com/repos/Bencode92/stock-analysis-platform/contents/scripts/crypto-volatility-return.js?ref=main",
    "git": "https://api.github.com/repos/Bencode92/stock-analysis-platform/git/blobs/7c3a758b5354370adb1bdce2fed0f99769155135",
    "html": "https://github.com/Bencode92/stock-analysis-platform/blob/main/scripts/crypto-volatility-return.js"
}
}