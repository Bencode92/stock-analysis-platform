/**
 * stock-advance-filter.js
 * Module avancé de filtrage avec critères Buffett (P/E, EPS, ROE, D/E)
 * Version: 2.0.0
 * 
 * Ajouts v2.0:
 * - fetchStatistics() pour P/E, EPS, marges
 * - evaluateBuffettQuality() scoring qualité Buffett
 * - Intégration cache fondamentaux (ROE, D/E)
 * - _parseFloat() robuste pour API
 * 
 * Corrections v1.0:
 * - Cache amélioré avec clé précise (symbol + exchange + mic_code)
 * - Calcul TTM correct avec fenêtre de 12 mois
 * - Gestion des stock splits récents (< 18 mois)
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class StockAdvanceFilter {
  constructor(config = {}) {
    this.config = {
      DEBUG: config.DEBUG || process.env.DEBUG === 'true',
      API_KEY: config.API_KEY || process.env.TWELVE_DATA_API_KEY || '',
      TTM_WINDOW_MONTHS: 12,
      SPLIT_DETECTION_MONTHS: 18,
      MIN_DIVIDENDS_FOR_TTM: 3,
      MAX_REASONABLE_YIELD: 20,
      FUNDAMENTALS_CACHE_FILE: config.FUNDAMENTALS_CACHE_FILE || 'data/fundamentals_cache.json',
      STATISTICS_CACHE_FILE: config.STATISTICS_CACHE_FILE || 'data/statistics_cache.json',
      CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 jours
      RATE_LIMIT_MS: config.RATE_LIMIT_MS || 2500,
      ...config
    };
    
    this.successCache = new Map();
    this.splitAdjustmentCache = new Map();
    this.fundamentalsCache = null;
    this.statisticsCache = null;
    this.debugLogs = [];
    
    // ═══════════════════════════════════════════════════════════════════════
    // SEUILS BUFFETT
    // ═══════════════════════════════════════════════════════════════════════
    this.BUFFETT_THRESHOLDS = {
      // ROE (Return on Equity)
      ROE_EXCELLENT: 20,    // > 20% = excellent
      ROE_GOOD: 15,         // > 15% = bon
      ROE_ACCEPTABLE: 10,   // > 10% = acceptable
      
      // D/E (Debt to Equity)
      DE_LOW: 0.5,          // < 0.5 = faible endettement
      DE_MODERATE: 1.0,     // < 1.0 = modéré
      DE_HIGH: 2.0,         // < 2.0 = élevé
      DE_DANGEROUS: 3.0,    // > 3.0 = dangereux
      
      // P/E (Price to Earnings)
      PE_UNDERVALUED: 15,   // < 15 = sous-évalué
      PE_FAIR: 25,          // < 25 = raisonnable
      PE_OVERVALUED: 40,    // > 40 = surévalué
      
      // EPS (Earnings Per Share)
      EPS_GROWTH_GOOD: 10,  // > 10% croissance = bon
      EPS_GROWTH_EXCELLENT: 20, // > 20% = excellent
      
      // Marges
      MARGIN_EXCELLENT: 20, // > 20% net margin = excellent
      MARGIN_GOOD: 10,      // > 10% = bon
      
      // Score final
      QUALITY_EXCELLENT: 80,
      QUALITY_GOOD: 60,
      QUALITY_ACCEPTABLE: 40
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Parse un float de manière robuste (gère %, null, undefined, objets)
   */
  _parseFloat(value) {
    if (value === null || value === undefined || value === '' || value === 'null') {
      return null;
    }
    
    // Si c'est un objet, essayer d'extraire une valeur
    if (typeof value === 'object') {
      value = value.value || value.raw || Object.values(value)[0];
    }
    
    // Si c'est une string avec %, la convertir
    if (typeof value === 'string') {
      value = value.replace('%', '').trim();
    }
    
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Convertit décimal en pourcentage si nécessaire (0.18 → 18)
   */
  _toPercent(value) {
    const num = this._parseFloat(value);
    if (num === null) return null;
    
    // Si la valeur est entre -1 et 1, c'est probablement un décimal
    if (num > -1 && num < 1) {
      return num * 100;
    }
    return num;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async loadFundamentalsCache() {
    if (this.fundamentalsCache) return this.fundamentalsCache;
    
    try {
      const txt = await fs.readFile(this.config.FUNDAMENTALS_CACHE_FILE, 'utf8');
      this.fundamentalsCache = JSON.parse(txt);
      if (this.config.DEBUG) {
        console.log(`📁 Cache fondamentaux chargé: ${Object.keys(this.fundamentalsCache.data || {}).length} stocks`);
      }
      return this.fundamentalsCache;
    } catch {
      this.fundamentalsCache = { updated: null, data: {} };
      return this.fundamentalsCache;
    }
  }

  async loadStatisticsCache() {
    if (this.statisticsCache) return this.statisticsCache;
    
    try {
      const txt = await fs.readFile(this.config.STATISTICS_CACHE_FILE, 'utf8');
      this.statisticsCache = JSON.parse(txt);
      if (this.config.DEBUG) {
        console.log(`📁 Cache statistics chargé: ${Object.keys(this.statisticsCache.data || {}).length} stocks`);
      }
      return this.statisticsCache;
    } catch {
      this.statisticsCache = { updated: null, data: {} };
      return this.statisticsCache;
    }
  }

  async saveStatisticsCache() {
    if (!this.statisticsCache) return;
    
    this.statisticsCache.updated = new Date().toISOString();
    const dir = path.dirname(this.config.STATISTICS_CACHE_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.config.STATISTICS_CACHE_FILE, 
      JSON.stringify(this.statisticsCache, null, 2), 
      'utf8'
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API FETCH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch TwelveData avec gestion de cache améliorée
   */
  async fetchTD(endpoint, trials, extraParams = {}) {
    const makeKey = (t) => 
      `${endpoint}:${t.symbol || ''}:${t.exchange || ''}:${t.mic_code || ''}`;

    const CACHE_REORDER_UNSAFE = ['dividends', 'time_series', 'splits'];
    const skipCacheReorder = CACHE_REORDER_UNSAFE.includes(endpoint);

    let cachedParams = this.successCache.get(makeKey(trials[0]));
    if (cachedParams && !skipCacheReorder) {
      trials = [
        cachedParams, 
        ...trials.filter(t => makeKey(t) !== makeKey(cachedParams))
      ];
    }

    for (const params of trials) {
      try {
        const { data } = await axios.get(`https://api.twelvedata.com/${endpoint}`, {
          params: { ...params, ...extraParams, apikey: this.config.API_KEY },
          timeout: 15000
        });
        
        if (data && data.status !== 'error' && !data.code) {
          this.successCache.set(makeKey(params), params);
          
          if (this.config.DEBUG) {
            console.log(`✅ [TD ${endpoint}] Success with:`, params.symbol);
          }
          
          return data;
        }
        
        if (this.config.DEBUG) {
          console.warn(`⚠️ [TD FAIL ${endpoint}]`, params.symbol, data?.message || data?.code);
        }
      } catch (error) {
        if (this.config.DEBUG && error.response?.status !== 404) {
          console.warn(`❌ [TD ERROR ${endpoint}]`, params.symbol, error.message);
        }
      }
    }
    
    return null;
  }

  /**
   * Récupère les statistiques d'un stock (P/E, EPS, marges, etc.)
   * Endpoint: /statistics (100 credits)
   */
  async fetchStatistics(symbol, options = {}) {
    await this.loadStatisticsCache();
    
    const now = Date.now();
    const cached = this.statisticsCache.data[symbol];
    
    // Vérifier le cache
    if (cached && cached.fetched_at) {
      const cachedTime = new Date(cached.fetched_at).getTime();
      if (now - cachedTime < this.config.CACHE_TTL_MS) {
        if (this.config.DEBUG) {
          console.log(`📦 [CACHE HIT] ${symbol} statistics`);
        }
        return cached;
      }
    }
    
    // Fetch depuis l'API
    const data = await this.fetchTD('statistics', [
      { symbol, exchange: options.exchange },
      { symbol }
    ]);
    
    if (!data || !data.statistics) {
      if (this.config.DEBUG) {
        console.warn(`⚠️ Pas de statistics pour ${symbol}`);
      }
      return null;
    }
    
    const stats = data.statistics;
    
    // Parser les données avec conversion décimal → pourcentage
    const result = {
      symbol,
      // Valuation
      pe_ratio: this._parseFloat(stats.valuations_metrics?.pe_ratio),
      forward_pe: this._parseFloat(stats.valuations_metrics?.forward_pe),
      peg_ratio: this._parseFloat(stats.valuations_metrics?.peg_ratio),
      price_to_book: this._parseFloat(stats.valuations_metrics?.price_to_book),
      price_to_sales: this._parseFloat(stats.valuations_metrics?.price_to_sales),
      enterprise_to_ebitda: this._parseFloat(stats.valuations_metrics?.enterprise_to_ebitda),
      
      // EPS
      eps_ttm: this._parseFloat(stats.financials?.eps_ttm),
      eps_diluted_ttm: this._parseFloat(stats.financials?.eps_diluted_ttm),
      
      // Croissance (déjà en %)
      revenue_growth_yoy: this._toPercent(stats.financials?.revenue_growth_yoy),
      earnings_growth_yoy: this._toPercent(stats.financials?.earnings_growth_yoy),
      eps_growth_yoy: this._toPercent(stats.financials?.eps_growth_yoy),
      
      // Marges (convertir décimal → %)
      gross_margin: this._toPercent(stats.financials?.gross_margin),
      operating_margin: this._toPercent(stats.financials?.operating_margin),
      profit_margin: this._toPercent(stats.financials?.profit_margin),
      net_margin: this._toPercent(stats.financials?.net_margin),
      
      // Rentabilité (convertir décimal → %)
      return_on_equity: this._toPercent(stats.financials?.return_on_equity_ttm),
      return_on_assets: this._toPercent(stats.financials?.return_on_assets_ttm),
      
      // Endettement
      debt_to_equity: this._parseFloat(stats.financials?.debt_to_equity),
      current_ratio: this._parseFloat(stats.financials?.current_ratio),
      quick_ratio: this._parseFloat(stats.financials?.quick_ratio),
      
      // Dividendes
      dividend_yield: this._toPercent(stats.dividends_and_splits?.dividend_yield),
      payout_ratio: this._toPercent(stats.dividends_and_splits?.payout_ratio),
      
      // Autres
      beta: this._parseFloat(stats.stock_statistics?.beta),
      market_cap: this._parseFloat(stats.stock_statistics?.market_cap),
      shares_outstanding: this._parseFloat(stats.stock_statistics?.shares_outstanding),
      
      fetched_at: new Date().toISOString(),
      source: 'twelve_data_statistics'
    };
    
    // Sauvegarder dans le cache
    this.statisticsCache.data[symbol] = result;
    
    if (this.config.DEBUG) {
      console.log(`📊 [STATS] ${symbol}: P/E=${result.pe_ratio}, EPS=${result.eps_ttm}, ROE=${result.return_on_equity}%`);
    }
    
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUFFETT QUALITY EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Évalue la qualité Buffett d'un stock
   * Retourne un score 0-100 avec détails par critère
   * 
   * @param {Object} stockData - Données du stock (incluant fondamentaux et statistics)
   * @returns {Object} Score et détails
   */
  evaluateBuffettQuality(stockData) {
    const T = this.BUFFETT_THRESHOLDS;
    const scores = {};
    const flags = [];
    const details = {};
    
    let totalPoints = 0;
    let maxPoints = 0;
    
    // ─────────────────────────────────────────────────────────────────────────
    // 1. ROE (Return on Equity) - 25 points max
    // ─────────────────────────────────────────────────────────────────────────
    const roe = this._parseFloat(stockData.roe) ?? 
                this._parseFloat(stockData.return_on_equity);
    
    maxPoints += 25;
    if (roe !== null) {
      if (roe >= T.ROE_EXCELLENT) {
        scores.roe = 25;
        flags.push('ROE_EXCELLENT');
      } else if (roe >= T.ROE_GOOD) {
        scores.roe = 20;
        flags.push('ROE_GOOD');
      } else if (roe >= T.ROE_ACCEPTABLE) {
        scores.roe = 12;
        flags.push('ROE_ACCEPTABLE');
      } else if (roe > 0) {
        scores.roe = 5;
        flags.push('ROE_LOW');
      } else {
        scores.roe = 0;
        flags.push('ROE_NEGATIVE');
      }
      details.roe = { value: roe, score: scores.roe, max: 25 };
    } else {
      scores.roe = 0;
      details.roe = { value: null, score: 0, max: 25, missing: true };
    }
    totalPoints += scores.roe || 0;
    
    // ─────────────────────────────────────────────────────────────────────────
    // 2. D/E (Debt to Equity) - 20 points max
    // ─────────────────────────────────────────────────────────────────────────
    const de = this._parseFloat(stockData.de_ratio) ?? 
               this._parseFloat(stockData.debt_to_equity);
    
    maxPoints += 20;
    if (de !== null) {
      if (de < 0) {
        // Dette négative = equity négatif, problématique
        scores.de = 0;
        flags.push('EQUITY_NEGATIVE');
      } else if (de <= T.DE_LOW) {
        scores.de = 20;
        flags.push('DEBT_LOW');
      } else if (de <= T.DE_MODERATE) {
        scores.de = 15;
        flags.push('DEBT_MODERATE');
      } else if (de <= T.DE_HIGH) {
        scores.de = 8;
        flags.push('DEBT_HIGH');
      } else if (de <= T.DE_DANGEROUS) {
        scores.de = 3;
        flags.push('DEBT_VERY_HIGH');
      } else {
        scores.de = 0;
        flags.push('DEBT_DANGEROUS');
      }
      details.de = { value: de, score: scores.de, max: 20 };
    } else {
      scores.de = 0;
      details.de = { value: null, score: 0, max: 20, missing: true };
    }
    totalPoints += scores.de || 0;
    
    // ─────────────────────────────────────────────────────────────────────────
    // 3. P/E (Price to Earnings) - 20 points max
    // ─────────────────────────────────────────────────────────────────────────
    const pe = this._parseFloat(stockData.pe_ratio) ?? 
               this._parseFloat(stockData.pe);
    
    maxPoints += 20;
    if (pe !== null) {
      if (pe < 0) {
        // P/E négatif = pertes
        scores.pe = 0;
        flags.push('PE_NEGATIVE');
      } else if (pe > 0 && pe <= T.PE_UNDERVALUED) {
        scores.pe = 20;
        flags.push('PE_UNDERVALUED');
      } else if (pe <= T.PE_FAIR) {
        scores.pe = 15;
        flags.push('PE_FAIR');
      } else if (pe <= T.PE_OVERVALUED) {
        scores.pe = 8;
        flags.push('PE_HIGH');
      } else {
        scores.pe = 2;
        flags.push('PE_VERY_HIGH');
      }
      details.pe = { value: pe, score: scores.pe, max: 20 };
    } else {
      scores.pe = 0;
      details.pe = { value: null, score: 0, max: 20, missing: true };
    }
    totalPoints += scores.pe || 0;
    
    // ─────────────────────────────────────────────────────────────────────────
    // 4. EPS (Earnings Per Share) - 15 points max
    // ─────────────────────────────────────────────────────────────────────────
    const eps = this._parseFloat(stockData.eps_ttm) ?? 
                this._parseFloat(stockData.eps);
    const epsGrowth = this._parseFloat(stockData.eps_growth_yoy);
    
    maxPoints += 15;
    if (eps !== null) {
      if (eps > 0) {
        // EPS positif = profitable
        if (epsGrowth !== null && epsGrowth >= T.EPS_GROWTH_EXCELLENT) {
          scores.eps = 15;
          flags.push('EPS_GROWTH_EXCELLENT');
        } else if (epsGrowth !== null && epsGrowth >= T.EPS_GROWTH_GOOD) {
          scores.eps = 12;
          flags.push('EPS_GROWTH_GOOD');
        } else if (epsGrowth !== null && epsGrowth > 0) {
          scores.eps = 10;
          flags.push('EPS_GROWING');
        } else {
          scores.eps = 7;
          flags.push('EPS_POSITIVE');
        }
      } else {
        scores.eps = 0;
        flags.push('EPS_NEGATIVE');
      }
      details.eps = { 
        value: eps, 
        growth: epsGrowth, 
        score: scores.eps, 
        max: 15 
      };
    } else {
      scores.eps = 0;
      details.eps = { value: null, score: 0, max: 15, missing: true };
    }
    totalPoints += scores.eps || 0;
    
    // ─────────────────────────────────────────────────────────────────────────
    // 5. Marges (Profit Margin) - 10 points max
    // ─────────────────────────────────────────────────────────────────────────
    const margin = this._parseFloat(stockData.profit_margin) ?? 
                   this._parseFloat(stockData.net_margin);
    
    maxPoints += 10;
    if (margin !== null) {
      if (margin >= T.MARGIN_EXCELLENT) {
        scores.margin = 10;
        flags.push('MARGIN_EXCELLENT');
      } else if (margin >= T.MARGIN_GOOD) {
        scores.margin = 7;
        flags.push('MARGIN_GOOD');
      } else if (margin > 0) {
        scores.margin = 4;
        flags.push('MARGIN_POSITIVE');
      } else {
        scores.margin = 0;
        flags.push('MARGIN_NEGATIVE');
      }
      details.margin = { value: margin, score: scores.margin, max: 10 };
    } else {
      scores.margin = 0;
      details.margin = { value: null, score: 0, max: 10, missing: true };
    }
    totalPoints += scores.margin || 0;
    
    // ─────────────────────────────────────────────────────────────────────────
    // 6. Current Ratio (Liquidité) - 10 points max
    // ─────────────────────────────────────────────────────────────────────────
    const currentRatio = this._parseFloat(stockData.current_ratio);
    
    maxPoints += 10;
    if (currentRatio !== null) {
      if (currentRatio >= 2.0) {
        scores.liquidity = 10;
        flags.push('LIQUIDITY_STRONG');
      } else if (currentRatio >= 1.5) {
        scores.liquidity = 8;
        flags.push('LIQUIDITY_GOOD');
      } else if (currentRatio >= 1.0) {
        scores.liquidity = 5;
        flags.push('LIQUIDITY_OK');
      } else {
        scores.liquidity = 2;
        flags.push('LIQUIDITY_WEAK');
      }
      details.liquidity = { value: currentRatio, score: scores.liquidity, max: 10 };
    } else {
      scores.liquidity = 0;
      details.liquidity = { value: null, score: 0, max: 10, missing: true };
    }
    totalPoints += scores.liquidity || 0;
    
    // ─────────────────────────────────────────────────────────────────────────
    // CALCUL SCORE FINAL
    // ─────────────────────────────────────────────────────────────────────────
    
    // Normaliser sur 100
    const rawScore = totalPoints;
    const normalizedScore = Math.round((totalPoints / maxPoints) * 100);
    
    // Déterminer le grade
    let grade, gradeLabel;
    if (normalizedScore >= T.QUALITY_EXCELLENT) {
      grade = 'A';
      gradeLabel = 'Excellent';
    } else if (normalizedScore >= T.QUALITY_GOOD) {
      grade = 'B';
      gradeLabel = 'Bon';
    } else if (normalizedScore >= T.QUALITY_ACCEPTABLE) {
      grade = 'C';
      gradeLabel = 'Acceptable';
    } else {
      grade = 'D';
      gradeLabel = 'Faible';
    }
    
    // Compter les données manquantes
    const missingCount = Object.values(details).filter(d => d.missing).length;
    const dataCompleteness = Math.round(((6 - missingCount) / 6) * 100);
    
    return {
      symbol: stockData.symbol || stockData.Ticker,
      score: normalizedScore,
      rawScore: rawScore,
      maxScore: maxPoints,
      grade: grade,
      gradeLabel: gradeLabel,
      flags: flags,
      scores: scores,
      details: details,
      dataCompleteness: dataCompleteness,
      missingMetrics: missingCount,
      
      // Résumé rapide
      summary: {
        roe: roe !== null ? `${roe.toFixed(1)}%` : 'N/A',
        de: de !== null ? de.toFixed(2) : 'N/A',
        pe: pe !== null ? pe.toFixed(1) : 'N/A',
        eps: eps !== null ? eps.toFixed(2) : 'N/A',
        margin: margin !== null ? `${margin.toFixed(1)}%` : 'N/A'
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIVIDEND CALCULATION (existing code, kept intact)
  // ═══════════════════════════════════════════════════════════════════════════

  calculateTTM(dividends, currentPrice, splitInfo = null, symbol = '') {
    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(now.getMonth() - this.config.TTM_WINDOW_MONTHS);
    
    const ttmDividends = dividends.filter(d => {
      const exDate = new Date(d.ex_date || d.payment_date);
      return exDate >= twelveMonthsAgo && exDate <= now;
    });

    if (this.config.DEBUG) {
      const windowDebug = ttmDividends
        .map(d => `${d.ex_date}:${d.amount}`)
        .join(', ');
      console.log(`📊 [TTM WINDOW ${symbol}]`, windowDebug, 
        `| Count: ${ttmDividends.length}`,
        `| Window: ${twelveMonthsAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`);
    }

    const recentSplit = this.detectRecentSplit(splitInfo);
    
    let ttmSum = 0;
    let adjustedSum = 0;
    let adjustmentDetails = [];
    
    ttmDividends.forEach(dividend => {
      const amount = parseFloat(dividend.amount) || 0;
      const divDate = new Date(dividend.ex_date || dividend.payment_date);
      
      let adjustedAmount = amount;
      if (recentSplit && divDate < recentSplit.date) {
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

    const yieldTTM = currentPrice > 0 ? (adjustedSum / currentPrice) * 100 : null;
    
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

  selectDividendYield(ttmCalc, apiData, forwardYield, symbol = '') {
    let selectedYield = null;
    let source = null;
    let confidence = 'low';
    let usedTtmSource = 'calc';
    
    const ttmValid = ttmCalc && 
                     ttmCalc.dividendCount >= this.config.MIN_DIVIDENDS_FOR_TTM && 
                     ttmCalc.yield > 0 && 
                     ttmCalc.yield < this.config.MAX_REASONABLE_YIELD;
    
    const apiTrailing = apiData?.trailing ? parseFloat(apiData.trailing) : null;
    const apiForward = apiData?.forward ? parseFloat(apiData.forward) : null;
    
    if (ttmCalc?.hasRecentSplit && ttmValid) {
      selectedYield = ttmCalc.yield;
      source = 'TTM (calc, split-adj)';
      confidence = 'high';
      usedTtmSource = 'calc_split_adj';
    } else if (ttmValid) {
      selectedYield = ttmCalc.yield;
      source = 'TTM (calculated)';
      confidence = 'high';
      usedTtmSource = 'calc';
    } else if (apiTrailing && apiTrailing > 0 && apiTrailing < this.config.MAX_REASONABLE_YIELD) {
      selectedYield = apiTrailing;
      source = 'TTM (API)';
      confidence = 'medium';
      usedTtmSource = 'api';
      
      if (this.config.DEBUG) {
        console.log(`⚠️ [${symbol}] TTM calc invalid (${ttmCalc?.dividendCount || 0} divs), using API: ${selectedYield.toFixed(2)}%`);
      }
    } else if (apiForward && apiForward > 0) {
      selectedYield = apiForward;
      source = 'FWD (API)';
      confidence = 'low';
    } else if (forwardYield && forwardYield > 0) {
      selectedYield = parseFloat(forwardYield);
      source = 'Forward (estimated)';
      confidence = 'low';
    }
    
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

  computePayoutRatio(dividendYield, eps, earningsYield, sector = '') {
    if (!dividendYield || dividendYield <= 0) {
      return { value: null, str: '-', class: '', confidence: 'none' };
    }
    
    let payoutRatio = null;
    let method = '';
    
    if (eps && eps > 0) {
      payoutRatio = (dividendYield / earningsYield) * 100;
      method = 'EPS';
    } 
    else if (earningsYield && earningsYield > 0) {
      payoutRatio = (dividendYield / earningsYield) * 100;
      method = 'Earnings Yield';
    }
    
    if (!payoutRatio || payoutRatio < 0) {
      return { value: null, str: '-', class: '', confidence: 'none' };
    }
    
    const isREIT = sector?.toLowerCase().includes('reit') || 
                   sector?.toLowerCase().includes('immobili') ||
                   sector?.toLowerCase() === 'real estate';
    
    const maxRatio = isREIT ? 400 : 200;
    payoutRatio = Math.min(payoutRatio, maxRatio);
    
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Traite un stock complet avec fondamentaux ET statistics
   */
  async processStock(stockData, options = {}) {
    const symbol = stockData.symbol || stockData.ticker || stockData.Ticker;
    const currentPrice = parseFloat(stockData.price || stockData.last || 0);
    
    if (this.config.DEBUG) {
      console.log(`\n🔍 Processing ${symbol}...`);
    }
    
    // Charger les caches
    await this.loadFundamentalsCache();
    await this.loadStatisticsCache();
    
    // Récupérer les fondamentaux depuis le cache (ROE, D/E)
    const fundamentals = this.fundamentalsCache.data[symbol] || {};
    
    // Récupérer les statistics (P/E, EPS, marges)
    let statistics = this.statisticsCache.data[symbol];
    if (!statistics && options.fetchMissing) {
      statistics = await this.fetchStatistics(symbol, {
        exchange: stockData.exchange
      });
      await new Promise(r => setTimeout(r, this.config.RATE_LIMIT_MS));
    }
    statistics = statistics || {};
    
    // Fusionner les données
    const mergedData = {
      ...stockData,
      // Du cache fondamentaux
      roe: fundamentals.roe,
      de_ratio: fundamentals.de_ratio,
      // Du cache statistics
      pe_ratio: statistics.pe_ratio,
      forward_pe: statistics.forward_pe,
      eps_ttm: statistics.eps_ttm,
      eps_growth_yoy: statistics.eps_growth_yoy,
      profit_margin: statistics.profit_margin,
      current_ratio: statistics.current_ratio,
      return_on_equity: statistics.return_on_equity,
      debt_to_equity: statistics.debt_to_equity
    };
    
    // Calculer le score Buffett
    const buffettQuality = this.evaluateBuffettQuality(mergedData);
    
    // Traitement des dividendes si disponibles
    let dividends = stockData.dividends;
    let splits = stockData.splits;
    
    if (!dividends && options.fetchMissing) {
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
    
    const ttmResult = this.calculateTTM(
      dividends || [], 
      currentPrice,
      splits,
      symbol
    );
    
    const dividendInfo = this.selectDividendYield(
      ttmResult,
      stockData.dividend_api_data || statistics,
      stockData.forward_yield,
      symbol
    );
    
    const payoutInfo = this.computePayoutRatio(
      dividendInfo.value,
      statistics.eps_ttm,
      stockData.earnings_yield,
      stockData.sector || stockData.Secteur
    );
    
    return {
      ...stockData,
      
      // Fondamentaux Buffett
      roe: fundamentals.roe,
      de_ratio: fundamentals.de_ratio,
      pe_ratio: statistics.pe_ratio,
      eps_ttm: statistics.eps_ttm,
      eps_growth_yoy: statistics.eps_growth_yoy,
      profit_margin: statistics.profit_margin,
      current_ratio: statistics.current_ratio,
      
      // Score qualité Buffett
      buffett_score: buffettQuality.score,
      buffett_grade: buffettQuality.grade,
      buffett_flags: buffettQuality.flags,
      buffett_details: buffettQuality,
      
      // Dividendes
      dividend_yield_ttm: dividendInfo.value,
      dividend_yield_source: dividendInfo.source,
      dividend_confidence: dividendInfo.confidence,
      total_dividends_ttm: ttmResult.adjustedSum,
      dividend_count_ttm: ttmResult.dividendCount,
      
      // Payout
      payout_ratio: payoutInfo.value,
      payout_ratio_str: payoutInfo.str,
      payout_ratio_class: payoutInfo.class,
      
      // Split
      has_recent_split: ttmResult.hasRecentSplit,
      split_info: ttmResult.splitInfo,
      
      // Debug
      debug_buffett: this.config.DEBUG ? buffettQuality : null
    };
  }

  /**
   * Filtre les stocks selon critères Buffett
   */
  filterStocks(stocks, criteria = {}) {
    let filtered = [...stocks];
    
    // Filtres Buffett
    if (criteria.minBuffettScore) {
      filtered = filtered.filter(s => 
        s.buffett_score >= criteria.minBuffettScore
      );
    }
    
    if (criteria.minROE) {
      filtered = filtered.filter(s => 
        s.roe !== null && s.roe >= criteria.minROE
      );
    }
    
    if (criteria.maxDE) {
      filtered = filtered.filter(s => 
        s.de_ratio !== null && s.de_ratio <= criteria.maxDE
      );
    }
    
    if (criteria.maxPE) {
      filtered = filtered.filter(s => 
        s.pe_ratio !== null && s.pe_ratio > 0 && s.pe_ratio <= criteria.maxPE
      );
    }
    
    if (criteria.minEPS) {
      filtered = filtered.filter(s => 
        s.eps_ttm !== null && s.eps_ttm >= criteria.minEPS
      );
    }
    
    // Filtres dividendes (existants)
    if (criteria.minYield) {
      filtered = filtered.filter(s => 
        s.dividend_yield_ttm >= criteria.minYield
      );
    }
    
    if (criteria.maxYield) {
      filtered = filtered.filter(s => 
        s.dividend_yield_ttm <= criteria.maxYield
      );
    }
    
    if (criteria.maxPayout) {
      filtered = filtered.filter(s => 
        s.payout_ratio && s.payout_ratio <= criteria.maxPayout
      );
    }
    
    if (criteria.minConfidence) {
      const confidenceLevels = { 'low': 1, 'medium': 2, 'high': 3 };
      const minLevel = confidenceLevels[criteria.minConfidence] || 1;
      
      filtered = filtered.filter(s => {
        const level = confidenceLevels[s.dividend_confidence] || 0;
        return level >= minLevel;
      });
    }
    
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
   * Export CSV enrichi
   */
  exportToCSV(stocks) {
    const headers = [
      'Symbol',
      'Name',
      'Sector',
      'Price',
      'Buffett Score',
      'Grade',
      'ROE %',
      'D/E',
      'P/E',
      'EPS',
      'Margin %',
      'Div Yield %',
      'Source',
      'Confidence'
    ];
    
    const rows = stocks.map(s => [
      s.symbol || s.Ticker,
      s.name || s.Stock,
      s.sector || s.Secteur,
      s.price || s.last,
      s.buffett_score || '-',
      s.buffett_grade || '-',
      s.roe?.toFixed(1) || '-',
      s.de_ratio?.toFixed(2) || '-',
      s.pe_ratio?.toFixed(1) || '-',
      s.eps_ttm?.toFixed(2) || '-',
      s.profit_margin?.toFixed(1) || '-',
      s.dividend_yield_ttm?.toFixed(2) || '-',
      s.dividend_yield_source || '-',
      s.dividend_confidence || '-'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(','))
    ].join('\n');
    
    return csvContent;
  }

  clearCache() {
    this.successCache.clear();
    this.splitAdjustmentCache.clear();
    this.fundamentalsCache = null;
    this.statisticsCache = null;
    this.debugLogs = [];
    
    if (this.config.DEBUG) {
      console.log('✅ Caches cleared');
    }
  }
}

// Export
if (typeof window !== 'undefined') {
  window.StockAdvanceFilter = StockAdvanceFilter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StockAdvanceFilter;
}

if (typeof window !== 'undefined' && window.AUTO_INIT_STOCK_FILTER) {
  window.stockFilter = new StockAdvanceFilter(window.STOCK_FILTER_CONFIG || {});
  console.log('✅ StockAdvanceFilter v2.0 initialized');
}
