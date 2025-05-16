/**
 * immo-fixes.js - Correctifs pour le simulateur d'investissement immobilier
 * 
 * Ce script contient les correctifs pour résoudre les problèmes d'affichage:
 * 1. Duplication des cartes de régime fiscal dans la section mode
 * 2. Suppression des boutons "Comprendre le cash-flow" en double
 * 3. Correction du centrage des onglets et sections
 * 4. Conversion du mode de calcul en système de cartes pour harmoniser l'UI
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
    
    // 3. Convertir le mode de calcul en système de cartes
    // Ajouter un délai pour s'assurer que le DOM est bien chargé
    setTimeout(convertirModeCalculEnCartes, 300);
    
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
    // Trouver la section de mode de calcul - sélecteur plus précis
    const modeCalculSection = document.querySelector('.form-group[class*="border-t"]');
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
        console.log("Impossible de dupliquer les cartes ou déjà fait", {
            modeCalculSection: !!modeCalculSection,
            regimeFiscalCards: !!regimeFiscalCards,
            modeCardsExist: !!document.getElementById('mode-fiscal-cards')
        });
    }
}

/**
 * Convertit le mode de calcul en système de cartes
 * Cette version utilise une approche plus directe
 */
function convertirModeCalculEnCartes() {
    console.log("Tentative de conversion du mode de calcul en cartes");
    
    // Approche plus directe pour trouver le mode de calcul
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
        
        <div id="calculation-mode-cards" class="regime-cards-grid mt-3">
            <!-- Mode Loyer ≥ Mensualité -->
            <div class="regime-card ${modeActif === 'loyer-mensualite' ? 'active' : ''}" data-mode="loyer-mensualite" role="radio" tabindex="0" aria-checked="${modeActif === 'loyer-mensualite' ? 'true' : 'false'}">
                <i class="fas fa-check-circle text-lg text-green-400"></i>
                <h4>Loyer ≥ Mensualité</h4>
                <p class="text-sm opacity-75">Le loyer net couvre la mensualité du prêt</p>
            </div>
            
            <!-- Mode Cash-flow positif -->
            <div class="regime-card ${modeActif === 'cashflow-positif' ? 'active' : ''}" data-mode="cashflow-positif" role="radio" tabindex="0" aria-checked="${modeActif === 'cashflow-positif' ? 'true' : 'false'}">
                <i class="fas fa-coins text-lg text-yellow-400"></i>
                <h4>Cash-flow positif</h4>
                <p class="text-sm opacity-75">Toutes charges comprises (plus strict)</p>
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
    
    calculationModeCards.querySelectorAll('.regime-card').forEach(card => {
        card.addEventListener('click', function() {
            const mode = this.dataset.mode;
            console.log(`Carte de mode de calcul cliquée: ${mode}`);
            
            // Désactiver toutes les cartes
            calculationModeCards.querySelectorAll('.regime-card').forEach(c => {
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
        const card = e.target.closest('.regime-card');
        if (!card) return;
        
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
        }
    });
    
    console.log("Écouteurs d'événements pour les cartes de mode de calcul initialisés");
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