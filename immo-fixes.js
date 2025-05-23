/**
 * immo-fixes.js - Correctifs pour le simulateur d'investissement immobilier
 * 
 * Ce script contient les correctifs pour résoudre les problèmes d'affichage:
 * 1. Suppression des boutons "Comprendre le cash-flow" en double
 * 2. Correction du centrage des onglets et sections
 * 3. Optimisation de l'interface pour une meilleure expérience utilisateur
 * 4. Correction du bug de duplication des unités (€, €/m², etc.)
 * 
 * Version 2.2 - Fix complet pour la duplication des unités
 */

// === FIX IMMÉDIAT AU CHARGEMENT ===
(function() {
    console.log('🚀 Application immédiate du fix de duplication');
    
    // Fonction pour nettoyer immédiatement
    function cleanupImmediate() {
        // Nettoyer les form-addon-text en double
        document.querySelectorAll('.form-input-wrapper').forEach(wrapper => {
            const addons = wrapper.querySelectorAll('.form-addon-text');
            if (addons.length > 1) {
                console.log(`🧹 Suppression de ${addons.length - 1} doublons dans`, wrapper);
                for (let i = 1; i < addons.length; i++) {
                    addons[i].remove();
                }
            }
        });
        
        // Nettoyer les info-tooltips en double
        document.querySelectorAll('.form-label').forEach(label => {
            const tooltips = label.querySelectorAll('.info-tooltip, i.fas.fa-info-circle');
            if (tooltips.length > 1) {
                console.log(`🧹 Suppression de ${tooltips.length - 1} infobulles en double`);
                for (let i = 1; i < tooltips.length; i++) {
                    tooltips[i].remove();
                }
            }
        });
    }
    
    // Nettoyer immédiatement
    cleanupImmediate();
    
    // Nettoyer encore après un court délai
    setTimeout(cleanupImmediate, 100);
    setTimeout(cleanupImmediate, 500);
    setTimeout(cleanupImmediate, 1000);
})();

document.addEventListener('DOMContentLoaded', function() {
    // S'assurer que le DOM est chargé
    
    // 1. Ajouter les styles CSS pour le centrage et l'optimisation
    ajouterStylesCentrage();
    ajouterStylesOptimisation();
    ajouterStylesAntiDuplication();
    
    // 2. Attendre que le simulateur et l'interface soient chargés
    const checkComponents = setInterval(function() {
        if (window.simulateur) {
            clearInterval(checkComponents);
            
            // 3. Appliquer les correctifs après un court délai
            setTimeout(appliquerCorrectifs, 500);
            setTimeout(appliquerOptimisations, 600);
            
            // 4. Initialiser le fix pour les unités avec plus d'agressivité
            initializeUnitsProtection();
        }
    }, 100);
    
    // Délai maximum de 5 secondes
    setTimeout(function() {
        clearInterval(checkComponents);
        console.warn("Délai d'attente dépassé pour l'application des correctifs");
    }, 5000);
});

/**
 * Ajoute des styles pour empêcher visuellement les doublons
 */
function ajouterStylesAntiDuplication() {
    const styleElement = document.createElement('style');
    styleElement.id = 'anti-duplication-styles';
    styleElement.innerHTML = `
        /* Masquer les doublons visuellement comme protection supplémentaire */
        .form-input-wrapper .form-addon-text:not(:first-of-type) {
            display: none !important;
        }
        
        .form-label .info-tooltip:not(:first-of-type),
        .form-label i.fa-info-circle:not(:first-of-type) {
            display: none !important;
        }
        
        /* S'assurer que les unités sont bien positionnées */
        .form-input-wrapper {
            position: relative !important;
        }
        
        .form-addon-text {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            pointer-events: none;
            opacity: 0.7;
            background: transparent;
            padding: 0 4px;
            font-size: 0.875rem;
            color: rgba(255, 255, 255, 0.7);
            z-index: 1;
        }
        
        /* Fix pour les icônes info */
        .info-tooltip i {
            pointer-events: none;
        }
    `;
    document.head.appendChild(styleElement);
}

