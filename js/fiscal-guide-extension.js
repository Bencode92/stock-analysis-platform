// fiscal-guide-extension.js - Extension pour les options sectorielles du simulateur fiscal
// Version 1.0 - Mai 2025

document.addEventListener('DOMContentLoaded', function() {
    console.log("Extension pour options sectorielles chargée");
    
    // Vérifier périodiquement si le simulateur est initialisé
    const checkSimulatorReady = setInterval(() => {
        // Chercher des éléments qui indiquent que le simulateur fiscal est prêt
        const simContainer = document.getElementById('fiscal-simulator');
        const simOptions = document.getElementById('sim-options-container');
        
        if (simContainer && simOptions) {
            clearInterval(checkSimulatorReady);
            console.log("Simulateur fiscal détecté, initialisation de l'extension...");
            initSectorOptions();
        }
    }, 500);
    
    // Durée maximale d'attente: 10 secondes
    setTimeout(() => {
        clearInterval(checkSimulatorReady);
    }, 10000);
});

// Fonction principale pour initialiser les options sectorielles
function initSectorOptions() {
    // 1. Créer le conteneur d'options sectorielles
    const sectorOptionsContainer = document.createElement('div');
    sectorOptionsContainer.className = 'mt-4';
    sectorOptionsContainer.id = 'secteur-options-container';
    sectorOptionsContainer.innerHTML = `
        <div class="bg-indigo-900 bg-opacity-20 border border-indigo-800 p-4 rounded-lg mb-2">
            <h4 class="font-medium mb-3 text-indigo-400"><i class="fas fa-industry mr-2"></i>Paramètres sectoriels (charges sociales)</h4>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-gray-300 mb-2">Secteur d'activité</label>
                    <select id="secteur-activite" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                        <option value="Tous" selected>Tous secteurs</option>
                        <option value="Services">Services</option>
                        <option value="Commerce">Commerce</option>
                        <option value="Industrie">Industrie</option>
                    </select>
                    <div class="text-xs text-gray-400 mt-1">Impact sur le taux de cotisations patronales et AT/MP</div>
                </div>
                <div>
                    <label class="block text-gray-300 mb-2">Taille de l'entreprise</label>
                    <select id="taille-entreprise" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                        <option value="<50" selected>Moins de 50 salariés</option>
                        <option value=">=50">50 salariés ou plus</option>
                    </select>
                    <div class="text-xs text-gray-400 mt-1">Impact sur le FNAL et autres cotisations</div>
                </div>
            </div>
            
            <div class="mt-3 bg-blue-900 bg-opacity-30 p-3 rounded-lg text-xs">
                <p><i class="fas fa-info-circle text-blue-400 mr-1"></i> Ces paramètres affectent uniquement les charges sociales des structures avec dirigeant assimilé salarié (SASU, SAS, SARL gérant minoritaire...)</p>
            </div>
        </div>
    `;
    
    // 2. Insérer le conteneur dans le simulateur
    insertSectorOptions(sectorOptionsContainer);
    
    // 3. Stocker et initialiser les paramètres sectoriels
    window.sectorParams = {
        secteur: "Tous",
        taille: "<50"
    };
    
    // 4. Ajouter les écouteurs d'événements
    setupSectorEventListeners();
    
    // 5. Intercepter et modifier la fonction runComparison
    extendRunComparisonFunction();
    
    console.log("Extension d'options sectorielles initialisée avec succès");
}

// Fonction pour insérer les options sectorielles au bon endroit
function insertSectorOptions(optionsElement) {
    // Stratégie 1: Insérer après les options de micro-entreprise
    const microVflOption = document.getElementById('micro-vfl');
    if (microVflOption) {
        const parentContainer = findParentContainer(microVflOption, 4); // Remonter 4 niveaux
        if (parentContainer && parentContainer.parentNode) {
            parentContainer.parentNode.insertBefore(optionsElement, parentContainer.nextSibling);
            return;
        }
    }
    
    // Stratégie 2: Insérer avant l'avertissement fiscal
    const fiscalWarning = document.querySelector('.fiscal-warning');
    if (fiscalWarning) {
        const parentContainer = findParentContainer(fiscalWarning, 2);
        if (parentContainer && parentContainer.parentNode) {
            parentContainer.parentNode.insertBefore(optionsElement, fiscalWarning);
            return;
        }
    }
    
    // Stratégie 3: Insérer après les options personnalisées
    const customOptions = document.getElementById('custom-status-options');
    if (customOptions && customOptions.parentNode) {
        customOptions.parentNode.insertBefore(optionsElement, customOptions.nextSibling);
        return;
    }
    
    // Stratégie 4: Insérer dans le conteneur d'options principal
    const simOptionsContainer = document.getElementById('sim-options-container');
    if (simOptionsContainer) {
        simOptionsContainer.appendChild(optionsElement);
        return;
    }
    
    // Dernier recours: chercher dans le simulateur
    const simContainer = document.getElementById('fiscal-simulator');
    if (simContainer) {
        const gridContainer = simContainer.querySelector('.grid');
        if (gridContainer) {
            gridContainer.appendChild(optionsElement);
        } else {
            simContainer.appendChild(optionsElement);
        }
    }
}

