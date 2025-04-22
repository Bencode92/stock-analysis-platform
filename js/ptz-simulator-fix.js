/**
 * Correctif pour le simulateur PTZ
 * Ce script résout les problèmes de fonctionnement du simulateur PTZ 
 * en s'assurant que toutes les fonctions nécessaires sont disponibles.
 */

(function() {
    console.log("PTZ Simulator Fix v1.0 chargé !");
    
    // Vérifier si le simulateur est déjà correctement initialisé
    function checkSimulatorAvailability() {
        if (typeof window.simulerPTZ === 'function' && 
            typeof window.PTZSimulator === 'function' && 
            typeof window.initPTZSimulator === 'function' &&
            typeof window.searchCity === 'function') {
            console.log("Le simulateur PTZ semble correctement initialisé");
            return true;
        }
        
        console.warn("Le simulateur PTZ n'est pas correctement initialisé, application du correctif...");
        return false;
    }
    
    // Créer l'index des villes si nécessaire
    function ensureCityIndexAvailable() {
        // Si la variable cityIndex n'existe pas, la créer
        if (typeof window.cityIndex === 'undefined') {
            console.log("Création de l'index des villes...");
            window.cityIndex = {};
            window.hasInitializedCityIndex = false;
        }
        
        // Si la fonction d'initialisation n'existe pas, la créer
        if (typeof window.initializeCityIndex !== 'function') {
            window.initializeCityIndex = function() {
                if (window.hasInitializedCityIndex) return;
                
                // Base de données des villes directement intégrée
                const citiesDB = {
                    "A bis": ["Paris", "Neuilly-sur-Seine", "Levallois-Perret", "Boulogne-Billancourt", "Saint-Mandé", "Vincennes", "Versailles"],
                    "A": ["Lyon", "Nice", "Marseille", "Cannes", "Antibes", "Aix-en-Provence", "Bordeaux", "Toulouse", "Lille", "Rennes", "Nantes"],
                    "B1": ["Dijon", "Metz", "Nancy", "Angers", "Le Mans", "Tours", "Orléans", "Caen", "Rouen", "Amiens", "Reims"],
                    "B2": ["Besançon", "Le Havre", "Poitiers", "Limoges", "Mulhouse", "Bourges", "Charleville-Mézières", "Belfort"],
                    "C": ["Saint-Nazaire", "Tarbes", "Cahors", "Albi", "Auch", "Périgueux", "Bergerac", "Guéret", "Aurillac"]
                };
                
                Object.entries(citiesDB).forEach(([zone, cities]) => {
                    cities.forEach(city => {
                        // Normaliser pour la recherche (sans accents, minuscules)
                        const normalizedCity = city
                            .normalize("NFD")
                            .replace(/[\\u0300-\\u036f]/g, "")
                            .toLowerCase();
                            
                        window.cityIndex[normalizedCity] = {
                            city: city,
                            zone: zone
                        };
                    });
                });
                
                window.hasInitializedCityIndex = true;
                console.log("Index de villes initialisé avec", Object.keys(window.cityIndex).length, "villes");
            };
        }
        
        // Si la fonction de recherche n'existe pas, la créer
        if (typeof window.searchCity !== 'function') {
            window.searchCity = function(query) {
                // S'assurer que l'index est initialisé
                if (!window.hasInitializedCityIndex) {
                    window.initializeCityIndex();
                }
                
                // Normaliser la requête
                const normalizedQuery = query
                    .normalize("NFD")
                    .replace(/[\\u0300-\\u036f]/g, "")
                    .toLowerCase()
                    .trim();
                
                // Recherche active dès la première lettre
                if (normalizedQuery.length < 1) return [];
                
                const results = [];
                
                // Rechercher dans l'index
                Object.entries(window.cityIndex).forEach(([key, data]) => {
                    if (key.startsWith(normalizedQuery)) {
                        results.push({
                            city: data.city,
                            zone: data.zone,
                            exactMatch: key === normalizedQuery,
                            startsWithMatch: true,
                            includesMatch: false
                        });
                    } else if (key.includes(normalizedQuery)) {
                        results.push({
                            city: data.city,
                            zone: data.zone,
                            exactMatch: false,
                            startsWithMatch: false,
                            includesMatch: true
                        });
                    }
                });
                
                // Trier les résultats
                results.sort((a, b) => {
                    if (a.startsWithMatch && !b.startsWithMatch) return -1;
                    if (!a.startsWithMatch && b.startsWithMatch) return 1;
                    if (a.exactMatch && !b.exactMatch) return -1;
                    if (!a.exactMatch && b.exactMatch) return 1;
                    return a.city.localeCompare ? a.city.localeCompare(b.city) : 0;
                });
                
                return results.slice(0, 10); // Limiter à 10 résultats
            };
        }
        
        // Initialiser l'index si ce n'est pas déjà fait
        if (!window.hasInitializedCityIndex) {
            window.initializeCityIndex();
        }
    }
    
    // Recréer la fonction de simulation si nécessaire
    function ensureSimulationFunctionsAvailable() {
        // Si la classe PTZSimulator n'existe pas, la créer
        if (typeof window.PTZSimulator !== 'function') {
            // Version simplifiée de la classe pour dépannage
            window.PTZSimulator = class PTZSimulator {
                constructor(params) {
                    this.projectType = params.projectType || 'neuf';
                    this.zone = params.zone || 'A';
                    this.income = params.income || 0;
                    this.householdSize = params.householdSize || 1;
                    this.totalCost = params.totalCost || 0;
                    this.cityName = params.cityName || null;
                    
                    // Plafonds et paramètres simplifiés
                    this.incomeLimits = {
                        'A': [49000, 73500, 88200, 102900, 117600, 132300, 147000, 161700],
                        'B1': [34500, 51750, 62100, 72450, 82800, 93150, 103500, 113850],
                        'B2': [31500, 47250, 56700, 66150, 75600, 85050, 94500, 103950],
                        'C': [28500, 42750, 51300, 59850, 68400, 76950, 85500, 94050]
                    };
                    
                    this.maxCosts = {
                        'A': [120000, 168000, 210000, 252000, 294000],
                        'B1': [110000, 154000, 187000, 231000, 275000],
                        'B2': [110000, 165000, 198000, 231000, 264000],
                        'C': [100000, 150000, 180000, 210000, 240000]
                    };
                    
                    this.financingRates = {
                        'tranche1': 0.5,
                        'tranche2': 0.4,
                        'tranche3': 0.4,
                        'tranche4': 0.2
                    };
                }
                
                checkEligibility() {
                    // Vérification simplifiée
                    if (this.projectType === 'ancien' && (this.zone === 'A' || this.zone === 'B1')) {
                        return {
                            eligible: false,
                            reason: "Pour un logement ancien avec travaux, seules les zones B2 et C sont éligibles."
                        };
                    }
                    
                    const index = Math.min(this.householdSize - 1, 7);
                    if (this.income > this.incomeLimits[this.zone][index]) {
                        return {
                            eligible: false,
                            reason: `Vos revenus dépassent le plafond de ${this.incomeLimits[this.zone][index].toLocaleString('fr-FR')} € pour votre situation.`
                        };
                    }
                    
                    return { eligible: true };
                }
                
                calculatePTZAmount() {
                    const eligibility = this.checkEligibility();
                    if (!eligibility.eligible) {
                        return {
                            eligible: false,
                            reason: eligibility.reason,
                            amount: 0
                        };
                    }
                    
                    // Calcul simplifié
                    const costIndex = Math.min(this.householdSize - 1, 4);
                    const maxCost = this.maxCosts[this.zone][costIndex];
                    const consideredCost = Math.min(this.totalCost, maxCost);
                    
                    // Déterminer la tranche (simplifié)
                    const incomeBracket = 'tranche2';
                    const adjustedIncome = this.income / 1.5;
                    
                    // Taux de financement selon la tranche
                    const percentageFinancing = this.financingRates[incomeBracket];
                    
                    // Montant du PTZ
                    const ptzAmount = consideredCost * percentageFinancing;
                    
                    return {
                        eligible: true,
                        amount: ptzAmount,
                        consideredCost: consideredCost,
                        maxCost: maxCost,
                        percentageFinancing: percentageFinancing * 100,
                        adjustedIncome: adjustedIncome,
                        incomeBracket: incomeBracket,
                        coefficient: 1.5,
                        repaymentPeriods: {
                            totalDuration: 22,
                            deferralPeriod: 10
                        },
                        projectType: this.projectType
                    };
                }
            };
        }
        
        // Si la fonction de mise à jour des résultats n'existe pas, la créer
        if (typeof window.updatePTZResults !== 'function') {
            window.updatePTZResults = function(result) {
                console.log("Mise à jour des résultats PTZ:", result);
                
                // Trouver le conteneur de résultats
                let resultsContainer = document.querySelector('#ptz-results-container');
                
                if (!resultsContainer) {
                    console.warn("Conteneur de résultats non trouvé, recherche d'alternatives...");
                    resultsContainer = document.querySelector('[class*="simulation-content"][style*="display: block"] > .grid > div:nth-child(2)');
                    
                    if (!resultsContainer) {
                        console.error("Impossible de trouver un conteneur de résultats!");
                        alert("Erreur: Impossible d'afficher les résultats. Veuillez rafraîchir la page.");
                        return;
                    }
                }
                
                // Afficher les résultats
                if (!result.eligible) {
                    resultsContainer.innerHTML = `
                        <div class="bg-red-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-red-500">
                            <h5 class="text-xl font-semibold text-red-400 mb-2">Non éligible au PTZ</h5>
                            <p>${result.reason}</p>
                        </div>
                    `;
                    return;
                }
                
                // Template simplifié pour les résultats
                resultsContainer.innerHTML = `
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <div class="result-card">
                            <p class="result-value">${result.amount.toLocaleString('fr-FR')} €</p>
                            <p class="result-label">Montant du PTZ</p>
                        </div>
                        <div class="result-card">
                            <p class="result-value">${result.percentageFinancing} %</p>
                            <p class="result-label">Pourcentage de financement</p>
                        </div>
                        <div class="result-card">
                            <p class="result-value">${result.repaymentPeriods.totalDuration} ans</p>
                            <p class="result-label">Durée totale</p>
                        </div>
                        <div class="result-card">
                            <p class="result-value">${result.repaymentPeriods.deferralPeriod} ans</p>
                            <p class="result-label">Période de différé</p>
                        </div>
                    </div>
                    
                    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-blue-500 mb-6">
                        <h5 class="text-lg font-semibold text-blue-400 mb-2">Détails du calcul</h5>
                        <ul class="space-y-2">
                            <li><span class="text-gray-400">Coût total de l'opération:</span> ${result.consideredCost.toLocaleString('fr-FR')} € (sur un maximum de ${result.maxCost.toLocaleString('fr-FR')} €)</li>
                            <li><span class="text-gray-400">Tranche de revenus:</span> ${result.incomeBracket.replace('tranche', 'Tranche ')}</li>
                            <li><span class="text-gray-400">Revenu ajusté:</span> ${Math.round(result.adjustedIncome).toLocaleString('fr-FR')} € (coefficient: ${result.coefficient})</li>
                        </ul>
                    </div>
                    
                    <div class="bg-green-800 bg-opacity-30 p-4 rounded-lg border-l-4 border-green-500">
                        <h5 class="text-lg font-semibold text-green-400 mb-2">Informations de remboursement</h5>
                        <p class="mb-2">
                            Vous commencerez à rembourser le PTZ après une période de ${result.repaymentPeriods.deferralPeriod} ans, 
                            sur une durée de ${result.repaymentPeriods.totalDuration - result.repaymentPeriods.deferralPeriod} ans.
                        </p>
                    </div>
                `;
                
                // Afficher le bouton d'intégration
                const integratePTZButton = document.getElementById('integrate-ptz-to-loan');
                if (integratePTZButton) {
                    integratePTZButton.classList.remove('hidden');
                    integratePTZButton.setAttribute('data-ptz-amount', result.amount);
                    integratePTZButton.setAttribute('data-ptz-duration', result.repaymentPeriods.totalDuration);
                    integratePTZButton.setAttribute('data-ptz-deferral', result.repaymentPeriods.deferralPeriod);
                }
            };
        }
        
        // Si la fonction simulerPTZ n'existe pas, la créer
        if (typeof window.simulerPTZ !== 'function') {
            window.simulerPTZ = function() {
                console.log("Simulation PTZ en cours (fonction de secours)");
                
                try {
                    // Récupérer les valeurs du formulaire
                    const projectTypeElem = document.getElementById('ptz-project-type');
                    const zoneElem = document.getElementById('ptz-zone');
                    const incomeElem = document.getElementById('ptz-income');
                    const householdSizeElem = document.getElementById('ptz-household-size');
                    const totalCostElem = document.getElementById('ptz-total-cost');
                    const citySearchElem = document.getElementById('ptz-city-search');
                    
                    const projectType = projectTypeElem ? projectTypeElem.value : 'neuf';
                    const zone = zoneElem ? zoneElem.value : 'A';
                    const income = incomeElem ? parseFloat(incomeElem.value || '0') : 0;
                    const householdSize = householdSizeElem ? parseInt(householdSizeElem.value || '1') : 1;
                    const totalCost = totalCostElem ? parseFloat(totalCostElem.value || '0') : 0;
                    const cityName = citySearchElem ? citySearchElem.value : null;
                    
                    console.log("Valeurs récupérées:", {projectType, zone, income, householdSize, totalCost, cityName});
                    
                    // Valider les entrées
                    if (isNaN(income) || income <= 0) {
                        alert('Le revenu fiscal de référence doit être supérieur à 0.');
                        if (incomeElem) incomeElem.focus();
                        return false;
                    }
                    
                    if (isNaN(totalCost) || totalCost <= 0) {
                        alert('Le coût total de l\'opération doit être supérieur à 0.');
                        if (totalCostElem) totalCostElem.focus();
                        return false;
                    }
                    
                    // Créer l'instance du simulateur et calculer
                    const simulator = new window.PTZSimulator({
                        projectType, zone, income, householdSize, totalCost, cityName
                    });
                    
                    const result = simulator.calculatePTZAmount();
                    console.log("Résultat du calcul:", result);
                    
                    // Afficher les résultats
                    window.updatePTZResults(result);
                    
                    return true;
                } catch (error) {
                    console.error("Erreur lors de la simulation:", error);
                    alert("Une erreur s'est produite lors de la simulation. Détails: " + error.message);
                    return false;
                }
            };
        }
        
        // Si la fonction d'initialisation n'existe pas, la créer
        if (typeof window.initPTZSimulator !== 'function') {
            window.initPTZSimulator = function() {
                console.log("Initialisation du simulateur PTZ (fonction de secours)");
                
                // S'assurer que l'index des villes est disponible
                ensureCityIndexAvailable();
                
                // Configurer le bouton de simulation
                const ptzButton = document.getElementById('calculate-ptz-button');
                if (ptzButton) {
                    console.log("Configuration du bouton de simulation PTZ");
                    
                    // Créer un nouveau bouton pour éviter les problèmes de gestionnaires multiples
                    const newButton = ptzButton.cloneNode(true);
                    ptzButton.parentNode.replaceChild(newButton, ptzButton);
                    
                    // Ajouter le gestionnaire d'événements
                    newButton.addEventListener('click', function(e) {
                        e.preventDefault();
                        console.log("Clic sur bouton PTZ détecté");
                        window.simulerPTZ();
                        return false;
                    });
                } else {
                    console.warn("Bouton de simulation PTZ non trouvé");
                }
            };
        }
    }
    
    // Fonction principale pour corriger le simulateur
    function fixPTZSimulator() {
        // Vérifier si le simulateur fonctionne déjà correctement
        if (checkSimulatorAvailability()) {
            console.log("Le simulateur PTZ fonctionne correctement, aucune correction nécessaire");
            return;
        }
        
        // S'assurer que l'index des villes est disponible
        ensureCityIndexAvailable();
        
        // S'assurer que les fonctions de simulation sont disponibles
        ensureSimulationFunctionsAvailable();
        
        // Initialiser le simulateur
        if (typeof window.initPTZSimulator === 'function') {
            window.initPTZSimulator();
        }
        
        console.log("Correctif du simulateur PTZ appliqué avec succès");
    }
    
    // Appliquer le correctif immédiatement
    fixPTZSimulator();
    
    // Et aussi après le chargement complet de la page
    window.addEventListener('load', function() {
        setTimeout(fixPTZSimulator, 500);
    });
    
    // Réappliquer lors du clic sur l'onglet PTZ
    window.addEventListener('DOMContentLoaded', function() {
        const ptzTab = document.querySelector('.simulation-tab[data-target="ptz-simulator"]');
        if (ptzTab) {
            ptzTab.addEventListener('click', function() {
                setTimeout(fixPTZSimulator, 300);
            });
        }
    });
    
    // Exposer la fonction de correctif globalement
    window.fixPTZSimulator = fixPTZSimulator;
})();
