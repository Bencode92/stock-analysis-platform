// Module MC adapté pour ETFs - v3.2 avec améliorations performances et UX
(function() {
    // ========== HELPERS ==========
    
    // Attendre que les données soient prêtes (event-based, pas de polling)
    function onETFDataReady(cb) {
        if (window.ETFData?.getData?.().length) return cb();
        const once = () => { 
            document.removeEventListener('ETFData:ready', once); 
            cb(); 
        };
        document.addEventListener('ETFData:ready', once);
    }
    
    // Vérifier que le DOM est prêt
    const root = document.querySelector('#etf-mc-section');
    const results = document.querySelector('#etf-mc-results .stock-cards-container');
    
    if (!root || !results) {
        console.error('❌ ETF MC: Éléments DOM non trouvés');
        return;
    }
    
    console.log('✅ ETF MC v3.2: Module initialisé - Event-based, Auto-calc, LocalStorage');
    
    // ========== HELPERS DE CLASSIFICATION ==========
    function kindOf(e) {
        const ft = String(e.fund_type || '').toLowerCase();
        if (/(bond|government|fixed income|target maturity)/i.test(ft)) return 'bonds';
        if (/(commodit|precious|gold|silver|oil)/i.test(ft)) return 'commodity';
        return 'equity';
    }
    
    function isLeveraged(e) {
        const t = String(e.etf_type || '').toLowerCase();
        const lev = Number(e.leverage);
        return /leveraged|inverse/.test(t) || (Number.isFinite(lev) && lev !== 0);
    }
    
    function pct(x) { 
        return Number.isFinite(+x) ? +x : NaN; 
    }
    
    function formatPct(x) { 
        return Number.isFinite(x) ? x.toFixed(1) + '%' : ''; 
    }
    
    // ========== ÉTAT avec LocalStorage ==========
    const LS_KEY = 'etf-mc:v3.2';
    
    const defaultState = {
        mode: 'balanced',
        selectedMetrics: ['ter', 'aum', 'return_ytd', 'volatility', 'sharpe_proxy'],
        filters: {
            type: 'all',
            maxTER: null,
            minAUM: null,
            minQuality: 80,
            excludeLeveraged: true
        },
        data: []
    };
    
    let state = { ...defaultState };
    
    // Charger l'état depuis localStorage
    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            if (saved.mode) state.mode = saved.mode;
            if (Array.isArray(saved.selectedMetrics)) {
                state.selectedMetrics = saved.selectedMetrics.filter(m => METRICS[m]);
            }
            if (saved.filters) Object.assign(state.filters, saved.filters);
        } catch(e) {
            console.warn('ETF MC: Impossible de charger les préférences', e);
        }
    }
    
    // Sauvegarder l'état dans localStorage
    function saveState() {
        try {
            const toSave = {
                mode: state.mode,
                selectedMetrics: state.selectedMetrics,
                filters: state.filters
            };
            localStorage.setItem(LS_KEY, JSON.stringify(toSave));
        } catch(e) {
            console.warn('ETF MC: Impossible de sauvegarder les préférences', e);
        }
    }
    
    // ========== MÉTRIQUES AVEC VRAIS CHAMPS ==========
    const METRICS = {
        ter: { 
            label: 'TER', 
            unit: '%', 
            max: false, 
            get: e => pct(e.total_expense_ratio) * 100 
        },
        aum: { 
            label: 'AUM', 
            unit: '$M', 
            max: true, 
            get: e => pct(e.aum_usd) 
        },
        return_1d: { 
            label: 'Perf Daily', 
            unit: '%', 
            max: true, 
            get: e => pct(e.daily_change_pct) 
        },
        return_ytd: { 
            label: 'YTD', 
            unit: '%', 
            max: true, 
            get: e => pct(e.ytd_return_pct) 
        },
        return_1y: { 
            label: 'Perf 1Y', 
            unit: '%', 
            max: true, 
            get: e => pct(e.one_year_return_pct) 
        },
        volatility: { 
            label: 'Vol 3Y', 
            unit: '%', 
            max: false, 
            get: e => pct(e.vol_3y_pct) 
        },
        dividend_yield: { 
            label: 'Yield TTM', 
            unit: '%', 
            max: true, 
            get: e => pct(e.yield_ttm) * 100 
        },
        
        // Métriques dérivées
        yield_net: { 
            label: 'Yield net', 
            unit: '%', 
            max: true, 
            get: e => kindOf(e) === 'bonds' 
                ? (pct(e.yield_ttm) * 100 - pct(e.total_expense_ratio) * 100)
                : NaN 
        },
        sharpe_proxy: { 
            label: 'R/Vol', 
            unit: '', 
            max: true, 
            get: e => {
                const r = pct(e.one_year_return_pct);
                const v = pct(e.vol_3y_pct);
                return (Number.isFinite(r) && Number.isFinite(v) && v > 0) ? (r / v) : NaN;
            }
        },
        quality: { 
            label: 'Qualité', 
            unit: '', 
            max: true, 
            get: e => pct(e.data_quality_score) 
        }
    };
    
    // ========== LOADER ==========
    function showLoader(on) {
        const loader = document.getElementById('mc-loading');
        const resultsBox = document.getElementById('etf-mc-results');
        if (loader && resultsBox) {
            loader.classList.toggle('hidden', !on);
            resultsBox.classList.toggle('hidden', on);
        }
    }
    
    // ========== CALCUL DES RANKINGS avec DEBOUNCE ==========
    let calcTimer;
    function scheduleCalculate() {
        clearTimeout(calcTimer);
        calcTimer = setTimeout(() => {
            showLoader(true);
            requestAnimationFrame(() => {
                calculate();
                showLoader(false);
            });
        }, 120);
    }
    
    function calculate() {
        // Récupérer et enrichir les données
        state.data = (window.ETFData?.getData() || []).map(e => ({
            ...e,
            __kind: kindOf(e),
            __lev: isLeveraged(e)
        }));
        
        if (state.data.length === 0) {
            results.innerHTML = '<div class="text-center text-gray-400 py-4">Chargement des données...</div>';
            return;
        }
        
        // Appliquer les filtres
        let filtered = [...state.data];
        
        // Filtre type
        if (state.filters.type !== 'all') {
            if (state.filters.type === 'equity')   filtered = filtered.filter(e => e.__kind === 'equity');
            if (state.filters.type === 'bonds')    filtered = filtered.filter(e => e.__kind === 'bonds');
            if (state.filters.type === 'commodity') filtered = filtered.filter(e => e.__kind === 'commodity');
        }
        
        // Exclure leveraged/inverse si activé
        if (state.filters.excludeLeveraged) {
            filtered = filtered.filter(e => !e.__lev);
        }
        
        // TER max (%) et AUM min (M$)
        if (state.filters.maxTER != null) {
            filtered = filtered.filter(e => {
                const ter = METRICS.ter.get(e);
                return Number.isFinite(ter) && ter <= state.filters.maxTER;
            });
        }
        
        if (state.filters.minAUM != null) {
            filtered = filtered.filter(e => {
                const aum = METRICS.aum.get(e);
                return Number.isFinite(aum) && aum >= state.filters.minAUM;
            });
        }
        
        // Qualité min
        if (state.filters.minQuality != null) {
            filtered = filtered.filter(e => {
                const q = METRICS.quality.get(e);
                return !Number.isFinite(q) || q >= state.filters.minQuality;
            });
        }
        
        if (filtered.length === 0) {
            render([]);
            updateSummary(0, state.data.length);
            saveState(); // Sauvegarder même si pas de résultats
            return;
        }
        
        // Pré-calculer min/max pour normalisation
        const selected = state.selectedMetrics.filter(m => METRICS[m]);
        const ranges = {};

        selected.forEach(m => {
            const vals = filtered
                .map(e => METRICS[m].get(e))
                .filter(v => Number.isFinite(v));
            
            if (vals.length > 0) {
                ranges[m] = { 
                    min: Math.min(...vals), 
                    max: Math.max(...vals) 
                };
            } else {
                ranges[m] = { min: 0, max: 0 };
            }
        });

        // Mode balanced ou lexico
        let top10;
        if (state.mode === 'balanced') {
            // Calculer les scores normalisés
            const scores = filtered.map(etf => {
                let score = 0, count = 0;
                
                selected.forEach(metric => {
                    const value = METRICS[metric].get(etf);
                    if (!Number.isFinite(value)) return;

                    const {min, max} = ranges[metric];
                    let normalized = (max === min) ? 0.5 : (value - min) / (max - min);
                    if (!METRICS[metric].max) normalized = 1 - normalized; // inverser si min = mieux

                    score += normalized;
                    count++;
                });
                
                return { etf, score: count ? score / count : 0 };
            });
            
            scores.sort((a, b) => b.score - a.score);
            top10 = scores.slice(0, 10);
            
        } else {
            // Mode priorités (tri lexicographique avec tolérance)
            const N = filtered.length;
            const ranks = {};
            
            // Calculer les rangs percentiles
            selected.forEach(m => {
                const arr = filtered
                    .map((e, i) => ({ i, v: METRICS[m].get(e) }))
                    .filter(x => Number.isFinite(x.v))
                    .sort((a, b) => a.v - b.v);
                
                const pctArr = new Array(N).fill(NaN);
                arr.forEach((x, idx) => { 
                    pctArr[x.i] = (idx + 0.5) / arr.length; 
                });
                ranks[m] = pctArr;
            });

            // Tri lexicographique
            const idx = filtered.map((_, i) => i).sort((ia, ib) => {
                for (const m of selected) {
                    let pa = ranks[m][ia], pb = ranks[m][ib];
                    if (!Number.isFinite(pa) && !Number.isFinite(pb)) continue;
                    if (!Number.isFinite(pa)) return 1;
                    if (!Number.isFinite(pb)) return -1;
                    if (!METRICS[m].max) { 
                        pa = 1 - pa; 
                        pb = 1 - pb; 
                    }
                    const d = pa - pb;
                    if (Math.abs(d) > 0.01) return d > 0 ? -1 : 1; // tolérance 1%
                }
                return 0;
            });

            top10 = idx.slice(0, 10).map(i => ({ etf: filtered[i], score: NaN }));
        }
        
        // Render et sauvegarder
        render(top10);
        updateSummary(filtered.length, state.data.length);
        saveState();
    }
    
    // ========== RENDU DES RÉSULTATS AMÉLIORÉ ==========
    function render(entries) {
        results.innerHTML = '';
        results.className = 'stock-cards-container';
        
        if (entries.length === 0) {
            results.innerHTML = '<div class="text-center text-cyan-400 py-4 col-span-full">Aucun ETF ne correspond aux critères</div>';
            return;
        }
        
        entries.forEach((entry, i) => {
            const card = document.createElement('div');
            card.className = 'stock-card glassmorphism rounded-lg p-4';
            
            const etf = entry.etf;
            
            // Ligne d'infos supplémentaires (pays/secteur/date)
            const infoLine = `
                <div class="text-xs opacity-60 mt-1">
                    ${etf.country_top ? `🌍 ${etf.country_top}${Number.isFinite(etf.country_top_weight) ? ' ' + formatPct(etf.country_top_weight) : ''}` : ''}
                    ${etf.sector_top ? ` • 🏷️ ${etf.sector_top}${Number.isFinite(etf.sector_top_weight) ? ' ' + formatPct(etf.sector_top_weight) : ''}` : ''}
                    ${etf.as_of ? ` • ⏱️ ${new Date(etf.as_of).toLocaleDateString()}` : ''}
                </div>
            `;
            
            // Valeurs métriques avec formatage amélioré
            const metricValues = state.selectedMetrics.map(m => {
                const def = METRICS[m];
                if (!def) return '';
                const raw = def.get(etf);
                
                // Si valeur manquante, afficher en grisé
                if (!Number.isFinite(raw)) return `
                    <div class="text-right opacity-40">
                        <div class="text-xs">${def.label}</div>
                        <div>—</div>
                    </div>
                `;
                
                // Formatage selon le type
                let formatted;
                if (m === 'aum') {
                    formatted = raw >= 1000 ? (raw/1000).toFixed(1) + 'B$' : raw.toFixed(0) + 'M$';
                } else if (def.unit === '%') {
                    formatted = raw.toFixed(2) + '%';
                } else if (m === 'sharpe_proxy') {
                    formatted = raw.toFixed(2);
                } else {
                    formatted = raw.toFixed(2);
                }
                
                // Coloration contextuelle améliorée
                let colorClass;
                if (m === 'ter' || m === 'volatility') {
                    // Plus bas = mieux
                    if (m === 'ter') {
                        colorClass = raw < 0.2 ? 'text-green-500' :
                                   raw < 0.4 ? 'text-green-400' :
                                   raw < 0.7 ? 'text-yellow-400' : 'text-red-400';
                    } else {
                        colorClass = raw < 10 ? 'text-green-500' :
                                   raw < 20 ? 'text-green-400' :
                                   raw < 30 ? 'text-yellow-400' : 'text-red-400';
                    }
                } else if (m === 'sharpe_proxy') {
                    colorClass = raw > 2 ? 'text-green-500' :
                               raw > 1 ? 'text-green-400' :
                               raw > 0 ? 'text-yellow-400' : 'text-red-400';
                } else if (m === 'quality') {
                    colorClass = raw >= 95 ? 'text-green-500' :
                               raw >= 90 ? 'text-green-400' :
                               raw >= 80 ? 'text-yellow-400' : 'text-red-400';
                } else {
                    // Plus haut = mieux
                    colorClass = raw >= 0 ? 'text-green-400' : 'text-red-400';
                }

                return `
                    <div class="text-right">
                        <div class="text-xs opacity-60">${def.label}</div>
                        <div class="${colorClass} font-semibold">
                            ${formatted}
                        </div>
                    </div>
                `;
            }).filter(Boolean).join('');
            
            // Badge pour le type
            let typeBadge = '';
            if (etf.__kind === 'bonds') {
                typeBadge = '<span class="ter-badge">Obligations</span>';
            } else if (etf.__kind === 'commodity') {
                typeBadge = '<span class="aum-badge" style="background: rgba(255, 193, 7, 0.2); color: #FFC107;">Matières</span>';
            } else {
                typeBadge = '<span class="aum-badge">Actions</span>';
            }
            
            // Badge leveraged si applicable
            const levBadge = etf.__lev ? '<span class="text-xs px-2 py-1 bg-red-900 text-red-300 rounded">LEV/INV</span>' : '';
            
            // Score uniquement en mode balanced
            const scoreDisplay = Number.isFinite(entry.score) 
                ? `<div class="mc-score-badge text-cyan-400">${(entry.score * 100).toFixed(0)}%</div>`
                : '';
            
            card.innerHTML = `
                <div class="rank">#${i + 1}</div>
                <div class="stock-info">
                    <div class="stock-name">
                        ${etf.ticker}
                        ${typeBadge}
                        ${levBadge}
                    </div>
                    <div class="stock-fullname" title="${etf.name}">${etf.name}</div>
                    ${infoLine}
                    <div class="text-xs opacity-40">${etf.isin || ''}</div>
                </div>
                <div class="stock-performance">
                    <div class="flex gap-3">
                        ${metricValues}
                    </div>
                    ${scoreDisplay}
                </div>
            `;
            
            results.appendChild(card);
        });
    }
    
    // ========== MISE À JOUR DU RÉSUMÉ ==========
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
        if (state.filters.minAUM) filterInfo.push(`AUM≥${state.filters.minAUM}M$`);
        if (state.filters.excludeLeveraged) filterInfo.push('No Lev/Inv');
        
        const filterText = filterInfo.length > 0 ? ` • ${filterInfo.join(' ')}` : '';
        
        summary.innerHTML = `<strong>${mode}</strong> • ${metrics}${filterText} • ${filtered}/${total} ETFs`;
    }
    
    // ========== EVENT LISTENERS AVEC AUTO-CALC ==========
    
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
                scheduleCalculate(); // Auto-recalcul
            });
        }
    });
    
    // Mode radio buttons
    document.querySelectorAll('input[name="etf-mc-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            state.mode = radio.value;
            scheduleCalculate(); // Auto-recalcul
        });
    });
    
    // Filtres
    document.getElementById('etf-filter-type')?.addEventListener('change', (e) => {
        state.filters.type = e.target.value;
        scheduleCalculate(); // Auto-recalcul
    });
    
    document.getElementById('etf-filter-ter')?.addEventListener('input', (e) => {
        state.filters.maxTER = e.target.value ? parseFloat(e.target.value) : null;
        scheduleCalculate(); // Auto-recalcul
    });
    
    document.getElementById('etf-filter-aum')?.addEventListener('input', (e) => {
        state.filters.minAUM = e.target.value ? parseFloat(e.target.value) : null;
        scheduleCalculate(); // Auto-recalcul
    });
    
    // Slider qualité
    document.getElementById('etf-filter-quality')?.addEventListener('input', (e) => {
        state.filters.minQuality = parseInt(e.target.value);
        document.getElementById('quality-value').textContent = e.target.value;
        scheduleCalculate(); // Auto-recalcul
    });
    
    // Toggle leveraged/inverse
    let levToggle = document.getElementById('etf-filter-leveraged');
    if (!levToggle) {
        // Créer le toggle s'il n'existe pas
        const filterContainer = document.querySelector('#etf-mc-filters') || 
                               document.querySelector('#etf-mc-section fieldset[data-role="filters"]');
        if (filterContainer) {
            const toggleDiv = document.createElement('div');
            toggleDiv.className = 'flex gap-2 items-center mt-2';
            toggleDiv.innerHTML = `
                <label class="text-xs opacity-70 min-w-[60px]">Exclure:</label>
                <label class="mc-pill">
                    <input id="etf-filter-leveraged" type="checkbox" checked>
                    Lev/Inverse
                </label>
            `;
            filterContainer.appendChild(toggleDiv);
            levToggle = document.getElementById('etf-filter-leveraged');
        }
    }
    
    levToggle?.addEventListener('change', (e) => {
        state.filters.excludeLeveraged = e.target.checked;
        scheduleCalculate(); // Auto-recalcul
    });
    
    // Boutons (Apply force le recalcul immédiat)
    document.getElementById('etf-mc-apply')?.addEventListener('click', () => {
        console.log('🎯 ETF MC v3.2: Calcul forcé avec', state.selectedMetrics.length, 'métriques');
        calculate(); // Calcul immédiat
    });
    
    document.getElementById('etf-mc-reset')?.addEventListener('click', () => {
        // Reset état
        state = JSON.parse(JSON.stringify(defaultState));
        
        // Reset UI
        Object.keys(METRICS).forEach(m => {
            const cb = document.getElementById(`etf-m-${m}`);
            if (cb) cb.checked = state.selectedMetrics.includes(m);
        });
        
        const typeFilter = document.getElementById('etf-filter-type');
        const terFilter = document.getElementById('etf-filter-ter');
        const aumFilter = document.getElementById('etf-filter-aum');
        const qualitySlider = document.getElementById('etf-filter-quality');
        const levToggle = document.getElementById('etf-filter-leveraged');
        
        if (typeFilter) typeFilter.value = 'all';
        if (terFilter) terFilter.value = '';
        if (aumFilter) aumFilter.value = '';
        if (qualitySlider) {
            qualitySlider.value = '80';
            document.getElementById('quality-value').textContent = '80';
        }
        if (levToggle) levToggle.checked = true;
        
        const balancedRadio = document.querySelector('input[name="etf-mc-mode"][value="balanced"]');
        if (balancedRadio) balancedRadio.checked = true;
        
        // Synchroniser les pills
        document.querySelectorAll('#etf-mc-section .mc-pill').forEach(pill => {
            const input = pill.querySelector('input');
            if (input) {
                pill.classList.toggle('is-checked', input.checked);
            }
        });
        
        // Effacer localStorage et recalculer
        localStorage.removeItem(LS_KEY);
        calculate();
    });
    
    // ========== EXPOSITION API PROPRE ==========
    window.ETF_MC = {
        calculate,
        state,
        METRICS,
        setMetrics(list) { 
            state.selectedMetrics = list.filter(m => METRICS[m]); 
            scheduleCalculate(); 
        },
        setFilter(k, v) { 
            state.filters[k] = v; 
            scheduleCalculate(); 
        },
        setMode(m) { 
            state.mode = m; 
            scheduleCalculate(); 
        },
        refresh() { 
            calculate(); 
        },
        helpers: { kindOf, isLeveraged }
    };
    
    // ========== INITIALISATION ==========
    
    // Charger les préférences sauvegardées
    loadState();
    
    // Synchroniser l'UI avec l'état chargé
    Object.keys(METRICS).forEach(m => {
        const cb = document.getElementById(`etf-m-${m}`);
        if (cb) cb.checked = state.selectedMetrics.includes(m);
    });
    
    const modeRadio = document.querySelector(`input[name="etf-mc-mode"][value="${state.mode}"]`);
    if (modeRadio) modeRadio.checked = true;
    
    const typeFilter = document.getElementById('etf-filter-type');
    if (typeFilter && state.filters.type) typeFilter.value = state.filters.type;
    
    const terFilter = document.getElementById('etf-filter-ter');
    if (terFilter && state.filters.maxTER) terFilter.value = state.filters.maxTER;
    
    const aumFilter = document.getElementById('etf-filter-aum');
    if (aumFilter && state.filters.minAUM) aumFilter.value = state.filters.minAUM;
    
    const qualitySlider = document.getElementById('etf-filter-quality');
    if (qualitySlider && state.filters.minQuality != null) {
        qualitySlider.value = state.filters.minQuality;
        const qualityValue = document.getElementById('quality-value');
        if (qualityValue) qualityValue.textContent = state.filters.minQuality;
    }
    
    const levToggle = document.getElementById('etf-filter-leveraged');
    if (levToggle) levToggle.checked = state.filters.excludeLeveraged;
    
    // Attendre les données et calculer
    onETFDataReady(() => {
        calculate();
        console.log('✅ ETF MC v3.2: Données prêtes → calcul initial avec préférences restaurées');
    });
    
    console.log('✅ ETF MC Module v3.2 - Event-based, Auto-calc, LocalStorage, Infos étendues');
})();
