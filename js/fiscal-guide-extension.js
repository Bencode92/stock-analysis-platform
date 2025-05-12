// fiscal-guide-extension.js - Extension des fonctionnalités du guide fiscal
// Version 1.9 - Mai 2025 - Correction critique du problème de mise à jour du net en poche

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
    
    // NE PAS neutraliser la fonction setupSectorOptions de fiscal-guide.js
    // Nous voulons maintenant qu'elle fonctionne correctement
    
    // Vérifier si le simulateur existe dans le DOM
    if (!document.getElementById('fiscal-simulator')) {
        console.log("fiscal-guide-extension.js: Simulateur fiscal non trouvé dans le DOM");
        return;
    }
    
    console.log("fiscal-guide-extension.js: Simulateur fiscal trouvé, ajout des options sectorielles");
    
    // Créer l'objet global pour stocker les résultats de simulation
    window.simulationResults = {};
    
    // Ajouter les options sectorielles pour SASU/SAS
    addSectorOptions();
}

// Ajouter les options sectorielles pour SASU/SAS
function addSectorOptions() {
    // Pour éviter que setupSectorOptions de fiscal-guide.js ne s'exécute à nouveau plus tard
    // Mais sans neutraliser sa fonctionnalité
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
            
            // CORRECTION: Forcer un nettoyage complet du cache et recalcul total
            clearCacheAndRunComparison();
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
            
            // CORRECTION: Forcer un nettoyage complet du cache et recalcul total
            clearCacheAndRunComparison();
        });
    }
    
    // CORRECTION: Ne pas modifier runComparison, mais plutôt observer les changements dans le DOM
    setupMutationObserver();
}

// NOUVEAU: Nettoyage complet du cache et recalcul
function clearCacheAndRunComparison() {
    console.log("fiscal-guide-extension.js: Nettoyage complet du cache et recalcul");
    
    // Vider le cache des résultats
    window.simulationResults = {};
    
    // Vider complètement le tableau de résultats
    const resultsBody = document.getElementById('sim-results-body');
    if (resultsBody) {
        resultsBody.innerHTML = '';
    }
    
    // Vider tous les caches potentiels
    if (window.FiscalUtils) {
        if (window.FiscalUtils._cache) window.FiscalUtils._cache = {};
        if (window.FiscalUtils._chargesCache) window.FiscalUtils._chargesCache = {};
    }
    
    // Exécuter la simulation
    if (typeof window.runComparison === 'function') {
        // Petit délai pour s'assurer que tout est prêt
        setTimeout(() => {
            try {
                window.runComparison();
                console.log("fiscal-guide-extension.js: Comparaison relancée avec succès");
                
                // CORRECTION CRITIQUE: Forcer l'exécution de updateSectorDetails même si 
                // MutationObserver ne détecte pas de changement
                updateSectorDetails();
                
            } catch (error) {
                console.error("fiscal-guide-extension.js: Erreur lors du recalcul:", error);
            }
        }, 100);
    }
}

// NOUVEAU: Configuration d'un observateur de mutations pour détecter les changements dans le tableau
function setupMutationObserver() {
    console.log("fiscal-guide-extension.js: Configuration de l'observateur de mutations");
    
    // Cibler le tableau des résultats
    const resultsTable = document.getElementById('sim-results');
    if (!resultsTable) {
        console.log("fiscal-guide-extension.js: Tableau des résultats non trouvé, nouvel essai plus tard");
        setTimeout(setupMutationObserver, 1000);
        return;
    }
    
    // Créer un observateur de mutations pour détecter les changements dans le tableau
    const observer = new MutationObserver((mutations) => {
        console.log("fiscal-guide-extension.js: Mutation détectée dans le tableau");
        
        // Pour chaque mutation
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Si de nouvelles lignes ont été ajoutées, actualiser les détails sectoriels
                updateSectorDetails();
            }
        });
    });
    
    // Options de l'observateur (observer les changements dans les enfants)
    const config = { childList: true, subtree: true };
    
    // Démarrer l'observation
    observer.observe(resultsTable, config);
    console.log("fiscal-guide-extension.js: Observateur de mutations configuré pour le tableau");
}

