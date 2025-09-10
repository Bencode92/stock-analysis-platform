/**
 * dividend-calculator.js
 * Module de calcul avancé pour les dividendes avec gestion des stock splits
 * Corrige les problèmes de cache et améliore la précision des calculs TTM
 * @version 1.0.0
 * @date 2025-01-10
 */

class DividendCalculator {
  constructor(config = {}) {
    this.config = {
      DEBUG: config.DEBUG || false,
      API_KEY: config.API_KEY || '',
      CACHE_TTL: config.CACHE_TTL || 3600000, // 1 heure par défaut
      ...config
    };
    
    // Cache avec timestamp pour éviter les données périmées
    this.successCache = new Map();
    this.cacheTimestamps = new Map();
    this.splitAdjustmentCache = new Map();
  }

  /**
   * Fetch TwelveData avec gestion de cache améliorée
   * Corrige le problème de réordonnancement du cache pour les endpoints sensibles
   */
  async fetchTD(endpoint, trials, extraParams = {}) {
    // Clé de cache précise incluant tous les paramètres critiques
    const makeKey = (t) => 
      `${endpoint}:${t.symbol || ''}:${t.exchange || ''}:${t.mic_code || ''}:${t.country || ''}`;

    // Endpoints sensibles qui ne doivent pas être réordonnés par cache
    const CACHE_REORDER_UNSAFE = ['dividends', 'time_series', 'splits', 'earnings'];
    const skipCacheReorder = CACHE_REORDER_UNSAFE.includes(endpoint);

    // Vérification du cache avec expiration
    const firstKey = makeKey(trials[0]);
    let cachedParams = this.successCache.get(firstKey);
    const cacheTime = this.cacheTimestamps.get(firstKey);
    
    // Invalider le cache s'il est trop vieux
    if (cachedParams && cacheTime) {
      const age = Date.now() - cacheTime;
      if (age > this.config.CACHE_TTL) {
        this.successCache.delete(firstKey);
        this.cacheTimestamps.delete(firstKey);
        cachedParams = null;
      }
    }

    // Réorganiser avec le cache en premier seulement si sûr
    if (cachedParams && !skipCacheReorder) {
      trials = [
        cachedParams, 
        ...trials.filter(t => makeKey(t) !== makeKey(cachedParams))
      ];
    }

    // Essayer chaque configuration de paramètres
    for (const params of trials) {
      try {
        const response = await this.makeApiCall(endpoint, params, extraParams);
        
        if (response && response.status !== 'error') {
          // Mémoriser les paramètres qui ont fonctionné avec timestamp
          const key = makeKey(params);
          this.successCache.set(key, params);
          this.cacheTimestamps.set(key, Date.now());
          
          if (this.config.DEBUG) {
            console.log(`✅ [TD ${endpoint}] Success with:`, params);
          }
          
          return response;
        }
        
        if (this.config.DEBUG && response) {
          console.warn(`⚠️ [TD ${endpoint}] API Error:`, response.message || response.status);
        }
      } catch (error) {
        this.handleApiError(endpoint, params, error);
      }
    }
    
    return null;
  }

  /**
   * Effectue l'appel API avec axios ou fetch
   */
  async makeApiCall(endpoint, params, extraParams) {
    const url = `https://api.twelvedata.com/${endpoint}`;
    const queryParams = { ...params, ...extraParams, apikey: this.config.API_KEY };
    
    // Support pour axios et fetch natif
    if (typeof axios !== 'undefined') {
      const { data } = await axios.get(url, {
        params: queryParams,
        timeout: 15000
      });
      return data;
    } else {
      // Fallback sur fetch natif
      const queryString = new URLSearchParams(queryParams).toString();
      const response = await fetch(`${url}?${queryString}`, {
        signal: AbortSignal.timeout(15000)
      });
      return await response.json();
    }
  }

  /**
   * Gestion des erreurs API
   */
  handleApiError(endpoint, params, error) {
    if (this.config.DEBUG && error.response?.status !== 404) {
      console.warn(`❌ [TD Exception ${endpoint}]`, params, error.message);
    }
  }

