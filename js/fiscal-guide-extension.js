// fiscal-guide-extension.js - Extension des fonctionnalités du guide fiscal
// Version 1.4 - Mai 2025 - Correction des erreurs d'insertion DOM

document.addEventListener('DOMContentLoaded', function() {
    console.log("fiscal-guide-extension.js: Initialisation...");
    
    // Attendre explicitement que l'événement du simulateur fiscal soit déclenché
    document.addEventListener('simulationsFiscalesReady', function() {
        console.log("fiscal-guide-extension.js: SimulationsFiscales détecté, initialisation...");
        
        // Attendre encore un peu que l'interface soit générée par fiscal-guide.js
        setTimeout(function() {
            console.log("fiscal-guide-extension.js: Tentative d'initialisation des extensions...");
            initGuideFiscalExtension();
        }, 1000);
    });
    
    // Attendre également l'événement de l'onglet Guide fiscal
    const guideTab = document.querySelector('.tab-item:nth-child(3)');
    if (guideTab) {
        guideTab.addEventListener('click', function() {
            console.log("fiscal-guide-extension.js: Onglet Guide fiscal cliqué");
            setTimeout(function() {
                initGuideFiscalExtension();
            }, 500);
        });
    }
});

function initGuideFiscalExtension() {
    console.log("fiscal-guide-extension.js: Initialisation des extensions du guide fiscal");
    
    // Vérifier si le simulateur existe dans le DOM
    if (!document.getElementById('fiscal-simulator')) {
        console.log("fiscal-guide-extension.js: Simulateur fiscal non trouvé dans le DOM");
        return;
    }
    
    console.log("fiscal-guide-extension.js: Simulateur fiscal trouvé, ajout des options sectorielles");
    
    // Ajouter les options sectorielles pour SASU/SAS
    addSectorOptions();
}

// Ajouter les options sectorielles pour SASU/SAS
function addSectorOptions() {
    // Trouver l'endroit où insérer les options sectorielles
    const optionsContainer = document.getElementById('sim-options-container');
    if (!optionsContainer) {
        console.log("fiscal-guide-extension.js: Conteneur d'options non trouvé");
        return;
    }
    
    // Éviter d'ajouter les options deux fois
    if (document.getElementById('sector-options')) {
        console.log("fiscal-guide-extension.js: Options sectorielles déjà ajoutées");
        return;
    }
    
    console.log("fiscal-guide-extension.js: Ajout des options sectorielles pour SASU/SAS");
    
    // Créer le conteneur pour les options sectorielles
    const sectorOptions = document.createElement('div');
    sectorOptions.id = 'sector-options';
    sectorOptions.className = 'mt-6 p-4 bg-blue-900 bg-opacity-30 rounded-lg border border-blue-800';
    sectorOptions.innerHTML = `
        <h3 class="text-lg font-medium text-green-400 mb-3">
            <i class="fas fa-industry mr-2"></i> 
            Options sectorielles pour SASU/SAS
            <span class="info-tooltip ml-2">
                <i class="fas fa-question-circle text-gray-400"></i>
                <span class="tooltiptext">
                    Ces options permettent d'ajuster les taux de charges sociales selon votre secteur d'activité et la taille de votre entreprise. Impact direct sur le calcul des charges patronales et salariales.
                </span>
            </span>
        </h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-gray-300 mb-2">Secteur d'activité</label>
                <select id="sim-secteur" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                    <option value="Tous">Tous secteurs</option>
                    <option value="Commerce">Commerce</option>
                    <option value="Industrie">Industrie</option>
                    <option value="Services">Services</option>
                </select>
                <p class="text-xs text-gray-400 mt-1">Utilisé pour déterminer les taux de charge spécifiques au secteur</p>
            </div>
            <div>
                <label class="block text-gray-300 mb-2">Taille d'entreprise</label>
                <select id="sim-taille" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                    <option value="<50">Moins de 50 salariés</option>
                    <option value=">=50">50 salariés ou plus</option>
                </select>
                <p class="text-xs text-gray-400 mt-1">Impacte le taux FNAL et certaines exonérations</p>
            </div>
        </div>
        
        <div class="mt-3 bg-blue-900 bg-opacity-20 p-3 rounded-lg text-sm">
            <div class="flex items-start">
                <i class="fas fa-info-circle text-blue-400 mr-2 mt-1"></i>
                <p>
                    Ces paramètres affectent principalement les statuts avec charges d'assimilé salarié (SASU, SAS, SA, SELAS). 
                    Les différences de taux peuvent représenter jusqu'à 5% d'écart sur les charges patronales selon le secteur et la taille.
                </p>
            </div>
        </div>
    `;
    
    // Méthode d'insertion corrigée pour éviter les erreurs DOM
    // Ajouter simplement à la fin du conteneur d'options
    optionsContainer.appendChild(sectorOptions);
    
    // Créer l'objet sectorOptions global s'il n'existe pas
    if (!window.sectorOptions) {
        window.sectorOptions = {
            secteur: "Tous",
            taille: "<50"
        };
    }
    
    // Ajouter les écouteurs d'événements
    const secteurSelect = document.getElementById('sim-secteur');
    const tailleSelect = document.getElementById('sim-taille');
    
    if (secteurSelect) {
        // Définir la valeur par défaut basée sur le stockage global
        if (window.sectorOptions && window.sectorOptions.secteur) {
            secteurSelect.value = window.sectorOptions.secteur;
        }
        
        secteurSelect.addEventListener('change', function() {
            console.log("fiscal-guide-extension.js: Secteur changé:", this.value);
            // Mettre à jour l'objet sectorOptions global
            if (!window.sectorOptions) window.sectorOptions = {};
            window.sectorOptions.secteur = this.value;
            
            // Si runComparison existe, l'appeler pour rafraîchir les résultats
            if (typeof window.runComparison === 'function') {
                window.runComparison();
            }
        });
    }
    
    if (tailleSelect) {
        // Définir la valeur par défaut basée sur le stockage global
        if (window.sectorOptions && window.sectorOptions.taille) {
            tailleSelect.value = window.sectorOptions.taille;
        }
        
        tailleSelect.addEventListener('change', function() {
            console.log("fiscal-guide-extension.js: Taille changée:", this.value);
            // Mettre à jour l'objet sectorOptions global
            if (!window.sectorOptions) window.sectorOptions = {};
            window.sectorOptions.taille = this.value;
            
            // Si runComparison existe, l'appeler pour rafraîchir les résultats
            if (typeof window.runComparison === 'function') {
                window.runComparison();
            }
        });
    }
    
    // Modifier la fonction runComparison pour intégrer ces nouveaux paramètres
    // Ceci est fait après que la fonction originale soit définie dans fiscal-guide.js
    modifyRunComparisonFunction();
}

