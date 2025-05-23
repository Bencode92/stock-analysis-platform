// === AFFICHAGE DES DÉFINITIONS DE RÉGIMES FISCAUX ===
// Ce script se greffe sur les cartes existantes pour afficher les définitions

(function() {
    'use strict';
    
    let regimesData = null;
    let definitionContainer = null;
    
    // Charger les données JSON
    async function loadRegimesData() {
        try {
            const response = await fetch('./data/regimes-fiscaux.json');
            regimesData = await response.json();
            console.log('✅ Définitions des régimes fiscaux chargées');
        } catch (error) {
            console.error('❌ Erreur chargement définitions:', error);
        }
    }
    
    // Créer le conteneur de définition
    function createDefinitionContainer() {
        // Trouver où insérer la définition
        const regimeSection = document.querySelector('h2:has(~ div:has(h3:contains("Micro-foncier")))').parentElement ||
                             document.querySelector('[class*="regime"]')?.parentElement ||
                             document.querySelector('.card:has(h3:contains("LMNP"))');
        
        if (!regimeSection) {
            console.error('Section régimes non trouvée');
            return;
        }
        
        definitionContainer = document.createElement('div');
        definitionContainer.id = 'regime-definition-display';
        definitionContainer.className = 'regime-definition-container hidden';
        definitionContainer.innerHTML = `
            <div class="definition-header">
                <div class="definition-icon">
                    <i class="fas fa-book-open"></i>
                </div>
                <h3 id="regime-nom" class="definition-title"></h3>
                <button class="definition-close" onclick="hideRegimeDefinition()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="definition-content">
                <p id="regime-definition" class="definition-text"></p>
                
                <div id="regime-exemple" class="definition-example hidden">
                    <div class="example-icon">
                        <i class="fas fa-lightbulb"></i>
                    </div>
                    <div class="example-content">
                        <h4>Exemple pratique</h4>
                        <p id="exemple-text"></p>
                    </div>
                </div>
                
                <div class="definition-lists">
                    <div id="regime-avantages" class="definition-list avantages hidden">
                        <h4><i class="fas fa-check-circle"></i> Avantages</h4>
                        <ul id="avantages-list"></ul>
                    </div>
                    
                    <div id="regime-inconvenients" class="definition-list inconvenients hidden">
                        <h4><i class="fas fa-times-circle"></i> Inconvénients</h4>
                        <ul id="inconvenients-list"></ul>
                    </div>
                </div>
                
                <div id="regime-comparaison" class="definition-comparison hidden">
                    <div class="comparison-icon">
                        <i class="fas fa-balance-scale"></i>
                    </div>
                    <p id="comparaison-text"></p>
                </div>
            </div>
        `;
        
        regimeSection.appendChild(definitionContainer);
    }
    
    // Afficher la définition
    function showRegimeDefinition(regimeName) {
        if (!regimesData || !definitionContainer) return;
        
        const regime = regimesData.find(r => 
            r.nom === regimeName || 
            r.nom.includes(regimeName) || 
            regimeName.includes(r.nom.split(' ')[0])
        );
        
        if (!regime) {
            console.warn('Régime non trouvé:', regimeName);
            return;
        }
        
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
        
        // Afficher
        definitionContainer.classList.remove('hidden');
        definitionContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Masquer la définition
    window.hideRegimeDefinition = function() {
        if (definitionContainer) {
            definitionContainer.classList.add('hidden');
        }
        document.querySelectorAll('.regime-selected').forEach(el => {
            el.classList.remove('regime-selected');
        });
    };
    
    // Attacher les événements aux cartes
    function attachClickEvents() {
        document.addEventListener('click', (e) => {
            // Chercher si on a cliqué sur une carte contenant un régime
            const card = e.target.closest('div');
            if (!card) return;
            
            const text = card.textContent;
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
                if (text.includes(regime)) {
                    // Marquer comme sélectionné
                    document.querySelectorAll('.regime-selected').forEach(el => {
                        el.classList.remove('regime-selected');
                    });
                    card.classList.add('regime-selected');
                    
                    showRegimeDefinition(regime);
                    break;
                }
            }
        });
    }
    
    // Initialisation
    async function init() {
        await loadRegimesData();
        createDefinitionContainer();
        attachClickEvents();
        console.log('✅ Système de définitions initialisé');
    }
    
    // Lancer au chargement
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
