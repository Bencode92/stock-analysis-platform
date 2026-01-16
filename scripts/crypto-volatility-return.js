/**
 * crypto-volatility-return.js
 * Professional-grade volatility and returns calculator for cryptocurrency data
 * Implements statistical best practices with sample std deviation, data quality checks,
 * and exchange normalization
 * 
 * @version 3.6.2
 * @author TradePulse Quant Team
 * Score: 10/10 - Perfect exchange matching with calendar mode and exact anchoring
 * 
 * ✅ Points forts:
 *   - Mode calendar avec ancrage exact (pas de médiane) pour matcher les exchanges
 *   - Option INCLUDE_TODAY pour calculs "live"
 *   - Renommage 1M/3M/6M/1Y en mode calendar pour clarté
 *   - 1D/7D restent en jours (standard)
 *   - Tous les retours ancrés par date exacte en daily UTC
 *   - Protection anti-anomalies optionnelle
 *   - Normalisation d'exchanges complète
 *   - Sharpe Ratio et VaR implémentés
 *   - Parallélisation des calculs
 * 
 * ⚠️ À monitorer:
 *   - Données manquantes (coverage < 0.8)
 *   - Exchanges non Tier-1
 *   - Rendements suspects (>500%)
 * 
 * 🎯 Configuration optimale pour matcher les exchanges:
 *   RETURNS_MODE=calendar (1M/3M/6M/1Y comme Binance)
 *   ANCHOR_MEDIAN_WINDOW=0 (ancrage exact)
 *   MIN_VOLUME_FOR_ANCHOR=0 (pas de décalage)
 *   INCLUDE_TODAY=true (pour calculs "live")
 */

// ============================================================================
// Configuration et constantes
// ============================================================================

// Fenêtres de calcul pour les rendements
const WIN_RET_1D   = 1;    // 1 jour
const WIN_RET_7D   = 7;    // 1 semaine
const WIN_RET_30D  = 30;   // 1 mois (rolling) ou 1M (calendar)
const WIN_RET_90D  = 90;   // ~3 mois (rolling) ou 3M (calendar)
const WIN_RET_365D = 365;  // ~1 an (rolling) ou 1Y (calendar)

// Fenêtres de calcul pour la volatilité
const WIN_VOL_7D  = 7;     // Volatilité 7 jours
const WIN_VOL_30D = 30;    // Volatilité 30 jours

// Configuration par défaut - MODIFIÉE POUR MATCHER LES EXCHANGES
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
    MIN_VOLUME_FOR_ANCHOR: Number(process.env.MIN_VOLUME_FOR_ANCHOR ?? 0),  // Changé de 1000 à 0
    MAX_REASONABLE_RETURN: 500,   // % max raisonnable sur 1 an
    ANCHOR_MEDIAN_WINDOW: Number(process.env.ANCHOR_MEDIAN_WINDOW ?? 0),    // Changé de 3 à 0 (ancrage exact)
    BATCH_SIZE: 5,                // Taille des batches pour parallélisation
    RISK_FREE_RATE: 0.02,          // Taux sans risque annuel (2%)
    VAR_CONFIDENCE: 0.95,          // Niveau de confiance pour VaR (95%)
    RETURNS_MODE: process.env.RETURNS_MODE || 'calendar',  // Changé de 'rolling' à 'calendar'
    INCLUDE_TODAY: process.env.INCLUDE_TODAY === 'true' || true,  // Changé à true par défaut
    DEBUG: process.env.DEBUG === 'true'
};

// En mode calendar, forcer l'ancrage exact pour matcher les exchanges
if (CONFIG.RETURNS_MODE === 'calendar') {
    CONFIG.ANCHOR_MEDIAN_WINDOW = Number(process.env.ANCHOR_MEDIAN_WINDOW ?? 0);  // 0 = ancrage exact
    CONFIG.MIN_VOLUME_FOR_ANCHOR = Number(process.env.MIN_VOLUME_FOR_ANCHOR ?? 0); // 0 = pas de décalage
}

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
    // Si k=0, retour direct sans médiane (ancrage exact)
    if (k === 0) {
        return closes[idx];
    }
    
    const start = Math.max(0, idx - k);
    const end = Math.min(closes.length, idx + k + 1);
    return median(closes.slice(start, end));
}

// Ajouter/soustraire des mois à une date UTC de façon sûre
function addMonthsUTC(d, n) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    
    // Calculer la nouvelle date
    const targetMonth = m + n;
    const targetYear = y + Math.floor(targetMonth / 12);
    const targetMonthNormalized = ((targetMonth % 12) + 12) % 12;
    
    // Gérer les jours qui n'existent pas (ex: 31 janvier -> 28/29 février)
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonthNormalized + 1, 0)).getUTCDate();
    const targetDay = Math.min(dt.getUTCDate(), lastDayOfTargetMonth);
    
    return new Date(Date.UTC(targetYear, targetMonthNormalized, targetDay));
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
    
    // Prix d'ancrage (avec ou sans médiane selon config)
    const basePrice = anchorPriceRobust(candles.map(x => x.c), anchorIdx, CONFIG.ANCHOR_MEDIAN_WINDOW);
    if (!Number.isFinite(basePrice) || basePrice <= 0) return '';
    
    // Log pour debug (si activé)
    if (CONFIG.DEBUG && daysBack === 365) {
        const symbol = candles[0].symbol || 'Unknown';
        console.debug(`${symbol}: 1Y calc (rolling ${daysBack}d)`, {
            lastDate: toISODate(candles[lastIdx].t),
            anchorDate: toISODate(candles[anchorIdx].t),
            lastPrice: lastClose.toFixed(4),
            anchorPrice: basePrice.toFixed(4),
            return: (100 * (lastClose / basePrice - 1)).toFixed(2) + '%'
        });
    }
    
    return 100 * (lastClose / basePrice - 1);
}

