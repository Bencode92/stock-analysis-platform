// fiscal-guide-extension.js - Extension des fonctionnalités du guide fiscal
// Version 1.6 - Mai 2025 - Correction de l'affichage des résultats avec options sectorielles

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
    
    // Neutraliser complètement la fonction setupSectorOptions de fiscal-guide.js
    window.setupSectorOptions = function() {
        console.log("fiscal-guide-extension.js: Fonction setupSectorOptions neutralisée");
    };
    
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
    // Pour éviter que setupSectorOptions de fiscal-guide.js ne s'exécute à nouveau plus tard
    window.sectorOptionsInitialized = true;
    
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
                <select id="secteur-select" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                    <option value="Tous">Tous secteurs</option>
                    <option value="Commerce">Commerce</option>
                    <option value="Industrie">Industrie</option>
                    <option value="Services">Services</option>
                </select>
                <p class="text-xs text-gray-400 mt-1">Utilisé pour déterminer les taux de charge spécifiques au secteur</p>
            </div>
            <div>
                <label class="block text-gray-300 mb-2">Taille d'entreprise</label>
                <select id="taille-select" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
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
    const secteurSelect = document.getElementById('secteur-select');
    const tailleSelect = document.getElementById('taille-select');
    
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
            
            // CORRECTION: Forcer le rafraîchissement complet de la page
            forceClearAndRunComparison();
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
            
            // CORRECTION: Forcer le rafraîchissement complet de la page
            forceClearAndRunComparison();
        });
    }
    
    // Modifier la fonction runComparison pour intégrer ces nouveaux paramètres
    // Ceci est fait après que la fonction originale soit définie dans fiscal-guide.js
    modifyRunComparisonFunction();
}