/**
 * Ajoute les styles CSS pour corriger le centrage
 */
function ajouterStylesCentrage() {
    const styleElement = document.createElement('style');
    styleElement.id = 'immo-fixes-styles';
    styleElement.innerHTML = `
        /* Style pour corriger l'alignement des onglets et sections */
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 1.5rem 1rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .card {
            width: 100%;
            max-width: 1100px;
            margin-left: auto;
            margin-right: auto;
        }

        .tabs {
            display: flex;
            justify-content: center;
            width: 100%;
        }

        .grid {
            width: 100%;
        }

        .btn-simulate {
            margin: 0 auto;
            display: block;
        }
    `;
    document.head.appendChild(styleElement);
}

/**
 * Ajoute les styles CSS pour optimiser l'interface
 */
function ajouterStylesOptimisation() {
    const styleElement = document.createElement('style');
    styleElement.id = 'immo-optimization-styles';
    styleElement.innerHTML = `
        /* === OPTIMISATIONS D'INTERFACE === */
        
        /* Titre plus compact */
        .page-title h1 {
            font-size: 1.75rem !important;
            margin-bottom: 0.5rem !important;
        }
        
        .page-title .subtitle {
            font-size: 0.95rem !important;
        }
        
        /* Bannière d'info compacte */
        .mode-info-banner {
            padding: 0.75rem 1rem !important;
            margin-bottom: 1.5rem !important;
        }
        
        .mode-info-icon {
            width: 32px !important;
            height: 32px !important;
            font-size: 1rem !important;
        }
        
        .mode-info-content h3 {
            font-size: 0.95rem !important;
            margin-bottom: 0.25rem !important;
        }
        
        .mode-info-content p {
            font-size: 0.875rem !important;
            line-height: 1.4 !important;
        }
        
        /* Formulaires compacts */
        .form-group {
            margin-bottom: 1.25rem !important;
        }
        
        .form-label {
            font-size: 0.875rem !important;
            margin-bottom: 0.5rem !important;
        }
        
        /* Masquer les infobulles redondantes */
        .form-label .info-tooltip:not(:first-of-type) {
            display: none !important;
        }
        
        .form-input {
            padding: 0.625rem 0.875rem !important;
            font-size: 0.95rem !important;
            min-height: 38px !important;
        }
        
        /* Sélecteur de ville optimisé */
        .ville-info-selected {
            padding: 1rem !important;
            margin-top: 0.5rem !important;
        }
        
        .ville-info-selected h4 {
            font-size: 1rem !important;
            margin-bottom: 0.5rem !important;
        }
        
        /* Boutons de type de logement */
        .piece-selector {
            gap: 0.5rem !important;
            margin-top: 0.75rem !important;
        }
        
        .piece-btn {
            padding: 0.5rem 0.75rem !important;
            font-size: 0.875rem !important;
            flex: 1 !important;
        }
        
        /* Mode de calcul compact */
        .calculation-mode-container {
            gap: 0.75rem !important;
            margin-bottom: 1rem !important;
        }
        
        .mode-card {
            padding: 0.875rem !important;
            min-height: auto !important;
        }
        
        .mode-icon {
            width: 32px !important;
            height: 32px !important;
            font-size: 1rem !important;
            margin-bottom: 0.5rem !important;
        }
        
        .mode-content h4 {
            font-size: 0.95rem !important;
        }
        
        .mode-content p {
            font-size: 0.8rem !important;
        }
        
        /* Boutons optimisés */
        .btn {
            padding: 0.625rem 1.25rem !important;
            font-size: 0.95rem !important;
        }
        
        .btn-simulate {
            padding: 0.75rem 1.5rem !important;
            font-size: 1rem !important;
        }
        
        /* Espacement des cartes */
        .card {
            margin-bottom: 1.5rem !important;
        }
        
        .card-header {
            padding: 1rem 1.25rem !important;
        }
        
        .card > div:not(.card-header) {
            padding: 1.25rem !important;
        }
        
        /* Grille optimisée */
        .grid {
            gap: 1rem !important;
            padding: 0 !important;
        }
        
        /* Message d'info compact */
        .info-message {
            padding: 0.75rem 1rem !important;
            margin-bottom: 1rem !important;
            font-size: 0.875rem !important;
        }
        
        /* Masquer les éléments redondants */
        .form-help {
            font-size: 0.75rem !important;
            margin-top: 0.25rem !important;
        }
        
        /* Mobile responsive */
        @media (max-width: 768px) {
            .container {
                margin-left: 0 !important;
                margin-top: 60px !important;
                padding: 1rem !important;
            }
            
            .page-title h1 {
                font-size: 1.5rem !important;
            }
            
            .grid-2 {
                grid-template-columns: 1fr !important;
            }
            
            .calculation-mode-container {
                grid-template-columns: 1fr !important;
            }
        }
        
        /* Animations subtiles */
        .form-input {
            transition: all 0.2s ease !important;
        }
        
        .form-input:focus {
            transform: translateY(-1px);
        }
        
        .piece-btn, .mode-card {
            transition: all 0.2s ease !important;
        }
        
        .piece-btn:hover, .mode-card:hover {
            transform: translateY(-1px);
        }
    `;
    document.head.appendChild(styleElement);
}

