// fiscal-guide-extension.js - Extension des fonctionnalités du guide fiscal
// Version 2.0 - Mai 2025 - Correction de l'affichage et des détails de calcul

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
    
    // Créer l'objet global pour stocker les résultats de simulation
    window.simulationResults = {};
    
    // Ajouter les options sectorielles pour SASU/SAS
    addSectorOptions();
    
    // NOUVEAU: Surcharger directement la fonction runComparison pour garantir la récupération des options
    patchRunComparison();
}

// NOUVEAU: Patcher directement la fonction runComparison
function patchRunComparison() {
    // Attendre que la fonction runComparison soit définie
    if (typeof window.runComparison !== 'function') {
        setTimeout(patchRunComparison, 500);
        return;
    }
    
    if (window._runComparisonPatched) return;
    
    console.log("fiscal-guide-extension.js: Patching de la fonction runComparison");
    
    // Sauvegarder la fonction originale
    const originalRunComparison = window.runComparison;
    
    // Remplacer par notre version
    window.runComparison = function() {
        // S'assurer que les options sectorielles sont définies
        if (!window.sectorOptions) {
            window.sectorOptions = { secteur: "Tous", taille: "<50" };
        }
        
        console.log(`fiscal-guide-extension.js: runComparison patché - secteur=${window.sectorOptions.secteur}, taille=${window.sectorOptions.taille}`);
        
        // Appeler la fonction originale
        const result = originalRunComparison.apply(this, arguments);
        
        // Appliquer nos modifications après exécution
        setTimeout(() => {
            updateSectorDetails(true); // Force update
        }, 300);
        
        return result;
    };
    
    window._runComparisonPatched = true;
    console.log("fiscal-guide-extension.js: runComparison patché avec succès");
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
        
        <!-- NOUVEAU: Ajout d'un bouton d'actualisation -->
        <div class="mt-3">
            <button id="refresh-sector-button" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md shadow-sm">
                <i class="fas fa-sync-alt mr-2"></i> Actualiser avec ces paramètres
            </button>
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
    const refreshButton = document.getElementById('refresh-sector-button');
    
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
        });
    }
    
    // Ajouter un événement au bouton de rafraîchissement
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            console.log("fiscal-guide-extension.js: Bouton d'actualisation cliqué");
            clearCacheAndRunComparison();
        });
    }
    
    // CORRECTION: Ne pas modifier runComparison, mais plutôt observer les changements dans le DOM
    setupMutationObserver();
}

// NOUVEAU: Nettoyage complet du cache et recalcul
function clearCacheAndRunComparison() {
    console.log("fiscal-guide-extension.js: Nettoyage complet du cache et recalcul");
    
    // NOUVEAU: Afficher un indicateur visuel de chargement
    showLoadingIndicator();
    
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
                setTimeout(() => {
                    updateSectorDetails(true);
                    hideLoadingIndicator();
                }, 500);
                
            } catch (error) {
                console.error("fiscal-guide-extension.js: Erreur lors du recalcul:", error);
                hideLoadingIndicator();
            }
        }, 100);
    }
}