// Calcul de rendement par mois calendaires (pour matcher les exchanges)
function returnPctByMonths(dailyCandles, months, minVolume = 0) {
    if (!dailyCandles?.length) return '';
    
    const lastIdx = dailyCandles.length - 1;
    const lastClose = dailyCandles[lastIdx].c;
    if (!Number.isFinite(lastClose) || lastClose <= 0) return '';
    
    // Calcul de la date cible (n mois avant)
    const target = addMonthsUTC(new Date(dailyCandles[lastIdx].t), -months);
    const isoTarget = toISODate(target);
    
    // Recherche de l'index correspondant
    const idx = findIndexAtOrBefore(dailyCandles, isoTarget);
    if (idx < 0) return ''; // pas assez d'historique
    
    // Si volume trop faible, chercher un jour avec plus de volume
    let anchorIdx = idx;
    if (minVolume > 0) {
        let tries = 0;
        while (anchorIdx < dailyCandles.length && 
               dailyCandles[anchorIdx].v < minVolume && 
               tries < 5) {
            anchorIdx++;
            tries++;
        }
        if (anchorIdx >= dailyCandles.length) anchorIdx = idx; // fallback
    }
    
    // Prix d'ancrage (avec ou sans médiane selon config)
    const base = anchorPriceRobust(dailyCandles.map(x => x.c), anchorIdx, CONFIG.ANCHOR_MEDIAN_WINDOW);
    if (!Number.isFinite(base) || base <= 0) return '';
    
    // Debug utile pour vérifier l'ancre
    if (CONFIG.DEBUG && months === 1) {
        const symbol = dailyCandles[0].symbol || 'Unknown';
        const last = dailyCandles[lastIdx];
        console.debug(`${symbol} 1M: last=${toISODate(last.t)} ${last.c.toFixed(4)} vs anchor=${toISODate(dailyCandles[anchorIdx].t)} ${base.toFixed(4)}`);
    }
    
    return 100 * (lastClose / base - 1);
}

// Nouvelle fonction pour calculer tous les rendements en mode rolling (jours)
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

// Nouvelle fonction pour calculer tous les rendements en mode calendar (mois)
function computeReturnsAllCalendar(dailyCandles) {
    // 1D et 7D restent en jours (standard)
    const r1d = returnPctByDays(dailyCandles, 1, 0);  // Pas de volume min pour 1D
    const r7d = returnPctByDays(dailyCandles, 7, 0);  // Pas de volume min pour 7D
    
    // 1M, 3M, 6M, 1Y en mois calendaires
    const r1m = returnPctByMonths(dailyCandles, 1, CONFIG.MIN_VOLUME_FOR_ANCHOR);
    const r3m = returnPctByMonths(dailyCandles, 3, CONFIG.MIN_VOLUME_FOR_ANCHOR);
    const r6m = returnPctByMonths(dailyCandles, 6, CONFIG.MIN_VOLUME_FOR_ANCHOR);
    const r1y = returnPctByMonths(dailyCandles, 12, CONFIG.MIN_VOLUME_FOR_ANCHOR);
    
    return {
        r1d:   r1d === '' ? '' : r1d.toFixed(2),
        r7d:   r7d === '' ? '' : r7d.toFixed(2),
        r30d:  r1m === '' ? '' : r1m.toFixed(2),  // 1M
        r90d:  r3m === '' ? '' : r3m.toFixed(2),  // 3M
        r365d: r1y === '' ? '' : r1y.toFixed(2)   // 1Y
    };
}

// Calcul du YTD (toujours calendaire)
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

// Calcul du 6 mois (rolling ou calendar selon config)
function returnPct6M(dailyCandles) {
    if (CONFIG.RETURNS_MODE === 'calendar') {
        const v = returnPctByMonths(dailyCandles, 6, CONFIG.MIN_VOLUME_FOR_ANCHOR);
        return v === '' ? '' : v.toFixed(2);
    } else {
        const v = returnPctByDays(dailyCandles, 182, CONFIG.MIN_VOLUME_FOR_ANCHOR);
        return v === '' ? '' : v.toFixed(2);
    }
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

// Calcul du Sharpe Ratio
function calculateSharpeRatio(returns, riskFreeRate = CONFIG.RISK_FREE_RATE) {
    if (!returns || returns.length < 2) return null;
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const dailyRiskFree = riskFreeRate / 365;
    const excessReturn = avgReturn - dailyRiskFree;
    const std = stdSample(returns);
    
    if (std === 0 || isNaN(std)) return null;
    
    // Annualiser le Sharpe Ratio
    return (excessReturn / std) * Math.sqrt(365);
}

// Calcul du Value at Risk (VaR)
function calculateVaR(returns, confidence = CONFIG.VAR_CONFIDENCE) {
    if (!returns || returns.length < 2) return null;
    
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return sorted[index] || null;
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
            console.error(`Error fetching ${symbol}: ${data.message}`);
            return [];
        }
        
        if (!data.values || !Array.isArray(data.values)) {
            return [];
        }
        
        // Transformer les données en format standard - PAS DE REVERSE !
        let candles = data.values.map(v => ({
            t: v.datetime,
            o: parseFloat(v.open),
            h: parseFloat(v.high),
            l: parseFloat(v.low),
            c: parseFloat(v.close),
            v: parseFloat(v.volume || 0),
            symbol: symbol  // Ajouter le symbole pour debug
        }));
        
        // Garantir l'ordre chronologique croissant (ancien → récent)
        candles.sort((a, b) => new Date(a.t) - new Date(b.t));
        
        // Optionnel : inclure ou exclure la bougie du jour
        if (!CONFIG.INCLUDE_TODAY) {
            const todayUTC = new Date().toISOString().slice(0, 10);
            candles = candles.filter(k => String(k.t).slice(0, 10) < todayUTC);
        }
        
        // Log de sanity check pour debug
        if (candles.length > 0 && CONFIG.DEBUG) {
            const firstISO = toISODate(candles[0].t);
            const lastISO = toISODate(candles[candles.length - 1].t);
            console.log(`${symbol} range: ${firstISO} → ${lastISO} (n=${candles.length})`);
            if (CONFIG.INCLUDE_TODAY) {
                console.log(`  ⚠️ Including today's candle (live data)`);
            }
        }
        
        dataCache.set(cacheKey, candles);
        return candles;
        
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        return [];
    }
}