/**
 * Applique les correctifs pour l'interface
 */
function appliquerCorrectifs() {
    console.log("Application des correctifs pour le simulateur immobilier");
    
    // 1. Corriger la duplication des boutons "Comprendre le cash-flow"
    corrigerBoutonsCashFlow();
    
    // 2. NE PAS convertir le mode de calcul - il est déjà géré par le CSS et HTML existant
    // La fonction convertirModeCalculEnCartes a été supprimée
    
    console.log("Correctifs appliqués avec succès");
}

/**
 * Applique les optimisations d'interface
 */
function appliquerOptimisations() {
    console.log("Application des optimisations d'interface");
    
    // 1. Supprimer les infobulles redondantes
    nettoyerInfobullesRedondantes();
    
    // 2. Ajuster la hauteur des champs
    ajusterHauteurChamps();
    
    // 3. Optimiser l'espacement
    optimiserEspacement();
    
    // 4. Améliorer la bannière d'info
    ameliorerBanniere();
    
    // 5. Améliorer le sélecteur de ville
    ameliorerSelecteurVille();
    
    // 6. Nettoyer les messages d'info redondants
    nettoyerMessagesRedondants();
    
    // 7. Optimiser pour mobile
    optimiserPourMobile();
    
    console.log("Optimisations appliquées avec succès");
}

/**
 * Corrige la duplication des boutons "Comprendre le cash-flow"
 */
function corrigerBoutonsCashFlow() {
    // Supprimer les boutons en double
    const buttons = document.querySelectorAll('button[id^="btn-show-explanation"], button[id^="btn-guide-cashflow"]');
    if (buttons.length > 1) {
        // Garder seulement le premier bouton
        for (let i = 1; i < buttons.length; i++) {
            buttons[i].remove();
        }
        console.log("Boutons en double supprimés");
    }
}

/**
 * Nettoie les infobulles redondantes
 */
function nettoyerInfobullesRedondantes() {
    const labels = document.querySelectorAll('.form-label');
    labels.forEach(label => {
        const tooltips = label.querySelectorAll('.info-tooltip');
        if (tooltips.length > 1) {
            // Garder seulement la première infobulle
            for (let i = 1; i < tooltips.length; i++) {
                tooltips[i].remove();
            }
        }
    });
    console.log("Infobulles redondantes supprimées");
}

/**
 * Ajuste la hauteur des champs
 */
function ajusterHauteurChamps() {
    const inputs = document.querySelectorAll('.form-input');
    inputs.forEach(input => {
        input.style.minHeight = '38px';
    });
}

