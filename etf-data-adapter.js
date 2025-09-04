/**
 * ETF Data Adapter v1.0
 * Adapteur unifié pour normaliser les données ETF de différentes sources
 * Élimine le polling et utilise des événements pour la synchronisation
 */

(function(window) {
    'use strict';
    
    class ETFDataAdapter {
        constructor() {
            this.data = [];
            this.ready = false;
            this.listeners = new Set();
            
            // Dispatch event when ready
            this.notifyReady = () => {
                this.ready = true;
                document.dispatchEvent(new CustomEvent('ETFData:ready', {
                    detail: { 
                        count: this.data.length,
                        timestamp: Date.now()
                    }
                }));
            };
        }
        
        /**
         * Normalise les données ETF depuis différents formats CSV
         */
        normalize(etf, source = 'etf') {
            const normalized = {
                // Identifiants
                ticker: etf.ticker || etf.symbol || etf.Symbol || '',
                name: etf.name || etf.Name || etf.objective || '',
                isin: etf.isin || etf.ISIN || '',
                
                // Métriques principales avec vrais noms de colonnes
                total_expense_ratio: this.parsePercent(
                    etf.total_expense_ratio ?? 
                    etf.expense_ratio ?? 
                    etf.ter ?? 
                    etf.TER
                ),
                
                aum_usd: this.parseNumber(
                    etf.aum_usd ?? 
                    etf.aum ?? 
                    etf.AUM ?? 
                    etf.net_assets ?? 
                    etf.NetAssets
                ),
                
                last_close: this.parseNumber(
                    etf.last_close ?? 
                    etf.last ?? 
                    etf.Last ?? 
                    etf.price ?? 
                    etf.Price
                ),
                
                // Performances
                daily_change_pct: this.parsePercent(
                    etf.daily_change_pct ?? 
                    etf.return_1d ?? 
                    etf.DailyReturn ?? 
                    etf.change
                ),
                
                ytd_return_pct: this.parsePercent(
                    etf.ytd_return_pct ?? 
                    etf.return_ytd ?? 
                    etf.YTD ?? 
                    etf.ytd
                ),
                
                one_year_return_pct: this.parsePercent(
                    etf.one_year_return_pct ?? 
                    etf.return_1y ?? 
                    etf.OneYear ?? 
                    etf.perf_1y
                ),
                
                return_3y: this.parsePercent(
                    etf.return_3y ?? 
                    etf.ThreeYear ?? 
                    etf.perf_3y
                ),
                
                return_5y: this.parsePercent(
                    etf.return_5y ?? 
                    etf.FiveYear ?? 
                    etf.perf_5y
                ),
                
                // Risques
                vol_3y_pct: this.parsePercent(
                    etf.vol_3y_pct ?? 
                    etf.volatility ?? 
                    etf.Volatility ?? 
                    etf.vol_1y
                ),
                
                sharpe_ratio: this.parseNumber(
                    etf.sharpe_ratio ?? 
                    etf.sharpe ?? 
                    etf.Sharpe
                ),
                
                max_drawdown: this.parsePercent(
                    etf.max_drawdown ?? 
                    etf.MaxDrawdown
                ),
                
                tracking_error: this.parsePercent(
                    etf.tracking_error ?? 
                    etf.TrackingError
                ),
                
                beta: this.parseNumber(
                    etf.beta ?? 
                    etf.Beta
                ),
                
                r_squared: this.parseNumber(
                    etf.r_squared ?? 
                    etf.RSquared
                ),
                
                // Rendement
                yield_ttm: this.parsePercent(
                    etf.yield_ttm ?? 
                    etf.dividend_yield ?? 
                    etf.DividendYield ?? 
                    etf.yield
                ),
                
                // Classification
                etf_type: etf.etf_type || etf.Type || '',
                fund_type: etf.fund_type || etf.FundType || '',
                leverage: this.parseNumber(etf.leverage || etf.Leverage),
                
                // Métadonnées enrichies
                sector_top: etf.sector_top || etf.TopSector || '',
                sector_top_weight: this.parsePercent(etf.sector_top_weight),
                country_top: etf.country_top || etf.TopCountry || '',
                country_top_weight: this.parsePercent(etf.country_top_weight),
                
                // Qualité des données
                data_quality_score: this.calculateQualityScore(etf),
                
                // Timestamp
                as_of: etf.as_of || etf.date || new Date().toISOString(),
                
                // Source
                dataset: source,
                
                // Champs calculés
                __normalized: true,
                __timestamp: Date.now()
            };
            
            // Ajouter les champs de compatibilité
            this.addCompatibilityFields(normalized);
            
            return normalized;
        }
        
        /**
         * Parse un nombre avec gestion robuste
         */
        parseNumber(value) {
            if (value == null || value === '') return null;
            
            // Gérer les pourcentages
            if (typeof value === 'string' && value.includes('%')) {
                return parseFloat(value.replace('%', ''));
            }
            
            // Gérer les millions/billions
            if (typeof value === 'string') {
                if (value.endsWith('M')) {
                    return parseFloat(value) * 1;
                }
                if (value.endsWith('B')) {
                    return parseFloat(value) * 1000;
                }
            }
            
            const num = parseFloat(value);
            return isNaN(num) ? null : num;
        }
        
        /**
         * Parse un pourcentage (retourne en décimal si < 1, sinon tel quel)
         */
        parsePercent(value) {
            const num = this.parseNumber(value);
            if (num == null) return null;
            
            // Si la valeur est entre -1 et 1 (hors 0), c'est probablement déjà en décimal
            if (num !== 0 && Math.abs(num) < 1) {
                return num * 100; // Convertir en pourcentage
            }
            
            return num;
        }
        
        /**
         * Calcule un score de qualité des données
         */
        calculateQualityScore(etf) {
            const requiredFields = [
                'ticker', 'name', 'total_expense_ratio', 
                'aum_usd', 'last_close', 'ytd_return_pct'
            ];
            
            const optionalFields = [
                'one_year_return_pct', 'vol_3y_pct', 
                'sharpe_ratio', 'yield_ttm'
            ];
            
            let score = 100;
            let missingRequired = 0;
            let missingOptional = 0;
            
            // Vérifier les champs requis (-15 points chacun)
            requiredFields.forEach(field => {
                const value = etf[field] ?? etf[field.replace(/_/g, '')];
                if (!value && value !== 0) {
                    missingRequired++;
                    score -= 15;
                }
            });
            
            // Vérifier les champs optionnels (-5 points chacun)
            optionalFields.forEach(field => {
                const value = etf[field] ?? etf[field.replace(/_/g, '')];
                if (!value && value !== 0) {
                    missingOptional++;
                    score -= 5;
                }
            });
            
            // Bonus pour données récentes
            const asOf = etf.as_of || etf.date;
            if (asOf) {
                const daysSince = (Date.now() - new Date(asOf).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSince < 1) score += 5;
                else if (daysSince < 7) score += 2;
            }
            
            return Math.max(0, Math.min(100, score));
        }
        
        /**
         * Ajoute les champs de compatibilité avec l'ancien format
         */
        addCompatibilityFields(normalized) {
            // Alias pour compatibilité
            normalized.ter = normalized.total_expense_ratio;
            normalized.aum = normalized.aum_usd;
            normalized.price = normalized.last_close;
            normalized.return_1d = normalized.daily_change_pct;
            normalized.return_ytd = normalized.ytd_return_pct;
            normalized.return_1y = normalized.one_year_return_pct;
            normalized.volatility = normalized.vol_3y_pct;
            normalized.dividend_yield = normalized.yield_ttm;
            
            // Type simplifié
            normalized.type = this.classifyETFType(normalized);
        }
        
        /**
         * Classification intelligente du type d'ETF
         */
        classifyETFType(etf) {
            const name = String(etf.name || '').toLowerCase();
            const fundType = String(etf.fund_type || '').toLowerCase();
            const etfType = String(etf.etf_type || '').toLowerCase();
            
            // Bonds/Obligations
            if (etf.dataset === 'bonds' || 
                /bond|obligation|fixed income|treasury/i.test(name + fundType + etfType)) {
                return 'bonds';
            }
            
            // Commodities
            if (/commodit|gold|silver|metal|oil|gas|agricult/i.test(name + fundType + etfType)) {
                return 'commodity';
            }
            
            // Sectoriels
            if (/sector|technology|health|financ|energy|consumer|industrial|utilities|telecom|materials|real estate/i.test(name + fundType)) {
                return 'sector';
            }
            
            // Géographiques
            if (/emerging|frontier|asia|europe|japan|china|india|latin|africa|country|region/i.test(name + fundType)) {
                return 'geographic';
            }
            
            // Par défaut: Actions
            return 'equity';
        }
        
        /**
         * Charge et normalise les données
         */
        async loadData(etfsData, bondsData) {
            try {
                console.log('📊 ETF Data Adapter: Normalizing data...');
                
                const startTime = performance.now();
                
                // Normaliser les ETFs
                const normalizedETFs = etfsData
                    .filter(etf => etf && Object.keys(etf).length > 1)
                    .map(etf => this.normalize(etf, 'etf'));
                
                // Normaliser les Bonds
                const normalizedBonds = bondsData
                    .filter(bond => bond && Object.keys(bond).length > 1)
                    .map(bond => this.normalize(bond, 'bonds'));
                
                // Combiner
                this.data = [...normalizedETFs, ...normalizedBonds];
                
                const endTime = performance.now();
                
                console.log(`✅ ETF Data Adapter: ${this.data.length} items normalized in ${(endTime - startTime).toFixed(2)}ms`);
                
                // Stats
                const stats = this.getStats();
                console.log('📈 Data Stats:', stats);
                
                // Notifier que les données sont prêtes
                this.notifyReady();
                
                return this.data;
                
            } catch (error) {
                console.error('❌ ETF Data Adapter Error:', error);
                throw error;
            }
        }
        
        /**
         * Obtient les statistiques des données
         */
        getStats() {
            if (!this.data.length) return null;
            
            const stats = {
                total: this.data.length,
                byDataset: {},
                byType: {},
                qualityScore: {
                    avg: 0,
                    min: 100,
                    max: 0,
                    distribution: {
                        excellent: 0, // >= 90
                        good: 0,      // >= 70
                        fair: 0,      // >= 50
                        poor: 0       // < 50
                    }
                },
                coverage: {
                    ter: 0,
                    aum: 0,
                    ytd: 0,
                    volatility: 0
                }
            };
            
            let totalQuality = 0;
            
            this.data.forEach(etf => {
                // Par dataset
                stats.byDataset[etf.dataset] = (stats.byDataset[etf.dataset] || 0) + 1;
                
                // Par type
                stats.byType[etf.type] = (stats.byType[etf.type] || 0) + 1;
                
                // Qualité
                const quality = etf.data_quality_score || 0;
                totalQuality += quality;
                stats.qualityScore.min = Math.min(stats.qualityScore.min, quality);
                stats.qualityScore.max = Math.max(stats.qualityScore.max, quality);
                
                if (quality >= 90) stats.qualityScore.distribution.excellent++;
                else if (quality >= 70) stats.qualityScore.distribution.good++;
                else if (quality >= 50) stats.qualityScore.distribution.fair++;
                else stats.qualityScore.distribution.poor++;
                
                // Coverage
                if (etf.ter != null) stats.coverage.ter++;
                if (etf.aum != null) stats.coverage.aum++;
                if (etf.return_ytd != null) stats.coverage.ytd++;
                if (etf.volatility != null) stats.coverage.volatility++;
            });
            
            stats.qualityScore.avg = totalQuality / this.data.length;
            
            // Convertir coverage en pourcentages
            Object.keys(stats.coverage).forEach(key => {
                stats.coverage[key] = ((stats.coverage[key] / this.data.length) * 100).toFixed(1) + '%';
            });
            
            return stats;
        }
        
        /**
         * Accesseurs
         */
        getData() {
            return this.data;
        }
        
        setData(data) {
            this.data = data;
            this.notifyReady();
        }
        
        isReady() {
            return this.ready;
        }
        
        /**
         * Attendre que les données soient prêtes
         */
        onReady(callback) {
            if (this.ready) {
                callback();
            } else {
                document.addEventListener('ETFData:ready', callback, { once: true });
            }
        }
    }
    
    // Exposer l'adapteur globalement
    window.ETFDataAdapter = new ETFDataAdapter();
    
    // Créer l'interface ETFData pour compatibilité
    window.ETFData = {
        getData: () => window.ETFDataAdapter.getData(),
        setData: (data) => window.ETFDataAdapter.setData(data),
        refresh: () => {
            console.log('ETFData.refresh() called - reloading data...');
            // Déclencher le rechargement via l'event
            document.dispatchEvent(new CustomEvent('ETFData:refresh'));
        },
        getStats: () => window.ETFDataAdapter.getStats(),
        onReady: (cb) => window.ETFDataAdapter.onReady(cb)
    };
    
    console.log('✅ ETF Data Adapter v1.0 initialized - Event-driven, no polling');
    
})(window);
