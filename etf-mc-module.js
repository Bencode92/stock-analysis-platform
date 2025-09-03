// Module MC adapté pour ETFs
(function() {
    // Attendre le chargement des données ETF
    if (!window.ETFData) {
        console.log('⏳ ETF MC: En attente des données...');
        setTimeout(arguments.callee, 500);
        return;
    }
    
    const root = document.querySelector('#etf-mc-section');
    const results = document.querySelector('#etf-mc-results .stock-cards-container');
    
    if (!root || !results) {
        console.error('❌ ETF MC: Éléments DOM non trouvés');
        return;
    }
    
    console.log('✅ ETF MC: Module initialisé');
    
    // État
    const state = {
        mode: 'balanced',
        selectedMetrics: ['ter', 'aum', 'return_ytd', 'sharpe'],
        filters: {
            type: 'all',
            maxTER: null,
            minAUM: null
        },
        data: []
    };
    
    // Métriques ETF
    const METRICS = {
        ter: { label: 'TER', unit: '%', max: false },
        aum: { label: 'AUM', unit: 'M€', max: true },
        return_1d: { label: 'Perf Daily', unit: '%', max: true },
        return_ytd: { label: 'YTD', unit: '%', max: true },
        return_1y: { label: 'Perf 1Y', unit: '%', max: true },
        return_3y: { label: 'Perf 3Y', unit: '%', max: true },
        volatility: { label: 'Volatilité', unit: '%', max: false },
        sharpe: { label: 'Sharpe', unit: '', max: true },
        dividend_yield: { label: 'Rendement', unit: '%', max: true },
        tracking_error: { label: 'Track. Error', unit: '%', max: false }
    };
    
    // Cache pour les calculs
    const cache = {};
    
    // Calculer les rankings
    function calculate() {
        // Récupérer les données ETF
        state.data = window.ETFData.getData() || [];
        
        if (state.data.length === 0) {
            results.innerHTML = '<div class="text-center text-gray-400 py-4">Chargement des données...</div>';
            return;
        }
        
        // Appliquer les filtres
        let filtered = state.data;
        
        // Filtre type
        if (state.filters.type !== 'all') {
            filtered = filtered.filter(etf => etf.type === state.filters.type);
        }
        
        // Filtre TER max
        if (state.filters.maxTER) {
            filtered = filtered.filter(etf => etf.ter <= state.filters.maxTER);
        }
        
        // Filtre AUM min
        if (state.filters.minAUM) {
            filtered = filtered.filter(etf => etf.aum >= state.filters.minAUM);
        }
        
        // Calculer les scores
        const scores = filtered.map(etf => {
            let score = 0;
            let count = 0;
            
            state.selectedMetrics.forEach(metric => {
                const value = etf[metric];
                if (typeof value === 'number' && !isNaN(value)) {
                    // Normaliser entre 0 et 1
                    const allValues = filtered.map(e => e[metric]).filter(v => !isNaN(v));
                    const min = Math.min(...allValues);
                    const max = Math.max(...allValues);
                    
                    let normalized;
                    if (max === min) {
                        normalized = 0.5;
                    } else {
                        normalized = (value - min) / (max - min);
                    }
                    
                    // Inverser si on veut minimiser
                    if (!METRICS[metric].max) {
                        normalized = 1 - normalized;
                    }
                    
                    score += normalized;
                    count++;
                }
            });
            
            return {
                etf,
                score: count > 0 ? score / count : 0
            };
        });
        
        // Trier et prendre le top 10
        scores.sort((a, b) => b.score - a.score);
        const top10 = scores.slice(0, 10);
        
        // Render
        render(top10);
        
        // Update summary
        updateSummary(filtered.length, state.data.length);
    }
    
    // Render les résultats
    function render(entries) {
        results.innerHTML = '';
        results.className = 'space-y-2';
        
        entries.forEach((entry, i) => {
            const card = document.createElement('div');
            card.className = 'glassmorphism rounded-lg p-3 flex items-center gap-4';
            
            const etf = entry.etf;
            
            // Valeurs métriques
            const metricValues = state.selectedMetrics.map(m => {
                const value = etf[m];
                if (typeof value !== 'number' || isNaN(value)) return '';
                
                const metric = METRICS[m];
                const formatted = m === 'aum' ? formatAUM(value) : value.toFixed(2);
                const colorClass = metric.max ? 
                    (value > 0 ? 'text-green-400' : 'text-red-400') :
                    (value < 1 ? 'text-green-400' : 'text-yellow-400');
                
                return `
                    <div class="text-right">
                        <div class="text-xs opacity-60">${metric.label}</div>
                        <div class="${colorClass} font-semibold">
                            ${formatted}${metric.unit && m !== 'aum' ? metric.unit : ''}
                        </div>
                    </div>
                `;
            }).filter(Boolean).join('');
            
            card.innerHTML = `
                <div class="rank text-2xl font-bold">#${i + 1}</div>
                <div class="flex-1">
                    <div class="font-semibold">${etf.ticker}</div>
                    <div class="text-xs opacity-60">${etf.name}</div>
                    <div class="text-xs opacity-40">${etf.type}</div>
                </div>
                <div class="flex gap-4">
                    ${metricValues}
                </div>
                <div class="text-lg font-bold text-cyan-400">
                    Score: ${(entry.score * 100).toFixed(0)}%
                </div>
            `;
            
            results.appendChild(card);
        });
        
        if (entries.length === 0) {
            results.innerHTML = '<div class="text-center text-cyan-400 py-4">Aucun ETF ne correspond aux critères</div>';
        }
    }
    
    // Update summary
    function updateSummary(filtered, total) {
        const summary = document.getElementById('etf-mc-summary');
        if (!summary) return;
        
        const mode = state.mode === 'balanced' ? 'Équilibre' : 'Priorités';
        const metrics = state.selectedMetrics.map(m => METRICS[m].label).join(' · ');
        
        summary.innerHTML = `<strong>${mode}</strong> • ${metrics} • ${filtered}/${total} ETFs`;
    }
    
    // Format AUM
    function formatAUM(val) {
        if (val >= 1000) return (val / 1000).toFixed(1) + 'B€';
        return val.toFixed(0) + 'M€';
    }
    
    // Event listeners
    
    // Checkboxes métriques
    Object.keys(METRICS).forEach(metric => {
        const checkbox = document.getElementById(`etf-m-${metric}`);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (!state.selectedMetrics.includes(metric)) {
                        state.selectedMetrics.push(metric);
                    }
                } else {
                    state.selectedMetrics = state.selectedMetrics.filter(m => m !== metric);
                }
            });
        }
    });
    
    // Mode radio buttons
    document.querySelectorAll('input[name="etf-mc-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            state.mode = radio.value;
        });
    });
    
    // Filtres
    document.getElementById('etf-filter-type')?.addEventListener('change', (e) => {
        state.filters.type = e.target.value;
    });
    
    document.getElementById('etf-filter-ter')?.addEventListener('input', (e) => {
        state.filters.maxTER = e.target.value ? parseFloat(e.target.value) : null;
    });
    
    document.getElementById('etf-filter-aum')?.addEventListener('input', (e) => {
        state.filters.minAUM = e.target.value ? parseFloat(e.target.value) : null;
    });
    
    // Boutons
    document.getElementById('etf-mc-apply')?.addEventListener('click', calculate);
    
    document.getElementById('etf-mc-reset')?.addEventListener('click', () => {
        // Reset état
        state.selectedMetrics = ['ter', 'aum', 'return_ytd', 'sharpe'];
        state.filters = { type: 'all', maxTER: null, minAUM: null };
        state.mode = 'balanced';
        
        // Reset UI
        Object.keys(METRICS).forEach(m => {
            const cb = document.getElementById(`etf-m-${m}`);
            if (cb) cb.checked = state.selectedMetrics.includes(m);
        });
        
        document.getElementById('etf-filter-type').value = 'all';
        document.getElementById('etf-filter-ter').value = '';
        document.getElementById('etf-filter-aum').value = '';
        
        const balancedRadio = document.querySelector('input[name="etf-mc-mode"][value="balanced"]');
        if (balancedRadio) balancedRadio.checked = true;
        
        calculate();
    });
    
    // Expose
    window.ETF_MC = { calculate, state };
    
    // Calcul initial après un délai
    setTimeout(() => {
        if (window.ETFData.getData().length > 0) {
            calculate();
        }
    }, 1000);
    
    console.log('✅ ETF MC Module v1.0 prêt');
})();