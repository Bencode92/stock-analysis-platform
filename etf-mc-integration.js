// Script d'intégration MC pour ETFs - v3.1 avec nouveaux contrôles et métriques
// Ajoute les contrôles UI manquants et améliore l'intégration

// 1. Ajouter les styles CSS améliorés (avec idempotence)
if (!document.getElementById('etf-mc-styles')) {
    const etfMcStyles = document.createElement('style');
    etfMcStyles.id = 'etf-mc-styles';
    etfMcStyles.textContent = `
    /* ===== STYLES AMÉLIORÉS POUR LE COMPOSEUR ETF v3.1 ===== */
    
    /* Cartes : largeur adaptative avec minimum confortable */
    #etf-mc-results .stock-cards-container,
    #top-global-container .stock-cards-container {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    }
    
    /* Sur écrans larges, plus d'espace */
    @media (min-width: 1280px) {
        #etf-mc-results .stock-cards-container {
            grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
        }
    }
    
    /* Mise en page de la carte optimisée */
    #etf-mc-results .stock-card {
        display: grid;
        grid-template-columns: 48px 1fr auto;
        align-items: center;
        gap: 12px;
        min-height: 100px;
    }
    
    /* Nom complet : 2 lignes avec expansion au survol */
    .stock-fullname {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: normal;
        word-break: break-word;
        max-width: 100%;
        transition: all 0.3s ease;
        line-height: 1.3;
    }
    
    .stock-card:hover .stock-fullname {
        -webkit-line-clamp: 4;
        max-height: none;
    }
    
    /* Performance values avec espacement garanti */
    .stock-performance {
        white-space: nowrap;
        min-width: fit-content;
        text-align: right;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }
    
    /* Métriques en colonnes */
    #etf-mc-results .stock-performance .flex {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(65px, 1fr));
        gap: 12px;
    }
    
    /* Rang avec hiérarchie visuelle */
    .stock-card .rank {
        width: 42px;
        height: 42px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 50%;
        font-weight: bold;
        font-size: 1.1rem;
        background-color: var(--accent-subtle);
        color: var(--accent-color);
        box-shadow: 0 0 8px rgba(0, 255, 135, 0.2);
        transition: all 0.3s ease;
    }
    
    /* Top 3 avec médailles */
    .stock-card:nth-child(1) .rank {
        background: linear-gradient(135deg, #FFD700, #FFA500);
        color: #000;
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
        font-size: 1.2rem;
    }
    
    .stock-card:nth-child(2) .rank {
        background: linear-gradient(135deg, #E5E5E5, #C0C0C0);
        color: #000;
        box-shadow: 0 0 18px rgba(192, 192, 192, 0.6);
    }
    
    .stock-card:nth-child(3) .rank {
        background: linear-gradient(135deg, #CD7F32, #B87333);
        color: #FFF;
        box-shadow: 0 0 16px rgba(205, 127, 50, 0.6);
    }
    
    /* Badges améliorés */
    .ter-badge, .aum-badge {
        padding: 3px 10px;
        border-radius: 6px;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: inline-block;
        line-height: 1;
    }
    
    .ter-badge {
        background: rgba(255, 193, 7, 0.2);
        color: #FFC107;
        border: 1px solid rgba(255, 193, 7, 0.3);
    }
    
    .aum-badge {
        background: rgba(0, 212, 255, 0.2);
        color: #00D4FF;
        border: 1px solid rgba(0, 212, 255, 0.3);
    }
    
    /* Score en mode balanced */
    .mc-score-badge {
        background: linear-gradient(135deg, rgba(0, 255, 255, 0.15), rgba(0, 255, 255, 0.05));
        border: 1px solid rgba(0, 255, 255, 0.4);
        padding: 5px 12px;
        border-radius: 8px;
        font-weight: 700;
        margin-top: 8px;
        font-size: 0.9rem;
    }
    
    /* Pills sélectionnées avec effet cyan */
    #etf-mc-section .mc-pill {
        transition: all 0.2s ease;
        user-select: none;
    }
    
    #etf-mc-section .mc-pill.is-checked {
        background: rgba(0, 255, 255, 0.2) !important;
        border-color: #00ffff !important;
        box-shadow: 0 0 12px rgba(0, 255, 255, 0.3);
        transform: translateY(-1px);
    }
    
    #etf-mc-section .mc-pill:hover {
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(0, 255, 255, 0.2);
    }
    
    /* Inputs améliorés */
    #etf-mc-section .mini-select,
    #etf-mc-section .mini-input {
        transition: all 0.2s ease;
        background: rgba(0, 255, 255, 0.05);
        color: #fff;
    }
    
    #etf-mc-section .mini-select:focus,
    #etf-mc-section .mini-input:focus {
        border-color: #00ffff;
        box-shadow: 0 0 0 3px rgba(0, 255, 255, 0.2);
        outline: none;
        background: rgba(0, 255, 255, 0.08);
    }
    
    /* Toggle leveraged/inverse */
    .lev-toggle-container {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255, 50, 50, 0.05);
        border: 1px solid rgba(255, 50, 50, 0.2);
        border-radius: 8px;
        margin-top: 8px;
    }
    
    .lev-toggle-container:has(input:checked) {
        background: rgba(255, 50, 50, 0.1);
        border-color: rgba(255, 50, 50, 0.3);
    }
    
    /* Nouvelles métriques avec couleurs distinctes */
    .metric-quality { color: #9333ea; }
    .metric-sharpe { color: #06b6d4; }
    .metric-yield-net { color: #84cc16; }
    
    /* Animation de chargement améliorée */
    @keyframes shimmer {
        0% { background-position: -1000px 0; }
        100% { background-position: 1000px 0; }
    }
    
    .loading-shimmer {
        background: linear-gradient(90deg, 
            rgba(0, 255, 255, 0.05) 0%,
            rgba(0, 255, 255, 0.1) 50%,
            rgba(0, 255, 255, 0.05) 100%);
        background-size: 1000px 100%;
        animation: shimmer 2s infinite;
    }
    
    /* Responsive pour mobile */
    @media (max-width: 768px) {
        #etf-mc-results .stock-cards-container {
            grid-template-columns: 1fr;
        }
        
        #etf-mc-results .stock-performance .flex {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    `;
    document.head.appendChild(etfMcStyles);
}

