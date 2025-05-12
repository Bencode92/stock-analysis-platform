// fiscal-guide-extension.js - Extension des fonctionnalités du guide fiscal
// Version 1.3 - Mai 2025 - Amélioration de la connexion pour options sectorielles

document.addEventListener('DOMContentLoaded', function() {
    console.log("[EXTENSION] Initialisation...");
    
    // Attendre explicitement que les modules fiscaux soient chargés
    let modules = {
        utils: false,
        sims: false
    };
    
    // Écouter les événements des deux modules
    document.addEventListener('fiscalUtilsReady', function() {
        console.log("[EXTENSION] FiscalUtils détecté");
        modules.utils = true;
        checkModulesAndInit();
    });
    
    document.addEventListener('simulationsFiscalesReady', function() {
        console.log("[EXTENSION] SimulationsFiscales détecté");
        modules.sims = true;
        checkModulesAndInit();
    });
    
    // Initialiser quand tous les modules sont prêts
    function checkModulesAndInit() {
        if (modules.utils && modules.sims) {
            console.log("[EXTENSION] Tous les modules détectés, initialisation...");
            // Attendre encore un peu que l'interface soit générée par fiscal-guide.js
            setTimeout(function() {
                initGuideFiscalExtension();
            }, 500);
        }
    }
    
    // Attendre également l'événement de l'onglet Guide fiscal
    const guideTab = document.querySelector('.tab-item:nth-child(3)');
    if (guideTab) {
        guideTab.addEventListener('click', function() {
            console.log("[EXTENSION] Onglet Guide fiscal cliqué");
            setTimeout(function() {
                initGuideFiscalExtension();
            }, 500);
        });
    }
});

function initGuideFiscalExtension() {
    console.log("[EXTENSION] Initialisation des extensions du guide fiscal");
    
    // Vérifier si le simulateur existe dans le DOM
    if (!document.getElementById('fiscal-simulator')) {
        console.log("[EXTENSION] Simulateur fiscal non trouvé dans le DOM");
        return;
    }
    
    console.log("[EXTENSION] Simulateur fiscal trouvé, ajout des options sectorielles");
    
    // Ajouter les options sectorielles pour SASU/SAS
    addSectorOptions();
}

// Ajouter les options sectorielles pour SASU/SAS
function addSectorOptions() {
    // Vérifier si les options ont déjà été ajoutées pour éviter les doublons
    if (document.getElementById('sector-options')) {
        console.log("[EXTENSION] Options sectorielles déjà présentes");
        return;
    }
    
    // Trouver l'endroit où insérer les options sectorielles
    const optionsContainer = document.getElementById('sim-options-container');
    if (!optionsContainer) {
        console.log("[EXTENSION] Conteneur d'options non trouvé");
        return;
    }
    
    console.log("[EXTENSION] Ajout des options sectorielles pour SASU/SAS");
    
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
        
        <div id="sector-impact-info" class="mt-3 p-3 rounded-lg text-sm bg-green-900 bg-opacity-20 border border-green-800 hidden">
            <div class="flex items-start">
                <i class="fas fa-chart-line text-green-400 mr-2 mt-1"></i>
                <div>
                    <p class="font-medium text-green-400">Impact des options sectorielles</p>
                    <p class="sector-impact-details"></p>
                </div>
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
    
    // Trouver où insérer le conteneur d'options sectorielles
    // Idéalement après les options existantes et avant les options micro-entreprise
    const microTypeContainer = optionsContainer.querySelector('div.mt-4');
    if (microTypeContainer) {
        optionsContainer.insertBefore(sectorOptions, microTypeContainer);
    } else {
        optionsContainer.appendChild(sectorOptions);
    }
    
    // Ajouter les écouteurs d'événements
    const secteurSelect = document.getElementById('sim-secteur');
    const tailleSelect = document.getElementById('sim-taille');
    
    if (secteurSelect) {
        secteurSelect.addEventListener('change', function() {
            console.log("[EXTENSION] Secteur changé:", this.value);
            updateSectorImpactInfo();
            // Si runComparison existe, l'appeler pour rafraîchir les résultats
            if (typeof runComparison === 'function') {
                runComparison();
            }
        });
    }
    
    if (tailleSelect) {
        tailleSelect.addEventListener('change', function() {
            console.log("[EXTENSION] Taille changée:", this.value);
            updateSectorImpactInfo();
            // Si runComparison existe, l'appeler pour rafraîchir les résultats
            if (typeof runComparison === 'function') {
                runComparison();
            }
        });
    }
    
    // Afficher l'impact des options sectorielles
    updateSectorImpactInfo();
    
    // Modifier la fonction runComparison pour intégrer ces nouveaux paramètres
    // Ceci est fait après que la fonction originale soit définie dans fiscal-guide.js
    modifyRunComparisonFunction();
}

