// Module MC adapté pour ETFs - v2.0 avec métriques corrigées
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
    
    // Métriques ETF avec getters cohérents (TER en %, Sharpe = sharpe_ratio)
    const METRICS = {
        ter:             { label:'TER',            unit:'%', max:false, get:e => (+e.ter)*100 },
        aum:             { label:'AUM',            unit:'€', max:true,  get:e => +e.aum },
        return_1d:       { label:'Perf Daily',     unit:'%', max:true,  get:e => +e.return_1d },
        return_ytd:      { label:'YTD',            unit:'%', max:true,  get:e => +e.return_ytd },
        return_1y:       { label:'Perf 1Y',        unit:'%', max:true,  get:e => +e.return_1y },
        return_3y:       { label:'Perf 3Y',        unit:'%', max:true,  get:e => +e.return_3y },
        volatility:      { label:'Volatilité',     unit:'%', max:false, get:e => +e.volatility },
        sharpe:          { label:'Sharpe',         unit:'',  max:true,  get:e => +e.sharpe_ratio },
        dividend_yield:  { label:'Rendement',      unit:'%', max:true,  get:e => +e.dividend_yield },
        tracking_error:  { label:'Track. Error',   unit:'%', max:false, get:e => +e.tracking_error },
        // BONUS pour obligations
        yield_net:       { label:'Rdt net',        unit:'%', max:true,  get:e => e.dataset==='bonds' ? (+e.dividend_yield - (+e.ter*100)) : NaN },
        yield_risk:      { label:'Rdt/risque',     unit:'',  max:true,  get:e => e.dataset==='bonds' ? (+e.dividend_yield/Math.max(0.0001,+e.volatility||0)) : NaN },
    };
    
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
        
        // Filtre type (utilise dataset pour séparer ETFs vs Bonds)
        if (state.filters.type !== 'all') {
            if (state.filters.type === 'equity') {
                filtered = filtered.filter(e => e.dataset === 'etf');
            } else if (state.filters.type === 'bonds') {
                filtered = filtered.filter(e => e.dataset === 'bonds');
            } else if (state.filters.type === 'sector' || state.filters.type === 'geographic') {
                filtered = filtered.filter(e => e.dataset === 'etf' && e.type === state.filters.type);
            }
        }
        
        // TER max en %, AUM min en M€
        if (state.filters.maxTER != null) {
            filtered = filtered.filter(e => Number.isFinite(e.ter) && (e.ter*100) <= state.filters.maxTER);
        }
        if (state.filters.minAUM != null) {
            filtered = filtered.filter(e => Number.isFinite(e.aum) && e.aum >= state.filters.minAUM);
        }
        
        // Pré-calculer min/max une seule fois
        const selected = state.selectedMetrics.filter(m => METRICS[m]);
        const ranges = {}; // { metric: {min, max} }

        selected.forEach(m => {
            const vals = filtered
                .map(e => METRICS[m].get(e))
                .filter(v => Number.isFinite(v));
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            ranges[m] = { min, max };
        });

        // Calculer les scores
        const scores = filtered.map(etf => {
            let score = 0, count = 0;
            selected.forEach(metric => {
                const value = METRICS[metric].get(etf);
                if (!Number.isFinite(value)) return;

                const {min, max} = ranges[metric];
                let normalized = (max === min) ? 0.5 : (value - min) / (max - min);
                if (!METRICS[metric].max) normalized = 1 - normalized; // min = mieux

                score += normalized;
                count++;
            });
            return { etf, score: count ? score / count : 0 };
        });
        
        // Mode balanced ou lexico
        let top10;
        if (state.mode === 'balanced') {
            scores.sort((a,b) => b.score - a.score);
            top10 = scores.slice(0, 10);
        } else {
            // Mode priorités (tri lexicographique sur percentiles)
            const ranks = {};
            const N = filtered.length;
            
            selected.forEach(m => {
                const arr = filtered
                    .map((e,i) => ({i, v: METRICS[m].get(e)}))
                    .filter(x => Number.isFinite(x.v))
                    .sort((a,b) => a.v - b.v);
                const pct = new Array(N).fill(NaN);
                arr.forEach((x,idx) => { 
                    pct[x.i] = (idx + 0.5) / arr.length; 
                });
                ranks[m] = pct;
            });

            const idx = filtered.map((_, i) => i).sort((ia, ib) => {
                for (const m of selected) {
                    let pa = ranks[m][ia], pb = ranks[m][ib];
                    if (!Number.isFinite(pa) && !Number.isFinite(pb)) continue;
                    if (!Number.isFinite(pa)) return 1;
                    if (!Number.isFinite(pb)) return -1;
                    if (!METRICS[m].max) { pa = 1 - pa; pb = 1 - pb; }
                    const d = pa - pb;
                    if (Math.abs(d) > 0.01) return d > 0 ? -1 : 1; // tolérance 1pp
                }
                return 0;
            });

            top10 = idx.slice(0, 10).map(i => ({ etf: filtered[i], score: NaN }));
        }
        
        // Render
        render(top10);
        
        // Update summary
        updateSummary(filtered.length, state.data.length);
    }
    
    // Render les résultats avec formatage correct
    function render(entries) {
        results.innerHTML = '';
        results.className = 'space-y-2';
        
        entries.forEach((entry, i) => {
            const card = document.createElement('div');
            card.className = 'glassmorphism rounded-lg p-3 flex items-center gap-4';
            
            const etf = entry.etf;
            
            // Valeurs métriques avec getters
            const metricValues = state.selectedMetrics.map(m => {
                const def = METRICS[m];
                if (!def) return '';
                const raw = def.get(etf);
                if (!Number.isFinite(raw)) return '';
                
                const formatted = m === 'aum' ? formatAUM(raw)
                    : def.unit === '%' ? raw.toFixed(2)
                    : raw.toFixed(2);
                
                const colorClass = (m === 'volatility' || m === 'tracking_error' || m === 'ter')
                    ? (raw < (m === 'ter' ? 0.5 : 15) ? 'text-green-400' : 'text-yellow-400')
                    : (raw >= 0 ? 'text-green-400' : 'text-red-400');

                return `
                    <div class="text-right">
                        <div class="text-xs opacity-60">${def.label}</div>
                        <div class="${colorClass} font-semibold">
                            ${formatted}${m !== 'aum' && def.unit ? def.unit : ''}
                        </div>
                    </div>
                `;
            }).filter(Boolean).join('');
            
            // Badge dataset
            const datasetBadge = etf.dataset === 'bonds' 
                ? '<span class="ter-badge">Obligations</span>' 
                : '<span class="aum-badge">Actions</span>';
            
            // Score uniquement en mode balanced
            const scoreDisplay = Number.isFinite(entry.score) 
                ? `<div class="text-lg font-bold text-cyan-400">Score: ${(entry.score * 100).toFixed(0)}%</div>`
                : '';
            
            card.innerHTML = `
                <div class="rank text-2xl font-bold">#${i + 1}</div>
                <div class="flex-1">
                    <div class="font-semibold flex items-center gap-2">
                        ${etf.ticker}
                        ${datasetBadge}
                    </div>
                    <div class="text-xs opacity-60">${etf.name}</div>
                    <div class="text-xs opacity-40">${etf.type}</div>
                </div>
                <div class="flex gap-4">
                    ${metricValues}
                </div>
                ${scoreDisplay}
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
        const metrics = state.selectedMetrics
            .map(m => METRICS[m] ? METRICS[m].label : null)
            .filter(Boolean)
            .join(' · ');
        
        const filterInfo = [];
        if (state.filters.type !== 'all') filterInfo.push(state.filters.type);
        if (state.filters.maxTER) filterInfo.push(`TER≤${state.filters.maxTER}%`);
        if (state.filters.minAUM) filterInfo.push(`AUM≥${state.filters.minAUM}M€`);
        
        const filterText = filterInfo.length > 0 ? ` • ${filterInfo.join(' ')}` : '';
        
        summary.innerHTML = `<strong>${mode}</strong> • ${metrics}${filterText} • ${filtered}/${total} ETFs`;
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
        
        const typeFilter = document.getElementById('etf-filter-type');
        const terFilter = document.getElementById('etf-filter-ter');
        const aumFilter = document.getElementById('etf-filter-aum');
        
        if (typeFilter) typeFilter.value = 'all';
        if (terFilter) terFilter.value = '';
        if (aumFilter) aumFilter.value = '';
        
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
    
    console.log('✅ ETF MC Module v2.0 - Métriques corrigées avec getters');
})();
