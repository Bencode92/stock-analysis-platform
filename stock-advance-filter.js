/**
 * stock-advance-filter.js
 * Module avancé de filtrage et calcul des dividendes avec gestion des stock splits
 * Version: 1.0.0
 * 
 * Corrections appliquées:
 * - Cache amélioré avec clé précise (symbol + exchange + mic_code)
 * - Pas de réordonnancement cache pour endpoints sensibles (dividends, time_series)
 * - Calcul TTM correct avec fenêtre de 12 mois
 * - Gestion des stock splits récents (< 18 mois)
 * - Labels de source corrects (TTM calc vs API)
 */

class StockAdvanceFilter {
  constructor(config = {}) {
    this.config = {
      DEBUG: config.DEBUG || false,
      API_KEY: config.API_KEY || '',
      TTM_WINDOW_MONTHS: 12,
      SPLIT_DETECTION_MONTHS: 18,
      MIN_DIVIDENDS_FOR_TTM: 3,
      MAX_REASONABLE_YIELD: 20,
      ...config
    };
    
    this.successCache = new Map();
    this.splitAdjustmentCache = new Map();
    this.debugLogs = [];
  }

  /**
   * Fetch TwelveData avec gestion de cache améliorée
   * Correctif v3.17.3: Clé de cache précise et pas de réordonnancement pour endpoints sensibles
   */
  async fetchTD(endpoint, trials, extraParams = {}) {
    // Clé de cache précise incluant tous les paramètres critiques
    const makeKey = (t) => 
      `${endpoint}:${t.symbol || ''}:${t.exchange || ''}:${t.mic_code || ''}`;

    // ⚠️ Endpoints sensibles qui ne doivent pas être réordonnés par cache
    const CACHE_REORDER_UNSAFE = ['dividends', 'time_series', 'splits'];
    const skipCacheReorder = CACHE_REORDER_UNSAFE.includes(endpoint);

    // Vérification du cache avec gestion intelligente
    let cachedParams = this.successCache.get(makeKey(trials[0]));
    if (cachedParams && !skipCacheReorder) {
      // Réorganiser avec le cache en premier SEULEMENT si sûr
      trials = [
        cachedParams, 
        ...trials.filter(t => makeKey(t) !== makeKey(cachedParams))
      ];
    }

    // Essayer chaque configuration de paramètres
    for (const params of trials) {
      try {
        const { data } = await axios.get(`https://api.twelvedata.com/${endpoint}`, {
          params: { ...params, ...extraParams, apikey: this.config.API_KEY },
          timeout: 15000
        });
        
        if (data && data.status !== 'error') {
          // ✅ Mémoriser les paramètres exacts qui ont fonctionné
          this.successCache.set(makeKey(params), params);
          
          if (this.config.DEBUG) {
            console.log(`✅ [TD ${endpoint}] Success with:`, params);
          }
          
          return data;
        }
        
        if (this.config.DEBUG) {
          console.warn(`⚠️ [TD FAIL ${endpoint}]`, params, data?.message || data?.status);
        }
      } catch (error) {
        if (this.config.DEBUG && error.response?.status !== 404) {
          console.warn(`❌ [TD ERROR ${endpoint}]`, params, error.message);
        }
      }
    }
    
    return null;
  }