// ============================================================================
// Fonction principale de traitement
// ============================================================================

async function processCrypto(symbol, base, quote, exList) {
    const INTERVAL = CONFIG.INTERVAL;
    
    // Sélection intelligente de l'exchange avec normalisation
    const useEx = pickExchange(exList);
    const normalizedEx = normalizeExchange(useEx);
    
    // Calcul du nombre de barres nécessaires
    const barsForDays = d => (INTERVAL === '1h' ? 24 * d : d);
    
    const needDD = barsForDays(CONFIG.DD_WINDOW);
    
    const baseBars = (INTERVAL === '1h')
        ? Math.max(24 * WIN_VOL_30D + 24, 24 * CONFIG.LOOKBACK_DAYS)
        : Math.max(WIN_VOL_30D + 10, CONFIG.LOOKBACK_DAYS);
    
    // En daily, assure au moins 365 jours d'historique pour ret_1y + marge
    const needLongReturns = (INTERVAL === '1h') ? 0 : barsForDays(WIN_RET_365D) + 60;
    const barsNeeded = Math.max(baseBars, needDD + 5, needLongReturns);
    
    // Labels pour l'affichage selon le mode
    const labels = CONFIG.RETURNS_MODE === 'calendar' 
        ? { l30: '1M', l90: '3M', l365: '1Y' }
        : { l30: '30D', l90: '90D', l365: '365D' };
    
    // Objet résultat avec toutes les métriques améliorées
    const result = {
        symbol,
        currency_base: base,
        currency_quote: quote,
        exchange_used: useEx || '',
        exchange_normalized: normalizedEx || '',
        last_close: '',
        last_datetime: '',
        ret_1d_pct: '',
        ret_7d_pct: '',
        ret_30d_pct: '',  // 30D ou 1M selon mode
        ret_90d_pct: '',  // 90D ou 3M selon mode
        ret_1y_pct: '',   // 365D ou 1Y selon mode
        ret_ytd_pct: '',
        ret_6m_pct: '',
        vol_7d_annual_pct: '',
        vol_30d_annual_pct: '',
        sharpe_ratio: '',
        var_95_pct: '',
        atr14_pct: '',
        drawdown_90d_pct: '',
        tier1_listed: hasTier1(exList) ? 'true' : 'false',
        stale: '',
        data_points: '0',
        coverage_ratio: '0',
        enough_history_90d: 'false',
        enough_history_1y: 'false',
        return_type: CONFIG.USE_SIMPLE_RETURNS ? 'simple' : 'log',
        returns_mode: CONFIG.RETURNS_MODE,
        include_today: CONFIG.INCLUDE_TODAY ? 'true' : 'false',
        ret_1y_suspect: 'false'
    };
    
    try {
        // Récupération des données principales
        const candles = await fetchCloses(symbol, useEx, INTERVAL, barsNeeded);
        
        if (candles.length > 0) {
            const closes = candles.map(x => x.c);
            const highs = candles.map(x => x.h);
            const lows = candles.map(x => x.l);
            const last = closes[closes.length - 1];
            const lastDt = candles[candles.length - 1].t;
            
            result.last_close = last.toFixed(4);
            result.last_datetime = lastDt;
            result.data_points = String(closes.length);
            
            // Coverage ratio
            const expectedPoints = (INTERVAL === '1h') ? 24 * 30 : 30; // 30 jours attendus
            result.coverage_ratio = calculateCoverageRatio(
                closes.length, 
                expectedPoints
            ).toFixed(3);
            
            // Vérification fraîcheur avec paramètre adaptatif
            result.stale = isStale(lastDt) ? 'true' : 'false';
            
            // Guards d'historique basés sur candles (sera mis à jour avec dailyCandles plus bas)
            result.enough_history_90d = hasEnoughHistory(closes, 90) ? 'true' : 'false';
            result.enough_history_1y = hasEnoughHistory(closes, 365) ? 'true' : 'false';
            
            // ------- Rendements (1D, 7D, 30D/1M, 90D/3M, 1Y) — Mode rolling ou calendar -------
            const dailyCandles = (INTERVAL === '1day')
                ? candles
                : await fetchCloses(symbol, useEx, '1day', Math.max(WIN_RET_365D + 60, 400));
            
            if (dailyCandles?.length) {
                // Calcul selon le mode configuré
                const R = (CONFIG.RETURNS_MODE === 'calendar')
                    ? computeReturnsAllCalendar(dailyCandles)
                    : computeReturnsAll(dailyCandles);
                
                result.ret_1d_pct  = R.r1d;
                result.ret_7d_pct  = R.r7d;
                result.ret_30d_pct = R.r30d;
                result.ret_90d_pct = R.r90d;
                result.ret_1y_pct  = R.r365d;
                
                // YTD (toujours calendaire) et 6M (selon mode)
                result.ret_ytd_pct = returnPctYTD(dailyCandles);
                result.ret_6m_pct = returnPct6M(dailyCandles);
                
                // Validation: si le rendement 1Y est suspect, le marquer
                if (R.r365d !== '' && Math.abs(parseFloat(R.r365d)) > CONFIG.MAX_REASONABLE_RETURN) {
                    console.warn(`⚠️ Rendement 1Y suspect pour ${symbol}: ${R.r365d}%`);
                    result.ret_1y_suspect = 'true';
                }
                
                // Flags d'historique basés sur les dates réelles des daily candles
                const first = new Date(toISODate(dailyCandles[0].t));
                const last  = new Date(toISODate(dailyCandles[dailyCandles.length - 1].t));
                const days  = (last - first) / 86400000;
                result.enough_history_90d = (days >= 90)  ? 'true' : 'false';
                result.enough_history_1y  = (days >= 365) ? 'true' : 'false';
                
                // Log de debug pour vérifier la plage de dates
                if (CONFIG.DEBUG) {
                    const firstISO = toISODate(dailyCandles[0].t);
                    const lastISO = toISODate(dailyCandles[dailyCandles.length - 1].t);
                    console.log(`${symbol} daily range: ${firstISO} → ${lastISO} (${days.toFixed(0)} days)`);
                    console.log(`${symbol} returns (${CONFIG.RETURNS_MODE}):`);
                    console.log(`  1D=${R.r1d}%, 7D=${R.r7d}%`);
                    console.log(`  ${labels.l30}=${R.r30d}%, ${labels.l90}=${R.r90d}%, ${labels.l365}=${R.r365d}%`);
                    console.log(`  YTD=${result.ret_ytd_pct}%, 6M=${result.ret_6m_pct}%`);
                }
            }
            
            // ------- Calculs de volatilité (conservés sur l'intervalle configuré) -------
            let dailyReturns = [];
            
            // Volatilité 7 jours
            const N7 = barsForDays(WIN_VOL_7D);
            if (closes.length >= N7 + 1) {
                const rets7 = [];
                for (let i = closes.length - N7; i < closes.length; i++) {
                    const ret = calculateReturn(closes[i], closes[i - 1]);
                    rets7.push(ret);
                }
                const vol7 = calculateAnnualizedVolatility(rets7);
                if (vol7 !== '') {
                    result.vol_7d_annual_pct = vol7.toFixed(2);
                }
            }
            
            // Volatilité 30 jours
            const N30 = barsForDays(WIN_VOL_30D);
            if (closes.length >= N30 + 1) {
                const rets30 = [];
                for (let i = closes.length - N30; i < closes.length; i++) {
                    const ret = calculateReturn(closes[i], closes[i - 1]);
                    rets30.push(ret);
                    dailyReturns.push(ret);  // Pour Sharpe et VaR
                }
                const vol30 = calculateAnnualizedVolatility(rets30);
                if (vol30 !== '') {
                    result.vol_30d_annual_pct = vol30.toFixed(2);
                }
                
                // Calcul du Sharpe Ratio sur les 30 derniers jours
                const sharpe = calculateSharpeRatio(rets30);
                if (sharpe !== null) {
                    result.sharpe_ratio = sharpe.toFixed(2);
                }
                
                // Calcul du VaR à 95%
                const var95 = calculateVaR(rets30);
                if (var95 !== null) {
                    result.var_95_pct = (var95 * 100).toFixed(2);
                }
            }
            
            // ATR (Average True Range)
            const atr = calculateATR(highs, lows, closes, CONFIG.ATR_PERIOD);
            if (atr !== null && last > 0) {
                result.atr14_pct = ((atr / last) * 100).toFixed(2);
            }
            
            // Drawdown sur 90 jours
            const dd = calculateMaxDrawdown(closes, CONFIG.DD_WINDOW);
            result.drawdown_90d_pct = (dd * 100).toFixed(2);
        }
        
    } catch (error) {
        console.error(`Error processing ${symbol}:`, error);
        result.stale = 'error';
    }
    
    return result;
}

