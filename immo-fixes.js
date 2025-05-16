/**
 * immo-fixes.js - Correctifs pour le simulateur d'investissement immobilier
 * 
 * Ce script contient les correctifs pour résoudre les problèmes d'affichage:
 * 1. Duplication des cartes de régime fiscal dans la section mode
 * 2. Suppression des boutons "Comprendre le cash-flow" en double
 * 3. Correction du centrage des onglets et sections
 */

document.addEventListener('DOMContentLoaded', function() {
    // S'assurer que le DOM est chargé
    
    // 1. Ajouter les styles CSS pour le centrage
    ajouterStylesCentrage();
    
    // 2. Attendre que le simulateur et l'interface soient chargés
    const checkComponents = setInterval(function() {
        if (window.simulateur) {
            clearInterval(checkComponents);
            
            // 3. Appliquer les correctifs après un court délai
            setTimeout(appliquerCorrectifs, 500);
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

        /* Assurer que les cartes de régime fiscal sont alignées */
        .regime-cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 1rem;
            width: 100%;
            justify-content: center;
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
    
    // 2. Dupliquer les cartes de régime fiscal dans la section mode
    dupliquerCartesRegimeFiscal();
    
    console.log("Correctifs appliqués avec succès");
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
 * Duplique les cartes de régime fiscal dans la section mode
 */
function dupliquerCartesRegimeFiscal() {
    // Trouver la section de mode de calcul
    const modeCalculSection = document.querySelector('.form-group:has(input[name="calculation-mode"])');
    const regimeFiscalCards = document.getElementById('regime-fiscal-cards');
    
    // Vérifier si les éléments existent et si les cartes ne sont pas déjà dupliquées
    if (modeCalculSection && regimeFiscalCards && !document.getElementById('mode-fiscal-cards')) {
        // Créer un titre pour la section
        const titreSection = document.createElement('h4');
        titreSection.className = 'mt-4 mb-2';
        titreSection.innerHTML = '<i class="fas fa-file-invoice-dollar mr-2"></i> Régime fiscal';
        
        // Cloner les cartes de régime fiscal
        const fiscalCardsClone = regimeFiscalCards.cloneNode(true);
        fiscalCardsClone.id = 'mode-fiscal-cards';
        
        // Créer un conteneur pour le tout
        const conteneur = document.createElement('div');
        conteneur.className = 'mt-4 pt-4 border-t border-gray-700';
        conteneur.appendChild(titreSection);
        conteneur.appendChild(fiscalCardsClone);
        
        // Ajouter après les options de mode de calcul
        modeCalculSection.appendChild(conteneur);
        
        // Synchroniser les sélections entre les deux ensembles de cartes
        initialiserSynchronisationCartes(fiscalCardsClone);
        
        console.log("Cartes de régime fiscal dupliquées dans la section mode");
    } else {
        console.log("Impossible de dupliquer les cartes ou déjà fait");
    }
}

/**
 * Initialise la synchronisation entre les deux ensembles de cartes
 */
function initialiserSynchronisationCartes(cartesDupliquees) {
    if (!cartesDupliquees) return;
    
    // Ajouter des événements de clic sur les cartes dupliquées
    cartesDupliquees.querySelectorAll('.regime-card').forEach(card => {
        card.addEventListener('click', function() {
            const regime = this.dataset.regime;
            
            // Trouver la carte correspondante dans l'ensemble original
            const carteOriginale = document.querySelector(`#regime-fiscal-cards .regime-card[data-regime="${regime}"]`);
            if (carteOriginale) {
                // Simuler un clic sur la carte originale
                carteOriginale.click();
                
                // Mettre à jour l'apparence de toutes les cartes dupliquées
                cartesDupliquees.querySelectorAll('.regime-card').forEach(c => {
                    c.classList.remove('active');
                    c.setAttribute('aria-checked', 'false');
                });
                
                // Activer la carte cliquée
                this.classList.add('active');
                this.setAttribute('aria-checked', 'true');
            }
        });
    });
    
    // Mettre à jour l'état initial des cartes dupliquées
    const regimeActuel = window.simulateur?.params?.fiscalite?.regimeFiscal || 'micro-foncier';
    const carteActive = cartesDupliquees.querySelector(`.regime-card[data-regime="${regimeActuel}"]`);
    if (carteActive) {
        cartesDupliquees.querySelectorAll('.regime-card').forEach(card => {
            card.classList.remove('active');
            card.setAttribute('aria-checked', 'false');
        });
        
        carteActive.classList.add('active');
        carteActive.setAttribute('aria-checked', 'true');
    }
}