  /**
   * Calcul du TTM avec gestion intelligente des splits
   */
  calculateTTM(dividends, currentPrice, splitInfo = null) {
    if (!dividends || !Array.isArray(dividends) || dividends.length === 0) {
      return {
        ttmSum: 0,
        adjustedSum: 0,
        dividendCount: 0,
        yield: null,
        hasRecentSplit: false,
        source: 'no_data'
      };
    }

    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(now.getMonth() - 12);
    
    // Filtrer les dividendes des 12 derniers mois
    const ttmDividends = dividends.filter(d => {
      const exDate = new Date(d.ex_date || d.payment_date || d.date);
      return exDate >= twelveMonthsAgo && exDate <= now;
    });

    if (this.config.DEBUG) {
      const windowDebug = ttmDividends
        .map(d => `${d.ex_date || d.date}:${d.amount}`)
        .join(', ');
      console.log(`📊 [TTM Window] ${windowDebug} | Count: ${ttmDividends.length}`);
    }

    // Détection de split récent
    const recentSplit = this.detectRecentSplit(splitInfo);
    
    // Calcul avec ajustement pour split si nécessaire
    let ttmSum = 0;
    let adjustedSum = 0;
    const adjustmentDetails = [];
    
    ttmDividends.forEach(dividend => {
      const amount = parseFloat(dividend.amount) || 0;
      const divDate = new Date(dividend.ex_date || dividend.payment_date || dividend.date);
      
      // Ajuster pour split si nécessaire
      let adjustedAmount = amount;
      let wasAdjusted = false;
      
      if (recentSplit && divDate < recentSplit.date) {
        adjustedAmount = amount / recentSplit.ratio;
        wasAdjusted = true;
        
        if (this.config.DEBUG) {
          console.log(`🔄 Split adjustment: ${amount} → ${adjustedAmount.toFixed(4)} (ratio: ${recentSplit.ratio})`);
        }
      }
      
      ttmSum += amount;
      adjustedSum += adjustedAmount;
      
      adjustmentDetails.push({
        date: dividend.ex_date || dividend.date,
        original: amount,
        adjusted: adjustedAmount,
        wasAdjusted
      });
    });

    // Calcul du rendement
    const yieldTTM = currentPrice > 0 ? (adjustedSum / currentPrice) * 100 : null;
    
    // Validation du rendement
    const isReasonableYield = yieldTTM !== null && yieldTTM > 0 && yieldTTM < 25;
    
    return {
      ttmSum: ttmSum,
      adjustedSum: adjustedSum,
      dividendCount: ttmDividends.length,
      yield: yieldTTM,
      hasRecentSplit: !!recentSplit,
      source: 'calculated',
      isValid: ttmDividends.length >= 1 && isReasonableYield,
      debug: {
        windowStart: twelveMonthsAgo.toISOString().split('T')[0],
        windowEnd: now.toISOString().split('T')[0],
        dividendDetails: adjustmentDetails,
        splitInfo: recentSplit,
        currentPrice: currentPrice
      }
    };
  }

  /**
   * Détection de split récent (< 18 mois)
   */
  detectRecentSplit(splitData) {
    if (!splitData || !Array.isArray(splitData) || splitData.length === 0) {
      return null;
    }
    
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
    
    // Filtrer et trier les splits récents
    const recentSplits = splitData
      .filter(split => {
        const splitDate = new Date(split.split_date || split.date);
        return splitDate >= eighteenMonthsAgo;
      })
      .sort((a, b) => {
        const dateA = new Date(a.split_date || a.date);
        const dateB = new Date(b.split_date || b.date);
        return dateB - dateA; // Plus récent en premier
      });
    
    if (recentSplits.length > 0) {
      const mostRecent = recentSplits[0];
      const fromFactor = parseFloat(mostRecent.from_factor || mostRecent.split_from || 1);
      const toFactor = parseFloat(mostRecent.to_factor || mostRecent.split_to || 1);
      const ratio = toFactor / fromFactor;
      
      if (this.config.DEBUG) {
        console.log(`📈 Recent split detected: ${fromFactor}:${toFactor} on ${mostRecent.split_date || mostRecent.date}`);
      }
      
      return {
        date: new Date(mostRecent.split_date || mostRecent.date),
        ratio: ratio,
        fromFactor: fromFactor,
        toFactor: toFactor,
        description: `${fromFactor}:${toFactor}`,
        raw: mostRecent
      };
    }
    
    return null;
  }