// NOUVEAU: Mise à jour des détails sectoriels dans le tableau
function updateSectorDetails() {
    console.log("fiscal-guide-extension.js: Mise à jour des détails sectoriels");
    
    // Attendre un peu que le tableau soit complètement chargé
    setTimeout(() => {
        try {
            // Liste des statuts affectés par les options sectorielles
            const statutsImpactes = ['sasu', 'sas', 'sa', 'selas'];
            
            // Pour chaque statut impacté
            statutsImpactes.forEach(statutId => {
                // Récupérer la cellule "Net en poche"
                const cellules = document.querySelectorAll(`.show-detail-btn[data-statut="${statutId}"]`);
                
                // S'il y a des cellules
                if (cellules.length > 0) {
                    // CORRECTION: Sécurisation de l'accès à statutsComplets
                    // Traiter le cas où statutsComplets n'est pas disponible
                    if (!window.statutsComplets || !window.statutsComplets[statutId]) {
                        console.warn(`fiscal-guide-extension.js: statut ${statutId} non défini dans statutsComplets`);
                        
                        // Simuler directement sans passer par statutsComplets
                        try {
                            // Simuler avec les options sectorielles actuelles
                            let simulationFunc;
                            switch(statutId) {
                                case 'sasu': simulationFunc = 'simulerSASU'; break;
                                case 'sas': simulationFunc = 'simulerSAS'; break;
                                case 'sa': simulationFunc = 'simulerSA'; break;
                                case 'selas': simulationFunc = 'simulerSELAS'; break;
                                default: simulationFunc = 'simulerSASU';
                            }
                            
                            if (window.SimulationsFiscales && typeof window.SimulationsFiscales[simulationFunc] === 'function') {
                                const result = window.SimulationsFiscales[simulationFunc]({
                                    ca: parseFloat(document.getElementById('sim-ca').value) || 50000,
                                    tauxMarge: parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3,
                                    tauxRemuneration: parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7,
                                    tmiActuel: parseFloat(document.getElementById('sim-tmi').value) || 30,
                                    secteur: window.sectorOptions?.secteur || "Tous",
                                    taille: window.sectorOptions?.taille || "<50"
                                });
                                
                                updateCellWithResult(cellules, result);
                            }
                        } catch (error) {
                            console.error(`fiscal-guide-extension.js: Erreur lors de la simulation directe de ${statutId}:`, error);
                        }
                        return;
                    }
                    
                    // Forcer une nouvelle simulation complète avec les paramètres sectoriels actuels
                    try {
                        // Simuler avec les options sectorielles actuelles
                        const result = window.SimulationsFiscales[`simuler${statutId.charAt(0).toUpperCase() + statutId.slice(1)}`]({
                            ca: parseFloat(document.getElementById('sim-ca').value) || 50000,
                            tauxMarge: parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3,
                            tauxRemuneration: parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7,
                            tmiActuel: parseFloat(document.getElementById('sim-tmi').value) || 30,
                            secteur: window.sectorOptions?.secteur || "Tous",
                            taille: window.sectorOptions?.taille || "<50"
                        });
                        
                        updateCellWithResult(cellules, result);
                    } catch (error) {
                        console.error(`fiscal-guide-extension.js: Erreur lors de la mise à jour de ${statutId}:`, error);
                    }
                }
            });
        } catch (error) {
            console.error("fiscal-guide-extension.js: Erreur lors de la mise à jour des détails sectoriels:", error);
        }
    }, 200);
}

// Fonction utilitaire pour mettre à jour les cellules avec un résultat de simulation
function updateCellWithResult(cellules, result) {
    // Si la simulation a réussi
    if (result && result.revenuNetTotal) {
        // Formatter le montant
        const formatter = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        
        // Mettre à jour chaque cellule
        cellules.forEach(cell => {
            // PARTIE CRITIQUE: Mise à jour directe de la valeur et du texte
            const formattedValue = formatter.format(result.revenuNetTotal);
            
            // Afficher log détaillé des valeurs
            console.log(`fiscal-guide-extension.js: Mise à jour cellule ${cell.dataset.statut} - Nouveau net: ${formattedValue}`);
            console.log(`fiscal-guide-extension.js: Secteur appliqué: ${result.secteur}, Taille: ${result.taille}`);
            
            // Supprimer l'icône étoile si présente
            const parentNode = cell.parentElement;
            const html = parentNode.innerHTML;
            const starIdx = html.indexOf('<i class="fas fa-star');
            let cleanHtml = html;
            
            if (starIdx >= 0) {
                // Préserver l'étoile pour le meilleur résultat
                const tdElement = cell.closest('td');
                cell.innerHTML = formattedValue;
            } else {
                cell.innerHTML = formattedValue;
            }
            
            // Supprimer les anciennes infos si présentes
            parentNode.querySelectorAll('.text-xs').forEach(el => {
                if (el.innerHTML.includes('secteur') || el.innerHTML.includes('Secteur')) {
                    el.remove();
                }
            });
            
            // Ajouter une indication du secteur appliqué
            const sectorInfo = document.createElement('div');
            sectorInfo.className = 'text-xs text-blue-400 mt-1';
            sectorInfo.innerHTML = `<i class="fas fa-industry mr-1"></i>Secteur: ${result.secteur || window.sectorOptions?.secteur}, Taille: ${result.taille || window.sectorOptions?.taille}`;
            parentNode.appendChild(sectorInfo);
        });
    }
}