// NOUVEAU: Afficher un indicateur de chargement
function showLoadingIndicator() {
    // Supprimer l'ancien indicateur s'il existe
    hideLoadingIndicator();
    
    // Créer l'indicateur
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'sector-loading-indicator';
    loadingIndicator.className = 'fixed top-10 right-10 bg-blue-900 bg-opacity-90 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center';
    loadingIndicator.innerHTML = `
        <div class="spinner mr-3"></div>
        <span>Recalcul en cours avec paramètres sectoriels...</span>
    `;
    
    // Ajouter un style pour l'animation
    const style = document.createElement('style');
    style.textContent = `
        .spinner {
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 3px solid #fff;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    
    // Ajouter au DOM
    document.body.appendChild(loadingIndicator);
}

// NOUVEAU: Masquer l'indicateur de chargement
function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('sector-loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
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

// MODIFIÉ: Mise à jour des détails sectoriels dans le tableau
function updateSectorDetails(forceUpdate = false) {
    console.log("fiscal-guide-extension.js: Mise à jour des détails sectoriels (forceUpdate="+forceUpdate+")");
    
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
                    // Force une nouvelle simulation directe
                    try {
                        // Récupérer les valeurs actuelles des champs
                        const ca = parseFloat(document.getElementById('sim-ca').value) || 50000;
                        const tauxMarge = parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3;
                        const tauxRemuneration = parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7;
                        const tmiActuel = parseFloat(document.getElementById('sim-tmi').value) || 30;
                        
                        // S'assurer que les options sectorielles sont définies
                        if (!window.sectorOptions) {
                            window.sectorOptions = { 
                                secteur: "Tous", 
                                taille: "<50" 
                            };
                        }
                        
                        // Log pour débogage
                        console.log(`fiscal-guide-extension.js: Simulation ${statutId} avec:`, {
                            ca, tauxMarge, tauxRemuneration, tmiActuel,
                            secteur: window.sectorOptions.secteur,
                            taille: window.sectorOptions.taille
                        });
                        
                        // Définir la méthode de simulation à utiliser
                        let simulationFunc;
                        switch(statutId) {
                            case 'sasu': simulationFunc = 'simulerSASU'; break;
                            case 'sas': simulationFunc = 'simulerSAS'; break;
                            case 'sa': simulationFunc = 'simulerSA'; break;
                            case 'selas': simulationFunc = 'simulerSELAS'; break;
                            default: simulationFunc = 'simulerSASU';
                        }
                        
                        // Vérifier que la méthode existe
                        if (window.SimulationsFiscales && typeof window.SimulationsFiscales[simulationFunc] === 'function') {
                            // NOUVEAU: Simulation avec options sectorielles explicites
                            const result = window.SimulationsFiscales[simulationFunc]({
                                ca: ca,
                                tauxMarge: tauxMarge,
                                tauxRemuneration: tauxRemuneration,
                                tmiActuel: tmiActuel,
                                // Paramètres sectoriels explicites
                                secteur: window.sectorOptions.secteur,
                                taille: window.sectorOptions.taille
                            });
                            
                            // Si la simulation réussit, mettre à jour les cellules
                            if (result && typeof result.revenuNetTotal === 'number') {
                                // NOUVEAU: Toujours forcer le résultat
                                updateCellWithResult(cellules, result);
                                
                                // NOUVEAU: Mettre à jour le détail de calcul s'il est ouvert
                                updateOpenDetailModals(statutId, result);
                                
                                // NOUVEAU: Vérifier le changement de valeur
                                const oldValue = window.simulationResults[statutId]?.revenuNetTotal || 0;
                                const newValue = result.revenuNetTotal;
                                
                                // Stocker le résultat pour référence ultérieure
                                window.simulationResults[statutId] = result;
                                
                                if (oldValue !== newValue) {
                                    console.log(`fiscal-guide-extension.js: Valeur modifiée pour ${statutId} - Avant: ${oldValue}, Après: ${newValue}`);
                                    
                                    // NOUVEAU: Mettre en surbrillance le changement
                                    highlightChangedValue(cellules, oldValue, newValue);
                                }
                            } else {
                                console.error(`fiscal-guide-extension.js: Simulation ${statutId} a échoué ou manque revenuNetTotal:`, result);
                            }
                        } else {
                            console.error(`fiscal-guide-extension.js: Méthode ${simulationFunc} non trouvée`);
                        }
                    } catch (error) {
                        console.error(`fiscal-guide-extension.js: Erreur lors de la simulation de ${statutId}:`, error);
                    }
                }
            });
        } catch (error) {
            console.error("fiscal-guide-extension.js: Erreur lors de la mise à jour des détails sectoriels:", error);
        }
    }, 200);
}

// NOUVEAU: Mettre en surbrillance les valeurs modifiées
function highlightChangedValue(cellules, oldValue, newValue) {
    // Ne rien faire si les valeurs sont identiques
    if (oldValue === newValue) return;
    
    cellules.forEach(cell => {
        // Ajouter une classe pour l'animation
        cell.classList.add('value-changed');
        
        // Supprimer la classe après l'animation
        setTimeout(() => {
            cell.classList.remove('value-changed');
        }, 2000);
    });
    
    // Ajouter le style s'il n'existe pas
    if (!document.getElementById('highlight-style')) {
        const style = document.createElement('style');
        style.id = 'highlight-style';
        style.textContent = `
            .value-changed {
                animation: highlight-pulse 2s ease-in-out;
            }
            
            @keyframes highlight-pulse {
                0% { background-color: transparent; }
                30% { background-color: rgba(0, 255, 135, 0.3); }
                100% { background-color: transparent; }
            }
        `;
        document.head.appendChild(style);
    }
}

// NOUVEAU: Mettre à jour les modals de détail ouverts
function updateOpenDetailModals(statutId, result) {
    // Vérifier si un modal de détail est ouvert
    const detailModal = document.querySelector('.detail-modal');
    if (!detailModal) return;
    
    // Vérifier s'il s'agit du bon statut
    const modalTitle = detailModal.querySelector('h2');
    if (!modalTitle || !modalTitle.textContent.toLowerCase().includes(statutId.toLowerCase())) {
        return;
    }
    
    console.log(`fiscal-guide-extension.js: Mise à jour du modal de détail pour ${statutId}`);
    
    // Mettre à jour les valeurs dans le modal
    try {
        // Formater les nombres
        const formatter = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        
        // Mettre à jour le revenu net total
        const netTotal = detailModal.querySelector('strong');
        if (netTotal && netTotal.textContent.includes('Revenu net total')) {
            const nextCell = netTotal.closest('tr').querySelector('td:last-child strong');
            if (nextCell) {
                nextCell.textContent = formatter.format(result.revenuNetTotal);
            }
        }
        
        // Mettre à jour les valeurs spécifiques au statut
        if (statutId === 'sasu' || statutId === 'sas' || statutId === 'sa' || statutId === 'selas') {
            // 1. Mettre à jour les charges patronales
            updateDetailModalValue(detailModal, 'Charges patronales', formatter.format(result.chargesPatronales));
            
            // 2. Mettre à jour les charges salariales
            updateDetailModalValue(detailModal, 'Charges salariales', formatter.format(result.chargesSalariales));
            
            // 3. Mettre à jour le salaire net
            updateDetailModalValue(detailModal, 'Salaire net avant IR', formatter.format(result.salaireNet));
            
            // 4. Mettre à jour le salaire net après IR
            updateDetailModalValue(detailModal, 'Salaire net après IR', formatter.format(result.salaireNetApresIR));
            
            // 5. Mettre à jour les dividendes nets
            updateDetailModalValue(detailModal, 'Dividendes nets', formatter.format(result.dividendesNets));
        }
        
        // Ajouter une ligne d'information sur le secteur s'il n'existe pas déjà
        const sectorInfo = detailModal.querySelector('.sector-info');
        if (!sectorInfo) {
            const newInfo = document.createElement('div');
            newInfo.className = 'sector-info mt-4 p-3 bg-blue-900 bg-opacity-20 rounded-lg text-sm';
            newInfo.innerHTML = `
                <strong class="text-blue-400">Paramètres sectoriels appliqués:</strong>
                <p>Secteur: ${result.secteur || window.sectorOptions.secteur}, 
                   Taille: ${result.taille || window.sectorOptions.taille}
                   ${result.infoCharges ? `<br>Description: ${result.infoCharges.description}` : ''}
                </p>
            `;
            detailModal.querySelector('.detail-content').appendChild(newInfo);
        } else {
            sectorInfo.innerHTML = `
                <strong class="text-blue-400">Paramètres sectoriels appliqués:</strong>
                <p>Secteur: ${result.secteur || window.sectorOptions.secteur}, 
                   Taille: ${result.taille || window.sectorOptions.taille}
                   ${result.infoCharges ? `<br>Description: ${result.infoCharges.description}` : ''}
                </p>
            `;
        }
    } catch (error) {
        console.error(`fiscal-guide-extension.js: Erreur lors de la mise à jour du modal de détail:`, error);
    }
}

// NOUVEAU: Mettre à jour une valeur dans le modal de détail
function updateDetailModalValue(modal, label, value) {
    const rows = modal.querySelectorAll('tr');
    for (const row of rows) {
        const firstCell = row.querySelector('td:first-child');
        if (firstCell && firstCell.textContent.includes(label)) {
            const valueCell = row.querySelector('td:last-child');
            if (valueCell) {
                valueCell.textContent = value;
                // Ajouter un effet visuel
                valueCell.style.backgroundColor = 'rgba(0, 255, 135, 0.1)';
                setTimeout(() => {
                    valueCell.style.backgroundColor = '';
                }, 2000);
            }
            break;
        }
    }
}

// Fonction utilitaire pour mettre à jour les cellules avec un résultat de simulation
function updateCellWithResult(cellules, result) {
    // Si la simulation a réussi
    if (result && typeof result.revenuNetTotal === 'number') {
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
            console.log(`fiscal-guide-extension.js: Secteur appliqué: ${result.secteur || window.sectorOptions.secteur}, Taille: ${result.taille || window.sectorOptions.taille}`);
            
            // CORRECTION: Préserver la structure originale de la cellule
            const parentNode = cell.closest('td');
            if (!parentNode) return;
            
            // Mettre à jour directement le contenu de la cellule
            cell.innerHTML = formattedValue;
            
            // Supprimer les anciennes infos sectorielles si présentes
            parentNode.querySelectorAll('.sector-info-badge').forEach(el => el.remove());
            
            // Ajouter une indication du secteur appliqué
            const sectorInfo = document.createElement('div');
            sectorInfo.className = 'text-xs text-blue-400 mt-1 sector-info-badge';
            sectorInfo.innerHTML = `<i class="fas fa-industry mr-1"></i>Secteur: ${result.secteur || window.sectorOptions.secteur}, Taille: ${result.taille || window.sectorOptions.taille}`;
            parentNode.appendChild(sectorInfo);
            
            // Ajouter une indication sur les taux appliqués si disponible
            if (result.infoCharges) {
                const rateInfo = document.createElement('div');
                rateInfo.className = 'text-xs text-green-400 mt-1 sector-info-badge';
                if (result.infoCharges.tauxPatronal && result.infoCharges.tauxSalarial) {
                    rateInfo.innerHTML = `<i class="fas fa-percentage mr-1"></i>Taux: ${(result.infoCharges.tauxPatronal*100).toFixed(1)}% patronal, ${(result.infoCharges.tauxSalarial*100).toFixed(1)}% salarial`;
                } else if (result.infoCharges.tauxGlobal) {
                    rateInfo.innerHTML = `<i class="fas fa-percentage mr-1"></i>Taux global: ${(result.infoCharges.tauxGlobal*100).toFixed(1)}%`;
                }
                parentNode.appendChild(rateInfo);
            }
        });
    } else {
        console.error("fiscal-guide-extension.js: Résultat invalide pour updateCellWithResult", result);
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
                secteur: secteurOptions.secteur,  // Toujours forcer secteur
                taille: secteurOptions.taille     // Toujours forcer taille
            };
            
            console.log("fiscal-guide-extension.js: optimiserRatioRemuneration avec secteur:", paramsComplets.secteur, paramsComplets.taille);
            
            // Appeler la fonction originale avec les paramètres complétés
            return originalOptimiser.call(window.FiscalUtils, paramsComplets, simulationFunc);
        };
        
        console.log("fiscal-guide-extension.js: optimiserRatioRemuneration patché");
    }
    
    // NOUVEAU: Patcher calculChargesSalariales pour des logs plus détaillés
    if (window.FiscalUtils && !window.FiscalUtils._calculChargesSalarialesPatched) {
        window.FiscalUtils._calculChargesSalarialesPatched = true;
        
        const originalCalculCharges = window.FiscalUtils.calculChargesSalariales;
        window.FiscalUtils.calculChargesSalariales = function(remuneration, params = {}) {
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
            
            console.log(`fiscal-guide-extension.js: calculChargesSalariales - SECTEUR=${paramsComplets.secteur}, TAILLE=${paramsComplets.taille}, REM=${remuneration}`);
            
            // Appeler la fonction originale avec les paramètres complétés
            const result = originalCalculCharges.call(window.FiscalUtils, remuneration, paramsComplets);
            
            // Log détaillé du résultat
            console.log(`fiscal-guide-extension.js: calculChargesSalariales - Résultat: patronales=${result.patronales}, salariales=${result.salariales}, description=${result.description}`);
            
            return result;
        };
        
        console.log("fiscal-guide-extension.js: calculChargesSalariales patché");
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
                        // Récupérer les valeurs actuelles
                        const ca = parseFloat(document.getElementById('sim-ca').value) || 50000;
                        const tauxMarge = parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3;
                        const tauxRemuneration = parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7;
                        const tmiActuel = parseFloat(document.getElementById('sim-tmi').value) || 30;
                        
                        // Lancer une simulation fraîche avec les paramètres sectoriels actuels
                        const result = window.SimulationsFiscales[`simuler${statutId.charAt(0).toUpperCase() + statutId.slice(1)}`]({
                            ca: ca,
                            tauxMarge: tauxMarge,
                            tauxRemuneration: tauxRemuneration,
                            tmiActuel: tmiActuel,
                            secteur: window.sectorOptions?.secteur || "Tous",
                            taille: window.sectorOptions?.taille || "<50",
                            modeExpert: true
                        });
                        
                        if (result) {
                            // NOUVEAU: Enregistrer le résultat pour référence ultérieure
                            window.simulationResults[statutId] = result;
                            
                            // Créer un nouveau tableau de résultats avec cette simulation
                            const newResults = [{
                                statutId: statutId,
                                statut: result.typeEntreprise || statutId.toUpperCase(), 
                                sim: result
                            }];
                            
                            console.log(`fiscal-guide-extension.js: Détail avec secteur=${result.secteur}, taille=${result.taille}`);
                            
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