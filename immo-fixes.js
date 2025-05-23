/**
 * immo-fixes.js - Correctifs pour le simulateur d'investissement immobilier
 * 
 * Ce script contient les correctifs pour résoudre les problèmes d'affichage:
 * 1. Suppression des boutons "Comprendre le cash-flow" en double
 * 2. Correction du centrage des onglets et sections
 * 3. Optimisation de l'interface pour une meilleure expérience utilisateur
 * 4. Correction du bug de duplication des unités (€, €/m², etc.)
 * 
 * Version 2.1 - Ajout du fix pour la duplication des unités
 */

document.addEventListener('DOMContentLoaded', function() {
    // S'assurer que le DOM est chargé
    
    // 1. Ajouter les styles CSS pour le centrage et l'optimisation
    ajouterStylesCentrage();
    ajouterStylesOptimisation();
    
    // 2. Attendre que le simulateur et l'interface soient chargés
    const checkComponents = setInterval(function() {
        if (window.simulateur) {
            clearInterval(checkComponents);
            
            // 3. Appliquer les correctifs après un court délai
            setTimeout(appliquerCorrectifs, 500);
            setTimeout(appliquerOptimisations, 600);
            
            // 4. Initialiser le fix pour les unités
            initializeUnits();
        }
    }, 100);
    
    // Délai maximum de 5 secondes
    setTimeout(function() {
        clearInterval(checkComponents);
        console.warn("Délai d'attente dépassé pour l'application des correctifs");
    }, 5000);
});

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

// === FIX POUR LE BUG DE DUPLICATION DES UNITÉS ===

/**
 * Nettoie tous les doublons d'unités et d'icônes
 */
function cleanupDuplicateUnits() {
    // Nettoyer tous les form-addon-text en double
    document.querySelectorAll('.form-input-wrapper').forEach(wrapper => {
        const addons = wrapper.querySelectorAll('.form-addon-text');
        // Garder seulement le premier, supprimer les autres
        if (addons.length > 1) {
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
    });
}

/**
 * Initialise les unités proprement
 */
function initializeUnits() {
    // D'abord nettoyer les doublons existants
    cleanupDuplicateUnits();
    
    // Map des unités pour chaque champ
    const unitsMap = {
        'apport': '€',
        'prix-m2-marche': '€/m²',
        'loyer-m2': '€/m²/mois',
        'taux': '%',
        'duree': 'ans',
        'taxe-fonciere': '%',
        'vacance-locative': '%',
        'travaux-m2': '€/m²',
        'frais-bancaires-dossier': '€',
        'frais-bancaires-compte': '€',
        'frais-garantie': '%',
        'entretienAnnuel': '%',
        'assurancePNO': '€',
        'chargesNonRecuperables': '€/m²/an'
    };
    
    // Vérifier que chaque input a bien son unité
    Object.entries(unitsMap).forEach(([inputId, unit]) => {
        const input = document.getElementById(inputId);
        if (input) {
            const wrapper = input.closest('.form-input-wrapper');
            if (wrapper && !wrapper.querySelector('.form-addon-text')) {
                // Créer l'élément unité seulement s'il n'existe pas
                const unitElement = document.createElement('span');
                unitElement.className = 'form-addon-text';
                unitElement.textContent = unit;
                wrapper.appendChild(unitElement);
            }
        }
    });
}

// Modifier la fonction simuler pour nettoyer avant chaque simulation
const originalSimuler = window.simuler;
window.simuler = function() {
    console.log('🧹 Nettoyage des unités avant simulation');
    // Nettoyer les unités en double avant la simulation
    cleanupDuplicateUnits();
    
    // Appeler la fonction originale
    if (originalSimuler) {
        return originalSimuler.apply(this, arguments);
    }
};

// Observer les changements dans le DOM pour nettoyer automatiquement
const observer = new MutationObserver(function(mutations) {
    let shouldClean = false;
    mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.classList && 
                    (node.classList.contains('form-addon-text') || 
                     node.classList.contains('info-tooltip'))) {
                    shouldClean = true;
                }
            });
        }
    });
    
    if (shouldClean) {
        setTimeout(cleanupDuplicateUnits, 100);
    }
});

// Observer le formulaire principal
setTimeout(() => {
    const container = document.querySelector('.container');
    if (container) {
        observer.observe(container, {
            childList: true,
            subtree: true
        });
    }
}, 1000);

// Fonction utilitaire pour réinitialiser complètement l'interface
window.resetInterface = function() {
    console.log('🔄 Réinitialisation complète de l\'interface');
    
    // Nettoyer tous les doublons
    cleanupDuplicateUnits();
    
    // Réinitialiser les tooltips
    document.querySelectorAll('.info-tooltip').forEach(tooltip => {
        // S'assurer qu'il n'y a qu'une seule icône "i"
        if (!tooltip.querySelector('i.fa-info-circle')) {
            tooltip.innerHTML = '<i class="fas fa-info-circle"></i>';
        }
    });
    
    // Réinitialiser les positions CSS si nécessaire
    document.querySelectorAll('.form-input-wrapper').forEach(wrapper => {
        wrapper.style.position = 'relative';
    });
    
    console.log('✅ Interface réinitialisée');
};