  /**
   * Sélection intelligente de la source de rendement avec traçabilité
   */
  selectDividendYield(ttmCalc, apiData, forwardYield, specialSharePct = 0) {
    let selectedYield = null;
    let source = null;
    let confidence = 'low';
    let reason = '';
    
    // Extraction des données API
    const apiTrailing = apiData?.trailing || apiData?.dividend_yield || apiData?.yield_ttm;
    const apiForward = forwardYield || apiData?.forward || apiData?.yield_forward;
    
    // Critères de validation du calcul TTM
    const minDividendCount = ttmCalc?.hasRecentSplit ? 2 : 3; // Plus tolérant si split récent
    const ttmValid = ttmCalc && 
                     ttmCalc.isValid &&
                     ttmCalc.dividendCount >= minDividendCount && 
                     ttmCalc.yield > 0 && 
                     ttmCalc.yield < 20;
    
    // Logique de sélection avec priorités et raisons
    if (ttmCalc?.hasRecentSplit && ttmValid) {
      // Priorité au calcul ajusté si split récent
      selectedYield = ttmCalc.yield;
      source = 'TTM (calc, split-adj)';
      confidence = 'high';
      reason = `Split-adjusted calculation with ${ttmCalc.dividendCount} dividends`;
      
    } else if (ttmValid && specialSharePct < 30) {
      // Calcul TTM sans split pour actions ordinaires
      selectedYield = ttmCalc.yield;
      source = 'TTM (calculated)';
      confidence = 'high';
      reason = `Direct calculation with ${ttmCalc.dividendCount} dividends`;
      
    } else if (specialSharePct >= 30 && apiTrailing) {
      // Actions spéciales : privilégier l'API
      selectedYield = parseFloat(apiTrailing);
      source = 'TTM (API, special)';
      confidence = 'medium';
      reason = `Special shares (${specialSharePct.toFixed(0)}%), using API data`;
      
    } else if (apiTrailing && (!ttmCalc || ttmCalc.dividendCount < minDividendCount)) {
      // Fallback sur l'API si calcul insuffisant
      selectedYield = parseFloat(apiTrailing);
      source = 'TTM (API override)';
      confidence = 'medium';
      reason = `Insufficient dividend history (${ttmCalc?.dividendCount || 0} < ${minDividendCount})`;
      
      if (this.config.DEBUG) {
        console.log(`⚠️ TTM calc insufficient, using API: ${selectedYield}%`);
      }
      
    } else if (apiForward) {
      // Dernier recours : forward yield
      selectedYield = parseFloat(apiForward);
      source = 'Forward (estimated)';
      confidence = 'low';
      reason = 'No TTM data available, using forward estimate';
      
    } else {
      // Aucune donnée disponible
      selectedYield = null;
      source = 'N/A';
      confidence = 'none';
      reason = 'No dividend data available';
    }
    
    // Validation finale du rendement
    if (selectedYield !== null && (selectedYield < 0 || selectedYield > 50)) {
      if (this.config.DEBUG) {
        console.warn(`⚠️ Unreasonable yield detected: ${selectedYield}%`);
      }
      confidence = 'low';
    }
    
    return {
      value: selectedYield,
      source: source,
      confidence: confidence,
      reason: reason,
      debug: {
        ttmValid: ttmValid,
        ttmCount: ttmCalc?.dividendCount || 0,
        ttmYield: ttmCalc?.yield,
        hasApiData: !!apiTrailing,
        apiYield: apiTrailing,
        hasForward: !!apiForward,
        forwardYield: apiForward,
        specialSharePct: specialSharePct
      }
    };
  }

  /**
   * Calcul du payout ratio avec gestion des cas spéciaux
   */
  calculatePayoutRatio(dividendYield, eps, price, sector = '') {
    if (!dividendYield || !eps || eps <= 0) {
      return {
        value: null,
        formatted: '-',
        confidence: 'none',
        cssClass: ''
      };
    }
    
    // Calcul du dividende annuel estimé
    const annualDividend = (dividendYield / 100) * price;
    const payoutRatio = (annualDividend / eps) * 100;
    
    // Détection des secteurs spéciaux (REIT, utilities)
    const isREIT = /reit|real estate|immobili/i.test(sector);
    const isUtility = /utility|utilities|electric|water/i.test(sector);
    
    // Seuils adaptés selon le secteur
    const thresholds = {
      excellent: isREIT ? 50 : isUtility ? 40 : 30,
      good: isREIT ? 80 : isUtility ? 65 : 60,
      warning: isREIT ? 95 : isUtility ? 80 : 80,
      danger: isREIT ? 110 : isUtility ? 95 : 100
    };
    
    // Classification
    let cssClass, confidence;
    if (payoutRatio < thresholds.excellent) {
      cssClass = 'payout-excellent';
      confidence = 'high';
    } else if (payoutRatio < thresholds.good) {
      cssClass = 'payout-good';
      confidence = 'high';
    } else if (payoutRatio < thresholds.warning) {
      cssClass = 'payout-warning';
      confidence = 'medium';
    } else if (payoutRatio < thresholds.danger) {
      cssClass = 'payout-danger';
      confidence = 'low';
    } else {
      cssClass = 'payout-critical';
      confidence = 'low';
    }
    
    // Cap pour l'affichage
    const displayValue = Math.min(payoutRatio, isREIT ? 400 : 200);
    
    return {
      value: payoutRatio,
      displayValue: displayValue,
      formatted: `${displayValue.toFixed(1)}%`,
      confidence: confidence,
      cssClass: cssClass,
      sector: sector,
      isSpecialSector: isREIT || isUtility
    };
  }
}

// Export pour utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DividendCalculator;
} else {
  window.DividendCalculator = DividendCalculator;
}
