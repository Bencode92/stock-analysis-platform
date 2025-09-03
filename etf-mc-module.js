// Module Multi-Critères pour ETFs
// Adapté de mc-module.js avec métriques ETF spécifiques

(function() {
    // Configuration
    const CONFIG = {
        TOP_N: 10,
        DEBUG: false,
        ALLOW_MISSING: 1
    };

    // Métriques ETF pour le scoring
    const ETF_METRICS = {
        // Efficience coût/performance
        efficiency_score: {
            label: 'Efficience',
            calculate: (etf) => {
                const perf = etf.perf_1y || 0;
                const ter = etf.ter || 1;
                return perf / (ter + 0.01); // Éviter division par 0
            },
            max: true
        },
        
        // Score de liquidité
        liquidity_score: {
            label: 'Liquidité',
            calculate: (etf) => {
                const volumeScore = Math.log10(etf.avg_volume || 1) / 5;
                const aumScore = Math.log10(etf.aum || 1) / 10;
                const spreadScore = 1 - (etf.bid_ask_spread || 0) / 2;
                return (volumeScore + aumScore + spreadScore) / 3;
            },
            max: true
        },
        
        // Score risque-rendement
        risk_adjusted_return: {
            label: 'Risque-Ajusté',
            calculate: (etf) => {
                const sharpe = etf.sharpe_ratio || 0;
                const maxDD = etf.max_drawdown || -20;
                return sharpe - (Math.abs(maxDD) / 100);
            },
            max: true
        },
        
        // Score de diversification
        diversification_score: {
            label: 'Diversification',
            calculate: (etf, holdings) => {
                if (!holdings || !holdings.length) return 0.5;
                
                // Calculer HHI (Herfindahl-Hirschman Index)
                const totalWeight = holdings.reduce((sum, h) => sum + (h.weight || 0), 0);
                const hhi = holdings.reduce((sum, h) => {
                    const weight = (h.weight || 0) / totalWeight;
                    return sum + weight * weight;
                }, 0);
                
                // Convertir HHI en score (0 = concentré, 1 = diversifié)
                return 1 - hhi;
            },
            max: true
        },
        
        // Score ESG (si disponible)
        esg_score: {
            label: 'Score ESG',
            calculate: (etf) => etf.esg_score || 0,
            max: true
        }
    };

    // Filtres prédéfinis pour ETFs
    const ETF_FILTERS = {
        lowCost: {
            label: 'Faibles Coûts',
            apply: (etfs) => etfs.filter(e => e.ter < 0.3)
        },
        
        highLiquidity: {
            label: 'Haute Liquidité',
            apply: (etfs) => etfs.filter(e => 
                e.aum > 500000000 && e.avg_volume > 50000
            )
        },
        
        efficient: {
            label: 'Efficient',
            apply: (etfs) => etfs.filter(e => {
                const efficiency = ETF_METRICS.efficiency_score.calculate(e);
                return efficiency > 20;
            })
        },
        
        lowRisk: {
            label: 'Faible Risque',
            apply: (etfs) => etfs.filter(e => 
                e.volatility_1y < 12 && (e.max_drawdown || -100) > -15
            )
        },
        
        dividend: {
            label: 'Dividendes',
            apply: (etfs) => etfs.filter(e => e.distribution_yield > 2)
        }
    };

    // Analyse des holdings
    function analyzeHoldings(etf, allHoldings) {
        const holdings = allHoldings[etf.ticker] || [];
        
        if (!holdings.length) {
            return {
                topHoldings: [],
                sectorExposure: {},
                geoExposure: {},
                concentration: 0,
                diversificationScore: 0
            };
        }
        
        // Top 10 holdings
        const topHoldings = holdings
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 10);
        
        // Concentration (somme des top 10)
        const concentration = topHoldings
            .reduce((sum, h) => sum + h.weight, 0);
        
        // Répartition sectorielle
        const sectorExposure = holdings.reduce((acc, h) => {
            const sector = h.sector || 'Other';
            acc[sector] = (acc[sector] || 0) + h.weight;
            return acc;
        }, {});
        
        // Répartition géographique
        const geoExposure = holdings.reduce((acc, h) => {
            const country = h.country || 'Other';
            acc[country] = (acc[country] || 0) + h.weight;
            return acc;
        }, {});
        
        // Score de diversification
        const diversificationScore = ETF_METRICS.diversification_score.calculate(etf, holdings);
        
        return {
            topHoldings,
            sectorExposure,
            geoExposure,
            concentration,
            diversificationScore
        };
    }

    // Calcul du score composite
    function calculateCompositeScore(etf, weights = {}) {
        const defaultWeights = {
            efficiency: 0.25,
            liquidity: 0.20,
            risk_adjusted: 0.30,
            diversification: 0.15,
            esg: 0.10
        };
        
        const w = { ...defaultWeights, ...weights };
        
        let score = 0;
        score += w.efficiency * (ETF_METRICS.efficiency_score.calculate(etf) / 100);
        score += w.liquidity * ETF_METRICS.liquidity_score.calculate(etf);
        score += w.risk_adjusted * Math.max(0, ETF_METRICS.risk_adjusted_return.calculate(etf));
        score += w.diversification * ETF_METRICS.diversification_score.calculate(etf);
        score += w.esg * (ETF_METRICS.esg_score.calculate(etf) / 100);
        
        return score * 100; // Normaliser sur 100
    }

    // Fonction de comparaison d'ETFs
    function compareETFs(etf1, etf2, criteria = ['ter', 'perf_1y', 'volatility_1y', 'sharpe_ratio']) {
        const comparison = {};
        
        criteria.forEach(criterion => {
            const val1 = etf1[criterion] || 0;
            const val2 = etf2[criterion] || 0;
            const diff = val1 - val2;
            const pctDiff = val2 !== 0 ? (diff / val2) * 100 : 0;
            
            comparison[criterion] = {
                etf1: val1,
                etf2: val2,
                difference: diff,
                percentDiff: pctDiff,
                winner: diff > 0 ? etf1.ticker : etf2.ticker
            };
        });
        
        return comparison;
    }

    // Calcul de corrélation entre ETFs
    function calculateCorrelation(etf1Returns, etf2Returns) {
        if (!etf1Returns || !etf2Returns || etf1Returns.length !== etf2Returns.length) {
            return null;
        }
        
        const n = etf1Returns.length;
        const mean1 = etf1Returns.reduce((a, b) => a + b, 0) / n;
        const mean2 = etf2Returns.reduce((a, b) => a + b, 0) / n;
        
        let cov = 0, var1 = 0, var2 = 0;
        
        for (let i = 0; i < n; i++) {
            const diff1 = etf1Returns[i] - mean1;
            const diff2 = etf2Returns[i] - mean2;
            cov += diff1 * diff2;
            var1 += diff1 * diff1;
            var2 += diff2 * diff2;
        }
        
        return cov / Math.sqrt(var1 * var2);
    }

    // Détection de chevauchement entre ETFs
    function detectOverlap(etf1Holdings, etf2Holdings) {
        if (!etf1Holdings || !etf2Holdings) return { overlap: 0, common: [] };
        
        const holdings1 = new Map(etf1Holdings.map(h => [h.ticker, h.weight]));
        const holdings2 = new Map(etf2Holdings.map(h => [h.ticker, h.weight]));
        
        let overlapWeight = 0;
        const commonHoldings = [];
        
        for (const [ticker, weight1] of holdings1) {
            if (holdings2.has(ticker)) {
                const weight2 = holdings2.get(ticker);
                const minWeight = Math.min(weight1, weight2);
                overlapWeight += minWeight;
                commonHoldings.push({
                    ticker,
                    weight1,
                    weight2,
                    overlap: minWeight
                });
            }
        }
        
        return {
            overlapPercentage: overlapWeight,
            commonHoldings: commonHoldings.sort((a, b) => b.overlap - a.overlap)
        };
    }

    // Calcul des frais cumulés
    function calculateTotalCost(etf, years = 10, initialInvestment = 10000) {
        const ter = etf.ter / 100 || 0;
        const expectedReturn = (etf.perf_1y || 5) / 100;
        
        let value = initialInvestment;
        let totalCosts = 0;
        
        for (let year = 1; year <= years; year++) {
            value *= (1 + expectedReturn);
            const annualCost = value * ter;
            totalCosts += annualCost;
            value -= annualCost;
        }
        
        return {
            finalValue: value,
            totalCosts,
            costPercentage: (totalCosts / initialInvestment) * 100,
            annualizedCost: totalCosts / years
        };
    }

    // Recommandations basées sur le profil
    function getRecommendations(profile = 'balanced') {
        const profiles = {
            conservative: {
                filters: ['lowRisk', 'highLiquidity', 'lowCost'],
                weights: {
                    efficiency: 0.15,
                    liquidity: 0.30,
                    risk_adjusted: 0.35,
                    diversification: 0.20
                }
            },
            balanced: {
                filters: ['efficient', 'highLiquidity'],
                weights: {
                    efficiency: 0.25,
                    liquidity: 0.20,
                    risk_adjusted: 0.30,
                    diversification: 0.25
                }
            },
            aggressive: {
                filters: ['efficient'],
                weights: {
                    efficiency: 0.40,
                    liquidity: 0.15,
                    risk_adjusted: 0.35,
                    diversification: 0.10
                }
            },
            income: {
                filters: ['dividend', 'lowRisk'],
                weights: {
                    efficiency: 0.20,
                    liquidity: 0.20,
                    risk_adjusted: 0.25,
                    diversification: 0.35
                }
            }
        };
        
        return profiles[profile] || profiles.balanced;
    }

    // Export des fonctions
    window.ETF_MC = {
        metrics: ETF_METRICS,
        filters: ETF_FILTERS,
        analyzeHoldings,
        calculateCompositeScore,
        compareETFs,
        calculateCorrelation,
        detectOverlap,
        calculateTotalCost,
        getRecommendations,
        config: CONFIG
    };

    console.log('✅ Module Multi-Critères ETF chargé');
})();