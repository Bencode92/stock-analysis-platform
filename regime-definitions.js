// === GESTIONNAIRE DE DÉFINITIONS POUR RÉGIMES FISCAUX ===
(function() {
    'use strict';
    
    let regimesData = null;
    let definitionContainer = null;
    let currentRegime = null;
    
    // Charger les données JSON
    async function loadRegimesData() {
        try {
            const response = await fetch('./data/regimes-fiscaux.json');
            regimesData = await response.json();
            console.log('✅ Définitions des régimes fiscaux chargées');
            attachClickEvents(); // Attacher après chargement
        } catch (error) {
            console.error('❌ Erreur chargement définitions:', error);
        }
    }
    
    // Créer le conteneur de définition
    function createDefinitionContainer() {
        // Chercher la section des régimes fiscaux en utilisant des sélecteurs valides
        let targetElement = document.querySelector('#regimes-fiscaux-container');
        
        if (!targetElement) {
            // Chercher les cartes avec le titre contenant "régime fiscal"
            const allCards = document.querySelectorAll('.card');
            for (const card of allCards) {
                const title = card.querySelector('.card-title, h2, h3');
                if (title && title.textContent.toLowerCase().includes('régime fiscal')) {
                    targetElement = card;
                    break;
                }
            }
        }
        
        if (!targetElement) {
            // Chercher après les paramètres avancés
            targetElement = document.getElementById('advanced-params');
            if (targetElement) {
                targetElement = targetElement.parentElement;
            }
        }
        
        if (!targetElement) {
            console.error('Section régimes non trouvée');
            return;
        }
        
        definitionContainer = document.createElement('div');
        definitionContainer.id = 'regime-definition-display';
        definitionContainer.className = 'regime-definition-container hidden';
        definitionContainer.innerHTML = `
            <div class="regime-def-header">
                <div class="regime-def-icon">
                    <i class="fas fa-book-open"></i>
                </div>
                <h3 id="regime-nom" class="regime-def-title"></h3>
                <button class="regime-def-close" onclick="window.hideRegimeDefinition()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="regime-def-body">
                <p id="regime-definition" class="regime-def-text"></p>
                
                <div id="regime-conditions" class="regime-list conditions hidden">
                    <h4>📋 Conditions d'éligibilité</h4>
                    <ul id="conditions-list"></ul>
                </div>
                
                <div id="regime-modalites" class="regime-list modalites hidden">
                    <h4>⚙️ Modalités d'application</h4>
                    <ul id="modalites-list"></ul>
                </div>
                
                <div id="regime-specificites" class="regime-list specificites hidden">
                    <h4>🔧 Spécificités fiscales</h4>
                    <ul id="specificites-list"></ul>
                </div>
                
                <div id="regime-deficit" class="regime-deficit hidden">
                    <h4>📊 Déficit foncier</h4>
                    <div id="deficit-content"></div>
                </div>
                
                <div id="regime-calcul" class="regime-calcul hidden">
                    <h4>🧮 Calcul fiscal</h4>
                    <div id="calcul-content"></div>
                </div>
            </div>
        `;
        
        // Insérer après la section des régimes
        if (targetElement.id === 'regimes-fiscaux-container') {
            targetElement.appendChild(definitionContainer);
        } else {
            targetElement.insertAdjacentElement('afterend', definitionContainer);
        }
        
        // Ajouter les styles CSS
        addStyles();
    }
    
    // Ajouter les styles CSS nécessaires
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .regime-card {
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .regime-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 30px rgba(0, 255, 135, 0.2);
            }
            
            .regime-card.selected {
                border-color: #00ff87;
                box-shadow: 0 0 30px rgba(0, 255, 135, 0.4);
                background: rgba(0, 255, 135, 0.05);
            }
            
            .regime-definition-container {
                margin-top: 2rem;
                background: rgba(30, 41, 59, 0.5);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(59, 130, 246, 0.1);
                border-radius: 20px;
                overflow: hidden;
                animation: slideDown 0.4s ease-out;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            }
            
            .regime-def-header {
                display: flex;
                align-items: center;
                padding: 1.5rem 2rem;
                background: rgba(59, 130, 246, 0.1);
                border-bottom: 1px solid rgba(59, 130, 246, 0.2);
                position: relative;
            }
            
            .regime-def-icon {
                width: 50px;
                height: 50px;
                background: linear-gradient(135deg, #3b82f6, #1e40af);
                border-radius: 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
                color: white;
                margin-right: 1.5rem;
                box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
            }
            
            .regime-def-title {
                font-size: 1.75rem;
                font-weight: 700;
                color: #fff;
                margin: 0;
                flex: 1;
            }
            
            .regime-def-close {
                position: absolute;
                top: 1.5rem;
                right: 1.5rem;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: rgba(255, 255, 255, 0.6);
                transition: all 0.3s;
            }
            
            .regime-def-close:hover {
                background: rgba(239, 68, 68, 0.2);
                border-color: rgba(239, 68, 68, 0.5);
                color: #ef4444;
                transform: rotate(90deg);
            }
            
            .regime-def-body {
                padding: 2rem;
            }
            
            .regime-def-text {
                font-size: 1.125rem;
                line-height: 1.8;
                color: rgba(255, 255, 255, 0.9);
                margin-bottom: 2rem;
                font-weight: 300;
            }
            
            .regime-list {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                padding: 1.5rem;
                margin-bottom: 1.5rem;
            }
            
            .regime-list h4 {
                font-size: 1.125rem;
                font-weight: 600;
                margin-bottom: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: #a78bfa;
            }
            
            .regime-list ul {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            
            .regime-list li {
                padding: 0.75rem 0;
                padding-left: 1.5rem;
                position: relative;
                color: rgba(255, 255, 255, 0.8);
                line-height: 1.6;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .regime-list li:last-child {
                border-bottom: none;
            }
            
            .regime-list li::before {
                content: "•";
                position: absolute;
                left: 0;
                font-weight: bold;
                font-size: 1.25rem;
                color: #a78bfa;
            }
            
            .regime-deficit, .regime-calcul {
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05));
                border: 1px solid rgba(139, 92, 246, 0.3);
                border-radius: 15px;
                padding: 1.5rem;
                margin-bottom: 1.5rem;
            }
            
            .regime-deficit h4, .regime-calcul h4 {
                color: #a78bfa;
                margin: 0 0 1rem 0;
                font-size: 1.125rem;
                font-weight: 600;
            }
            
            .regime-deficit p, .regime-calcul p {
                color: rgba(255, 255, 255, 0.8);
                margin: 0.5rem 0;
                line-height: 1.6;
            }
            
            #deficit-content p, #calcul-content p {
                margin: 0.75rem 0;
                padding-left: 1rem;
                border-left: 2px solid rgba(139, 92, 246, 0.3);
            }
            
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @media (max-width: 768px) {
                .regime-def-body {
                    padding: 1.5rem;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Afficher la définition
    function showRegimeDefinition(regimeName) {
        if (!regimesData || !definitionContainer) return;
        
        // Trouver le régime par son nom ou ID
        const regime = regimesData.find(r => r.nom === regimeName || r.id === regimeName);
        
        if (!regime) {
            console.warn('Régime non trouvé:', regimeName);
            return;
        }
        
        currentRegime = regime;
        
        // Remplir les données de base
        document.getElementById('regime-nom').textContent = regime.nom;
        document.getElementById('regime-definition').textContent = regime.description;
        
        // Conditions d'éligibilité
        const conditionsEl = document.getElementById('regime-conditions');
        if (regime.conditions_eligibilite?.length) {
            conditionsEl.classList.remove('hidden');
            document.getElementById('conditions-list').innerHTML = 
                regime.conditions_eligibilite.map(c => `<li>${c}</li>`).join('');
        } else if (regime.conditions_application?.length) {
            conditionsEl.classList.remove('hidden');
            document.querySelector('#regime-conditions h4').textContent = '📋 Conditions d\'application';
            document.getElementById('conditions-list').innerHTML = 
                regime.conditions_application.map(c => `<li>${c}</li>`).join('');
        } else {
            conditionsEl.classList.add('hidden');
        }
        
        // Modalités d'application
        const modalitesEl = document.getElementById('regime-modalites');
        if (regime.modalites_application?.length) {
            modalitesEl.classList.remove('hidden');
            document.getElementById('modalites-list').innerHTML = 
                regime.modalites_application.map(m => `<li>${m}</li>`).join('');
        } else {
            modalitesEl.classList.add('hidden');
        }
        
        // Spécificités fiscales
        const specificitesEl = document.getElementById('regime-specificites');
        if (regime.specifites_fiscales?.length) {
            specificitesEl.classList.remove('hidden');
            document.getElementById('specificites-list').innerHTML = 
                regime.specifites_fiscales.map(s => `<li>${s}</li>`).join('');
        } else {
            specificitesEl.classList.add('hidden');
        }
        
        // Déficit foncier
        const deficitEl = document.getElementById('regime-deficit');
        if (regime.deficit_foncier) {
            deficitEl.classList.remove('hidden');
            let deficitContent = '';
            for (const [key, value] of Object.entries(regime.deficit_foncier)) {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                deficitContent += `<p><strong>${label}:</strong> ${value}</p>`;
            }
            document.getElementById('deficit-content').innerHTML = deficitContent;
        } else {
            deficitEl.classList.add('hidden');
        }
        
        // Calcul fiscal
        const calculEl = document.getElementById('regime-calcul');
        if (regime.calcul) {
            calculEl.classList.remove('hidden');
            let calculContent = '<p>';
            if (regime.calcul.abattement !== undefined) {
                calculContent += `<strong>Abattement:</strong> ${regime.calcul.abattement * 100}%<br>`;
            }
            if (regime.calcul.deficitDeductible !== undefined) {
                calculContent += `<strong>Déficit déductible:</strong> ${regime.calcul.deficitDeductible ? 'Oui' : 'Non'}<br>`;
            }
            if (regime.calcul.plafondDeficit !== undefined) {
                calculContent += `<strong>Plafond déficit:</strong> ${regime.calcul.plafondDeficit.toLocaleString()} €<br>`;
            }
            if (regime.calcul.amortissement !== undefined) {
                calculContent += `<strong>Amortissement possible:</strong> ${regime.calcul.amortissement ? 'Oui' : 'Non'}<br>`;
            }
            if (regime.calcul.reportable !== undefined) {
                calculContent += `<strong>Déficit reportable:</strong> ${regime.calcul.reportable ? 'Oui' : 'Non'}`;
            }
            calculContent += '</p>';
            document.getElementById('calcul-content').innerHTML = calculContent;
        } else {
            calculEl.classList.add('hidden');
        }
        
        // Afficher avec animation
        definitionContainer.classList.remove('hidden');
        definitionContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Masquer la définition
    window.hideRegimeDefinition = function() {
        if (definitionContainer) {
            definitionContainer.classList.add('hidden');
        }
        document.querySelectorAll('.regime-card.selected').forEach(el => {
            el.classList.remove('selected');
        });
        currentRegime = null;
    };
    
    // Attacher les événements aux cartes
    function attachClickEvents() {
        // Utiliser la délégation d'événements sur le document
        document.addEventListener('click', (e) => {
            // Chercher si on a cliqué sur une carte de régime
            const regimeCard = e.target.closest('.regime-card');
            if (!regimeCard) return;
            
            // Extraire l'ID du régime depuis l'attribut data-regime
            const regimeId = regimeCard.getAttribute('data-regime');
            
            if (regimeId) {
                selectRegimeCard(regimeCard, regimeId);
                showRegimeDefinition(regimeId);
            }
        });
    }
    
    // Sélectionner visuellement une carte
    function selectRegimeCard(card, regimeId) {
        // Retirer la sélection précédente
        document.querySelectorAll('.regime-card.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Ajouter la sélection
        card.classList.add('selected');
        
        // Émettre un événement pour le simulateur
        window.dispatchEvent(new CustomEvent('regimeSelected', {
            detail: { regime: regimeId, data: currentRegime }
        }));
    }
    
    // Initialisation
    async function init() {
        console.log('🏛️ Initialisation du système de définitions...');
        await loadRegimesData();
        createDefinitionContainer();
        console.log('✅ Système de définitions prêt');
    }
    
    // Attendre que le DOM soit chargé
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Attendre un peu que les autres scripts aient fini
        setTimeout(init, 500);
    }
})();