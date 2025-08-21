// etf-data-loader.js
// Charge et transforme les données générées pour le frontend

class ETFDataLoader {
    constructor() {
        this.data = {
            etfs: [],
            bonds: [],
            topPerformers: {
                daily: { top: [], bottom: [] },
                ytd: { top: [], bottom: [] },
                oneYear: { top: [], bottom: [] }
            },
            lastUpdate: null,
            stats: {}
        };
    }

    async loadData() {
        try {
            console.log('📊 Chargement des données ETF/Bonds...');
            
            // Charger le snapshot combiné (weekly + daily)
            const response = await fetch('data/combined_snapshot.json');
            if (!response.ok) {
                throw new Error('Impossible de charger combined_snapshot.json');
            }
            
            const combined = await response.json();
            this.data.etfs = combined.etfs || [];
            this.data.bonds = combined.bonds || [];
            this.data.lastUpdate = combined.timestamp;
            
            // Enrichir avec les catégories
            this.categorizeETFs();
            
            // Calculer les top performers
            this.calculateTopPerformers();
            
            // Préparer l'index de recherche
            this.buildSearchIndex();
            
            // Calculer les statistiques
            this.calculateStats();
            
            console.log(`✅ ${this.data.etfs.length} ETFs et ${this.data.bonds.length} Bonds chargés`);
            
            return this.data;
            
        } catch (error) {
            console.error('❌ Erreur chargement données:', error);
            // Fallback vers des données de démonstration
            return this.generateDemoData();
        }
    }
    
    categorizeETFs() {
        this.data.etfs.forEach(etf => {
            // Déterminer la catégorie principale
            if (etf.etf_type === 'single_stock') {
                etf.category = 'Single Stock';
            } else if (etf.etf_type === 'inverse') {
                etf.category = 'Inverse';
            } else if (etf.etf_type === 'leveraged') {
                etf.category = 'Leveraged';
            } else if (etf.fund_type?.toLowerCase().includes('bond')) {
                etf.category = 'Obligations';
            } else if (etf.objective?.toLowerCase().includes('short term')) {
                etf.category = 'Court Terme';
            } else {
                etf.category = 'Standard';
            }
            
            // Ajouter le pays principal pour l'affichage
            if (etf.country_top) {
                etf.main_country = etf.country_top.country || etf.country_top;
            } else if (etf.domicile) {
                etf.main_country = etf.domicile;
            }
            
            // Ajouter le secteur principal pour l'affichage
            if (etf.sector_top) {
                etf.main_sector = etf.sector_top.sector || etf.sector_top;
            }
            
            // Formater les pourcentages pour l'affichage
            etf.display = {
                daily: this.formatPercent(etf.daily_change_pct),
                ytd: this.formatPercent(etf.ytd_return_pct),
                oneYear: this.formatPercent(etf.one_year_return_pct),
                vol3Y: this.formatPercent(etf.vol_3y_pct),
                ter: this.formatPercent(etf.total_expense_ratio),
                yield: this.formatPercent(etf.yield_ttm),
                aum: this.formatAUM(etf.aum_usd)
            };
        });
    }
    
    calculateTopPerformers() {
        const etfsWithData = this.data.etfs.filter(e => 
            e.daily_change_pct !== null || 
            e.ytd_return_pct !== null || 
            e.one_year_return_pct !== null
        );
        
        // Top/Bottom daily (1 mois dans votre UI)
        const dailySorted = [...etfsWithData]
            .filter(e => e.daily_change_pct !== null)
            .sort((a, b) => b.daily_change_pct - a.daily_change_pct);
        
        this.data.topPerformers.daily.top = dailySorted.slice(0, 10);
        this.data.topPerformers.daily.bottom = dailySorted.slice(-10).reverse();
        
        // Top/Bottom YTD
        const ytdSorted = [...etfsWithData]
            .filter(e => e.ytd_return_pct !== null)
            .sort((a, b) => b.ytd_return_pct - a.ytd_return_pct);
        
        this.data.topPerformers.ytd.top = ytdSorted.slice(0, 10);
        this.data.topPerformers.ytd.bottom = ytdSorted.slice(-10).reverse();
        
        // Top/Bottom 1 an
        const oneYearSorted = [...etfsWithData]
            .filter(e => e.one_year_return_pct !== null)
            .sort((a, b) => b.one_year_return_pct - a.one_year_return_pct);
        
        this.data.topPerformers.oneYear.top = oneYearSorted.slice(0, 10);
        this.data.topPerformers.oneYear.bottom = oneYearSorted.slice(-10).reverse();
    }
    
    buildSearchIndex() {
        // Créer un index pour la recherche rapide
        this.searchIndex = new Map();
        
        [...this.data.etfs, ...this.data.bonds].forEach(item => {
            const searchableText = [
                item.symbol,
                item.isin,
                item.objective,
                item.main_country,
                item.main_sector,
                item.category
            ].filter(Boolean).join(' ').toLowerCase();
            
            this.searchIndex.set(item.symbol, {
                item,
                searchText: searchableText
            });
        });
    }
    