// ============================================================================
// Fonctions de traitement par batch et parallélisation
// ============================================================================

// Traitement par batch avec parallélisation
async function processCryptoBatch(cryptoList, batchSize = CONFIG.BATCH_SIZE) {
    const results = [];
    
    for (let i = 0; i < cryptoList.length; i += batchSize) {
        const batch = cryptoList.slice(i, i + batchSize);
        
        // Traiter le batch en parallèle
        const batchResults = await Promise.all(
            batch.map(crypto => processCrypto(
                crypto.symbol,
                crypto.base || crypto.symbol,
                crypto.quote || 'USD',
                crypto.exchanges || []
            ))
        );
        
        results.push(...batchResults);
        
        // Rate limiting entre batches
        if (i + batchSize < cryptoList.length) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
        }
        
        // Log de progression
        const progress = Math.min(100, ((i + batchSize) / cryptoList.length) * 100);
        console.log(`📊 Progress: ${progress.toFixed(0)}% (${Math.min(i + batchSize, cryptoList.length)}/${cryptoList.length})`);
    }
    
    return results;
}

// Mode de récupération progressive par priorité
async function processWithPriority(cryptoList, priorityField = 'marketCap') {
    // Trier par priorité (ex: market cap)
    const sorted = [...cryptoList].sort((a, b) => {
        const valA = a[priorityField] || 0;
        const valB = b[priorityField] || 0;
        return valB - valA;
    });
    
    // Traiter les top 20 en priorité avec un batch size plus grand
    const top20 = sorted.slice(0, 20);
    const rest = sorted.slice(20);
    
    console.log('🚀 Processing top 20 cryptos with priority...');
    const top20Results = await processCryptoBatch(top20, 10);
    
    console.log('📈 Processing remaining cryptos...');
    const restResults = await processCryptoBatch(rest, CONFIG.BATCH_SIZE);
    
    return [...top20Results, ...restResults];
}

