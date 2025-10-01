/**
 * preset-bridge.js - Pont entre preset-ui et comparatif-status
 * Expose le hook __comparatifHooks pour contrôler le comparateur
 */

(function() {
    'use strict';

    let isReady = false;

    // Attendre que le comparatif soit prêt
    function waitForComparatif(callback) {
        const checkInterval = setInterval(() => {
            // Vérifier que les éléments essentiels existent
            const header = document.querySelector('.comparatif-header');
            const intentFilters = document.querySelector('.intent-filters');
            
            if (header && intentFilters) {
                clearInterval(checkInterval);
                callback();
            }
        }, 100);

        // Timeout après 5 secondes
        setTimeout(() => clearInterval(checkInterval), 5000);
    }

    // Fonction pour cocher/décocher un filtre d'intention
    function setIntentFilter(intentKey, value) {
        // Map des clés vers les IDs des checkboxes
        const idMap = {
            'veut_dividendes': 'filter-dividendes',
            'en_chomage': 'filter-chomage',
            'prevoit_associes': 'filter-associes',
            'levee_fonds': 'filter-levee'
        };

        const checkboxId = idMap[intentKey];
        if (!checkboxId) return;

        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) return;

        // Déterminer si on doit cocher
        const shouldCheck = (value === true || value === 'oui');
        
        // Simuler un click si l'état doit changer
        if (checkbox.checked !== shouldCheck) {
            checkbox.click();
        }
    }

    // Fonction pour ajouter des statuts à la comparaison
    function addStatusToComparison(statutShortName) {
        const dropdown = document.getElementById('status-dropdown');
        if (!dropdown) return false;

        // Trouver l'option correspondante
        const option = Array.from(dropdown.options).find(opt => opt.value === statutShortName);
        if (!option) {
            console.warn(`Statut ${statutShortName} not found in dropdown`);
            return false;
        }

        // Sélectionner et déclencher le changement
        dropdown.value = statutShortName;
        dropdown.dispatchEvent(new Event('change'));
        
        return true;
    }

    // Fonction pour vider la comparaison
    function clearComparison() {
        const removeButtons = document.querySelectorAll('.comparison-item .remove-btn');
        removeButtons.forEach(btn => btn.click());
    }

    // Créer le hook
    function createHook() {
        window.__comparatifHooks = {
            applyPreset: function(preset) {
                console.log('Bridge: Applying preset', preset.label);

                // 1. Vider la comparaison actuelle
                clearComparison();

                // 2. Ajouter les statuts du preset
                setTimeout(() => {
                    (preset.statuts || []).forEach((sn, index) => {
                        setTimeout(() => {
                            addStatusToComparison(sn);
                        }, index * 100);
                    });
                }, 200);

                // 3. Appliquer les filtres d'intention
                if (preset.intents) {
                    setTimeout(() => {
                        Object.keys(preset.intents).forEach(key => {
                            setIntentFilter(key, preset.intents[key]);
                        });
                    }, 400);
                }

                console.log('Bridge: Preset applied successfully');
            },

            reset: function() {
                console.log('Bridge: Resetting comparator');

                // Vider la comparaison
                clearComparison();

                // Décocher tous les filtres d'intention
                ['veut_dividendes', 'en_chomage', 'prevoit_associes', 'levee_fonds'].forEach(key => {
                    setIntentFilter(key, false);
                });

                console.log('Bridge: Comparator reset');
            },

            isReady: () => isReady
        };

        isReady = true;
        console.log('Bridge: __comparatifHooks created and ready');

        // Signaler que le comparatif est prêt pour les presets
        window.dispatchEvent(new Event('comparatif:ready'));
    }

    // Initialiser le bridge
    function initBridge() {
        console.log('Bridge: Initializing preset bridge...');
        
        waitForComparatif(() => {
            createHook();
        });
    }

    // Auto-initialisation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBridge);
    } else {
        initBridge();
    }

})();