// NOUVEAU: Patch direct de FiscalUtils pour garantir l'application correcte des paramètres sectoriels
document.addEventListener('fiscalUtilsReady', function() {
    console.log("fiscal-guide-extension.js: fiscalUtilsReady - Patching de FiscalUtils");
    
    // Patcher optimiserRatioRemuneration pour garantir l'utilisation des secteurs
    if (window.FiscalUtils && !window.FiscalUtils._optimiserPatched) {
        window.FiscalUtils._optimiserPatched = true;
        
        const originalOptimiser = window.FiscalUtils.optimiserRatioRemuneration;
        window.FiscalUtils.optimiserRatioRemuneration = function(params, simulationFunc) {
            // S'assurer que les options sectorielles sont préservées
            const secteurOptions = {
                secteur: window.sectorOptions?.secteur || "Tous",
                taille: window.sectorOptions?.taille || "<50"
            };
            
            // Fusionner avec les paramètres fournis
            const paramsComplets = {
                ...params,
                secteur: params.secteur || secteurOptions.secteur,
                taille: params.taille || secteurOptions.taille
            };
            
            console.log("fiscal-guide-extension.js: optimiserRatioRemuneration avec secteur:", paramsComplets.secteur, paramsComplets.taille);
            
            // Appeler la fonction originale avec les paramètres complétés
            return originalOptimiser.call(window.FiscalUtils, paramsComplets, simulationFunc);
        };
        
        console.log("fiscal-guide-extension.js: optimiserRatioRemuneration patché");
    }
});

// NOUVEAU: Installation de hooks pour s'assurer que showCalculationDetails utilise les bons résultats
document.addEventListener('fiscalUtilsReady', function() {
    // Attendre un peu pour laisser fiscal-guide.js définir toutes ses fonctions
    setTimeout(() => {
        if (typeof window.showCalculationDetails === 'function' && !window._showCalculationDetailsPatched) {
            window._showCalculationDetailsPatched = true;
            
            const originalShowDetails = window.showCalculationDetails;
            window.showCalculationDetails = function(statutId, simulationResults) {
                console.log(`fiscal-guide-extension.js: showCalculationDetails pour ${statutId}`);
                
                // Pour les statuts impactés par le secteur
                if (['sasu', 'sas', 'sa', 'selas'].includes(statutId)) {
                    try {
                        // Lancer une simulation fraîche
                        const result = window.SimulationsFiscales[`simuler${statutId.charAt(0).toUpperCase() + statutId.slice(1)}`]({
                            ca: parseFloat(document.getElementById('sim-ca').value) || 50000,
                            tauxMarge: parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3,
                            tauxRemuneration: parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7,
                            tmiActuel: parseFloat(document.getElementById('sim-tmi').value) || 30,
                            secteur: window.sectorOptions?.secteur || "Tous",
                            taille: window.sectorOptions?.taille || "<50",
                            modeExpert: true
                        });
                        
                        if (result) {
                            // Créer un nouveau tableau de résultats avec cette simulation
                            const newResults = [{
                                statutId: statutId,
                                statut: statutId.toUpperCase(),  // Sera amélioré par la fonction
                                sim: result
                            }];
                            
                            return originalShowDetails(statutId, newResults);
                        }
                    } catch (error) {
                        console.error(`fiscal-guide-extension.js: Erreur lors du recalcul pour ${statutId}:`, error);
                    }
                }
                
                // Pour les autres statuts ou en cas d'erreur, utiliser la fonction originale
                return originalShowDetails(statutId, simulationResults);
            };
            
            console.log("fiscal-guide-extension.js: showCalculationDetails patché");
        }
    }, 2000);
});