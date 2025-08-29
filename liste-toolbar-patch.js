/**
 * Patch pour séparer les toolbars Top 10 et A→Z
 * SIMPLIFIÉ - Utilise la toolbar existante pour A→Z
 */

// États séparés pour A→Z
window.azScope = 'GLOBAL';
window.azSelectedRegions = new Set(['GLOBAL']);

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
        if (!hint) return;
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
function setupEventListeners() {
    // Listener A→Z
    window.addEventListener('azFiltersChanged', function(e) {
        const {scope} = e.detail;
        window.azScope = scope || 'GLOBAL';
        if (typeof window.loadAZDataForCurrentSelection === 'function') {
            window.loadAZDataForCurrentSelection(true);
        }
    });
}

// Initialisation
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            initAZToolbar();
            setupEventListeners();
        }, 100);
    });
} else {
    setTimeout(() => {
        initAZToolbar();
        setupEventListeners();
    }, 100);
}