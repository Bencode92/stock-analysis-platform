/**
 * Patch minimal - Seulement les boutons de région, sans filtres pays/secteurs
 */

// États pour A→Z
window.azScope = 'GLOBAL';
window.azSelectedRegions = new Set(['GLOBAL']);

// Supprimer tous les containers de facettes au chargement
function removeAllFacets() {
    // Supprimer les containers de facettes s'ils existent
    const topFacets = document.getElementById('top-facets-container');
    const azFacets = document.getElementById('az-facets-container');
    
    if (topFacets) topFacets.remove();
    if (azFacets) azFacets.remove();
    
    // Supprimer tous les selects de type pays/secteurs
    document.querySelectorAll('select.pill').forEach(select => {
        select.remove();
    });
    
    // Supprimer les labels associés
    document.querySelectorAll('label').forEach(label => {
        if (label.textContent.includes('Pays') || label.textContent.includes('Secteurs')) {
            label.remove();
        }
    });
}

// Initialiser uniquement les boutons de région pour A→Z
function initAZToolbar() {
    const azBar = document.getElementById('az-toolbar');
    if (!azBar) return;

    const regionBtns = [...azBar.querySelectorAll('.az-regions .seg-btn')];
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
            
            window.azScope = computeAzScope();
            window.dispatchEvent(new CustomEvent('azFiltersChanged', {
                detail: { scope: window.azScope, regions: [...window.azSelectedRegions] }
            }));
        });
    });
}

// Event listener
window.addEventListener('azFiltersChanged', function(e) {
    const {scope} = e.detail;
    window.azScope = scope || 'GLOBAL';
    if (typeof window.loadAZDataForCurrentSelection === 'function') {
        window.loadAZDataForCurrentSelection(true);
    }
});

// Initialisation avec suppression des facettes
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        removeAllFacets();
        setTimeout(initAZToolbar, 100);
        // Nettoyer périodiquement au cas où d'autres scripts ajouteraient des éléments
        setInterval(removeAllFacets, 1000);
    });
} else {
    removeAllFacets();
    setTimeout(initAZToolbar, 100);
    // Nettoyer périodiquement
    setInterval(removeAllFacets, 1000);
}