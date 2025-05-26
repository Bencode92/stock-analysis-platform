/**
 * tooltip-fix.js - Corrige la duplication des icônes info
 */

document.addEventListener('DOMContentLoaded', function() {
    // Empêcher la duplication des tooltips
    const originalAddEventListener = Element.prototype.addEventListener;
    
    // Tracker pour éviter les duplications
    const tooltipElements = new WeakSet();
    
    // Observer pour nettoyer les doublons
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    // Nettoyer les tooltips dupliqués
                    const tooltips = node.querySelectorAll ? node.querySelectorAll('.info-tooltip') : [];
                    tooltips.forEach(function(tooltip) {
                        const parent = tooltip.parentElement;
                        if (parent) {
                            const allTooltips = parent.querySelectorAll('.info-tooltip');
                            if (allTooltips.length > 1) {
                                // Garder seulement le premier
                                for (let i = 1; i < allTooltips.length; i++) {
                                    allTooltips[i].remove();
                                }
                            }
                        }
                    });
                }
            });
        });
    });
    
    // Observer tout le document
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Fonction pour nettoyer les tooltips existants
    function cleanupDuplicateTooltips() {
        const labels = document.querySelectorAll('.form-label');
        labels.forEach(label => {
            const tooltips = label.querySelectorAll('.info-tooltip');
            if (tooltips.length > 1) {
                // Garder seulement le premier tooltip
                for (let i = 1; i < tooltips.length; i++) {
                    tooltips[i].remove();
                }
            }
        });
    }
    
    // Nettoyer au chargement
    cleanupDuplicateTooltips();
    
    // Nettoyer après chaque simulation
    const btnSimulate = document.getElementById('btn-simulate');
    if (btnSimulate) {
        btnSimulate.addEventListener('click', function() {
            setTimeout(cleanupDuplicateTooltips, 100);
        });
    }
});