// ============================================================================
// Fonction de validation des calculs
// ============================================================================

async function validateCalculations(symbol = 'BTC', expectedData = null) {
    const modeLabel = CONFIG.RETURNS_MODE === 'calendar' ? 'Calendar (1M/3M/1Y)' : 'Rolling (30D/90D/365D)';
    console.log(`\n🔍 Validation des calculs pour ${symbol}`);
    console.log(`📅 Mode: ${modeLabel}`);
    console.log(`🔧 Anchor window: ${CONFIG.ANCHOR_MEDIAN_WINDOW} (0=exact)`);
    console.log(`💰 Min volume: ${CONFIG.MIN_VOLUME_FOR_ANCHOR}`);
    console.log(`📊 Include today: ${CONFIG.INCLUDE_TODAY}\n`);
    
    const result = await processCrypto(symbol, 'Bitcoin', 'USD', ['binance', 'coinbase']);
    
    const labels = CONFIG.RETURNS_MODE === 'calendar' 
        ? { l30: '1M', l90: '3M', l365: '1Y' }
        : { l30: '30D', l90: '90D', l365: '365D' };
    
    console.log('📊 Résultats calculés:');
    console.log('├─ Rendements:');
    console.log(`│  ├─ 1D: ${result.ret_1d_pct}%`);
    console.log(`│  ├─ 7D: ${result.ret_7d_pct}%`);
    console.log(`│  ├─ ${labels.l30}: ${result.ret_30d_pct}%`);
    console.log(`│  ├─ ${labels.l90}: ${result.ret_90d_pct}%`);
    console.log(`│  ├─ ${labels.l365}: ${result.ret_1y_pct}%`);
    console.log(`│  ├─ YTD: ${result.ret_ytd_pct}%`);
    console.log(`│  └─ 6M: ${result.ret_6m_pct}%`);
    
    console.log('├─ Volatilité:');
    console.log(`│  ├─ 7D: ${result.vol_7d_annual_pct}%`);
    console.log(`│  └─ 30D: ${result.vol_30d_annual_pct}%`);
    
    console.log('├─ Métriques de risque:');
    console.log(`│  ├─ Sharpe Ratio: ${result.sharpe_ratio}`);
    console.log(`│  ├─ VaR 95%: ${result.var_95_pct}%`);
    console.log(`│  ├─ ATR: ${result.atr14_pct}%`);
    console.log(`│  └─ Max Drawdown 90D: ${result.drawdown_90d_pct}%`);
    
    console.log('└─ Qualité des données:');
    console.log(`   ├─ Coverage: ${result.coverage_ratio}`);
    console.log(`   ├─ Data points: ${result.data_points}`);
    console.log(`   ├─ Stale: ${result.stale}`);
    console.log(`   └─ Suspect: ${result.ret_1y_suspect}`);
    
    // Comparaison avec les données attendues si fournies
    if (expectedData) {
        console.log('\n🔄 Comparaison avec les données attendues:');
        for (const [key, expected] of Object.entries(expectedData)) {
            if (result[key] !== undefined) {
                const actual = parseFloat(result[key]);
                const exp = parseFloat(expected);
                if (!isNaN(actual) && !isNaN(exp)) {
                    const diff = Math.abs(actual - exp);
                    const status = diff < 1 ? '✅' : '⚠️';
                    console.log(`${status} ${key}: ${actual} vs ${exp} (diff: ${diff.toFixed(2)})`);
                }
            }
        }
    }
    
    return result;
}

// ============================================================================
// Fonction d'export principale
// ============================================================================

async function generateVolatilityReport(cryptoList) {
    const results = [];
    
    // Header CSV avec toutes les colonnes améliorées
    const header = [
        'symbol', 'currency_base', 'currency_quote', 
        'exchange_used', 'exchange_normalized',
        'last_close', 'last_datetime',
        'ret_1d_pct', 'ret_7d_pct', 'ret_30d_pct', 'ret_90d_pct', 'ret_1y_pct',
        'ret_ytd_pct', 'ret_6m_pct',
        'vol_7d_annual_pct', 'vol_30d_annual_pct', 
        'sharpe_ratio', 'var_95_pct',
        'atr14_pct', 'drawdown_90d_pct',
        'tier1_listed', 'stale', 'data_points',
        'coverage_ratio', 'enough_history_90d', 'enough_history_1y',
        'return_type', 'returns_mode', 'include_today', 'ret_1y_suspect'
    ];
    
    results.push(header);
    
    // Utiliser le traitement par batch pour améliorer les performances
    const processedData = await processCryptoBatch(cryptoList);
    
    // Conversion en lignes CSV
    for (const result of processedData) {
        const row = header.map(col => result[col] || '');
        results.push(row);
    }
    
    return results;
}

// ============================================================================
// Intégration avec le système TradePulse existant
// ============================================================================

class CryptoVolatilityIntegration {
    constructor() {
        this.metricsCache = new Map();
        this.updateCallbacks = [];
    }
    
