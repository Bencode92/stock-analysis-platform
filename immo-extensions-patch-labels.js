/**
 * immo-extensions-patch-labels.js
 * Patch pour harmoniser les libellés "Cash-flow" dans l'interface
 * À charger APRÈS immo-extensions.js
 */

(function() {
    // Attendre que ImmoExtensions soit chargé
    if (typeof ImmoExtensions === 'undefined') {
        console.warn('ImmoExtensions doit être chargé avant le patch labels');
        return;
    }

    console.log('Patch libellés Cash-flow activé');

    // Correction 1 : Patch DOM pour corriger les libellés dans le comparatif
    function corrigerLibellesComparatif() {
        // Corriger tous les libellés "cashflow" mal orthographiés
        document.querySelectorAll('.comparison-table td:first-child').forEach(td => {
            const txt = td.textContent.trim().toLowerCase();
            
            // Harmoniser tous les variants de "cashflow"
            if (txt === 'cashflow-avant-impôts' || 
                txt === 'cashflow avant impôts' || 
                txt === 'cash flow avant impôts' ||
                txt === 'cashflow avant impot' ||
                txt === 'cashflow-avant-impôt') {
                td.textContent = 'Cash-flow avant impôt';
            }
            
            // Harmoniser "cash-flow après impôt" aussi
            if (txt === 'cashflow après impôts' ||
                txt === 'cashflow-après-impôts' ||
                txt === 'cash flow après impôts' ||
                txt === 'cashflow après impot') {
                td.textContent = 'Cash-flow après impôt';
            }
            
            // Harmoniser "cash-flow"
            if (txt === 'cashflow' || txt === 'cash flow') {
                td.textContent = 'Cash-flow';
            }
        });
    }

    // Étendre la fonction etendreAffichageResultats pour ajouter la correction
    const originalEtendreAffichageResultats = window.etendreAffichageResultats;
    
    // Créer une nouvelle fonction qui wrap l'originale
    window.etendreAffichageResultats = function() {
        // Si une fonction originale existe, l'appeler
        if (originalEtendreAffichageResultats) {
            originalEtendreAffichageResultats.apply(this, arguments);
        }
        
        // Récupérer la fonction d'origine
        const afficherResultatsOriginal = window.afficherResultats;
        
        // Si la fonction existe, l'étendre
        if (typeof afficherResultatsOriginal === 'function') {
            window.afficherResultats = function(resultats) {
                // Appeler d'abord la fonction originale
                afficherResultatsOriginal(resultats);
                
                // Corriger les libellés après le rendu DOM
                setTimeout(corrigerLibellesComparatif, 100);
                
                // Ajouter nos extensions si elles existent
                if (typeof ajouterRecapHypotheses === 'function') {
                    ajouterRecapHypotheses(resultats);
                }
                if (typeof ajouterIndicateursVisuels === 'function') {
                    ajouterIndicateursVisuels(resultats);
                }
                if (typeof mettreAJourAffichageFiscal === 'function') {
                    mettreAJourAffichageFiscal();
                }
            };
        }
    };

    // Correction 2 : Override de la fonction afficherResultatsScenarios
    // pour harmoniser le libellé dans les projections
    const originalAfficherResultatsScenarios = window.afficherResultatsScenarios;
    
    if (originalAfficherResultatsScenarios) {
        // On doit redéfinir toute la partie qui génère le tableau
        // mais en changeant seulement le libellé problématique
        window.afficherResultatsScenarios = function(resultatsClassique, resultatsEncheres, horizon) {
            const container = document.getElementById('resultats-scenarios');
            if (!container) return;
            
            // Appeler la fonction originale
            originalAfficherResultatsScenarios(resultatsClassique, resultatsEncheres, horizon);
            
            // Puis corriger le libellé spécifique après le rendu
            setTimeout(() => {
                document.querySelectorAll('.comparison-table td').forEach(td => {
                    if (td.textContent === 'Cash-flows cumulés AVANT impôt') {
                        td.textContent = 'Cash-flow avant impôt (cumulé)';
                    }
                    if (td.textContent === 'Cash-flows cumulés APRÈS impôt') {
                        td.textContent = 'Cash-flow après impôt (cumulé)';
                    }
                });
            }, 50);
        };
    }

    // Observer les changements DOM pour appliquer les corrections
    // au cas où le contenu serait généré dynamiquement
    const observer = new MutationObserver(function(mutations) {
        let shouldCorrect = false;
        
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && // Element node
                        (node.classList && node.classList.contains('comparison-table') ||
                         node.querySelector && node.querySelector('.comparison-table'))) {
                        shouldCorrect = true;
                    }
                });
            }
        });
        
        if (shouldCorrect) {
            setTimeout(corrigerLibellesComparatif, 50);
        }
    });

    // Observer le body pour les changements
    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Appliquer la correction immédiatement si des éléments existent déjà
    if (document.readyState === 'complete') {
        corrigerLibellesComparatif();
    } else {
        document.addEventListener('DOMContentLoaded', corrigerLibellesComparatif);
    }

    console.log('✅ Patch harmonisation libellés Cash-flow installé');
})();