// Afficher l'impact des options sectorielles
function updateSectorImpactInfo() {
    const secteur = document.getElementById('sim-secteur')?.value || "Tous";
    const taille = document.getElementById('sim-taille')?.value || "<50";
    
    if (window.FiscalUtils) {
        // Calculer l'impact sur un salaire de référence
        const salaireRef = 50000;
        const chargesRef = window.FiscalUtils.calculChargesSalariales(salaireRef, { secteur: "Tous", taille: "<50" });
        const chargesSecteur = window.FiscalUtils.calculChargesSalariales(salaireRef, { secteur, taille });
        
        // Calculer la différence en pourcentage
        const diffPatronale = ((chargesSecteur.tauxPatronal - chargesRef.tauxPatronal) * 100).toFixed(1);
        const impactAnnuel = Math.round((chargesSecteur.patronales - chargesRef.patronales));
        
        const infoContainer = document.getElementById('sector-impact-info');
        const infoDetails = document.querySelector('.sector-impact-details');
        
        if (infoContainer && infoDetails) {
            infoContainer.classList.remove('hidden');
            
            let infoText = '';
            if (secteur === "Tous" && taille === "<50") {
                infoText = `Taux de référence: charges patronales ${(chargesRef.tauxPatronal*100).toFixed(1)}%, charges salariales ${(chargesRef.tauxSalarial*100).toFixed(1)}%`;
            } else {
                const positifOuNegatif = diffPatronale >= 0 ? 'plus élevé' : 'plus bas';
                infoText = `Secteur <strong>${secteur}</strong>, taille <strong>${taille}</strong>: taux patronal <strong>${Math.abs(diffPatronale)}%</strong> ${positifOuNegatif} que la référence (impact annuel: ${impactAnnuel > 0 ? '+' : ''}${impactAnnuel}€ sur un salaire de ${salaireRef}€)`;
            }
            
            infoDetails.innerHTML = infoText;
        }
    }
}

// Modifier la fonction runComparison pour intégrer les paramètres sectoriels
function modifyRunComparisonFunction() {
    console.log("[EXTENSION] Tentative de modification de la fonction runComparison");
    
    // Sauvegarder la fonction originale
    if (typeof window.originalRunComparison !== 'function' && typeof runComparison === 'function') {
        window.originalRunComparison = runComparison;
        
        // Redéfinir la fonction avec les nouveaux paramètres
        window.runComparison = function() {
            console.log("[EXTENSION] Fonction runComparison modifiée appelée");
            
            // Récupérer les options sectorielles
            const secteur = document.getElementById('sim-secteur')?.value || "Tous";
            const taille = document.getElementById('sim-taille')?.value || "<50";
            console.log("[EXTENSION] Options sectorielles -", secteur, taille);
            
            // Stocker les valeurs dans l'objet window pour le simulateur
            window.sectorOptions = {
                secteur: secteur,
                taille: taille
            };
            
            // Appeler la fonction originale
            window.originalRunComparison();
            
            // Après l'exécution, mettre à jour l'affichage pour montrer l'impact sectoriel
            setTimeout(updateResultsWithSectorInfo, 100);
        };
        
        console.log("[EXTENSION] Fonction runComparison modifiée avec succès");
    } else if (typeof window.originalRunComparison === 'function') {
        console.log("[EXTENSION] La fonction runComparison a déjà été modifiée");
    } else {
        console.log("[EXTENSION] Impossible de trouver la fonction runComparison à modifier");
        
        // Si nous n'avons pas pu modifier la fonction immédiatement, attendre et réessayer
        setTimeout(modifyRunComparisonFunction, 1000);
    }
    
    // Également modifier la fonction statutsComplets.sasu.simuler si elle existe
    modifyStatutsComplets();
}