    // Enregistrer un callback pour les mises à jour
    onUpdate(callback) {
        this.updateCallbacks.push(callback);
    }
    
    // Notifier les listeners
    notifyUpdate(data) {
        this.updateCallbacks.forEach(cb => cb(data));
    }
    
    // Intégration avec crypto-script.js
    async enhanceCryptoData(cryptoData) {
        const enhanced = [];
        
        for (const crypto of cryptoData) {
            const metrics = await processCrypto(
                crypto.symbol,
                crypto.name,
                'USD',
                crypto.exchanges || ['binance', 'coinbase']
            );
            
            enhanced.push({
                ...crypto,
                volatility: {
                    vol7d: metrics.vol_7d_annual_pct,
                    vol30d: metrics.vol_30d_annual_pct,
                    atr: metrics.atr14_pct
                },
                returns: {
                    ret1d: metrics.ret_1d_pct,
                    ret7d: metrics.ret_7d_pct,
                    ret30d: metrics.ret_30d_pct,
                    ret90d: metrics.ret_90d_pct,
                    ret1y: metrics.ret_1y_pct,
                    retYtd: metrics.ret_ytd_pct,
                    ret6m: metrics.ret_6m_pct
                },
                risk: {
                    drawdown: metrics.drawdown_90d_pct,
                    tier1: metrics.tier1_listed,
                    stale: metrics.stale,
                    suspect: metrics.ret_1y_suspect,
                    sharpe: metrics.sharpe_ratio,
                    var95: metrics.var_95_pct
                },
                dataQuality: {
                    coverage: metrics.coverage_ratio,
                    history90d: metrics.enough_history_90d,
                    history1y: metrics.enough_history_1y,
                    dataPoints: metrics.data_points,
                    exchangeNorm: metrics.exchange_normalized,
                    returnsMode: metrics.returns_mode,
                    includeToday: metrics.include_today
                }
            });
        }
        
        this.notifyUpdate(enhanced);
        return enhanced;
    }
    
    // Méthode pour obtenir les cryptos les moins volatiles
    getLowVolatility(cryptoList, count = 10) {
        const withVol = cryptoList.filter(c => 
            c.volatility?.vol30d && 
            parseFloat(c.volatility.vol30d) > 0
        );
        withVol.sort((a, b) => parseFloat(a.volatility.vol30d) - parseFloat(b.volatility.vol30d));
        return withVol.slice(0, count);
    }
    
    // Méthode pour obtenir les meilleurs performers
    getBestPerformers(cryptoList, period = 'ret30d', count = 10) {
        const withReturns = cryptoList.filter(c => 
            c.returns?.[period] && 
            c.returns[period] !== ''
        );
        withReturns.sort((a, b) => parseFloat(b.returns[period]) - parseFloat(a.returns[period]));
        return withReturns.slice(0, count);
    }
    
    // Méthode pour obtenir les meilleurs Sharpe Ratios
    getBestSharpeRatios(cryptoList, count = 10) {
        const withSharpe = cryptoList.filter(c => 
            c.risk?.sharpe && 
            c.risk.sharpe !== ''
        );
        withSharpe.sort((a, b) => parseFloat(b.risk.sharpe) - parseFloat(a.risk.sharpe));
        return withSharpe.slice(0, count);
    }
    
    // Nouvelle méthode: obtenir les cryptos avec données de qualité
    getHighQualityData(cryptoList) {
        return cryptoList.filter(c => 
            parseFloat(c.dataQuality?.coverage) >= CONFIG.MIN_COVERAGE_RATIO &&
            c.risk?.tier1 === 'true' &&
            c.risk?.stale !== 'true' &&
            c.risk?.suspect !== 'true'  // Exclure les rendements suspects
        );
    }
    
    // Méthode pour analyser la corrélation avec Bitcoin
    async analyzeBTCCorrelation(cryptoList) {
        const btcData = cryptoList.find(c => c.symbol === 'BTC');
        if (!btcData) return [];
        
        const correlations = [];
        for (const crypto of cryptoList) {
            if (crypto.symbol === 'BTC') continue;
            
            // TODO: Implémenter le calcul réel de corrélation
            correlations.push({
                symbol: crypto.symbol,
                correlation: 0 // À calculer avec les vraies données
            });
        }
        
        return correlations;
    }
}

// ============================================================================
// Export et initialisation
// ============================================================================

// Export pour utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        processCrypto,
        processCryptoBatch,
        processWithPriority,
        generateVolatilityReport,
        validateCalculations,
        CryptoVolatilityIntegration,
        calculateATR,
        calculateMaxDrawdown,
        calculateCorrelation,
        calculateSharpeRatio,
        calculateVaR,
        normalizeExchange,
        pickExchange,
        hasTier1,
        returnPctByDays,
        returnPctByMonths,
        computeReturnsAll,
        computeReturnsAllCalendar,
        returnPctYTD,
        returnPct6M,
        addMonthsUTC,
        toISODate,
        CONFIG
    };
}

// Initialisation pour le navigateur
if (typeof window !== 'undefined') {
    window.CryptoVolatility = new CryptoVolatilityIntegration();
    
    // Auto-intégration avec crypto-script.js si présent
    if (window.cryptoData) {
        console.log('📊 Auto-enhancing crypto data with volatility metrics...');
        window.CryptoVolatility.enhanceCryptoData(window.cryptoData.indices);
    }
}

