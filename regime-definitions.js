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
                
                <div id="regime-exemple" class="regime-exemple hidden">
                    <div class="regime-exemple-icon">
                        <i class="fas fa-lightbulb"></i>
                    </div>
                    <div class="regime-exemple-content">
                        <h4>💡Exemple pratique</h4>
                        <p id="exemple-text"></p>
                    </div>
                </div>
                
                <div class="regime-lists">
                    <div id="regime-avantages" class="regime-list avantages hidden">
                        <h4>✅Avantages</h4>
                        <ul id="avantages-list"></ul>
                    </div>
                    
                    <div id="regime-inconvenients" class="regime-list inconvenients hidden">
                        <h4>⚠️Inconvénients</h4>
                        <ul id="inconvenients-list"></ul>
                    </div>
                </div>
                
                <div id="regime-comparaison" class="regime-comparaison hidden">
                    <h4>⚖️Comparaison</h4>
                    <p id="comparaison-text"></p>
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
            
            .regime-exemple {
                background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(251, 191, 36, 0.05));
                border: 1px solid rgba(251, 191, 36, 0.3);
                border-radius: 15px;
                padding: 1.5rem;
                margin-bottom: 2rem;
                display: flex;
                gap: 1rem;
                align-items: flex-start;
            }
            
            .regime-exemple-icon {
                width: 40px;
                height: 40px;
                background: rgba(251, 191, 36, 0.2);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.25rem;
                color: #fbbf24;
                flex-shrink: 0;
            }
            
            .regime-exemple-content h4 {
                color: #fbbf24;
                margin: 0 0 0.5rem 0;
                font-size: 1.125rem;
                font-weight: 600;
            }
            
            .regime-exemple-content p {
                color: rgba(255, 255, 255, 0.8);
                margin: 0;
                line-height: 1.6;
            }
            
            .regime-lists {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 2rem;
                margin-bottom: 2rem;
            }
            
            .regime-list h4 {
                font-size: 1.125rem;
                font-weight: 600;
                margin-bottom: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .regime-list.avantages h4 {
                color: #10b981;
            }
            
            .regime-list.inconvenients h4 {
                color: #f59e0b;
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
            }
            
            .regime-list.avantages li::before {
                color: #10b981;
            }
            
            .regime-list.inconvenients li::before {
                color: #f59e0b;
            }
            
            .regime-comparaison {
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05));
                border: 1px solid rgba(139, 92, 246, 0.3);
                border-radius: 15px;
                padding: 1.5rem;
            }
            
            .regime-comparaison h4 {
                color: #a78bfa;
                margin: 0 0 1rem 0;
                font-size: 1.125rem;
                font-weight: 600;
            }
            
            .regime-comparaison p {
                color: rgba(255, 255, 255, 0.8);
                margin: 0;
                line-height: 1.6;
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
                .regime-lists {
                    grid-template-columns: 1fr;
                    gap: 1.5rem;
                }
                
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