// Mise à jour des résultats pour afficher l'impact sectoriel
function updateResultsWithSectorInfo() {
    // Trouver les lignes de résultats SASU/SAS
    const resultsRows = document.querySelectorAll('#sim-results-body tr');
    
    resultsRows.forEach(row => {
        // Vérifier si c'est une ligne SASU ou SAS
        const statutCell = row.querySelector('td:first-child');
        if (statutCell && (statutCell.textContent.includes('SASU') || 
                           statutCell.textContent.includes('SAS') || 
                           statutCell.textContent.includes('SELAS'))) {
            
            // Ajouter une indication visuelle que les options sectorielles sont appliquées
            const secteur = window.sectorOptions?.secteur || "Tous";
            if (secteur !== "Tous") {
                // Ajouter un badge sectoriel s'il n'existe pas déjà
                if (!statutCell.querySelector('.sector-badge')) {
                    const sectorBadge = document.createElement('span');
                    sectorBadge.className = 'sector-badge text-xs ml-2 px-1 py-0.5 rounded-md bg-green-900 bg-opacity-30 text-green-400';
                    sectorBadge.innerHTML = `<i class="fas fa-industry text-xs mr-1"></i>${secteur}`;
                    statutCell.appendChild(sectorBadge);
                }
            }
        }
    });
}

// Modifier statutsComplets pour intégrer les paramètres sectoriels
function modifyStatutsComplets() {
    // Attendre que statutsComplets soit défini
    if (typeof window.statutsComplets === 'undefined') {
        console.log("[EXTENSION] Attente de statutsComplets...");
        setTimeout(modifyStatutsComplets, 500);
        return;
    }
    
    console.log("[EXTENSION] Modification des simulateurs de statutsComplets");
    
    // Liste des statuts à modifier (tous ceux qui utilisent les charges d'assimilé salarié)
    const statutsToModify = ['sasu', 'sas', 'sa', 'selas', 'sarl'];
    
    statutsToModify.forEach(statutId => {
        if (window.statutsComplets[statutId] && typeof window.statutsComplets[statutId].originalSimuler === 'undefined') {
            console.log(`[EXTENSION] Modification du simulateur pour ${statutId}`);
            
            // Sauvegarder la fonction originale
            window.statutsComplets[statutId].originalSimuler = window.statutsComplets[statutId].simuler;
            
            // Remplacer par une nouvelle fonction qui inclut les options sectorielles
            window.statutsComplets[statutId].simuler = function() {
                console.log(`[EXTENSION] Simulation ${statutId} avec options sectorielles`);
                
                // Récupérer les paramètres sectoriels
                const secteurOptions = window.sectorOptions || {
                    secteur: "Tous",
                    taille: "<50"
                };
                
                // Récupérer les paramètres originaux
                const originalParams = { ...arguments[0] };
                
                // Ajouter les paramètres sectoriels
                const newParams = {
                    ...originalParams,
                    secteur: secteurOptions.secteur,
                    taille: secteurOptions.taille
                };
                
                console.log(`[EXTENSION] Paramètres pour ${statutId}:`, newParams);
                
                // Appeler la fonction originale avec les nouveaux paramètres
                return window.statutsComplets[statutId].originalSimuler(newParams);
            };
        }
    });
    
    console.log("[EXTENSION] Modification des simulateurs terminée");
}
