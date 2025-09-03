// ETF Analysis Platform - Main Script
// Adapté de liste-script.js pour les ETFs

document.addEventListener('DOMContentLoaded', function() {
    // État global
    const state = {
        etfs: [],
        bonds: [],
        holdings: {},
        currentCategory: 'all',
        filteredETFs: [],
        comparisonETFs: [],
        loading: false
    };

    // Métriques spécifiques ETF
    const ETF_METRICS = {
        // Coûts
        ter: {label: 'TER', unit: '%', max: false, format: v => `${v.toFixed(3)}%`},
        management_fee: {label: 'Frais Gestion', unit: '%', max: false},
        
        // Performance
        perf_1d: {label: '1 Jour', unit: '%', max: true},
        perf_1m: {label: '1 Mois', unit: '%', max: true},
        perf_3m: {label: '3 Mois', unit: '%', max: true},
        perf_ytd: {label: 'YTD', unit: '%', max: true},
        perf_1y: {label: '1 An', unit: '%', max: true},
        perf_3y: {label: '3 Ans', unit: '%', max: true},
        perf_5y: {label: '5 Ans', unit: '%', max: true},
        
        // Liquidité
        aum: {label: 'AUM', unit: 'M€', max: true, format: v => `€${(v/1000000).toFixed(0)}M`},
        avg_volume: {label: 'Volume Moy.', unit: '', max: true},
        bid_ask_spread: {label: 'Spread', unit: '%', max: false},
        
        // Risque
        volatility_1y: {label: 'Vol. 1Y', unit: '%', max: false},
        max_drawdown: {label: 'Max DD', unit: '%', max: false},
        sharpe_ratio: {label: 'Sharpe', unit: '', max: true, format: v => v.toFixed(2)},
        tracking_error: {label: 'Tracking Error', unit: '%', max: false},
        
        // Distribution
        distribution_yield: {label: 'Rendement', unit: '%', max: true},
        distribution_freq: {label: 'Fréq. Distrib.', unit: '', max: true}
    };

    // Chargement des données
    async function loadETFData() {
        if (state.loading) return;
        state.loading = true;
        
        try {
            console.log('📊 Chargement des données ETF...');
            
            // Charger les fichiers CSV convertis (à remplacer par JSON après conversion)
            const [etfsRes, bondsRes, holdingsRes] = await Promise.all([
                fetch('data/combined_etfs.json').catch(() => null),
                fetch('data/combined_bonds.json').catch(() => null),
                fetch('data/combined_etfs_holdings.json').catch(() => null)
            ]);
            
            // Pour l'instant, données mockées
            state.etfs = generateMockETFs('equity', 50);
            state.bonds = generateMockETFs('bonds', 30);
            
            console.log(`✅ ${state.etfs.length} ETFs actions chargés`);
            console.log(`✅ ${state.bonds.length} ETFs obligations chargés`);
            
            // Afficher les données
            updateTopPerformers();
            filterETFs();
            
        } catch (error) {
            console.error('❌ Erreur chargement:', error);
        } finally {
            state.loading = false;
        }
    }

    // Générateur de données mock (temporaire)
    function generateMockETFs(type, count) {
        const etfs = [];
        const providers = ['iShares', 'Vanguard', 'SPDR', 'Lyxor', 'Amundi', 'Xtrackers'];
        const indices = ['S&P 500', 'MSCI World', 'MSCI EM', 'FTSE 100', 'DAX', 'CAC 40', 'Nasdaq 100'];
        
        for (let i = 0; i < count; i++) {
            etfs.push({
                ticker: `${providers[i % providers.length].substring(0, 3).toUpperCase()}${i}`,
                name: `${providers[i % providers.length]} ${indices[i % indices.length]} ${type === 'bonds' ? 'Bonds' : 'ETF'}`,
                type: type,
                ter: Math.random() * 0.8,
                aum: Math.random() * 5000000000,
                perf_1y: (Math.random() - 0.3) * 40,
                perf_ytd: (Math.random() - 0.3) * 25,
                volatility_1y: Math.random() * 30,
                sharpe_ratio: Math.random() * 2 - 0.5,
                distribution_yield: Math.random() * 5,
                avg_volume: Math.floor(Math.random() * 100000),
                tracking_error: Math.random() * 2,
                provider: providers[i % providers.length],
                index: indices[i % indices.length]
            });
        }
        
        return etfs;
    }

    // Mise à jour des top performers
    function updateTopPerformers() {
        const allETFs = [...state.etfs, ...state.bonds];
        
        // Meilleurs TER
        const bestTER = allETFs
            .sort((a, b) => a.ter - b.ter)
            .slice(0, 5);
        
        document.getElementById('best-ter').innerHTML = bestTER.map((etf, i) => `
            <div class="flex justify-between items-center p-2 hover:bg-white/5 rounded">
                <span class="text-sm">${etf.ticker}</span>
                <span class="metric-badge">${etf.ter.toFixed(3)}%</span>
            </div>
        `).join('');
        
        // Meilleures performances
        const bestPerf = allETFs
            .sort((a, b) => b.perf_1y - a.perf_1y)
            .slice(0, 5);
        
        document.getElementById('best-perf').innerHTML = bestPerf.map((etf, i) => `
            <div class="flex justify-between items-center p-2 hover:bg-white/5 rounded">
                <span class="text-sm">${etf.ticker}</span>
                <span class="metric-badge ${etf.perf_1y > 0 ? 'text-green-400' : 'text-red-400'}">
                    ${etf.perf_1y > 0 ? '+' : ''}${etf.perf_1y.toFixed(1)}%
                </span>
            </div>
        `).join('');
        
        // Plus gros AUM
        const largestAUM = allETFs
            .sort((a, b) => b.aum - a.aum)
            .slice(0, 5);
        
        document.getElementById('largest-aum').innerHTML = largestAUM.map((etf, i) => `
            <div class="flex justify-between items-center p-2 hover:bg-white/5 rounded">
                <span class="text-sm">${etf.ticker}</span>
                <span class="metric-badge">€${(etf.aum/1000000000).toFixed(1)}B</span>
            </div>
        `).join('');
        
        // Meilleur Sharpe
        const bestSharpe = allETFs
            .filter(e => e.sharpe_ratio > 0)
            .sort((a, b) => b.sharpe_ratio - a.sharpe_ratio)
            .slice(0, 5);
        
        document.getElementById('best-sharpe').innerHTML = bestSharpe.map((etf, i) => `
            <div class="flex justify-between items-center p-2 hover:bg-white/5 rounded">
                <span class="text-sm">${etf.ticker}</span>
                <span class="metric-badge">${etf.sharpe_ratio.toFixed(2)}</span>
            </div>
        `).join('');
    }

    // Filtrage des ETFs
    function filterETFs() {
        let filtered = [...state.etfs, ...state.bonds];
        
        // Filtrage par catégorie
        if (state.currentCategory !== 'all') {
            filtered = filtered.filter(etf => {
                switch(state.currentCategory) {
                    case 'equity': return etf.type === 'equity';
                    case 'bonds': return etf.type === 'bonds';
                    // Ajouter d'autres catégories
                    default: return true;
                }
            });
        }
        
        // Appliquer les critères multi-filtres
        if (document.getElementById('crit-ter').checked) {
            filtered = filtered.filter(e => e.ter < 0.5);
        }
        if (document.getElementById('crit-aum').checked) {
            filtered = filtered.filter(e => e.aum > 100000000);
        }
        if (document.getElementById('crit-volume').checked) {
            filtered = filtered.filter(e => e.avg_volume > 10000);
        }
        if (document.getElementById('crit-perf').checked) {
            filtered = filtered.filter(e => e.perf_1y > 10);
        }
        if (document.getElementById('crit-volatility').checked) {
            filtered = filtered.filter(e => e.volatility_1y < 15);
        }
        if (document.getElementById('crit-sharpe').checked) {
            filtered = filtered.filter(e => e.sharpe_ratio > 1);
        }
        
        state.filteredETFs = filtered;
        displayFilteredResults();
    }

    // Affichage des résultats filtrés
    function displayFilteredResults() {
        const container = document.getElementById('filtered-results');
        
        if (state.filteredETFs.length === 0) {
            container.innerHTML = '<p class="text-center opacity-50">Aucun ETF ne correspond aux critères</p>';
            return;
        }
        
        // Limiter à 10 résultats
        const top10 = state.filteredETFs.slice(0, 10);
        
        container.innerHTML = top10.map(etf => `
            <div class="p-3 bg-black/20 rounded-lg hover:bg-black/30 transition cursor-pointer"
                 onclick="selectETFForComparison('${etf.ticker}')">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="font-semibold">${etf.ticker}</div>
                        <div class="text-xs opacity-60">${etf.name}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs opacity-60">TER</div>
                        <div class="font-semibold text-cyan-400">${etf.ter.toFixed(3)}%</div>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2 text-xs">
                    <div>
                        <span class="opacity-60">1Y:</span>
                        <span class="${etf.perf_1y > 0 ? 'text-green-400' : 'text-red-400'}">
                            ${etf.perf_1y > 0 ? '+' : ''}${etf.perf_1y.toFixed(1)}%
                        </span>
                    </div>
                    <div>
                        <span class="opacity-60">Vol:</span>
                        <span>${etf.volatility_1y.toFixed(1)}%</span>
                    </div>
                    <div>
                        <span class="opacity-60">Sharpe:</span>
                        <span>${etf.sharpe_ratio.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="opacity-60">AUM:</span>
                        <span>€${(etf.aum/1000000000).toFixed(1)}B</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Comparaison d'ETFs
    window.selectETFForComparison = function(ticker) {
        const etf = [...state.etfs, ...state.bonds].find(e => e.ticker === ticker);
        if (!etf) return;
        
        // Limiter à 5 ETFs en comparaison
        if (state.comparisonETFs.length >= 5) {
            state.comparisonETFs.shift();
        }
        
        if (!state.comparisonETFs.find(e => e.ticker === ticker)) {
            state.comparisonETFs.push(etf);
            updateComparisonTable();
        }
    };

    // Mise à jour du tableau de comparaison
    function updateComparisonTable() {
        const container = document.getElementById('comparison-table');
        
        if (state.comparisonETFs.length === 0) {
            container.innerHTML = '<p class="text-center opacity-50 py-4">Sélectionnez des ETFs pour les comparer</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="w-full">
                <thead>
                    <tr class="border-b border-cyan-500/20">
                        <th class="text-left p-2">Métrique</th>
                        ${state.comparisonETFs.map(e => 
                            `<th class="text-center p-2">${e.ticker}</th>`
                        ).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(ETF_METRICS).slice(0, 10).map(([key, metric]) => `
                        <tr class="border-b border-cyan-500/10">
                            <td class="p-2 text-xs opacity-70">${metric.label}</td>
                            ${state.comparisonETFs.map(etf => {
                                const value = etf[key] || 0;
                                const formatted = metric.format ? 
                                    metric.format(value) : 
                                    `${value.toFixed(2)}${metric.unit}`;
                                const colorClass = getColorClass(key, value, metric.max);
                                return `<td class="text-center p-2 ${colorClass}">${formatted}</td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // Déterminer la couleur selon la valeur
    function getColorClass(metric, value, isMax) {
        if (metric.includes('perf') || metric === 'sharpe_ratio' || metric === 'distribution_yield') {
            return value > 0 ? 'text-green-400' : 'text-red-400';
        }
        if (metric === 'ter' || metric.includes('volatility') || metric === 'tracking_error') {
            return value < 0.5 ? 'text-green-400' : value < 1 ? 'text-yellow-400' : 'text-red-400';
        }
        return '';
    }

    // Event Listeners
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            state.currentCategory = this.dataset.category;
            filterETFs();
        });
    });

    document.getElementById('apply-filters').addEventListener('click', filterETFs);

    // Recherche d'ETFs
    document.getElementById('etf-search').addEventListener('input', function(e) {
        const search = e.target.value.toLowerCase();
        if (search.length < 2) return;
        
        const results = [...state.etfs, ...state.bonds].filter(etf => 
            etf.ticker.toLowerCase().includes(search) ||
            etf.name.toLowerCase().includes(search)
        );
        
        // Afficher suggestions (à implémenter)
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', function() {
        document.body.classList.toggle('dark');
        document.body.classList.toggle('light');
        const icon = this.querySelector('i');
        icon.classList.toggle('fa-moon');
        icon.classList.toggle('fa-sun');
    });

    // Mise à jour de l'heure
    function updateTime() {
        const now = new Date();
        document.getElementById('last-update').textContent = 
            now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    setInterval(updateTime, 60000);
    updateTime();

    // Initialisation
    loadETFData();

    // Export pour utilisation dans d'autres modules
    window.ETF = {
        state,
        metrics: ETF_METRICS,
        filterETFs,
        selectETFForComparison
    };
});