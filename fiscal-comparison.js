/**
 * fiscal-comparison.js - Module de comparaison des régimes fiscaux
 */

const FiscalComparison = (function() {
    // Liste des régimes fiscaux disponibles
    const availableRegimes = [
        { id: 'micro-foncier', label: 'Micro-foncier', color: '#00FF87' },
        { id: 'reel-foncier', label: 'Réel foncier', color: '#60A5FA' },
        { id: 'lmnp-micro', label: 'LMNP micro-BIC', color: '#F59E0B' },
        { id: 'lmnp-reel', label: 'LMNP réel', color: '#8B5CF6' },
        { id: 'sci-is', label: 'SCI à l\'IS', color: '#EC4899' },
        { id: 'sas-is', label: 'SAS', color: '#6366F1' },
        { id: 'sarl-is', label: 'SARL', color: '#F97316' }
    ];
    
    /**
     * Compare tous les régimes fiscaux pour les deux modes d'investissement
     * @param {SimulateurImmo} simulateur - Instance du simulateur
     * @returns {Object} Résultats comparatifs
     */
    function compareAllRegimes(simulateur) {
        if (!simulateur || !simulateur.params.resultats.classique || !simulateur.params.resultats.encheres) {
            console.error('Résultats de simulation non disponibles');
            return null;
        }
        
        // Sauvegarder le régime fiscal actuel
        const currentRegime = simulateur.params.fiscalite.regimeFiscal;
        
        // Conteneur des résultats
        const results = {
            classique: {},
            encheres: {},
            optimal: {
                classique: null,
                encheres: null
            }
        };
        
        // Pour chaque régime, calculer les impacts fiscaux
        availableRegimes.forEach(regime => {
            // Appliquer temporairement ce régime
            simulateur.params.fiscalite.regimeFiscal = regime.id;
            
            // Recalculer les résultats pour l'achat classique
            const surfaceClassique = simulateur.params.resultats.classique.surface;
            const resultatsClassique = simulateur.calculeTout(surfaceClassique, 'classique');
            
            // Recalculer les résultats pour la vente aux enchères
            const surfaceEncheres = simulateur.params.resultats.encheres.surface;
            const resultatsEncheres = simulateur.calculeTout(surfaceEncheres, 'encheres');
            
            // Stocker les résultats essentiels pour chaque régime
            results.classique[regime.id] = {
                label: regime.label,
                color: regime.color,
                rendementNet: resultatsClassique.rendementNet,
                cashFlow: resultatsClassique.cashFlow,
                cashFlowAnnuel: resultatsClassique.cashFlow * 12,
                impactFiscal: resultatsClassique.impactFiscal,
                cashFlowApresImpot: resultatsClassique.cashFlow + (resultatsClassique.impactFiscal / 12)
            };
            
            results.encheres[regime.id] = {
                label: regime.label,
                color: regime.color,
                rendementNet: resultatsEncheres.rendementNet,
                cashFlow: resultatsEncheres.cashFlow,
                cashFlowAnnuel: resultatsEncheres.cashFlow * 12,
                impactFiscal: resultatsEncheres.impactFiscal,
                cashFlowApresImpot: resultatsEncheres.cashFlow + (resultatsEncheres.impactFiscal / 12)
            };
        });
        
        // Déterminer le régime optimal pour chaque mode
        results.optimal.classique = findOptimalRegime(results.classique);
        results.optimal.encheres = findOptimalRegime(results.encheres);
        
        // Restaurer le régime fiscal d'origine
        simulateur.params.fiscalite.regimeFiscal = currentRegime;
        
        return results;
    }
    
    /**
     * Trouve le régime fiscal optimal
     * @param {Object} regimesResults - Résultats pour un mode d'investissement
     * @returns {String} ID du régime optimal
     */
    function findOptimalRegime(regimesResults) {
        let bestRegime = null;
        let bestCashFlow = -Infinity;
        
        // Parcourir tous les régimes pour trouver celui avec le meilleur cash-flow après impôt
        Object.keys(regimesResults).forEach(regimeId => {
            const cashFlowApresImpot = regimesResults[regimeId].cashFlowApresImpot;
            if (cashFlowApresImpot > bestCashFlow) {
                bestCashFlow = cashFlowApresImpot;
                bestRegime = regimeId;
            }
        });
        
        return bestRegime;
    }
    
    /**
     * Génère et affiche le tableau comparatif
     * @param {Object} comparisonResults - Résultats de la comparaison
     * @param {HTMLElement} container - Conteneur pour le tableau
     */
    function renderComparisonTable(comparisonResults, container) {
        if (!comparisonResults || !container) return;
        
        // Créer l'élément de tableau
        const tableCard = document.createElement('div');
        tableCard.className = 'card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg transition-all mt-6';
        tableCard.innerHTML = `
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-balance-scale"></i>
                </div>
                <h2 class="card-title">Impact des régimes fiscaux sur votre investissement</h2>
            </div>
            <div class="p-4">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Comparatif des régimes fiscaux</h3>
                    <div class="flex items-center">
                        <span class="text-sm mr-2">Critère d'optimisation:</span>
                        <span class="badge badge-primary">Cash-flow après impôt</span>
                    </div>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="comparison-table w-full">
                        <thead>
                            <tr>
                                <th>Régime fiscal</th>
                                <th class="text-center">Rendement net</th>
                                <th class="text-center">Cash-flow mensuel</th>
                                <th class="text-center">Impact fiscal annuel</th>
                                <th class="text-center">Cash-flow après impôt</th>
                                <th class="text-center">Rentabilité classique</th>
                                <th class="text-center">Rentabilité enchères</th>
                            </tr>
                        </thead>
                        <tbody id="regime-comparison-body">
                            <!-- Les lignes seront générées dynamiquement -->
                        </tbody>
                    </table>
                </div>
                
                <div class="mt-6 flex flex-wrap gap-4">
                    <div class="flex-1 min-w-[300px] p-4 bg-blue-900/30 rounded-lg border border-blue-400/20">
                        <h4 class="text-lg font-medium flex items-center">
                            <i class="fas fa-home mr-2 text-green-400"></i>
                            Achat Classique - Régime recommandé
                        </h4>
                        <div id="optimal-classique" class="mt-3 p-3 rounded-lg flex items-center" style="background-color: rgba(0, 255, 135, 0.1); border: 1px solid rgba(0, 255, 135, 0.3);">
                            <!-- Contenu généré dynamiquement -->
                        </div>
                    </div>
                    
                    <div class="flex-1 min-w-[300px] p-4 bg-blue-900/30 rounded-lg border border-blue-400/20">
                        <h4 class="text-lg font-medium flex items-center">
                            <i class="fas fa-gavel mr-2 text-yellow-400"></i>
                            Vente aux Enchères - Régime recommandé
                        </h4>
                        <div id="optimal-encheres" class="mt-3 p-3 rounded-lg flex items-center" style="background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3);">
                            <!-- Contenu généré dynamiquement -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter le tableau au conteneur
        container.appendChild(tableCard);
        
        // Remplir le corps du tableau
        const tableBody = document.getElementById('regime-comparison-body');
        if (tableBody) {
            // Vider le tableau
            tableBody.innerHTML = '';
            
            // Ajouter une ligne pour chaque régime
            availableRegimes.forEach(regime => {
                const classiqueData = comparisonResults.classique[regime.id];
                const encheresData = comparisonResults.encheres[regime.id];
                
                // Déterminer si c'est le régime optimal
                const isOptimalClassique = regime.id === comparisonResults.optimal.classique;
                const isOptimalEncheres = regime.id === comparisonResults.optimal.encheres;
                
                // Classe CSS pour la ligne optimale
                const rowClass = isOptimalClassique || isOptimalEncheres ? 'bg-green-900/20 border-l-2 border-green-400' : '';
                
                // Créer la ligne
                const row = document.createElement('tr');
                row.className = rowClass;
                
                // Formatage des valeurs pour l'affichage
                const formatCurrency = value => new Intl.NumberFormat('fr-FR', {
                    style: 'currency', 
                    currency: 'EUR',
                    maximumFractionDigits: 0
                }).format(value);
                
                const formatPercent = value => value.toFixed(2) + ' %';
                
                // Formatage des cellules avec indicateur visuel
                const cellClasses = (value, thresholds) => {
                    if (value > thresholds.good) return 'text-green-400';
                    if (value > thresholds.medium) return 'text-yellow-400';
                    return 'text-red-400';
                };
                
                // Remplir les cellules
                row.innerHTML = `
                    <td>
                        <div class="flex items-center">
                            <span class="w-3 h-3 rounded-full mr-2" style="background-color: ${regime.color}"></span>
                            <span>${regime.label}</span>
                            ${isOptimalClassique ? '<span class="ml-2 badge badge-primary text-xs">Optimal Classique</span>' : ''}
                            ${isOptimalEncheres ? '<span class="ml-2 badge badge-accent text-xs">Optimal Enchères</span>' : ''}
                        </div>
                    </td>
                    <td class="text-center ${cellClasses(classiqueData.rendementNet, {good: 7, medium: 4})}">
                        ${formatPercent(classiqueData.rendementNet)}
                    </td>
                    <td class="text-center ${classiqueData.cashFlow >= 0 ? 'text-green-400' : 'text-red-400'}">
                        ${formatCurrency(classiqueData.cashFlow)}/mois
                    </td>
                    <td class="text-center ${classiqueData.impactFiscal >= 0 ? 'text-green-400' : 'text-red-400'}">
                        ${formatCurrency(classiqueData.impactFiscal)}
                    </td>
                    <td class="text-center ${classiqueData.cashFlowApresImpot >= 0 ? 'text-green-400' : 'text-red-400'}">
                        ${formatCurrency(classiqueData.cashFlowApresImpot)}/mois
                    </td>
                    <td class="text-center">
                        <div class="w-full bg-gray-700 rounded-full h-2.5">
                            <div class="bg-green-400 h-2.5 rounded-full" style="width: ${Math.min(100, classiqueData.rendementNet * 10)}%"></div>
                        </div>
                    </td>
                    <td class="text-center">
                        <div class="w-full bg-gray-700 rounded-full h-2.5">
                            <div class="bg-yellow-400 h-2.5 rounded-full" style="width: ${Math.min(100, encheresData.rendementNet * 10)}%"></div>
                        </div>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });
        }
        
        // Afficher les régimes optimaux
        renderOptimalRegime(comparisonResults, 'classique');
        renderOptimalRegime(comparisonResults, 'encheres');
    }
    
    /**
     * Affiche le régime optimal dans la section dédiée
     * @param {Object} results - Résultats de comparaison
     * @param {String} mode - 'classique' ou 'encheres'
     */
    function renderOptimalRegime(results, mode) {
        const container = document.getElementById(`optimal-${mode}`);
        if (!container) return;
        
        const optimalId = results.optimal[mode];
        if (!optimalId) return;
        
        const optimalRegime = results[mode][optimalId];
        const color = availableRegimes.find(r => r.id === optimalId)?.color || '#00FF87';
        
        container.innerHTML = `
            <div class="w-10 h-10 rounded-full flex items-center justify-center mr-4" 
                 style="background-color: rgba(${hexToRgb(color)}, 0.2); border: 2px solid ${color}">
                <i class="fas ${getRegimeIcon(optimalId)}" style="color: ${color}"></i>
            </div>
            <div>
                <h5 class="font-bold text-lg">${optimalRegime.label}</h5>
                <p class="text-sm opacity-80">Cash-flow après impôt: 
                    <span class="${optimalRegime.cashFlowApresImpot >= 0 ? 'text-green-400' : 'text-red-400'} font-medium">
                        ${new Intl.NumberFormat('fr-FR', {
                            style: 'currency', 
                            currency: 'EUR',
                            maximumFractionDigits: 0
                        }).format(optimalRegime.cashFlowApresImpot)}/mois
                    </span>
                </p>
            </div>
        `;
    }
    
    /**
     * Retourne l'icône FontAwesome correspondant au régime
     * @param {String} regimeId - ID du régime
     * @returns {String} - Classe CSS de l'icône
     */
    function getRegimeIcon(regimeId) {
        switch(regimeId) {
            case 'micro-foncier': return 'fa-home';
            case 'reel-foncier': return 'fa-file-invoice-dollar';
            case 'lmnp-micro': return 'fa-couch';
            case 'lmnp-reel': return 'fa-calculator';
            case 'sci-is': return 'fa-building';
            case 'sas-is': return 'fa-landmark';
            case 'sarl-is': return 'fa-briefcase';
            default: return 'fa-file-alt';
        }
    }
    
    /**
     * Convertit une couleur hexadécimale en RGB
     * @param {String} hex - Couleur au format #RRGGBB
     * @returns {String} Format R,G,B
     */
    function hexToRgb(hex) {
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? 
            `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}` : 
            '0,0,0';
    }
    
    /**
     * Ajoute un bouton pour afficher la comparaison fiscale
     * @param {HTMLElement} container - Conteneur pour le bouton
     */
    function addComparisonButton(container) {
        if (!container) return;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex justify-center mt-6';
        buttonContainer.innerHTML = `
            <button id="btn-compare-regimes" class="btn btn-primary">
                <i class="fas fa-balance-scale mr-2"></i>
                Comparer tous les régimes fiscaux
            </button>
        `;
        
        container.appendChild(buttonContainer);
        
        // Ajouter l'écouteur d'événement au bouton
        const compareButton = document.getElementById('btn-compare-regimes');
        if (compareButton) {
            compareButton.addEventListener('click', function() {
                if (!window.simulateur) {
                    console.error('Simulateur non disponible');
                    return;
                }
                
                // Afficher un indicateur de chargement
                const loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'flex items-center justify-center p-6';
                loadingIndicator.innerHTML = `
                    <div class="text-2xl text-blue-400 mr-3"><i class="fas fa-spinner fa-spin"></i></div>
                    <div>Calcul des régimes fiscaux en cours...</div>
                `;
                
                // Déterminer le conteneur cible
                const targetContainer = document.getElementById('fiscal-comparison-container') || 
                                      document.createElement('div');
                targetContainer.id = 'fiscal-comparison-container';
                targetContainer.innerHTML = '';
                targetContainer.appendChild(loadingIndicator);
                
                // Ajouter le conteneur au DOM s'il n'y est pas déjà
                if (!document.getElementById('fiscal-comparison-container')) {
                    const resultsContainer = document.getElementById('results-container');
                    if (resultsContainer) {
                        resultsContainer.appendChild(targetContainer);
                    }
                }
                
                // Effectuer les calculs après un court délai pour permettre l'affichage du loading
                setTimeout(() => {
                    // Calculer tous les régimes
                    const comparisonResults = compareAllRegimes(window.simulateur);
                    
                    // Nettoyer le conteneur
                    targetContainer.innerHTML = '';
                    
                    // Afficher le tableau comparatif
                    renderComparisonTable(comparisonResults, targetContainer);
                    
                    // Faire défiler vers le tableau
                    targetContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
            });
        }
    }
    
    // API publique
    return {
        compareAllRegimes,
        renderComparisonTable,
        addComparisonButton,
        findOptimalRegime
    };
})();

// S'auto-initialiser quand le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
    // Attendre que le simulateur soit initialisé
    const checkSimulateur = setInterval(function() {
        if (window.simulateur && document.getElementById('results-container')) {
            clearInterval(checkSimulateur);
            
            // Ajouter le bouton de comparaison après les résultats
            FiscalComparison.addComparisonButton(document.getElementById('results-container'));
            
            console.log("Module de comparaison fiscale initialisé");
        }
    }, 100);
    
    // Délai maximum de 5 secondes
    setTimeout(function() {
        clearInterval(checkSimulateur);
    }, 5000);
});