// Modifier la fonction runComparison pour intégrer les paramètres sectoriels
function modifyRunComparisonFunction() {
    console.log("fiscal-guide-extension.js: Tentative de modification de la fonction runComparison");
    
    // Sauvegarder la fonction originale
    if (typeof window.originalRunComparison !== 'function' && typeof window.runComparison === 'function') {
        window.originalRunComparison = window.runComparison;
        
        // Redéfinir la fonction avec les nouveaux paramètres
        window.runComparison = function() {
            console.log("fiscal-guide-extension.js: Fonction runComparison modifiée appelée");
            
            // Récupérer les options sectorielles
            const secteur = document.getElementById('sim-secteur')?.value || "Tous";
            const taille = document.getElementById('sim-taille')?.value || "<50";
            console.log("fiscal-guide-extension.js: Options sectorielles -", secteur, taille);
            
            // Stocker les valeurs dans l'objet window pour le simulateur
            window.sectorOptions = {
                secteur: secteur,
                taille: taille
            };
            
            // Appeler la fonction originale
            window.originalRunComparison();
        };
        
        console.log("fiscal-guide-extension.js: Fonction runComparison modifiée avec succès");
    } else if (typeof window.originalRunComparison === 'function') {
        console.log("fiscal-guide-extension.js: La fonction runComparison a déjà été modifiée");
    } else {
        console.log("fiscal-guide-extension.js: Impossible de trouver la fonction runComparison à modifier");
        
        // Si nous n'avons pas pu modifier la fonction immédiatement, attendre et réessayer
        setTimeout(modifyRunComparisonFunction, 1000);
    }
    
    // Également modifier la fonction statutsComplets.sasu.simuler si elle existe
    modifyStatutsComplets();
}

// Modifier statutsComplets pour intégrer les paramètres sectoriels
function modifyStatutsComplets() {
    // Attendre que statutsComplets soit défini
    if (typeof window.statutsComplets === 'undefined') {
        console.log("fiscal-guide-extension.js: Attente de statutsComplets...");
        setTimeout(modifyStatutsComplets, 500);
        return;
    }
    
    console.log("fiscal-guide-extension.js: Modification des simulateurs de statutsComplets");
    
    // Liste des statuts à modifier (tous ceux qui utilisent les charges d'assimilé salarié)
    const statutsToModify = ['sasu', 'sas', 'sa', 'selas'];
    
    statutsToModify.forEach(statutId => {
        if (window.statutsComplets[statutId] && typeof window.statutsComplets[statutId].originalSimuler === 'undefined') {
            console.log(`fiscal-guide-extension.js: Modification du simulateur pour ${statutId}`);
            
            // Sauvegarder la fonction originale
            window.statutsComplets[statutId].originalSimuler = window.statutsComplets[statutId].simuler;
            
            // Remplacer par une nouvelle fonction qui inclut les options sectorielles
            window.statutsComplets[statutId].simuler = function() {
                console.log(`fiscal-guide-extension.js: Simulation ${statutId} avec options sectorielles`);
                
                // Récupérer les paramètres sectoriels
                const secteurOptions = window.sectorOptions || {
                    secteur: "Tous",
                    taille: "<50"
                };
                
                console.log(`fiscal-guide-extension.js: Options sectorielles utilisées pour ${statutId}:`, secteurOptions);
                
                // Récupérer les paramètres originaux
                const originalParams = { ...arguments[0] };
                
                // Ajouter les paramètres sectoriels
                const newParams = {
                    ...originalParams,
                    secteur: secteurOptions.secteur,
                    taille: secteurOptions.taille
                };
                
                console.log(`fiscal-guide-extension.js: Paramètres pour ${statutId}:`, newParams);
                
                // Appeler la fonction originale avec les nouveaux paramètres
                return window.statutsComplets[statutId].originalSimuler(newParams);
            };
        }
    });
    
    console.log("fiscal-guide-extension.js: Modification des simulateurs terminée");
}