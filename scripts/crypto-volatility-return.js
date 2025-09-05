/**
 * crypto-volatility-return.js
 * Module d'analyse de volatilité et de rendements pour cryptomonnaies
 * Intégration avec TradePulse Platform
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
    API_KEY: process.env.TWELVE_DATA_KEY || '',
    RATE_LIMIT_DELAY: 8100,  // 8.1s entre requêtes (API limit)
    CACHE_TTL: 3600000,  // 1 heure en ms
};

// Liste des exchanges Tier-1
const TIER1_EXCHANGES = ['binance', 'coinbase', 'kraken', 'bitstamp', 'gemini'];

// ============================================================================
// Cache et gestion de données
// ============================================================================

class DataCache {
    constructor(ttl = CONFIG.CACHE_TTL) {
        this.cache = new Map();
        this.ttl = ttl;
    }

    set(key, value) {
        this.cache.set(key, {
            data: value,
            timestamp: Date.now()
        });
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
    }
}

const dataCache = new DataCache();

// ============================================================================
// Fonctions utilitaires mathématiques
// ============================================================================

// Calcul du pourcentage de changement
function pct(current, previous) {
    if (!previous || previous === 0) return 0;
    return (current - previous) / previous;
}

// Calcul de l'écart-type
function stdev(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

// Annualisation de l'écart-type selon l'intervalle
function annualizeStd(std, interval) {
    const periodsPerYear = interval === '1h' ? 365 * 24 : 365;
    return std * Math.sqrt(periodsPerYear);
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
    
    const slice = values.slice(-window);
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

// Vérification si l'exchange est Tier-1
function hasTier1(exchanges) {
    if (!exchanges || !Array.isArray(exchanges)) return false;
    return exchanges.some(ex => TIER1_EXCHANGES.includes(ex.toLowerCase()));
}

// ============================================================================
// Fonctions de récupération de données
// ============================================================================

async function fetchCloses(symbol, exchange, interval, outputsize) {
    const cacheKey = `${symbol}-${exchange}-${interval}-${outputsize}`;
    const cached = dataCache.get(cacheKey);
    
    if (cached) {
        console.log(`Using cached data for ${symbol}`);
        return cached;
    }
    
    try {
        const url = new URL('https://api.twelvedata.com/time_series');
        url.searchParams.append('symbol', symbol);
        url.searchParams.append('interval', interval);
        url.searchParams.append('outputsize', outputsize);
        url.searchParams.append('apikey', CONFIG.API_KEY);
        
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
        
        // Transformer les données en format standard
        const candles = data.values.map(v => ({
            t: v.datetime,
            o: parseFloat(v.open),
            h: parseFloat(v.high),
            l: parseFloat(v.low),
            c: parseFloat(v.close),
            v: parseFloat(v.volume || 0)
        })).reverse(); // Inverser pour avoir chronologique
        
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
    
    // Détermine l'exchange à utiliser
    const useEx = exList.find(ex => TIER1_EXCHANGES.includes(ex.toLowerCase())) || exList[0] || '';
    
    // Calcul du nombre de barres nécessaires
    const barsForDays = d => (INTERVAL === '1h' ? 24 * d : d);
    
    const needDD = barsForDays(CONFIG.DD_WINDOW);
    
    const baseBars = (INTERVAL === '1h')
        ? Math.max(24 * WIN_VOL_30D + 24, 24 * CONFIG.LOOKBACK_DAYS)
        : Math.max(WIN_VOL_30D + 10, CONFIG.LOOKBACK_DAYS);
    
    // En daily, assure au moins 365 jours d'historique pour ret_1y
    const needLongReturns = (INTERVAL === '1h') ? 0 : barsForDays(WIN_RET_365D) + 2;
    const barsNeeded = Math.max(baseBars, needDD + 5, needLongReturns);
    
    // Objet résultat avec toutes les métriques (sans Sharpe et trend_regime)
    const result = {
        symbol,
        currency_base: base,
        currency_quote: quote,
        exchange_used: useEx || '',
        last_close: '',
        last_datetime: '',
        ret_1d_pct: '',
        ret_7d_pct: '',
        ret_30d_pct: '',
        ret_90d_pct: '',
        ret_1y_pct: '',
        vol_7d_annual_pct: '',
        vol_30d_annual_pct: '',
        atr14_pct: '',
        drawdown_90d_pct: '',
        tier1_listed: hasTier1(exList) ? 'true' : 'false',
        stale: '',
        data_points: '0'
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
            
            // Calculs des rendements courts (1d, 7d, 30d)
            const N1 = (INTERVAL === '1h') ? 24 : 1;
            if (closes.length >= N1 + 1) {
                const prev1 = closes[closes.length - N1 - 1];
                result.ret_1d_pct = (pct(last, prev1) * 100).toFixed(2);
            }
            
            const N7 = (INTERVAL === '1h') ? 24 * WIN_RET_7D : WIN_RET_7D;
            if (closes.length >= N7 + 1) {
                const prev7 = closes[closes.length - N7 - 1];
                result.ret_7d_pct = (pct(last, prev7) * 100).toFixed(2);
                
                // Volatilité 7 jours
                const rets7 = [];
                for (let i = closes.length - N7; i < closes.length; i++) {
                    rets7.push(pct(closes[i], closes[i - 1]));
                }
                const vol7 = stdev(rets7);
                result.vol_7d_annual_pct = (annualizeStd(vol7, INTERVAL) * 100).toFixed(2);
            }
            
            const N30 = (INTERVAL === '1h') ? 24 * WIN_RET_30D : WIN_RET_30D;
            if (closes.length >= N30 + 1) {
                const prev30 = closes[closes.length - N30 - 1];
                result.ret_30d_pct = (pct(last, prev30) * 100).toFixed(2);
                
                // Volatilité 30 jours
                const rets30 = [];
                for (let i = closes.length - N30; i < closes.length; i++) {
                    rets30.push(pct(closes[i], closes[i - 1]));
                }
                const vol30 = stdev(rets30);
                result.vol_30d_annual_pct = (annualizeStd(vol30, INTERVAL) * 100).toFixed(2);
            }
            
            // ------- Rendements longs (90j & 1 an) -------
            // En '1h', on préfère récupérer une série daily pour ces horizons
            let longCloses = closes;
            if (INTERVAL === '1h') {
                const daily = await fetchCloses(symbol, useEx, '1day', WIN_RET_365D + 10);
                if (daily.length) {
                    longCloses = daily.map(x => x.c);
                }
            }
            
            if (longCloses && longCloses.length) {
                const L = longCloses.length;
                const lastLong = longCloses[L - 1];
                
                // 90 jours
                if (L >= WIN_RET_90D + 1) {
                    const prev90 = longCloses[L - WIN_RET_90D - 1];
                    result.ret_90d_pct = (pct(lastLong, prev90) * 100).toFixed(2);
                }
                
                // 365 jours
                if (L >= WIN_RET_365D + 1) {
                    const prev365 = longCloses[L - WIN_RET_365D - 1];
                    result.ret_1y_pct = (pct(lastLong, prev365) * 100).toFixed(2);
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
            
            // Vérification de la fraîcheur des données
            const lastDate = new Date(lastDt);
            const now = new Date();
            const hoursSince = (now - lastDate) / (1000 * 60 * 60);
            result.stale = hoursSince > 24 ? 'true' : 'false';
        }
        
    } catch (error) {
        console.error(`Error processing ${symbol}:`, error);
        result.stale = 'error';
    }
    
    return result;
}

// ============================================================================
// Fonction d'export principale
// ============================================================================

async function generateVolatilityReport(cryptoList) {
    const results = [];
    
    // Header CSV avec toutes les colonnes (sans sharpe_ratio et trend_regime)
    const header = [
        'symbol', 'currency_base', 'currency_quote', 'exchange_used',
        'last_close', 'last_datetime',
        'ret_1d_pct', 'ret_7d_pct', 'ret_30d_pct', 'ret_90d_pct', 'ret_1y_pct',
        'vol_7d_annual_pct', 'vol_30d_annual_pct', 'atr14_pct',
        'drawdown_90d_pct',
        'tier1_listed', 'stale', 'data_points'
    ];
    
    results.push(header);
    
    // Traitement de chaque crypto avec rate limiting
    for (const crypto of cryptoList) {
        const result = await processCrypto(
            crypto.symbol,
            crypto.base || crypto.symbol,
            crypto.quote || 'USD',
            crypto.exchanges || []
        );
        
        // Conversion en ligne CSV
        const row = header.map(col => result[col] || '');
        results.push(row);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
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
                ['binance', 'coinbase']
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
                    ret1y: metrics.ret_1y_pct
                },
                risk: {
                    drawdown: metrics.drawdown_90d_pct,
                    tier1: metrics.tier1_listed
                }
            });
        }
        
        this.notifyUpdate(enhanced);
        return enhanced;
    }
    
    // Méthode pour obtenir les cryptos les moins volatiles
    getLowVolatility(cryptoList, count = 10) {
        const withVol = cryptoList.filter(c => c.volatility?.vol30d);
        withVol.sort((a, b) => parseFloat(a.volatility.vol30d) - parseFloat(b.volatility.vol30d));
        return withVol.slice(0, count);
    }
    
    // Méthode pour obtenir les meilleurs performers
    getBestPerformers(cryptoList, period = 'ret30d', count = 10) {
        const withReturns = cryptoList.filter(c => c.returns?.[period]);
        withReturns.sort((a, b) => parseFloat(b.returns[period]) - parseFloat(a.returns[period]));
        return withReturns.slice(0, count);
    }
    
    // Méthode pour analyser la corrélation avec Bitcoin
    async analyzeBTCCorrelation(cryptoList) {
        const btcData = cryptoList.find(c => c.symbol === 'BTC');
        if (!btcData) return [];
        
        const correlations = [];
        for (const crypto of cryptoList) {
            if (crypto.symbol === 'BTC') continue;
            
            // Ici on pourrait calculer la corrélation réelle avec les séries temporelles
            // Pour l'instant, on retourne une structure de placeholder
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
        generateVolatilityReport,
        CryptoVolatilityIntegration,
        calculateATR,
        calculateMaxDrawdown,
        calculateCorrelation
    };
}

// Initialisation pour le navigateur
if (typeof window !== 'undefined') {
    window.CryptoVolatility = new CryptoVolatilityIntegration();
    
    // Auto-intégration avec crypto-script.js si présent
    if (window.cryptoData) {
        console.log('Auto-enhancing crypto data with volatility metrics...');
        window.CryptoVolatility.enhanceCryptoData(window.cryptoData.indices);
    }
}

// Log de démarrage
console.log('Crypto Volatility & Returns Module loaded successfully');
console.log(`Configuration: Interval=${CONFIG.INTERVAL}, Lookback=${CONFIG.LOOKBACK_DAYS} days`);
