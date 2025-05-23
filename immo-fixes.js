/**
 * immo-fixes.js - Correctifs pour le simulateur d'investissement immobilier
 * 
 * Ce script contient les correctifs pour résoudre les problèmes d'affichage:
 * 1. Suppression des boutons "Comprendre le cash-flow" en double
 * 2. Correction du centrage des onglets et sections
 * 3. Conversion du mode de calcul en système de cartes pour harmoniser l'UI
 * 4. Optimisation de l'interface pour une meilleure expérience utilisateur
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

        /* Styles pour les cartes du mode de calcul */
        .calculation-cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 1rem;
            width: 100%;
            justify-content: center;
            margin-top: 0.75rem;
        }

        .calculation-card {
            background-color: rgba(1, 42, 74, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 0.75rem;
            padding: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            outline: none;
        }

        .calculation-card:hover {
            border-color: var(--primary-color);
            box-shadow: 0 5px 15px rgba(0, 255, 135, 0.1);
            transform: translateY(-2px);
        }

        .calculation-card.active,
        .calculation-card[aria-checked="true"] {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px rgba(0, 255, 135, 0.3);
            background-color: rgba(0, 255, 135, 0.1);
        }

        .calculation-card h4 {
            font-size: 1.1rem;
            font-weight: 600;
            margin: 0.5rem 0;
        }

        .calculation-card p {
            margin: 0;
            font-size: 0.9rem;
            opacity: 0.8;
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
    
    // 2. Convertir le mode de calcul en système de cartes
    // Ajouter un délai pour s'assurer que le DOM est bien chargé
    setTimeout(convertirModeCalculEnCartes, 300);
    
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
 * Convertit le mode de calcul en système de cartes
 */
function convertirModeCalculEnCartes() {
    console.log("Tentative de conversion du mode de calcul en cartes");
    
    // Approche directe pour trouver le mode de calcul
    const calculationRadios = document.querySelectorAll('input[name="calculation-mode"]');
    if (!calculationRadios.length || document.getElementById('calculation-mode-cards')) {
        console.log("Pas de radio buttons trouvés ou déjà converti");
        return;
    }
    
    // Trouver le conteneur parent
    const modeCalculSection = calculationRadios[0].closest('.form-group');
    if (!modeCalculSection) {
        console.log("Section mode de calcul non trouvée");
        return;
    }
    
    console.log("Section mode de calcul trouvée, conversion en cours");
    
    // Déterminer quel mode est actif
    const modeLoyerMensualite = document.getElementById('mode-loyer-mensualite');
    const modeCashflowPositif = document.getElementById('mode-cashflow-positif');
    const modeActif = modeLoyerMensualite && modeLoyerMensualite.checked ? 'loyer-mensualite' : 'cashflow-positif';
    
    // Créer le nouveau contenu HTML directement
    const newContent = `
        <label class="form-label">Mode de calcul</label>
        
        <div id="calculation-mode-cards" class="calculation-cards-grid">
            <!-- Mode Loyer ≥ Mensualité -->
            <div class="calculation-card ${modeActif === 'loyer-mensualite' ? 'active' : ''}" data-mode="loyer-mensualite" role="radio" tabindex="0" aria-checked="${modeActif === 'loyer-mensualite' ? 'true' : 'false'}">
                <i class="fas fa-check-circle text-lg text-green-400"></i>
                <h4>Loyer ≥ Mensualité</h4>
                <p>Le loyer net couvre la mensualité du prêt</p>
            </div>
            
            <!-- Mode Cash-flow positif -->
            <div class="calculation-card ${modeActif === 'cashflow-positif' ? 'active' : ''}" data-mode="cashflow-positif" role="radio" tabindex="0" aria-checked="${modeActif === 'cashflow-positif' ? 'true' : 'false'}">
                <i class="fas fa-coins text-lg text-yellow-400"></i>
                <h4>Cash-flow positif</h4>
                <p>Toutes charges comprises (plus strict)</p>
            </div>
        </div>
        
        <div class="hidden">
            <input type="radio" name="calculation-mode" id="mode-loyer-mensualite" value="loyer-mensualite" ${modeActif === 'loyer-mensualite' ? 'checked' : ''}>
            <input type="radio" name="calculation-mode" id="mode-cashflow-positif" value="cashflow-positif" ${modeActif === 'cashflow-positif' ? 'checked' : ''}>
        </div>
        
        <div class="text-sm text-blue-300 mt-2 pl-2">
            <i class="fas fa-info-circle mr-1"></i>
            Choisissez le critère qui déterminera la surface maximale que vous pourrez acquérir.
        </div>
    `;
    
    // Remplacer tout le contenu de la section
    modeCalculSection.innerHTML = newContent;
    
    // Ajouter les écouteurs d'événements
    initialiserEvenementsModeCalculCartes();
    
    console.log('Mode de calcul converti en système de cartes');
}

/**
 * Initialise les écouteurs d'événements pour les cartes de mode de calcul
 */
function initialiserEvenementsModeCalculCartes() {
    const calculationModeCards = document.getElementById('calculation-mode-cards');
    if (!calculationModeCards) {
        console.log("Container des cartes de mode de calcul non trouvé");
        return;
    }
    
    calculationModeCards.querySelectorAll('.calculation-card').forEach(card => {
        card.addEventListener('click', function() {
            const mode = this.dataset.mode;
            console.log(`Carte de mode de calcul cliquée: ${mode}`);
            
            // Désactiver toutes les cartes
            calculationModeCards.querySelectorAll('.calculation-card').forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-checked', 'false');
            });
            
            // Activer la carte cliquée
            this.classList.add('active');
            this.setAttribute('aria-checked', 'true');
            
            // Mettre à jour les radio buttons cachés
            const radioButton = document.getElementById(`mode-${mode}`);
            if (radioButton) {
                radioButton.checked = true;
                
                // Déclencher un événement change pour assurer la compatibilité
                const event = new Event('change', { bubbles: true });
                radioButton.dispatchEvent(event);
                
                console.log(`Radio button ${mode} mis à jour et événement déclenché`);
            } else {
                console.log(`Radio button pour ${mode} non trouvé`);
            }
            
            // Mettre à jour le paramètre dans le simulateur si disponible
            if (window.simulateur) {
                window.simulateur.params.base.calculationMode = mode;
                console.log(`Paramètre calculationMode mis à jour dans le simulateur: ${mode}`);
            }
        });
    });
    
    // Support clavier pour l'accessibilité
    calculationModeCards.addEventListener('keydown', e => {
        const card = e.target.closest('.calculation-card');
        if (!card) return;
        
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
        }
    });
    
    console.log("Écouteurs d'événements pour les cartes de mode de calcul initialisés");
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