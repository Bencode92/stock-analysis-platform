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
        definitionContainer.className = 'card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg transition-all mt-4 hidden';
        definitionContainer.innerHTML = `
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-book-open"></i>
                </div>
                <h3 id="regime-nom" class="card-title"></h3>
                <button class="btn-close" onclick="window.hideRegimeDefinition()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="card-body p-6">
                <p id="regime-definition" class="text-lg mb-4 text-gray-300"></p>
                
                <div id="regime-exemple" class="bg-blue-900/20 border border-blue-400/20 rounded-lg p-4 mb-4 hidden">
                    <h4 class="flex items-center text-blue-400 mb-2">
                        <i class="fas fa-lightbulb mr-2"></i> Exemple pratique
                    </h4>
                    <p id="exemple-text" class="text-gray-300"></p>
                </div>
                
                <div class="grid grid-2 gap-4 mb-4">
                    <div id="regime-avantages" class="hidden">
                        <h4 class="flex items-center text-green-400 mb-2">
                            <i class="fas fa-check-circle mr-2"></i> Avantages
                        </h4>
                        <ul id="avantages-list" class="list-disc list-inside text-gray-300"></ul>
                    </div>
                    
                    <div id="regime-inconvenients" class="hidden">
                        <h4 class="flex items-center text-red-400 mb-2">
                            <i class="fas fa-times-circle mr-2"></i> Inconvénients
                        </h4>
                        <ul id="inconvenients-list" class="list-disc list-inside text-gray-300"></ul>
                    </div>
                </div>
                
                <div id="regime-comparaison" class="bg-purple-900/20 border border-purple-400/20 rounded-lg p-4 hidden">
                    <h4 class="flex items-center text-purple-400 mb-2">
                        <i class="fas fa-balance-scale mr-2"></i> Comparaison
                    </h4>
                    <p id="comparaison-text" class="text-gray-300"></p>
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
                border-color: var(--primary-color, #00ff87);
                box-shadow: 0 0 20px rgba(0, 255, 135, 0.3);
            }
            
            .btn-close {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.5);
                cursor: pointer;
                font-size: 1.2rem;
                transition: color 0.2s;
            }
            
            .btn-close:hover {
                color: rgba(255, 255, 255, 0.9);
            }
            
            #regime-definition-display {
                animation: slideDown 0.3s ease-out;
            }
            
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Afficher la définition
    function showRegimeDefinition(regimeName) {
        if (!regimesData || !definitionContainer) return;
        
        // Mapper les noms affichés aux noms dans le JSON
        const nameMapping = {
            'Micro-foncier': 'Micro-foncier',
            'Réel foncier': 'Réel foncier',
            'LMNP micro-BIC': 'LMNP micro-BIC',
            'LMNP réel': 'LMNP réel',
            'SCI à l\'IS': 'SCI à l\'IS',
            'SAS': 'SAS',
            'SARL': 'SARL'
        };
        
        const mappedName = nameMapping[regimeName] || regimeName;
        const regime = regimesData.find(r => r.nom === mappedName);
        
        if (!regime) {
            console.warn('Régime non trouvé:', regimeName);
            return;
        }
        
        currentRegime = regime;
        
        // Remplir les données
        document.getElementById('regime-nom').textContent = regime.nom;
        document.getElementById('regime-definition').textContent = regime.definition;
        
        // Exemple
        const exempleEl = document.getElementById('regime-exemple');
        if (regime.exemple) {
            exempleEl.classList.remove('hidden');
            document.getElementById('exemple-text').textContent = regime.exemple;
        } else {
            exempleEl.classList.add('hidden');
        }
        
        // Avantages
        const avantagesEl = document.getElementById('regime-avantages');
        if (regime.avantages?.length) {
            avantagesEl.classList.remove('hidden');
            document.getElementById('avantages-list').innerHTML = 
                regime.avantages.map(a => `<li>${a}</li>`).join('');
        } else {
            avantagesEl.classList.add('hidden');
        }
        
        // Inconvénients
        const inconvenientsEl = document.getElementById('regime-inconvenients');
        if (regime.inconvenients?.length) {
            inconvenientsEl.classList.remove('hidden');
            document.getElementById('inconvenients-list').innerHTML = 
                regime.inconvenients.map(i => `<li>${i}</li>`).join('');
        } else {
            inconvenientsEl.classList.add('hidden');
        }
        
        // Comparaison
        const comparaisonEl = document.getElementById('regime-comparaison');
        if (regime.comparaison) {
            comparaisonEl.classList.remove('hidden');
            document.getElementById('comparaison-text').textContent = regime.comparaison;
        } else {
            comparaisonEl.classList.add('hidden');
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
            
            // Extraire le nom du régime depuis le h4 ou le contenu
            const nameElement = regimeCard.querySelector('h4') || 
                               regimeCard.querySelector('.regime-name') ||
                               regimeCard.querySelector('[class*="name"]');
            
            if (!nameElement) {
                // Chercher dans tout le contenu de la carte
                const cardText = regimeCard.textContent;
                const regimes = [
                    'Micro-foncier',
                    'Réel foncier',
                    'LMNP micro-BIC',
                    'LMNP réel',
                    'SCI à l\'IS',
                    'SAS',
                    'SARL'
                ];
                
                for (const regime of regimes) {
                    if (cardText.includes(regime)) {
                        selectRegimeCard(regimeCard, regime);
                        showRegimeDefinition(regime);
                        return;
                    }
                }
            } else {
                const regimeName = nameElement.textContent.trim();
                selectRegimeCard(regimeCard, regimeName);
                showRegimeDefinition(regimeName);
            }
        });
    }
    
    // Sélectionner visuellement une carte
    function selectRegimeCard(card, regimeName) {
        // Retirer la sélection précédente
        document.querySelectorAll('.regime-card.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Ajouter la sélection
        card.classList.add('selected');
        
        // Émettre un événement pour le simulateur
        window.dispatchEvent(new CustomEvent('regimeSelected', {
            detail: { regime: regimeName, data: currentRegime }
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