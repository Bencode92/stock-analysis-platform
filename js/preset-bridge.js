/**
 * preset-bridge.js - Pont entre preset-ui et comparatif-status
 * Utilise les hooks exposés par comparatif-status.js
 */

(function() {
    'use strict';

    console.log('🌉 Bridge: Initialisation du pont presets...');

    // Attendre que les hooks du comparatif soient prêts
    function waitForComparatifHooks(callback, maxAttempts = 50) {
        let attempts = 0;
        
        const checkInterval = setInterval(() => {
            attempts++;
            
            if (window.__comparatifHooks && 
                window.__comparatifHooks.setComparison && 
                window.__comparatifHooks.setIntents) {
                clearInterval(checkInterval);
                console.log('✅ Bridge: Hooks du comparatif détectés !');
                callback();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.error('❌ Bridge: Timeout - Hooks du comparatif non trouvés');
            }
        }, 100);
    }

    // Créer une interface unifiée pour les presets
    function createPresetInterface() {
        // Vérifier que les hooks existent
        if (!window.__comparatifHooks) {
            console.error('❌ Bridge: window.__comparatifHooks non disponible !');
            return;
        }

        const originalHooks = window.__comparatifHooks;

        // Ajouter la méthode applyPreset que preset-ui cherche
        window.__comparatifHooks = {
            ...originalHooks,
            
            applyPreset: function(preset) {
                console.log('🎯 Bridge: Application du preset', preset.label);
                
                if (!preset) {
                    console.error('❌ Bridge: Preset invalide');
                    return;
                }

                try {
                    // 1. Appliquer les statuts à la comparaison
                    if (preset.statuts && preset.statuts.length > 0) {
                        console.log('📊 Bridge: Application des statuts:', preset.statuts);
                        originalHooks.setComparison(preset.statuts);
                    }

                    // 2. Appliquer les filtres d'intention
                    if (preset.intents) {
                        console.log('🎯 Bridge: Application des intentions:', preset.intents);
                        // Petit délai pour que la comparaison soit appliquée d'abord
                        setTimeout(() => {
                            originalHooks.setIntents(preset.intents);
                        }, 200);
                    }

                    console.log('✅ Bridge: Preset appliqué avec succès !');
                } catch (error) {
                    console.error('❌ Bridge: Erreur lors de l\'application du preset:', error);
                }
            },

            reset: function() {
                console.log('🔄 Bridge: Reset du comparatif');
                
                try {
                    // Vider la comparaison
                    originalHooks.setComparison([]);
                    
                    // Désactiver tous les filtres
                    originalHooks.setIntents({
                        veut_dividendes: false,
                        en_chomage: false,
                        prevoit_associes: 'non',
                        levee_fonds: 'non'
                    });
                    
                    console.log('✅ Bridge: Reset effectué');
                } catch (error) {
                    console.error('❌ Bridge: Erreur lors du reset:', error);
                }
            },

            isReady: () => true
        };

        console.log('✅ Bridge: Interface presets créée avec succès !');
        console.log('📋 Bridge: Méthodes disponibles:', Object.keys(window.__comparatifHooks));

        // Signaler que le bridge est prêt
        window.dispatchEvent(new Event('preset-bridge:ready'));
    }

    // Initialiser le bridge
    function initBridge() {
        console.log('🚀 Bridge: Démarrage...');
        
        waitForComparatifHooks(() => {
            createPresetInterface();
        });
    }

    // Auto-initialisation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBridge);
    } else {
        // DOM déjà chargé, attendre un peu que les autres scripts se chargent
        setTimeout(initBridge, 100);
    }

})();