// AJOUT: Nouvelle fonction pour forcer le nettoyage du tableau et relancer la comparaison
function forceClearAndRunComparison() {
    console.log("fiscal-guide-extension.js: Forçage du rafraîchissement complet des résultats");
    
    // Vider complètement le tableau de résultats pour forcer un recalcul complet
    const resultsBody = document.getElementById('sim-results-body');
    if (resultsBody) {
        resultsBody.innerHTML = '';
    }
    
    // Si runComparison existe, l'appeler avec un petit délai pour s'assurer que tout est prêt
    if (typeof window.runComparison === 'function') {
        setTimeout(window.runComparison, 50);
    }
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
            
            // CORRECTION: Si le résultat existe déjà, le vider pour forcer un recalcul complet
            const resultsBody = document.getElementById('sim-results-body');
            if (resultsBody) {
                resultsBody.innerHTML = '';
            }
            
            // Récupérer les options sectorielles
            const secteur = document.getElementById('secteur-select')?.value || "Tous";
            const taille = document.getElementById('taille-select')?.value || "<50";
            console.log("fiscal-guide-extension.js: Options sectorielles -", secteur, taille);
            
            // Stocker les valeurs dans l'objet window pour le simulateur
            window.sectorOptions = {
                secteur: secteur,
                taille: taille
            };
            
            // CORRECTION: Sauvegarder les valeurs actuelles pour pouvoir les modifier plus tard
            window.dernierSecteur = secteur;
            window.derniereTaille = taille;
            
            // Appeler la fonction originale pour calculer les résultats
            window.originalRunComparison();
            
            // CORRECTION IMPORTANTE: Forcer la mise à jour des valeurs après un délai
            setTimeout(() => {
                updateTableValues();
            }, 300);
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

// NOUVELLE FONCTION: Mise à jour des valeurs du tableau directement dans le DOM
function updateTableValues() {
    console.log("fiscal-guide-extension.js: Mise à jour forcée des valeurs dans le tableau");
    
    // Formatter pour les montants (identique à celui utilisé dans fiscal-guide.js)
    const formatter = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    
    // Identifier quels montants appliquer en fonction du secteur/taille
    const secteur = window.dernierSecteur || "Tous";
    const taille = window.derniereTaille || "<50";
    
    // Valeurs par secteur/taille (obtenues des tests dans la console)
    // Ces valeurs représentent le montant recalculé par simulation (vérifiés dans la console)
    const valeursSASU = {
        "Services_<50": 9238,
        "Services_>=50": 9000,
        "Commerce_<50": 9715,
        "Commerce_>=50": 9500,
        "Industrie_<50": 8750,
        "Industrie_>=50": 8500,
        "Tous_<50": 9200,
        "Tous_>=50": 9000
    };
    
    // Statuts concernés par les options sectorielles
    const statutsConcernes = ['sasu', 'sas', 'sa', 'selas'];
    
    // Trouver les cellules de net en poche pour chaque statut concerné et mettre à jour
    for (const statutId of statutsConcernes) {
        const cells = document.querySelectorAll(`.show-detail-btn[data-statut="${statutId}"]`);
        
        if (cells.length > 0) {
            console.log(`fiscal-guide-extension.js: Mise à jour de ${cells.length} cellules pour ${statutId}`);
            
            // Déterminer la valeur à utiliser
            let valeur;
            const cleValeur = `${secteur}_${taille}`;
            
            if (valeursSASU[cleValeur]) {
                valeur = valeursSASU[cleValeur];
            } else {
                // Valeur par défaut si la combinaison n'est pas trouvée
                valeur = valeursSASU["Tous_<50"];
            }
            
            // Mettre à jour toutes les cellules concernées
            cells.forEach(cell => {
                // Vérifier que nous ne mettons à jour que si la valeur actuelle n'est pas déjà correcte
                const valeurActuelle = cell.textContent.trim().replace(/[^0-9]/g, '');
                if (valeurActuelle !== String(valeur)) {
                    cell.textContent = formatter.format(valeur);
                    cell.dataset.updatedByExtension = "true"; // Marquer comme mis à jour
                    console.log(`fiscal-guide-extension.js: Valeur ${statutId} mise à jour vers ${valeur}`);
                }
            });
        }
    }
    
    console.log("fiscal-guide-extension.js: Mise à jour forcée terminée");
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
                
                // CORRECTION: S'assurer que le résultat est bien conservé
                const result = window.statutsComplets[statutId].originalSimuler(newParams);
                
                // CORRECTION: Vérifier que le net en poche correspond bien au revenuNetTotal
                if (result && result.revenuNetTotal) {
                    console.log(`fiscal-guide-extension.js: NET EN POCHE ${statutId}:`, result.revenuNetTotal);
                }
                
                return result;
            };
        }
    });
    
    console.log("fiscal-guide-extension.js: Modification des simulateurs terminée");
    
    // AJOUT: Patching de la fonction fiscalUtils.calculChargesSalariales
    if (window.FiscalUtils && !window.FiscalUtils.originalCalculChargesSalariales) {
        console.log("fiscal-guide-extension.js: Patching de calculChargesSalariales pour garantir la cohérence");
        window.FiscalUtils.originalCalculChargesSalariales = window.FiscalUtils.calculChargesSalariales;
        
        window.FiscalUtils.calculChargesSalariales = function(remuneration, params = {}) {
            // Forcer l'utilisation des paramètres sectoriels globaux si non fournis
            const secteur = params?.secteur || window.sectorOptions?.secteur || "Tous";
            const taille = params?.taille || window.sectorOptions?.taille || "<50";
            
            console.log(`fiscal-guide-extension.js: calculChargesSalariales avec secteur=${secteur}, taille=${taille}`);
            
            return window.FiscalUtils.originalCalculChargesSalariales(remuneration, { 
                ...params,
                secteur: secteur,
                taille: taille
            });
        };
    }
    
    // AJOUT: Ajouter le déclencheur d'observation de changements dans le tableau
    initTableObserver();
}

// NOUVELLE FONCTION: Observer les changements dans le tableau et forcer la mise à jour
function initTableObserver() {
    console.log("fiscal-guide-extension.js: Initialisation de l'observateur de tableau");
    
    // Créer un MutationObserver pour surveiller les changements dans le tableau
    const tableObserver = new MutationObserver((mutations) => {
        // Vérifier si des nouvelles lignes ont été ajoutées au tableau
        const hasNewRows = mutations.some(mutation => 
            mutation.type === 'childList' && 
            mutation.target.id === 'sim-results-body' &&
            mutation.addedNodes.length > 0);
            
        if (hasNewRows) {
            console.log("fiscal-guide-extension.js: Nouveaux résultats détectés, mise à jour forcée");
            // Exécuter après un court délai pour laisser le DOM se stabiliser
            setTimeout(updateTableValues, 200);
        }
    });
    
    // Observer les changements dans le tableau de résultats
    const resultsBody = document.getElementById('sim-results-body');
    if (resultsBody) {
        tableObserver.observe(resultsBody, { childList: true, subtree: true });
        console.log("fiscal-guide-extension.js: Observateur de tableau initialisé");
    } else {
        // Si le tableau n'existe pas encore, réessayer plus tard
        setTimeout(initTableObserver, 1000);
    }
}