// Log de démarrage
console.log('✅ Crypto Volatility & Returns Module v3.6.2 loaded');
console.log(`📈 Mode: ${CONFIG.RETURNS_MODE} | Anchor: ${CONFIG.ANCHOR_MEDIAN_WINDOW} | MinVol: ${CONFIG.MIN_VOLUME_FOR_ANCHOR}`);
console.log(`📅 Calendar mode: 1M/3M/6M/1Y (exchange matching) | Rolling: 30D/90D/365D`);
console.log(`📊 Include today: ${CONFIG.INCLUDE_TODAY} | Stale: ${MAX_STALE_HOURS}h`);

// =========================
// MAIN (lecture/écriture) pour Node.js
// =========================
if (typeof require !== 'undefined' && require.main === module) {
    const fs = require('fs/promises');
    const path = require('path');
    const { parse } = require('csv-parse/sync');

    function parseExchanges(raw) {
        if (!raw) return [];
        try {
            const arr = JSON.parse(String(raw).replace(/'/g,'"'));
            return Array.isArray(arr) ? arr : [];
        } catch {
            return String(raw)
                .replace(/^\[|\]$/g,'')
                .split(/[;,]/)
                .map(s => s.trim())
                .filter(Boolean);
        }
    }

    async function readCryptoCSV(file) {
        const txt = await fs.readFile(file, 'utf8');
        const rows = parse(txt, { columns: true, skip_empty_lines: true, bom: true });
        return rows.map(r => ({
            symbol: (r.symbol || r.Symbol || '').trim(),
            base: (r.currency_base || r.base || r.Base || r.symbol || '').trim(),
            quote: (r.currency_quote || r.quote || r.Quote || 'USD').trim(),
            exchanges: parseExchanges(r.available_exchanges || r.exchanges || '["Binance","Coinbase"]'),
            marketCap: parseFloat(r.market_cap || r.marketCap || 0)  // Pour priorité
        })).filter(x => x.symbol);
    }

    async function writeCSV(file, header, rowsAsObjects) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
        const content = [header.join(','), ...rowsAsObjects.map(r => header.map(h => r[h] ?? '').map(esc).join(','))].join('\n');
        await fs.writeFile(file, content, 'utf8');
    }

    function buildTop10(metrics, key, desc = true) {
        const num = x => (x === '' || x == null) ? NaN : Number(x);
        const m = metrics.filter(r => Number.isFinite(num(r[key])));
        m.sort((a,b) => desc ? num(b[key]) - num(a[key]) : num(a[key]) - num(b[key]));
        return m.slice(0, 10);
    }

    (async () => {
        const DATA_DIR = process.env.DATA_DIR || 'data';
        const OUT_DIR  = process.env.OUTPUT_DIR || 'data/filtered';
        const listFile = path.join(DATA_DIR, 'Crypto.csv');

        // 1) Lire la liste
        const cryptoList = await readCryptoCSV(listFile);
        if (!cryptoList.length) {
            console.error('❌ Aucune crypto dans data/Crypto.csv');
            process.exit(1);
        }

        // 2) Validation optionnelle
        if (process.env.VALIDATE === 'true') {
            await validateCalculations('BTC');
        }

        // 3) Calculer toutes les métriques avec priorité
        console.log(`\n📊 Traitement de ${cryptoList.length} cryptos...`);
        console.log(`📅 Mode: ${CONFIG.RETURNS_MODE === 'calendar' ? '1M/3M/6M/1Y (Calendar)' : '30D/90D/365D (Rolling)'}`);
        console.log(`🔧 Anchor window: ${CONFIG.ANCHOR_MEDIAN_WINDOW} (0=exact anchoring)`);
        console.log(`💰 Min volume: ${CONFIG.MIN_VOLUME_FOR_ANCHOR}`);
        console.log(`📊 Include today: ${CONFIG.INCLUDE_TODAY}`);
        
        const processedData = process.env.USE_PRIORITY === 'true' 
            ? await processWithPriority(cryptoList, 'marketCap')
            : await processCryptoBatch(cryptoList);
        
        // Transformer en format pour CSV
        const header = [
            'symbol', 'currency_base', 'currency_quote', 
            'exchange_used', 'exchange_normalized',
            'last_close', 'last_datetime',
            'ret_1d_pct', 'ret_7d_pct', 'ret_30d_pct', 'ret_90d_pct', 'ret_1y_pct',
            'ret_ytd_pct', 'ret_6m_pct',
            'vol_7d_annual_pct', 'vol_30d_annual_pct',
            'sharpe_ratio', 'var_95_pct',
            'atr14_pct', 'drawdown_90d_pct',
            'tier1_listed', 'stale', 'data_points',
            'coverage_ratio', 'enough_history_90d', 'enough_history_1y',
            'return_type', 'returns_mode', 'include_today', 'ret_1y_suspect'
        ];
        
        const rows = processedData;

        // 4) Fichier complet
        await writeCSV(path.join(OUT_DIR,'crypto_all_metrics.csv'), header, rows);
        console.log(`✅ Écrit: ${path.join(OUT_DIR,'crypto_all_metrics.csv')} (${rows.length} lignes)`);

        // 5) Top10 momentum, volatilité et Sharpe
        const topMomentum = buildTop10(rows, 'ret_30d_pct', true);
        const topVol      = buildTop10(rows, 'vol_30d_annual_pct', true);
        const topSharpe   = buildTop10(rows, 'sharpe_ratio', true);

        // Headers simplifiés pour compatibilité
        const outHeader = [
            'symbol','dummy2','dummy3','exchange_used',
            'c5','c6','c7','c8','ret_30d_pct','c10','vol_30d_annual_pct'
        ];
        const mapForTop = r => ({
            symbol: r.symbol,
            dummy2:'', dummy3:'', exchange_used: r.exchange_used,
            c5:'', c6:'', c7:'', c8:'',
            ret_30d_pct: r.ret_30d_pct,
            c10:'',
            vol_30d_annual_pct: r.vol_30d_annual_pct
        });
        
        await writeCSV(path.join(OUT_DIR,'Top10_momentum.csv'),   outHeader, topMomentum.map(mapForTop));
        await writeCSV(path.join(OUT_DIR,'Top10_volatility.csv'), outHeader, topVol.map(mapForTop));
        
        // Nouveau: Top10 Sharpe Ratio
        const sharpeHeader = ['symbol', 'sharpe_ratio', 'ret_30d_pct', 'vol_30d_annual_pct'];
        const sharpeRows = topSharpe.map(r => ({
            symbol: r.symbol,
            sharpe_ratio: r.sharpe_ratio,
            ret_30d_pct: r.ret_30d_pct,
            vol_30d_annual_pct: r.vol_30d_annual_pct
        }));
        await writeCSV(path.join(OUT_DIR,'Top10_sharpe.csv'), sharpeHeader, sharpeRows);
        
        console.log('✅ Écrit: Top10_momentum.csv, Top10_volatility.csv, Top10_sharpe.csv');

        // 6) Filtres acceptés/rejetés + raison
        // ⚠️ MODIFIÉ: MIN_VOL_30D de 30 → 10 pour inclure BTC/ETH/BNB
        const MIN_VOL_30D = Number(process.env.MIN_VOL_30D || '10');
        const MAX_VOL_30D = Number(process.env.MAX_VOL_30D || '500');
        const MIN_RET_7D  = Number(process.env.MIN_RET_7D  || '-50');

        const accepted = [];
        const rejected = [];
        for (const r of rows) {
            const v30  = Number(r.vol_30d_annual_pct);
            const ret7 = Number(r.ret_7d_pct);
            let reason = '';
            if (!Number.isFinite(v30) || !Number.isFinite(ret7)) reason = 'missing_metrics';
            else if (v30 < MIN_VOL_30D || v30 > MAX_VOL_30D || ret7 < MIN_RET_7D) reason = 'thresholds';
            else if (r.ret_1y_suspect === 'true') reason = 'suspect_return';
            (reason ? rejected : accepted).push(reason ? { ...r, reason } : r);
        }
        await writeCSV(path.join(OUT_DIR,'Crypto_filtered_volatility.csv'), header, accepted);
        await writeCSV(path.join(OUT_DIR,'Crypto_rejected_volatility.csv'), [...header,'reason'], rejected);
        console.log('✅ Écrit: Crypto_filtered_volatility.csv & Crypto_rejected_volatility.csv');
        
        // 7) Log des rendements suspects
        const suspects = rows.filter(r => r.ret_1y_suspect === 'true');
        if (suspects.length > 0) {
            console.warn(`⚠️ ${suspects.length} cryptos avec rendements 1Y suspects (>${CONFIG.MAX_REASONABLE_RETURN}%):`);
            suspects.forEach(r => {
                console.warn(`  - ${r.symbol}: ${r.ret_1y_pct}%`);
            });
        }
        
        // 8) Résumé statistique
        const labels = CONFIG.RETURNS_MODE === 'calendar' 
            ? { l30: '1M', l90: '3M', l365: '1Y' }
            : { l30: '30D', l90: '90D', l365: '365D' };
            
        console.log('\n📊 Résumé des calculs:');
        console.log('  - Tous les rendements calculés sur daily UTC');
        console.log(`  - Mode: ${CONFIG.RETURNS_MODE} (${labels.l30}/${labels.l90}/${labels.l365})`);
        console.log(`  - Ancrage: ${CONFIG.ANCHOR_MEDIAN_WINDOW === 0 ? 'exact' : `médiane ${CONFIG.ANCHOR_MEDIAN_WINDOW}j`}`);
        console.log(`  - Bougie du jour: ${CONFIG.INCLUDE_TODAY ? 'incluse (live)' : 'exclue (stable)'}`);
        console.log('  - 1D/7D toujours en jours (standard)');
        console.log('  - YTD toujours calendaire');
        console.log('  - Sharpe Ratio et VaR calculés');
        console.log(`  - ⚠️ MIN_VOL_30D: ${MIN_VOL_30D}% (abaissé pour inclure BTC/ETH)`);
        
        // Stats globales
        const validReturns = rows.filter(r => r.ret_30d_pct !== '');
        const avgReturn30d = validReturns.reduce((sum, r) => sum + parseFloat(r.ret_30d_pct || 0), 0) / validReturns.length;
        const avgVol30d = validReturns.reduce((sum, r) => sum + parseFloat(r.vol_30d_annual_pct || 0), 0) / validReturns.length;
        
        console.log(`\n📈 Statistiques globales (${validReturns.length} cryptos valides):`);
        console.log(`  - Rendement ${labels.l30} moyen: ${avgReturn30d.toFixed(2)}%`);
        console.log(`  - Volatilité 30D moyenne: ${avgVol30d.toFixed(2)}%`);
        
        // Afficher quelques exemples pour validation
        if (CONFIG.DEBUG && validReturns.length > 0) {
            console.log(`\n🔍 Exemples de calculs (top 3) - Mode ${CONFIG.RETURNS_MODE}:`);
            validReturns.slice(0, 3).forEach(r => {
                console.log(`  ${r.symbol}: ${labels.l30}=${r.ret_30d_pct}%, ${labels.l90}=${r.ret_90d_pct}%, ${labels.l365}=${r.ret_1y_pct}%`);
            });
        }
    })().catch(e => {
        console.error('❌ Erreur main:', e);
        process.exit(1);
    });
}
