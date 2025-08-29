/**
 * Patch pour séparer complètement les toolbars Top 10 et A→Z
 * À inclure après liste-script.js
 * MODIFIÉ : Suppression des sélecteurs pays/secteur (gérés par liste-toolbar-enhanced.js)
 */

// États séparés pour A→Z
window.azScope = 'GLOBAL';
window.azSelectedRegions = new Set(['GLOBAL']);

// Fonction pour reconstruire la toolbar du Top 10
function patchTopToolbar() {
    const toolbar = document.querySelector('.tp-toolbar');
    if (!toolbar) return;
    
    toolbar.id = 'top-toolbar';
    // Ne PAS ajouter les filtres ici, ils sont gérés par liste-toolbar-enhanced.js
}

// Fonction pour créer la toolbar A→Z
function createAZToolbar() {
    const searchContainer = document.querySelector('.search-container');
    if (!searchContainer) return;
    
    const azToolbar = document.createElement('div');
    azToolbar.id = 'az-toolbar';
    azToolbar.className = 'tp-toolbar';
    azToolbar.innerHTML = `
        <!-- Régions A→Z -->
        <div class="seg az-regions" role="tablist" aria-label="Régions (A→Z)">
            <button class="seg-btn" data-region="GLOBAL" aria-selected="true"><i class="fas fa-globe"></i>Global</button>
            <button class="seg-btn" data-region="US" aria-selected="false"><i class="fas fa-flag-usa"></i>US</button>
            <button class="seg-btn" data-region="EUROPE" aria-selected="false"><i class="fas fa-globe-europe"></i>Europe</button>
            <button class="seg-btn" data-region="ASIA" aria-selected="false"><i class="fas fa-globe-asia"></i>Asie</button>
        </div>

        <!-- Le conteneur pour les facettes sera ajouté par liste-toolbar-enhanced.js -->

        <div class="toolbar-hint" id="az-hint"><span>GLOBAL exclusif</span></div>
    `;
    
    // Insérer avant la barre de recherche
    searchContainer.parentNode.insertBefore(azToolbar, searchContainer);
}

// Initialiser les toolbars A→Z
function initAZToolbar() {
    const azBar = document.getElementById('az-toolbar');
    if (!azBar) return;

    const regionBtns = [...azBar.querySelectorAll('.az-regions .seg-btn')];
    const hint = document.getElementById('az-hint');
    const REGION_ORDER = ['US','EUROPE','ASIA'];
    const COMBO_MAP = {
        'US,EUROPE':'US_EUROPE',
        'US,ASIA':'US_ASIA',
        'EUROPE,ASIA':'EUROPE_ASIA'
    };

    function computeAzScope() {
        if (window.azSelectedRegions.has('GLOBAL') || window.azSelectedRegions.size === 0) return 'GLOBAL';
        if (window.azSelectedRegions.size === 1) return [...window.azSelectedRegions][0];
        const arr = [...window.azSelectedRegions].sort((a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b));
        return COMBO_MAP[`${arr[0]},${arr[1]}`] || 'GLOBAL';
    }
    
    function updateHint() {
        const key = computeAzScope();
        hint.textContent = key === 'GLOBAL' ? 'GLOBAL exclusif' : 
            (window.azSelectedRegions.size === 1 ? `${[...window.azSelectedRegions][0]} uniquement` : 'Combo régional');
    }

    regionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const region = btn.dataset.region;

            if (region === 'GLOBAL') {
                window.azSelectedRegions = new Set(['GLOBAL']);
                regionBtns.forEach(b => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
            } else {
                if (window.azSelectedRegions.has('GLOBAL')) {
                    window.azSelectedRegions.delete('GLOBAL');
                    azBar.querySelector('.seg-btn[data-region="GLOBAL"]').setAttribute('aria-selected','false');
                }
                
                if (window.azSelectedRegions.has(region)) {
                    window.azSelectedRegions.delete(region);
                    btn.setAttribute('aria-selected','false');
                } else {
                    if (window.azSelectedRegions.size >= 2) {
                        btn.style.animation = 'pulse .3s';
                        setTimeout(() => btn.style.animation = '', 300);
                        return;
                    }
                    window.azSelectedRegions.add(region);
                    btn.setAttribute('aria-selected','true');
                }
                
                if (window.azSelectedRegions.size === 0) {
                    window.azSelectedRegions.add('GLOBAL');
                    azBar.querySelector('.seg-btn[data-region="GLOBAL"]').setAttribute('aria-selected','true');
                }
            }
            
            updateHint();
            window.azScope = computeAzScope();
            window.dispatchEvent(new CustomEvent('azFiltersChanged', {
                detail: { scope: window.azScope, regions: [...window.azSelectedRegions] }
            }));
        });
    });

    updateHint();
}

// Remplacer les listeners existants
function replaceEventListeners() {
    // Supprimer l'ancien listener unifié
    const oldListener = window.topFiltersChangedHandler;
    if (oldListener) {
        window.removeEventListener('topFiltersChanged', oldListener);
    }
    
    // Nouveau listener Top 10
    window.addEventListener('top10FiltersChanged', function(e) {
        const {scope, direction, timeframe} = e.detail;
        window.topScope = scope || 'GLOBAL';
        if (typeof window.renderTop === 'function') {
            window.renderTop();
        }
    });
    
    // Nouveau listener A→Z
    window.addEventListener('azFiltersChanged', function(e) {
        const {scope} = e.detail;
        window.azScope = scope || 'GLOBAL';
        if (typeof window.loadAZDataForCurrentSelection === 'function') {
            window.loadAZDataForCurrentSelection(true);
        }
    });
}

// Initialisation au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            patchTopToolbar();
            createAZToolbar();
            initAZToolbar();
            replaceEventListeners();
        }, 100);
    });
} else {
    setTimeout(() => {
        patchTopToolbar();
        createAZToolbar();
        initAZToolbar();
        replaceEventListeners();
    }, 100);
}