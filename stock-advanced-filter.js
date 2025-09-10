// stock-advanced-filter.js
// Module de filtrage avancé pour actions avec ajustement des dividendes post-split
// v2.0 - Intègre la correction du parseSplitFactor et enrichissement TTM

const StockAdvancedFilter = (function() {
    'use strict';

    // ========================================
    // CONFIGURATION
    // ========================================
    const CONFIG = {
        DEBUG: true,
        CACHE_TTL: 3600000, // 1 heure
        
        // Seuils de filtrage par défaut
        THRESHOLDS: {
            MIN_ADV_USD: 1_000_000,      // Liquidité minimale 1M$/jour
            MIN_MARKET_CAP: 1_000_000_000, // 1B$ minimum
            MAX_PE_RATIO: 50,
            MIN_DIVIDEND_YIELD: 0.5,      // 0.5% minimum
            MAX_PAYOUT_RATIO: 90,         // 90% max
            MAX_VOLATILITY_3Y: 50,        // 50% max
        },
        
        // Métriques pour scoring
        SCORING_WEIGHTS: {
            liquidity: 0.25,
            fundamentals: 0.25,
            performance: 0.25,
            stability: 0.25
        }
    };

    // ========================================
    // FIX CRITIQUE: parseSplitFactor corrigé
    // ========================================
    function parseSplitFactor(s) {
        if (!s) return 1;
        const str = String(s).trim();

        // Accepte: "2:1", "2/1", "2-1", "2 for 1", "2-for-1", "2 / 1", etc.
        const m = str.match(/(\d+(?:\.\d+)?)\s*(?:[:\/-]|\s*for\s*)\s*(\d+(?:\.\d+)?)/i);
        if (!m) return 1;

        const a = parseFloat(m[1]);
        const b = parseFloat(m[2]);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 1;

        return a / b; // "2:1" => 2 ; "1:2" => 0.5
    }

    // ========================================
    // CALCUL TTM AVEC AJUSTEMENT SPLIT
    // ========================================
    function calculateDividendTTM(dividends, splits = []) {
        if (!dividends || !Array.isArray(dividends)) return null;

        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        // Filtrer les dividendes des 12 derniers mois
        const ttmDividends = dividends.filter(d => {
            const payDate = new Date(d.payment_date || d.ex_dividend_date);
            return payDate >= oneYearAgo && payDate <= now;
        });

        if (ttmDividends.length === 0) return null;

        // Trouver le split le plus récent
        let recentSplit = null;
        if (splits && splits.length > 0) {
            splits.forEach(split => {
                const splitDate = new Date(split.split_date);
                if (splitDate <= now) {
                    if (!recentSplit || splitDate > new Date(recentSplit.split_date)) {
                        recentSplit = split;
                    }
                }
            });
        }

        // Calculer le TTM avec ajustement split
        let ttmSum = 0;
        const splitDate = recentSplit ? new Date(recentSplit.split_date) : null;
        const splitFactor = recentSplit ? parseSplitFactor(recentSplit.split_factor) : 1;

        if (CONFIG.DEBUG && recentSplit) {
            console.log(`📊 Split détecté: ${recentSplit.split_factor} le ${recentSplit.split_date}`);
            console.log(`   Factor calculé: ${splitFactor}`);
        }

        ttmDividends.forEach(div => {
            const divDate = new Date(div.payment_date || div.ex_dividend_date);
            const amount = parseFloat(div.amount) || 0;
            
            // Ajuster si le dividende est pré-split
            const adjustedAmount = (splitDate && divDate < splitDate) 
                ? amount / splitFactor 
                : amount;
            
            ttmSum += adjustedAmount;

            if (CONFIG.DEBUG && splitDate && divDate < splitDate) {
                console.log(`   Dividende ajusté: ${amount} → ${adjustedAmount}`);
            }
        });

        return {
            ttm_sum: ttmSum,
            ttm_count: ttmDividends.length,
            recent_split: recentSplit !== null,
            split_date: recentSplit?.split_date || null,
            split_factor: splitFactor,
            source: recentSplit ? 'TTM (calc, split-adj)' : 'TTM (calc)'
        };
    }

    // ========================================
    // FILTRES AVANCÉS
    // ========================================
    const FILTER_PRESETS = {
        // Aristocrates du dividende
        dividend_aristocrats: {
            name: "Aristocrates du Dividende",
            description: "Actions versant des dividendes croissants depuis 10+ ans",
            filters: {
                dividend_yield: { min: 2.5, max: 8 },
                payout_ratio: { min: 20, max: 70 },
                dividend_growth_years: { min: 10 },
                market_cap: { min: 10_000_000_000 } // 10B+
            }
        },

        // Actions de croissance
        growth_stocks: {
            name: "Actions de Croissance",
            description: "Entreprises à forte croissance",
            filters: {
                revenue_growth_3y: { min: 15 },
                earnings_growth_3y: { min: 15 },
                pe_ratio: { max: 40 },
                peg_ratio: { max: 2 }
            }
        },

        // Value investing
        value_stocks: {
            name: "Actions Value",
            description: "Actions sous-évaluées selon les ratios classiques",
            filters: {
                pe_ratio: { max: 15 },
                pb_ratio: { max: 1.5 },
                dividend_yield: { min: 3 },
                debt_to_equity: { max: 0.5 }
            }
        },

        // GARP (Growth at Reasonable Price)
        garp: {
            name: "GARP",
            description: "Croissance à prix raisonnable",
            filters: {
                peg_ratio: { min: 0, max: 1.5 },
                earnings_growth_3y: { min: 10 },
                pe_ratio: { max: 25 },
                roe: { min: 15 }
            }
        },

        // Faible volatilité
        low_volatility: {
            name: "Faible Volatilité",
            description: "Actions défensives peu volatiles",
            filters: {
                volatility_3y: { max: 20 },
                beta: { max: 0.8 },
                dividend_yield: { min: 2 },
                market_cap: { min: 5_000_000_000 }
            }
        },

        // Momentum
        momentum: {
            name: "Momentum",
            description: "Actions en forte tendance haussière",
            filters: {
                perf_3m: { min: 10 },
                perf_6m: { min: 15 },
                perf_1y: { min: 20 },
                rsi: { min: 50, max: 70 },
                volume_ratio: { min: 1.2 } // Volume > moyenne 20j
            }
        },

        // Quality
        quality: {
            name: "Qualité",
            description: "Entreprises de haute qualité financière",
            filters: {
                roe: { min: 20 },
                roce: { min: 15 },
                debt_to_equity: { max: 0.3 },
                interest_coverage: { min: 10 },
                gross_margin: { min: 40 }
            }
        },

        // ETR-like (pour debug)
        etr_profile: {
            name: "Profil ETR",
            description: "Filtres similaires à ETR pour test",
            filters: {
                market_cap: { min: 50_000_000_000 },
                dividend_yield: { min: 2, max: 4 },
                region: ['EUROPE'],
                sector: ['Industrial']
            }
        }
    };

    // ========================================
    // MOTEUR DE FILTRAGE
    // ========================================
    class FilterEngine {
        constructor(stocks = []) {
            this.stocks = stocks;
            this.filters = {};
            this.results = [];
        }

        // Appliquer un preset
        applyPreset(presetName) {
            const preset = FILTER_PRESETS[presetName];
            if (!preset) {
                console.error(`Preset '${presetName}' non trouvé`);
                return this;
            }
            
            this.filters = { ...preset.filters };
            if (CONFIG.DEBUG) {
                console.log(`📋 Preset appliqué: ${preset.name}`);
            }
            return this;
        }

        // Ajouter un filtre custom
        addFilter(metric, conditions) {
            this.filters[metric] = conditions;
            return this;
        }

        // Exécuter le filtrage
        execute() {
            this.results = this.stocks.filter(stock => {
                return this._matchAllFilters(stock);
            });

            if (CONFIG.DEBUG) {
                console.log(`✅ Filtrage terminé: ${this.results.length}/${this.stocks.length} actions`);
            }

            return this.results;
        }

        // Vérifier qu'une action match tous les filtres
        _matchAllFilters(stock) {
            for (const [metric, conditions] of Object.entries(this.filters)) {
                if (!this._matchFilter(stock, metric, conditions)) {
                    return false;
                }
            }
            return true;
        }

        // Vérifier un filtre individuel
        _matchFilter(stock, metric, conditions) {
            const value = this._getMetricValue(stock, metric);

            // Si la valeur n'existe pas et n'est pas requise, on passe
            if (value === null || value === undefined) {
                return !conditions.required;
            }

            // Filtre par tableau (ex: region, sector)
            if (Array.isArray(conditions)) {
                return conditions.includes(value);
            }

            // Filtre par range (min/max)
            if (typeof conditions === 'object') {
                const { min, max } = conditions;
                if (min !== undefined && value < min) return false;
                if (max !== undefined && value > max) return false;
                return true;
            }

            // Filtre par valeur exacte
            return value === conditions;
        }

        // Récupérer la valeur d'une métrique
        _getMetricValue(stock, metric) {
            // Métriques calculées
            switch(metric) {
                case 'dividend_yield':
                    return stock.dividend_yield_ttm || stock.dividend_yield || null;
                
                case 'payout_ratio':
                    return stock.payout_ratio_ttm || stock.payout_ratio || null;
                
                case 'volume_ratio':
                    return stock.volume && stock.average_volume 
                        ? stock.volume / stock.average_volume 
                        : null;
                
                case 'peg_ratio':
                    return stock.pe_ratio && stock.earnings_growth_3y
                        ? stock.pe_ratio / stock.earnings_growth_3y
                        : null;

                case 'market_cap':
                    return stock.market_cap || (stock.shares_outstanding * stock.price) || null;

                default:
                    return stock[metric] || null;
            }
        }

        // Calculer un score pour chaque résultat
        scoreResults() {
            this.results = this.results.map(stock => ({
                ...stock,
                composite_score: this._calculateCompositeScore(stock)
            }));

            // Trier par score décroissant
            this.results.sort((a, b) => b.composite_score.total - a.composite_score.total);
            
            return this.results;
        }

        // Calcul du score composite
        _calculateCompositeScore(stock) {
            const scores = {
                liquidity: this._scoreLiquidity(stock),
                fundamentals: this._scoreFundamentals(stock),
                performance: this._scorePerformance(stock),
                stability: this._scoreStability(stock)
            };

            const total = Object.entries(scores).reduce((sum, [key, value]) => {
                return sum + (value * CONFIG.SCORING_WEIGHTS[key]);
            }, 0);

            return {
                ...scores,
                total: Math.round(total)
            };
        }

        _scoreLiquidity(stock) {
            const adv = stock.adv_median_usd || 0;
            if (adv < 1_000_000) return 0;
            if (adv < 10_000_000) return 25;
            if (adv < 100_000_000) return 50;
            if (adv < 1_000_000_000) return 75;
            return 100;
        }

        _scoreFundamentals(stock) {
            let score = 50; // Base

            // PE Ratio
            const pe = stock.pe_ratio;
            if (pe && pe > 0 && pe < 20) score += 15;
            else if (pe && pe >= 20 && pe < 30) score += 10;
            
            // Dividend Yield
            const dy = stock.dividend_yield_ttm;
            if (dy && dy > 3) score += 15;
            else if (dy && dy > 2) score += 10;
            
            // Payout Ratio
            const pr = stock.payout_ratio_ttm;
            if (pr && pr > 30 && pr < 70) score += 20;

            return Math.min(100, score);
        }

        _scorePerformance(stock) {
            let score = 0;
            
            // Performance YTD
            const ytd = stock.perf_ytd;
            if (ytd > 20) score += 40;
            else if (ytd > 10) score += 30;
            else if (ytd > 0) score += 20;
            
            // Performance 1Y
            const y1 = stock.perf_1y;
            if (y1 > 30) score += 30;
            else if (y1 > 15) score += 20;
            else if (y1 > 0) score += 10;
            
            // Momentum (3M)
            const m3 = stock.perf_3m;
            if (m3 > 10) score += 30;
            else if (m3 > 5) score += 20;
            else if (m3 > 0) score += 10;

            return Math.min(100, score);
        }

        _scoreStability(stock) {
            let score = 100; // On part de 100 et on déduit
            
            // Volatilité
            const vol = stock.volatility_3y;
            if (vol > 40) score -= 40;
            else if (vol > 30) score -= 25;
            else if (vol > 20) score -= 10;
            
            // Beta
            const beta = stock.beta;
            if (beta && beta > 1.5) score -= 20;
            else if (beta && beta > 1.2) score -= 10;
            
            // Drawdown
            const dd = stock.max_drawdown_3y;
            if (dd && dd < -40) score -= 20;
            else if (dd && dd < -30) score -= 10;

            return Math.max(0, score);
        }
    }

    // ========================================
    // ENRICHISSEMENT DES DONNÉES
    // ========================================
    async function enrichStockData(stock, apiData) {
        try {
            const enriched = { ...stock };

            // Dividendes avec ajustement split
            if (apiData.dividends) {
                const ttmData = calculateDividendTTM(
                    apiData.dividends, 
                    apiData.splits
                );
                
                if (ttmData) {
                    enriched.dividend_ttm_sum = ttmData.ttm_sum;
                    enriched.dividend_yield_ttm = (ttmData.ttm_sum / stock.price) * 100;
                    enriched.dividend_ttm_source = ttmData.source;
                    enriched.had_recent_split = ttmData.recent_split;
                    
                    // Debug info pour ETR et similaires
                    if (CONFIG.DEBUG && ttmData.recent_split) {
                        enriched.debug_dividends = {
                            ttm_sum_calc: ttmData.ttm_sum,
                            ttm_count: ttmData.ttm_count,
                            split_date: ttmData.split_date,
                            split_factor: ttmData.split_factor,
                            dividend_yield_src: ttmData.source
                        };
                    }
                }
            }

            // Métriques additionnelles
            if (apiData.statistics) {
                enriched.pe_ratio = apiData.statistics.valuations_metrics?.pe_ratio;
                enriched.pb_ratio = apiData.statistics.valuations_metrics?.pb_ratio;
                enriched.peg_ratio = apiData.statistics.valuations_metrics?.peg_ratio;
                enriched.beta = apiData.statistics.risk_metrics?.beta;
                enriched.shares_outstanding = apiData.statistics.shares?.outstanding;
            }

            // Calcul du payout ratio si on a les earnings
            if (enriched.dividend_ttm_sum && apiData.earnings_per_share) {
                enriched.payout_ratio_ttm = (enriched.dividend_ttm_sum / apiData.earnings_per_share) * 100;
            }

            return enriched;

        } catch (error) {
            console.error(`❌ Erreur enrichissement ${stock.ticker}:`, error);
            return stock;
        }
    }

    // ========================================
    // EXPORT DE RÉSULTATS
    // ========================================
    function exportResults(results, format = 'json') {
        const timestamp = new Date().toISOString();
        
        const exportData = {
            timestamp,
            count: results.length,
            filters_applied: true,
            stocks: results.map(stock => ({
                ticker: stock.ticker,
                name: stock.name,
                region: stock.region,
                sector: stock.sector,
                
                // Métriques clés
                price: stock.price,
                market_cap: stock.market_cap,
                
                // Dividendes (avec correction split)
                dividend_yield_ttm: stock.dividend_yield_ttm,
                dividend_ttm_sum: stock.dividend_ttm_sum,
                payout_ratio_ttm: stock.payout_ratio_ttm,
                dividend_ttm_source: stock.dividend_ttm_source,
                
                // Performance
                perf_1d: stock.change_percent,
                perf_ytd: stock.perf_ytd,
                perf_1y: stock.perf_1y,
                
                // Risque
                volatility_3y: stock.volatility_3y,
                beta: stock.beta,
                max_drawdown_3y: stock.max_drawdown_3y,
                
                // Score
                composite_score: stock.composite_score,
                
                // Debug info si split récent
                debug_info: stock.debug_dividends || null
            }))
        };

        if (format === 'csv') {
            return convertToCSV(exportData.stocks);
        }

        return exportData;
    }

    function convertToCSV(stocks) {
        const headers = [
            'ticker', 'name', 'region', 'sector',
            'price', 'market_cap',
            'dividend_yield_ttm', 'payout_ratio_ttm',
            'perf_ytd', 'perf_1y',
            'volatility_3y', 'score_total'
        ];

        const rows = stocks.map(s => [
            s.ticker,
            `"${s.name}"`,
            s.region,
            s.sector,
            s.price,
            s.market_cap,
            s.dividend_yield_ttm?.toFixed(2) || '',
            s.payout_ratio_ttm?.toFixed(2) || '',
            s.perf_ytd?.toFixed(2) || '',
            s.perf_1y?.toFixed(2) || '',
            s.volatility_3y?.toFixed(2) || '',
            s.composite_score?.total || ''
        ]);

        return [headers, ...rows].map(r => r.join(',')).join('\n');
    }

    // ========================================
    // INTERFACE PUBLIQUE
    // ========================================
    return {
        // Configuration
        CONFIG,
        FILTER_PRESETS,
        
        // Classes
        FilterEngine,
        
        // Fonctions
        parseSplitFactor,
        calculateDividendTTM,
        enrichStockData,
        exportResults,
        
        // Méthode helper pour filtrage rapide
        quickFilter: function(stocks, presetName) {
            const engine = new FilterEngine(stocks);
            engine.applyPreset(presetName);
            const results = engine.execute();
            return engine.scoreResults();
        },

        // Test ETR spécifique
        debugETR: function(etrData) {
            console.log('🔍 Debug ETR avec correction split:');
            
            const ttmData = calculateDividendTTM(
                etrData.dividends,
                etrData.splits
            );
            
            console.log('Split factor:', parseSplitFactor(etrData.last_split_factor));
            console.log('TTM calculé:', ttmData);
            console.log('Rendement corrigé:', ((ttmData.ttm_sum / etrData.price) * 100).toFixed(2) + '%');
            
            return ttmData;
        }
    };
})();