/**
 * Optimise l'espacement
 */
function optimiserEspacement() {
    // Réduire l'espacement entre les form-groups
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        if (!group.style.marginBottom || group.style.marginBottom === '1.5rem') {
            group.style.marginBottom = '1.25rem';
        }
    });
}

/**
 * Améliore la bannière d'info
 */
function ameliorerBanniere() {
    const banner = document.querySelector('.mode-info-banner');
    if (banner) {
        banner.style.padding = '0.75rem 1rem';
        
        const icon = banner.querySelector('.mode-info-icon');
        if (icon) {
            icon.style.width = '32px';
            icon.style.height = '32px';
        }
    }
}

/**
 * Améliore le sélecteur de ville
 */
function ameliorerSelecteurVille() {
    const villeSelectedInfo = document.getElementById('ville-selected-info');
    if (villeSelectedInfo) {
        villeSelectedInfo.style.marginTop = '0.5rem';
        villeSelectedInfo.style.padding = '1rem';
    }
}

/**
 * Nettoie les messages redondants
 */
function nettoyerMessagesRedondants() {
    const infoMessages = document.querySelectorAll('.info-message');
    const uniqueMessages = new Set();
    
    infoMessages.forEach(msg => {
        const content = msg.textContent.trim();
        if (uniqueMessages.has(content)) {
            msg.remove();
        } else {
            uniqueMessages.add(content);
        }
    });
}

/**
 * Optimise pour mobile
 */
function optimiserPourMobile() {
    if (window.innerWidth <= 768) {
        // Ajuster la grille
        const grids = document.querySelectorAll('.grid-2');
        grids.forEach(grid => {
            grid.style.gridTemplateColumns = '1fr';
            grid.style.gap = '0.75rem';
        });
        
        // Ajuster les marges du conteneur
        const container = document.querySelector('.container');
        if (container) {
            container.style.marginLeft = '0';
            container.style.marginTop = '60px';
            container.style.padding = '1rem';
        }
    }
}

// Réappliquer les optimisations lors du redimensionnement
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        optimiserPourMobile();
    }, 250);
});

// === FIX RENFORCÉ POUR LE BUG DE DUPLICATION DES UNITÉS ===

/**
 * Nettoie tous les doublons d'unités et d'icônes de manière agressive
 */
function cleanupDuplicateUnits() {
    // Nettoyer tous les form-addon-text en double
    document.querySelectorAll('.form-input-wrapper').forEach(wrapper => {
        const addons = wrapper.querySelectorAll('.form-addon-text');
        // Garder seulement le premier, supprimer les autres
        if (addons.length > 1) {
            console.log(`🧹 Nettoyage de ${addons.length - 1} unités en double`);
            for (let i = 1; i < addons.length; i++) {
                addons[i].remove();
            }
        }
    });
    
    // Nettoyer les info-tooltips en double (icônes "i")
    document.querySelectorAll('.form-label').forEach(label => {
        const tooltips = label.querySelectorAll('.info-tooltip');
        if (tooltips.length > 1) {
            for (let i = 1; i < tooltips.length; i++) {
                tooltips[i].remove();
            }
        }
        
        // Nettoyer aussi les icônes orphelines
        const icons = label.querySelectorAll('i.fa-info-circle');
        if (icons.length > 1) {
            for (let i = 1; i < icons.length; i++) {
                icons[i].remove();
            }
        }
    });
}

/**
 * Protection complète contre les duplications
 */
function initializeUnitsProtection() {
    console.log('🛡️ Initialisation de la protection anti-duplication');
    
    // Nettoyer immédiatement
    cleanupDuplicateUnits();
    
    // Remplacer toutes les fonctions qui pourraient ajouter des unités
    protectAgainstDuplication();
    
    // Observer les changements dans le DOM
    setupMutationObserver();
    
    // Nettoyer périodiquement
    setInterval(cleanupDuplicateUnits, 2000);
}

