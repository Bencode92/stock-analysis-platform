/**
 * immo-fixes.js - Correctifs pour le simulateur d'investissement immobilier
 * 
 * Ce script contient les correctifs pour résoudre les problèmes d'affichage:
 * 1. Suppression des boutons "Comprendre le cash-flow" en double
 * 2. Correction du centrage des onglets et sections
 * 3. Conversion du mode de calcul en système de cartes pour harmoniser l'UI
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