// Export pour Node.js ou utilisation browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StockAdvancedFilter;
} else if (typeof window !== 'undefined') {
    window.StockAdvancedFilter = StockAdvancedFilter;
}

// ========================================
// EXEMPLE D'UTILISATION
// ========================================
/*
// 1. Charger les données
const stocks = await fetch('data/stocks_europe.json').then(r => r.json());

// 2. Créer un moteur de filtrage
const engine = new StockAdvancedFilter.FilterEngine(stocks.stocks);

// 3. Appliquer un preset
engine.applyPreset('dividend_aristocrats');

// 4. Ajouter des filtres custom
engine.addFilter('region', ['EUROPE'])
      .addFilter('market_cap', { min: 50_000_000_000 });

// 5. Exécuter et scorer
const results = engine.execute();
engine.scoreResults();

// 6. Exporter
const exportData = StockAdvancedFilter.exportResults(results, 'json');
console.log(`Trouvé: ${results.length} actions`);

// 7. Debug ETR spécifiquement
const etr = stocks.stocks.find(s => s.ticker === 'ETR');
if (etr) {
    StockAdvancedFilter.debugETR({
        ...etr,
        dividends: etr.dividends_history,
        splits: etr.splits_history,
        last_split_factor: "2:1"
    });
}
*/
