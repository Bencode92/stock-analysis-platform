// simulator-extension.js - Extension pour ajouter les options sectorielles au simulateur principal
// Version 1.0 - Mai 2025

document.addEventListener('DOMContentLoaded', function() {
    console.log("Extension pour options sectorielles du simulateur principal chargée");
    
    // Vérifier périodiquement si le simulateur principal est initialisé
    const checkSimulatorReady = setInterval(() => {
        // Vérifier que nous sommes sur la page principale du simulateur
        const fiscalWarning = document.querySelector('.fiscal-warning');
        const microTypeSelector = document.querySelector('select[id$="micro-type"]');
        
        // Si ces éléments sont présents, nous sommes probablement sur la page principale du simulateur
        if (fiscalWarning || microTypeSelector) {
            clearInterval(checkSimulatorReady);
            console.log("Simulateur principal détecté, initialisation des options sectorielles...");
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
    // Si les options existent déjà, ne pas les recréer
    if (document.getElementById('secteur-options-container')) {
        console.log("Les options sectorielles existent déjà");
        return;
    }
    
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
    
    // 2. Trouver le bon endroit pour insérer nos options
    insertSectorOptions(sectorOptionsContainer);
    
    // 3. Initialiser les paramètres sectoriels
    window.simulationParams = window.simulationParams || {
        secteur: "Tous",
        taille: "<50"
    };
    
    // 4. Ajouter les écouteurs d'événements
    setupSectorEventListeners();
    
    // 5. Intercepter et modifier la fonction runComparison (si elle existe)
    extendRunComparisonFunction();
    
    console.log("Options sectorielles pour le simulateur principal initialisées avec succès");
}

// Fonction pour insérer les options sectorielles au bon endroit
function insertSectorOptions(optionsElement) {
    // Stratégie 1: Insérer juste avant l'avertissement fiscal (position idéale)
    const fiscalWarning = document.querySelector('.fiscal-warning');
    if (fiscalWarning && fiscalWarning.parentNode) {
        fiscalWarning.parentNode.insertBefore(optionsElement, fiscalWarning);
        console.log("Options sectorielles insérées avant l'avertissement fiscal");
        return;
    }
    
    // Stratégie 2: Insérer après la case à cocher "Versement libératoire"
    const versementLiberatoire = document.getElementById('micro-vfl');
    if (versementLiberatoire) {
        const parentContainer = findParentContainer(versementLiberatoire, 3);
        if (parentContainer && parentContainer.parentNode) {
            parentContainer.parentNode.insertBefore(optionsElement, parentContainer.nextSibling);
            console.log("Options sectorielles insérées après l'option de versement libératoire");
            return;
        }
    }
    
    // Stratégie 3: Insérer après la section de type d'activité pour micro-entreprise
    const microTypeSelector = document.querySelector('select[id$="micro-type"]');
    if (microTypeSelector) {
        const parentContainer = findParentContainer(microTypeSelector, 3);
        if (parentContainer && parentContainer.parentNode) {
            parentContainer.parentNode.insertBefore(optionsElement, parentContainer.nextSibling);
            console.log("Options sectorielles insérées après le sélecteur de type micro");
            return;
        }
    }
    
    // Stratégie 4: Insérer après la section "Gérant minoritaire pour SARL"
    const gerantMinoritaire = document.getElementById('sarl-gerant-minoritaire');
    if (gerantMinoritaire) {
        const parentContainer = findParentContainer(gerantMinoritaire, 3);
        if (parentContainer && parentContainer.parentNode) {
            parentContainer.parentNode.insertBefore(optionsElement, parentContainer.nextSibling);
            console.log("Options sectorielles insérées après l'option de gérant minoritaire");
            return;
        }
    }
    
    // Stratégie 5 (dernier recours): Insérer dans la section "Fonctionnalités activées"
    const fonctionnalitesActivees = document.querySelector('.fonctionnalites-activees, [id$="sim-options"]');
    if (fonctionnalitesActivees) {
        fonctionnalitesActivees.appendChild(optionsElement);
        console.log("Options sectorielles insérées dans la section des fonctionnalités activées");
        return;
    }
    
    // Stratégie 6 (vraiment dernier recours): Chercher n'importe quelle div parente
    const anyOptionGroup = document.querySelector('.checkbox-group, .form-group, .mt-4');
    if (anyOptionGroup && anyOptionGroup.parentNode) {
        anyOptionGroup.parentNode.insertBefore(optionsElement, anyOptionGroup.nextSibling);
        console.log("Options sectorielles insérées après un groupe d'options quelconque");
        return;
    }
    
    console.warn("Impossible de trouver un bon endroit pour insérer les options sectorielles");
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
            window.simulationParams.secteur = this.value;
            triggerRecomparison();
            console.log("Secteur changé à", this.value);
        });
    }
    
    if (tailleSelect) {
        tailleSelect.addEventListener('change', function() {
            window.simulationParams.taille = this.value;
            triggerRecomparison();
            console.log("Taille changée à", this.value);
        });
    }
}

// Déclenche une nouvelle comparaison
function triggerRecomparison() {
    // Si runComparison ou sim-compare-btn existe, l'utiliser
    if (typeof window.runComparison === 'function') {
        window.runComparison();
        return true;
    }
    
    // Sinon chercher un bouton de comparaison et cliquer dessus
    const compareBtn = document.getElementById('sim-compare-btn') || 
                       document.querySelector('[id$="compare-btn"]') || 
                       document.querySelector('button:contains("Comparer")');
    
    if (compareBtn) {
        compareBtn.click();
        return true;
    }
    
    console.warn("Impossible de trouver une méthode pour déclencher une nouvelle comparaison");
    return false;
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
        const secteur = window.simulationParams?.secteur || "Tous";
        const taille = window.simulationParams?.taille || "<50";
        
        console.log("runComparison modifié - secteur:", secteur, "taille:", taille);
        
        // Mettre à jour les options des statuts juridiques qui utilisent ces paramètres
        if (window.statutsComplets) {
            // Statuts avec dirigeant assimilé salarié
            const sasuLikeStatuts = ['sasu', 'sas', 'sa', 'selas'];
            
            // Parcourir ces statuts pour mettre à jour les paramètres
            sasuLikeStatuts.forEach(statutId => {
                if (window.statutsComplets[statutId] && window.statutsComplets[statutId].simuler) {
                    const originalSimuler = window.statutsComplets[statutId].simuler;
                    
                    window.statutsComplets[statutId].simuler = function() {
                        const existingParams = arguments[0] || {};
                        
                        const newParams = {
                            ...existingParams,
                            secteur: secteur,
                            taille: taille
                        };
                        
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
        } else if (window.SimulationsFiscales) {
            // Si statutsComplets n'existe pas mais SimulationsFiscales oui, étendre directement les méthodes
            const originalSasuSim = window.SimulationsFiscales.simulerSASU;
            const originalSasSim = window.SimulationsFiscales.simulerSAS;
            const originalSaSim = window.SimulationsFiscales.simulerSA;
            const originalSelasSim = window.SimulationsFiscales.simulerSELAS;
            const originalSarlSim = window.SimulationsFiscales.simulerSARL;
            
            if (originalSasuSim) {
                window.SimulationsFiscales.simulerSASU = function(params) {
                    const paramsEtendus = {
                        ...params,
                        secteur: secteur,
                        taille: taille
                    };
                    return originalSasuSim.call(this, paramsEtendus);
                };
            }
            
            if (originalSasSim) {
                window.SimulationsFiscales.simulerSAS = function(params) {
                    const paramsEtendus = {
                        ...params,
                        secteur: secteur,
                        taille: taille
                    };
                    return originalSasSim.call(this, paramsEtendus);
                };
            }
            
            if (originalSaSim) {
                window.SimulationsFiscales.simulerSA = function(params) {
                    const paramsEtendus = {
                        ...params,
                        secteur: secteur,
                        taille: taille
                    };
                    return originalSaSim.call(this, paramsEtendus);
                };
            }
            
            if (originalSelasSim) {
                window.SimulationsFiscales.simulerSELAS = function(params) {
                    const paramsEtendus = {
                        ...params,
                        secteur: secteur,
                        taille: taille
                    };
                    return originalSelasSim.call(this, paramsEtendus);
                };
            }
            
            if (originalSarlSim) {
                window.SimulationsFiscales.simulerSARL = function(params) {
                    const paramsEtendus = {
                        ...params,
                        secteur: secteur,
                        taille: taille
                    };
                    return originalSarlSim.call(this, paramsEtendus);
                };
            }
        }
        
        // Exécuter la fonction originale
        return originalRunComparison();
    };
    
    console.log("Fonction runComparison étendue avec paramètres sectoriels");
}