/**
 * Protège contre l'ajout de doublons en interceptant les méthodes DOM
 */
function protectAgainstDuplication() {
    // Sauvegarder les méthodes originales
    const originalAppendChild = Element.prototype.appendChild;
    const originalInsertBefore = Element.prototype.insertBefore;
    const originalInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
    
    // Remplacer appendChild
    Element.prototype.appendChild = function(child) {
        if (child && child.classList) {
            // Vérifier si c'est une unité
            if (child.classList.contains('form-addon-text')) {
                const existing = this.querySelector('.form-addon-text');
                if (existing) {
                    console.log('⚡ Blocage d\'ajout d\'unité en double');
                    return existing;
                }
            }
            // Vérifier si c'est une infobulle
            if (child.classList.contains('info-tooltip')) {
                const existing = this.querySelector('.info-tooltip');
                if (existing) {
                    console.log('⚡ Blocage d\'ajout d\'infobulle en double');
                    return existing;
                }
            }
        }
        return originalAppendChild.call(this, child);
    };
    
    // Remplacer insertBefore
    Element.prototype.insertBefore = function(newNode, referenceNode) {
        if (newNode && newNode.classList) {
            if (newNode.classList.contains('form-addon-text')) {
                const existing = this.querySelector('.form-addon-text');
                if (existing) {
                    console.log('⚡ Blocage d\'insertion d\'unité en double');
                    return existing;
                }
            }
            if (newNode.classList.contains('info-tooltip')) {
                const existing = this.querySelector('.info-tooltip');
                if (existing) {
                    console.log('⚡ Blocage d\'insertion d\'infobulle en double');
                    return existing;
                }
            }
        }
        return originalInsertBefore.call(this, newNode, referenceNode);
    };
}

/**
 * Configure un observateur de mutations plus agressif
 */
function setupMutationObserver() {
    const observer = new MutationObserver(function(mutations) {
        let shouldClean = false;
        
        mutations.forEach(function(mutation) {
            // Vérifier les nœuds ajoutés
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        // Vérifier si c'est un élément problématique
                        if (node.classList && (
                            node.classList.contains('form-addon-text') || 
                            node.classList.contains('info-tooltip'))) {
                            shouldClean = true;
                        }
                        // Vérifier aussi les enfants
                        if (node.querySelectorAll) {
                            const problematicElements = node.querySelectorAll('.form-addon-text, .info-tooltip');
                            if (problematicElements.length > 0) {
                                shouldClean = true;
                            }
                        }
                    }
                });
            }
        });
        
        if (shouldClean) {
            console.log('🔍 Duplication détectée, nettoyage...');
            setTimeout(cleanupDuplicateUnits, 50);
        }
    });
    
    // Observer tout le document
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });
    
    console.log('👁️ Observateur de mutations actif');
}

// Modifier la fonction simuler pour nettoyer avant chaque simulation
const originalSimuler = window.simuler;
window.simuler = function() {
    console.log('🧹 Nettoyage préventif avant simulation');
    
    // Triple nettoyage pour être sûr
    cleanupDuplicateUnits();
    setTimeout(cleanupDuplicateUnits, 10);
    setTimeout(cleanupDuplicateUnits, 100);
    
    // Appeler la fonction originale
    if (originalSimuler) {
        return originalSimuler.apply(this, arguments);
    }
};

// Fonction utilitaire globale pour réinitialiser
window.resetInterface = function() {
    console.log('🔄 Réinitialisation complète de l\'interface');
    
    // Nettoyage intensif
    for (let i = 0; i < 5; i++) {
        setTimeout(cleanupDuplicateUnits, i * 100);
    }
    
    console.log('✅ Interface réinitialisée');
};

// Nettoyer immédiatement au chargement
cleanupDuplicateUnits();
setTimeout(cleanupDuplicateUnits, 100);
setTimeout(cleanupDuplicateUnits, 500);
setTimeout(cleanupDuplicateUnits, 1000);
setTimeout(cleanupDuplicateUnits, 2000);