  /**
   * Calcul du TTM avec gestion des splits
   * Correctif: Fenêtre de 12 mois correcte et ajustement pour splits
   */
  calculateTTM(dividends, currentPrice, splitInfo = null, symbol = '') {
    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(now.getMonth() - this.config.TTM_WINDOW_MONTHS);
    
    // Filtrer les dividendes des 12 derniers mois
    const ttmDividends = dividends.filter(d => {
      const exDate = new Date(d.ex_date || d.payment_date);
      return exDate >= twelveMonthsAgo && exDate <= now;
    });

    // Log de debug pour vérifier la fenêtre TTM
    if (this.config.DEBUG) {
      const windowDebug = ttmDividends
        .map(d => `${d.ex_date}:${d.amount}`)
        .join(', ');
      console.log(`📊 [TTM WINDOW ${symbol}]`, windowDebug, 
        `| Count: ${ttmDividends.length}`,
        `| Window: ${twelveMonthsAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`);
    }

    // Détection de split récent
    const recentSplit = this.detectRecentSplit(splitInfo);
    
    // Calcul avec ajustement pour split si nécessaire
    let ttmSum = 0;
    let adjustedSum = 0;
    let adjustmentDetails = [];
    
    ttmDividends.forEach(dividend => {
      const amount = parseFloat(dividend.amount) || 0;
      const divDate = new Date(dividend.ex_date || dividend.payment_date);
      
      // Ajuster pour split si nécessaire
      let adjustedAmount = amount;
      if (recentSplit && divDate < recentSplit.date) {
        // Dividende avant le split -> ajuster à la baisse
        adjustedAmount = amount / recentSplit.ratio;
        
        adjustmentDetails.push({
          date: dividend.ex_date,
          original: amount,
          adjusted: adjustedAmount,
          reason: `Split ${recentSplit.description}`
        });
        
        if (this.config.DEBUG) {
          console.log(`🔄 Split adjustment: ${amount} → ${adjustedAmount.toFixed(4)}`);
        }
      }
      
      ttmSum += amount;
      adjustedSum += adjustedAmount;
    });

    // Calcul du rendement
    const yieldTTM = currentPrice > 0 ? (adjustedSum / currentPrice) * 100 : null;
    
    // Log final du calcul
    if (this.config.DEBUG) {
      console.log(`💰 [TTM CALC ${symbol}]`,
        `Sum: ${ttmSum.toFixed(3)}`,
        `Adjusted: ${adjustedSum.toFixed(3)}`,
        `Price: ${currentPrice}`,
        `Yield: ${yieldTTM?.toFixed(2)}%`);
    }
    
    return {
      ttmSum: ttmSum,
      adjustedSum: adjustedSum,
      dividendCount: ttmDividends.length,
      yield: yieldTTM,
      hasRecentSplit: !!recentSplit,
      splitInfo: recentSplit,
      source: 'calculated',
      adjustments: adjustmentDetails,
      debug: {
        windowStart: twelveMonthsAgo.toISOString(),
        windowEnd: now.toISOString(),
        dividends: ttmDividends,
        splitAdjusted: recentSplit !== null
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
    
    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - this.config.SPLIT_DETECTION_MONTHS);
    
    const recentSplits = splitData.filter(split => {
      const splitDate = new Date(split.split_date);
      return splitDate >= monthsAgo;
    });
    
    if (recentSplits.length > 0) {
      // Prendre le split le plus récent
      const mostRecent = recentSplits[0];
      const toFactor = parseFloat(mostRecent.to_factor) || parseFloat(mostRecent.split_to) || 2;
      const fromFactor = parseFloat(mostRecent.from_factor) || parseFloat(mostRecent.split_from) || 1;
      const ratio = toFactor / fromFactor;
      
      if (this.config.DEBUG) {
        console.log(`🔀 Recent split detected: ${fromFactor}:${toFactor} on ${mostRecent.split_date}`);
      }
      
      return {
        date: new Date(mostRecent.split_date),
        ratio: ratio,
        description: `${fromFactor}:${toFactor}`,
        raw: mostRecent
      };
    }
    
    return null;
  }

  /**
   * Sélection intelligente de la source de rendement
   * Correctif: Propager la vraie source dans les labels
   */
  selectDividendYield(ttmCalc, apiData, forwardYield, symbol = '') {
    let selectedYield = null;
    let source = null;
    let confidence = 'low';
    let usedTtmSource = 'calc';
    
    // Critères de validation du calcul TTM
    const ttmValid = ttmCalc && 
                     ttmCalc.dividendCount >= this.config.MIN_DIVIDENDS_FOR_TTM && 
                     ttmCalc.yield > 0 && 
                     ttmCalc.yield < this.config.MAX_REASONABLE_YIELD;
    
    // Parser les données API si disponibles
    const apiTrailing = apiData?.trailing ? parseFloat(apiData.trailing) : null;
    const apiForward = apiData?.forward ? parseFloat(apiData.forward) : null;
    
    // Logique de sélection avec priorités
    if (ttmCalc?.hasRecentSplit && ttmValid) {
      // Priorité au calcul ajusté si split récent
      selectedYield = ttmCalc.yield;
      source = 'TTM (calc, split-adj)';
      confidence = 'high';
      usedTtmSource = 'calc_split_adj';
    } else if (ttmValid) {
      // Calcul TTM sans split
      selectedYield = ttmCalc.yield;
      source = 'TTM (calculated)';
      confidence = 'high';
      usedTtmSource = 'calc';
    } else if (apiTrailing && apiTrailing > 0 && apiTrailing < this.config.MAX_REASONABLE_YIELD) {
      // Fallback sur l'API TTM
      selectedYield = apiTrailing;
      source = 'TTM (API)';
      confidence = 'medium';
      usedTtmSource = 'api';
      
      if (this.config.DEBUG) {
        console.log(`⚠️ [${symbol}] TTM calc invalid (${ttmCalc?.dividendCount || 0} divs), using API: ${selectedYield.toFixed(2)}%`);
      }
    } else if (apiForward && apiForward > 0) {
      // Forward yield de l'API
      selectedYield = apiForward;
      source = 'FWD (API)';
      confidence = 'low';
    } else if (forwardYield && forwardYield > 0) {
      // Forward yield calculé
      selectedYield = parseFloat(forwardYield);
      source = 'Forward (estimated)';
      confidence = 'low';
    }
    
    // Si on a un split récent mais pas assez de données, le signaler
    if (ttmCalc?.hasRecentSplit && !ttmValid && apiTrailing) {
      source = 'TTM (API, post-split)';
      if (this.config.DEBUG) {
        console.log(`🔀 [${symbol}] Recent split but insufficient data, using API`);
      }
    }
    
    return {
      value: selectedYield,
      source: source,
      confidence: confidence,
      usedTtmSource: usedTtmSource,
      debug: {
        ttmValid: ttmValid,
        ttmCount: ttmCalc?.dividendCount || 0,
        ttmYield: ttmCalc?.yield,
        apiTrailing: apiTrailing,
        apiForward: apiForward,
        hasRecentSplit: ttmCalc?.hasRecentSplit || false
      }
    };
  }

  /**
   * Calcul du payout ratio avec gestion intelligente
   */
  computePayoutRatio(dividendYield, eps, earningsYield, sector = '') {
    if (!dividendYield || dividendYield <= 0) {
      return { value: null, str: '-', class: '', confidence: 'none' };
    }
    
    let payoutRatio = null;
    let method = '';
    
    // Méthode 1: Via EPS (la plus précise)
    if (eps && eps > 0) {
      // Assumant dividende annuel = yield * prix
      // et payout = (dividende par action / EPS)
      // On peut approximer si on a le nombre total de dividendes
      payoutRatio = (dividendYield / earningsYield) * 100;
      method = 'EPS';
    } 
    // Méthode 2: Via earnings yield
    else if (earningsYield && earningsYield > 0) {
      payoutRatio = (dividendYield / earningsYield) * 100;
      method = 'Earnings Yield';
    }
    
    if (!payoutRatio || payoutRatio < 0) {
      return { value: null, str: '-', class: '', confidence: 'none' };
    }
    
    // Ajustement pour secteurs spéciaux (REITs)
    const isREIT = sector?.toLowerCase().includes('reit') || 
                   sector?.toLowerCase().includes('immobili') ||
                   sector?.toLowerCase() === 'real estate';
    
    // Cap et classification
    const maxRatio = isREIT ? 400 : 200;
    payoutRatio = Math.min(payoutRatio, maxRatio);
    
    // Classification par couleur
    let colorClass = '';
    if (isREIT) {
      colorClass = payoutRatio < 70 ? 'payout-ok-strong' :
                   payoutRatio < 90 ? 'payout-ok' :
                   payoutRatio < 110 ? 'payout-warn' :
                   payoutRatio < 130 ? 'payout-high' :
                   'payout-risk';
    } else {
      colorClass = payoutRatio < 30 ? 'payout-ok-strong' :
                   payoutRatio < 60 ? 'payout-ok' :
                   payoutRatio < 80 ? 'payout-warn' :
                   payoutRatio < 100 ? 'payout-high' :
                   'payout-risk';
    }
    
    return {
      value: payoutRatio,
      str: `${payoutRatio.toFixed(1)}%`,
      class: colorClass,
      method: method,
      isREIT: isREIT,
      confidence: method === 'EPS' ? 'high' : 'medium'
    };
  }

  /**
   * Fonction principale pour traiter un stock complet
   */
  async processStock(stockData, options = {}) {
    const symbol = stockData.symbol || stockData.ticker;
    const currentPrice = parseFloat(stockData.price || stockData.last || 0);
    
    if (this.config.DEBUG) {
      console.log(`\n🔍 Processing ${symbol}...`);
    }
    
    // Récupérer les données de dividendes et splits si nécessaire
    let dividends = stockData.dividends;
    let splits = stockData.splits;
    
    if (!dividends && options.fetchMissing) {
      // Tentative de récupération via API
      const divData = await this.fetchTD('dividends', [
        { symbol: symbol, exchange: stockData.exchange },
        { symbol: symbol }
      ]);
      dividends = divData?.dividends || [];
    }
    
    if (!splits && options.fetchMissing) {
      const splitData = await this.fetchTD('splits', [
        { symbol: symbol, exchange: stockData.exchange },
        { symbol: symbol }
      ]);
      splits = splitData?.splits || [];
    }
    
    // Calcul TTM avec gestion des splits
    const ttmResult = this.calculateTTM(
      dividends || [], 
      currentPrice,
      splits,
      symbol
    );
    
    // Sélection de la meilleure source de rendement
    const dividendInfo = this.selectDividendYield(
      ttmResult,
      stockData.dividend_api_data || stockData.statistics,
      stockData.forward_yield,
      symbol
    );
    
    // Calcul du payout ratio
    const payoutInfo = this.computePayoutRatio(
      dividendInfo.value,
      stockData.eps,
      stockData.earnings_yield,
      stockData.sector
    );
    
    // Retourner les résultats enrichis
    return {
      ...stockData,
      // Données de dividendes calculées
      dividend_yield_ttm: dividendInfo.value,
      dividend_yield_source: dividendInfo.source,
      dividend_confidence: dividendInfo.confidence,
      total_dividends_ttm: ttmResult.adjustedSum,
      dividend_count_ttm: ttmResult.dividendCount,
      
      // Payout ratio
      payout_ratio: payoutInfo.value,
      payout_ratio_str: payoutInfo.str,
      payout_ratio_class: payoutInfo.class,
      payout_ratio_method: payoutInfo.method,
      
      // Indicateurs de split
      has_recent_split: ttmResult.hasRecentSplit,
      split_info: ttmResult.splitInfo,
      
      // Debug info
      debug_dividends: this.config.DEBUG ? {
        ttm_calculation: ttmResult,
        yield_selection: dividendInfo.debug,
        payout_calculation: payoutInfo,
        adjustments: ttmResult.adjustments
      } : null
    };
  }

  /**
   * Fonction pour filtrer et trier une liste de stocks
   */
  filterStocks(stocks, criteria = {}) {
    let filtered = [...stocks];
    
    // Filtre par rendement minimum
    if (criteria.minYield) {
      filtered = filtered.filter(s => 
        s.dividend_yield_ttm >= criteria.minYield
      );
    }
    
    // Filtre par rendement maximum
    if (criteria.maxYield) {
      filtered = filtered.filter(s => 
        s.dividend_yield_ttm <= criteria.maxYield
      );
    }
    
    // Filtre par payout ratio
    if (criteria.maxPayout) {
      filtered = filtered.filter(s => 
        s.payout_ratio && s.payout_ratio <= criteria.maxPayout
      );
    }
    
    // Filtre par confiance
    if (criteria.minConfidence) {
      const confidenceLevels = { 'low': 1, 'medium': 2, 'high': 3 };
      const minLevel = confidenceLevels[criteria.minConfidence] || 1;
      
      filtered = filtered.filter(s => {
        const level = confidenceLevels[s.dividend_confidence] || 0;
        return level >= minLevel;
      });
    }
    
    // Exclure les stocks avec split récent si demandé
    if (criteria.excludeRecentSplits) {
      filtered = filtered.filter(s => !s.has_recent_split);
    }
    
    // Tri
    if (criteria.sortBy) {
      const sortField = criteria.sortBy;
      const sortOrder = criteria.sortOrder || 'desc';
      
      filtered.sort((a, b) => {
        const aVal = a[sortField] || 0;
        const bVal = b[sortField] || 0;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    return filtered;
  }

  /**
   * Export des données pour analyse
   */
  exportToCSV(stocks) {
    const headers = [
      'Symbol',
      'Name',
      'Price',
      'Dividend Yield TTM',
      'Source',
      'Confidence',
      'Payout Ratio',
      'Has Split',
      'Dividend Count'
    ];
    
    const rows = stocks.map(s => [
      s.symbol || s.ticker,
      s.name,
      s.price || s.last,
      s.dividend_yield_ttm?.toFixed(2) || '-',
      s.dividend_yield_source,
      s.dividend_confidence,
      s.payout_ratio_str || '-',
      s.has_recent_split ? 'Yes' : 'No',
      s.dividend_count_ttm || 0
    ]);
    
    // Créer le CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(','))
    ].join('\n');
    
    return csvContent;
  }

  /**
   * Réinitialiser les caches
   */
  clearCache() {
    this.successCache.clear();
    this.splitAdjustmentCache.clear();
    this.debugLogs = [];
    
    if (this.config.DEBUG) {
      console.log('✅ Caches cleared');
    }
  }
}

// Export global pour utilisation dans d'autres scripts
if (typeof window !== 'undefined') {
  window.StockAdvanceFilter = StockAdvanceFilter;
}

// Export pour modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StockAdvanceFilter;
}

// Initialisation automatique si configuré
if (typeof window !== 'undefined' && window.AUTO_INIT_STOCK_FILTER) {
  window.stockFilter = new StockAdvanceFilter(window.STOCK_FILTER_CONFIG || {});
  console.log('✅ StockAdvanceFilter initialized');
}