    calculateStats() {
        this.data.stats = {
            totalETFs: this.data.etfs.length,
            totalBonds: this.data.bonds.length,
            withAUM: this.data.etfs.filter(e => e.aum_usd !== null).length,
            withTER: this.data.etfs.filter(e => e.total_expense_ratio !== null).length,
            withComposition: this.data.etfs.filter(e => 
                (e.sectors && e.sectors.length > 0) || 
                (e.countries && e.countries.length > 0)
            ).length,
            avgDataQuality: Math.round(
                this.data.etfs.reduce((acc, e) => acc + (e.data_quality_score || 0), 0) / 
                Math.max(1, this.data.etfs.length)
            ),
            byCategory: {}
        };
        
        // Compter par catégorie
        this.data.etfs.forEach(etf => {
            const cat = etf.category || 'Unknown';
            this.data.stats.byCategory[cat] = (this.data.stats.byCategory[cat] || 0) + 1;
        });
    }
    
    search(query) {
        if (!query || query.length < 2) return [];
        
        const q = query.toLowerCase();
        const results = [];
        
        this.searchIndex.forEach(({ item, searchText }) => {
            if (searchText.includes(q)) {
                results.push({
                    ...item,
                    relevance: this.calculateRelevance(searchText, q)
                });
            }
        });
        
        // Trier par pertinence
        return results.sort((a, b) => b.relevance - a.relevance);
    }
    
    calculateRelevance(text, query) {
        let score = 0;
        
        // Bonus si le query est au début
        if (text.startsWith(query)) score += 10;
        
        // Bonus si c'est le symbole exact
        if (text.split(' ')[0] === query) score += 20;
        
        // Score basé sur la position
        const pos = text.indexOf(query);
        if (pos !== -1) {
            score += Math.max(0, 10 - pos / 10);
        }
        
        return score;
    }
    
    getByCategory(category) {
        switch(category) {
            case 'top50':
                // Retourner les 50 ETFs avec le meilleur score qualité + AUM
                return [...this.data.etfs]
                    .sort((a, b) => {
                        const scoreA = (a.data_quality_score || 0) + Math.log10(a.aum_usd || 1);
                        const scoreB = (b.data_quality_score || 0) + Math.log10(b.aum_usd || 1);
                        return scoreB - scoreA;
                    })
                    .slice(0, 50);
                    
            case 'bonds':
                return this.data.etfs.filter(e => 
                    e.category === 'Obligations' || 
                    e.fund_type?.toLowerCase().includes('bond')
                );
                
            case 'shortterm':
                return this.data.etfs.filter(e => 
                    e.category === 'Court Terme' || 
                    e.objective?.toLowerCase().includes('short term')
                );
                
            default:
                return this.data.etfs;
        }
    }
    
    formatPercent(value) {
        if (value === null || value === undefined) return '-';
        const formatted = value.toFixed(2);
        const className = value >= 0 ? 'positive' : 'negative';
        return `<span class="${className}">${value >= 0 ? '+' : ''}${formatted}%</span>`;
    }
    
    formatAUM(value) {
        if (!value) return '-';
        if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B$';
        if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M$';
        return (value / 1e3).toFixed(2) + 'K$';
    }
    
    generateDemoData() {
        console.log('⚠️ Génération de données de démonstration');
        
        // Générer des données de démo pour tester l'interface
        const demoETFs = [
            { symbol: 'SPY', name: 'SPDR S&P 500', category: 'Standard', daily_change_pct: 0.5, ytd_return_pct: 15.2, one_year_return_pct: 22.1, aum_usd: 450e9 },
            { symbol: 'QQQ', name: 'Invesco QQQ', category: 'Standard', daily_change_pct: -0.3, ytd_return_pct: 18.5, one_year_return_pct: 28.3, aum_usd: 200e9 },
            { symbol: 'IWM', name: 'iShares Russell 2000', category: 'Standard', daily_change_pct: 1.2, ytd_return_pct: 8.7, one_year_return_pct: 15.4, aum_usd: 65e9 },
            { symbol: 'GLD', name: 'SPDR Gold Trust', category: 'Standard', daily_change_pct: -0.8, ytd_return_pct: -2.3, one_year_return_pct: 5.6, aum_usd: 55e9 },
            { symbol: 'TLT', name: 'iShares 20+ Year Treasury', category: 'Obligations', daily_change_pct: 0.2, ytd_return_pct: -5.1, one_year_return_pct: -8.2, aum_usd: 35e9 }
        ];
        
        demoETFs.forEach(etf => this.categorizeETFs.call({ data: { etfs: [etf] } }));
        
        this.data.etfs = demoETFs;
        this.data.lastUpdate = new Date().toISOString();
        
        this.calculateTopPerformers();
        this.buildSearchIndex();
        this.calculateStats();
        
        return this.data;
    }
}

// Exporter pour utilisation dans etf.html
if (typeof window !== 'undefined') {
    window.ETFDataLoader = ETFDataLoader;
}

// Si utilisé en Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ETFDataLoader;
}