// 2. Améliorer l'interface HTML (ajouter les contrôles manquants)
document.addEventListener('DOMContentLoaded', function() {
    
    // Vérifier et ajouter les nouvelles métriques si elles n'existent pas
    const metricsContainer = document.querySelector('#etf-mc-section fieldset:first-of-type .flex.flex-wrap');
    
    if (metricsContainer) {
        // Nouvelles métriques à ajouter
        const newMetrics = [
            { id: 'yield_net', label: 'Yield net ↑', checked: false },
            { id: 'sharpe_proxy', label: 'R/Vol ↑', checked: true },
            { id: 'quality', label: 'Qualité ↑', checked: false }
        ];
        
        newMetrics.forEach(metric => {
            if (!document.getElementById(`etf-m-${metric.id}`)) {
                const label = document.createElement('label');
                label.className = 'mc-pill';
                label.innerHTML = `
                    <input id="etf-m-${metric.id}" type="checkbox" ${metric.checked ? 'checked' : ''}>
                    ${metric.label}
                `;
                metricsContainer.appendChild(label);
            }
        });
        
        // Retirer les métriques qui n'existent pas dans les données
        const toRemove = ['tracking_error', 'sharpe']; // sharpe devient sharpe_proxy
        toRemove.forEach(id => {
            const elem = document.getElementById(`etf-m-${id}`);
            if (elem) elem.closest('.mc-pill')?.remove();
        });
    }
    
    // Ajouter le toggle Leveraged/Inverse s'il n'existe pas
    const filtersFieldset = document.querySelector('#etf-mc-section fieldset:last-of-type');
    if (filtersFieldset && !document.getElementById('etf-filter-leveraged')) {
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'lev-toggle-container';
        toggleContainer.innerHTML = `
            <input id="etf-filter-leveraged" type="checkbox" checked class="accent-red-500">
            <label for="etf-filter-leveraged" class="text-sm font-medium">
                Exclure ETFs Leveraged/Inverse
            </label>
            <span class="text-xs opacity-60 ml-2">(recommandé)</span>
        `;
        filtersFieldset.appendChild(toggleContainer);
    }
    
    // Ajouter un slider pour la qualité minimale
    if (!document.getElementById('etf-filter-quality')) {
        const qualityControl = document.createElement('div');
        qualityControl.className = 'flex gap-2 items-center mt-2';
        qualityControl.innerHTML = `
            <label class="text-xs opacity-70 min-w-[60px]">Qualité min:</label>
            <input id="etf-filter-quality" type="range" min="0" max="100" value="80" 
                   class="flex-1" style="accent-color: #00ffff;">
            <span id="quality-value" class="text-xs font-bold min-w-[30px]">80</span>
        `;
        
        const filtersContainer = document.querySelector('#etf-mc-section fieldset:last-of-type');
        if (filtersContainer) {
            filtersContainer.appendChild(qualityControl);
            
            // Listener pour mettre à jour la valeur affichée
            document.getElementById('etf-filter-quality')?.addEventListener('input', (e) => {
                document.getElementById('quality-value').textContent = e.target.value;
                if (window.ETF_MC) {
                    window.ETF_MC.state.filters.minQuality = parseInt(e.target.value);
                }
            });
        }
    }
    
    // Synchronisation des checkboxes avec les pills
    document.querySelectorAll('#etf-mc-section .mc-pill input').forEach(inp => {
        const label = inp.closest('.mc-pill');
        if (!label) return;
        
        const sync = () => {
            label.classList.toggle('is-checked', inp.checked);
        };
        inp.addEventListener('change', sync);
        sync(); // Sync initial
    });
    
    // Améliorer les tooltips
    const addTooltip = (element, text) => {
        element.setAttribute('title', text);
        element.style.cursor = 'help';
    };
    
    // Ajouter des tooltips aux métriques
    const tooltips = {
        'etf-m-ter': 'Total Expense Ratio - Frais annuels (plus bas = mieux)',
        'etf-m-aum': 'Assets Under Management - Taille du fonds en millions $',
        'etf-m-return_1d': 'Performance journalière en %',
        'etf-m-return_ytd': 'Performance depuis le début de l\'année',
        'etf-m-return_1y': 'Performance sur 1 an',
        'etf-m-volatility': 'Volatilité sur 3 ans (plus bas = moins risqué)',
        'etf-m-dividend_yield': 'Rendement en dividendes TTM',
        'etf-m-yield_net': 'Rendement net après frais (obligations)',
        'etf-m-sharpe_proxy': 'Ratio rendement/volatilité (plus haut = mieux)',
        'etf-m-quality': 'Score de qualité des données (0-100)'
    };
    
    Object.entries(tooltips).forEach(([id, text]) => {
        const elem = document.getElementById(id);
        if (elem) {
            const label = elem.closest('.mc-pill');
            if (label) addTooltip(label, text);
        }
    });
    
    // Ajouter un indicateur de chargement
    const addLoadingIndicator = () => {
        const resultsContainer = document.querySelector('#etf-mc-results');
        if (resultsContainer && !document.getElementById('mc-loading')) {
            const loader = document.createElement('div');
            loader.id = 'mc-loading';
            loader.className = 'hidden';
            loader.innerHTML = `
                <div class="loading-shimmer rounded-lg p-8 text-center">
                    <div class="inline-block">
                        <div class="loader"></div>
                        <p class="mt-4 text-cyan-400">Calcul en cours...</p>
                    </div>
                </div>
            `;
            resultsContainer.parentNode.insertBefore(loader, resultsContainer);
        }
    };
    
    addLoadingIndicator();
    
    // Override du bouton Apply pour afficher le loader
    const applyBtn = document.getElementById('etf-mc-apply');
    if (applyBtn) {
        const originalClick = applyBtn.onclick;
        applyBtn.onclick = function(e) {
            const loader = document.getElementById('mc-loading');
            const results = document.getElementById('etf-mc-results');
            
            if (loader) loader.classList.remove('hidden');
            if (results) results.classList.add('hidden');
            
            setTimeout(() => {
                if (originalClick) originalClick.call(this, e);
                if (window.ETF_MC) window.ETF_MC.calculate();
                
                if (loader) loader.classList.add('hidden');
                if (results) results.classList.remove('hidden');
            }, 300);
        };
    }
    
    // Améliorer l'accessibilité
    document.querySelectorAll('#etf-mc-section button').forEach(btn => {
        if (!btn.getAttribute('aria-label')) {
            const text = btn.textContent.trim();
            btn.setAttribute('aria-label', text);
        }
    });
    
    // Ajouter des raccourcis clavier
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter pour appliquer
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const applyBtn = document.getElementById('etf-mc-apply');
            if (applyBtn) applyBtn.click();
        }
        
        // Escape pour reset
        if (e.key === 'Escape') {
            const resetBtn = document.getElementById('etf-mc-reset');
            if (resetBtn) resetBtn.click();
        }
    });
    
    console.log('✅ ETF MC Integration v3.1 - Contrôles avancés, tooltips, et améliorations UX');
});
