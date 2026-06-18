/**
 * stock-advance-filter.js
 * Module avancé de filtrage avec scoring Buffett v3.1 + Quality Score v2
 * Version: 3.0.0
 *
 * v3.0 (mars 2026):
 * - Buffett Score v3.1: 6 critères pass/fail (ROE consistent, ROIC moat, leverage, FCF yield, PE, moat expansion)
 * - Quality Score v2: 5 dimensions (Quality, Safety, Value, Growth, Momentum) + global-adjusted peer scoring
 * - 4 profils sectoriels: FIN, YIELD, TECH, DEFAULT
 * - Payment network reclassification (V, MA, PYPL, AXP → DEFAULT)
 * - FIN bias fixes: alpha 0.85, stability cap +3, coverage min 5, growth re-enabled, FCF penalty excluded
 * - Momentum dimension: moat trajectory, capital allocation quality, margin resilience
 * - computeQualityScores() batch method pour scoring peer-relatif
 * - processStockBatch() pour traitement complet (Buffett + Quality)
 * - evaluateBuffettQuality() conservé pour rétrocompatibilité (wrapper vers v3.1)
 *
 * v2.0 (conservé intégralement):
 * - fetchStatistics() pour P/E, EPS, marges (tous les champs)
 * - calculateTTM() avec gestion splits, adjustmentDetails, debug
 * - selectDividendYield() avec debug complet
 * - computePayoutRatio() avec logique REIT
 * - exportToCSV()
 * - Cache fondamentaux + statistics avec TTL
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
      // v3.0: Quality Score config
      QUALITY_ALPHA: config.QUALITY_ALPHA || 0.70,
      QUALITY_MIN_PEER_SIZE: config.QUALITY_MIN_PEER_SIZE || 5,
      ...config
    };

    this.successCache = new Map();
    this.splitAdjustmentCache = new Map();
    this.fundamentalsCache = null;
    this.statisticsCache = null;
    this.debugLogs = [];

    // Legacy thresholds (kept for backward compatibility)
    this.BUFFETT_THRESHOLDS = {
      ROE_EXCELLENT: 20, ROE_GOOD: 15, ROE_ACCEPTABLE: 10,
      DE_LOW: 0.5, DE_MODERATE: 1.0, DE_HIGH: 2.0, DE_DANGEROUS: 3.0,
      PE_UNDERVALUED: 15, PE_FAIR: 25, PE_OVERVALUED: 40,
      EPS_GROWTH_GOOD: 10, EPS_GROWTH_EXCELLENT: 20,
      MARGIN_EXCELLENT: 20, MARGIN_GOOD: 10,
      QUALITY_EXCELLENT: 80, QUALITY_GOOD: 60, QUALITY_ACCEPTABLE: 40
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _parseFloat(value) {
    if (value === null || value === undefined || value === '' || value === 'null') return null;
    if (typeof value === 'object') value = value.value || value.raw || Object.values(value)[0];
    if (typeof value === 'string') value = value.replace('%', '').trim();
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  _toPercent(value) {
    const num = this._parseFloat(value);
    if (num === null) return null;
    return (num > -1 && num < 1) ? num * 100 : num;
  }

  // v3.0 helpers
  _validNum(x) { return Number.isFinite(x); }
  _clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  _safeAvg(xs) {
    const v = (xs || []).filter(x => this._validNum(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v3.0: SECTOR PROFILE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Détecte le profil sectoriel pour pondération du scoring
   * FIX6: Payment networks détectés AVANT le check FIN
   * @returns {'FIN'|'YIELD'|'TECH'|'DEFAULT'}
   */
  detectProfile(sector, industry) {
    const s = (sector || '').toLowerCase();
    const i = (industry || '').toLowerCase();
    // FIX6: Payment networks = tech platforms, pas banques
    if (/payment|credit services|transaction process|financial data|financial exchange/i.test(i)) return 'DEFAULT';
    if (/financ|bank|insurance/.test(s)) return 'FIN';
    if (/utilit|reit|telecom|immobil|communication|electric/.test(s)) return 'YIELD';
    // TECH: industry-based (précis) ou sector-based (fallback quand industry absente)
    if (/software|semiconductor|internet|electronic|computer|digital/.test(i)) return 'TECH';
    if (/technologie|technology|information tech/i.test(s)) {
      // Si industry dispo et tech-specific → TECH
      if (i && /software|semi|cloud|cyber|data|saas|platform/.test(i)) return 'TECH';
      // Si pas d'industry → fallback TECH par secteur
      if (!i) return 'TECH';
    }
    return 'DEFAULT';
  }

  /** Poids par profil: Q=Quality, S=Safety, V=Value, G=Growth, M=Momentum */
  getProfileWeights(profile) {
    switch (profile) {
      case 'FIN':   return { q: 0.35, s: 0.25, v: 0.20, g: 0.10, m: 0.10 };
      case 'YIELD': return { q: 0.25, s: 0.35, v: 0.30, g: 0.00, m: 0.10 };
      case 'TECH':  return { q: 0.25, s: 0.10, v: 0.15, g: 0.30, m: 0.20 };
      default:      return { q: 0.25, s: 0.25, v: 0.25, g: 0.10, m: 0.15 };
    }
  }

  /** Alpha PGR par profil — FIX1: FIN = 0.85 */
  getProfileAlpha(profile) {
    const base = this.config.QUALITY_ALPHA;
    switch (profile) {
      case 'FIN':   return 0.85;
      case 'YIELD': return Math.min(base + 0.15, 0.95);
      default:      return base;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE MANAGEMENT (v2.0 inchangé)
  // ═══════════════════════════════════════════════════════════════════════════

  async loadFundamentalsCache() {
    if (this.fundamentalsCache) return this.fundamentalsCache;
    try {
      const txt = await fs.readFile(this.config.FUNDAMENTALS_CACHE_FILE, 'utf8');
      this.fundamentalsCache = JSON.parse(txt);
      if (this.config.DEBUG) console.log(`📁 Cache fondamentaux: ${Object.keys(this.fundamentalsCache.data || {}).length} stocks`);
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
      if (this.config.DEBUG) console.log(`📁 Cache statistics: ${Object.keys(this.statisticsCache.data || {}).length} stocks`);
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
    await fs.writeFile(this.config.STATISTICS_CACHE_FILE, JSON.stringify(this.statisticsCache, null, 2), 'utf8');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API FETCH (v2.0 inchangé)
  // ═══════════════════════════════════════════════════════════════════════════

  async fetchTD(endpoint, trials, extraParams = {}) {
    const makeKey = (t) => `${endpoint}:${t.symbol || ''}:${t.exchange || ''}:${t.mic_code || ''}`;
    const CACHE_REORDER_UNSAFE = ['dividends', 'time_series', 'splits'];
    const skipCacheReorder = CACHE_REORDER_UNSAFE.includes(endpoint);

    let cachedParams = this.successCache.get(makeKey(trials[0]));
    if (cachedParams && !skipCacheReorder) {
      trials = [cachedParams, ...trials.filter(t => makeKey(t) !== makeKey(cachedParams))];
    }

    for (const params of trials) {
      try {
        const { data } = await axios.get(`https://api.twelvedata.com/${endpoint}`, {
          params: { ...params, ...extraParams, apikey: this.config.API_KEY },
          timeout: 15000
        });
        if (data && data.status !== 'error' && !data.code) {
          this.successCache.set(makeKey(params), params);
          if (this.config.DEBUG) console.log(`✅ [TD ${endpoint}]`, params.symbol);
          return data;
        }
        if (this.config.DEBUG) console.warn(`⚠️ [TD FAIL ${endpoint}]`, params.symbol, data?.message || data?.code);
      } catch (error) {
        if (this.config.DEBUG && error.response?.status !== 404) {
          console.warn(`❌ [TD ERROR ${endpoint}]`, params.symbol, error.message);
        }
      }
    }
    return null;
  }

  /**
   * Récupère les statistiques d'un stock (v2.0 — tous les champs conservés)
   */
  async fetchStatistics(symbol, options = {}) {
    await this.loadStatisticsCache();
    const now = Date.now();
    const cached = this.statisticsCache.data[symbol];
    if (cached && cached.fetched_at) {
      const cachedTime = new Date(cached.fetched_at).getTime();
      if (now - cachedTime < this.config.CACHE_TTL_MS) {
        if (this.config.DEBUG) console.log(`📦 [CACHE HIT] ${symbol} statistics`);
        return cached;
      }
    }

    const data = await this.fetchTD('statistics', [
      { symbol, exchange: options.exchange },
      { symbol }
    ]);
    if (!data || !data.statistics) {
      if (this.config.DEBUG) console.warn(`⚠️ Pas de statistics pour ${symbol}`);
      return null;
    }

    const stats = data.statistics;
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
      // Croissance
      revenue_growth_yoy: this._toPercent(stats.financials?.revenue_growth_yoy),
      earnings_growth_yoy: this._toPercent(stats.financials?.earnings_growth_yoy),
      eps_growth_yoy: this._toPercent(stats.financials?.eps_growth_yoy),
      // Marges
      gross_margin: this._toPercent(stats.financials?.gross_margin),
      operating_margin: this._toPercent(stats.financials?.operating_margin),
      profit_margin: this._toPercent(stats.financials?.profit_margin),
      net_margin: this._toPercent(stats.financials?.net_margin),
      // Rentabilité
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

    this.statisticsCache.data[symbol] = result;
    if (this.config.DEBUG) {
      console.log(`📊 [STATS] ${symbol}: P/E=${result.pe_ratio}, EPS=${result.eps_ttm}, ROE=${result.return_on_equity}%`);
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v3.0: BUFFETT SCORE v3.1 — Absolute Moat Gate (6 critères)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 6 critères pass/fail indépendants du secteur
   * Mesure: "Ce business a-t-il un moat absolu?"
   * @param {Object} stock - Données enrichies
   * @returns {{ score, grade, criteria[], passed, total, dataAvailable }}
   */
  evaluateBuffettScore(stock) {
    const criteria = [];
    let dataAvailable = 0;

    // 1. ROE consistant: avg 3Y >= 15% ET CV < 30%
    const roeAvg = this._parseFloat(stock.roe_avg_3y) ?? this._parseFloat(stock.roe);
    const roeStd = this._parseFloat(stock.roe_std_3y);
    if (this._validNum(roeAvg)) {
      dataAvailable++;
      // FIX: si roe_std_3y est null, on ne peut pas confirmer la stabilité → cv=unknown
      // On passe le critère ROE >= 15 mais sans confirmation de stabilité
      const hasStdData = this._validNum(roeStd);
      const cv = hasStdData && Math.abs(roeAvg) > 0 ? roeStd / Math.abs(roeAvg) : null;
      const roeOk = roeAvg >= 15;
      const cvOk = cv === null ? true : cv < 0.30;  // si cv inconnu, on ne pénalise pas mais on flag
      criteria.push({
        name: 'roe_consistent',
        passed: roeOk && cvOk,
        value: roeAvg,
        detail: `${roeAvg.toFixed(1)}% cv=${cv !== null ? (cv * 100).toFixed(0) + '%' : '?'}`,
        cv_unknown: !hasStdData
      });
    }

    // 2. ROIC moat: avg 3Y >= 10%
    // Fix Fabre v7 (2026-06-18) : skip ROIC pour vraies banques/assurances
    // (levier structurel = ROIC non pertinent). PAS skip pour Credit Services
    // (Visa/MA), Capital Markets (MSCI/CBOE), Asset Management (TROW) — ROIC
    // y reste pertinent. Avant ce fix : toutes les vraies banques plafonnaient
    // à 83 (5/6) au lieu de 100.
    const _sector = (stock.sector || '').toLowerCase();
    const _industry = (stock.industry || '').toLowerCase();
    const _isFinanceSector = _sector.includes('financ') || _sector.includes('banque');
    const _skipRoicForBank = _isFinanceSector && (
      _industry.includes('bank') ||
      _industry.includes('insurance') ||
      _industry.includes('assurance') ||
      _industry.includes('mortgage') ||
      _industry.includes('thrifts')
    );
    const roicAvg = this._parseFloat(stock.roic_avg_3y) ?? this._parseFloat(stock.roic);
    if (this._validNum(roicAvg) && !_skipRoicForBank) {
      dataAvailable++;
      criteria.push({ name: 'roic_moat', passed: roicAvg >= 10, value: roicAvg, detail: `${roicAvg.toFixed(1)}%` });
    }

    // 3. Levier raisonnable: 0 <= D/E <= 1.5
    const de = this._parseFloat(stock.de_ratio);
    if (this._validNum(de)) {
      dataAvailable++;
      criteria.push({ name: 'leverage_safe', passed: de >= 0 && de <= 1.5, value: de, detail: `D/E=${de.toFixed(2)}` });
    }

    // 4. Génération de cash: FCF yield > 3%
    const fcfy = this._parseFloat(stock.fcf_yield);
    if (this._validNum(fcfy)) {
      dataAvailable++;
      criteria.push({ name: 'cash_generation', passed: fcfy > 3, value: fcfy, detail: `FCFy=${fcfy.toFixed(1)}%` });
    }

    // 5. Valorisation: 0 < PE <= 25
    const pe = this._parseFloat(stock.pe_ratio);
    if (this._validNum(pe)) {
      dataAvailable++;
      criteria.push({ name: 'valuation_ok', passed: pe > 0 && pe <= 25, value: pe, detail: `PE=${pe.toFixed(1)}` });
    }

    // 6. Moat durabilité: ROE ou ROIC année N > avg 3Y × 0.90
    // v7.2.1: seuil 1.10 → 0.90 — tolère normalisation cyclique (-10%)
    // mais rejette les baisses structurelles > 10% (red flag)
    // 190 stocks haute qualité (ITX, RACE, ISRG, ASML) étaient pénalisés
    // pour des baisses de 1-10% = normalisation, pas perte de moat
    const roeN = this._parseFloat(stock.roe);
    const roicN = this._parseFloat(stock.roic);
    const roeA3 = this._parseFloat(stock.roe_avg_3y);
    const roicA3 = this._parseFloat(stock.roic_avg_3y);
    if (this._validNum(roeN) && this._validNum(roeA3) && roeA3 > 0) {
      dataAvailable++;
      const roeOk = roeN / roeA3 >= 0.90;
      const roicOk = this._validNum(roicN) && this._validNum(roicA3) && roicA3 > 0 ? roicN / roicA3 >= 0.90 : false;
      criteria.push({ name: 'moat_expansion', passed: roeOk || roicOk, value: roeN / roeA3, detail: `trend=${((roeN / roeA3 - 1) * 100).toFixed(0)}%` });
    }

    if (dataAvailable < 2) return { score: null, score_no_valuation: null, grade: null, criteria, passed: 0, total: 0, dataAvailable };
    const passed = criteria.filter(c => c.passed).length;
    let score = Math.round((passed / criteria.length) * 100);

    // Progressive coverage caps — prevents inflation when criteria are missing
    // Fix Fabre v7 : maxCriteria = 5 si ROIC skippé pour banque, 6 sinon.
    // Avant : cap fixe à 6 plafonnait les banques 5/5 = 100 à 83 (5/6).
    const _maxCriteria = _skipRoicForBank ? 5 : 6;
    if (dataAvailable < 3) score = Math.min(score, 60);
    else if (dataAvailable < 4) score = Math.min(score, 60);
    else if (dataAvailable < _maxCriteria - 1) score = Math.min(score, 75);
    else if (dataAvailable < _maxCriteria) score = Math.min(score, 83);
    // Si dataAvailable >= maxCriteria : pas de cap (peut atteindre 100)

    // Additional penalty if ROE consistency passed with unknown CV (no std data)
    const cvUnknownPasses = criteria.filter(c => c.cv_unknown && c.passed).length;
    if (cvUnknownPasses > 0 && score >= 80) score = Math.min(score, 83);

    // ═══════════════════════════════════════════════════════════════════════
    // Code C (Fabre 2026-06-18) — Score Buffett SANS critère valuation_ok
    // ═══════════════════════════════════════════════════════════════════════
    // Doctrine DOCTRINE_PROFILS.md : Agressif passera en β (apply_valuation_ok=False)
    // après validation backtest juillet (P6/P7/P8). Ce score est CALCULÉ et EXPOSÉ
    // dès maintenant pour préparer la bascule, mais reste DÉSARMÉ : tous les profils
    // ont apply_valuation_ok=True par défaut → ce champ n'est lu par aucune sélection.
    // Bascule = changement manuel d'un seul flag dans preset_meta.py, post-backtest.
    let scoreNoVal = null;
    const criteriaNoVal = criteria.filter(c => c.name !== 'valuation_ok');
    const hasValuationData = criteria.some(c => c.name === 'valuation_ok');
    const dataAvailableNoVal = dataAvailable - (hasValuationData ? 1 : 0);
    if (dataAvailableNoVal >= 2 && criteriaNoVal.length > 0) {
      const passedNoVal = criteriaNoVal.filter(c => c.passed).length;
      scoreNoVal = Math.round((passedNoVal / criteriaNoVal.length) * 100);
      const _maxNoVal = _skipRoicForBank ? 4 : 5;
      if (dataAvailableNoVal < 3) scoreNoVal = Math.min(scoreNoVal, 60);
      else if (dataAvailableNoVal < _maxNoVal - 1) scoreNoVal = Math.min(scoreNoVal, 75);
      else if (dataAvailableNoVal < _maxNoVal) scoreNoVal = Math.min(scoreNoVal, 83);
      if (cvUnknownPasses > 0 && scoreNoVal >= 80) scoreNoVal = Math.min(scoreNoVal, 83);
    }

    const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
    return { score, score_no_valuation: scoreNoVal, grade, criteria, passed, total: criteria.length, dataAvailable };
  }

  /**
   * @deprecated Utiliser evaluateBuffettScore() — conservé pour rétrocompatibilité
   */
  evaluateBuffettQuality(stockData) {
    const result = this.evaluateBuffettScore(stockData);
    return {
      symbol: stockData.symbol || stockData.ticker || stockData.Ticker,
      score: result.score, rawScore: result.score, maxScore: 100,
      grade: result.grade,
      gradeLabel: result.grade === 'A' ? 'Excellent' : result.grade === 'B' ? 'Bon' : result.grade === 'C' ? 'Acceptable' : 'Faible',
      flags: result.criteria.map(c => `${c.name}:${c.passed ? 'PASS' : 'FAIL'}`),
      scores: {}, details: Object.fromEntries(result.criteria.map(c => [c.name, { value: c.value, passed: c.passed }])),
      dataCompleteness: Math.round((result.dataAvailable / 6) * 100),
      missingMetrics: 6 - result.dataAvailable,
      criteria: result.criteria,
      summary: {
        roe: (() => { const v = this._parseFloat(stockData.roe_avg_3y ?? stockData.roe); return v != null ? v.toFixed(1) + '%' : 'N/A'; })(),
        de: (() => { const v = this._parseFloat(stockData.de_ratio); return v != null ? v.toFixed(2) : 'N/A'; })(),
        pe: (() => { const v = this._parseFloat(stockData.pe_ratio); return v != null ? v.toFixed(1) : 'N/A'; })(),
        fcf_yield: (() => { const v = this._parseFloat(stockData.fcf_yield); return v != null ? v.toFixed(1) + '%' : 'N/A'; })(),
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v3.0: QUALITY SCORE v2 — Global-Adjusted Peer Scoring (5 dimensions)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Statistical helpers ──

  _percentileRank(sorted, x) {
    if (!sorted || sorted.length <= 1) return 50;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; }
    const left = lo;
    lo = 0; hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= x) lo = m + 1; else hi = m; }
    return ((left + lo) / 2 / Math.max(sorted.length - 1, 1)) * 100;
  }

  _winsorize(sorted) {
    if (!sorted || sorted.length < 5) return sorted || [];
    const l = Math.floor((sorted.length - 1) * 0.05);
    const h = Math.ceil((sorted.length - 1) * 0.95);
    return sorted.map(v => this._clamp(v, sorted[l], sorted[h]));
  }

  _buildDist(stocks, field, filter) {
    const fn = filter || (x => this._validNum(x));
    const v = stocks.map(s => s[field]).filter(fn).sort((a, b) => a - b);
    return v.length >= 5 ? this._winsorize(v) : v;
  }

  _scoreMetric(value, sorted, direction) {
    if (!sorted || sorted.length < 5) return null;
    if (!this._validNum(value)) return Math.min(this._percentileRank(sorted, sorted[Math.floor(sorted.length / 2)]), 40);
    const clamped = this._clamp(value, sorted[0], sorted[sorted.length - 1]);
    let p = this._percentileRank(sorted, clamped);
    const k = Math.min(1, (sorted.length - 1) / 20);
    p = 50 + (p - 50) * k;
    return direction === 'low' ? 100 - p : p;
  }

  _scorePayoutSafety(value) {
    if (!this._validNum(value)) return 35;
    if (value <= 60) return 100;
    if (value <= 90) return 100 - (value - 60) * 40 / 30;
    if (value <= 120) return 60 - (value - 90) * 40 / 30;
    return Math.max(0, 20 - (value - 120));
  }

  // ── Momentum signals ──

  _calcMomentum(stock) {
    const trajParts = [];
    if (this._validNum(stock.roe) && this._validNum(stock.roe_avg_3y) && stock.roe_avg_3y !== 0)
      trajParts.push(stock.roe / stock.roe_avg_3y);
    if (this._validNum(stock.roic) && this._validNum(stock.roic_avg_3y) && stock.roic_avg_3y !== 0)
      trajParts.push(stock.roic / stock.roic_avg_3y);
    if (this._validNum(stock.net_margin) && this._validNum(stock.revenue_growth_3y))
      trajParts.push(stock.revenue_growth_3y > 5 && stock.net_margin > 10 ? 1.1 : stock.revenue_growth_3y < -5 ? 0.9 : 1.0);
    const moatTraj = trajParts.length >= 1 ? trajParts.reduce((a, b) => a + b, 0) / trajParts.length : null;

    let capAlloc = null;
    if (this._validNum(stock.revenue_growth_3y) && this._validNum(stock.fcf_yield)) {
      const pay = this._validNum(stock.payout_ratio_scoring || stock.payout_ratio_ttm) ? (stock.payout_ratio_scoring || stock.payout_ratio_ttm) : 50;
      capAlloc = this._clamp((stock.revenue_growth_3y * Math.max(0, 100 - pay) / 100 + stock.fcf_yield * 2) / 10, -2, 3);
    }

    let marginRes = null;
    if (this._validNum(stock.net_margin) && this._validNum(stock.roe_std_3y) && this._validNum(stock.roe_avg_3y) && stock.roe_avg_3y > 0) {
      const cv = stock.roe_std_3y / Math.abs(stock.roe_avg_3y);
      marginRes = this._clamp(cv > 0.01 ? stock.net_margin / (cv * 100) : stock.net_margin, 0, 50);
    }

    return { moatTraj, capAlloc, marginRes };
  }

  // ── Main batch computation ──

  /**
   * Calcule le Quality Score v2 pour un batch de stocks
   * DOIT être appelé sur l'univers complet (besoin des peer groups + distributions globales)
   * Injecte les champs quality_* directement dans chaque objet stock
   *
   * @param {Object[]} allStocks - Tous les stocks enrichis
   * @returns {Object[]} Mêmes stocks avec quality_* injectés
   */
  computeQualityScores(allStocks) {
    const valid = allStocks.filter(s => !s.error && s.price);
    if (!valid.length) return allStocks;

    const minPeer = this.config.QUALITY_MIN_PEER_SIZE;
    const GM = ['roe', 'roic', 'de_ratio', 'pe_ratio', 'fcf_yield', 'eps_growth_5y',
      'roe_avg_3y', 'roic_avg_3y', 'net_margin', 'revenue_growth_3y'];

    if (this.config.DEBUG) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🎯 QUALITY SCORING v3.42b — ${valid.length} stocks`);
      console.log(`${'═'.repeat(60)}`);
    }

    // 1. Build peer groups
    const bySR = new Map(), bySG = new Map();
    for (const s of valid) {
      const r = s.region || 'GLOBAL', sec = s.sector || 'Unknown';
      const k1 = `${r}|${sec}`;
      if (!bySR.has(k1)) bySR.set(k1, []);
      bySR.get(k1).push(s);
      const k2 = `ALL|${sec}`;
      if (!bySG.has(k2)) bySG.set(k2, []);
      bySG.get(k2).push(s);
    }

    // 2. Global distributions
    const gd = {};
    for (const m of GM) {
      const f = m === 'de_ratio' ? (x => this._validNum(x) && x >= 0)
        : m === 'pe_ratio' ? (x => this._validNum(x) && x > 0)
        : (x => this._validNum(x));
      gd[m] = this._buildDist(valid, m, f);
    }

    // 3. Momentum distributions
    const momDists = { moatTraj: [], capAlloc: [], marginRes: [] };
    const momMap = new Map();
    for (const s of valid) {
      const mom = this._calcMomentum(s);
      momMap.set(`${s.ticker || s.symbol}|${s.region}`, mom);
      if (this._validNum(mom.moatTraj)) momDists.moatTraj.push(mom.moatTraj);
      if (this._validNum(mom.capAlloc)) momDists.capAlloc.push(mom.capAlloc);
      if (this._validNum(mom.marginRes)) momDists.marginRes.push(mom.marginRes);
    }
    for (const k of Object.keys(momDists)) momDists[k].sort((a, b) => a - b);

    // FIN dividend distribution
    const finStocks = valid.filter(s => this.detectProfile(s.sector, s.industry) === 'FIN');
    const finDivDist = this._buildDist(finStocks, 'dividend_yield', x => this._validNum(x) && x > 0);

    // 4. PASS 1: Score each stock
    const scoringMeta = new Map();
    let scored = 0;

    for (const s of valid) {
      const r = s.region || 'GLOBAL', sec = s.sector || 'Unknown';
      const prof = this.detectProfile(sec, s.industry);

      // Find peers (cascade)
      let peers, peerKey, peerLevel;
      const k1 = `${r}|${sec}`;
      if (bySR.has(k1) && bySR.get(k1).length >= minPeer) {
        peers = bySR.get(k1); peerKey = k1; peerLevel = 'sector_region';
      } else {
        const k2 = `ALL|${sec}`;
        if (bySG.has(k2) && bySG.get(k2).length >= minPeer) {
          peers = bySG.get(k2); peerKey = k2; peerLevel = 'sector_global';
        } else {
          peers = valid; peerKey = 'GLOBAL|ALL'; peerLevel = 'global_all';
        }
      }

      const di = {
        roe: this._buildDist(peers, 'roe'), roic: this._buildDist(peers, 'roic'),
        de: this._buildDist(peers, 'de_ratio', x => this._validNum(x) && x >= 0),
        pe: this._buildDist(peers, 'pe_ratio', x => this._validNum(x) && x > 0),
        fcf: this._buildDist(peers, 'fcf_yield'), gr: this._buildDist(peers, 'eps_growth_5y'),
        ra: this._buildDist(peers, 'roe_avg_3y'), rc: this._buildDist(peers, 'roic_avg_3y'),
        mg: this._buildDist(peers, 'net_margin'), rg: this._buildDist(peers, 'revenue_growth_3y'),
      };

      const mROE = this._scoreMetric(s.roe, di.roe, 'high');
      const mROIC = prof === 'FIN' ? null : this._scoreMetric(s.roic, di.roic, 'high');
      const mDE = prof === 'FIN' ? null : (this._validNum(s.de_ratio) && s.de_ratio < 0) ? 15 : this._scoreMetric(s.de_ratio, di.de, 'low');
      const mPE = this._scoreMetric(this._validNum(s.pe_ratio) && s.pe_ratio > 0 ? s.pe_ratio : null, di.pe, 'low');
      const mFCF = this._scoreMetric(s.fcf_yield, di.fcf, 'high');
      const mG = this._scoreMetric(this._validNum(s.eps_growth_5y) ? this._clamp(s.eps_growth_5y, -80, 80) : null, di.gr, 'high');
      const mRA = this._scoreMetric(s.roe_avg_3y, di.ra, 'high');
      const mRC = prof === 'FIN' ? null : this._scoreMetric(s.roic_avg_3y, di.rc, 'high');
      const mMg = this._scoreMetric(s.net_margin, di.mg, 'high');
      const mRG = this._scoreMetric(s.revenue_growth_3y, di.rg, 'high');

      // Quality (ROIC 0.6, ROE 0.4)
      const qR = mRA != null ? mRA : mROE, qC = mRC != null ? mRC : mROIC;
      let quality;
      if (prof === 'FIN') quality = this._safeAvg([qR, mMg]);
      else if (qR != null && qC != null) { const bl = qR * 0.4 + qC * 0.6; quality = mMg != null ? bl * 0.7 + mMg * 0.3 : bl; }
      else quality = this._safeAvg([qR, qC, mMg]);

      // Safety (FIN includes dividend_yield)
      let safety;
      if (prof === 'FIN') {
        const divSc = this._scoreMetric(this._validNum(s.dividend_yield) && s.dividend_yield > 0 ? s.dividend_yield : null, finDivDist, 'high');
        safety = this._safeAvg([this._scorePayoutSafety(s.payout_ratio_scoring || s.payout_ratio_ttm), divSc]);
      } else {
        safety = this._safeAvg([mDE, this._scorePayoutSafety(s.payout_ratio_scoring || s.payout_ratio_ttm)]);
      }

      const value = this._safeAvg([mPE, mFCF]);
      const growth = this._safeAvg([mG, mRG]);

      // Momentum
      const tk = s.ticker || s.symbol;
      const mom = momMap.get(`${tk}|${s.region}`) || {};
      const momTrajPctl = this._validNum(mom.moatTraj) && momDists.moatTraj.length >= 5 ? this._percentileRank(momDists.moatTraj, mom.moatTraj) : null;
      const momCapPctl = this._validNum(mom.capAlloc) && momDists.capAlloc.length >= 5 ? this._percentileRank(momDists.capAlloc, mom.capAlloc) : null;
      const momResPctl = this._validNum(mom.marginRes) && momDists.marginRes.length >= 5 ? this._percentileRank(momDists.marginRes, mom.marginRes) : null;
      const momentum = this._safeAvg([momTrajPctl, momCapPctl, momResPctl]);

      // Weighted composite
      const w = this.getProfileWeights(prof);
      const parts = [];
      if (quality != null) parts.push(['q', quality]);
      if (safety != null) parts.push(['s', safety]);
      if (value != null) parts.push(['v', value]);
      if (growth != null && w.g > 0) parts.push(['g', growth]);
      if (momentum != null && w.m > 0) parts.push(['m', momentum]);
      let totalW = 0;
      for (const [k] of parts) totalW += w[k] || 0;
      let raw = null;
      if (parts.length > 0 && totalW > 0) raw = parts.reduce((acc, [k, v]) => acc + v * (w[k] || 0), 0) / totalW;

      // Penalties — NO CAP, FIX5: FCF excluded for FIN
      let penalty = 0;
      const penalties = [];
      if (prof !== 'FIN' && this._validNum(s.roic) && s.roic <= 0) { penalty += 15; penalties.push('roic_negative'); }
      if (prof !== 'FIN' && this._validNum(s.fcf_yield) && s.fcf_yield < 0) { penalty += 10; penalties.push('fcf_negative'); }
      if (this._validNum(s.pe_ratio) && s.pe_ratio <= 0) { penalty += 5; penalties.push('pe_negative'); }
      if (prof !== 'FIN' && this._validNum(s.de_ratio) && s.de_ratio < 0) { penalty += 8; penalties.push('equity_negative'); }
      if (raw != null) raw = Math.max(0, raw - penalty);

      // FIX2: Stability bonus capped +3 for FIN
      let stabilityBonus = 0;
      if (this._validNum(s.roe_std_3y) && this._validNum(s.roe_avg_3y) && s.roe_avg_3y > 0) {
        const cv = s.roe_std_3y / Math.abs(s.roe_avg_3y);
        if (prof === 'FIN') { if (cv < 0.15) stabilityBonus = 3; else if (cv < 0.30) stabilityBonus = 1; else if (cv > 0.80) stabilityBonus = -3; }
        else { if (cv < 0.15) stabilityBonus = 8; else if (cv < 0.30) stabilityBonus = 4; else if (cv > 0.80) stabilityBonus = -5; }
      }
      if (raw != null) raw = this._clamp(raw + stabilityBonus, 0, 100);

      // FIX3: Coverage minimum for FIN
      if (prof === 'FIN') {
        let realCount = 0;
        if (this._validNum(s.roe) || this._validNum(s.roe_avg_3y)) realCount++;
        if (this._validNum(s.net_margin)) realCount++;
        if (this._validNum(s.pe_ratio)) realCount++;
        if (this._validNum(s.fcf_yield)) realCount++;
        if (this._validNum(s.payout_ratio_scoring || s.payout_ratio_ttm)) realCount++;
        if (this._validNum(s.dividend_yield)) realCount++;
        if (this._validNum(s.eps_growth_5y)) realCount++;
        if (this._validNum(s.revenue_growth_3y)) realCount++;
        if (realCount < 5 && raw != null) { raw = Math.min(raw, 60); penalties.push(`coverage_low(${realCount})`); }
        else if (realCount < 6 && raw != null) { raw = Math.min(raw, 75); }
      }

      // Peer medians for PASS 2
      const peerMedians = {};
      for (const m of GM) {
        const vals = peers.map(p => p[m]).filter(x => this._validNum(x));
        if (vals.length >= 3) { vals.sort((a, b) => a - b); peerMedians[m] = vals[Math.floor(vals.length / 2)]; }
      }

      scoringMeta.set(`${tk}|${s.region}`, { raw, peerKey, peerLevel, peerSize: peers.length, peerMedians, prof, subscores: { quality, safety, value, growth, momentum }, penalties, stabilityBonus });
      scored++;
    }

    // 5. PASS 2: Global adjustment
    const peerGlobalRankCache = new Map();
    const computePGR = (peerMedians) => {
      const ranks = [];
      for (const m of GM) {
        if (peerMedians[m] != null && gd[m] && gd[m].length >= 5) {
          let p = this._percentileRank(gd[m], peerMedians[m]);
          if (m === 'de_ratio' || m === 'pe_ratio') p = 100 - p;
          ranks.push(p);
        }
      }
      return ranks.length >= 2 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 50;
    };

    for (const s of valid) {
      const tk = s.ticker || s.symbol;
      const meta = scoringMeta.get(`${tk}|${s.region}`);
      if (!meta) continue;

      let pgr;
      if (peerGlobalRankCache.has(meta.peerKey)) pgr = peerGlobalRankCache.get(meta.peerKey);
      else { pgr = computePGR(meta.peerMedians); peerGlobalRankCache.set(meta.peerKey, pgr); }

      const profAlpha = this.getProfileAlpha(meta.prof);
      let adj = meta.raw;
      if (adj != null) { adj = profAlpha * adj + (1 - profAlpha) * adj * (pgr / 50); adj = this._clamp(adj, 0, 100); }
      const adjRounded = adj != null ? Math.round(adj) : null;
      const grade = adjRounded == null ? null : adjRounded >= 75 ? 'A' : adjRounded >= 55 ? 'B' : adjRounded >= 35 ? 'C' : 'D';

      // Inject
      s.quality_score = adjRounded;
      s.quality_grade = grade;
      s.quality_raw_score = meta.raw != null ? Math.round(meta.raw) : null;
      s.quality_subscores = {
        quality: meta.subscores.quality != null ? Math.round(meta.subscores.quality) : null,
        safety: meta.subscores.safety != null ? Math.round(meta.subscores.safety) : null,
        value: meta.subscores.value != null ? Math.round(meta.subscores.value) : null,
        growth: meta.subscores.growth != null ? Math.round(meta.subscores.growth) : null,
        momentum: meta.subscores.momentum != null ? Math.round(meta.subscores.momentum) : null,
      };
      s.quality_peer = meta.peerKey;
      s.quality_peer_size = meta.peerSize;
      s.quality_peer_level = meta.peerLevel;
      s.quality_peer_global_rank = Math.round(pgr);
      s.quality_profile = meta.prof;
      s.quality_penalties = meta.penalties;
      s.quality_global_alpha = profAlpha;
    }

    if (this.config.DEBUG) {
      const withScore = valid.filter(s => s.quality_score != null);
      const grades = { A: 0, B: 0, C: 0, D: 0 };
      withScore.forEach(s => { if (grades[s.quality_grade] !== undefined) grades[s.quality_grade]++; });
      console.log(`📊 Scored: ${scored} | A:${grades.A} B:${grades.B} C:${grades.C} D:${grades.D}`);
      console.log(`🌐 Peer groups: ${peerGlobalRankCache.size}`);
      console.log('═'.repeat(60));
    }

    return allStocks;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIVIDEND CALCULATION (v2.0 inchangé — TTM, splits, yield selection)
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
      const windowDebug = ttmDividends.map(d => `${d.ex_date}:${d.amount}`).join(', ');
      console.log(`📊 [TTM WINDOW ${symbol}]`, windowDebug,
        `| Count: ${ttmDividends.length}`,
        `| Window: ${twelveMonthsAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`);
    }

    const recentSplit = this.detectRecentSplit(splitInfo);
    let ttmSum = 0, adjustedSum = 0;
    const adjustmentDetails = [];

    ttmDividends.forEach(dividend => {
      const amount = parseFloat(dividend.amount) || 0;
      const divDate = new Date(dividend.ex_date || dividend.payment_date);
      let adjustedAmount = amount;
      if (recentSplit && divDate < recentSplit.date) {
        adjustedAmount = amount / recentSplit.ratio;
        adjustmentDetails.push({ date: dividend.ex_date, original: amount, adjusted: adjustedAmount, reason: `Split ${recentSplit.description}` });
        if (this.config.DEBUG) console.log(`🔄 Split adjustment: ${amount} → ${adjustedAmount.toFixed(4)}`);
      }
      ttmSum += amount;
      adjustedSum += adjustedAmount;
    });

    const yieldTTM = currentPrice > 0 ? (adjustedSum / currentPrice) * 100 : null;

    if (this.config.DEBUG) {
      console.log(`💰 [TTM CALC ${symbol}]`, `Sum: ${ttmSum.toFixed(3)}`, `Adjusted: ${adjustedSum.toFixed(3)}`, `Price: ${currentPrice}`, `Yield: ${yieldTTM?.toFixed(2)}%`);
    }

    return {
      ttmSum, adjustedSum, dividendCount: ttmDividends.length, yield: yieldTTM,
      hasRecentSplit: !!recentSplit, splitInfo: recentSplit, source: 'calculated',
      adjustments: adjustmentDetails,
      debug: { windowStart: twelveMonthsAgo.toISOString(), windowEnd: now.toISOString(), dividends: ttmDividends, splitAdjusted: recentSplit !== null }
    };
  }

  detectRecentSplit(splitData) {
    if (!splitData || !Array.isArray(splitData) || splitData.length === 0) return null;
    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - this.config.SPLIT_DETECTION_MONTHS);
    const recentSplits = splitData.filter(split => new Date(split.split_date) >= monthsAgo);
    if (recentSplits.length > 0) {
      const mostRecent = recentSplits[0];
      const toFactor = parseFloat(mostRecent.to_factor) || parseFloat(mostRecent.split_to) || 2;
      const fromFactor = parseFloat(mostRecent.from_factor) || parseFloat(mostRecent.split_from) || 1;
      const ratio = toFactor / fromFactor;
      if (this.config.DEBUG) console.log(`🔀 Recent split detected: ${fromFactor}:${toFactor} on ${mostRecent.split_date}`);
      return { date: new Date(mostRecent.split_date), ratio, description: `${fromFactor}:${toFactor}`, raw: mostRecent };
    }
    return null;
  }

  selectDividendYield(ttmCalc, apiData, forwardYield, symbol = '') {
    let selectedYield = null, source = null, confidence = 'low', usedTtmSource = 'calc';
    const ttmValid = ttmCalc && ttmCalc.dividendCount >= this.config.MIN_DIVIDENDS_FOR_TTM && ttmCalc.yield > 0 && ttmCalc.yield < this.config.MAX_REASONABLE_YIELD;
    const apiTrailing = apiData?.trailing ? parseFloat(apiData.trailing) : null;
    const apiForward = apiData?.forward ? parseFloat(apiData.forward) : null;

    if (ttmCalc?.hasRecentSplit && ttmValid) {
      selectedYield = ttmCalc.yield; source = 'TTM (calc, split-adj)'; confidence = 'high'; usedTtmSource = 'calc_split_adj';
    } else if (ttmValid) {
      selectedYield = ttmCalc.yield; source = 'TTM (calculated)'; confidence = 'high';
    } else if (apiTrailing && apiTrailing > 0 && apiTrailing < this.config.MAX_REASONABLE_YIELD) {
      selectedYield = apiTrailing; source = 'TTM (API)'; confidence = 'medium'; usedTtmSource = 'api';
      if (this.config.DEBUG) console.log(`⚠️ [${symbol}] TTM calc invalid (${ttmCalc?.dividendCount || 0} divs), using API: ${selectedYield.toFixed(2)}%`);
    } else if (apiForward && apiForward > 0) {
      selectedYield = apiForward; source = 'FWD (API)'; confidence = 'low';
    } else if (forwardYield && forwardYield > 0) {
      selectedYield = parseFloat(forwardYield); source = 'Forward (estimated)'; confidence = 'low';
    }

    if (ttmCalc?.hasRecentSplit && !ttmValid && apiTrailing) {
      source = 'TTM (API, post-split)';
      if (this.config.DEBUG) console.log(`🔀 [${symbol}] Recent split but insufficient data, using API`);
    }

    return {
      value: selectedYield, source, confidence, usedTtmSource,
      debug: { ttmValid, ttmCount: ttmCalc?.dividendCount || 0, ttmYield: ttmCalc?.yield, apiTrailing, apiForward, hasRecentSplit: ttmCalc?.hasRecentSplit || false }
    };
  }

  computePayoutRatio(dividendYield, eps, earningsYield, sector = '') {
    if (!dividendYield || dividendYield <= 0) return { value: null, str: '-', class: '', confidence: 'none' };
    let payoutRatio = null, method = '';
    if (eps && eps > 0) { payoutRatio = (dividendYield / earningsYield) * 100; method = 'EPS'; }
    else if (earningsYield && earningsYield > 0) { payoutRatio = (dividendYield / earningsYield) * 100; method = 'Earnings Yield'; }
    if (!payoutRatio || payoutRatio < 0) return { value: null, str: '-', class: '', confidence: 'none' };

    const isREIT = sector?.toLowerCase().includes('reit') || sector?.toLowerCase().includes('immobili') || sector?.toLowerCase() === 'real estate';
    const maxRatio = isREIT ? 400 : 200;
    payoutRatio = Math.min(payoutRatio, maxRatio);

    let colorClass;
    if (isREIT) {
      colorClass = payoutRatio < 70 ? 'payout-ok-strong' : payoutRatio < 90 ? 'payout-ok' : payoutRatio < 110 ? 'payout-warn' : payoutRatio < 130 ? 'payout-high' : 'payout-risk';
    } else {
      colorClass = payoutRatio < 30 ? 'payout-ok-strong' : payoutRatio < 60 ? 'payout-ok' : payoutRatio < 80 ? 'payout-warn' : payoutRatio < 100 ? 'payout-high' : 'payout-risk';
    }

    return { value: payoutRatio, str: `${payoutRatio.toFixed(1)}%`, class: colorClass, method, isREIT, confidence: method === 'EPS' ? 'high' : 'medium' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Traite un stock individuel — Buffett Score + données fusionnées
   * Note: Quality Score nécessite processStockBatch() ou computeQualityScores()
   */
  async processStock(stockData, options = {}) {
    const symbol = stockData.symbol || stockData.ticker || stockData.Ticker;
    const currentPrice = parseFloat(stockData.price || stockData.last || 0);
    if (this.config.DEBUG) console.log(`\n🔍 Processing ${symbol}...`);

    await this.loadFundamentalsCache();
    await this.loadStatisticsCache();
    const fundamentals = this.fundamentalsCache.data[symbol] || {};
    let statistics = this.statisticsCache.data[symbol];
    if (!statistics && options.fetchMissing) {
      statistics = await this.fetchStatistics(symbol, { exchange: stockData.exchange });
      await new Promise(r => setTimeout(r, this.config.RATE_LIMIT_MS));
    }
    statistics = statistics || {};

    const mergedData = {
      ...stockData,
      roe: fundamentals.roe ?? stockData.roe,
      de_ratio: fundamentals.de_ratio ?? stockData.de_ratio,
      pe_ratio: statistics.pe_ratio ?? stockData.pe_ratio,
      forward_pe: statistics.forward_pe,
      eps_ttm: statistics.eps_ttm ?? stockData.eps_ttm,
      eps_growth_yoy: statistics.eps_growth_yoy,
      profit_margin: statistics.profit_margin ?? stockData.net_margin,
      current_ratio: statistics.current_ratio,
      return_on_equity: statistics.return_on_equity,
      debt_to_equity: statistics.debt_to_equity,
      // fcf_yield: pré-calculé par stock-advanced-filter.js (enrichStock: fcf_ttm / market_cap)
      // En standalone (sans pré-enrichissement), sera null → critère Buffett #4 ignoré,
      // Quality Score dimension Value imputera à la médiane peer
      fcf_yield: stockData.fcf_yield ?? null,
    };

    // Buffett Score v3.1
    const buffett = this.evaluateBuffettScore(mergedData);
    const profile = this.detectProfile(mergedData.sector || mergedData.Secteur, mergedData.industry);

    // Dividendes
    let dividends = stockData.dividends;
    let splits = stockData.splits;
    if (!dividends && options.fetchMissing) {
      const divData = await this.fetchTD('dividends', [{ symbol, exchange: stockData.exchange }, { symbol }]);
      dividends = divData?.dividends || [];
    }
    if (!splits && options.fetchMissing) {
      const splitData = await this.fetchTD('splits', [{ symbol, exchange: stockData.exchange }, { symbol }]);
      splits = splitData?.splits || [];
    }

    const ttmResult = this.calculateTTM(dividends || [], currentPrice, splits, symbol);
    const dividendInfo = this.selectDividendYield(ttmResult, stockData.dividend_api_data || statistics, stockData.forward_yield, symbol);
    const payoutInfo = this.computePayoutRatio(dividendInfo.value, statistics.eps_ttm, stockData.earnings_yield, stockData.sector || stockData.Secteur);

    return {
      ...stockData, ...mergedData,
      buffett_score: buffett.score, buffett_score_no_valuation: buffett.score_no_valuation, buffett_grade: buffett.grade, buffett_criteria: buffett.criteria,
      buffett_passed: buffett.passed, buffett_total: buffett.total, buffett_flags: buffett.criteria.map(c => `${c.name}:${c.passed ? 'PASS' : 'FAIL'}`),
      quality_profile: profile,
      dividend_yield_ttm: dividendInfo.value, dividend_yield_source: dividendInfo.source, dividend_confidence: dividendInfo.confidence,
      total_dividends_ttm: ttmResult.adjustedSum, dividend_count_ttm: ttmResult.dividendCount,
      payout_ratio: payoutInfo.value, payout_ratio_str: payoutInfo.str, payout_ratio_class: payoutInfo.class,
      has_recent_split: ttmResult.hasRecentSplit, split_info: ttmResult.splitInfo,
      debug_buffett: this.config.DEBUG ? buffett : null,
    };
  }

  /**
   * Traite un batch complet — Buffett individuel + Quality Score batch
   */
  async processStockBatch(stocks, options = {}) {
    const processed = [];
    for (const stock of stocks) {
      const result = await this.processStock(stock, options);
      processed.push(result);
    }
    this.computeQualityScores(processed);
    return processed;
  }

  /**
   * Filtre les stocks (v2.0 + v3.0 critères)
   */
  filterStocks(stocks, criteria = {}) {
    let filtered = [...stocks];
    if (criteria.minBuffettScore) filtered = filtered.filter(s => s.buffett_score >= criteria.minBuffettScore);
    if (criteria.minQualityScore) filtered = filtered.filter(s => s.quality_score != null && s.quality_score >= criteria.minQualityScore);
    if (criteria.minROE) filtered = filtered.filter(s => s.roe != null && s.roe >= criteria.minROE);
    if (criteria.maxDE) filtered = filtered.filter(s => s.de_ratio != null && s.de_ratio <= criteria.maxDE);
    if (criteria.maxPE) filtered = filtered.filter(s => s.pe_ratio != null && s.pe_ratio > 0 && s.pe_ratio <= criteria.maxPE);
    if (criteria.minEPS) filtered = filtered.filter(s => s.eps_ttm != null && s.eps_ttm >= criteria.minEPS);
    if (criteria.profiles) filtered = filtered.filter(s => criteria.profiles.includes(s.quality_profile));
    if (criteria.minYield) filtered = filtered.filter(s => s.dividend_yield_ttm >= criteria.minYield);
    if (criteria.maxYield) filtered = filtered.filter(s => s.dividend_yield_ttm <= criteria.maxYield);
    if (criteria.maxPayout) filtered = filtered.filter(s => s.payout_ratio && s.payout_ratio <= criteria.maxPayout);
    if (criteria.minConfidence) {
      const levels = { 'low': 1, 'medium': 2, 'high': 3 };
      const minLevel = levels[criteria.minConfidence] || 1;
      filtered = filtered.filter(s => (levels[s.dividend_confidence] || 0) >= minLevel);
    }
    if (criteria.excludeRecentSplits) filtered = filtered.filter(s => !s.has_recent_split);
    if (criteria.sortBy) {
      const field = criteria.sortBy, order = criteria.sortOrder || 'desc';
      filtered.sort((a, b) => { const aV = a[field] || 0, bV = b[field] || 0; return order === 'desc' ? bV - aV : aV - bV; });
    }
    return filtered;
  }

  /**
   * Export CSV enrichi (v2.0 + v3.0 champs)
   */
  exportToCSV(stocks) {
    const headers = ['Symbol', 'Name', 'Sector', 'Profile', 'Price', 'Buffett Score', 'Buffett Grade', 'Quality Score', 'Quality Grade', 'PGR', 'ROE %', 'D/E', 'P/E', 'EPS', 'FCF Yield %', 'Margin %', 'Div Yield %', 'Source', 'Confidence'];
    const rows = stocks.map(s => [
      s.symbol || s.ticker || s.Ticker, s.name || s.Stock, s.sector || s.Secteur,
      s.quality_profile || '-', s.price || s.last,
      s.buffett_score ?? '-', s.buffett_grade || '-',
      s.quality_score ?? '-', s.quality_grade || '-',
      s.quality_peer_global_rank ?? '-',
      s.roe?.toFixed(1) || '-', s.de_ratio?.toFixed(2) || '-',
      s.pe_ratio?.toFixed(1) || '-', s.eps_ttm?.toFixed(2) || '-',
      s.fcf_yield?.toFixed(1) || '-', (s.profit_margin || s.net_margin)?.toFixed(1) || '-',
      s.dividend_yield_ttm?.toFixed(2) || '-', s.dividend_yield_source || '-', s.dividend_confidence || '-'
    ]);
    return [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  }

  clearCache() {
    this.successCache.clear();
    this.splitAdjustmentCache.clear();
    this.fundamentalsCache = null;
    this.statisticsCache = null;
    this.debugLogs = [];
    if (this.config.DEBUG) console.log('✅ Caches cleared');
  }
}

// Exports
if (typeof window !== 'undefined') {
  window.StockAdvanceFilter = StockAdvanceFilter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StockAdvanceFilter;
}
if (typeof window !== 'undefined' && window.AUTO_INIT_STOCK_FILTER) {
  window.stockFilter = new StockAdvanceFilter(window.STOCK_FILTER_CONFIG || {});
  console.log('✅ StockAdvanceFilter v3.0 initialized');
}