// Fonction utilitaire pour remonter dans l'arborescence du DOM
function findParentContainer(element, levels) {
    let current = element;
    for (let i = 0; i < levels && current.parentNode; i++) {
        current = current.parentNode;
    }
    return current;
}

// Configurer les écouteurs d'événements pour les options sectorielles
function setupSectorEventListeners() {
    const secteurSelect = document.getElementById('secteur-activite');
    const tailleSelect = document.getElementById('taille-entreprise');
    
    if (secteurSelect) {
        secteurSelect.addEventListener('change', function() {
            window.sectorParams.secteur = this.value;
            triggerRecomparison();
        });
    }
    
    if (tailleSelect) {
        tailleSelect.addEventListener('change', function() {
            window.sectorParams.taille = this.value;
            triggerRecomparison();
        });
    }
}

// Déclenche une nouvelle comparaison
function triggerRecomparison() {
    // Si runComparison existe, l'appeler
    if (typeof window.runComparison === 'function') {
        window.runComparison();
    }
}

// Étendre la fonction runComparison pour prendre en compte les paramètres sectoriels
function extendRunComparisonFunction() {
    // Attendre que runComparison soit disponible
    if (typeof window.runComparison !== 'function') {
        setTimeout(extendRunComparisonFunction, 500);
        return;
    }
    
    // Sauvegarder la fonction originale
    const originalRunComparison = window.runComparison;
    
    // Remplacer par notre version étendue
    window.runComparison = function() {
        // Récupérer les valeurs des options sectorielles
        const secteur = window.sectorParams?.secteur || "Tous";
        const taille = window.sectorParams?.taille || "<50";
        
        // Mettre à jour les options des statuts juridiques qui utilisent ces paramètres
        if (window.statutsComplets) {
            // Statuts avec dirigeant assimilé salarié
            const sasuLikeStatuts = ['sasu', 'sas', 'sa', 'selas'];
            
            // Parcourir ces statuts pour mettre à jour les paramètres
            sasuLikeStatuts.forEach(statutId => {
                if (window.statutsComplets[statutId] && window.statutsComplets[statutId].simuler) {
                    const originalSimuler = window.statutsComplets[statutId].simuler;
                    
                    // Remplacer temporairement la fonction simuler pour injecter les paramètres sectoriels
                    window.statutsComplets[statutId].simuler = function() {
                        // Récupérer tous les autres paramètres qui seraient déjà passés
                        const existingParams = arguments[0] || {};
                        
                        // Créer des nouveaux paramètres avec les options sectorielles
                        const newParams = {
                            ...existingParams,
                            secteur: secteur,
                            taille: taille
                        };
                        
                        // Appeler la fonction originale avec les paramètres enrichis
                        return originalSimuler(newParams);
                    };
                }
            });
            
            // Mise à jour pour SARL avec gérant minoritaire
            if (window.statutsComplets['sarl'] && window.statutsComplets['sarl'].simuler) {
                const originalSarl = window.statutsComplets['sarl'].simuler;
                
                window.statutsComplets['sarl'].simuler = function() {
                    const existingParams = arguments[0] || {};
                    const gerantMajoritaire = document.getElementById('sarl-gerant-minoritaire') ? 
                        !document.getElementById('sarl-gerant-minoritaire').checked : true;
                    
                    // N'ajouter les paramètres sectoriels que pour gérant minoritaire
                    const newParams = {
                        ...existingParams,
                        gerantMajoritaire: gerantMajoritaire
                    };
                    
                    if (!gerantMajoritaire) {
                        newParams.secteur = secteur;
                        newParams.taille = taille;
                    }
                    
                    return originalSarl(newParams);
                };
            }
        }
        
        // Exécuter la fonction originale
        return originalRunComparison();
    };
    
    console.log("Fonction runComparison étendue avec paramètres sectoriels");
}